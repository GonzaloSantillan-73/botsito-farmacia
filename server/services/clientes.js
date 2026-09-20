import { supabase } from '../supabase.js';

// Arma un phone -> nombre_completo para una tanda de teléfonos. Modelo
// estricto por client_phone: cada número es una identidad independiente, sin
// cruzar con ningún otro número aunque comparta DNI (ver guardarDatoCliente).
export const resolverNombresPorTelefono = async (phones) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTES] resolverNombresPorTelefono() — parámetros recibidos:', { cantidadTelefonos: phones?.length });
  if (!phones || phones.length === 0) return {};

  const { data: fichas, error } = await supabase
    .from('clientes')
    .select('client_phone, nombre_completo')
    .in('client_phone', phones);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] resolverNombresPorTelefono() — error consultando clientes:', error);
    throw error;
  }

  const phoneMap = {};
  (fichas || []).forEach(f => { if (f.nombre_completo) phoneMap[f.client_phone] = f.nombre_completo; });

  console.log('✅ [DEBUG-SERVICE-CLIENTES] resolverNombresPorTelefono() — valor de retorno, entradas:', Object.keys(phoneMap).length);
  return phoneMap;
};

export const getCliente = async (clientPhone) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTES] getCliente() — parámetros recibidos:', { clientPhone });

  console.log('📡 [DEBUG-SERVICE-CLIENTES] Query Supabase → tabla: clientes, operación: select, filtro: client_phone =', clientPhone);
  const { data, error } = await supabase.from('clientes').select('*').eq('client_phone', clientPhone).maybeSingle();
  console.log('📡 [DEBUG-SERVICE-CLIENTES] Resultado query clientes (select) — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] getCliente() — error consultando cliente:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-CLIENTES] getCliente() — valor de retorno:', data);
  return data;
};

// Un cliente se considera "registrado" cuando ya tiene nombre y DNI. La obra
// social es opcional (muchos clientes no tienen), así que no se exige.
export const tieneRegistroCompleto = (cliente) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTES] tieneRegistroCompleto() — parámetros recibidos:', { cliente });
  const resultado = !!(cliente?.nombre_completo && cliente?.dni);
  console.log('✅ [DEBUG-SERVICE-CLIENTES] tieneRegistroCompleto() — valor de retorno:', resultado);
  return resultado;
};

// Se llama una vez por cada sesión NUEVA con el bot (no por cada mensaje
// suelto dentro de la misma consulta, ver procesarMensajeBot en bot.js), para
// poder evaluar después el saludo de "cliente frecuente" (ver appConfig:
// getFrequentClientThreshold). No es un incremento atómico en la base (lee
// el valor actual y lo pisa +1), pero alcanza acá: un mismo teléfono no
// manda dos mensajes que arranquen sesión nueva al mismo tiempo.
export const incrementarInteraccionesBot = async (clientPhone, valorActual) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTES] incrementarInteraccionesBot() — parámetros recibidos:', { clientPhone, valorActual });

  const nuevoValor = (Number.isFinite(valorActual) ? valorActual : 0) + 1;
  console.log('📡 [DEBUG-SERVICE-CLIENTES] Query Supabase → tabla: clientes, operación: upsert, valores:', { client_phone: clientPhone, interacciones_bot: nuevoValor });
  const { error } = await supabase
    .from('clientes')
    .upsert({ client_phone: clientPhone, interacciones_bot: nuevoValor, updated_at: new Date().toISOString() }, { onConflict: 'client_phone' });
  console.log('📡 [DEBUG-SERVICE-CLIENTES] Resultado query clientes (upsert interacciones_bot) — error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] incrementarInteraccionesBot() — error guardando interacciones_bot:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-CLIENTES] incrementarInteraccionesBot() — completado sin valor de retorno (undefined)');
};

// Update parcial: si la fila ya existe, sólo pisa el campo dado (el resto
// de columnas quedan como estaban) gracias al upsert por client_phone. Se
// usa también para guardar el DNI: es un dato meramente informativo de ESTE
// número, sin ningún chequeo ni cruce contra otros teléfonos que puedan
// tener el mismo DNI cargado — cada client_phone es una identidad
// independiente.
export const guardarDatoCliente = async (clientPhone, campo, valor) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTES] guardarDatoCliente() — parámetros recibidos:', { clientPhone, campo, valor });

  console.log('📡 [DEBUG-SERVICE-CLIENTES] Query Supabase → tabla: clientes, operación: upsert, valores:', { client_phone: clientPhone, [campo]: valor });
  const { error } = await supabase
    .from('clientes')
    .upsert({ client_phone: clientPhone, [campo]: valor, updated_at: new Date().toISOString() }, { onConflict: 'client_phone' });
  console.log('📡 [DEBUG-SERVICE-CLIENTES] Resultado query clientes (upsert) — error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] guardarDatoCliente() — error guardando dato del cliente:', error);
    throw error;
  }
  console.log('✅ [DEBUG-SERVICE-CLIENTES] guardarDatoCliente() — completado sin valor de retorno (undefined)');
};
