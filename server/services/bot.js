import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { buscarProductos } from './productos.js';
import { getBotKeyword } from './appConfig.js';
import { getBotSchedule, getHumanSchedule, isWithinSchedule, renderScheduleMessage } from './scheduleConfig.js';
import { agregarAlCarrito, obtenerCarrito, eliminarItemCarrito, vaciarCarrito, formatearCarrito } from './cart.js';

export const MENSAJE_BIENVENIDA = '¡Hola! Soy el bot de la Farmacia. Elige una opción:\n1. Consultar precios e info\n2. Hablar con un humano\n3. Ver mi carrito';

const mensajeDerivacionHumano = (keyword) =>
  `Entendido, te estamos derivando con un asesor humano. En breve se pondrán en contacto contigo. Si en cualquier momento deseas volver a hablar con el bot, simplemente escribí la palabra ${keyword}.`;

const MENSAJE_PEDIR_PRODUCTO = '¿Qué producto o medicamento estás buscando? Escribí el nombre (por ejemplo: "Ibuprofeno").';
const MENSAJE_ERROR_BUSQUEDA = 'Tuvimos un problema buscando en nuestro sistema. Por favor, intentá de nuevo escribiendo el nombre del producto.';
const MENSAJE_TEXTO_VACIO = 'Por favor escribí el nombre del producto que buscás.';
const MENSAJE_ERROR_CARRITO = 'Tuvimos un problema con tu carrito. Por favor, intentá de nuevo en un momento.';

const OPCIONES_NO_ENCONTRADO = '1. Volver a ingresar el nombre del producto\n2. Volver al menú principal';
const mensajeNoEncontrado = (texto) => `No encontramos "${texto}" en nuestro catálogo. ¿Qué querés hacer?\n${OPCIONES_NO_ENCONTRADO}`;
const MENSAJE_OPCION_INVALIDA_NO_ENCONTRADO = `No entendí tu respuesta. Por favor elegí una opción válida:\n${OPCIONES_NO_ENCONTRADO}`;

const mensajeResultadoBusqueda = (texto, productos) => {
  const lista = productos
    .map((p, idx) => `${idx + 1}. ${p.nombre} — $${Number(p.precio).toLocaleString('es-AR')} — Stock: ${p.stock} unidades`)
    .join('\n');
  return `Esto encontramos para "${texto}":\n\n${lista}\n\nEscribí el número del producto para agregarlo a tu carrito, "carrito" para ver tu carrito, o "menu" para volver al inicio.`;
};

const MENSAJE_OPCION_INVALIDA_RESULTADO = 'No entendí tu respuesta. Escribí el número del producto para agregarlo al carrito, "carrito" para verlo, o "menu" para volver al inicio.';

const OPCIONES_CARRITO = '1. Agregar otro producto\n2. Eliminar un producto\n3. Vaciar el carrito\n4. Confirmar pedido\n5. Volver al menú principal';
const MENSAJE_OPCION_INVALIDA_CARRITO = `No entendí tu respuesta. Por favor elegí una opción válida:\n${OPCIONES_CARRITO}`;
const MENSAJE_CARRITO_VACIO = 'Tu carrito está vacío. Escribí 1 para buscar productos.';

const mensajeCarrito = (items, prefijo = '') => {
  const { texto, total, envioGratisTexto } = formatearCarrito(items);
  return `${prefijo}🛒 Tu carrito:\n${texto}\n\nTotal: $${total.toLocaleString('es-AR')}\n\n${envioGratisTexto}\n\n¿Qué querés hacer?\n${OPCIONES_CARRITO}`;
};

const mensajePedirEliminacion = (items) => {
  const { texto } = formatearCarrito(items);
  return `¿Qué producto querés eliminar?\n${texto}\n\nEscribí el número, o "cancelar" para volver al carrito.`;
};

export const procesarMensajeBot = async (texto, conversationId, telefono, isNewSession = false) => {
  console.log(`[BOT] Procesando mensaje: "${texto}" para conversación ${conversationId} (nueva sesión: ${isNewSession})`);

  try {
    // Si la consulta es nueva (no existía, o la anterior expiró/finalizó), siempre se
    // reinicia el ciclo con el menú de bienvenida, sin importar qué haya escrito el cliente.
    // Salvo que el bot esté fuera de su horario configurado.
    if (isNewSession) {
      const botSchedule = await getBotSchedule();
      if (!isWithinSchedule(botSchedule)) {
        console.log(`[BOT] Fuera de horario del bot para ${conversationId}. Enviando aviso de horario.`);
        await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(botSchedule));
        return;
      }
      await volverAlMenuPrincipal(conversationId, telefono);
      return;
    }

    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('status, bot_state, bot_context')
      .eq('id', conversationId)
      .single();

    if (convError) {
      console.error('[BOT] Error obteniendo el estado de la conversación:', convError);
    }

    const t = texto.trim();

    // Modo humano: el bot se silencia por completo mientras un asesor atiende la
    // conversación. La única entrada que procesa es la palabra clave configurada para reactivarse.
    if (conv?.status === 'esperando') {
      const botKeyword = await getBotKeyword();
      if (t.toLowerCase() === botKeyword.toLowerCase()) {
        console.log(`[BOT] Comando "${botKeyword}" recibido en ${conversationId}. Reactivando bot y volviendo al menú principal.`);
        await volverAlMenuPrincipal(conversationId, telefono);
      } else {
        console.log(`[BOT] Conversación ${conversationId} en modo humano ('esperando'). Bot silenciado, no se responde.`);
      }
      return;
    }

    const botSchedule = await getBotSchedule();
    if (!isWithinSchedule(botSchedule)) {
      console.log(`[BOT] Fuera de horario del bot para ${conversationId}. Enviando aviso de horario.`);
      await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(botSchedule));
      return;
    }

    const estado = conv?.bot_state || null;

    if (estado === 'awaiting_product_search') {
      if (!t) {
        await enviarMensajeBot(conversationId, telefono, MENSAJE_TEXTO_VACIO);
        return;
      }
      await manejarBusquedaProducto(conversationId, telefono, t);
      return;
    }

    if (estado === 'product_not_found') {
      if (t === '1') {
        await supabase.from('conversations').update({ bot_state: 'awaiting_product_search' }).eq('id', conversationId);
        await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_PRODUCTO);
      } else if (t === '2') {
        await volverAlMenuPrincipal(conversationId, telefono);
      } else {
        await enviarMensajeBot(conversationId, telefono, MENSAJE_OPCION_INVALIDA_NO_ENCONTRADO);
      }
      return;
    }

    if (estado === 'product_found_menu') {
      await manejarSeleccionResultado(conversationId, telefono, t, conv?.bot_context);
      return;
    }

    if (estado === 'cart_menu') {
      await manejarMenuCarrito(conversationId, telefono, t);
      return;
    }

    if (estado === 'awaiting_remove_item') {
      await manejarEliminarItem(conversationId, telefono, t);
      return;
    }

    // Estado normal: menú principal
    if (t === '1') {
      await supabase.from('conversations').update({ bot_state: 'awaiting_product_search', bot_context: null }).eq('id', conversationId);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_PRODUCTO);
    } else if (t === '2') {
      const humanSchedule = await getHumanSchedule();
      if (!isWithinSchedule(humanSchedule)) {
        console.log(`[BOT] Se pidió un humano fuera de su horario de atención para ${conversationId}.`);
        await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(humanSchedule));
        return;
      }

      const botKeyword = await getBotKeyword();
      await enviarMensajeBot(conversationId, telefono, mensajeDerivacionHumano(botKeyword));

      console.log(`[BOT] Actualizando estado de la conversación a 'esperando' para ID: ${conversationId}`);
      await supabase
        .from('conversations')
        .update({ status: 'esperando', bot_state: null, bot_context: null })
        .eq('id', conversationId);
    } else if (t === '3') {
      await mostrarCarrito(conversationId, telefono);
    } else {
      await enviarMensajeBot(conversationId, telefono, MENSAJE_BIENVENIDA);
    }
  } catch (error) {
    console.error(`[BOT] Error procesando mensaje del bot:`, error);
  }
};

const manejarBusquedaProducto = async (conversationId, telefono, texto) => {
  const { data: productos, error } = await buscarProductos(texto);

  if (error) {
    console.error('[BOT] Error buscando productos en Supabase:', error);
    // No cambiamos el bot_state: el cliente se queda en "awaiting_product_search" y puede reintentar.
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_BUSQUEDA);
    return;
  }

  if (!productos || productos.length === 0) {
    await supabase.from('conversations').update({ bot_state: 'product_not_found', bot_context: null }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, mensajeNoEncontrado(texto));
    return;
  }

  // Guardamos los ids en orden para poder mapear "1", "2"... a un producto concreto
  // cuando el cliente elija cuál agregar al carrito.
  await supabase
    .from('conversations')
    .update({ bot_state: 'product_found_menu', bot_context: { productIds: productos.map(p => p.id) } })
    .eq('id', conversationId);
  await enviarMensajeBot(conversationId, telefono, mensajeResultadoBusqueda(texto, productos));
};

const manejarSeleccionResultado = async (conversationId, telefono, t, botContext) => {
  const productIds = botContext?.productIds || [];
  const tLower = t.toLowerCase();

  if (tLower === 'carrito') {
    await mostrarCarrito(conversationId, telefono);
    return;
  }
  if (tLower === 'menu') {
    await volverAlMenuPrincipal(conversationId, telefono);
    return;
  }

  const indice = Number(t) - 1;
  if (!Number.isInteger(indice) || indice < 0 || indice >= productIds.length) {
    await enviarMensajeBot(conversationId, telefono, MENSAJE_OPCION_INVALIDA_RESULTADO);
    return;
  }

  try {
    await agregarAlCarrito(telefono, productIds[indice]);
  } catch (err) {
    console.error('[BOT] Error agregando producto al carrito:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  await mostrarCarrito(conversationId, telefono, '✅ Agregado a tu carrito.\n\n');
};

const mostrarCarrito = async (conversationId, telefono, prefijo = '') => {
  let items;
  try {
    items = await obtenerCarrito(telefono);
  } catch (err) {
    console.error('[BOT] Error obteniendo el carrito:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  if (items.length === 0) {
    await supabase.from('conversations').update({ bot_state: null, bot_context: null }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, `${prefijo}${MENSAJE_CARRITO_VACIO}`);
    return;
  }

  await supabase.from('conversations').update({ bot_state: 'cart_menu', bot_context: null }).eq('id', conversationId);
  await enviarMensajeBot(conversationId, telefono, mensajeCarrito(items, prefijo));
};

const manejarMenuCarrito = async (conversationId, telefono, t) => {
  if (t === '1') {
    await supabase.from('conversations').update({ bot_state: 'awaiting_product_search', bot_context: null }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_PRODUCTO);
    return;
  }

  if (t === '2') {
    let items;
    try {
      items = await obtenerCarrito(telefono);
    } catch (err) {
      console.error('[BOT] Error obteniendo el carrito:', err);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
      return;
    }
    if (items.length === 0) {
      await mostrarCarrito(conversationId, telefono);
      return;
    }
    await supabase
      .from('conversations')
      .update({ bot_state: 'awaiting_remove_item', bot_context: { cartItemIds: items.map(i => i.id) } })
      .eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, mensajePedirEliminacion(items));
    return;
  }

  if (t === '3') {
    try {
      await vaciarCarrito(telefono);
    } catch (err) {
      console.error('[BOT] Error vaciando el carrito:', err);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
      return;
    }
    await supabase.from('conversations').update({ bot_state: null, bot_context: null }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, '🗑️ Vaciamos tu carrito. Escribí 1 para buscar productos o 2 para hablar con un humano.');
    return;
  }

  if (t === '4') {
    await confirmarPedido(conversationId, telefono);
    return;
  }

  if (t === '5') {
    await volverAlMenuPrincipal(conversationId, telefono);
    return;
  }

  await enviarMensajeBot(conversationId, telefono, MENSAJE_OPCION_INVALIDA_CARRITO);
};

const manejarEliminarItem = async (conversationId, telefono, t) => {
  if (t.toLowerCase() === 'cancelar') {
    await mostrarCarrito(conversationId, telefono);
    return;
  }

  let items;
  try {
    items = await obtenerCarrito(telefono);
  } catch (err) {
    console.error('[BOT] Error obteniendo el carrito:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  const indice = Number(t) - 1;
  if (!Number.isInteger(indice) || indice < 0 || indice >= items.length) {
    await enviarMensajeBot(conversationId, telefono, `No entendí tu respuesta.\n\n${mensajePedirEliminacion(items)}`);
    return;
  }

  try {
    await eliminarItemCarrito(telefono, items[indice].id);
  } catch (err) {
    console.error('[BOT] Error eliminando producto del carrito:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  await mostrarCarrito(conversationId, telefono, `🗑️ Eliminamos "${items[indice].productos?.nombre}" de tu carrito.\n\n`);
};

// Confirmar pedido: arma el resumen final, deriva la conversación a un asesor
// humano (mismo estado 'esperando' que "Hablar con un humano") y vacía el carrito.
const confirmarPedido = async (conversationId, telefono) => {
  let items;
  try {
    items = await obtenerCarrito(telefono);
  } catch (err) {
    console.error('[BOT] Error obteniendo el carrito para confirmar el pedido:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  if (items.length === 0) {
    await mostrarCarrito(conversationId, telefono);
    return;
  }

  const { texto, total, envioGratisTexto } = formatearCarrito(items);
  const botKeyword = await getBotKeyword();
  const mensaje =
    `✅ ¡Gracias por tu pedido! Este es el resumen:\n\n${texto}\n\nTotal: $${total.toLocaleString('es-AR')}\n\n${envioGratisTexto}\n\n` +
    `Te estamos derivando con un asesor humano para coordinar el pago y la entrega. En breve se pondrán en contacto contigo. ` +
    `Si en cualquier momento deseas volver a hablar con el bot, simplemente escribí la palabra ${botKeyword}.`;

  // Persistimos la transición de estado y vaciamos el carrito ANTES de intentar
  // enviar el mensaje: el pedido ya quedó confirmado del lado del cliente, así que
  // un fallo transitorio de envío a Meta no debe impedir que pase a "Atendiendo".
  console.log(`[BOT] Pedido confirmado para ${conversationId}. Derivando a 'esperando' y vaciando el carrito.`);
  await supabase
    .from('conversations')
    .update({ status: 'esperando', bot_state: null, bot_context: null })
    .eq('id', conversationId);

  try {
    await vaciarCarrito(telefono);
  } catch (err) {
    console.error('[BOT] Error vaciando el carrito tras confirmar el pedido:', err);
  }

  await enviarMensajeBot(conversationId, telefono, mensaje);
};

const volverAlMenuPrincipal = async (conversationId, telefono) => {
  // 'open' saca a la conversación del modo humano ('esperando') y la vuelve a
  // dejar en la cola de "Entrantes" (bot respondiendo automáticamente).
  await supabase.from('conversations').update({ status: 'open', bot_state: null, bot_context: null }).eq('id', conversationId);
  await enviarMensajeBot(conversationId, telefono, MENSAJE_BIENVENIDA);
};

export const enviarMensajeBot = async (conversationId, telefono, mensaje) => {
  console.log(`[BOT] Enviando respuesta a ${telefono}...`);
  // Guardar mensaje en base de datos como pendiente
  const { data: insertData, error: insertError } = await supabase.from('messages').insert([{
    conversation_id: conversationId,
    sender_type: 'bot', // Usamos 'bot' para distinguirlo de 'agent'
    message_text: mensaje,
    estado: 'pendiente'
  }]).select().single();

  if (insertError) {
    console.error(`[BOT] Error insertando mensaje del bot:`, insertError);
    return;
  }

  // Enviar a Meta
  const metaResponse = await sendWhatsAppMessage(telefono, mensaje);
  const wamid = metaResponse?.messages?.[0]?.id;

  // Actualizar wamid y estado
  if (wamid) {
    await supabase.from('messages')
      .update({ estado: 'enviado', wamid: wamid })
      .eq('id', insertData.id);
  }

  // Actualizar last_message de la conversación
  await supabase.from('conversations')
    .update({ last_message: mensaje })
    .eq('id', conversationId);
};
