import { supabase } from '../supabase.js';
import { enviarMensajeBot } from './bot.js';

const VALID_RATINGS = ['1', '2', '3', '4', '5'];

export const isValidRatingReply = (text) => VALID_RATINGS.includes((text || '').toString().trim());

const mensajeFinalizacion = (motivo) =>
  `Tu consulta ha finalizado${motivo ? ` ${motivo}` : ''}. ¡Gracias por contactarnos! Nos ayudaría mucho que calificaras la atención recibida respondiendo con un número del 1 (muy mala) al 5 (excelente).`;

const MENSAJE_PEDIR_RATING_PRODUCTO =
  '¡Gracias! Una última pregunta: ¿qué tan satisfecho/a estás con el producto que recibiste? Respondé con un número del 1 (nada satisfecho) al 5 (muy satisfecho).';

const MENSAJE_DESPEDIDA_ENCUESTA = '¡Gracias por tu calificación! Que tengas un buen día. 😊';

// Cierra una consulta (por inactividad o manualmente) y le pide al cliente que
// califique la atención recibida del 1 al 5. Queda a la espera de esa
// respuesta vía bot_state; una vez respondida (ver guardarCalificacionAtencion)
// se encadena una segunda pregunta sobre el producto antes de dar la encuesta
// por terminada, guardando ambas valoraciones en columnas independientes.
export const finalizarConversacion = async (conversationId, clientPhone, motivo = 'por inactividad') => {
  await supabase
    .from('conversations')
    .update({ status: 'finalizada', bot_state: 'awaiting_rating' })
    .eq('id', conversationId);

  if (clientPhone) {
    await enviarMensajeBot(conversationId, clientPhone, mensajeFinalizacion(motivo));
  }
};

// Busca si el teléfono tiene una consulta recién finalizada esperando alguna
// de las dos respuestas de la encuesta (atención o producto).
export const getConversationAwaitingRating = async (clientPhone) => {
  const last10 = clientPhone.slice(-10);

  const { data } = await supabase
    .from('conversations')
    .select('id, client_phone, bot_state')
    .ilike('client_phone', `%${last10}%`)
    .eq('status', 'finalizada')
    .in('bot_state', ['awaiting_rating', 'awaiting_product_rating'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
};

// Primera respuesta de la encuesta: calificación de la atención recibida.
// Se guarda en `rating` y, dependiendo del estado de venta (sale_status),
// se encadena la pregunta sobre el producto o se finaliza el flujo.
export const guardarCalificacionAtencion = async (conversationId, clientPhone, rating) => {
  const { data: conv } = await supabase
    .from('conversations')
    .select('sale_status')
    .eq('id', conversationId)
    .single();

  if (conv && conv.sale_status === 'concretada') {
    // Si la venta fue concretada, pedimos la calificación del producto
    await supabase
      .from('conversations')
      .update({ rating, bot_state: 'awaiting_product_rating' })
      .eq('id', conversationId);

    await enviarMensajeBot(conversationId, clientPhone, MENSAJE_PEDIR_RATING_PRODUCTO);
  } else {
    // Si no hubo venta concretada, cerramos la encuesta agradeciendo por la atención
    await supabase
      .from('conversations')
      .update({ rating, bot_state: null })
      .eq('id', conversationId);

    await enviarMensajeBot(conversationId, clientPhone, MENSAJE_DESPEDIDA_ENCUESTA);
  }
};

// Segunda respuesta de la encuesta: satisfacción con el producto recibido.
// Se guarda en `product_rating`, independiente de la calificación de atención.
export const guardarCalificacionProducto = async (conversationId, clientPhone, productRating) => {
  await supabase
    .from('conversations')
    .update({ product_rating: productRating, bot_state: null })
    .eq('id', conversationId);

  await enviarMensajeBot(conversationId, clientPhone, MENSAJE_DESPEDIDA_ENCUESTA);
};

// El cliente escribió algo que no era un número del 1 al 5: se descarta la encuesta
// pendiente (sin bloquear que ese mismo mensaje arranque una consulta nueva).
export const descartarEncuestaPendiente = async (conversationId) => {
  await supabase.from('conversations').update({ bot_state: null }).eq('id', conversationId);
};
