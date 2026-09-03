import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID; 
const API_URL = `https://graph.facebook.com/v22.0/${PHONE_ID}/messages`;

export const sendWhatsAppMessage = async (to, text, mediaUrl = null, mediaType = null) => {
  console.log(`\n======================================================`);
  console.log(`[SERVICES/WHATSAPP - sendWhatsAppMessage] ==> INICIO DE FUNCIÓN`);
  console.log(`[SERVICES/WHATSAPP] ==> Parámetros recibidos: to="${to}", text="${text}", mediaUrl="${mediaUrl}", mediaType="${mediaType}"`);
  
  try {
    let cleanTo = to.replace(/[\s\+\-]/g, '');
    console.log(`[SERVICES/WHATSAPP] -> Teléfono limpio para enviar: ${cleanTo}`);

    if (!TOKEN || !PHONE_ID) {
      console.warn('[SERVICES/WHATSAPP] ⚠️ ALERTA: WHATSAPP_TOKEN o PHONE_NUMBER_ID no están configurados.');
    }

    let payload = {
        messaging_product: 'whatsapp',
        to: cleanTo
    };

    if (mediaUrl) {
        console.log(`[SERVICES/WHATSAPP] -> Condición: Se detectó mediaUrl. Preparando payload multimedia.`);
        const validTypes = ['image', 'document', 'audio', 'video'];
        const type = validTypes.includes(mediaType) ? mediaType : 'document';
        console.log(`[SERVICES/WHATSAPP] -> Tipo de medio resuelto: ${type}`);
        
        payload.type = type;
        payload[type] = {
            link: mediaUrl
        };
        
        if (text && (type === 'image' || type === 'video' || type === 'document')) {
            console.log(`[SERVICES/WHATSAPP] -> Condición: Agregando text como caption.`);
            payload[type].caption = text;
        }
    } else {
        console.log(`[SERVICES/WHATSAPP] -> Condición: No hay mediaUrl. Preparando payload de texto plano.`);
        payload.type = 'text';
        payload.text = { body: text };
    }

    console.log(`\n------------------------------------------------------`);
    console.log(`[SERVICES/WHATSAPP] ==> LLAMADA A FETCH (META API)`);
    console.log(`[SERVICES/WHATSAPP] -> URL de Meta: ${API_URL}`);
    console.log(`[SERVICES/WHATSAPP] -> Headers: Authorization: Bearer ${TOKEN ? TOKEN.substring(0,6) + '...' : 'UNDEFINED'}, Content-Type: application/json`);
    console.log(`[SERVICES/WHATSAPP] -> Payload completo enviado a Meta:`, JSON.stringify(payload, null, 2));

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN ? TOKEN.trim() : ''}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log(`[SERVICES/WHATSAPP] -> Status HTTP de respuesta: ${response.status} ${response.statusText}`);
    const data = await response.json();
    console.log(`[SERVICES/WHATSAPP] -> Body de respuesta de Meta crudo:`, JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error(`[SERVICES/WHATSAPP] ❌ LA API DE META DEVOLVIÓ UN ERROR HTTP NO OK.`);
      throw new Error(data.error?.message || 'Error desconocido de Meta');
    }

    console.log(`[SERVICES/WHATSAPP] ==> ✅ FIN EXITOSO DE ENVÍO META. Message ID: ${data.messages?.[0]?.id}`);
    console.log(`======================================================\n`);
    return data;
  } catch (error) {
    console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    console.error(`[SERVICES/WHATSAPP - sendWhatsAppMessage CATCH BLOCK] ❌ ERROR FATAL:`);
    console.error(error.stack || error);
    console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
    throw error;
  }
};

export const downloadWhatsAppMedia = async (mediaId) => {
  console.log(`\n======================================================`);
  console.log(`[SERVICES/WHATSAPP - downloadWhatsAppMedia] ==> INICIO DE FUNCIÓN`);
  console.log(`[SERVICES/WHATSAPP] ==> Media ID recibido: ${mediaId}`);
  
  try {
    const metaUrl = `https://graph.facebook.com/v22.0/${mediaId}`;
    console.log(`[SERVICES/WHATSAPP] -> 1. Solicitando URL de descarga a Meta: ${metaUrl}`);
    
    const mediaUrlResponse = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    
    console.log(`[SERVICES/WHATSAPP] -> Respuesta de URL Status: ${mediaUrlResponse.status}`);
    const mediaData = await mediaUrlResponse.json();
    console.log(`[SERVICES/WHATSAPP] -> Datos de la media devueltos por Meta crudos:`, JSON.stringify(mediaData, null, 2));
    
    if (!mediaUrlResponse.ok) {
        console.error(`[SERVICES/WHATSAPP] ❌ FALLÓ LA OBTENCIÓN DE LA URL DEL MEDIA.`);
        throw new Error(mediaData.error?.message || 'Error obteniendo URL de media');
    }
    
    console.log(`[SERVICES/WHATSAPP] -> 2. Descargando el archivo binario desde la URL: ${mediaData.url}`);
    const fileResponse = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    
    console.log(`[SERVICES/WHATSAPP] -> Respuesta del binario Status: ${fileResponse.status}`);
    
    if (!fileResponse.ok) {
        console.error(`[SERVICES/WHATSAPP] ❌ FALLÓ LA DESCARGA DEL ARCHIVO BINARIO.`);
        throw new Error('Error al descargar los bytes del archivo');
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const mimeType = fileResponse.headers.get('content-type');
    const extension = mimeType ? mimeType.split('/')[1] : 'bin';
    
    console.log(`[SERVICES/WHATSAPP] -> 3. Procesamiento binario exitoso.`);
    console.log(`[SERVICES/WHATSAPP] -> MimeType: ${mimeType}, Extension: ${extension}, Bytes Size: ${arrayBuffer.byteLength}`);

    console.log(`[SERVICES/WHATSAPP] ==> ✅ FIN EXITOSO DE DESCARGA DE MEDIA`);
    console.log(`======================================================\n`);
    
    return {
       arrayBuffer,
       mimeType,
       extension
    }; 
  } catch (error) {
    console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    console.error(`[SERVICES/WHATSAPP - downloadWhatsAppMedia CATCH BLOCK] ❌ ERROR FATAL:`);
    console.error(error.stack || error);
    console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
    return null;
  }
};
