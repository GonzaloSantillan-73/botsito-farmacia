import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';

// Crea un empleado para una sucursal YA configurada (a diferencia del viejo
// flujo, la sucursal se da de alta aparte, vinculada a una sucursal real de
// Plex — ver server/services/sucursalesAdmin.js — así que acá solo se crea
// el usuario del empleado).
export const crearEmpleadoParaSucursal = async ({ sucursalId, username, password }) => {
  if (!sucursalId) throw new Error('Falta indicar la sucursal.');
  if (!username?.trim()) throw new Error('Ingresá un nombre de usuario.');
  if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');

  const passwordHash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('staff_users')
    .insert([{ username: username.trim(), password_hash: passwordHash, sucursal_id: sucursalId }])
    .select('id, username, sucursal_id, created_at, sucursales(id, nombre, direccion, google_maps_url)')
    .single();
  if (error) throw error;
  return data;
};

// Actualiza usuario/contraseña del empleado y, opcionalmente, lo reasigna a
// otra sucursal ya configurada. La dirección/maps/coordenadas de la sucursal
// se editan aparte, desde el panel de Sucursales (no acá).
export const actualizarEmpleado = async (id, { username, password, sucursalId }) => {
  const updates = { updated_at: new Date().toISOString() };
  if (username?.trim()) updates.username = username.trim();
  if (sucursalId) updates.sucursal_id = sucursalId;
  if (password) {
    if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  const { data, error } = await supabase
    .from('staff_users')
    .update(updates)
    .eq('id', id)
    .select('id, username, sucursal_id, created_at, sucursales(id, nombre, direccion, google_maps_url)')
    .single();
  if (error) throw error;
  return data;
};

export const eliminarEmpleado = async (id) => {
  const { error } = await supabase.from('staff_users').delete().eq('id', id);
  if (error) throw error;
};
