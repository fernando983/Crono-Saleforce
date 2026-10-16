import ExcelJS from 'exceljs';
import { Project, Task, Phase, Assignee, Holiday } from '../types';
import {
  diffDays,
  parseDate,
  toISODate,
  formatDateShort,
  formatDateReadable,
  getDayName,
  isWeekend,
  getHoliday,
  countWorkingDays,
  calculateCriticalPath,
} from './dateUtils';

export interface ExcelExportOptions {
  includeGanttMatrix?: boolean;
  includeSummarySheets?: boolean;
  includeHolidaysSheet?: boolean;
  includeCriticalPathSheet?: boolean;
}

// ARGB Color Constants
const COLORS = {
  NAVY_HEADER: 'FF1E293B',    // Slate 800
  INDIGO_HEADER: 'FF312E81',  // Indigo 900
  BLUE_HEADER: 'FF1E40AF',    // Blue 800
  EMERALD_HEADER: 'FF065F46', // Emerald 800
  AMBER_HEADER: 'FF78350F',   // Amber 900
  ROSE_HEADER: 'FF881337',    // Rose 900
  WHITE: 'FFFFFFFF',
  PHASE_BG: 'FFEEF2FF',       // Soft indigo 50
  PHASE_BAR: 'FF4338CA',      // Indigo 700
  TASK_COMPLETED: 'FF10B981', // Emerald 500
  TASK_IN_PROGRESS: 'FF2563EB',// Blue 600
  TASK_PENDING: 'FF6366F1',   // Indigo 500
  TASK_BLOCKED: 'FFEF4444',   // Red 500
  TASK_MILESTONE: 'FF7C3AED', // Purple 600
  WEEKEND_BG: 'FFF8FAFC',     // Slate 50
  HOLIDAY_BG: 'FFFEF3C7',     // Amber 100
  BORDER_COLOR: 'FFE2E8F0',   // Slate 200
  BORDER_DARK: 'FF94A3B8',    // Slate 400
  TEXT_MUTED: 'FF64748B',     // Slate 500
  TEXT_MAIN: 'FF0F172A',      // Slate 900
};

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLORS.BORDER_COLOR } },
  left: { style: 'thin', color: { argb: COLORS.BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: COLORS.BORDER_COLOR } },
  right: { style: 'thin', color: { argb: COLORS.BORDER_COLOR } },
};

const BORDER_HEADER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLORS.BORDER_DARK } },
  left: { style: 'thin', color: { argb: COLORS.BORDER_DARK } },
  bottom: { style: 'medium', color: { argb: 'FF334155' } },
  right: { style: 'thin', color: { argb: COLORS.BORDER_DARK } },
};

/**
 * Generates and downloads a rich, professional, complete Excel workbook (.xlsx)
 * representing the ENTIRE Gantt chart with:
 * 1. Full WBS hierarchy (Phase summary rows + Task rows + Orphan tasks)
 * 2. Complete daily Gantt timeline matrix with NO date truncation
 * 3. REAL cell colors, fills, and borders for all tasks and phases
 * 4. Merged Month and Week header rows
 * 5. Frozen panes (columns A-E and header rows) so task names never disappear
 * 6. Executive sheets: All Tasks Database, Team Workload, Phase WBS Summary, Holidays, and Critical Path
 */
export async function exportProjectToExcel(
  project: Project,
  options: ExcelExportOptions = {
    includeGanttMatrix: true,
    includeSummarySheets: true,
    includeHolidaysSheet: true,
    includeCriticalPathSheet: true,
  }
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gantt Chart Studio Pro';
  wb.lastModifiedBy = project.manager || 'Project Manager';
  wb.created = new Date();
  wb.modified = new Date();

  const tasks = project.tasks || [];
  const phases = project.phases || [];
  const holidays = project.holidays || [];
  const assignees = project.assignees || [];
  const criticalTaskIds = calculateCriticalPath(tasks);

  // Status Translation Map
  const statusLabels: Record<string, string> = {
    pending: 'Pendiente',
    in_progress: 'En Progreso',
    review: 'En Revisión',
    completed: 'Completada',
    blocked: 'Bloqueada',
  };

  const priorityLabels: Record<string, string> = {
    critical: 'Crítica',
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
  };

  // Sort phases by order
  const sortedPhases = [...phases].sort((a, b) => a.order - b.order);

  // Group tasks by phase and capture orphan tasks
  const handledTaskIds = new Set<string>();
  const phaseGroupedTasks: {
    phase: Phase;
    wbsPhaseCode: string;
    tasks: { task: Task; wbsCode: string }[];
  }[] = [];

  sortedPhases.forEach((phase, pIdx) => {
    const phaseTasks = tasks.filter((t) => t.phaseId === phase.id);
    const taskEntries: { task: Task; wbsCode: string }[] = [];

    phaseTasks.forEach((task, tIdx) => {
      handledTaskIds.add(task.id);
      taskEntries.push({
        task,
        wbsCode: `${pIdx + 1}.${tIdx + 1}`,
      });
    });

    phaseGroupedTasks.push({
      phase,
      wbsPhaseCode: `${pIdx + 1}.0`,
      tasks: taskEntries,
    });
  });

  // Catch any tasks not belonging to a recognized phase so 100% of tasks are exported
  const orphanTasks = tasks.filter((t) => !handledTaskIds.has(t.id));
  if (orphanTasks.length > 0) {
    const orphanPhaseIdx = sortedPhases.length + 1;
    const fallbackPhase: Phase = {
      id: 'phase-other',
      name: 'Otras Actividades / Sin Fase Asignada',
      color: '#64748b',
      order: orphanPhaseIdx,
    };
    phaseGroupedTasks.push({
      phase: fallbackPhase,
      wbsPhaseCode: `${orphanPhaseIdx}.0`,
      tasks: orphanTasks.map((task, tIdx) => ({
        task,
        wbsCode: `${orphanPhaseIdx}.${tIdx + 1}`,
      })),
    });
  }

  // -------------------------------------------------------------
  // CALCULATE COMPLETE TIMELINE BOUNDS (NO ARBITRARY TRUNCATION)
  // -------------------------------------------------------------
  let minDateStr = project.startDate || (tasks.length > 0 ? tasks[0].startDate : toISODate(new Date()));
  let maxDateStr = project.targetEndDate || (tasks.length > 0 ? tasks[0].endDate : toISODate(new Date()));

  tasks.forEach((t) => {
    if (t.startDate && (!minDateStr || t.startDate < minDateStr)) minDateStr = t.startDate;
    if (t.endDate && (!maxDateStr || t.endDate > maxDateStr)) maxDateStr = t.endDate;
  });

  const minDateObj = parseDate(minDateStr);
  const maxDateObj = parseDate(maxDateStr);

  // Snap start date to Monday of start week (with 2 days buffer)
  const startDate = new Date(minDateObj);
  startDate.setDate(startDate.getDate() - 2);
  const startDayOfWeek = startDate.getDay();
  const diffToMonday = (startDayOfWeek + 6) % 7;
  startDate.setDate(startDate.getDate() - diffToMonday);

  // Snap end date to Sunday of end week (with 5 days buffer)
  const endDate = new Date(maxDateObj);
  endDate.setDate(endDate.getDate() + 5);
  const endDayOfWeek = endDate.getDay();
  const diffToSunday = (7 - endDayOfWeek) % 7;
  endDate.setDate(endDate.getDate() + diffToSunday);

  const totalDays = Math.max(14, diffDays(toISODate(startDate), toISODate(endDate)) + 1);

  const timelineDays: {
    date: Date;
    dateStr: string;
    dayNum: number;
    dayName: string;
    monthKey: string;
    monthLabel: string;
    isWknd: boolean;
    holiday?: Holiday;
  }[] = [];

  const curr = new Date(startDate);
  for (let i = 0; i < totalDays; i++) {
    const dStr = toISODate(curr);
    const hol = getHoliday(curr, holidays);
    const monthKey = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = `${curr.toLocaleString('es-ES', { month: 'long' }).toUpperCase()} ${curr.getFullYear()}`;
    timelineDays.push({
      date: new Date(curr),
      dateStr: dStr,
      dayNum: curr.getDate(),
      dayName: getDayName(curr),
      monthKey,
      monthLabel,
      isWknd: isWeekend(curr),
      holiday: hol,
    });
    curr.setDate(curr.getDate() + 1);
  }

  // Base descriptive headers
  const baseHeaders = [
    'WBS',
    'Tipo',
    'Actividad / Tarea',
    'Fase WBS',
    'Responsable',
    'Rol / Cargo',
    'Prioridad',
    'Estado',
    '% Avance',
    'Fecha Inicio',
    'Fecha Fin',
    'Días Háb.',
    'Días Cal.',
    'Predecesoras',
    'Alcance Consultora',
    'Entregable Clave',
  ];
  const BASE_COLS = baseHeaders.length; // 16 columns

  // -------------------------------------------------------------
  // SHEET 1: CRONOGRAMA GANTT COMPLETO (WBS + Matriz Diaria Visual)
  // -------------------------------------------------------------
  const wsGantt = wb.addWorksheet('Cronograma Gantt', {
    properties: { tabColor: { argb: 'FF10B981' } },
    views: [
      {
        state: 'frozen',
        xSplit: 4, // Freeze columns A to D (WBS, Tipo, Actividad, Fase)
        ySplit: 8, // Freeze rows 1 to 8 (Executive header + months + days)
        zoomScale: 80, // 80% zoom so visual Gantt is immediately visible at first glance
        showGridLines: true,
      },
    ],
  });

  // Calculate project metrics
  const totalProgress =
    tasks.length > 0
      ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length)
      : 0;
  const completedCount = tasks.filter((t) => t.status === 'completed' || t.progress === 100).length;
  const inProgressCount = tasks.filter((t) => t.progress > 0 && t.progress < 100).length;
  const milestoneCount = tasks.filter((t) => t.isMilestone).length;
  const criticalCount = tasks.filter((t) => criticalTaskIds.has(t.id)).length;
  const projectWorkingDays = countWorkingDays(
    toISODate(startDate),
    toISODate(endDate),
    holidays
  );

  // ROW 1: Project Title
  const r1 = wsGantt.getRow(1);
  r1.height = 30;
  r1.getCell(1).value = `CRONOGRAMA GANTT COMPLETO — ${project.title.toUpperCase()}`;
  r1.getCell(1).font = { name: 'Calibri', size: 15, bold: true, color: { argb: COLORS.WHITE } };
  r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
  wsGantt.mergeCells(1, 1, 1, BASE_COLS + (options.includeGanttMatrix ? timelineDays.length : 0));

  // ROW 2: Metadata Block 1
  const r2 = wsGantt.getRow(2);
  r2.height = 20;
  r2.values = [
    `Cliente: ${project.client || 'N/A'}`,
    '',
    `Project Manager: ${project.manager || 'N/A'}`,
    '',
    `Presupuesto: ${project.currency || 'USD'} ${project.budget ? project.budget.toLocaleString() : '0'}`,
    '',
    `Fecha de Emisión: ${formatDateReadable(toISODate(new Date()))}`,
    '',
    `Total Actividades: ${tasks.length}`,
    '',
    `Fases del Proyecto: ${phases.length}`,
  ];
  styleInfoRow(r2);

  // ROW 3: Metadata Block 2
  const r3 = wsGantt.getRow(3);
  r3.height = 20;
  r3.values = [
    `Período Total: ${formatDateShort(toISODate(startDate))} al ${formatDateShort(toISODate(endDate))}`,
    '',
    `Duración Total: ${projectWorkingDays} días hábiles (${totalDays} días cal.)`,
    '',
    `Avance Global: ${totalProgress}%`,
    '',
    `Tareas Completadas: ${completedCount} de ${tasks.length}`,
    '',
    `Tareas en Curso: ${inProgressCount}`,
    '',
    `Hitos Clave: ${milestoneCount}`,
  ];
  styleInfoRow(r3);

  // ROW 4: Metadata Block 3
  const r4 = wsGantt.getRow(4);
  r4.height = 20;
  r4.values = [
    `Ruta Crítica: ${criticalCount} tareas`,
    '',
    `Días Feriados: ${holidays.length}`,
    '',
    `Responsables: ${assignees.length}`,
    '',
    'Herramienta: Gantt Chart Studio Pro',
    '',
    `Exportado: ${toISODate(new Date())}`,
  ];
  styleInfoRow(r4);

  // ROW 5: Color Legend
  const r5 = wsGantt.getRow(5);
  r5.height = 20;
  r5.values = [
    'LEYENDA:',
    '✓ 100% Completada',
    '■ En Progreso',
    '■ Pendiente',
    '■ Bloqueada',
    '◆ Hito Clave',
    '🏖️ Feriado',
    '░ Fin de Semana',
  ];
  r5.getCell(1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.TEXT_MUTED } };
  r5.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TASK_COMPLETED } };
  r5.getCell(2).font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
  r5.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TASK_IN_PROGRESS } };
  r5.getCell(3).font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
  r5.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TASK_PENDING } };
  r5.getCell(4).font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
  r5.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TASK_BLOCKED } };
  r5.getCell(5).font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
  r5.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TASK_MILESTONE } };
  r5.getCell(6).font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
  r5.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HOLIDAY_BG } };
  r5.getCell(7).font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.AMBER_HEADER } };
  r5.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WEEKEND_BG } };
  r5.getCell(8).font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.TEXT_MUTED } };

  // ROW 6: Blank spacer
  wsGantt.getRow(6).height = 8;

  // ROW 7: Month Headers Row
  const r7 = wsGantt.getRow(7);
  r7.height = 24;
  r7.getCell(1).value = 'ESTRUCTURA DE DESGLOSE DEL TRABAJO (WBS)';
  r7.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.WHITE } };
  r7.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
  r7.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.INDIGO_HEADER } };
  wsGantt.mergeCells(7, 1, 7, BASE_COLS);

  // Group days by month and merge month cells
  if (options.includeGanttMatrix) {
    let currentMonthKey = '';
    let currentMonthLabel = '';
    let monthStartCol = BASE_COLS + 1;

    timelineDays.forEach((td, idx) => {
      const col = BASE_COLS + 1 + idx;
      if (td.monthKey !== currentMonthKey) {
        if (currentMonthKey !== '') {
          // Merge previous month span
          const endCol = col - 1;
          wsGantt.mergeCells(7, monthStartCol, 7, endCol);
          const cell = wsGantt.getCell(7, monthStartCol);
          cell.value = currentMonthLabel;
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.WHITE } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
        }
        currentMonthKey = td.monthKey;
        currentMonthLabel = td.monthLabel;
        monthStartCol = col;
      }
    });

    // Merge final month span
    const finalCol = BASE_COLS + timelineDays.length;
    if (monthStartCol <= finalCol) {
      wsGantt.mergeCells(7, monthStartCol, 7, finalCol);
      const cell = wsGantt.getCell(7, monthStartCol);
      cell.value = currentMonthLabel;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.WHITE } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
    }
  }

  // ROW 8: Column Day Headers
  const r8 = wsGantt.getRow(8);
  r8.height = 26;
  baseHeaders.forEach((h, idx) => {
    const cell = r8.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
    cell.border = BORDER_HEADER;
  });

  if (options.includeGanttMatrix) {
    timelineDays.forEach((td, idx) => {
      const col = BASE_COLS + 1 + idx;
      const cell = r8.getCell(col);
      cell.value = `${td.dayName.slice(0, 1)} ${td.dayNum}`;
      cell.font = {
        name: 'Calibri',
        size: 8,
        bold: true,
        color: { argb: td.holiday ? COLORS.AMBER_HEADER : td.isWknd ? COLORS.TEXT_MUTED : COLORS.WHITE },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: td.holiday ? COLORS.HOLIDAY_BG : td.isWknd ? COLORS.WEEKEND_BG : COLORS.NAVY_HEADER,
        },
      };
      cell.border = BORDER_HEADER;
    });
  }

  // DATA ROWS: Phase Summaries & Tasks
  let currentRowIdx = 9;

  phaseGroupedTasks.forEach(({ phase, wbsPhaseCode, tasks: pTasks }) => {
    // Calculate phase aggregates
    let phaseMinDate = '';
    let phaseMaxDate = '';
    pTasks.forEach(({ task }) => {
      if (task.startDate && (!phaseMinDate || task.startDate < phaseMinDate)) phaseMinDate = task.startDate;
      if (task.endDate && (!phaseMaxDate || task.endDate > phaseMaxDate)) phaseMaxDate = task.endDate;
    });

    const phaseTasksCount = pTasks.length;
    const phaseAvgProg =
      phaseTasksCount > 0
        ? Math.round(pTasks.reduce((s, { task }) => s + (task.progress || 0), 0) / phaseTasksCount)
        : 0;
    const phaseWorkingDays =
      phaseMinDate && phaseMaxDate ? countWorkingDays(phaseMinDate, phaseMaxDate, holidays) : 0;
    const phaseCalendarDays =
      phaseMinDate && phaseMaxDate ? Math.max(1, diffDays(phaseMinDate, phaseMaxDate) + 1) : 0;

    // 1. PHASE SUMMARY ROW
    const phaseRow = wsGantt.getRow(currentRowIdx);
    phaseRow.height = 22;
    const phaseVals = [
      wbsPhaseCode,
      'FASE',
      `▶ FASE: ${phase.name.toUpperCase()}`,
      phase.name,
      'Equipo de Fase',
      'Coordinación',
      'Alta',
      phaseAvgProg === 100 ? 'Completada' : phaseAvgProg > 0 ? 'En Progreso' : 'Pendiente',
      `${phaseAvgProg}%`,
      phaseMinDate || '—',
      phaseMaxDate || '—',
      phaseWorkingDays,
      phaseCalendarDays,
      '—',
      `${phaseTasksCount} tarea(s)`,
    ];

    phaseVals.forEach((val, idx) => {
      const cell = phaseRow.getCell(idx + 1);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.INDIGO_HEADER } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.PHASE_BG } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: idx === 2 ? 'left' : idx >= 8 && idx <= 12 ? 'center' : 'left',
      };
      cell.border = BORDER_THIN;
    });

    // Timeline cells for phase row
    if (options.includeGanttMatrix) {
      timelineDays.forEach((td, idx) => {
        const col = BASE_COLS + 1 + idx;
        const cell = phaseRow.getCell(col);
        const isWithinPhase =
          phaseMinDate && phaseMaxDate && td.dateStr >= phaseMinDate && td.dateStr <= phaseMaxDate;

        if (isWithinPhase) {
          cell.value = `${phaseAvgProg}%`;
          cell.font = { name: 'Calibri', size: 7, bold: true, color: { argb: COLORS.WHITE } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.PHASE_BAR } };
        } else if (td.holiday) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HOLIDAY_BG } };
        } else if (td.isWknd) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WEEKEND_BG } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.PHASE_BG } };
        }
        cell.border = BORDER_THIN;
      });
    }

    currentRowIdx++;

    // 2. TASK ROWS FOR THIS PHASE
    pTasks.forEach(({ task, wbsCode }, taskIndex) => {
      const taskRow = wsGantt.getRow(currentRowIdx);
      taskRow.height = 20;

      const wDays = task.workingDays ?? countWorkingDays(task.startDate, task.endDate, holidays);
      const cDays = Math.max(1, diffDays(task.startDate, task.endDate) + 1);
      const predecessorList = (task.dependencies || [])
        .map((depId) => {
          const p = tasks.find((t) => t.id === depId);
          return p ? p.name : depId;
        })
        .join('; ');

      const isCritical = criticalTaskIds.has(task.id);
      const isAltRow = taskIndex % 2 === 1;
      const rowBgColor = isAltRow ? 'FFF8FAFC' : 'FFFFFFFF';

      const consultantScopeLabel = task.notConsideredByConsultant
        ? 'No considerada (Solo Interna)'
        : 'Considerada';

      const taskVals = [
        wbsCode,
        task.isMilestone ? 'Hito' : 'Tarea',
        `    ${task.name}`, // indented
        phase.name,
        task.assignee.name,
        task.assignee.role,
        priorityLabels[task.priority] || task.priority,
        statusLabels[task.status] || task.status,
        `${task.progress}%`,
        task.startDate,
        task.endDate,
        wDays,
        cDays,
        predecessorList || 'Ninguna',
        consultantScopeLabel,
        task.deliverable || '',
      ];

      taskVals.forEach((val, idx) => {
        const cell = taskRow.getCell(idx + 1);
        cell.value = val;
        cell.font = {
          name: 'Calibri',
          size: 9,
          bold: idx === 0 || idx === 1 || (idx === 7 && task.status === 'completed'),
          color: { argb: idx === 1 && task.isMilestone ? COLORS.TASK_MILESTONE : COLORS.TEXT_MAIN },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: idx === 2 ? 'left' : idx >= 8 && idx <= 12 ? 'center' : 'left',
        };
        cell.border = BORDER_THIN;

        // Custom consultant scope badge background
        if (idx === 14 && task.notConsideredByConsultant) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF92400E' } };
        } else if (idx === 7) {
          if (task.status === 'completed') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF065F46' } };
          } else if (task.status === 'in_progress') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1E40AF' } };
          } else if (task.status === 'blocked') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF991B1B' } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
          }
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
        }
      });

      // Daily Gantt cells for task row
      if (options.includeGanttMatrix) {
        timelineDays.forEach((td, idx) => {
          const col = BASE_COLS + 1 + idx;
          const cell = taskRow.getCell(col);
          const isWithin = td.dateStr >= task.startDate && td.dateStr <= task.endDate;

          if (task.isMilestone && td.dateStr === task.startDate) {
            cell.value = '◆';
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.WHITE } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TASK_MILESTONE } };
          } else if (isWithin) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (task.progress === 100) {
              cell.value = '✓';
              cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: COLORS.WHITE } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TASK_COMPLETED } };
            } else if (task.progress > 0) {
              cell.value = `${task.progress}%`;
              cell.font = { name: 'Calibri', size: 7, bold: true, color: { argb: COLORS.WHITE } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TASK_IN_PROGRESS } };
            } else if (task.status === 'blocked') {
              cell.value = '!';
              cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: COLORS.WHITE } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TASK_BLOCKED } };
            } else {
              cell.value = '';
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TASK_PENDING } };
            }
          } else if (td.holiday) {
            cell.value = '';
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HOLIDAY_BG } };
          } else if (td.isWknd) {
            cell.value = '';
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WEEKEND_BG } };
          } else {
            cell.value = '';
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
          }
          cell.border = BORDER_THIN;
        });
      }

      currentRowIdx++;
    });
  });

  // Set explicit compact column widths for Sheet 1
  wsGantt.getColumn(1).width = 6;   // WBS
  wsGantt.getColumn(2).width = 6;   // Tipo
  wsGantt.getColumn(3).width = 28;  // Actividad / Tarea
  wsGantt.getColumn(4).width = 18;  // Fase WBS
  wsGantt.getColumn(5).width = 14;  // Responsable
  wsGantt.getColumn(6).width = 14;  // Rol
  wsGantt.getColumn(7).width = 9;   // Prioridad
  wsGantt.getColumn(8).width = 11;  // Estado
  wsGantt.getColumn(9).width = 8;   // % Avance
  wsGantt.getColumn(10).width = 11; // Fecha Inicio
  wsGantt.getColumn(11).width = 11; // Fecha Fin
  wsGantt.getColumn(12).width = 7;  // Días Háb.
  wsGantt.getColumn(13).width = 7;  // Días Cal.
  wsGantt.getColumn(14).width = 16; // Predecesoras
  wsGantt.getColumn(15).width = 18; // Alcance Consultora
  wsGantt.getColumn(16).width = 18; // Entregable

  if (options.includeGanttMatrix) {
    timelineDays.forEach((_, idx) => {
      wsGantt.getColumn(BASE_COLS + 1 + idx).width = 3.2; // Compact daily Gantt cells
    });
  }

  // -------------------------------------------------------------
  // SHEET 2: LISTA DETALLADA DE TAREAS (Base de Datos con AutoFiltro)
  // -------------------------------------------------------------
  if (options.includeSummarySheets) {
    const wsTasks = wb.addWorksheet('Lista de Tareas', {
      properties: { tabColor: { argb: 'FF2563EB' } },
      views: [{ state: 'frozen', ySplit: 2, showGridLines: true }],
    });

    const taskHeaders = [
      'N° WBS',
      'ID Tarea',
      'Actividad / Tarea',
      'Fase WBS',
      'Responsable',
      'Cargo / Rol',
      'Prioridad',
      'Estado',
      '% Avance',
      'Fecha Inicio',
      'Fecha Fin',
      'Días Hábiles',
      'Días Calendario',
      'Modo Duración',
      'Predecesoras',
      'Alcance Consultora',
      'Motivo Exclusión Consultora',
      'Entregable Clave',
      'Horas Estimadas',
      'Horas Reales',
      'Desviación Horas',
      'Es Hito',
      'Ruta Crítica',
      'Notas / Observaciones',
    ];

    // Title
    const tRow = wsTasks.getRow(1);
    tRow.height = 24;
    tRow.getCell(1).value = `BASE DE DATOS COMPLETA DE ACTIVIDADES — ${project.title}`;
    tRow.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.WHITE } };
    tRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BLUE_HEADER } };
    wsTasks.mergeCells(1, 1, 1, taskHeaders.length);

    // Headers
    const thRow = wsTasks.getRow(2);
    thRow.height = 24;
    taskHeaders.forEach((h, i) => {
      const cell = thRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = BORDER_HEADER;
    });

    // Populate task database
    let tIdx = 3;
    phaseGroupedTasks.forEach(({ phase, tasks: pTasks }) => {
      pTasks.forEach(({ task, wbsCode }) => {
        const row = wsTasks.getRow(tIdx);
        row.height = 19;
        const wDays = task.workingDays ?? countWorkingDays(task.startDate, task.endDate, holidays);
        const cDays = Math.max(1, diffDays(task.startDate, task.endDate) + 1);
        const predStr = (task.dependencies || [])
          .map((d) => tasks.find((t) => t.id === d)?.name || d)
          .join('; ');
        const estH = task.estimatedHours || 0;
        const actH = task.actualHours || 0;
        const diffH = actH > 0 && estH > 0 ? actH - estH : 0;
        const isCrit = criticalTaskIds.has(task.id);
        const consultantScope = task.notConsideredByConsultant
          ? 'No considerada (Solo Interna)'
          : 'Considerada por Consultora';

        const vals = [
          wbsCode,
          task.id,
          task.name,
          phase.name,
          task.assignee.name,
          task.assignee.role,
          priorityLabels[task.priority] || task.priority,
          statusLabels[task.status] || task.status,
          `${task.progress}%`,
          task.startDate,
          task.endDate,
          wDays,
          cDays,
          task.durationMode === 'calendar_days' ? 'Días Calendario' : 'Días Hábiles',
          predStr || 'Ninguna',
          consultantScope,
          task.consultantExclusionReason || '',
          task.deliverable || '',
          estH > 0 ? estH : '',
          actH > 0 ? actH : '',
          estH > 0 && actH > 0 ? (diffH > 0 ? `+${diffH}` : `${diffH}`) : '',
          task.isMilestone ? 'SÍ (Hito)' : 'No',
          isCrit ? 'SÍ (Crítica)' : 'No',
          task.notes || '',
        ];

        vals.forEach((v, idx) => {
          const cell = row.getCell(idx + 1);
          cell.value = v;
          cell.font = { name: 'Calibri', size: 9 };
          cell.border = BORDER_THIN;
          cell.alignment = {
            vertical: 'middle',
            horizontal: idx === 2 || idx === 16 || idx === 17 || idx === 23 ? 'left' : 'center',
          };
          if (idx === 15 && task.notConsideredByConsultant) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF92400E' } };
          } else if (tIdx % 2 === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
        });

        tIdx++;
      });
    });

    wsTasks.autoFilter = `A2:X${tIdx - 1}`;

    wsTasks.columns = [
      { width: 9 },  // WBS
      { width: 12 }, // ID
      { width: 42 }, // Nombre
      { width: 28 }, // Fase
      { width: 22 }, // Responsable
      { width: 22 }, // Cargo
      { width: 12 }, // Prioridad
      { width: 14 }, // Estado
      { width: 11 }, // %
      { width: 13 }, // Inicio
      { width: 13 }, // Fin
      { width: 12 }, // Días Háb.
      { width: 12 }, // Días Cal.
      { width: 16 }, // Modo
      { width: 26 }, // Predecesoras
      { width: 24 }, // Alcance Consultora
      { width: 34 }, // Motivo Exclusión
      { width: 28 }, // Entregable
      { width: 12 }, // Horas Est.
      { width: 12 }, // Horas Real.
      { width: 14 }, // Desv.
      { width: 12 }, // Hito
      { width: 14 }, // Crítica
      { width: 30 }, // Notas
    ];
  }

  // -------------------------------------------------------------
  // SHEET 3: EQUIPO Y CARGA DE TRABAJO (Team Workload & KPIs)
  // -------------------------------------------------------------
  if (options.includeSummarySheets) {
    const wsTeam = wb.addWorksheet('Equipo y Responsables', {
      properties: { tabColor: { argb: 'FF059669' } },
      views: [{ state: 'frozen', ySplit: 2, showGridLines: true }],
    });

    const teamHeaders = [
      'Responsable',
      'Rol / Cargo',
      'Total Tareas',
      'Completadas',
      'En Progreso',
      'Pendientes',
      'Bloqueadas',
      'Avance Promedio (%)',
      'Días Hábiles Estimados',
      'Horas Estimadas',
      'Horas Reales',
      'Desviación Horas',
    ];

    // Title
    const tmRow = wsTeam.getRow(1);
    tmRow.height = 24;
    tmRow.getCell(1).value = `DISTRIBUCIÓN DE CARGA POR RESPONSABLE — ${project.title}`;
    tmRow.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.WHITE } };
    tmRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.EMERALD_HEADER } };
    wsTeam.mergeCells(1, 1, 1, teamHeaders.length);

    // Header
    const tmhRow = wsTeam.getRow(2);
    tmhRow.height = 24;
    teamHeaders.forEach((h, i) => {
      const cell = tmhRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = BORDER_HEADER;
    });

    let rIdx = 3;
    assignees.forEach((a) => {
      const aTasks = tasks.filter((t) => t.assignee.id === a.id);
      const completed = aTasks.filter((t) => t.status === 'completed' || t.progress === 100).length;
      const inProg = aTasks.filter((t) => t.progress > 0 && t.progress < 100).length;
      const pending = aTasks.filter((t) => t.status === 'pending' && t.progress === 0).length;
      const blocked = aTasks.filter((t) => t.status === 'blocked').length;
      const avgProg =
        aTasks.length > 0 ? Math.round(aTasks.reduce((s, t) => s + (t.progress || 0), 0) / aTasks.length) : 0;
      const totalWDays = aTasks.reduce(
        (sum, t) => sum + (t.workingDays ?? countWorkingDays(t.startDate, t.endDate, holidays)),
        0
      );
      const totalEstHours = aTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
      const totalActHours = aTasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
      const diffHours = totalActHours - totalEstHours;

      const row = wsTeam.getRow(rIdx);
      row.height = 20;
      const vals = [
        a.name,
        a.role,
        aTasks.length,
        completed,
        inProg,
        pending,
        blocked,
        `${avgProg}%`,
        totalWDays,
        totalEstHours > 0 ? totalEstHours : '—',
        totalActHours > 0 ? totalActHours : '—',
        totalEstHours > 0 && totalActHours > 0 ? (diffHours > 0 ? `+${diffHours}` : `${diffHours}`) : '—',
      ];

      vals.forEach((v, idx) => {
        const cell = row.getCell(idx + 1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 9 };
        cell.border = BORDER_THIN;
        cell.alignment = { vertical: 'middle', horizontal: idx <= 1 ? 'left' : 'center' };
        if (rIdx % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
      rIdx++;
    });

    wsTeam.columns = [
      { width: 25 }, // Responsable
      { width: 28 }, // Cargo
      { width: 14 }, // Total
      { width: 14 }, // Completadas
      { width: 14 }, // En Progreso
      { width: 14 }, // Pendientes
      { width: 14 }, // Bloqueadas
      { width: 20 }, // Avance %
      { width: 22 }, // Días Háb.
      { width: 16 }, // Horas Est.
      { width: 16 }, // Horas Real.
      { width: 18 }, // Desviación
    ];
  }

  // -------------------------------------------------------------
  // SHEET 4: RESUMEN POR FASE (WBS Executive Summary)
  // -------------------------------------------------------------
  if (options.includeSummarySheets) {
    const wsPhase = wb.addWorksheet('Resumen por Fase', {
      properties: { tabColor: { argb: 'FF6366F1' } },
      views: [{ state: 'frozen', ySplit: 2, showGridLines: true }],
    });

    const phaseHeaders = [
      'N° WBS',
      'Nombre de la Fase',
      'Total Tareas',
      'Hitos Clave',
      'Completadas',
      'En Curso',
      'Avance Promedio (%)',
      'Fecha Inicio Fase',
      'Fecha Fin Fase',
      'Días Hábiles',
      'Días Calendario',
      'Horas Estimadas',
      'Horas Reales',
    ];

    // Title
    const phRow = wsPhase.getRow(1);
    phRow.height = 24;
    phRow.getCell(1).value = `RESUMEN EJECUTIVO POR FASE WBS — ${project.title}`;
    phRow.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.WHITE } };
    phRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.INDIGO_HEADER } };
    wsPhase.mergeCells(1, 1, 1, phaseHeaders.length);

    // Headers
    const phhRow = wsPhase.getRow(2);
    phhRow.height = 24;
    phaseHeaders.forEach((h, i) => {
      const cell = phhRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = BORDER_HEADER;
    });

    let pIdx = 3;
    sortedPhases.forEach((p, idx) => {
      const pTasks = tasks.filter((t) => t.phaseId === p.id);
      const pMilestones = pTasks.filter((t) => t.isMilestone).length;
      const pCompleted = pTasks.filter((t) => t.status === 'completed' || t.progress === 100).length;
      const pInProg = pTasks.filter((t) => t.progress > 0 && t.progress < 100).length;
      const avgProg =
        pTasks.length > 0 ? Math.round(pTasks.reduce((s, t) => s + (t.progress || 0), 0) / pTasks.length) : 0;

      let pMin = '';
      let pMax = '';
      let pEstHours = 0;
      let pActHours = 0;

      pTasks.forEach((t) => {
        if (!pMin || t.startDate < pMin) pMin = t.startDate;
        if (!pMax || t.endDate > pMax) pMax = t.endDate;
        pEstHours += t.estimatedHours || 0;
        pActHours += t.actualHours || 0;
      });

      const pWDays = pMin && pMax ? countWorkingDays(pMin, pMax, holidays) : 0;
      const pCDays = pMin && pMax ? Math.max(1, diffDays(pMin, pMax) + 1) : 0;

      const row = wsPhase.getRow(pIdx);
      row.height = 20;
      const vals = [
        `${idx + 1}.0`,
        p.name,
        pTasks.length,
        pMilestones,
        pCompleted,
        pInProg,
        `${avgProg}%`,
        pMin || '—',
        pMax || '—',
        pWDays,
        pCDays,
        pEstHours > 0 ? pEstHours : '—',
        pActHours > 0 ? pActHours : '—',
      ];

      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 9, bold: i === 0 || i === 1 };
        cell.border = BORDER_THIN;
        cell.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' };
        if (pIdx % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
      pIdx++;
    });

    wsPhase.columns = [
      { width: 10 }, // WBS
      { width: 36 }, // Fase
      { width: 14 }, // Total
      { width: 12 }, // Hitos
      { width: 14 }, // Completadas
      { width: 12 }, // En Curso
      { width: 20 }, // Avance %
      { width: 18 }, // Inicio
      { width: 18 }, // Fin
      { width: 14 }, // Días Háb.
      { width: 16 }, // Días Cal.
      { width: 16 }, // Horas Est.
      { width: 16 }, // Horas Real.
    ];
  }

  // -------------------------------------------------------------
  // SHEET 5: CALENDARIO DE FERIADOS
  // -------------------------------------------------------------
  if (options.includeHolidaysSheet && holidays.length > 0) {
    const wsHolidays = wb.addWorksheet('Calendario Feriados', {
      properties: { tabColor: { argb: 'FFF59E0B' } },
      views: [{ state: 'frozen', ySplit: 2, showGridLines: true }],
    });

    const holHeaders = ['Fecha (YYYY-MM-DD)', 'Día de la Semana', 'Nombre Oficial del Feriado', 'Descripción / Tipo'];

    const hRow = wsHolidays.getRow(1);
    hRow.height = 24;
    hRow.getCell(1).value = `CALENDARIO DE DÍAS NO LABORABLES Y FERIADOS — ${project.title}`;
    hRow.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.WHITE } };
    hRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.AMBER_HEADER } };
    wsHolidays.mergeCells(1, 1, 1, holHeaders.length);

    const hhRow = wsHolidays.getRow(2);
    hhRow.height = 24;
    holHeaders.forEach((h, i) => {
      const cell = hhRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = BORDER_HEADER;
    });

    const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
    sortedHolidays.forEach((h, idx) => {
      const row = wsHolidays.getRow(idx + 3);
      row.height = 20;
      const d = parseDate(h.date);
      const vals = [h.date, getDayName(d), h.name, h.description || 'Feriado Oficial'];
      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 9 };
        cell.border = BORDER_THIN;
        cell.alignment = { vertical: 'middle', horizontal: i === 2 || i === 3 ? 'left' : 'center' };
        if (idx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
    });

    wsHolidays.columns = [{ width: 22 }, { width: 18 }, { width: 38 }, { width: 34 }];
  }

  // -------------------------------------------------------------
  // SHEET 6: RUTA CRÍTICA & HITOS CLAVE
  // -------------------------------------------------------------
  if (options.includeCriticalPathSheet) {
    const wsCP = wb.addWorksheet('Ruta Crítica & Hitos', {
      properties: { tabColor: { argb: 'FFE11D48' } },
      views: [{ state: 'frozen', ySplit: 2, showGridLines: true }],
    });

    const cpHeaders = [
      'Categoría',
      'ID Tarea',
      'Actividad / Hito',
      'Fase WBS',
      'Responsable',
      'Estado',
      '% Avance',
      'Fecha Inicio',
      'Fecha Fin',
      'Días Háb.',
      'Entregable Comprometido',
    ];

    const cpRow = wsCP.getRow(1);
    cpRow.height = 24;
    cpRow.getCell(1).value = `RUTA CRÍTICA Y SEGUIMIENTO DE HITOS — ${project.title}`;
    cpRow.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.WHITE } };
    cpRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ROSE_HEADER } };
    wsCP.mergeCells(1, 1, 1, cpHeaders.length);

    const cphRow = wsCP.getRow(2);
    cphRow.height = 24;
    cpHeaders.forEach((h, i) => {
      const cell = cphRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = BORDER_HEADER;
    });

    let cpIdx = 3;

    // Add milestones
    tasks
      .filter((t) => t.isMilestone)
      .forEach((t) => {
        const ph = phases.find((p) => p.id === t.phaseId);
        const row = wsCP.getRow(cpIdx);
        row.height = 20;
        const vals = [
          '◆ HITO CLAVE',
          t.id,
          t.name,
          ph?.name || 'General',
          t.assignee.name,
          statusLabels[t.status] || t.status,
          `${t.progress}%`,
          t.startDate,
          t.endDate,
          1,
          t.deliverable || 'Acta / Entregable Clave',
        ];
        vals.forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v;
          cell.font = { name: 'Calibri', size: 9, bold: i === 0 || i === 2 };
          cell.border = BORDER_THIN;
          cell.alignment = { vertical: 'middle', horizontal: i === 2 || i === 10 ? 'left' : 'center' };
          if (i === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } };
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.TASK_MILESTONE } };
          }
        });
        cpIdx++;
      });

    // Add critical tasks
    tasks
      .filter((t) => criticalTaskIds.has(t.id) && !t.isMilestone)
      .forEach((t) => {
        const ph = phases.find((p) => p.id === t.phaseId);
        const wDays = t.workingDays ?? countWorkingDays(t.startDate, t.endDate, holidays);
        const row = wsCP.getRow(cpIdx);
        row.height = 20;
        const vals = [
          '🔥 RUTA CRÍTICA',
          t.id,
          t.name,
          ph?.name || 'General',
          t.assignee.name,
          statusLabels[t.status] || t.status,
          `${t.progress}%`,
          t.startDate,
          t.endDate,
          wDays,
          t.deliverable || '',
        ];
        vals.forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v;
          cell.font = { name: 'Calibri', size: 9, bold: i === 0 || i === 2 };
          cell.border = BORDER_THIN;
          cell.alignment = { vertical: 'middle', horizontal: i === 2 || i === 10 ? 'left' : 'center' };
          if (i === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.ROSE_HEADER } };
          }
        });
        cpIdx++;
      });

    wsCP.columns = [
      { width: 18 }, // Categoría
      { width: 12 }, // ID
      { width: 40 }, // Actividad
      { width: 28 }, // Fase
      { width: 22 }, // Responsable
      { width: 14 }, // Estado
      { width: 11 }, // %
      { width: 13 }, // Inicio
      { width: 13 }, // Fin
      { width: 11 }, // Días Háb.
      { width: 32 }, // Entregable
    ];
  }

  // Generate filename: [proyecto]_cronograma_completo_YYYY-MM-DD.xlsx
  const safeTitle = (project.title || 'gantt_cronograma_completo')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 36);

  const todayStr = toISODate(new Date());
  const filename = `${safeTitle}_cronograma_completo_${todayStr}.xlsx`;

  // Write file buffer and trigger download
  const buffer = await wb.xlsx.writeBuffer();

  // In browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  } else {
    // In node.js test environment
    const fs = await import('fs');
    await fs.promises.writeFile(filename, Buffer.from(buffer));
  }

  return filename;
}

function styleInfoRow(row: ExcelJS.Row) {
  row.eachCell((cell, colNumber) => {
    cell.font = {
      name: 'Calibri',
      size: 9,
      bold: colNumber % 2 === 1,
      color: { argb: colNumber % 2 === 1 ? COLORS.INDIGO_HEADER : COLORS.TEXT_MAIN },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
}
