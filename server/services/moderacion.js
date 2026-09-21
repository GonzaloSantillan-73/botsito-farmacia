import { supabase } from '../supabase.js';

// Mientras exista una fila acá para ese teléfono, el cliente está bloqueado:
// lo consulta el webhook (ver server/routes/webhook.js) antes de dejar que
// el bot le responda, y ChatArea.jsx antes de mostrar/ocultar el botón
// "Bloquear cliente" en un chat reportado.
export const estaClienteBloqueado = async (clientPhone) => {
  console.log('🔍 [DEBUG-SERVICE-MODERACION] estaClienteBloqueado() — parámetros recibidos:', { clientPhone });

  const { data, error } = await supabase
    .from('clientes_bloqueados')
    .select('*')
    .eq('client_phone', clientPhone)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-MODERACION] estaClienteBloqueado() — resultado select clientes_bloqueados — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-MODERACION] estaClienteBloqueado() — error consultando clientes_bloqueados:', error);
    throw error;
  }

  console.log('✅ [DEBUG-SERVICE-MODERACION] estaClienteBloqueado() — valor de retorno:', !!data);
  return data;
};

// Bloquea un cliente a partir de un chat ya reportado (ver CloseChatModal.jsx
// / ChatArea.jsx). La contraseña ya se validó en la ruta (requireAdminRole +
// verificarPasswordPropia) antes de llamar a esto — acá sólo se persiste.
export const bloquearCliente = async ({ clientPhone, motivo, reportedConversationId, blockedByUsername }) => {
  console.log('🔍 [DEBUG-SERVICE-MODERACION] bloquearCliente() — parámetros recibidos:', { clientPhone, motivo, reportedConversationId, blockedByUsername });

  const { data, error } = await supabase
    .from('clientes_bloqueados')
    .insert([{
      client_phone: clientPhone,
      motivo,
      reported_conversation_id: reportedConversationId || null,
      blocked_by_username: blockedByUsername
    }])
    .select()
    .single();
  console.log('📡 [DEBUG-SERVICE-MODERACION] bloquearCliente() — resultado insert clientes_bloqueados — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-MODERACION] bloquearCliente() — error insertando bloqueo:', error);
    if (error.code === '23505') throw new Error('Este cliente ya está bloqueado.');
    throw error;
  }

  console.log('✅ [DEBUG-SERVICE-MODERACION] bloquearCliente() — valor de retorno:', data);
  return data;
};

// El nombre de archivo en Supabase Storage es el último segmento de la URL
// pública (ver el mismo patrón de armado en webhook.js/ChatArea.jsx:
// `${conversationId}_${timestamp}.${ext}`, sin subcarpetas), así que alcanza
// con cortar todo lo anterior a "/media/" y decodificar la URL.
const storagePathDeUrl = (mediaUrl) => decodeURIComponent(mediaUrl.split('/media/').pop());

// Purga un archivo adjunto de un mensaje: lo borra de Storage y reemplaza el
// mensaje por un placeholder con el motivo (ver MessageBubble.jsx,
// media_type 'file_deleted'). No se pisa message_text: sirve para conservar
// el caption original si alguna vez hiciera falta auditarlo.
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
    // de mostrarse el contenido obsceno en el chat.
    console.error('⚠️ [DEBUG-SERVICE-MODERACION] purgarArchivoMensaje() — no se pudo borrar el archivo de Storage (se sigue igual con el mensaje):', removeError);
  }

  const { data: updated, error: updateError } = await supabase
    .from('messages')
    .update({ media_url: null, media_type: 'file_deleted', deleted_reason: motivo })
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
