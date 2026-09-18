import { supabase } from '../supabase.js';
import { enviarMensajeBot } from './bot.js';

const VALID_RATINGS = ['1', '2', '3', '4', '5'];

export const isValidRatingReply = (text) => {
  console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] isValidRatingReply() — text:', text);
  const resultado = VALID_RATINGS.includes((text || '').toString().trim());
  console.log('✅ [DEBUG-SERVICE-RATINGSURVEY] isValidRatingReply() — resultado:', resultado);
  return resultado;
};

// Escala visual que acompaña ambas preguntas de la encuesta (atención y
// producto), siempre con el mismo formato de extremos + números.
const ESCALA_1_A_5 = 'Mala 1-2-3-4-5 Buena';

const mensajeFinalizacion = (motivo) =>
  `Tu consulta ha finalizado${motivo ? ` ${motivo}` : ''}. ¡Gracias por contactarnos! Nos ayudaría mucho que calificaras la atención recibida respondiendo con un número del 1 al 5.\n${ESCALA_1_A_5}`;

const MENSAJE_PEDIR_RATING_PRODUCTO =
  `¡Gracias! Una última pregunta: ¿qué tan satisfecho/a estás con el producto que recibiste? Respondé con un número del 1 al 5.\n${ESCALA_1_A_5}`;

const MENSAJE_DESPEDIDA_ENCUESTA = '¡Gracias por tu calificación! Que tengas un buen día. 😊';

// Cierra una consulta (por inactividad o manualmente) y le pide al cliente que
// califique la atención recibida del 1 al 5. Queda a la espera de esa
// respuesta vía bot_state; una vez respondida (ver guardarCalificacionAtencion)
// se encadena una segunda pregunta sobre el producto antes de dar la encuesta
// por terminada, guardando ambas valoraciones en columnas independientes.
export const finalizarConversacion = async (conversationId, clientPhone, motivo = 'por inactividad') => {
  console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — conversationId:', conversationId, 'clientPhone:', clientPhone, 'motivo:', motivo);
  try {
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — UPDATE conversations, filtros: { id:', conversationId, '}, valores:', { status: 'finalizada', bot_state: 'awaiting_rating' });
    const updateResp = await supabase
      .from('conversations')
      .update({ status: 'finalizada', bot_state: 'awaiting_rating' })
      .eq('id', conversationId);
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — resultado UPDATE conversations — data:', updateResp.data, 'error:', updateResp.error);

    if (clientPhone) {
      console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — enviando mensaje de finalización a', clientPhone);
      await enviarMensajeBot(conversationId, clientPhone, mensajeFinalizacion(motivo));
    }

    console.log('✅ [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — finalizado sin valor de retorno explícito');
    return;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — error:', err?.message, err?.stack);
    throw err;
  }
};

// Busca si el teléfono tiene una consulta recién finalizada esperando alguna
// de las dos respuestas de la encuesta (atención o producto).
export const getConversationAwaitingRating = async (clientPhone) => {
  console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] getConversationAwaitingRating() — clientPhone:', clientPhone);
  try {
    const last10 = clientPhone.slice(-10);
    console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] getConversationAwaitingRating() — last10:', last10);

    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] getConversationAwaitingRating() — SELECT conversations, filtros: ilike client_phone %', last10, '%, status=finalizada, bot_state in [awaiting_rating, awaiting_product_rating], order created_at desc, limit 1');
    const { data, error } = await supabase
      .from('conversations')
      .select('id, client_phone, bot_state')
      .ilike('client_phone', `%${last10}%`)
      .eq('status', 'finalizada')
      .in('bot_state', ['awaiting_rating', 'awaiting_product_rating'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] getConversationAwaitingRating() — resultado SELECT conversations — data:', data, 'error:', error);

    const resultado = data || null;
    console.log('✅ [DEBUG-SERVICE-RATINGSURVEY] getConversationAwaitingRating() — resultado a devolver:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-RATINGSURVEY] getConversationAwaitingRating() — error:', err?.message, err?.stack);
    throw err;
  }
};

// Primera respuesta de la encuesta: calificación de la atención recibida.
// Se guarda en `rating` y SIEMPRE se encadena la segunda pregunta sobre el
// producto (antes se omitía si la venta no estaba marcada como "concretada",
// lo que cortaba la encuesta de golpe en cualquier cierre por inactividad
// sin venta registrada — ver guardarCalificacionProducto para el cierre real).
export const guardarCalificacionAtencion = async (conversationId, clientPhone, rating) => {
  console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — conversationId:', conversationId, 'clientPhone:', clientPhone, 'rating:', rating);
  try {
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — UPDATE conversations, filtros: { id:', conversationId, '}, valores:', { rating, bot_state: 'awaiting_product_rating' });
    const updateResp = await supabase
      .from('conversations')
      .update({ rating, bot_state: 'awaiting_product_rating' })
      .eq('id', conversationId);
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — resultado UPDATE conversations — data:', updateResp.data, 'error:', updateResp.error);

    await enviarMensajeBot(conversationId, clientPhone, MENSAJE_PEDIR_RATING_PRODUCTO);

    console.log('✅ [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — finalizado sin valor de retorno explícito');
    return;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — error:', err?.message, err?.stack);
    throw err;
  }
};

// Segunda respuesta de la encuesta: satisfacción con el producto recibido.
// Se guarda en `product_rating`, independiente de la calificación de atención.
export const guardarCalificacionProducto = async (conversationId, clientPhone, productRating) => {
  console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionProducto() — conversationId:', conversationId, 'clientPhone:', clientPhone, 'productRating:', productRating);
  try {
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionProducto() — UPDATE conversations, filtros: { id:', conversationId, '}, valores:', { product_rating: productRating, bot_state: null });
    const updateResp = await supabase
      .from('conversations')
      .update({ product_rating: productRating, bot_state: null })
      .eq('id', conversationId);
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionProducto() — resultado UPDATE conversations — data:', updateResp.data, 'error:', updateResp.error);

    await enviarMensajeBot(conversationId, clientPhone, MENSAJE_DESPEDIDA_ENCUESTA);

    console.log('✅ [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionProducto() — finalizado sin valor de retorno explícito');
    return;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionProducto() — error:', err?.message, err?.stack);
    throw err;
  }
};

// El cliente escribió algo que no era un número del 1 al 5: se descartan TODAS
// las encuestas pendientes de ese teléfono (sin bloquear que ese mismo mensaje
// arranque una consulta nueva). Antes sólo se descartaba la más reciente
// (la que devuelve getConversationAwaitingRating): si por lo que sea quedaba
// más de una consulta vieja con bot_state 'awaiting_rating'/'awaiting_product_rating'
// colgada (el cliente nunca llegó a calificarlas), la siguiente sin descartar
// podía "resucitar" y robarse una respuesta numérica que en realidad iba
// dirigida al menú de la consulta nueva (ej. responder "2" pensando en
// "2. Horarios y sucursales" y que en cambio se registre como calificación
// de una consulta finalizada de días atrás).
export const descartarEncuestaPendiente = async (clientPhone) => {
  console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] descartarEncuestaPendiente() — clientPhone:', clientPhone);
  try {
    const last10 = clientPhone.slice(-10);
    console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] descartarEncuestaPendiente() — last10:', last10);

    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] descartarEncuestaPendiente() — UPDATE conversations, filtros: ilike client_phone %', last10, '%, status=finalizada, bot_state in [awaiting_rating, awaiting_product_rating], valores:', { bot_state: null });
    const updateResp = await supabase
      .from('conversations')
      .update({ bot_state: null })
      .ilike('client_phone', `%${last10}%`)
      .eq('status', 'finalizada')
      .in('bot_state', ['awaiting_rating', 'awaiting_product_rating']);
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] descartarEncuestaPendiente() — resultado UPDATE conversations — data:', updateResp.data, 'error:', updateResp.error);

    console.log('✅ [DEBUG-SERVICE-RATINGSURVEY] descartarEncuestaPendiente() — finalizado sin valor de retorno explícito');
    return;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-RATINGSURVEY] descartarEncuestaPendiente() — error:', err?.message, err?.stack);
    throw err;
  }
};
