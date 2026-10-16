import React from 'react';
import { Project, Task } from '../types';
import { diffDays, toISODate, formatDateShort, countWorkingDays } from '../utils/dateUtils';
import {
  CheckCircle2,
  AlertTriangle,
  Flag,
  Flame,
  TrendingUp,
  Calendar,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Lock,
} from 'lucide-react';

interface ProjectMetricsProps {
  project: Project;
  criticalTaskCount: number;
  isCollapsed?: boolean;
  isScheduleLocked?: boolean;
  onToggleCollapse?: () => void;
}

export const ProjectMetrics: React.FC<ProjectMetricsProps> = ({
  project,
  criticalTaskCount,
  isCollapsed = false,
  isScheduleLocked = false,
  onToggleCollapse,
}) => {
  const { tasks } = project;
  const totalTasks = tasks.length;
  if (totalTasks === 0) return null;

  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const blockedTasks = tasks.filter((t) => t.status === 'blocked').length;

  // Weighted average progress
  const totalProgress = Math.round(
    tasks.reduce((sum, t) => sum + t.progress, 0) / totalTasks
  );

  // Overdue tasks
  const todayStr = toISODate(new Date());
  const overdueTasks = tasks.filter(
    (t) => t.status !== 'completed' && t.endDate < todayStr
  ).length;

  // Upcoming milestones
  const milestones = tasks
    .filter((t) => t.isMilestone)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const nextMilestone = milestones.find((m) => m.status !== 'completed');

  let milestoneCountdown = '';
  if (nextMilestone) {
    const daysLeft = diffDays(todayStr, nextMilestone.startDate);
    if (daysLeft < 0) {
      milestoneCountdown = `Vencido hace ${Math.abs(daysLeft)} días`;
    } else if (daysLeft === 0) {
      milestoneCountdown = '¡Hoy!';
    } else {
      milestoneCountdown = `en ${daysLeft} días (${formatDateShort(nextMilestone.startDate)})`;
    }
  }

  // If collapsed, show compact horizontal summary strip with expand toggle
  if (isCollapsed) {
    return (
      <div
        id="project-metrics-collapsed-bar"
        className="bg-white rounded-2xl border border-slate-200/90 px-4 py-2.5 mb-4 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs transition-all duration-200"
      >
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-slate-600">
          <div className="flex items-center gap-1.5 font-bold text-slate-900">
            <LayoutDashboard className="w-4 h-4 text-indigo-600" />
            <span>Métricas del Proyecto:</span>
          </div>

          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
            <span>
              Avance: <strong className="text-indigo-600 font-bold">{totalProgress}%</strong>
            </span>
          </div>

          <span className="text-slate-300 hidden sm:inline">•</span>

          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              Tareas: <strong className="text-emerald-700 font-bold">{completedTasks}</strong>/{totalTasks} listas
            </span>
          </div>

          <span className="text-slate-300 hidden sm:inline">•</span>

          <div className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-rose-500" />
            <span>
              Ruta crítica: <strong className="text-rose-600 font-bold">{criticalTaskCount}</strong>
            </span>
          </div>

          {overdueTasks > 0 && (
            <>
              <span className="text-slate-300 hidden md:inline">•</span>
              <div className="flex items-center gap-1.5 text-amber-600 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>{overdueTasks} atrasadas</span>
              </div>
            </>
          )}

          {nextMilestone && (
            <>
              <span className="text-slate-300 hidden lg:inline">•</span>
              <div className="hidden lg:flex items-center gap-1.5 text-slate-600">
                <Flag className="w-3.5 h-3.5 text-amber-500" />
                <span className="truncate max-w-[200px]">
                  Próximo hito: <strong className="text-slate-800">{nextMilestone.name.replace('HITO:', '').trim()}</strong>
                </span>
              </div>
            </>
          )}

          {isScheduleLocked && (
            <>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold"
                title="El cronograma está fijado: las fechas no se moverán"
              >
                <Lock className="w-3 h-3 text-amber-600" />
                <span>Fechas fijadas</span>
              </div>
            </>
          )}
        </div>

        {onToggleCollapse && (
          <button
            id="expand-metrics-btn"
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100/90 rounded-xl transition-all cursor-pointer shadow-2xs"
            title="Desplegar indicadores detallados"
          >
            <span>Desplegar métricas</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  // Expanded View
  return (
    <div id="project-metrics-container" className="mb-4">
      {/* Top Header bar with Collapse Action */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Resumen de Ejecución & Avance
          </span>
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            6 Indicadores
          </span>
          {isScheduleLocked && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs"
              title="El cronograma está fijado: las fechas están protegidas contra cambios involuntarios"
            >
              <Lock className="w-3 h-3 text-amber-600" />
              Cronograma Fijo
            </span>
          )}
        </div>

        {onToggleCollapse && (
          <button
            id="collapse-metrics-btn"
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            title="Ocultar panel de métricas superiores"
          >
            <span>Ocultar resumen</span>
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Grid of 6 KPI Cards */}
      <div id="project-metrics-bar" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Overall Progress */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Avance General</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">{totalProgress}%</div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${totalProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tasks Completed */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Tareas Listas</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-600">
              {completedTasks}{' '}
              <span className="text-xs font-medium text-slate-400">/ {totalTasks}</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {inProgressTasks} en curso
            </span>
          </div>
        </div>

        {/* Critical Path Count */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Ruta Crítica</span>
            <Flame className="w-4 h-4 text-rose-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-rose-600">{criticalTaskCount}</div>
            <span className="text-[11px] text-slate-500 font-medium">
              Actividades sin holgura
            </span>
          </div>
        </div>

        {/* Next Milestone */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Próximo Hito</span>
            <Flag className="w-4 h-4 text-amber-500" />
          </div>
          <div className="truncate">
            {nextMilestone ? (
              <>
                <div className="text-xs font-bold text-slate-800 truncate" title={nextMilestone.name}>
                  {nextMilestone.name.replace('HITO:', '').trim()}
                </div>
                <span className="text-[11px] text-indigo-600 font-semibold truncate block">
                  {milestoneCountdown}
                </span>
              </>
            ) : (
              <div className="text-xs font-semibold text-emerald-600">
                ¡Todos los hitos completados!
              </div>
            )}
          </div>
        </div>

        {/* Overdue / Blocked */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Alertas de Plazo</span>
            <AlertTriangle className={`w-4 h-4 ${overdueTasks > 0 || blockedTasks > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">
              {overdueTasks}{' '}
              <span className="text-xs font-medium text-slate-400">atrasadas</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {blockedTasks} bloqueadas
            </span>
          </div>
        </div>

        {/* Timeline span */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Plazo del Proyecto</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">
              {formatDateShort(project.startDate)} ➔ {formatDateShort(project.targetEndDate)}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className="text-[11px] font-bold text-indigo-700">
                {countWorkingDays(project.startDate, project.targetEndDate, project.holidays)} d hábiles
              </span>
              <span className="text-[10px] text-slate-400">
                ({diffDays(project.startDate, project.targetEndDate) + 1} d corridos)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
