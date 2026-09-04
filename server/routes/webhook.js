import express from 'express';
import { supabase } from '../supabase.js';
import { downloadWhatsAppMedia, normalizarTelefono } from '../services/whatsapp.js';
import { procesarMensajeBot } from '../services/bot.js';
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
  console.log(`\n======================================================`);
  console.log(`[WEBHOOK - GET /] ==> INICIO VERIFICACIÓN META`);
  console.log(`[WEBHOOK - GET /] ==> Query params:`, JSON.stringify(req.query));
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    console.log(`[WEBHOOK - GET /] -> Condición: Mode y token presentes. Mode: ${mode}`);
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log(`[WEBHOOK - GET /] ==> ✅ WEBHOOK VERIFICADO CORRECTAMENTE`);
      console.log(`======================================================\n`);
      res.status(200).send(challenge);
    } else {
      console.warn(`[WEBHOOK - GET /] ==> ❌ FALLO DE VERIFICACIÓN: Token no coincide o mode inválido`);
      console.log(`======================================================\n`);
      res.sendStatus(403);
    }
  } else {
    console.warn(`[WEBHOOK - GET /] ==> ❌ FALTAN PARÁMETROS: mode o token no enviados`);
    console.log(`======================================================\n`);
    res.sendStatus(400);
  }
});

// 2. Recepción de eventos de Meta (POST)
router.post('/', async (req, res) => {
  const body = req.body;
  
  console.log(`\n======================================================`);
  console.log(`[WEBHOOK - POST /] ==> INICIO RECEPCIÓN DE EVENTO META`);
  console.log(`[WEBHOOK - POST /] ==> Payload crudo completo:`);
  console.dir(body, { depth: null, colors: true });

  // Responder INMEDIATAMENTE a Meta para confirmar recepción y evitar reintentos
  console.log(`[WEBHOOK - POST /] -> Enviando status 200 INMEDIATO a Meta`);
  res.sendStatus(200);

  if (body.object) {
    console.log(`[WEBHOOK - POST /] -> Condición: body.object existe (${body.object})`);
    
    const changes = body.entry?.[0]?.changes?.[0];
    if (changes?.value?.statuses && changes.value.statuses[0]) {
      console.log(`[WEBHOOK - POST /] -> Condición: Se recibió una actualización de ESTADO (status)`);
      const statusObj = changes.value.statuses[0];
      const wamid = statusObj.id;
      const metaStatus = statusObj.status; // 'sent', 'delivered', 'read', 'failed'
      
      let estadoDB = 'enviado';
      if (metaStatus === 'delivered') estadoDB = 'entregado';
      else if (metaStatus === 'read') estadoDB = 'leido';
      else if (metaStatus === 'failed') estadoDB = 'error';
      else if (metaStatus === 'sent') estadoDB = 'enviado';

      console.log(`[WEBHOOK - POST /] -> Actualizando mensaje con wamid: ${wamid} al estado: ${estadoDB}`);
      try {
        await supabase.from('messages').update({ estado: estadoDB }).eq('wamid', wamid);
        console.log(`[WEBHOOK - POST /] ==> ✅ ESTADO ACTUALIZADO CON ÉXITO`);
      } catch (error) {
        console.error(`[WEBHOOK - POST /] ❌ ERROR ACTUALIZANDO ESTADO:`, error);
      }
      
    } else if (
      changes?.value?.messages &&
      changes.value.messages[0]
    ) {
      console.log(`[WEBHOOK - POST /] -> Condición: Estructura de mensaje de Meta VÁLIDA`);
      
      const waMessage = changes.value.messages[0];
      const contactInfo = changes.value.contacts?.[0];
      
      const rawPhone = waMessage.from;
      const clientPhone = normalizarTelefono(rawPhone);
      const clientName = contactInfo?.profile?.name || 'Cliente de WhatsApp';
      const messageType = waMessage.type;
      const messageId = waMessage.id;
      
      console.log(`[WEBHOOK - POST /] ==> DATOS EXTRAÍDOS:`);
      console.log(`   - Teléfono: ${clientPhone}`);
      console.log(`   - Nombre: ${clientName}`);
      console.log(`   - Tipo de mensaje: ${messageType}`);
      console.log(`   - ID Mensaje: ${messageId}`);

      try {
        console.log(`\n------------------------------------------------------`);
        console.log(`[WEBHOOK] ==> A. BÚSQUEDA DE CONVERSACIÓN`);
        let conversationId;
        const last10 = clientPhone.slice(-10);
        
        console.log(`[WEBHOOK] -> Consultando Supabase 'conversations' con ilike '%${last10}%'`);
        const { data: candidates, error: searchError } = await supabase
          .from('conversations')
          .select('id, status, client_phone')
          .ilike('client_phone', `%${last10}%`);

        if (searchError) {
          console.error(`[WEBHOOK] ❌ ERROR EN SUPABASE AL BUSCAR CONVERSACIÓN:`, searchError);
          throw searchError;
        }
        
        console.log(`[WEBHOOK] -> Resultado búsqueda candidatos:`, candidates);

        let existingConv = null;
        if (candidates && candidates.length > 0) {
           console.log(`[WEBHOOK] -> Candidatos encontrados, refinando búsqueda...`);
           existingConv = candidates.find(c => {
             const clean = c.client_phone.replace(/[\s\+\-]/g, '');
             return clean.includes(last10) || clientPhone.includes(clean);
           }) || candidates[0];
           console.log(`[WEBHOOK] -> Conversación coincidente encontrada:`, existingConv);
        } else {
           console.log(`[WEBHOOK] -> No se encontraron candidatos.`);
        }

        if (existingConv) {
          console.log(`[WEBHOOK] -> Condición: Usando conversación existente ID: ${existingConv.id}`);
          conversationId = existingConv.id;
          if (existingConv.status === 'resolved') {
             console.log(`[WEBHOOK] -> Estado era 'resolved', reabriendo conversación...`);
             const { data: updateData, error: resolveUpdateError } = await supabase.from('conversations').update({ status: 'open' }).eq('id', conversationId).select();
             if (resolveUpdateError) {
                 console.error(`[WEBHOOK] ❌ ERROR REABRIENDO CONVERSACIÓN:`, resolveUpdateError);
             } else {
                 console.log(`[WEBHOOK] ✅ Conversación reabierta en Supabase:`, updateData);
             }
          }
        } else {
          console.log(`[WEBHOOK] -> Condición: Creando NUEVA conversación...`);
          console.log(`[WEBHOOK] -> Payload insert 'conversations':`, { client_phone: clientPhone, client_name: clientName, status: 'open' });
          
          const { data: newConv, error: convError } = await supabase
            .from('conversations')
            .insert([{ client_phone: clientPhone, client_name: clientName, status: 'open' }])
            .select()
            .single();
            
          if (convError) {
              console.error(`[WEBHOOK] ❌ ERROR CREANDO CONVERSACIÓN:`, convError);
              throw convError;
          }
          console.log(`[WEBHOOK] ✅ NUEVA Conversación creada, ID: ${newConv.id}`);
          conversationId = newConv.id;
        }

        console.log(`\n------------------------------------------------------`);
        console.log(`[WEBHOOK] ==> B. EXTRACCIÓN DE CONTENIDO (${messageType})`);
        
        let messageText = '';
        let mediaUrl = null;
        let mediaTypeDB = null;
        let previewText = '';
        
        if (messageType === 'text') {
          console.log(`[WEBHOOK] -> Entró al bloque de texto`);
          messageText = waMessage.text.body;
          previewText = messageText;
          mediaTypeDB = 'text';
          console.log(`[WEBHOOK] -> Texto extraído: "${messageText}"`);
        } else if (messageType === 'image' || messageType === 'document' || messageType === 'audio') {
          console.log(`[WEBHOOK] -> Entró al bloque de multimedia/documento`);
          const mediaId = waMessage[messageType].id;
          mediaTypeDB = messageType === 'image' ? 'image' : (messageType === 'document' ? 'document' : 'text');
          console.log(`[WEBHOOK] -> Media ID: ${mediaId}, DB Type: ${mediaTypeDB}`);
          
          console.log(`[WEBHOOK] -> Solicitando descarga de media a whatsapp.js...`);
          const mediaData = await downloadWhatsAppMedia(mediaId);
          
          if (mediaData && mediaData.arrayBuffer) {
              console.log(`[WEBHOOK] -> Media descargada exitosamente. Mime: ${mediaData.mimeType}`);
              const fileName = `${conversationId}_${Date.now()}.${mediaData.extension}`;
              console.log(`[WEBHOOK] -> Subiendo a Supabase Storage bucket 'media' como: ${fileName}`);
              
              const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('media')
                  .upload(fileName, mediaData.arrayBuffer, {
                      contentType: mediaData.mimeType,
                      upsert: false
                  });
              
              if (!uploadError) {
                  console.log(`[WEBHOOK] ✅ Subida exitosa a Storage:`, uploadData);
                  const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);
                  mediaUrl = publicUrlData.publicUrl;
                  console.log(`[WEBHOOK] -> URL Pública obtenida: ${mediaUrl}`);
              } else {
                  console.error('[WEBHOOK] ❌ Error subiendo archivo a Supabase Storage:', uploadError);
              }
          } else {
              console.warn(`[WEBHOOK] ⚠️ Falló la descarga de media o arrayBuffer está vacío.`);
          }

          const caption = waMessage[messageType].caption || '';
          messageText = caption || `[Archivo recibido: ${messageType}]`;
          previewText = `📷 ${messageType === 'image' ? 'Imagen' : 'Archivo'}` + (caption ? ` - ${caption}` : '');
          console.log(`[WEBHOOK] -> Caption/Text final: "${messageText}"`);
        } else {
            console.log(`[WEBHOOK] -> Tipo de mensaje no soportado/procesado explícitamente: ${messageType}`);
        }

        console.log(`\n------------------------------------------------------`);
        console.log(`[WEBHOOK] ==> C. INSERCIÓN DEL MENSAJE EN DB`);
        const messagePayload = {
          conversation_id: conversationId,
          sender_type: 'client',
          message_text: messageText,
          media_type: mediaTypeDB,
          media_url: mediaUrl,
          wamid: messageId,
          estado: 'recibido'
        };
        console.log(`[WEBHOOK] -> Payload insert 'messages':`, messagePayload);
        
        const { data: insertData, error: insertError } = await supabase.from('messages').insert([messagePayload]).select();

        if (insertError) {
           console.error('[WEBHOOK] ❌ ERROR FATAL INSERTANDO MENSAJE EN SUPABASE:', insertError);
        } else {
           console.log(`[WEBHOOK] ✅ Mensaje insertado correctamente:`, insertData);
        }

        console.log(`\n------------------------------------------------------`);
        console.log(`[WEBHOOK] ==> D. ACTUALIZACIÓN DE ÚLTIMO MENSAJE EN CONVERSACIÓN`);
        console.log(`[WEBHOOK] -> Payload update 'conversations': { last_message: "${previewText}" } para ID: ${conversationId}`);
        
        const { data: updateData, error: updateError } = await supabase.from('conversations')
          .update({ last_message: previewText })
          .eq('id', conversationId)
          .select();
          
        if (updateError) {
           console.error('[WEBHOOK] ❌ ERROR ACTUALIZANDO LAST_MESSAGE EN SUPABASE:', updateError);
        } else {
           console.log(`[WEBHOOK] ✅ last_message actualizado correctamente:`, updateData);
        }
        
        console.log(`[WEBHOOK - POST /] ==> ✅ FIN PROCESAMIENTO EXITOSO DEL EVENTO`);
        console.log(`======================================================\n`);
        
        // Ejecutar lógica del bot para mensajes de texto del cliente
        if (messageType === 'text') {
           console.log(`[WEBHOOK] -> Derivando mensaje a la lógica del bot...`);
           await procesarMensajeBot(messageText, conversationId, clientPhone);
        }

      } catch (error) {
        console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
        console.error(`[WEBHOOK] ❌ ERROR FATAL CAPTURADO EN EL CATCH PRINCIPAL:`);
        console.error(error.stack || error);
        console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
      }
    } else {
      console.log(`[WEBHOOK - POST /] -> Estructura del evento no contiene mensajes válidos de WhatsApp (puede ser status, u otro tipo).`);
      console.log(`======================================================\n`);
    }
  } else {
    console.log(`[WEBHOOK - POST /] -> Evento recibido no tiene propiedad 'object'.`);
    console.log(`======================================================\n`);
  }
});

export default router;
