import { supabase } from '../supabase.js';
import { TERMINAL_STATUSES } from './sessionManager.js';
import { getSessionTimeoutMs } from './appConfig.js';
import { finalizarConversacion } from './ratingSurvey.js';

// Cota máxima entre chequeos cuando no hay nada por vencer todavía (para detectar
// conversaciones nuevas creadas después del último chequeo).
const MAX_WAIT_MS = 30 * 1000;
// Cota mínima entre chequeos, para no generar un loop demasiado ajustado.
const MIN_WAIT_MS = 1000;

// Revisa las consultas activas, finaliza las que ya vencieron, y devuelve en cuántos
// ms hay que volver a chequear (exactamente cuando venza la próxima más cercana),
// en vez de depender de un intervalo fijo que puede llegar tarde.
export const checkExpiredSessions = async () => {
  const timestampInicio = new Date().toISOString();
  console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — corrida iniciada en:', timestampInicio);
  try {
    console.log('📡 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — SELECT conversations, filtros: status NOT IN (', TERMINAL_STATUSES.join(','), ')');
    const [{ data: activeConvs, error }, sessionTimeoutMs] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, client_phone, status, created_at')
        .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`),
      getSessionTimeoutMs()
    ]);
    console.log('📡 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — resultado SELECT conversations — cantidad de conversaciones activas evaluadas:', activeConvs?.length, 'error:', error, '— sessionTimeoutMs:', sessionTimeoutMs);

    if (error) {
      console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — error consultando conversaciones activas:', error);
      console.error('[SESSION EXPIRY] Error consultando consultas activas:', error);
      console.log('✅ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — resultado a devolver (por error):', MAX_WAIT_MS);
      return MAX_WAIT_MS;
    }

    let proximoChequeoMs = MAX_WAIT_MS;
    const cerradasPorExpiracion = [];

    console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — evaluando', (activeConvs || []).length, 'conversaciones activas');

    for (const conv of activeConvs || []) {
      try {
        console.log('📡 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — SELECT messages, filtros: { conversation_id:', conv.id, ' }, order created_at desc, limit 1');
        const { data: lastMsg, error: lastMsgError } = await supabase
          .from('messages')
          .select('created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        console.log('📡 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — resultado SELECT messages — data:', lastMsg, 'error:', lastMsgError);

        const lastActivity = lastMsg?.created_at || conv.created_at;
        const elapsedMs = Date.now() - new Date(lastActivity).getTime();
        const restanteMs = sessionTimeoutMs - elapsedMs;
        console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — conversationId:', conv.id, 'lastActivity:', lastActivity, 'elapsedMs:', elapsedMs, 'restanteMs:', restanteMs);

        if (restanteMs <= 0) {
          console.log(`⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — CIERRE POR EXPIRACIÓN — conversationId: ${conv.id}, minutos sin actividad: ${Math.round(elapsedMs / 60000)}`);
          console.log(`[SESSION EXPIRY] Finalizando consulta ${conv.id} por inactividad (${Math.round(elapsedMs / 60000)} min sin actividad).`);
          await finalizarConversacion(conv.id, conv.client_phone, 'por inactividad');
          cerradasPorExpiracion.push(conv.id);
        } else {
          proximoChequeoMs = Math.min(proximoChequeoMs, restanteMs);
        }
      } catch (err) {
        // Una falla acá en una conversación (ej. error de la API de Meta) no debe frenar el chequeo del resto
        console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — error procesando conversación', conv.id, ':', err?.message, err?.stack);
        console.error(`[SESSION EXPIRY] Error procesando la conversación ${conv.id}:`, err.message || err);
      }
    }

    console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — conversaciones cerradas por expiración en esta corrida:', cerradasPorExpiracion);

    const resultado = Math.max(MIN_WAIT_MS, Math.min(MAX_WAIT_MS, proximoChequeoMs));
    console.log('✅ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — resultado a devolver (ms hasta el próximo chequeo):', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — error inesperado:', err?.message, err?.stack);
    throw err;
  }
};

const programarProximoChequeo = () => {
  console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] programarProximoChequeo() — invocado en:', new Date().toISOString());
  checkExpiredSessions()
    .catch(err => {
      console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] programarProximoChequeo() — error en el ciclo de chequeo:', err?.message, err?.stack);
      console.error('[SESSION EXPIRY] Error en el ciclo de chequeo:', err);
      return MAX_WAIT_MS;
    })
    .then(delayMs => {
      console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] programarProximoChequeo() — próximo chequeo programado en', delayMs, 'ms');
      setTimeout(programarProximoChequeo, delayMs);
    });
};

export const startSessionExpiryChecker = () => {
  console.log('🔍 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] startSessionExpiryChecker() — iniciando checker');
  console.log(`[SESSION EXPIRY] Checker adaptativo de expiración iniciado (chequea justo cuando vence la próxima consulta, máximo cada ${MAX_WAIT_MS / 1000}s).`);
  programarProximoChequeo();
  console.log('✅ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] startSessionExpiryChecker() — checker iniciado, sin valor de retorno');
};
