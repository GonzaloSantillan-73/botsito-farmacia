import { getSucursalesActivas, estaAbiertaAhora } from './sucursales.js';
import { supabase } from '../supabase.js';

const toRad = (deg) => (deg * Math.PI) / 180;

// Distancia en línea recta entre dos puntos (lat/lng en grados decimales),
// en kilómetros. Suficiente para "cuál sucursal está más cerca": no hace
// falta ruteo real por calles para una simple recomendación.
export const distanciaHaversineKm = (lat1, lng1, lat2, lng2) => {
  console.log('🔍 [DEBUG-SERVICE-GEOLOCALIZACION] distanciaHaversineKm() — lat1:', lat1, 'lng1:', lng1, 'lat2:', lat2, 'lng2:', lng2);
  const R = 6371; // radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const resultado = R * c;
  console.log('✅ [DEBUG-SERVICE-GEOLOCALIZACION] distanciaHaversineKm() — resultado (km):', resultado);
  return resultado;
};

// `Number(null) === 0` en JS: si convertimos así nomás, una sucursal sin
// coordenadas (columna en NULL) terminaría tratada como si estuviera en
// (0,0) "Null Island" en vez de quedar excluida, ensuciando el ranking con
// una distancia gigante pero "válida". Achicamos null/undefined/'' a NaN
// para que el filtro de abajo las descarte de verdad.
const parseCoord = (valor) => {
  console.log('🔍 [DEBUG-SERVICE-GEOLOCALIZACION] parseCoord() — valor:', valor);
  const resultado = (valor === null || valor === undefined || valor === '' ? NaN : Number(valor));
  console.log('✅ [DEBUG-SERVICE-GEOLOCALIZACION] parseCoord() — resultado:', resultado);
  return resultado;
};

// Todas las sucursales activas con coordenadas válidas, ordenadas por
// cercanía al punto (lat, lng) del cliente, con `abierta_ahora` calculado
// contra el horario propio de cada una (ver estaAbiertaAhora en
// sucursales.js). Es la base tanto de sucursalesMasCercanas() como de
// sucursalAbiertaMasCercana() más abajo.
const sucursalesOrdenadasPorCercania = async (lat, lng, excluirIds = []) => {
  console.log('📡 [DEBUG-SERVICE-GEOLOCALIZACION] sucursalesOrdenadasPorCercania() — llamando a getSucursalesActivas()');
  const sucursales = await getSucursalesActivas();
  console.log('📡 [DEBUG-SERVICE-GEOLOCALIZACION] sucursalesOrdenadasPorCercania() — sucursales activas obtenidas:', sucursales);

  const excluidos = new Set(excluirIds.filter(Boolean));
  console.log('🔍 [DEBUG-SERVICE-GEOLOCALIZACION] sucursalesOrdenadasPorCercania() — set de excluidos:', excluidos);

  // Una sucursal sin coordenadas resueltas simplemente no entra en el
  // cálculo: no hay con qué compararla.
  const conCoordenadas = sucursales
    .filter(s => !excluidos.has(s.id))
    .map(s => ({ ...s, latitud: parseCoord(s.latitud), longitud: parseCoord(s.longitud) }))
    .filter(s => Number.isFinite(s.latitud) && Number.isFinite(s.longitud));
  console.log('🔍 [DEBUG-SERVICE-GEOLOCALIZACION] sucursalesOrdenadasPorCercania() — sucursales con coordenadas válidas:', conCoordenadas);

  const resultado = conCoordenadas
    .map(s => ({
      id: s.id,
      nombre: s.nombre,
      distancia_km: Number(distanciaHaversineKm(lat, lng, s.latitud, s.longitud).toFixed(2)),
      abierta_ahora: estaAbiertaAhora(s)
    }))
    .sort((a, b) => a.distancia_km - b.distancia_km);

  console.log('✅ [DEBUG-SERVICE-GEOLOCALIZACION] sucursalesOrdenadasPorCercania() — resultado:', resultado);
  return resultado;
};

// IDs de sucursales que ya pasaron por esta conversación puntual (la
// tomaron, la tuvieron y la devolvieron, o se la derivaron entre sí — ver
// conversation_sucursal_historial.sql). Se asume que si ya intervino y la
// consulta volvió a la cola, no pudo resolverla en este ciclo, así que no
// tiene sentido volver a sugerírsela al próximo asesor para el mismo chat.
const obtenerSucursalesHistorialIds = async (conversationId) => {
  console.log('🔍 [DEBUG-SERVICE-GEOLOCALIZACION] obtenerSucursalesHistorialIds() — conversationId:', conversationId);
  if (!conversationId) return [];

  const { data, error } = await supabase
    .from('conversation_sucursal_historial')
    .select('sucursal_id')
    .eq('conversation_id', conversationId);

  if (error) {
    // Un fallo acá no debe romper el cálculo de recomendadas: en el peor
    // caso simplemente no se excluye nada extra.
    console.error('❌ [DEBUG-SERVICE-GEOLOCALIZACION] obtenerSucursalesHistorialIds() — error:', error);
    return [];
  }

  const resultado = (data || []).map(r => r.sucursal_id).filter(Boolean);
  console.log('✅ [DEBUG-SERVICE-GEOLOCALIZACION] obtenerSucursalesHistorialIds() — resultado:', resultado);
  return resultado;
};

// `excluirIds` saca de la carrera a sucursales puntuales (ej. la que acaba de
// devolver el chat a la cola, ver devolucionCola.js) para que no se le vuelva
// a recomendar la misma que ya dijo que no podía atenderlo.
//
// `conversationId` (opcional) suma a esa exclusión TODO el historial de
// sucursales que ya intervino en esa consulta puntual (ver
// obtenerSucursalesHistorialIds arriba). Es opcional y no afecta el cálculo
// general de sucursales cercanas para otras consultas: si no se pasa, se
// comporta exactamente igual que antes.
//
// Prioriza las sucursales que están ABIERTAS en este momento por sobre las
// cerradas, aunque estén un poco más lejos: si la más cercana está cerrada,
// se la salta y se recomienda la siguiente más cercana que sí esté abierta
// (ver estaAbiertaAhora en sucursales.js). Sólo se completa con sucursales
// cerradas si no hay suficientes abiertas para llegar a `cantidad`, para que
// la recomendación nunca quede vacía sin necesidad.
export const sucursalesMasCercanas = async (lat, lng, cantidad = 2, excluirIds = [], conversationId = null) => {
  console.log('🔍 [DEBUG-SERVICE-GEOLOCALIZACION] sucursalesMasCercanas() — lat:', lat, 'lng:', lng, 'cantidad:', cantidad, 'excluirIds:', excluirIds, 'conversationId:', conversationId);

  const historialIds = await obtenerSucursalesHistorialIds(conversationId);
  const excluirTotal = [...new Set([...excluirIds, ...historialIds])];
  console.log('🔍 [DEBUG-SERVICE-GEOLOCALIZACION] sucursalesMasCercanas() — excluirTotal (excluirIds + historial de la conversación):', excluirTotal);

  const ordenadas = await sucursalesOrdenadasPorCercania(lat, lng, excluirTotal);

  const abiertas = ordenadas.filter(s => s.abierta_ahora);
  const cerradas = ordenadas.filter(s => !s.abierta_ahora);
  const resultado = [...abiertas, ...cerradas].slice(0, cantidad);

  console.log('✅ [DEBUG-SERVICE-GEOLOCALIZACION] sucursalesMasCercanas() — resultado a devolver:', resultado);
  return resultado;
};

// La UNA sucursal a la que efectivamente se deriva la atención humana: la más
// cercana que esté abierta ahora mismo, sin importar si hay otra más cerca
// pero cerrada. `null` cuando ninguna sucursal con coordenadas está abierta
// en este momento (ver manejarUbicacionHumano en bot.js: ahí se decide qué
// avisarle al cliente si esto devuelve null).
export const sucursalAbiertaMasCercana = async (lat, lng, excluirIds = []) => {
  console.log('🔍 [DEBUG-SERVICE-GEOLOCALIZACION] sucursalAbiertaMasCercana() — lat:', lat, 'lng:', lng, 'excluirIds:', excluirIds);

  const ordenadas = await sucursalesOrdenadasPorCercania(lat, lng, excluirIds);
  const resultado = ordenadas.find(s => s.abierta_ahora) || null;

  console.log('✅ [DEBUG-SERVICE-GEOLOCALIZACION] sucursalAbiertaMasCercana() — resultado:', resultado);
  return resultado;
};
