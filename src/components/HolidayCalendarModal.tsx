import React, { useState } from 'react';
import { Holiday } from '../types';
import { HOLIDAY_PRESETS } from '../utils/holidayPresets';
import { parseDate, formatDateReadable, getDayName, isWeekend } from '../utils/dateUtils';
import {
  X,
  Calendar,
  Plus,
  Trash2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Info,
  CalendarDays,
  Globe2,
} from 'lucide-react';

interface HolidayCalendarModalProps {
  isOpen: boolean;
  holidays: Holiday[];
  onClose: () => void;
  onSaveHolidays: (holidays: Holiday[]) => void;
}

export const HolidayCalendarModal: React.FC<HolidayCalendarModalProps> = ({
  isOpen,
  holidays,
  onClose,
  onSaveHolidays,
}) => {
  const [list, setList] = useState<Holiday[]>(holidays || []);
  const [newDate, setNewDate] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  if (!isOpen) return null;

  // Sort chronologically
  const sortedHolidays = [...list].sort((a, b) => a.date.localeCompare(b.date));

  // Count weekdays vs weekends
  const weekdayHolidaysCount = sortedHolidays.filter((h) => !isWeekend(parseDate(h.date))).length;

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newName.trim()) {
      alert('Por favor indica la fecha y el nombre del feriado.');
      return;
    }

    // Check if already exists for date
    const exists = list.some((h) => h.date === newDate);
    if (exists) {
      setFeedbackMsg(`Ya existe un feriado registrado para ${newDate}.`);
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }

    const newHoliday: Holiday = {
      id: `hol-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      date: newDate,
      name: newName.trim(),
      description: newDesc.trim() || undefined,
    };

    setList((prev) => [...prev, newHoliday]);
    setNewName('');
    setNewDesc('');
    setFeedbackMsg('Feriado añadido con éxito');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleRemoveHoliday = (id: string) => {
    setList((prev) => prev.filter((h) => h.id !== id));
  };

  const handleClearAll = () => {
    setList([]);
    setFeedbackMsg('Se eliminaron todos los feriados.');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleApplyPreset = (presetId: string, mode: 'replace' | 'merge') => {
    const preset = HOLIDAY_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    const formatted: Holiday[] = preset.holidays.map((h, i) => ({
      ...h,
      id: `hol-${preset.code.toLowerCase()}-${Date.now()}-${i}`,
    }));

    if (mode === 'replace') {
      setList(formatted);
      setFeedbackMsg(`Calendario reemplazado con feriados de ${preset.country} (${formatted.length} días)`);
    } else {
      // Merge avoiding duplicate exact dates
      const existingDates = new Set(list.map((h) => h.date));
      const newItems = formatted.filter((h) => !existingDates.has(h.date));
      setList((prev) => [...prev, ...newItems]);
      setFeedbackMsg(`Se sumaron ${newItems.length} nuevos feriados de ${preset.country}`);
    }
    setSelectedPresetId('');
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleSave = () => {
    onSaveHolidays(sortedHolidays);
    onClose();
  };

  return (
    <div
      id="holiday-calendar-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        id="holiday-calendar-modal-container"
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-200/60">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Calendario de Feriados y Días No Laborables</h2>
              <p className="text-xs text-slate-500">
                Se destacarán en el Gantt y se excluirán al calcular los días hábiles/laborables.
              </p>
            </div>
          </div>
          <button
            id="holiday-modal-close-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback notification */}
        {feedbackMsg && (
          <div className="mx-6 mt-3 px-3.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Content Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Feriados
              </span>
              <span className="text-lg font-bold text-slate-800">{sortedHolidays.length}</span>
            </div>
            <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl">
              <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">
                En Días Hábiles (L-V)
              </span>
              <span className="text-lg font-bold text-amber-800">{weekdayHolidaysCount} días</span>
            </div>
            <div className="p-3 bg-indigo-50/60 border border-indigo-200/80 rounded-xl col-span-2 sm:col-span-1">
              <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider block">
                Efecto en Cronograma
              </span>
              <span className="text-xs font-bold text-indigo-900 block mt-0.5">
                No computables (se omiten de L-V)
              </span>
            </div>
          </div>

          {/* Strict Working Days Rule Banner */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-300/80 rounded-xl text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Regla de Planificación: Los feriados no son días hábiles</span>
              <span className="text-[11px] text-amber-800 leading-relaxed block mt-0.5">
                Las actividades del cronograma omiten automáticamente tanto los fines de semana como todos los feriados aquí declarados. Las tareas no inician ni finalizan en feriados, y sus plazos se extienden automáticamente para cumplir con los días hábiles efectivos planificados.
              </span>
            </div>
          </div>

          {/* Preset Calendars Loader */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Globe2 className="w-4 h-4 text-indigo-600" />
                <span>Cargar Calendario Oficial Preconfigurado</span>
              </div>
              <span className="text-[10px] text-slate-400">Plantillas 2026/2027</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Selecciona un país para importar rápidamente los feriados oficiales nacionales:
            </p>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {HOLIDAY_PRESETS.map((preset) => (
                <div key={preset.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => {
                      if (list.length > 0) {
                        setSelectedPresetId(selectedPresetId === preset.id ? '' : preset.id);
                      } else {
                        handleApplyPreset(preset.id, 'replace');
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                      selectedPresetId === preset.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-100/70'
                    }`}
                  >
                    <span>{preset.flag}</span>
                    <span>{preset.country}</span>
                    <span className="text-[10px] opacity-70">({preset.holidays.length})</span>
                  </button>

                  {/* Context actions for preset if list already has items */}
                  {selectedPresetId === preset.id && (
                    <div className="absolute top-full left-0 mt-1 z-20 w-48 p-2 bg-white border border-slate-200 rounded-xl shadow-lg space-y-1">
                      <p className="text-[10px] font-semibold text-slate-500 px-2 py-0.5">
                        ¿Cómo deseas aplicar {preset.country}?
                      </p>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(preset.id, 'merge')}
                        className="w-full text-left px-2 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 rounded-md font-medium cursor-pointer"
                      >
                        ➕ Sumar a existentes
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(preset.id, 'replace')}
                        className="w-full text-left px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-md font-medium cursor-pointer"
                      >
                        🔄 Reemplazar todo
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add Custom Holiday Form */}
          <form onSubmit={handleAddHoliday} className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-600" />
              <span>Añadir Feriado o Día No Laborable Manual</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Fecha del Feriado *
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nombre del Feriado / Festividad *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Aniversario de la Empresa, Feriado Local..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Descripción o nota opcional (ej: Cierre general de operaciones)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white"
              />
              <button
                id="holiday-add-btn"
                type="submit"
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </div>
          </form>

          {/* List of Configured Holidays */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700">
                Feriados Activos ({sortedHolidays.length})
              </h3>
              {sortedHolidays.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                >
                  Eliminar todos
                </button>
              )}
            </div>

            {sortedHolidays.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">No hay feriados configurados aún</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                  Agrega un día feriado usando el formulario o selecciona una de las plantillas oficiales preconfiguradas arriba.
                </p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
                {sortedHolidays.map((holiday) => {
                  const dateObj = parseDate(holiday.date);
                  const isWeekendDay = isWeekend(dateObj);
                  const dayName = getDayName(dateObj);

                  return (
                    <div
                      key={holiday.id}
                      className="flex items-center justify-between p-2.5 bg-slate-50/70 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl text-xs transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-center shadow-2xs shrink-0 min-w-[70px]">
                          <span className="text-[10px] font-bold text-indigo-600 uppercase block leading-none">
                            {formatDateReadable(holiday.date).split(' ')[1]} {dateObj.getFullYear()}
                          </span>
                          <span className="text-sm font-extrabold text-slate-800 leading-tight block">
                            {dateObj.getDate()}
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">{holiday.name}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                isWeekendDay
                                  ? 'bg-slate-200 text-slate-600'
                                  : 'bg-amber-100 text-amber-800 font-semibold'
                              }`}
                            >
                              {dayName} {isWeekendDay ? '(Fin de semana)' : '(Día hábil)'}
                            </span>
                          </div>
                          {holiday.description && (
                            <p className="text-[11px] text-slate-500">{holiday.description}</p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveHoliday(holiday.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar este feriado"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Los cambios impactan el Gantt y el conteo de días laborales.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="holiday-cancel-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="holiday-save-btn"
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer"
            >
              Aplicar al Proyecto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
