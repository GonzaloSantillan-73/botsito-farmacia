import { getSucursalesActivas } from './sucursales.js';

const toRad = (deg) => (deg * Math.PI) / 180;

// Distancia en línea recta entre dos puntos (lat/lng en grados decimales),
// en kilómetros. Suficiente para "cuál sucursal está más cerca": no hace
// falta ruteo real por calles para una simple recomendación.
export const distanciaHaversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// `Number(null) === 0` en JS: si convertimos así nomás, una sucursal sin
// coordenadas (columna en NULL) terminaría tratada como si estuviera en
// (0,0) "Null Island" en vez de quedar excluida, ensuciando el ranking con
// una distancia gigante pero "válida". Achicamos null/undefined/'' a NaN
// para que el filtro de abajo las descarte de verdad.
const parseCoord = (valor) => (valor === null || valor === undefined || valor === '' ? NaN : Number(valor));

// Sucursales activas con coordenadas cargadas (se sacan solas del link de
// Google Maps al crear/editar la sucursal, ver sucursalesAdmin.js), ordenadas
// por cercanía al punto (lat, lng) del cliente. Una sucursal sin coordenadas
// resueltas simplemente no entra en el cálculo: no hay con qué compararla.
export const sucursalesMasCercanas = async (lat, lng, cantidad = 2) => {
  const sucursales = await getSucursalesActivas();

  const conCoordenadas = sucursales
    .map(s => ({ ...s, latitud: parseCoord(s.latitud), longitud: parseCoord(s.longitud) }))
    .filter(s => Number.isFinite(s.latitud) && Number.isFinite(s.longitud));

  return conCoordenadas
    .map(s => ({
      id: s.id,
      nombre: s.nombre,
      distancia_km: Number(distanciaHaversineKm(lat, lng, s.latitud, s.longitud).toFixed(2))
    }))
    .sort((a, b) => a.distancia_km - b.distancia_km)
    .slice(0, cantidad);
};
