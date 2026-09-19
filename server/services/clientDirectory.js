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

// A diferencia de obtenerConversacionesDirectorio (una fila por CONSULTA,
// donde el client_phone tiene que quedar tal cual está en esa conversación:
// es el snapshot de con qué número se habló en esa sesión puntual, y no debe
// pisarse con el de `clientes`), esta es el registro maestro de PERSONAS para
// la pestaña "Lista de Clientes": una fila por client_phone VIGENTE en la
// tabla `clientes`, no un agrupado de conversaciones. Así, si el teléfono de
// alguien queda vinculado a un client_phone distinto (cambio de número
// migrado por DNI, o editado a mano por el admin — ver
// server/services/clientesAdmin.js), esta vista siempre refleja el número
// actual de su ficha, incluso si por algún motivo quedara alguna conversación
// vieja sin re-vincular.
//
// El universo de teléfonos visibles lo sigue marcando `conversations` (mismo
// alcance por sucursal que el resto del Directorio: `clientes` no tiene
// sucursal_id, así que filtrar esa tabla directamente filtraría a ciegas),
// pero el client_phone que se muestra y con el que se arma cada fila sale de
// `clientes` cuando existe ficha; si un teléfono todavía no tiene ficha
// propia (cliente a mitad del registro obligatorio), se muestra tal cual
// aparece en sus conversaciones — no hay otro dato del que sacarlo.
export const obtenerListaClientesDirectorio = async ({ sucursalId } = {}) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — parámetros recibidos:', { sucursalId });

  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Query Supabase → tabla: conversations, operación: select (agregados), filtro sucursal:', sucursalId);
  const query = conSucursal(supabase.from('conversations').select('client_phone, client_name, created_at, rating, product_rating'), sucursalId);
  const { data: conversaciones, error: convError } = await query;
  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Resultado query conversations (select agregados) — data:', conversaciones, 'error:', convError);
  if (convError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — error consultando conversaciones:', convError);
    throw convError;
  }

  const conversacionesPorTelefono = {};
  (conversaciones || []).forEach(c => {
    if (!c.client_phone) return;
    (conversacionesPorTelefono[c.client_phone] ||= []).push(c);
  });
  const phones = Object.keys(conversacionesPorTelefono);
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — teléfonos únicos encontrados:', phones);
  if (phones.length === 0) {
    console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — valor de retorno: [] (sin teléfonos)');
    return [];
  }

  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Query Supabase → tabla: clientes, operación: select, filtro: client_phone in', phones);
  const { data: clientes, error: clientesError } = await supabase
    .from('clientes')
    .select('client_phone, nombre_completo, dni')
    .in('client_phone', phones);
  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Resultado query clientes (select ficha) — data:', clientes, 'error:', clientesError);
  if (clientesError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — error consultando clientes:', clientesError);
    throw clientesError;
  }

  const fichaPorTelefono = {};
  (clientes || []).forEach(cl => { fichaPorTelefono[cl.client_phone] = cl; });

  const resultado = phones.map(phone => {
    const ficha = fichaPorTelefono[phone] || null;
    const convs = conversacionesPorTelefono[phone];
    const sorted = [...convs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const rated = convs.filter(c => c.rating != null);
    const avgRating = rated.length > 0 ? rated.reduce((sum, c) => sum + c.rating, 0) / rated.length : null;
    const ratedProduct = convs.filter(c => c.product_rating != null);
    const avgProductRating = ratedProduct.length > 0 ? ratedProduct.reduce((sum, c) => sum + c.product_rating, 0) / ratedProduct.length : null;
    return {
      // El client_phone de la ficha (cuando existe) es el que manda: es el
      // dato "vigente" que pide esta vista. Si todavía no hay ficha, no hay
      // otro teléfono del que sacarlo más que el de sus propias conversaciones.
      client_phone: ficha?.client_phone || phone,
      real_name: ficha?.nombre_completo || null,
      client_name: sorted[0]?.client_name || null,
      dni: ficha?.dni || null,
      total: convs.length,
      avgRating,
      avgProductRating,
      lastContact: sorted[0]?.created_at || null
    };
  }).sort((a, b) => new Date(b.lastContact) - new Date(a.lastContact));

  console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — valor de retorno:', resultado);
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
