import { supabase } from '../supabase.js';

// Devuelve TODAS las sucursales reales de Plex, cada una con su configuración
// interna (dirección, maps, coordenadas, horario, empleados) si ya existe, o
// null si todavía no se configuró (el front la muestra como "No disponible").
export const listarSucursalesConEstado = async () => {
  const { data: plexSucursales, error: plexError } = await supabase
    .from('plex_sucursales')
    .select('id_sucursal, nombre, empresa, cuit')
    .order('nombre');
  if (plexError) throw plexError;

  const { data: internas, error: internasError } = await supabase
    .from('sucursales')
    .select('*, staff_users(id, username, created_at)')
    .not('plex_id_sucursal', 'is', null);
  if (internasError) throw internasError;

  const internasPorPlexId = new Map((internas || []).map(s => [s.plex_id_sucursal, s]));

  return (plexSucursales || []).map(ps => ({
    idSucursalPlex: ps.id_sucursal,
    nombrePlex: ps.nombre,
    empresa: ps.empresa,
    cuit: ps.cuit,
    configuracion: internasPorPlexId.get(ps.id_sucursal) || null
  }));
};

// Crea (si es la primera vez) o actualiza (si ya existía) la configuración
// interna de una sucursal de Plex puntual. El nombre se toma siempre de
// Plex (fuente de verdad); lo que el admin carga acá es la ubicación.
export const configurarSucursal = async ({ plexIdSucursal, direccion, googleMapsUrl, latitud, longitud }) => {
  if (!plexIdSucursal) throw new Error('Falta indicar la sucursal de Plex.');
  if (!direccion?.trim()) throw new Error('Ingresá la dirección de la sucursal.');

  const { data: plexSucursal, error: plexError } = await supabase
    .from('plex_sucursales')
    .select('nombre')
    .eq('id_sucursal', plexIdSucursal)
    .maybeSingle();
  if (plexError) throw plexError;
  if (!plexSucursal) throw new Error('Esa sucursal de Plex no existe (¿la sincronizaste?).');

  const parseCoord = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const latitud_ = parseCoord(latitud);
  const longitud_ = parseCoord(longitud);
  if (latitud !== undefined && latitud !== null && latitud !== '' && (!Number.isFinite(latitud_) || latitud_ < -90 || latitud_ > 90)) {
    throw new Error('La latitud debe ser un número entre -90 y 90.');
  }
  if (longitud !== undefined && longitud !== null && longitud !== '' && (!Number.isFinite(longitud_) || longitud_ < -180 || longitud_ > 180)) {
    throw new Error('La longitud debe ser un número entre -180 y 180.');
  }

  const payload = {
    nombre: plexSucursal.nombre,
    direccion: direccion.trim(),
    google_maps_url: googleMapsUrl?.trim() || null,
    latitud: latitud_,
    longitud: longitud_,
    plex_id_sucursal: plexIdSucursal
  };

  const { data: existente, error: existenteError } = await supabase
    .from('sucursales')
    .select('id')
    .eq('plex_id_sucursal', plexIdSucursal)
    .maybeSingle();
  if (existenteError) throw existenteError;

  if (existente) {
    const { data, error } = await supabase
      .from('sucursales')
      .update(payload)
      .eq('id', existente.id)
      .select('*, staff_users(id, username, created_at)')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('sucursales')
    .insert([payload])
    .select('*, staff_users(id, username, created_at)')
    .single();
  if (error) throw error;
  return data;
};
