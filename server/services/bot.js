import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { getBotSchedule, isWithinSchedule, renderScheduleMessage } from './scheduleConfig.js';
import { getCliente, tieneRegistroCompleto, guardarDatoCliente, incrementarInteraccionesBot } from './clientes.js';

// Desde el 2026-11-11 el bot ya no tiene menú ni pide la ubicación (el
// proceso era demasiado largo y los clientes lo abandonaban). Lo único que
// hace es:
//  - Avisar el horario si el cliente escribe fuera del horario configurado.
//  - Pedir el nombre la primera vez que escribe un cliente.
// Todo lo demás pasa directo a la cola de "En espera" (ver derivarAEspera),
// sin mandarle ningún mensaje al cliente: el primero que recibe es el de la
// sucursal que toma la consulta.

// Los botones de mensajes viejos (menú anterior, encuesta) quedan "usados"
// una vez respondidos: si el cliente los vuelve a tocar, el webhook los
// ignora sin responder (ver botonesVigentes en webhook.js), así no se pagan
// mensajes por toques repetidos. Lo usa la encuesta (ratingSurvey.js).
export const marcarBotonesUsados = async (conversationId) => {
  const { error } = await supabase.from('messages')
    .update({ botones_usado: true })
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'bot')
    .eq('botones_usado', false)
    .not('botones', 'is', null);
  if (error) console.warn('⚠️ [DEBUG-SERVICE-BOT] marcarBotonesUsados() — no se pudieron marcar (¿falta supabase/messages_botones.sql?):', error.message);
};

// Registro de datos personales: se le pide al cliente la primera vez que
// escribe. Sólo se pide el nombre: el DNI y la obra social los carga la
// sucursal a mano en "Datos del Cliente" si el cliente los da en la charla.
const MENSAJE_ERROR_REGISTRO = 'Tuvimos un problema guardando tus datos.\n\nPor favor, intentá de nuevo en un momento.';

// Primer contacto de un cliente nuevo: el bot espera ESPERA_PEDIDO_NOMBRE_MS
// antes de pedir el nombre (bot_state 'registro_espera'). Muchos clientes
// mandan "Hola" y enseguida su consulta: si el nombre se pedía al instante,
// esa consulta (que ya venía en camino) se guardaba como nombre. Lo que llegue
// durante la espera queda en el chat pero no se toma como nombre.
const ESPERA_PEDIDO_NOMBRE_MS = 40 * 1000;
const MENSAJE_PRIMER_CONTACTO = '¡Hola! Soy el bot de Mi Farma. 💊\n\n¡Qué bueno que nos escribas! 🙌\nPara conocerte, escribí tu *nombre y apellido*. Por ejemplo: _Juan Pérez_.\n\nSolo te lo vamos a pedir esta primera vez.';
const MENSAJE_NO_ES_NOMBRE = 'Eso no parece un nombre 😅\n\nPor ahora solo necesito tu nombre y apellido (por ejemplo: Juan Pérez). Apenas lo tenga, te ayudamos con tu consulta.';
// Después de tantas respuestas que no parecen un nombre, se pasa a la cola sin
// guardarlo (para no dejar al cliente trabado): se le vuelve a pedir en la
// próxima consulta.
const MAX_INTENTOS_NOMBRE = 3;

// "Hola, soy Juan Pérez." -> "Juan Pérez": saca saludos y "soy / me llamo /
// mi nombre es" del principio, y la puntuación del final.
const normalizarNombre = (t) => (t || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/^(?:(?:buen[oa]?s?\s+(?:d[ií]as?|tardes?|noches?)|hola|buenas)[\s,!.]*)+/i, '')
  .replace(/^(?:soy|me llamo|mi nombre es)\s+/i, '')
  .replace(/[\s.,!]+$/, '')
  .trim();

// Palabras que aparecen en consultas, nunca en un nombre (sin acentos).
const PALABRAS_NO_NOMBRE = new Set([
  'precio', 'precios', 'tienen', 'tenes', 'tiene', 'tengo', 'hay', 'quiero', 'queria', 'quisiera',
  'necesito', 'necesitaba', 'consulta', 'consultar', 'consulto', 'cuanto', 'cuanta', 'sale', 'salen',
  'cuesta', 'cuestan', 'vale', 'valen', 'receta', 'recetas', 'pastilla', 'pastillas', 'remedio',
  'remedios', 'medicamento', 'medicamentos', 'envio', 'envios', 'envian', 'delivery', 'stock',
  'favor', 'gracias', 'horario', 'horarios', 'abierto', 'abierta', 'abren', 'cierran', 'comprar',
  'compra', 'venden', 'vende', 'farmacia', 'disculpa', 'disculpe', 'perdon', 'hola', 'buenas',
  'buenos', 'buen', 'dia', 'dias', 'tardes', 'noches', 'info', 'informacion', 'ayuda', 'ayudame',
  'quien', 'que', 'como', 'donde', 'cuando', 'para', 'por'
]);

// Sólo letras (con acentos/ñ), separadas por espacios, apóstrofes o guiones
// (ej. "María de los Ángeles", "O'Connor", "Ana-Lía"). Se acepta un solo
// nombre: muchos clientes responden sólo con el nombre de pila.
const NOMBRE_REGISTRO_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[\s'-]+[A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;

const pareceNombre = (nombre) => {
  if (nombre.length < 3 || nombre.length > 50) return false;
  if (!NOMBRE_REGISTRO_REGEX.test(nombre)) return false;
  const palabras = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[\s'-]+/);
  if (palabras.length > 6) return false;
  return !palabras.some(p => PALABRAS_NO_NOMBRE.has(p));
};

// Todos los cambios de estado de la conversación pasan por acá, logueando
// siempre el error si el UPDATE falla (ej. una columna que todavía no existe
// porque falta correr una migración, o una RLS que lo bloquea), para que la
// conversación no quede pegada en el estado viejo sin que nada lo avise.
const actualizarEstadoConversacion = async (conversationId, updates) => {
  console.log('📡 [DEBUG-SERVICE-BOT] actualizarEstadoConversacion() — UPDATE conversations, filtro: id =', conversationId, ', valores:', updates);
  const { error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', conversationId);
  if (error) {
    console.error(`[BOT] ❌ ERROR actualizando conversación ${conversationId} con`, updates, '->', error);
    return false;
  }
  console.log(`[BOT] ✅ Conversación ${conversationId} actualizada:`, updates);
  return true;
};

// Pasa la consulta a la cola de "En espera" en silencio (el cliente no recibe
// ningún mensaje). Es un UPDATE condicional: sólo si la consulta sigue en el
// bot (status 'open'). Si ya estaba en espera o una sucursal ya la había
// tomado, no se toca (no se reinicia el contador de espera ni se le saca la
// sucursal). Se limpian los datos que pudiera traer una fila reutilizada de
// una atención anterior (sucursal, recomendaciones por ubicación, etc.),
// igual que hace devolverConversacionAEspera().
const derivarAEspera = async (conversationId, motivo = '') => {
  const updates = {
    status: 'esperando',
    sucursal_id: null,
    devuelta_por_sucursal_id: null,
    derivado_por_sucursal_id: null,
    derivado_por_sucursal_nombre: null,
    bot_state: null,
    bot_context: null,
    waiting_since: new Date().toISOString(),
    client_lat: null,
    client_lng: null,
    sucursales_recomendadas: null
  };
  console.log('📡 [DEBUG-SERVICE-BOT] derivarAEspera() — UPDATE conversations, filtros: { id:', conversationId, ', status: open }, motivo:', motivo, ', valores:', updates);
  const { data, error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', conversationId)
    .eq('status', 'open')
    .select('id');
  if (error) {
    console.error(`[BOT] ❌ ERROR pasando la conversación ${conversationId} a "En espera":`, error);
    return false;
  }
  if (!data?.length) {
    console.log('🔍 [DEBUG-SERVICE-BOT] derivarAEspera() — la conversación ya no estaba en el bot (status distinto de open), no se toca:', conversationId);
    return false;
  }
  console.log(`[BOT] ✅ Conversación ${conversationId} pasada a "En espera" (${motivo}).`);
  return true;
};

export const procesarMensajeBot = async (texto, conversationId, telefono, isNewSession = false) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — parámetros recibidos:', { texto, conversationId, telefono, isNewSession });

  try {
    if (isNewSession) {
      // Fuera del horario configurado: se avisa y la consulta queda en el bot
      // (no pasa a "En espera"). Si vuelve a escribir dentro del horario, ahí
      // sí pasa a la cola (ver más abajo).
      const botSchedule = await getBotSchedule();
      if (!isWithinSchedule(botSchedule)) {
        console.log(`[BOT] Fuera de horario del bot para ${conversationId}. Enviando aviso de horario.`);
        await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(botSchedule), { tipo_bot: 'fuera_horario' });
        return;
      }

      const cliente = await getCliente(telefono);

      // Se cuenta esta sesión nueva (una vez por consulta, no en cada mensaje).
      try {
        await incrementarInteraccionesBot(telefono, cliente?.interacciones_bot || 0);
      } catch (err) {
        // No debe impedir que el cliente arranque su consulta si esto falla.
        console.error('❌ [DEBUG-SERVICE-BOT] procesarMensajeBot() — error incrementando interacciones_bot (no corta el flujo):', err?.message, err?.stack);
      }

      if (!tieneRegistroCompleto(cliente)) {
        console.log(`[BOT] Cliente ${telefono} sin nombre registrado. Iniciando registro.`);
        await iniciarRegistro(conversationId, telefono);
        return;
      }

      // Cliente ya registrado: directo a la cola, sin mensaje.
      await derivarAEspera(conversationId, 'consulta nueva de cliente registrado');
      return;
    }

    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('status, bot_state, bot_context')
      .eq('id', conversationId)
      .single();
    if (convError) {
      console.error('❌ [DEBUG-SERVICE-BOT] procesarMensajeBot() — error obteniendo estado de conversación:', convError?.message, convError?.stack);
    }

    const t = texto.trim();
    console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — texto trim:', t, ', status actual:', conv?.status, ', bot_state actual:', conv?.bot_state);

    // En espera o atendida por una sucursal: el bot no responde nada.
    if (conv?.status === 'esperando') {
      console.log(`[BOT] Conversación ${conversationId} en espera / atendida por una sucursal. El bot no responde.`);
      return;
    }

    const botSchedule = await getBotSchedule();
    if (!isWithinSchedule(botSchedule)) {
      console.log(`[BOT] Fuera de horario del bot para ${conversationId}. Enviando aviso de horario.`);
      await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(botSchedule), { tipo_bot: 'fuera_horario' });
      return;
    }

    const estado = conv?.bot_state || null;

    // Espera del primer contacto (ver iniciarRegistro): el mensaje ya quedó
    // guardado en el chat y no se toma como nombre. Si la espera ya venció
    // (timer perdido por un reinicio), se pide el nombre ahora.
    if (estado === 'registro_espera') {
      const vence = Date.parse(conv?.bot_context?.pedir_nombre_en || '') || 0;
      if (Date.now() >= vence) {
        await pedirNombreSiCorresponde(conversationId, telefono);
      } else {
        console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — mensaje recibido durante la espera del primer contacto, no se responde.');
      }
      return;
    }

    if (estado === 'registro_nombre') {
      await manejarPasoRegistro(conversationId, telefono, t, conv?.bot_context);
      return;
    }

    // Cualquier otro caso (consulta que quedó en el bot después de un aviso
    // de fuera de horario, o un estado de la versión anterior del bot: menú,
    // pedido de ubicación, cambio de nombre, DNI) pasa directo a la cola.
    await derivarAEspera(conversationId, `mensaje con la consulta en el bot (estado: ${estado || 'ninguno'})`);
  } catch (error) {
    console.error('[BOT] Error procesando mensaje del bot:', error);
    console.error('❌ [DEBUG-SERVICE-BOT] procesarMensajeBot() — error atrapado en catch:', error?.message, error?.stack);
  }
};

// Arranca el registro OBLIGATORIO del nombre, la primera vez que un cliente
// escribe. No se pide el nombre todavía: se espera ESPERA_PEDIDO_NOMBRE_MS
// (ver arriba). El vencimiento queda en la base para que, si el servidor se
// reinicia y se pierde el timer, el pedido salga igual (ver
// pedirNombresPendientes, que corre en sessionExpiryChecker).
const iniciarRegistro = async (conversationId, telefono) => {
  const pedirNombreEn = new Date(Date.now() + ESPERA_PEDIDO_NOMBRE_MS).toISOString();
  const ok = await actualizarEstadoConversacion(conversationId, { bot_state: 'registro_espera', bot_context: { pedir_nombre_en: pedirNombreEn } });
  if (!ok) {
    // Sin el estado guardado no hay forma de retomar la espera: se pide ya.
    await actualizarEstadoConversacion(conversationId, { bot_state: 'registro_nombre', bot_context: null });
    await enviarMensajeBot(conversationId, telefono, MENSAJE_PRIMER_CONTACTO, { tipo_bot: 'registro' });
    return;
  }
  setTimeout(() => {
    pedirNombreSiCorresponde(conversationId, telefono)
      .catch(err => console.error('❌ [DEBUG-SERVICE-BOT] iniciarRegistro() — error en el pedido de nombre diferido:', err?.message, err?.stack));
  }, ESPERA_PEDIDO_NOMBRE_MS);
  console.log(`[BOT] Cliente nuevo ${telefono}: se pide el nombre en ${ESPERA_PEDIDO_NOMBRE_MS / 1000}s (${pedirNombreEn}).`);
};

// Termina la espera del primer contacto y pide el nombre. El UPDATE
// condicional (sólo si sigue en 'registro_espera' y la consulta sigue
// abierta) hace de reserva: si el timer, el chequeo periódico y un mensaje
// del cliente llegan a la vez (o hay dos procesos del backend, ver
// sessionExpiryChecker.js), sólo el que efectivamente cambió la fila manda el
// mensaje. Si un operador tomó el chat o la consulta se cerró mientras tanto,
// no se manda nada.
export const pedirNombreSiCorresponde = async (conversationId, telefono) => {
  const { data, error } = await supabase
    .from('conversations')
    .update({ bot_state: 'registro_nombre', bot_context: null })
    .eq('id', conversationId)
    .eq('bot_state', 'registro_espera')
    .eq('status', 'open')
    .select('id');
  if (error) {
    console.error('❌ [DEBUG-SERVICE-BOT] pedirNombreSiCorresponde() — error reservando el pedido de nombre:', error);
    return false;
  }
  if (!data?.length) {
    console.log('🔍 [DEBUG-SERVICE-BOT] pedirNombreSiCorresponde() — ya no corresponde (otro proceso lo mandó, o la consulta cambió de estado):', conversationId);
    return false;
  }
  console.log(`[BOT] Pidiendo el nombre al cliente nuevo ${telefono} (conversación ${conversationId}).`);
  await enviarMensajeBot(conversationId, telefono, MENSAJE_PRIMER_CONTACTO, { tipo_bot: 'registro' });
  return true;
};

// Red de seguridad para los timers perdidos (reinicio del servidor durante
// la espera): pide el nombre en toda consulta abierta cuya espera ya venció.
// La llama sessionExpiryChecker en cada chequeo (como máximo cada 30s).
export const pedirNombresPendientes = async () => {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, client_phone, bot_context')
    .eq('bot_state', 'registro_espera')
    .eq('status', 'open');
  if (error) {
    console.error('❌ [DEBUG-SERVICE-BOT] pedirNombresPendientes() — error buscando esperas pendientes:', error);
    return;
  }
  const ahora = Date.now();
  for (const conv of data || []) {
    const vence = Date.parse(conv.bot_context?.pedir_nombre_en || '') || 0;
    if (vence <= ahora) {
      await pedirNombreSiCorresponde(conv.id, conv.client_phone);
    }
  }
};

// Consultas que quedaron esperando el menú de bienvenida de la versión
// anterior del bot (bot_state 'menu_espera') cuando se subió este cambio: ya
// no hay menú, así que pasan directo a la cola. La llama sessionExpiryChecker
// en cada chequeo; después del primer chequeo ya no encuentra ninguna.
export const derivarMenusPendientes = async () => {
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('bot_state', 'menu_espera')
    .eq('status', 'open');
  if (error) {
    console.error('❌ [DEBUG-SERVICE-BOT] derivarMenusPendientes() — error buscando consultas con el menú pendiente:', error);
    return;
  }
  for (const conv of data || []) {
    await derivarAEspera(conv.id, 'tenía pendiente el menú de la versión anterior del bot');
  }
};

const manejarPasoRegistro = async (conversationId, telefono, t, botContext = null) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — parámetros recibidos:', { conversationId, telefono, t, botContext });

  const nombre = normalizarNombre(t);
  if (!pareceNombre(nombre)) {
    const intentos = (botContext?.intentos_nombre || 0) + 1;
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — la respuesta no parece un nombre:', t, '— intento', intentos, 'de', MAX_INTENTOS_NOMBRE);
    if (intentos >= MAX_INTENTOS_NOMBRE) {
      // Se sigue sin el nombre para no trabar al cliente; se le vuelve a
      // pedir en su próxima consulta (sigue sin registro completo).
      await derivarAEspera(conversationId, 'no dio un nombre válido');
      return;
    }
    await actualizarEstadoConversacion(conversationId, { bot_context: { intentos_nombre: intentos } });
    await enviarMensajeBot(conversationId, telefono, MENSAJE_NO_ES_NOMBRE, { tipo_bot: 'registro' });
    return;
  }

  try {
    await guardarDatoCliente(telefono, 'nombre_completo', nombre);
  } catch (err) {
    console.error('[BOT] Error guardando el nombre del cliente:', err);
    console.error('❌ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — error guardando nombre_completo:', err?.message, err?.stack);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_REGISTRO, { tipo_bot: 'error' });
    return;
  }

  // El nombre es el único dato obligatorio: con eso pasa directo a la cola,
  // sin mandarle otro mensaje al cliente.
  await derivarAEspera(conversationId, 'cliente nuevo registró su nombre');
};

// `interactivo` (opcional): { tipo: 'botones' | 'lista', boton?, opciones: [{ id, titulo }] }.
// Se manda a Meta como botones/lista y se guarda en messages.botones para que
// el CRM lo muestre (ver supabase/messages_botones.sql).
export const enviarMensajeBot = async (conversationId, telefono, mensaje, extraFields = {}, interactivo = null) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] enviarMensajeBot() — parámetros recibidos:', { conversationId, telefono, mensaje, extraFields, interactivo });
  console.log(`[BOT] Enviando respuesta a ${telefono}...`);
  // Guardar mensaje en base de datos como pendiente. `extraFields` permite
  // marcar mensajes especiales (ej. is_auto_reminder para el aviso de
  // inactividad, ver sessionExpiryChecker.js) sin duplicar todo este flujo.
  const filaBase = {
    conversation_id: conversationId,
    sender_type: 'bot', // Usamos 'bot' para distinguirlo de 'agent'
    message_text: mensaje,
    estado: 'pendiente',
    ...extraFields
  };
  console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: messages, operación: insert, valores:', filaBase);
  let { data: insertData, error: insertError } = await supabase.from('messages')
    .insert([interactivo ? { ...filaBase, botones: interactivo } : filaBase]).select().single();
  // Si faltan columnas nuevas (backend subido antes que el SQL:
  // supabase/messages_botones.sql o supabase/metricas_base.sql), se guarda
  // sin ellas: el mensaje sale igual, sólo que el CRM no dibuja los botones
  // o Métricas no sabe de qué tipo era. Nunca se corta el envío por esto.
  if (insertError && /botones|tipo_bot/.test(insertError.message || '')) {
    console.warn('⚠️ [DEBUG-SERVICE-BOT] enviarMensajeBot() — faltan columnas nuevas en messages (correr los SQL pendientes). Se guarda sin ellas:', insertError.message);
    const { tipo_bot: _tipoBot, ...filaMinima } = filaBase;
    ({ data: insertData, error: insertError } = await supabase.from('messages').insert([filaMinima]).select().single());
  }
  console.log('📡 [DEBUG-SERVICE-BOT] Resultado query messages (insert mensaje bot) — data:', insertData, 'error:', insertError);

  if (insertError) {
    console.error(`[BOT] Error insertando mensaje del bot:`, insertError);
    console.error('❌ [DEBUG-SERVICE-BOT] enviarMensajeBot() — error insertando mensaje, se corta el envío:', insertError?.message, insertError?.stack);
    console.log('✅ [DEBUG-SERVICE-BOT] enviarMensajeBot() — valor de retorno: undefined (cortado por error de insert)');
    return;
  }

  // Enviar a Meta
  console.log('🔍 [DEBUG-SERVICE-BOT] enviarMensajeBot() — enviando a Meta vía sendWhatsAppMessage()');
  const metaResponse = await sendWhatsAppMessage(telefono, mensaje, null, null, null, interactivo);
  const wamid = metaResponse?.messages?.[0]?.id;
  console.log('🔍 [DEBUG-SERVICE-BOT] enviarMensajeBot() — respuesta de Meta:', metaResponse, ', wamid:', wamid);

  // Actualizar wamid y estado
  if (wamid) {
    console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: messages, operación: update, filtro: id =', insertData.id, ', valores:', { estado: 'enviado', wamid });
    const { error: updWamidError } = await supabase.from('messages')
      .update({ estado: 'enviado', wamid: wamid })
      .eq('id', insertData.id);
    console.log('📡 [DEBUG-SERVICE-BOT] Resultado query messages (update wamid/estado) — error:', updWamidError);
  } else {
    console.log('🔍 [DEBUG-SERVICE-BOT] enviarMensajeBot() — sin wamid en la respuesta de Meta, no se actualiza estado del mensaje.');
  }

  // Actualizar last_message de la conversación
  console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: conversations, operación: update, filtro: id =', conversationId, ', valores:', { last_message: mensaje });
  const { error: updLastMsgError } = await supabase.from('conversations')
    .update({ last_message: mensaje })
    .eq('id', conversationId);
  console.log('📡 [DEBUG-SERVICE-BOT] Resultado query conversations (update last_message) — error:', updLastMsgError);
  console.log('✅ [DEBUG-SERVICE-BOT] enviarMensajeBot() — valor de retorno: undefined (fin normal)');
};
