import { supabase } from '../supabase.js';

const CONVERSATION_SELECT = '*, sucursal_actual:sucursales!sucursal_id(nombre), sucursal_primera:sucursales!primera_sucursal_id(nombre)';

// Mismo criterio que la bandeja principal y las métricas: un empleado de
// sucursal sólo ve las consultas que atendió su sucursal, o las que todavía
// no tienen sucursal asignada; con sucursalId null (admin) no se acota nada.
const conSucursal = (query, sucursalId) =>
  sucursalId ? query.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`) : query;

export const obtenerConversacionesDirectorio = async ({ sucursalId } = {}) => {
  const query = conSucursal(supabase.from('conversations').select(CONVERSATION_SELECT), sucursalId);
  const { data: conversations, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;

  const phones = [...new Set((conversations || []).map(c => c.client_phone).filter(Boolean))];
  const { data: clientes, error: clientesError } = phones.length
    ? await supabase.from('clientes').select('client_phone, nombre_completo').in('client_phone', phones)
    : { data: [] };
  if (clientesError) throw clientesError;

  const phoneMap = {};
  (clientes || []).forEach(c => { if (c.nombre_completo) phoneMap[c.client_phone] = c.nombre_completo; });

  return (conversations || []).map(c => ({ ...c, real_name: phoneMap[c.client_phone] || null }));
};

// Recalcula del lado del servidor qué conversation_id son visibles para este
// usuario (mismo criterio de arriba) e intersecta con los que pidió el
// frontend, para que un empleado de sucursal no pueda buscar texto dentro de
// mensajes de una conversación de otra sucursal aunque conozca su id.
export const buscarEnMensajesDirectorio = async ({ conversationIds, q, sucursalId }) => {
  const ids = Array.isArray(conversationIds) ? conversationIds.filter(Boolean) : [];
  const texto = (q || '').trim();
  if (ids.length === 0 || !texto) return { matchingIds: [], snippets: {} };

  let permitidos = ids;
  if (sucursalId) {
    const permQuery = conSucursal(supabase.from('conversations').select('id').in('id', ids), sucursalId);
    const { data: propias, error: propiasError } = await permQuery;
    if (propiasError) throw propiasError;
    permitidos = (propias || []).map(c => c.id);
  }
  if (permitidos.length === 0) return { matchingIds: [], snippets: {} };

  const { data: mensajes, error } = await supabase
    .from('messages')
    .select('conversation_id, message_text, created_at')
    .in('conversation_id', permitidos)
    .ilike('message_text', `%${texto}%`)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const idsSet = new Set();
  const snippets = {};
  (mensajes || []).forEach(m => {
    idsSet.add(m.conversation_id);
    if (!snippets[m.conversation_id]) snippets[m.conversation_id] = m.message_text;
  });

  return { matchingIds: [...idsSet], snippets };
};
