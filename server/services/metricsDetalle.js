import { supabase } from '../supabase.js';
import { TERMINAL_STATUSES } from './sessionManager.js';

// Media que razonablemente puede ser un comprobante de pago (foto o PDF del
// depósito/transferencia) que el cliente manda por el chat.
const MEDIA_COMPROBANTE = ['image', 'document', 'pdf'];

const msDiff = (desde, hasta) => (desde && hasta ? new Date(hasta).getTime() - new Date(desde).getTime() : null);

// Fila por fila para la tabla interactiva de "Métricas y Estadísticas" y para
// su exportación a CSV (mismas columnas en los dos lugares): junta datos de
// `conversations` con los agregados que sólo se pueden calcular mirando sus
// `messages` (demora hasta la primera respuesta humana, duración total,
// cantidad de mensajes del cliente y el último comprobante que mandó).
//
// `saleStatus`/`rating`/`productRating`/`derivada` son filtros puntuales que
// usa el botón "Ver" de cada barra en MetricsPanel.jsx (ej. sólo las
// consultas calificadas con 3 estrellas de atención) — opcionales, sin ellos
// se comporta igual que antes (todo el rango de fechas, sin acotar).
export const obtenerDetalleConsultas = async ({ startDate, endDate, saleStatus, rating, productRating, derivada } = {}) => {
  let query = supabase
    .from('conversations')
    .select('id, created_at, client_name, client_phone, status, sale_status, sale_amount, payment_method, waiting_since, rating, product_rating, sucursales!sucursal_id(nombre)')
    .order('created_at', { ascending: false });

  if (startDate) query = query.gte('created_at', `${startDate}T00:00:00.000Z`);
  if (endDate) query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
  if (saleStatus) query = query.eq('sale_status', saleStatus);
  if (rating != null) query = query.eq('rating', rating);
  if (productRating != null) query = query.eq('product_rating', productRating);
  // "Derivada"/"Bot (sin humano)" sólo tiene sentido sobre consultas ya
  // cerradas: es el mismo universo que usa /metrics/negocio para calcular el
  // % de resolución autónoma.
  if (derivada != null) query = query.in('status', TERMINAL_STATUSES);

  const { data: conversations, error } = await query;
  if (error) throw error;

  const ids = conversations.map(c => c.id);
  const phones = [...new Set(conversations.map(c => c.client_phone).filter(Boolean))];

  const [{ data: clientes, error: clientesError }, { data: mensajes, error: msgError }, { data: pedidos, error: pedidosError }] = await Promise.all([
    phones.length
      ? supabase.from('clientes').select('client_phone, nombre_completo').in('client_phone', phones)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from('messages').select('conversation_id, sender_type, media_type, media_url, created_at').in('conversation_id', ids).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from('pedidos_confirmados').select('conversation_id, total').in('conversation_id', ids)
      : Promise.resolve({ data: [] })
  ]);
  if (clientesError) throw clientesError;
  if (msgError) throw msgError;
  if (pedidosError) throw pedidosError;

  const phoneMap = {};
  (clientes || []).forEach(c => { if (c.nombre_completo) phoneMap[c.client_phone] = c.nombre_completo; });

  // Una conversación puede tener varios pedidos confirmados (el Cotizador se
  // vacía después de cada pago para que el próximo pedido del mismo cliente
  // no se mezcle con el anterior), así que el Monto Total de la fila es la
  // suma de todos ellos, no un valor único.
  const montoPorConversacion = {};
  (pedidos || []).forEach(p => {
    montoPorConversacion[p.conversation_id] = (montoPorConversacion[p.conversation_id] || 0) + Number(p.total || 0);
  });

  // Se agrega una sola pasada por todos los mensajes (en vez de una consulta
  // por conversación) para no hacer N+1 queries contra Supabase.
  const porConversacion = {};
  (mensajes || []).forEach(m => {
    const acc = porConversacion[m.conversation_id] || (porConversacion[m.conversation_id] = {
      msgsCliente: 0,
      primeraRespuestaAgente: null,
      ultimoMensaje: null,
      comprobanteUrl: null
    });

    if (m.sender_type === 'client') acc.msgsCliente += 1;
    if (m.sender_type === 'agent' && !acc.primeraRespuestaAgente) acc.primeraRespuestaAgente = m.created_at;
    acc.ultimoMensaje = m.created_at;
    // Los mensajes ya vienen ordenados ascendente, así que el último que
    // matchea queda como "el" comprobante (el más reciente que mandó).
    if (m.sender_type === 'client' && m.media_url && MEDIA_COMPROBANTE.includes(m.media_type)) {
      acc.comprobanteUrl = m.media_url;
    }
  });

  let resultado = conversations.map(c => {
    const agg = porConversacion[c.id] || { msgsCliente: 0, primeraRespuestaAgente: null, ultimoMensaje: null, comprobanteUrl: null };
    const inicioEspera = c.waiting_since || c.created_at;

    return {
      id: c.id,
      fecha: c.created_at,
      cliente: phoneMap[c.client_phone] || c.client_name || '',
      telefono: c.client_phone || '',
      sucursal: c.sucursales?.nombre || '',
      status: c.status || '',
      saleStatus: c.sale_status || '',
      rating: c.rating ?? null,
      productRating: c.product_rating ?? null,
      montoTotal: montoPorConversacion[c.id] !== undefined
        ? montoPorConversacion[c.id]
        : (c.sale_amount != null ? Number(c.sale_amount) : null),
      medioPago: c.payment_method || '',
      comprobanteUrl: agg.comprobanteUrl,
      msjsCliente: agg.msgsCliente,
      demoraInicialMs: msDiff(inicioEspera, agg.primeraRespuestaAgente),
      duracionTotalMs: msDiff(c.created_at, agg.ultimoMensaje || c.created_at),
      // Mismo criterio que /metrics/negocio: "derivada" es que al menos un
      // mensaje de esta conversación lo haya mandado un agente humano.
      esDerivada: agg.primeraRespuestaAgente != null
    };
  });

  // El filtro por status ya restringió a cerradas (ver arriba); acá se separa
  // puntualmente bot-sin-humano vs. derivada, algo que no se puede expresar
  // como columna en la consulta a Supabase.
  if (derivada != null) {
    const quiereDerivada = derivada === true || derivada === 'true';
    resultado = resultado.filter(r => r.esDerivada === quiereDerivada);
  }

  return resultado;
};
