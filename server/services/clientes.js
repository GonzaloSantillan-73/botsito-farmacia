import { supabase } from '../supabase.js';

// Resuelve, para una tanda de CONVERSACIONES puntuales ({ id, client_phone,
// created_at }), el nombre de la persona que realmente tuvo esa consulta —
// devuelve { [conversationId]: nombre_completo }.
//
// Ni bien un mismo número de teléfono puede haber sido de una persona y
// después, si el número se recicla, de otra completamente distinta, resolver
// "a quién pertenece este teléfono" no alcanza: hay que resolver "a quién
// pertenecía este teléfono EN LA FECHA de esta conversación puntual". Cada
// fila de clientes_telefonos_historicos marca el momento exacto (su
// created_at) en que una ficha DEJÓ de usar ese número (ver
// migrar_cliente_por_dni.sql); eso da el límite temporal:
//   - Camino directo (el teléfono es el vigente de una ficha hoy): sólo se
//     atribuye si la conversación es POSTERIOR a la última vez que esa ficha
//     migró de número (o siempre, si nunca migró) — si no, la conversación es
//     de antes de que esa ficha tuviera este número.
//   - Camino histórico (el teléfono aparece en clientes_telefonos_historicos):
//     sólo se atribuye a la ficha cuyo registro histórico para ESE teléfono
//     tiene el created_at más cercano que sea >= la conversación (la ventana
//     en la que ese teléfono fue de esa ficha).
// Sin este límite, un cambio de teléfono o una migración por DNI pisaría
// masivamente el nombre de conversaciones que en realidad eran de otra
// persona con el mismo número reciclado.
//
// Se usa para HISTORIALES (conversaciones/mensajes/pedidos ya ocurridos). Los
// listados de bandejas activas (App.jsx: withClientNames) no lo necesitan:
// una conversación activa siempre está sobre el teléfono con el que el
// cliente está escribiendo ahora mismo, que por definición ya es el vigente.
export const resolverNombresPorConversaciones = async (conversaciones) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTES] resolverNombresPorConversaciones() — parámetros recibidos:', { cantidad: conversaciones?.length });
  const conConCliente = (conversaciones || []).filter(c => c?.client_phone && c?.created_at);
  const phones = [...new Set(conConCliente.map(c => c.client_phone))];
  if (phones.length === 0) return {};

  const { data: fichasDirectas, error: fichasError } = await supabase
    .from('clientes')
    .select('id, client_phone, nombre_completo, created_at')
    .in('client_phone', phones);
  if (fichasError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] resolverNombresPorConversaciones() — error consultando clientes:', fichasError);
    throw fichasError;
  }

  const { data: historicosPorTelefono, error: histError } = await supabase
    .from('clientes_telefonos_historicos')
    .select('cliente_id, client_phone, created_at')
    .in('client_phone', phones);
  if (histError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] resolverNombresPorConversaciones() — error consultando clientes_telefonos_historicos (por teléfono):', histError);
    throw histError;
  }

  // Para el camino directo: necesitamos saber, para cada ficha con teléfono
  // vigente en este lote, desde cuándo lo tiene — el created_at más reciente
  // entre TODOS sus registros históricos (cualquier teléfono, no sólo los de
  // este lote), no sólo los de este lote de teléfonos. Si nunca migró (nunca
  // tiene un registro histórico propio), el piso es la fecha en que se creó
  // su ficha: sin esto, una conversación de ANTES de que esta persona
  // existiera como cliente (de un dueño previo del mismo número, reciclado)
  // quedaría igual atribuida a ella por no tener ningún límite inferior.
  const idsFichasDirectas = (fichasDirectas || []).map(f => f.id);
  const { data: historicosDeFichasDirectas, error: histDirectasError } = idsFichasDirectas.length
    ? await supabase.from('clientes_telefonos_historicos').select('cliente_id, created_at').in('cliente_id', idsFichasDirectas)
    : { data: [] };
  if (histDirectasError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] resolverNombresPorConversaciones() — error consultando históricos de fichas directas:', histDirectasError);
    throw histDirectasError;
  }
  const desdeVigenteMs = {};
  (fichasDirectas || []).forEach(f => { desdeVigenteMs[f.id] = new Date(f.created_at).getTime(); });
  (historicosDeFichasDirectas || []).forEach(h => {
    const t = new Date(h.created_at).getTime();
    if (t > desdeVigenteMs[h.cliente_id]) desdeVigenteMs[h.cliente_id] = t;
  });

  const idsYaEncontrados = new Set(idsFichasDirectas);
  const idsFaltantes = [...new Set((historicosPorTelefono || []).map(h => h.cliente_id).filter(id => !idsYaEncontrados.has(id)))];
  const { data: fichasPorHistorico, error: fichasHistError } = idsFaltantes.length
    ? await supabase.from('clientes').select('id, nombre_completo').in('id', idsFaltantes)
    : { data: [] };
  if (fichasHistError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] resolverNombresPorConversaciones() — error consultando fichas por histórico:', fichasHistError);
    throw fichasHistError;
  }

  const nombrePorFichaId = {};
  [...(fichasDirectas || []), ...(fichasPorHistorico || [])].forEach(f => {
    if (f.nombre_completo) nombrePorFichaId[f.id] = f.nombre_completo;
  });

  const resultado = {};
  conConCliente.forEach(conv => {
    const t = new Date(conv.created_at).getTime();

    const fichaDirecta = (fichasDirectas || []).find(f => f.client_phone === conv.client_phone);
    if (fichaDirecta?.nombre_completo) {
      const desde = desdeVigenteMs[fichaDirecta.id];
      if (desde == null || t >= desde) {
        resultado[conv.id] = fichaDirecta.nombre_completo;
        return;
      }
      // La conversación es anterior a que esta ficha tuviera este teléfono
      // (número reciclado): no se le atribuye, se sigue evaluando el camino
      // histórico por si corresponde a otra ficha.
    }

    const candidatos = (historicosPorTelefono || [])
      .filter(h => h.client_phone === conv.client_phone && new Date(h.created_at).getTime() >= t)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (candidatos.length) {
      const nombre = nombrePorFichaId[candidatos[0].cliente_id];
      if (nombre) resultado[conv.id] = nombre;
    }
  });

  console.log('✅ [DEBUG-SERVICE-CLIENTES] resolverNombresPorConversaciones() — valor de retorno, entradas:', Object.keys(resultado).length);
  return resultado;
};

// Dado CUALQUIER teléfono que haya identificado a una persona (el vigente o
// uno viejo de antes de migrar, ver clientes_telefonos_historicos), devuelve
// TODOS los teléfonos que alguna vez fueron de esa misma persona, incluido el
// que se pidió. Si el teléfono no tiene ninguna ficha asociada (cliente sin
// registrar todavía), devuelve sólo ese teléfono tal cual.
export const obtenerTelefonosDeLaMismaPersona = async (clientPhone) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTES] obtenerTelefonosDeLaMismaPersona() — parámetros recibidos:', { clientPhone });

  const { data: fichaDirecta, error: fichaError } = await supabase
    .from('clientes')
    .select('id, client_phone')
    .eq('client_phone', clientPhone)
    .maybeSingle();
  if (fichaError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] obtenerTelefonosDeLaMismaPersona() — error consultando clientes:', fichaError);
    throw fichaError;
  }

  let fichaId = fichaDirecta?.id || null;
  let telefonoVigente = fichaDirecta?.client_phone || null;

  if (!fichaId) {
    const { data: historico, error: histError } = await supabase
      .from('clientes_telefonos_historicos')
      .select('cliente_id')
      .eq('client_phone', clientPhone)
      .maybeSingle();
    if (histError) {
      console.error('❌ [DEBUG-SERVICE-CLIENTES] obtenerTelefonosDeLaMismaPersona() — error consultando clientes_telefonos_historicos:', histError);
      throw histError;
    }
    if (historico) {
      fichaId = historico.cliente_id;
      const { data: ficha, error: fichaPorIdError } = await supabase.from('clientes').select('client_phone').eq('id', fichaId).maybeSingle();
      if (fichaPorIdError) {
        console.error('❌ [DEBUG-SERVICE-CLIENTES] obtenerTelefonosDeLaMismaPersona() — error consultando ficha por id:', fichaPorIdError);
        throw fichaPorIdError;
      }
      telefonoVigente = ficha?.client_phone || null;
    }
  }

  if (!fichaId) {
    console.log('✅ [DEBUG-SERVICE-CLIENTES] obtenerTelefonosDeLaMismaPersona() — sin ficha asociada, valor de retorno:', [clientPhone]);
    return [clientPhone];
  }

  const { data: historicos, error: todosHistError } = await supabase
    .from('clientes_telefonos_historicos')
    .select('client_phone')
    .eq('cliente_id', fichaId);
  if (todosHistError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTES] obtenerTelefonosDeLaMismaPersona() — error consultando todos los históricos:', todosHistError);
    throw todosHistError;
  }

  const resultado = [...new Set([clientPhone, telefonoVigente, ...(historicos || []).map(h => h.client_phone)].filter(Boolean))];
  console.log('✅ [DEBUG-SERVICE-CLIENTES] obtenerTelefonosDeLaMismaPersona() — valor de retorno:', resultado);
  return resultado;
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
