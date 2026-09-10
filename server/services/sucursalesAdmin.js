import { supabase } from '../supabase.js';

// CRUD clásico de sucursales: ya no dependen de ningún catálogo externo (Plex),
// se dan de alta directamente desde el panel de Administración.
export const listarSucursales = async () => {
  const { data, error } = await supabase
    .from('sucursales')
    .select('*, staff_users(id, username, created_at)')
    .order('orden')
    .order('nombre');
  if (error) throw error;
  return data || [];
};

export const crearSucursal = async ({ nombre, direccion, googleMapsUrl, whatsappUrl }) => {
  if (!nombre?.trim()) throw new Error('Ingresá el nombre de la sucursal.');
  if (!direccion?.trim()) throw new Error('Ingresá la dirección de la sucursal.');

  const { data, error } = await supabase
    .from('sucursales')
    .insert([{
      nombre: nombre.trim(),
      direccion: direccion.trim(),
      google_maps_url: googleMapsUrl?.trim() || null,
      whatsapp_url: whatsappUrl?.trim() || null
    }])
    .select('*, staff_users(id, username, created_at)')
    .single();
  if (error) throw error;
  return data;
};

export const actualizarSucursal = async (id, { nombre, direccion, googleMapsUrl, whatsappUrl }) => {
  if (!direccion?.trim()) throw new Error('Ingresá la dirección de la sucursal.');

  const updates = {
    direccion: direccion.trim(),
    google_maps_url: googleMapsUrl?.trim() || null,
    whatsapp_url: whatsappUrl?.trim() || null
  };
  if (nombre?.trim()) updates.nombre = nombre.trim();

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
