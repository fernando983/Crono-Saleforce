import { Holiday } from '../types';

export interface HolidayPreset {
  id: string;
  country: string;
  code: string;
  flag: string;
  holidays: Omit<Holiday, 'id'>[];
}

export const HOLIDAY_PRESETS: HolidayPreset[] = [
  {
    id: 'latam-general',
    country: 'Latinoamérica (Estándar)',
    code: 'LATAM',
    flag: '🌎',
    holidays: [
      { date: '2026-09-18', name: 'Fiestas Patrias / Feriado Nacional', description: 'Celebración nacional' },
      { date: '2026-10-12', name: 'Día de la Raza / Respeto a la Diversidad Cultural', description: 'Feriado civil' },
      { date: '2026-11-02', name: 'Día de Todos los Santos / Difuntos', description: 'Feriado religioso/civil' },
      { date: '2026-12-08', name: 'Inmaculada Concepción', description: 'Feriado religioso' },
      { date: '2026-12-25', name: 'Navidad', description: 'Navidad' },
      { date: '2027-01-01', name: 'Año Nuevo', description: 'Año Nuevo' },
      { date: '2027-05-01', name: 'Día Internacional del Trabajador', description: 'Feriado laboral' },
    ],
  },
  {
    id: 'argentina',
    country: 'Argentina',
    code: 'AR',
    flag: '🇦🇷',
    holidays: [
      { date: '2026-10-12', name: 'Día del Respeto a la Diversidad Cultural', description: 'Feriado nacional trasladable' },
      { date: '2026-11-20', name: 'Día de la Soberanía Nacional', description: 'Feriado nacional' },
      { date: '2026-12-08', name: 'Inmaculada Concepción de María', description: 'Feriado inamovible' },
      { date: '2026-12-25', name: 'Navidad', description: 'Feriado inamovible' },
      { date: '2027-01-01', name: 'Año Nuevo', description: 'Feriado inamovible' },
      { date: '2027-03-24', name: 'Día Nacional de la Memoria por la Verdad y la Justicia', description: 'Feriado inamovible' },
      { date: '2027-05-01', name: 'Día del Trabajador', description: 'Feriado nacional' },
      { date: '2027-05-25', name: 'Día de la Revolución de Mayo', description: 'Feriado nacional' },
      { date: '2027-07-09', name: 'Día de la Independencia', description: 'Feriado patrio' },
    ],
  },
  {
    id: 'chile',
    country: 'Chile',
    code: 'CL',
    flag: '🇨🇱',
    holidays: [
      { date: '2026-09-18', name: 'Independencia Nacional', description: 'Fiestas Patrias irrenunciable' },
      { date: '2026-09-19', name: 'Día de las Glorias del Ejército', description: 'Fiestas Patrias irrenunciable' },
      { date: '2026-10-12', name: 'Encuentro de Dos Mundos', description: 'Feriado legal' },
      { date: '2026-10-31', name: 'Día de las Iglesias Evangélicas y Protestantes', description: 'Feriado legal' },
      { date: '2026-11-01', name: 'Día de Todos los Santos', description: 'Feriado religioso' },
      { date: '2026-12-08', name: 'Inmaculada Concepción', description: 'Feriado religioso' },
      { date: '2026-12-25', name: 'Navidad', description: 'Feriado irrenunciable' },
      { date: '2027-01-01', name: 'Año Nuevo', description: 'Feriado irrenunciable' },
    ],
  },
  {
    id: 'colombia',
    country: 'Colombia',
    code: 'CO',
    flag: '🇨🇴',
    holidays: [
      { date: '2026-10-12', name: 'Día de la Raza', description: 'Ley Emiliani' },
      { date: '2026-11-02', name: 'Día de Todos los Santos', description: 'Ley Emiliani' },
      { date: '2026-11-16', name: 'Independencia de Cartagena', description: 'Ley Emiliani' },
      { date: '2026-12-08', name: 'Inmaculada Concepción', description: 'Feriado nacional' },
      { date: '2026-12-25', name: 'Navidad', description: 'Feriado nacional' },
      { date: '2027-01-01', name: 'Año Nuevo', description: 'Feriado nacional' },
      { date: '2027-01-11', name: 'Día de los Reyes Magos', description: 'Ley Emiliani' },
    ],
  },
  {
    id: 'mexico',
    country: 'México',
    code: 'MX',
    flag: '🇲🇽',
    holidays: [
      { date: '2026-09-16', name: 'Día de la Independencia', description: 'Descanso obligatorio oficial' },
      { date: '2026-11-16', name: 'Conmemoración Revolución Mexicana', description: 'Tercer lunes de noviembre' },
      { date: '2026-12-25', name: 'Navidad', description: 'Descanso obligatorio oficial' },
      { date: '2027-01-01', name: 'Año Nuevo', description: 'Descanso obligatorio oficial' },
      { date: '2027-02-01', name: 'Día de la Constitución', description: 'Primer lunes de febrero' },
      { date: '2027-03-15', name: 'Natalicio de Benito Juárez', description: 'Tercer lunes de marzo' },
      { date: '2027-05-01', name: 'Día del Trabajo', description: 'Descanso obligatorio oficial' },
    ],
  },
  {
    id: 'peru',
    country: 'Perú',
    code: 'PE',
    flag: '🇵🇪',
    holidays: [
      { date: '2026-10-08', name: 'Combate de Angamos', description: 'Feriado nacional' },
      { date: '2026-11-01', name: 'Día de Todos los Santos', description: 'Feriado nacional' },
      { date: '2026-12-08', name: 'Inmaculada Concepción', description: 'Feriado nacional' },
      { date: '2026-12-09', name: 'Batalla de Ayacucho', description: 'Feriado nacional' },
      { date: '2026-12-25', name: 'Navidad', description: 'Feriado nacional' },
      { date: '2027-01-01', name: 'Año Nuevo', description: 'Feriado nacional' },
    ],
  },
  {
    id: 'spain',
    country: 'España',
    code: 'ES',
    flag: '🇪🇸',
    holidays: [
      { date: '2026-10-12', name: 'Fiesta Nacional de España', description: 'Festivo nacional' },
      { date: '2026-11-01', name: 'Día de Todos los Santos', description: 'Festivo nacional' },
      { date: '2026-12-06', name: 'Día de la Constitución Española', description: 'Festivo nacional' },
      { date: '2026-12-08', name: 'La Inmaculada Concepción', description: 'Festivo nacional' },
      { date: '2026-12-25', name: 'Natividad del Señor', description: 'Festivo nacional' },
      { date: '2027-01-01', name: 'Año Nuevo', description: 'Festivo nacional' },
      { date: '2027-01-06', name: 'Epifanía del Señor (Reyes)', description: 'Festivo nacional' },
    ],
  },
];

export const INITIAL_SAMPLE_HOLIDAYS: Holiday[] = [
  { id: 'hol-1', date: '2026-09-18', name: 'Fiestas Patrias / Feriado Nacional', description: 'Feriado cívico' },
  { id: 'hol-2', date: '2026-10-12', name: 'Día del Respeto a la Diversidad Cultural', description: 'Feriado oficial' },
  { id: 'hol-3', date: '2026-11-02', name: 'Día de Todos los Santos / Difuntos', description: 'Feriado civil' },
];
