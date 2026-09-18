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
// Orden natural de la semana (Lun a Dom) en el que se recorren los días para
// armar el resumen — no el orden numérico 0..6 que usa la base (0=domingo).
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const DAY_ABBR = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

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
// consecutivos o no. Usado hoy sólo para el mensaje de WhatsApp del bot (ver
// formatearMensajeSucursales en server/services/sucursales.js, que duplica
// esta misma lógica del lado del backend); la interfaz del CRM ya no
// muestra este texto.
export const resumenHorarioSucursal = (sucursal) => {
  if (sucursal?.abierta_24hs) return ['Abierto 24 hs'];

  const horarios = sucursal?.horarios_dias || {};
  const grupos = new Map(); // texto del estado -> lista de días (en orden de semana)
  for (const d of ORDEN_SEMANA) {
    const texto = textoEstadoDia(diaDe(horarios, d));
    if (!grupos.has(texto)) grupos.set(texto, []);
    grupos.get(texto).push(d);
  }

  return Array.from(grupos.entries())
    .map(([texto, dias]) => `${dias.map(d => DAY_ABBR[d]).join(', ')}: ${texto}`);
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
