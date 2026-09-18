import { supabase } from '../supabase.js';
import { getNowInTimezone, toMinutes } from './scheduleConfig.js';

// Orden natural de la semana (Lun a Dom) en el que se recorren los días para
// armar el resumen — no el orden numérico 0..6 que usa la base (0=domingo).
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const DAY_ABBR = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// "00:00" como FIN de una franja significa medianoche (fin de ese mismo
// día), no el inicio del día siguiente — así se puede armar un horario tipo
// "17:00 a 00:00" sin tener que soportar franjas que cruzan la medianoche
// (ver validarFranjasDia en src/lib/horarioSucursal.js, misma regla del
// lado del frontend).
const finEnMinutos = (fin) => {
  const m = toMinutes(fin);
  return m === 0 ? 1440 : m;
};

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

// Reemplaza al viejo horario global de "Asesores Humanos": la disponibilidad
// de atención humana depende del horario de cada sucursal, evaluado contra
// el día y la hora actual en la misma zona horaria que usa el horario del
// bot (ver getNowInTimezone en scheduleConfig.js).
export const estaAbiertaAhora = (sucursal) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALES] estaAbiertaAhora() — parámetros recibidos:', { id: sucursal?.id, nombre: sucursal?.nombre, horarios_dias: sucursal?.horarios_dias, abierta_24hs: sucursal?.abierta_24hs });

  if (sucursal?.abierta_24hs) {
    console.log('✅ [DEBUG-SERVICE-SUCURSALES] estaAbiertaAhora() — abierta_24hs=true (global), resultado: true');
    return true;
  }

  const { day, minutes } = getNowInTimezone();
  const info = normalizarDia(sucursal?.horarios_dias?.[String(day)]);

  if (info.abierta24hs) {
    console.log('✅ [DEBUG-SERVICE-SUCURSALES] estaAbiertaAhora() — abierta24hs=true para el día actual (', day, '), resultado: true');
    return true;
  }

  if (!Array.isArray(info.franjas) || info.franjas.length === 0) {
    console.log('✅ [DEBUG-SERVICE-SUCURSALES] estaAbiertaAhora() — sin franjas configuradas para el día actual (', day, '), resultado: false');
    return false;
  }

  const resultado = info.franjas.some(f => {
    if (!f?.inicio || !f?.fin) return false;
    const inicio = toMinutes(f.inicio);
    const fin = finEnMinutos(f.fin);
    return minutes >= inicio && minutes <= fin;
  });
  console.log('✅ [DEBUG-SERVICE-SUCURSALES] estaAbiertaAhora() — resultado:', resultado);
  return resultado;
};

// Texto del estado de UN día: "cerrado", "abierto 24hs", o sus franjas
// ordenadas de más temprano a más tarde (por si se cargaron fuera de orden),
// ej. "08:00 a 13:00 y 17:00 a 23:59hs".
const textoEstadoDia = (info) => {
  if (info.abierta24hs) return 'abierto 24hs';
  if (!info.franjas || info.franjas.length === 0) return 'cerrado';
  const ordenadas = [...info.franjas].sort((a, b) => toMinutes(a.inicio) - toMinutes(b.inicio));
  return `${ordenadas.map(f => `${f.inicio} a ${f.fin}`).join(' y ')}hs`;
};

// Resumen del horario completo de una sucursal, como un array de líneas
// ("lun, mar, mié: 08:00 a 13:00hs", "jue, vie, dom: cerrado", ...), una por
// cada grupo de días con EXACTAMENTE el mismo estado — sin importar si son
// consecutivos o no (a diferencia de la versión anterior, que sólo unía
// corridas consecutivas). Los días se recorren en orden natural de semana
// (lun a dom) y cada grupo se etiqueta con el estado del primer día que lo
// originó, en el orden en que ese estado apareció por primera vez.
export const resumenHorarioSucursal = (sucursal) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALES] resumenHorarioSucursal() — parámetros recibidos:', { horarios_dias: sucursal?.horarios_dias, abierta_24hs: sucursal?.abierta_24hs });

  if (sucursal?.abierta_24hs) {
    console.log('✅ [DEBUG-SERVICE-SUCURSALES] resumenHorarioSucursal() — abierta_24hs=true (global)');
    return ['Abierto 24 hs'];
  }

  const horarios = sucursal?.horarios_dias || {};
  const diaDe = (d) => normalizarDia(horarios[String(d)]);

  const grupos = new Map(); // texto del estado -> lista de días (en orden de semana)
  for (const d of ORDEN_SEMANA) {
    const texto = textoEstadoDia(diaDe(d));
    if (!grupos.has(texto)) grupos.set(texto, []);
    grupos.get(texto).push(d);
  }

  const resultado = Array.from(grupos.entries())
    .map(([texto, dias]) => `${dias.map(d => DAY_ABBR[d]).join(', ')}: ${texto}`);
  console.log('✅ [DEBUG-SERVICE-SUCURSALES] resumenHorarioSucursal() — valor de retorno:', resultado);
  return resultado;
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

// Mensaje que el bot envía cuando el cliente elige "Horarios y sucursales".
export const formatearMensajeSucursales = (sucursales) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALES] formatearMensajeSucursales() — parámetros recibidos:', { sucursales });

  if (!sucursales || sucursales.length === 0) {
    const resultadoVacio = 'Por el momento no tenemos sucursales cargadas. Escribí "1" para hablar con un asesor y te contamos dónde estamos.';
    console.log('✅ [DEBUG-SERVICE-SUCURSALES] formatearMensajeSucursales() — valor de retorno (sin sucursales):', resultadoVacio);
    return resultadoVacio;
  }

  const lista = sucursales
    .map(s => {
      const horarioLineas = resumenHorarioSucursal(s);
      // Un solo estado para toda la semana (24hs global o ningún día
      // configurado) se muestra en una línea; varios estados distintos se
      // listan como viñetas, una por grupo de días, para que se pueda leer
      // de un vistazo sin tener que descifrar un párrafo largo.
      const bloqueHorario = horarioLineas.length === 1
        ? `🕒 ${horarioLineas[0]}`
        : [`🕒 Horarios:`, ...horarioLineas.map(l => `   • ${l}`)].join('\n');

      const lineas = [
        `📍 *${s.nombre}*`,
        s.direccion,
        bloqueHorario
      ];
      if (s.google_maps_url) lineas.push(`🗺️ Ver en Google Maps: ${s.google_maps_url}`);
      return lineas.join('\n');
    })
    .join('\n\n');

  const resultado = `Estas son nuestras sucursales:\n\n${lista}`;
  console.log('✅ [DEBUG-SERVICE-SUCURSALES] formatearMensajeSucursales() — valor de retorno:', resultado);
  return resultado;
};
