import { supabase } from '../supabase.js';

// El nombre de archivo en Supabase Storage es el último segmento de la URL
// pública (ver el patrón de armado en webhook.js/ChatArea.jsx:
// `${conversationId}_${timestamp}.${ext}`, sin subcarpetas), así que alcanza
// con cortar todo lo anterior a "/media/" y decodificar la URL.
const storagePathDeUrl = (mediaUrl) => decodeURIComponent(mediaUrl.split('/media/').pop());

// Purga un archivo adjunto de un mensaje (cualquier conversación, lo mande
// quien lo mande): lo borra de Storage y reemplaza el mensaje por un
// placeholder con el motivo (ver MessageBubble.jsx, media_type
// 'file_deleted'). No se pisa message_text: sirve para conservar el caption
// original si alguna vez hiciera falta auditarlo.
export const purgarArchivoMensaje = async ({ messageId, motivo }) => {
  console.log('🔍 [DEBUG-SERVICE-MODERACION] purgarArchivoMensaje() — parámetros recibidos:', { messageId, motivo });

  const { data: msg, error: msgError } = await supabase
    .from('messages')
    .select('id, media_url, media_type')
    .eq('id', messageId)
    .single();
  console.log('📡 [DEBUG-SERVICE-MODERACION] purgarArchivoMensaje() — resultado select messages — data:', msg, 'error:', msgError);
  if (msgError || !msg) {
    console.error('❌ [DEBUG-SERVICE-MODERACION] purgarArchivoMensaje() — mensaje no encontrado:', msgError);
    throw new Error('Mensaje no encontrado.');
  }
  if (!msg.media_url) {
    throw new Error('Este mensaje no tiene ningún archivo adjunto.');
  }

  const storagePath = storagePathDeUrl(msg.media_url);
  console.log('📡 [DEBUG-SERVICE-MODERACION] purgarArchivoMensaje() — borrando de Storage, bucket: media, path:', storagePath);
  const { error: removeError } = await supabase.storage.from('media').remove([storagePath]);
  if (removeError) {
    // No se corta el flujo: igual queremos que el mensaje quede purgado del
    // chat aunque el archivo ya no esté en Storage (o el borrado falle por
    // algún motivo puntual) — lo importante para la moderación es que deje
    // de mostrarse el contenido en el chat.
    console.error('⚠️ [DEBUG-SERVICE-MODERACION] purgarArchivoMensaje() — no se pudo borrar el archivo de Storage (se sigue igual con el mensaje):', removeError);
  }

  // A propósito NO se toca media_type: sigue siendo 'image'/'video'/'audio'/
  // 'document'/'pdf' como antes de la purga, para que MessageBubble.jsx
  // pueda mostrar qué tipo de archivo era en el placeholder. media_url NULL
  // + deleted_reason es lo que dispara ese placeholder (ver ahí).
  const { data: updated, error: updateError } = await supabase
    .from('messages')
    .update({ media_url: null, deleted_reason: motivo })
    .eq('id', messageId)
    .select()
    .single();
  console.log('📡 [DEBUG-SERVICE-MODERACION] purgarArchivoMensaje() — resultado update messages — data:', updated, 'error:', updateError);
  if (updateError) {
    console.error('❌ [DEBUG-SERVICE-MODERACION] purgarArchivoMensaje() — error actualizando mensaje:', updateError);
    throw updateError;
  }

  console.log('✅ [DEBUG-SERVICE-MODERACION] purgarArchivoMensaje() — valor de retorno:', updated);
  return updated;
};
