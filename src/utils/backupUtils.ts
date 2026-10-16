import { Project, ProjectSnapshot } from '../types';

const SNAPSHOTS_KEY = 'gantt_snapshots_history_v1';
const MAX_SNAPSHOTS = 15;

/**
 * Retrieve all saved snapshots from localStorage
 */
export function getStoredSnapshots(): ProjectSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch (err) {
    console.error('Error loading snapshots from localStorage', err);
  }
  return [];
}

/**
 * Save a snapshot of the project into the history list in localStorage
 */
export function saveProjectSnapshot(
  project: Project,
  trigger: 'auto' | 'manual' | 'edit' = 'auto'
): ProjectSnapshot[] {
  try {
    if (!project || !project.tasks) return getStoredSnapshots();

    const currentSnapshots = getStoredSnapshots();

    // Avoid duplicate snapshots if project content is identical to the most recent one
    if (currentSnapshots.length > 0) {
      const latest = currentSnapshots[0];
      if (
        latest.projectTitle === project.title &&
        latest.taskCount === project.tasks.length &&
        JSON.stringify(latest.project.tasks) === JSON.stringify(project.tasks)
      ) {
        return currentSnapshots;
      }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const newSnapshot: ProjectSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      dateStr,
      projectTitle: project.title || 'Proyecto Sin Título',
      taskCount: project.tasks.length,
      project: JSON.parse(JSON.stringify(project)),
      trigger,
    };

    const updated = [newSnapshot, ...currentSnapshots].slice(0, MAX_SNAPSHOTS);
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Error saving snapshot', err);
    return getStoredSnapshots();
  }
}

/**
 * Delete a specific snapshot by ID
 */
export function deleteStoredSnapshot(id: string): ProjectSnapshot[] {
  try {
    const current = getStoredSnapshots().filter((s) => s.id !== id);
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(current));
    return current;
  } catch (err) {
    console.error('Error deleting snapshot', err);
    return getStoredSnapshots();
  }
}

/**
 * Scan all keys in localStorage and sessionStorage for any recover-able project data
 */
export function scanBrowserStoragesForProjects(): {
  key: string;
  source: 'localStorage' | 'sessionStorage';
  project: Project;
  taskCount: number;
  date?: string;
}[] {
  const results: {
    key: string;
    source: 'localStorage' | 'sessionStorage';
    project: Project;
    taskCount: number;
    date?: string;
  }[] = [];

  // Helper scanner
  const scanStorage = (storage: Storage, source: 'localStorage' | 'sessionStorage') => {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      try {
        const value = storage.getItem(key);
        if (!value || (!value.includes('tasks') && !value.includes('phases'))) continue;
        const parsed = JSON.parse(value);
        if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.phases)) {
          results.push({
            key,
            source,
            project: parsed,
            taskCount: parsed.tasks.length,
          });
        }
      } catch {
        // Not a JSON or invalid
      }
    }
  };

  try {
    scanStorage(localStorage, 'localStorage');
  } catch (e) {
    console.error(e);
  }

  try {
    scanStorage(sessionStorage, 'sessionStorage');
  } catch (e) {
    console.error(e);
  }

  return results;
}

/**
 * Copy raw JSON directly to user's clipboard
 */
export async function copyProjectToClipboard(project: Project): Promise<boolean> {
  try {
    const jsonStr = JSON.stringify(project, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(jsonStr);
      return true;
    }
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = jsonStr;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    textarea.remove();
    return success;
  } catch (err) {
    console.error('Failed to copy to clipboard', err);
    return false;
  }
}
