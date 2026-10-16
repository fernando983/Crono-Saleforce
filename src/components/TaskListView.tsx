import React, { useState } from 'react';
import { Task, Phase, Assignee, Holiday } from '../types';
import { formatDateShort, diffDays, countWorkingDays, getHolidaysInRange } from '../utils/dateUtils';
import {
  Edit2,
  Trash2,
  Plus,
  Flag,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Filter,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Copy,
  Briefcase,
} from 'lucide-react';

interface TaskListViewProps {
  tasks: Task[];
  phases: Phase[];
  assignees: Assignee[];
  holidays?: Holiday[];
  onUpdateTask: (task: Task) => void;
  onEditTaskModal: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onAddTask: () => void;
  onDuplicateTask?: (task: Task) => void;
  onMoveTask?: (taskId: string, direction: 'up' | 'down') => void;
  onReorderTasks?: (
    draggedTaskId: string,
    targetTaskId: string | null,
    position: 'before' | 'after' | 'inside_phase',
    targetPhaseId?: string
  ) => void;
}

export const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  phases,
  assignees,
  holidays = [],
  onUpdateTask,
  onEditTaskModal,
  onDeleteTask,
  onAddTask,
  onDuplicateTask,
  onMoveTask,
  onReorderTasks,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);

  const getPhase = (phaseId: string) => phases.find((p) => p.id === phaseId);

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.assignee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.deliverable && t.deliverable.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPhase = selectedPhase === 'all' || t.phaseId === selectedPhase;
    const matchesStatus = selectedStatus === 'all' || t.status === selectedStatus;
    return matchesSearch && matchesPhase && matchesStatus;
  });

  return (
    <div id="task-list-view-container" className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50/80 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por tarea, responsable o entregable..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Filter Phase */}
          <select
            value={selectedPhase}
            onChange={(e) => setSelectedPhase(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <option value="all">Todas las Fases</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Filter Status */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <option value="all">Todos los Estados</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En Curso</option>
            <option value="review">En Revisión</option>
            <option value="completed">Completado</option>
            <option value="blocked">Bloqueado</option>
          </select>
        </div>

        <button
          onClick={onAddTask}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Tarea</span>
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-600 font-bold">
            <tr>
              <th className="w-8 py-3 pl-3 pr-0 text-center"></th>
              <th className="py-3 px-3">Tarea / Actividad</th>
              <th className="py-3 px-3">Fase</th>
              <th className="py-3 px-3">Fechas</th>
              <th className="py-3 px-3">Duración</th>
              <th className="py-3 px-3">Progreso</th>
              <th className="py-3 px-3">Estado</th>
              <th className="py-3 px-3">Responsable</th>
              <th className="py-3 px-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTasks.map((task) => {
              const phase = getPhase(task.phaseId);
              const calDays = Math.max(1, diffDays(task.startDate, task.endDate) + 1);
              const workDays = countWorkingDays(task.startDate, task.endDate, holidays);
              const holidaysInTask = getHolidaysInRange(task.startDate, task.endDate, holidays);
              const isBeingDragged = draggedTaskId === task.id;
              const isDropBefore =
                dragOverTarget?.id === task.id && dragOverTarget?.position === 'before';
              const isDropAfter =
                dragOverTarget?.id === task.id && dragOverTarget?.position === 'after';

              return (
                <tr
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
                    const pos = dragOverTarget?.position || 'after';
                    onReorderTasks?.(draggedTaskId, task.id, pos);
                    setDraggedTaskId(null);
                    setDragOverTarget(null);
                  }}
                  className={`hover:bg-slate-50/80 transition-all group ${
                    isBeingDragged ? 'opacity-40 bg-indigo-50/50' : ''
                  } ${
                    isDropBefore ? 'border-t-2 border-t-indigo-600 bg-indigo-50/30' : ''
                  } ${
                    isDropAfter ? 'border-b-2 border-b-indigo-600 bg-indigo-50/30' : ''
                  }`}
                >
                  <td className="py-3 pl-3 pr-0 text-center">
                    <div
                      className="cursor-grab active:cursor-grabbing p-1 text-slate-300 group-hover:text-slate-500 hover:text-indigo-600 transition-colors inline-block"
                      title="Arrastra para reordenar"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-800 max-w-[260px]">
                    <div className="flex items-center gap-2">
                      {task.isMilestone ? (
                        <Flag className="w-4 h-4 text-indigo-600 shrink-0" />
                      ) : (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: task.color || phase?.color || '#4f46e5' }}
                        />
                      )}
                      <span className="truncate font-semibold">{task.name}</span>
                    </div>
                    {task.deliverable && (
                      <div className="text-[10px] text-slate-400 pl-4 truncate mt-0.5">
                        📦 {task.deliverable}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    <span
                      className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-md"
                      style={{
                        backgroundColor: `${phase?.color || '#4f46e5'}15`,
                        color: phase?.color || '#4f46e5',
                      }}
                    >
                      {phase?.name.replace(/^[0-9.]+\s*/, '')}
                    </span>
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-medium">
                    {formatDateShort(task.startDate)} - {formatDateShort(task.endDate)}
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap">
                    {task.isMilestone ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                        Hito
                      </span>
                    ) : (
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                          <Briefcase className="w-3 h-3 text-indigo-600 shrink-0" />
                          {workDays} d hábiles
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-400 font-medium">
                            {calDays} d corridos
                          </span>
                          {holidaysInTask.length > 0 && (
                            <span
                              className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded"
                              title={`Excluye ${holidaysInTask.length} feriado(s): ${holidaysInTask.map((h) => h.name).join(', ')}`}
                            >
                              {holidaysInTask.length} feriado(s)
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3 w-28">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${task.progress}%`,
                            backgroundColor: task.color || phase?.color || '#4f46e5',
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 w-7 text-right">
                        {task.progress}%
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <select
                      value={task.status}
                      onChange={(e) =>
                        onUpdateTask({
                          ...task,
                          status: e.target.value as any,
                          progress: e.target.value === 'completed' ? 100 : task.progress,
                        })
                      }
                      className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white cursor-pointer"
                    >
                      <option value="pending">⏳ Pendiente</option>
                      <option value="in_progress">🔄 En curso</option>
                      <option value="review">🔍 En revisión</option>
                      <option value="completed">✅ Completado</option>
                      <option value="blocked">⛔ Bloqueado</option>
                    </select>
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold"
                        style={{ backgroundColor: task.assignee.avatarColor }}
                      >
                        {task.assignee.name.charAt(0)}
                      </div>
                      <span className="text-slate-700 font-medium truncate max-w-[110px]">
                        {task.assignee.name}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {onMoveTask && (
                        <div className="flex items-center gap-0.5 mr-1">
                          <button
                            type="button"
                            onClick={() => onMoveTask(task.id, 'up')}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Subir tarea (Mover hacia arriba)"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onMoveTask(task.id, 'down')}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Bajar tarea (Mover hacia abajo)"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => onEditTaskModal(task)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Editar tarea"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {onDuplicateTask && (
                        <button
                          type="button"
                          onClick={() => onDuplicateTask(task)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Duplicar tarea (copiar todas sus configuraciones)"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteTask(task.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar tarea"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredTasks.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-xs">
            No se encontraron actividades con los filtros seleccionados.
          </div>
        )}
      </div>
    </div>
  );
};
