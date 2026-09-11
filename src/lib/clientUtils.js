import { supabase } from './supabase';

/**
 * Recibe un array de conversaciones, extrae los teléfonos, busca en la tabla `clientes`
 * y devuelve el mismo array pero con un campo `real_name` inyectado.
 */
export const withClientNames = async (conversations) => {
  if (!conversations || conversations.length === 0) return conversations;
  
  const phones = [...new Set(conversations.map(c => c.client_phone).filter(Boolean))];
  if (phones.length === 0) return conversations;

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('client_phone, nombre_completo')
    .in('client_phone', phones);

  if (error) {
    console.error("Error fetching client names:", error);
    return conversations;
  }

  const phoneMap = {};
  clientes?.forEach(c => {
    if (c.nombre_completo) phoneMap[c.client_phone] = c.nombre_completo;
  });

  return conversations.map(c => ({
    ...c,
    real_name: phoneMap[c.client_phone] || null
  }));
};
