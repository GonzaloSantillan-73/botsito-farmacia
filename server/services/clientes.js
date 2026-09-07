import { supabase } from '../supabase.js';

export const getCliente = async (clientPhone) => {
  const { data, error } = await supabase.from('clientes').select('*').eq('client_phone', clientPhone).maybeSingle();
  if (error) throw error;
  return data;
};

// Un cliente se considera "registrado" cuando ya tiene nombre y DNI. La obra
// social es opcional (muchos clientes no tienen), así que no se exige.
export const tieneRegistroCompleto = (cliente) => !!(cliente?.nombre_completo && cliente?.dni);

// Update parcial: si la fila ya existe, sólo pisa el campo dado (el resto
// de columnas quedan como estaban) gracias al upsert por client_phone.
export const guardarDatoCliente = async (clientPhone, campo, valor) => {
  const { error } = await supabase
    .from('clientes')
    .upsert({ client_phone: clientPhone, [campo]: valor, updated_at: new Date().toISOString() }, { onConflict: 'client_phone' });
  if (error) throw error;
};
