import { Task, Holiday } from '../types';

/**
 * Safely parses YYYY-MM-DD into a Date object at local midnight
 */
export function parseDate(dateStr: string): Date {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const trimmed = dateStr.trim();
  const parts = trimmed.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && year >= 1970 && year <= 2100) {
      return new Date(year, month, day, 0, 0, 0, 0);
    }
  }
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

/**
 * Formats a Date object into YYYY-MM-DD
 */
export function toISODate(date: Date): string {
  if (!date || isNaN(date.getTime())) {
    const fallback = new Date();
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds N days to a YYYY-MM-DD string
 */
export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + (Number(days) || 0));
  return toISODate(d);
}

/**
 * Returns difference in days: (date2 - date1)
 */
export function diffDays(date1Str: string, date2Str: string): number {
  const d1 = parseDate(date1Str);
  const d2 = parseDate(date2Str);
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = Math.round((d2.getTime() - d1.getTime()) / msPerDay);
  return isNaN(diff) ? 0 : diff;
}

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_NAMES_SHORT_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const DAY_NAMES_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Formats date into readable Spanish representation e.g. "15 Oct 2026"
 */
export function formatDateReadable(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getDate()} ${MONTH_NAMES_SHORT_ES[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getDate()} ${MONTH_NAMES_SHORT_ES[d.getMonth()]}`;
}

export function getMonthYearName(date: Date): string {
  return `${MONTH_NAMES_ES[date.getMonth()]} ${date.getFullYear()}`;
}

export function getDayName(date: Date): string {
  return DAY_NAMES_SHORT_ES[date.getDay()];
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

export function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * Returns holiday definition for a given date if present
 */
export function getHoliday(date: Date | string, holidays?: Holiday[]): Holiday | undefined {
  if (!holidays || holidays.length === 0) return undefined;
  const iso = typeof date === 'string' ? date : toISODate(date);
  return holidays.find((h) => h.date === iso);
}

export function isHoliday(date: Date | string, holidays?: Holiday[]): boolean {
  return getHoliday(date, holidays) !== undefined;
}

export function isNonWorkingDay(date: Date, holidays?: Holiday[]): boolean {
  return isWeekend(date) || isHoliday(date, holidays);
}

/**
 * Calculates working days (excluding weekends and declared holidays)
 */
export function countWorkingDays(startDateStr: string, endDateStr: string, holidays?: Holiday[]): number {
  const d1 = parseDate(startDateStr);
  const d2 = parseDate(endDateStr);
  if (d1 > d2) return 0;

  let count = 0;
  const curr = new Date(d1);
  while (curr <= d2) {
    if (!isWeekend(curr) && !isHoliday(curr, holidays)) {
      count++;
    }
    curr.setDate(curr.getDate() + 1);
  }
  return count;
}

/**
 * Returns all holidays falling within a specific date range
 */
export function getHolidaysInRange(startDateStr: string, endDateStr: string, holidays?: Holiday[]): Holiday[] {
  if (!holidays || holidays.length === 0) return [];
  return holidays.filter((h) => h.date >= startDateStr && h.date <= endDateStr);
}

/**
 * Calculates start and end bounds for the Gantt timeline with padding
 */
export function getTimelineBounds(tasks: Task[]): { start: Date; end: Date; totalDays: number } {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return { start, end, totalDays: Math.max(15, diffDays(toISODate(start), toISODate(end)) + 1) };
  }

  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const t of tasks) {
    if (!t) continue;
    const start = parseDate(t.startDate);
    const end = parseDate(t.endDate);
    if (!minDate || start < minDate) minDate = start;
    if (!maxDate || end > maxDate) maxDate = end;
  }

  if (!minDate || !maxDate || isNaN(minDate.getTime()) || isNaN(maxDate.getTime()) || minDate > maxDate) {
    const today = new Date();
    minDate = new Date(today.getFullYear(), today.getMonth(), 1);
    maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  }

  // Add 5 days buffer at start and 14 days at end
  const start = new Date(minDate);
  start.setDate(start.getDate() - 5);
  // Snap to Monday of that week
  const dayOfWeek = start.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  start.setDate(start.getDate() - diffToMonday);

  const end = new Date(maxDate);
  end.setDate(end.getDate() + 14);

  const totalDays = Math.max(15, Math.min(3650, diffDays(toISODate(start), toISODate(end)) + 1));

  return { start, end, totalDays };
}

/**
 * Calculates Critical Path using CPM (Critical Path Method).
 * Returns array of task IDs on the critical path.
 */
export function calculateCriticalPath(tasks: Task[]): Set<string> {
  const criticalIds = new Set<string>();
  if (tasks.length === 0) return criticalIds;

  const taskMap = new Map<string, Task>();
  tasks.forEach((t) => taskMap.set(t.id, t));

  // Determine durations
  const durations = new Map<string, number>();
  tasks.forEach((t) => {
    durations.set(t.id, Math.max(1, diffDays(t.startDate, t.endDate) + 1));
  });

  // Calculate Forward Pass (Early Start & Early Finish in relative days from project start)
  const minProjectStart = tasks.reduce((min, t) => {
    const d = parseDate(t.startDate).getTime();
    return d < min ? d : min;
  }, parseDate(tasks[0].startDate).getTime());

  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  // Topological sorting or memoized recursive compute
  function getES(taskId: string, visited = new Set<string>()): number {
    if (earlyStart.has(taskId)) return earlyStart.get(taskId)!;
    if (visited.has(taskId)) return 0; // Avoid cycles
    visited.add(taskId);

    const task = taskMap.get(taskId);
    if (!task) return 0;

    let maxPredEF = 0;
    const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
    for (const depId of deps) {
      if (taskMap.has(depId) && !visited.has(depId)) {
        const predEF = getEF(depId, new Set(visited));
        if (predEF > maxPredEF) maxPredEF = predEF;
      }
    }

    const naturalStart = Math.round((parseDate(task.startDate).getTime() - minProjectStart) / (1000 * 3600 * 24));
    const es = Math.max(naturalStart, maxPredEF);
    earlyStart.set(taskId, es);
    return es;
  }

  function getEF(taskId: string, visited = new Set<string>()): number {
    if (earlyFinish.has(taskId)) return earlyFinish.get(taskId)!;
    const es = getES(taskId, visited);
    const dur = durations.get(taskId) || 1;
    const ef = es + dur;
    earlyFinish.set(taskId, ef);
    return ef;
  }

  tasks.forEach((t) => {
    getES(t.id);
    getEF(t.id);
  });

  // Project completion time
  let maxProjectEF = 0;
  tasks.forEach((t) => {
    const ef = earlyFinish.get(t.id) || 0;
    if (ef > maxProjectEF) maxProjectEF = ef;
  });

  // Backward Pass (Late Start & Late Finish)
  const lateFinish = new Map<string, number>();
  const lateStart = new Map<string, number>();

  // Map successors
  const successors = new Map<string, string[]>();
  tasks.forEach((t) => {
    const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
    deps.forEach((depId) => {
      if (!successors.has(depId)) successors.set(depId, []);
      successors.get(depId)!.push(t.id);
    });
  });

  function getLF(taskId: string, visited = new Set<string>()): number {
    if (lateFinish.has(taskId)) return lateFinish.get(taskId)!;
    if (visited.has(taskId)) return maxProjectEF;
    visited.add(taskId);

    const succs = successors.get(taskId) || [];
    if (succs.length === 0) {
      lateFinish.set(taskId, maxProjectEF);
      return maxProjectEF;
    }

    let minSuccLS = Infinity;
    for (const succId of succs) {
      const succLS = getLS(succId, new Set(visited));
      if (succLS < minSuccLS) minSuccLS = succLS;
    }

    const lf = isFinite(minSuccLS) ? minSuccLS : maxProjectEF;
    lateFinish.set(taskId, lf);
    return lf;
  }

  function getLS(taskId: string, visited = new Set<string>()): number {
    if (lateStart.has(taskId)) return lateStart.get(taskId)!;
    const lf = getLF(taskId, visited);
    const dur = durations.get(taskId) || 1;
    const ls = lf - dur;
    lateStart.set(taskId, ls);
    return ls;
  }

  tasks.forEach((t) => {
    getLF(t.id);
    getLS(t.id);
  });

  // Tasks with slack (Late Start - Early Start) <= 0 or <= 1 are critical
  tasks.forEach((t) => {
    const es = earlyStart.get(t.id) ?? 0;
    const ls = lateStart.get(t.id) ?? 0;
    const slack = ls - es;
    if (slack <= 0.5) {
      criticalIds.add(t.id);
    }
  });

  return criticalIds;
}

/**
 * Advances a date to the first working day on or after dateStr.
 * If dateStr falls on a weekend or declared holiday, it advances until a working day is reached.
 */
export function ensureWorkingDay(dateStr: string, holidays?: Holiday[]): string {
  const d = parseDate(dateStr);
  while (isNonWorkingDay(d, holidays)) {
    d.setDate(d.getDate() + 1);
  }
  return toISODate(d);
}

/**
 * Returns the next working day strictly AFTER dateStr.
 * (dateStr + 1 day, skipping weekends and declared holidays).
 */
export function getNextWorkingDay(dateStr: string, holidays?: Holiday[]): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + 1);
  while (isNonWorkingDay(d, holidays)) {
    d.setDate(d.getDate() + 1);
  }
  return toISODate(d);
}

/**
 * Calculates the end date given a start date and a duration in working days.
 * Only working days (skipping weekends and declared holidays) are counted.
 * A 1-working-day task starts and ends on the same working day.
 */
export function calculateEndDateFromWorkingDays(
  startDateStr: string,
  workingDays: number,
  holidays?: Holiday[]
): string {
  const validStart = ensureWorkingDay(startDateStr, holidays);
  const daysNeeded = Math.max(1, workingDays);
  if (daysNeeded === 1) {
    return validStart;
  }

  const curr = parseDate(validStart);
  let counted = 1;

  while (counted < daysNeeded) {
    curr.setDate(curr.getDate() + 1);
    if (!isNonWorkingDay(curr, holidays)) {
      counted++;
    }
  }

  return toISODate(curr);
}

/**
 * Automatically cascades and reschedules successor tasks when a predecessor changes.
 * Strictly considers only working days (omits weekends and declared holidays).
 * Preserves the working-day duration of all affected successors.
 */
export function cascadeSuccessorTasks(
  allTasks: Task[],
  changedTask: Task,
  holidays?: Holiday[]
): { updatedTasks: Task[]; affectedCount: number } {
  const taskMap = new Map<string, Task>();
  allTasks.forEach((t) => {
    taskMap.set(t.id, t.id === changedTask.id ? changedTask : { ...t, dependencies: Array.isArray(t.dependencies) ? t.dependencies : [] });
  });

  taskMap.set(changedTask.id, changedTask);

  let affectedCount = 0;
  const queue: string[] = [changedTask.id];
  const visited = new Set<string>();
  let loopCount = 0;
  const MAX_LOOPS = 250; // Guard against circular dependencies

  while (queue.length > 0 && loopCount < MAX_LOOPS) {
    loopCount++;
    const predId = queue.shift()!;
    visited.add(predId);
    const predTask = taskMap.get(predId);
    if (!predTask) continue;

    // Direct successors are tasks that declare predId in their dependencies
    const directSuccessors = Array.from(taskMap.values()).filter((t) =>
      Array.isArray(t.dependencies) && t.dependencies.includes(predId)
    );

    for (const succ of directSuccessors) {
      const deps = Array.isArray(succ.dependencies) ? succ.dependencies : [];
      const allPreds = deps
        .map((pId) => taskMap.get(pId))
        .filter((p): p is Task => p !== undefined);

      if (allPreds.length === 0) continue;

      // Earliest valid start is next working day after the latest predecessor end date
      let requiredMinStart = '';
      for (const p of allPreds) {
        const nextWork = getNextWorkingDay(p.endDate, holidays);
        if (!requiredMinStart || nextWork > requiredMinStart) {
          requiredMinStart = nextWork;
        }
      }

      // Calculate current successor duration in working days (preserve user-set workingDays if present)
      const currentWorkingDays = succ.workingDays || Math.max(
        1,
        countWorkingDays(succ.startDate, succ.endDate, holidays)
      );

      const newStart = requiredMinStart;
      const newEnd = succ.isMilestone
        ? newStart
        : calculateEndDateFromWorkingDays(newStart, currentWorkingDays, holidays);

      // Check if dates changed
      if (newStart !== succ.startDate || newEnd !== succ.endDate) {
        const updatedSucc: Task = {
          ...succ,
          startDate: newStart,
          endDate: newEnd,
          workingDays: currentWorkingDays,
        };
        taskMap.set(succ.id, updatedSucc);
        affectedCount++;

        if (!visited.has(succ.id) && !queue.includes(succ.id)) {
          queue.push(succ.id);
        }
      }
    }
  }

  const updatedTasks = allTasks.map((t) => taskMap.get(t.id) || t);
  if (!allTasks.some((t) => t.id === changedTask.id)) {
    updatedTasks.push(taskMap.get(changedTask.id)!);
  }

  return { updatedTasks, affectedCount };
}

/**
 * Returns the latest working day strictly on or BEFORE dateStr.
 * If dateStr is a weekend or holiday, it rewinds day by day until a working day is found.
 */
export function ensurePreviousWorkingDay(dateStr: string, holidays?: Holiday[]): string {
  const d = parseDate(dateStr);
  while (isNonWorkingDay(d, holidays)) {
    d.setDate(d.getDate() - 1);
  }
  return toISODate(d);
}

/**
 * Aligns a single task to strictly working days:
 * - Start date is moved forward to the first working day if it falls on weekend or holiday.
 * - End date is recalculated based on the task's working days duration, skipping all holidays and weekends.
 * - For milestones: endDate equals startDate (both on a working day).
 */
export function alignTaskToWorkingDays(task: Task, holidays?: Holiday[]): Task {
  const validStart = ensureWorkingDay(task.startDate, holidays);

  if (task.isMilestone) {
    return {
      ...task,
      startDate: validStart,
      endDate: validStart,
      workingDays: 1,
    };
  }

  const durationMode = task.durationMode || 'working_days';
  if (durationMode === 'working_days') {
    const wDays = task.workingDays || Math.max(1, countWorkingDays(task.startDate, task.endDate, holidays));
    const validEnd = calculateEndDateFromWorkingDays(validStart, wDays, holidays);
    return {
      ...task,
      startDate: validStart,
      endDate: validEnd,
      workingDays: wDays,
      durationMode: 'working_days',
    };
  } else {
    // Calendar days mode: preserve calendar days if possible, but ensure start is a working day
    const calDays = Math.max(1, diffDays(task.startDate, task.endDate) + 1);
    const validEnd = addDays(validStart, calDays - 1);
    const wDays = Math.max(1, countWorkingDays(validStart, validEnd, holidays));
    return {
      ...task,
      startDate: validStart,
      endDate: validEnd,
      workingDays: wDays,
    };
  }
}

/**
 * Normalizes all tasks in a project to ensure that:
 * 1. No task starts or ends on a weekend or holiday.
 * 2. Every task's duration in working days omits weekends and declared holidays.
 * 3. All successor tasks are scheduled on or after the first working day following their predecessors.
 */
export function removeAllDependencies(tasks: Task[]): Task[] {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((t) => ({ ...t, dependencies: [] }));
}

export function sanitizeTaskDependencies(tasks: Task[]): Task[] {
  if (!Array.isArray(tasks)) return [];
  const taskIds = new Set(tasks.map((t) => t.id));
  return tasks.map((t) => {
    const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
    const validDeps = deps.filter((dId) => dId && dId !== t.id && taskIds.has(dId));
    return {
      ...t,
      dependencies: validDeps,
    };
  });
}

export function alignAllTasksToWorkingDays(
  tasks: Task[],
  holidays?: Holiday[]
): { updatedTasks: Task[]; adjustedCount: number } {
  let adjustedCount = 0;
  const taskMap = new Map<string, Task>();

  // Step 1: Align independent tasks to working days
  tasks.forEach((t) => {
    const aligned = alignTaskToWorkingDays(t, holidays);
    if (aligned.startDate !== t.startDate || aligned.endDate !== t.endDate || aligned.workingDays !== t.workingDays) {
      adjustedCount++;
    }
    taskMap.set(t.id, aligned);
  });

  // Step 2: Cascade dependencies to ensure successors start on valid working days after predecessors
  const sortedTasks = [...taskMap.values()];
  sortedTasks.forEach((task) => {
    if (task.dependencies.length > 0) {
      let requiredMinStart = '';
      for (const predId of task.dependencies) {
        const pred = taskMap.get(predId);
        if (pred) {
          const nextWorking = getNextWorkingDay(pred.endDate, holidays);
          if (!requiredMinStart || nextWorking > requiredMinStart) {
            requiredMinStart = nextWorking;
          }
        }
      }

      if (requiredMinStart && task.startDate < requiredMinStart) {
        const newStart = requiredMinStart;
        const wDays = task.workingDays || Math.max(1, countWorkingDays(task.startDate, task.endDate, holidays));
        const newEnd = task.isMilestone
          ? newStart
          : calculateEndDateFromWorkingDays(newStart, wDays, holidays);

        if (newStart !== task.startDate || newEnd !== task.endDate) {
          taskMap.set(task.id, {
            ...task,
            startDate: newStart,
            endDate: newEnd,
            workingDays: wDays,
          });
          adjustedCount++;
        }
      }
    }
  });

  return {
    updatedTasks: tasks.map((t) => taskMap.get(t.id) || t),
    adjustedCount,
  };
}


