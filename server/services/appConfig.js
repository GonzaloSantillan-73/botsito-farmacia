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
