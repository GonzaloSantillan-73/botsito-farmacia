import { supabase } from '../supabase.js';

const SESSION_TIMEOUT_KEY = 'session_timeout_ms';
const DEFAULT_SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hora, fallback si no hay config guardada

export const MIN_SESSION_TIMEOUT_MS = 60 * 1000; // 1 minuto
export const MAX_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 horas

export const getSessionTimeoutMs = async () => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SESSION_TIMEOUT_KEY)
    .maybeSingle();

  if (error) {
    console.error('[APP CONFIG] Error leyendo session_timeout_ms, se usa el default:', error);
    return DEFAULT_SESSION_TIMEOUT_MS;
  }

  const ms = Number(data?.value);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_SESSION_TIMEOUT_MS;
};

export const setSessionTimeoutMs = async (ms) => {
  if (!Number.isFinite(ms) || ms < MIN_SESSION_TIMEOUT_MS || ms > MAX_SESSION_TIMEOUT_MS) {
    throw new Error(`El tiempo de expiración debe estar entre ${MIN_SESSION_TIMEOUT_MS / 60000} y ${MAX_SESSION_TIMEOUT_MS / 60000} minutos.`);
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: SESSION_TIMEOUT_KEY, value: ms, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) throw error;
};

const BOT_KEYWORD_KEY = 'bot_reactivation_keyword';
const DEFAULT_BOT_KEYWORD = 'BOT';

export const getBotKeyword = async () => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', BOT_KEYWORD_KEY)
    .maybeSingle();

  if (error) {
    console.error('[APP CONFIG] Error leyendo bot_reactivation_keyword, se usa el default:', error);
    return DEFAULT_BOT_KEYWORD;
  }

  const keyword = typeof data?.value === 'string' ? data.value.trim() : '';
  return keyword || DEFAULT_BOT_KEYWORD;
};

export const setBotKeyword = async (keyword) => {
  const clean = (keyword ?? '').toString().trim();

  if (!clean) throw new Error('La palabra clave no puede estar vacía.');
  if (clean.length > 30) throw new Error('La palabra clave no puede tener más de 30 caracteres.');
  if (/\s/.test(clean)) throw new Error('La palabra clave no puede tener espacios.');

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: BOT_KEYWORD_KEY, value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) throw error;
};
