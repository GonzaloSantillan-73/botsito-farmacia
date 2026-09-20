import { supabase } from '../supabase.js';

// Un empleado de sucursal reclama una conversación de la cola general. El
// UPDATE queda condicionado a que siga en 'esperando' y sin sucursal
// asignada: si dos sucursales tocan "Tomar" casi al mismo tiempo, sólo la
// primera consulta que llegue a Postgres se la queda (la segunda no matchea
// ninguna fila y tira error). También limpia devuelta_por_sucursal_id: esa
// marca ya no aplica una vez que alguien la toma. A propósito, NO se le
// manda ningún mensaje al cliente: de cara a él, que una sucursal tome el
// chat es una asignación puramente interna, sin ningún aviso ni re-saludo.
export const tomarConsulta = async (conversationId, sucursalId) => {
  console.log('🔍 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — conversationId:', conversationId, 'sucursalId:', sucursalId);
  try {
    console.log('📡 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — SELECT sucursales, filtros: { id:', sucursalId, '}, columnas: id, nombre');
    const { data: sucursal, error: sucursalError } = await supabase
      .from('sucursales')
      .select('id, nombre')
      .eq('id', sucursalId)
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — resultado SELECT sucursales — data:', sucursal, 'error:', sucursalError);

    if (sucursalError) {
      console.error('❌ [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — sucursalError:', sucursalError);
      throw sucursalError;
    }
    if (!sucursal) {
      console.error('❌ [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — sucursal no encontrada para sucursalId:', sucursalId);
      throw new Error('Sucursal no encontrada.');
    }

    // primera_sucursal_id no se pisa nunca: solo se completa la primera vez que
    // alguien toma la consulta, para poder saber después (aunque haya habido
    // una devolución y otra sucursal la haya retomado) si intervino una sola
    // sucursal o dos.
    console.log('📡 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — SELECT conversations, filtros: { id:', conversationId, '}, columnas: primera_sucursal_id');
    const { data: actual, error: actualError } = await supabase
      .from('conversations')
      .select('primera_sucursal_id')
      .eq('id', conversationId)
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — resultado SELECT conversations — data:', actual, 'error:', actualError);

    const updates = { sucursal_id: sucursalId, devuelta_por_sucursal_id: null, derivado_por_sucursal_id: null, derivado_por_sucursal_nombre: null };
    if (!actual?.primera_sucursal_id) updates.primera_sucursal_id = sucursalId;
    console.log('🔍 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — CAMBIO DE ESTADO — conversationId:', conversationId, 'de "esperando" (sin sucursal) a tomada por sucursal:', sucursalId, '— updates a aplicar:', updates);

    console.log('📡 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — UPDATE conversations, filtros: { id:', conversationId, ', status: "esperando", sucursal_id: null }, valores:', updates);
    const { data: conv, error: updateError } = await supabase
      .from('conversations')
      .update(updates)
      .eq('id', conversationId)
      .eq('status', 'esperando')
      .is('sucursal_id', null)
      .select()
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — resultado UPDATE conversations — data:', conv, 'error:', updateError);

    if (updateError) {
      console.error('❌ [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — updateError:', updateError);
      throw updateError;
    }
    if (!conv) {
      console.error('❌ [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — la consulta ya fue tomada por otra sucursal, conversationId:', conversationId);
      throw new Error('Esta consulta ya fue tomada por otra sucursal.');
    }

    console.log('✅ [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — CAMBIO DE ESTADO CONFIRMADO — conversationId:', conversationId, 'ahora tomada por sucursal:', sucursalId, '(', sucursal.nombre, ')');

    // Registro histórico (ver conversation_sucursal_historial.sql): un fallo
    // acá no debe tirar abajo la asignación, que ya quedó confirmada arriba.
    const { error: histError } = await supabase
      .from('conversation_sucursal_historial')
      .insert({ conversation_id: conversationId, sucursal_id: sucursalId });
    if (histError) {
      console.error('❌ [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — error registrando historial de sucursal (no crítico):', histError);
    }

    console.log('✅ [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — resultado a devolver:', conv);
    return conv;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — error:', err?.message, err?.stack);
    throw err;
  }
};
