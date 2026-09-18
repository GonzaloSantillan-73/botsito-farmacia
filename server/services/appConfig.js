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
