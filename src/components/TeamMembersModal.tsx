import React, { useState, useEffect } from 'react';
import { Assignee, Task } from '../types';
import {
  Users,
  UserPlus,
  Trash2,
  Check,
  X,
  Briefcase,
  User,
  AlertCircle,
  Sparkles,
  ArrowRightLeft,
  CheckCircle2,
} from 'lucide-react';

interface TeamMembersModalProps {
  isOpen: boolean;
  assignees: Assignee[];
  tasks: Task[];
  onClose: () => void;
  onSaveAssignees: (
    updatedAssignees: Assignee[],
    reassignmentMap?: Record<string, string>
  ) => void;
}

const PRESET_AVATAR_COLORS = [
  '#4f46e5', // Indigo
  '#0891b2', // Cyan
  '#059669', // Emerald
  '#d97706', // Amber
  '#e11d48', // Rose
  '#7c3aed', // Violet
  '#2563eb', // Blue
  '#475569', // Slate
  '#db2777', // Pink
  '#0d9488', // Teal
];

export const TeamMembersModal: React.FC<TeamMembersModalProps> = ({
  isOpen,
  assignees,
  tasks,
  onClose,
  onSaveAssignees,
}) => {
  const [members, setMembers] = useState<Assignee[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');
  const [newMemberColor, setNewMemberColor] = useState(PRESET_AVATAR_COLORS[0]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [replacementAssigneeId, setReplacementAssigneeId] = useState<string>('unassigned');
  const [reassignmentMap, setReassignmentMap] = useState<Record<string, string>>({});
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMembers(JSON.parse(JSON.stringify(assignees)));
      setConfirmDeleteId(null);
      setNoticeMessage(null);
      setReassignmentMap({});
      setNewMemberName('');
      setNewMemberRole('');
      setNewMemberColor(
        PRESET_AVATAR_COLORS[assignees.length % PRESET_AVATAR_COLORS.length]
      );
    }
  }, [isOpen, assignees]);

  if (!isOpen) return null;

  const handleUpdateMember = (
    id: string,
    field: 'name' | 'role' | 'avatarColor',
    value: string
  ) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    const newMember: Assignee = {
      id: `usr-${Date.now()}`,
      name: newMemberName.trim(),
      role: newMemberRole.trim() || 'Miembro del Equipo',
      avatarColor: newMemberColor,
    };

    setMembers((prev) => [...prev, newMember]);
    setNewMemberName('');
    setNewMemberRole('');
    setNewMemberColor(
      PRESET_AVATAR_COLORS[(members.length + 1) % PRESET_AVATAR_COLORS.length]
    );
    setNoticeMessage(`Se agregó a "${newMember.name}" al equipo.`);
  };

  const handleExecuteRemove = (
    idToRemove: string,
    name: string,
    targetReplacementId: string,
    saveImmediately: boolean = false
  ) => {
    if (members.length <= 1) {
      setNoticeMessage('El proyecto debe contar con al menos un responsable. Añade otro antes de quitar este.');
      setConfirmDeleteId(null);
      return;
    }

    const updatedList = members.filter((m) => m.id !== idToRemove);
    const updatedMap = {
      ...reassignmentMap,
      [idToRemove]: targetReplacementId,
    };

    const assignedCount = tasks.filter((t) => t.assignee.id === idToRemove).length;

    if (saveImmediately) {
      onSaveAssignees(updatedList, updatedMap);
      onClose();
      return;
    }

    setMembers(updatedList);
    setReassignmentMap(updatedMap);
    setConfirmDeleteId(null);

    const replacementMember = updatedList.find((m) => m.id === targetReplacementId);
    const destinationLabel =
      targetReplacementId === 'unassigned'
        ? 'quedarán Sin Asignar'
        : `se reasignarán a "${replacementMember?.name || 'otro responsable'}"`;

    setNoticeMessage(
      `Se quitó a "${name}". ${
        assignedCount > 0
          ? `Sus ${assignedCount} actividades ${destinationLabel} al guardar.`
          : 'No tenía tareas asignadas.'
      }`
    );
  };

  const handleSave = () => {
    // Validate names
    const hasEmpty = members.some((m) => !m.name.trim());
    if (hasEmpty) {
      setNoticeMessage('Todos los responsables deben tener un nombre válido.');
      return;
    }

    onSaveAssignees(members, reassignmentMap);
    onClose();
  };

  return (
    <div
      id="team-members-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        id="team-members-modal-container"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur-md border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Equipo y Responsables del Proyecto
              </h2>
              <p className="text-xs text-slate-500">
                Cambia nombres, roles, colores o quita responsables. Se actualizará en todo el cronograma Gantt.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status / Notice Banner */}
          {noticeMessage && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{noticeMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setNoticeMessage(null)}
                className="text-amber-700 hover:text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Active Members List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <span>Miembros Actuales ({members.length})</span>
              </h3>
              <span className="text-[11px] text-slate-500 font-medium">
                Edita el nombre o presiona "Quitar" para remover a alguien del equipo
              </span>
            </div>

            <div className="space-y-2.5">
              {members.map((member) => {
                const assignedCount = tasks.filter(
                  (t) => t.assignee.id === member.id
                ).length;
                const isConfirmingThis = confirmDeleteId === member.id;
                const otherMembers = members.filter((m) => m.id !== member.id);

                return (
                  <div
                    key={member.id}
                    className={`p-3.5 border rounded-xl transition-all flex flex-col gap-3 group ${
                      isConfirmingThis
                        ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-200'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Avatar preview */}
                        <div className="relative shrink-0">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-2xs"
                            style={{ backgroundColor: member.avatarColor }}
                            title={`Inicial: ${member.name.charAt(0) || '?'}`}
                          >
                            {member.name.trim().charAt(0) || '?'}
                          </div>
                        </div>

                        {/* Name & Role Inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 min-w-0">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              Nombre Completo (Editable)
                            </label>
                            <input
                              type="text"
                              required
                              value={member.name}
                              onChange={(e) =>
                                handleUpdateMember(member.id, 'name', e.target.value)
                              }
                              placeholder="Nombre del responsable"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              title="Cambia el nombre aquí directamente"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              Rol o Cargo
                            </label>
                            <input
                              type="text"
                              value={member.role}
                              onChange={(e) =>
                                handleUpdateMember(member.id, 'role', e.target.value)
                              }
                              placeholder="Ej. Líder Técnico, QA..."
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              title="Cambia el rol o cargo"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Color mini-palette & task count badge & Quitar button */}
                      <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
                        {/* Color Mini-Picker */}
                        <div className="flex items-center gap-1" title="Cambiar color del avatar">
                          {PRESET_AVATAR_COLORS.slice(0, 4).map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() =>
                                handleUpdateMember(member.id, 'avatarColor', color)
                              }
                              className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer ${
                                member.avatarColor === color
                                  ? 'ring-2 ring-indigo-500 scale-110'
                                  : 'opacity-70 hover:opacity-100 hover:scale-105'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>

                        {/* Tasks count badge */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            assignedCount > 0
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                          title={`${assignedCount} actividad(es) asignadas`}
                        >
                          {assignedCount} {assignedCount === 1 ? 'tarea' : 'tareas'}
                        </span>

                        {/* Clear Quitar Button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (members.length <= 1) {
                              setNoticeMessage(
                                'El proyecto debe contar con al menos un responsable. Agrega otro antes de quitar este.'
                              );
                            } else {
                              const willOpen = !isConfirmingThis;
                              setConfirmDeleteId(willOpen ? member.id : null);
                              if (willOpen) {
                                const fallback = otherMembers[0];
                                setReplacementAssigneeId(fallback ? fallback.id : 'unassigned');
                              }
                            }
                          }}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            isConfirmingThis
                              ? 'bg-rose-600 text-white shadow-2xs'
                              : 'text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600'
                          }`}
                          title={`Quitar a "${member.name}"`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Quitar</span>
                        </button>
                      </div>
                    </div>

                    {/* Inline Delete Confirmation Box */}
                    {isConfirmingThis && (
                      <div className="p-3.5 bg-white border border-rose-200 rounded-xl space-y-3 shadow-2xs animate-in fade-in">
                        <div className="flex items-start gap-2 text-rose-950 text-xs">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block">
                              ¿Confirmas quitar a "{member.name}" del equipo?
                            </span>
                            {assignedCount > 0 ? (
                              <span className="text-slate-600 mt-0.5 block">
                                Tiene <strong className="text-rose-700">{assignedCount} actividad(es) asignadas</strong>. Elige qué hacer con sus tareas:
                              </span>
                            ) : (
                              <span className="text-slate-500 mt-0.5 block">
                                No tiene actividades asignadas en este momento.
                              </span>
                            )}
                          </div>
                        </div>

                        {assignedCount > 0 && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-slate-100">
                            <label className="text-[11px] font-bold text-slate-700 shrink-0 flex items-center gap-1">
                              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Reasignar sus tareas a:</span>
                            </label>
                            <select
                              value={replacementAssigneeId}
                              onChange={(e) => setReplacementAssigneeId(e.target.value)}
                              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                            >
                              {otherMembers.map((other) => (
                                <option key={other.id} value={other.id}>
                                  {other.name} ({other.role})
                                </option>
                              ))}
                              <option value="unassigned">— Dejar Sin Asignar —</option>
                            </select>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleExecuteRemove(
                                member.id,
                                member.name,
                                replacementAssigneeId,
                                true
                              )
                            }
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-2xs cursor-pointer text-xs transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Sí, Quitar y Guardar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleExecuteRemove(
                                member.id,
                                member.name,
                                replacementAssigneeId,
                                false
                              )
                            }
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg cursor-pointer text-xs transition-colors"
                          >
                            Quitar de la lista
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1.5 text-slate-500 hover:text-slate-800 font-medium rounded-lg cursor-pointer text-xs transition-colors ml-auto"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add New Member Section */}
          <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Añadir Nuevo Responsable al Equipo</span>
            </h3>

            <form onSubmit={handleAddMember} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nombre del Responsable *
                  </label>
                  <input
                    type="text"
                    required
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Ej. Valentina Ríos"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Rol o Cargo
                  </label>
                  <input
                    type="text"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    placeholder="Ej. Especialista en Datos"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Color Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-medium">Color:</span>
                  <div className="flex items-center gap-1">
                    {PRESET_AVATAR_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewMemberColor(color)}
                        className={`w-5 h-5 rounded-full transition-all cursor-pointer ${
                          newMemberColor === color
                            ? 'ring-2 ring-indigo-600 ring-offset-1 scale-110'
                            : 'opacity-70 hover:opacity-100 hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!newMemberName.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Añadir Responsable</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100">
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Los cambios renombrarán a los responsables en todas las vistas y gráficos.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-600 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Guardar Cambios</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
