import { supabase } from '../supabase.js';

const SESSION_TIMEOUT_KEY = 'session_timeout_ms';
const DEFAULT_SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hora, fallback si no hay config guardada

export const MIN_SESSION_TIMEOUT_MS = 60 * 1000; // 1 minuto
export const MAX_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 horas

export const getSessionTimeoutMs = async () => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] getSessionTimeoutMs() — sin parámetros');

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: select, filtro: key =', SESSION_TIMEOUT_KEY);
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SESSION_TIMEOUT_KEY)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (select session_timeout_ms) — data:', data, 'error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] getSessionTimeoutMs() — error leyendo session_timeout_ms, se usa el default:', error);
    console.error('[APP CONFIG] Error leyendo session_timeout_ms, se usa el default:', error);
    console.log('✅ [DEBUG-SERVICE-APPCONFIG] getSessionTimeoutMs() — valor de retorno (default por error):', DEFAULT_SESSION_TIMEOUT_MS);
    return DEFAULT_SESSION_TIMEOUT_MS;
  }

  const ms = Number(data?.value);
  const resultado = Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_SESSION_TIMEOUT_MS;
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] getSessionTimeoutMs() — valor de retorno:', resultado);
  return resultado;
};

export const setSessionTimeoutMs = async (ms) => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] setSessionTimeoutMs() — parámetros recibidos:', { ms });

  if (!Number.isFinite(ms) || ms < MIN_SESSION_TIMEOUT_MS || ms > MAX_SESSION_TIMEOUT_MS) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setSessionTimeoutMs() — valor fuera de rango:', ms);
    throw new Error(`El tiempo de expiración debe estar entre ${MIN_SESSION_TIMEOUT_MS / 60000} y ${MAX_SESSION_TIMEOUT_MS / 60000} minutos.`);
  }

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: upsert, valores:', { key: SESSION_TIMEOUT_KEY, value: ms });
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: SESSION_TIMEOUT_KEY, value: ms, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (upsert session_timeout_ms) — error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setSessionTimeoutMs() — error guardando session_timeout_ms:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] setSessionTimeoutMs() — completado sin valor de retorno (undefined)');
};

const SESSION_PREWARNING_KEY = 'session_prewarning_ms';
const DEFAULT_SESSION_PREWARNING_MS = 0; // 0 = deshabilitado (no se manda ningún aviso previo)

// Cuánto tiempo antes del cierre por inactividad se manda el aviso
// preventivo "¿Seguís ahí?" (ver sessionExpiryChecker.js). 0 lo deshabilita.
export const getSessionPrewarningMs = async () => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] getSessionPrewarningMs() — sin parámetros');

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: select, filtro: key =', SESSION_PREWARNING_KEY);
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SESSION_PREWARNING_KEY)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (select session_prewarning_ms) — data:', data, 'error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] getSessionPrewarningMs() — error leyendo session_prewarning_ms, se usa el default:', error);
    console.error('[APP CONFIG] Error leyendo session_prewarning_ms, se usa el default:', error);
    console.log('✅ [DEBUG-SERVICE-APPCONFIG] getSessionPrewarningMs() — valor de retorno (default por error):', DEFAULT_SESSION_PREWARNING_MS);
    return DEFAULT_SESSION_PREWARNING_MS;
  }

  const ms = Number(data?.value);
  const resultado = Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_SESSION_PREWARNING_MS;
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] getSessionPrewarningMs() — valor de retorno:', resultado);
  return resultado;
};

export const setSessionPrewarningMs = async (ms) => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] setSessionPrewarningMs() — parámetros recibidos:', { ms });

  if (!Number.isFinite(ms) || ms < 0) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setSessionPrewarningMs() — valor inválido:', ms);
    throw new Error('El aviso previo debe ser 0 (deshabilitado) o un número de milisegundos mayor a 0.');
  }

  if (ms > 0) {
    const sessionTimeoutMs = await getSessionTimeoutMs();
    if (ms >= sessionTimeoutMs) {
      console.error('❌ [DEBUG-SERVICE-APPCONFIG] setSessionPrewarningMs() — el aviso previo debe ser menor al tiempo total:', { ms, sessionTimeoutMs });
      throw new Error('El aviso previo debe ser menor al tiempo total de inactividad configurado.');
    }
  }

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: upsert, valores:', { key: SESSION_PREWARNING_KEY, value: ms });
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: SESSION_PREWARNING_KEY, value: ms, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (upsert session_prewarning_ms) — error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setSessionPrewarningMs() — error guardando session_prewarning_ms:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] setSessionPrewarningMs() — completado sin valor de retorno (undefined)');
};

// Cierre automático cuando el que espera es el cliente (pidió un asesor y la
// farmacia no le respondió: en espera, tomada sin respuesta, o la sucursal
// dejó de contestar). Se cuenta desde el último mensaje del cliente, y el
// máximo es 23 h porque Meta sólo deja escribirle dentro de las 24 h
// siguientes a ese mensaje (la encuesta de cierre tiene que salir antes).
const ESPERA_RESPUESTA_KEY = 'espera_respuesta_ms';
const DEFAULT_ESPERA_RESPUESTA_MS = 12 * 60 * 60 * 1000;
export const MIN_ESPERA_RESPUESTA_MS = 60 * 1000; // 1 minuto (útil para probar)
export const MAX_ESPERA_RESPUESTA_MS = 23 * 60 * 60 * 1000; // 23 horas

export const getEsperaRespuestaMs = async () => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', ESPERA_RESPUESTA_KEY)
    .maybeSingle();

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] getEsperaRespuestaMs() — error leyendo espera_respuesta_ms, se usa el default:', error);
    return DEFAULT_ESPERA_RESPUESTA_MS;
  }

  const ms = Number(data?.value);
  return Number.isFinite(ms) && ms >= MIN_ESPERA_RESPUESTA_MS && ms <= MAX_ESPERA_RESPUESTA_MS ? ms : DEFAULT_ESPERA_RESPUESTA_MS;
};

export const setEsperaRespuestaMs = async (ms) => {
  if (!Number.isFinite(ms) || ms < MIN_ESPERA_RESPUESTA_MS || ms > MAX_ESPERA_RESPUESTA_MS) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setEsperaRespuestaMs() — valor fuera de rango:', ms);
    throw new Error(`El cierre por falta de respuesta debe estar entre ${MIN_ESPERA_RESPUESTA_MS / 60000} minuto y ${MAX_ESPERA_RESPUESTA_MS / 3600000} horas.`);
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: ESPERA_RESPUESTA_KEY, value: ms, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setEsperaRespuestaMs() — error guardando espera_respuesta_ms:', error);
    throw error;
  }
};

// Número de prueba: un teléfono (el del administrador) que usa sus propios
// tiempos de cierre, más cortos, para poder probar el bot sin bajar los
// tiempos de todos los clientes reales. Se guarda como un solo objeto JSON:
// { activo, telefono, sessionTimeoutMs, sessionPrewarningMs, esperaRespuestaMs }.
const MODO_PRUEBA_KEY = 'modo_prueba';
const MODO_PRUEBA_DEFAULT = {
  activo: false,
  telefono: '',
  sessionTimeoutMs: 2 * 60 * 1000,
  sessionPrewarningMs: 60 * 1000,
  esperaRespuestaMs: 3 * 60 * 1000
};

// Últimos 10 dígitos: el mismo número llega como 549..., 54... o con
// espacios/guiones según de dónde venga (mismo criterio que findOrCreateSession).
const ultimos10Digitos = (telefono) => String(telefono || '').replace(/\D/g, '').slice(-10);

export const getModoPrueba = async () => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', MODO_PRUEBA_KEY)
    .maybeSingle();
  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] getModoPrueba() — error leyendo modo_prueba, queda desactivado:', error);
    return { ...MODO_PRUEBA_DEFAULT };
  }
  return { ...MODO_PRUEBA_DEFAULT, ...(data?.value && typeof data.value === 'object' ? data.value : {}) };
};

export const setModoPrueba = async (cfg) => {
  const modo = {
    activo: !!cfg?.activo,
    telefono: String(cfg?.telefono || '').trim(),
    sessionTimeoutMs: Number(cfg?.sessionTimeoutMs),
    sessionPrewarningMs: Number(cfg?.sessionPrewarningMs) || 0,
    esperaRespuestaMs: Number(cfg?.esperaRespuestaMs)
  };
  if (modo.activo && ultimos10Digitos(modo.telefono).length < 10) {
    throw new Error('Ingresá el número de prueba completo, con código de área (por ejemplo: 3834123456).');
  }
  if (!Number.isFinite(modo.sessionTimeoutMs) || modo.sessionTimeoutMs < MIN_SESSION_TIMEOUT_MS || modo.sessionTimeoutMs > MAX_SESSION_TIMEOUT_MS) {
    throw new Error(`El tiempo de inactividad de prueba debe estar entre ${MIN_SESSION_TIMEOUT_MS / 60000} y ${MAX_SESSION_TIMEOUT_MS / 60000} minutos.`);
  }
  if (modo.sessionPrewarningMs < 0 || (modo.sessionPrewarningMs > 0 && modo.sessionPrewarningMs >= modo.sessionTimeoutMs)) {
    throw new Error('El aviso "¿Seguís ahí?" de prueba debe ser menor al tiempo de inactividad de prueba.');
  }
  if (!Number.isFinite(modo.esperaRespuestaMs) || modo.esperaRespuestaMs < MIN_ESPERA_RESPUESTA_MS || modo.esperaRespuestaMs > MAX_ESPERA_RESPUESTA_MS) {
    throw new Error('El cierre por falta de respuesta de prueba debe ser de 1 minuto a 23 horas.');
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: MODO_PRUEBA_KEY, value: modo, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setModoPrueba() — error guardando modo_prueba:', error);
    throw error;
  }
  return modo;
};

// Tiempos de cierre que corresponden a un teléfono: los del número de prueba
// si está activo y coincide, o los generales.
export const tiemposDeCierrePara = (telefono, generales, modoPrueba) => {
  const esPrueba = !!modoPrueba?.activo
    && ultimos10Digitos(modoPrueba.telefono).length === 10
    && ultimos10Digitos(modoPrueba.telefono) === ultimos10Digitos(telefono);
  if (!esPrueba) return generales;
  return {
    sessionTimeoutMs: modoPrueba.sessionTimeoutMs,
    sessionPrewarningMs: modoPrueba.sessionPrewarningMs,
    esperaRespuestaMs: modoPrueba.esperaRespuestaMs
  };
};

const BOT_KEYWORD_KEY = 'bot_reactivation_keyword';
const DEFAULT_BOT_KEYWORD = 'BOT';

export const getBotKeyword = async () => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] getBotKeyword() — sin parámetros');

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: select, filtro: key =', BOT_KEYWORD_KEY);
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', BOT_KEYWORD_KEY)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (select bot_reactivation_keyword) — data:', data, 'error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] getBotKeyword() — error leyendo bot_reactivation_keyword, se usa el default:', error);
    console.error('[APP CONFIG] Error leyendo bot_reactivation_keyword, se usa el default:', error);
    console.log('✅ [DEBUG-SERVICE-APPCONFIG] getBotKeyword() — valor de retorno (default por error):', DEFAULT_BOT_KEYWORD);
    return DEFAULT_BOT_KEYWORD;
  }

  const keyword = typeof data?.value === 'string' ? data.value.trim() : '';
  const resultado = keyword || DEFAULT_BOT_KEYWORD;
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] getBotKeyword() — valor de retorno:', resultado);
  return resultado;
};

export const setBotKeyword = async (keyword) => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] setBotKeyword() — parámetros recibidos:', { keyword });

  const clean = (keyword ?? '').toString().trim();

  if (!clean) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setBotKeyword() — palabra clave vacía');
    throw new Error('La palabra clave no puede estar vacía.');
  }
  if (clean.length > 30) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setBotKeyword() — palabra clave demasiado larga:', clean.length);
    throw new Error('La palabra clave no puede tener más de 30 caracteres.');
  }
  if (/\s/.test(clean)) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setBotKeyword() — palabra clave con espacios:', clean);
    throw new Error('La palabra clave no puede tener espacios.');
  }

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: upsert, valores:', { key: BOT_KEYWORD_KEY, value: clean });
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: BOT_KEYWORD_KEY, value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (upsert bot_reactivation_keyword) — error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setBotKeyword() — error guardando bot_reactivation_keyword:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] setBotKeyword() — completado sin valor de retorno (undefined)');
};

const WELCOME_MESSAGE_KEY = 'welcome_message';
export const DEFAULT_WELCOME_MESSAGE = '¡Hola! Soy el bot de la Farmacia. 💊';

export const getWelcomeMessage = async () => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] getWelcomeMessage() — sin parámetros');

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: select, filtro: key =', WELCOME_MESSAGE_KEY);
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', WELCOME_MESSAGE_KEY)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (select welcome_message) — data:', data, 'error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] getWelcomeMessage() — error leyendo welcome_message, se usa el default:', error);
    console.error('[APP CONFIG] Error leyendo welcome_message, se usa el default:', error);
    console.log('✅ [DEBUG-SERVICE-APPCONFIG] getWelcomeMessage() — valor de retorno (default por error):', DEFAULT_WELCOME_MESSAGE);
    return DEFAULT_WELCOME_MESSAGE;
  }

  const mensaje = typeof data?.value === 'string' ? data.value.trim() : '';
  const resultado = mensaje || DEFAULT_WELCOME_MESSAGE;
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] getWelcomeMessage() — valor de retorno:', resultado);
  return resultado;
};

export const setWelcomeMessage = async (mensaje) => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] setWelcomeMessage() — parámetros recibidos:', { mensaje });

  const clean = (mensaje ?? '').toString().trim();

  if (!clean) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setWelcomeMessage() — mensaje vacío');
    throw new Error('El mensaje de bienvenida no puede estar vacío.');
  }
  if (clean.length > 500) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setWelcomeMessage() — mensaje demasiado largo:', clean.length);
    throw new Error('El mensaje de bienvenida no puede tener más de 500 caracteres.');
  }

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: upsert, valores:', { key: WELCOME_MESSAGE_KEY, value: clean });
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: WELCOME_MESSAGE_KEY, value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (upsert welcome_message) — error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setWelcomeMessage() — error guardando welcome_message:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] setWelcomeMessage() — completado sin valor de retorno (undefined)');
};

const FREQUENT_CLIENT_MESSAGE_KEY = 'frequent_client_message';
export const DEFAULT_FREQUENT_CLIENT_MESSAGE = '¡Hola! Nos alegra verte de nuevo por acá. 😊';

const FREQUENT_CLIENT_THRESHOLD_KEY = 'frequent_client_threshold';
export const DEFAULT_FREQUENT_CLIENT_THRESHOLD = 3;
export const MIN_FREQUENT_CLIENT_THRESHOLD = 1;
export const MAX_FREQUENT_CLIENT_THRESHOLD = 1000;

// Saludo alternativo que reemplaza a welcome_message (el menú fijo de abajo
// se sigue agregando igual, ver construirMensajeBienvenida en bot.js) cuando
// el cliente ya usó el bot frequent_client_threshold veces o más antes de
// esta sesión (ver clientes.interacciones_bot / procesarMensajeBot).
export const getFrequentClientMessage = async () => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] getFrequentClientMessage() — sin parámetros');

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: select, filtro: key =', FREQUENT_CLIENT_MESSAGE_KEY);
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', FREQUENT_CLIENT_MESSAGE_KEY)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (select frequent_client_message) — data:', data, 'error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] getFrequentClientMessage() — error leyendo frequent_client_message, se usa el default:', error);
    console.log('✅ [DEBUG-SERVICE-APPCONFIG] getFrequentClientMessage() — valor de retorno (default por error):', DEFAULT_FREQUENT_CLIENT_MESSAGE);
    return DEFAULT_FREQUENT_CLIENT_MESSAGE;
  }

  const mensaje = typeof data?.value === 'string' ? data.value.trim() : '';
  const resultado = mensaje || DEFAULT_FREQUENT_CLIENT_MESSAGE;
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] getFrequentClientMessage() — valor de retorno:', resultado);
  return resultado;
};

export const setFrequentClientMessage = async (mensaje) => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] setFrequentClientMessage() — parámetros recibidos:', { mensaje });

  const clean = (mensaje ?? '').toString().trim();

  if (!clean) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setFrequentClientMessage() — mensaje vacío');
    throw new Error('El mensaje para clientes frecuentes no puede estar vacío.');
  }
  if (clean.length > 500) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setFrequentClientMessage() — mensaje demasiado largo:', clean.length);
    throw new Error('El mensaje para clientes frecuentes no puede tener más de 500 caracteres.');
  }

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: upsert, valores:', { key: FREQUENT_CLIENT_MESSAGE_KEY, value: clean });
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: FREQUENT_CLIENT_MESSAGE_KEY, value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (upsert frequent_client_message) — error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setFrequentClientMessage() — error guardando frequent_client_message:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] setFrequentClientMessage() — completado sin valor de retorno (undefined)');
};

// Cantidad de sesiones previas con el bot (clientes.interacciones_bot) a
// partir de la cual un cliente se considera "frecuente" y recibe
// frequent_client_message en vez del saludo normal.
export const getFrequentClientThreshold = async () => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] getFrequentClientThreshold() — sin parámetros');

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: select, filtro: key =', FREQUENT_CLIENT_THRESHOLD_KEY);
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', FREQUENT_CLIENT_THRESHOLD_KEY)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (select frequent_client_threshold) — data:', data, 'error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] getFrequentClientThreshold() — error leyendo frequent_client_threshold, se usa el default:', error);
    console.log('✅ [DEBUG-SERVICE-APPCONFIG] getFrequentClientThreshold() — valor de retorno (default por error):', DEFAULT_FREQUENT_CLIENT_THRESHOLD);
    return DEFAULT_FREQUENT_CLIENT_THRESHOLD;
  }

  const n = Number(data?.value);
  const resultado = Number.isInteger(n) && n >= MIN_FREQUENT_CLIENT_THRESHOLD ? n : DEFAULT_FREQUENT_CLIENT_THRESHOLD;
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] getFrequentClientThreshold() — valor de retorno:', resultado);
  return resultado;
};

export const setFrequentClientThreshold = async (umbral) => {
  console.log('🔍 [DEBUG-SERVICE-APPCONFIG] setFrequentClientThreshold() — parámetros recibidos:', { umbral });

  const n = Number(umbral);
  if (!Number.isInteger(n) || n < MIN_FREQUENT_CLIENT_THRESHOLD || n > MAX_FREQUENT_CLIENT_THRESHOLD) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setFrequentClientThreshold() — valor fuera de rango:', umbral);
    throw new Error(`El umbral debe ser un número entero entre ${MIN_FREQUENT_CLIENT_THRESHOLD} y ${MAX_FREQUENT_CLIENT_THRESHOLD}.`);
  }

  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Query Supabase → tabla: app_settings, operación: upsert, valores:', { key: FREQUENT_CLIENT_THRESHOLD_KEY, value: n });
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: FREQUENT_CLIENT_THRESHOLD_KEY, value: n, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  console.log('📡 [DEBUG-SERVICE-APPCONFIG] Resultado query app_settings (upsert frequent_client_threshold) — error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-APPCONFIG] setFrequentClientThreshold() — error guardando frequent_client_threshold:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-APPCONFIG] setFrequentClientThreshold() — completado sin valor de retorno (undefined)');
};
