import { supabase } from '../supabase.js';
import { enviarMensajeBot } from './bot.js';
import { SESSION_TIMEOUT_MS, TERMINAL_STATUSES } from './sessionManager.js';

const MENSAJE_FINALIZACION = 'Tu consulta ha finalizado por inactividad. Si necesitas algo más, vuelve a escribirnos.';

// Cota máxima entre chequeos cuando no hay nada por vencer todavía (para detectar
// conversaciones nuevas creadas después del último chequeo).
const MAX_WAIT_MS = 30 * 1000;
// Cota mínima entre chequeos, para no generar un loop demasiado ajustado.
const MIN_WAIT_MS = 1000;

// Revisa las consultas activas, finaliza las que ya vencieron, y devuelve en cuántos
// ms hay que volver a chequear (exactamente cuando venza la próxima más cercana),
// en vez de depender de un intervalo fijo que puede llegar tarde.
export const checkExpiredSessions = async () => {
  const { data: activeConvs, error } = await supabase
    .from('conversations')
    .select('id, client_phone, status, created_at')
    .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`);

  if (error) {
    console.error('[SESSION EXPIRY] Error consultando consultas activas:', error);
    return MAX_WAIT_MS;
  }

  let proximoChequeoMs = MAX_WAIT_MS;

  for (const conv of activeConvs || []) {
    try {
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastActivity = lastMsg?.created_at || conv.created_at;
      const elapsedMs = Date.now() - new Date(lastActivity).getTime();
      const restanteMs = SESSION_TIMEOUT_MS - elapsedMs;

      if (restanteMs <= 0) {
        console.log(`[SESSION EXPIRY] Finalizando consulta ${conv.id} por inactividad (${Math.round(elapsedMs / 60000)} min sin actividad).`);

        await supabase.from('conversations').update({ status: 'finalizada' }).eq('id', conv.id);

        if (conv.client_phone) {
          await enviarMensajeBot(conv.id, conv.client_phone, MENSAJE_FINALIZACION);
        }
      } else {
        proximoChequeoMs = Math.min(proximoChequeoMs, restanteMs);
      }
    } catch (err) {
      // Una falla en una conversación (ej. error de la API de Meta) no debe frenar el chequeo del resto
      console.error(`[SESSION EXPIRY] Error procesando la conversación ${conv.id}:`, err.message || err);
    }
  }

  return Math.max(MIN_WAIT_MS, Math.min(MAX_WAIT_MS, proximoChequeoMs));
};

const programarProximoChequeo = () => {
  checkExpiredSessions()
    .catch(err => {
      console.error('[SESSION EXPIRY] Error en el ciclo de chequeo:', err);
      return MAX_WAIT_MS;
    })
    .then(delayMs => {
      setTimeout(programarProximoChequeo, delayMs);
    });
};

export const startSessionExpiryChecker = () => {
  console.log(`[SESSION EXPIRY] Checker adaptativo de expiración iniciado (chequea justo cuando vence la próxima consulta, máximo cada ${MAX_WAIT_MS / 1000}s).`);
  programarProximoChequeo();
};
