import express from 'express';
import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { getSessionTimeoutMs, setSessionTimeoutMs, MIN_SESSION_TIMEOUT_MS, MAX_SESSION_TIMEOUT_MS, getSessionPrewarningMs, setSessionPrewarningMs, getBotKeyword, setBotKeyword, getWelcomeMessage, setWelcomeMessage, getFrequentClientMessage, setFrequentClientMessage, getFrequentClientThreshold, setFrequentClientThreshold, MIN_FREQUENT_CLIENT_THRESHOLD, MAX_FREQUENT_CLIENT_THRESHOLD } from '../services/appConfig.js';
import { finalizarConversacion } from '../services/ratingSurvey.js';
import { devolverConversacionAEspera } from '../services/devolucionCola.js';
import { tomarConsulta } from '../services/tomaConsulta.js';
import { derivarASucursal } from '../services/derivacionSucursal.js';
import { getSucursalesActivas, estaAbiertaAhora } from '../services/sucursales.js';
import { TERMINAL_STATUSES } from '../services/sessionManager.js';
import { getBotSchedule, setBotSchedule } from '../services/scheduleConfig.js';
import { rowsToCsv, sendCsv } from '../services/csvExport.js';
import { rowsToXlsxBuffer, sendXlsx } from '../services/xlsxExport.js';
import { obtenerDetalleConsultas } from '../services/metricsDetalle.js';
import { resolverNombresPorTelefono } from '../services/clientes.js';
import { extraerCoordenadasDeUrl } from '../services/mapsLocation.js';
import { requireAuth, requireAdminRole, blockAdminRole } from './adminAuth.js';

const router = express.Router();

// [DEBUG-ROUTES-API] Clona un body para loguearlo sin exponer contraseñas en texto plano.
const redactBodyForLog = (body) => {
  const bodyParaLog = { ...(body || {}) };
  if (bodyParaLog.password) bodyParaLog.password = '[REDACTED]';
  if (bodyParaLog.currentPassword) bodyParaLog.currentPassword = '[REDACTED]';
  if (bodyParaLog.newPassword) bodyParaLog.newPassword = '[REDACTED]';
  return bodyParaLog;
};

const parseDateRange = (query) => {
  const { startDate, endDate } = query;
  if (!startDate || !endDate) {
    throw new Error('Debés indicar startDate y endDate (formato YYYY-MM-DD).');
  }
  return {
    from: `${startDate}T00:00:00.000Z`,
    to: `${endDate}T23:59:59.999Z`
  };
};

// Exportación y métricas del negocio: sólo el administrador puede verlas o
// descargarlas (incluyen teléfonos y montos de venta de todos los clientes).
router.use(['/export/chats', '/export/metrics', '/metrics/negocio', '/metrics/detalle'], requireAuth, requireAdminRole);

// Saludo de "cliente frecuente": ni siquiera un empleado de sucursal puede
// verlo o editarlo (es parte de "Ajustes de Chat", ya admin-only en el
// SettingsModal del frontend); acá se revalida del lado del servidor.
router.use(['/frequent-client-config'], requireAuth, requireAdminRole);

// Exporta el historial de mensajes (con datos del cliente y la consulta) en el rango de fechas dado.
router.get('/export/chats', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a GET /export/chats:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });
  try {
    const { startDate, endDate } = req.query;
    const { from, to } = parseDateRange(req.query);

    console.log('📡 [DEBUG-ROUTES-API] Consultando supabase.from(messages) select en /export/chats:', { operacion: 'select', from, to });
    const { data, error } = await supabase
      .from('messages')
      .select('created_at, sender_type, message_text, media_type, conversation_id, conversations(client_name, client_phone, status)')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at');

    console.log('📡 [DEBUG-ROUTES-API] Resultado supabase.from(messages) select en /export/chats:', { cantidad: (data || []).length, error });
    if (error) throw error;

    const phones = [...new Set((data || []).map(r => r.conversations?.client_phone).filter(Boolean))];
    // Modelo estricto por teléfono: el nombre sale de la ficha con ESE MISMO
    // client_phone, sin cruzar con ningún otro número (ver
    // resolverNombresPorTelefono en clientes.js).
    const phoneMap = await resolverNombresPorTelefono(phones);

    const columns = [
      { label: 'Fecha y hora', value: r => new Date(r.created_at).toLocaleString('es-AR') },
      { label: 'Cliente', value: r => phoneMap[r.conversations?.client_phone] || r.conversations?.client_name || '' },
      { label: 'Teléfono', value: r => r.conversations?.client_phone || '' },
      { label: 'Estado de la consulta', value: r => r.conversations?.status || '' },
      { label: 'Remitente', value: r => r.sender_type || '' },
      { label: 'Tipo de mensaje', value: r => r.media_type || 'text' },
      { label: 'Mensaje', value: r => r.message_text || '' }
    ];

    const csv = rowsToCsv(columns, data || []);
    console.log(`[API] -> Exportando historial de chats (${(data || []).length} mensajes, ${startDate} a ${endDate}).`);
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo GET /export/chats:', { status: 200, tipo: 'text/csv', nombreArchivo: `historial-chats_${startDate}_a_${endDate}.csv` });
    sendCsv(res, `historial-chats_${startDate}_a_${endDate}.csv`, csv);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en GET /export/chats:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error exportando historial de chats:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Detalle de consultas para la tabla interactiva de "Métricas y Estadísticas"
// del CRM (ordenable/filtrable en el propio front). startDate/endDate son
// opcionales acá: sin filtro, trae todo.
router.get('/metrics/detalle', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a GET /metrics/detalle:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });
  try {
    const { startDate, endDate, saleStatus, rating, productRating, derivada } = req.query;
    const paramsDetalle = {
      startDate,
      endDate,
      saleStatus,
      rating: rating != null && rating !== '' ? Number(rating) : undefined,
      productRating: productRating != null && productRating !== '' ? Number(productRating) : undefined,
      derivada: derivada != null && derivada !== '' ? derivada === 'true' : undefined
    };
    console.log('📡 [DEBUG-ROUTES-API] Llamando obtenerDetalleConsultas en /metrics/detalle:', paramsDetalle);
    const filas = await obtenerDetalleConsultas(paramsDetalle);
    console.log('📡 [DEBUG-ROUTES-API] Resultado obtenerDetalleConsultas en /metrics/detalle:', { cantidad: filas?.length });
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo GET /metrics/detalle:', { status: 200, cantidadFilas: filas?.length });
    res.status(200).json({ filas });
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en GET /metrics/detalle:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error obteniendo el detalle de consultas:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Exporta a CSV el mismo detalle que se ve en la tabla de "Métricas y
// Estadísticas" (mismas columnas), más un resumen de calificaciones al final.
router.get('/export/metrics', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a GET /export/metrics:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });
  try {
    const { startDate, endDate } = req.query;
    console.log('📡 [DEBUG-ROUTES-API] Llamando obtenerDetalleConsultas en /export/metrics:', { startDate, endDate });
    const filas = await obtenerDetalleConsultas({ startDate, endDate });
    console.log('📡 [DEBUG-ROUTES-API] Resultado obtenerDetalleConsultas en /export/metrics:', { cantidad: filas?.length });

    // `align: 'center'` en las columnas numéricas/de tiempo/estado (pedido
    // explícito del formato visual); "Cliente" queda a la izquierda por ser
    // texto libre de longitud variable. Comprobante/Receta se muestran como
    // Sí/No (más legible en una planilla impresa/compartida que la URL
    // cruda) — para abrir el archivo puntual, el operador lo sigue haciendo
    // desde el detalle en el propio CRM.
    const detailColumns = [
      { label: 'Fecha', align: 'center', value: r => new Date(r.fecha).toLocaleDateString('es-AR') },
      { label: 'Hora Inicio', align: 'center', value: r => new Date(r.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) },
      { label: 'Cliente', value: r => r.cliente },
      { label: 'Teléfono', align: 'center', value: r => r.telefono },
      { label: 'Demora Inicial (min)', align: 'center', value: r => (r.demoraInicialMs != null ? Math.round(r.demoraInicialMs / 60000) : '') },
      { label: 'Duración Total (min)', align: 'center', value: r => (r.duracionTotalMs != null ? Math.round(r.duracionTotalMs / 60000) : '') },
      { label: 'Msjs Cliente', align: 'center', value: r => r.msjsCliente },
      { label: 'Sucursal', align: 'center', value: r => r.sucursal },
      // "Venta concretada" es el único valor positivo (sale_status ===
      // 'concretada') y "Reportado" el único negativo con texto propio
      // (sale_status === 'reportado'); no concretada, otra razón (legado) o
      // sin marcar caen todas en "Solo consulta". Misma normalización que
      // SortableDetailTable.jsx (UI en pantalla): si se cambia acá, cambiar
      // también ahí.
      { label: 'Estado del Contacto', align: 'center', value: r => (r.saleStatus === 'concretada' ? 'Venta concretada' : r.saleStatus === 'reportado' ? 'Reportado' : 'Solo consulta') },
      { label: 'Monto Total', align: 'center', numFmt: '"$"#,##0.00', value: r => (r.montoTotal != null ? r.montoTotal : '') },
      { label: 'Medio de Pago', align: 'center', value: r => r.medioPago },
      { label: 'Calificación Atención', align: 'center', value: r => (r.rating != null ? r.rating : '') },
      { label: 'Calificación Producto', align: 'center', value: r => (r.productRating != null ? r.productRating : '') },
      { label: 'Comprobante (Sí/No)', align: 'center', value: r => (r.comprobanteUrl ? 'Sí' : 'No') },
      { label: 'Receta (Sí/No)', align: 'center', value: r => (r.recetaUrl ? 'Sí' : 'No') }
    ];

    // Sólo la tabla de detalle, sin ningún bloque de resumen apilado abajo
    // (ver MetricsPanel.jsx para esos mismos totales/promedios, ya
    // disponibles ahí como tarjetas). XLSX en vez de CSV plano: permite el
    // estilo visual (cabecera verde, alineación, franjas) que un CSV no
    // puede llevar.
    const buffer = await rowsToXlsxBuffer(detailColumns, filas, { sheetName: 'Detalle de consultas' });
    const sufijoNombre = startDate && endDate ? `_${startDate}_a_${endDate}` : '';
    console.log(`[API] -> Exportando métricas (${filas.length} consultas${startDate && endDate ? `, ${startDate} a ${endDate}` : ', sin filtro de fecha'}).`);
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo GET /export/metrics:', { status: 200, tipo: 'xlsx', nombreArchivo: `metricas${sufijoNombre}.xlsx` });
    sendXlsx(res, `metricas${sufijoNombre}.xlsx`, buffer);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en GET /export/metrics:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error exportando métricas:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Métricas de negocio para el panel de "Métricas y Estadísticas" del CRM:
// conversión de ventas gestionada a mano, resolución autónoma del bot vs
// derivación a humanos, y efectividad del filtro de seguridad de PDFs.
router.get('/metrics/negocio', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a GET /metrics/negocio:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });
  try {
    // Rango de fechas opcional (igual que /metrics/detalle): sin él, trae
    // todo el histórico. Se aplica sobre conversations.created_at en cada
    // consulta, para que las 4 secciones (resolución, seguridad, conversión y
    // satisfacción) queden consistentes entre sí con el mismo período.
    const { startDate, endDate } = req.query;
    const from = startDate ? `${startDate}T00:00:00.000Z` : null;
    const to = endDate ? `${endDate}T23:59:59.999Z` : null;
    const conRango = (query, campo = 'created_at') => {
      let q = query;
      if (from) q = q.gte(campo, from);
      if (to) q = q.lte(campo, to);
      return q;
    };

    console.log('📡 [DEBUG-ROUTES-API] Consultando supabase.from(conversations) select en /metrics/negocio (cerradas):', { operacion: 'select', statuses: TERMINAL_STATUSES, from, to });
    const { data: cerradas, error: cerradasError } = await conRango(
      supabase.from('conversations').select('id').in('status', TERMINAL_STATUSES)
    );
    console.log('📡 [DEBUG-ROUTES-API] Resultado supabase.from(conversations) select en /metrics/negocio (cerradas):', { cantidad: cerradas?.length, error: cerradasError });
    if (cerradasError) throw cerradasError;

    const idsCerradas = cerradas.map(c => c.id);
    let derivadas = 0;
    if (idsCerradas.length > 0) {
      console.log('📡 [DEBUG-ROUTES-API] Consultando supabase.from(messages) select en /metrics/negocio (conAgente):', { operacion: 'select', senderType: 'agent', idsCerradas });
      const { data: conAgente, error: agenteError } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('sender_type', 'agent')
        .in('conversation_id', idsCerradas);
      console.log('📡 [DEBUG-ROUTES-API] Resultado supabase.from(messages) select en /metrics/negocio (conAgente):', { cantidad: conAgente?.length, error: agenteError });
      if (agenteError) throw agenteError;
      derivadas = new Set(conAgente.map(m => m.conversation_id)).size;
    }
    const totalCerradas = idsCerradas.length;
    const autonomas = totalCerradas - derivadas;
    const pctAutonoma = totalCerradas > 0 ? (autonomas / totalCerradas) * 100 : 0;

    console.log('📡 [DEBUG-ROUTES-API] Consultando supabase.from(messages) count en /metrics/negocio (pdfBloqueados):', { operacion: 'select-count', mediaType: 'blocked_pdf' });
    const { count: pdfBloqueados, error: bloqError } = await conRango(
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('media_type', 'blocked_pdf')
    );
    console.log('📡 [DEBUG-ROUTES-API] Resultado supabase.from(messages) count en /metrics/negocio (pdfBloqueados):', { pdfBloqueados, error: bloqError });
    if (bloqError) throw bloqError;

    console.log('📡 [DEBUG-ROUTES-API] Consultando supabase.from(messages) count en /metrics/negocio (pdfAceptados):', { operacion: 'select-count', mediaType: 'pdf' });
    const { count: pdfAceptados, error: acepError } = await conRango(
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('media_type', 'pdf')
    );
    console.log('📡 [DEBUG-ROUTES-API] Resultado supabase.from(messages) count en /metrics/negocio (pdfAceptados):', { pdfAceptados, error: acepError });
    if (acepError) throw acepError;

    // Conversión de ventas: resultado que el vendedor marca a mano (Venta
    // Concretada / No Concretada / Otra razón) sobre lo cotizado en el chat.
    console.log('📡 [DEBUG-ROUTES-API] Consultando supabase.from(conversations) select en /metrics/negocio (gestionVentas):', { operacion: 'select' });
    const { data: gestionVentas, error: gestionError } = await conRango(
      supabase.from('conversations').select('sale_status').not('sale_status', 'is', null)
    );
    console.log('📡 [DEBUG-ROUTES-API] Resultado supabase.from(conversations) select en /metrics/negocio (gestionVentas):', { cantidad: gestionVentas?.length, error: gestionError });
    if (gestionError) throw gestionError;

    const concretadas = gestionVentas.filter(g => g.sale_status === 'concretada');
    const noConcretadas = gestionVentas.filter(g => g.sale_status === 'no_concretada');
    const otras = gestionVentas.filter(g => g.sale_status === 'otra');
    const totalGestionadas = gestionVentas.length;

    // Calificaciones de satisfacción: atención (`rating`) y producto
    // (`product_rating`) son independientes entre sí. Se calcula el promedio
    // global y también desglosado por sucursal, para que cada local pueda ver
    // cómo viene su propio puntaje (el frontend decide qué mostrarle a quién
    // según el rol, esto solo calcula los números).
    console.log('📡 [DEBUG-ROUTES-API] Consultando supabase.from(conversations) select en /metrics/negocio (ratingsData):', { operacion: 'select' });
    const { data: ratingsData, error: ratingsError } = await conRango(
      supabase.from('conversations').select('rating, product_rating, sucursal_id').or('rating.not.is.null,product_rating.not.is.null')
    );
    console.log('📡 [DEBUG-ROUTES-API] Resultado supabase.from(conversations) select en /metrics/negocio (ratingsData):', { cantidad: ratingsData?.length, error: ratingsError });
    if (ratingsError) throw ratingsError;

    console.log('📡 [DEBUG-ROUTES-API] Consultando supabase.from(sucursales) select en /metrics/negocio:', { operacion: 'select' });
    const { data: sucursalesData, error: sucursalesError } = await supabase
      .from('sucursales')
      .select('id, nombre')
      .order('orden');
    console.log('📡 [DEBUG-ROUTES-API] Resultado supabase.from(sucursales) select en /metrics/negocio:', { sucursalesData, error: sucursalesError });
    if (sucursalesError) throw sucursalesError;
    const nombrePorSucursalId = Object.fromEntries((sucursalesData || []).map(s => [s.id, s.nombre]));

    const resumenDe = (valores) => {
      const limpios = valores.filter(v => v != null);
      const total = limpios.length;
      const promedio = total > 0 ? limpios.reduce((a, b) => a + b, 0) / total : 0;
      const distribucion = [1, 2, 3, 4, 5].reduce((acc, n) => {
        acc[n] = limpios.filter(v => v === n).length;
        return acc;
      }, {});
      return { total, promedio, distribucion };
    };

    const filas = ratingsData || [];
    const porSucursalMap = new Map();
    for (const fila of filas) {
      const clave = fila.sucursal_id || 'sin_sucursal';
      if (!porSucursalMap.has(clave)) porSucursalMap.set(clave, []);
      porSucursalMap.get(clave).push(fila);
    }
    const porSucursal = Array.from(porSucursalMap.entries()).map(([sucursalId, filasSucursal]) => ({
      sucursalId: sucursalId === 'sin_sucursal' ? null : sucursalId,
      nombre: sucursalId === 'sin_sucursal' ? 'Sin sucursal asignada' : (nombrePorSucursalId[sucursalId] || 'Sucursal eliminada'),
      atencion: resumenDe(filasSucursal.map(f => f.rating)),
      producto: resumenDe(filasSucursal.map(f => f.product_rating))
    }));

    const responseBody = {
      conversion: {
        totalGestionadas,
        concretadas: concretadas.length,
        noConcretadas: noConcretadas.length,
        otras: otras.length
      },
      operacion: { totalCerradas, autonomas, derivadas, pctAutonoma },
      seguridad: { pdfBloqueados: pdfBloqueados || 0, pdfAceptados: pdfAceptados || 0 },
      calificaciones: {
        atencion: resumenDe(filas.map(f => f.rating)),
        producto: resumenDe(filas.map(f => f.product_rating)),
        porSucursal
      }
    };
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo GET /metrics/negocio:', { status: 200, body: responseBody });
    res.status(200).json(responseBody);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en GET /metrics/negocio:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error calculando métricas de negocio:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Horarios de atención del bot y de los asesores humanos.
router.get('/schedules', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a GET /schedules:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });
  const bot = await getBotSchedule();
  console.log('✅ [DEBUG-ROUTES-API] Horarios obtenidos en GET /schedules:', { bot });
  console.log('🔚 [DEBUG-ROUTES-API] Respondiendo GET /schedules:', { status: 200, body: { bot } });
  res.status(200).json({ bot });
});

router.put('/schedules', async (req, res) => {
  const { bot } = req.body;
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a PUT /schedules:', {
    method: req.method,
    url: req.originalUrl,
    body: redactBodyForLog(req.body),
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });

  try {
    if (bot) {
      console.log('📡 [DEBUG-ROUTES-API] Actualizando horario de bot en PUT /schedules:', { bot });
      await setBotSchedule(bot);
    }
    console.log('[API] -> Horarios de atención actualizados.');
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo PUT /schedules:', { status: 200, body: { success: true } });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en PUT /schedules:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error actualizando horarios:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Palabra clave con la que un cliente reactiva al bot en modo humano.
router.get('/bot-config', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a GET /bot-config:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });
  const botKeyword = await getBotKeyword();
  console.log('🔚 [DEBUG-ROUTES-API] Respondiendo GET /bot-config:', { status: 200, body: { botKeyword } });
  res.status(200).json({ botKeyword });
});

router.put('/bot-config', async (req, res) => {
  const { botKeyword } = req.body;
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a PUT /bot-config:', {
    method: req.method,
    url: req.originalUrl,
    body: redactBodyForLog(req.body),
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });

  try {
    await setBotKeyword(botKeyword);
    console.log(`[API] -> Palabra clave del bot actualizada a "${botKeyword}".`);
    const respBody = { success: true, botKeyword: botKeyword.toString().trim() };
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo PUT /bot-config:', { status: 200, body: respBody });
    res.status(200).json(respBody);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en PUT /bot-config:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error actualizando bot-config:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Mensaje de bienvenida que el bot manda al arrancar (o reiniciar) una consulta.
// El menú numerado (1/2/3) que se agrega después es fijo: está atado a los
// manejadores del bot, así que no forma parte de lo personalizable acá.
router.get('/welcome-message', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a GET /welcome-message:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });
  const welcomeMessage = await getWelcomeMessage();
  console.log('🔚 [DEBUG-ROUTES-API] Respondiendo GET /welcome-message:', { status: 200, body: { welcomeMessage } });
  res.status(200).json({ welcomeMessage });
});

router.put('/welcome-message', async (req, res) => {
  const { welcomeMessage } = req.body;
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a PUT /welcome-message:', {
    method: req.method,
    url: req.originalUrl,
    body: redactBodyForLog(req.body),
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });

  try {
    await setWelcomeMessage(welcomeMessage);
    console.log(`[API] -> Mensaje de bienvenida actualizado.`);
    const respBody = { success: true, welcomeMessage: welcomeMessage.toString().trim() };
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo PUT /welcome-message:', { status: 200, body: respBody });
    res.status(200).json(respBody);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en PUT /welcome-message:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error actualizando welcome-message:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Saludo especial + umbral de "cliente frecuente" (ver appConfig.js y
// procesarMensajeBot en bot.js). Admin-only: ver el router.use() más arriba.
router.get('/frequent-client-config', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a GET /frequent-client-config:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });
  const [frequentClientMessage, frequentClientThreshold] = await Promise.all([
    getFrequentClientMessage(),
    getFrequentClientThreshold()
  ]);
  const respBody = {
    frequentClientMessage,
    frequentClientThreshold,
    minFrequentClientThreshold: MIN_FREQUENT_CLIENT_THRESHOLD,
    maxFrequentClientThreshold: MAX_FREQUENT_CLIENT_THRESHOLD
  };
  console.log('🔚 [DEBUG-ROUTES-API] Respondiendo GET /frequent-client-config:', { status: 200, body: respBody });
  res.status(200).json(respBody);
});

router.put('/frequent-client-config', async (req, res) => {
  const { frequentClientMessage, frequentClientThreshold } = req.body;
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a PUT /frequent-client-config:', {
    method: req.method,
    url: req.originalUrl,
    body: redactBodyForLog(req.body),
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });

  try {
    if (frequentClientMessage !== undefined) await setFrequentClientMessage(frequentClientMessage);
    if (frequentClientThreshold !== undefined) await setFrequentClientThreshold(frequentClientThreshold);

    const respBody = {
      success: true,
      frequentClientMessage: await getFrequentClientMessage(),
      frequentClientThreshold: await getFrequentClientThreshold()
    };
    console.log(`[API] -> Configuración de cliente frecuente actualizada.`);
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo PUT /frequent-client-config:', { status: 200, body: respBody });
    res.status(200).json(respBody);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en PUT /frequent-client-config:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error actualizando frequent-client-config:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Cierre manual de una consulta desde el CRM: mismo cierre + encuesta que el
// checker automático por inactividad, pero disparado por el operador.
router.post('/conversations/:id/close', requireAuth, blockAdminRole, async (req, res) => {
  const { id } = req.params;
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a POST /conversations/:id/close:', {
    method: req.method,
    url: req.originalUrl,
    body: redactBodyForLog(req.body),
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });

  try {
    console.log('📡 [DEBUG-ROUTES-API] Consultando supabase.from(conversations) select en /conversations/:id/close:', { operacion: 'select', id });
    const { data: conv, error } = await supabase
      .from('conversations')
      .select('id, client_phone, status')
      .eq('id', id)
      .single();
    console.log('📡 [DEBUG-ROUTES-API] Resultado supabase.from(conversations) select en /conversations/:id/close:', { conv, error });

    if (error || !conv) {
      console.log('🔚 [DEBUG-ROUTES-API] Respondiendo POST /conversations/:id/close:', { status: 404, body: { error: 'Conversación no encontrada' } });
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    await finalizarConversacion(conv.id, conv.client_phone, '');
    console.log(`[API] -> Consulta ${id} cerrada manualmente desde el CRM.`);
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo POST /conversations/:id/close:', { status: 200, body: { success: true } });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en POST /conversations/:id/close:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error cerrando conversación manualmente:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Un operador no puede seguir atendiendo (ej. sin stock) y devuelve el chat a
// la cola general de "En espera": recalcula las sucursales recomendadas
// excluyendo a la que lo devuelve. Acción directa, sin ningún dato a
// completar; no le manda nada al cliente (ver devolverConversacionAEspera).
router.post('/conversations/:id/return-to-queue', requireAuth, blockAdminRole, async (req, res) => {
  const { id } = req.params;
  const { razon } = req.body || {};
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a POST /conversations/:id/return-to-queue:', {
    method: req.method,
    url: req.originalUrl,
    body: redactBodyForLog(req.body),
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });

  try {
    console.log('📡 [DEBUG-ROUTES-API] Llamando devolverConversacionAEspera en /conversations/:id/return-to-queue:', { id, razon });
    const { sucursalesRecomendadas } = await devolverConversacionAEspera(id, razon);
    console.log('📡 [DEBUG-ROUTES-API] Resultado devolverConversacionAEspera en /conversations/:id/return-to-queue:', { sucursalesRecomendadas });
    console.log(`[API] -> Consulta ${id} devuelta a la cola de espera.`);
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo POST /conversations/:id/return-to-queue:', { status: 200, body: { success: true, sucursalesRecomendadas } });
    res.status(200).json({ success: true, sucursalesRecomendadas });
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en POST /conversations/:id/return-to-queue:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error devolviendo la conversación a la cola:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo devolver el chat a la cola de espera.' });
  }
});

// Un empleado de sucursal deriva DIRECTAMENTE la conversación que está
// atendiendo a otra sucursal puntual que él elige (ver derivacionSucursal.js),
// a diferencia de /return-to-queue que la manda a la cola general sin dueño.
router.post('/conversations/:id/derivar', requireAuth, blockAdminRole, async (req, res) => {
  const { id } = req.params;
  const { sucursalId, razon } = req.body;
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a POST /conversations/:id/derivar:', {
    method: req.method,
    url: req.originalUrl,
    body: redactBodyForLog(req.body),
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });

  if (!sucursalId) {
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo POST /conversations/:id/derivar:', { status: 400, body: { error: 'Elegí la sucursal a la que querés derivar la consulta.' } });
    return res.status(400).json({ error: 'Elegí la sucursal a la que querés derivar la consulta.' });
  }

  try {
    console.log('📡 [DEBUG-ROUTES-API] Llamando derivarASucursal en /conversations/:id/derivar:', { id, sucursalId, razon });
    const conversation = await derivarASucursal(id, sucursalId, razon);
    console.log('📡 [DEBUG-ROUTES-API] Resultado derivarASucursal en /conversations/:id/derivar:', { conversation });
    console.log(`[API] -> Consulta ${id} derivada a la sucursal ${sucursalId}.`);
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo POST /conversations/:id/derivar:', { status: 200, body: { success: true, conversation } });
    res.status(200).json({ success: true, conversation });
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en POST /conversations/:id/derivar:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error derivando la conversación:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo derivar la consulta.' });
  }
});

// Listado de sucursales activas para el selector de derivación directa (ver
// /conversations/:id/derivar más arriba): accesible para cualquier cuenta
// autenticada (admin o staff), no sólo admin — a diferencia de GET
// /api/admin/staff/sucursales, que es admin-only y trae de más (credenciales,
// horario completo). Acá sólo interesa con qué sucursales se puede derivar
// AHORA MISMO, por eso incluye `abierta_ahora` ya calculado.
router.get('/sucursales', requireAuth, async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a GET /sucursales:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });
  try {
    const sucursales = await getSucursalesActivas();
    const resultado = sucursales.map(s => ({
      id: s.id,
      nombre: s.nombre,
      direccion: s.direccion,
      abierta_ahora: estaAbiertaAhora(s)
    }));
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo GET /sucursales:', { status: 200, count: resultado.length });
    res.status(200).json({ sucursales: resultado });
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en GET /sucursales:', { error, message: error.message, stack: error.stack });
    res.status(500).json({ error: error.message || 'No se pudieron cargar las sucursales.' });
  }
});

// Un empleado de sucursal reclama una conversación de la cola general: la
// asigna a su sucursal y le avisa al cliente por WhatsApp qué sucursal lo va
// a atender y dónde queda (ver tomaConsulta.js).
router.post('/conversations/:id/take', requireAuth, blockAdminRole, async (req, res) => {
  const { id } = req.params;
  const { sucursalId } = req.body;
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a POST /conversations/:id/take:', {
    method: req.method,
    url: req.originalUrl,
    body: redactBodyForLog(req.body),
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });

  if (!sucursalId) {
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo POST /conversations/:id/take:', { status: 400, body: { error: 'Falta indicar la sucursal que toma la consulta.' } });
    return res.status(400).json({ error: 'Falta indicar la sucursal que toma la consulta.' });
  }

  try {
    console.log('📡 [DEBUG-ROUTES-API] Llamando tomarConsulta en /conversations/:id/take:', { id, sucursalId });
    const conversation = await tomarConsulta(id, sucursalId);
    console.log('📡 [DEBUG-ROUTES-API] Resultado tomarConsulta en /conversations/:id/take:', { conversation });
    console.log(`[API] -> Consulta ${id} tomada por la sucursal ${sucursalId}.`);
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo POST /conversations/:id/take:', { status: 200, body: { success: true, conversation } });
    res.status(200).json({ success: true, conversation });
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en POST /conversations/:id/take:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error tomando la consulta:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo tomar la consulta.' });
  }
});

// Config expuesta al frontend para que el contador de expiración del CRM
// siempre calcule contra el mismo límite real que usa el backend.
router.get('/session-config', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a GET /session-config:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });
  const [sessionTimeoutMs, sessionPrewarningMs] = await Promise.all([getSessionTimeoutMs(), getSessionPrewarningMs()]);
  const respBody = { sessionTimeoutMs, sessionPrewarningMs, minSessionTimeoutMs: MIN_SESSION_TIMEOUT_MS, maxSessionTimeoutMs: MAX_SESSION_TIMEOUT_MS };
  console.log('🔚 [DEBUG-ROUTES-API] Respondiendo GET /session-config:', { status: 200, body: respBody });
  res.status(200).json(respBody);
});

router.put('/session-config', async (req, res) => {
  const { sessionTimeoutMs, sessionPrewarningMs } = req.body;
  console.log('🔍 [DEBUG-ROUTES-API] Entrada a PUT /session-config:', {
    method: req.method,
    url: req.originalUrl,
    body: redactBodyForLog(req.body),
    query: req.query,
    params: req.params,
    admin: req.admin || null
  });

  try {
    await setSessionTimeoutMs(Number(sessionTimeoutMs));
    console.log(`[API] -> Límite de expiración de sesión actualizado a ${sessionTimeoutMs} ms.`);
    if (sessionPrewarningMs !== undefined) {
      await setSessionPrewarningMs(Number(sessionPrewarningMs));
      console.log(`[API] -> Umbral de aviso preventivo actualizado a ${sessionPrewarningMs} ms.`);
    }
    const respBody = { success: true, sessionTimeoutMs: Number(sessionTimeoutMs), sessionPrewarningMs: sessionPrewarningMs !== undefined ? Number(sessionPrewarningMs) : undefined };
    console.log('🔚 [DEBUG-ROUTES-API] Respondiendo PUT /session-config:', { status: 200, body: respBody });
    res.status(200).json(respBody);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-API] Error en PUT /session-config:', { error, message: error.message, stack: error.stack });
    console.error('[API] ❌ Error actualizando session-config:', error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post('/messages/send', requireAuth, blockAdminRole, async (req, res) => {
  console.log(`\n======================================================`);
  console.log(`[API - POST /messages/send] ==> INICIO DE ENVÍO DE MENSAJE (OUTBOUND)`);
  console.log(`[API - POST /messages/send] ==> Body recibido:`, JSON.stringify(req.body, null, 2));
  console.log('🔍 [DEBUG-ROUTES-API] req.admin en POST /messages/send:', req.admin || null);

  const { conversation_id, message_text, phone, message, media_url, media_type, id, sender_type } = req.body;

  const finalMessage = message || message_text || '';
  console.log(`[API] -> Mensaje resuelto final: "${finalMessage}"`);
  
  if (!finalMessage && !media_url) {
    console.warn('[API] ⚠️ ABORTO: Falta contenido del mensaje o archivo adjunto.');
    console.log(`======================================================\n`);
    return res.status(400).json({ error: 'Falta el contenido del mensaje o el archivo adjunto' });
  }

  try {
    let finalPhone = phone;
    let finalConversationId = conversation_id;

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> A. RESOLUCIÓN DE DESTINATARIO`);
    
    if (!finalPhone && finalConversationId) {
      console.log(`[API] -> Condición: No hay phone pero SÍ conversation_id (${finalConversationId}). Buscando en DB...`);
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('client_phone')
        .eq('id', finalConversationId)
        .single();

      if (convError || !conv) {
        console.error(`[API] ❌ ERROR: Conversación no encontrada en Supabase. Detalles:`, convError);
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }
      finalPhone = conv.client_phone;
      console.log(`[API] ✅ Teléfono recuperado de DB: ${finalPhone}`);
    } else if (finalPhone && !finalConversationId) {
      console.log(`[API] -> Condición: SÍ hay phone (${finalPhone}) pero NO conversation_id. Buscando en DB...`);
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .eq('client_phone', finalPhone)
        .single();
        
      if (convError) {
         console.warn(`[API] ⚠️ Advertencia buscando ID de conversación por teléfono:`, convError);
      }
      if (conv) {
         finalConversationId = conv.id;
         console.log(`[API] ✅ Conversation_id recuperado de DB: ${finalConversationId}`);
      } else {
         console.log(`[API] -> No se encontró conversation_id previo para este teléfono.`);
      }
    } else {
      console.log(`[API] -> Condición: Ambos phone y conversation_id provistos (o ninguno). Phone: ${finalPhone}, ID: ${finalConversationId}`);
    }

    if (!finalPhone) {
      console.warn('[API] ⚠️ ABORTO: Imposible resolver el número de teléfono.');
      console.log(`======================================================\n`);
      return res.status(400).json({ error: 'Faltan parámetros requeridos (phone o conversation_id)' });
    }
    
    let cleanPhone = finalPhone.replace(/[\s+\-]/g, '');
    console.log(`[API] -> Teléfono limpio para Meta: ${cleanPhone}`);

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> A.1 VERIFICACIÓN DE VENTANA DE 24HS DE META`);
    // Meta acepta el POST igual (HTTP 200 con wamid) aunque la ventana de 24hs
    // esté cerrada, y recién rechaza la entrega más tarde vía el webhook de
    // "statuses" (error 131047) — para entonces el operador ya vio el mensaje
    // como "enviado". Chequeamos acá antes de llamar a Meta para avisar al
    // toque, en vez de que falle en silencio unos segundos después.
    if (finalConversationId) {
      const { data: lastClientMsgs, error: lastClientMsgError } = await supabase
        .from('messages')
        .select('created_at')
        .eq('conversation_id', finalConversationId)
        .eq('sender_type', 'client')
        .order('created_at', { ascending: false })
        .limit(1);

      if (lastClientMsgError) {
        console.warn('[API] ⚠️ No se pudo verificar la ventana de 24hs (se continúa igual):', lastClientMsgError);
      } else {
        const lastClientMsg = lastClientMsgs?.[0];
        const horasDesdeUltimoMensaje = lastClientMsg
          ? (Date.now() - new Date(lastClientMsg.created_at).getTime()) / (1000 * 60 * 60)
          : Infinity;
        console.log(`[API] -> Última respuesta del cliente: ${lastClientMsg?.created_at || 'nunca'} (${horasDesdeUltimoMensaje.toFixed(1)}hs atrás)`);

        if (horasDesdeUltimoMensaje > 24) {
          console.warn('[API] ⚠️ ABORTO: ventana de 24hs de Meta cerrada, no se puede mandar texto/adjunto libre.');
          console.log(`======================================================\n`);
          return res.status(400).json({
            error: 'No se puede enviar: pasaron más de 24hs desde el último mensaje del cliente. Meta solo permite reabrir la conversación con una plantilla aprobada, no con texto libre.',
            metaCode: 131047
          });
        }
      }
    }

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> B. PERSISTENCIA INICIAL EN SUPABASE (estado: pendiente)`);
    
    let dbMessageId = null;
    if (finalConversationId) {
        const typeDB = media_url ? (media_type || 'image') : 'text';
        const messagePayload = {
            // Si el frontend ya generó un id (mensaje optimista), lo reusamos para que sea
            // la MISMA fila que Realtime le devuelve al cliente, en vez de una duplicada.
            ...(id ? { id } : {}),
            conversation_id: finalConversationId,
            sender_type: sender_type || 'agent',
            message_text: finalMessage,
            media_type: typeDB,
            media_url: media_url,
            estado: 'pendiente'
        };
        console.log(`[API] -> Insertando mensaje como pendiente en DB...`);
        const { data: insertData, error: insertError } = await supabase.from('messages').insert([messagePayload]).select().single();
        if (insertError) {
            console.error('[API] ❌ ERROR GUARDANDO MENSAJE PENDIENTE:', insertError);
        } else if (insertData) {
            dbMessageId = insertData.id;
            console.log(`[API] ✅ Mensaje pendiente guardado con ID:`, dbMessageId);
        }
    }

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> C. LLAMADA AL SERVICIO DE META (whatsapp.js)`);
    console.log(`[API] -> Enviando a sendWhatsAppMessage. Destino: ${cleanPhone}, Texto: "${finalMessage}", MediaUrl: ${media_url}, MediaType: ${media_type}`);
    
    let metaResponse;
    try {
      metaResponse = await sendWhatsAppMessage(cleanPhone, finalMessage, media_url, media_type);
    } catch (metaError) {
      // Sin esto, un envío rechazado por Meta (ej. un adjunto con un
      // media_type que la API no acepta) dejaba el mensaje trabado en
      // estado 'pendiente' para siempre -el reloj de "enviando..." nunca
      // se convertía en el ícono de error- porque el catch de más abajo
      // solo responde el 500 y no toca la fila ya insertada.
      if (dbMessageId) {
        await supabase.from('messages').update({ estado: 'error' }).eq('id', dbMessageId);
      }
      throw metaError;
    }
    console.log(`[API] ✅ Respuesta exitosa de Meta recibida en el endpoint:`, metaResponse);
    
    const wamid = metaResponse?.messages?.[0]?.id;

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> D. ACTUALIZACIÓN POST-ENVÍO EN SUPABASE`);
    
    if (dbMessageId && wamid) {
        console.log(`[API] -> Actualizando mensaje ${dbMessageId} a estado 'enviado' con wamid: ${wamid}`);
        await supabase.from('messages')
            .update({ estado: 'enviado', wamid: wamid })
            .eq('id', dbMessageId);
    }
    
    if (finalConversationId) {
        const previewText = media_url ? `📎 Archivo enviado${finalMessage ? ' - ' + finalMessage : ''}` : finalMessage;
        console.log(`[API] -> Actualizando last_message en 'conversations' a: "${previewText}"`);
        
        await supabase.from('conversations')
            .update({ last_message: previewText })
            .eq('id', finalConversationId);
    }

    console.log(`[API - POST /messages/send] ==> ✅ FIN CICLO DE VIDA (SUCCESS 200)`);
    console.log(`======================================================\n`);
    res.status(200).json({ success: true, message: 'Enviado a WhatsApp y guardado en DB', meta: metaResponse });
    
  } catch (error) {
    console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    console.error(`[API - CATCH BLOCK] ❌ ERROR FATAL PROCESANDO EL ENVÍO:`);
    console.error(error.stack || error);
    console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
    res.status(500).json({
      error: error.message || 'Error interno del servidor',
      metaCode: error.metaCode,
      metaSubcode: error.metaSubcode
    });
  }
});

const TAGS_VALIDOS = ['comprobante', 'receta'];

// Marca (o desmarca, con tag: null) un mensaje con adjunto como "el"
// comprobante o "la" receta oficial de su conversación. Sólo puede haber un
// mensaje con cada tag por conversación: al marcar uno nuevo, se desmarca
// automáticamente el anterior que tuviera el mismo tag.
//
// A propósito, SIN blockAdminRole (a diferencia del resto de las acciones de
// esta sección): etiquetar un adjunto no es "operar" el flujo de atención al
// cliente (no manda mensajes ni mueve el chat de cola), es prolijidad de
// datos para que "Detalle de Consultas" y su export a CSV (ver
// metricsDetalle.js) puedan resolver comprobante/receta — algo que al admin
// le sirve poder corregir aunque no atienda chats.
router.patch('/messages/:id/tag', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { tag } = req.body;

  if (tag !== null && !TAGS_VALIDOS.includes(tag)) {
    return res.status(400).json({ error: `tag inválido: debe ser ${TAGS_VALIDOS.join(', ')} o null` });
  }

  try {
    const { data: msg, error: msgError } = await supabase
      .from('messages')
      .select('id, conversation_id')
      .eq('id', id)
      .single();

    if (msgError || !msg) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    if (tag !== null) {
      // Desmarca cualquier otro mensaje de esta conversación que ya tuviera
      // este mismo tag, para que sólo exista un "comprobante" y una "receta"
      // vigente a la vez.
      await supabase
        .from('messages')
        .update({ tagged_as: null })
        .eq('conversation_id', msg.conversation_id)
        .eq('tagged_as', tag)
        .neq('id', id);
    }

    const { data: updated, error: updateError } = await supabase
      .from('messages')
      .update({ tagged_as: tag })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.status(200).json({ success: true, message: updated });
  } catch (error) {
    console.error('[API] ❌ ERROR marcando mensaje:', error);
    res.status(500).json({ error: error.message || 'No se pudo marcar el mensaje.' });
  }
});

// Resuelve lat/lng de un link de Google Maps pegado como texto plano en un
// mensaje del chat, para que el frontend pueda mostrar la misma tarjeta
// enriquecida que ya usa para ubicaciones nativas de WhatsApp (ver
// MessageBubble.jsx: parseLocationMessage / MapsLinkPreview). Reutiliza
// extraerCoordenadasDeUrl (mismo whitelist de hosts que ya usa el bot para no
// abrir una puerta a SSRF) en vez de que el navegador intente resolver el
// link cortado (maps.app.goo.gl) directo, que falla por CORS.
router.get('/resolve-maps-url', requireAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Falta url.' });
  }
  try {
    const coords = await extraerCoordenadasDeUrl(url);
    res.status(200).json({ coords });
  } catch (error) {
    console.error('[API] ❌ ERROR resolviendo link de Maps:', error);
    res.status(500).json({ error: 'No se pudo resolver el link de Maps.' });
  }
});

export default router;
