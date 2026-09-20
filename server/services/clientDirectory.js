import { supabase } from '../supabase.js';
import { resolverNombresPorConversaciones, resolverFichaPorConversaciones, obtenerTelefonosDeLaMismaPersona } from './clientes.js';

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

  // Resuelve también los teléfonos VIEJOS de alguien que ya migró de número
  // (ver resolverNombresPorConversaciones en clientes.js), respetando la
  // fecha exacta de CADA conversación: si el teléfono se reciclara a otra
  // persona, sus consultas nuevas no deben heredar el nombre del dueño
  // anterior sólo por compartir número.
  const nombrePorConversacion = await resolverNombresPorConversaciones(
    (conversations || []).map(c => ({ id: c.id, client_phone: c.client_phone, created_at: c.created_at }))
  );
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerConversacionesDirectorio() — nombrePorConversacion construido, entradas:', Object.keys(nombrePorConversacion).length);

  const resultado = (conversations || []).map(c => ({ ...c, real_name: nombrePorConversacion[c.id] || null }));
  console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerConversacionesDirectorio() — valor de retorno:', resultado);
  return resultado;
};

// A diferencia de obtenerConversacionesDirectorio (una fila por CONSULTA,
// donde el client_phone tiene que quedar tal cual está en esa conversación:
// es el snapshot de con qué número se habló en esa sesión puntual, y no debe
// pisarse con el de `clientes`), esta es el registro maestro de PERSONAS para
// la pestaña "Lista de Clientes": una fila por FICHA de `clientes` (o, si
// todavía no tiene ficha propia, por client_phone suelto), no un agrupado
// simple de conversaciones.
//
// El teléfono que se muestra es siempre el vigente (`clientes.client_phone`),
// pero las MÉTRICAS agregadas (interacciones, calificaciones, último
// contacto) tienen que sumar TODA la consulta histórica de la persona, no
// sólo la de su número actual: si alguien migró de teléfono (por DNI, ver
// migrar_cliente_por_dni.sql, o a mano por el admin, ver clientesAdmin.js),
// sus conversaciones viejas se quedan con el client_phone viejo A PROPÓSITO
// (es el snapshot real de esa sesión).
//
// Cada conversación se agrupa por la ficha que resolverFichaPorConversaciones
// le atribuye A ESA FECHA puntual (mismo criterio con ventana temporal que
// usa el resto del Directorio, ver clientes.js) — no por "cualquier teléfono
// que alguna vez fue de esta ficha, sin importar cuándo": si un número se
// reciclara, sus conversaciones antes/después de la ventana de una ficha no
// deben sumarse a sus estadísticas.
//
// El universo de teléfonos visibles lo sigue marcando `conversations` (mismo
// alcance por sucursal que el resto del Directorio: `clientes` no tiene
// sucursal_id, así que filtrar esa tabla directamente filtraría a ciegas).
export const obtenerListaClientesDirectorio = async ({ sucursalId } = {}) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — parámetros recibidos:', { sucursalId });

  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Query Supabase → tabla: conversations, operación: select (agregados), filtro sucursal:', sucursalId);
  const query = conSucursal(supabase.from('conversations').select('id, client_phone, client_name, created_at, rating, product_rating'), sucursalId);
  const { data: conversaciones, error: convError } = await query;
  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] Resultado query conversations (select agregados) — data:', conversaciones, 'error:', convError);
  if (convError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — error consultando conversaciones:', convError);
    throw convError;
  }
  if (!conversaciones || conversaciones.length === 0) {
    console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — valor de retorno: [] (sin conversaciones)');
    return [];
  }

  const fichaPorConversacion = await resolverFichaPorConversaciones(
    conversaciones.map(c => ({ id: c.id, client_phone: c.client_phone, created_at: c.created_at }))
  );
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — fichas resueltas por conversación:', Object.keys(fichaPorConversacion).length, 'de', conversaciones.length);

  const convsPorFicha = {}; // ficha.id -> { ficha, convs: [] }
  const convsSinFicha = {}; // client_phone -> convs[] (sin ficha registrada, o fuera de la ventana de cualquier ficha conocida)

  conversaciones.forEach(c => {
    const ficha = fichaPorConversacion[c.id];
    if (ficha) {
      (convsPorFicha[ficha.id] ||= { ficha, convs: [] }).convs.push(c);
    } else if (c.client_phone) {
      (convsSinFicha[c.client_phone] ||= []).push(c);
    }
  });

  const filasConFicha = Object.values(convsPorFicha).map(({ ficha, convs }) =>
    construirFilaCliente({
      client_phone: ficha.client_phone,
      real_name: ficha.nombre_completo || null,
      dni: ficha.dni || null,
      // Sólo los teléfonos que efectivamente aparecen en las conversaciones
      // atribuidas a esta ficha (no "todos los históricos de la ficha, sin
      // importar la ventana"): el frontend los usa para filtrar el historial
      // completo de esta persona (ver ClientDirectory.jsx), y no debe incluir
      // un número que hoy es de otra persona.
      telefonos: [...new Set(convs.map(c => c.client_phone))],
      convs
    })
  );

  // Teléfonos con conversación visible pero sin ninguna ficha resuelta
  // (cliente a mitad del registro obligatorio, todavía no llegó a cargar su
  // DNI; o una conversación fuera de la ventana temporal de cualquier ficha
  // conocida para ese número).
  const filasSinFicha = Object.entries(convsSinFicha)
    .map(([phone, convs]) => construirFilaCliente({ client_phone: phone, real_name: null, dni: null, telefonos: [phone], convs }));

  const resultado = [...filasConFicha, ...filasSinFicha].sort((a, b) => new Date(b.lastContact) - new Date(a.lastContact));

  console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerListaClientesDirectorio() — valor de retorno:', resultado);
  return resultado;
};

const construirFilaCliente = ({ client_phone, real_name, dni, telefonos, convs }) => {
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
    // Todos los números que alguna vez identificaron a esta persona (el
    // vigente + los históricos): el frontend lo necesita para poder filtrar
    // TODAS sus conversaciones al abrir su ficha (ver ClientDirectory.jsx),
    // ya que cada conversación vieja se queda con su client_phone de
    // entonces, sin reescribir.
    telefonos,
    total: convs.length,
    avgRating,
    avgProductRating,
    lastContact: sorted[0]?.created_at || null
  };
};

// Historial de un cliente puntual, para el ícono "Historial de consultas"
// dentro de un chat activo (ChatArea.jsx -> HistoryPanel.jsx). A diferencia
// de obtenerConversacionesDirectorio (que sólo filtra por sucursal_id de la
// conversación), acá hay que:
//   1) Juntar TODOS los teléfonos históricos de esta persona (si migró de
//      número, sus consultas viejas quedan con el teléfono de entonces).
//   2) Aplicar la MISMA regla de sucursal que el resto del Directorio (propia
//      sucursal + sin asignar todavía), PERO con una excepción: si esta
//      sucursal ya tuvo un pedido confirmado con este cliente alguna vez
//      (cualquiera de sus teléfonos), se le habilita ver el historial
//      completo con cualquier sucursal — se asume que ya hay una relación
//      comercial directa con esa persona, no sólo con "la farmacia" en general.
export const obtenerHistorialClienteParaChat = async ({ clientPhone, excludeConversationId, sucursalId }) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — parámetros recibidos:', { clientPhone, excludeConversationId, sucursalId });

  const telefonos = await obtenerTelefonosDeLaMismaPersona(clientPhone);
  console.log('🔍 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — teléfonos de la misma persona:', telefonos);

  let query = supabase.from('conversations').select(CONVERSATION_SELECT).in('client_phone', telefonos);
  if (excludeConversationId) query = query.neq('id', excludeConversationId);
  const { data: conversations, error } = await query.order('created_at', { ascending: false });
  console.log('📡 [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — resultado SELECT conversations — cantidad:', conversations?.length, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — error consultando conversaciones:', error);
    throw error;
  }

  if (!sucursalId) {
    // admin: acceso transversal completo, sin restricción por sucursal.
    console.log('✅ [DEBUG-SERVICE-CLIENTDIRECTORY] obtenerHistorialClienteParaChat() — sin sucursalId (admin), valor de retorno sin filtrar, cantidad:', conversations?.length);
    return conversations || [];
  }

  const { data: pedidoEnComun, error: pedidoError } = await supabase
    .from('pedidos_confirmados')
    .select('id')
    .in('client_phone', telefonos)
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

  const resultado = (conversations || []).filter(c => !c.sucursal_id || c.sucursal_id === sucursalId || hayPedidoEnComun);
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
