import { supabase } from '../supabase.js';
import { extraerCoordenadasDeUrl } from './mapsLocation.js';

// CRUD clásico de sucursales: se dan de alta directamente desde el panel de
// Administración, sin depender de ningún catálogo externo.
export const listarSucursales = async () => {
  const { data, error } = await supabase
    .from('sucursales')
    .select('*, staff_users(id, username, created_at)')
    .order('orden')
    .order('nombre');
  if (error) throw error;
  return data || [];
};

export const crearSucursal = async ({ nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre }) => {
  if (!nombre?.trim()) throw new Error('Ingresá el nombre de la sucursal.');
  if (!direccion?.trim()) throw new Error('Ingresá la dirección de la sucursal.');
  if (!googleMapsUrl?.trim()) throw new Error('Ingresá el Link de Google Maps de la sucursal.');
  if (dias && dias.length === 0) throw new Error('Elegí al menos un día de atención.');

  const payload = {
    nombre: nombre.trim(),
    direccion: direccion.trim(),
    google_maps_url: googleMapsUrl.trim()
  };
  if (dias) payload.dias = dias;
  if (horaApertura) payload.hora_apertura = horaApertura;
  if (horaCierre) payload.hora_cierre = horaCierre;

  // Las coordenadas se resuelven solas a partir del link de Maps (que ya es
  // obligatorio) para no pedirle al admin que cargue lat/lng a mano. Si no se
  // pueden resolver (link sin coordenadas embebidas, sin conexión, etc.) la
  // sucursal se crea igual; sólo que no va a entrar en las recomendaciones
  // por cercanía hasta que se corrija el link.
  const coords = await extraerCoordenadasDeUrl(googleMapsUrl.trim()).catch(() => null);
  if (coords) {
    payload.latitud = coords.lat;
    payload.longitud = coords.lng;
  }

  const { data, error } = await supabase
    .from('sucursales')
    .insert([payload])
    .select('*, staff_users(id, username, created_at)')
    .single();
  if (error) throw error;
  return data;
};

export const actualizarSucursal = async (id, { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre }) => {
  if (!direccion?.trim()) throw new Error('Ingresá la dirección de la sucursal.');
  if (!googleMapsUrl?.trim()) throw new Error('Ingresá el Link de Google Maps de la sucursal.');
  if (dias && dias.length === 0) throw new Error('Elegí al menos un día de atención.');

  const updates = {
    direccion: direccion.trim(),
    google_maps_url: googleMapsUrl.trim()
  };
  if (nombre?.trim()) updates.nombre = nombre.trim();
  if (dias) updates.dias = dias;
  if (horaApertura) updates.hora_apertura = horaApertura;
  if (horaCierre) updates.hora_cierre = horaCierre;

  const coords = await extraerCoordenadasDeUrl(googleMapsUrl.trim()).catch(() => null);
  if (coords) {
    updates.latitud = coords.lat;
    updates.longitud = coords.lng;
  }

  const { data, error } = await supabase
    .from('sucursales')
    .update(updates)
    .eq('id', id)
    .select('*, staff_users(id, username, created_at)')
    .single();
  if (error) throw error;
  return data;
};

export const eliminarSucursal = async (id) => {
  const { error } = await supabase.from('sucursales').delete().eq('id', id);
  if (error) throw error;
};
