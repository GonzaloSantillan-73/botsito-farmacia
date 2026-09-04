import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';

export const MENSAJE_BIENVENIDA = '¡Hola! Soy el bot de la Farmacia. Elige una opción:\n1. Consultar precios e info\n2. Hablar con un humano';

export const procesarMensajeBot = async (texto, conversationId, telefono, isNewSession = false) => {
  console.log(`[BOT] Procesando mensaje: "${texto}" para conversación ${conversationId} (nueva sesión: ${isNewSession})`);

  try {
    // Si la consulta es nueva (no existía, o la anterior expiró/finalizó), siempre se
    // reinicia el ciclo con el menú de bienvenida, sin importar qué haya escrito el cliente.
    if (isNewSession) {
      await enviarMensajeBot(conversationId, telefono, MENSAJE_BIENVENIDA);
      return;
    }

    const t = texto.trim().toLowerCase();

    if (t === '1') {
      const msg = '¡Hola! Nuestros precios varían según el producto. ¿Qué producto buscas? (Puedes escribir el nombre y luego elegir la opción 2 para que te atienda un humano).';
      await enviarMensajeBot(conversationId, telefono, msg);
    } else if (t === '2') {
      const msg = 'Entendido, te estamos derivando a un asesor humano. En breve se pondrán en contacto contigo.';
      await enviarMensajeBot(conversationId, telefono, msg);

      console.log(`[BOT] Actualizando estado de la conversación a 'esperando' para ID: ${conversationId}`);
      await supabase
        .from('conversations')
        .update({ status: 'esperando' })
        .eq('id', conversationId);
    } else {
      await enviarMensajeBot(conversationId, telefono, MENSAJE_BIENVENIDA);
    }
  } catch (error) {
    console.error(`[BOT] Error procesando mensaje del bot:`, error);
  }
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
