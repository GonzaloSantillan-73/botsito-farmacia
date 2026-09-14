import { supabase } from '../supabase.js';

const CONVERSATION_SELECT = '*, sucursal_actual:sucursales!sucursal_id(nombre), sucursal_primera:sucursales!primera_sucursal_id(nombre)';

// Mismo criterio que la bandeja principal y las métricas: un empleado de
// sucursal sólo ve las consultas que atendió su sucursal, o las que todavía
// no tienen sucursal asignada; con sucursalId null (admin) no se acota nada.
const conSucursal = (query, sucursalId) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] conSucursal() — parámetros recibidos:', { sucursalId });
  const resultado = sucursalId ? query.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`) : query;
  console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] conSucursal() — filtro aplicado:', sucursalId ? `sucursal_id.eq.${sucursalId},sucursal_id.is.null` : '(sin filtro, sucursalId ausente)');
  return resultado;
};

export const obtenerConversacionesDirectorio = async ({ sucursalId } = {}) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerConversacionesDirectorio() — parámetros recibidos:', { sucursalId });

  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Query Supabase → tabla: conversations, operación: select, filtro sucursal:', sucursalId, ', order: created_at desc');
  const query = conSucursal(supabase.from('conversations').select(CONVERSATION_SELECT), sucursalId);
  const { data: conversations, error } = await query.order('created_at', { ascending: false });
  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Resultado query conversations (select directorio) — data:', conversations, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerConversacionesDirectorio() — error consultando conversaciones:', error);
    throw error;
  }

  const phones = [...new Set((conversations || []).map(c => c.client_phone).filter(Boolean))];
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerConversacionesDirectorio() — teléfonos únicos encontrados:', phones);

  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Query Supabase → tabla: clientes, operación: select, filtro: client_phone in', phones);
  const { data: clientes, error: clientesError } = phones.length
    ? await supabase.from('clientes').select('client_phone, nombre_completo').in('client_phone', phones)
    : { data: [] };
  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Resultado query clientes (select nombres) — data:', clientes, 'error:', clientesError);
  if (clientesError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerConversacionesDirectorio() — error consultando clientes:', clientesError);
    throw clientesError;
  }

  const phoneMap = {};
  (clientes || []).forEach(c => { if (c.nombre_completo) phoneMap[c.client_phone] = c.nombre_completo; });
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerConversacionesDirectorio() — phoneMap construido:', phoneMap);

  const resultado = (conversations || []).map(c => ({ ...c, real_name: phoneMap[c.client_phone] || null }));
  console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerConversacionesDirectorio() — valor de retorno:', resultado);
  return resultado;
};

// Recalcula del lado del servidor qué conversation_id son visibles para este
// usuario (mismo criterio de arriba) e intersecta con los que pidió el
// frontend, para que un empleado de sucursal no pueda buscar texto dentro de
// mensajes de una conversación de otra sucursal aunque conozca su id.
export const buscarEnMensajesDirectorio = async ({ conversationIds, q, sucursalId }) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] buscarEnMensajesDirectorio() — parámetros recibidos:', { conversationIds, q, sucursalId });

  const ids = Array.isArray(conversationIds) ? conversationIds.filter(Boolean) : [];
  const texto = (q || '').trim();
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] buscarEnMensajesDirectorio() — ids filtrados:', ids, ', texto de búsqueda:', texto);
  if (ids.length === 0 || !texto) {
    const resultadoVacio = { matchingIds: [], snippets: {} };
    console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] buscarEnMensajesDirectorio() — valor de retorno (sin ids o sin texto):', resultadoVacio);
    return resultadoVacio;
  }

  let permitidos = ids;
  if (sucursalId) {
    console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Query Supabase → tabla: conversations, operación: select, filtro: id in', ids, ', sucursal:', sucursalId);
    const permQuery = conSucursal(supabase.from('conversations').select('id').in('id', ids), sucursalId);
    const { data: propias, error: propiasError } = await permQuery;
    console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Resultado query conversations (select permitidas) — data:', propias, 'error:', propiasError);
    if (propiasError) {
      console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] buscarEnMensajesDirectorio() — error consultando conversaciones permitidas:', propiasError);
      throw propiasError;
    }
    permitidos = (propias || []).map(c => c.id);
  }
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] buscarEnMensajesDirectorio() — ids permitidos tras filtrar por sucursal:', permitidos);
  if (permitidos.length === 0) {
    const resultadoVacio = { matchingIds: [], snippets: {} };
    console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] buscarEnMensajesDirectorio() — valor de retorno (sin permitidos):', resultadoVacio);
    return resultadoVacio;
  }

  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Query Supabase → tabla: messages, operación: select, filtro: conversation_id in', permitidos, ', ilike message_text %', texto, '%');
  const { data: mensajes, error } = await supabase
    .from('messages')
    .select('conversation_id, message_text, created_at')
    .in('conversation_id', permitidos)
    .ilike('message_text', `%${texto}%`)
    .order('created_at', { ascending: true });
  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Resultado query messages (select búsqueda) — data:', mensajes, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] buscarEnMensajesDirectorio() — error buscando en mensajes:', error);
    throw error;
  }

  const idsSet = new Set();
  const snippets = {};
  (mensajes || []).forEach(m => {
    idsSet.add(m.conversation_id);
    if (!snippets[m.conversation_id]) snippets[m.conversation_id] = m.message_text;
  });

  const resultado = { matchingIds: [...idsSet], snippets };
  console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] buscarEnMensajesDirectorio() — valor de retorno:', resultado);
  return resultado;
};
