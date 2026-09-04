import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { buscarProductos } from './productos.js';

export const MENSAJE_BIENVENIDA = '¡Hola! Soy el bot de la Farmacia. Elige una opción:\n1. Consultar precios e info\n2. Hablar con un humano';

const MENSAJE_DERIVACION_HUMANO = 'Entendido, te estamos derivando con un asesor humano. En breve se pondrán en contacto contigo. Si en cualquier momento deseas volver a hablar con el bot, simplemente escribí la palabra BOT.';
const COMANDO_REACTIVAR_BOT = 'bot';

const MENSAJE_PEDIR_PRODUCTO = '¿Qué producto o medicamento estás buscando? Escribí el nombre (por ejemplo: "Ibuprofeno").';
const MENSAJE_ERROR_BUSQUEDA = 'Tuvimos un problema buscando en nuestro sistema. Por favor, intentá de nuevo escribiendo el nombre del producto.';
const MENSAJE_TEXTO_VACIO = 'Por favor escribí el nombre del producto que buscás.';

const OPCIONES_NO_ENCONTRADO = '1. Volver a ingresar el nombre del producto\n2. Volver al menú principal';
const mensajeNoEncontrado = (texto) => `No encontramos "${texto}" en nuestro catálogo. ¿Qué querés hacer?\n${OPCIONES_NO_ENCONTRADO}`;
const MENSAJE_OPCION_INVALIDA_NO_ENCONTRADO = `No entendí tu respuesta. Por favor elegí una opción válida:\n${OPCIONES_NO_ENCONTRADO}`;

const mensajeEncontrado = (texto, productos) => {
  const lista = productos
    .map(p => `• ${p.nombre} — $${Number(p.precio).toLocaleString('es-AR')} — Stock: ${p.stock} unidades`)
    .join('\n');
  return `Esto encontramos para "${texto}":\n\n${lista}\n\nEscribí 1 para buscar otro producto, o 2 para hablar con un humano.`;
};

export const procesarMensajeBot = async (texto, conversationId, telefono, isNewSession = false) => {
  console.log(`[BOT] Procesando mensaje: "${texto}" para conversación ${conversationId} (nueva sesión: ${isNewSession})`);

  try {
    // Si la consulta es nueva (no existía, o la anterior expiró/finalizó), siempre se
    // reinicia el ciclo con el menú de bienvenida, sin importar qué haya escrito el cliente.
    if (isNewSession) {
      await volverAlMenuPrincipal(conversationId, telefono);
      return;
    }

    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('status, bot_state')
      .eq('id', conversationId)
      .single();

    if (convError) {
      console.error('[BOT] Error obteniendo el estado de la conversación:', convError);
    }

    const t = texto.trim();

    // Modo humano: el bot se silencia por completo mientras un asesor atiende la
    // conversación. La única entrada que procesa es el comando "BOT" para reactivarse.
    if (conv?.status === 'esperando') {
      if (t.toLowerCase() === COMANDO_REACTIVAR_BOT) {
        console.log(`[BOT] Comando "BOT" recibido en ${conversationId}. Reactivando bot y volviendo al menú principal.`);
        await volverAlMenuPrincipal(conversationId, telefono);
      } else {
        console.log(`[BOT] Conversación ${conversationId} en modo humano ('esperando'). Bot silenciado, no se responde.`);
      }
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

    // Estado normal: menú principal
    if (t === '1') {
      await supabase.from('conversations').update({ bot_state: 'awaiting_product_search' }).eq('id', conversationId);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_PRODUCTO);
    } else if (t === '2') {
      await enviarMensajeBot(conversationId, telefono, MENSAJE_DERIVACION_HUMANO);

      console.log(`[BOT] Actualizando estado de la conversación a 'esperando' para ID: ${conversationId}`);
      await supabase
        .from('conversations')
        .update({ status: 'esperando', bot_state: null })
        .eq('id', conversationId);
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
    await supabase.from('conversations').update({ bot_state: 'product_not_found' }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, mensajeNoEncontrado(texto));
    return;
  }

  await supabase.from('conversations').update({ bot_state: null }).eq('id', conversationId);
  await enviarMensajeBot(conversationId, telefono, mensajeEncontrado(texto, productos));
};

const volverAlMenuPrincipal = async (conversationId, telefono) => {
  // 'open' saca a la conversación del modo humano ('esperando') y la vuelve a
  // dejar en la cola de "Entrantes" (bot respondiendo automáticamente).
  await supabase.from('conversations').update({ status: 'open', bot_state: null }).eq('id', conversationId);
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
