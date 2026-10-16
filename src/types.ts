export type TaskStatus = 'pending' | 'in_progress' | 'review' | 'completed' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type ZoomLevel = 'day' | 'week' | 'month';

export interface Assignee {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
}

export interface Phase {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface Task {
  id: string;
  name: string;
  phaseId: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  progress: number;  // 0 - 100
  status: TaskStatus;
  priority: TaskPriority;
  assignee: Assignee;
  dependencies: string[]; // IDs of tasks that must finish before this one starts
  isMilestone?: boolean;
  color?: string;    // Custom color override
  deliverable?: string;
  notes?: string;
  estimatedHours?: number;
  actualHours?: number;
  durationMode?: 'working_days' | 'calendar_days';
  workingDays?: number;
  consultantRationale?: string;
  notConsideredByConsultant?: boolean; // Tarea considerada internamente pero no contemplada por la consultora
  consultantExclusionReason?: string; // Motivo o justificación de por qué la consultora no la considera
}

export interface Holiday {
  id: string;
  date: string; // 'YYYY-MM-DD'
  name: string;
  description?: string;
}

export interface ConsultantProposal {
  id: string;
  consultantName: string;
  version: string;
  proposalDate: string;
  notes?: string;
  project: Project;
}

export interface Project {
  id: string;
  title: string;
  client: string;
  manager: string;
  startDate: string;
  targetEndDate: string;
  budget?: number;
  currency?: string;
  phases: Phase[];
  tasks: Task[];
  assignees: Assignee[];
  holidays?: Holiday[];
}

export interface DragState {
  type: 'move' | 'resize-start' | 'resize-end' | 'progress';
  taskId: string;
  startX: number;
  initialStartDate: string;
  initialEndDate: string;
  initialProgress: number;
  daysDelta: number;
}

export interface ProjectSnapshot {
  id: string;
  timestamp: number;
  dateStr: string;
  projectTitle: string;
  taskCount: number;
  project: Project;
  trigger: 'auto' | 'manual' | 'edit';
}
