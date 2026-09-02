import dotenv from 'dotenv';
import path from 'path';

// Asegurar la carga de variables de entorno (por si se ejecuta desde otro scope)
dotenv.config({ path: path.resolve('..', '.env') });
dotenv.config();

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID; 
// Usar versión v22.0 de la Graph API como solicitado
const API_URL = `https://graph.facebook.com/v22.0/${PHONE_ID}/messages`;

/**
 * Envía un mensaje o archivo a través de WhatsApp Cloud API
 * @param {string} to - Número de teléfono del destinatario
 * @param {string} text - Contenido del mensaje (o caption si es imagen)
 * @param {string} mediaUrl - URL pública del adjunto (opcional)
 * @param {string} mediaType - image, document, audio, video (opcional)
 */
export const sendWhatsAppMessage = async (to, text, mediaUrl = null, mediaType = null) => {
  try {
    console.log(`Intentando enviar mensaje a ${to}...`);

    console.log(`[DEBUG] PHONE_NUMBER_ID: ${PHONE_ID}`);
    console.log(`[DEBUG] WHATSAPP_TOKEN Length: ${TOKEN ? TOKEN.length : 0}, Starts with: ${TOKEN ? TOKEN.substring(0, 10) : 'N/A'}`);

    if (!TOKEN || !PHONE_ID) {
      console.warn('[WARNING] WHATSAPP_TOKEN o PHONE_NUMBER_ID no configurados. Verifica tu .env');
    }

    // Limpiar el número de teléfono (remover espacios, signos +, guiones)
    let cleanTo = to.replace(/[\s\+\-]/g, '');
    
    console.log(`[DEBUG] Teléfono formateado final enviado a Meta: ${cleanTo}`);

    let payload = {
        messaging_product: 'whatsapp',
        to: cleanTo
    };

    if (mediaUrl) {
        // Enviar adjunto
        const validTypes = ['image', 'document', 'audio', 'video'];
        const type = validTypes.includes(mediaType) ? mediaType : 'document';
        
        payload.type = type;
        payload[type] = {
            link: mediaUrl
        };
        
        // Si hay texto, Meta permite caption en algunos tipos
        if (text && (type === 'image' || type === 'video' || type === 'document')) {
            payload[type].caption = text;
        }
    } else {
        // Enviar texto
        payload.type = 'text';
        payload.text = { body: text };
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN ? TOKEN.trim() : ''}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[META GRAPH API ERROR]:', JSON.stringify(data, null, 2));
      throw new Error(data.error?.message || 'Error desconocido de Meta');
    }

    console.log(`[SUCCESS] Mensaje enviado a ${cleanTo}`);
    return data;
  } catch (error) {
    console.error(`[ERROR] enviando WhatsApp a ${to}:`, error.message);
    throw error;
  }
};

/**
 * Obtiene el Buffer del medio descargando de WhatsApp
 */
export const downloadWhatsAppMedia = async (mediaId) => {
  try {
    const mediaUrlResponse = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    
    const mediaData = await mediaUrlResponse.json();
    
    if (!mediaUrlResponse.ok) {
        throw new Error(mediaData.error?.message || 'Error obteniendo URL de media');
    }
    
    // Descargar el binario usando la URL que da Meta
    const fileResponse = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    
    if (!fileResponse.ok) {
        throw new Error('Error al descargar los bytes del archivo');
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const mimeType = fileResponse.headers.get('content-type');
    const extension = mimeType ? mimeType.split('/')[1] : 'bin';

    return {
       arrayBuffer,
       mimeType,
       extension
    }; 
  } catch (error) {
    console.error(`[ERROR] obteniendo media ${mediaId}:`, error.message);
    return null;
  }
};
