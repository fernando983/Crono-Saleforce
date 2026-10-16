import React, { useState, useRef, useMemo } from 'react';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Project, Task, ConsultantProposal, Phase, Holiday } from '../types';
import {
  diffDays,
  parseDate,
  toISODate,
  formatDateShort,
  formatDateReadable,
  countWorkingDays,
} from '../utils/dateUtils';
import {
  TaskComparisonResult,
  ScheduleComparisonStats,
  exportComparisonToExcel,
} from '../utils/consultantPresets';
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Check,
  AlertTriangle,
  Flag,
  Calendar,
  Layers,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Printer,
  Scale,
  CheckCheck,
} from 'lucide-react';

export type ComparisonExportFormat = 'pdf' | 'png' | 'jpeg' | 'xlsx';

export interface ComparisonGanttExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project;
  consultantProposal: ConsultantProposal;
  comparisons: TaskComparisonResult[];
  stats: ScheduleComparisonStats;
  phases: Phase[];
  holidays?: Holiday[];
  onShowNotification?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const ComparisonGanttExportModal: React.FC<ComparisonGanttExportModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  consultantProposal,
  comparisons,
  stats,
  phases,
  holidays = [],
  onShowNotification,
}) => {
  const [format, setFormat] = useState<ComparisonExportFormat>('pdf');
  const [paperSize, setPaperSize] = useState<'a4' | 'a3' | 'letter'>('a4');
  const [resolutionScale, setResolutionScale] = useState<number>(2);
  const [fitToPage, setFitToPage] = useState<boolean>(true);
  const [includeHeader, setIncludeHeader] = useState<boolean>(true);
  const [includeKpis, setIncludeKpis] = useState<boolean>(true);
  const [includeLegend, setIncludeLegend] = useState<boolean>(true);
  const [exportFilter, setExportFilter] = useState<'all' | 'diffs_only' | 'omitted_only' | 'milestones_only'>('all');
  const [previewScale, setPreviewScale] = useState<number>(0.55);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportStepText, setExportStepText] = useState<string>('');

  const exportContainerRef = useRef<HTMLDivElement>(null);

  const consultantProject = consultantProposal.project;

  // Filter tasks to be exported
  const exportItems = useMemo(() => {
    return comparisons.filter((item) => {
      if (exportFilter === 'diffs_only') return item.status !== 'aligned';
      if (exportFilter === 'omitted_only') return item.status === 'omitted_by_consultant';
      if (exportFilter === 'milestones_only') return item.isMilestone;
      return true;
    });
  }, [comparisons, exportFilter]);

  // Calculate timeline boundaries
  const { timelineStartStr, timelineEndStr, totalDays, timelineMonths } = useMemo(() => {
    let minD = currentProject.startDate || '2026-09-01';
    let maxD = currentProject.targetEndDate || '2026-11-20';

    currentProject.tasks.forEach((t) => {
      if (t.startDate && t.startDate < minD) minD = t.startDate;
      if (t.endDate && t.endDate > maxD) maxD = t.endDate;
    });

    consultantProject.tasks.forEach((t) => {
      if (t.startDate && t.startDate < minD) minD = t.startDate;
      if (t.endDate && t.endDate > maxD) maxD = t.endDate;
    });

    // Snap to Monday with buffer
    const sDate = parseDate(minD);
    sDate.setDate(sDate.getDate() - 3);
    const dayOfWeek = sDate.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    sDate.setDate(sDate.getDate() - diffToMonday);

    // Snap to Sunday with buffer
    const eDate = parseDate(maxD);
    eDate.setDate(eDate.getDate() + 6);
    const endDayOfWeek = eDate.getDay();
    const diffToSunday = (7 - endDayOfWeek) % 7;
    eDate.setDate(eDate.getDate() + diffToSunday);

    const sStr = toISODate(sDate);
    const eStr = toISODate(eDate);
    const tDays = Math.max(14, diffDays(sStr, eStr) + 1);

    const months: {
      key: string;
      label: string;
      dayCount: number;
      widthPercent: number;
    }[] = [];

    const curr = new Date(sDate);
    while (curr <= eDate) {
      const year = curr.getFullYear();
      const month = curr.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthName = curr.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

      const mStart = new Date(Math.max(curr.getTime(), new Date(year, month, 1).getTime()));
      const mEnd = new Date(Math.min(eDate.getTime(), new Date(year, month + 1, 0).getTime()));

      const mDays = Math.max(1, diffDays(toISODate(mStart), toISODate(mEnd)) + 1);
      const widthPct = (mDays / tDays) * 100;

      months.push({
        key: monthKey,
        label: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        dayCount: mDays,
        widthPercent: widthPct,
      });

      curr.setMonth(curr.getMonth() + 1);
      curr.setDate(1);
    }

    return {
      timelineStartStr: sStr,
      timelineEndStr: eStr,
      totalDays: tDays,
      timelineMonths: months,
    };
  }, [currentProject, consultantProject]);

  // Bar coordinate helper
  const getTimelineBarCoords = (startDateStr: string, endDateStr: string) => {
    if (!startDateStr || !endDateStr) return { left: '0%', width: '0%' };
    const startOffset = diffDays(timelineStartStr, startDateStr);
    const duration = Math.max(1, diffDays(startDateStr, endDateStr) + 1);

    const leftPct = Math.max(0, (startOffset / totalDays) * 100);
    const widthPct = Math.min(100 - leftPct, (duration / totalDays) * 100);

    return {
      left: `${leftPct}%`,
      width: `${Math.max(1.2, widthPct)}%`,
    };
  };

  // Dimensions
  const WBS_TABLE_WIDTH = 420;
  const TIMELINE_WIDTH = Math.max(1000, totalDays * 16);
  const TOTAL_CANVAS_WIDTH = WBS_TABLE_WIDTH + TIMELINE_WIDTH;

  const getExportFilename = (ext: string) => {
    const cleanProject = currentProject.title.toLowerCase().replace(/[^a-z0-9]+/gi, '_');
    const cleanConsultant = consultantProposal.consultantName.toLowerCase().replace(/[^a-z0-9]+/gi, '_');
    return `comparativa_${cleanProject}_vs_${cleanConsultant}_${toISODate(new Date())}.${ext}`;
  };

  // Handle Image Export (PNG / JPEG)
  const handleExportImage = async (imgFormat: 'png' | 'jpeg') => {
    if (!exportContainerRef.current) return;
    setIsExporting(true);
    setExportStepText(`Generando imagen ${imgFormat.toUpperCase()} en alta resolución...`);

    try {
      const node = exportContainerRef.current;
      const options = {
        backgroundColor: '#ffffff',
        pixelRatio: Math.max(1.5, resolutionScale),
        cacheBust: true,
        style: {
          transform: 'none',
          boxShadow: 'none',
        },
      };

      const dataUrl = imgFormat === 'png'
        ? await htmlToImage.toPng(node, options)
        : await htmlToImage.toJpeg(node, { ...options, quality: 0.95 });

      const link = document.createElement('a');
      link.download = getExportFilename(imgFormat);
      link.href = dataUrl;
      link.click();

      onShowNotification?.(`¡Imagen ${imgFormat.toUpperCase()} descargada con éxito!`, 'success');
    } catch (err) {
      console.error('Error al exportar imagen:', err);
      onShowNotification?.('Ocurrió un error al generar la imagen. Intenta con menor resolución.', 'error');
    } finally {
      setIsExporting(false);
      setExportStepText('');
    }
  };

  // Handle PDF Export
  const handleExportPDF = async () => {
    if (!exportContainerRef.current) return;
    setIsExporting(true);
    setExportStepText('Capturando gráfico del Gantt Comparativo para PDF...');

    try {
      const node = exportContainerRef.current;
      const dataUrl = await htmlToImage.toPng(node, {
        backgroundColor: '#ffffff',
        pixelRatio: Math.max(1.8, resolutionScale),
        cacheBust: true,
        style: {
          transform: 'none',
          boxShadow: 'none',
        },
      });

      setExportStepText('Generando archivo PDF apaisado de alta definición...');

      const orientation = 'landscape';
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: paperSize,
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const imgWidth = img.naturalWidth || img.width;
      const imgHeight = img.naturalHeight || img.height;
      const imgRatio = imgWidth / imgHeight;

      if (fitToPage) {
        let renderWidth = usableWidth;
        let renderHeight = usableWidth / imgRatio;

        if (renderHeight > usableHeight) {
          renderHeight = usableHeight;
          renderWidth = usableHeight * imgRatio;
        }

        const xPos = margin + (usableWidth - renderWidth) / 2;
        const yPos = margin + (usableHeight - renderHeight) / 2;

        pdf.addImage(dataUrl, 'PNG', xPos, yPos, renderWidth, renderHeight, undefined, 'FAST');
      } else {
        const renderWidth = usableWidth;
        const totalRenderHeight = usableWidth / imgRatio;

        let heightLeft = totalRenderHeight;
        let position = 0;

        while (heightLeft > 0) {
          pdf.addImage(dataUrl, 'PNG', margin, margin - position, renderWidth, totalRenderHeight, undefined, 'FAST');
          heightLeft -= usableHeight;
          position += usableHeight;
          if (heightLeft > 0) {
            pdf.addPage(paperSize, orientation);
          }
        }
      }

      pdf.setProperties({
        title: `Comparativa de Cronogramas - ${currentProject.title} vs ${consultantProposal.consultantName}`,
        subject: 'Gantt Dual Comparativo de Fechas y Brechas de Alcance',
        author: currentProject.manager || 'Project Manager',
        creator: 'Gestor de Proyecto & Carta Gantt',
      });

      pdf.save(getExportFilename('pdf'));
      onShowNotification?.('¡Documento PDF del Gantt Comparativo descargado exitosamente!', 'success');
    } catch (err) {
      console.error('Error al exportar PDF:', err);
      onShowNotification?.('Ocurrió un error al generar el PDF. Puedes intentar descargar como imagen PNG.', 'error');
    } finally {
      setIsExporting(false);
      setExportStepText('');
    }
  };

  // Handle Excel Export
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      setExportStepText('Capturando gráfico e incrustando en libro Excel...');

      let chartImg: string | undefined;
      if (exportContainerRef.current) {
        try {
          chartImg = await htmlToImage.toPng(exportContainerRef.current, {
            backgroundColor: '#ffffff',
            pixelRatio: 2,
            cacheBust: true,
            style: {
              transform: 'none',
              boxShadow: 'none',
            },
          });
        } catch (imgErr) {
          console.warn('No se pudo capturar vista previa para incrustar en Excel:', imgErr);
        }
      }

      setExportStepText('Generando hojas de cálculo y matriz comparativa...');
      const filename = await exportComparisonToExcel(currentProject, consultantProposal, chartImg);
      onShowNotification?.(`¡Libro Excel descargado con éxito: ${filename}!`, 'success');
    } catch (err) {
      console.error('Error al exportar a Excel:', err);
      onShowNotification?.('Error al generar archivo Excel.', 'error');
    } finally {
      setIsExporting(false);
      setExportStepText('');
    }
  };

  const handleDownload = () => {
    if (format === 'pdf') handleExportPDF();
    else if (format === 'png') handleExportImage('png');
    else if (format === 'jpeg') handleExportImage('jpeg');
    else if (format === 'xlsx') handleExportExcel();
  };

  if (!isOpen) return null;

  return (
    <div
      id="comparison-gantt-export-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 md:p-6 overflow-hidden animate-in fade-in duration-200"
    >
      <div className="bg-white w-full max-w-7xl h-[94vh] rounded-3xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden">
        {/* Modal Top Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-amber-500 flex items-center justify-center text-white shadow-md">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Exportar Gantt Comparativo
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Gantt Dual
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Exporta el diagrama visual exacto con la comparativa de cronogramas tal como se visualiza en pantalla.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content: Left Config Sidebar + Right Scaled Preview */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 bg-slate-50">
          {/* LEFT: Export Controls Sidebar */}
          <div className="w-full lg:w-96 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-5 overflow-y-auto space-y-5 shrink-0 shadow-xs">
            {/* Format Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Formato de Exportación
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat('pdf')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    format === 'pdf'
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <FileText className={`w-5 h-5 mb-1 ${format === 'pdf' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className="text-xs">Documento PDF</span>
                  <span className="text-[10px] text-slate-400 font-normal">Apaisado / A4 / A3</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('png')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    format === 'png'
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <ImageIcon className={`w-5 h-5 mb-1 ${format === 'png' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className="text-xs">Imagen PNG</span>
                  <span className="text-[10px] text-slate-400 font-normal">Alta resolución</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('jpeg')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    format === 'jpeg'
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <ImageIcon className={`w-5 h-5 mb-1 ${format === 'jpeg' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className="text-xs">Imagen JPEG</span>
                  <span className="text-[10px] text-slate-400 font-normal">Liviana para emails</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('xlsx')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    format === 'xlsx'
                      ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 font-bold ring-2 ring-emerald-500/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <FileSpreadsheet className={`w-5 h-5 mb-1 ${format === 'xlsx' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="text-xs">Libro Excel</span>
                  <span className="text-[10px] text-slate-400 font-normal">Matriz comparativa</span>
                </button>
              </div>
            </div>

            {/* Content Filters */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Alcance a Exportar
              </label>
              <select
                value={exportFilter}
                onChange={(e) => setExportFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
              >
                <option value="all">Todas las actividades ({comparisons.length})</option>
                <option value="diffs_only">
                  Solo tareas con diferencias ({comparisons.filter((c) => c.status !== 'aligned').length})
                </option>
                <option value="omitted_only">
                  Solo brecha de alcance / No en consultora ({stats.omittedCount})
                </option>
                <option value="milestones_only">
                  Solo hitos clave ({comparisons.filter((c) => c.isMilestone).length})
                </option>
              </select>
            </div>

            {/* PDF Specific Options */}
            {format === 'pdf' && (
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-800 block">Opciones de Documento PDF</span>
                
                <div className="grid grid-cols-3 gap-1.5">
                  {(['a4', 'a3', 'letter'] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setPaperSize(size)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                        paperSize === size
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-600 font-medium">Ajustar a 1 página apaisada</span>
                  <input
                    type="checkbox"
                    checked={fitToPage}
                    onChange={(e) => setFitToPage(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Image Resolution Options */}
            {(format === 'png' || format === 'jpeg') && (
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <span className="text-xs font-bold text-slate-800 block">Resolución de Imagen</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'Normal (1x)', val: 1 },
                    { label: 'Alta (2x)', val: 2 },
                    { label: 'Ultra (3x)', val: 3 },
                  ].map(({ label, val }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setResolutionScale(val)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        resolutionScale === val
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Elements toggles */}
            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] block">
                Elementos Visibles
              </span>
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={(e) => setIncludeHeader(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <span>Encabezado ejecutivo con nombres y fechas</span>
              </label>

              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeKpis}
                  onChange={(e) => setIncludeKpis(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <span>Resumen de KPIs ejecutivos (Brecha, Desviaciones)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLegend}
                  onChange={(e) => setIncludeLegend(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <span>Leyenda explicativa de colores y símbolos</span>
              </label>
            </div>

            {/* Action Download Button */}
            <div className="pt-3">
              <button
                type="button"
                id="btn-confirm-download-comparison-gantt"
                onClick={handleDownload}
                disabled={isExporting}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{exportStepText || 'Generando exportación...'}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>
                      {format === 'pdf'
                        ? 'Descargar PDF Apaisado'
                        : format === 'png'
                        ? 'Descargar Imagen PNG (2x)'
                        : format === 'jpeg'
                        ? 'Descargar Imagen JPEG'
                        : 'Descargar Matriz Excel (.xlsx)'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* RIGHT: Live Visual Preview Canvas */}
          <div className="flex-1 flex flex-col bg-slate-200/80 overflow-hidden relative">
            {/* Preview Toolbar */}
            <div className="px-4 py-2 bg-white/90 backdrop-blur-xs border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800">
                  Vista Previa del Gráfico a Exportar
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-[11px] text-slate-500">
                  {currentProject.title} vs {consultantProposal.consultantName}
                </span>
              </div>

              {/* Preview Scale Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewScale((s) => Math.max(0.2, s - 0.08))}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Reducir vista previa"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono font-bold w-12 text-center text-slate-700">
                  {Math.round(previewScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewScale((s) => Math.min(1.2, s + 0.08))}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Aumentar vista previa"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewScale(0.55)}
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-[10px] font-bold"
                  title="Ajustar escala recomendada"
                >
                  Ajustar
                </button>
              </div>
            </div>

            {/* Scrollable Preview Canvas Container */}
            <div className="flex-1 overflow-auto p-4 md:p-8 flex items-start justify-center">
              <div
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="shrink-0 shadow-2xl rounded-2xl overflow-hidden bg-white border border-slate-300"
              >
                {/* 
                  THE EXACT DOM NODE CAPTURED INTO PDF / IMAGE:
                  Full width, exact zero scrollbars, crisp text and vector shapes
                */}
                <div
                  ref={exportContainerRef}
                  id="comparison-gantt-export-canvas"
                  style={{
                    width: TOTAL_CANVAS_WIDTH,
                    backgroundColor: '#ffffff',
                  }}
                  className="flex flex-col bg-white text-slate-800 select-none"
                >
                  {/* 1. Executive Comparison Header */}
                  {includeHeader && (
                    <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b-2 border-indigo-500 flex flex-col gap-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 flex items-center gap-1">
                              <Scale className="w-3 h-3" />
                              Comparativa de Cronogramas
                            </span>
                            <span className="text-xs text-slate-300">
                              Proyecto: <strong className="text-white">{currentProject.title}</strong>
                            </span>
                          </div>
                          <h1 className="text-2xl font-black tracking-tight text-white">
                            Cronograma Actual vs. Propuesta {consultantProposal.consultantName}
                          </h1>
                          <p className="text-xs text-indigo-200 mt-0.5">
                            Versión {consultantProposal.version} • Fecha de emisión: {consultantProposal.proposalDate}
                          </p>
                        </div>

                        {/* Right Header Metadata */}
                        <div className="text-right text-xs space-y-1">
                          <div>
                            <span className="text-slate-400">Director del Proyecto: </span>
                            <strong className="text-white">{currentProject.manager}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Cliente / Organización: </span>
                            <strong className="text-slate-200">{currentProject.client}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Fecha de Exportación: </span>
                            <strong className="text-slate-200">{formatDateReadable(toISODate(new Date()))}</strong>
                          </div>
                        </div>
                      </div>

                      {/* 2. Executive KPI Cards */}
                      {includeKpis && (
                        <div className="grid grid-cols-5 gap-3 pt-3 border-t border-slate-700/60">
                          {/* KPI 1: Final Date Delta */}
                          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                              Fecha Fin del Proyecto
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm font-bold text-slate-300">
                                {formatDateShort(stats.currentEndDate)}
                              </span>
                              <span className="text-slate-400">➔</span>
                              <span className="text-sm font-black text-white">
                                {formatDateShort(stats.consultantEndDate)}
                              </span>
                            </div>
                            <span
                              className={`inline-block mt-1 px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                stats.projectEndDeltaDays > 0
                                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                                  : stats.projectEndDeltaDays < 0
                                  ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {stats.projectEndDeltaDays > 0
                                ? `+${stats.projectEndDeltaDays}d extensión`
                                : stats.projectEndDeltaDays < 0
                                ? `${stats.projectEndDeltaDays}d adelanto`
                                : 'Sin variación'}
                            </span>
                          </div>

                          {/* KPI 2: Working Days */}
                          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                              Días Hábiles
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-lg font-black text-indigo-300">
                                {stats.consultantWorkingDays}d
                              </span>
                              <span className="text-xs text-slate-400">
                                (vs {stats.currentWorkingDays}d actual)
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Variación neta: {stats.workingDaysDelta > 0 ? `+${stats.workingDaysDelta}d` : `${stats.workingDaysDelta}d`}
                            </span>
                          </div>

                          {/* KPI 3: Task Breakdown */}
                          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                              Estado Actividades
                            </span>
                            <div className="text-xs font-bold space-y-0.5 mt-1">
                              <div className="text-slate-300">● {stats.alignedCount} coincidentes</div>
                              <div className="text-emerald-300">▼ {stats.acceleratedCount} adelantadas</div>
                              <div className="text-amber-300">▲ {stats.delayedCount} extendidas</div>
                            </div>
                          </div>

                          {/* KPI 4: Milestones Impact */}
                          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                              Impacto en Hitos
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-lg font-black text-purple-300">
                                {stats.milestonesShiftedCount}
                              </span>
                              <span className="text-xs text-slate-400">
                                de {stats.milestonesCount} hitos con fechas ajustadas
                              </span>
                            </div>
                          </div>

                          {/* KPI 5: Scope Gap / Omitted */}
                          <div className="bg-amber-950/60 rounded-xl p-3 border border-amber-500/50">
                            <div className="flex items-center gap-1 text-[10px] text-amber-300 uppercase font-bold tracking-wider">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              <span>Brecha de Alcance</span>
                            </div>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-lg font-black text-amber-200">
                                {stats.omittedCount}
                              </span>
                              <span className="text-xs text-amber-300/80">
                                {stats.omittedCount === 1 ? 'actividad solo interna' : 'actividades solo internas'}
                              </span>
                            </div>
                            <span className="text-[10px] text-amber-300/80 font-medium block mt-0.5">
                              Fuera del alcance propuesto por consultora
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. Gantt Dual Body: Left WBS Table + Right Dual Timeline */}
                  <div className="flex border-b border-slate-300">
                    {/* Left Table */}
                    <div
                      style={{ width: WBS_TABLE_WIDTH }}
                      className="shrink-0 border-r border-slate-300 bg-white flex flex-col"
                    >
                      <div className="h-12 px-3 bg-slate-100 border-b border-slate-300 flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        <span className="w-12">WBS</span>
                        <span className="flex-1 pl-1">Actividad / Tarea</span>
                        <span className="w-24 text-right">Desviación</span>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {phases.map((phase, pIdx) => {
                          const pItems = exportItems.filter((c) => c.phaseId === phase.id);
                          if (pItems.length === 0) return null;

                          return (
                            <div key={`exp-phase-${phase.id}`} className="divide-y divide-slate-100">
                              {/* Phase Row */}
                              <div className="h-8 px-3 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between text-xs font-bold text-indigo-950">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="font-mono text-[10px] text-indigo-700">{pIdx + 1}.0</span>
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: phase.color }}
                                  />
                                  <span className="truncate uppercase">{phase.name}</span>
                                </div>
                                <span className="text-[10px] text-indigo-700 font-semibold shrink-0">
                                  {pItems.length} tareas
                                </span>
                              </div>

                              {/* Task Rows */}
                              {pItems.map((item, tIdx) => (
                                <div
                                  key={`exp-task-${item.taskId}`}
                                  className={`h-14 px-3 flex items-center justify-between text-xs ${
                                    tIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                                    <span className="font-mono text-[10px] text-slate-400 w-6 shrink-0">
                                      {pIdx + 1}.{tIdx + 1}
                                    </span>
                                    {item.isMilestone ? (
                                      <Flag className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                    ) : (
                                      <span
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ backgroundColor: item.currentTask.color || phase.color }}
                                      />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <div
                                          className="truncate font-semibold text-slate-800"
                                          title={item.taskName}
                                        >
                                          {item.taskName}
                                        </div>
                                        {item.status === 'omitted_by_consultant' && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-950 border border-amber-300 shrink-0">
                                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                                            No en Consultora
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                        <span>{item.currentTask.assignee.name}</span>
                                        {item.consultantRationale && (
                                          <span className="text-amber-700 truncate max-w-[160px]">
                                            • {item.consultantRationale}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="shrink-0">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono text-center block ${
                                        item.status === 'omitted_by_consultant'
                                          ? 'bg-amber-100 text-amber-950 border border-amber-300'
                                          : item.status === 'delayed'
                                          ? 'bg-amber-100 text-amber-800'
                                          : item.status === 'accelerated'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {item.status === 'omitted_by_consultant'
                                        ? 'Excluida'
                                        : item.endDeltaDays > 0
                                        ? `+${item.endDeltaDays}d`
                                        : item.endDeltaDays < 0
                                        ? `${item.endDeltaDays}d`
                                        : '0d (Igual)'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Timeline Area */}
                    <div
                      style={{ width: TIMELINE_WIDTH }}
                      className="shrink-0 bg-white flex flex-col relative"
                    >
                      {/* Months Header */}
                      <div className="h-12 bg-slate-100 border-b border-slate-300 flex">
                        {timelineMonths.map((m) => (
                          <div
                            key={`m-header-${m.key}`}
                            style={{ width: `${m.widthPercent}%` }}
                            className="px-3 border-r border-slate-300 flex flex-col justify-center text-xs font-bold text-slate-800 bg-slate-100"
                          >
                            <span>{m.label}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {m.dayCount} días
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Timeline Data Tracks */}
                      <div className="flex flex-col divide-y divide-slate-100">
                        {phases.map((phase) => {
                          const pItems = exportItems.filter((c) => c.phaseId === phase.id);
                          if (pItems.length === 0) return null;

                          return (
                            <div key={`tl-phase-${phase.id}`} className="divide-y divide-slate-100">
                              {/* Phase Strip */}
                              <div className="h-8 bg-indigo-50/40 relative flex items-center">
                                <div className="absolute inset-0 flex pointer-events-none">
                                  {timelineMonths.map((m) => (
                                    <div
                                      key={`bg-p-${m.key}`}
                                      style={{ width: `${m.widthPercent}%` }}
                                      className="border-r border-slate-200/40 h-full"
                                    />
                                  ))}
                                </div>
                              </div>

                              {/* Task Dual Tracks */}
                              {pItems.map((item, tIdx) => {
                                const currCoords = getTimelineBarCoords(
                                  item.currentTask.startDate,
                                  item.currentTask.endDate
                                );
                                const consCoords = getTimelineBarCoords(
                                  item.consultantTask.startDate,
                                  item.consultantTask.endDate
                                );

                                return (
                                  <div
                                    key={`tl-task-${item.taskId}`}
                                    className={`h-14 relative flex flex-col justify-center ${
                                      tIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                    }`}
                                  >
                                    {/* Month grid lines */}
                                    <div className="absolute inset-0 flex pointer-events-none">
                                      {timelineMonths.map((m) => (
                                        <div
                                          key={`bg-m-track-${m.key}`}
                                          style={{ width: `${m.widthPercent}%` }}
                                          className="border-r border-slate-200/30 h-full"
                                        />
                                      ))}
                                    </div>

                                    {/* TRACK 1: Cronograma Actual (Azul) */}
                                    <div className="h-5 relative mb-1 flex items-center">
                                      {item.isMilestone ? (
                                        <div
                                          style={{ left: currCoords.left }}
                                          className="absolute -ml-2.5 z-10 flex items-center gap-1"
                                        >
                                          <div
                                            className={`w-5 h-5 bg-indigo-600 rotate-45 rounded-xs shadow-xs flex items-center justify-center text-white ${
                                              item.status === 'omitted_by_consultant' ? 'ring-2 ring-amber-400' : ''
                                            }`}
                                          >
                                            <Flag className="w-2.5 h-2.5 -rotate-45" />
                                          </div>
                                          <span
                                            className={`text-[10px] font-bold px-1 py-0.2 rounded border shadow-2xs whitespace-nowrap ${
                                              item.status === 'omitted_by_consultant'
                                                ? 'text-amber-950 bg-amber-50 border-amber-300'
                                                : 'text-indigo-900 bg-white border-indigo-200'
                                            }`}
                                          >
                                            {item.status === 'omitted_by_consultant' ? 'Actual (Solo Interna): ' : 'Actual: '}
                                            {formatDateShort(item.currentTask.startDate)}
                                          </span>
                                        </div>
                                      ) : (
                                        <div
                                          style={{
                                            left: currCoords.left,
                                            width: currCoords.width,
                                            backgroundImage:
                                              item.status === 'omitted_by_consultant'
                                                ? 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.25), rgba(245, 158, 11, 0.25) 5px, transparent 5px, transparent 10px)'
                                                : undefined,
                                          }}
                                          className={`absolute h-4.5 rounded-md text-white flex items-center px-2 text-[10px] font-bold shadow-xs truncate z-10 ${
                                            item.status === 'omitted_by_consultant'
                                              ? 'bg-indigo-700 border border-amber-400'
                                              : 'bg-indigo-600'
                                          }`}
                                        >
                                          <span className="truncate">
                                            {item.status === 'omitted_by_consultant' ? '⚡ Actual (Solo Interna): ' : 'Actual: '}
                                            {formatDateShort(item.currentTask.startDate)} – {formatDateShort(item.currentTask.endDate)}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {/* TRACK 2: Propuesta Consultora */}
                                    <div className="h-5 relative flex items-center">
                                      {item.status === 'omitted_by_consultant' ? (
                                        <div
                                          style={{ left: currCoords.left, width: currCoords.width }}
                                          className="absolute h-4.5 rounded-md border-2 border-dashed border-amber-400 bg-amber-50 text-amber-950 flex items-center px-2 text-[10px] font-bold z-10 truncate shadow-2xs"
                                        >
                                          <AlertTriangle className="w-3 h-3 text-amber-600 mr-1 shrink-0" />
                                          <span className="truncate">Consultora: No considerada en propuesta</span>
                                        </div>
                                      ) : item.isMilestone ? (
                                        <div
                                          style={{ left: consCoords.left }}
                                          className="absolute -ml-2.5 z-10 flex items-center gap-1"
                                        >
                                          <div className="w-5 h-5 bg-amber-500 rotate-45 rounded-xs shadow-xs flex items-center justify-center text-white">
                                            <Flag className="w-2.5 h-2.5 -rotate-45" />
                                          </div>
                                          <span className="text-[10px] font-bold text-amber-900 bg-amber-50 px-1 py-0.2 rounded border border-amber-300 shadow-2xs whitespace-nowrap">
                                            Consultora: {formatDateShort(item.consultantTask.startDate)}
                                          </span>
                                        </div>
                                      ) : (
                                        <div
                                          style={{ left: consCoords.left, width: consCoords.width }}
                                          className={`absolute h-4.5 rounded-md text-white flex items-center px-2 text-[10px] font-bold shadow-xs truncate z-10 ${
                                            item.status === 'delayed'
                                              ? 'bg-amber-600'
                                              : item.status === 'accelerated'
                                              ? 'bg-emerald-600'
                                              : 'bg-slate-600'
                                          }`}
                                        >
                                          <span className="truncate">
                                            Consultora: {formatDateShort(item.consultantTask.startDate)} – {formatDateShort(item.consultantTask.endDate)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 4. Executive Legend Footer */}
                  {includeLegend && (
                    <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-5">
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-3 rounded bg-indigo-600 shadow-2xs" />
                          <span className="font-semibold text-slate-800">Cronograma Actual (Línea Base)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-3 rounded bg-emerald-600 shadow-2xs" />
                          <span className="font-semibold text-emerald-800">Consultora: Propone Adelanto</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-3 rounded bg-amber-600 shadow-2xs" />
                          <span className="font-semibold text-amber-800">Consultora: Propone Extensión</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-3 rounded border-2 border-dashed border-amber-400 bg-amber-50 text-amber-800 flex items-center justify-center shadow-2xs">
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                          </span>
                          <span className="font-bold text-amber-950">No considerada por consultora (Solo Interna)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 bg-purple-600 rotate-45 shadow-2xs" />
                          <span className="font-semibold text-purple-900">Hitos Clave</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 font-medium">
                        Comparativa oficial generada con <strong>Gestor de Proyecto & Carta Gantt</strong> • {exportItems.length} actividades mostradas
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
