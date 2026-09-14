import { supabase } from './supabase';

/**
 * Recibe un array de conversaciones, extrae los teléfonos, busca en la tabla `clientes`
 * y devuelve el mismo array pero con un campo `real_name` inyectado.
 */
export const withClientNames = async (conversations) => {
  console.log('🔍 [DEBUG-LIB-CLIENTUTILS] withClientNames() — conversations recibidas:', conversations?.length ?? 0);
  if (!conversations || conversations.length === 0) {
    console.log('✅ [DEBUG-LIB-CLIENTUTILS] withClientNames() — return (sin conversaciones):', conversations);
    return conversations;
  }

  const phones = [...new Set(conversations.map(c => c.client_phone).filter(Boolean))];
  console.log('🔍 [DEBUG-LIB-CLIENTUTILS] withClientNames() — teléfonos buscados:', phones);
  if (phones.length === 0) {
    console.log('✅ [DEBUG-LIB-CLIENTUTILS] withClientNames() — return (sin teléfonos):', conversations);
    return conversations;
  }

  console.log('📡 [DEBUG-LIB-CLIENTUTILS] withClientNames() — consultando supabase.from("clientes") con phones:', phones);
  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('client_phone, nombre_completo')
    .in('client_phone', phones);
  console.log('📡 [DEBUG-LIB-CLIENTUTILS] withClientNames() — respuesta de supabase — data:', clientes, '| error:', error);

  if (error) {
    console.error('❌ [DEBUG-LIB-CLIENTUTILS] Error fetching client names:', error);
    console.log('✅ [DEBUG-LIB-CLIENTUTILS] withClientNames() — return (tras error, conversations sin modificar):', conversations);
    return conversations;
  }

  const phoneMap = {};
  clientes?.forEach(c => {
    if (c.nombre_completo) phoneMap[c.client_phone] = c.nombre_completo;
  });
  console.log('✅ [DEBUG-LIB-CLIENTUTILS] withClientNames() — nombres encontrados:', phoneMap);

  const result = conversations.map(c => ({
    ...c,
    real_name: phoneMap[c.client_phone] || null
  }));
  console.log('✅ [DEBUG-LIB-CLIENTUTILS] withClientNames() — return:', result);
  return result;
};
