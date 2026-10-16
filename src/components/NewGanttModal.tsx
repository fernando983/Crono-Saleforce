import React, { useState } from 'react';
import { Project, Phase, Assignee, Task } from '../types';
import { toISODate, ensureWorkingDay, addDays } from '../utils/dateUtils';
import { INITIAL_PHASES, INITIAL_ASSIGNEES, INITIAL_PROJECT } from '../utils/sampleData';
import { INITIAL_SAMPLE_HOLIDAYS } from '../utils/holidayPresets';
import {
  PlusCircle,
  X,
  FileCode,
  Sparkles,
  Building2,
  Cpu,
  Layers,
  Calendar,
  User,
  DollarSign,
  CheckCircle2,
  Workflow,
  Briefcase,
  FolderPlus,
} from 'lucide-react';

interface NewGanttModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (newProject: Project) => void;
}

type TemplateType = 'blank' | 'erp' | 'software' | 'construction' | 'consulting';

export const NewGanttModal: React.FC<NewGanttModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
}) => {
  const [selectedType, setSelectedType] = useState<TemplateType>('blank');
  const [title, setTitle] = useState('Nuevo Cronograma de Proyecto');
  const [client, setClient] = useState('Cliente Principal S.A.');
  const [manager, setManager] = useState('Líder de Proyecto');
  const [startDate, setStartDate] = useState(() => ensureWorkingDay(toISODate(new Date())));
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'CLP' | 'MXN' | 'COP'>('USD');
  const [budget, setBudget] = useState(50000);
  const [removePredecessors, setRemovePredecessors] = useState(true); // Default true per user request

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();

    const baseStart = ensureWorkingDay(startDate);
    let createdPhases: Phase[] = [];
    let createdTasks: Task[] = [];
    let defaultAssignees: Assignee[] = [...INITIAL_ASSIGNEES];

    if (selectedType === 'blank') {
      createdPhases = [
        { id: `phase-${Date.now()}-1`, name: '1. Planificación & Levantamiento', color: '#6366f1', order: 1 },
        { id: `phase-${Date.now()}-2`, name: '2. Ejecución & Desarrollo', color: '#0ea5e9', order: 2 },
        { id: `phase-${Date.now()}-3`, name: '3. Pruebas & Cierre', color: '#10b981', order: 3 },
      ];

      // Create 3 starter clean tasks with NO dependencies
      const t1End = addDays(baseStart, 4);
      const t2Start = addDays(baseStart, 5);
      const t2End = addDays(t2Start, 9);
      const t3Start = addDays(t2End, 1);
      const t3End = addDays(t3Start, 4);

      createdTasks = [
        {
          id: `task-${Date.now()}-1`,
          name: 'Alineación de objetivos y alcance inicial',
          phaseId: createdPhases[0].id,
          startDate: baseStart,
          endDate: t1End,
          durationMode: 'working_days',
          workingDays: 5,
          progress: 0,
          status: 'pending',
          priority: 'high',
          assignee: defaultAssignees[0],
          dependencies: [],
          deliverable: 'Acta de constitución',
        },
        {
          id: `task-${Date.now()}-2`,
          name: 'Ejecución del paquete de trabajo principal',
          phaseId: createdPhases[1].id,
          startDate: t2Start,
          endDate: t2End,
          durationMode: 'working_days',
          workingDays: 10,
          progress: 0,
          status: 'pending',
          priority: 'medium',
          assignee: defaultAssignees[1] || defaultAssignees[0],
          dependencies: [],
          deliverable: 'Entregable intermedio',
        },
        {
          id: `task-${Date.now()}-3`,
          name: 'HITO: Aprobación y Cierre de Proyecto',
          phaseId: createdPhases[2].id,
          startDate: t3End,
          endDate: t3End,
          durationMode: 'working_days',
          workingDays: 1,
          progress: 0,
          status: 'pending',
          priority: 'critical',
          assignee: defaultAssignees[0],
          dependencies: [],
          isMilestone: true,
          color: '#10b981',
          deliverable: 'Acta de entrega final',
        },
      ];
    } else if (selectedType === 'software') {
      createdPhases = [
        { id: `phase-${Date.now()}-1`, name: '1. Discovery & Arquitectura', color: '#6366f1', order: 1 },
        { id: `phase-${Date.now()}-2`, name: '2. Sprint 1: Frontend & UI', color: '#0ea5e9', order: 2 },
        { id: `phase-${Date.now()}-3`, name: '3. Sprint 2: Backend & APIs', color: '#8b5cf6', order: 3 },
        { id: `phase-${Date.now()}-4`, name: '4. QA & Despliegue Cloud', color: '#10b981', order: 4 },
      ];

      createdTasks = [
        {
          id: `task-${Date.now()}-1`,
          name: 'Definición de Historias de Usuario y UX Wireframes',
          phaseId: createdPhases[0].id,
          startDate: baseStart,
          endDate: addDays(baseStart, 4),
          durationMode: 'working_days',
          workingDays: 5,
          progress: 0,
          status: 'pending',
          priority: 'high',
          assignee: defaultAssignees[0],
          dependencies: [],
        },
        {
          id: `task-${Date.now()}-2`,
          name: 'Desarrollo de Vistas y Componentes React',
          phaseId: createdPhases[1].id,
          startDate: addDays(baseStart, 5),
          endDate: addDays(baseStart, 16),
          durationMode: 'working_days',
          workingDays: 10,
          progress: 0,
          status: 'pending',
          priority: 'high',
          assignee: defaultAssignees[1] || defaultAssignees[0],
          dependencies: [],
        },
        {
          id: `task-${Date.now()}-3`,
          name: 'Integración de Endpoints y Base de Datos',
          phaseId: createdPhases[2].id,
          startDate: addDays(baseStart, 10),
          endDate: addDays(baseStart, 21),
          durationMode: 'working_days',
          workingDays: 10,
          progress: 0,
          status: 'pending',
          priority: 'critical',
          assignee: defaultAssignees[2] || defaultAssignees[0],
          dependencies: [],
        },
        {
          id: `task-${Date.now()}-4`,
          name: 'HITO: Release a Producción (v1.0.0)',
          phaseId: createdPhases[3].id,
          startDate: addDays(baseStart, 25),
          endDate: addDays(baseStart, 25),
          durationMode: 'working_days',
          workingDays: 1,
          progress: 0,
          status: 'pending',
          priority: 'critical',
          isMilestone: true,
          color: '#10b981',
          assignee: defaultAssignees[0],
          dependencies: [],
        },
      ];
    } else if (selectedType === 'construction') {
      createdPhases = [
        { id: `phase-${Date.now()}-1`, name: '1. Obras Preliminares & Replanteo', color: '#d97706', order: 1 },
        { id: `phase-${Date.now()}-2`, name: '2. Cimentaciones & Estructura', color: '#0284c7', order: 2 },
        { id: `phase-${Date.now()}-3`, name: '3. Instalaciones & Terminaciones', color: '#16a34a', order: 3 },
      ];

      createdTasks = [
        {
          id: `task-${Date.now()}-1`,
          name: 'Movimiento de tierras y replanteo topográfico',
          phaseId: createdPhases[0].id,
          startDate: baseStart,
          endDate: addDays(baseStart, 7),
          durationMode: 'working_days',
          workingDays: 6,
          progress: 0,
          status: 'pending',
          priority: 'high',
          assignee: defaultAssignees[0],
          dependencies: [],
        },
        {
          id: `task-${Date.now()}-2`,
          name: 'Hormigonado de zapatas y losas de cimentación',
          phaseId: createdPhases[1].id,
          startDate: addDays(baseStart, 8),
          endDate: addDays(baseStart, 22),
          durationMode: 'working_days',
          workingDays: 12,
          progress: 0,
          status: 'pending',
          priority: 'critical',
          assignee: defaultAssignees[2] || defaultAssignees[0],
          dependencies: [],
        },
        {
          id: `task-${Date.now()}-3`,
          name: 'HITO: Recepción Provisoria de Obra',
          phaseId: createdPhases[2].id,
          startDate: addDays(baseStart, 28),
          endDate: addDays(baseStart, 28),
          durationMode: 'working_days',
          workingDays: 1,
          progress: 0,
          status: 'pending',
          priority: 'critical',
          isMilestone: true,
          color: '#d97706',
          assignee: defaultAssignees[0],
          dependencies: [],
        },
      ];
    } else {
      // ERP & CRM preset from INITIAL_PROJECT
      createdPhases = JSON.parse(JSON.stringify(INITIAL_PHASES));
      createdTasks = JSON.parse(JSON.stringify(INITIAL_PROJECT.tasks));
    }

    // Apply "Remove predecessors" if selected
    if (removePredecessors) {
      createdTasks = createdTasks.map((t) => ({
        ...t,
        dependencies: [],
      }));
    }

    // Calculate target end date
    let maxEnd = addDays(baseStart, 30);
    createdTasks.forEach((t) => {
      if (t.endDate && t.endDate > maxEnd) maxEnd = t.endDate;
    });

    const newProject: Project = {
      id: `proj-${Date.now()}`,
      title: title.trim() || 'Nuevo Cronograma Gantt',
      client: client.trim() || 'Cliente Principal',
      manager: manager.trim() || 'Líder de Proyecto',
      startDate: baseStart,
      targetEndDate: maxEnd,
      budget: budget || 0,
      currency,
      phases: createdPhases,
      assignees: defaultAssignees,
      holidays: INITIAL_SAMPLE_HOLIDAYS,
      tasks: createdTasks,
    };

    onCreateProject(newProject);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <FolderPlus className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h2 className="text-base font-bold">Crear Nuevo Cronograma Gantt</h2>
              <p className="text-xs text-indigo-200">
                Inicia un proyecto en blanco o utiliza una plantilla con o sin dependencias
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleCreate} className="p-6 space-y-5">
          {/* Template Selection Cards */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Tipo de Proyecto o Plantilla
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedType('blank');
                  setTitle('Nuevo Proyecto');
                }}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedType === 'blank'
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${selectedType === 'blank' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Proyecto en Blanco (Recomendado)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Comienza limpio desde cero, sin dependencias complejas ni bloqueos.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedType('erp');
                  setTitle('Implementación Sistema ERP & CRM Cloud');
                }}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedType === 'erp'
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${selectedType === 'erp' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Plantilla ERP & CRM</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Metodología de 6 fases: Blueprint, Configuración, QA, Go-Live.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedType('software');
                  setTitle('Desarrollo de Plataforma Web & Móvil');
                }}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedType === 'software'
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${selectedType === 'software' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Desarrollo de Software</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Sprints ágiles, UI/UX, arquitectura backend y QA.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedType('construction');
                  setTitle('Proyecto de Obra e Infraestructura');
                }}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedType === 'construction'
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${selectedType === 'construction' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Construcción & Obras</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Obras preliminares, cimentación, estructura y recepción.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Project Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre del Proyecto / Cronograma *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Implementación E-commerce 2026"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cliente u Organización
              </label>
              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Ej. Corporación Andina S.A."
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Líder / Project Manager
              </label>
              <input
                type="text"
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                placeholder="Ej. Carlos Mendoza"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Fecha de Inicio del Cronograma
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Presupuesto & Moneda
              </label>
              <div className="flex gap-2">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as any)}
                  className="px-2.5 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="CLP">CLP ($)</option>
                  <option value="MXN">MXN ($)</option>
                  <option value="COP">COP ($)</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* CRITICAL TOGGLE: Predecessor-Free Mode */}
          <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={removePredecessors}
                onChange={(e) => setRemovePredecessors(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-bold text-amber-950 block">
                  Crear sin predecesoras ni enlaces restrictivos (Recomendado)
                </span>
                <span className="text-amber-800 text-[11px] block mt-0.5 leading-relaxed">
                  Todas las actividades serán 100% independientes. Podrás mover y redimensionar las fechas de cualquier tarea en el Gantt sin que se desplace el resto por efecto cascada.
                </span>
              </div>
            </label>
          </div>

          {/* Notice about Snapshot Backup */}
          <p className="text-[11px] text-slate-500 text-center">
            💡 Tu cronograma actual quedará guardado automáticamente en el historial de Respaldos por si deseas recuperarlo.
          </p>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow transition-all cursor-pointer flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Crear Cronograma Gantt</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
