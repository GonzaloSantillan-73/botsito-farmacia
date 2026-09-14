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
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] validateSchedule() — schedule:', schedule);
  if (typeof schedule?.enabled !== 'boolean') {
    console.error('❌ [DEBUG-SERVICE-SCHEDULECONFIG] validateSchedule() — falta indicar enabled (boolean). schedule:', schedule);
    throw new Error('Falta indicar si el horario está restringido (enabled).');
  }
  if (!Array.isArray(schedule.days) || schedule.days.length === 0 || schedule.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
    console.error('❌ [DEBUG-SERVICE-SCHEDULECONFIG] validateSchedule() — days inválido. schedule.days:', schedule.days);
    throw new Error('Los días deben ser un arreglo de números entre 0 (domingo) y 6 (sábado).');
  }
  if (!TIME_REGEX.test(schedule.startTime) || !TIME_REGEX.test(schedule.endTime)) {
    console.error('❌ [DEBUG-SERVICE-SCHEDULECONFIG] validateSchedule() — horario con formato inválido. startTime:', schedule.startTime, 'endTime:', schedule.endTime);
    throw new Error('El horario debe tener formato HH:MM.');
  }
  if (!schedule.message || !schedule.message.toString().trim()) {
    console.error('❌ [DEBUG-SERVICE-SCHEDULECONFIG] validateSchedule() — mensaje vacío. schedule.message:', schedule.message);
    throw new Error('El mensaje de fuera de horario no puede estar vacío.');
  }
  console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] validateSchedule() — schedule válido');
};

const getSchedule = async (key, fallback) => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] getSchedule() — key:', key, 'fallback:', fallback);
  try {
    console.log('📡 [DEBUG-SERVICE-SCHEDULECONFIG] getSchedule() — SELECT app_settings, filtros: { key:', key, ' }, columnas: value');
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
    console.log('📡 [DEBUG-SERVICE-SCHEDULECONFIG] getSchedule() — resultado SELECT app_settings — data:', data, 'error:', error);

    if (error || !data?.value || typeof data.value !== 'object') {
      console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] getSchedule() — sin valor guardado o error, devolviendo fallback:', fallback);
      return fallback;
    }
    const resultado = { ...fallback, ...data.value };
    console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] getSchedule() — resultado a devolver:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-SCHEDULECONFIG] getSchedule() — error:', err?.message, err?.stack);
    throw err;
  }
};

const setSchedule = async (key, schedule) => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] setSchedule() — key:', key, 'schedule:', schedule);
  try {
    validateSchedule(schedule);
    const clean = {
      enabled: schedule.enabled,
      days: schedule.days,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      message: schedule.message.toString().trim()
    };
    console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] setSchedule() — clean:', clean);

    console.log('📡 [DEBUG-SERVICE-SCHEDULECONFIG] setSchedule() — UPSERT app_settings, valores:', { key, value: clean, updated_at: new Date().toISOString() }, 'onConflict: key');
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    console.log('📡 [DEBUG-SERVICE-SCHEDULECONFIG] setSchedule() — resultado UPSERT app_settings — error:', error);

    if (error) {
      console.error('❌ [DEBUG-SERVICE-SCHEDULECONFIG] setSchedule() — error:', error);
      throw error;
    }
    console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] setSchedule() — finalizado sin valor de retorno explícito');
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-SCHEDULECONFIG] setSchedule() — error:', err?.message, err?.stack);
    throw err;
  }
};

export const getBotSchedule = () => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] getBotSchedule() — sin parámetros');
  return getSchedule(BOT_SCHEDULE_KEY, DEFAULT_BOT_SCHEDULE);
};
export const getHumanSchedule = () => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] getHumanSchedule() — sin parámetros');
  return getSchedule(HUMAN_SCHEDULE_KEY, DEFAULT_HUMAN_SCHEDULE);
};
export const setBotSchedule = (schedule) => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] setBotSchedule() — schedule:', schedule);
  return setSchedule(BOT_SCHEDULE_KEY, schedule);
};
export const setHumanSchedule = (schedule) => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] setHumanSchedule() — schedule:', schedule);
  return setSchedule(HUMAN_SCHEDULE_KEY, schedule);
};

const getNowInTimezone = () => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] getNowInTimezone() — sin parámetros');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  const resultado = {
    day: weekdayMap[map.weekday],
    minutes: Number(map.hour) * 60 + Number(map.minute)
  };
  console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] getNowInTimezone() — resultado a devolver:', resultado);
  return resultado;
};

const toMinutes = (hhmm) => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] toMinutes() — hhmm:', hhmm);
  const [h, m] = hhmm.split(':').map(Number);
  const resultado = h * 60 + m;
  console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] toMinutes() — resultado:', resultado);
  return resultado;
};

// Sin restricción (enabled=false) siempre está disponible.
export const isWithinSchedule = (schedule) => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] isWithinSchedule() — schedule:', schedule);
  if (!schedule.enabled) {
    console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] isWithinSchedule() — schedule deshabilitado, resultado: true');
    return true;
  }

  const { day, minutes } = getNowInTimezone();
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] isWithinSchedule() — day actual:', day, 'minutes actual:', minutes);
  if (!schedule.days.includes(day)) {
    console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] isWithinSchedule() — día no incluido en schedule.days, resultado: false');
    return false;
  }

  const startMinutes = toMinutes(schedule.startTime);
  const endMinutes = toMinutes(schedule.endTime);
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] isWithinSchedule() — startMinutes:', startMinutes, 'endMinutes:', endMinutes);

  let resultado;
  if (startMinutes <= endMinutes) {
    resultado = minutes >= startMinutes && minutes <= endMinutes;
  } else {
    // Horario que cruza la medianoche (ej: 22:00 a 06:00)
    resultado = minutes >= startMinutes || minutes <= endMinutes;
  }
  console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] isWithinSchedule() — resultado a devolver:', resultado);
  return resultado;
};

export const formatScheduleSummary = (schedule) => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] formatScheduleSummary() — schedule:', schedule);
  const days = schedule.days
    .slice()
    .sort((a, b) => a - b)
    .map(d => DAY_NAMES[d])
    .join(', ');
  const resultado = `${days} de ${schedule.startTime} a ${schedule.endTime}hs`;
  console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] formatScheduleSummary() — resultado:', resultado);
  return resultado;
};

// Reemplaza el placeholder {horario} por un resumen legible del horario configurado.
export const renderScheduleMessage = (schedule) => {
  console.log('🔍 [DEBUG-SERVICE-SCHEDULECONFIG] renderScheduleMessage() — schedule:', schedule);
  const summary = formatScheduleSummary(schedule);
  const resultado = (schedule.message || '').replace(/\{horario\}/g, summary);
  console.log('✅ [DEBUG-SERVICE-SCHEDULECONFIG] renderScheduleMessage() — resultado:', resultado);
  return resultado;
};
