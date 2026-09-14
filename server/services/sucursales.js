import { supabase } from '../supabase.js';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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
        `🕒 ${formatearDias(s.dias)} de ${s.hora_apertura} a ${s.hora_cierre}hs`
      ];
      if (s.google_maps_url) lineas.push(`🗺️ Ver en Google Maps: ${s.google_maps_url}`);
      return lineas.join('\n');
    })
    .join('\n\n');

  const resultado = `Estas son nuestras sucursales:\n\n${lista}`;
  console.log('✅ [DEBUG-SERVICE-SUCURSALES] formatearMensajeSucursales() — valor de retorno:', resultado);
  return resultado;
};
