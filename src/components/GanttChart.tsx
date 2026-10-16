import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Task, Phase, Assignee, ZoomLevel, DragState, Holiday } from '../types';
import {
  diffDays,
  addDays,
  parseDate,
  toISODate,
  formatDateShort,
  getMonthYearName,
  getDayName,
  isWeekend,
  isToday,
  getHoliday,
  getTimelineBounds,
  calculateCriticalPath,
  countWorkingDays,
  calculateEndDateFromWorkingDays,
  ensureWorkingDay,
  ensurePreviousWorkingDay,
  getHolidaysInRange,
  sanitizeTaskDependencies,
} from '../utils/dateUtils';
import {
  Calendar,
  CalendarDays,
  ChevronRight,
  ChevronDown,
  Edit2,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Link as LinkIcon,
  Flame,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Flag,
  User,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Workflow,
  Copy,
  Lock,
  Unlock,
  Download,
  FileSpreadsheet,
} from 'lucide-react';

interface GanttChartProps {
  tasks: Task[];
  phases: Phase[];
  assignees: Assignee[];
  holidays?: Holiday[];
  isScheduleLocked?: boolean;
  onToggleScheduleLock?: () => void;
  onOpenExportModal?: () => void;
  onExportExcel?: () => void;
  onUpdateTask: (task: Task) => void;
  onEditTaskModal: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onAddTaskInPhase: (phaseId: string) => void;
  onDuplicateTask?: (task: Task) => void;
  onClearAllDependencies?: () => void;
  onOpenHolidaysModal?: () => void;
  onMoveTask?: (taskId: string, direction: 'up' | 'down') => void;
  onReorderTasks?: (
    draggedTaskId: string,
    targetTaskId: string | null,
    position: 'before' | 'after' | 'inside_phase',
    targetPhaseId?: string
  ) => void;
}

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 58;

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  phases,
  assignees,
  holidays = [],
  isScheduleLocked = false,
  onToggleScheduleLock,
  onOpenExportModal,
  onExportExcel,
  onUpdateTask,
  onEditTaskModal,
  onDeleteTask,
  onAddTaskInPhase,
  onDuplicateTask,
  onClearAllDependencies,
  onOpenHolidaysModal,
  onMoveTask,
  onReorderTasks,
}) => {
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [showDependencies, setShowDependencies] = useState<boolean>(true);
  const [showCriticalPath, setShowCriticalPath] = useState<boolean>(false);
  const [highlightOmittedByConsultant, setHighlightOmittedByConsultant] = useState<boolean>(false);
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [tableWidth, setTableWidth] = useState<number>(380);
  const [isTableCollapsed, setIsTableCollapsed] = useState<boolean>(false);

  // Tasks considered internally but NOT by consultant
  const omittedByConsultantCount = useMemo(
    () => tasks.filter((t) => t.notConsideredByConsultant).length,
    [tasks]
  );

  // Drag & drop reordering state for left WBS table
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    id: string;
    type: 'task' | 'phase';
    position?: 'before' | 'after';
  } | null>(null);

  // Total dependencies in project
  const totalDependenciesCount = useMemo(
    () => tasks.reduce((sum, t) => sum + t.dependencies.length, 0),
    [tasks]
  );

  // Dragging session and live preview
  const [dragPreview, setDragPreview] = useState<{
    taskId: string;
    type: 'move' | 'resize-start' | 'resize-end';
    startDate: string;
    endDate: string;
    progress: number;
    daysDelta: number;
  } | null>(null);

  const dragSessionRef = useRef<{
    type: 'move' | 'resize-start' | 'resize-end';
    task: Task;
    startX: number;
    initialStartDate: string;
    initialEndDate: string;
    initialProgress: number;
    hasMoved: boolean;
  } | null>(null);

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const todayMarkerRef = useRef<HTMLDivElement>(null);

  // Column width per day based on zoom
  const dayWidth = useMemo(() => {
    switch (zoom) {
      case 'day':
        return 42;
      case 'week':
        return 26;
      case 'month':
        return 14;
      default:
        return 26;
    }
  }, [zoom]);

  // Timeline start and end boundaries
  const bounds = useMemo(() => getTimelineBounds(tasks), [tasks]);
  const timelineStartDateStr = useMemo(() => toISODate(bounds.start), [bounds.start]);

  // Array of all calendar days in view
  const daysArray = useMemo(() => {
    const days: Date[] = [];
    const curr = new Date(bounds.start);
    for (let i = 0; i < bounds.totalDays; i++) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [bounds]);

  // Critical path calculation
  const criticalTaskIds = useMemo(() => calculateCriticalPath(tasks), [tasks]);

  // Grouped tasks by phase
  const groupedTasks = useMemo(() => {
    const groups: { phase: Phase; tasks: Task[] }[] = [];
    phases
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((phase) => {
        const phaseTasks = tasks.filter((t) => t.phaseId === phase.id);
        groups.push({ phase, tasks: phaseTasks });
      });
    return groups;
  }, [phases, tasks]);

  // Visible flattened rows
  type VisibleRow =
    | { type: 'phase'; phase: Phase; height: number }
    | { type: 'task'; task: Task; phase: Phase; height: number; index: number };

  const visibleRows = useMemo(() => {
    const rows: VisibleRow[] = [];
    let taskIdx = 0;
    groupedTasks.forEach(({ phase, tasks: pTasks }) => {
      rows.push({ type: 'phase', phase, height: 36 });
      if (!collapsedPhases[phase.id]) {
        pTasks.forEach((t) => {
          rows.push({ type: 'task', task: t, phase, height: ROW_HEIGHT, index: taskIdx++ });
        });
      }
    });
    return rows;
  }, [groupedTasks, collapsedPhases]);

  // Map each task to its row Y coordinate for rendering Gantt bars & dependency lines
  const taskRowPositions = useMemo(() => {
    const posMap = new Map<string, number>();
    let currentY = 0;
    visibleRows.forEach((row) => {
      if (row.type === 'task') {
        posMap.set(row.task.id, currentY);
      }
      currentY += row.height;
    });
    return posMap;
  }, [visibleRows]);

  const totalContentHeight = useMemo(() => {
    return visibleRows.reduce((sum, r) => sum + r.height, 0);
  }, [visibleRows]);

  // Synchronize scroll between left table and right timeline
  const isSyncingScrollRef = useRef<boolean>(false);

  const handleTimelineScroll = useCallback(() => {
    if (isSyncingScrollRef.current) return;
    if (timelineScrollRef.current && tableScrollRef.current) {
      isSyncingScrollRef.current = true;
      tableScrollRef.current.scrollTop = timelineScrollRef.current.scrollTop;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    }
  }, []);

  const handleTableScroll = useCallback(() => {
    if (isSyncingScrollRef.current) return;
    if (tableScrollRef.current && timelineScrollRef.current) {
      isSyncingScrollRef.current = true;
      timelineScrollRef.current.scrollTop = tableScrollRef.current.scrollTop;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    }
  }, []);

  // Jump to today
  const scrollToToday = useCallback(() => {
    const todayStr = toISODate(new Date());
    const daysFromStart = diffDays(timelineStartDateStr, todayStr);
    if (timelineScrollRef.current) {
      const scrollPos = Math.max(0, daysFromStart * dayWidth - 280);
      timelineScrollRef.current.scrollTo({ left: scrollPos, behavior: 'smooth' });
    }
  }, [timelineStartDateStr, dayWidth]);

  useEffect(() => {
    // Initial jump to today after mount
    const timer = setTimeout(scrollToToday, 250);
    return () => clearTimeout(timer);
  }, [scrollToToday]);

  // Phase collapse toggle
  const togglePhaseCollapse = (phaseId: string) => {
    setCollapsedPhases((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  // Drag handling on Gantt bars: separates clicks (which open the task modal) from drags (which move/resize dates)
  const handleBarPointerDown = (
    e: React.PointerEvent,
    type: 'move' | 'resize-start' | 'resize-end',
    task: Task
  ) => {
    // Only primary button
    if (e.button !== 0) return;
    e.stopPropagation();

    dragSessionRef.current = {
      type,
      task,
      startX: e.clientX,
      initialStartDate: task.startDate,
      initialEndDate: task.endDate,
      initialProgress: task.progress,
      hasMoved: false,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      const deltaX = moveEvent.clientX - session.startX;
      if (!session.hasMoved && Math.abs(deltaX) > 3) {
        session.hasMoved = true;
      }

      if (!session.hasMoved || isScheduleLocked) return;

      const daysDelta = Math.round(deltaX / dayWidth);

      if (session.type === 'move') {
        const candidateStart = addDays(session.initialStartDate, daysDelta);
        const validStart = ensureWorkingDay(candidateStart, holidays);
        const originalWorkingDays = Math.max(
          1,
          countWorkingDays(session.initialStartDate, session.initialEndDate, holidays)
        );
        const validEnd = session.task.isMilestone
          ? validStart
          : calculateEndDateFromWorkingDays(validStart, originalWorkingDays, holidays);

        setDragPreview({
          taskId: session.task.id,
          type: 'move',
          startDate: validStart,
          endDate: validEnd,
          progress: session.initialProgress,
          daysDelta,
        });
      } else if (session.type === 'resize-start') {
        const candidateStart = addDays(session.initialStartDate, daysDelta);
        const validStart = ensureWorkingDay(candidateStart, holidays);
        if (validStart <= session.initialEndDate) {
          setDragPreview({
            taskId: session.task.id,
            type: 'resize-start',
            startDate: validStart,
            endDate: session.initialEndDate,
            progress: session.initialProgress,
            daysDelta,
          });
        }
      } else if (session.type === 'resize-end') {
        const candidateEnd = addDays(session.initialEndDate, daysDelta);
        if (candidateEnd >= session.initialStartDate) {
          const validEnd = ensurePreviousWorkingDay(candidateEnd, holidays);
          const finalEnd = validEnd >= session.initialStartDate ? validEnd : candidateEnd;
          setDragPreview({
            taskId: session.task.id,
            type: 'resize-end',
            startDate: session.initialStartDate,
            endDate: finalEnd,
            progress: session.initialProgress,
            daysDelta,
          });
        }
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      const session = dragSessionRef.current;
      dragSessionRef.current = null;

      if (!session) return;

      if (!session.hasMoved) {
        // User clicked without dragging: immediately open task editor!
        setSelectedTaskId(session.task.id);
        onEditTaskModal(session.task);
        setDragPreview(null);
        return;
      }

      // User dragged: apply the changes
      setDragPreview((currentPreview) => {
        if (currentPreview && currentPreview.taskId === session.task.id && !isScheduleLocked) {
          const hasChanged =
            session.task.startDate !== currentPreview.startDate ||
            session.task.endDate !== currentPreview.endDate;

          if (hasChanged) {
            const calculatedWDays = countWorkingDays(
              currentPreview.startDate,
              currentPreview.endDate,
              holidays
            );
            onUpdateTask({
              ...session.task,
              startDate: currentPreview.startDate,
              endDate: currentPreview.endDate,
              workingDays: calculatedWDays,
            });
          }
        }
        return null;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };


  // Dependency curves renderer
  const renderDependencyLines = () => {
    if (!showDependencies) return null;

    const lines: React.ReactNode[] = [];

    tasks.forEach((targetTask) => {
      const targetY = taskRowPositions.get(targetTask.id);
      if (targetY === undefined) return;

      targetTask.dependencies.forEach((sourceTaskId) => {
        const sourceTask = tasks.find((t) => t.id === sourceTaskId);
        const sourceY = taskRowPositions.get(sourceTaskId);
        if (!sourceTask || sourceY === undefined) return;

        // Calculate coordinates
        // Source end point: right edge of source bar
        const sourceStartDays = diffDays(timelineStartDateStr, sourceTask.startDate);
        const sourceDur = Math.max(1, diffDays(sourceTask.startDate, sourceTask.endDate) + 1);
        const sourceLeftPx = sourceStartDays * dayWidth;
        const sourceWidthPx = sourceTask.isMilestone ? 28 : Math.max(dayWidth * 0.8, sourceDur * dayWidth);
        const x1 = sourceTask.isMilestone
          ? sourceLeftPx + dayWidth / 2 + 10
          : sourceLeftPx + sourceWidthPx;
        const y1 = sourceY + 22;

        // Target start point: left edge of target bar
        const targetStartDays = diffDays(timelineStartDateStr, targetTask.startDate);
        const targetLeftPx = targetStartDays * dayWidth;
        const x2 = targetTask.isMilestone
          ? targetLeftPx + dayWidth / 2 - 10
          : targetLeftPx;
        const y2 = targetY + 22;

        // Validate coordinates to prevent SVG rendering crashes
        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
          return;
        }

        // Check if both tasks are on the critical path
        const isCriticalLine =
          showCriticalPath &&
          criticalTaskIds.has(sourceTaskId) &&
          criticalTaskIds.has(targetTask.id);

        // Smooth curved path
        const dx = Math.abs(x2 - x1);
        const curveOffset = Math.min(30, Math.max(14, dx / 2));
        const pathD = `M ${x1} ${y1} C ${x1 + curveOffset} ${y1}, ${x2 - curveOffset} ${y2}, ${x2} ${y2}`;

        lines.push(
          <g key={`${sourceTaskId}->${targetTask.id}`}>
            <path
              d={pathD}
              fill="none"
              stroke={isCriticalLine ? '#ef4444' : '#94a3b8'}
              strokeWidth={isCriticalLine ? 2.5 : 1.5}
              strokeDasharray={isCriticalLine ? 'none' : '3 2'}
              className="transition-colors"
            />
            {/* Arrowhead */}
            <polygon
              points={`${x2},${y2} ${x2 - 6},${y2 - 3.5} ${x2 - 6},${y2 + 3.5}`}
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

  // Months groupings for timeline header
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

  return (
    <div id="gantt-root-container" className="flex flex-col h-full bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50/90 border-b border-slate-200 text-slate-700">
        <div className="flex items-center space-x-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            {(['day', 'week', 'month'] as ZoomLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setZoom(level)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                  zoom === level
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {level === 'day' ? 'Días' : level === 'week' ? 'Semanas' : 'Meses'}
              </button>
            ))}
          </div>

          {/* Jump to today button */}
          <button
            id="gantt-today-btn"
            onClick={scrollToToday}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition-all shadow-2xs cursor-pointer"
            title="Centrar vista en el día de hoy"
          >
            <Crosshair className="w-3.5 h-3.5 text-indigo-600" />
            <span>Hoy</span>
          </button>
        </div>

        {/* Feature Toggles */}
        <div className="flex items-center space-x-2">
          {/* Omitted by Consultant Toggle */}
          <button
            id="gantt-consultant-omitted-toggle"
            onClick={() => setHighlightOmittedByConsultant(!highlightOmittedByConsultant)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              highlightOmittedByConsultant
                ? 'bg-amber-100 text-amber-950 border-amber-400 shadow-xs ring-2 ring-amber-300/40'
                : omittedByConsultantCount > 0
                ? 'bg-amber-50/70 text-amber-900 border-amber-200 hover:bg-amber-100/70'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title="Resaltar tareas consideradas internamente pero NO contempladas por la consultora externa"
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${omittedByConsultantCount > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
            <span>No en Consultora ({omittedByConsultantCount})</span>
          </button>

          {/* Critical Path Toggle */}
          <button
            id="gantt-critical-path-toggle"
            onClick={() => setShowCriticalPath(!showCriticalPath)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              showCriticalPath
                ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title="Resaltar las tareas de la ruta crítica que determinan el plazo total del proyecto"
          >
            <Flame className={`w-3.5 h-3.5 ${showCriticalPath ? 'text-rose-600' : 'text-slate-400'}`} />
            <span>Ruta Crítica ({criticalTaskIds.size})</span>
          </button>

          {/* Unified Schedule Controls Group: Fijar Fechas, Feriados, and Predecesoras in ONE single place */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            {/* Fijar Fechas Toggle */}
            {onToggleScheduleLock && (
              <button
                id="gantt-lock-schedule-btn"
                onClick={onToggleScheduleLock}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  isScheduleLocked
                    ? 'bg-amber-500 text-white shadow-xs hover:bg-amber-600'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
                title={
                  isScheduleLocked
                    ? 'Cronograma FIJADO (Fechas bloqueadas). Haz clic para desbloquear.'
                    : 'Fijar Cronograma: Bloquea las fechas contra movimientos accidentales.'
                }
              >
                {isScheduleLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Fechas Fijadas</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Fijar Fechas</span>
                  </>
                )}
              </button>
            )}

            <span className="w-px h-4 bg-slate-200 mx-0.5" />

            {/* Feriados */}
            {onOpenHolidaysModal && (
              <button
                id="gantt-holidays-btn"
                onClick={onOpenHolidaysModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-amber-800 hover:bg-amber-50 transition-all cursor-pointer"
                title="Configurar calendario de feriados y días no laborables"
              >
                <CalendarDays className="w-3.5 h-3.5 text-amber-600" />
                <span>Feriados ({holidays.length})</span>
              </button>
            )}

            <span className="w-px h-4 bg-slate-200 mx-0.5" />

            {/* Predecesoras: Toggle Enlaces & Quitar Predecesoras */}
            <button
              id="gantt-dependencies-toggle"
              onClick={() => setShowDependencies(!showDependencies)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                showDependencies ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
              title={showDependencies ? 'Ocultar flechas de predecesoras' : 'Mostrar flechas de predecesoras'}
            >
              <LinkIcon className={`w-3.5 h-3.5 ${showDependencies ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>Enlaces ({totalDependenciesCount})</span>
            </button>

            {totalDependenciesCount > 0 && onClearAllDependencies && (
              <button
                id="gantt-clear-dependencies-prominent-btn"
                onClick={onClearAllDependencies}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg text-rose-700 hover:bg-rose-50 transition-all cursor-pointer ml-0.5"
                title="Eliminar todas las predecesoras para que las tareas sean 100% independientes"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Quitar Predecesoras</span>
              </button>
            )}
          </div>

          {/* Export to Excel Button (Direct Download) */}
          {onExportExcel && (
            <button
              id="gantt-export-excel-quick-btn"
              onClick={onExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-emerald-300 bg-emerald-50/90 hover:bg-emerald-100 text-emerald-800 transition-all cursor-pointer shadow-2xs"
              title="Descargar cronograma Gantt completo en Microsoft Excel (.xlsx) con barras de colores, todas las fases y matriz diaria"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Excel (.xlsx)</span>
              <span className="sm:hidden">Excel</span>
            </button>
          )}

          {/* Export Button (PNG / PDF) */}
          {onOpenExportModal && (
            <button
              id="gantt-export-btn"
              onClick={onOpenExportModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 transition-all cursor-pointer shadow-2xs"
              title="Exportar el cronograma en imagen de alta resolución (PNG) o documento PDF ejecutivo"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              <span>Exportar</span>
            </button>
          )}

          {/* Split Table toggle */}
          <button
            id="gantt-table-toggle"
            onClick={() => setIsTableCollapsed(!isTableCollapsed)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            {isTableCollapsed ? 'Mostrar Tabla' : 'Ocultar Tabla'}
          </button>
        </div>
      </div>

      {/* Main Split View: Table on Left, Timeline on Right */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Column: Task Hierarchical Table */}
        {!isTableCollapsed && (
          <div
            id="gantt-left-table"
            style={{ width: tableWidth }}
            className="shrink-0 flex flex-col border-r border-slate-200 bg-white select-none z-20"
          >
            {/* Table Header */}
            <div
              style={{ height: HEADER_HEIGHT }}
              className="flex items-center justify-between px-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600"
            >
              <div className="flex flex-col justify-center">
                <span>WBS / Actividades</span>
                <span className="text-[10px] font-normal text-slate-400">Reordenar: arrastra o usa ↑ / ↓</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400 pr-1">
                <span>Prog.</span>
                <span>Resp.</span>
              </div>
            </div>

            {/* Table Rows Body */}
            <div
              ref={tableScrollRef}
              onScroll={handleTableScroll}
              className="flex-1 overflow-y-auto overflow-x-hidden"
            >
              {visibleRows.map((row) => {
                if (row.type === 'phase') {
                  const isCollapsed = collapsedPhases[row.phase.id];
                  const isPhaseDropTarget =
                    dragOverTarget?.id === row.phase.id && dragOverTarget?.type === 'phase';

                  return (
                    <div
                      key={`phase-${row.phase.id}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!draggedTaskId) return;
                        setDragOverTarget({ id: row.phase.id, type: 'phase' });
                      }}
                      onDragLeave={() => {
                        if (dragOverTarget?.id === row.phase.id) {
                          setDragOverTarget(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!draggedTaskId) return;
                        onReorderTasks?.(draggedTaskId, null, 'inside_phase', row.phase.id);
                        setDraggedTaskId(null);
                        setDragOverTarget(null);
                      }}
                      className={`flex items-center justify-between px-3 border-b border-slate-200/80 text-slate-900 font-extrabold text-xs group transition-colors ${
                        isPhaseDropTarget
                          ? 'ring-2 ring-indigo-500'
                          : ''
                      }`}
                      style={{
                        height: row.height,
                        backgroundColor: `${row.phase.color || '#6366f1'}14`,
                        borderLeft: `4px solid ${row.phase.color || '#6366f1'}`,
                      }}
                    >
                      <button
                        onClick={() => togglePhaseCollapse(row.phase.id)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity truncate cursor-pointer"
                        style={{ color: row.phase.color || '#4f46e5' }}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: row.phase.color || '#6366f1' }}
                        />
                        <span className="truncate tracking-tight">{row.phase.name}</span>
                        {isPhaseDropTarget && (
                          <span className="ml-2 text-[10px] text-indigo-700 font-normal bg-white px-1.5 py-0.5 rounded shadow-2xs">
                            Soltar para mover a esta fase
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => onAddTaskInPhase(row.phase.id)}
                        title="Agregar tarea a esta fase"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                // Task row in table
                const isSelected = selectedTaskId === row.task.id;
                const isCritical = showCriticalPath && criticalTaskIds.has(row.task.id);
                const isBeingDragged = draggedTaskId === row.task.id;
                const isDropBefore =
                  dragOverTarget?.id === row.task.id && dragOverTarget?.position === 'before';
                const isDropAfter =
                  dragOverTarget?.id === row.task.id && dragOverTarget?.position === 'after';

                return (
                  <div
                    key={`tbl-${row.task.id}`}
                    style={{ height: row.height }}
                    onClick={() => {
                      setSelectedTaskId(row.task.id);
                      onEditTaskModal(row.task);
                    }}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', row.task.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedTaskId(row.task.id);
                    }}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setDragOverTarget(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!draggedTaskId || draggedTaskId === row.task.id) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const relY = e.clientY - rect.top;
                      const position = relY < rect.height / 2 ? 'before' : 'after';
                      setDragOverTarget({ id: row.task.id, type: 'task', position });
                    }}
                    onDragLeave={() => {
                      if (dragOverTarget?.id === row.task.id) {
                        setDragOverTarget(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!draggedTaskId || draggedTaskId === row.task.id) return;
                      const pos = dragOverTarget?.position || 'after';
                      onReorderTasks?.(draggedTaskId, row.task.id, pos);
                      setDraggedTaskId(null);
                      setDragOverTarget(null);
                    }}
                    className={`flex items-center justify-between px-2.5 border-b border-slate-200/60 text-xs transition-all cursor-pointer group relative select-none ${
                      isBeingDragged ? 'opacity-35 bg-indigo-50/60' : ''
                    } ${
                      isDropBefore ? 'border-t-2 border-t-indigo-600 bg-indigo-50/40' : ''
                    } ${
                      isDropAfter ? 'border-b-2 border-b-indigo-600 bg-indigo-50/40' : ''
                    } ${
                      isSelected
                        ? 'bg-indigo-50/80 border-l-3 border-indigo-600'
                        : isCritical
                        ? 'bg-rose-50/40 hover:bg-slate-50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Left: Drag Handle + Dot/Flag + Task Name */}
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                      <div
                        className="cursor-grab active:cursor-grabbing p-0.5 text-slate-300 group-hover:text-slate-500 hover:text-indigo-600 rounded transition-colors shrink-0"
                        title="Arrastra para reordenar esta tarea"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>

                      {row.task.isMilestone ? (
                        <Flag className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      ) : (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: row.task.color || row.phase.color }}
                        />
                      )}
                      <span
                        className={`truncate font-medium ${
                          isSelected ? 'text-indigo-900 font-semibold' : 'text-slate-700'
                        }`}
                        title={row.task.name}
                      >
                        {row.task.name}
                      </span>

                      {row.task.notConsideredByConsultant && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs shrink-0"
                          title={`Actividad no contemplada por la consultora: ${row.task.consultantExclusionReason || 'Alcance exclusivamente interno'}`}
                        >
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                          No en Consultora
                        </span>
                      )}
                    </div>

                    {/* Right: Quick Up/Down buttons + Progress + Avatar + Edit button */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Toggle consultant consideration quick button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateTask({
                            ...row.task,
                            notConsideredByConsultant: !row.task.notConsideredByConsultant,
                          });
                        }}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          row.task.notConsideredByConsultant
                            ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                            : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-amber-600 hover:bg-slate-200'
                        }`}
                        title={
                          row.task.notConsideredByConsultant
                            ? 'Actividad NO considerada por la consultora. Haz clic para marcar como considerada.'
                            : 'Marcar como NO considerada por la consultora (Alcance solo interno)'
                        }
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </button>
                      {/* Subir / Bajar buttons */}
                      {onMoveTask && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveTask(row.task.id, 'up');
                            }}
                            title="Subir tarea (Mover hacia arriba)"
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200/80 rounded transition-colors cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveTask(row.task.id, 'down');
                            }}
                            title="Bajar tarea (Mover hacia abajo)"
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200/80 rounded transition-colors cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {/* Colored Status Pill */}
                      <span
                        className={`hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                          row.task.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : row.task.status === 'in_progress'
                            ? 'bg-sky-50 text-sky-700 border-sky-300'
                            : row.task.status === 'blocked'
                            ? 'bg-rose-50 text-rose-700 border-rose-300'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                      >
                        {row.task.status === 'completed'
                          ? 'Listo'
                          : row.task.status === 'in_progress'
                          ? 'En curso'
                          : row.task.status === 'blocked'
                          ? 'Bloqueada'
                          : 'Pendiente'}
                      </span>

                      <span className="text-[11px] font-extrabold text-slate-700 w-8 text-right">
                        {row.task.progress}%
                      </span>
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0 shadow-2xs"
                        style={{ backgroundColor: row.task.assignee.avatarColor }}
                        title={`${row.task.assignee.name} (${row.task.assignee.role})`}
                      >
                        {row.task.assignee.name.charAt(0)}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditTaskModal(row.task);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded transition-all cursor-pointer"
                        title="Editar tarea completa"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {onDuplicateTask && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateTask(row.task);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded transition-all cursor-pointer"
                          title="Duplicar tarea (copiar todas sus configuraciones)"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Right Column: Interactive Gantt Canvas */}
        <div
          id="gantt-right-canvas"
          ref={timelineScrollRef}
          onScroll={handleTimelineScroll}
          className="flex-1 overflow-auto relative bg-slate-50/40 select-none"
        >
          <div
            style={{
              width: bounds.totalDays * dayWidth,
              minHeight: '100%',
            }}
            className="relative"
          >
            {/* Sticky Timeline Header */}
            <div
              style={{ height: HEADER_HEIGHT }}
              className="sticky top-0 z-30 flex flex-col bg-white border-b border-slate-200 shadow-2xs"
            >
              {/* Month Row */}
              <div className="flex border-b border-slate-100 h-7">
                {monthHeaders.map((m, idx) => (
                  <div
                    key={idx}
                    style={{ width: m.daysCount * dayWidth }}
                    className="flex items-center px-2 text-[11px] font-bold text-slate-600 tracking-wide border-r border-slate-200/70 truncate uppercase bg-slate-50"
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              {/* Day / Date Row */}
              <div className="flex h-7">
                {daysArray.map((day, idx) => {
                  const weekend = isWeekend(day);
                  const today = isToday(day);
                  const holiday = getHoliday(day, holidays);
                  return (
                    <div
                      key={idx}
                      style={{ width: dayWidth }}
                      className={`flex flex-col items-center justify-center text-[10px] border-r border-slate-200/50 shrink-0 relative ${
                        today
                          ? 'bg-indigo-600 text-white font-bold'
                          : holiday
                          ? 'bg-amber-100/90 text-amber-900 font-bold border-r-amber-300/80'
                          : weekend
                          ? 'bg-slate-100/70 text-slate-400 font-medium'
                          : 'text-slate-600 font-medium'
                      }`}
                      title={
                        holiday
                          ? `🎉 Feriado: ${holiday.name} (${toISODate(day)})`
                          : formatDateShort(toISODate(day))
                      }
                    >
                      {holiday && !today && (
                        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
                      )}
                      {zoom === 'day' ? (
                        <>
                          <span className="leading-none text-[9px]">{getDayName(day)}</span>
                          <span className="leading-none font-bold text-[10px]">{day.getDate()}</span>
                        </>
                      ) : zoom === 'week' ? (
                        <span>{day.getDate()}</span>
                      ) : (
                        day.getDate() === 1 || day.getDate() === 15 || holiday ? (
                          <span className={holiday ? 'font-black text-amber-900' : 'font-bold'}>
                            {day.getDate()}
                          </span>
                        ) : null
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rows & Grid Canvas Body (Starts directly below 58px sticky header, zero top offset) */}
            <div
              className="relative"
              style={{
                width: bounds.totalDays * dayWidth,
                height: totalContentHeight,
              }}
            >
              {/* Background Grid: Weekend stripes, Holiday stripes, and Today Line */}
              <div className="absolute inset-0 pointer-events-none flex">
                {daysArray.map((day, idx) => {
                  const weekend = isWeekend(day);
                  const today = isToday(day);
                  const holiday = getHoliday(day, holidays);
                  return (
                    <div
                      key={idx}
                      style={{ width: dayWidth }}
                      className={`border-r shrink-0 h-full relative ${
                        holiday
                          ? 'bg-amber-100/35 border-amber-200/50'
                          : weekend
                          ? 'bg-slate-100/40 border-slate-200/30'
                          : 'border-slate-200/30'
                      }`}
                      title={holiday ? `Feriado: ${holiday.name}` : undefined}
                    >
                      {holiday && (
                        <div className="sticky top-1 z-20 flex justify-center pointer-events-auto">
                          <span
                            className="px-1 py-0.5 bg-amber-500/90 text-white text-[8px] font-bold rounded shadow-2xs tracking-wider uppercase truncate max-w-[95%] text-center cursor-help"
                            title={`Feriado: ${holiday.name} (${toISODate(day)})`}
                          >
                            {dayWidth >= 40 ? holiday.name.split(' ')[0] : 'FER'}
                          </span>
                        </div>
                      )}
                      {today && (
                        <div
                          ref={todayMarkerRef}
                          className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-rose-500 z-25 shadow-xs"
                        >
                          <div className="sticky top-[60px] -translate-x-1/2 px-1.5 py-0.5 bg-rose-500 text-white font-bold text-[9px] rounded-full shadow-sm tracking-wider uppercase">
                            Hoy
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Dependency connecting lines */}
              {renderDependencyLines()}

              {/* Visible Rows & Task Bars */}
              <div className="relative">
                {visibleRows.map((row) => {
                if (row.type === 'phase') {
                  const pColor = row.phase.color || '#6366f1';
                  return (
                    <div
                      key={`canvas-phase-${row.phase.id}`}
                      style={{
                        height: row.height,
                        backgroundColor: `${pColor}18`,
                        borderLeft: `4px solid ${pColor}`,
                      }}
                      className="border-b border-slate-200 flex items-center px-4"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: pColor }}
                        />
                        <span
                          className="text-xs font-black tracking-wide"
                          style={{ color: pColor }}
                        >
                          {row.phase.name}
                        </span>
                      </div>
                    </div>
                  );
                }

                const { task, phase } = row;
                const isSelected = selectedTaskId === task.id;
                const isCritical = showCriticalPath && criticalTaskIds.has(task.id);
                const isOmittedByConsultant = Boolean(task.notConsideredByConsultant);
                const isDimmed = highlightOmittedByConsultant && !isOmittedByConsultant;
                const isHighlighted = highlightOmittedByConsultant && isOmittedByConsultant;

                // Use drag preview dates if this task is being moved/resized
                const isBeingDragged = dragPreview?.taskId === task.id;
                const activeStart = isBeingDragged ? dragPreview.startDate : task.startDate;
                const activeEnd = isBeingDragged ? dragPreview.endDate : task.endDate;
                const activeProgress = isBeingDragged ? dragPreview.progress : task.progress;

                const daysFromStart = diffDays(timelineStartDateStr, activeStart);
                const duration = Math.max(1, diffDays(activeStart, activeEnd) + 1);
                const barWorkingDays = countWorkingDays(activeStart, activeEnd, holidays);

                const leftPx = daysFromStart * dayWidth;
                const widthPx = task.isMilestone ? 28 : Math.max(dayWidth * 0.8, duration * dayWidth);

                // Vibrant, high-contrast bar color guaranteed
                const barColor =
                  task.color ||
                  phase?.color ||
                  (task.status === 'completed'
                    ? '#059669'
                    : task.status === 'in_progress'
                    ? '#0284c7'
                    : task.status === 'blocked'
                    ? '#dc2626'
                    : '#4f46e5');

                return (
                  <div
                    key={`canvas-task-${task.id}`}
                    style={{ height: row.height }}
                    className={`relative border-b border-slate-200/50 flex items-center ${
                      isSelected ? 'bg-indigo-50/40' : ''
                    }`}
                  >
                    {/* Gantt Bar / Milestone Diamond */}
                    {task.isMilestone ? (
                      /* MILESTONE: Render as Diamond */
                      <div
                        style={{
                          left: leftPx + dayWidth / 2 - 14,
                        }}
                        className={`absolute group z-20 ${
                          isScheduleLocked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
                        } ${isDimmed ? 'opacity-35' : ''}`}
                        onPointerDown={(e) => handleBarPointerDown(e, 'move', task)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskId(task.id);
                          onEditTaskModal(task);
                        }}
                        title={
                          isOmittedByConsultant
                            ? `[⚠️ No considerada por consultora] Hito: ${task.name} (${formatDateShort(task.startDate)}) • Haz clic para editar`
                            : isScheduleLocked
                            ? `Hito: ${task.name} (${formatDateShort(task.startDate)}) [Cronograma Fijo] • Haz clic para ver`
                            : `Hito: ${task.name} (${formatDateShort(task.startDate)}) • Arrastra para mover o haz clic para editar`
                        }
                      >
                        <div
                          className={`w-7 h-7 rotate-45 rounded-sm flex items-center justify-center transition-transform hover:scale-115 shadow-md ${
                            isHighlighted
                              ? 'ring-4 ring-amber-400 ring-offset-2'
                              : isCritical
                              ? 'ring-3 ring-rose-500 ring-offset-2'
                              : ''
                          }`}
                          style={{
                            backgroundColor: barColor,
                            border: '2px solid #ffffff',
                            outline: isOmittedByConsultant ? '2px dashed #f59e0b' : undefined,
                            outlineOffset: isOmittedByConsultant ? '2px' : undefined,
                          }}
                        >
                          <Flag className="w-3.5 h-3.5 text-white -rotate-45 drop-shadow-xs" />
                        </div>
                        {/* Omitted milestone badge */}
                        {isOmittedByConsultant && (
                          <div className="absolute -top-3.5 -right-3 whitespace-nowrap text-[8px] font-black uppercase text-amber-950 bg-amber-200 border border-amber-400 px-1 py-0.2 rounded shadow-2xs flex items-center gap-0.5 pointer-events-none z-30">
                            <AlertTriangle className="w-2 h-2 text-amber-700" />
                            <span>No en consultora</span>
                          </div>
                        )}
                        {/* Label next to milestone */}
                        <div className="absolute left-8 top-0.5 whitespace-nowrap text-xs font-bold text-slate-800 bg-white/95 border border-slate-200 px-2 py-0.5 rounded-md shadow-xs pointer-events-none">
                          {task.name}
                        </div>
                      </div>
                    ) : (
                      /* STANDARD TASK BAR */
                      <div
                        id={`gantt-bar-${task.id}`}
                        className={`absolute rounded-lg shadow-xs group flex items-center transition-all select-none z-20 ${
                          isScheduleLocked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
                        } ${isSelected ? 'ring-2 ring-indigo-600 ring-offset-1 shadow-md scale-[1.01]' : ''} ${
                          isCritical ? 'ring-2 ring-rose-500 ring-offset-1' : ''
                        } ${
                          isHighlighted ? 'ring-3 ring-amber-400 ring-offset-1 scale-[1.02] shadow-md' : ''
                        } ${isDimmed ? 'opacity-35' : ''}`}
                        style={{
                          left: leftPx,
                          width: widthPx,
                          height: 28,
                          backgroundColor: isOmittedByConsultant ? '#fef3c7' : `${barColor}30`,
                          backgroundImage: isOmittedByConsultant
                            ? 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.25), rgba(245, 158, 11, 0.25) 7px, transparent 7px, transparent 14px)'
                            : undefined,
                          borderColor: isOmittedByConsultant ? '#f59e0b' : barColor,
                          borderWidth: 2,
                          borderStyle: isOmittedByConsultant ? 'dashed' : 'solid',
                        }}
                        onPointerDown={(e) => handleBarPointerDown(e, 'move', task)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskId(task.id);
                          onEditTaskModal(task);
                        }}
                        title={
                          isOmittedByConsultant
                            ? `[⚠️ No considerada por consultora: ${task.consultantExclusionReason || 'Alcance interno'}] ${task.name} (${barWorkingDays} d hábiles) • ${formatDateShort(task.startDate)} a ${formatDateShort(task.endDate)} • Haz clic para editar`
                            : isScheduleLocked
                            ? `${task.name} (${barWorkingDays} d hábiles / ${duration} d corridos) • ${formatDateShort(task.startDate)} a ${formatDateShort(task.endDate)} [Cronograma Fijo] • Haz clic para ver`
                            : `${task.name} (${barWorkingDays} d hábiles / ${duration} d corridos) • ${formatDateShort(task.startDate)} a ${formatDateShort(task.endDate)} • Arrastra para mover o haz clic para editar`
                        }
                      >
                        {/* Solid Left Indicator Stripe (ensures vivid color even at 0% progress) */}
                        <div
                          className="absolute left-0 inset-y-0 w-2 rounded-l-[6px] pointer-events-none"
                          style={{ backgroundColor: barColor }}
                        />

                        {/* Omitted by Consultant Floating Badge */}
                        {isOmittedByConsultant && (
                          <div
                            className="absolute -top-3 left-1.5 px-1.5 py-0.2 bg-amber-500 text-white rounded text-[8px] font-black uppercase shadow-xs flex items-center gap-0.5 tracking-wider z-30 pointer-events-none"
                            title={`No considerada por consultora: ${task.consultantExclusionReason || 'Alcance interno'}`}
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>No en consultora</span>
                          </div>
                        )}

                        {/* Progress Fill Bar - Vivid & Solid */}
                        <div
                          className="absolute inset-y-0 left-0 rounded-l-[6px] transition-all pointer-events-none"
                          style={{
                            width: `${activeProgress}%`,
                            backgroundColor: barColor,
                            opacity: 0.95,
                          }}
                        />

                        {/* Left Resize Handle */}
                        {!isScheduleLocked && (
                          <div
                            className="absolute left-0 inset-y-0 w-3 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-white/60 rounded-l-md flex items-center justify-center transition-opacity z-30"
                            onPointerDown={(e) => handleBarPointerDown(e, 'resize-start', task)}
                            title="Arrastrar para modificar fecha de inicio"
                          >
                            <div className="w-1 h-3.5 bg-white rounded-full shadow-xs" />
                          </div>
                        )}

                        {/* Bar Content: Name & Progress with maximum contrast */}
                        <div className="relative z-25 flex items-center justify-between w-full pl-3.5 pr-2 pointer-events-none text-xs truncate">
                          <span
                            className="truncate font-bold text-[11px]"
                            style={{
                              color: activeProgress > 50 ? '#ffffff' : '#0f172a',
                              textShadow: activeProgress > 50 ? '0 1px 2px rgba(0,0,0,0.6)' : 'none',
                            }}
                          >
                            {task.name}
                          </span>
                          {widthPx > 60 && (
                            <span
                              className="text-[10px] font-black ml-1.5 shrink-0 px-1 py-0.2 rounded"
                              style={{
                                color: activeProgress > 65 ? '#ffffff' : barColor,
                                backgroundColor: activeProgress > 65 ? 'rgba(0,0,0,0.25)' : '#ffffff',
                                border: activeProgress > 65 ? 'none' : `1px solid ${barColor}40`,
                                textShadow: activeProgress > 65 ? '0 1px 2px rgba(0,0,0,0.6)' : 'none',
                              }}
                            >
                              {activeProgress}%
                            </span>
                          )}
                        </div>

                        {/* Right Resize Handle */}
                        {!isScheduleLocked && (
                          <div
                            className="absolute right-0 inset-y-0 w-3 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-white/60 rounded-r-md flex items-center justify-center transition-opacity z-30"
                            onPointerDown={(e) => handleBarPointerDown(e, 'resize-end', task)}
                            title="Arrastrar para modificar duración / fecha fin"
                          >
                            <div className="w-1 h-3.5 bg-white rounded-full shadow-xs" />
                          </div>
                        )}

                        {/* Critical Path Badge */}
                        {isCritical && (
                          <div className="absolute -top-2.5 -right-1 px-1 py-0.2 bg-rose-600 text-white rounded text-[8px] font-extrabold uppercase shadow-xs">
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
      </div>

      {/* Footer Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-indigo-500 shadow-2xs" />
            <span className="text-[11px] font-medium">Tarea Estándar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rotate-45 rounded-xs bg-indigo-600 flex items-center justify-center text-[8px] text-white shadow-2xs">
              <Flag className="w-2 h-2 -rotate-45" />
            </span>
            <span className="text-[11px] font-medium">Hito Clave</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-500 ring-1 ring-rose-400 shadow-2xs" />
            <span className="text-[11px] font-medium">Ruta Crítica</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-3 rounded-sm border-2 border-dashed border-amber-500 bg-[repeating-linear-gradient(45deg,rgba(245,158,11,0.25),rgba(245,158,11,0.25)_3px,transparent_3px,transparent_6px)] shadow-2xs" />
            <span className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              <span>No considerada por consultora ({omittedByConsultantCount})</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>Total: <strong>{tasks.length}</strong> actividades</span>
          <span>•</span>
          <span>Días hábiles: <strong>Lunes a Viernes (sin feriados)</strong></span>
        </div>
      </div>
    </div>

      {/* Floating Drag Info Tooltip */}
      {dragState && dragPreview && (
        <div
          id="gantt-drag-tooltip"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900 text-white rounded-xl shadow-xl text-xs font-semibold flex items-center space-x-3 pointer-events-none animate-bounce"
        >
          <span>
            📅 {formatDateShort(dragPreview.startDate)} ➔ {formatDateShort(dragPreview.endDate)}
          </span>
          <span className="text-indigo-300 font-semibold">
            ({countWorkingDays(dragPreview.startDate, dragPreview.endDate, holidays)} d hábiles / {Math.max(1, diffDays(dragPreview.startDate, dragPreview.endDate) + 1)} d cal)
          </span>
          {getHolidaysInRange(dragPreview.startDate, dragPreview.endDate, holidays).length > 0 && (
            <span className="text-amber-300 font-bold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/40">
              🚫 {getHolidaysInRange(dragPreview.startDate, dragPreview.endDate, holidays).length} feriado(s) omitido(s)
            </span>
          )}
          {dragState.type === 'progress' && (
            <span className="text-emerald-300">Progreso: {dragPreview.progress}%</span>
          )}
        </div>
      )}
    </div>
  );
};
