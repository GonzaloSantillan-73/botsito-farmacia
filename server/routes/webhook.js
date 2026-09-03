import express from 'express';
import { supabase } from '../supabase.js';
import { downloadWhatsAppMedia } from '../services/whatsapp.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const router = express.Router();
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

// 1. Verificación del Webhook (GET) - Requerido por Meta
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      console.warn('Fallo en la verificación del Webhook');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// 2. Recepción de eventos de Meta (POST)
router.post('/', async (req, res) => {
  const body = req.body;

  // Responder INMEDIATAMENTE a Meta para confirmar recepción y evitar reintentos
  res.sendStatus(200);

  console.log(`\n[WEBHOOK] --- INICIO DE POST WEBHOOK ---`);
  // Descomenta la siguiente línea si quieres ver el JSON completo de Meta en los logs:
  // console.log(JSON.stringify(body, null, 2));

  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0] &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const waMessage = body.entry[0].changes[0].value.messages[0];
      const contactInfo = body.entry[0].changes[0].value.contacts?.[0];
      
      const clientPhone = waMessage.from; // Número (ej: '54911...')
      const clientName = contactInfo?.profile?.name || 'Cliente de WhatsApp';
      const messageType = waMessage.type;
      const messageId = waMessage.id;
      
      console.log(`[WEBHOOK] 📥 Nuevo mensaje de ${clientName} (${clientPhone}), Tipo: ${messageType}`);

      try {
        // A. Buscar o crear la conversación
        let conversationId;

        // Extraer los últimos 10 dígitos para una búsqueda flexible (ignora código de país y formato)
        const last10 = clientPhone.slice(-10);
        const { data: candidates } = await supabase
          .from('conversations')
          .select('id, status, client_phone')
          .ilike('client_phone', `%${last10}%`);

        let existingConv = null;
        if (candidates && candidates.length > 0) {
           existingConv = candidates.find(c => {
             const clean = c.client_phone.replace(/[\s\+\-]/g, '');
             return clean.includes(last10) || clientPhone.includes(clean);
           }) || candidates[0]; // fallback al primero si coincide algo
        }

        if (existingConv) {
          conversationId = existingConv.id;
          if (existingConv.status === 'resolved') {
             await supabase.from('conversations').update({ status: 'open' }).eq('id', conversationId);
          }
        } else {
          const { data: newConv, error: convError } = await supabase
            .from('conversations')
            .insert([{ client_phone: clientPhone, client_name: clientName, status: 'open' }])
            .select()
            .single();
            
          if (convError) throw convError;
          conversationId = newConv.id;
        }

        // B. Extraer el contenido
        let messageText = '';
        let mediaUrl = null;
        let mediaTypeDB = null;
        let previewText = '';
        
        if (messageType === 'text') {
          messageText = waMessage.text.body;
          previewText = messageText;
          mediaTypeDB = 'text';
        } else if (messageType === 'image' || messageType === 'document' || messageType === 'audio') {
          const mediaId = waMessage[messageType].id;
          mediaTypeDB = messageType === 'image' ? 'image' : (messageType === 'document' ? 'document' : 'text');
          
          // Obtener el buffer desde Meta
          const mediaData = await downloadWhatsAppMedia(mediaId);
          
          if (mediaData && mediaData.arrayBuffer) {
              const fileName = `${conversationId}_${Date.now()}.${mediaData.extension}`;
              
              // Subir a Supabase Storage (asegúrate de crear el bucket 'media' público)
              const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('media')
                  .upload(fileName, mediaData.arrayBuffer, {
                      contentType: mediaData.mimeType,
                      upsert: false
                  });
              
              if (!uploadError) {
                  const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);
                  mediaUrl = publicUrlData.publicUrl;
              } else {
                  console.error('Error subiendo archivo a Supabase:', uploadError);
              }
          }

          const caption = waMessage[messageType].caption || '';
          messageText = caption || `[Archivo recibido: ${messageType}]`;
          previewText = `📷 ${messageType === 'image' ? 'Imagen' : 'Archivo'}` + (caption ? ` - ${caption}` : '');
        }

        // C. Insertar el mensaje entrante
        const { error: insertError } = await supabase.from('messages').insert([{
          conversation_id: conversationId,
          sender_type: 'client',
          message_text: messageText,
          media_type: mediaTypeDB,
          media_url: mediaUrl
        }]);

        if (insertError) {
           console.error('[WEBHOOK] ❌ Error insertando mensaje en Supabase:', insertError);
        } else {
           console.log(`[WEBHOOK] ✅ Mensaje insertado en conversación ${conversationId}`);
        }

        // D. Actualizar el último mensaje en la conversación
        const { error: updateError } = await supabase.from('conversations')
          .update({ last_message: previewText })
          .eq('id', conversationId);
          
        if (updateError) {
           console.error('[WEBHOOK] ❌ Error actualizando last_message en Supabase:', updateError);
        }

      } catch (error) {
        console.error('[WEBHOOK] ❌ Error fatal procesando el webhook:', error);
      }
    }
  }
});

export default router;
