import { supabase } from '../supabase.js';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Junta días consecutivos en rangos (ej: [1,2,3,4,5] -> "Lun a Vie") para que
// el mensaje del bot no liste cada día suelto cuando el horario es corrido.
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

export const getSucursalesActivas = async () => {
  const { data, error } = await supabase
    .from('sucursales')
    .select('*')
    .eq('activo', true)
    .order('orden')
    .order('nombre');
  if (error) throw error;
  return data || [];
};

// Mensaje que el bot envía cuando el cliente elige "Horarios y sucursales".
export const formatearMensajeSucursales = (sucursales) => {
  if (!sucursales || sucursales.length === 0) {
    return 'Por el momento no tenemos sucursales cargadas. Escribí "2" para hablar con un asesor y te contamos dónde estamos.';
  }

  const lista = sucursales
    .map(s => {
      const lineas = [
        `📍 *${s.nombre}*`,
        s.direccion,
        `🕒 ${formatearDias(s.dias)} de ${s.hora_apertura} a ${s.hora_cierre}hs`
      ];
      if (s.google_maps_url) lineas.push(`🗺️ Ver en Google Maps: ${s.google_maps_url}`);
      return lineas.join('\n');
    })
    .join('\n\n');

  return `Estas son nuestras sucursales:\n\n${lista}`;
};
