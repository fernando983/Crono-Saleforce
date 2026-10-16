import React, { useState, useEffect } from 'react';
import { Task, Phase, Assignee, TaskStatus, TaskPriority, Holiday } from '../types';
import {
  diffDays,
  addDays,
  countWorkingDays,
  getHolidaysInRange,
  formatDateShort,
  formatDateReadable,
  calculateEndDateFromWorkingDays,
  getNextWorkingDay,
  ensureWorkingDay,
  ensurePreviousWorkingDay,
  isNonWorkingDay,
  parseDate,
} from '../utils/dateUtils';
import {
  X,
  Trash2,
  Calendar,
  User,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Flag,
  CalendarDays,
  Workflow,
  ArrowRight,
  Copy,
  Lock,
  Briefcase,
  Plus,
  Minus,
  Check,
  Users,
  Pencil,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface TaskModalProps {
  isOpen: boolean;
  task: Task | null;
  phases: Phase[];
  assignees: Assignee[];
  allTasks: Task[];
  holidays?: Holiday[];
  isScheduleLocked?: boolean;
  onToggleScheduleLock?: () => void;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  onDuplicate?: (task: Task) => void;
  onOpenTeamModal?: () => void;
}

const PRESET_COLORS = [
  '#4f46e5', // Indigo
  '#0284c7', // Sky
  '#0d9488', // Teal
  '#16a34a', // Green
  '#ca8a04', // Yellow
  '#ea580c', // Orange
  '#dc2626', // Red
  '#9333ea', // Purple
  '#db2777', // Pink
  '#475569', // Slate
];

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  task,
  phases,
  assignees,
  allTasks,
  holidays = [],
  isScheduleLocked = false,
  onToggleScheduleLock,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  onOpenTeamModal,
}) => {
  const [formData, setFormData] = useState<Task | null>(null);
  const [durationMode, setDurationMode] = useState<'working_days' | 'calendar_days'>('working_days');
  const [workingDays, setWorkingDays] = useState<number>(1);
  const [calendarDays, setCalendarDays] = useState<number>(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRenamingAssignee, setIsRenamingAssignee] = useState(false);

  useEffect(() => {
    if (task) {
      setFormData({ ...task });
      const cDays = Math.max(1, diffDays(task.startDate, task.endDate) + 1);
      const wDays =
        task.workingDays || Math.max(1, countWorkingDays(task.startDate, task.endDate, holidays));
      setWorkingDays(wDays);
      setCalendarDays(cDays);
      setDurationMode(task.durationMode || 'working_days');
      setConfirmDelete(false);
    }
  }, [task, holidays]);

  if (!isOpen || !formData) return null;

  const effectiveWorkingDays = countWorkingDays(formData.startDate, formData.endDate, holidays);
  const holidaysInTask = getHolidaysInRange(formData.startDate, formData.endDate, holidays);
  const isStartNonWorking = isNonWorkingDay(parseDate(formData.startDate), holidays);
  const suggestedWorkingStart = ensureWorkingDay(formData.startDate, holidays);
  const nonWorkingDaysCount = Math.max(0, calendarDays - workingDays);

  const handleWorkingDaysChange = (newWDays: number) => {
    const valid = Math.max(1, Math.min(365, newWDays));
    setWorkingDays(valid);
    if (!formData) return;
    const newEnd = calculateEndDateFromWorkingDays(formData.startDate, valid, holidays);
    const newCDays = Math.max(1, diffDays(formData.startDate, newEnd) + 1);
    setCalendarDays(newCDays);
    setFormData({
      ...formData,
      endDate: newEnd,
      workingDays: valid,
      durationMode: 'working_days',
    });
  };

  const handleCalendarDaysChange = (newCDays: number) => {
    const valid = Math.max(1, Math.min(365, newCDays));
    setCalendarDays(valid);
    if (!formData) return;
    const newEnd = addDays(formData.startDate, valid - 1);
    const newWDays = Math.max(1, countWorkingDays(formData.startDate, newEnd, holidays));
    setWorkingDays(newWDays);
    setFormData({
      ...formData,
      endDate: newEnd,
      workingDays: newWDays,
      durationMode: 'calendar_days',
    });
  };

  const handleStartDateChange = (newStart: string) => {
    if (!newStart || !formData) return;
    if (formData.isMilestone) {
      const validDate = ensureWorkingDay(newStart, holidays);
      setFormData({ ...formData, startDate: validDate, endDate: validDate });
      setWorkingDays(1);
      setCalendarDays(1);
      return;
    }

    if (durationMode === 'working_days') {
      const validStart = ensureWorkingDay(newStart, holidays);
      const newEnd = calculateEndDateFromWorkingDays(validStart, workingDays, holidays);
      const newCDays = Math.max(1, diffDays(validStart, newEnd) + 1);
      setCalendarDays(newCDays);
      setFormData({
        ...formData,
        startDate: validStart,
        endDate: newEnd,
        workingDays,
        durationMode: 'working_days',
      });
    } else {
      const newEnd = addDays(newStart, calendarDays - 1);
      const newWDays = Math.max(1, countWorkingDays(newStart, newEnd, holidays));
      setWorkingDays(newWDays);
      setFormData({
        ...formData,
        startDate: newStart,
        endDate: newEnd,
        workingDays: newWDays,
        durationMode: 'calendar_days',
      });
    }
  };

  const handleEndDateChange = (newEnd: string) => {
    if (!newEnd || !formData) return;
    if (durationMode === 'working_days') {
      const validEnd = ensurePreviousWorkingDay(newEnd, holidays);
      const finalEnd = validEnd >= formData.startDate ? validEnd : ensureWorkingDay(formData.startDate, holidays);
      const newWDays = Math.max(1, countWorkingDays(formData.startDate, finalEnd, holidays));
      const calculatedEnd = calculateEndDateFromWorkingDays(formData.startDate, newWDays, holidays);
      const newCDays = Math.max(1, diffDays(formData.startDate, calculatedEnd) + 1);
      setCalendarDays(newCDays);
      setWorkingDays(newWDays);
      setFormData({
        ...formData,
        endDate: calculatedEnd,
        workingDays: newWDays,
      });
    } else {
      let finalEnd = newEnd;
      if (finalEnd < formData.startDate) {
        finalEnd = formData.startDate;
      }
      const newCDays = Math.max(1, diffDays(formData.startDate, finalEnd) + 1);
      const newWDays = Math.max(1, countWorkingDays(formData.startDate, finalEnd, holidays));
      setCalendarDays(newCDays);
      setWorkingDays(newWDays);
      setFormData({
        ...formData,
        endDate: finalEnd,
        workingDays: newWDays,
      });
    }
  };

  const handleMilestoneToggle = (isMilestone: boolean) => {
    if (!formData) return;
    if (isMilestone) {
      setFormData({
        ...formData,
        isMilestone: true,
        endDate: formData.startDate,
        workingDays: 1,
      });
      setWorkingDays(1);
      setCalendarDays(1);
    } else {
      const defaultWDays = 3;
      const newEnd = calculateEndDateFromWorkingDays(formData.startDate, defaultWDays, holidays);
      const newCDays = Math.max(1, diffDays(formData.startDate, newEnd) + 1);
      setFormData({
        ...formData,
        isMilestone: false,
        endDate: newEnd,
        workingDays: defaultWDays,
        durationMode: 'working_days',
      });
      setWorkingDays(defaultWDays);
      setCalendarDays(newCDays);
    }
  };

  const handleProgressChange = (newProg: number) => {
    const p = Math.max(0, Math.min(100, newProg));
    let newStatus = formData.status;
    if (p === 100 && formData.status !== 'completed') {
      newStatus = 'completed';
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch {
        // Safe fallback
      }
    } else if (p > 0 && p < 100 && formData.status === 'pending') {
      newStatus = 'in_progress';
    } else if (p < 100 && formData.status === 'completed') {
      newStatus = 'in_progress';
    }

    setFormData({ ...formData, progress: p, status: newStatus });
  };

  const toggleDependency = (depId: string) => {
    const exists = formData.dependencies.includes(depId);
    const newDeps = exists
      ? formData.dependencies.filter((id) => id !== depId)
      : [...formData.dependencies, depId];
    setFormData({ ...formData, dependencies: newDeps });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    onSave(formData);
    onClose();
  };

  // Potential predecessor tasks (exclude itself)
  const availableDependencies = allTasks.filter((t) => t.id !== formData.id);

  // Successor tasks that declare this task as a dependency
  const directSuccessors = allTasks.filter((t) => t.dependencies.includes(formData.id));

  // Find the earliest valid next working day after all predecessors
  const latestPredecessorNextWorkingDay = formData.dependencies.reduce((latest, depId) => {
    const pred = allTasks.find((t) => t.id === depId);
    if (!pred) return latest;
    const nextWork = getNextWorkingDay(pred.endDate, holidays);
    return !latest || nextWork > latest ? nextWork : latest;
  }, '');

  const hasPredecessorDateConflict = Boolean(
    latestPredecessorNextWorkingDay && formData.startDate < latestPredecessorNextWorkingDay
  );

  const handleAlignToPredecessor = () => {
    if (!latestPredecessorNextWorkingDay) return;
    handleStartDateChange(latestPredecessorNextWorkingDay);
  };

  return (
    <div
      id="task-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        id="task-modal-container"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur-md border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor:
                  formData.color ||
                  phases.find((p) => p.id === formData.phaseId)?.color ||
                  '#4f46e5',
              }}
            />
            <h2 className="text-lg font-bold text-slate-800">
              {task.id.startsWith('new-') ? 'Nueva Tarea / Hito' : 'Editar Tarea o Hito'}
            </h2>
          </div>
          <button
            id="task-modal-close-btn"
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Milestone and Phase banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <label className={`flex items-center space-x-2.5 ${isScheduleLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} select-none`}>
              <input
                id="task-is-milestone-checkbox"
                type="checkbox"
                disabled={isScheduleLocked}
                checked={!!formData.isMilestone}
                onChange={(e) => handleMilestoneToggle(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Flag className="w-4 h-4 text-indigo-600" />
                Marcar como Hito (Milestone de Proyecto)
              </span>
            </label>

            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium text-slate-500">Fase:</span>
              <select
                id="task-phase-select"
                value={formData.phaseId}
                onChange={(e) => setFormData({ ...formData, phaseId: e.target.value })}
                className="text-xs font-semibold px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Schedule Locked Informative Banner */}
          {isScheduleLocked && (
            <div className="flex items-start gap-3 p-3 bg-amber-50/90 border border-amber-200/90 rounded-xl text-amber-900 text-xs">
              <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 border border-amber-300">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-amber-950 block">Cronograma Fijo (Fechas protegidas)</span>
                <span className="text-[11px] text-amber-800 leading-relaxed block mt-0.5">
                  Las fechas de inicio, fin y duración están congeladas para evitar alteraciones involuntarias del plazo del proyecto. Puedes editar el nombre, responsable, progreso, notas y entregables.
                </span>
                {onToggleScheduleLock && (
                  <button
                    type="button"
                    onClick={onToggleScheduleLock}
                    className="mt-1.5 text-[11px] font-bold text-amber-900 underline hover:text-amber-950 cursor-pointer inline-flex items-center gap-1"
                  >
                    Desbloquear cronograma para editar fechas
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Task Name */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Nombre de la Tarea / Actividad *
            </label>
            <input
              id="task-name-input"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Parametrización de plan de cuentas"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Non-working start date warning banner */}
          {isStartNonWorking && !formData.isMilestone && suggestedWorkingStart !== formData.startDate && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-amber-50/90 border border-amber-200/90 rounded-xl text-amber-900 text-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  La fecha de inicio (<strong>{formatDateShort(formData.startDate)}</strong>) cae en fin de semana o feriado.
                </span>
              </div>
              {!isScheduleLocked && (
                <button
                  type="button"
                  onClick={() => handleStartDateChange(suggestedWorkingStart)}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
                >
                  Ajustar a {formatDateShort(suggestedWorkingStart)} (primer día hábil)
                </button>
              )}
            </div>
          )}

          {/* Milestone Dates Layout */}
          {formData.isMilestone ? (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
              <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Fecha del Hito Clave *
                {isScheduleLocked && <Lock className="w-3 h-3 text-amber-600 ml-auto" />}
              </label>
              <input
                id="task-milestone-date-input"
                type="date"
                required
                disabled={isScheduleLocked}
                value={formData.startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className={`w-full max-w-xs px-3 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                  isScheduleLocked
                    ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-800 border-slate-200 cursor-pointer'
                }`}
              />
              <p className="text-[11px] text-slate-500">
                Los hitos representan entregables o puntos de control clave y no consumen días hábiles acumulados.
              </p>
            </div>
          ) : (
            /* Standard Task: Duration and Dates with Working Days Alternative */
            <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-4">
              {/* Duration Mode Segmented Switch */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/70">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  Modo de Planificación de Duración:
                </span>
                <div className="inline-flex p-1 bg-slate-200/70 rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={() => setDurationMode('working_days')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      durationMode === 'working_days'
                        ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>Días Hábiles (Laborables)</span>
                    <span className="px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wide bg-indigo-100 text-indigo-700 rounded">
                      Alternativa
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDurationMode('calendar_days')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      durationMode === 'calendar_days'
                        ? 'bg-white text-slate-800 shadow-xs border border-slate-300/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Días Calendario (Corridos)</span>
                  </button>
                </div>
              </div>

              {/* Working Days Duration Controller */}
              {durationMode === 'working_days' ? (
                <div className="bg-white p-3.5 rounded-xl border border-indigo-100/90 shadow-2xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-800">
                        Cantidad de Días Hábiles Deseados
                      </label>
                      <span className="text-[11px] text-slate-500 block">
                        Excluye fines de semana y feriados declarados para determinar la fecha fin.
                      </span>
                    </div>

                    {/* Stepper for Working Days */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isScheduleLocked || workingDays <= 1}
                        onClick={() => handleWorkingDaysChange(workingDays - 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                        title="Restar 1 día hábil"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex items-center">
                        <input
                          id="task-working-days-input"
                          type="number"
                          min="1"
                          max="365"
                          disabled={isScheduleLocked}
                          value={workingDays}
                          onChange={(e) =>
                            handleWorkingDaysChange(parseInt(e.target.value, 10) || 1)
                          }
                          className="w-16 px-2 py-1.5 text-center font-extrabold text-sm text-indigo-700 bg-indigo-50/50 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                        <span className="ml-2 text-xs font-bold text-slate-700">días hábiles</span>
                      </div>
                      <button
                        type="button"
                        disabled={isScheduleLocked}
                        onClick={() => handleWorkingDaysChange(workingDays + 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                        title="Sumar 1 día hábil"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Working Days Quick Presets */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                      Preajustes rápidos:
                    </span>
                    {[
                      { label: '1 d', val: 1 },
                      { label: '2 d', val: 2 },
                      { label: '3 d', val: 3 },
                      { label: '5 d (1 sem)', val: 5 },
                      { label: '10 d (2 sem)', val: 10 },
                      { label: '15 d (3 sem)', val: 15 },
                      { label: '20 d (1 mes)', val: 20 },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        disabled={isScheduleLocked}
                        onClick={() => handleWorkingDaysChange(preset.val)}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 ${
                          workingDays === preset.val
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Calculated End Date Feedback */}
                  <div className="flex items-center gap-1.5 text-xs text-indigo-900 bg-indigo-50/70 px-3 py-2 rounded-lg font-medium border border-indigo-100">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>
                      Con <strong>{workingDays} días hábiles</strong>, la tarea finalizará el{' '}
                      <strong>{formatDateReadable(formData.endDate)}</strong> ({calendarDays} días
                      calendario totales).
                    </span>
                  </div>
                </div>
              ) : (
                /* Calendar Days Duration Controller */
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-800">
                        Cantidad de Días Calendario (Corridos)
                      </label>
                      <span className="text-[11px] text-slate-500 block">
                        Duración continua de fecha a fecha incluyendo fines de semana y feriados.
                      </span>
                    </div>

                    {/* Stepper for Calendar Days */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isScheduleLocked || calendarDays <= 1}
                        onClick={() => handleCalendarDaysChange(calendarDays - 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                        title="Restar 1 día calendario"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex items-center">
                        <input
                          id="task-calendar-days-input"
                          type="number"
                          min="1"
                          max="365"
                          disabled={isScheduleLocked}
                          value={calendarDays}
                          onChange={(e) =>
                            handleCalendarDaysChange(parseInt(e.target.value, 10) || 1)
                          }
                          className="w-16 px-2 py-1.5 text-center font-extrabold text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                        <span className="ml-2 text-xs font-bold text-slate-700">días corridos</span>
                      </div>
                      <button
                        type="button"
                        disabled={isScheduleLocked}
                        onClick={() => handleCalendarDaysChange(calendarDays + 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                        title="Sumar 1 día calendario"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Calendar Days Quick Presets */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                      Preajustes rápidos:
                    </span>
                    {[
                      { label: '3 d', val: 3 },
                      { label: '5 d', val: 5 },
                      { label: '7 d (1 sem)', val: 7 },
                      { label: '14 d (2 sem)', val: 14 },
                      { label: '21 d (3 sem)', val: 21 },
                      { label: '30 d (1 mes)', val: 30 },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        disabled={isScheduleLocked}
                        onClick={() => handleCalendarDaysChange(preset.val)}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 ${
                          calendarDays === preset.val
                            ? 'bg-slate-800 text-white shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Calendar Mode Outcome */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 px-3 py-2 rounded-lg font-medium">
                    <Briefcase className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>
                      Equivale a <strong>{workingDays} días hábiles efectivos</strong> de trabajo en
                      este periodo.
                    </span>
                  </div>
                </div>
              )}

              {/* Start & End Dates Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Fecha Inicio
                    {isScheduleLocked && <Lock className="w-3 h-3 text-amber-600 ml-auto" />}
                  </label>
                  <input
                    id="task-start-date-input"
                    type="date"
                    required
                    disabled={isScheduleLocked}
                    value={formData.startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                      isScheduleLocked
                        ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                        : 'bg-white text-slate-800 border-slate-200 cursor-pointer'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Fecha Fin (Resultado)
                    {isScheduleLocked && <Lock className="w-3 h-3 text-amber-600 ml-auto" />}
                  </label>
                  <input
                    id="task-end-date-input"
                    type="date"
                    required
                    disabled={isScheduleLocked}
                    value={formData.endDate}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                      isScheduleLocked
                        ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                        : 'bg-white text-slate-800 border-slate-200 cursor-pointer'
                    }`}
                  />
                </div>
              </div>

              {/* Working Days & Holidays Breakdown Strip */}
              <div className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-slate-200 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
                  <div className="flex items-center gap-3">
                    <span>
                      Días Hábiles:{' '}
                      <strong className="text-indigo-600 font-bold">{workingDays} d</strong>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span>
                      Días No Hábiles:{' '}
                      <strong className="text-slate-600 font-bold">{nonWorkingDaysCount} d</strong>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span>
                      Días Calendario:{' '}
                      <strong className="text-slate-800 font-bold">{calendarDays} d</strong>
                    </span>
                  </div>
                </div>

                {holidaysInTask.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex items-start gap-1.5 text-amber-800 text-[11px]">
                    <CalendarDays className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Abarca {holidaysInTask.length} día(s) feriado(s): </span>
                      <span>
                        {holidaysInTask
                          .map((h) => `${h.name} (${formatDateShort(h.date)})`)
                          .join(', ')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progress Slider */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Progreso de Ejecución
              </span>
              <span className="text-sm font-extrabold text-indigo-600">{formData.progress}%</span>
            </div>
            <input
              id="task-progress-slider"
              type="range"
              min="0"
              max="100"
              step="5"
              value={formData.progress}
              onChange={(e) => handleProgressChange(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between gap-1 pt-1">
              {[0, 25, 50, 75, 100].map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => handleProgressChange(p)}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-all cursor-pointer ${
                    formData.progress === p
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {/* Status & Priority & Assignee */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Estado</label>
              <select
                id="task-status-select"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskStatus })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="pending">⏳ Pendiente</option>
                <option value="in_progress">🔄 En curso</option>
                <option value="review">🔍 En revisión</option>
                <option value="completed">✅ Completado</option>
                <option value="blocked">⛔ Bloqueado</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Prioridad</label>
              <select
                id="task-priority-select"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="low">🟢 Baja</option>
                <option value="medium">🟡 Media</option>
                <option value="high">🟠 Alta</option>
                <option value="critical">🔴 Crítica</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Responsable
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRenamingAssignee(!isRenamingAssignee)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline flex items-center gap-1"
                    title="Editar o cambiar el nombre de este responsable"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>{isRenamingAssignee ? 'Ocultar edición' : 'Renombrar'}</span>
                  </button>
                  {onOpenTeamModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTeamModal();
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline flex items-center gap-1"
                      title="Abrir panel completo de equipo y responsables"
                    >
                      <Users className="w-3 h-3" />
                      <span>Equipo</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-2xs"
                  style={{ backgroundColor: formData.assignee.avatarColor }}
                  title={`Avatar de ${formData.assignee.name}`}
                >
                  {formData.assignee.name.trim().charAt(0) || '?'}
                </div>
                <select
                  id="task-assignee-select"
                  value={formData.assignee.id}
                  onChange={(e) => {
                    if (e.target.value === 'unassigned') {
                      setFormData({
                        ...formData,
                        assignee: {
                          id: 'unassigned',
                          name: 'Sin Asignar',
                          role: 'Sin Asignar',
                          avatarColor: '#94a3b8',
                        },
                      });
                      setIsRenamingAssignee(false);
                      return;
                    }
                    const sel = assignees.find((a) => a.id === e.target.value);
                    if (sel) setFormData({ ...formData, assignee: sel });
                  }}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                >
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role})
                    </option>
                  ))}
                  <option value="unassigned">— Sin Asignar (Quitar Responsable) —</option>
                </select>

                {formData.assignee.id !== 'unassigned' && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        assignee: {
                          id: 'unassigned',
                          name: 'Sin Asignar',
                          role: 'Sin Asignar',
                          avatarColor: '#94a3b8',
                        },
                      });
                      setIsRenamingAssignee(false);
                    }}
                    className="px-2.5 py-2 text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0"
                    title="Quitar responsable de esta tarea (dejar sin asignar)"
                  >
                    Quitar
                  </button>
                )}
              </div>

              {/* Inline Rename Form if user clicks "Renombrar" */}
              {isRenamingAssignee && (
                <div className="mt-2.5 p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
                  <span className="text-[11px] font-bold text-indigo-900 block">
                    Modificar Nombre o Cargo del Responsable:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Nombre *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.assignee.name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            assignee: { ...formData.assignee, name: e.target.value },
                          })
                        }
                        placeholder="Nombre completo"
                        className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Rol o Cargo
                      </label>
                      <input
                        type="text"
                        value={formData.assignee.role}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            assignee: { ...formData.assignee, role: e.target.value },
                          })
                        }
                        placeholder="Rol"
                        className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-indigo-700">
                    Al guardar la tarea, se actualizará este nombre en todo el proyecto.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Color Customization */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              Color personalizado de la barra en el Gantt
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, color: undefined })}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer ${
                  !formData.color
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Color por defecto (Fase)
              </button>
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setFormData({ ...formData, color: c })}
                  className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                    formData.color === c ? 'scale-115 border-slate-900 shadow-sm' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Dependencies / Predecessors */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                Dependencias / Predecesoras (Actividades previas requeridas)
              </label>
              {formData.dependencies.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, dependencies: [] })}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                >
                  Quitar todos los enlaces ({formData.dependencies.length})
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Selecciona qué actividades deben finalizar antes de iniciar esta tarea. Se dibujarán las líneas conectoras en el Gantt.
            </p>
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {availableDependencies.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No hay otras tareas disponibles para asociar.</p>
              ) : (
                availableDependencies.map((t) => {
                  const isChecked = formData.dependencies.includes(t.id);
                  const isConflict = isChecked && t.endDate > formData.startDate;
                  return (
                    <div
                      key={t.id}
                      onClick={() => toggleDependency(t.id)}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer border ${
                        isChecked
                          ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900 font-medium'
                          : 'bg-white border-slate-200/60 text-slate-700 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by div click
                          className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                        />
                        <span className="truncate">{t.name}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] shrink-0 ml-2">
                        <span className="text-slate-400">{t.endDate}</span>
                        {isConflict && (
                          <span
                            title="Atención: la predecesora termina después del inicio de esta tarea"
                            className="flex items-center gap-0.5 text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[10px]"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Solapada
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Predecessor Conflict Quick-Action */}
            {hasPredecessorDateConflict && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 bg-amber-50/90 border border-amber-200 rounded-lg text-xs text-amber-900">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Inicia antes del fin de predecesora(s). Próximo día hábil: <strong>{latestPredecessorNextWorkingDay}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAlignToPredecessor}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md shadow-xs cursor-pointer text-[11px] shrink-0"
                >
                  Alinear a día hábil
                </button>
              </div>
            )}
          </div>

          {/* Connected Successor Tasks - Cascade Notice */}
          {directSuccessors.length > 0 && (
            <div className="p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                  <Workflow className="w-4 h-4 text-indigo-600" />
                  <span>Actividades sucesoras vinculadas ({directSuccessors.length})</span>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-indigo-200/60 text-indigo-800 rounded-md">
                  Cascada Activa
                </span>
              </div>
              <p className="text-[11px] text-indigo-800 leading-relaxed">
                Esta tarea actúa como <strong>predecesora</strong>. Al modificar sus fechas o guardarla, 
                todas sus sucesoras se reprogramarán automáticamente para iniciar en el siguiente día hábil disponible 
                (omitiendo fines de semana y feriados) conservando su duración.
              </p>
              <div className="space-y-1.5 mt-1 max-h-36 overflow-y-auto pr-1">
                {directSuccessors.map((succ) => (
                  <div
                    key={succ.id}
                    className="flex items-center justify-between p-2 bg-white rounded-lg border border-indigo-100 text-slate-700 text-xs shadow-2xs"
                  >
                    <div className="flex items-center gap-2 truncate mr-2">
                      {succ.isMilestone ? (
                        <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: succ.color || '#6366f1' }}
                        />
                      )}
                      <span className="font-semibold truncate text-slate-800">{succ.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0 font-medium">
                      <span>{formatDateShort(succ.startDate)}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span>{formatDateShort(succ.endDate)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deliverable & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Entregable o Criterio de Aceptación</label>
              <input
                id="task-deliverable-input"
                type="text"
                value={formData.deliverable || ''}
                onChange={(e) => setFormData({ ...formData, deliverable: e.target.value })}
                placeholder="Ej: Documento de arquitectura aprobado"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Notas adicionales / Riesgos</label>
              <input
                id="task-notes-input"
                type="text"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Ej: Requiere confirmación de licencias con TI"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Consultant Scope / Consideration */}
          <div className="p-3.5 bg-gradient-to-r from-amber-50/70 via-orange-50/40 to-amber-50/70 border border-amber-200/90 rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 leading-tight">
                    Alcance de la Consultora Externa
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    ¿Esta actividad está incluida en la propuesta del proveedor o es un trabajo exclusivo del equipo interno?
                  </p>
                </div>
              </div>

              {/* Toggle Buttons */}
              <div className="flex items-center bg-white p-1 rounded-xl border border-amber-200 text-xs font-semibold shadow-2xs">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, notConsideredByConsultant: false })}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    !formData.notConsideredByConsultant
                      ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Considerada por Consultora
                </button>
                <button
                  type="button"
                  id="task-mark-not-considered-by-consultant-btn"
                  onClick={() => setFormData({ ...formData, notConsideredByConsultant: true })}
                  className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    formData.notConsideredByConsultant
                      ? 'bg-amber-500 text-white font-bold shadow-2xs ring-1 ring-amber-600'
                      : 'text-amber-800 hover:bg-amber-100/50'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>No Considerada (Solo Interna)</span>
                </button>
              </div>
            </div>

            {formData.notConsideredByConsultant && (
              <div className="mt-2.5 pt-2.5 border-t border-amber-200/60 animate-in fade-in slide-in-from-top-1">
                <label className="block text-xs font-bold text-amber-950 mb-1">
                  Motivo o Justificación de la exclusión por la consultora (opcional)
                </label>
                <input
                  id="task-consultant-exclusion-reason-input"
                  type="text"
                  value={formData.consultantExclusionReason || ''}
                  onChange={(e) => setFormData({ ...formData, consultantExclusionReason: e.target.value })}
                  placeholder="Ej: Actividad asumida internamente; fuera del alcance del pliego técnico de la consultora"
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <p className="text-[10px] text-amber-700 mt-1.5 flex items-center gap-1 font-medium">
                  <span>ℹ️</span>
                  <span>
                    Esta tarea se destacará en el diagrama de Gantt con el distintivo <strong>[No en Consultora]</strong> y un patrón visual diferenciado, y figurará como brecha de alcance en la solapa de comparación.
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              {onDuplicate && !task.id.startsWith('new-') && (
                <button
                  type="button"
                  onClick={() => {
                    onDuplicate(formData);
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/90 rounded-xl transition-all cursor-pointer shadow-2xs"
                  title="Duplicar esta tarea con todas sus fechas, fase, responsable y dependencias"
                >
                  <Copy className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Duplicar Tarea</span>
                </button>
              )}

              {onDelete && !task.id.startsWith('new-') && (
                confirmDelete ? (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-rose-600 font-semibold">¿Seguro?</span>
                    <button
                      type="button"
                      onClick={() => onDelete(formData.id)}
                      className="px-2.5 py-1 text-xs font-bold bg-rose-600 text-white rounded-lg hover:bg-rose-700 cursor-pointer"
                    >
                      Sí, eliminar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar tarea
                  </button>
                )
              )}
            </div>

            <div className="flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="task-save-btn"
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm hover:shadow transition-all cursor-pointer"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
