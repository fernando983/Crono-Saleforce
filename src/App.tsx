import React, { useState, useEffect, useMemo } from 'react';
import { Project, Task, Phase, Assignee, Holiday, ProjectSnapshot } from './types';
import { INITIAL_PROJECT } from './utils/sampleData';
import {
  toISODate,
  addDays,
  calculateCriticalPath,
  cascadeSuccessorTasks,
  ensureWorkingDay,
  calculateEndDateFromWorkingDays,
  alignAllTasksToWorkingDays,
  alignTaskToWorkingDays,
} from './utils/dateUtils';
import { GanttChart } from './components/GanttChart';
import { ProjectMonthsView } from './components/ProjectMonthsView';
import { ScheduleComparisonView } from './components/ScheduleComparisonView';
import { TaskModal } from './components/TaskModal';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { HolidayCalendarModal } from './components/HolidayCalendarModal';
import { RecoveryModal } from './components/RecoveryModal';
import { GanttExportModal } from './components/GanttExportModal';
import { TeamMembersModal } from './components/TeamMembersModal';
import { NewGanttModal } from './components/NewGanttModal';
import { GanttErrorBoundary } from './components/GanttErrorBoundary';
import { saveProjectSnapshot, getStoredSnapshots } from './utils/backupUtils';
import { createDefaultConsultantProject } from './utils/consultantPresets';
import { ConsultantProposal } from './types';
import {
  BarChart3,
  Plus,
  Settings,
  Flag,
  Share2,
  CheckCircle,
  Briefcase,
  Layers,
  Sparkles,
  CalendarCheck,
  CalendarDays,
  Workflow,
  Lock,
  Unlock,
  History,
  RotateCcw,
  X,
  AlertTriangle,
  Download,
  Users,
  FileSpreadsheet,
  GitCompare,
  FolderPlus,
  Trash2,
} from 'lucide-react';
import { exportProjectToExcel } from './utils/excelExport';

const STORAGE_KEY = 'gantt_implementation_project_v1';
const CONSULTANT_PROPOSAL_KEY = 'gantt_consultant_proposal_v1';
const METRICS_COLLAPSED_KEY = 'gantt_metrics_collapsed_v1';
const SCHEDULE_LOCKED_KEY = 'gantt_schedule_locked_v1';

export default function App() {
  const [project, setProject] = useState<Project>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: Project = JSON.parse(saved);
        const { updatedTasks } = alignAllTasksToWorkingDays(parsed.tasks || [], parsed.holidays || []);
        return {
          ...parsed,
          tasks: updatedTasks,
        };
      }
      // Check if any snapshots exist in case STORAGE_KEY was reset
      const snapshots = getStoredSnapshots();
      if (snapshots.length > 0 && snapshots[0].project) {
        const snapProj = snapshots[0].project;
        const { updatedTasks } = alignAllTasksToWorkingDays(snapProj.tasks || [], snapProj.holidays || []);
        return {
          ...snapProj,
          tasks: updatedTasks,
        };
      }
    } catch {
      // Fallback
    }
    return INITIAL_PROJECT;
  });

  // Consultant Proposal state (loaded from storage or initialized from default proposal)
  const [consultantProposal, setConsultantProposal] = useState<ConsultantProposal>(() => {
    try {
      const saved = localStorage.getItem(CONSULTANT_PROPOSAL_KEY);
      if (saved) {
        const parsed: ConsultantProposal = JSON.parse(saved);
        if (parsed.project && parsed.project.tasks) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return createDefaultConsultantProject(project);
  });

  useEffect(() => {
    try {
      localStorage.setItem(CONSULTANT_PROPOSAL_KEY, JSON.stringify(consultantProposal));
    } catch (e) {
      console.error('Error saving consultant proposal to localStorage', e);
    }
  }, [consultantProposal]);

  const [activeView, setActiveView] = useState<'gantt' | 'project_months' | 'comparison'>('gantt');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isNewGanttModalOpen, setIsNewGanttModalOpen] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>('Guardado localmente');
  const [notification, setNotification] = useState<{
    show: boolean;
    type?: 'cascade' | 'lock' | 'unlock' | 'error';
    title?: string;
    message: string;
  }>({ show: false, message: '' });

  // Automatically keep consultant proposal synchronized with internal schedule updates
  useEffect(() => {
    setConsultantProposal((prevProp) => {
      if (!prevProp || !prevProp.project) return prevProp;
      const prevConsultantTasks = prevProp.project.tasks || [];
      const consultantTaskMap = new Map(prevConsultantTasks.map((t) => [t.id, t]));

      let hasChanges = false;
      const syncedConsultantTasks: Task[] = project.tasks.map((currTask) => {
        const existing = consultantTaskMap.get(currTask.id);
        if (!existing) {
          hasChanges = true;
          // New internal task -> mirror into proposal
          return { ...currTask };
        }
        // If task metadata changed in internal schedule, sync it
        if (
          existing.name !== currTask.name ||
          existing.phaseId !== currTask.phaseId ||
          existing.deliverable !== currTask.deliverable ||
          existing.isMilestone !== currTask.isMilestone ||
          existing.assignee.id !== currTask.assignee.id
        ) {
          hasChanges = true;
          return {
            ...existing,
            name: currTask.name,
            phaseId: currTask.phaseId,
            deliverable: currTask.deliverable,
            assignee: currTask.assignee,
            isMilestone: currTask.isMilestone,
          };
        }
        return existing;
      });

      if (syncedConsultantTasks.length !== prevConsultantTasks.length) {
        hasChanges = true;
      }

      if (!hasChanges) return prevProp;

      return {
        ...prevProp,
        project: {
          ...prevProp.project,
          phases: project.phases,
          holidays: project.holidays,
          tasks: syncedConsultantTasks,
        },
      };
    });
  }, [project.tasks, project.phases, project.holidays]);

  // Schedule lock: freezes dates and durations across the entire project
  const [isScheduleLocked, setIsScheduleLocked] = useState<boolean>(false);

  const handleToggleScheduleLock = () => {
    setIsScheduleLocked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SCHEDULE_LOCKED_KEY, String(next));
      } catch {
        // ignore
      }
      setNotification({
        show: true,
        type: next ? 'lock' : 'unlock',
        title: next ? 'Cronograma Fijado' : 'Cronograma Desbloqueado',
        message: next
          ? 'Todas las fechas han quedado bloqueadas. Los plazos y la carta Gantt no se moverán por cambios accidentales.'
          : 'El cronograma ha sido desbloqueado. Las fechas pueden editarse y reprogramarse con normalidad.',
      });
      return next;
    });
  };

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification({ show: false, message: '' });
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  // Emergency recovery detection: check if there is an automatic snapshot with strictly more tasks
  const [availableRestoreSnapshot, setAvailableRestoreSnapshot] = useState<ProjectSnapshot | null>(null);

  useEffect(() => {
    try {
      const snapshots = getStoredSnapshots();
      // Find the most recent snapshot that has strictly more tasks than the current project
      const candidate = snapshots.find((s) => s.taskCount > project.tasks.length);
      if (candidate) {
        setAvailableRestoreSnapshot(candidate);
      } else {
        setAvailableRestoreSnapshot(null);
      }
    } catch {
      // ignore
    }
  }, [project.tasks.length, isRecoveryModalOpen]);

  // Auto-save to localStorage and snapshot history
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      saveProjectSnapshot(project, 'auto');
      const now = new Date();
      setLastSavedTime(
        `Guardado ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      );
    } catch (e) {
      console.error('Error saving project to local storage', e);
    }
  }, [project]);

  // Critical path calculation
  const criticalTaskIds = useMemo(() => calculateCriticalPath(project.tasks), [project.tasks]);

  // Task CRUD operations with working-day successor cascading
  const handleUpdateTask = (updatedTask: Task) => {
    setProject((prev) => {
      const existingTask = prev.tasks.find((t) => t.id === updatedTask.id);

      // If schedule is locked, protect startDate and endDate from moving
      let taskToApply = updatedTask;
      if (isScheduleLocked && existingTask) {
        taskToApply = {
          ...updatedTask,
          startDate: existingTask.startDate,
          endDate: existingTask.endDate,
        };
      }

      // When schedule is locked, apply attributes without cascading dates
      if (isScheduleLocked) {
        return {
          ...prev,
          tasks: prev.tasks.map((t) => (t.id === taskToApply.id ? taskToApply : t)),
        };
      }

      // Ensure task dates strictly respect working days (skipping holidays and weekends)
      const alignedTask = alignTaskToWorkingDays(taskToApply, prev.holidays);

      const { updatedTasks, affectedCount } = cascadeSuccessorTasks(
        prev.tasks,
        alignedTask,
        prev.holidays
      );

      if (affectedCount > 0) {
        setNotification({
          show: true,
          type: 'cascade',
          title: 'Vínculo en Cascada (Días Hábiles)',
          message: `Se reprogramaron automáticamente ${affectedCount} tarea(s) sucesora(s) considerando solo días hábiles.`,
        });
      }

      return {
        ...prev,
        tasks: updatedTasks,
      };
    });
  };

  const handleSaveTaskModal = (taskToSave: Task) => {
    setProject((prev) => {
      const existingTask = prev.tasks.find((t) => t.id === taskToSave.id);

      let finalTask = taskToSave;
      if (isScheduleLocked && existingTask) {
        finalTask = {
          ...taskToSave,
          startDate: existingTask.startDate,
          endDate: existingTask.endDate,
        };
      }

      const exists = !!existingTask;
      const baseTasks = exists
        ? prev.tasks.map((t) => (t.id === finalTask.id ? finalTask : t))
        : [...prev.tasks, finalTask];

      if (isScheduleLocked) {
        return {
          ...prev,
          tasks: baseTasks,
        };
      }

      const alignedFinalTask = alignTaskToWorkingDays(finalTask, prev.holidays);
      const alignedBaseTasks = exists
        ? prev.tasks.map((t) => (t.id === alignedFinalTask.id ? alignedFinalTask : t))
        : [...prev.tasks, alignedFinalTask];

      const { updatedTasks, affectedCount } = cascadeSuccessorTasks(
        alignedBaseTasks,
        alignedFinalTask,
        prev.holidays
      );

      if (affectedCount > 0) {
        setNotification({
          show: true,
          type: 'cascade',
          title: 'Vínculo en Cascada (Días Hábiles)',
          message: `Se reprogramaron automáticamente ${affectedCount} tarea(s) sucesora(s) considerando solo días hábiles.`,
        });
      }

      // Synchronize assignee in project.assignees if renamed or new (ignore 'unassigned')
      let updatedAssignees = [...prev.assignees];
      if (finalTask.assignee.id !== 'unassigned') {
        const aIdx = updatedAssignees.findIndex((a) => a.id === finalTask.assignee.id);
        if (aIdx !== -1) {
          if (
            updatedAssignees[aIdx].name !== finalTask.assignee.name ||
            updatedAssignees[aIdx].role !== finalTask.assignee.role ||
            updatedAssignees[aIdx].avatarColor !== finalTask.assignee.avatarColor
          ) {
            updatedAssignees[aIdx] = finalTask.assignee;
          }
        } else {
          updatedAssignees.push(finalTask.assignee);
        }
      }

      // Propagate any name/role change for this assignee ID across all tasks
      const syncedUpdatedTasks = updatedTasks.map((t) =>
        t.assignee.id === finalTask.assignee.id ? { ...t, assignee: finalTask.assignee } : t
      );

      return {
        ...prev,
        assignees: updatedAssignees,
        tasks: syncedUpdatedTasks,
      };
    });
  };

  const handleDeleteTask = (taskId: string) => {
    setProject((prev) => ({
      ...prev,
      tasks: prev.tasks
        .filter((t) => t.id !== taskId)
        .map((t) => ({
          ...t,
          dependencies: t.dependencies.filter((dId) => dId !== taskId),
        })),
    }));
    setIsTaskModalOpen(false);
  };

  const handleDuplicateTask = (taskToDuplicate: Task) => {
    const newId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const duplicatedTask: Task = {
      ...taskToDuplicate,
      id: newId,
      name: `${taskToDuplicate.name} (Copia)`,
      progress: 0,
      status: 'pending',
      dependencies: [...taskToDuplicate.dependencies],
    };

    setProject((prev) => {
      const originalIndex = prev.tasks.findIndex((t) => t.id === taskToDuplicate.id);
      const newTasks = [...prev.tasks];
      if (originalIndex !== -1) {
        newTasks.splice(originalIndex + 1, 0, duplicatedTask);
      } else {
        newTasks.push(duplicatedTask);
      }
      return {
        ...prev,
        tasks: newTasks,
      };
    });

    setNotification({
      show: true,
      type: 'cascade',
      title: 'Tarea Duplicada',
      message: `Tarea duplicada con éxito: "${duplicatedTask.name}" con todas sus configuraciones y dependencias.`,
    });
  };

  const handleClearAllDependencies = () => {
    const totalDeps = project.tasks.reduce(
      (sum, t) => sum + (Array.isArray(t.dependencies) ? t.dependencies.length : 0),
      0
    );

    // Save snapshot first so the user can easily revert if needed
    saveProjectSnapshot(project, 'auto');

    setProject((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => ({ ...t, dependencies: [] })),
    }));

    setNotification({
      show: true,
      type: 'cascade',
      title: 'Predecesoras Eliminadas',
      message:
        totalDeps > 0
          ? `Se eliminaron las predecesoras (${totalDeps} enlaces). Todas las tareas conservaron sus fechas y ahora son 100% independientes.`
          : 'Todas las tareas del proyecto ya son independientes y no tienen predecesoras activas.',
    });
  };

  const handleCreateNewProject = (newProject: Project) => {
    // Save current snapshot
    saveProjectSnapshot(project, 'manual');

    setProject(newProject);
    const newProposal = createDefaultConsultantProject(newProject);
    setConsultantProposal(newProposal);
    setActiveView('gantt');

    setNotification({
      show: true,
      title: '¡Nuevo Cronograma Creado!',
      message: `Se ha creado el proyecto "${newProject.title}" con ${newProject.tasks.length} tareas.`,
    });
  };

  const handleSyncConsultantProposalWithCurrent = (baselineOnly = false) => {
    const syncedProposal = createDefaultConsultantProject(project);
    if (baselineOnly) {
      syncedProposal.project = {
        ...project,
        title: `${project.title} (Línea Base Contractual)`,
        tasks: JSON.parse(JSON.stringify(project.tasks)),
      };
      syncedProposal.consultantName = 'Línea Base Inicial / Contractual';
      syncedProposal.version = 'Línea Base v1.0';
    }
    setConsultantProposal(syncedProposal);
    setNotification({
      show: true,
      title: baselineOnly ? 'Línea Base Fijada' : 'Comparativa Sincronizada con lo Actual',
      message: baselineOnly
        ? 'El cronograma actual ha sido guardado como Línea Base fija para comparar todas las futuras desviaciones.'
        : `Se sincronizó la propuesta comparativa con las ${project.tasks.length} actividades actuales del proyecto.`,
    });
  };

  const handleSaveHolidays = (updatedHolidays: Holiday[]) => {
    setProject((prev) => {
      // Realign all tasks so they strictly obey working days (skipping holidays and weekends)
      const { updatedTasks, adjustedCount } = alignAllTasksToWorkingDays(prev.tasks, updatedHolidays);
      if (adjustedCount > 0) {
        setNotification({
          show: true,
          type: 'cascade',
          title: 'Cronograma Ajustado a Días Hábiles',
          message: `Se actualizaron los feriados y se reprogramaron ${adjustedCount} tarea(s) para que no inicien ni finalicen en feriados.`,
        });
      }
      return {
        ...prev,
        holidays: updatedHolidays,
        tasks: updatedTasks,
      };
    });
  };

  const handleSaveAssignees = (
    updatedAssignees: Assignee[],
    reassignmentMap?: Record<string, string>
  ) => {
    setProject((prev) => {
      const assigneeMap = new Map<string, Assignee>();
      updatedAssignees.forEach((a) => assigneeMap.set(a.id, a));

      const fallbackAssignee = updatedAssignees[0] || {
        id: 'unassigned',
        name: 'Sin Asignar',
        role: 'Sin Asignar',
        avatarColor: '#94a3b8',
      };

      const updatedTasks = prev.tasks.map((task) => {
        const matchingAssignee = assigneeMap.get(task.assignee.id);
        if (matchingAssignee) {
          return {
            ...task,
            assignee: matchingAssignee,
          };
        }

        const targetId = reassignmentMap ? reassignmentMap[task.assignee.id] : undefined;
        if (targetId && targetId !== 'unassigned') {
          const targetAssignee = assigneeMap.get(targetId);
          if (targetAssignee) {
            return {
              ...task,
              assignee: targetAssignee,
            };
          }
        }

        if (targetId === 'unassigned') {
          return {
            ...task,
            assignee: {
              id: 'unassigned',
              name: 'Sin Asignar',
              role: 'Sin Asignar',
              avatarColor: '#94a3b8',
            },
          };
        }

        return {
          ...task,
          assignee: fallbackAssignee,
        };
      });

      return {
        ...prev,
        assignees: updatedAssignees,
        tasks: updatedTasks,
      };
    });

    setNotification({
      show: true,
      type: 'cascade',
      title: 'Equipo y Responsables Actualizados',
      message: 'Se actualizaron los responsables y las asignaciones del proyecto correctamente.',
    });
  };

  // Consultant Proposal Adoption Handlers
  const handleAdoptConsultantTask = (taskId: string, proposedTask: Task) => {
    setProject((prev) => {
      const existingTask = prev.tasks.find((t) => t.id === taskId);
      if (!existingTask) return prev;

      const updatedTask: Task = {
        ...existingTask,
        startDate: proposedTask.startDate,
        endDate: proposedTask.endDate,
        workingDays: proposedTask.workingDays,
        durationMode: proposedTask.durationMode,
        estimatedHours: proposedTask.estimatedHours,
      };

      const alignedTask = alignTaskToWorkingDays(updatedTask, prev.holidays);
      const { updatedTasks, affectedCount } = cascadeSuccessorTasks(
        prev.tasks,
        alignedTask,
        prev.holidays
      );

      setNotification({
        show: true,
        type: 'cascade',
        title: 'Propuesta de Consultora Adoptada',
        message: `Se aplicaron las fechas de la consultora para "${existingTask.name}".${
          affectedCount > 0 ? ` Se reprogramaron ${affectedCount} tarea(s) sucesora(s).` : ''
        }`,
      });

      return {
        ...prev,
        tasks: updatedTasks,
      };
    });
  };

  const handleAdoptAllConsultantTasks = (proposedTasks: Task[]) => {
    setProject((prev) => {
      const taskMap = new Map(proposedTasks.map((t) => [t.id, t]));
      const newTasks = prev.tasks.map((existing) => {
        const proposed = taskMap.get(existing.id);
        if (!proposed) return existing;
        return {
          ...existing,
          startDate: proposed.startDate,
          endDate: proposed.endDate,
          workingDays: proposed.workingDays,
          durationMode: proposed.durationMode,
          estimatedHours: proposed.estimatedHours,
        };
      });

      const { updatedTasks } = alignAllTasksToWorkingDays(newTasks, prev.holidays || []);

      setNotification({
        show: true,
        type: 'cascade',
        title: 'Cronograma Completo Adoptado',
        message: `Se aplicaron todas las fechas y plazos propuestos por la consultora (${proposedTasks.length} tareas actualizadas).`,
      });

      return {
        ...prev,
        tasks: updatedTasks,
      };
    });
  };

  const handleResetConsultantProposal = () => {
    const defaultProposal = createDefaultConsultantProject(project);
    setConsultantProposal(defaultProposal);
    setNotification({
      show: true,
      title: 'Propuesta Restablecida',
      message: 'Se ha reiniciado el cronograma propuesto por la consultora a sus valores por defecto.',
    });
  };

  const handleExportExcel = async () => {
    try {
      const filename = await exportProjectToExcel(project);
      setNotification({
        show: true,
        type: 'cascade',
        title: 'Libro Excel Descargado',
        message: `Se descargó "${filename}" con el cronograma Gantt visual completo, matriz diaria, tareas y equipo.`,
      });
    } catch (err) {
      console.error('Error al exportar a Excel:', err);
      setNotification({
        show: true,
        type: 'error',
        title: 'Error de Exportación',
        message: 'Ocurrió un error al generar el archivo Excel.',
      });
    }
  };

  const handleMoveTask = (taskId: string, direction: 'up' | 'down') => {
    setProject((prev) => {
      const sortedPhases = [...prev.phases].sort((a, b) => a.order - b.order);

      // Reconstruct task lists grouped by phase
      const phaseTasksMap = new Map<string, Task[]>();
      sortedPhases.forEach((p) => phaseTasksMap.set(p.id, []));

      prev.tasks.forEach((t) => {
        const list = phaseTasksMap.get(t.phaseId);
        if (list) {
          list.push(t);
        } else {
          const fallback = phaseTasksMap.get(sortedPhases[0]?.id || '') || [];
          fallback.push(t);
        }
      });

      // Find the task's current phase and position
      let currentPhaseId: string | null = null;
      let indexInPhase = -1;

      for (const [pId, list] of phaseTasksMap.entries()) {
        const idx = list.findIndex((t) => t.id === taskId);
        if (idx !== -1) {
          currentPhaseId = pId;
          indexInPhase = idx;
          break;
        }
      }

      if (!currentPhaseId || indexInPhase === -1) return prev;

      const currentList = phaseTasksMap.get(currentPhaseId)!;
      const currentPhaseIndex = sortedPhases.findIndex((p) => p.id === currentPhaseId);

      if (direction === 'up') {
        if (indexInPhase > 0) {
          // Swap with previous task in same phase
          const temp = currentList[indexInPhase];
          currentList[indexInPhase] = currentList[indexInPhase - 1];
          currentList[indexInPhase - 1] = temp;
        } else if (currentPhaseIndex > 0) {
          // Move to the previous phase, placing at the end
          const prevPhaseId = sortedPhases[currentPhaseIndex - 1].id;
          const [taskToMove] = currentList.splice(indexInPhase, 1);
          const updatedTask = { ...taskToMove, phaseId: prevPhaseId };
          const prevList = phaseTasksMap.get(prevPhaseId)!;
          prevList.push(updatedTask);
        }
      } else if (direction === 'down') {
        if (indexInPhase < currentList.length - 1) {
          // Swap with next task in same phase
          const temp = currentList[indexInPhase];
          currentList[indexInPhase] = currentList[indexInPhase + 1];
          currentList[indexInPhase + 1] = temp;
        } else if (currentPhaseIndex < sortedPhases.length - 1) {
          // Move to the next phase, placing at the beginning
          const nextPhaseId = sortedPhases[currentPhaseIndex + 1].id;
          const [taskToMove] = currentList.splice(indexInPhase, 1);
          const updatedTask = { ...taskToMove, phaseId: nextPhaseId };
          const nextList = phaseTasksMap.get(nextPhaseId)!;
          nextList.unshift(updatedTask);
        }
      }

      // Flatten reordered lists back into tasks array
      const newTasks: Task[] = [];
      sortedPhases.forEach((p) => {
        const list = phaseTasksMap.get(p.id) || [];
        newTasks.push(...list);
      });

      return {
        ...prev,
        tasks: newTasks,
      };
    });
  };

  const handleReorderTasks = (
    draggedTaskId: string,
    targetTaskId: string | null,
    position: 'before' | 'after' | 'inside_phase',
    targetPhaseId?: string
  ) => {
    setProject((prev) => {
      const sortedPhases = [...prev.phases].sort((a, b) => a.order - b.order);
      const tasks = [...prev.tasks];
      const draggedIdx = tasks.findIndex((t) => t.id === draggedTaskId);
      if (draggedIdx === -1) return prev;

      const [draggedTask] = tasks.splice(draggedIdx, 1);

      if (position === 'inside_phase' && targetPhaseId) {
        const updatedTask = { ...draggedTask, phaseId: targetPhaseId };
        let lastPhaseIdx = -1;
        for (let i = tasks.length - 1; i >= 0; i--) {
          if (tasks[i].phaseId === targetPhaseId) {
            lastPhaseIdx = i;
            break;
          }
        }
        if (lastPhaseIdx !== -1) {
          tasks.splice(lastPhaseIdx + 1, 0, updatedTask);
        } else {
          const phaseIdx = sortedPhases.findIndex((p) => p.id === targetPhaseId);
          let insertPos = tasks.length;
          for (let i = 0; i < tasks.length; i++) {
            const tPhaseIdx = sortedPhases.findIndex((p) => p.id === tasks[i].phaseId);
            if (tPhaseIdx > phaseIdx) {
              insertPos = i;
              break;
            }
          }
          tasks.splice(insertPos, 0, updatedTask);
        }
        return { ...prev, tasks };
      }

      if (targetTaskId) {
        const targetIdx = tasks.findIndex((t) => t.id === targetTaskId);
        if (targetIdx !== -1) {
          const targetTask = tasks[targetIdx];
          const updatedTask = {
            ...draggedTask,
            phaseId: targetTask.phaseId,
          };
          const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
          tasks.splice(insertIdx, 0, updatedTask);
          return { ...prev, tasks };
        }
      }

      tasks.push(draggedTask);
      return { ...prev, tasks };
    });
  };

  const handleOpenNewTask = (phaseId?: string, isMilestone = false) => {
    const targetPhaseId = phaseId || project.phases[0]?.id || 'fase-1';
    const rawToday = toISODate(new Date());
    const validStart = ensureWorkingDay(rawToday, project.holidays || []);
    const defaultWorkingDays = 5;
    const computedEnd = isMilestone
      ? validStart
      : calculateEndDateFromWorkingDays(validStart, defaultWorkingDays, project.holidays || []);

    const newTask: Task = {
      id: `task-${Date.now()}`,
      name: isMilestone ? 'Nuevo Hito Clave' : 'Nueva Actividad de Implementación',
      phaseId: targetPhaseId,
      startDate: validStart,
      endDate: computedEnd,
      durationMode: 'working_days',
      workingDays: isMilestone ? 1 : defaultWorkingDays,
      progress: 0,
      status: 'pending',
      priority: 'medium',
      assignee: project.assignees[0] || {
        id: 'usr-default',
        name: 'Líder de Proyecto',
        role: 'PM',
        avatarColor: '#4f46e5',
      },
      dependencies: [],
      isMilestone,
      deliverable: '',
      notes: '',
    };

    setEditingTask(newTask);
    setIsTaskModalOpen(true);
  };

  const handleResetProject = () => {
    setProject(INITIAL_PROJECT);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div id="app-wrapper" className="min-h-screen flex flex-col bg-slate-100 text-slate-800">
      {/* Top Application Bar */}
      <header id="main-header" className="bg-white border-b border-slate-200 px-5 py-3.5 shadow-2xs sticky top-0 z-40">
        <div className="max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Project Titles */}
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-slate-900 truncate tracking-tight">
                  {project.title}
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-extrabold bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200/60 uppercase">
                  Gantt Editable
                </span>
              </div>
              <div className="flex items-center space-x-3 text-xs text-slate-500 truncate mt-0.5">
                <span className="font-medium text-slate-600">{project.client}</span>
                <span>•</span>
                <span>PM: <strong className="text-slate-700">{project.manager}</strong></span>
                <span>•</span>
                <span className="text-[11px] text-emerald-600 flex items-center gap-1 font-semibold">
                  <CheckCircle className="w-3 h-3" />
                  {lastSavedTime}
                </span>
              </div>
            </div>
          </div>

          {/* Center: View Switcher */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              id="view-tab-gantt"
              onClick={() => setActiveView('gantt')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeView === 'gantt'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Gantt Interactivo</span>
            </button>
            <button
              id="view-tab-project-months"
              onClick={() => setActiveView('project_months')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeView === 'project_months'
                  ? 'bg-white text-indigo-600 shadow-xs ring-1 ring-indigo-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Vista intermedia ajustada según los meses que dura el proyecto, con desglose semanal equilibrado"
            >
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              <span>Meses del Proyecto</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                Ajustada
              </span>
            </button>
            <button
              id="view-tab-comparison"
              onClick={() => setActiveView('comparison')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeView === 'comparison'
                  ? 'bg-white text-purple-700 shadow-xs ring-1 ring-purple-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Comparar cronograma actual vs propuesta de la consultora con desglose visual, matriz de diferencias y reporte Excel"
            >
              <GitCompare className="w-4 h-4 text-purple-600" />
              <span>Comparar Cronogramas</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                Consultora
              </span>
            </button>
          </div>

          {/* Right: Quick Action Buttons */}
          <div className="flex items-center space-x-2">
            {/* Nuevo Gantt Button */}
            <button
              id="header-new-gantt-btn"
              onClick={() => setIsNewGanttModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow transition-all cursor-pointer"
              title="Crear un nuevo diagrama de Gantt en blanco o a partir de una plantilla profesional"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Nuevo Gantt</span>
            </button>

            <button
              id="quick-add-milestone-btn"
              onClick={() => handleOpenNewTask(undefined, true)}
              className="hidden sm:flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer"
              title="Crear nuevo hito"
            >
              <Flag className="w-3.5 h-3.5 text-indigo-600" />
              <span>+ Hito</span>
            </button>

            <button
              id="quick-add-task-btn"
              onClick={() => handleOpenNewTask()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Tarea</span>
            </button>

            <button
              id="project-team-btn"
              onClick={() => setIsTeamModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer"
              title="Cambiar nombres de responsables y administrar equipo"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Equipo</span>
              <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-[10px] font-bold">
                {project.assignees?.length || 0}
              </span>
            </button>

            <button
              id="project-recovery-btn"
              onClick={() => setIsRecoveryModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl transition-all shadow-2xs cursor-pointer text-xs font-bold"
              title="Centro de Respaldos: Recuperar versiones guardadas o perdidas"
            >
              <History className="w-3.5 h-3.5 text-amber-700" />
              <span className="hidden sm:inline">Respaldos & Recuperar</span>
              <span className="sm:hidden">Respaldos</span>
            </button>

            <button
              id="project-settings-btn"
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-2xs cursor-pointer"
              title="Configuración de fases, importación y exportación"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main App Content Area */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 flex flex-col min-h-0">
        {/* Emergency Recovery Banner: Appears automatically if tasks were lost */}
        {availableRestoreSnapshot && (
          <div
            id="emergency-recovery-banner"
            className="mb-3.5 p-3.5 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
                <History className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-amber-950">
                    ¿Se borraron tus tareas anteriores al cambiar la WBS?
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-200/80 text-amber-900 border border-amber-300">
                    Respaldo encontrado ({availableRestoreSnapshot.taskCount} tareas)
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Detectamos una versión guardada a las <strong>{availableRestoreSnapshot.dateStr}</strong> con{' '}
                  <strong>{availableRestoreSnapshot.taskCount} tareas</strong> de tu cronograma.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                id="emergency-restore-btn"
                onClick={() => {
                  setProject(availableRestoreSnapshot.project);
                  setAvailableRestoreSnapshot(null);
                  setNotification({
                    show: true,
                    type: 'unlock',
                    title: '¡Cronograma Restaurado!',
                    message: `Se recuperaron con éxito las ${availableRestoreSnapshot.taskCount} tareas del proyecto "${availableRestoreSnapshot.projectTitle}".`,
                  });
                }}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar mi cronograma ({availableRestoreSnapshot.taskCount} tareas)</span>
              </button>

              <button
                onClick={() => setIsRecoveryModalOpen(true)}
                className="px-3 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Ver todos los respaldos
              </button>

              <button
                onClick={() => setAvailableRestoreSnapshot(null)}
                className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-100 rounded-lg cursor-pointer"
                title="Ocultar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* View Body */}
        <div className="flex-1 min-h-[580px] flex flex-col">
          {activeView === 'gantt' && (
            <GanttErrorBoundary
              onClearPredecessors={handleClearAllDependencies}
              onResetView={() => setActiveView('gantt')}
            >
              <GanttChart
                tasks={project.tasks}
                phases={project.phases}
                assignees={project.assignees}
                holidays={project.holidays || []}
                isScheduleLocked={isScheduleLocked}
                onToggleScheduleLock={handleToggleScheduleLock}
                onOpenExportModal={() => setIsExportModalOpen(true)}
                onExportExcel={handleExportExcel}
                onUpdateTask={handleUpdateTask}
                onEditTaskModal={(task) => {
                  setEditingTask(task);
                  setIsTaskModalOpen(true);
                }}
                onDeleteTask={handleDeleteTask}
                onAddTaskInPhase={(phaseId) => handleOpenNewTask(phaseId)}
                onDuplicateTask={handleDuplicateTask}
                onClearAllDependencies={handleClearAllDependencies}
                onOpenHolidaysModal={() => setIsHolidayModalOpen(true)}
                onMoveTask={handleMoveTask}
                onReorderTasks={handleReorderTasks}
              />
            </GanttErrorBoundary>
          )}

          {activeView === 'project_months' && (
            <ProjectMonthsView
              tasks={project.tasks}
              phases={project.phases}
              assignees={project.assignees}
              holidays={project.holidays || []}
              projectTitle={project.title}
              projectStartDate={project.startDate}
              projectTargetEndDate={project.targetEndDate}
              onUpdateTask={handleUpdateTask}
              onEditTaskModal={(task) => {
                setEditingTask(task);
                setIsTaskModalOpen(true);
              }}
              onDeleteTask={handleDeleteTask}
              onAddTaskInPhase={(phaseId) => handleOpenNewTask(phaseId)}
              onDuplicateTask={handleDuplicateTask}
              onExportExcel={handleExportExcel}
            />
          )}

          {activeView === 'comparison' && (
            <ScheduleComparisonView
              currentProject={project}
              consultantProposal={consultantProposal}
              onUpdateConsultantProposal={(updated) => setConsultantProposal(updated)}
              onAdoptConsultantTask={handleAdoptConsultantTask}
              onAdoptAllConsultantTasks={handleAdoptAllConsultantTasks}
              onResetConsultantProposal={handleResetConsultantProposal}
              onUpdateCurrentTask={handleUpdateTask}
              onEditCurrentTask={(task) => {
                setEditingTask(task);
                setIsTaskModalOpen(true);
              }}
              onSyncWithCurrent={handleSyncConsultantProposalWithCurrent}
            />
          )}
        </div>
      </main>

      {/* Task & Milestone Editor Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        task={editingTask}
        phases={project.phases}
        assignees={project.assignees}
        allTasks={project.tasks}
        holidays={project.holidays || []}
        isScheduleLocked={isScheduleLocked}
        onToggleScheduleLock={handleToggleScheduleLock}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTaskModal}
        onDelete={handleDeleteTask}
        onDuplicate={handleDuplicateTask}
        onOpenTeamModal={() => setIsTeamModalOpen(true)}
      />

      {/* Project & Phases Settings Modal */}
      <ProjectSettingsModal
        isOpen={isSettingsModalOpen}
        project={project}
        onClose={() => setIsSettingsModalOpen(false)}
        onSaveProject={(updated) => setProject(updated)}
        onResetProject={handleResetProject}
        onOpenHolidaysModal={() => setIsHolidayModalOpen(true)}
        onOpenRecoveryModal={() => setIsRecoveryModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenTeamModal={() => setIsTeamModalOpen(true)}
      />

      {/* New Gantt Modal */}
      <NewGanttModal
        isOpen={isNewGanttModalOpen}
        onClose={() => setIsNewGanttModalOpen(false)}
        onCreateProject={handleCreateNewProject}
      />

      {/* Team Members & Assignees Modal */}
      <TeamMembersModal
        isOpen={isTeamModalOpen}
        assignees={project.assignees || []}
        tasks={project.tasks || []}
        onClose={() => setIsTeamModalOpen(false)}
        onSaveAssignees={handleSaveAssignees}
      />

      {/* Gantt Export Modal (Image PNG / PDF) */}
      <GanttExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        project={project}
        onShowNotification={(message, type) => {
          setNotification({
            show: true,
            type: 'unlock',
            title: type === 'error' ? 'Aviso' : 'Exportación de Cronograma',
            message,
          });
        }}
      />

      {/* Holiday Calendar Modal */}
      <HolidayCalendarModal
        isOpen={isHolidayModalOpen}
        holidays={project.holidays || []}
        onClose={() => setIsHolidayModalOpen(false)}
        onSaveHolidays={handleSaveHolidays}
      />

      {/* Recovery & Snapshots Modal */}
      <RecoveryModal
        isOpen={isRecoveryModalOpen}
        currentProject={project}
        onClose={() => setIsRecoveryModalOpen(false)}
        onRestoreProject={(restoredProject) => {
          setProject(restoredProject);
          setNotification({
            show: true,
            type: 'unlock',
            title: 'Proyecto Restaurado',
            message: `Se restauró con éxito el proyecto "${restoredProject.title}" con ${restoredProject.tasks.length} tareas.`,
          });
        }}
      />

      {/* System Toast Notification (Cascade & Schedule Lock/Unlock) */}
      {notification.show && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 bg-slate-900 text-white text-xs font-semibold rounded-2xl shadow-xl border border-slate-700/80 animate-in fade-in slide-in-from-bottom-3 duration-200 max-w-md">
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border ${
              notification.type === 'error'
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                : notification.type === 'lock'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : notification.type === 'unlock'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
            }`}
          >
            {notification.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            ) : notification.type === 'lock' ? (
              <Lock className="w-4 h-4" />
            ) : notification.type === 'unlock' ? (
              <Unlock className="w-4 h-4" />
            ) : (
              <Workflow className="w-4 h-4" />
            )}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-bold text-white text-xs">
              {notification.title || (notification.type === 'lock' ? 'Cronograma Fijado' : 'Vínculo en Cascada')}
            </span>
            <span className="text-[11px] text-slate-300 leading-tight mt-0.5">
              {notification.message}
            </span>
          </div>
          <button
            onClick={() => setNotification({ show: false, message: '' })}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer text-xs"
            title="Cerrar notificación"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
