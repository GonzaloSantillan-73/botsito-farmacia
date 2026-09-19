import { supabase } from '../supabase.js';
import { enviarMensajeBot } from './bot.js';
import { INSTANCE_INFO } from '../instanceInfo.js';

const VALID_RATINGS = ['1', '2', '3', '4', '5'];

export const isValidRatingReply = (text) => {
  console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] isValidRatingReply() — text:', text);
  const resultado = VALID_RATINGS.includes((text || '').toString().trim());
  console.log('✅ [DEBUG-SERVICE-RATINGSURVEY] isValidRatingReply() — resultado:', resultado);
  return resultado;
};

const mensajeFinalizacion = (motivo) =>
  `Tu consulta ha finalizado${motivo ? ` ${motivo}` : ''}. ¡Gracias por contactarnos! Nos ayudaría mucho que calificaras la atención recibida respondiendo con un número del 1 (muy mala) al 5 (excelente).`;

const MENSAJE_PEDIR_RATING_PRODUCTO =
  '¡Gracias! Una última pregunta: ¿qué tan satisfecho/a estás con el producto que recibiste? Respondé con un número del 1 (nada satisfecho) al 5 (muy satisfecho).';

const MENSAJE_DESPEDIDA_ENCUESTA = '¡Gracias por tu calificación! Que tengas un buen día. 😊';

// Mismo criterio que sessionManager.js (TERMINAL_STATUSES), duplicado a
// propósito acá en vez de importado: sessionManager.js importa
// finalizarConversacion DESDE este archivo, así que importar en sentido
// contrario crearía un ciclo entre los dos módulos. Es una lista chica y
// estable (ya está duplicada igual en el frontend, ver Sidebar.jsx:
// ESTADOS_HISTORIAL), el costo de mantenerla en dos lugares es bajo.
const ESTADOS_TERMINALES = ['finalizada', 'resolved', 'rejected'];

// Cierra una consulta (por inactividad o manualmente) y le pide al cliente que
// califique la atención recibida del 1 al 5. Queda a la espera de esa
// respuesta vía bot_state; una vez respondida (ver guardarCalificacionAtencion)
// se encadena una segunda pregunta sobre el producto antes de dar la encuesta
// por terminada, guardando ambas valoraciones en columnas independientes.
//
// Hay TRES disparadores independientes que pueden llamar a esta función para
// la MISMA conversación casi al mismo tiempo: el checker de fondo por
// inactividad (sessionExpiryChecker.js), el chequeo que hace
// findOrCreateSession() apenas llega un mensaje nuevo del cliente
// (sessionManager.js), y el cierre manual desde el CRM (routes/api.js). Antes,
// los tres hacían un UPDATE incondicional y mandaban el mensaje de despedida
// sin fijarse si otro ya la había cerrado un instante antes — un típico race
// de "leer end vez de haber leido después de escribir" (TOCTOU) que terminaba
// mandando el aviso de cierre duplicado. Ahora el UPDATE es condicional
// (WHERE status NOT IN estados terminales): sólo transiciona, y sólo se manda
// el mensaje, si esta llamada es la que efectivamente saca a la conversación
// de un estado activo. Si ya la había cerrado otro disparador, el UPDATE no
// afecta ninguna fila y no se reenvía nada.
export const finalizarConversacion = async (conversationId, clientPhone, motivo = 'por inactividad') => {
  console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — conversationId:', conversationId, 'clientPhone:', clientPhone, 'motivo:', motivo);
  try {
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — UPDATE condicional conversations, filtros: { id:', conversationId, ', status NOT IN:', ESTADOS_TERMINALES, '}, valores:', { status: 'finalizada', bot_state: 'awaiting_rating' });
    const { data: filaActualizada, error: updateError } = await supabase
      .from('conversations')
      .update({ status: 'finalizada', bot_state: 'awaiting_rating' })
      .eq('id', conversationId)
      .not('status', 'in', `(${ESTADOS_TERMINALES.join(',')})`)
      .select('id')
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — resultado UPDATE condicional conversations — filaActualizada:', filaActualizada, 'error:', updateError);

    if (updateError) {
      console.error('❌ [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — error en el UPDATE condicional:', updateError);
      throw updateError;
    }

    if (!filaActualizada) {
      // Ya estaba en un estado terminal: otro disparador la cerró un instante
      // antes (o ya estaba cerrada por otro motivo). No se reenvía el mensaje.
      console.log('⚠️ [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — la conversación', conversationId, 'ya estaba en un estado terminal, se omite el mensaje de cierre (evita duplicado por carrera entre disparadores).');
      return;
    }

    if (clientPhone) {
      // instanceId/commit: si algún día vuelve a aparecer un mensaje de
      // cierre duplicado, comparar esta línea entre los dos envíos dice de
      // una si salieron del mismo proceso (bug acá) o de dos procesos
      // distintos corriendo contra la misma base (instancia fantasma) — ver
      // server/instanceInfo.js.
      console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] finalizarConversacion() — enviando mensaje de finalización a', clientPhone, '— instanceId:', INSTANCE_INFO.id, '— commit:', INSTANCE_INFO.commit);
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
// Se guarda en `rating` y, dependiendo del estado de venta (sale_status),
// se encadena la pregunta sobre el producto o se finaliza el flujo.
export const guardarCalificacionAtencion = async (conversationId, clientPhone, rating) => {
  console.log('🔍 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — conversationId:', conversationId, 'clientPhone:', clientPhone, 'rating:', rating);
  try {
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — SELECT conversations, filtros: { id:', conversationId, '}, columnas: sale_status');
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('sale_status')
      .eq('id', conversationId)
      .single();
    console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — resultado SELECT conversations — data:', conv, 'error:', convError);

    if (conv && conv.sale_status === 'concretada') {
      // Si la venta fue concretada, pedimos la calificación del producto
      console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — venta concretada, UPDATE conversations, filtros: { id:', conversationId, '}, valores:', { rating, bot_state: 'awaiting_product_rating' });
      const updateResp = await supabase
        .from('conversations')
        .update({ rating, bot_state: 'awaiting_product_rating' })
        .eq('id', conversationId);
      console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — resultado UPDATE conversations — data:', updateResp.data, 'error:', updateResp.error);

      await enviarMensajeBot(conversationId, clientPhone, MENSAJE_PEDIR_RATING_PRODUCTO);
    } else {
      // Si no hubo venta concretada, cerramos la encuesta agradeciendo por la atención
      console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — sin venta concretada, UPDATE conversations, filtros: { id:', conversationId, '}, valores:', { rating, bot_state: null });
      const updateResp = await supabase
        .from('conversations')
        .update({ rating, bot_state: null })
        .eq('id', conversationId);
      console.log('📡 [DEBUG-SERVICE-RATINGSURVEY] guardarCalificacionAtencion() — resultado UPDATE conversations — data:', updateResp.data, 'error:', updateResp.error);

      await enviarMensajeBot(conversationId, clientPhone, MENSAJE_DESPEDIDA_ENCUESTA);
    }

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
