import { supabase } from '../supabase.js';
import { getNowInTimezone, toMinutes } from './scheduleConfig.js';

// Orden natural de la semana (Lun a Dom) en el que se listan los días en el
// mensaje del bot — no el orden numérico 0..6 que usa la base (0=domingo).
// Abreviaturas sin tilde, tal cual se le muestran al cliente.
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const DAY_ABBR = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

// "00:00" como FIN de una franja significa medianoche (fin de ese mismo
// día), no el inicio del día siguiente — así "17:00 a 00:00" sigue siendo
// una franja normal que termina al final del día (ver validarFranjasDia en
// src/lib/horarioSucursal.js, misma regla del lado del frontend).
const finEnMinutos = (fin) => {
  const m = toMinutes(fin);
  return m === 0 ? 1440 : m;
};

// Una franja con fin menor que el inicio (ej. "17:00 a 03:00") cruza la
// medianoche: arranca ese día y termina en la madrugada del día siguiente,
// sin tener que partirla en dos días ni gastar una franja del día siguiente.
// "00:00" como fin no cuenta como cruce (ver finEnMinutos).
const cruzaMedianoche = (f) => f.fin !== '00:00' && toMinutes(f.fin) < toMinutes(f.inicio);

// Cada día de horarios_dias es { abierta24hs, franjas }: `abierta24hs` es
// independiente del toggle global de la sucursal (ver estaAbiertaAhora) y
// permite que, por ejemplo, sólo el sábado sea 24hs. Acepta también el
// array de franjas "pelado" de una versión anterior, por si algún dato
// todavía no migró.
const normalizarDia = (raw) => {
  if (Array.isArray(raw)) return { abierta24hs: false, franjas: raw };
  if (raw && typeof raw === 'object') return { abierta24hs: !!raw.abierta24hs, franjas: raw.franjas || [] };
  return { abierta24hs: false, franjas: [] };
};

// Franjas completas de un día (descarta las que quedaron a medio cargar).
const franjasValidas = (info) => (Array.isArray(info.franjas) ? info.franjas : []).filter(f => f?.inicio && f?.fin);

// Reemplaza al viejo horario global de "Asesores Humanos": la disponibilidad
// de atención humana depende del horario de cada sucursal, evaluado contra
// el día y la hora actual en la misma zona horaria que usa el horario del
// bot (ver getNowInTimezone en scheduleConfig.js). Además de las franjas del
// día actual, revisa si la franja del día anterior que cruzaba la medianoche
// sigue vigente (ej. domingo 17:00 a 03:00, consultado el lunes a la 01:00).
export const estaAbiertaAhora = (sucursal) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALES] estaAbiertaAhora() — parámetros recibidos:', { id: sucursal?.id, nombre: sucursal?.nombre, horarios_dias: sucursal?.horarios_dias, abierta_24hs: sucursal?.abierta_24hs });

  if (sucursal?.abierta_24hs) {
    console.log('✅ [DEBUG-SERVICE-SUCURSALES] estaAbiertaAhora() — abierta_24hs=true (global), resultado: true');
    return true;
  }

  const { day, minutes } = getNowInTimezone();
  const hoy = normalizarDia(sucursal?.horarios_dias?.[String(day)]);

  if (hoy.abierta24hs) {
    console.log('✅ [DEBUG-SERVICE-SUCURSALES] estaAbiertaAhora() — abierta24hs=true para el día actual (', day, '), resultado: true');
    return true;
  }

  const abiertaPorHoy = franjasValidas(hoy).some(f => {
    const inicio = toMinutes(f.inicio);
    // La parte de hoy de una franja que cruza la medianoche va hasta el final del día.
    return cruzaMedianoche(f) ? minutes >= inicio : minutes >= inicio && minutes <= finEnMinutos(f.fin);
  });

  // (day + 6) % 7 es el día anterior, incluido lunes (1) -> domingo (0) y
  // domingo (0) -> sábado (6). Un día anterior 24hs no se extiende: termina
  // a la medianoche.
  const ayer = normalizarDia(sucursal?.horarios_dias?.[String((day + 6) % 7)]);
  const abiertaPorAyer = !ayer.abierta24hs && franjasValidas(ayer).some(f => cruzaMedianoche(f) && minutes <= toMinutes(f.fin));

  const resultado = abiertaPorHoy || abiertaPorAyer;
  console.log('✅ [DEBUG-SERVICE-SUCURSALES] estaAbiertaAhora() — resultado:', resultado, { abiertaPorHoy, abiertaPorAyer });
  return resultado;
};

// Texto del estado de UN día: "Cerrado", "24 hs", o sus franjas ordenadas de
// más temprano a más tarde (por si se cargaron fuera de orden), ej.
// "08:00 a 13:00 y 17:00 a 03:00". Una franja que cruza la medianoche se
// muestra completa en el día en que abre.
const textoEstadoDia = (info) => {
  if (info.abierta24hs) return '24 hs';
  const franjas = franjasValidas(info);
  if (franjas.length === 0) return 'Cerrado';
  const ordenadas = [...franjas].sort((a, b) => toMinutes(a.inicio) - toMinutes(b.inicio));
  return ordenadas.map(f => `${f.inicio} a ${f.fin}`).join(' y ');
};

// Horario completo de una sucursal para el mensaje del bot: siempre 7 líneas,
// una por día de lunes a domingo ("Lun: 08:00 a 13:00", "Dom: Cerrado", ...).
export const resumenHorarioSucursal = (sucursal) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALES] resumenHorarioSucursal() — parámetros recibidos:', { horarios_dias: sucursal?.horarios_dias, abierta_24hs: sucursal?.abierta_24hs });

  const horarios = sucursal?.horarios_dias || {};
  const resultado = ORDEN_SEMANA.map(d => {
    const texto = sucursal?.abierta_24hs ? '24 hs' : textoEstadoDia(normalizarDia(horarios[String(d)]));
    return `${DAY_ABBR[d]}: ${texto}`;
  });
  console.log('✅ [DEBUG-SERVICE-SUCURSALES] resumenHorarioSucursal() — valor de retorno:', resultado);
  return resultado;
};

// "Juan Pablo Vera" -> "Sucursal Juan Pablo Vera"; si el nombre ya empieza
// con "Sucursal" (en cualquier combinación de mayúsculas) queda como está.
const nombreSucursal = (nombre) => {
  const limpio = (nombre || '').trim();
  return /^sucursal\b/i.test(limpio) ? limpio : `Sucursal ${limpio}`;
};

export const getSucursalesActivas = async () => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALES] getSucursalesActivas() — sin parámetros');

  console.log('📡 [DEBUG-SERVICE-SUCURSALES] Query Supabase → tabla: sucursales, operación: select, filtro: activo = true, order: orden, nombre');
  const { data, error } = await supabase
    .from('sucursales')
    .select('*')
    .eq('activo', true)
    .order('orden')
    .order('nombre');
  console.log('📡 [DEBUG-SERVICE-SUCURSALES] Resultado query sucursales (select activas) — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALES] getSucursalesActivas() — error consultando sucursales activas:', error);
    throw error;
  }
  const resultado = data || [];
  console.log('✅ [DEBUG-SERVICE-SUCURSALES] getSucursalesActivas() — valor de retorno:', resultado);
  return resultado;
};

// WhatsApp corta los mensajes de texto en 4096 caracteres: con 7 líneas de
// horario por sucursal, una cadena con muchas sucursales se pasa. Por eso el
// listado se reparte en varios mensajes, sin partir nunca una sucursal.
const MAX_CARACTERES_MENSAJE = 3500;

// Mensajes que el bot envía cuando el cliente elige "Horarios y sucursales".
// Devuelve un array (normalmente de un solo elemento) para mandar en orden.
export const formatearMensajeSucursales = (sucursales) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALES] formatearMensajeSucursales() — parámetros recibidos:', { sucursales });

  if (!sucursales || sucursales.length === 0) {
    const resultadoVacio = ['Por el momento no tenemos sucursales cargadas. Escribí "1" para hablar con un asesor y te contamos dónde estamos.'];
    console.log('✅ [DEBUG-SERVICE-SUCURSALES] formatearMensajeSucursales() — valor de retorno (sin sucursales):', resultadoVacio);
    return resultadoVacio;
  }

  const bloques = sucursales.map(s => {
    const lineas = [`📍 *${nombreSucursal(s.nombre)}*`];
    if (s.direccion) lineas.push(s.direccion);
    lineas.push('🕒 Horarios:', ...resumenHorarioSucursal(s));
    if (s.google_maps_url) lineas.push(`🗺️ Ver en Google Maps: ${s.google_maps_url}`);
    return lineas.join('\n');
  });

  const resultado = [];
  let actual = 'Estas son nuestras sucursales:';
  for (const bloque of bloques) {
    if (actual.length + 2 + bloque.length > MAX_CARACTERES_MENSAJE) {
      resultado.push(actual);
      actual = bloque;
    } else {
      actual = `${actual}\n\n${bloque}`;
    }
  }
  resultado.push(actual);

  console.log('✅ [DEBUG-SERVICE-SUCURSALES] formatearMensajeSucursales() — valor de retorno:', resultado);
  return resultado;
};
