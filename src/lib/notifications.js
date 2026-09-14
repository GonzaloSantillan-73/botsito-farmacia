const STORAGE_KEY = 'botsito_notification_prefs';
const DEFAULT_PREFS = { sound: true, desktop: false };

export const getNotificationPrefs = () => {
  console.log('🔍 [DEBUG-LIB-NOTIFICATIONS] getNotificationPrefs() — sin parámetros');
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const result = { ...DEFAULT_PREFS };
      console.log('✅ [DEBUG-LIB-NOTIFICATIONS] getNotificationPrefs() — return (default, sin raw):', result);
      return result;
    }
    const result = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] getNotificationPrefs() — return:', result);
    return result;
  } catch (err) {
    console.error('❌ [DEBUG-LIB-NOTIFICATIONS] getNotificationPrefs() — error:', err);
    const result = { ...DEFAULT_PREFS };
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] getNotificationPrefs() — return (default, tras error):', result);
    return result;
  }
};

export const setNotificationPrefs = (prefs) => {
  console.log('🔍 [DEBUG-LIB-NOTIFICATIONS] setNotificationPrefs() — prefs:', prefs);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] setNotificationPrefs() — guardado OK');
  } catch (err) {
    console.error('❌ [DEBUG-LIB-NOTIFICATIONS] No se pudieron guardar las preferencias de notificaciones:', err);
  }
};

// Pide permiso del navegador para notificaciones de escritorio. Debe llamarse
// desde un gesto del usuario (ej. tocar el interruptor), no automáticamente.
export const requestDesktopPermission = async () => {
  console.log('🔍 [DEBUG-LIB-NOTIFICATIONS] requestDesktopPermission() — sin parámetros');
  if (!('Notification' in window)) {
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] requestDesktopPermission() — return: unsupported');
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] requestDesktopPermission() — return: granted (ya estaba concedido)');
    return 'granted';
  }
  if (Notification.permission === 'denied') {
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] requestDesktopPermission() — return: denied (ya estaba denegado)');
    return 'denied';
  }
  try {
    const result = await Notification.requestPermission();
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] requestDesktopPermission() — return:', result);
    return result;
  } catch (err) {
    console.error('❌ [DEBUG-LIB-NOTIFICATIONS] requestDesktopPermission() — error:', err);
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] requestDesktopPermission() — return: denied (tras error)');
    return 'denied';
  }
};

export const showDesktopNotification = (title, body) => {
  console.log('🔍 [DEBUG-LIB-NOTIFICATIONS] showDesktopNotification() — title:', title, '| body:', body);
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] showDesktopNotification() — return (sin permiso o sin soporte)');
    return;
  }
  try {
    new Notification(title, { body, icon: '/favicon.svg' });
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] showDesktopNotification() — notificación mostrada');
  } catch (err) {
    console.error('❌ [DEBUG-LIB-NOTIFICATIONS] No se pudo mostrar la notificación de escritorio:', err);
  }
};

// Genera un pequeño "ding" de dos tonos con Web Audio API, sin depender de
// ningún archivo de audio externo.
export const playAlertSound = () => {
  console.log('🔍 [DEBUG-LIB-NOTIFICATIONS] playAlertSound() — sin parámetros');
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      console.log('✅ [DEBUG-LIB-NOTIFICATIONS] playAlertSound() — return (sin soporte de AudioContext)');
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
    console.log('✅ [DEBUG-LIB-NOTIFICATIONS] playAlertSound() — tonos disparados');
  } catch (err) {
    console.error('❌ [DEBUG-LIB-NOTIFICATIONS] No se pudo reproducir el sonido de notificación:', err);
  }
};

// Punto de entrada único: lee las preferencias guardadas y dispara lo que
// corresponda. Se usa desde el listener de Realtime en App.jsx.
export const notifyNewEvent = ({ title, body }) => {
  console.log('🔍 [DEBUG-LIB-NOTIFICATIONS] notifyNewEvent() — title:', title, '| body:', body);
  const prefs = getNotificationPrefs();
  if (prefs.sound) playAlertSound();
  if (prefs.desktop) showDesktopNotification(title, body);
  console.log('✅ [DEBUG-LIB-NOTIFICATIONS] notifyNewEvent() — return (void), prefs aplicadas:', prefs);
};
