import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Project, Task, Phase, Assignee, Holiday, ZoomLevel } from '../types';
import {
  diffDays,
  addDays,
  parseDate,
  toISODate,
  formatDateShort,
  formatDateReadable,
  getMonthYearName,
  getDayName,
  isWeekend,
  isToday,
  getHoliday,
  getTimelineBounds,
  calculateCriticalPath,
  countWorkingDays,
} from '../utils/dateUtils';
import {
  X,
  Download,
  FileText,
  Image as ImageIcon,
  Copy,
  Check,
  Printer,
  Sparkles,
  Layers,
  Calendar,
  User,
  Clock,
  Flame,
  Link as LinkIcon,
  Flag,
  Loader2,
  Sliders,
  CheckCircle2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';
import { exportProjectToExcel } from '../utils/excelExport';

interface GanttExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  initialZoom?: ZoomLevel;
  initialShowDependencies?: boolean;
  initialShowCriticalPath?: boolean;
  onShowNotification?: (message: string, type: 'success' | 'info' | 'error') => void;
}

export type ExportFormat = 'xlsx' | 'png' | 'pdf' | 'jpeg';
export type PaperSize = 'a4' | 'a3' | 'letter';

const ROW_HEIGHT = 38;
const HEADER_HEIGHT = 52;
const WBS_TABLE_WIDTH = 360;

export const GanttExportModal: React.FC<GanttExportModalProps> = ({
  isOpen,
  onClose,
  project,
  initialZoom = 'week',
  initialShowDependencies = true,
  initialShowCriticalPath = false,
  onShowNotification,
}) => {
  // Export Settings State
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [zoom, setZoom] = useState<ZoomLevel>(initialZoom);
  const [resolutionScale, setResolutionScale] = useState<number>(2); // 1x, 2x, 3x
  const [paperSize, setPaperSize] = useState<PaperSize>('a4');
  const [fitToPage, setFitToPage] = useState<boolean>(true);

  // Excel specific options
  const [includeExcelGanttMatrix, setIncludeExcelGanttMatrix] = useState<boolean>(true);
  const [includeExcelSummaries, setIncludeExcelSummaries] = useState<boolean>(true);
  const [includeExcelHolidays, setIncludeExcelHolidays] = useState<boolean>(true);
  const [includeExcelCriticalPath, setIncludeExcelCriticalPath] = useState<boolean>(true);
  const [activeExcelPreviewTab, setActiveExcelPreviewTab] = useState<'gantt' | 'team' | 'phases' | 'holidays' | 'critical'>('gantt');

  // Toggle elements to include
  const [includeHeader, setIncludeHeader] = useState<boolean>(true);
  const [includeLegend, setIncludeLegend] = useState<boolean>(true);
  const [includeWbsTable, setIncludeWbsTable] = useState<boolean>(true);
  const [includeDependencies, setIncludeDependencies] = useState<boolean>(initialShowDependencies);
  const [includeCriticalPath, setIncludeCriticalPath] = useState<boolean>(initialShowCriticalPath);
  const [highlightNonWorkingDays, setHighlightNonWorkingDays] = useState<boolean>(true);
  const [expandAllPhases, setExpandAllPhases] = useState<boolean>(true);

  // Action status
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportStepText, setExportStepText] = useState<string>('');
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [previewScale, setPreviewScale] = useState<number>(0.65);

  // References
  const exportContainerRef = useRef<HTMLDivElement>(null);

  // Critical path calculation
  const criticalTaskIds = useMemo(() => calculateCriticalPath(project.tasks), [project.tasks]);

  // Timeline bounds calculation
  const bounds = useMemo(() => getTimelineBounds(project.tasks), [project.tasks]);
  const timelineStartDateStr = useMemo(() => toISODate(bounds.start), [bounds.start]);
  const timelineEndDateStr = useMemo(() => toISODate(bounds.end), [bounds.end]);

  // Day width based on selected zoom
  const dayWidth = useMemo(() => {
    switch (zoom) {
      case 'day':
        return 30;
      case 'week':
        return 16;
      case 'month':
        return 7;
      default:
        return 16;
    }
  }, [zoom]);

  // Days array
  const daysArray = useMemo(() => {
    const days: Date[] = [];
    const curr = new Date(bounds.start);
    while (curr <= bounds.end) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [bounds]);

  // Month headers
  const monthHeaders = useMemo(() => {
    const months: { label: string; startDayIndex: number; daysCount: number }[] = [];
    let currentMonth = -1;
    let currentYear = -1;
    let startIdx = 0;
    let count = 0;
    let currentLabel = '';

    daysArray.forEach((d, idx) => {
      const m = d.getMonth();
      const y = d.getFullYear();
      if (m !== currentMonth || y !== currentYear) {
        if (count > 0) {
          months.push({ label: currentLabel, startDayIndex: startIdx, daysCount: count });
        }
        currentMonth = m;
        currentYear = y;
        currentLabel = getMonthYearName(d);
        startIdx = idx;
        count = 1;
      } else {
        count++;
      }
    });
    if (count > 0) {
      months.push({ label: currentLabel, startDayIndex: startIdx, daysCount: count });
    }
    return months;
  }, [daysArray]);

  // Visible rows
  const visibleRows = useMemo(() => {
    const rows: { type: 'phase' | 'task'; phase: Phase; task?: Task; height: number; wbsIndex?: string }[] = [];
    let phaseNum = 1;

    project.phases.forEach((phase) => {
      rows.push({
        type: 'phase',
        phase,
        height: 34,
        wbsIndex: `${phaseNum}.0`,
      });

      const phaseTasks = project.tasks.filter((t) => t.phaseId === phase.id);
      phaseTasks.forEach((task, tIdx) => {
        rows.push({
          type: 'task',
          phase,
          task,
          height: ROW_HEIGHT,
          wbsIndex: `${phaseNum}.${tIdx + 1}`,
        });
      });

      phaseNum++;
    });

    return rows;
  }, [project.phases, project.tasks]);

  // Task row Y positions for dependency lines
  const { taskRowPositions, totalContentHeight } = useMemo(() => {
    const positions = new Map<string, number>();
    let currentY = 0;

    visibleRows.forEach((row) => {
      if (row.type === 'task' && row.task) {
        positions.set(row.task.id, currentY);
      }
      currentY += row.height;
    });

    return { taskRowPositions: positions, totalContentHeight: currentY };
  }, [visibleRows]);

  // Overall statistics
  const stats = useMemo(() => {
    const total = project.tasks.length;
    const completed = project.tasks.filter((t) => t.progress === 100).length;
    const inProgress = project.tasks.filter((t) => t.progress > 0 && t.progress < 100).length;
    const milestones = project.tasks.filter((t) => t.isMilestone).length;
    const critical = project.tasks.filter((t) => criticalTaskIds.has(t.id)).length;
    const totalProgress = total > 0 ? Math.round(project.tasks.reduce((sum, t) => sum + t.progress, 0) / total) : 0;
    const workingDaysCount = countWorkingDays(project.startDate, project.targetEndDate, project.holidays);

    return { total, completed, inProgress, milestones, critical, totalProgress, workingDaysCount };
  }, [project, criticalTaskIds]);

  // SVG Dependency lines renderer
  const renderDependencyLines = () => {
    if (!includeDependencies) return null;

    const lines: React.ReactNode[] = [];

    project.tasks.forEach((targetTask) => {
      const targetY = taskRowPositions.get(targetTask.id);
      if (targetY === undefined) return;

      targetTask.dependencies.forEach((sourceTaskId) => {
        const sourceTask = project.tasks.find((t) => t.id === sourceTaskId);
        const sourceY = taskRowPositions.get(sourceTaskId);
        if (!sourceTask || sourceY === undefined) return;

        const sourceStartDays = diffDays(timelineStartDateStr, sourceTask.startDate);
        const sourceDur = Math.max(1, diffDays(sourceTask.startDate, sourceTask.endDate) + 1);
        const sourceLeftPx = sourceStartDays * dayWidth;
        const sourceWidthPx = sourceTask.isMilestone ? 24 : Math.max(dayWidth * 0.8, sourceDur * dayWidth);
        const x1 = sourceTask.isMilestone ? sourceLeftPx + dayWidth / 2 + 10 : sourceLeftPx + sourceWidthPx;
        const y1 = sourceY + ROW_HEIGHT / 2;

        const targetStartDays = diffDays(timelineStartDateStr, targetTask.startDate);
        const targetLeftPx = targetStartDays * dayWidth;
        const x2 = targetTask.isMilestone ? targetLeftPx + dayWidth / 2 - 10 : targetLeftPx;
        const y2 = targetY + ROW_HEIGHT / 2;

        const isCriticalLine =
          includeCriticalPath &&
          criticalTaskIds.has(sourceTaskId) &&
          criticalTaskIds.has(targetTask.id);

        const dx = Math.abs(x2 - x1);
        const curveOffset = Math.min(30, Math.max(14, dx / 2));
        const pathD = `M ${x1} ${y1} C ${x1 + curveOffset} ${y1}, ${x2 - curveOffset} ${y2}, ${x2} ${y2}`;

        lines.push(
          <g key={`dep-${sourceTaskId}->${targetTask.id}`}>
            <path
              d={pathD}
              fill="none"
              stroke={isCriticalLine ? '#ef4444' : '#94a3b8'}
              strokeWidth={isCriticalLine ? 2.5 : 1.5}
              strokeDasharray={isCriticalLine ? 'none' : '3 2'}
            />
            <polygon
              points={`${x2},${y2} ${x2 - 5},${y2 - 3} ${x2 - 5},${y2 + 3}`}
              fill={isCriticalLine ? '#ef4444' : '#64748b'}
            />
          </g>
        );
      });
    });

    return (
      <svg
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          width: bounds.totalDays * dayWidth,
          height: totalContentHeight,
        }}
      >
        {lines}
      </svg>
    );
  };

  // Helper filename generator
  const getExportFilename = (extension: string) => {
    const safeTitle = project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const dateStr = toISODate(new Date());
    return `${safeTitle || 'cronograma'}_gantt_${dateStr}.${extension}`;
  };

  // Generate PNG / JPEG image
  const handleExportImage = async (imgFormat: 'png' | 'jpeg') => {
    if (!exportContainerRef.current) return;
    setIsExporting(true);
    setExportStepText(`Renderizando imagen ${imgFormat.toUpperCase()} en alta resolución...`);

    try {
      const node = exportContainerRef.current;
      const options = {
        backgroundColor: '#ffffff',
        pixelRatio: resolutionScale,
        cacheBust: true,
        style: {
          transform: 'none',
          boxShadow: 'none',
        },
      };

      const dataUrl = imgFormat === 'jpeg'
        ? await htmlToImage.toJpeg(node, { ...options, quality: 0.95 })
        : await htmlToImage.toPng(node, options);

      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = dataUrl;
      downloadAnchor.download = getExportFilename(imgFormat);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      onShowNotification?.(`¡Imagen ${imgFormat.toUpperCase()} exportada exitosamente!`, 'success');
    } catch (error) {
      console.error('Error generating image export:', error);
      onShowNotification?.('Hubo un error al generar la imagen. Intenta con resolución 1x.', 'error');
    } finally {
      setIsExporting(false);
      setExportStepText('');
    }
  };

  // Copy image to clipboard
  const handleCopyToClipboard = async () => {
    if (!exportContainerRef.current) return;
    setIsExporting(true);
    setExportStepText('Preparando imagen para copiar al portapapeles...');

    try {
      const node = exportContainerRef.current;
      const blob = await htmlToImage.toBlob(node, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
        style: {
          transform: 'none',
          boxShadow: 'none',
        },
      });

      if (blob && navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 3000);
        onShowNotification?.('¡Imagen copiada al portapapeles! Puedes pegarla con Ctrl+V en Word, PowerPoint o Teams.', 'success');
      } else {
        // Fallback: download as png
        handleExportImage('png');
      }
    } catch (error) {
      console.error('Error copying image to clipboard:', error);
      onShowNotification?.('El navegador no permitió copiar directamente. Descargando como archivo...', 'info');
      handleExportImage('png');
    } finally {
      setIsExporting(false);
      setExportStepText('');
    }
  };

  // Export directly to rich Excel workbook (.xlsx)
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      setExportStepText('Generando cronograma completo con ExcelJS (.xlsx)...');
      const filename = await exportProjectToExcel(project, {
        includeGanttMatrix: includeExcelGanttMatrix,
        includeSummarySheets: includeExcelSummaries,
        includeHolidaysSheet: includeExcelHolidays,
        includeCriticalPathSheet: includeExcelCriticalPath,
      });
      onShowNotification?.(`Libro Excel descargado con éxito: ${filename}`, 'success');
    } catch (err) {
      console.error('Error al exportar a Excel:', err);
      onShowNotification?.('Ocurrió un error al generar el archivo Excel.', 'error');
    } finally {
      setIsExporting(false);
      setExportStepText('');
    }
  };

  // Generate PDF document
  const handleExportPDF = async () => {
    if (!exportContainerRef.current) return;
    setIsExporting(true);
    setExportStepText('Generando captura para el documento PDF...');

    try {
      const node = exportContainerRef.current;
      // Capture crisp image
      const dataUrl = await htmlToImage.toPng(node, {
        backgroundColor: '#ffffff',
        pixelRatio: Math.max(2, resolutionScale),
        cacheBust: true,
        style: {
          transform: 'none',
          boxShadow: 'none',
        },
      });

      setExportStepText('Compilando documento PDF apaisado...');

      const orientation = 'landscape';
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: paperSize,
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8; // 8mm margin
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      // Load image to get original dimensions
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const imgWidth = img.naturalWidth || img.width;
      const imgHeight = img.naturalHeight || img.height;
      const imgRatio = imgWidth / imgHeight;

      if (fitToPage) {
        // Fit completely in one landscape page
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
        // Fit to page width; if height exceeds page, calculate pages
        const renderWidth = usableWidth;
        const totalRenderHeight = usableWidth / imgRatio;

        if (totalRenderHeight <= usableHeight) {
          pdf.addImage(dataUrl, 'PNG', margin, margin, renderWidth, totalRenderHeight, undefined, 'FAST');
        } else {
          // Multipage split
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
      }

      // PDF Metadata
      pdf.setProperties({
        title: `${project.title} - Cronograma de Gantt`,
        subject: `Cronograma de Actividades y Planificación de Proyecto`,
        author: project.manager || 'Project Manager',
        creator: 'Gantt Planner Pro',
      });

      pdf.save(getExportFilename('pdf'));
      onShowNotification?.('¡Documento PDF exportado exitosamente!', 'success');
    } catch (error) {
      console.error('Error generating PDF export:', error);
      onShowNotification?.('Hubo un error al generar el PDF. Puedes intentar descargar como imagen PNG.', 'error');
    } finally {
      setIsExporting(false);
      setExportStepText('');
    }
  };

  // Direct print via browser native print
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const totalCalculatedWidth = (includeWbsTable ? WBS_TABLE_WIDTH : 0) + bounds.totalDays * dayWidth;

  return (
    <div
      id="gantt-export-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 md:p-6 overflow-hidden animate-in fade-in duration-200"
    >
      <div
        id="gantt-export-modal"
        className="bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[96vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Exportar Cronograma Gantt</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Imagen & PDF
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Genera un archivo gráfico en alta resolución o documento ejecutivo listo para imprimir y compartir.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area: Left Options Sidebar + Right Live Preview */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Left Sidebar: Settings & Controls */}
          <div className="w-full lg:w-84 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-5 overflow-y-auto shrink-0 space-y-5">
            {/* Format Selection Tabs */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Formato de Exportación
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat('xlsx')}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    format === 'xlsx'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-500 shadow-2xs ring-1 ring-emerald-500'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileSpreadsheet className={`w-4 h-4 mb-1 ${format === 'xlsx' ? 'text-emerald-600' : 'text-slate-500'}`} />
                  <span className="font-bold">Excel</span>
                  <span className="text-[9px] font-normal text-slate-400">.xlsx (4 Hojas)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('png')}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    format === 'png'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-500 shadow-2xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <ImageIcon className="w-4 h-4 mb-1" />
                  <span>PNG</span>
                  <span className="text-[9px] font-normal text-slate-400">Sin pérdida</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('pdf')}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    format === 'pdf'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-500 shadow-2xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-4 h-4 mb-1" />
                  <span>PDF</span>
                  <span className="text-[9px] font-normal text-slate-400">Ejecutivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('jpeg')}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    format === 'jpeg'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-500 shadow-2xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Sparkles className="w-4 h-4 mb-1" />
                  <span>JPG</span>
                  <span className="text-[9px] font-normal text-slate-400">Ligero</span>
                </button>
              </div>
            </div>

            {/* Timeline Scale (only for visual formats) */}
            {format !== 'xlsx' && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Escala de Tiempo
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {(['week', 'day', 'month'] as ZoomLevel[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setZoom(level)}
                      className={`py-1.5 text-xs font-semibold rounded-lg capitalize transition-all cursor-pointer ${
                        zoom === level
                          ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {level === 'week' ? 'Semanas' : level === 'day' ? 'Días' : 'Meses'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {zoom === 'week'
                    ? 'Recomendado: Vista equilibrada ideal para la mayoría de proyectos.'
                    : zoom === 'day'
                    ? 'Detalle máximo: Muestra cada día hábil, fines de semana y feriados.'
                    : 'Visión compacta: Ideal para cronogramas largos de varios meses o años.'}
                </p>
              </div>
            )}

            {/* Format-specific settings */}
            {format === 'xlsx' ? (
              <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-3">
                <div className="flex items-center gap-2 text-emerald-950 font-bold text-xs">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  <span>Contenido del Libro Excel (.xlsx)</span>
                </div>

                <div className="space-y-2 pt-1 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-emerald-900">
                    <input
                      type="checkbox"
                      checked={includeExcelGanttMatrix}
                      onChange={(e) => setIncludeExcelGanttMatrix(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 border-emerald-300 focus:ring-emerald-500"
                    />
                    <span>Matriz visual del Gantt (grilla diaria sin límite de fechas)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium text-emerald-900">
                    <input
                      type="checkbox"
                      checked={includeExcelSummaries}
                      onChange={(e) => setIncludeExcelSummaries(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 border-emerald-300 focus:ring-emerald-500"
                    />
                    <span>Hojas de Equipo y Resumen por Fase WBS</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium text-emerald-900">
                    <input
                      type="checkbox"
                      checked={includeExcelHolidays}
                      onChange={(e) => setIncludeExcelHolidays(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 border-emerald-300 focus:ring-emerald-500"
                    />
                    <span>Hoja de Calendario de Feriados</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium text-emerald-900">
                    <input
                      type="checkbox"
                      checked={includeExcelCriticalPath}
                      onChange={(e) => setIncludeExcelCriticalPath(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 border-emerald-300 focus:ring-emerald-500"
                    />
                    <span>Hoja de Ruta Crítica y Seguimiento de Hitos</span>
                  </label>
                </div>

                <div className="p-2.5 bg-white/90 rounded-lg border border-emerald-100 text-[11px] text-emerald-800 leading-relaxed space-y-1">
                  <div className="font-semibold text-emerald-900">5 Hojas de cálculo completas:</div>
                  <div>• <strong>Cronograma Gantt</strong>: 100% de fases, tareas y fechas completas</div>
                  <div>• <strong>Equipo & Carga</strong>: Tareas, días y horas por persona</div>
                  <div>• <strong>Resumen por Fase</strong>: Hitos, avance y cronograma</div>
                  <div>• <strong>Calendario Feriados</strong>: Días no laborables aplicados</div>
                  <div>• <strong>Ruta Crítica & Hitos</strong>: Actividades clave del proyecto</div>
                </div>
              </div>
            ) : format === 'pdf' ? (
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-950">Tamaño de Hoja (Apaisado):</label>
                  <select
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value as PaperSize)}
                    className="text-xs font-bold bg-white border border-indigo-200 rounded-lg px-2.5 py-1 text-indigo-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="a4">A4 (297 × 210 mm)</option>
                    <option value="a3">A3 (420 × 297 mm)</option>
                    <option value="letter">Carta (279 × 216 mm)</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-indigo-900">
                  <input
                    type="checkbox"
                    checked={fitToPage}
                    onChange={(e) => setFitToPage(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 border-indigo-300 focus:ring-indigo-500"
                  />
                  <span>Ajustar a 1 página horizontal</span>
                </label>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Calidad / Nitidez:</label>
                  <select
                    value={resolutionScale}
                    onChange={(e) => setResolutionScale(Number(e.target.value))}
                    className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-800 focus:outline-hidden"
                  >
                    <option value="1">1x Estándar</option>
                    <option value="2">2x Alta Resolución (HD)</option>
                    <option value="3">3x Ultra HD (Presentaciones)</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-400">
                  2x es ideal para que las letras y fechas se lean con nitidez absoluta al hacer zoom.
                </p>
              </div>
            )}

            {/* Elements Checklist */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Elementos a Incluir
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 hover:text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={(e) => setIncludeHeader(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <span>Membrete / Encabezado ejecutivo</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 hover:text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeWbsTable}
                  onChange={(e) => setIncludeWbsTable(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <span>Tabla WBS (Nombres, responsable, %)</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 hover:text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDependencies}
                  onChange={(e) => setIncludeDependencies(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <span>Flechas de dependencias / enlaces</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 hover:text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCriticalPath}
                  onChange={(e) => setIncludeCriticalPath(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <span className="flex items-center gap-1">
                  <span>Resaltar Ruta Crítica</span>
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                </span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 hover:text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={highlightNonWorkingDays}
                  onChange={(e) => setHighlightNonWorkingDays(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <span>Sombrear fines de semana y feriados</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 hover:text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLegend}
                  onChange={(e) => setIncludeLegend(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <span>Pie con leyenda de colores</span>
              </label>
            </div>

            {/* Quick summary box */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-600">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Rango cronograma:</span>
                <span>{bounds.totalDays} días</span>
              </div>
              <div className="flex justify-between">
                <span>Total actividades:</span>
                <span>{project.tasks.length} tareas</span>
              </div>
              <div className="flex justify-between">
                <span>Hitos:</span>
                <span>{stats.milestones} hitos</span>
              </div>
              <div className="flex justify-between">
                <span>Dimensiones estimadas:</span>
                <span className="text-indigo-600 font-mono text-[11px] font-bold">
                  {totalCalculatedWidth} × {totalContentHeight + 180} px
                </span>
              </div>
            </div>
          </div>

          {/* Right Area: Interactive Zoomable Preview Container */}
          <div className="flex-1 flex flex-col bg-slate-200/70 overflow-hidden relative">
            {/* Preview Toolbar */}
            <div className="px-4 py-2 bg-white/90 backdrop-blur-xs border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">
                  {format === 'xlsx' ? 'Vista Previa del Libro Excel (.xlsx)' : 'Vista Previa del Documento'}
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-[11px] text-slate-500">
                  {project.title} ({formatDateReadable(project.startDate)} ➔ {formatDateReadable(project.targetEndDate)})
                </span>
              </div>

              {/* Preview Controls */}
              {format !== 'xlsx' ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewScale((s) => Math.max(0.25, s - 0.1))}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Reducir vista previa"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono font-bold w-12 text-center">
                    {Math.round(previewScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewScale((s) => Math.min(1.2, s + 0.1))}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Aumentar vista previa"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewScale(0.65)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-[10px] font-bold"
                    title="Restablecer tamaño normal"
                  >
                    Ajustar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Descargar .xlsx</span>
                </button>
              )}
            </div>

            {/* Preview Scrollable Canvas or Excel Container */}
            {format === 'xlsx' ? (
              <div className="flex-1 overflow-auto p-4 md:p-6 flex flex-col items-center">
                <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
                  {/* Excel Workbook Header */}
                  <div className="p-4 bg-emerald-800 text-white flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center text-white shadow-2xs">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold leading-tight">
                          {project.title.toLowerCase().replace(/\s+/g, '_')}_cronograma_completo.xlsx
                        </h4>
                        <p className="text-[11px] text-emerald-200">
                          Libro de cálculo profesional con 100% de fases, actividades y matriz diaria completa
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-semibold bg-emerald-900/60 border border-emerald-700 px-3 py-1 rounded-full text-emerald-100">
                      <span>✓ {project.tasks.length} actividades</span>
                      <span>•</span>
                      <span>{project.phases.length} fases WBS</span>
                      <span>•</span>
                      <span>{project.assignees.length} responsables</span>
                      <span>•</span>
                      <span>Sin límite de fechas</span>
                    </div>
                  </div>

                  {/* Sheet Tabs */}
                  <div className="flex border-b border-slate-200 bg-slate-50 px-2 pt-2 gap-1 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setActiveExcelPreviewTab('gantt')}
                      className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-t border-x cursor-pointer flex items-center gap-1.5 ${
                        activeExcelPreviewTab === 'gantt'
                          ? 'bg-white text-emerald-800 border-slate-200 shadow-2xs border-b-2 border-b-emerald-600'
                          : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <span>📊 Hoja 1: Cronograma Gantt Completo</span>
                    </button>
                    {includeExcelSummaries && (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveExcelPreviewTab('team')}
                          className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-t border-x cursor-pointer flex items-center gap-1.5 ${
                            activeExcelPreviewTab === 'team'
                              ? 'bg-white text-emerald-800 border-slate-200 shadow-2xs border-b-2 border-b-emerald-600'
                              : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span>👥 Hoja 2: Equipo & Carga</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveExcelPreviewTab('phases')}
                          className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-t border-x cursor-pointer flex items-center gap-1.5 ${
                            activeExcelPreviewTab === 'phases'
                              ? 'bg-white text-emerald-800 border-slate-200 shadow-2xs border-b-2 border-b-emerald-600'
                              : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span>📁 Hoja 3: Resumen por Fase WBS</span>
                        </button>
                      </>
                    )}
                    {includeExcelHolidays && (
                      <button
                        type="button"
                        onClick={() => setActiveExcelPreviewTab('holidays')}
                        className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-t border-x cursor-pointer flex items-center gap-1.5 ${
                          activeExcelPreviewTab === 'holidays'
                            ? 'bg-white text-emerald-800 border-slate-200 shadow-2xs border-b-2 border-b-emerald-600'
                            : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <span>🏖️ Hoja 4: Calendario Feriados</span>
                      </button>
                    )}
                    {includeExcelCriticalPath && (
                      <button
                        type="button"
                        onClick={() => setActiveExcelPreviewTab('critical')}
                        className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-t border-x cursor-pointer flex items-center gap-1.5 ${
                          activeExcelPreviewTab === 'critical'
                            ? 'bg-white text-emerald-800 border-slate-200 shadow-2xs border-b-2 border-b-emerald-600'
                            : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <span>🔥 Hoja 5: Ruta Crítica & Hitos</span>
                      </button>
                    )}
                  </div>

                  {/* Active Sheet Table Preview */}
                  <div className="p-4 max-h-[500px] overflow-auto">
                    {activeExcelPreviewTab === 'gantt' && (
                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-200">
                          <thead className="bg-slate-100 text-[11px] font-bold text-slate-800 uppercase tracking-wider sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2 w-14">WBS</th>
                              <th className="px-3 py-2 w-16">Tipo</th>
                              <th className="px-3 py-2">Actividad / Tarea</th>
                              <th className="px-3 py-2">Fase</th>
                              <th className="px-3 py-2">Responsable</th>
                              <th className="px-3 py-2">Prioridad</th>
                              <th className="px-3 py-2">Estado</th>
                              <th className="px-3 py-2">% Avance</th>
                              <th className="px-3 py-2">Inicio</th>
                              <th className="px-3 py-2">Fin</th>
                              <th className="px-3 py-2">Días Háb.</th>
                              <th className="px-3 py-2">Días Cal.</th>
                              <th className="px-3 py-2">Entregable</th>
                              {includeExcelGanttMatrix && (
                                <th className="px-3 py-2 bg-emerald-50 text-emerald-900">
                                  Matriz Diaria Gantt (Columnas completas)
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {visibleRows.map((r) => {
                              if (r.type === 'phase') {
                                const pTasks = project.tasks.filter((t) => t.phaseId === r.phase.id);
                                const pAvg =
                                  pTasks.length > 0
                                    ? Math.round(
                                        pTasks.reduce((s, t) => s + (t.progress || 0), 0) / pTasks.length
                                      )
                                    : 0;
                                return (
                                  <tr
                                    key={`prev-phase-${r.phase.id}`}
                                    className="bg-slate-100/90 font-bold text-indigo-950 border-t border-b border-slate-300"
                                  >
                                    <td className="px-3 py-2 text-indigo-700 font-mono">{r.wbsIndex}</td>
                                    <td className="px-3 py-2 uppercase text-[10px] text-indigo-600 font-bold">FASE</td>
                                    <td className="px-3 py-2 font-bold text-slate-900">
                                      ▶ FASE: {r.phase.name.toUpperCase()}
                                    </td>
                                    <td className="px-3 py-2 text-slate-500">—</td>
                                    <td className="px-3 py-2 text-slate-600 font-medium">Equipo de Fase</td>
                                    <td className="px-3 py-2 text-slate-500">—</td>
                                    <td className="px-3 py-2">
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                        {pAvg === 100 ? 'Completada' : pAvg > 0 ? 'En Progreso' : 'Pendiente'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-indigo-900 font-mono">{pAvg}%</td>
                                    <td className="px-3 py-2 text-slate-600 font-mono">—</td>
                                    <td className="px-3 py-2 text-slate-600 font-mono">—</td>
                                    <td className="px-3 py-2 text-center text-indigo-900 font-bold">—</td>
                                    <td className="px-3 py-2 text-center text-slate-600 font-bold">—</td>
                                    <td className="px-3 py-2 text-slate-600 font-normal">{pTasks.length} tareas</td>
                                    {includeExcelGanttMatrix && (
                                      <td className="px-3 py-2 bg-emerald-50/70 text-emerald-800 font-bold text-[10px]">
                                        [Barra de Fase: ▓▓ {pAvg}%]
                                      </td>
                                    )}
                                  </tr>
                                );
                              }

                              const t = r.task!;
                              const isCrit = criticalTaskIds.has(t.id);
                              return (
                                <tr key={t.id} className="hover:bg-slate-50 text-xs">
                                  <td className="px-3 py-2 text-slate-500 font-mono font-bold">{r.wbsIndex}</td>
                                  <td className="px-3 py-2 text-[10px] font-semibold text-slate-500">
                                    {t.isMilestone ? '◆ HITO' : 'Tarea'}
                                  </td>
                                  <td className="px-3 py-2 font-semibold text-slate-900 pl-5">
                                    {t.name}
                                    {isCrit && (
                                      <span className="ml-1.5 px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded text-[9px] font-bold">
                                        Crítica
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600">{r.phase.name}</td>
                                  <td className="px-3 py-2 text-slate-800 font-medium">{t.assignee.name}</td>
                                  <td className="px-3 py-2 capitalize text-slate-600 text-[11px]">{t.priority}</td>
                                  <td className="px-3 py-2">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        t.status === 'completed'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : t.status === 'in_progress'
                                          ? 'bg-blue-100 text-blue-800'
                                          : t.status === 'blocked'
                                          ? 'bg-rose-100 text-rose-800'
                                          : 'bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      {t.status}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-bold font-mono">{t.progress}%</td>
                                  <td className="px-3 py-2 text-slate-600 font-mono">{t.startDate}</td>
                                  <td className="px-3 py-2 text-slate-600 font-mono">{t.endDate}</td>
                                  <td className="px-3 py-2 text-center font-bold text-indigo-700 font-mono">
                                    {t.workingDays ?? countWorkingDays(t.startDate, t.endDate, project.holidays)}
                                  </td>
                                  <td className="px-3 py-2 text-center text-slate-600 font-mono">
                                    {Math.max(1, diffDays(t.startDate, t.endDate) + 1)}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 truncate max-w-[150px]">
                                    {t.deliverable || '—'}
                                  </td>
                                  {includeExcelGanttMatrix && (
                                    <td className="px-3 py-2 bg-emerald-50/40 text-emerald-900 text-[10px] font-mono">
                                      {t.isMilestone ? '◆ HITO' : `█ ${t.progress}%`}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activeExcelPreviewTab === 'team' && (
                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-200">
                          <thead className="bg-slate-100 text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2">Responsable</th>
                              <th className="px-3 py-2">Rol / Cargo</th>
                              <th className="px-3 py-2">Total Tareas</th>
                              <th className="px-3 py-2">Completadas</th>
                              <th className="px-3 py-2">En Progreso</th>
                              <th className="px-3 py-2">Avance Promedio</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {(project.assignees || []).map((a) => {
                              const aTasks = project.tasks.filter((t) => t.assignee.id === a.id);
                              const completed = aTasks.filter((t) => t.status === 'completed').length;
                              const inProg = aTasks.filter((t) => t.status === 'in_progress').length;
                              const avg =
                                aTasks.length > 0
                                  ? Math.round(aTasks.reduce((sum, t) => sum + t.progress, 0) / aTasks.length)
                                  : 0;
                              return (
                                <tr key={a.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-bold text-slate-900">{a.name}</td>
                                  <td className="px-3 py-2 text-slate-600">{a.role}</td>
                                  <td className="px-3 py-2 font-bold">{aTasks.length}</td>
                                  <td className="px-3 py-2 text-emerald-700 font-bold">{completed}</td>
                                  <td className="px-3 py-2 text-blue-700 font-bold">{inProg}</td>
                                  <td className="px-3 py-2 font-bold text-indigo-700">{avg}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activeExcelPreviewTab === 'phases' && (
                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-200">
                          <thead className="bg-slate-100 text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2 w-10">N°</th>
                              <th className="px-3 py-2">Fase</th>
                              <th className="px-3 py-2">Tareas</th>
                              <th className="px-3 py-2">Hitos</th>
                              <th className="px-3 py-2">Completadas</th>
                              <th className="px-3 py-2">Avance Promedio</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {project.phases.map((p, idx) => {
                              const pTasks = project.tasks.filter((t) => t.phaseId === p.id);
                              const milestones = pTasks.filter((t) => t.isMilestone).length;
                              const comp = pTasks.filter((t) => t.status === 'completed').length;
                              const avg =
                                pTasks.length > 0
                                  ? Math.round(pTasks.reduce((sum, t) => sum + t.progress, 0) / pTasks.length)
                                  : 0;
                              return (
                                <tr key={p.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-bold text-slate-500">{idx + 1}</td>
                                  <td className="px-3 py-2 font-bold text-slate-900">{p.name}</td>
                                  <td className="px-3 py-2">{pTasks.length}</td>
                                  <td className="px-3 py-2 text-amber-600 font-bold">{milestones}</td>
                                  <td className="px-3 py-2 text-emerald-700 font-bold">{comp}</td>
                                  <td className="px-3 py-2 font-bold text-indigo-700">{avg}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activeExcelPreviewTab === 'holidays' && (
                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-200">
                          <thead className="bg-slate-100 text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2">Fecha</th>
                              <th className="px-3 py-2">Nombre del Feriado</th>
                              <th className="px-3 py-2">Descripción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {(project.holidays || []).map((h) => (
                              <tr key={h.id} className="hover:bg-slate-50 font-mono text-[11px]">
                                <td className="px-3 py-2 font-bold text-slate-900">{h.date}</td>
                                <td className="px-3 py-2 font-sans font-semibold text-rose-700">{h.name}</td>
                                <td className="px-3 py-2 font-sans text-slate-600">{h.description || 'Feriado'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-4 md:p-8 flex items-start justify-center">
                {/* Scaled Preview Box */}
                <div
                  style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.15s ease-out',
                  }}
                  className="shrink-0 shadow-2xl rounded-xl overflow-hidden bg-white border border-slate-300"
                >
                {/* 
                  The EXACT DOM Node that gets captured into Image / PDF!
                  It has full width, zero scrollbars, white background, and crisp layout.
                */}
                <div
                  ref={exportContainerRef}
                  id="gantt-export-canvas"
                  style={{
                    width: totalCalculatedWidth,
                    backgroundColor: '#ffffff',
                  }}
                  className="flex flex-col bg-white text-slate-800 select-none"
                >
                  {/* Executive Header */}
                  {includeHeader && (
                    <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white border-b-2 border-indigo-500 flex flex-col gap-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                              Cronograma de Proyecto
                            </span>
                            <span className="text-xs text-slate-400">
                              Cliente: <strong className="text-slate-200">{project.client}</strong>
                            </span>
                          </div>
                          <h1 className="text-2xl font-black tracking-tight text-white">{project.title}</h1>
                        </div>

                        {/* Right Header Metadata */}
                        <div className="text-right text-xs space-y-1">
                          <div>
                            <span className="text-slate-400">Director de Proyecto: </span>
                            <strong className="text-white">{project.manager}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Fecha de Emisión: </span>
                            <strong className="text-slate-200">{formatDateReadable(toISODate(new Date()))}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Plazo Total: </span>
                            <span className="text-emerald-400 font-bold">
                              {stats.workingDaysCount} días hábiles
                            </span>{' '}
                            <span className="text-slate-400">({diffDays(project.startDate, project.targetEndDate) + 1} días calendario)</span>
                          </div>
                        </div>
                      </div>

                      {/* Executive KPIs Strip */}
                      <div className="grid grid-cols-5 gap-3 pt-3 border-t border-slate-700/60">
                        <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700">
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Avance Global</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-lg font-black text-indigo-400">{stats.totalProgress}%</span>
                            <div className="flex-1 bg-slate-700 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-indigo-500 h-full rounded-full"
                                style={{ width: `${stats.totalProgress}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700">
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Tareas</span>
                          <p className="text-lg font-black text-white mt-0.5">{stats.total}</p>
                        </div>

                        <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700">
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Completadas</span>
                          <p className="text-lg font-black text-emerald-400 mt-0.5">{stats.completed}</p>
                        </div>

                        <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700">
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">En Progreso</span>
                          <p className="text-lg font-black text-amber-400 mt-0.5">{stats.inProgress}</p>
                        </div>

                        <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700">
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Hitos Clave</span>
                          <p className="text-lg font-black text-indigo-300 mt-0.5">{stats.milestones}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Main Gantt Body: Left Table + Right Timeline */}
                  <div className="flex overflow-visible relative">
                    {/* Left WBS Table */}
                    {includeWbsTable && (
                      <div
                        style={{ width: WBS_TABLE_WIDTH }}
                        className="shrink-0 flex flex-col border-r border-slate-200 bg-white"
                      >
                        {/* Table Header */}
                        <div
                          style={{ height: HEADER_HEIGHT }}
                          className="flex items-center justify-between px-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700"
                        >
                          <div className="flex items-center gap-2">
                            <span>WBS / Actividad</span>
                          </div>
                          <div className="flex items-center gap-4 text-slate-500 text-[11px]">
                            <span>Dur.</span>
                            <span>Prog.</span>
                            <span>Resp.</span>
                          </div>
                        </div>

                        {/* Table Rows */}
                        <div className="flex flex-col">
                          {visibleRows.map((row, idx) => {
                            if (row.type === 'phase') {
                              return (
                                <div
                                  key={`exp-phase-${row.phase.id}`}
                                  style={{ height: row.height }}
                                  className="flex items-center justify-between px-3 border-b border-slate-200 bg-slate-100/90 text-slate-900 font-bold text-xs"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="font-mono text-[10px] text-slate-500">{row.wbsIndex}</span>
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: row.phase.color }}
                                    />
                                    <span className="truncate">{row.phase.name}</span>
                                  </div>
                                  <span className="text-[10px] text-slate-500 font-normal">
                                    {project.tasks.filter((t) => t.phaseId === row.phase.id).length} tareas
                                  </span>
                                </div>
                              );
                            }

                            if (!row.task) return null;
                            const task = row.task;
                            const isCritical = includeCriticalPath && criticalTaskIds.has(task.id);
                            const workingDays = countWorkingDays(task.startDate, task.endDate, project.holidays);

                            return (
                              <div
                                key={`exp-task-${task.id}`}
                                style={{ height: row.height }}
                                className={`flex items-center justify-between px-3 border-b border-slate-100 text-xs ${
                                  isCritical ? 'bg-rose-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2 pl-2">
                                  <span className="font-mono text-[10px] text-slate-400 w-6 shrink-0">
                                    {row.wbsIndex}
                                  </span>
                                  {task.isMilestone ? (
                                    <Flag className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                  ) : (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ backgroundColor: task.color || row.phase.color }}
                                    />
                                  )}
                                  <span className="truncate font-medium text-slate-800" title={task.name}>
                                    {task.name}
                                  </span>
                                </div>

                                <div className="flex items-center gap-3 shrink-0 text-slate-500 text-[11px]">
                                  <span className="w-8 text-right font-medium">
                                    {task.isMilestone ? 'Hito' : `${workingDays}d`}
                                  </span>
                                  <span className="w-7 text-right font-bold text-slate-700">
                                    {task.progress}%
                                  </span>
                                  <div
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0 shadow-2xs"
                                    style={{ backgroundColor: task.assignee.avatarColor }}
                                    title={task.assignee.name}
                                  >
                                    {task.assignee.name.charAt(0)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Right Timeline Canvas */}
                    <div
                      style={{
                        width: bounds.totalDays * dayWidth,
                      }}
                      className="relative bg-white flex flex-col"
                    >
                      {/* Timeline Header */}
                      <div
                        style={{ height: HEADER_HEIGHT }}
                        className="flex flex-col bg-slate-50 border-b border-slate-200"
                      >
                        {/* Month Row */}
                        <div className="flex border-b border-slate-200/80 h-6">
                          {monthHeaders.map((m, idx) => (
                            <div
                              key={idx}
                              style={{ width: m.daysCount * dayWidth }}
                              className="flex items-center px-2 text-[10px] font-bold text-slate-700 tracking-wide border-r border-slate-200 truncate uppercase bg-slate-100"
                            >
                              {m.label}
                            </div>
                          ))}
                        </div>

                        {/* Day / Date Row */}
                        <div className="flex h-7">
                          {daysArray.map((date, idx) => {
                            const isWknd = isWeekend(date);
                            const hol = getHoliday(date, project.holidays);
                            const isNonWork = isWknd || !!hol;
                            const isTday = isToday(date);

                            return (
                              <div
                                key={idx}
                                style={{ width: dayWidth }}
                                className={`flex flex-col items-center justify-center border-r border-slate-200/50 text-[10px] ${
                                  highlightNonWorkingDays && isNonWork
                                    ? 'bg-slate-200/60 font-medium text-slate-500'
                                    : isTday
                                    ? 'bg-indigo-100/70 font-bold text-indigo-700'
                                    : 'text-slate-600'
                                }`}
                              >
                                {zoom === 'day' ? (
                                  <>
                                    <span className="text-[8px] leading-none text-slate-400">{getDayName(date).charAt(0)}</span>
                                    <span className="leading-tight font-semibold">{date.getDate()}</span>
                                  </>
                                ) : zoom === 'week' ? (
                                  <span>{date.getDay() === 1 ? date.getDate() : ''}</span>
                                ) : (
                                  <span>{date.getDate() === 1 ? '1' : ''}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Timeline Body & Bars */}
                      <div
                        style={{ height: totalContentHeight }}
                        className="relative"
                      >
                        {/* Vertical Grid Columns */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {daysArray.map((date, idx) => {
                            const isWknd = isWeekend(date);
                            const hol = getHoliday(date, project.holidays);
                            const isNonWork = isWknd || !!hol;
                            const isTday = isToday(date);

                            return (
                              <div
                                key={idx}
                                style={{ width: dayWidth }}
                                className={`h-full border-r border-slate-100 ${
                                  highlightNonWorkingDays && isNonWork
                                    ? 'bg-slate-100/60'
                                    : isTday
                                    ? 'bg-indigo-50/30'
                                    : ''
                                }`}
                              />
                            );
                          })}
                        </div>

                        {/* Today Marker Line */}
                        {(() => {
                          const todayStr = toISODate(new Date());
                          if (todayStr >= timelineStartDateStr && todayStr <= timelineEndDateStr) {
                            const todayDays = diffDays(timelineStartDateStr, todayStr);
                            const todayX = todayDays * dayWidth + dayWidth / 2;
                            return (
                              <div
                                style={{ left: todayX }}
                                className="absolute top-0 bottom-0 z-20 pointer-events-none flex flex-col items-center"
                              >
                                <div className="w-0.5 h-full bg-indigo-600 border-dashed" />
                                <div className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[8px] font-bold absolute -top-4">
                                  Hoy
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* SVG Dependency Lines */}
                        {renderDependencyLines()}

                        {/* Task Rows & Bars */}
                        {visibleRows.map((row) => {
                          if (row.type === 'phase') {
                            return (
                              <div
                                key={`timeline-phase-${row.phase.id}`}
                                style={{ height: row.height }}
                                className="border-b border-slate-200/80 bg-slate-50/50"
                              />
                            );
                          }

                          if (!row.task) return null;
                          const task = row.task;
                          const startDays = diffDays(timelineStartDateStr, task.startDate);
                          const durationDays = Math.max(1, diffDays(task.startDate, task.endDate) + 1);
                          const leftPx = startDays * dayWidth;
                          const widthPx = Math.max(dayWidth * 0.8, durationDays * dayWidth);
                          const isCritical = includeCriticalPath && criticalTaskIds.has(task.id);
                          const taskColor = task.color || row.phase.color || '#4f46e5';

                          return (
                            <div
                              key={`timeline-task-${task.id}`}
                              style={{ height: row.height }}
                              className="border-b border-slate-100 relative flex items-center"
                            >
                              {task.isMilestone ? (
                                // Milestone Diamond
                                <div
                                  style={{
                                    left: leftPx + dayWidth / 2 - 11,
                                  }}
                                  className="absolute z-15 flex items-center gap-1.5"
                                >
                                  <div
                                    className="w-5 h-5 rounded-xs transform rotate-45 shadow-sm border-2 border-white"
                                    style={{ backgroundColor: taskColor }}
                                  />
                                  <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap pl-1 drop-shadow-2xs">
                                    {task.name} ({formatDateShort(task.startDate)})
                                  </span>
                                </div>
                              ) : (
                                // Regular Gantt Bar
                                <div
                                  className={`absolute z-15 rounded-lg flex items-center px-2 shadow-xs border ${
                                    isCritical
                                      ? 'border-rose-500 ring-2 ring-rose-400/40'
                                      : 'border-white/60'
                                  }`}
                                  style={{
                                    left: leftPx,
                                    width: widthPx,
                                    height: 24,
                                    backgroundColor: taskColor,
                                  }}
                                >
                                  {/* Progress Fill inside bar */}
                                  <div
                                    className="absolute inset-y-0 left-0 bg-black/25 rounded-l-lg"
                                    style={{ width: `${task.progress}%` }}
                                  />

                                  {/* Task Label on bar or beside bar */}
                                  <span className="relative z-10 text-[11px] font-bold text-white truncate drop-shadow-xs">
                                    {task.name}
                                  </span>

                                  {/* Progress Badge */}
                                  {widthPx > 60 && (
                                    <span className="relative z-10 ml-auto text-[9px] font-extrabold text-white/90 drop-shadow-xs pl-1">
                                      {task.progress}%
                                    </span>
                                  )}

                                  {/* Critical badge */}
                                  {isCritical && (
                                    <div className="absolute -top-2.5 -right-1 px-1 py-0.2 bg-rose-600 text-white rounded text-[7px] font-extrabold uppercase shadow-xs">
                                      Crítica
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Executive Legend Footer */}
                  {includeLegend && (
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="font-bold text-slate-700">Leyenda:</span>

                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-3 rounded-md bg-indigo-600" />
                          <span>Tarea Planificada</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <div className="w-3.5 h-3 rounded-md bg-indigo-600 relative overflow-hidden">
                            <div className="absolute inset-y-0 left-0 w-1/2 bg-black/30" />
                          </div>
                          <span>En Progreso (% sombreado)</span>
                        </div>

                        {includeCriticalPath && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-3.5 h-3 rounded-md bg-rose-500 ring-2 ring-rose-400/40" />
                            <span className="font-bold text-rose-700">Ruta Crítica (CPM)</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-xs transform rotate-45 bg-indigo-600" />
                          <span>Hito de Proyecto</span>
                        </div>

                        {includeDependencies && (
                          <div className="flex items-center gap-1.5">
                            <LinkIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span>Flechas de Precedencia</span>
                          </div>
                        )}

                        {highlightNonWorkingDays && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-3.5 h-3 rounded-sm bg-slate-200 border border-slate-300" />
                            <span>Fin de Semana / Feriado</span>
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400">
                        Generado por <strong>Gantt Planner Pro</strong> • {formatDateReadable(toISODate(new Date()))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {format === 'xlsx' ? (
              <span className="text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Libro nativo Excel OpenXML (.xlsx) con 4 hojas</span>
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCopyToClipboard}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  title="Copiar imagen directamente al portapapeles para pegar con Ctrl+V"
                >
                  {copiedSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-500" />
                      <span>Copiar al Portapapeles</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={isExporting}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  title="Imprimir directamente desde el navegador"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  <span>Imprimir</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            {format === 'xlsx' ? (
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={isExporting}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{exportStepText || 'Generando Excel...'}</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Descargar Libro Excel (.xlsx)</span>
                  </>
                )}
              </button>
            ) : format === 'pdf' ? (
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExporting}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{exportStepText || 'Exportando PDF...'}</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>Descargar Documento PDF</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleExportImage(format as 'png' | 'jpeg')}
                disabled={isExporting}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{exportStepText || 'Exportando Imagen...'}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Descargar Imagen {format.toUpperCase()}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
