import React, { useState, useMemo, useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import { Project, Task, ConsultantProposal, Phase, Assignee, Holiday } from '../types';
import {
  diffDays,
  parseDate,
  toISODate,
  formatDateShort,
  formatDateReadable,
  countWorkingDays,
  getHolidaysInRange,
} from '../utils/dateUtils';
import {
  TaskComparisonResult,
  ScheduleComparisonStats,
  compareSchedules,
  calculateComparisonStats,
  exportComparisonToExcel,
  createDefaultConsultantProject,
} from '../utils/consultantPresets';
import { ComparisonGanttExportModal } from './ComparisonGanttExportModal';
import {
  GitCompare,
  Scale,
  Calendar,
  CalendarDays,
  Check,
  CheckCheck,
  AlertCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  Download,
  Upload,
  RotateCcw,
  Pencil,
  Edit2,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  Flag,
  Search,
  Filter,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownRight,
  Equal,
  Sliders,
  Layers,
  X,
  Plus,
  Trash2,
  HelpCircle,
} from 'lucide-react';

interface ScheduleComparisonViewProps {
  currentProject: Project;
  consultantProposal: ConsultantProposal;
  onUpdateConsultantProposal: (proposal: ConsultantProposal) => void;
  onAdoptConsultantTask: (taskId: string, proposedTask: Task) => void;
  onAdoptAllConsultantTasks: (proposedTasks: Task[]) => void;
  onResetConsultantProposal: () => void;
  onUpdateCurrentTask?: (task: Task) => void;
  onEditCurrentTask?: (task: Task) => void;
  onSyncWithCurrent?: (baselineOnly?: boolean) => void;
}

type ComparisonDisplayMode = 'dual_gantt' | 'diff_matrix' | 'milestones_summary';

export const ScheduleComparisonView: React.FC<ScheduleComparisonViewProps> = ({
  currentProject,
  consultantProposal,
  onUpdateConsultantProposal,
  onAdoptConsultantTask,
  onAdoptAllConsultantTasks,
  onResetConsultantProposal,
  onUpdateCurrentTask,
  onEditCurrentTask,
  onSyncWithCurrent,
}) => {
  const [displayMode, setDisplayMode] = useState<ComparisonDisplayMode>('dual_gantt');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'delayed' | 'accelerated' | 'aligned' | 'diffs_only' | 'omitted_only'>('all');
  const [onlyMilestones, setOnlyMilestones] = useState(false);

  const dualGanttContainerRef = useRef<HTMLDivElement>(null);

  // Modals & Drawers
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingConsultantTask, setEditingConsultantTask] = useState<Task | null>(null);
  const [isAdoptAllConfirmOpen, setIsAdoptAllConfirmOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const consultantProject = consultantProposal.project;
  const holidays = currentProject.holidays || [];
  const phases = currentProject.phases || [];

  // 1. Compute task comparisons and high-level statistics
  const allComparisons = useMemo(() => {
    return compareSchedules(currentProject, consultantProject);
  }, [currentProject, consultantProject]);

  const stats: ScheduleComparisonStats = useMemo(() => {
    return calculateComparisonStats(currentProject, consultantProject);
  }, [currentProject, consultantProject]);

  // 2. Filter comparisons
  const filteredComparisons = useMemo(() => {
    return allComparisons.filter((item) => {
      const search = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !search ||
        item.taskName.toLowerCase().includes(search) ||
        item.currentTask.assignee.name.toLowerCase().includes(search) ||
        item.phaseName.toLowerCase().includes(search);

      const matchesPhase = selectedPhase === 'all' || item.phaseId === selectedPhase;
      const matchesMilestone = !onlyMilestones || item.isMilestone;

      let matchesStatus = true;
      if (statusFilter === 'diffs_only') {
        matchesStatus = item.status !== 'aligned';
      } else if (statusFilter === 'omitted_only') {
        matchesStatus = item.status === 'omitted_by_consultant';
      } else if (statusFilter === 'delayed') {
        matchesStatus = item.status === 'delayed';
      } else if (statusFilter === 'accelerated') {
        matchesStatus = item.status === 'accelerated';
      } else if (statusFilter === 'aligned') {
        matchesStatus = item.status === 'aligned';
      }

      return matchesSearch && matchesPhase && matchesMilestone && matchesStatus;
    });
  }, [allComparisons, searchTerm, selectedPhase, statusFilter, onlyMilestones]);

  // 3. Calculate global timeline boundaries for the Dual Gantt view
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

    // Snap to Monday of start week (with 2 days buffer)
    const sDate = parseDate(minD);
    sDate.setDate(sDate.getDate() - 2);
    const dayOfWeek = sDate.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    sDate.setDate(sDate.getDate() - diffToMonday);

    // Snap to Sunday of end week (with 5 days buffer)
    const eDate = parseDate(maxD);
    eDate.setDate(eDate.getDate() + 5);
    const endDayOfWeek = eDate.getDay();
    const diffToSunday = (7 - endDayOfWeek) % 7;
    eDate.setDate(eDate.getDate() + diffToSunday);

    const sStr = toISODate(sDate);
    const eStr = toISODate(eDate);
    const tDays = Math.max(14, diffDays(sStr, eStr) + 1);

    // Generate Month groups
    const months: {
      key: string;
      label: string;
      startStr: string;
      endStr: string;
      dayCount: number;
      widthPercent: number;
    }[] = [];

    const curr = new Date(sDate);
    while (curr <= eDate) {
      const year = curr.getFullYear();
      const month = curr.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthName = curr.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

      // First day of this month within timeline
      const mStart = new Date(Math.max(curr.getTime(), new Date(year, month, 1).getTime()));
      // Last day of this month within timeline
      const mEnd = new Date(Math.min(eDate.getTime(), new Date(year, month + 1, 0).getTime()));

      const mDays = Math.max(1, diffDays(toISODate(mStart), toISODate(mEnd)) + 1);
      const widthPct = (mDays / tDays) * 100;

      months.push({
        key: monthKey,
        label: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        startStr: toISODate(mStart),
        endStr: toISODate(mEnd),
        dayCount: mDays,
        widthPercent: widthPct,
      });

      // Advance to next month 1st
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

  // Helper to calculate percentage position in timeline
  const getTimelineBarCoords = (startDateStr: string, endDateStr: string) => {
    if (!startDateStr || !endDateStr) return { left: '0%', width: '0%' };
    const startOffset = diffDays(timelineStartStr, startDateStr);
    const duration = Math.max(1, diffDays(startDateStr, endDateStr) + 1);

    const leftPct = Math.max(0, (startOffset / totalDays) * 100);
    const widthPct = Math.min(100 - leftPct, (duration / totalDays) * 100);

    return {
      left: `${leftPct}%`,
      width: `${Math.max(0.8, widthPct)}%`,
    };
  };

  // Handler: Export comparison to Excel
  const handleExportComparisonExcel = async () => {
    try {
      setIsExportingExcel(true);
      showNotice('Generando libro Excel con gráfico visual y matriz...');

      let chartImg: string | undefined;
      if (dualGanttContainerRef.current) {
        try {
          chartImg = await htmlToImage.toPng(dualGanttContainerRef.current, {
            backgroundColor: '#ffffff',
            pixelRatio: 1.8,
            cacheBust: true,
            style: {
              transform: 'none',
              boxShadow: 'none',
            },
          });
        } catch (imgErr) {
          console.warn('No se pudo capturar contenedor para Excel:', imgErr);
        }
      }

      const filename = await exportComparisonToExcel(currentProject, consultantProposal, chartImg);
      showNotice(`Reporte comparativo descargado con éxito: ${filename}`);
    } catch (err) {
      console.error('Error exportando comparativa:', err);
      showNotice('Ocurrió un error al generar el archivo Excel comparativo.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Handler: Export consultant proposal as JSON
  const handleDownloadProposalJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(consultantProposal, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `propuesta_consultora_${toISODate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showNotice('Archivo JSON de la propuesta descargado.');
  };

  // Handler: Import consultant proposal from JSON
  const handleImportProposalJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.project && parsed.project.tasks) {
          onUpdateConsultantProposal(parsed);
          showNotice('Propuesta de la consultora importada con éxito.');
        } else if (parsed.tasks && parsed.phases) {
          // It's a standard project JSON
          onUpdateConsultantProposal({
            id: `prop-${Date.now()}`,
            consultantName: parsed.client || 'Consultora Externa',
            version: 'Propuesta Importada',
            proposalDate: toISODate(new Date()),
            notes: 'Cargada desde archivo externo de proyecto.',
            project: parsed,
          });
          showNotice('Cronograma importado como propuesta de la consultora.');
        } else {
          showNotice('El archivo JSON no tiene la estructura de cronograma válida.');
        }
      } catch {
        showNotice('Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file, 'UTF-8');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Helper notification toast
  const showNotice = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Save changes to a specific consultant task
  const handleSaveConsultantTask = (updatedTask: Task) => {
    const updatedTasks = consultantProject.tasks.map((t) =>
      t.id === updatedTask.id ? updatedTask : t
    );
    onUpdateConsultantProposal({
      ...consultantProposal,
      project: {
        ...consultantProject,
        tasks: updatedTasks,
      },
    });
    setEditingConsultantTask(null);
    showNotice(`Fecha propuesta actualizada para "${updatedTask.name}".`);
  };

  // Toggle whether a task is considered by consultant
  const handleToggleTaskOmittedByConsultant = (item: TaskComparisonResult) => {
    const isNowOmitted = !item.currentTask.notConsideredByConsultant;
    if (onUpdateCurrentTask) {
      onUpdateCurrentTask({
        ...item.currentTask,
        notConsideredByConsultant: isNowOmitted,
      });
    }
    const updatedConsultantTasks = consultantProject.tasks.map((t) =>
      t.id === item.taskId ? { ...t, notConsideredByConsultant: isNowOmitted } : t
    );
    onUpdateConsultantProposal({
      ...consultantProposal,
      project: {
        ...consultantProject,
        tasks: updatedConsultantTasks,
      },
    });
    showNotice(
      isNowOmitted
        ? `"${item.taskName}" marcada como NO considerada por la consultora (Alcance interno).`
        : `"${item.taskName}" reintegrada al alcance de la consultora.`
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-0 select-none">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl border border-slate-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* 1. Header Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md">
            <GitCompare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                Comparativa de Cronogramas
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                Interno vs. Consultora
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-medium text-slate-600">
                {consultantProposal.consultantName} ({consultantProposal.version})
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Analiza desviaciones de plazos, fechas de Go-Live, impacto en hitos y justificaciones de la consultora externa.
            </p>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Modes */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setDisplayMode('dual_gantt')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                displayMode === 'dual_gantt'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Gantt Dual</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('diff_matrix')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                displayMode === 'diff_matrix'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Matriz de Desviaciones</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('milestones_summary')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                displayMode === 'milestones_summary'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              <Flag className="w-3.5 h-3.5 text-purple-600" />
              <span>Hitos Clave</span>
            </button>
          </div>

          {/* Estado de sincronización en vivo del Cronograma Actual */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50/90 border border-emerald-200 rounded-xl shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Cronograma Actual ({currentProject.tasks.length} tareas en vivo)</span>
          </div>

          {/* Sincronizar propuesta con el cronograma actual */}
          {onSyncWithCurrent && (
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => onSyncWithCurrent(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                title="Sincronizar y generar propuesta comparativa a partir de las tareas y fechas actuales del cronograma interno"
              >
                <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                <span>Sincronizar con Cronograma Actual</span>
              </button>
              <button
                type="button"
                onClick={() => onSyncWithCurrent(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all cursor-pointer border-l border-slate-200"
                title="Establecer el cronograma actual como Línea Base Contractual fija"
              >
                <span>Fijar Línea Base</span>
              </button>
            </div>
          )}

          {/* Edit Proposal Settings Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all cursor-pointer shadow-2xs"
            title="Ajustar nombre de la consultora, versión y notas técnicas"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-500" />
            <span>Ajustar Propuesta</span>
          </button>

          {/* Export Visual Gantt Comparison (PDF / PNG / JPEG) */}
          <button
            type="button"
            id="btn-open-comparison-gantt-export-modal"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-xl transition-all cursor-pointer shadow-xs hover:shadow-md"
            title="Exportar el diagrama de Gantt comparativo visual tal como está en pantalla (PDF, PNG, JPEG)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Gantt Comparativo</span>
          </button>

          {/* Export to Excel */}
          <button
            type="button"
            onClick={handleExportComparisonExcel}
            disabled={isExportingExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            title="Descargar reporte comparativo completo en formato Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel (.xlsx)</span>
          </button>

          {/* Adopt All Proposal Button */}
          <button
            type="button"
            onClick={() => setIsAdoptAllConfirmOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all cursor-pointer shadow-xs"
            title="Adoptar todas las fechas propuestas por la consultora en el cronograma actual"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Adoptar Propuesta Completa</span>
          </button>
        </div>
      </div>

      {/* 2. Executive Comparison Banner: KPIs & Delta Highlights */}
      <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-3 overflow-x-auto">
        <div className="flex items-center justify-between gap-4 min-w-max">
          {/* Card 1: Project End Date Delta */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center gap-3 shadow-2xs">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                stats.projectEndDeltaDays > 0
                  ? 'bg-amber-100 text-amber-800'
                  : stats.projectEndDeltaDays < 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {stats.projectEndDeltaDays > 0 ? (
                <ArrowUpRight className="w-5 h-5 text-amber-700" />
              ) : stats.projectEndDeltaDays < 0 ? (
                <ArrowDownRight className="w-5 h-5 text-emerald-700" />
              ) : (
                <Equal className="w-5 h-5 text-slate-500" />
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Fecha Fin de Proyecto
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold text-slate-600 line-through">
                  {formatDateShort(stats.currentEndDate)}
                </span>
                <span className="text-xs font-black text-slate-900">
                  ➔ {formatDateShort(stats.consultantEndDate)}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    stats.projectEndDeltaDays > 0
                      ? 'bg-amber-100 text-amber-800'
                      : stats.projectEndDeltaDays < 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {stats.projectEndDeltaDays > 0
                    ? `+${stats.projectEndDeltaDays}d extensión`
                    : stats.projectEndDeltaDays < 0
                    ? `${stats.projectEndDeltaDays}d adelanto`
                    : 'Alineado'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Total Working Days */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center gap-3 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Días Hábiles de Trabajo
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold text-slate-700">
                  {stats.currentWorkingDays}d (Actual)
                </span>
                <span className="text-slate-300">vs</span>
                <span className="text-xs font-black text-indigo-900">
                  {stats.consultantWorkingDays}d (Propuesto)
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  ({stats.workingDaysDelta > 0 ? `+${stats.workingDaysDelta}d` : `${stats.workingDaysDelta}d`})
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Task Breakdown Counts */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center gap-3 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Estado de Actividades
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs font-bold">
                <span className="text-slate-600" title="Fechas idénticas">
                  ● {stats.alignedCount} coincidentes
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-emerald-700" title="Consultora propone terminar antes">
                  ▼ {stats.acceleratedCount} adelantadas
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-amber-700" title="Consultora propone extender plazo">
                  ▲ {stats.delayedCount} extendidas
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Milestones Impact */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center gap-3 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center font-bold shrink-0">
              <Flag className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Impacto en Hitos Clave
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs">
                <span className="font-bold text-slate-800">
                  {stats.milestonesShiftedCount} de {stats.milestonesCount}
                </span>
                <span className="text-[11px] text-slate-500">
                  hitos con fechas ajustadas
                </span>
              </div>
            </div>
          </div>

          {/* Card 5: Omitted by Consultant (Scope Gap) */}
          <div className="bg-white rounded-xl border border-amber-200 p-2.5 flex items-center gap-3 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-amber-900 tracking-wider">
                Brecha de Alcance
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                <span className="font-bold text-amber-950">
                  {stats.omittedCount}
                </span>
                <span className="text-[11px] text-amber-800 font-medium">
                  {stats.omittedCount === 1 ? 'tarea solo interna' : 'tareas solo internas'}
                </span>
              </div>
            </div>
          </div>

          {/* Proposal Source Management */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-300 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportProposalJSON}
              accept=".json"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Cargar propuesta enviada por la consultora en formato JSON"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Importar JSON</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadProposalJSON}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Descargar respaldo de la propuesta consultora en JSON"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Guardar</span>
            </button>
            <button
              type="button"
              onClick={onResetConsultantProposal}
              className="px-2 py-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg text-xs cursor-pointer"
              title="Restablecer a la propuesta modelo recomendada"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Search & Filters Strip */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar actividad o responsable..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-52"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Phase Filter */}
          <select
            value={selectedPhase}
            onChange={(e) => setSelectedPhase(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-hidden cursor-pointer"
          >
            <option value="all">Todas las Fases ({phases.length})</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                statusFilter === 'all' ? 'bg-white font-bold text-slate-800 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Todas ({allComparisons.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('diffs_only')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                statusFilter === 'diffs_only'
                  ? 'bg-white font-bold text-indigo-700 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              Con Desviaciones ({stats.acceleratedCount + stats.delayedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('delayed')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                statusFilter === 'delayed'
                  ? 'bg-amber-50 font-bold text-amber-800 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              Extendidas ({stats.delayedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('accelerated')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                statusFilter === 'accelerated'
                  ? 'bg-emerald-50 font-bold text-emerald-800 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              Adelantadas ({stats.acceleratedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('omitted_only')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                statusFilter === 'omitted_only'
                  ? 'bg-amber-100 font-bold text-amber-950 shadow-2xs ring-1 ring-amber-300'
                  : stats.omittedCount > 0
                  ? 'text-amber-800 hover:bg-amber-50'
                  : 'text-slate-500'
              }`}
            >
              No Consideradas ({stats.omittedCount})
            </button>
          </div>

          {/* Milestones toggle */}
          <button
            type="button"
            onClick={() => setOnlyMilestones(!onlyMilestones)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              onlyMilestones
                ? 'bg-purple-50 text-purple-800 border-purple-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Flag className="w-3.5 h-3.5 text-purple-600" />
            <span>Solo Hitos</span>
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-xs bg-indigo-600" />
            <span>Cronograma Actual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-xs bg-amber-500" />
            <span>Propuesta Consultora</span>
          </div>
        </div>
      </div>

      {/* 4. Main Body: Display Modes */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* MODE 1: DUAL GANTT TIMELINE */}
        {displayMode === 'dual_gantt' && (
          <div ref={dualGanttContainerRef} className="flex-1 flex overflow-hidden bg-white">
            {/* Left Task Hierarchy Table */}
            <div className="w-[380px] md:w-[420px] shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden z-10 shadow-sm">
              <div className="h-12 px-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider shrink-0">
                <span className="w-10">WBS</span>
                <span className="flex-1 pl-1">Actividad / Tarea</span>
                <span className="w-24 text-right">Desviación Fin</span>
                <span className="w-16 text-center">Acción</span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {phases.map((phase, pIdx) => {
                  const pItems = filteredComparisons.filter((c) => c.phaseId === phase.id);
                  if (pItems.length === 0) return null;

                  return (
                    <div key={`left-phase-${phase.id}`} className="divide-y divide-slate-100">
                      {/* Phase Header */}
                      <div className="h-8 px-3 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between text-xs font-bold text-indigo-950">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-mono text-[10px] text-indigo-700">{pIdx + 1}.0</span>
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: phase.color }}
                          />
                          <span className="truncate uppercase">{phase.name}</span>
                        </div>
                        <span className="text-[10px] text-indigo-700 font-semibold shrink-0">
                          {pItems.length} tareas
                        </span>
                      </div>

                      {/* Task Rows */}
                      {pItems.map((item, tIdx) => {
                        const isHovered = hoveredTaskId === item.taskId;

                        return (
                          <div
                            key={`left-task-${item.taskId}`}
                            onMouseEnter={() => setHoveredTaskId(item.taskId)}
                            onMouseLeave={() => setHoveredTaskId(null)}
                            className={`h-14 px-3 flex items-center justify-between text-xs transition-colors ${
                              isHovered
                                ? 'bg-indigo-50/70'
                                : tIdx % 2 === 0
                                ? 'bg-white'
                                : 'bg-slate-50/40'
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
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-950 border border-amber-300 shrink-0"
                                      title={item.impactDiagnosis}
                                    >
                                      <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                                      No en Consultora
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                  <span>{item.currentTask.assignee.name}</span>
                                  {item.consultantRationale && (
                                    <span
                                      className="text-amber-700 truncate max-w-[140px]"
                                      title={item.consultantRationale}
                                    >
                                      • {item.consultantRationale}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Deviation Badge & Adopt Action */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono text-center w-22 ${
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

                              {/* Toggle Consultant Scope */}
                              <button
                                type="button"
                                onClick={() => handleToggleTaskOmittedByConsultant(item)}
                                className={`p-1 rounded-md transition-colors cursor-pointer ${
                                  item.status === 'omitted_by_consultant'
                                    ? 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                                    : 'text-slate-400 hover:text-amber-700 hover:bg-amber-50'
                                }`}
                                title={
                                  item.status === 'omitted_by_consultant'
                                    ? 'Actividad marcada como NO considerada por consultora. Clic para reintegrar.'
                                    : 'Marcar como NO considerada por la consultora (Alcance solo interno)'
                                }
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </button>

                              {item.status !== 'aligned' && item.status !== 'omitted_by_consultant' ? (
                                <button
                                  type="button"
                                  onClick={() => onAdoptConsultantTask(item.taskId, item.consultantTask)}
                                  className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded-md transition-colors cursor-pointer"
                                  title="Adoptar la fecha propuesta por la consultora para esta tarea"
                                >
                                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                </button>
                              ) : (
                                <div className="w-6" />
                              )}

                              {onEditCurrentTask && (
                                <button
                                  type="button"
                                  onClick={() => onEditCurrentTask(item.currentTask)}
                                  className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                                  title="Editar tarea en el cronograma actual interno"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setEditingConsultantTask(item.consultantTask)}
                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                title="Editar fecha propuesta de la consultora"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Dual Timeline Gantt */}
            <div className="flex-1 overflow-x-auto overflow-y-auto bg-white flex flex-col relative">
              <div className="min-w-full flex flex-col" style={{ width: 'max-content', minWidth: '100%' }}>
                {/* Timeline Header (Months) */}
                <div className="h-12 bg-slate-100 border-b border-slate-200 sticky top-0 z-20 flex shrink-0 shadow-2xs">
                  {timelineMonths.map((m) => (
                    <div
                      key={m.key}
                      style={{ width: `${m.widthPercent}%`, minWidth: '140px' }}
                      className="px-3 border-r border-slate-300 flex flex-col justify-center text-xs font-bold text-slate-800 bg-slate-100/90"
                    >
                      <span>{m.label}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {m.dayCount} días
                      </span>
                    </div>
                  ))}
                </div>

                {/* Timeline Data Tracks */}
                <div className="flex-1 flex flex-col divide-y divide-slate-100 relative">
                  {phases.map((phase) => {
                    const pItems = filteredComparisons.filter((c) => c.phaseId === phase.id);
                    if (pItems.length === 0) return null;

                    return (
                      <div key={`timeline-phase-${phase.id}`} className="divide-y divide-slate-100">
                        {/* Phase Header Strip */}
                        <div className="h-8 bg-indigo-50/40 relative flex items-center">
                          <div className="absolute inset-0 flex pointer-events-none">
                            {timelineMonths.map((m) => (
                              <div
                                key={`bg-p-${m.key}`}
                                style={{ width: `${m.widthPercent}%`, minWidth: '140px' }}
                                className="border-r border-slate-200/40 h-full"
                              />
                            ))}
                          </div>
                        </div>

                        {/* Task Dual Tracks */}
                        {pItems.map((item, tIdx) => {
                          const isHovered = hoveredTaskId === item.taskId;
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
                              key={`timeline-task-${item.taskId}`}
                              onMouseEnter={() => setHoveredTaskId(item.taskId)}
                              onMouseLeave={() => setHoveredTaskId(null)}
                              className={`h-14 relative flex flex-col justify-center transition-colors ${
                                isHovered
                                  ? 'bg-indigo-50/60'
                                  : tIdx % 2 === 0
                                  ? 'bg-white'
                                  : 'bg-slate-50/40'
                              }`}
                            >
                              {/* Background month grid lines */}
                              <div className="absolute inset-0 flex pointer-events-none">
                                {timelineMonths.map((m) => (
                                  <div
                                    key={`bg-m-${m.key}`}
                                    style={{ width: `${m.widthPercent}%`, minWidth: '140px' }}
                                    className="border-r border-slate-200/30 h-full"
                                  />
                                ))}
                              </div>

                              {/* TRACK 1: Cronograma Actual (Top Bar - Indigo) */}
                              <div className="h-5 relative mb-1 flex items-center">
                                {item.isMilestone ? (
                                  <div
                                    style={{ left: currCoords.left }}
                                    onClick={() => onEditCurrentTask?.(item.currentTask)}
                                    className={`absolute -ml-2.5 z-10 flex items-center gap-1 ${onEditCurrentTask ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                                    title={`Hito Actual: ${formatDateReadable(item.currentTask.startDate)} ${item.status === 'omitted_by_consultant' ? '[Solo Interna]' : ''} ${onEditCurrentTask ? '• Haz clic para editar hito actual' : ''}`}
                                  >
                                    <div className={`w-5 h-5 bg-indigo-600 rotate-45 rounded-xs shadow-xs flex items-center justify-center text-white ${item.status === 'omitted_by_consultant' ? 'ring-2 ring-amber-400' : ''}`}>
                                      <Flag className="w-2.5 h-2.5 -rotate-45" />
                                    </div>
                                    <span className={`text-[10px] font-bold px-1 py-0.2 rounded border shadow-2xs whitespace-nowrap ${
                                      item.status === 'omitted_by_consultant'
                                        ? 'text-amber-950 bg-amber-50 border-amber-300'
                                        : 'text-indigo-900 bg-white/90 border-indigo-200'
                                    }`}>
                                      {item.status === 'omitted_by_consultant' ? 'Actual (Solo Interna): ' : 'Actual: '}
                                      {formatDateShort(item.currentTask.startDate)}
                                    </span>
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      left: currCoords.left,
                                      width: currCoords.width,
                                      backgroundImage: item.status === 'omitted_by_consultant'
                                        ? 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.25), rgba(245, 158, 11, 0.25) 5px, transparent 5px, transparent 10px)'
                                        : undefined,
                                    }}
                                    onClick={() => onEditCurrentTask?.(item.currentTask)}
                                    className={`absolute h-4.5 rounded-md text-white flex items-center px-2 text-[10px] font-bold shadow-xs truncate z-10 transition-all ${
                                      item.status === 'omitted_by_consultant'
                                        ? 'bg-indigo-700 border border-amber-400'
                                        : 'bg-indigo-600 hover:bg-indigo-700'
                                    } ${onEditCurrentTask ? 'cursor-pointer hover:ring-2 hover:ring-indigo-300 hover:shadow-sm' : ''}`}
                                    title={`Cronograma Actual: ${formatDateShort(item.currentTask.startDate)} al ${formatDateShort(item.currentTask.endDate)} (${item.currentTask.workingDays || '-'}d) ${item.status === 'omitted_by_consultant' ? '[Solo Interna - Fuera de alcance consultora]' : ''} ${onEditCurrentTask ? '• Haz clic para editar tarea actual' : ''}`}
                                  >
                                    <span className="truncate">
                                      {item.status === 'omitted_by_consultant' ? '⚡ Actual (Solo Interna): ' : 'Actual: '}
                                      {formatDateShort(item.currentTask.startDate)} – {formatDateShort(item.currentTask.endDate)}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* TRACK 2: Propuesta Consultora (Bottom Bar - Amber/Purple or Omitted Dashed) */}
                              <div className="h-5 relative flex items-center">
                                {item.status === 'omitted_by_consultant' ? (
                                  <div
                                    style={{ left: currCoords.left, width: currCoords.width }}
                                    className="absolute h-4.5 rounded-md border-2 border-dashed border-amber-400 bg-amber-50/90 text-amber-950 flex items-center px-2 text-[10px] font-bold z-10 truncate shadow-2xs"
                                    title={`Actividad fuera del alcance propuesto por la consultora: ${item.consultantExclusionReason || 'Solo equipo interno'}`}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-600 mr-1 shrink-0" />
                                    <span className="truncate">Consultora: No considerada en propuesta</span>
                                  </div>
                                ) : item.isMilestone ? (
                                  <div
                                    style={{ left: consCoords.left }}
                                    className="absolute -ml-2.5 z-10 flex items-center gap-1"
                                    title={`Hito Propuesto por Consultora: ${formatDateReadable(item.consultantTask.startDate)}`}
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
                                    title={`Propuesta Consultora: ${formatDateShort(item.consultantTask.startDate)} al ${formatDateShort(item.consultantTask.endDate)} (${item.consultantTask.workingDays || '-'}d)`}
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
          </div>
        )}

        {/* MODE 2: DETAILED DEVIATION MATRIX TABLE */}
        {displayMode === 'diff_matrix' && (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Matriz Detallada de Variaciones y Desviaciones
                  </h3>
                  <p className="text-xs text-slate-500">
                    Comparación exhaustiva de plazos, días hábiles, entregables y recomendaciones técnicas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportComparisonExcel}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Descargar Tabla en Excel</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-slate-200">
                  <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="px-3.5 py-3 w-14">WBS</th>
                      <th className="px-3.5 py-3">Actividad / Tarea</th>
                      <th className="px-3.5 py-3">Fase</th>
                      <th className="px-3.5 py-3">Responsable</th>
                      <th className="px-3.5 py-3 text-center bg-indigo-50/60">Inicio Actual</th>
                      <th className="px-3.5 py-3 text-center bg-indigo-50/60">Fin Actual</th>
                      <th className="px-3.5 py-3 text-center bg-amber-50/60">Inicio Consultora</th>
                      <th className="px-3.5 py-3 text-center bg-amber-50/60">Fin Consultora</th>
                      <th className="px-3.5 py-3 text-center">Desviación Fin</th>
                      <th className="px-3.5 py-3 text-center">Días Háb.</th>
                      <th className="px-3.5 py-3">Justificación Consultora</th>
                      <th className="px-3.5 py-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredComparisons.map((item, idx) => {
                      return (
                        <tr
                          key={`matrix-row-${item.taskId}`}
                          className={`hover:bg-slate-50 transition-colors ${
                            idx % 2 === 1 ? 'bg-slate-50/30' : ''
                          }`}
                        >
                          <td className="px-3.5 py-3 font-mono font-bold text-slate-400">
                            {item.taskId}
                          </td>
                          <td className="px-3.5 py-3 font-semibold text-slate-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.isMilestone && <Flag className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                              <span>{item.taskName}</span>
                              {item.status === 'omitted_by_consultant' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-950 border border-amber-300 shrink-0">
                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                                  No en Consultora
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3.5 py-3 text-slate-600">{item.phaseName}</td>
                          <td className="px-3.5 py-3 text-slate-700 font-medium">
                            {item.currentTask.assignee.name}
                          </td>
                          <td className="px-3.5 py-3 text-center font-mono text-indigo-900 bg-indigo-50/30">
                            {formatDateShort(item.currentTask.startDate)}
                          </td>
                          <td className="px-3.5 py-3 text-center font-mono font-bold text-indigo-900 bg-indigo-50/30">
                            {formatDateShort(item.currentTask.endDate)}
                          </td>
                          <td className="px-3.5 py-3 text-center font-mono text-amber-900 bg-amber-50/30">
                            {item.status === 'omitted_by_consultant' ? (
                              <span className="text-amber-800 italic font-sans text-[11px]">Fuera de alcance</span>
                            ) : (
                              formatDateShort(item.consultantTask.startDate)
                            )}
                          </td>
                          <td className="px-3.5 py-3 text-center font-mono font-bold text-amber-900 bg-amber-50/30">
                            {item.status === 'omitted_by_consultant' ? (
                              <span className="text-amber-800 italic font-sans text-[11px]">— No considerada —</span>
                            ) : (
                              formatDateShort(item.consultantTask.endDate)
                            )}
                          </td>
                          <td className="px-3.5 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
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
                                ? 'No Considerada'
                                : item.endDeltaDays > 0
                                ? `+${item.endDeltaDays}d`
                                : item.endDeltaDays < 0
                                ? `${item.endDeltaDays}d`
                                : '0d'}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-center text-slate-600 font-mono">
                            {item.status === 'omitted_by_consultant'
                              ? `${item.currentTask.workingDays || '-'}d (Interna)`
                              : `${item.currentTask.workingDays || '-'}d ➔ ${item.consultantTask.workingDays || '-'}d`}
                          </td>
                          <td className="px-3.5 py-3 text-slate-600 max-w-xs">
                            <p className="text-[11px] leading-relaxed line-clamp-2" title={item.consultantRationale || item.impactDiagnosis}>
                              {item.status === 'omitted_by_consultant'
                                ? item.impactDiagnosis
                                : item.consultantRationale || 'Sin observaciones'}
                            </p>
                          </td>
                          <td className="px-3.5 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* Toggle scope button */}
                              <button
                                type="button"
                                onClick={() => handleToggleTaskOmittedByConsultant(item)}
                                className={`p-1 rounded-md transition-colors cursor-pointer ${
                                  item.status === 'omitted_by_consultant'
                                    ? 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                                    : 'text-slate-400 hover:text-amber-700 hover:bg-amber-50'
                                }`}
                                title={
                                  item.status === 'omitted_by_consultant'
                                    ? 'Actividad marcada como NO considerada por consultora. Clic para reintegrar.'
                                    : 'Marcar como NO considerada por la consultora (Alcance solo interno)'
                                }
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </button>

                              {onEditCurrentTask && (
                                <button
                                  type="button"
                                  onClick={() => onEditCurrentTask(item.currentTask)}
                                  className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors cursor-pointer text-[10px] flex items-center gap-1"
                                  title="Editar tarea en el cronograma actual interno"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Editar Actual</span>
                                </button>
                              )}

                              {item.status !== 'aligned' && item.status !== 'omitted_by_consultant' && (
                                <button
                                  type="button"
                                  onClick={() => onAdoptConsultantTask(item.taskId, item.consultantTask)}
                                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg transition-colors cursor-pointer text-[10px]"
                                  title="Adoptar esta fecha propuesta"
                                >
                                  Adoptar
                                </button>
                              )}
                              {item.status !== 'omitted_by_consultant' && (
                                <button
                                  type="button"
                                  onClick={() => setEditingConsultantTask(item.consultantTask)}
                                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                  title="Editar fecha propuesta de la consultora"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MODE 3: MILESTONES & PHASES STRATEGIC SUMMARY */}
        {displayMode === 'milestones_summary' && (
          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
            {/* Milestones Comparison Cards */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Seguimiento de Hitos Clave y Fechas de Entrega
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Los hitos representan entregables formales con firmas de actas de conformidad. Compara cómo impacta la propuesta en cada uno:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {allComparisons
                  .filter((c) => c.isMilestone)
                  .map((m) => {
                    return (
                      <div
                        key={`milestone-card-${m.taskId}`}
                        className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                            {m.phaseName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.endDeltaDays > 0
                                ? 'bg-amber-100 text-amber-800'
                                : m.endDeltaDays < 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {m.endDeltaDays > 0
                              ? `+${m.endDeltaDays}d postergado`
                              : m.endDeltaDays < 0
                              ? `${m.endDeltaDays}d adelantado`
                              : 'Misma fecha'}
                          </span>
                        </div>

                        <h4 className="text-xs font-bold text-slate-900 line-clamp-2">
                          {m.taskName}
                        </h4>

                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Fecha Actual:</span>
                            <span className="font-bold text-indigo-900 font-mono">
                              {formatDateReadable(m.currentTask.startDate)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Consultora:</span>
                            <span className="font-bold text-amber-900 font-mono">
                              {formatDateReadable(m.consultantTask.startDate)}
                            </span>
                          </div>
                        </div>

                        {m.consultantRationale && (
                          <p className="text-[11px] text-slate-500 italic bg-white p-2 rounded-lg border border-slate-200/60 mt-1">
                            «{m.consultantRationale}»
                          </p>
                        )}

                        {m.status !== 'aligned' && (
                          <div className="pt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => onAdoptConsultantTask(m.taskId, m.consultantTask)}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Adoptar esta Fecha
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Modal: Edit Single Consultant Task */}
      {editingConsultantTask && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Editar Fecha Propuesta por la Consultora
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingConsultantTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveConsultantTask(editingConsultantTask);
              }}
              className="p-5 space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Actividad / Tarea:
                </label>
                <input
                  type="text"
                  value={editingConsultantTask.name}
                  disabled
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Fecha Inicio Propuesta:
                  </label>
                  <input
                    type="date"
                    required
                    value={editingConsultantTask.startDate}
                    onChange={(e) =>
                      setEditingConsultantTask({
                        ...editingConsultantTask,
                        startDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Fecha Fin Propuesta:
                  </label>
                  <input
                    type="date"
                    required
                    value={editingConsultantTask.endDate}
                    onChange={(e) =>
                      setEditingConsultantTask({
                        ...editingConsultantTask,
                        endDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Justificación Técnica / Observación de la Consultora:
                </label>
                <textarea
                  rows={3}
                  value={editingConsultantTask.consultantRationale || ''}
                  onChange={(e) =>
                    setEditingConsultantTask({
                      ...editingConsultantTask,
                      consultantRationale: e.target.value,
                    })
                  }
                  placeholder="Explica el motivo técnico del ajuste de plazo..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingConsultantTask(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Guardar Propuesta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal: Edit Consultant Proposal Settings */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Parámetros de la Propuesta Consultora
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setIsEditModalOpen(false);
                showNotice('Información de la propuesta actualizada.');
              }}
              className="p-5 space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nombre de la Consultora Externa:
                </label>
                <input
                  type="text"
                  required
                  value={consultantProposal.consultantName}
                  onChange={(e) =>
                    onUpdateConsultantProposal({
                      ...consultantProposal,
                      consultantName: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Versión del Cronograma Propuesto:
                </label>
                <input
                  type="text"
                  value={consultantProposal.version}
                  onChange={(e) =>
                    onUpdateConsultantProposal({
                      ...consultantProposal,
                      version: e.target.value,
                    })
                  }
                  placeholder="ej. Propuesta v2.1 (Revisión Final)"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Notas Generales de la Propuesta:
                </label>
                <textarea
                  rows={3}
                  value={consultantProposal.notes || ''}
                  onChange={(e) =>
                    onUpdateConsultantProposal({
                      ...consultantProposal,
                      notes: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Listo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal: Confirm Adopt All Tasks */}
      {isAdoptAllConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 text-center space-y-3">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                ¿Adoptar toda la propuesta de la consultora?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Esta acción actualizará las fechas de inicio y fin de <strong>todas las actividades de tu proyecto actual</strong> para coincidir exactamente con la propuesta de <em>{consultantProposal.consultantName}</em>.
              </p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs space-y-1">
                <div>• Nueva fecha fin estimada: <strong>{formatDateReadable(stats.consultantEndDate)}</strong></div>
                <div>• Total tareas que cambiarán de fecha: <strong>{stats.delayedCount + stats.acceleratedCount}</strong></div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAdoptAllConfirmOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onAdoptAllConsultantTasks(consultantProject.tasks);
                  setIsAdoptAllConfirmOpen(false);
                  showNotice('Se han adoptado todas las fechas de la consultora en tu cronograma.');
                }}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
              >
                Sí, Adoptar Propuesta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal: Export Visual Gantt Comparison (PDF / PNG / JPEG / Excel) */}
      <ComparisonGanttExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        currentProject={currentProject}
        consultantProposal={consultantProposal}
        comparisons={allComparisons}
        stats={stats}
        phases={phases}
        holidays={holidays}
        onShowNotification={(msg) => showNotice(msg)}
      />
    </div>
  );
};
