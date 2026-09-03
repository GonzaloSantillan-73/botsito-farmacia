import express from 'express';
import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';

const router = express.Router();

// Endpoint para que el panel envíe respuestas (Outbound)
router.post('/messages/send', async (req, res) => {
  // Ahora aceptamos media_url y media_type además de texto
  const { conversation_id, message_text, phone, message, media_url, media_type } = req.body;

  console.log('[CHECKPOINT 1 - PAYLOAD ENTRANTE]:', {
    phone,
    message: message || message_text,
    conversation_id,
    media_url
  });

  const finalMessage = message || message_text || '';
  
  if (!finalMessage && !media_url) {
    console.warn('[CHECKPOINT 1 WARNING]: Falta el contenido del mensaje o el archivo adjunto');
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
      console.warn('[CHECKPOINT 1 WARNING]: Faltan parámetros requeridos (phone o conversation_id)');
      return res.status(400).json({ error: 'Faltan parámetros requeridos (phone o conversation_id)' });
    }
    
    // Limpiar el teléfono
    let cleanPhone = finalPhone.replace('+', '').replace(/\s+/g, '').replace('-', '');
    
    console.log('[CHECKPOINT 2 - ENV VARIABLES]:');
    console.log(`- WHATSAPP_TOKEN: ${!!process.env.WHATSAPP_TOKEN} | Primeros 6: ${process.env.WHATSAPP_TOKEN ? process.env.WHATSAPP_TOKEN.substring(0, 6) : 'N/A'}`);
    console.log(`- PHONE_NUMBER_ID: ${process.env.PHONE_NUMBER_ID}`);
    console.log(`- SUPABASE_URL: ${!!process.env.SUPABASE_URL || !!process.env.VITE_SUPABASE_URL}`);
    console.log(`- SUPABASE_KEY: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY || !!process.env.VITE_SUPABASE_ANON_KEY}`);

    // 1. Despachar a WhatsApp con Cloud API
    await sendWhatsAppMessage(cleanPhone, finalMessage, media_url, media_type);

    // [CHECKPOINT 4 - DB PERSISTENCE]
    if (finalConversationId) {
        console.log(`[SUPABASE INSERT] Guardando mensaje en conversación: ${finalConversationId}`);
        const typeDB = media_url ? (media_type || 'image') : 'text';
        
        const { error: insertError } = await supabase.from('messages').insert([{
            conversation_id: finalConversationId,
            sender_type: 'agent', // Representa direction: 'outbound'
            message_text: finalMessage,
            media_type: typeDB,
            media_url: media_url
        }]);

        if (insertError) {
            console.error('[SUPABASE ERROR]:', insertError);
        }

        // 3. Actualizar last_message en conversations
        const previewText = media_url ? `📎 Archivo enviado${finalMessage ? ' - ' + finalMessage : ''}` : finalMessage;
        
        const { error: updateError } = await supabase.from('conversations')
            .update({ last_message: previewText })
            .eq('id', finalConversationId);
            
        if (updateError) {
            console.error('[SUPABASE ERROR]:', updateError);
        }
    }

    res.status(200).json({ success: true, message: 'Enviado a WhatsApp y guardado en DB' });
  } catch (error) {
    console.error('[SERVER 500 ROOT CAUSE]:', error.stack);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

export default router;
