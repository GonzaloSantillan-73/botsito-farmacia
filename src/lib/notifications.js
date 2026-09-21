import { isAdminRole } from './adminAuth';

const STORAGE_KEY = 'botsito_notification_prefs';
const DEFAULT_PREFS = { sound: true, desktop: false };

export const getNotificationPrefs = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const result = { ...DEFAULT_PREFS };
      return result;
    }
    const result = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    return result;
  } catch (err) {
    console.error('❌ [DEBUG-LIB-NOTIFICATIONS] getNotificationPrefs() — error:', err);
    const result = { ...DEFAULT_PREFS };
    return result;
  }
};

export const setNotificationPrefs = (prefs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.error('❌ [DEBUG-LIB-NOTIFICATIONS] No se pudieron guardar las preferencias de notificaciones:', err);
  }
};

// Pide permiso del navegador para notificaciones de escritorio. Debe llamarse
// desde un gesto del usuario (ej. tocar el interruptor), no automáticamente.
export const requestDesktopPermission = async () => {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  if (Notification.permission === 'denied') {
    return 'denied';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch (err) {
    console.error('❌ [DEBUG-LIB-NOTIFICATIONS] requestDesktopPermission() — error:', err);
    return 'denied';
  }
};

export const showDesktopNotification = (title, body) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  try {
    new Notification(title, { body, icon: '/favicon.svg' });
  } catch (err) {
    console.error('❌ [DEBUG-LIB-NOTIFICATIONS] No se pudo mostrar la notificación de escritorio:', err);
  }
};

// Genera un pequeño "ding" de dos tonos con Web Audio API, sin depender de
// ningún archivo de audio externo.
export const playAlertSound = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return;
    }
    const ctx = new AudioCtx();

    const playTone = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };

    playTone(880, 0, 0.15);
    playTone(1108, 0.16, 0.18);

    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch (err) {
    console.error('❌ [DEBUG-LIB-NOTIFICATIONS] No se pudo reproducir el sonido de notificación:', err);
  }
};

// Punto de entrada único: lee las preferencias guardadas y dispara lo que
// corresponda. Se usa desde el listener de Realtime en App.jsx.
//
// Ninguna alerta operativa (sonido ni notificación de escritorio) se puede
// silenciar para una cuenta de sucursal: sólo el admin puede mutear las
// suyas desde NotificationsPanel.jsx. Es a propósito, porque las dos
// preferencias viven en un único localStorage por NAVEGADOR (no por cuenta,
// ver STORAGE_KEY arriba) — si un admin y una sucursal comparten equipo, un
// mute del admin no debe dejar sordo/mudo al staff en ese mismo browser. La
// notificación de escritorio igual depende del permiso del navegador
// (ver showDesktopNotification): si nunca se concedió, no hay forma de
// forzarla desde acá.
export const notifyNewEvent = ({ title, body }) => {
  const prefs = getNotificationPrefs();
  const esAdmin = isAdminRole();
  if (prefs.sound || !esAdmin) playAlertSound();
  if (prefs.desktop || !esAdmin) showDesktopNotification(title, body);
};
