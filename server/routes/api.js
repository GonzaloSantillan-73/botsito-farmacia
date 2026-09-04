import express from 'express';
import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';

const router = express.Router();

router.post('/messages/send', async (req, res) => {
  console.log(`\n======================================================`);
  console.log(`[API - POST /messages/send] ==> INICIO DE ENVÍO DE MENSAJE (OUTBOUND)`);
  console.log(`[API - POST /messages/send] ==> Body recibido:`, JSON.stringify(req.body, null, 2));

  const { conversation_id, message_text, phone, message, media_url, media_type, id, sender_type } = req.body;

  const finalMessage = message || message_text || '';
  console.log(`[API] -> Mensaje resuelto final: "${finalMessage}"`);
  
  if (!finalMessage && !media_url) {
    console.warn('[API] ⚠️ ABORTO: Falta contenido del mensaje o archivo adjunto.');
    console.log(`======================================================\n`);
    return res.status(400).json({ error: 'Falta el contenido del mensaje o el archivo adjunto' });
  }

  try {
    let finalPhone = phone;
    let finalConversationId = conversation_id;

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> A. RESOLUCIÓN DE DESTINATARIO`);
    
    if (!finalPhone && finalConversationId) {
      console.log(`[API] -> Condición: No hay phone pero SÍ conversation_id (${finalConversationId}). Buscando en DB...`);
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('client_phone')
        .eq('id', finalConversationId)
        .single();

      if (convError || !conv) {
        console.error(`[API] ❌ ERROR: Conversación no encontrada en Supabase. Detalles:`, convError);
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }
      finalPhone = conv.client_phone;
      console.log(`[API] ✅ Teléfono recuperado de DB: ${finalPhone}`);
    } else if (finalPhone && !finalConversationId) {
      console.log(`[API] -> Condición: SÍ hay phone (${finalPhone}) pero NO conversation_id. Buscando en DB...`);
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .eq('client_phone', finalPhone)
        .single();
        
      if (convError) {
         console.warn(`[API] ⚠️ Advertencia buscando ID de conversación por teléfono:`, convError);
      }
      if (conv) {
         finalConversationId = conv.id;
         console.log(`[API] ✅ Conversation_id recuperado de DB: ${finalConversationId}`);
      } else {
         console.log(`[API] -> No se encontró conversation_id previo para este teléfono.`);
      }
    } else {
      console.log(`[API] -> Condición: Ambos phone y conversation_id provistos (o ninguno). Phone: ${finalPhone}, ID: ${finalConversationId}`);
    }

    if (!finalPhone) {
      console.warn('[API] ⚠️ ABORTO: Imposible resolver el número de teléfono.');
      console.log(`======================================================\n`);
      return res.status(400).json({ error: 'Faltan parámetros requeridos (phone o conversation_id)' });
    }
    
    let cleanPhone = finalPhone.replace('+', '').replace(/\\s+/g, '').replace('-', '');
    console.log(`[API] -> Teléfono limpio para Meta: ${cleanPhone}`);
    
    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> B. PERSISTENCIA INICIAL EN SUPABASE (estado: pendiente)`);
    
    let dbMessageId = null;
    if (finalConversationId) {
        const typeDB = media_url ? (media_type || 'image') : 'text';
        const messagePayload = {
            // Si el frontend ya generó un id (mensaje optimista), lo reusamos para que sea
            // la MISMA fila que Realtime le devuelve al cliente, en vez de una duplicada.
            ...(id ? { id } : {}),
            conversation_id: finalConversationId,
            sender_type: sender_type || 'agent',
            message_text: finalMessage,
            media_type: typeDB,
            media_url: media_url,
            estado: 'pendiente'
        };
        console.log(`[API] -> Insertando mensaje como pendiente en DB...`);
        const { data: insertData, error: insertError } = await supabase.from('messages').insert([messagePayload]).select().single();
        if (insertError) {
            console.error('[API] ❌ ERROR GUARDANDO MENSAJE PENDIENTE:', insertError);
        } else if (insertData) {
            dbMessageId = insertData.id;
            console.log(`[API] ✅ Mensaje pendiente guardado con ID:`, dbMessageId);
        }
    }

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> C. LLAMADA AL SERVICIO DE META (whatsapp.js)`);
    console.log(`[API] -> Enviando a sendWhatsAppMessage. Destino: ${cleanPhone}, Texto: "${finalMessage}", MediaUrl: ${media_url}, MediaType: ${media_type}`);
    
    const metaResponse = await sendWhatsAppMessage(cleanPhone, finalMessage, media_url, media_type);
    console.log(`[API] ✅ Respuesta exitosa de Meta recibida en el endpoint:`, metaResponse);
    
    const wamid = metaResponse?.messages?.[0]?.id;

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> D. ACTUALIZACIÓN POST-ENVÍO EN SUPABASE`);
    
    if (dbMessageId && wamid) {
        console.log(`[API] -> Actualizando mensaje ${dbMessageId} a estado 'enviado' con wamid: ${wamid}`);
        await supabase.from('messages')
            .update({ estado: 'enviado', wamid: wamid })
            .eq('id', dbMessageId);
    }
    
    if (finalConversationId) {
        const previewText = media_url ? `📎 Archivo enviado${finalMessage ? ' - ' + finalMessage : ''}` : finalMessage;
        console.log(`[API] -> Actualizando last_message en 'conversations' a: "${previewText}"`);
        
        await supabase.from('conversations')
            .update({ last_message: previewText })
            .eq('id', finalConversationId);
    }

    console.log(`[API - POST /messages/send] ==> ✅ FIN CICLO DE VIDA (SUCCESS 200)`);
    console.log(`======================================================\n`);
    res.status(200).json({ success: true, message: 'Enviado a WhatsApp y guardado en DB', meta: metaResponse });
    
  } catch (error) {
    console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    console.error(`[API - CATCH BLOCK] ❌ ERROR FATAL PROCESANDO EL ENVÍO:`);
    console.error(error.stack || error);
    console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

export default router;
