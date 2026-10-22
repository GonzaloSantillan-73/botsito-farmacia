import { supabase } from '../supabase.js';
import { traerTodasLasPaginas, traerPorGruposDeIds } from './consultasEnGrupos.js';
import { getModoPrueba } from './appConfig.js';

// Panel de Métricas y Estadísticas (etapa 2): todos los números de las
// secciones Resumen, Mensajes, Ventas, Clientes, Atención y Comparativa por
// sucursal, para un rango de fechas y su período anterior del mismo largo.
//
// Criterios (los mismos en toda la pantalla):
// - Hora Argentina (UTC-3, sin horario de verano): los días y horas se cuentan
//   en hora local.
// - Consultas y clientes: por conversations.created_at dentro del rango.
// - Pedidos y montos: por pedidos_confirmados.confirmed_at; si una venta
//   concretada no tiene pedido (no se usó el Cotizador), cuenta su sale_amount
//   (mismo criterio que el Detalle de consultas).
// - Mensajes: por la fecha de envío, desde el registro mensajes_enviados (no
//   baja si se elimina un chat). Sin ese registro (falta correr
//   supabase/metricas_base.sql) se usa la tabla messages como respaldo.
// - El número de prueba (Configuración → Número de prueba) queda afuera.
// - La sucursal de una consulta es la que la tiene asignada al final; la de un
//   mensaje, la del momento en que se mandó.

const OFFSET_AR_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
// Mismo mínimo que el Cotizador (src/components/ValidationPanel.jsx), sólo
// para deducir el envío gratis de pedidos guardados antes de la columna
// envio_gratis.
const MINIMO_ENVIO_GRATIS = 20000;

const ultimos10 = (telefono) => String(telefono || '').replace(/\D/g, '').slice(-10);
const fechaLocal = (iso) => new Date(new Date(iso).getTime() - OFFSET_AR_MS).toISOString().slice(0, 10);
const horaLocal = (iso) => new Date(new Date(iso).getTime() - OFFSET_AR_MS).getUTCHours();
const diaSemanaLocal = (iso) => new Date(new Date(iso).getTime() - OFFSET_AR_MS).getUTCDay(); // 0 = domingo
const promedio = (valores) => {
  const v = valores.filter(x => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const pct = (parte, total) => (total > 0 ? (parte / total) * 100 : null);
// Variación % contra el período anterior (null si no hay con qué comparar).
const variacion = (actual, anterior) => {
  if (actual == null || anterior == null) return null;
  if (anterior === 0) return actual === 0 ? 0 : null;
  return ((actual - anterior) / anterior) * 100;
};

// 'AAAA-MM-DD' -> límites del día en hora Argentina, como ISO.
const desdeISO = (fecha) => `${fecha}T00:00:00.000-03:00`;
const hastaISO = (fecha) => `${fecha}T23:59:59.999-03:00`;
const sumarDias = (fecha, dias) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);

// Período anterior del mismo largo, pegado al elegido.
export const periodoAnterior = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const largo = Math.round((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / DIA_MS) + 1;
  const fin = sumarDias(startDate, -1);
  return { startDate: sumarDias(fin, -(largo - 1)), endDate: fin };
};

const conRango = (query, campo, startDate, endDate) => {
  let q = query;
  if (startDate) q = q.gte(campo, desdeISO(startDate));
  if (endDate) q = q.lte(campo, hastaISO(endDate));
  return q;
};

const traerConversaciones = async (startDate, endDate) => {
  const { data, error } = await traerTodasLasPaginas(() => conRango(
    supabase.from('conversations').select('id, client_phone, status, sucursal_id, created_at, sale_status, sale_amount, rating, demora_inicial_ms, devuelta_por_sucursal_id, derivado_por_sucursal_id'),
    'created_at', startDate, endDate
  ).order('id'));
  if (error) throw error;
  return data || [];
};

// Motivo de cierre: columna nueva (supabase/metricas_base.sql). Si todavía no
// existe, el panel funciona igual y esa parte muestra "sin dato".
const traerMotivosCierre = async (ids) => {
  if (!ids.length) return {};
  const { data, error } = await traerPorGruposDeIds(ids, grupo => supabase
    .from('conversations').select('id, motivo_cierre').in('id', grupo).order('id'));
  if (error) {
    console.warn('⚠️ [DEBUG-SERVICE-METRICASPANEL] motivo_cierre no disponible (¿falta supabase/metricas_base.sql?):', error.message);
    return {};
  }
  return Object.fromEntries((data || []).map(c => [c.id, c.motivo_cierre]));
};

const traerPedidos = async (startDate, endDate) => {
  const columnas = 'id, conversation_id, client_phone, total, subtotal, costo_envio, sucursal_id, confirmed_at';
  let { data, error } = await traerTodasLasPaginas(() => conRango(
    supabase.from('pedidos_confirmados').select(`${columnas}, envio_gratis`), 'confirmed_at', startDate, endDate
  ).order('id'));
  if (error && /envio_gratis/.test(error.message || '')) {
    ({ data, error } = await traerTodasLasPaginas(() => conRango(
      supabase.from('pedidos_confirmados').select(columnas), 'confirmed_at', startDate, endDate
    ).order('id')));
  }
  if (error) throw error;
  return data || [];
};

// Mensajes enviados (bot y sucursal) en el rango. Fuente principal: el
// registro mensajes_enviados; respaldo: messages + conversations.
const traerMensajesEnviados = async (startDate, endDate) => {
  const { data, error } = await traerTodasLasPaginas(() => conRango(
    supabase.from('mensajes_enviados').select('conversation_id, client_phone, sucursal_id, sucursal_nombre, sender_type, tipo_bot, fallido, created_at'),
    'created_at', startDate, endDate
  ).order('id'));
  if (!error) return { filas: (data || []).filter(m => !m.fallido), desdeRegistro: true };

  console.warn('⚠️ [DEBUG-SERVICE-METRICASPANEL] mensajes_enviados no disponible, se usa messages (¿falta supabase/metricas_base.sql?):', error.message);
  const { data: mensajes, error: msgError } = await traerTodasLasPaginas(() => conRango(
    supabase.from('messages').select('id, conversation_id, sender_type, estado, created_at').in('sender_type', ['bot', 'agent']),
    'created_at', startDate, endDate
  ).order('id'));
  if (msgError) throw msgError;
  const ids = [...new Set((mensajes || []).map(m => m.conversation_id))];
  const { data: convs, error: convError } = ids.length
    ? await traerPorGruposDeIds(ids, grupo => supabase.from('conversations').select('id, client_phone, sucursal_id').in('id', grupo).order('id'))
    : { data: [], error: null };
  if (convError) throw convError;
  const porId = Object.fromEntries((convs || []).map(c => [c.id, c]));
  return {
    filas: (mensajes || []).filter(m => m.estado !== 'error').map(m => ({
      conversation_id: m.conversation_id,
      client_phone: porId[m.conversation_id]?.client_phone || null,
      sucursal_id: porId[m.conversation_id]?.sucursal_id || null,
      sucursal_nombre: null,
      sender_type: m.sender_type,
      tipo_bot: null,
      created_at: m.created_at
    })),
    desdeRegistro: false
  };
};

// Primera consulta histórica de cada teléfono (para "nuevos vs. que vuelven").
const traerPrimeraConsultaPorTelefono = async (telefonos) => {
  if (!telefonos.length) return {};
  const { data, error } = await traerPorGruposDeIds(telefonos, grupo => supabase
    .from('conversations').select('client_phone, created_at').in('client_phone', grupo).order('id'));
  if (error) throw error;
  const primera = {};
  for (const c of data || []) {
    if (!primera[c.client_phone] || c.created_at < primera[c.client_phone]) primera[c.client_phone] = c.created_at;
  }
  return primera;
};

// Duración de cada consulta: del inicio al último mensaje.
const traerUltimoMensajePorConsulta = async (ids) => {
  if (!ids.length) return { ultimo: {}, conAgente: new Set() };
  const { data, error } = await traerPorGruposDeIds(ids, grupo => supabase
    .from('messages').select('conversation_id, sender_type, created_at').in('conversation_id', grupo).order('id'));
  if (error) throw error;
  const ultimo = {};
  const conAgente = new Set();
  for (const m of data || []) {
    if (!ultimo[m.conversation_id] || m.created_at > ultimo[m.conversation_id]) ultimo[m.conversation_id] = m.created_at;
    if (m.sender_type === 'agent') conAgente.add(m.conversation_id);
  }
  return { ultimo, conAgente };
};

const traerHistorialSucursales = async (ids) => {
  if (!ids.length) return {};
  const { data, error } = await traerPorGruposDeIds(ids, grupo => supabase
    .from('conversation_sucursal_historial').select('conversation_id').in('conversation_id', grupo).order('id'));
  if (error) throw error;
  const cantidad = {};
  for (const h of data || []) cantidad[h.conversation_id] = (cantidad[h.conversation_id] || 0) + 1;
  return cantidad;
};

// Envío gratis de un pedido: el dato guardado; para pedidos viejos se deduce
// (costo > 0 = pago; costo 0 y subtotal >= mínimo = gratis; si no, sin dato).
const tipoEnvio = (p) => {
  if (p.envio_gratis === true) return 'gratis';
  if (p.envio_gratis === false) return Number(p.costo_envio) > 0 ? 'pago' : 'sin_costo';
  if (p.costo_envio == null) return 'sin_dato';
  if (Number(p.costo_envio) > 0) return 'pago';
  if (p.subtotal != null && Number(p.subtotal) >= MINIMO_ENVIO_GRATIS) return 'gratis';
  return 'sin_costo';
};

// Todos los números de un período. `detalle=false` calcula sólo el resumen
// (para el período anterior, que sólo se usa para la variación %).
const calcularPeriodo = async ({ startDate, endDate, esPrueba, sucursales, detalle = true }) => {
  const [conversacionesTodas, pedidosTodos, { filas: mensajesTodos, desdeRegistro }] = await Promise.all([
    traerConversaciones(startDate, endDate),
    traerPedidos(startDate, endDate),
    traerMensajesEnviados(startDate, endDate)
  ]);
  const conversaciones = conversacionesTodas.filter(c => !esPrueba(c.client_phone));
  const pedidos = pedidosTodos.filter(p => !esPrueba(p.client_phone));
  const mensajes = mensajesTodos.filter(m => !esPrueba(m.client_phone));

  const ids = conversaciones.map(c => c.id);
  const { ultimo, conAgente } = await traerUltimoMensajePorConsulta(ids);
  const consultasConPedido = new Set(pedidos.map(p => p.conversation_id).filter(Boolean));
  // Ventas concretadas sin pedido guardado (no usaron el Cotizador): suman su sale_amount.
  const ventasSinPedido = conversaciones.filter(c => c.sale_status === 'concretada' && !consultasConPedido.has(c.id) && c.sale_amount != null);

  const montoPedidos = pedidos.reduce((a, p) => a + Number(p.total || 0), 0);
  const monto = montoPedidos + ventasSinPedido.reduce((a, c) => a + Number(c.sale_amount), 0);
  const cantidadPedidos = pedidos.length + ventasSinPedido.length;
  const atendidasPorSucursal = conversaciones.filter(c => conAgente.has(c.id));
  const conVenta = new Set([...conversaciones.filter(c => c.sale_status === 'concretada').map(c => c.id), ...consultasConPedido]);
  const clientes = new Set(conversaciones.map(c => ultimos10(c.client_phone)));

  const resumen = {
    consultas: conversaciones.length,
    clientes: clientes.size,
    pedidos: cantidadPedidos,
    montoTotal: monto,
    ticketPromedio: cantidadPedidos > 0 ? monto / cantidadPedidos : null,
    mensajes: mensajes.length,
    // Conversión: de las consultas que llegaron a una sucursal (alguien de la
    // sucursal le escribió), cuántas terminaron en venta. Las que fueron sólo
    // con el bot (horarios, etc.) no cuentan, porque no había nada que vender.
    conversion: pct(atendidasPorSucursal.filter(c => conVenta.has(c.id)).length, atendidasPorSucursal.length)
  };
  if (!detalle) return { resumen };

  // ---- Mensajes -------------------------------------------------------------
  const nombreSucursal = (id, guardado) => guardado || sucursales[id] || (id ? 'Sucursal eliminada' : 'Sin sucursal (solo bot o en la cola)');
  const bot = mensajes.filter(m => m.sender_type === 'bot');
  const sucursal = mensajes.filter(m => m.sender_type === 'agent');
  const porTipoBot = {};
  for (const m of bot) {
    const t = m.tipo_bot || 'sin_dato';
    porTipoBot[t] = (porTipoBot[t] || 0) + 1;
  }
  const msjsPorSucursal = {};
  for (const m of sucursal) {
    const clave = m.sucursal_id || 'sin_sucursal';
    msjsPorSucursal[clave] = msjsPorSucursal[clave] || { sucursalId: m.sucursal_id, nombre: nombreSucursal(m.sucursal_id, m.sucursal_nombre), mensajes: 0 };
    msjsPorSucursal[clave].mensajes += 1;
  }

  // ---- Series diarias ---------------------------------------------------------
  const dias = {};
  const dia = (iso) => {
    const f = fechaLocal(iso);
    dias[f] = dias[f] || { fecha: f, consultas: 0, mensajesBot: 0, mensajesSucursal: 0, monto: 0 };
    return dias[f];
  };
  conversaciones.forEach(c => { dia(c.created_at).consultas += 1; });
  bot.forEach(m => { dia(m.created_at).mensajesBot += 1; });
  sucursal.forEach(m => { dia(m.created_at).mensajesSucursal += 1; });
  pedidos.forEach(p => { dia(p.confirmed_at).monto += Number(p.total || 0); });
  ventasSinPedido.forEach(c => { dia(c.created_at).monto += Number(c.sale_amount); });
  // Días sin movimiento también aparecen (en 0), para que el gráfico no salte.
  if (startDate && endDate) {
    for (let f = startDate; f <= endDate; f = sumarDias(f, 1)) dia(`${f}T15:00:00.000Z`);
  }
  const porDia = Object.values(dias).sort((a, b) => a.fecha.localeCompare(b.fecha));

  // ---- Ventas y envíos --------------------------------------------------------
  const envios = { gratis: 0, pago: 0, sinCosto: 0, sinDato: 0, montoEnvios: 0 };
  for (const p of pedidos) {
    const t = tipoEnvio(p);
    if (t === 'gratis') envios.gratis += 1;
    else if (t === 'pago') { envios.pago += 1; envios.montoEnvios += Number(p.costo_envio || 0); }
    else if (t === 'sin_costo') envios.sinCosto += 1;
    else envios.sinDato += 1;
  }
  envios.sinDato += ventasSinPedido.length;

  // ---- Clientes ---------------------------------------------------------------
  const telefonos = [...new Set(conversaciones.map(c => c.client_phone))];
  const primeraConsulta = await traerPrimeraConsultaPorTelefono(telefonos);
  const desde = startDate ? desdeISO(startDate) : null;
  const clientesNuevos = new Set();
  const clientesQueVuelven = new Set();
  for (const tel of telefonos) {
    const nuevo = !desde || (primeraConsulta[tel] && new Date(primeraConsulta[tel]) >= new Date(desde));
    (nuevo ? clientesNuevos : clientesQueVuelven).add(ultimos10(tel));
  }
  const telefonosQueCompraron = new Set([
    ...conversaciones.filter(c => conVenta.has(c.id)).map(c => ultimos10(c.client_phone)),
    ...pedidos.map(p => ultimos10(p.client_phone))
  ]);
  const compraron = [...clientes].filter(t => telefonosQueCompraron.has(t)).length;

  // ---- Atención ---------------------------------------------------------------
  const [historial, motivos] = await Promise.all([traerHistorialSucursales(ids), traerMotivosCierre(ids)]);
  const reasignada = (c) => (historial[c.id] || 0) > 1 || !!c.devuelta_por_sucursal_id || !!c.derivado_por_sucursal_id;
  const duracion = (c) => (ultimo[c.id] ? new Date(ultimo[c.id]) - new Date(c.created_at) : null);
  const cierres = {};
  for (const c of conversaciones) {
    if (!['finalizada', 'resolved', 'rejected'].includes(c.status)) continue;
    const m = motivos[c.id] || 'sin_dato';
    cierres[m] = (cierres[m] || 0) + 1;
  }
  const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, consultas: 0 }));
  const porDiaSemana = Array.from({ length: 7 }, (_, d) => ({ dia: d, consultas: 0 }));
  conversaciones.forEach(c => {
    porHora[horaLocal(c.created_at)].consultas += 1;
    porDiaSemana[diaSemanaLocal(c.created_at)].consultas += 1;
  });

  // ---- Comparativa por sucursal -------------------------------------------------
  const filas = {};
  const fila = (id) => {
    const clave = id || 'sin_sucursal';
    filas[clave] = filas[clave] || {
      sucursalId: id || null, nombre: nombreSucursal(id), consultas: 0, telefonos: new Set(), atendidas: 0, conVenta: 0,
      pedidos: 0, monto: 0, enviosGratis: 0, mensajes: 0, demoras: [], ratings: []
    };
    return filas[clave];
  };
  for (const c of conversaciones) {
    const f = fila(c.sucursal_id);
    f.consultas += 1;
    f.telefonos.add(ultimos10(c.client_phone));
    if (conAgente.has(c.id)) {
      f.atendidas += 1;
      if (conVenta.has(c.id)) f.conVenta += 1;
    }
    if (c.demora_inicial_ms != null) f.demoras.push(Number(c.demora_inicial_ms));
    if (c.rating != null) f.ratings.push(Number(c.rating));
  }
  const sucursalDePedido = (p) => p.sucursal_id || conversaciones.find(c => c.id === p.conversation_id)?.sucursal_id || null;
  for (const p of pedidos) {
    const f = fila(sucursalDePedido(p));
    f.pedidos += 1;
    f.monto += Number(p.total || 0);
    if (tipoEnvio(p) === 'gratis') f.enviosGratis += 1;
  }
  for (const c of ventasSinPedido) {
    const f = fila(c.sucursal_id);
    f.pedidos += 1;
    f.monto += Number(c.sale_amount);
  }
  for (const m of sucursal) fila(m.sucursal_id).mensajes += 1;

  const porSucursal = Object.values(filas).map(f => ({
    sucursalId: f.sucursalId,
    nombre: f.nombre,
    consultas: f.consultas,
    clientes: f.telefonos.size,
    pedidos: f.pedidos,
    monto: f.monto,
    ticketPromedio: f.pedidos > 0 ? f.monto / f.pedidos : null,
    conversion: pct(f.conVenta, f.atendidas),
    enviosGratis: f.enviosGratis,
    mensajes: f.mensajes,
    mensajesPorConsulta: f.consultas > 0 ? f.mensajes / f.consultas : null,
    demoraPromedioMs: promedio(f.demoras),
    satisfaccion: promedio(f.ratings),
    calificaciones: f.ratings.length
  })).sort((a, b) => b.consultas - a.consultas || a.nombre.localeCompare(b.nombre));

  return {
    resumen,
    mensajes: {
      desdeRegistro,
      total: mensajes.length,
      bot: bot.length,
      sucursal: sucursal.length,
      pctBot: pct(bot.length, mensajes.length),
      pctSucursal: pct(sucursal.length, mensajes.length),
      promedioPorConsulta: conversaciones.length > 0 ? mensajes.length / conversaciones.length : null,
      porTipoBot,
      porSucursal: Object.values(msjsPorSucursal).sort((a, b) => b.mensajes - a.mensajes)
    },
    ventas: {
      montoTotal: monto,
      pedidos: cantidadPedidos,
      ticketPromedio: resumen.ticketPromedio,
      envios: { ...envios, pctGratis: pct(envios.gratis, envios.gratis + envios.pago + envios.sinCosto) }
    },
    clientes: {
      atendidos: clientes.size,
      nuevos: clientesNuevos.size,
      queVuelven: clientesQueVuelven.size,
      compraron,
      soloConsultaron: clientes.size - compraron,
      pctCompraron: pct(compraron, clientes.size),
      consultasPorCliente: clientes.size > 0 ? conversaciones.length / clientes.size : null
    },
    atencion: {
      consultas: conversaciones.length,
      atendidasPorSucursal: atendidasPorSucursal.length,
      reasignadas: conversaciones.filter(reasignada).length,
      demoraPromedioMs: promedio(conversaciones.map(c => (c.demora_inicial_ms != null ? Number(c.demora_inicial_ms) : null))),
      duracionPromedioMs: promedio(conversaciones.map(duracion)),
      cierres,
      porHora,
      porDiaSemana
    },
    porDia,
    porSucursal
  };
};

export const obtenerPanelMetricas = async ({ startDate, endDate } = {}) => {
  const [modoPrueba, { data: sucursalesData, error: sucError }] = await Promise.all([
    getModoPrueba(),
    supabase.from('sucursales').select('id, nombre')
  ]);
  if (sucError) throw sucError;
  const sucursales = Object.fromEntries((sucursalesData || []).map(s => [s.id, s.nombre]));
  // El número de prueba queda afuera de las métricas (aunque el modo prueba
  // esté apagado, si hay un número cargado es el del administrador).
  const telPrueba = ultimos10(modoPrueba?.telefono);
  const esPrueba = (tel) => telPrueba.length === 10 && ultimos10(tel) === telPrueba;

  const anteriorRango = periodoAnterior(startDate, endDate);
  const [actual, anterior] = await Promise.all([
    calcularPeriodo({ startDate, endDate, esPrueba, sucursales }),
    anteriorRango ? calcularPeriodo({ ...anteriorRango, esPrueba, sucursales, detalle: false }) : null
  ]);

  const variaciones = anterior
    ? Object.fromEntries(Object.keys(actual.resumen).map(k => [k, variacion(actual.resumen[k], anterior.resumen[k])]))
    : null;

  return {
    rango: { startDate: startDate || null, endDate: endDate || null },
    periodoAnterior: anteriorRango,
    resumen: actual.resumen,
    resumenAnterior: anterior?.resumen || null,
    variaciones,
    mensajes: actual.mensajes,
    ventas: actual.ventas,
    clientes: actual.clientes,
    atencion: actual.atencion,
    porDia: actual.porDia,
    porSucursal: actual.porSucursal
  };
};
