import React, { useState, useMemo, useRef } from 'react';
import { Task, Phase, Assignee, Holiday, TaskStatus } from '../types';
import {
  parseDate,
  toISODate,
  formatDateShort,
  diffDays,
  getHolidaysInRange,
  countWorkingDays,
} from '../utils/dateUtils';
import {
  CalendarRange,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  Flag,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Filter,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Plus,
  Pencil,
  Sparkles,
  Palmtree,
  Copy,
  Trash2,
  Check,
  RotateCcw,
  Calendar,
  ChevronLeft,
} from 'lucide-react';

interface MonthlyCompactViewProps {
  tasks: Task[];
  phases: Phase[];
  assignees: Assignee[];
  holidays?: Holiday[];
  onUpdateTask: (task: Task) => void;
  onEditTaskModal: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onAddTaskInPhase: (phaseId: string) => void;
  onDuplicateTask?: (task: Task) => void;
  onMoveTask?: (taskId: string, direction: 'up' | 'down') => void;
  onReorderTasks?: (
    draggedTaskId: string,
    targetTaskId: string | null,
    position: 'before' | 'after' | 'inside_phase',
    targetPhaseId?: string
  ) => void;
}

interface MonthColumn {
  year: number;
  month: number; // 0-11
  key: string; // 'YYYY-MM'
  label: string; // 'Ene 2026'
  shortMonth: string; // 'Ene'
  fullLabel: string; // 'Enero 2026'
  startDate: Date;
  endDate: Date;
  startDateStr: string;
  endDateStr: string;
  totalDays: number;
  isCurrentMonth: boolean;
}

const SPANISH_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const SPANISH_MONTHS_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  pending: {
    label: 'Pendiente',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },
  in_progress: {
    label: 'En Progreso',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  review: {
    label: 'En Revisión',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  completed: {
    label: 'Completada',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  blocked: {
    label: 'Bloqueada',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
  },
};

export const MonthlyCompactView: React.FC<MonthlyCompactViewProps> = ({
  tasks,
  phases,
  assignees,
  holidays = [],
  onUpdateTask,
  onEditTaskModal,
  onDeleteTask,
  onAddTaskInPhase,
  onDuplicateTask,
  onMoveTask,
  onReorderTasks,
}) => {
  // View mode: 'timeline' (Matriz compacta) or 'cards' (Tarjetas por mes)
  const [viewMode, setViewMode] = useState<'timeline' | 'cards'>('timeline');
  // Density: 'compact' (32px) or 'ultra' (24px)
  const [density, setDensity] = useState<'compact' | 'ultra'>('compact');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [onlyMilestones, setOnlyMilestones] = useState(false);

  // Month range padding
  const [extraPreMonths, setExtraPreMonths] = useState(0);
  const [extraPostMonths, setExtraPostMonths] = useState(0);

  // Focused / selected month for quick jumping & highlighting
  const [focusedMonthKey, setFocusedMonthKey] = useState<string | null>(null);

  // Phase collapse state
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});

  // Drag & drop reordering state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);

  // Container refs for smooth scrolling
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const cardsContainerRef = useRef<HTMLDivElement>(null);

  const togglePhaseCollapse = (phaseId: string) => {
    setCollapsedPhases((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  const expandAllPhases = () => setCollapsedPhases({});
  const collapseAllPhases = () => {
    const next: Record<string, boolean> = {};
    phases.forEach((p) => {
      next[p.id] = true;
    });
    setCollapsedPhases(next);
  };

  // 1. Calculate project month boundaries reliably (no day-drift or DST skips)
  const months: MonthColumn[] = useMemo(() => {
    const today = new Date();
    let minDate: Date;
    let maxDate: Date;

    if (tasks.length === 0) {
      minDate = new Date(today.getFullYear(), today.getMonth(), 1);
      maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 1);
    } else {
      let minTimestamp = Number.MAX_SAFE_INTEGER;
      let maxTimestamp = 0;

      tasks.forEach((t) => {
        if (!t.startDate || !t.endDate) return;
        const s = parseDate(t.startDate).getTime();
        const e = parseDate(t.endDate).getTime();
        if (!isNaN(s) && s < minTimestamp) minTimestamp = s;
        if (!isNaN(e) && e > maxTimestamp) maxTimestamp = e;
      });

      if (minTimestamp === Number.MAX_SAFE_INTEGER) {
        minDate = new Date(today.getFullYear(), today.getMonth(), 1);
        maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 1);
      } else {
        minDate = new Date(minTimestamp);
        maxDate = new Date(maxTimestamp);
      }
    }

    const baseStartYear = minDate.getFullYear();
    const baseStartMonth = minDate.getMonth();
    const baseEndYear = maxDate.getFullYear();
    const baseEndMonth = maxDate.getMonth();

    // Base total months spanned by project tasks
    const rawSpan = (baseEndYear - baseStartYear) * 12 + (baseEndMonth - baseStartMonth) + 1;
    // Ensure minimum of 3 months for good visual context
    const minSpan = Math.max(3, rawSpan);

    // Apply manual pre/post extensions
    const startIndexOffset = -extraPreMonths;
    const totalCount = minSpan + extraPreMonths + extraPostMonths;

    const result: MonthColumn[] = [];
    for (let i = 0; i < totalCount; i++) {
      const globalMonthIdx = baseStartMonth + startIndexOffset + i;
      const year = baseStartYear + Math.floor(globalMonthIdx / 12);
      const month = ((globalMonthIdx % 12) + 12) % 12;

      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0); // Last day of month
      const totalDays = endDate.getDate();

      const isCurrentMonth =
        today.getFullYear() === year && today.getMonth() === month;

      result.push({
        year,
        month,
        key,
        label: `${SPANISH_MONTHS_SHORT[month]} ${year}`,
        shortMonth: SPANISH_MONTHS_SHORT[month],
        fullLabel: `${SPANISH_MONTHS[month]} ${year}`,
        startDate,
        endDate,
        startDateStr: toISODate(startDate),
        endDateStr: toISODate(endDate),
        totalDays,
        isCurrentMonth,
      });
    }

    return result;
  }, [tasks, extraPreMonths, extraPostMonths]);

  // 2. Filter tasks based on search & filters
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

      return matchesSearch && matchesPhase && matchesStatus && matchesMilestone;
    });
  }, [tasks, searchTerm, selectedPhase, selectedStatus, onlyMilestones]);

  // 3. Tasks grouped by Phase
  const phaseGroupedTasks = useMemo(() => {
    const sortedPhases = [...phases].sort((a, b) => a.order - b.order);
    return sortedPhases.map((phase) => ({
      phase,
      tasks: filteredTasks.filter((t) => t.phaseId === phase.id),
      allPhaseTasksCount: tasks.filter((t) => t.phaseId === phase.id).length,
    }));
  }, [phases, filteredTasks, tasks]);

  // 4. Stats by Month (synchronously reflecting filteredTasks so cards and header counters update immediately)
  const monthStats = useMemo(() => {
    return months.map((m) => {
      // Filtered tasks visible in this month
      const tasksInMonth = filteredTasks.filter((t) => {
        return t.startDate <= m.endDateStr && t.endDate >= m.startDateStr;
      });

      // All project tasks in this month for context
      const totalTasksInMonth = tasks.filter((t) => {
        return t.startDate <= m.endDateStr && t.endDate >= m.startDateStr;
      });

      const milestonesInMonth = tasksInMonth.filter((t) => t.isMilestone);
      const completedTasks = tasksInMonth.filter((t) => t.status === 'completed');
      const holidaysInMonth = getHolidaysInRange(m.startDateStr, m.endDateStr, holidays);

      const avgProgress =
        tasksInMonth.length > 0
          ? Math.round(
              tasksInMonth.reduce((sum, t) => sum + t.progress, 0) / tasksInMonth.length
            )
          : 0;

      return {
        monthKey: m.key,
        tasksCount: tasksInMonth.length,
        totalTasksCount: totalTasksInMonth.length,
        milestonesCount: milestonesInMonth.length,
        completedCount: completedTasks.length,
        holidaysCount: holidaysInMonth.length,
        avgProgress,
        tasks: tasksInMonth,
      };
    });
  }, [months, filteredTasks, tasks, holidays]);

  // 5. Calculate precise task positioning across month columns (immune to 28/30/31 days variance)
  const getTaskBarPosition = (task: Task) => {
    if (months.length === 0) return null;

    const taskStart = parseDate(task.startDate);
    const taskEnd = parseDate(task.endDate);

    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];

    if (taskEnd < firstMonth.startDate || taskStart > lastMonth.endDate) {
      return null;
    }

    // Helper to calculate exact fractional position (0.0 to 1.0) across the entire grid
    const getDateCoordinate = (date: Date, isEnd: boolean): number => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const mIdx = months.findIndex((m) => m.key === key);

      if (mIdx === -1) {
        return date < firstMonth.startDate ? 0 : 1;
      }

      const m = months[mIdx];
      const dayNum = date.getDate();
      // For start date, offset from day start (dayNum - 1). For end date, offset to day end (dayNum).
      const fractionInMonth = isEnd
        ? Math.min(1, dayNum / m.totalDays)
        : Math.max(0, (dayNum - 1) / m.totalDays);

      return (mIdx + fractionInMonth) / months.length;
    };

    const startCoord = Math.max(0, getDateCoordinate(taskStart, false));
    const endCoord = Math.min(1, getDateCoordinate(taskEnd, true));

    const leftPercent = startCoord * 100;
    const widthPercent = Math.max(task.isMilestone ? 1.6 : 1.2, (endCoord - startCoord) * 100);

    return {
      left: `${Math.min(99.2, Math.max(0, leftPercent))}%`,
      width: `${Math.min(100 - leftPercent, widthPercent)}%`,
      durationDays: Math.max(1, diffDays(task.startDate, task.endDate) + 1),
    };
  };

  // Quick Action Handlers using onUpdateTask
  const handleToggleTaskComplete = (task: Task, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isCompleted = task.status === 'completed';
    onUpdateTask({
      ...task,
      status: isCompleted ? 'in_progress' : 'completed',
      progress: isCompleted ? 50 : 100,
    });
  };

  const handleStatusChange = (task: Task, newStatus: TaskStatus, e?: React.MouseEvent) => {
    e?.stopPropagation();
    let newProgress = task.progress;
    if (newStatus === 'completed' && task.progress < 100) {
      newProgress = 100;
    } else if (newStatus !== 'completed' && task.progress === 100) {
      newProgress = 50;
    }
    onUpdateTask({
      ...task,
      status: newStatus,
      progress: newProgress,
    });
  };

  const handleDeleteTaskConfirm = (task: Task, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onDeleteTask(task.id);
  };

  const handleJumpToMonth = (monthKey: string) => {
    setFocusedMonthKey(monthKey);

    if (viewMode === 'cards') {
      const cardElement = document.getElementById(`month-card-${monthKey}`);
      if (cardElement) {
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      const colElement = document.getElementById(`month-col-header-${monthKey}`);
      if (colElement) {
        colElement.scrollIntoView({ behavior: 'smooth', inline: 'center' });
      }
    }
  };

  const hasActiveFilters =
    Boolean(searchTerm) ||
    selectedPhase !== 'all' ||
    selectedStatus !== 'all' ||
    onlyMilestones;

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedPhase('all');
    setSelectedStatus('all');
    setOnlyMilestones(false);
  };

  const rowHeightClass = density === 'ultra' ? 'h-8 text-[11px]' : 'h-10 text-xs';
  const barHeightStyle = density === 'ultra' ? 'h-5 text-[10px]' : 'h-7 text-[11px]';

  return (
    <div className="flex flex-col flex-1 bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Top Controls Toolbar */}
      <div className="px-4 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        {/* Left: View Mode Toggle & Density */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-0.5 bg-slate-200/70 rounded-xl">
            <button
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Cronograma mensual en matriz continua horizontal"
            >
              <CalendarRange className="w-3.5 h-3.5" />
              <span>Matriz Cronograma</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Agrupación de actividades en tarjetas por cada mes"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Tarjetas por Mes</span>
            </button>
          </div>

          {viewMode === 'timeline' && (
            <div className="hidden sm:flex items-center p-0.5 bg-slate-200/60 rounded-lg text-[11px] font-semibold text-slate-600">
              <button
                onClick={() => setDensity('compact')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  density === 'compact' ? 'bg-white text-indigo-600 font-bold shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                Normal
              </button>
              <button
                onClick={() => setDensity('ultra')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  density === 'ultra' ? 'bg-white text-indigo-600 font-bold shadow-2xs' : 'hover:text-slate-900'
                }`}
                title="Filas compactas de 32px para visualizar más actividades a la vez"
              >
                Ultra Compacto
              </button>
            </div>
          )}

          {viewMode === 'timeline' && (
            <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-500 pl-1">
              <button
                onClick={expandAllPhases}
                className="px-2 py-1 hover:bg-slate-200/60 rounded transition-colors cursor-pointer"
              >
                Expandir
              </button>
              <span>·</span>
              <button
                onClick={collapseAllPhases}
                className="px-2 py-1 hover:bg-slate-200/60 rounded transition-colors cursor-pointer"
              >
                Colapsar
              </button>
            </div>
          )}

          {/* Month Range Adjusters */}
          <div className="hidden lg:flex items-center gap-1 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded-lg border border-slate-200/80">
            <span className="text-slate-500 font-medium px-1">Rango:</span>
            <button
              type="button"
              onClick={() => setExtraPreMonths((p) => p + 1)}
              className="px-1.5 py-0.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded font-medium cursor-pointer"
              title="Añadir un mes previo al inicio del cronograma"
            >
              + Mes Antes
            </button>
            <button
              type="button"
              onClick={() => setExtraPostMonths((p) => p + 1)}
              className="px-1.5 py-0.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded font-medium cursor-pointer"
              title="Añadir un mes posterior al final del cronograma"
            >
              + Mes Después
            </button>
            {(extraPreMonths > 0 || extraPostMonths > 0) && (
              <button
                type="button"
                onClick={() => {
                  setExtraPreMonths(0);
                  setExtraPostMonths(0);
                }}
                className="px-1.5 py-0.5 text-amber-600 hover:text-amber-800 hover:bg-white rounded font-bold cursor-pointer"
                title="Restablecer rango exacto del proyecto"
              >
                Restablecer
              </button>
            )}
          </div>
        </div>

        {/* Right: Search & Filters */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar tarea o responsable..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 sm:w-56"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={selectedPhase}
            onChange={(e) => setSelectedPhase(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Todas las Fases</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Todos los Estados</option>
            <option value="pending">Pendientes</option>
            <option value="in_progress">En Progreso</option>
            <option value="review">En Revisión</option>
            <option value="completed">Completadas</option>
            <option value="blocked">Bloqueadas</option>
          </select>

          <button
            onClick={() => setOnlyMilestones(!onlyMilestones)}
            className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              onlyMilestones
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Flag className="w-3 h-3 text-indigo-600" />
            <span>Hitos</span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline px-1 cursor-pointer"
            >
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Monthly KPI Overview Strip with Clickable Month Jump Chips */}
      <div className="px-4 py-2 bg-indigo-50/40 border-b border-slate-200/80 flex items-center justify-between text-xs overflow-x-auto gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-bold text-slate-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Resumen Mensual:
          </span>
          <span className="text-slate-600">
            <strong className="text-slate-900">{months.length}</strong> meses
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">
            <strong className="text-slate-900">{filteredTasks.length}</strong> de {tasks.length} actividades
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">
            <strong className="text-indigo-700">
              {filteredTasks.filter((t) => t.isMilestone).length}
            </strong>{' '}
            hitos
          </span>
        </div>

        {/* Quick Month Jump Chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-slate-400 font-medium mr-1 hidden sm:inline">
            Ir a mes:
          </span>
          {months.map((m) => {
            const st = monthStats.find((s) => s.monthKey === m.key);
            const isSelected = focusedMonthKey === m.key;

            return (
              <button
                key={m.key}
                type="button"
                onClick={() => handleJumpToMonth(m.key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all cursor-pointer ${
                  m.isCurrentMonth
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-bold'
                    : isSelected
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-400 ring-2 ring-indigo-300'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title={`Haz clic para ver ${m.fullLabel} (${st?.tasksCount || 0} actividades)`}
              >
                <span>{m.shortMonth}</span>
                <span
                  className={`text-[10px] px-1 rounded-full ${
                    m.isCurrentMonth
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-600 font-semibold'
                  }`}
                >
                  {st?.tasksCount || 0}
                </span>
                {(st?.holidaysCount || 0) > 0 && (
                  <span title={`${st?.holidaysCount} feriado(s) en este mes`}>
                    <Palmtree className="w-2.5 h-2.5 text-amber-500 inline" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'timeline' ? (
          /* ========================================================
             MODE 1: COMPACT MONTHLY ROADMAP MATRIX (TIMELINE)
             ======================================================== */
          <div ref={timelineScrollRef} className="min-w-[880px] select-none">
            {/* Header: Fixed WBS Label + Month Headers */}
            <div className="sticky top-0 z-20 flex bg-slate-100/95 backdrop-blur-xs border-b border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
              {/* Left Column Header: Tasks */}
              <div className="w-[330px] shrink-0 px-3 py-2.5 border-r border-slate-200 flex items-center justify-between">
                <span>Actividad / WBS</span>
                <span className="text-[10px] font-normal text-slate-400">Reordenar: ↑ / ↓</span>
              </div>

              {/* Right Month Columns */}
              <div
                className="flex-1 grid"
                style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
              >
                {months.map((m) => {
                  const stat = monthStats.find((s) => s.monthKey === m.key);
                  const isFocused = focusedMonthKey === m.key;

                  return (
                    <div
                      key={m.key}
                      id={`month-col-header-${m.key}`}
                      onClick={() => setFocusedMonthKey(m.key)}
                      className={`px-2 py-2 border-r border-slate-200/80 text-center flex flex-col justify-center items-center transition-colors cursor-pointer ${
                        m.isCurrentMonth
                          ? 'bg-indigo-50/90 border-b-2 border-b-indigo-600'
                          : isFocused
                          ? 'bg-indigo-100/60 border-b-2 border-b-indigo-400'
                          : 'hover:bg-slate-200/50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800">{m.label}</span>
                        {m.isCurrentMonth && (
                          <span className="text-[9px] font-bold bg-indigo-600 text-white px-1 py-0.2 rounded">
                            Hoy
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-normal text-slate-500 mt-0.5">
                        <span className="font-medium">{stat?.tasksCount || 0} act.</span>
                        {stat && stat.milestonesCount > 0 && (
                          <span className="text-indigo-600 font-semibold flex items-center">
                            <Flag className="w-2.5 h-2.5 inline mr-0.5 text-indigo-600" />
                            {stat.milestonesCount}
                          </span>
                        )}
                        {stat && stat.holidaysCount > 0 && (
                          <span
                            className="text-amber-700 font-medium"
                            title={`${stat.holidaysCount} día(s) feriado(s) en este mes`}
                          >
                            🏖️ {stat.holidaysCount}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Empty State when no tasks match filters */}
            {filteredTasks.length === 0 && (
              <div className="py-16 text-center text-slate-500">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">
                  No se encontraron actividades con los filtros actuales
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-3 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
                >
                  Restablecer Filtros
                </button>
              </div>
            )}

            {/* Rows grouped by Phase */}
            {phaseGroupedTasks.map(({ phase, tasks: pTasks, allPhaseTasksCount }) => {
              const isCollapsed = collapsedPhases[phase.id];

              if (pTasks.length === 0 && hasActiveFilters) {
                return null;
              }

              return (
                <div key={phase.id} className="border-b border-slate-200">
                  {/* Phase Row */}
                  <div
                    className="flex bg-slate-50 hover:bg-slate-100/70 transition-colors border-b border-slate-200/70 cursor-pointer"
                    onClick={() => togglePhaseCollapse(phase.id)}
                  >
                    <div className="w-[330px] shrink-0 px-3 py-1.5 border-r border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: phase.color }}
                        />
                        <span className="font-bold text-slate-800 text-xs truncate">
                          {phase.name}
                        </span>
                        <span className="text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded-md border border-slate-200 ml-1">
                          {pTasks.length}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddTaskInPhase(phase.id);
                        }}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition-colors cursor-pointer"
                        title="Añadir tarea en esta fase"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Phase Right Bar in Month Grid */}
                    <div
                      className="flex-1 grid relative bg-slate-50/50"
                      style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
                    >
                      {months.map((m) => (
                        <div
                          key={m.key}
                          className={`border-r border-slate-200/40 h-full ${
                            m.isCurrentMonth
                              ? 'bg-indigo-50/20'
                              : focusedMonthKey === m.key
                              ? 'bg-indigo-50/30'
                              : ''
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Task Rows inside Phase */}
                  {!isCollapsed &&
                    pTasks.map((task) => {
                      const pos = getTaskBarPosition(task);
                      const isBeingDragged = draggedTaskId === task.id;
                      const isDropBefore =
                        dragOverTarget?.id === task.id && dragOverTarget?.position === 'before';
                      const isDropAfter =
                        dragOverTarget?.id === task.id && dragOverTarget?.position === 'after';
                      const statusMeta = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                      const wDays =
                        task.workingDays ?? countWorkingDays(task.startDate, task.endDate, holidays);

                      return (
                        <div
                          key={task.id}
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', task.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggedTaskId(task.id);
                          }}
                          onDragEnd={() => {
                            setDraggedTaskId(null);
                            setDragOverTarget(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (!draggedTaskId || draggedTaskId === task.id) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const relY = e.clientY - rect.top;
                            const position = relY < rect.height / 2 ? 'before' : 'after';
                            setDragOverTarget({ id: task.id, position });
                          }}
                          onDragLeave={() => {
                            if (dragOverTarget?.id === task.id) {
                              setDragOverTarget(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (!draggedTaskId || draggedTaskId === task.id) return;
                            const p = dragOverTarget?.position || 'after';
                            onReorderTasks?.(draggedTaskId, task.id, p);
                            setDraggedTaskId(null);
                            setDragOverTarget(null);
                          }}
                          className={`flex border-b border-slate-100 hover:bg-slate-50/80 transition-all group ${
                            rowHeightClass
                          } ${isBeingDragged ? 'opacity-35 bg-indigo-50/50' : ''} ${
                            isDropBefore ? 'border-t-2 border-t-indigo-600 bg-indigo-50/40' : ''
                          } ${
                            isDropAfter ? 'border-b-2 border-b-indigo-600 bg-indigo-50/40' : ''
                          }`}
                        >
                          {/* Left Column: Task Name & Actions */}
                          <div className="w-[330px] shrink-0 px-2.5 border-r border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                              {/* Drag Grip */}
                              <div
                                className="cursor-grab active:cursor-grabbing p-0.5 text-slate-300 group-hover:text-slate-500 hover:text-indigo-600 transition-colors"
                                title="Arrastra para reordenar actividad"
                              >
                                <GripVertical className="w-3 h-3" />
                              </div>

                              {/* Quick Complete Checkbox */}
                              <button
                                type="button"
                                onClick={(e) => handleToggleTaskComplete(task, e)}
                                className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                                  task.status === 'completed'
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'border-slate-300 hover:border-indigo-500 bg-white'
                                }`}
                                title={
                                  task.status === 'completed'
                                    ? 'Marcar como pendiente / en progreso'
                                    : 'Marcar como 100% completada'
                                }
                              >
                                {task.status === 'completed' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </button>

                              {task.isMilestone ? (
                                <Flag className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              ) : (
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: task.color || phase.color }}
                                />
                              )}

                              <span
                                className={`truncate font-medium cursor-pointer hover:text-indigo-600 transition-colors ${
                                  task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'
                                }`}
                                title={`${task.name}\nFechas: ${formatDateShort(task.startDate)} al ${formatDateShort(task.endDate)} (${wDays} días hábiles)\nProgreso: ${task.progress}%\nEstado: ${statusMeta.label}`}
                                onClick={() => onEditTaskModal(task)}
                              >
                                {task.name}
                              </span>
                            </div>

                            {/* Up/Down buttons + Avatar + Edit + Duplicate + Delete */}
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Reorder Up/Down */}
                              {onMoveTask && (
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => onMoveTask(task.id, 'up')}
                                    className="p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded cursor-pointer"
                                    title="Subir tarea"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onMoveTask(task.id, 'down')}
                                    className="p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded cursor-pointer"
                                    title="Bajar tarea"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                </div>
                              )}

                              {/* Assignee Avatar */}
                              <div
                                className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                style={{ backgroundColor: task.assignee.avatarColor }}
                                title={`Responsable: ${task.assignee.name}`}
                              >
                                {task.assignee.name.charAt(0)}
                              </div>

                              {/* Edit Modal */}
                              <button
                                onClick={() => onEditTaskModal(task)}
                                className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                title="Editar detalles de la tarea"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>

                              {/* Duplicate */}
                              {onDuplicateTask && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDuplicateTask(task);
                                  }}
                                  className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                  title="Duplicar tarea"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={(e) => handleDeleteTaskConfirm(task, e)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                title="Eliminar tarea"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Right Column: Month Grid with Continuous Timeline Bar Overlay */}
                          <div
                            className="flex-1 relative grid"
                            style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
                          >
                            {/* Background Month Column Guidelines */}
                            {months.map((m) => (
                              <div
                                key={m.key}
                                className={`border-r border-slate-100 h-full ${
                                  m.isCurrentMonth
                                    ? 'bg-indigo-50/15'
                                    : focusedMonthKey === m.key
                                    ? 'bg-indigo-50/25'
                                    : ''
                                }`}
                              />
                            ))}

                            {/* Full-width Bar Overlay (prevents CSS Grid cell placement bug) */}
                            <div className="absolute inset-0 pointer-events-none flex items-center">
                              {pos && (
                                <div
                                  onClick={() => onEditTaskModal(task)}
                                  style={{
                                    left: pos.left,
                                    width: pos.width,
                                  }}
                                  className={`pointer-events-auto absolute ${barHeightStyle} rounded-md shadow-2xs cursor-pointer transition-all hover:ring-2 hover:ring-indigo-400 flex items-center px-1.5 overflow-hidden select-none ${
                                    task.isMilestone
                                      ? 'bg-gradient-to-r from-amber-500 to-indigo-600 text-white font-bold'
                                      : 'text-white'
                                  }`}
                                  title={`${task.name}\n${formatDateShort(task.startDate)} al ${formatDateShort(task.endDate)} (${wDays} días hábiles)\nProgreso: ${task.progress}%`}
                                >
                                  {/* Background color fill */}
                                  {!task.isMilestone && (
                                    <>
                                      <div
                                        className="absolute inset-0 opacity-85"
                                        style={{ backgroundColor: task.color || phase.color }}
                                      />
                                      {/* Progress fill */}
                                      <div
                                        className="absolute inset-y-0 left-0 bg-black/25 transition-all"
                                        style={{ width: `${task.progress}%` }}
                                      />
                                    </>
                                  )}

                                  {/* Content inside compact bar */}
                                  <div className="relative z-10 flex items-center gap-1.5 w-full text-white truncate drop-shadow-xs">
                                    {task.isMilestone ? (
                                      <Flag className="w-3 h-3 shrink-0 text-amber-200" />
                                    ) : (
                                      <span className="text-[10px] font-bold shrink-0">
                                        {task.progress}%
                                      </span>
                                    )}
                                    <span className="truncate text-[10px] font-medium leading-none">
                                      {task.name}
                                    </span>
                                    <span className="text-[9px] opacity-80 shrink-0 hidden md:inline ml-auto font-medium">
                                      ({wDays}d háb)
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        ) : (
          /* ========================================================
             MODE 2: MONTHLY CARDS ROADMAP (TARJETAS POR MES)
             ======================================================== */
          <div
            ref={cardsContainerRef}
            className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {months.map((m) => {
              const stat = monthStats.find((s) => s.monthKey === m.key);
              const monthTasks = stat?.tasks || [];
              const monthHolidays = getHolidaysInRange(m.startDateStr, m.endDateStr, holidays);
              const isFocused = focusedMonthKey === m.key;

              return (
                <div
                  key={m.key}
                  id={`month-card-${m.key}`}
                  className={`bg-white border rounded-xl flex flex-col shadow-2xs overflow-hidden transition-all ${
                    m.isCurrentMonth
                      ? 'border-indigo-400 ring-2 ring-indigo-500/20'
                      : isFocused
                      ? 'border-indigo-400 ring-2 ring-indigo-300'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Card Header */}
                  <div
                    className={`px-3.5 py-3 border-b flex items-center justify-between ${
                      m.isCurrentMonth
                        ? 'bg-indigo-50/80 border-indigo-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 text-sm">{m.fullLabel}</span>
                        {m.isCurrentMonth && (
                          <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                            Mes Actual
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {monthTasks.length} de {stat?.totalTasksCount || 0} actividades
                      </span>
                    </div>

                    {/* Progress Badge */}
                    <div className="text-right">
                      <span className="text-xs font-bold text-indigo-700">
                        {stat?.avgProgress || 0}%
                      </span>
                      <div className="w-12 h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full transition-all"
                          style={{ width: `${stat?.avgProgress || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Holidays Banner if any */}
                  {monthHolidays.length > 0 && (
                    <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-800 flex items-center gap-1">
                      <Palmtree className="w-3 h-3 text-amber-600 shrink-0" />
                      <span className="truncate">
                        <strong>Feriados ({monthHolidays.length}):</strong>{' '}
                        {monthHolidays.map((h) => h.name).join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Task Cards List for this Month */}
                  <div className="p-2.5 flex-1 flex flex-col gap-2 overflow-y-auto max-h-[500px]">
                    {monthTasks.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        {hasActiveFilters
                          ? 'No hay actividades con los filtros actuales'
                          : 'No hay actividades programadas para este mes'}
                      </div>
                    ) : (
                      monthTasks.map((t) => {
                        const phase = phases.find((p) => p.id === t.phaseId);
                        const statusMeta = STATUS_CONFIG[t.status] || STATUS_CONFIG.pending;
                        const wDays =
                          t.workingDays ?? countWorkingDays(t.startDate, t.endDate, holidays);

                        return (
                          <div
                            key={t.id}
                            onClick={() => onEditTaskModal(t)}
                            className="p-2.5 bg-white hover:bg-slate-50/80 border border-slate-200/80 hover:border-indigo-300 rounded-lg shadow-2xs transition-all cursor-pointer group"
                          >
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: `${phase?.color || '#6366f1'}18`,
                                  color: phase?.color || '#6366f1',
                                }}
                              >
                                {phase?.name.split(' ')[0] || 'Fase'}
                              </span>

                              {t.isMilestone && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  <Flag className="w-2.5 h-2.5 text-amber-600" />
                                  Hito
                                </span>
                              )}

                              {/* Status Selector Dropdown */}
                              <select
                                value={t.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  handleStatusChange(t, e.target.value as TaskStatus)
                                }
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border focus:outline-none cursor-pointer ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}
                              >
                                <option value="pending">Pendiente</option>
                                <option value="in_progress">En Progreso</option>
                                <option value="review">En Revisión</option>
                                <option value="completed">Completada</option>
                                <option value="blocked">Bloqueada</option>
                              </select>
                            </div>

                            <h4
                              className={`text-xs font-semibold group-hover:text-indigo-600 transition-colors line-clamp-2 ${
                                t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'
                              }`}
                            >
                              {t.name}
                            </h4>

                            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 font-medium">
                              <span className="flex items-center gap-0.5">
                                <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                {formatDateShort(t.startDate)} - {formatDateShort(t.endDate)}
                              </span>
                              <span>·</span>
                              <span>{wDays}d hábiles</span>
                            </div>

                            {t.deliverable && (
                              <p className="text-[10px] text-slate-500 mt-1 truncate">
                                🎯 {t.deliverable}
                              </p>
                            )}

                            {/* Footer: Progress & Quick Action Buttons */}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                              {/* Quick Complete Button + Progress */}
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleTaskComplete(t, e)}
                                  className={`w-4 h-4 rounded flex items-center justify-center border transition-all cursor-pointer ${
                                    t.status === 'completed'
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'border-slate-300 hover:border-indigo-500 bg-white'
                                  }`}
                                  title={
                                    t.status === 'completed'
                                      ? 'Reabrir tarea'
                                      : 'Marcar como completada'
                                  }
                                >
                                  {t.status === 'completed' && <Check className="w-3 h-3 stroke-[3]" />}
                                </button>

                                <span className="font-bold text-slate-700">{t.progress}%</span>
                                <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-600 rounded-full transition-all"
                                    style={{ width: `${t.progress}%` }}
                                  />
                                </div>
                              </div>

                              {/* Assignee & Action Buttons */}
                              <div className="flex items-center gap-1 text-slate-600">
                                {onDuplicateTask && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDuplicateTask(t);
                                    }}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                    title="Duplicar tarea"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteTaskConfirm(t, e)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                  title="Eliminar tarea"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>

                                <div
                                  className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ml-0.5"
                                  style={{ backgroundColor: t.assignee.avatarColor }}
                                  title={`Responsable: ${t.assignee.name}`}
                                >
                                  {t.assignee.name.charAt(0)}
                                </div>
                                <span className="text-[10px] font-medium truncate max-w-[70px]">
                                  {t.assignee.name.split(' ')[0]}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
