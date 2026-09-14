import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';

// Crea un empleado para una sucursal YA dada de alta (la sucursal se crea
// aparte, ver server/services/sucursalesAdmin.js).
export const crearEmpleadoParaSucursal = async ({ sucursalId, username, password }) => {
  console.log('🔍 [DEBUG-SERVICE-STAFFAUTH] crearEmpleadoParaSucursal() — parámetros recibidos:', { sucursalId, username, password: '[REDACTED]' });

  if (!sucursalId) {
    console.error('❌ [DEBUG-SERVICE-STAFFAUTH] crearEmpleadoParaSucursal() — falta sucursalId');
    throw new Error('Falta indicar la sucursal.');
  }
  if (!username?.trim()) {
    console.error('❌ [DEBUG-SERVICE-STAFFAUTH] crearEmpleadoParaSucursal() — falta username');
    throw new Error('Ingresá un nombre de usuario.');
  }
  if (!password || password.length < 6) {
    console.error('❌ [DEBUG-SERVICE-STAFFAUTH] crearEmpleadoParaSucursal() — contraseña inválida (longitud insuficiente)');
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  console.log('🔍 [DEBUG-SERVICE-STAFFAUTH] crearEmpleadoParaSucursal() — hash de contraseña generado (no se loguea el valor)');

  console.log('📡 [DEBUG-SERVICE-STAFFAUTH] Query Supabase → tabla: staff_users, operación: insert, valores:', { username: username.trim(), password_hash: '[REDACTED]', sucursal_id: sucursalId });
  const { data, error } = await supabase
    .from('staff_users')
    .insert([{ username: username.trim(), password_hash: passwordHash, sucursal_id: sucursalId }])
    .select('id, username, sucursal_id, created_at, sucursales(id, nombre, direccion, google_maps_url)')
    .single();
  console.log('📡 [DEBUG-SERVICE-STAFFAUTH] Resultado query staff_users (insert) — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-STAFFAUTH] crearEmpleadoParaSucursal() — error insertando empleado:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-STAFFAUTH] crearEmpleadoParaSucursal() — valor de retorno:', data);
  return data;
};

// Actualiza usuario/contraseña del empleado y, opcionalmente, lo reasigna a
// otra sucursal ya configurada. La dirección/maps/coordenadas de la sucursal
// se editan aparte, desde el panel de Sucursales (no acá).
export const actualizarEmpleado = async (id, { username, password, sucursalId }) => {
  console.log('🔍 [DEBUG-SERVICE-STAFFAUTH] actualizarEmpleado() — parámetros recibidos:', { id, username, password: '[REDACTED]', sucursalId });

  const updates = { updated_at: new Date().toISOString() };
  if (username?.trim()) updates.username = username.trim();
  if (sucursalId) updates.sucursal_id = sucursalId;
  if (password) {
    if (password.length < 6) {
      console.error('❌ [DEBUG-SERVICE-STAFFAUTH] actualizarEmpleado() — contraseña inválida (longitud insuficiente)');
      throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  console.log('🔍 [DEBUG-SERVICE-STAFFAUTH] actualizarEmpleado() — updates a aplicar (password_hash omitido si presente):', {
    ...updates,
    password_hash: updates.password_hash ? '[REDACTED]' : undefined
  });

  console.log('📡 [DEBUG-SERVICE-STAFFAUTH] Query Supabase → tabla: staff_users, operación: update, filtro: id =', id);
  const { data, error } = await supabase
    .from('staff_users')
    .update(updates)
    .eq('id', id)
    .select('id, username, sucursal_id, created_at, sucursales(id, nombre, direccion, google_maps_url)')
    .single();
  console.log('📡 [DEBUG-SERVICE-STAFFAUTH] Resultado query staff_users (update) — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-STAFFAUTH] actualizarEmpleado() — error actualizando empleado:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-STAFFAUTH] actualizarEmpleado() — valor de retorno:', data);
  return data;
};

export const eliminarEmpleado = async (id) => {
  console.log('🔍 [DEBUG-SERVICE-STAFFAUTH] eliminarEmpleado() — parámetros recibidos:', { id });

  console.log('📡 [DEBUG-SERVICE-STAFFAUTH] Query Supabase → tabla: staff_users, operación: delete, filtro: id =', id);
  const { error } = await supabase.from('staff_users').delete().eq('id', id);
  console.log('📡 [DEBUG-SERVICE-STAFFAUTH] Resultado query staff_users (delete) — error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-STAFFAUTH] eliminarEmpleado() — error eliminando empleado:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-STAFFAUTH] eliminarEmpleado() — completado sin valor de retorno (undefined)');
};
