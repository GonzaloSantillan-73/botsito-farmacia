import { supabase } from '../supabase.js';

const BOT_SCHEDULE_KEY = 'bot_schedule';
const HUMAN_SCHEDULE_KEY = 'human_schedule';

// Zona horaria de la farmacia. Se usa esta en vez de la del server (que en
// Render suele correr en UTC) para que la comparación de horario sea correcta.
const TIMEZONE = 'America/Argentina/Buenos_Aires';

const DEFAULT_BOT_SCHEDULE = {
  enabled: false, // 24/7 por defecto
  days: [0, 1, 2, 3, 4, 5, 6],
  startTime: '00:00',
  endTime: '23:59',
  message: 'En este momento estamos fuera de nuestro horario de atención automática. Por favor, escribinos más tarde.'
};

const DEFAULT_HUMAN_SCHEDULE = {
  enabled: true,
  days: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  message: 'Nuestros asesores no se encuentran disponibles en este momento. Nuestro horario de atención es {horario}. Dejanos tu consulta y te responderemos apenas estemos disponibles.'
};

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const validateSchedule = (schedule) => {
  if (typeof schedule?.enabled !== 'boolean') {
    throw new Error('Falta indicar si el horario está restringido (enabled).');
  }
  if (!Array.isArray(schedule.days) || schedule.days.length === 0 || schedule.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error('Los días deben ser un arreglo de números entre 0 (domingo) y 6 (sábado).');
  }
  if (!TIME_REGEX.test(schedule.startTime) || !TIME_REGEX.test(schedule.endTime)) {
    throw new Error('El horario debe tener formato HH:MM.');
  }
  if (!schedule.message || !schedule.message.toString().trim()) {
    throw new Error('El mensaje de fuera de horario no puede estar vacío.');
  }
};

const getSchedule = async (key, fallback) => {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error || !data?.value || typeof data.value !== 'object') return fallback;
  return { ...fallback, ...data.value };
};

const setSchedule = async (key, schedule) => {
  validateSchedule(schedule);
  const clean = {
    enabled: schedule.enabled,
    days: schedule.days,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    message: schedule.message.toString().trim()
  };
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
};

export const getBotSchedule = () => getSchedule(BOT_SCHEDULE_KEY, DEFAULT_BOT_SCHEDULE);
export const getHumanSchedule = () => getSchedule(HUMAN_SCHEDULE_KEY, DEFAULT_HUMAN_SCHEDULE);
export const setBotSchedule = (schedule) => setSchedule(BOT_SCHEDULE_KEY, schedule);
export const setHumanSchedule = (schedule) => setSchedule(HUMAN_SCHEDULE_KEY, schedule);

const getNowInTimezone = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    day: weekdayMap[map.weekday],
    minutes: Number(map.hour) * 60 + Number(map.minute)
  };
};

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Sin restricción (enabled=false) siempre está disponible.
export const isWithinSchedule = (schedule) => {
  if (!schedule.enabled) return true;

  const { day, minutes } = getNowInTimezone();
  if (!schedule.days.includes(day)) return false;

  const startMinutes = toMinutes(schedule.startTime);
  const endMinutes = toMinutes(schedule.endTime);

  if (startMinutes <= endMinutes) {
    return minutes >= startMinutes && minutes <= endMinutes;
  }
  // Horario que cruza la medianoche (ej: 22:00 a 06:00)
  return minutes >= startMinutes || minutes <= endMinutes;
};

export const formatScheduleSummary = (schedule) => {
  const days = schedule.days
    .slice()
    .sort((a, b) => a - b)
    .map(d => DAY_NAMES[d])
    .join(', ');
  return `${days} de ${schedule.startTime} a ${schedule.endTime}hs`;
};

// Reemplaza el placeholder {horario} por un resumen legible del horario configurado.
export const renderScheduleMessage = (schedule) => {
  const summary = formatScheduleSummary(schedule);
  return (schedule.message || '').replace(/\{horario\}/g, summary);
};
