import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';

// Trae todos los empleados con el nombre de su sucursal (join), para
// listarlos en el CRM sin tener que resolver cada sucursal por separado.
export const listarEmpleados = async () => {
  const { data, error } = await supabase
    .from('staff_users')
    .select('id, username, sucursal_id, created_at, sucursales(id, nombre)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const crearEmpleado = async ({ username, password, sucursalId }) => {
  if (!username?.trim()) throw new Error('Ingresá un nombre de usuario.');
  if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  if (!sucursalId) throw new Error('Seleccioná la sucursal del empleado.');

  const passwordHash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('staff_users')
    .insert([{ username: username.trim(), password_hash: passwordHash, sucursal_id: sucursalId }])
    .select('id, username, sucursal_id, created_at, sucursales(id, nombre)')
    .single();
  if (error) throw error;
  return data;
};

// Actualiza usuario/contraseña/sucursal de un empleado existente. Cualquiera
// de los tres campos es opcional (solo se pisa lo que venga con valor).
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
    .select('id, username, sucursal_id, created_at, sucursales(id, nombre)')
    .single();
  if (error) throw error;
  return data;
};

export const eliminarEmpleado = async (id) => {
  const { error } = await supabase.from('staff_users').delete().eq('id', id);
  if (error) throw error;
};
