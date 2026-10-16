import { Project, Task, ConsultantProposal, Holiday, Phase } from '../types';
import {
  diffDays,
  parseDate,
  toISODate,
  addDays,
  formatDateShort,
  formatDateReadable,
  countWorkingDays,
  calculateCriticalPath,
} from './dateUtils';
import ExcelJS from 'exceljs';

export const DEFAULT_CONSULTANT_NAME = 'Consultora Andes Advisory & Cloud ERP';
export const DEFAULT_PROPOSAL_VERSION = 'Propuesta de Cronograma v2.1';
export const DEFAULT_PROPOSAL_DATE = '2026-09-15';
export const DEFAULT_PROPOSAL_NOTES =
  'Cronograma propuesto por la consultora tras la revisión de riesgos técnicos. Se incorpora buffer de contingencia en migración de datos y se amplía el período de pruebas UAT para asegurar la adopción usuaria y mitigar riesgos en el Go-Live.';

export interface TaskComparisonResult {
  taskId: string;
  taskName: string;
  phaseId: string;
  phaseName: string;
  currentTask: Task;
  consultantTask: Task;
  isMilestone: boolean;
  // Differences: (Consultant - Current)
  startDeltaDays: number;
  endDeltaDays: number;
  workingDaysDelta: number;
  hoursDelta: number;
  // Status categorization
  status: 'aligned' | 'accelerated' | 'delayed' | 'omitted_by_consultant';
  statusLabel: string;
  impactDiagnosis: string;
  consultantRationale?: string;
  notConsideredByConsultant?: boolean;
  consultantExclusionReason?: string;
}

export interface ScheduleComparisonStats {
  currentEndDate: string;
  consultantEndDate: string;
  projectEndDeltaDays: number; // Positive = Consultant finishes later
  currentWorkingDays: number;
  consultantWorkingDays: number;
  workingDaysDelta: number;
  totalTasks: number;
  alignedCount: number;
  acceleratedCount: number;
  delayedCount: number;
  omittedCount: number;
  milestonesCount: number;
  milestonesShiftedCount: number;
  currentTotalHours: number;
  consultantTotalHours: number;
  hoursDelta: number;
}

/**
 * Creates an intelligent, realistic proposed schedule by the consultant
 * based on the current project, adding strategic buffers and optimizations.
 */
export function createDefaultConsultantProject(currentProject: Project): ConsultantProposal {
  const holidays = currentProject.holidays || [];
  const clonedTasks: Task[] = JSON.parse(JSON.stringify(currentProject.tasks || []));

  // Realistic consultant variations map for initial sample project
  const adjustmentsMap: Record<
    string,
    {
      startOffset?: number;
      endOffset?: number;
      workingDaysOverride?: number;
      consultantRationale: string;
      estimatedHoursDelta?: number;
    }
  > = {
    // Fase 1: Identical (Approved baseline)
    'task-1': {
      consultantRationale: 'Alineado: Hito y kick-off formalmente completados.',
    },
    'task-2': {
      consultantRationale: 'Alineado: Levantamiento de procesos validado.',
    },
    'milestone-1': {
      consultantRationale: 'Alineado: Firma de Blueprint formalizada.',
    },

    // Fase 2: Configuración (Consultant accelerates by 2 days due to pre-packaged accelerators)
    'task-3': {
      startOffset: 0,
      endOffset: -1,
      consultantRationale: 'Aceleración: Aprovisionamiento automatizado de infraestructura cloud en 3 días hábiles.',
      estimatedHoursDelta: -4,
    },
    'task-4': {
      startOffset: -1,
      endOffset: -2,
      consultantRationale: 'Optimización: Uso de plantillas preconfiguradas reduce esfuerzo en parametrización core.',
      estimatedHoursDelta: -10,
    },
    'task-5': {
      startOffset: -2,
      endOffset: -2,
      consultantRationale: 'Adelanto: Inicio anticipado de parametrización de CRM tras validación de entidades.',
      estimatedHoursDelta: 0,
    },

    // Fase 3: Migración de datos (Consultant adds 3 buffer days for data cleansing)
    'task-6': {
      startOffset: -2,
      endOffset: +3,
      consultantRationale: 'Mitigación de Riesgo: Consultora recomienda 3 días adicionales para depuración y homologación de maestros legados.',
      estimatedHoursDelta: +15,
    },
    'task-7': {
      startOffset: 0,
      endOffset: +3,
      consultantRationale: 'Ampliación: Pruebas de conectores API y webhooks con sistemas satélites.',
      estimatedHoursDelta: +10,
    },
    'milestone-2': {
      startOffset: +3,
      endOffset: +3,
      consultantRationale: 'Desplazamiento: Hito de carga de datos en QA reprogramado tras depuración profunda.',
    },

    // Fase 4: Pruebas UAT (Consultant extends UAT by 4 days to involve business stakeholders thoroughly)
    'task-8': {
      startOffset: +3,
      endOffset: +3,
      consultantRationale: 'Ajuste: Pruebas unitarias sincronizadas con la nueva fecha de carga de datos.',
    },
    'task-9': {
      startOffset: +3,
      endOffset: +5,
      consultantRationale: 'Recomendación Consultora: Se extiende período de pruebas UAT en 5 días para asegurar firma de actas de aceptación por áreas usuarias.',
      estimatedHoursDelta: +20,
    },
    'milestone-3': {
      startOffset: +5,
      endOffset: +5,
      consultantRationale: 'Desplazamiento: Aprobación formal de UAT posterior a ciclo de re-test de observaciones.',
    },

    // Fase 5: Capacitación (Overlaps with UAT to recover time)
    'task-10': {
      startOffset: +2,
      endOffset: +3,
      consultantRationale: 'Solapamiento estratégico: Elaboración de manuales inicia antes de finalizar UAT.',
      estimatedHoursDelta: 0,
    },
    'task-11': {
      startOffset: +3,
      endOffset: +4,
      consultantRationale: 'Ajuste de agenda: Talleres con usuarios finales distribuidos en turnos intensivos.',
      estimatedHoursDelta: +8,
    },
    'task-12': {
      startOffset: +2,
      endOffset: +3,
      consultantRationale: 'Alineado con el nuevo cronograma de Go-Live.',
    },

    // Fase 6: Go-Live & Hipercare (Shifts from Nov 6 to Nov 13, hypercare extends to Nov 27)
    'milestone-4': {
      startOffset: +5,
      endOffset: +5,
      consultantRationale: 'GO-LIVE PROPUESTO: Consultora propone pase a producción el 13 de Noviembre con 100% de UAT verificado.',
    },
    'task-13': {
      startOffset: +5,
      endOffset: +5,
      consultantRationale: 'Soporte Hipercare de 10 días hábiles posteriores a la salida en vivo.',
      estimatedHoursDelta: +10,
    },
    'milestone-5': {
      startOffset: +5,
      endOffset: +5,
      consultantRationale: 'Cierre Formal y Entrega a Mesa de Ayuda / Operaciones.',
    },
  };

  // Apply offsets
  const proposedTasks: Task[] = clonedTasks.map((task) => {
    const adj = adjustmentsMap[task.id];
    let newStart = task.startDate;
    let newEnd = task.endDate;
    let rationale = task.consultantRationale || 'Sin variación propuesta';

    if (adj) {
      if (adj.startOffset) {
        newStart = addDays(task.startDate, adj.startOffset);
      }
      if (adj.endOffset) {
        newEnd = addDays(task.endDate, adj.endOffset);
      }
      // Ensure start <= end
      if (newStart > newEnd) {
        newEnd = newStart;
      }
      rationale = adj.consultantRationale;
    }

    const wDays = countWorkingDays(newStart, newEnd, holidays);
    const estHours = (task.estimatedHours || 0) + (adj?.estimatedHoursDelta || 0);

    return {
      ...task,
      startDate: newStart,
      endDate: newEnd,
      workingDays: wDays,
      estimatedHours: estHours > 0 ? estHours : task.estimatedHours,
      consultantRationale: rationale,
    };
  });

  // Calculate new target end date from proposed tasks
  let proposedMaxEnd = currentProject.targetEndDate || '2026-11-20';
  proposedTasks.forEach((t) => {
    if (t.endDate && t.endDate > proposedMaxEnd) {
      proposedMaxEnd = t.endDate;
    }
  });

  const proposedProject: Project = {
    ...currentProject,
    id: `${currentProject.id}-consultant-prop`,
    title: `${currentProject.title} (Propuesta Consultora)`,
    manager: 'Equipo Consultor ERP & Advisory',
    targetEndDate: proposedMaxEnd,
    tasks: proposedTasks,
  };

  return {
    id: `prop-${Date.now()}`,
    consultantName: DEFAULT_CONSULTANT_NAME,
    version: DEFAULT_PROPOSAL_VERSION,
    proposalDate: DEFAULT_PROPOSAL_DATE,
    notes: DEFAULT_PROPOSAL_NOTES,
    project: proposedProject,
  };
}

/**
 * Compares two schedules task by task and calculates exact deviations
 */
export function compareSchedules(
  currentProject: Project,
  consultantProject: Project
): TaskComparisonResult[] {
  const currentTasks = currentProject.tasks || [];
  const consultantTasks = consultantProject.tasks || [];
  const phases = currentProject.phases || [];
  const holidays = currentProject.holidays || [];

  const consultantTaskMap = new Map<string, Task>();
  consultantTasks.forEach((t) => consultantTaskMap.set(t.id, t));

  return currentTasks.map((curr) => {
    const cons = consultantTaskMap.get(curr.id) || curr;
    const phase = phases.find((p) => p.id === curr.phaseId);

    const startDelta = diffDays(curr.startDate, cons.startDate);
    const endDelta = diffDays(curr.endDate, cons.endDate);

    const currWD = curr.workingDays ?? countWorkingDays(curr.startDate, curr.endDate, holidays);
    const consWD = cons.workingDays ?? countWorkingDays(cons.startDate, cons.endDate, holidays);
    const wdDelta = consWD - currWD;

    const hoursDelta = (cons.estimatedHours || 0) - (curr.estimatedHours || 0);

    const isOmitted = Boolean(curr.notConsideredByConsultant || cons.notConsideredByConsultant);

    let status: 'aligned' | 'accelerated' | 'delayed' | 'omitted_by_consultant' = 'aligned';
    let statusLabel = 'Alineado';
    let impactDiagnosis = 'Mismas fechas previstas';

    if (isOmitted) {
      status = 'omitted_by_consultant';
      statusLabel = 'No considerada por consultora';
      impactDiagnosis = curr.consultantExclusionReason || cons.consultantExclusionReason || 'Actividad considerada internamente pero fuera del alcance de la propuesta de la consultora.';
    } else if (endDelta < 0) {
      status = 'accelerated';
      statusLabel = `Adelanta ${Math.abs(endDelta)}d`;
      impactDiagnosis = `Consultora propone finalizar ${Math.abs(endDelta)} días antes (${formatDateShort(cons.endDate)} vs ${formatDateShort(curr.endDate)})`;
    } else if (endDelta > 0) {
      status = 'delayed';
      statusLabel = `Extiende +${endDelta}d`;
      impactDiagnosis = `Consultora propone ampliar plazo en +${endDelta} días (${formatDateShort(cons.endDate)} vs ${formatDateShort(curr.endDate)})`;
    } else if (startDelta !== 0) {
      status = startDelta < 0 ? 'accelerated' : 'delayed';
      statusLabel = startDelta < 0 ? `Inicia ${Math.abs(startDelta)}d antes` : `Inicia +${startDelta}d después`;
      impactDiagnosis = `Misma fecha de fin pero diferente inicio`;
    }

    return {
      taskId: curr.id,
      taskName: curr.name,
      phaseId: curr.phaseId,
      phaseName: phase?.name || 'General',
      currentTask: curr,
      consultantTask: cons,
      isMilestone: !!curr.isMilestone,
      startDeltaDays: isOmitted ? 0 : startDelta,
      endDeltaDays: isOmitted ? 0 : endDelta,
      workingDaysDelta: isOmitted ? 0 : wdDelta,
      hoursDelta: isOmitted ? -(curr.estimatedHours || 0) : hoursDelta,
      status,
      statusLabel,
      impactDiagnosis,
      consultantRationale: cons.consultantRationale || curr.consultantRationale,
      notConsideredByConsultant: isOmitted,
      consultantExclusionReason: curr.consultantExclusionReason || cons.consultantExclusionReason,
    };
  });
}

/**
 * Computes high level comparison statistics and KPIs
 */
export function calculateComparisonStats(
  currentProject: Project,
  consultantProject: Project
): ScheduleComparisonStats {
  const currentTasks = currentProject.tasks || [];
  const consultantTasks = consultantProject.tasks || [];
  const holidays = currentProject.holidays || [];

  const comparisons = compareSchedules(currentProject, consultantProject);

  // Overall dates
  let currMin = currentProject.startDate || (currentTasks[0]?.startDate) || '';
  let currMax = currentProject.targetEndDate || (currentTasks[0]?.endDate) || '';
  currentTasks.forEach((t) => {
    if (t.startDate && (!currMin || t.startDate < currMin)) currMin = t.startDate;
    if (t.endDate && (!currMax || t.endDate > currMax)) currMax = t.endDate;
  });

  let consMin = consultantProject.startDate || (consultantTasks[0]?.startDate) || '';
  let consMax = consultantProject.targetEndDate || (consultantTasks[0]?.endDate) || '';
  consultantTasks.forEach((t) => {
    if (t.startDate && (!consMin || t.startDate < consMin)) consMin = t.startDate;
    if (t.endDate && (!consMax || t.endDate > consMax)) consMax = t.endDate;
  });

  const currWD = countWorkingDays(currMin, currMax, holidays);
  const consWD = countWorkingDays(consMin, consMax, holidays);

  const endDelta = diffDays(currMax, consMax);

  const aligned = comparisons.filter((c) => c.status === 'aligned').length;
  const accelerated = comparisons.filter((c) => c.status === 'accelerated').length;
  const delayed = comparisons.filter((c) => c.status === 'delayed').length;
  const omitted = comparisons.filter((c) => c.status === 'omitted_by_consultant').length;

  const milestones = comparisons.filter((c) => c.isMilestone);
  const milestonesShifted = milestones.filter((c) => c.endDeltaDays !== 0 && c.status !== 'omitted_by_consultant').length;

  const currHours = currentTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
  const consHours = consultantTasks
    .filter((t) => !t.notConsideredByConsultant)
    .reduce((s, t) => s + (t.estimatedHours || 0), 0);

  return {
    currentEndDate: currMax,
    consultantEndDate: consMax,
    projectEndDeltaDays: endDelta,
    currentWorkingDays: currWD,
    consultantWorkingDays: consWD,
    workingDaysDelta: consWD - currWD,
    totalTasks: comparisons.length,
    alignedCount: aligned,
    acceleratedCount: accelerated,
    delayedCount: delayed,
    omittedCount: omitted,
    milestonesCount: milestones.length,
    milestonesShiftedCount: milestonesShifted,
    currentTotalHours: currHours,
    consultantTotalHours: consHours,
    hoursDelta: consHours - currHours,
  };
}

/**
 * Generates and downloads a rich, multi-sheet Excel comparison report (.xlsx)
 * with styled deviations, impact diagnostics, and side-by-side matrices.
 */
export async function exportComparisonToExcel(
  currentProject: Project,
  consultantProposal: ConsultantProposal,
  chartImageBase64?: string
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gantt Chart Studio Pro';
  wb.created = new Date();

  const consultantProject = consultantProposal.project;
  const comparisons = compareSchedules(currentProject, consultantProject);
  const stats = calculateComparisonStats(currentProject, consultantProject);
  const phases = currentProject.phases || [];

  const BORDER_THIN: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  const BORDER_HEADER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'medium', color: { argb: 'FF334155' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  };

  // -------------------------------------------------------------------------
  // 0. OPTIONAL EMBEDDED VISUAL CHART SHEET (IF SCREEN IMAGE WAS CAPTURED)
  // -------------------------------------------------------------------------
  if (chartImageBase64) {
    try {
      const cleanBase64 = chartImageBase64.replace(/^data:image\/\w+;base64,/, '');
      const wsImg = wb.addWorksheet('Gráfico Gantt (Visual)', {
        properties: { tabColor: { argb: 'FF6366F1' } },
        views: [{ showGridLines: false }],
      });

      const r1 = wsImg.getRow(1);
      r1.height = 28;
      r1.getCell(1).value = `DIAGRAMA GANTT COMPARATIVO VISUAL — ${currentProject.title.toUpperCase()} (ACTUAL vs. ${consultantProposal.consultantName.toUpperCase()})`;
      r1.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      wsImg.mergeCells('A1:O1');

      const imgId = wb.addImage({
        base64: cleanBase64,
        extension: 'png',
      });

      wsImg.addImage(imgId, {
        tl: { col: 0, row: 2 },
        ext: { width: 1240, height: 720 },
      });
    } catch (err) {
      console.warn('No se pudo incrustar captura de imagen en libro Excel:', err);
    }
  }

  // -------------------------------------------------------------------------
  // 1. CALCULATE PROJECT TIMELINE BY MONTH & COMPACT SUB-PERIODS
  // -------------------------------------------------------------------------
  let minD = currentProject.startDate || '2026-09-01';
  let maxD = currentProject.targetEndDate || '2026-11-20';
  currentProject.tasks.forEach((t) => {
    if (t.startDate && t.startDate < minD) minD = t.startDate;
    if (t.endDate && t.endDate > maxD) maxD = t.endDate;
  });
  consultantProject.tasks.forEach((t) => {
    if (t.startDate && t.startDate < minD) minD = t.startDate;
    if (t.endDate && t.endDate > maxD) maxD = t.endDate;
  });

  const minDate = parseDate(minD);
  const maxDate = parseDate(maxD);
  const startYear = minDate.getFullYear();
  const startMonth = minDate.getMonth();
  const endYear = maxDate.getFullYear();
  const endMonth = maxDate.getMonth();

  interface CompactInterval {
    intervalIndex: number;
    label: string;
    rangeLabel: string;
    startDateStr: string;
    endDateStr: string;
    colIdx: number;
  }

  interface MonthColGroup {
    year: number;
    month: number;
    monthKey: string;
    monthName: string;
    daysInMonth: number;
    intervals: CompactInterval[];
    startCol: number;
    endCol: number;
  }

  // Base descriptive columns (Ultra compact so timeline fits on screen without horizontal scrolling)
  // Col 1: WBS, Col 2: Tipo, Col 3: Actividad / Tarea, Col 4: Responsable, Col 5: Pista, Col 6: Desv. / Fechas
  const BASE_COLS = 6;
  const monthColGroups: MonthColGroup[] = [];
  const allIntervals: CompactInterval[] = [];

  let currentCol = BASE_COLS + 1;
  let currY = startYear;
  let currM = startMonth;

  while (currY < endYear || (currY === endYear && currM <= endMonth)) {
    const daysInMonth = new Date(currY, currM + 1, 0).getDate();
    const monthDate = new Date(currY, currM, 1);
    const mName = monthDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
    const mKey = `${currY}-${String(currM + 1).padStart(2, '0')}`;

    const intervals: CompactInterval[] = [];
    const mStartCol = currentCol;

    // Divide each month into 5 proportional, compact sub-periods
    const subColCount = 5;
    const daysPerCol = Math.floor(daysInMonth / subColCount);

    for (let sIdx = 0; sIdx < subColCount; sIdx++) {
      const startDay = sIdx * daysPerCol + 1;
      const endDay = sIdx === subColCount - 1 ? daysInMonth : (sIdx + 1) * daysPerCol;
      const sStr = `${currY}-${String(currM + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      const eStr = `${currY}-${String(currM + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
      const intObj: CompactInterval = {
        intervalIndex: sIdx + 1,
        label: `${startDay}-${endDay}`,
        rangeLabel: `${startDay}-${endDay}`,
        startDateStr: sStr,
        endDateStr: eStr,
        colIdx: currentCol,
      };
      intervals.push(intObj);
      allIntervals.push(intObj);
      currentCol++;
    }

    monthColGroups.push({
      year: currY,
      month: currM,
      monthKey: mKey,
      monthName: mName,
      daysInMonth,
      intervals,
      startCol: mStartCol,
      endCol: currentCol - 1,
    });

    currM++;
    if (currM > 11) {
      currM = 0;
      currY++;
    }
  }

  const totalCols = currentCol - 1;

  // -------------------------------------------------------------------------
  // SHEET 1 (or 2): CRONOGRAMA GANTT COMPARATIVO DUAL (POR MESES Y ULTRA-COMPACTO)
  // -------------------------------------------------------------------------
  const wsGantt = wb.addWorksheet('Gantt Comparativo (Por Mes)', {
    properties: { tabColor: { argb: 'FF10B981' } },
    views: [
      {
        state: 'frozen',
        xSplit: 4, // Freeze WBS, Tipo, Actividad, Responsable
        ySplit: 8, // Freeze header rows 1 to 8
        zoomScale: 85, // 85% zoom ensures entire Gantt chart fits at first glance
        showGridLines: true,
      },
    ],
  });

  // Row 1: Executive Title
  const gR1 = wsGantt.getRow(1);
  gR1.height = 28;
  gR1.getCell(1).value = `CRONOGRAMA GANTT COMPARATIVO DUAL — ${currentProject.title.toUpperCase()} (LÍNEA BASE vs. ${consultantProposal.consultantName.toUpperCase()})`;
  gR1.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  gR1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  gR1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wsGantt.mergeCells(1, 1, 1, totalCols);

  // Row 2: Metadata
  const gR2 = wsGantt.getRow(2);
  gR2.values = [
    `Cliente: ${currentProject.client || 'N/A'}`,
    '',
    `Consultora: ${consultantProposal.consultantName}`,
    '',
    `Versión: ${consultantProposal.version}`,
    `Fecha Análisis: ${formatDateReadable(toISODate(new Date()))}`,
  ];
  styleMetaRow(gR2);

  // Row 3: Final dates KPI
  const gR3 = wsGantt.getRow(3);
  gR3.values = [
    `Fin Cronograma Actual: ${formatDateShort(stats.currentEndDate)}`,
    '',
    `Fin Propuesto Consultora: ${formatDateShort(stats.consultantEndDate)}`,
    '',
    `Desviación Neta Fin: ${stats.projectEndDeltaDays > 0 ? `+${stats.projectEndDeltaDays}d (Extensión)` : stats.projectEndDeltaDays < 0 ? `${stats.projectEndDeltaDays}d (Adelanto)` : '0d (Alineado)'}`,
    `Días Hábiles: ${stats.currentWorkingDays}d Actual vs ${stats.consultantWorkingDays}d Consultora (${stats.workingDaysDelta > 0 ? `+${stats.workingDaysDelta}d` : `${stats.workingDaysDelta}d`})`,
  ];
  styleMetaRow(gR3);

  // Row 4: Tasks state KPI
  const gR4 = wsGantt.getRow(4);
  gR4.values = [
    `Total Tareas: ${stats.totalTasks}`,
    '',
    `● Coincidentes: ${stats.alignedCount}`,
    `▼ Adelantan: ${stats.acceleratedCount}`,
    `▲ Extienden: ${stats.delayedCount}`,
    `⚠️ Brecha de Alcance (Solo Internas): ${stats.omittedCount}`,
  ];
  styleMetaRow(gR4);

  // Row 5: Visual Legend
  const gR5 = wsGantt.getRow(5);
  gR5.height = 20;
  gR5.getCell(1).value = 'LEYENDA GANTT:  [ ■ Barra Azul: Línea Base Actual ]   [ ■ Verde: Consultora Adelanta ]   [ ■ Naranja: Consultora Extiende ]   [ ■ Gris: Coincidente ]   [ ⚠️ NO / Ámbar: No considerada por consultora (Solo Interna) ]   [ ◆ Púrpura: Hito Clave ]';
  gR5.getCell(1).font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF1E293B' } };
  gR5.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  gR5.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wsGantt.mergeCells(5, 1, 5, totalCols);

  // Row 6: Spacer
  wsGantt.getRow(6).height = 6;

  // Row 7: Month Headers & Left Column Titles
  const gR7 = wsGantt.getRow(7);
  gR7.height = 22;

  const leftHeaders = [
    'WBS',
    'Tipo',
    'Actividad / Tarea',
    'Responsable',
    'Pista',
    'Período y Desviación',
  ];
  leftHeaders.forEach((h, idx) => {
    const cell = gR7.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER_HEADER;
  });

  monthColGroups.forEach((m, mIdx) => {
    wsGantt.mergeCells(7, m.startCol, 7, m.endCol);
    const cell = gR7.getCell(m.startCol);
    cell.value = `${m.monthName} (${m.daysInMonth} DÍAS)`;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: mIdx % 2 === 0 ? 'FF1E3A8A' : 'FF0F172A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER_HEADER;
  });

  // Row 8: Sub-period Headers (1-6, 7-12, etc.)
  const gR8 = wsGantt.getRow(8);
  gR8.height = 18;

  for (let c = 1; c <= BASE_COLS; c++) {
    wsGantt.mergeCells(7, c, 8, c);
  }

  allIntervals.forEach((w) => {
    const cell = gR8.getCell(w.colIdx);
    cell.value = w.label;
    cell.font = { name: 'Calibri', size: 7.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER_HEADER;
  });

  // Data rows in wsGantt
  let gRowIdx = 9;

  phases.forEach((phase, pIdx) => {
    const phaseComparisons = comparisons.filter((c) => c.phaseId === phase.id);
    if (phaseComparisons.length === 0) return;

    // Phase Banner Row
    const pRow = wsGantt.getRow(gRowIdx);
    pRow.height = 20;
    pRow.getCell(1).value = `${pIdx + 1}.0`;
    pRow.getCell(2).value = 'FASE';
    pRow.getCell(3).value = `▶ FASE: ${phase.name.toUpperCase()} (${phaseComparisons.length} tareas)`;
    wsGantt.mergeCells(gRowIdx, 3, gRowIdx, totalCols);

    pRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF312E81' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
      cell.border = BORDER_THIN;
    });
    gRowIdx++;

    phaseComparisons.forEach((item, tIdx) => {
      const isOmitted = item.status === 'omitted_by_consultant';
      const isMilestone = item.isMilestone;
      const currTask = item.currentTask;
      const consTask = item.consultantTask;

      const actRowIdx = gRowIdx;
      const consRowIdx = gRowIdx + 1;

      // ==========================================
      // TRACK 1: CRONOGRAMA ACTUAL (LÍNEA BASE)
      // ==========================================
      const actRow = wsGantt.getRow(actRowIdx);
      actRow.height = 17;

      actRow.getCell(1).value = `${pIdx + 1}.${tIdx + 1}`;
      actRow.getCell(2).value = isMilestone ? 'Hito' : 'Tarea';
      actRow.getCell(3).value = `  ${item.taskName}`;
      actRow.getCell(4).value = currTask.assignee.name;
      actRow.getCell(5).value = '● Actual';
      actRow.getCell(6).value = `${formatDateShort(currTask.startDate)} al ${formatDateShort(currTask.endDate)} (${currTask.workingDays || '-'}d)`;

      // Left metadata styling for Actual
      for (let c = 1; c <= BASE_COLS; c++) {
        const cell = actRow.getCell(c);
        cell.font = {
          name: 'Calibri',
          size: 8.5,
          bold: c === 1 || c === 5 || isMilestone,
          color: { argb: isMilestone ? 'FF7C3AED' : c === 5 ? 'FF312E81' : 'FF0F172A' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: c === 3 ? 'left' : c === 5 || c === 6 ? 'center' : 'center',
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: c === 5 ? 'FFEEF2FF' : c === 6 ? 'FFF5F3FF' : 'FFFFFFFF' },
        };
        cell.border = BORDER_THIN;
      }

      // Timeline interval cells for Actual (Solid continuous bar)
      let actualFirstOverlap = true;
      allIntervals.forEach((w) => {
        const cell = actRow.getCell(w.colIdx);
        const overlaps = currTask.startDate <= w.endDateStr && currTask.endDate >= w.startDateStr;

        if (overlaps) {
          if (isMilestone) {
            cell.value = '◆';
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }; // Purple
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF5B21B6' } },
              bottom: { style: 'thin', color: { argb: 'FF5B21B6' } },
              left: { style: 'thin', color: { argb: 'FF5B21B6' } },
              right: { style: 'thin', color: { argb: 'FF5B21B6' } },
            };
          } else {
            cell.value = actualFirstOverlap && currTask.progress > 0 ? `${currTask.progress}%` : '';
            cell.font = { name: 'Calibri', size: 6.5, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }; // Solid Indigo Bar
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF312E81' } },
              bottom: { style: 'thin', color: { argb: 'FF312E81' } },
              left: { style: 'thin', color: { argb: 'FF4338CA' } },
              right: { style: 'thin', color: { argb: 'FF4338CA' } },
            };
            actualFirstOverlap = false;
          }
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.value = '';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          cell.border = BORDER_THIN;
        }
      });

      // ==========================================
      // TRACK 2: PROPUESTA CONSULTORA / EXCLUIDA
      // ==========================================
      const consRow = wsGantt.getRow(consRowIdx);
      consRow.height = 17;

      consRow.getCell(1).value = '';
      consRow.getCell(2).value = '';
      consRow.getCell(3).value = '';
      consRow.getCell(4).value = '';
      consRow.getCell(5).value = isOmitted
        ? '⚠️ Excluida'
        : item.status === 'accelerated'
        ? '▼ Adelanta'
        : item.status === 'delayed'
        ? '▲ Extiende'
        : '● Coincide';
      consRow.getCell(6).value = isOmitted
        ? 'Solo Interna'
        : `${formatDateShort(consTask.startDate)} al ${formatDateShort(consTask.endDate)} (${item.endDeltaDays > 0 ? `+${item.endDeltaDays}d` : item.endDeltaDays < 0 ? `${item.endDeltaDays}d` : '0d'})`;

      for (let c = 1; c <= BASE_COLS; c++) {
        const cell = consRow.getCell(c);
        cell.font = {
          name: 'Calibri',
          size: 8,
          bold: c === 5 || c === 6,
          color: {
            argb: isOmitted
              ? 'FFB45309'
              : item.status === 'accelerated'
              ? 'FF047857'
              : item.status === 'delayed'
              ? 'FFC2410C'
              : 'FF475569',
          },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: c === 5 || c === 6 ? 'center' : 'center',
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: isOmitted
              ? 'FFFEF3C7'
              : item.status === 'accelerated'
              ? 'FFD1FAE5'
              : item.status === 'delayed'
              ? 'FFFFEDD5'
              : 'FFF8FAFC',
          },
        };
        cell.border = BORDER_THIN;
      }

      // Merge Left columns 1-4 vertically so task appears as a unified card with 2 tracks
      wsGantt.mergeCells(actRowIdx, 1, consRowIdx, 1);
      wsGantt.mergeCells(actRowIdx, 2, consRowIdx, 2);
      wsGantt.mergeCells(actRowIdx, 3, consRowIdx, 3);
      wsGantt.mergeCells(actRowIdx, 4, consRowIdx, 4);

      // Timeline interval cells for Consultora (Solid colored bars or soft amber exclusion)
      let consFirstOverlap = true;
      allIntervals.forEach((w) => {
        const cell = consRow.getCell(w.colIdx);

        if (isOmitted) {
          const overlapsActual = currTask.startDate <= w.endDateStr && currTask.endDate >= w.startDateStr;
          if (overlapsActual) {
            cell.value = consFirstOverlap ? 'NO' : '';
            cell.font = { name: 'Calibri', size: 6.5, bold: true, color: { argb: 'FF92400E' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Amber 100
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFD97706' } },
              bottom: { style: 'thin', color: { argb: 'FFD97706' } },
              left: { style: 'thin', color: { argb: 'FFD97706' } },
              right: { style: 'thin', color: { argb: 'FFD97706' } },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            consFirstOverlap = false;
          } else {
            cell.value = '';
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            cell.border = BORDER_THIN;
          }
        } else {
          const overlapsCons = consTask.startDate <= w.endDateStr && consTask.endDate >= w.startDateStr;
          if (overlapsCons) {
            if (isMilestone) {
              cell.value = '◆';
              cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: item.endDeltaDays !== 0 ? 'FFD97706' : 'FF7C3AED' },
              };
              cell.border = {
                top: { style: 'thin', color: { argb: 'FF9A3412' } },
                bottom: { style: 'thin', color: { argb: 'FF9A3412' } },
                left: { style: 'thin', color: { argb: 'FF9A3412' } },
                right: { style: 'thin', color: { argb: 'FF9A3412' } },
              };
            } else if (item.status === 'accelerated') {
              cell.value = consFirstOverlap ? '▼' : '';
              cell.font = { name: 'Calibri', size: 7, bold: true, color: { argb: 'FFFFFFFF' } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }; // Emerald 600
              cell.border = {
                top: { style: 'thin', color: { argb: 'FF065F46' } },
                bottom: { style: 'thin', color: { argb: 'FF065F46' } },
                left: { style: 'thin', color: { argb: 'FF059669' } },
                right: { style: 'thin', color: { argb: 'FF059669' } },
              };
              consFirstOverlap = false;
            } else if (item.status === 'delayed') {
              cell.value = consFirstOverlap ? '▲' : '';
              cell.font = { name: 'Calibri', size: 7, bold: true, color: { argb: 'FFFFFFFF' } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }; // Amber 600
              cell.border = {
                top: { style: 'thin', color: { argb: 'FF9A3412' } },
                bottom: { style: 'thin', color: { argb: 'FF9A3412' } },
                left: { style: 'thin', color: { argb: 'FFD97706' } },
                right: { style: 'thin', color: { argb: 'FFD97706' } },
              };
              consFirstOverlap = false;
            } else {
              cell.value = consFirstOverlap ? '●' : '';
              cell.font = { name: 'Calibri', size: 7, bold: true, color: { argb: 'FFFFFFFF' } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF64748B' } }; // Slate 500
              cell.border = {
                top: { style: 'thin', color: { argb: 'FF334155' } },
                bottom: { style: 'thin', color: { argb: 'FF334155' } },
                left: { style: 'thin', color: { argb: 'FF64748B' } },
                right: { style: 'thin', color: { argb: 'FF64748B' } },
              };
              consFirstOverlap = false;
            }
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else {
            cell.value = '';
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            cell.border = BORDER_THIN;
          }
        }
      });

      gRowIdx += 2;
    });
  });

  // Set explicit compact column widths in wsGantt so the ENTIRE chart fits on screen at first glance
  wsGantt.getColumn(1).width = 5.5;  // WBS
  wsGantt.getColumn(2).width = 5.5;  // Tipo
  wsGantt.getColumn(3).width = 26;   // Actividad
  wsGantt.getColumn(4).width = 12;   // Responsable
  wsGantt.getColumn(5).width = 11;   // Pista
  wsGantt.getColumn(6).width = 14;   // Plazo y Desviación

  allIntervals.forEach((w) => {
    wsGantt.getColumn(w.colIdx).width = 2.4;
  });

  // -------------------------------------------------------------------------
  // SHEET 2: MATRIZ DETALLADA DE TAREAS Y DESVIACIONES
  // -------------------------------------------------------------------------
  const wsDiff = wb.addWorksheet('Matriz de Desviaciones', {
    properties: { tabColor: { argb: 'FF4F46E5' } },
    views: [{ state: 'frozen', ySplit: 7, xSplit: 3, showGridLines: true }],
  });

  // Row 1: Title
  const r1 = wsDiff.getRow(1);
  r1.height = 28;
  r1.getCell(1).value = `MATRIZ ANALÍTICA DE DESVIACIONES — ${currentProject.title.toUpperCase()}`;
  r1.getCell(1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wsDiff.mergeCells('A1:N1');

  // Rows 2-4: Executive KPI Summary
  const r2 = wsDiff.getRow(2);
  r2.values = [
    `Cliente / Empresa: ${currentProject.client || 'N/A'}`,
    '',
    `Consultora Externa: ${consultantProposal.consultantName}`,
    '',
    `Versión Propuesta: ${consultantProposal.version}`,
    '',
    `Fecha de Análisis: ${formatDateReadable(toISODate(new Date()))}`,
  ];
  styleMetaRow(r2);

  const r3 = wsDiff.getRow(3);
  r3.values = [
    `Fin Cronograma Actual: ${formatDateShort(stats.currentEndDate)}`,
    '',
    `Fin Propuesto Consultora: ${formatDateShort(stats.consultantEndDate)}`,
    '',
    `Desviación Fin Proyecto: ${stats.projectEndDeltaDays > 0 ? `+${stats.projectEndDeltaDays} días (Extensión)` : stats.projectEndDeltaDays < 0 ? `${stats.projectEndDeltaDays} días (Adelanto)` : '0 días (Alineado)'}`,
    '',
    `Duración Hábiles: ${stats.currentWorkingDays}d (Actual) vs ${stats.consultantWorkingDays}d (Consultora)`,
  ];
  styleMetaRow(r3);

  const r4 = wsDiff.getRow(4);
  r4.values = [
    `Total Tareas: ${stats.totalTasks}`,
    '',
    `Coincidentes: ${stats.alignedCount}`,
    '',
    `Adelantadas: ${stats.acceleratedCount}`,
    '',
    `Extendidas / Retrasadas: ${stats.delayedCount}`,
    '',
    `Hitos con Cambio: ${stats.milestonesShiftedCount} de ${stats.milestonesCount}`,
  ];
  styleMetaRow(r4);

  // Row 5: Notes
  const r5 = wsDiff.getRow(5);
  r5.values = [`Notas de la Consultora: ${consultantProposal.notes || 'Revisión y optimización de plazos.'}`];
  r5.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
  wsDiff.mergeCells('A5:N5');

  // Row 6: Blank
  wsDiff.getRow(6).height = 8;

  // Row 7: Headers
  const headers = [
    'WBS',
    'Tipo',
    'Actividad / Tarea',
    'Fase WBS',
    'Responsable',
    'Inicio Actual',
    'Fin Actual',
    'Inicio Consultora',
    'Fin Consultora',
    'Desv. Fin (Días)',
    'Días Háb. (Act vs Cons)',
    'Estado Desviación',
    'Diagnóstico e Impacto',
    'Justificación Técnica de la Consultora',
  ];

  const r7 = wsDiff.getRow(7);
  r7.height = 26;
  headers.forEach((h, i) => {
    const cell = r7.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER_HEADER;
  });

  // Populate data rows
  let rowIdx = 8;
  phases.forEach((phase, pIdx) => {
    const phaseComparisons = comparisons.filter((c) => c.phaseId === phase.id);
    if (phaseComparisons.length === 0) return;

    // Phase Separator Row
    const pr = wsDiff.getRow(rowIdx);
    pr.height = 22;
    pr.values = [
      `${pIdx + 1}.0`,
      'FASE',
      `▶ FASE: ${phase.name.toUpperCase()}`,
      phase.name,
      'Equipo de Fase',
      '',
      '',
      '',
      '',
      '',
      '',
      `${phaseComparisons.filter((c) => c.status !== 'aligned').length} tareas con variación`,
    ];
    pr.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF312E81' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
      cell.border = BORDER_THIN;
    });
    rowIdx++;

    phaseComparisons.forEach((item, tIdx) => {
      const row = wsDiff.getRow(rowIdx);
      row.height = 20;

      const deltaText =
        item.endDeltaDays > 0
          ? `+${item.endDeltaDays} días`
          : item.endDeltaDays < 0
          ? `${item.endDeltaDays} días`
          : '0 días';

      const wdText = `${item.currentTask.workingDays || '-'}d vs ${item.consultantTask.workingDays || '-'}d`;

      const vals = [
        `${pIdx + 1}.${tIdx + 1}`,
        item.isMilestone ? 'Hito' : 'Tarea',
        `  ${item.taskName}`,
        item.phaseName,
        item.currentTask.assignee.name,
        item.currentTask.startDate,
        item.currentTask.endDate,
        item.consultantTask.startDate,
        item.consultantTask.endDate,
        deltaText,
        wdText,
        item.statusLabel,
        item.impactDiagnosis,
        item.consultantRationale || 'Sin observaciones',
      ];

      vals.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.font = {
          name: 'Calibri',
          size: 9,
          bold: cIdx === 0 || cIdx === 9 || item.isMilestone,
          color: { argb: item.isMilestone ? 'FF7C3AED' : 'FF0F172A' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: cIdx === 2 || cIdx === 12 || cIdx === 13 ? 'left' : 'center',
        };
        cell.border = BORDER_THIN;

        // Deviation Badge Fill
        if (cIdx === 9 || cIdx === 11) {
          if (item.status === 'omitted_by_consultant') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Amber 100
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFB45309' } }; // Amber 700
          } else if (item.status === 'delayed') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } }; // Orange 100
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFC2410C' } }; // Orange 700
          } else if (item.status === 'accelerated') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Emerald 100
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF047857' } }; // Emerald 700
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate 100
            cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
          }
        } else if (rowIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
      rowIdx++;
    });
  });

  wsDiff.columns = [
    { width: 8 },  // WBS
    { width: 8 },  // Tipo
    { width: 40 }, // Actividad
    { width: 26 }, // Fase
    { width: 20 }, // Responsable
    { width: 13 }, // Inicio Act
    { width: 13 }, // Fin Act
    { width: 13 }, // Inicio Cons
    { width: 13 }, // Fin Cons
    { width: 14 }, // Desv Fin
    { width: 14 }, // Días Háb
    { width: 16 }, // Estado
    { width: 38 }, // Diagnóstico
    { width: 42 }, // Justificación
  ];

  // -------------------------------------------------------------------------
  // SHEET 3: HITOS CLAVE Y BRECHA DE ALCANCE (Milestones & Scope Gaps)
  // -------------------------------------------------------------------------
  const wsMilestones = wb.addWorksheet('Hitos y Brecha de Alcance', {
    properties: { tabColor: { argb: 'FF7C3AED' } },
    views: [{ state: 'frozen', ySplit: 2, showGridLines: true }],
  });

  const mHeaders = [
    'N° WBS',
    'Hito Clave',
    'Fase WBS',
    'Responsable',
    'Fecha Actual',
    'Fecha Consultora',
    'Variación (Días)',
    'Diagnóstico',
    'Entregable Comprometido',
    'Recomendación de la Consultora',
  ];

  const mr1 = wsMilestones.getRow(1);
  mr1.height = 24;
  mr1.getCell(1).value = `COMPARATIVA DE HITOS CLAVE Y ACTAS FORMALES — ${currentProject.title}`;
  mr1.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  mr1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D95' } };
  wsMilestones.mergeCells('A1:J1');

  const mr2 = wsMilestones.getRow(2);
  mr2.height = 24;
  mHeaders.forEach((h, i) => {
    const cell = mr2.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER_HEADER;
  });

  let mRowIdx = 3;
  comparisons
    .filter((c) => c.isMilestone)
    .forEach((item) => {
      const row = wsMilestones.getRow(mRowIdx);
      row.height = 22;

      const deltaText =
        item.endDeltaDays > 0
          ? `+${item.endDeltaDays} días (Postergado)`
          : item.endDeltaDays < 0
          ? `${item.endDeltaDays} días (Adelantado)`
          : '0 días (Misma Fecha)';

      const vals = [
        item.taskId,
        item.taskName,
        item.phaseName,
        item.currentTask.assignee.name,
        item.currentTask.startDate,
        item.consultantTask.startDate,
        deltaText,
        item.statusLabel,
        item.currentTask.deliverable || 'Acta de Aprobación',
        item.consultantRationale || 'Sin observaciones',
      ];

      vals.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 9, bold: cIdx === 1 || cIdx === 6 };
        cell.alignment = { vertical: 'middle', horizontal: cIdx === 1 || cIdx === 8 || cIdx === 9 ? 'left' : 'center' };
        cell.border = BORDER_THIN;

        if (cIdx === 6) {
          if (item.endDeltaDays > 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFC2410C' } };
          } else if (item.endDeltaDays < 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF047857' } };
          }
        }
      });
      mRowIdx++;
    });

  // Section 2 in Sheet 3: Brecha de Alcance (Tareas asumidas internamente y no por la consultora)
  const omittedItems = comparisons.filter((c) => c.status === 'omitted_by_consultant');
  if (omittedItems.length > 0) {
    mRowIdx += 2;
    const gapHeaderRow = wsMilestones.getRow(mRowIdx);
    gapHeaderRow.height = 24;
    gapHeaderRow.getCell(1).value = `BRECHA DE ALCANCE: TAREAS ASUMIDAS INTERNAMENTE Y EXCLUIDAS POR LA CONSULTORA (${omittedItems.length})`;
    gapHeaderRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    gapHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
    wsMilestones.mergeCells(mRowIdx, 1, mRowIdx, 10);
    mRowIdx++;

    const gapSubHeaderRow = wsMilestones.getRow(mRowIdx);
    gapSubHeaderRow.height = 22;
    gapSubHeaderRow.values = [
      'ID',
      'Actividad / Tarea Interna',
      'Fase WBS',
      'Responsable Interno',
      'Fecha Inicio',
      'Fecha Fin',
      'Días Hábiles',
      'Estado Alcance',
      'Entregable Comprometido',
      'Motivo o Justificación de Exclusión por la Consultora',
    ];
    gapSubHeaderRow.eachCell((c) => {
      c.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
      c.border = BORDER_HEADER;
    });
    mRowIdx++;

    omittedItems.forEach((item) => {
      const row = wsMilestones.getRow(mRowIdx);
      row.height = 20;
      row.values = [
        item.taskId,
        item.taskName,
        item.phaseName,
        item.currentTask.assignee.name,
        item.currentTask.startDate,
        item.currentTask.endDate,
        `${item.currentTask.workingDays || '-'}d`,
        'Solo Interna',
        item.currentTask.deliverable || 'Entregable Interno',
        item.consultantExclusionReason || item.impactDiagnosis || 'No contemplada en propuesta de consultora',
      ];
      row.eachCell((c, col) => {
        c.font = { name: 'Calibri', size: 8.5, bold: col === 1 || col === 8 };
        c.border = BORDER_THIN;
        c.alignment = { vertical: 'middle', horizontal: col === 2 || col === 9 || col === 10 ? 'left' : 'center' };
        if (col === 8) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          c.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FFB45309' } };
        } else if (mRowIdx % 2 === 1) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
      mRowIdx++;
    });
  }

  wsMilestones.columns = [
    { width: 12 },
    { width: 38 },
    { width: 26 },
    { width: 20 },
    { width: 14 },
    { width: 14 },
    { width: 22 },
    { width: 16 },
    { width: 30 },
    { width: 44 },
  ];

  // Filename
  const safeTitle = (currentProject.title || 'comparativa_cronogramas')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 32);

  const filename = `${safeTitle}_comparativa_consultora_${toISODate(new Date())}.xlsx`;

  // Set active sheet and workbook view
  wb.views = [
    {
      x: 0,
      y: 0,
      width: 10000,
      height: 20000,
      firstSheet: 0,
      activeTab: 0,
      visibility: 'visible',
    },
  ];

  // Write file buffer and download
  const buffer = await wb.xlsx.writeBuffer();

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
  }

  return filename;
}

function styleMetaRow(row: ExcelJS.Row) {
  row.height = 19;
  row.eachCell((cell, colNumber) => {
    cell.font = {
      name: 'Calibri',
      size: 9,
      bold: colNumber % 2 === 1,
      color: { argb: colNumber % 2 === 1 ? 'FF312E81' : 'FF0F172A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
}
