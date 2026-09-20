import { adminFetch } from './adminAuth';

// Reclama una conversación para la propia sucursal: de la cola general
// ('esperando', sin sucursal) o directamente de una que el bot todavía está
// atendiendo solo, sin que el cliente haya pedido un humano ("interferir",
// ver esModoBot en ChatArea.jsx). Pasa por el backend (en vez de escribir
// directo a Supabase) porque ahí es donde se valida que siga libre (evita
// que dos sucursales se la "roben" si tocan Tomar casi al mismo tiempo, ver
// server/services/tomaConsulta.js). A propósito NO le manda ningún mensaje
// al cliente: de cara a él, la asignación es puramente interna, sin ningún
// aviso ni re-saludo. Va con el token de sesión: el backend rechaza esta
// acción para el rol admin (solo supervisión, ver requireAuth/
// blockAdminRole en server/routes/api.js).
export const tomarConsulta = async (conversationId, sucursalId) => {
  const res = await adminFetch(`/api/conversations/${conversationId}/take`, {
    method: 'POST',
    body: JSON.stringify({ sucursalId })
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('❌ [DEBUG-LIB-TOMARCONSULTA] tomarConsulta() — error:', data.error || 'No se pudo tomar la consulta.');
    throw new Error(data.error || 'No se pudo tomar la consulta.');
  }
  return data.conversation;
};
