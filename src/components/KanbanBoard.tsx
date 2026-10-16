import React from 'react';
import { Task, Phase, TaskStatus } from '../types';
import { formatDateShort } from '../utils/dateUtils';
import { Plus, Edit2, Calendar, Flag, AlertCircle, Copy } from 'lucide-react';

interface KanbanBoardProps {
  tasks: Task[];
  phases: Phase[];
  onUpdateTask: (task: Task) => void;
  onEditTaskModal: (task: Task) => void;
  onAddTaskInStatus?: (status: TaskStatus) => void;
  onDuplicateTask?: (task: Task) => void;
}

const COLUMNS: { id: TaskStatus; title: string; color: string; badgeBg: string }[] = [
  { id: 'pending', title: 'Pendiente', color: '#64748b', badgeBg: 'bg-slate-100 text-slate-700' },
  { id: 'in_progress', title: 'En Curso', color: '#0284c7', badgeBg: 'bg-sky-100 text-sky-800' },
  { id: 'review', title: 'En Revisión / QA', color: '#8b5cf6', badgeBg: 'bg-purple-100 text-purple-800' },
  { id: 'completed', title: 'Completado', color: '#10b981', badgeBg: 'bg-emerald-100 text-emerald-800' },
  { id: 'blocked', title: 'Bloqueado', color: '#ef4444', badgeBg: 'bg-rose-100 text-rose-800' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tasks,
  phases,
  onUpdateTask,
  onEditTaskModal,
  onAddTaskInStatus,
  onDuplicateTask,
}) => {
  const getPhase = (phaseId: string) => phases.find((p) => p.id === phaseId);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== status) {
      const updatedProgress = status === 'completed' ? 100 : task.progress === 100 ? 50 : task.progress;
      onUpdateTask({
        ...task,
        status,
        progress: updatedProgress,
      });
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
  };

  return (
    <div id="kanban-board-container" className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 h-full overflow-y-auto pb-4">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id);

        return (
          <div
            key={col.id}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.id)}
            className="flex flex-col bg-slate-100/60 rounded-2xl border border-slate-200/80 p-3 min-h-[500px]"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: col.color }}
                />
                <h3 className="text-xs font-bold text-slate-700 tracking-wide">
                  {col.title}
                </h3>
              </div>
              <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${col.badgeBg}`}>
                {colTasks.length}
              </span>
            </div>

            {/* Tasks Container */}
            <div className="flex-1 space-y-2.5 overflow-y-auto pr-0.5">
              {colTasks.map((task) => {
                const phase = getPhase(task.phaseId);

                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onClick={() => onEditTaskModal(task)}
                    className="p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all cursor-grab active:cursor-grabbing group hover:border-indigo-300"
                  >
                    {/* Phase tag & Priority */}
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md truncate"
                        style={{
                          backgroundColor: `${phase?.color || '#4f46e5'}18`,
                          color: phase?.color || '#4f46e5',
                        }}
                      >
                        {phase?.name.replace(/^[0-9.]+\s*/, '')}
                      </span>
                      {task.priority === 'critical' && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded">
                          Crítica
                        </span>
                      )}
                    </div>

                    {/* Task Title */}
                    <div className="flex items-start gap-1.5 mb-2.5">
                      {task.isMilestone && (
                        <Flag className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                      )}
                      <h4 className="text-xs font-bold text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors">
                        {task.name}
                      </h4>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${task.progress}%`,
                          backgroundColor: task.color || phase?.color || '#4f46e5',
                        }}
                      />
                    </div>

                    {/* Footer: Date & Assignee */}
                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{formatDateShort(task.endDate)}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {onDuplicateTask && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicateTask(task);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Duplicar tarea"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div
                          className="w-5 h-5 rounded-full text-white font-bold flex items-center justify-center text-[10px] shadow-2xs"
                          style={{ backgroundColor: task.assignee.avatarColor }}
                          title={task.assignee.name}
                        >
                          {task.assignee.name.charAt(0)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {colTasks.length === 0 && (
                <div className="h-28 flex items-center justify-center text-xs text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                  Arrastra tareas aquí
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
