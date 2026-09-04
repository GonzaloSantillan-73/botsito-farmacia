import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';

export const procesarMensajeBot = async (texto, conversationId, telefono) => {
  console.log(`[BOT] Procesando mensaje: "${texto}" para conversación ${conversationId}`);
  const t = texto.trim().toLowerCase();
  
  try {
    if (t === '1') {
      const msg = '¡Hola! Nuestros precios varían según el producto. ¿Qué producto buscas? (Puedes escribir el nombre y luego elegir la opción 2 para que te atienda un humano).';
      await enviarRespuestaBot(conversationId, telefono, msg);
    } else if (t === '2') {
      const msg = 'Entendido, te estamos derivando a un asesor humano. En breve se pondrán en contacto contigo.';
      await enviarRespuestaBot(conversationId, telefono, msg);
      
      console.log(`[BOT] Actualizando estado de la conversación a 'esperando' para ID: ${conversationId}`);
      await supabase
        .from('conversations')
        .update({ status: 'esperando' })
        .eq('id', conversationId);
    } else {
      const msg = '¡Hola! Soy el bot de la Farmacia. Elige una opción:\n1. Consultar precios e info\n2. Hablar con un humano';
      await enviarRespuestaBot(conversationId, telefono, msg);
    }
  } catch (error) {
    console.error(`[BOT] Error procesando mensaje del bot:`, error);
  }
};

const enviarRespuestaBot = async (conversationId, telefono, mensaje) => {
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
