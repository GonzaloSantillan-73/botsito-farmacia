import { supabase } from '../supabase.js';
import { enviarMensajeBot } from './bot.js';

const VALID_RATINGS = ['1', '2', '3', '4', '5'];

export const isValidRatingReply = (text) => VALID_RATINGS.includes((text || '').toString().trim());

const mensajeFinalizacion = (motivo) =>
  `Tu consulta ha finalizado${motivo ? ` ${motivo}` : ''}. ¡Gracias por contactarnos! Nos ayudaría mucho que calificaras la atención recibida respondiendo con un número del 1 (muy mala) al 5 (excelente).`;

// Cierra una consulta (por inactividad o manualmente) y le pide al cliente que la
// califique del 1 al 5. Queda a la espera de esa respuesta vía bot_state.
export const finalizarConversacion = async (conversationId, clientPhone, motivo = 'por inactividad') => {
  await supabase
    .from('conversations')
    .update({ status: 'finalizada', bot_state: 'awaiting_rating' })
    .eq('id', conversationId);

  if (clientPhone) {
    await enviarMensajeBot(conversationId, clientPhone, mensajeFinalizacion(motivo));
  }
};

// Busca si el teléfono tiene una consulta recién finalizada esperando una calificación.
export const getConversationAwaitingRating = async (clientPhone) => {
  const last10 = clientPhone.slice(-10);

  const { data } = await supabase
    .from('conversations')
    .select('id, client_phone')
    .ilike('client_phone', `%${last10}%`)
    .eq('status', 'finalizada')
    .eq('bot_state', 'awaiting_rating')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
};

export const guardarCalificacion = async (conversationId, clientPhone, rating) => {
  await supabase
    .from('conversations')
    .update({ rating, bot_state: null })
    .eq('id', conversationId);

  await enviarMensajeBot(conversationId, clientPhone, '¡Gracias por tu calificación! Que tengas un buen día. 😊');
};

// El cliente escribió algo que no era un número del 1 al 5: se descarta la encuesta
// pendiente (sin bloquear que ese mismo mensaje arranque una consulta nueva).
export const descartarEncuestaPendiente = async (conversationId) => {
  await supabase.from('conversations').update({ bot_state: null }).eq('id', conversationId);
};
