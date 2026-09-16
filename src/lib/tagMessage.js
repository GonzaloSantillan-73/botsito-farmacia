import { adminFetch } from './adminAuth';

// Marca (o desmarca, con tag: null) un mensaje con adjunto como "el"
// comprobante o "la" receta oficial de su conversación (ver server/routes/api.js
// PATCH /messages/:id/tag). Se usa desde cualquier pantalla que muestre
// mensajes de un chat (chat activo, historial de un cliente, trazabilidad de
// Métricas), para que el operador pueda marcarlo aunque se haya olvidado
// mientras hablaba con el cliente y la consulta ya esté finalizada.
export const tagMessage = async (messageId, tag) => {
  const res = await adminFetch(`/api/messages/${messageId}/tag`, {
    method: 'PATCH',
    body: JSON.stringify({ tag })
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('❌ [DEBUG-LIB-TAGMESSAGE] tagMessage() — error:', data.error || 'No se pudo marcar el archivo.');
    throw new Error(data.error || 'No se pudo marcar el archivo.');
  }
  return data.message;
};

// Réplica local de la exclusividad que ya aplica el backend (sólo un mensaje
// puede tener cada tag por conversación): dado el array de mensajes que tiene
// en memoria la pantalla que llama, y el mensaje recién actualizado, devuelve
// el array con ese mensaje actualizado y cualquier otro que tuviera el mismo
// tag desmarcado — así las pantallas que no están suscriptas a Realtime
// (HistoryPanel, ChatTraceModal) reflejan el cambio al instante sin refetch.
export const aplicarTagLocal = (mensajes, mensajeActualizado) => {
  return mensajes.map(m => {
    if (m.id === mensajeActualizado.id) return mensajeActualizado;
    if (mensajeActualizado.tagged_as && m.conversation_id === mensajeActualizado.conversation_id && m.tagged_as === mensajeActualizado.tagged_as) {
      return { ...m, tagged_as: null };
    }
    return m;
  });
};
