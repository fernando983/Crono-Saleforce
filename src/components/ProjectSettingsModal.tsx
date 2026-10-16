import React, { useState, useEffect } from 'react';
import { Project, Phase, Assignee } from '../types';
import {
  X,
  Plus,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Layers,
  DollarSign,
  Calendar,
  CalendarDays,
  History,
  ShieldCheck,
  AlertCircle,
  Users,
  UserPlus,
  FileSpreadsheet,
} from 'lucide-react';
import { saveProjectSnapshot } from '../utils/backupUtils';
import { exportProjectToExcel } from '../utils/excelExport';

interface ProjectSettingsModalProps {
  isOpen: boolean;
  project: Project;
  onClose: () => void;
  onSaveProject: (updated: Project) => void;
  onResetProject: () => void;
  onOpenHolidaysModal?: () => void;
  onOpenRecoveryModal?: () => void;
  onOpenExportModal?: () => void;
  onOpenTeamModal?: () => void;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  isOpen,
  project,
  onClose,
  onSaveProject,
  onResetProject,
  onOpenHolidaysModal,
  onOpenRecoveryModal,
  onOpenExportModal,
  onOpenTeamModal,
}) => {
  const [formData, setFormData] = useState<Project>(() => JSON.parse(JSON.stringify(project)));
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseColor, setNewPhaseColor] = useState('#6366f1');
  const [phaseActionNotice, setPhaseActionNotice] = useState<string | null>(null);

  const [newAssigneeName, setNewAssigneeName] = useState('');
  const [newAssigneeRole, setNewAssigneeRole] = useState('');
  const [assigneeActionNotice, setAssigneeActionNotice] = useState<string | null>(null);

  // Always keep formData strictly synchronized with the latest project when opening
  useEffect(() => {
    if (isOpen) {
      setFormData(JSON.parse(JSON.stringify(project)));
      setPhaseActionNotice(null);
      setAssigneeActionNotice(null);
      setNewAssigneeName('');
      setNewAssigneeRole('');
    }
  }, [isOpen, project]);

  if (!isOpen) return null;

  const handleAddPhase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhaseName.trim()) return;
    const newPhase: Phase = {
      id: `fase-${Date.now()}`,
      name: newPhaseName.trim(),
      color: newPhaseColor,
      order: formData.phases.length + 1,
    };
    setFormData({
      ...formData,
      phases: [...formData.phases, newPhase],
    });
    setNewPhaseName('');
  };

  const handleRemovePhase = (phaseId: string) => {
    if (formData.phases.length <= 1) {
      alert('El proyecto debe tener al menos una fase.');
      return;
    }

    const remainingPhases = formData.phases.filter((p) => p.id !== phaseId);
    const fallbackPhase = remainingPhases[0];

    // CRITICAL: NEVER delete tasks when removing a phase! Reassign tasks to remaining phase
    const affectedTasksCount = (project.tasks || []).filter((t) => t.phaseId === phaseId).length;
    const safeTasks = (project.tasks || formData.tasks || []).map((t) =>
      t.phaseId === phaseId ? { ...t, phaseId: fallbackPhase.id } : t
    );

    setFormData({
      ...formData,
      phases: remainingPhases,
      tasks: safeTasks,
    });

    if (affectedTasksCount > 0) {
      setPhaseActionNotice(
        `Se reubicaron ${affectedTasksCount} tarea(s) en la fase "${fallbackPhase.name}" para proteger tu cronograma.`
      );
    }
  };

  const handleRemoveAssignee = (assigneeId: string, name: string) => {
    if (formData.assignees.length <= 1) {
      setAssigneeActionNotice('El proyecto debe contar con al menos un responsable.');
      return;
    }

    const remaining = formData.assignees.filter((a) => a.id !== assigneeId);
    const fallback = remaining[0];
    const affectedTasks = (project.tasks || formData.tasks || []).filter(
      (t) => t.assignee.id === assigneeId
    ).length;

    const safeTasks = (project.tasks || formData.tasks || []).map((t) =>
      t.assignee.id === assigneeId ? { ...t, assignee: fallback } : t
    );

    setFormData({
      ...formData,
      assignees: remaining,
      tasks: safeTasks,
    });

    if (affectedTasks > 0) {
      setAssigneeActionNotice(
        `Se quitó a "${name}". Sus ${affectedTasks} tareas se reasignaron a "${fallback.name}".`
      );
    } else {
      setAssigneeActionNotice(`Se quitó a "${name}" del equipo.`);
    }
  };

  const handleAddAssignee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssigneeName.trim()) return;

    const colors = [
      '#4f46e5',
      '#0891b2',
      '#059669',
      '#d97706',
      '#e11d48',
      '#7c3aed',
      '#2563eb',
      '#475569',
    ];
    const newA: Assignee = {
      id: `usr-${Date.now()}`,
      name: newAssigneeName.trim(),
      role: newAssigneeRole.trim() || 'Miembro del Equipo',
      avatarColor: colors[formData.assignees.length % colors.length],
    };

    setFormData({
      ...formData,
      assignees: [...formData.assignees, newA],
    });

    setNewAssigneeName('');
    setNewAssigneeRole('');
    setAssigneeActionNotice(`Se añadió a "${newA.name}" al equipo.`);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(formData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${formData.title.toLowerCase().replace(/\s+/g, '_')}_gantt.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], 'UTF-8');
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.tasks && parsed.phases) {
            setFormData(parsed);
            onSaveProject(parsed);
            alert('¡Proyecto importado con éxito!');
            onClose();
          } else {
            alert('El archivo no tiene el formato válido de proyecto.');
          }
        } catch {
          alert('Error al leer el archivo JSON.');
        }
      };
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Tarea', 'Fase', 'Inicio', 'Fin', 'Progreso', 'Estado', 'Prioridad', 'Responsable'];
    const rows = formData.tasks.map((t) => {
      const phase = formData.phases.find((p) => p.id === t.phaseId)?.name || '';
      return [
        t.id,
        `"${t.name.replace(/"/g, '""')}"`,
        `"${phase}"`,
        t.startDate,
        t.endDate,
        `${t.progress}%`,
        t.status,
        t.priority,
        `"${t.assignee.name}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${formData.title.replace(/\s+/g, '_')}_tareas.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Take a safe snapshot of the project right before applying changes
    saveProjectSnapshot(project, 'edit');

    // 2. CRITICAL PRESERVATION: Always preserve the loaded schedule/tasks
    // Never allow saving project settings or phases to erase tasks
    const activeTasks =
      project.tasks && project.tasks.length > 0
        ? project.tasks
        : formData.tasks && formData.tasks.length > 0
        ? formData.tasks
        : [];

    const validPhaseIds = new Set(formData.phases.map((p) => p.id));
    const fallbackPhaseId = formData.phases[0]?.id || 'fase-1';

    // Re-link any task whose phase was deleted to the fallback phase so no tasks vanish
    const rePhasedTasks = activeTasks.map((t) => {
      if (!validPhaseIds.has(t.phaseId)) {
        return { ...t, phaseId: fallbackPhaseId };
      }
      return t;
    });

    // Synchronize assignees: if assignees in formData were updated/renamed, sync tasks
    const assigneeMap = new Map<string, Assignee>();
    (formData.assignees || []).forEach((a) => assigneeMap.set(a.id, a));

    const safeTasks = rePhasedTasks.map((t) => {
      const match = assigneeMap.get(t.assignee.id);
      return match ? { ...t, assignee: match } : t;
    });

    const safeProject: Project = {
      ...formData,
      tasks: safeTasks,
    };

    onSaveProject(safeProject);
    onClose();
  };

  return (
    <div
      id="project-settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        id="project-settings-modal-container"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur-md border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Configuración del Proyecto & Fases
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* General Project Info */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Datos Generales de la Implementación
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Proyecto</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cliente / Organización</label>
                <input
                  type="text"
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Project Manager Líder</label>
                <input
                  type="text"
                  value={formData.manager}
                  onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fecha Inicio Planificada</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fecha Fin Objetivo</label>
                <input
                  type="date"
                  value={formData.targetEndDate}
                  onChange={(e) => setFormData({ ...formData, targetEndDate: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Presupuesto Estimado</label>
                <input
                  type="number"
                  value={formData.budget || 0}
                  onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Holiday Calendar Section */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-amber-600" />
                  <span>Calendario de Feriados ({formData.holidays?.length || 0} días)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Días no laborables que se sombrean en el cronograma y se descuentan del cálculo de días hábiles.
                </p>
              </div>

              {onOpenHolidaysModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenHolidaysModal();
                  }}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  Gestionar Feriados
                </button>
              )}
            </div>

            {formData.holidays && formData.holidays.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                {formData.holidays.map((h) => (
                  <span
                    key={h.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700 shadow-2xs"
                  >
                    <span className="font-bold text-amber-700">{h.date}</span>
                    <span className="truncate max-w-[140px]">{h.name}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No hay días feriados registrados en este proyecto.</p>
            )}
          </div>

          {/* Phase Management */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Estructura de Fases / WBS ({formData.phases.length})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Edita los nombres o colores de las fases. Tus tareas, fechas y avances se conservan intactos.
                </p>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {project.tasks?.length || 0} tareas protegidas
              </span>
            </div>

            {phaseActionNotice && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{phaseActionNotice}</span>
              </div>
            )}

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {formData.phases.map((phase) => {
                const phaseTasksCount = (project.tasks || []).filter((t) => t.phaseId === phase.id).length;
                return (
                  <div
                    key={phase.id}
                    className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 gap-2"
                  >
                    <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                      <input
                        type="color"
                        value={phase.color}
                        onChange={(e) => {
                          const updatedPhases = formData.phases.map((p) =>
                            p.id === phase.id ? { ...p, color: e.target.value } : p
                          );
                          setFormData({ ...formData, phases: updatedPhases });
                        }}
                        className="w-6 h-6 rounded-md border-0 p-0 cursor-pointer shrink-0"
                        title="Color de la fase"
                      />
                      <input
                        type="text"
                        value={phase.name}
                        onChange={(e) => {
                          const updatedPhases = formData.phases.map((p) =>
                            p.id === phase.id ? { ...p, name: e.target.value } : p
                          );
                          setFormData({ ...formData, phases: updatedPhases });
                        }}
                        className="bg-white border border-slate-200 font-semibold text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg px-2.5 py-1 flex-1 min-w-0"
                        placeholder="Nombre de la fase WBS..."
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                        {phaseTasksCount} {phaseTasksCount === 1 ? 'tarea' : 'tareas'}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRemovePhase(phase.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                        title={
                          phaseTasksCount > 0
                            ? `Eliminar fase (sus ${phaseTasksCount} tareas se reubicarán en otra fase)`
                            : 'Eliminar fase'
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add New Phase */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="color"
                value={newPhaseColor}
                onChange={(e) => setNewPhaseColor(e.target.value)}
                className="w-8 h-8 rounded-lg border-0 p-0 cursor-pointer"
              />
              <input
                type="text"
                placeholder="Nombre de nueva fase..."
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
              />
              <button
                type="button"
                onClick={handleAddPhase}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Agregar Fase
              </button>
            </div>
          </div>

          {/* Team Members & Assignees Section */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Equipo y Responsables del Proyecto ({formData.assignees?.length || 0})</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Modifica los nombres, roles o quita responsables. Se actualizarán en todas las tareas del cronograma.
                </p>
              </div>

              {onOpenTeamModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTeamModal();
                  }}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  Gestionar Equipo Completo
                </button>
              )}
            </div>

            {assigneeActionNotice && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{assigneeActionNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAssigneeActionNotice(null)}
                  className="text-amber-700 hover:text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {(formData.assignees || []).map((assignee) => {
                const assignedCount = (project.tasks || []).filter(
                  (t) => t.assignee.id === assignee.id
                ).length;

                return (
                  <div
                    key={assignee.id}
                    className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200/80 hover:border-slate-300"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-2xs"
                      style={{ backgroundColor: assignee.avatarColor }}
                    >
                      {assignee.name.trim().charAt(0) || '?'}
                    </div>

                    <input
                      type="text"
                      required
                      value={assignee.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setFormData({
                          ...formData,
                          assignees: formData.assignees.map((a) =>
                            a.id === assignee.id ? { ...a, name: newName } : a
                          ),
                        });
                      }}
                      className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Nombre del responsable"
                      title="Cambiar el nombre del responsable"
                    />

                    <input
                      type="text"
                      value={assignee.role}
                      onChange={(e) => {
                        const newRole = e.target.value;
                        setFormData({
                          ...formData,
                          assignees: formData.assignees.map((a) =>
                            a.id === assignee.id ? { ...a, role: newRole } : a
                          ),
                        });
                      }}
                      className="w-36 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 hidden sm:block"
                      placeholder="Rol o cargo"
                      title="Cambiar el rol o cargo"
                    />

                    <span
                      className="text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md font-semibold shrink-0"
                      title={`${assignedCount} actividades asignadas`}
                    >
                      {assignedCount} act.
                    </span>

                    {/* Botón Quitar Responsable */}
                    <button
                      type="button"
                      onClick={() => handleRemoveAssignee(assignee.id, assignee.name)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      title={`Quitar a ${assignee.name} del proyecto`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Formulario rápido para añadir responsable */}
            <form onSubmit={handleAddAssignee} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newAssigneeName}
                onChange={(e) => setNewAssigneeName(e.target.value)}
                placeholder="Nombre de nuevo responsable..."
                className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <input
                type="text"
                value={newAssigneeRole}
                onChange={(e) => setNewAssigneeRole(e.target.value)}
                placeholder="Rol o cargo (opcional)"
                className="w-36 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 hidden sm:block"
              />
              <button
                type="submit"
                disabled={!newAssigneeName.trim()}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir</span>
              </button>
            </form>
          </div>

          {/* Backup, Import, Export, Reset */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Importar / Exportar / Respaldar Datos
            </h3>

            {onOpenRecoveryModal && (
              <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-amber-950 block">Centro de Respaldos & Puntos de Restauración</span>
                    <span className="text-[11px] text-amber-800">
                      Recupera versiones anteriores guardadas automáticamente por la aplicación.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRecoveryModal();
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shrink-0 shadow-2xs"
                >
                  Abrir Respaldos
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Botón Principal Exportar a Excel (.xlsx) */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await exportProjectToExcel(formData);
                  } catch (err) {
                    console.error('Error al exportar a Excel:', err);
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs hover:shadow"
                title="Descargar libro Excel profesional (.xlsx) con Cronograma Gantt visual completo, matriz diaria, Hojas de Equipo, Fases y Feriados"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Exportar Gantt a Excel (.xlsx)</span>
              </button>

              {onOpenExportModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenExportModal();
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                  title="Exportar el cronograma visual a imagen PNG de alta resolución o PDF ejecutivo"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Exportar Gantt (Imagen / PDF)</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar Respaldo JSON
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>

              <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Cargar JSON
                <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
              </label>

              <button
                type="button"
                onClick={() => {
                  setFormData({
                    ...formData,
                    tasks: formData.tasks.map((t) => ({ ...t, dependencies: [] })),
                  });
                  setPhaseActionNotice('Se eliminaron todas las predecesoras. Guarda la configuración para aplicar.');
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                title="Eliminar todas las dependencias y predecesoras de las tareas del proyecto"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Quitar Todas las Predecesoras</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onResetProject();
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 text-xs font-semibold rounded-xl transition-colors cursor-pointer ml-auto"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Restablecer Plantilla Inicial
              </button>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer"
            >
              Guardar Configuración
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
