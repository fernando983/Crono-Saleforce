import React, { useState, useMemo, useRef } from 'react';
import { Task, Phase, Assignee, Holiday, TaskStatus } from '../types';
import {
  parseDate,
  toISODate,
  formatDateShort,
  formatDateReadable,
  diffDays,
  countWorkingDays,
  getHolidaysInRange,
  calculateCriticalPath,
} from '../utils/dateUtils';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Flag,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Search,
  Filter,
  Plus,
  Pencil,
  Sparkles,
  FileSpreadsheet,
  Check,
  Flame,
  User,
  Sliders,
  Maximize2,
  Minimize2,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface ProjectMonthsViewProps {
  tasks: Task[];
  phases: Phase[];
  assignees: Assignee[];
  holidays?: Holiday[];
  projectTitle?: string;
  projectStartDate?: string;
  projectTargetEndDate?: string;
  onUpdateTask: (task: Task) => void;
  onEditTaskModal: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onAddTaskInPhase: (phaseId: string) => void;
  onDuplicateTask?: (task: Task) => void;
  onExportExcel?: () => void;
}

type TimelineScaleMode = 'weeks' | 'compact_days' | 'biweekly';

interface MonthInterval {
  monthIndex: number; // 1-based (Mes 1, Mes 2, ...)
  year: number;
  month: number; // 0-11
  key: string; // 'YYYY-MM'
  name: string; // 'Septiembre 2026'
  shortName: string; // 'Sep 2026'
  startDateStr: string;
  endDateStr: string;
  totalDays: number;
  isCurrentMonth: boolean;
  weeks: {
    weekIndex: number;
    weekLabel: string; // 'Sem 1', 'Sem 2'
    dateRangeLabel: string; // '1-7 Sep', '8-14 Sep'
    startDateStr: string;
    endDateStr: string;
    dayCount: number;
  }[];
}

const SPANISH_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const SPANISH_MONTHS_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const STATUS_THEME: Record<
  TaskStatus,
  { label: string; bg: string; text: string; barBg: string; border: string }
> = {
  pending: {
    label: 'Pendiente',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    barBg: '#64748b',
    border: 'border-slate-300',
  },
  in_progress: {
    label: 'En Progreso',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    barBg: '#2563eb',
    border: 'border-blue-400',
  },
  review: {
    label: 'En Revisión',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    barBg: '#d97706',
    border: 'border-amber-400',
  },
  completed: {
    label: 'Completada',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    barBg: '#10b981',
    border: 'border-emerald-400',
  },
  blocked: {
    label: 'Bloqueada',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    barBg: '#ef4444',
    border: 'border-rose-400',
  },
};

export const ProjectMonthsView: React.FC<ProjectMonthsViewProps> = ({
  tasks,
  phases,
  assignees,
  holidays = [],
  projectTitle = 'Proyecto',
  projectStartDate,
  projectTargetEndDate,
  onUpdateTask,
  onEditTaskModal,
  onDeleteTask,
  onAddTaskInPhase,
  onDuplicateTask,
  onExportExcel,
}) => {
  // Scale mode: 'weeks' (default, balanced intermediate), 'compact_days' (daily fitted), or 'biweekly'
  const [scaleMode, setScaleMode] = useState<TimelineScaleMode>('weeks');

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [onlyMilestones, setOnlyMilestones] = useState(false);
  const [highlightCriticalPath, setHighlightCriticalPath] = useState(false);
  const [highlightOmittedByConsultant, setHighlightOmittedByConsultant] = useState(false);

  const omittedCount = useMemo(() => tasks.filter((t) => t.notConsideredByConsultant).length, [tasks]);

  // Layout UI states
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});
  const [isTableCollapsed, setIsTableCollapsed] = useState(false);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [focusedMonthKey, setFocusedMonthKey] = useState<string | null>(null);

  // Month buffer extensions (defaults to 0 so it strictly matches the project duration)
  const [extraPreMonths, setExtraPreMonths] = useState(0);
  const [extraPostMonths, setExtraPostMonths] = useState(0);

  const timelineContainerRef = useRef<HTMLDivElement>(null);

  // 1. Calculate project bounds and Project Month Intervals
  const { projectMonths, timelineStartDateStr, timelineEndDateStr, totalTimelineDays } = useMemo(() => {
    let minD = projectStartDate || (tasks[0]?.startDate) || toISODate(new Date());
    let maxD = projectTargetEndDate || (tasks[0]?.endDate) || toISODate(new Date());

    tasks.forEach((t) => {
      if (t.startDate && t.startDate < minD) minD = t.startDate;
      if (t.endDate && t.endDate > maxD) maxD = t.endDate;
    });

    const minDate = parseDate(minD);
    const maxDate = parseDate(maxD);

    const startYear = minDate.getFullYear();
    const startMonth = minDate.getMonth();
    const endYear = maxDate.getFullYear();
    const endMonth = maxDate.getMonth();

    // Total calendar months span
    const baseMonthSpan = Math.max(1, (endYear - startYear) * 12 + (endMonth - startMonth) + 1);

    const totalMonths = baseMonthSpan + extraPreMonths + extraPostMonths;
    const startIndexOffset = -extraPreMonths;

    const today = new Date();
    const monthsList: MonthInterval[] = [];

    for (let i = 0; i < totalMonths; i++) {
      const globalMonthIdx = startMonth + startIndexOffset + i;
      const year = startYear + Math.floor(globalMonthIdx / 12);
      const month = ((globalMonthIdx % 12) + 12) % 12;

      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();

      const startDateStr = toISODate(firstDay);
      const endDateStr = toISODate(lastDay);

      // Divide month into weeks (1-7, 8-14, 15-21, 22-28, 29-end)
      const weeks: MonthInterval['weeks'] = [];
      const weekBreaks = [
        { start: 1, end: 7 },
        { start: 8, end: 14 },
        { start: 15, end: 21 },
        { start: 22, end: 28 },
      ];
      if (daysInMonth >= 29) {
        weekBreaks.push({ start: 29, end: daysInMonth });
      }

      weekBreaks.forEach((wb, wIdx) => {
        const actualEnd = Math.min(wb.end, daysInMonth);
        const wStart = new Date(year, month, wb.start);
        const wEnd = new Date(year, month, actualEnd);
        weeks.push({
          weekIndex: wIdx + 1,
          weekLabel: `S${wIdx + 1}`,
          dateRangeLabel: `${wb.start}-${actualEnd} ${SPANISH_MONTHS_SHORT[month]}`,
          startDateStr: toISODate(wStart),
          endDateStr: toISODate(wEnd),
          dayCount: actualEnd - wb.start + 1,
        });
      });

      const isCurrentMonth =
        today.getFullYear() === year && today.getMonth() === month;

      monthsList.push({
        monthIndex: i + 1,
        year,
        month,
        key,
        name: `${SPANISH_MONTHS[month]} ${year}`,
        shortName: `${SPANISH_MONTHS_SHORT[month]} ${year}`,
        startDateStr,
        endDateStr,
        totalDays: daysInMonth,
        isCurrentMonth,
        weeks,
      });
    }

    const tStart = monthsList[0]?.startDateStr || minD;
    const tEnd = monthsList[monthsList.length - 1]?.endDateStr || maxD;
    const tDays = Math.max(1, diffDays(tStart, tEnd) + 1);

    return {
      projectMonths: monthsList,
      timelineStartDateStr: tStart,
      timelineEndDateStr: tEnd,
      totalTimelineDays: tDays,
    };
  }, [tasks, projectStartDate, projectTargetEndDate, extraPreMonths, extraPostMonths]);

  // Critical path calculation
  const criticalTaskIds = useMemo(() => calculateCriticalPath(tasks), [tasks]);

  // 2. Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const search = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !search ||
        task.name.toLowerCase().includes(search) ||
        task.deliverable?.toLowerCase().includes(search) ||
        task.assignee.name.toLowerCase().includes(search);

      const matchesPhase = selectedPhase === 'all' || task.phaseId === selectedPhase;
      const matchesStatus = selectedStatus === 'all' || task.status === selectedStatus;
      const matchesMilestone = !onlyMilestones || task.isMilestone;
      const matchesCritical = !highlightCriticalPath || criticalTaskIds.has(task.id);
      const matchesOmitted = !highlightOmittedByConsultant || Boolean(task.notConsideredByConsultant);

      return matchesSearch && matchesPhase && matchesStatus && matchesMilestone && matchesCritical && matchesOmitted;
    });
  }, [tasks, searchTerm, selectedPhase, selectedStatus, onlyMilestones, highlightCriticalPath, highlightOmittedByConsultant, criticalTaskIds]);

  // 3. Group tasks by phase
  const groupedPhases = useMemo(() => {
    const sorted = [...phases].sort((a, b) => a.order - b.order);
    return sorted.map((phase) => {
      const pTasks = filteredTasks.filter((t) => t.phaseId === phase.id);
      return {
        phase,
        tasks: pTasks,
        totalCount: tasks.filter((t) => t.phaseId === phase.id).length,
      };
    });
  }, [phases, filteredTasks, tasks]);

  // 4. Monthly metrics for the top ribbon
  const monthCardsData = useMemo(() => {
    return projectMonths.map((m) => {
      const inMonthTasks = tasks.filter((t) => {
        return t.startDate <= m.endDateStr && t.endDate >= m.startDateStr;
      });

      const completed = inMonthTasks.filter((t) => t.status === 'completed' || t.progress === 100).length;
      const inProg = inMonthTasks.filter((t) => t.progress > 0 && t.progress < 100).length;
      const milestones = inMonthTasks.filter((t) => t.isMilestone).length;
      const holidaysInM = getHolidaysInRange(m.startDateStr, m.endDateStr, holidays);

      const avgProgress =
        inMonthTasks.length > 0
          ? Math.round(inMonthTasks.reduce((s, t) => s + t.progress, 0) / inMonthTasks.length)
          : 0;

      return {
        month: m,
        totalTasks: inMonthTasks.length,
        completed,
        inProg,
        milestones,
        holidaysCount: holidaysInM.length,
        avgProgress,
      };
    });
  }, [projectMonths, tasks, holidays]);

  // Toggle phase collapse
  const togglePhase = (phaseId: string) => {
    setCollapsedPhases((prev) => ({
      ...prev,
      [phaseId]: !prev[phaseId],
    }));
  };

  // Helper to calculate exact horizontal percentage position of a task or phase bar
  const getHorizontalSpan = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return { left: 0, width: 0, isOutside: true };

    const startOffset = diffDays(timelineStartDateStr, startStr);
    const duration = Math.max(1, diffDays(startStr, endStr) + 1);

    const leftPercent = Math.max(0, (startOffset / totalTimelineDays) * 100);
    const widthPercent = Math.min(100 - leftPercent, (duration / totalTimelineDays) * 100);

    const isOutside = endStr < timelineStartDateStr || startStr > timelineEndDateStr;

    return {
      left: `${leftPercent}%`,
      width: `${Math.max(1.2, widthPercent)}%`,
      isOutside,
    };
  };

  // Quick jump to a month card
  const handleScrollToMonth = (monthKey: string) => {
    setFocusedMonthKey(monthKey);
    const el = document.getElementById(`month-col-${monthKey}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  };

  // Toggle task complete
  const handleToggleTaskComplete = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const isComp = task.status === 'completed' || task.progress === 100;
    onUpdateTask({
      ...task,
      status: isComp ? 'pending' : 'completed',
      progress: isComp ? 0 : 100,
    });
  };

  // Column width configuration based on scale mode
  const weekColumnWidth = scaleMode === 'weeks' ? 78 : scaleMode === 'biweekly' ? 120 : 18;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-0 select-none">
      {/* 1. Header Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shadow-2xs">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                Vista de Meses del Proyecto
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                {projectMonths.length} Meses
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-semibold text-slate-600">
                {projectMonths[0]?.shortName} al {projectMonths[projectMonths.length - 1]?.shortName}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Cronograma proporcional ajustado exactamente a la duración del proyecto con desglose semanal.
            </p>
          </div>
        </div>

        {/* Right Controls: Scale Selector + Search + Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Scale Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setScaleMode('weeks')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                scaleMode === 'weeks'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
              title="Escala intermedia: meses divididos en Semanas (S1, S2, S3...)"
            >
              Por Semanas
            </button>
            <button
              type="button"
              onClick={() => setScaleMode('biweekly')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                scaleMode === 'biweekly'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
              title="Escala compacta: quincenas por mes (Q1, Q2)"
            >
              Quincenas
            </button>
            <button
              type="button"
              onClick={() => setScaleMode('compact_days')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                scaleMode === 'compact_days'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
              title="Días compactos de alta resolución (7px por día)"
            >
              Días Compactos
            </button>
          </div>

          {/* Table Toggle */}
          <button
            type="button"
            onClick={() => setIsTableCollapsed(!isTableCollapsed)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
            title={isTableCollapsed ? 'Mostrar tabla WBS izquierda' : 'Ocultar tabla WBS izquierda'}
          >
            {isTableCollapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            <span>{isTableCollapsed ? 'Ver Tabla WBS' : 'Ocultar Tabla'}</span>
          </button>

          {/* Direct Excel Button */}
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              title="Descargar cronograma completo en Microsoft Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel (.xlsx)</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Project Months Overview Ribbon (Cards according to project months) */}
      <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-2.5 overflow-x-auto">
        <div className="flex items-center gap-3 min-w-max">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Resumen por Meses del Proyecto:</span>
          </div>

          {monthCardsData.map(({ month, totalTasks, completed, milestones, avgProgress }) => {
            const isSelected = focusedMonthKey === month.key;
            return (
              <button
                key={month.key}
                type="button"
                onClick={() => handleScrollToMonth(month.key)}
                className={`flex items-center gap-3 px-3.5 py-2 rounded-xl border text-left transition-all cursor-pointer shadow-2xs ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-300'
                    : month.isCurrentMonth
                    ? 'bg-white border-indigo-300 text-slate-900 ring-1 ring-indigo-200'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
                title={`Mes ${month.monthIndex} de ${projectMonths.length}: ${month.name}. Haz clic para enfocar en la grilla.`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-md ${
                        isSelected
                          ? 'bg-indigo-700 text-indigo-100'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      Mes {month.monthIndex}
                    </span>
                    <span className="text-xs font-bold truncate">{month.shortName}</span>
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 flex items-center gap-2 ${
                      isSelected ? 'text-indigo-100' : 'text-slate-500'
                    }`}
                  >
                    <span>{totalTasks} actividades</span>
                    {milestones > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Flag className="w-2.5 h-2.5" />
                        {milestones}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className={`text-xs font-mono font-bold ${isSelected ? 'text-white' : 'text-indigo-700'}`}>
                    {avgProgress}%
                  </span>
                  <div
                    className={`w-12 h-1.5 rounded-full overflow-hidden mt-1 ${
                      isSelected ? 'bg-indigo-700' : 'bg-slate-200'
                    }`}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        isSelected ? 'bg-white' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${avgProgress}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}

          {/* Month Range Adjusters */}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-300 shrink-0">
            <button
              type="button"
              onClick={() => setExtraPreMonths((p) => Math.max(0, p + 1))}
              className="p-1 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-[10px] font-bold cursor-pointer"
              title="Añadir 1 mes antes"
            >
              + Mes Pre
            </button>
            <button
              type="button"
              onClick={() => setExtraPostMonths((p) => Math.max(0, p + 1))}
              className="p-1 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-[10px] font-bold cursor-pointer"
              title="Añadir 1 mes después"
            >
              + Mes Post
            </button>
            {(extraPreMonths > 0 || extraPostMonths > 0) && (
              <button
                type="button"
                onClick={() => {
                  setExtraPreMonths(0);
                  setExtraPostMonths(0);
                }}
                className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold cursor-pointer"
                title="Restablecer exactamente a los meses del proyecto"
              >
                Resetear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Search and Quick Filters Strip */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar tarea o responsable..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-48 sm:w-60"
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
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-hidden cursor-pointer"
          >
            <option value="all">Todos los Estados</option>
            <option value="pending">Pendientes</option>
            <option value="in_progress">En Progreso</option>
            <option value="review">En Revisión</option>
            <option value="completed">Completadas</option>
            <option value="blocked">Bloqueadas</option>
          </select>

          {/* Milestones toggle */}
          <button
            type="button"
            onClick={() => setOnlyMilestones(!onlyMilestones)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              onlyMilestones
                ? 'bg-purple-50 text-purple-800 border-purple-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Flag className="w-3.5 h-3.5 text-purple-600" />
            <span>Solo Hitos</span>
          </button>

          {/* Critical Path toggle */}
          <button
            type="button"
            onClick={() => setHighlightCriticalPath(!highlightCriticalPath)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              highlightCriticalPath
                ? 'bg-rose-50 text-rose-800 border-rose-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-rose-600" />
            <span>Ruta Crítica</span>
          </button>

          {/* Omitted by Consultant toggle */}
          <button
            type="button"
            onClick={() => setHighlightOmittedByConsultant(!highlightOmittedByConsultant)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              highlightOmittedByConsultant
                ? 'bg-amber-100 text-amber-950 border-amber-400 shadow-2xs font-bold ring-2 ring-amber-300/40'
                : omittedCount > 0
                ? 'bg-amber-50/70 text-amber-900 border-amber-200 hover:bg-amber-100/70'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title="Filtrar actividades consideradas internamente pero NO contempladas por la consultora externa"
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${omittedCount > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
            <span>No en Consultora ({omittedCount})</span>
          </button>
        </div>

        <div className="text-slate-500 font-medium text-[11px]">
          Mostrando <strong>{filteredTasks.length}</strong> de <strong>{tasks.length}</strong> actividades
        </div>
      </div>

      {/* 4. Main Gantt Body: Left WBS Table + Right Scaled Months Timeline */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Left WBS Task Table */}
        {!isTableCollapsed && (
          <div className="w-[340px] md:w-[380px] shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden z-10 shadow-sm">
            {/* Table Header */}
            <div className="h-14 px-3 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider shrink-0">
              <span className="w-12">WBS</span>
              <span className="flex-1 pl-1">Actividad / Tarea</span>
              <span className="w-12 text-right">Plazo</span>
              <span className="w-10 text-right">Avance</span>
            </div>

            {/* Table Rows grouped by Phase */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {groupedPhases.map(({ phase, tasks: pTasks, totalCount }, pIdx) => {
                const isCollapsed = collapsedPhases[phase.id] || false;
                const phaseProgress =
                  pTasks.length > 0
                    ? Math.round(pTasks.reduce((s, t) => s + t.progress, 0) / pTasks.length)
                    : 0;

                return (
                  <div key={phase.id} className="divide-y divide-slate-100">
                    {/* Phase Summary Row */}
                    <div
                      onClick={() => togglePhase(phase.id)}
                      className="h-9 px-3 bg-indigo-50/70 hover:bg-indigo-100/70 border-b border-indigo-100 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        )}
                        <span className="font-mono text-[10px] font-bold text-indigo-700 w-6 shrink-0">
                          {pIdx + 1}.0
                        </span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: phase.color }}
                        />
                        <span className="truncate text-xs font-bold text-indigo-950 uppercase" title={phase.name}>
                          {phase.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-indigo-700 font-semibold">
                          {pTasks.length} tareas
                        </span>
                        <span className="text-[11px] font-mono font-bold text-indigo-900 w-8 text-right">
                          {phaseProgress}%
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddTaskInPhase(phase.id);
                          }}
                          className="p-1 hover:bg-white rounded text-indigo-600 cursor-pointer"
                          title="Añadir tarea a esta fase"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Task Rows inside Phase */}
                    {!isCollapsed &&
                      pTasks.map((task, tIdx) => {
                        const isHovered = hoveredTaskId === task.id;
                        const wDays =
                          task.workingDays ?? countWorkingDays(task.startDate, task.endDate, holidays);
                        const isCrit = criticalTaskIds.has(task.id);

                        return (
                          <div
                            key={task.id}
                            onMouseEnter={() => setHoveredTaskId(task.id)}
                            onMouseLeave={() => setHoveredTaskId(null)}
                            onClick={() => onEditTaskModal(task)}
                            className={`h-9 px-3 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                              isHovered
                                ? 'bg-indigo-50/60'
                                : tIdx % 2 === 0
                                ? 'bg-white'
                                : 'bg-slate-50/40'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2 pl-2">
                              {/* Quick complete checkbox */}
                              <button
                                type="button"
                                onClick={(e) => handleToggleTaskComplete(task, e)}
                                className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                                  task.status === 'completed'
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'border-slate-300 hover:border-indigo-500 bg-white'
                                }`}
                              >
                                {task.status === 'completed' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </button>

                              <span className="font-mono text-[10px] text-slate-400 w-6 shrink-0">
                                {pIdx + 1}.{tIdx + 1}
                              </span>

                              {task.isMilestone ? (
                                <Flag className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              ) : (
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: task.color || phase.color }}
                                />
                              )}

                              <span
                                className={`truncate font-medium ${
                                  task.status === 'completed'
                                    ? 'line-through text-slate-400'
                                    : 'text-slate-800'
                                }`}
                                title={task.name}
                              >
                                {task.name}
                              </span>

                              {task.notConsideredByConsultant && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-950 border border-amber-300 shrink-0"
                                  title={`Actividad no contemplada por la consultora: ${task.consultantExclusionReason || 'Alcance interno'}`}
                                >
                                  <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                                  No en Consultora
                                </span>
                              )}

                              {isCrit && (
                                <span className="px-1 py-0.2 bg-rose-100 text-rose-700 rounded text-[9px] font-bold shrink-0">
                                  Crítica
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 text-slate-500 text-[11px]">
                              {/* Quick toggle consultant consideration */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateTask({
                                    ...task,
                                    notConsideredByConsultant: !task.notConsideredByConsultant,
                                  });
                                }}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  task.notConsideredByConsultant
                                    ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                                    : 'text-slate-300 hover:text-amber-600 hover:bg-slate-100'
                                }`}
                                title={
                                  task.notConsideredByConsultant
                                    ? 'Actividad NO considerada por la consultora. Haz clic para reintegrar.'
                                    : 'Marcar como NO considerada por la consultora (Alcance solo interno)'
                                }
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </button>

                              <span className="w-9 text-right font-medium">
                                {task.isMilestone ? 'Hito' : `${wDays}d`}
                              </span>
                              <span className="w-8 text-right font-mono font-bold text-slate-700">
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
                );
              })}
            </div>
          </div>
        )}

        {/* Right Scaled Timeline Container */}
        <div
          ref={timelineContainerRef}
          className="flex-1 overflow-x-auto overflow-y-auto bg-white flex flex-col relative"
        >
          <div className="min-w-full flex flex-col" style={{ width: 'max-content', minWidth: '100%' }}>
            {/* Timeline Top Header: Month spans + Week/Day intervals */}
            <div className="h-14 bg-slate-100/95 border-b border-slate-200 sticky top-0 z-20 flex flex-col shrink-0 shadow-2xs">
              {/* Row 1: Months (spans across its weeks/days) */}
              <div className="h-7 border-b border-slate-200 flex">
                {projectMonths.map((m) => {
                  const widthStyle =
                    scaleMode === 'weeks'
                      ? `${m.weeks.length * weekColumnWidth}px`
                      : scaleMode === 'biweekly'
                      ? `${2 * weekColumnWidth}px`
                      : `${m.totalDays * weekColumnWidth}px`;

                  const isFocused = focusedMonthKey === m.key;

                  return (
                    <div
                      key={m.key}
                      id={`month-col-${m.key}`}
                      style={{ width: widthStyle, minWidth: widthStyle }}
                      className={`px-3 flex items-center justify-between border-r border-slate-200/90 text-xs font-bold transition-colors ${
                        m.isCurrentMonth
                          ? 'bg-indigo-600 text-white'
                          : isFocused
                          ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                          : 'bg-slate-200/70 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[10px] uppercase font-black tracking-wider opacity-80">
                          Mes {m.monthIndex}:
                        </span>
                        <span className="truncate">{m.name}</span>
                      </div>
                      <span className="text-[10px] font-normal opacity-85 shrink-0">
                        {m.totalDays} días
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Row 2: Sub-intervals (Weeks / Bi-weekly / Days) */}
              <div className="h-7 flex text-[11px] font-medium text-slate-600">
                {projectMonths.map((m) => {
                  if (scaleMode === 'weeks') {
                    return m.weeks.map((w) => (
                      <div
                        key={`${m.key}-${w.weekLabel}`}
                        style={{ width: `${weekColumnWidth}px`, minWidth: `${weekColumnWidth}px` }}
                        className="px-1.5 flex items-center justify-between border-r border-slate-200/60 bg-slate-50/80"
                        title={`${w.weekLabel}: ${w.dateRangeLabel} (${w.dayCount} días)`}
                      >
                        <span className="font-bold text-slate-700">{w.weekLabel}</span>
                        <span className="text-[10px] text-slate-400 truncate">{w.dateRangeLabel.split(' ')[0]}</span>
                      </div>
                    ));
                  } else if (scaleMode === 'biweekly') {
                    return (
                      <React.Fragment key={`${m.key}-biweeks`}>
                        <div
                          style={{ width: `${weekColumnWidth}px`, minWidth: `${weekColumnWidth}px` }}
                          className="px-2 flex items-center justify-between border-r border-slate-200/60 bg-slate-50/80 text-[10px]"
                        >
                          <span className="font-bold">Q1 (1-15)</span>
                          <span className="text-slate-400">15d</span>
                        </div>
                        <div
                          style={{ width: `${weekColumnWidth}px`, minWidth: `${weekColumnWidth}px` }}
                          className="px-2 flex items-center justify-between border-r border-slate-200/60 bg-slate-50/80 text-[10px]"
                        >
                          <span className="font-bold">Q2 (16-{m.totalDays})</span>
                          <span className="text-slate-400">{m.totalDays - 15}d</span>
                        </div>
                      </React.Fragment>
                    );
                  } else {
                    // compact_days mode
                    return Array.from({ length: m.totalDays }, (_, dIdx) => (
                      <div
                        key={`${m.key}-d-${dIdx + 1}`}
                        style={{ width: `${weekColumnWidth}px`, minWidth: `${weekColumnWidth}px` }}
                        className="flex items-center justify-center border-r border-slate-200/40 text-[9px] text-slate-500"
                        title={`Día ${dIdx + 1} de ${m.name}`}
                      >
                        {dIdx + 1}
                      </div>
                    ));
                  }
                })}
              </div>
            </div>

            {/* Timeline Rows: Phase Summaries & Task Bars */}
            <div className="flex-1 flex flex-col relative divide-y divide-slate-100">
              {groupedPhases.map(({ phase, tasks: pTasks }) => {
                const isCollapsed = collapsedPhases[phase.id] || false;

                // Phase dates
                let pMin = '';
                let pMax = '';
                pTasks.forEach((t) => {
                  if (t.startDate && (!pMin || t.startDate < pMin)) pMin = t.startDate;
                  if (t.endDate && (!pMax || t.endDate > pMax)) pMax = t.endDate;
                });
                const phaseSpan = getHorizontalSpan(pMin, pMax);
                const phaseProgress =
                  pTasks.length > 0
                    ? Math.round(pTasks.reduce((s, t) => s + t.progress, 0) / pTasks.length)
                    : 0;

                return (
                  <div key={`timeline-phase-${phase.id}`} className="divide-y divide-slate-100">
                    {/* Phase Timeline Row */}
                    <div className="h-9 relative bg-indigo-50/30 flex items-center">
                      {/* Grid background columns */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {projectMonths.map((m) => {
                          const wStyle =
                            scaleMode === 'weeks'
                              ? `${m.weeks.length * weekColumnWidth}px`
                              : scaleMode === 'biweekly'
                              ? `${2 * weekColumnWidth}px`
                              : `${m.totalDays * weekColumnWidth}px`;
                          return (
                            <div
                              key={`bg-phase-${m.key}`}
                              style={{ width: wStyle, minWidth: wStyle }}
                              className={`border-r border-slate-200/40 h-full ${
                                m.isCurrentMonth ? 'bg-indigo-50/20' : ''
                              }`}
                            />
                          );
                        })}
                      </div>

                      {/* Continuous Phase Duration Bar */}
                      {!phaseSpan.isOutside && pMin && pMax && (
                        <div
                          style={{
                            left: phaseSpan.left,
                            width: phaseSpan.width,
                            backgroundColor: phase.color,
                          }}
                          className="absolute h-5 rounded-md shadow-xs flex items-center px-2 text-white text-[11px] font-bold overflow-hidden transition-all z-10"
                          title={`Fase: ${phase.name}\nPeríodo: ${formatDateShort(pMin)} al ${formatDateShort(pMax)}\nAvance: ${phaseProgress}% (${pTasks.length} tareas)`}
                        >
                          <span className="truncate drop-shadow-xs">
                            {phase.name} — {phaseProgress}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Task Timeline Rows */}
                    {!isCollapsed &&
                      pTasks.map((task, tIdx) => {
                        const isHovered = hoveredTaskId === task.id;
                        const taskSpan = getHorizontalSpan(task.startDate, task.endDate);
                        const statusConfig = STATUS_THEME[task.status] || STATUS_THEME.pending;
                        const wDays =
                          task.workingDays ?? countWorkingDays(task.startDate, task.endDate, holidays);
                        const isCrit = criticalTaskIds.has(task.id);

                        return (
                          <div
                            key={`timeline-task-${task.id}`}
                            onMouseEnter={() => setHoveredTaskId(task.id)}
                            onMouseLeave={() => setHoveredTaskId(null)}
                            onClick={() => onEditTaskModal(task)}
                            className={`h-9 relative flex items-center transition-colors cursor-pointer ${
                              isHovered
                                ? 'bg-indigo-50/60'
                                : tIdx % 2 === 0
                                ? 'bg-white'
                                : 'bg-slate-50/40'
                            }`}
                          >
                            {/* Background Month / Week Columns */}
                            <div className="absolute inset-0 flex pointer-events-none">
                              {projectMonths.map((m) => {
                                const wStyle =
                                  scaleMode === 'weeks'
                                    ? `${m.weeks.length * weekColumnWidth}px`
                                    : scaleMode === 'biweekly'
                                    ? `${2 * weekColumnWidth}px`
                                    : `${m.totalDays * weekColumnWidth}px`;
                                return (
                                  <div
                                    key={`bg-task-${m.key}`}
                                    style={{ width: wStyle, minWidth: wStyle }}
                                    className={`border-r border-slate-200/30 h-full ${
                                      m.isCurrentMonth ? 'bg-indigo-50/15' : ''
                                    }`}
                                  />
                                );
                              })}
                            </div>

                            {/* Task Bar or Milestone Marker */}
                            {!taskSpan.isOutside && (
                              <>
                                {task.isMilestone ? (
                                  /* Milestone Diamond */
                                  <div
                                    style={{ left: taskSpan.left }}
                                    className="absolute -ml-3 z-10 flex items-center gap-1.5"
                                    title={
                                      task.notConsideredByConsultant
                                        ? `[⚠️ No considerada por consultora: ${task.consultantExclusionReason || 'Alcance interno'}] HITO: ${task.name}\nFecha: ${formatDateReadable(task.startDate)}`
                                        : `HITO: ${task.name}\nFecha: ${formatDateReadable(task.startDate)}\nResponsable: ${task.assignee.name}\nEstado: ${statusConfig.label}`
                                    }
                                  >
                                    <div
                                      className={`w-6 h-6 bg-purple-600 rotate-45 rounded-sm shadow-md flex items-center justify-center text-white border-2 border-white hover:scale-110 transition-transform ${
                                        task.notConsideredByConsultant ? 'ring-2 ring-amber-400 ring-offset-1' : ''
                                      }`}
                                    >
                                      <Flag className="w-3 h-3 -rotate-45" />
                                    </div>
                                    {task.notConsideredByConsultant && (
                                      <span className="text-[9px] font-black uppercase text-amber-950 bg-amber-200 border border-amber-400 px-1 py-0.2 rounded shadow-2xs flex items-center gap-0.5">
                                        <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                                        No en consultora
                                      </span>
                                    )}
                                    <span className="text-[11px] font-bold text-purple-900 bg-white/90 backdrop-blur-xs px-1.5 py-0.5 rounded shadow-2xs whitespace-nowrap border border-purple-200">
                                      {task.name}
                                    </span>
                                  </div>
                                ) : (
                                  /* Regular Task Bar */
                                  <div
                                    className={`absolute h-6 rounded-lg shadow-xs flex items-center border transition-all z-10 overflow-hidden ${
                                      isHovered ? 'ring-2 ring-indigo-500 shadow-md scale-y-105' : ''
                                    } ${task.notConsideredByConsultant ? 'ring-1 ring-amber-400 ring-offset-1' : ''}`}
                                    style={{
                                      left: taskSpan.left,
                                      width: taskSpan.width,
                                      backgroundColor: task.notConsideredByConsultant
                                        ? 'rgba(245, 158, 11, 0.2)'
                                        : `${task.color || phase.color}25`,
                                      backgroundImage: task.notConsideredByConsultant
                                        ? 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.25), rgba(245, 158, 11, 0.25) 6px, transparent 6px, transparent 12px)'
                                        : undefined,
                                      borderColor: task.notConsideredByConsultant ? '#f59e0b' : (task.color || phase.color),
                                      borderStyle: task.notConsideredByConsultant ? 'dashed' : 'solid',
                                      borderWidth: task.notConsideredByConsultant ? 2 : 1,
                                    }}
                                    title={`${
                                      task.notConsideredByConsultant
                                        ? `[⚠️ No considerada por consultora: ${task.consultantExclusionReason || 'Alcance interno'}]\n`
                                        : ''
                                    }${task.name}\nPeríodo: ${formatDateShort(task.startDate)} al ${formatDateShort(task.endDate)} (${wDays} días hábiles)\nProgreso: ${task.progress}%\nResponsable: ${task.assignee.name} (${task.assignee.role})\nEstado: ${statusConfig.label}`}
                                  >
                                    {/* Progress Fill inside Task Bar */}
                                    <div
                                      style={{
                                        width: `${task.progress}%`,
                                        backgroundColor: task.color || phase.color,
                                      }}
                                      className="absolute left-0 top-0 bottom-0 opacity-85 transition-all"
                                    />

                                    {/* Text Content inside Task Bar */}
                                    <div className="relative z-10 px-2 flex items-center justify-between w-full text-[11px] font-bold text-slate-900 truncate">
                                      <div className="flex items-center gap-1 min-w-0 truncate mr-1">
                                        {task.notConsideredByConsultant && (
                                          <span className="shrink-0 px-1 py-0.2 bg-amber-500 text-white rounded text-[8px] font-black uppercase flex items-center gap-0.5 shadow-2xs">
                                            <AlertTriangle className="w-2 h-2" />
                                            No en consultora
                                          </span>
                                        )}
                                        <span className="truncate drop-shadow-2xs">
                                          {task.name}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                                        <span className="bg-white/90 backdrop-blur-xs px-1 py-0.2 rounded text-slate-700 shadow-2xs font-mono">
                                          {task.progress}%
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
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

      {/* 5. Footer Summary Bar */}
      <div className="px-4 py-2 bg-white border-t border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-emerald-500" />
            <span>Completada (100%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-blue-600" />
            <span>En Progreso</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-purple-600 rotate-45" />
            <span>Hito Clave</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-rose-500" />
            <span>Ruta Crítica</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-md border border-dashed border-amber-500 bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-2 h-2 text-amber-700" />
            </span>
            <span className="text-amber-950 font-semibold">No en Consultora</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>Escala activa:</span>
          <span className="font-bold text-slate-700 uppercase">
            {scaleMode === 'weeks' ? 'Semanas de cada Mes' : scaleMode === 'biweekly' ? 'Quincenas' : 'Días Compactos'}
          </span>
          <span>•</span>
          <span>
            {projectMonths.length} Meses del Proyecto ({projectMonths[0]?.shortName} – {projectMonths[projectMonths.length - 1]?.shortName})
          </span>
        </div>
      </div>
    </div>
  );
};
