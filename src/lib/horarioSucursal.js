// Horario "cortado" por día: `horarios_dias` es un objeto JSON con una clave
// por día (0=domingo…6=sábado, mismos valores que DIAS en ./dias.js), cada
// una con un array de 0 a 2 franjas { inicio, fin } en formato "HH:MM". Un
// día sin franjas (clave ausente o array vacío) significa que la sucursal
// no atiende ese día. Ver también server/services/sucursales.js, que
// duplica esta misma lógica del lado del backend (para el bot y la
// recomendación por cercanía) porque no comparte módulos con el frontend.
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

// Resumen legible del horario completo de una sucursal (para la fila de
// lectura en SucursalesPanel.jsx y para el mensaje del bot). Agrupa días
// consecutivos que tienen exactamente las mismas franjas, para no repetir
// el mismo rango día por día cuando el horario es corrido.
export const resumenHorarioSucursal = (sucursal) => {
  if (sucursal?.abierta_24hs) return 'Abierto 24 hs';

  const horarios = sucursal?.horarios_dias || {};
  const diasConHorario = [0, 1, 2, 3, 4, 5, 6].filter(d => Array.isArray(horarios[d] ?? horarios[String(d)]) && (horarios[d] ?? horarios[String(d)]).length > 0);
  if (diasConHorario.length === 0) return 'Sin horario configurado';

  const franjasDe = (d) => horarios[d] ?? horarios[String(d)] ?? [];
  const firma = (d) => JSON.stringify(franjasDe(d));

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
    .map(g => `${formatearDias(g.dias)} ${formatearFranjas(franjasDe(g.dias[0]))}hs`)
    .join(', ');
};

// Valida las franjas de UN día: horarios completos, fin posterior al inicio
// (dentro del mismo día, sin cruzar medianoche salvo el caso "hasta 00:00"),
// y que las dos franjas (si hay 2) no se solapen. Devuelve el mensaje de
// error, o null si está todo bien.
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
