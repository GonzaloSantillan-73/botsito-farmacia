import { supabase } from '../supabase.js';

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

// Antes de guardar un DNI nuevo (ver el flujo de edición de datos en bot.js)
// hay que chequear que no sea el de OTRO cliente ya registrado con ese mismo
// número — dos teléfonos distintos con el mismo DNI casi seguro es un error
// de tipeo, no una coincidencia real.
export const dniPerteneceAOtroCliente = async (dni, clientPhoneActual) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTES] dniPerteneceAOtroCliente() — parámetros recibidos:', { dni, clientPhoneActual });

  console.log('📡 [DEBUG-SERVICE-CLIENTES] Query Supabase → tabla: clientes, operación: select, filtro: dni =', dni, ', client_phone != ', clientPhoneActual);
  const { data, error } = await supabase
    .from('clientes')
    .select('client_phone')
    .eq('dni', dni)
    .neq('client_phone', clientPhoneActual)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-CLIENTES] Resultado query clientes (select dni duplicado) — data:', data, 'error:', error);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] dniPerteneceAOtroCliente() — error consultando dni duplicado:', error);
    throw error;
  }
  const resultado = !!data;
  console.log('✅ [DEBUG-SERVICE-CLIENTES] dniPerteneceAOtroCliente() — valor de retorno:', resultado);
  return resultado;
};

// La identidad "de verdad" de una persona pasa a ser su DNI, no el
// client_phone (que puede cambiar si recicla su línea): llama a la función
// atómica de Postgres migrar_cliente_por_dni (ver
// supabase/migrar_cliente_por_dni.sql), que en una sola transacción decide
// si hay que MIGRAR una ficha existente al teléfono nuevo (arrastrando
// también su historial de conversations/pedidos) o si es un alta/
// actualización normal sobre este mismo teléfono.
//
// Se usa SÓLO desde el registro OBLIGATORIO de un teléfono nuevo (bot.js:
// registro_dni) — la edición voluntaria de un DNI ya cargado (opción "2.
// DNI" del menú de edición) sigue bloqueando el duplicado con
// dniPerteneceAOtroCliente de arriba: ahí el teléfono actual YA tiene su
// propia ficha completa, y "migrar" implicaría fusionar dos identidades ya
// establecidas (con su propio historial cada una) sin que nadie lo confirme
// — un simple error de tipeo en ese campo podría mezclar el historial de dos
// personas distintas. En el registro inicial, en cambio, este teléfono
// todavía no tiene ficha propia, así que no hay nada que fusionar por error.
//
// Devuelve { accion: 'migrado' | 'alta', cliente }.
export const migrarOCrearClientePorDni = async (dni, telefonoActual, nombreCompleto, { reintentando = false } = {}) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTES] migrarOCrearClientePorDni() — parámetros recibidos:', { dni, telefonoActual, nombreCompleto, reintentando });

  const { data, error } = await supabase.rpc('migrar_cliente_por_dni', {
    p_dni: dni,
    p_telefono_nuevo: telefonoActual,
    p_nombre_completo: nombreCompleto || null
  });
  console.log('📡 [DEBUG-SERVICE-CLIENTES] Resultado RPC migrar_cliente_por_dni — data:', data, 'error:', error);

  if (error) {
    // 23505 = unique_violation: dos conversaciones nuevas con un DNI nunca
    // antes visto chocaron al mismo tiempo (ver el índice único de
    // clientes_dni_unique_index.sql). Se reintenta UNA vez: la segunda
    // pasada ya encuentra la fila que ganó la primera y migra en vez de
    // volver a intentar un alta duplicada.
    if (error.code === '23505' && !reintentando) {
      console.error('⚠️ [DEBUG-SERVICE-CLIENTES] migrarOCrearClientePorDni() — conflicto de concurrencia (23505), reintentando una vez:', error);
      return migrarOCrearClientePorDni(dni, telefonoActual, nombreCompleto, { reintentando: true });
    }
    console.error('❌ [DEBUG-SERVICE-CLIENTES] migrarOCrearClientePorDni() — error en el RPC:', error);
    throw error;
  }

  const accion = data?.accion === 'migrado' ? 'migrado' : 'alta';
  console.log(accion === 'migrado'
    ? `✅ [DEBUG-SERVICE-CLIENTES] migrarOCrearClientePorDni() — updated phone for existing DNI (migración de teléfono) → ${telefonoActual}`
    : `✅ [DEBUG-SERVICE-CLIENTES] migrarOCrearClientePorDni() — nuevo alta para DNI ${dni} en ${telefonoActual}`);

  return { accion, cliente: data?.cliente || null };
};

// Update parcial: si la fila ya existe, sólo pisa el campo dado (el resto
// de columnas quedan como estaban) gracias al upsert por client_phone.
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
