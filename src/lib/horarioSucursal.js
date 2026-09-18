// Horario "cortado" por día: `horarios_dias` es un objeto JSON con una clave
// por día (0=domingo…6=sábado, mismos valores que DIAS en ./dias.js). Cada
// día guarda { abierta24hs, franjas }: `abierta24hs` es independiente del
// toggle global "Abierto 24hs" de la sucursal (permite, por ejemplo, que
// sólo el sábado sea 24hs y el resto de la semana tenga horario normal), y
// `franjas` es un array de 0 a 2 objetos { inicio, fin } en formato "HH:MM"
// que sólo importa cuando ese día NO es 24hs. Un día sin franjas y sin
// abierta24hs significa que la sucursal no atiende ese día.
//
// Ver también server/services/sucursales.js, que duplica esta misma lógica
// del lado del backend (para el bot y la recomendación por cercanía) porque
// no comparte módulos con el frontend.
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const toMinutes = (hhmm) => {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
};

// "00:00" como FIN de una franja significa medianoche (fin de ese mismo
// día), no el inicio del día siguiente — así se puede armar un horario tipo
// "17:00 a 00:00" sin tener que soportar franjas que cruzan la medianoche.
export const finEnMinutos = (fin) => {
  const m = toMinutes(fin);
  return m === 0 ? 1440 : m;
};

// Acepta tanto el objeto { abierta24hs, franjas } nuevo como, por si algún
// dato todavía no migró, el array de franjas viejo (sin 24hs propio) — para
// no romper si horarios_dias trae datos de una versión anterior.
export const normalizarDia = (raw) => {
  if (Array.isArray(raw)) return { abierta24hs: false, franjas: raw };
  if (raw && typeof raw === 'object') return { abierta24hs: !!raw.abierta24hs, franjas: raw.franjas || [] };
  return { abierta24hs: false, franjas: [] };
};

const diaDe = (horarios, d) => normalizarDia(horarios?.[String(d)]);

// Junta días consecutivos en rangos (ej: [1,2,3,4,5] -> "Lun a Vie").
const formatearDias = (dias) => {
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

  return rangos.join(', ');
};

const formatearFranjas = (franjas) => (franjas || []).map(f => `${f.inicio} a ${f.fin}`).join(' y ');

const textoDia = (info) => (info.abierta24hs ? '24 hs' : `${formatearFranjas(info.franjas)}hs`);

// Resumen legible del horario completo de una sucursal (usado hoy sólo para
// el mensaje de WhatsApp del bot, ver formatearMensajeSucursales en
// server/services/sucursales.js: la interfaz del CRM ya no muestra este
// texto). Agrupa días consecutivos que tienen exactamente el mismo horario
// (mismo 24hs propio y mismas franjas), para no repetir el mismo rango día
// por día cuando el horario es corrido.
export const resumenHorarioSucursal = (sucursal) => {
  if (sucursal?.abierta_24hs) return 'Abierto 24 hs';

  const horarios = sucursal?.horarios_dias || {};
  const tieneServicio = (d) => { const info = diaDe(horarios, d); return info.abierta24hs || info.franjas.length > 0; };
  const diasConHorario = [0, 1, 2, 3, 4, 5, 6].filter(tieneServicio);
  if (diasConHorario.length === 0) return 'Sin horario configurado';

  const firma = (d) => JSON.stringify(diaDe(horarios, d));
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

  return grupos
    .map(g => `${formatearDias(g.dias)} ${textoDia(diaDe(horarios, g.dias[0]))}`)
    .join(', ');
};

// Valida las franjas de UN día (sólo tiene sentido si ese día no es 24hs):
// horarios completos, fin posterior al inicio (dentro del mismo día, salvo
// el caso "hasta 00:00"), y que las dos franjas (si hay 2) no se solapen.
// Devuelve el mensaje de error, o null si está todo bien.
export const validarFranjasDia = (franjas) => {
  if (!franjas || franjas.length === 0) return null;

  for (const f of franjas) {
    if (!f?.inicio || !f?.fin) return 'Completá el horario de inicio y fin.';
  }

  const rangos = franjas.map(f => ({ inicio: toMinutes(f.inicio), fin: finEnMinutos(f.fin) }));
  for (const r of rangos) {
    if (r.fin <= r.inicio) return 'El horario de fin debe ser posterior al de inicio.';
  }

  if (rangos.length === 2) {
    const [a, b] = rangos;
    const seSuperponen = a.inicio < b.fin && b.inicio < a.fin;
    if (seSuperponen) return 'Los dos horarios se superponen: ajustá los rangos para que no se crucen.';
  }

  return null;
};
