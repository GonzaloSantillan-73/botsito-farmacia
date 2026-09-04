import { supabase } from '../supabase.js';
import { enviarMensajeBot } from './bot.js';
import { SESSION_TIMEOUT_MS, TERMINAL_STATUSES } from './sessionManager.js';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // revisa cada 5 minutos
const MENSAJE_FINALIZACION = 'Tu consulta ha finalizado por inactividad. Si necesitas algo más, vuelve a escribirnos.';

export const checkExpiredSessions = async () => {
  const { data: activeConvs, error } = await supabase
    .from('conversations')
    .select('id, client_phone, status, created_at')
    .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`);

  if (error) {
    console.error('[SESSION EXPIRY] Error consultando consultas activas:', error);
    return;
  }

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

      if (elapsedMs > SESSION_TIMEOUT_MS) {
        console.log(`[SESSION EXPIRY] Finalizando consulta ${conv.id} por inactividad (${Math.round(elapsedMs / 60000)} min sin actividad).`);

        await supabase.from('conversations').update({ status: 'finalizada' }).eq('id', conv.id);

        if (conv.client_phone) {
          await enviarMensajeBot(conv.id, conv.client_phone, MENSAJE_FINALIZACION);
        }
      }
    } catch (err) {
      // Una falla en una conversación (ej. error de la API de Meta) no debe frenar el chequeo del resto
      console.error(`[SESSION EXPIRY] Error procesando la conversación ${conv.id}:`, err.message || err);
    }
  }
};

export const startSessionExpiryChecker = () => {
  console.log(`[SESSION EXPIRY] Checker de expiración de consultas iniciado (cada ${CHECK_INTERVAL_MS / 60000} min).`);
  setInterval(() => {
    checkExpiredSessions().catch(err => console.error('[SESSION EXPIRY] Error en el ciclo de chequeo:', err));
  }, CHECK_INTERVAL_MS);
};
