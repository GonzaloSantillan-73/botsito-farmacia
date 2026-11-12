import { supabase } from '../supabase.js';
import { traerTodasLasPaginas, traerPorGruposDeIds } from './consultasEnGrupos.js';
import { resolverNombresPorTelefono } from './clientes.js';
import { obtenerDetalleConsultas } from './metricsDetalle.js';
import { obtenerPanelMetricas } from './metricasPanel.js';
import { sheetsToXlsxBuffer } from './xlsxExport.js';

// Exportaciones completas de Configuración > Exportar datos (sólo admin):
// - generarExportChats: historial de chats (hojas "Mensajes" y "Consultas").
// - generarExportMetricas: todas las métricas del panel + el detalle por
//   consulta, en varias hojas de un mismo Excel.
// Todo en español y en hora Argentina (UTC-3, sin horario de verano).

const OFFSET_AR_MS = 3 * 60 * 60 * 1000;
const local = (iso) => new Date(new Date(iso).getTime() - OFFSET_AR_MS);
const fechaAR = (iso) => (iso ? local(iso).toISOString().slice(0, 10).split('-').reverse().join('/') : '');
const horaAR = (iso) => (iso ? local(iso).toISOString().slice(11, 19) : '');
const fechaHoraAR = (iso) => (iso ? `${fechaAR(iso)} ${horaAR(iso).slice(0, 5)}` : '');
const minutos = (ms) => (ms != null && Number.isFinite(Number(ms)) ? Math.round(Number(ms) / 60000) : '');
const dosDec = (v) => (v == null || !Number.isFinite(Number(v)) ? '' : Math.round(Number(v) * 100) / 100);
const siNo = (v) => (v ? 'Sí' : 'No');
const PESOS = '"$"#,##0.00';

export const ESTADOS_CONSULTA = {
  open: 'Con el bot', esperando: 'En espera / atendida', finalizada: 'Finalizada', resolved: 'Resuelta',
  rejected: 'Rechazada', pending_validation: 'Receta pendiente', preparation: 'En preparación', ready: 'Lista / en envío'
};
const MOTIVOS_CIERRE = {
  manual: 'Finalizada por el vendedor (con encuesta)', manual_sin_encuesta: 'Finalizada por el vendedor (sin encuesta)',
  inactividad_cliente: 'El cliente dejó de responder', sin_respuesta_farmacia: 'La farmacia no respondió a tiempo',
  sin_tomar: 'Ninguna sucursal la tomó', solo_bot: 'Solo con el bot', sin_dato: 'Sin dato (anteriores)'
};
const TIPOS_BOT = {
  saludo: 'Saludo', menu: 'Bienvenida y menú', recordatorio: 'Recordatorio de botones', ubicacion: 'Pedido de ubicación',
  derivacion: 'Derivación a una sucursal', registro: 'Registro (nombre)', encuesta: 'Encuesta y cierre',
  aviso_inactividad: '"¿Seguís necesitando ayuda?"', sucursales: 'Listado de sucursales',
  fuera_horario: 'Fuera de horario', cambio_nombre: 'Cambio de nombre', error: 'Avisos de error',
  otro: 'Otros', sin_dato: 'Sin dato (anteriores)', bot_anterior: 'Menú y ubicación (bot anterior)'
};
const VENTA = { concretada: 'Venta concretada', no_concretada: 'Venta no concretada', otra: 'Otra razón' };
const REMITENTE = { client: 'Cliente', agent: 'Sucursal', bot: 'Bot', system: 'Nota interna' };
const ESTADO_ENVIO = {
  pendiente: 'Enviando', enviado: 'Enviado', entregado: 'Entregado', leido: 'Leído', error: 'Falló el envío',
  recibido: 'Recibido', desconocido: 'Desconocido'
};
const MARCA = { comprobante: 'Comprobante', receta: 'Receta', ubicacion: 'Ubicación' };
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const nombreArchivo = (url) => (url || '').split('?')[0].split('/').pop() || '';
const tipoMensaje = (m) => {
  if (m.media_type === 'image' && nombreArchivo(m.media_url).startsWith('sticker_')) return 'Sticker';
  if (m.media_type === 'video' && nombreArchivo(m.media_url).startsWith('gif_')) return 'GIF';
  return ({
    text: 'Texto', image: 'Imagen', video: 'Video', audio: 'Nota de voz', document: 'Documento', pdf: 'PDF',
    blocked_pdf: 'PDF bloqueado', location: 'Ubicación'
  })[m.media_type] || 'Texto';
};
const linkMaps = (lat, lng) => (lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : '');
const parseUbicacion = (m) => {
  if (m.media_type !== 'location') return null;
  try {
    const u = JSON.parse(m.message_text || '{}');
    return { ...u, link: linkMaps(u.lat, u.lng) };
  } catch {
    return null;
  }
};
const textoMensaje = (m) => {
  const u = parseUbicacion(m);
  if (u) return ['📍 Ubicación', u.name, u.address].filter(Boolean).join(' — ');
  return m.message_text || '';
};

// SELECT con reintento sin las columnas nuevas si alguna migración no se corrió (42703).
const traerConReintento = async (consultar, completas, basicas) => {
  let r = await consultar(completas);
  if (r.error?.code === '42703' || /column/i.test(r.error?.message || '')) r = await consultar(basicas);
  if (r.error) throw r.error;
  return r.data || [];
};

const traerSucursales = async () => {
  const { data, error } = await supabase.from('sucursales').select('id, nombre');
  if (error) throw error;
  return Object.fromEntries((data || []).map(s => [s.id, s.nombre]));
};

const traerConversacionesPorId = async (ids) => {
  if (!ids.length) return {};
  const { data, error } = await traerPorGruposDeIds(ids, grupo => supabase
    .from('conversations').select('*').in('id', grupo).order('id'));
  if (error) throw error;
  return Object.fromEntries((data || []).map(c => [c.id, c]));
};

const traerFichasClientes = async (telefonos) => {
  if (!telefonos.length) return {};
  const { data, error } = await traerPorGruposDeIds(telefonos, grupo => supabase
    .from('clientes').select('*').in('client_phone', grupo).order('id'));
  if (error) throw error;
  return Object.fromEntries((data || []).map(f => [f.client_phone, f]));
};

// Sucursal que mandó cada mensaje (la del momento del envío), desde el
// registro mensajes_enviados (supabase/metricas_base.sql). Sin ese registro,
// queda vacío y se usa la sucursal de la consulta.
const traerSucursalPorMensaje = async (ids) => {
  if (!ids.length) return {};
  const { data, error } = await traerPorGruposDeIds(ids, grupo => supabase
    .from('mensajes_enviados').select('message_id, sucursal_id, sucursal_nombre').in('message_id', grupo).order('id'));
  if (error) {
    console.warn('⚠️ [DEBUG-SERVICE-EXPORTCOMPLETO] mensajes_enviados no disponible, se usa la sucursal de la consulta:', error.message);
    return {};
  }
  return Object.fromEntries((data || []).map(r => [r.message_id, r]));
};

// ---- Historial de chats --------------------------------------------------------
export const generarExportChats = async ({ startDate, endDate }) => {
  const desde = `${startDate}T00:00:00.000-03:00`;
  const hasta = `${endDate}T23:59:59.999-03:00`;
  const BASICAS = 'id, created_at, sender_type, message_text, media_type, media_url, conversation_id, tagged_as, is_auto_reminder, estado, wamid';
  const COMPLETAS = `${BASICAS}, reaction_emoji, deleted_reason, reply_to_wamid, tipo_bot`;
  const mensajes = await traerConReintento(
    (cols) => traerTodasLasPaginas(() => supabase.from('messages').select(cols)
      .gte('created_at', desde).lte('created_at', hasta)
      .order('created_at', { ascending: true }).order('id', { ascending: true })),
    COMPLETAS, BASICAS
  );

  const convIds = [...new Set(mensajes.map(m => m.conversation_id).filter(Boolean))];
  const [sucursales, convs, porMensaje] = await Promise.all([
    traerSucursales(),
    traerConversacionesPorId(convIds),
    traerSucursalPorMensaje(mensajes.filter(m => m.sender_type === 'agent' || m.sender_type === 'bot').map(m => m.id))
  ]);
  const telefonos = [...new Set(Object.values(convs).map(c => c.client_phone).filter(Boolean))];
  const [nombres, fichas] = await Promise.all([resolverNombresPorTelefono(telefonos), traerFichasClientes(telefonos)]);
  const nombreSuc = (id) => (id ? (sucursales[id] || 'Sucursal eliminada') : '');
  const porWamid = Object.fromEntries(mensajes.filter(m => m.wamid).map(m => [m.wamid, m]));

  const conv = (m) => convs[m.conversation_id] || {};
  const sucursalQueEnvio = (m) => {
    if (m.sender_type !== 'agent') return '';
    const r = porMensaje[m.id];
    return r?.sucursal_nombre || nombreSuc(r?.sucursal_id) || nombreSuc(conv(m).sucursal_id);
  };
  const citado = (m) => {
    if (!m.reply_to_wamid) return '';
    const c = porWamid[m.reply_to_wamid];
    if (!c) return '(mensaje anterior al rango exportado)';
    return `${REMITENTE[c.sender_type] || ''}: ${(textoMensaje(c) || tipoMensaje(c)).slice(0, 120)}`;
  };

  const colMensajes = [
    { label: 'Fecha', align: 'center', value: m => fechaAR(m.created_at) },
    { label: 'Hora', align: 'center', value: m => horaAR(m.created_at) },
    { label: 'ID consulta', align: 'center', value: m => (m.conversation_id || '').slice(0, 8) },
    { label: 'Cliente', value: m => nombres[conv(m).client_phone] || conv(m).client_name || '' },
    { label: 'Teléfono', align: 'center', value: m => conv(m).client_phone || '' },
    { label: 'Remitente', align: 'center', value: m => REMITENTE[m.sender_type] || m.sender_type || '' },
    { label: 'Sucursal que envió', align: 'center', value: sucursalQueEnvio },
    { label: 'Sucursal de la consulta', align: 'center', value: m => nombreSuc(conv(m).sucursal_id) },
    { label: 'Tipo de mensaje', align: 'center', value: tipoMensaje },
    { label: 'Mensaje del bot', align: 'center', value: m => (m.sender_type === 'bot' ? (TIPOS_BOT[m.tipo_bot] || m.tipo_bot || '') : '') },
    { label: 'Mensaje', width: 60, wrap: true, value: textoMensaje },
    { label: 'Archivo / mapa', link: true, value: m => parseUbicacion(m)?.link || m.media_url || '' },
    { label: 'Marcado como', align: 'center', value: m => MARCA[m.tagged_as] || '' },
    { label: 'Responde a', width: 40, value: citado },
    { label: 'Reacción', align: 'center', value: m => m.reaction_emoji || '' },
    { label: 'Estado del envío', align: 'center', value: m => ESTADO_ENVIO[m.estado] || m.estado || '' },
    { label: 'Automático (no cuenta como actividad)', align: 'center', value: m => siNo(m.is_auto_reminder) },
    { label: 'Archivo eliminado (motivo)', value: m => m.deleted_reason || '' }
  ];

  // Una fila por consulta que tuvo mensajes en el rango.
  const agg = {};
  for (const m of mensajes) {
    const a = agg[m.conversation_id] || (agg[m.conversation_id] = { primero: m.created_at, ultimo: m.created_at, cliente: 0, bot: 0, sucursal: 0, notas: 0, sucursalesQueEscribieron: new Set() });
    a.ultimo = m.created_at;
    if (m.sender_type === 'client') a.cliente += 1;
    if (m.sender_type === 'bot') a.bot += 1;
    if (m.sender_type === 'system') a.notas += 1;
    if (m.sender_type === 'agent') { a.sucursal += 1; const s = sucursalQueEnvio(m); if (s) a.sucursalesQueEscribieron.add(s); }
  }
  const filasConsultas = convIds.map(id => ({ c: convs[id] || { id }, a: agg[id] }))
    .sort((x, y) => String(x.c.created_at || '').localeCompare(String(y.c.created_at || '')));
  const ficha = (r) => fichas[r.c.client_phone] || {};
  const colConsultas = [
    { label: 'ID consulta', align: 'center', value: r => (r.c.id || '').slice(0, 8) },
    { label: 'Inicio', align: 'center', value: r => fechaHoraAR(r.c.created_at) },
    { label: 'Último mensaje', align: 'center', value: r => fechaHoraAR(r.a?.ultimo) },
    { label: 'Cliente', value: r => nombres[r.c.client_phone] || r.c.client_name || '' },
    { label: 'Teléfono', align: 'center', value: r => r.c.client_phone || '' },
    { label: 'DNI', align: 'center', value: r => ficha(r).dni || '' },
    { label: 'Obra social', align: 'center', value: r => ficha(r).obra_social || '' },
    { label: 'Estado', align: 'center', value: r => ESTADOS_CONSULTA[r.c.status] || r.c.status || '' },
    { label: 'Motivo de cierre', value: r => MOTIVOS_CIERRE[r.c.motivo_cierre] || '' },
    { label: 'Primera sucursal que la tomó', align: 'center', value: r => nombreSuc(r.c.primera_sucursal_id) },
    { label: 'Sucursal final', align: 'center', value: r => nombreSuc(r.c.sucursal_id) },
    { label: 'Sucursales que escribieron', value: r => [...(r.a?.sucursalesQueEscribieron || [])].join(', ') },
    { label: 'Derivada por', align: 'center', value: r => r.c.derivado_por_sucursal_nombre || nombreSuc(r.c.derivado_por_sucursal_id) },
    { label: 'Devuelta a la cola por', align: 'center', value: r => nombreSuc(r.c.devuelta_por_sucursal_id) },
    { label: 'Demora inicial (min)', align: 'center', value: r => minutos(r.c.demora_inicial_ms) },
    { label: 'Msjs cliente', align: 'center', value: r => r.a?.cliente ?? 0 },
    { label: 'Msjs bot', align: 'center', value: r => r.a?.bot ?? 0 },
    { label: 'Msjs sucursal', align: 'center', value: r => r.a?.sucursal ?? 0 },
    { label: 'Notas internas', align: 'center', value: r => r.a?.notas ?? 0 },
    { label: 'Venta', align: 'center', value: r => VENTA[r.c.sale_status] || '' },
    { label: 'Motivo (si no hubo venta)', value: r => r.c.sale_reason || '' },
    { label: 'Monto', align: 'center', numFmt: PESOS, value: r => dosDec(r.c.sale_amount) },
    { label: 'Medio de pago', align: 'center', value: r => r.c.payment_method || '' },
    { label: 'Calificación atención', align: 'center', value: r => r.c.rating ?? '' },
    { label: 'Calificación producto', align: 'center', value: r => r.c.product_rating ?? '' },
    { label: 'Notas del operador', width: 40, value: r => r.c.notas_operador || '' }
  ];

  return sheetsToXlsxBuffer([
    { name: 'Mensajes', columns: colMensajes, rows: mensajes },
    { name: 'Consultas', columns: colConsultas, rows: filasConsultas }
  ]);
};

// ---- Métricas ------------------------------------------------------------------
export const generarExportMetricas = async ({ startDate, endDate }) => {
  const [panel, filas, sucursales] = await Promise.all([
    obtenerPanelMetricas({ startDate, endDate }),
    obtenerDetalleConsultas({ startDate, endDate }),
    traerSucursales()
  ]);
  const ids = filas.map(f => f.id);
  const convs = await traerConversacionesPorId(ids);
  const telefonos = [...new Set(filas.map(f => f.telefono).filter(Boolean))];
  const fichas = await traerFichasClientes(telefonos);
  const nombreSuc = (id) => (id ? (sucursales[id] || 'Sucursal eliminada') : '');

  // Número de consulta de cada cliente (1 = primera vez que escribió).
  const { data: todas, error } = telefonos.length
    ? await traerPorGruposDeIds(telefonos, grupo => supabase.from('conversations').select('id, client_phone, created_at').in('client_phone', grupo).order('id'))
    : { data: [], error: null };
  if (error) throw error;
  const numeroConsulta = {};
  const porTel = {};
  (todas || []).forEach(c => { (porTel[c.client_phone] = porTel[c.client_phone] || []).push(c); });
  Object.values(porTel).forEach(lista => {
    lista.sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((c, i) => { numeroConsulta[c.id] = i + 1; });
  });

  const paraRevisar = (r) => r.saleStatus === 'concretada' && (!r.comprobanteUrl || r.subtotal == null || r.montoTotal == null);
  const faltantes = (r) => [!r.comprobanteUrl && 'comprobante', (r.subtotal == null || r.montoTotal == null) && 'subtotal/total'].filter(Boolean).join(' y ');
  const c = (r) => convs[r.id] || {};
  const f = (r) => fichas[r.telefono] || {};

  const colDetalle = [
    { label: 'ID consulta', align: 'center', value: r => r.id.slice(0, 8) },
    { label: 'Fecha', align: 'center', value: r => fechaAR(r.fecha) },
    { label: 'Hora inicio', align: 'center', value: r => horaAR(r.fecha).slice(0, 5) },
    { label: 'Día', align: 'center', value: r => DIAS_SEMANA[local(r.fecha).getUTCDay()] },
    { label: 'Cliente', value: r => r.cliente },
    { label: 'Teléfono', align: 'center', value: r => r.telefono },
    { label: 'DNI', align: 'center', value: r => f(r).dni || '' },
    { label: 'Obra social', align: 'center', value: r => f(r).obra_social || '' },
    { label: 'N.º de consulta del cliente', align: 'center', value: r => numeroConsulta[r.id] || '' },
    { label: 'Cliente nuevo', align: 'center', value: r => siNo(numeroConsulta[r.id] === 1) },
    { label: 'Ubicación del cliente', link: true, value: r => linkMaps(f(r).ubicacion_lat, f(r).ubicacion_lng) },
    { label: 'Estado', align: 'center', value: r => ESTADOS_CONSULTA[r.status] || r.status },
    { label: 'Motivo de cierre', value: r => MOTIVOS_CIERRE[c(r).motivo_cierre] || '' },
    { label: 'Primera sucursal que la tomó', align: 'center', value: r => nombreSuc(c(r).primera_sucursal_id) },
    { label: 'Sucursal final', align: 'center', value: r => r.sucursal },
    { label: 'Derivada por', align: 'center', value: r => c(r).derivado_por_sucursal_nombre || nombreSuc(c(r).derivado_por_sucursal_id) },
    { label: 'Devuelta a la cola por', align: 'center', value: r => nombreSuc(c(r).devuelta_por_sucursal_id) },
    { label: 'Atendida por una sucursal', align: 'center', value: r => siNo(r.esDerivada) },
    { label: 'Demora inicial (min)', align: 'center', value: r => minutos(r.demoraInicialMs) },
    { label: 'Duración total (min)', align: 'center', value: r => minutos(r.duracionTotalMs) },
    { label: 'Msjs cliente', align: 'center', value: r => r.msjsCliente },
    { label: 'Msjs bot', align: 'center', value: r => r.msjsBot },
    { label: 'Msjs sucursal', align: 'center', value: r => r.msjsSucursal },
    { label: 'Estado del contacto', align: 'center', value: r => VENTA[r.saleStatus] || 'Sin marcar' },
    { label: 'Motivo (si no hubo venta)', value: r => c(r).sale_reason || '' },
    { label: 'Subtotal', align: 'center', numFmt: PESOS, value: r => dosDec(r.subtotal) },
    { label: 'Envío', align: 'center', value: r => (r.costoEnvio == null ? '' : (r.costoEnvio === 0 ? 'Envío gratis' : r.costoEnvio)) },
    { label: 'Monto total', align: 'center', numFmt: PESOS, value: r => dosDec(r.montoTotal) },
    { label: 'Medio de pago', align: 'center', value: r => r.medioPago },
    { label: 'Venta corregida por el admin', align: 'center', value: r => (r.ventaEditadaAt ? `Sí (${fechaHoraAR(r.ventaEditadaAt)})` : 'No') },
    { label: 'Para revisar', align: 'center', value: r => (paraRevisar(r) ? `Sí: falta ${faltantes(r)}` : 'No') },
    { label: 'Calificación atención', align: 'center', value: r => r.rating ?? '' },
    { label: 'Calificación producto', align: 'center', value: r => r.productRating ?? '' },
    { label: 'Comprobante', link: true, value: r => r.comprobanteUrl || '' },
    { label: 'Receta', link: true, value: r => r.recetaUrl || '' },
    { label: 'Notas del operador', width: 40, value: r => c(r).notas_operador || '' }
  ];

  // Resumen: Sección | Indicador | Valor | Período anterior | Variación.
  const R = panel.resumen;
  const A = panel.resumenAnterior || {};
  const V = panel.variaciones || {};
  const fila = (seccion, indicador, valor, extra = {}) => ({ seccion, indicador, valor, ...extra });
  const pesos = (v) => (v == null ? '' : `$ ${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const porc = (v) => (v == null ? '' : `${dosDec(v)} %`);
  const min = (ms) => (ms == null ? '' : `${minutos(ms)} min`);
  const conAnterior = (clave, fmt) => ({ anterior: A[clave] != null ? fmt(A[clave]) : '', variacion: V[clave] != null ? porc(V[clave]) : '' });
  const id = (x) => x;
  const resumen = [
    fila('General', 'Período', startDate && endDate ? `${startDate.split('-').reverse().join('/')} al ${endDate.split('-').reverse().join('/')}` : 'Todo'),
    fila('General', 'Período anterior (comparación)', panel.periodoAnterior ? `${panel.periodoAnterior.startDate.split('-').reverse().join('/')} al ${panel.periodoAnterior.endDate.split('-').reverse().join('/')}` : ''),
    fila('General', 'Consultas', R.consultas, conAnterior('consultas', id)),
    fila('General', 'Clientes', R.clientes, conAnterior('clientes', id)),
    fila('General', 'Pedidos / ventas', R.pedidos, conAnterior('pedidos', id)),
    fila('General', 'Monto total vendido', pesos(R.montoTotal), conAnterior('montoTotal', pesos)),
    fila('General', 'Ticket promedio', pesos(R.ticketPromedio), conAnterior('ticketPromedio', pesos)),
    fila('General', 'Mensajes enviados (bot + sucursales)', R.mensajes, conAnterior('mensajes', id)),
    fila('General', 'Conversión (consultas atendidas que terminaron en venta)', porc(R.conversion), conAnterior('conversion', porc)),
    fila('Mensajes', 'Mensajes del bot', panel.mensajes.bot),
    fila('Mensajes', 'Mensajes de las sucursales', panel.mensajes.sucursal),
    fila('Mensajes', '% del bot', porc(panel.mensajes.pctBot)),
    fila('Mensajes', '% de las sucursales', porc(panel.mensajes.pctSucursal)),
    fila('Mensajes', 'Mensajes por consulta (promedio)', dosDec(panel.mensajes.promedioPorConsulta)),
    fila('Ventas', 'Envíos gratis', panel.ventas.envios.gratis),
    fila('Ventas', 'Envíos pagos', panel.ventas.envios.pago),
    fila('Ventas', 'Sin costo de envío (retiro, etc.)', panel.ventas.envios.sinCosto),
    fila('Ventas', 'Envío sin dato', panel.ventas.envios.sinDato),
    fila('Ventas', 'Total cobrado en envíos', pesos(panel.ventas.envios.montoEnvios)),
    fila('Ventas', '% de envíos gratis', porc(panel.ventas.envios.pctGratis)),
    fila('Ventas', 'Ventas para revisar (sin comprobante o sin montos)', filas.filter(paraRevisar).length),
    fila('Clientes', 'Clientes atendidos', panel.clientes.atendidos),
    fila('Clientes', 'Clientes nuevos', panel.clientes.nuevos),
    fila('Clientes', 'Clientes que vuelven', panel.clientes.queVuelven),
    fila('Clientes', 'Clientes que compraron', panel.clientes.compraron),
    fila('Clientes', 'Clientes que solo consultaron', panel.clientes.soloConsultaron),
    fila('Clientes', '% que compraron', porc(panel.clientes.pctCompraron)),
    fila('Clientes', 'Consultas por cliente (promedio)', dosDec(panel.clientes.consultasPorCliente)),
    fila('Atención', 'Atendidas por una sucursal', panel.atencion.atendidasPorSucursal),
    fila('Atención', 'Reasignadas (derivadas o devueltas)', panel.atencion.reasignadas),
    fila('Atención', 'Demora inicial promedio', min(panel.atencion.demoraPromedioMs)),
    fila('Atención', 'Duración promedio de una consulta', min(panel.atencion.duracionPromedioMs)),
    ...Object.entries(panel.atencion.cierres || {}).sort((a, b) => b[1] - a[1])
      .map(([m, n]) => fila('Cierres', MOTIVOS_CIERRE[m] || m, n)),
    ...(() => {
      const ratings = filas.filter(x => x.rating != null).map(x => Number(x.rating));
      const prods = filas.filter(x => x.productRating != null).map(x => Number(x.productRating));
      const prom = (v) => (v.length ? dosDec(v.reduce((a, b) => a + b, 0) / v.length) : '');
      return [
        fila('Calificaciones', 'Calificaciones de atención recibidas', ratings.length),
        fila('Calificaciones', 'Promedio de atención (1 a 5)', prom(ratings)),
        ...[5, 4, 3, 2, 1].map(n => fila('Calificaciones', `Atención: ${n} estrella${n > 1 ? 's' : ''}`, ratings.filter(x => x === n).length)),
        fila('Calificaciones', 'Calificaciones de producto recibidas', prods.length),
        fila('Calificaciones', 'Promedio de producto (1 a 5)', prom(prods)),
        ...[5, 4, 3, 2, 1].map(n => fila('Calificaciones', `Producto: ${n} estrella${n > 1 ? 's' : ''}`, prods.filter(x => x === n).length))
      ];
    })()
  ];
  const colResumen = [
    { label: 'Sección', value: r => r.seccion },
    { label: 'Indicador', width: 55, value: r => r.indicador },
    { label: 'Valor', align: 'center', value: r => r.valor },
    { label: 'Período anterior', align: 'center', value: r => r.anterior },
    { label: 'Variación', align: 'center', value: r => r.variacion }
  ];

  const totalSucursales = {
    nombre: 'TOTAL', consultas: R.consultas, clientes: R.clientes, pedidos: R.pedidos, monto: R.montoTotal,
    ticketPromedio: R.ticketPromedio, conversion: R.conversion, enviosGratis: panel.ventas.envios.gratis,
    mensajes: panel.mensajes.sucursal, mensajesPorConsulta: R.consultas > 0 ? panel.mensajes.sucursal / R.consultas : null,
    demoraPromedioMs: panel.atencion.demoraPromedioMs, satisfaccion: null, calificaciones: null
  };
  const colSucursales = [
    { label: 'Sucursal', value: s => s.nombre },
    { label: 'Consultas', align: 'center', value: s => s.consultas },
    { label: 'Clientes', align: 'center', value: s => s.clientes },
    { label: 'Pedidos', align: 'center', value: s => s.pedidos },
    { label: 'Monto', align: 'center', numFmt: PESOS, value: s => dosDec(s.monto) },
    { label: 'Ticket promedio', align: 'center', numFmt: PESOS, value: s => dosDec(s.ticketPromedio) },
    { label: 'Conversión (%)', align: 'center', value: s => dosDec(s.conversion) },
    { label: 'Envíos gratis', align: 'center', value: s => s.enviosGratis },
    { label: 'Mensajes de la sucursal', align: 'center', value: s => s.mensajes },
    { label: 'Mensajes por consulta', align: 'center', value: s => dosDec(s.mensajesPorConsulta) },
    { label: 'Demora promedio (min)', align: 'center', value: s => minutos(s.demoraPromedioMs) },
    { label: 'Satisfacción (1 a 5)', align: 'center', value: s => dosDec(s.satisfaccion) },
    { label: 'Calificaciones recibidas', align: 'center', value: s => s.calificaciones ?? '' }
  ];

  const colDias = [
    { label: 'Fecha', align: 'center', value: d => d.fecha.split('-').reverse().join('/') },
    { label: 'Día', align: 'center', value: d => DIAS_SEMANA[new Date(`${d.fecha}T12:00:00Z`).getUTCDay()] },
    { label: 'Consultas', align: 'center', value: d => d.consultas },
    { label: 'Mensajes del bot', align: 'center', value: d => d.mensajesBot },
    { label: 'Mensajes de sucursales', align: 'center', value: d => d.mensajesSucursal },
    { label: 'Monto vendido', align: 'center', numFmt: PESOS, value: d => dosDec(d.monto) }
  ];

  const mensajesFilas = [
    ...Object.entries(panel.mensajes.porTipoBot || {}).sort((a, b) => b[1] - a[1])
      .map(([t, n]) => ({ categoria: 'Mensajes del bot por tipo', detalle: TIPOS_BOT[t] || t, cantidad: n })),
    ...(panel.mensajes.porSucursal || []).map(s => ({ categoria: 'Mensajes por sucursal', detalle: s.nombre, cantidad: s.mensajes }))
  ];
  const colMensajes = [
    { label: 'Categoría', value: r => r.categoria },
    { label: 'Detalle', width: 40, value: r => r.detalle },
    { label: 'Cantidad', align: 'center', value: r => r.cantidad }
  ];

  const horarios = [
    ...panel.atencion.porDiaSemana.map(d => ({ categoria: 'Consultas por día de la semana', detalle: DIAS_SEMANA[d.dia], cantidad: d.consultas })),
    ...panel.atencion.porHora.map(h => ({ categoria: 'Consultas por hora', detalle: `${String(h.hora).padStart(2, '0')}:00 a ${String(h.hora).padStart(2, '0')}:59`, cantidad: h.consultas }))
  ];

  const revisar = filas.filter(paraRevisar);

  return sheetsToXlsxBuffer([
    { name: 'Resumen', columns: colResumen, rows: resumen },
    { name: 'Detalle de consultas', columns: colDetalle, rows: filas },
    { name: 'Por sucursal', columns: colSucursales, rows: [...panel.porSucursal, totalSucursales] },
    { name: 'Por día', columns: colDias, rows: panel.porDia },
    { name: 'Mensajes', columns: colMensajes, rows: mensajesFilas },
    { name: 'Días y horarios', columns: colMensajes, rows: horarios },
    { name: 'Ventas para revisar', columns: colDetalle, rows: revisar }
  ]);
};
