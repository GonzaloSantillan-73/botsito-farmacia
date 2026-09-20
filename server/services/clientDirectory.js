import { supabase } from '../supabase.js';
import { resolverNombresPorTelefono } from './clientes.js';

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

// Secuencia COMPLETA (sin recortar a "primera y actual") de sucursales que
// tomaron o recibieron por derivación cada conversación, en orden
// cronológico (ver conversation_sucursal_historial.sql). A diferencia de
// primera_sucursal_id/sucursal_id (que sólo guardan dos puntos sueltos y
// pierden las sucursales intermedias si hubo varios ciclos de "devolver a
// la cola"), esto refleja el recorrido real completo para mostrarlo como
// "usuarioA → usuarioB → usuarioC" en el Directorio (ver ClientHistoryList.jsx).
const withSucursalesHistorial = async (conversations) => {
  if (!conversations || conversations.length === 0) return conversations;

  const ids = conversations.map(c => c.id);
  const { data: eventos, error } = await supabase
    .from('conversation_sucursal_historial')
    .select('conversation_id, sucursal_id, created_at, sucursales(nombre)')
    .in('conversation_id', ids)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] withSucursalesHistorial() — error:', error);
    return conversations;
  }

  const porConversacion = {};
  (eventos || []).forEach(ev => {
    if (!ev.sucursal_id || !ev.sucursales?.nombre) return;
    const lista = (porConversacion[ev.conversation_id] ||= []);
    // No repite la MISMA sucursal si aparece dos veces seguidas (misma regla
    // que withSucursalesHistorial en src/lib/clientUtils.js).
    if (lista[lista.length - 1]?.id !== ev.sucursal_id) {
      lista.push({ id: ev.sucursal_id, nombre: ev.sucursales.nombre });
    }
  });

  return conversations.map(c => ({
    ...c,
    sucursales_historial: porConversacion[c.id] || []
  }));
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

  // Modelo estricto por teléfono: el nombre mostrado sale de la ficha con ese
  // MISMO client_phone, sin cruzar con ningún otro número.
  const phones = [...new Set((conversations || []).map(c => c.client_phone).filter(Boolean))];
  const phoneMap = await resolverNombresPorTelefono(phones);
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerConversacionesDirectorio() — phoneMap construido, entradas:', Object.keys(phoneMap).length);

  const conHistorial = await withSucursalesHistorial(conversations || []);
  const resultado = conHistorial.map(c => ({ ...c, real_name: phoneMap[c.client_phone] || null }));
  console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerConversacionesDirectorio() — valor de retorno:', resultado);
  return resultado;
};

// A diferencia de obtenerConversacionesDirectorio (una fila por CONSULTA),
// esta es el registro maestro de PERSONAS para la pestaña "Lista de
// Clientes": una fila por client_phone (agrupado directo, modelo estricto
// por teléfono — cada número es una identidad propia, sin cruzar con otros
// números aunque compartan DNI), con el nombre/DNI de la ficha de `clientes`
// que tenga ESE MISMO client_phone.
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
  const { data: fichas, error: fichasError } = await supabase
    .from('clientes')
    .select('client_phone, nombre_completo, dni')
    .in('client_phone', phones);
  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Resultado query clientes — data:', fichas, 'error:', fichasError);
  if (fichasError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — error consultando clientes:', fichasError);
    throw fichasError;
  }
  const fichaPorTelefono = {};
  (fichas || []).forEach(f => { fichaPorTelefono[f.client_phone] = f; });

  const resultado = phones
    .map(phone => construirFilaCliente({
      client_phone: phone,
      real_name: fichaPorTelefono[phone]?.nombre_completo || null,
      dni: fichaPorTelefono[phone]?.dni || null,
      convs: conversacionesPorTelefono[phone]
    }))
    .sort((a, b) => new Date(b.lastContact) - new Date(a.lastContact));

  console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — valor de retorno:', resultado);
  return resultado;
};

const construirFilaCliente = ({ client_phone, real_name, dni, convs }) => {
  const sorted = [...convs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const rated = convs.filter(c => c.rating != null);
  const avgRating = rated.length > 0 ? rated.reduce((sum, c) => sum + c.rating, 0) / rated.length : null;
  const ratedProduct = convs.filter(c => c.product_rating != null);
  const avgProductRating = ratedProduct.length > 0 ? ratedProduct.reduce((sum, c) => sum + c.product_rating, 0) / ratedProduct.length : null;
  return {
    client_phone,
    real_name,
    client_name: sorted[0]?.client_name || null,
    dni,
    // Modelo estricto por teléfono: un único número por fila (el frontend
    // sigue usando este campo para filtrar el historial de esta ficha en
    // ClientDirectory.jsx).
    telefonos: [client_phone],
    total: convs.length,
    avgRating,
    avgProductRating,
    lastContact: sorted[0]?.created_at || null
  };
};

// Historial de un cliente puntual, para el ícono "Historial de consultas"
// dentro de un chat activo (ChatArea.jsx -> HistoryPanel.jsx). Modelo
// estricto por teléfono: sólo trae las conversaciones de ESE MISMO
// client_phone (a diferencia de obtenerConversacionesDirectorio, que sólo
// filtra por sucursal_id de la conversación), aplicando la MISMA regla de
// sucursal que el resto del Directorio (propia sucursal + sin asignar
// todavía), con una excepción: si esta sucursal ya tuvo un pedido confirmado
// con este teléfono alguna vez, se le habilita ver el historial completo con
// cualquier sucursal — se asume que ya hay una relación comercial directa
// con este número, no sólo con "la farmacia" en general.
export const obtenerHistorialClienteParaChat = async ({ clientPhone, excludeConversationId, sucursalId }) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — parámetros recibidos:', { clientPhone, excludeConversationId, sucursalId });

  let query = supabase.from('conversations').select(CONVERSATION_SELECT).eq('client_phone', clientPhone);
  if (excludeConversationId) query = query.neq('id', excludeConversationId);
  const { data: conversations, error } = await query.order('created_at', { ascending: false });
  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — resultado SELECT conversations — cantidad:', conversations?.length, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — error consultando conversaciones:', error);
    throw error;
  }

  if (!sucursalId) {
    // admin: acceso transversal completo, sin restricción por sucursal.
    const conHistorialAdmin = await withSucursalesHistorial(conversations || []);
    console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — sin sucursalId (admin), valor de retorno sin filtrar, cantidad:', conHistorialAdmin.length);
    return conHistorialAdmin;
  }

  const { data: pedidoEnComun, error: pedidoError } = await supabase
    .from('pedidos_confirmados')
    .select('id')
    .eq('client_phone', clientPhone)
    .eq('sucursal_id', sucursalId)
    .limit(1)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — resultado SELECT pedidos_confirmados (pedido en común) — data:', pedidoEnComun, 'error:', pedidoError);
  if (pedidoError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — error consultando pedido en común:', pedidoError);
    throw pedidoError;
  }
  const hayPedidoEnComun = !!pedidoEnComun;
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — hayPedidoEnComun:', hayPedidoEnComun);

  const filtradas = (conversations || []).filter(c => !c.sucursal_id || c.sucursal_id === sucursalId || hayPedidoEnComun);
  const resultado = await withSucursalesHistorial(filtradas);
  console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — valor de retorno, cantidad:', resultado.length, 'de', conversations?.length, 'totales');
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
