const STORAGE_KEY = 'botsito_notification_prefs';
const DEFAULT_PREFS = { sound: true, desktop: false };

export const getNotificationPrefs = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const setNotificationPrefs = (prefs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.error('No se pudieron guardar las preferencias de notificaciones:', err);
  }
};

// Pide permiso del navegador para notificaciones de escritorio. Debe llamarse
// desde un gesto del usuario (ej. tocar el interruptor), no automáticamente.
export const requestDesktopPermission = async () => {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
};

export const showDesktopNotification = (title, body) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/favicon.svg' });
  } catch (err) {
    console.error('No se pudo mostrar la notificación de escritorio:', err);
  }
};

// Genera un pequeño "ding" de dos tonos con Web Audio API, sin depender de
// ningún archivo de audio externo.
export const playAlertSound = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
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
    console.error('No se pudo reproducir el sonido de notificación:', err);
  }
};

// Punto de entrada único: lee las preferencias guardadas y dispara lo que
// corresponda. Se usa desde el listener de Realtime en App.jsx.
export const notifyNewEvent = ({ title, body }) => {
  const prefs = getNotificationPrefs();
  if (prefs.sound) playAlertSound();
  if (prefs.desktop) showDesktopNotification(title, body);
};
