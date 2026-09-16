import { supabase } from '../supabase.js';
import { extraerCoordenadasDeUrl } from './mapsLocation.js';

// CRUD clásico de sucursales: se dan de alta directamente desde el panel de
// Administración, sin depender de ningún catálogo externo.
export const listarSucursales = async () => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALESADMIN] listarSucursales() — sin parámetros');

  console.log('📡 [DEBUG-SERVICE-SUCURSALESADMIN] Query Supabase → tabla: sucursales, operación: select (con join staff_users), order: orden, nombre');
  const { data, error } = await supabase
    .from('sucursales')
    .select('*, staff_users(id, username, created_at)')
    .order('orden')
    .order('nombre');
  console.log('📡 [DEBUG-SERVICE-SUCURSALESADMIN] Resultado query sucursales (select listado) — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] listarSucursales() — error listando sucursales:', error);
    throw error;
  }
  const resultado = data || [];
  console.log('✅ [DEBUG-SERVICE-SUCURSALESADMIN] listarSucursales() — valor de retorno:', resultado);
  return resultado;
};

export const crearSucursal = async ({ nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre, abierta24hs }) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALESADMIN] crearSucursal() — parámetros recibidos:', { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre, abierta24hs });

  if (!nombre?.trim()) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] crearSucursal() — falta nombre');
    throw new Error('Ingresá el nombre de la sucursal.');
  }
  if (!direccion?.trim()) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] crearSucursal() — falta dirección');
    throw new Error('Ingresá la dirección de la sucursal.');
  }
  if (!googleMapsUrl?.trim()) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] crearSucursal() — falta Google Maps URL');
    throw new Error('Ingresá el Link de Google Maps de la sucursal.');
  }
  if (!abierta24hs && dias && dias.length === 0) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] crearSucursal() — dias vacío');
    throw new Error('Elegí al menos un día de atención.');
  }

  const payload = {
    nombre: nombre.trim(),
    direccion: direccion.trim(),
    google_maps_url: googleMapsUrl.trim(),
    abierta_24hs: !!abierta24hs
  };
  if (dias) payload.dias = dias;
  if (horaApertura) payload.hora_apertura = horaApertura;
  if (horaCierre) payload.hora_cierre = horaCierre;

  // Las coordenadas se resuelven solas a partir del link de Maps (que ya es
  // obligatorio) para no pedirle al admin que cargue lat/lng a mano. Si no se
  // pueden resolver (link sin coordenadas embebidas, sin conexión, etc.) la
  // sucursal se crea igual; sólo que no va a entrar en las recomendaciones
  // por cercanía hasta que se corrija el link.
  console.log('🔍 [DEBUG-SERVICE-SUCURSALESADMIN] crearSucursal() — resolviendo coordenadas desde URL:', googleMapsUrl.trim());
  const coords = await extraerCoordenadasDeUrl(googleMapsUrl.trim()).catch((err) => {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] crearSucursal() — error resolviendo coordenadas (se continúa sin ellas):', err);
    return null;
  });
  console.log('🔍 [DEBUG-SERVICE-SUCURSALESADMIN] crearSucursal() — coordenadas resueltas:', coords);
  if (coords) {
    payload.latitud = coords.lat;
    payload.longitud = coords.lng;
  }

  console.log('📡 [DEBUG-SERVICE-SUCURSALESADMIN] Query Supabase → tabla: sucursales, operación: insert, valores:', payload);
  const { data, error } = await supabase
    .from('sucursales')
    .insert([payload])
    .select('*, staff_users(id, username, created_at)')
    .single();
  console.log('📡 [DEBUG-SERVICE-SUCURSALESADMIN] Resultado query sucursales (insert) — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] crearSucursal() — error creando sucursal:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-SUCURSALESADMIN] crearSucursal() — valor de retorno:', data);
  return data;
};

export const actualizarSucursal = async (id, { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre, abierta24hs }) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALESADMIN] actualizarSucursal() — parámetros recibidos:', { id, nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre, abierta24hs });

  if (!direccion?.trim()) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] actualizarSucursal() — falta dirección');
    throw new Error('Ingresá la dirección de la sucursal.');
  }
  if (!googleMapsUrl?.trim()) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] actualizarSucursal() — falta Google Maps URL');
    throw new Error('Ingresá el Link de Google Maps de la sucursal.');
  }
  if (!abierta24hs && dias && dias.length === 0) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] actualizarSucursal() — dias vacío');
    throw new Error('Elegí al menos un día de atención.');
  }

  const updates = {
    direccion: direccion.trim(),
    google_maps_url: googleMapsUrl.trim(),
    abierta_24hs: !!abierta24hs
  };
  if (nombre?.trim()) updates.nombre = nombre.trim();
  if (dias) updates.dias = dias;
  if (horaApertura) updates.hora_apertura = horaApertura;
  if (horaCierre) updates.hora_cierre = horaCierre;

  console.log('🔍 [DEBUG-SERVICE-SUCURSALESADMIN] actualizarSucursal() — resolviendo coordenadas desde URL:', googleMapsUrl.trim());
  const coords = await extraerCoordenadasDeUrl(googleMapsUrl.trim()).catch((err) => {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] actualizarSucursal() — error resolviendo coordenadas (se continúa sin ellas):', err);
    return null;
  });
  console.log('🔍 [DEBUG-SERVICE-SUCURSALESADMIN] actualizarSucursal() — coordenadas resueltas:', coords);
  if (coords) {
    updates.latitud = coords.lat;
    updates.longitud = coords.lng;
  }

  console.log('📡 [DEBUG-SERVICE-SUCURSALESADMIN] Query Supabase → tabla: sucursales, operación: update, filtro: id =', id, ', valores:', updates);
  const { data, error } = await supabase
    .from('sucursales')
    .update(updates)
    .eq('id', id)
    .select('*, staff_users(id, username, created_at)')
    .single();
  console.log('📡 [DEBUG-SERVICE-SUCURSALESADMIN] Resultado query sucursales (update) — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] actualizarSucursal() — error actualizando sucursal:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-SUCURSALESADMIN] actualizarSucursal() — valor de retorno:', data);
  return data;
};

// Prende/apaga la sucursal para el bot y el CRM. A diferencia de
// actualizarSucursal() (dirección, maps, horario), esto sólo toca la columna
// `activo`: es la única propiedad que le corresponde exclusivamente al admin
// (ver server/routes/staff.js, requireAdminRole aplicado a todo el router).
export const actualizarEstadoSucursal = async (id, activo) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALESADMIN] actualizarEstadoSucursal() — parámetros recibidos:', { id, activo });

  console.log('📡 [DEBUG-SERVICE-SUCURSALESADMIN] Query Supabase → tabla: sucursales, operación: update (solo activo), filtro: id =', id, ', valores:', { activo });
  const { data, error } = await supabase
    .from('sucursales')
    .update({ activo })
    .eq('id', id)
    .select('*, staff_users(id, username, created_at)')
    .single();
  console.log('📡 [DEBUG-SERVICE-SUCURSALESADMIN] Resultado query sucursales (update estado) — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] actualizarEstadoSucursal() — error actualizando estado:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-SUCURSALESADMIN] actualizarEstadoSucursal() — valor de retorno:', data);
  return data;
};

export const eliminarSucursal = async (id) => {
  console.log('🔍 [DEBUG-SERVICE-SUCURSALESADMIN] eliminarSucursal() — parámetros recibidos:', { id });

  console.log('📡 [DEBUG-SERVICE-SUCURSALESADMIN] Query Supabase → tabla: sucursales, operación: delete, filtro: id =', id);
  const { error } = await supabase.from('sucursales').delete().eq('id', id);
  console.log('📡 [DEBUG-SERVICE-SUCURSALESADMIN] Resultado query sucursales (delete) — error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-SUCURSALESADMIN] eliminarSucursal() — error eliminando sucursal:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-SUCURSALESADMIN] eliminarSucursal() — completado sin valor de retorno (undefined)');
};
