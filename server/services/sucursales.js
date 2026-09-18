import { supabase } from '../supabase.js';
import { getNowInTimezone, toMinutes } from './scheduleConfig.js';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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

// Junta días consecutivos en rangos (ej: [1,2,3,4,5] -> "Lun a Vie") para que
// el mensaje del bot no liste cada día suelto cuando el horario es corrido.
const formatearDias = (dias) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALES] formatearDias() — parámetros recibidos:', { dias });

  const ordenados = [...dias].sort((a, b) => a - b);
  const rangos = [];
  let inicio = ordenados[0];
  let anterior = ordenados[0];

  for (let i = 1; i <= ordenados.length; i++) {
    const actual = ordenados[i];
    if (actual === anterior + 1) {
      anterior = actual;
      continue;
    }
    rangos.push(inicio === anterior ? DAY_NAMES[inicio] : `${DAY_NAMES[inicio]} a ${DAY_NAMES[anterior]}`);
    inicio = actual;
    anterior = actual;
  }

  const resultado = rangos.join(', ');
  console.log('✅ [DEBUG-SERVICE-SUCURSALES] formatearDias() — valor de retorno:', resultado);
  return resultado;
};

const formatearFranjas = (franjas) => (franjas || []).map(f => `${f.inicio} a ${f.fin}`).join(' y ');
const textoDia = (info) => (info.abierta24hs ? '24 hs' : `${formatearFranjas(info.franjas)}hs`);

// Resumen legible del horario completo de una sucursal, para el mensaje de
// WhatsApp del bot (la interfaz del CRM ya no muestra este texto, ver
// SucursalesPanel.jsx/SucursalHorarioModal.jsx). Agrupa días consecutivos
// que tienen exactamente el mismo horario (misma lógica que
// resumenHorarioSucursal en src/lib/horarioSucursal.js, del lado del
// frontend, que no puede importar este módulo de server/).
export const resumenHorarioSucursal = (sucursal) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALES] resumenHorarioSucursal() — parámetros recibidos:', { horarios_dias: sucursal?.horarios_dias, abierta_24hs: sucursal?.abierta_24hs });

  if (sucursal?.abierta_24hs) return 'Abierto 24 hs';

  const horarios = sucursal?.horarios_dias || {};
  const diaDe = (d) => normalizarDia(horarios[String(d)]);
  const tieneServicio = (d) => { const info = diaDe(d); return info.abierta24hs || info.franjas.length > 0; };
  const diasConHorario = [0, 1, 2, 3, 4, 5, 6].filter(tieneServicio);
  if (diasConHorario.length === 0) {
    console.log('✅ [DEBUG-SERVICE-SUCURSALES] resumenHorarioSucursal() — sin ningún día con horario configurado');
    return 'Sin horario configurado';
  }

  const firma = (d) => JSON.stringify(diaDe(d));
  const grupos = [];
  let grupoActual = null;
  for (const d of diasConHorario) {
    if (grupoActual && firma(d) === grupoActual.firma) {
      grupoActual.dias.push(d);
    } else {
      grupoActual = { firma: firma(d), dias: [d] };
      grupos.push(grupoActual);
    }
  }

  const resultado = grupos
    .map(g => `${formatearDias(g.dias)} ${textoDia(diaDe(g.dias[0]))}`)
    .join(', ');
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
      const lineas = [
        `📍 *${s.nombre}*`,
        s.direccion,
        `🕒 ${resumenHorarioSucursal(s)}`
      ];
      if (s.google_maps_url) lineas.push(`🗺️ Ver en Google Maps: ${s.google_maps_url}`);
      return lineas.join('\n');
    })
    .join('\n\n');

  const resultado = `Estas son nuestras sucursales:\n\n${lista}`;
  console.log('✅ [DEBUG-SERVICE-SUCURSALES] formatearMensajeSucursales() — valor de retorno:', resultado);
  return resultado;
};
