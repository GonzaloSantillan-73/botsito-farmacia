import { supabase } from '../supabase.js';
import { TERMINAL_STATUSES } from './sessionManager.js';
import { resolverNombresPorTelefono } from './clientes.js';

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
  console.log('🔍 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — filtros recibidos:', { startDate, endDate, saleStatus, rating, productRating, derivada });
  try {
    const COLUMNAS_BASE = 'id, created_at, client_name, client_phone, status, sale_status, sale_amount, payment_method, waiting_since, rating, product_rating, sucursales!sucursal_id(nombre)';
    // demora_inicial_ms (supabase/conversations_demora_inicial.sql) se pide
    // aparte del resto: si esa migración todavía no se corrió, Postgres
    // responde 42703 (columna inexistente) y se reintenta sin ella, para que
    // Métricas no deje de funcionar por eso (cae al cálculo viejo, abajo).
    const construirQuery = (columnas) => {
      let q = supabase
        .from('conversations')
        .select(columnas)
        .order('created_at', { ascending: false });
      if (startDate) q = q.gte('created_at', `${startDate}T00:00:00.000Z`);
      if (endDate) q = q.lte('created_at', `${endDate}T23:59:59.999Z`);
      if (saleStatus) q = q.eq('sale_status', saleStatus);
      if (rating != null) q = q.eq('rating', rating);
      if (productRating != null) q = q.eq('product_rating', productRating);
      // "Derivada"/"Bot (sin humano)" sólo tiene sentido sobre consultas ya
      // cerradas: es el mismo universo que usa /metrics/negocio para calcular el
      // % de resolución autónoma.
      if (derivada != null) q = q.in('status', TERMINAL_STATUSES);
      return q;
    };

    console.log('📡 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — SELECT conversations con filtros:', { startDate, endDate, saleStatus, rating, productRating, derivada });
    let { data: conversations, error } = await construirQuery(`${COLUMNAS_BASE}, demora_inicial_ms`);
    if (error?.code === '42703') {
      console.error('❌ [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — falta la columna demora_inicial_ms (correr supabase/conversations_demora_inicial.sql); se reintenta sin ella');
      ({ data: conversations, error } = await construirQuery(COLUMNAS_BASE));
    }

    console.log('📡 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — resultado SELECT conversations — cantidad de filas:', conversations?.length, 'error:', error);
    if (error) {
      console.error('❌ [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — error SELECT conversations:', error);
      throw error;
    }

    const ids = conversations.map(c => c.id);
    const phones = [...new Set(conversations.map(c => c.client_phone).filter(Boolean))];
    console.log('🔍 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — ids de conversaciones:', ids.length, '— phones únicos:', phones.length);

    console.log('📡 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — disparando en paralelo: resolverNombresPorTelefono, messages (in conversation_id), pedidos_confirmados (in conversation_id)');
    const [phoneMap, { data: mensajes, error: msgError }, { data: pedidos, error: pedidosError }] = await Promise.all([
      resolverNombresPorTelefono(phones),
      ids.length
        ? supabase.from('messages').select('conversation_id, sender_type, media_type, media_url, tagged_as, created_at').in('conversation_id', ids).order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from('pedidos_confirmados').select('conversation_id, total, subtotal, costo_envio').in('conversation_id', ids)
        : Promise.resolve({ data: [] })
    ]);
    console.log('📡 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — resultado resolverNombresPorTelefono — entradas:', Object.keys(phoneMap).length);
    console.log('📡 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — resultado SELECT messages — cantidad de filas:', mensajes?.length, 'error:', msgError);
    console.log('📡 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — resultado SELECT pedidos_confirmados — cantidad de filas:', pedidos?.length, 'error:', pedidosError);

    if (msgError) {
      console.error('❌ [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — error SELECT messages:', msgError);
      throw msgError;
    }
    if (pedidosError) {
      console.error('❌ [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — error SELECT pedidos_confirmados:', pedidosError);
      throw pedidosError;
    }

    // Una conversación puede tener varios pedidos confirmados (el Cotizador se
    // vacía después de cada pago para que el próximo pedido del mismo cliente
    // no se mezcle con el anterior), así que el Monto Total de la fila es la
    // suma de todos ellos, no un valor único.
    // Mismo criterio de suma que montoTotal para subtotal/costo_envio, pero
    // con una salvedad: pedidos guardados ANTES de la migración que agregó
    // esas columnas tienen ambas en NULL (no hay forma de reconstruirlas), así
    // que si algún pedido de la conversación no las tiene, se deja el
    // desglose entero en null para esa fila en vez de mostrar una suma
    // parcial engañosa — el Monto Total (que sí viene de "total") no se ve
    // afectado.
    const montoPorConversacion = {};
    const subtotalPorConversacion = {};
    const envioPorConversacion = {};
    const desgloseCompletoPorConversacion = {};
    (pedidos || []).forEach(p => {
      montoPorConversacion[p.conversation_id] = (montoPorConversacion[p.conversation_id] || 0) + Number(p.total || 0);
      if (p.subtotal == null || p.costo_envio == null) {
        desgloseCompletoPorConversacion[p.conversation_id] = false;
      } else {
        subtotalPorConversacion[p.conversation_id] = (subtotalPorConversacion[p.conversation_id] || 0) + Number(p.subtotal);
        envioPorConversacion[p.conversation_id] = (envioPorConversacion[p.conversation_id] || 0) + Number(p.costo_envio);
        if (desgloseCompletoPorConversacion[p.conversation_id] === undefined) desgloseCompletoPorConversacion[p.conversation_id] = true;
      }
    });
    console.log('🔍 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — montoPorConversacion construido, entradas:', Object.keys(montoPorConversacion).length);

    // Se agrega una sola pasada por todos los mensajes (en vez de una consulta
    // por conversación) para no hacer N+1 queries contra Supabase.
    const porConversacion = {};
    (mensajes || []).forEach(m => {
      const acc = porConversacion[m.conversation_id] || (porConversacion[m.conversation_id] = {
        msgsCliente: 0,
        primeraRespuestaAgente: null,
        ultimoMensaje: null,
        comprobanteUrl: null,
        recetaUrl: null
      });

      if (m.sender_type === 'client') acc.msgsCliente += 1;
      if (m.sender_type === 'agent' && !acc.primeraRespuestaAgente) acc.primeraRespuestaAgente = m.created_at;
      acc.ultimoMensaje = m.created_at;
      // Comprobante/receta salen ÚNICAMENTE de un etiquetado explícito
      // (tagged_as, ver AttachmentTagControls en MessageBubble.jsx): un
      // adjunto de imagen/documento del cliente sin marcar no cuenta como
      // comprobante ni receta, por más que "parezca" uno.
      if (m.tagged_as === 'comprobante' && m.media_url) acc.comprobanteUrl = m.media_url;
      if (m.tagged_as === 'receta' && m.media_url) acc.recetaUrl = m.media_url;
    });
    console.log('🔍 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — porConversacion agregado, conversaciones con mensajes:', Object.keys(porConversacion).length);

    let resultado = conversations.map(c => {
      const agg = porConversacion[c.id] || { msgsCliente: 0, primeraRespuestaAgente: null, ultimoMensaje: null, comprobanteUrl: null, recetaUrl: null };
      // Demora Inicial: el valor congelado en la primera toma (ver
      // tomaConsulta.js), que no cambia aunque el chat se devuelva a espera
      // y lo retome otra sucursal. Sólo para consultas anteriores a esa
      // columna se usa el cálculo viejo (inicio de espera -> primera
      // respuesta de un operador); como devolucionCola.js ahora reinicia
      // waiting_since, ese cálculo puede dar negativo y en ese caso se omite.
      const inicioEspera = c.waiting_since || c.created_at;
      const demoraLegacy = msDiff(inicioEspera, agg.primeraRespuestaAgente);
      const demoraInicialMs = c.demora_inicial_ms != null
        ? Number(c.demora_inicial_ms)
        : (demoraLegacy != null && demoraLegacy >= 0 ? demoraLegacy : null);

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
        subtotal: desgloseCompletoPorConversacion[c.id] ? subtotalPorConversacion[c.id] : null,
        costoEnvio: desgloseCompletoPorConversacion[c.id] ? envioPorConversacion[c.id] : null,
        medioPago: c.payment_method || '',
        comprobanteUrl: agg.comprobanteUrl,
        recetaUrl: agg.recetaUrl,
        msjsCliente: agg.msgsCliente,
        demoraInicialMs,
        duracionTotalMs: msDiff(c.created_at, agg.ultimoMensaje || c.created_at),
        // Mismo criterio que /metrics/negocio: "derivada" es que al menos un
        // mensaje de esta conversación lo haya mandado un agente humano.
        esDerivada: agg.primeraRespuestaAgente != null
      };
    });
    console.log('🔍 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — filas mapeadas antes del filtro de derivada, cantidad:', resultado.length);

    // El filtro por status ya restringió a cerradas (ver arriba); acá se separa
    // puntualmente bot-sin-humano vs. derivada, algo que no se puede expresar
    // como columna en la consulta a Supabase.
    if (derivada != null) {
      const quiereDerivada = derivada === true || derivada === 'true';
      console.log('🔍 [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — aplicando filtro adicional esDerivada ===', quiereDerivada);
      resultado = resultado.filter(r => r.esDerivada === quiereDerivada);
    }

    console.log('✅ [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — cantidad de filas resultantes:', resultado.length);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-METRICSDETALLE] obtenerDetalleConsultas() — error:', err?.message, err?.stack);
    throw err;
  }
};
