// Reclama una conversación de la cola general para la propia sucursal. Pasa
// por el backend (en vez de escribir directo a Supabase) porque ahí es donde
// se valida que siga libre (evita que dos sucursales se la "roben" si tocan
// Tomar casi al mismo tiempo) y se le avisa al cliente por WhatsApp qué
// sucursal lo va a atender y dónde queda (ver server/services/tomaConsulta.js).
export const tomarConsulta = async (conversationId, sucursalId) => {
  const res = await fetch(`/api/conversations/${conversationId}/take`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sucursalId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo tomar la consulta.');
  return data.conversation;
};
