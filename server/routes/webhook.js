import express from 'express';
import { supabase } from '../supabase.js';
import { downloadWhatsAppMedia, normalizarTelefono } from '../services/whatsapp.js';
import { procesarMensajeBot } from '../services/bot.js';
import { findOrCreateSession } from '../services/sessionManager.js';
import { getConversationAwaitingRating, isValidRatingReply, guardarCalificacionAtencion, guardarCalificacionProducto, descartarEncuestaPendiente } from '../services/ratingSurvey.js';
import { analizarPdf, esDocumentoPdf } from '../services/pdfSecurity.js';
import { estaClienteBloqueado } from '../services/moderacion.js';
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

  console.log(`🔍 [DEBUG-WEBHOOK] Verificación GET - mode: ${mode}, token presente: ${!!token}, token coincide con VERIFY_TOKEN: ${token === VERIFY_TOKEN}, challenge presente: ${!!challenge}`);

  if (mode && token) {
    console.log(`[WEBHOOK - GET /] -> Condición: Mode y token presentes. Mode: ${mode}`);
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log(`[WEBHOOK - GET /] ==> ✅ WEBHOOK VERIFICADO CORRECTAMENTE`);
      console.log(`======================================================\n`);
      console.log(`🔍 [DEBUG-WEBHOOK] 🔚 Respondiendo a Meta con status code: 200 (challenge devuelto)`);
      res.status(200).send(challenge);
    } else {
      console.warn(`[WEBHOOK - GET /] ==> ❌ FALLO DE VERIFICACIÓN: Token no coincide o mode inválido`);
      console.log(`======================================================\n`);
      console.log(`🔍 [DEBUG-WEBHOOK] 🔚 Respondiendo a Meta con status code: 403`);
      res.sendStatus(403);
    }
  } else {
    console.warn(`[WEBHOOK - GET /] ==> ❌ FALTAN PARÁMETROS: mode o token no enviados`);
    console.log(`======================================================\n`);
    console.log(`🔍 [DEBUG-WEBHOOK] 🔚 Respondiendo a Meta con status code: 400`);
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
      console.log(`🔍 [DEBUG-WEBHOOK] 📡 Consulta Supabase - tabla: messages, operación: update, filtros: { wamid: "${wamid}" }, payload: { estado: "${estadoDB}" }`);
      try {
        const { data: statusUpdateData, error: statusUpdateError } = await supabase.from('messages').update({ estado: estadoDB }).eq('wamid', wamid);
        console.log(`🔍 [DEBUG-WEBHOOK] 📡 Resultado consulta Supabase (update estado) - data:`, statusUpdateData, '| error:', statusUpdateError);
        console.log(`[WEBHOOK - POST /] ==> ✅ ESTADO ACTUALIZADO CON ÉXITO`);
      } catch (error) {
        console.error(`[WEBHOOK - POST /] ❌ ERROR ACTUALIZANDO ESTADO:`, error);
        console.error(`🔍 [DEBUG-WEBHOOK] ❌ Error completo - message: ${error.message}, stack:`, error.stack);
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
      // El pushName (nombre de perfil de WhatsApp) NO se usa como nombre del
      // cliente: lo pone el propio usuario en su teléfono como quiera (apodo,
      // emoji, nombre de otra persona) y no está validado. El nombre "de
      // verdad" sale únicamente del flujo de identificación por DNI (ver
      // clientes.nombre_completo en bot.js/clientes.js) — hasta que el
      // cliente pase por ahí, la conversación queda sin nombre y el CRM cae
      // al teléfono formateado como fallback (ver Sidebar.jsx: conv.real_name
      // || conv.client_name || formatPhone(...)).
      const clientName = null;
      const messageType = waMessage.type;
      const messageId = waMessage.id;

      console.log(`[WEBHOOK - POST /] ==> DATOS EXTRAÍDOS:`);
      console.log(`   - Teléfono: ${clientPhone}`);
      console.log(`   - Nombre de perfil de WhatsApp (pushName, ignorado a propósito, no se guarda): ${contactInfo?.profile?.name || '(sin nombre de perfil)'}`);
      console.log(`   - Tipo de mensaje: ${messageType}`);
      console.log(`   - ID Mensaje: ${messageId}`);
      console.log(`🔍 [DEBUG-WEBHOOK] Rama de filtrado tomada: MENSAJE (changes.value.messages[0] presente) | tipo detectado: ${messageType}`);

      if (messageType === 'reaction') {
        // Una reacción no crea/usa una sesión ni pasa por el bot: solo
        // refleja el emoji sobre el mensaje original (localizado por wamid).
        // Meta manda emoji: "" cuando el cliente QUITA la reacción.
        const reactedWamid = waMessage.reaction?.message_id;
        const reactionEmoji = waMessage.reaction?.emoji || null;

        console.log(`[WEBHOOK] -> Evento de tipo REACTION: emoji="${reactionEmoji}" sobre wamid="${reactedWamid}" (de ${clientPhone})`);
        console.log(`🔍 [DEBUG-WEBHOOK] 📡 Consulta Supabase - tabla: messages, operación: update, filtros: { wamid: "${reactedWamid}" }, payload: { reaction_emoji: ${JSON.stringify(reactionEmoji)} }`);

        try {
          const { data: reactionUpdateData, error: reactionUpdateError } = await supabase
            .from('messages')
            .update({ reaction_emoji: reactionEmoji })
            .eq('wamid', reactedWamid)
            .select();

          if (reactionUpdateError) {
            console.error('[WEBHOOK] ❌ ERROR ACTUALIZANDO REACCIÓN EN SUPABASE:', reactionUpdateError);
          } else {
            console.log(`[WEBHOOK] ✅ Reacción guardada correctamente:`, reactionUpdateData);
          }
        } catch (error) {
          console.error('[WEBHOOK] ❌ ERROR FATAL PROCESANDO REACCIÓN:', error);
        }

        console.log(`[WEBHOOK - POST /] ==> ✅ FIN PROCESAMIENTO DE REACCIÓN`);
        console.log(`======================================================\n`);
        return;
      }

      try {
        console.log(`\n------------------------------------------------------`);
        console.log(`[WEBHOOK] ==> A. RESOLUCIÓN DE SESIÓN/CONSULTA (activa, expirada o nueva)`);

        let conversationId, isNewSession;
        let isRatingReply = false;

        const rawTextForRating = messageType === 'text' ? waMessage.text.body : null;
        const pendingRatingConv = await getConversationAwaitingRating(clientPhone);

        if (pendingRatingConv && rawTextForRating && isValidRatingReply(rawTextForRating)) {
          console.log(`[WEBHOOK] -> Respuesta a la encuesta de satisfacción detectada para la consulta ${pendingRatingConv.id}.`);
          conversationId = pendingRatingConv.id;
          isNewSession = false;
          isRatingReply = true;
        } else {
          if (pendingRatingConv) {
            console.log(`[WEBHOOK] -> Había una encuesta pendiente en ${pendingRatingConv.id} pero no se respondió con un número válido (1-5); se descartan todas las encuestas pendientes de ${clientPhone}.`);
            await descartarEncuestaPendiente(clientPhone);
          }
          const { conversation, isNewSession: isNew } = await findOrCreateSession(clientPhone, clientName);
          conversationId = conversation.id;
          isNewSession = isNew;
        }

        console.log(`[WEBHOOK] -> Consulta resuelta ID: ${conversationId} | ¿Es sesión nueva?: ${isNewSession} | ¿Es respuesta de calificación?: ${isRatingReply}`);

        console.log(`\n------------------------------------------------------`);
        console.log(`[WEBHOOK] ==> B. EXTRACCIÓN DE CONTENIDO (${messageType})`);
        
        let messageText = '';
        let mediaUrl = null;
        let mediaTypeDB = null;
        let previewText = '';
        // Texto que se le pasa a la lógica del bot: normalmente es igual a messageText,
        // salvo en respuestas interactivas, donde el bot necesita el ID de la opción
        // presionada (ej. "1", "carrito") y no el título visible del botón/fila.
        let botInputText = '';

        if (messageType === 'text') {
          console.log(`[WEBHOOK] -> Entró al bloque de texto`);
          messageText = waMessage.text.body;
          previewText = messageText;
          botInputText = messageText;
          mediaTypeDB = 'text';
          console.log(`[WEBHOOK] -> Texto extraído: "${messageText}"`);
        } else if (messageType === 'interactive') {
          console.log(`[WEBHOOK] -> Entró al bloque interactivo (botón o lista)`);
          const buttonReply = waMessage.interactive?.button_reply;
          const listReply = waMessage.interactive?.list_reply;
          const reply = buttonReply || listReply;

          if (reply) {
            // Se guarda el título legible en el historial del CRM, pero se procesa
            // como si el cliente hubiera escrito el ID de la opción (ej. "1", "carrito").
            messageText = reply.title || reply.id;
            previewText = messageText;
            botInputText = reply.id;
            mediaTypeDB = 'text';
            console.log(`[WEBHOOK] -> Opción interactiva seleccionada: id="${reply.id}", title="${reply.title}"`);
          } else {
            console.warn('[WEBHOOK] ⚠️ Mensaje interactivo sin button_reply ni list_reply reconocible.');
          }
        } else if (messageType === 'location') {
          console.log(`[WEBHOOK] -> Entró al bloque de ubicación`);
          const loc = waMessage.location || {};
          mediaTypeDB = 'location';
          messageText = JSON.stringify({
            lat: loc.latitude,
            lng: loc.longitude,
            name: loc.name || null,
            address: loc.address || null
          });
          previewText = '📍 Ubicación compartida';
          botInputText = messageText; // el bot lo parsea como JSON cuando está esperando ubicación
          console.log(`[WEBHOOK] -> Coordenadas extraídas: lat=${loc.latitude}, lng=${loc.longitude}`);
        } else if (messageType === 'image' || messageType === 'document' || messageType === 'audio' || messageType === 'video') {
          console.log(`[WEBHOOK] -> Entró al bloque de multimedia/documento`);
          const mediaId = waMessage[messageType].id;
          const nombreOriginal = messageType === 'document' ? (waMessage.document.filename || '') : '';
          mediaTypeDB = messageType === 'image' ? 'image' : (messageType === 'document' ? 'document' : (messageType === 'video' ? 'video' : (messageType === 'audio' ? 'audio' : 'text')));
          console.log(`[WEBHOOK] -> Media ID: ${mediaId}, DB Type: ${mediaTypeDB}`);

          console.log(`[WEBHOOK] -> Solicitando descarga de media a whatsapp.js...`);
          const mediaData = await downloadWhatsAppMedia(mediaId);

          let bloqueadoPorSeguridad = false;
          let motivoBloqueo = '';

          if (mediaData && mediaData.arrayBuffer) {
              console.log(`[WEBHOOK] -> Media descargada exitosamente. Mime: ${mediaData.mimeType}`);
              const buffer = Buffer.from(mediaData.arrayBuffer);
              const esPdf = messageType === 'document' && esDocumentoPdf(mediaData.mimeType, nombreOriginal);

              if (esPdf) {
                console.log(`[WEBHOOK] -> Documento detectado como PDF. Corriendo análisis de seguridad previo...`);
                const { seguro, motivos } = analizarPdf(buffer);
                if (!seguro) {
                  bloqueadoPorSeguridad = true;
                  motivoBloqueo = motivos.join('; ');
                  console.warn(`[WEBHOOK] 🚫 PDF BLOQUEADO por seguridad (no se sube a Storage). Motivo: ${motivoBloqueo}`);
                } else {
                  mediaTypeDB = 'pdf';
                  console.log(`[WEBHOOK] ✅ El PDF pasó el análisis de seguridad.`);
                }
              }

              if (!bloqueadoPorSeguridad) {
                // Si ya confirmamos por la firma binaria que es un PDF, forzamos
                // extensión/content-type limpios ("application/pdf") en vez de
                // confiar en lo que haya devuelto Meta (a veces manda un mime
                // genérico como application/octet-stream para documentos, lo que
                // hacía que el navegador no supiera renderizarlo ni nombrarlo bien).
                const extension = mediaTypeDB === 'pdf' ? 'pdf' : mediaData.extension;
                const contentType = mediaTypeDB === 'pdf' ? 'application/pdf' : mediaData.mimeType;
                const fileName = `${conversationId}_${Date.now()}.${extension}`;
                console.log(`[WEBHOOK] -> Subiendo a Supabase Storage bucket 'media' como: ${fileName} (content-type: ${contentType})`);

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(fileName, mediaData.arrayBuffer, {
                        contentType,
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
              }
          } else {
              console.warn(`[WEBHOOK] ⚠️ Falló la descarga de media o arrayBuffer está vacío.`);
          }

          if (bloqueadoPorSeguridad) {
              mediaTypeDB = 'blocked_pdf';
              mediaUrl = null;
              messageText = `⚠️ Se bloqueó un archivo PDF por motivos de seguridad: ${motivoBloqueo}.`;
              previewText = '🚫 Archivo PDF bloqueado por seguridad';
          } else {
              const caption = waMessage[messageType].caption || '';
              // Las notas de voz de WhatsApp no llevan caption ni nombre de
              // archivo: dejamos message_text vacío para no mostrar un
              // placeholder tipo "[Archivo recibido: audio]" debajo del
              // reproductor en MessageBubble.
              messageText = caption || (messageType === 'audio' ? '' : (nombreOriginal || `[Archivo recibido: ${messageType}]`));
              const etiquetaPreview = messageType === 'image' ? '📷 Imagen' : messageType === 'video' ? '🎥 Video' : messageType === 'audio' ? '🎤 Nota de voz' : (mediaTypeDB === 'pdf' ? '📄 PDF' : '📎 Archivo');
              previewText = etiquetaPreview + (caption ? ` - ${caption}` : '');
          }
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
        console.log(`🔍 [DEBUG-WEBHOOK] 📡 Consulta Supabase - tabla: messages, operación: insert, filtros: N/A (insert simple)`);

        const { data: insertData, error: insertError } = await supabase.from('messages').insert([messagePayload]).select();

        if (insertError) {
           console.error('[WEBHOOK] ❌ ERROR FATAL INSERTANDO MENSAJE EN SUPABASE:', insertError);
        } else {
           console.log(`[WEBHOOK] ✅ Mensaje insertado correctamente:`, insertData);
        }

        console.log(`\n------------------------------------------------------`);
        console.log(`[WEBHOOK] ==> D. ACTUALIZACIÓN DE ÚLTIMO MENSAJE EN CONVERSACIÓN`);
        console.log(`[WEBHOOK] -> Payload update 'conversations': { last_message: "${previewText}", prewarning_sent_at: null } para ID: ${conversationId}`);
        console.log(`🔍 [DEBUG-WEBHOOK] 📡 Consulta Supabase - tabla: conversations, operación: update, filtros: { id: "${conversationId}" }`);

        // prewarning_sent_at se limpia acá: el cliente escribió, así que si más
        // adelante vuelve a quedar inactivo tiene que poder recibir el aviso
        // preventivo de nuevo (ver server/services/sessionExpiryChecker.js).
        const { data: updateData, error: updateError } = await supabase.from('conversations')
          .update({ last_message: previewText, prewarning_sent_at: null })
          .eq('id', conversationId)
          .select();
          
        if (updateError) {
           console.error('[WEBHOOK] ❌ ERROR ACTUALIZANDO LAST_MESSAGE EN SUPABASE:', updateError);
        } else {
           console.log(`[WEBHOOK] ✅ last_message actualizado correctamente:`, updateData);
        }
        
        console.log(`[WEBHOOK - POST /] ==> ✅ FIN PROCESAMIENTO EXITOSO DEL EVENTO`);
        console.log(`======================================================\n`);
        
        console.log(`\n------------------------------------------------------`);
        console.log(`[WEBHOOK] ==> E. CHEQUEO DE BLOQUEO (moderación admin)`);
        const bloqueo = await estaClienteBloqueado(clientPhone);
        console.log(`[WEBHOOK] -> ¿Cliente bloqueado?: ${!!bloqueo}`);

        if (bloqueo) {
          // El mensaje ya quedó guardado arriba (paso C), para que el admin
          // tenga registro en el chat reportado — pero a partir de acá no se
          // procesa nada más: ni respuesta del bot, ni encuesta de
          // calificación, ni derivación a ninguna sucursal (ver
          // supabase/moderacion_bloqueo_clientes.sql y
          // server/services/moderacion.js).
          console.log(`[WEBHOOK] -> Cliente bloqueado (motivo: "${bloqueo.motivo}"), no se procesa ni se responde nada.`);
        } else if (isRatingReply) {
           const valor = Number(messageText.trim());
           if (pendingRatingConv.bot_state === 'awaiting_rating') {
             console.log(`[WEBHOOK] -> Guardando calificación de atención: ${valor}`);
             await guardarCalificacionAtencion(conversationId, clientPhone, valor);
           } else {
             console.log(`[WEBHOOK] -> Guardando calificación de producto: ${valor}`);
             await guardarCalificacionProducto(conversationId, clientPhone, valor);
           }
        } else if (isNewSession || messageType === 'text' || messageType === 'interactive' || messageType === 'location') {
           // Si es sesión nueva, se manda la bienvenida sin importar el tipo de mensaje;
           // si la sesión ya estaba activa, se procesan mensajes de texto (menú 1/2),
           // respuestas interactivas (botón/lista presionado, usando su ID como comando)
           // y ubicaciones (solo tienen efecto si el bot está esperando una, ver bot.js).
           console.log(`[WEBHOOK] -> Derivando mensaje a la lógica del bot (input: "${botInputText}")...`);
           await procesarMensajeBot(botInputText, conversationId, clientPhone, isNewSession);
        }

      } catch (error) {
        console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
        console.error(`[WEBHOOK] ❌ ERROR FATAL CAPTURADO EN EL CATCH PRINCIPAL:`);
        console.error(error.stack || error);
        console.error(`🔍 [DEBUG-WEBHOOK] ❌ Error completo - message: ${error?.message}, name: ${error?.name}, stack:`, error?.stack);
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
