import express from 'express';
import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';

const router = express.Router();

// Endpoint para que el panel envíe respuestas (Outbound)
router.post('/messages/send', async (req, res) => {
  // Ahora aceptamos media_url y media_type además de texto
  const { conversation_id, message_text, phone, message, media_url, media_type } = req.body;

  const finalMessage = message || message_text || '';
  
  if (!finalMessage && !media_url) {
    return res.status(400).json({ error: 'Falta el contenido del mensaje o el archivo adjunto' });
  }

  try {
    let finalPhone = phone;
    let finalConversationId = conversation_id;

    // Obtener teléfono si sólo viene conversation_id
    if (!finalPhone && finalConversationId) {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('client_phone')
        .eq('id', finalConversationId)
        .single();

      if (convError || !conv) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }
      finalPhone = conv.client_phone;
    } 
    // Obtener conversation_id si sólo viene teléfono (opcional)
    else if (finalPhone && !finalConversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('client_phone', finalPhone)
        .single();
        
      if (conv) {
         finalConversationId = conv.id;
      }
    }

    if (!finalPhone) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (phone o conversation_id)' });
    }
    
    // Limpiar el teléfono
    let cleanPhone = finalPhone.replace('+', '').replace(/\s+/g, '').replace('-', '');
    
    // 1. Despachar a WhatsApp con Cloud API
    await sendWhatsAppMessage(cleanPhone, finalMessage, media_url, media_type);

    // 2. Guardar el mensaje en Supabase como outbound (sender_type = 'agent')
    if (finalConversationId) {
        const typeDB = media_url ? (media_type || 'image') : 'text';
        
        await supabase.from('messages').insert([{
            conversation_id: finalConversationId,
            sender_type: 'agent', // Representa direction: 'outbound'
            message_text: finalMessage,
            media_type: typeDB,
            media_url: media_url
        }]);

        // 3. Actualizar last_message en conversations
        const previewText = media_url ? `📎 Archivo enviado${finalMessage ? ' - ' + finalMessage : ''}` : finalMessage;
        
        await supabase.from('conversations')
            .update({ last_message: previewText })
            .eq('id', finalConversationId);
    }

    res.status(200).json({ success: true, message: 'Enviado a WhatsApp y guardado en DB' });
  } catch (error) {
    console.error('Error en /messages/send:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
