import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';

// Trae todos los empleados con los datos de su sucursal (join), para
// listarlos en el CRM sin tener que resolver cada sucursal por separado.
export const listarEmpleados = async () => {
  const { data, error } = await supabase
    .from('staff_users')
    .select('id, username, sucursal_id, created_at, sucursales(id, nombre, direccion, google_maps_url)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

// Cada empleado nuevo crea su propia sucursal (relación 1 a 1): el admin
// carga el usuario/contraseña de acceso al CRM junto con el nombre, la
// dirección y el link de Maps de esa sucursal.
export const crearEmpleado = async ({ username, password, sucursalNombre, direccion, googleMapsUrl }) => {
  if (!username?.trim()) throw new Error('Ingresá un nombre de usuario.');
  if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  if (!sucursalNombre?.trim()) throw new Error('Ingresá el nombre de la sucursal.');
  if (!direccion?.trim()) throw new Error('Ingresá la dirección de la sucursal.');
  if (!googleMapsUrl?.trim()) throw new Error('Ingresá el link de Google Maps de la sucursal.');

  const { data: sucursal, error: sucursalError } = await supabase
    .from('sucursales')
    .insert([{ nombre: sucursalNombre.trim(), direccion: direccion.trim(), google_maps_url: googleMapsUrl.trim() }])
    .select('id')
    .single();
  if (sucursalError) throw sucursalError;

  const passwordHash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('staff_users')
    .insert([{ username: username.trim(), password_hash: passwordHash, sucursal_id: sucursal.id }])
    .select('id, username, sucursal_id, created_at, sucursales(id, nombre, direccion, google_maps_url)')
    .single();

  if (error) {
    // La sucursal se creó pero el empleado no pudo darse de alta (ej. usuario
    // duplicado): no dejamos una sucursal huérfana sin empleado.
    await supabase.from('sucursales').delete().eq('id', sucursal.id);
    throw error;
  }
  return data;
};

// Actualiza usuario/contraseña del empleado y, opcionalmente, los datos de
// la sucursal que le pertenece (nombre/dirección/maps). Cualquier campo es
// opcional (solo se pisa lo que venga con valor).
export const actualizarEmpleado = async (id, { username, password, sucursalNombre, direccion, googleMapsUrl }) => {
  const updates = { updated_at: new Date().toISOString() };
  if (username?.trim()) updates.username = username.trim();
  if (password) {
    if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  const sucursalUpdates = {};
  if (sucursalNombre?.trim()) sucursalUpdates.nombre = sucursalNombre.trim();
  if (direccion?.trim()) sucursalUpdates.direccion = direccion.trim();
  if (googleMapsUrl?.trim()) sucursalUpdates.google_maps_url = googleMapsUrl.trim();

  if (Object.keys(sucursalUpdates).length > 0) {
    const { data: empleadoActual, error: findError } = await supabase
      .from('staff_users')
      .select('sucursal_id')
      .eq('id', id)
      .single();
    if (findError) throw findError;

    const { error: sucursalError } = await supabase
      .from('sucursales')
      .update(sucursalUpdates)
      .eq('id', empleadoActual.sucursal_id);
    if (sucursalError) throw sucursalError;
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
