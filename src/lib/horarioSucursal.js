import { DIAS } from './dias';

// Horario "cortado" por día: `horarios_dias` es un objeto JSON con una clave
// por día (0=domingo…6=sábado, mismos valores que DIAS en ./dias.js). Cada
// día guarda { abierta24hs, franjas }: `abierta24hs` es independiente del
// toggle global "Abierto 24hs" de la sucursal (permite, por ejemplo, que
// sólo el sábado sea 24hs y el resto de la semana tenga horario normal), y
// `franjas` es un array de 0 a 2 objetos { inicio, fin } en formato "HH:MM"
// que sólo importa cuando ese día NO es 24hs. Un día sin franjas y sin
// abierta24hs significa que la sucursal no atiende ese día.
//
// Ver también server/services/sucursales.js, que duplica estas mismas reglas
// del lado del backend (para el bot y la recomendación por cercanía) porque
// no comparte módulos con el frontend.

export const toMinutes = (hhmm) => {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
};

// "00:00" como FIN de una franja significa medianoche (fin de ese mismo
// día), no el inicio del día siguiente — así "17:00 a 00:00" sigue siendo
// una franja normal que termina al final del día.
export const finEnMinutos = (fin) => {
  const m = toMinutes(fin);
  return m === 0 ? 1440 : m;
};

// Una franja con fin menor que el inicio (ej. "17:00 a 03:00") cruza la
// medianoche: arranca ese día y termina en la madrugada del día siguiente,
// sin tener que partirla en dos días ni gastar una franja del día siguiente.
// "00:00" como fin no cuenta como cruce (ver finEnMinutos).
export const cruzaMedianoche = (f) => !!f?.inicio && !!f?.fin && f.fin !== '00:00' && toMinutes(f.fin) < toMinutes(f.inicio);

// Acepta tanto el objeto { abierta24hs, franjas } nuevo como, por si algún
// dato todavía no migró, el array de franjas viejo (sin 24hs propio) — para
// no romper si horarios_dias trae datos de una versión anterior.
export const normalizarDia = (raw) => {
  if (Array.isArray(raw)) return { abierta24hs: false, franjas: raw };
  if (raw && typeof raw === 'object') return { abierta24hs: !!raw.abierta24hs, franjas: raw.franjas || [] };
  return { abierta24hs: false, franjas: [] };
};

// Etiqueta del día siguiente (ej. 0=Dom -> "Lun"), para avisar hasta cuándo
// llega una franja que cruza la medianoche.
export const labelDiaSiguiente = (dia) => DIAS.find(d => d.value === (Number(dia) + 1) % 7)?.label;

// Valida las franjas de UN día (sólo tiene sentido si ese día no es 24hs):
// horarios completos, inicio distinto del fin, y que las dos franjas (si hay
// 2) no se solapen. Una franja que cruza la medianoche se mide como si
// terminara después de las 24:00, así que si hay otra franja que arranca más
// tarde ese mismo día se detecta como superposición (la que cruza tiene que
// ser siempre la última del día). Devuelve el mensaje de error, o null.
export const validarFranjasDia = (franjas) => {
  if (!franjas || franjas.length === 0) return null;

  for (const f of franjas) {
    if (!f?.inicio || !f?.fin) return 'Completá el horario de inicio y fin.';
    if (toMinutes(f.inicio) === finEnMinutos(f.fin) % 1440) return 'El horario de inicio y de fin no pueden ser iguales.';
  }

  const rangos = franjas.map(f => ({
    inicio: toMinutes(f.inicio),
    fin: cruzaMedianoche(f) ? toMinutes(f.fin) + 1440 : finEnMinutos(f.fin)
  }));

  if (rangos.length === 2) {
    const [a, b] = rangos;
    const seSuperponen = a.inicio < b.fin && b.inicio < a.fin;
    if (seSuperponen) return 'Los dos horarios se superponen: ajustá los rangos para que no se crucen.';
  }

  return null;
};

// Valida lo que validarFranjasDia no puede ver mirando un solo día: que la
// madrugada de una franja que cruza la medianoche no se pise con una franja
// del día siguiente (ej. Lun 17:00 a 03:00 y Mar 02:00 a 10:00). Un día
// siguiente 24hs no se considera error: es redundante pero no contradictorio.
// Devuelve { dia, error } del primer problema encontrado, o null.
export const validarCrucesEntreDias = (horarios) => {
  for (const { value: dia, label } of DIAS) {
    const hoy = normalizarDia(horarios?.[String(dia)]);
    if (hoy.abierta24hs) continue;
    const cruce = hoy.franjas.find(cruzaMedianoche);
    if (!cruce) continue;

    const manana = normalizarDia(horarios?.[String((dia + 1) % 7)]);
    if (manana.abierta24hs) continue;
    const pisada = manana.franjas.find(f => f?.inicio && toMinutes(f.inicio) < toMinutes(cruce.fin));
    if (pisada) {
      return {
        dia,
        error: `${label} termina a las ${cruce.fin} del ${labelDiaSiguiente(dia)}, pero ese día ya abre a las ${pisada.inicio}. Ajustá los horarios para que no se crucen.`
      };
    }
  }
  return null;
};
