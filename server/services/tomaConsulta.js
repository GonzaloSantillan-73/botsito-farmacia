import { supabase } from '../supabase.js';
import { TERMINAL_STATUSES } from './sessionManager.js';

// Un empleado de sucursal reclama una conversación: de la cola general
// ('esperando', sin sucursal) O directamente de una que el bot todavía está
// atendiendo solo, sin que el cliente haya pedido un humano (ver
// requiereInterferir/esModoBot en ChatArea.jsx — "interferir" un chat en
// curso). El UPDATE queda condicionado a que la conversación NO esté
// cerrada y siga sin sucursal asignada: si dos sucursales tocan "Tomar"
// casi al mismo tiempo, sólo la primera consulta que llegue a Postgres se
// la queda (la segunda no matchea ninguna fila y tira error). También
// limpia devuelta_por_sucursal_id: esa marca ya no aplica una vez que
// alguien la toma. A propósito, NO se le manda ningún mensaje al cliente:
// de cara a él, que una sucursal tome el chat es una asignación puramente
// interna, sin ningún aviso ni re-saludo.
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
    console.log('📡 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — SELECT conversations, filtros: { id:', conversationId, '}, columnas: primera_sucursal_id, waiting_since, created_at');
    const { data: actual, error: actualError } = await supabase
      .from('conversations')
      .select('primera_sucursal_id, waiting_since, created_at')
      .eq('id', conversationId)
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — resultado SELECT conversations — data:', actual, 'error:', actualError);

    // status pasa (o se mantiene) en 'esperando' a propósito: es el único
    // valor de este campo que representa "ya la tiene un humano" en este
    // esquema (ver esBotAutomatico/esDerivado en Sidebar.jsx — la pestaña
    // "BOT" es exactamente status !== 'esperando'). Al interferir un chat
    // que el bot todavía atendía solo (status ej. 'open'), sin esto el
    // status quedaba sin tocar: la conversación pasaba a tener sucursal_id
    // Y seguir contando como "BOT" al mismo tiempo, apareciendo duplicada en
    // dos pestañas a la vez.
    const updates = { status: 'esperando', sucursal_id: sucursalId, devuelta_por_sucursal_id: null, derivado_por_sucursal_id: null, derivado_por_sucursal_nombre: null };
    if (!actual?.primera_sucursal_id) updates.primera_sucursal_id = sucursalId;
    console.log('🔍 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — CAMBIO DE ESTADO — conversationId:', conversationId, 'a tomada por sucursal:', sucursalId, '— updates a aplicar:', updates);

    console.log('📡 [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — UPDATE conversations, filtros: { id:', conversationId, ', status not in:', TERMINAL_STATUSES, ', sucursal_id: null }, valores:', updates);
    const { data: conv, error: updateError } = await supabase
      .from('conversations')
      .update(updates)
      .eq('id', conversationId)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
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

    // Demora Inicial congelada (ver supabase/conversations_demora_inicial.sql):
    // sólo en la PRIMERA toma (sin primera_sucursal_id previo) y sólo si
    // todavía está vacía (.is null), así una devolución + retoma posterior
    // nunca la pisa. Va en un UPDATE aparte y no crítico: si falta correr la
    // migración, falla sólo esta marca y la toma sigue confirmada.
    if (actual && !actual.primera_sucursal_id) {
      const inicioEspera = actual.waiting_since || actual.created_at;
      const demoraInicialMs = inicioEspera ? Math.max(0, Date.now() - new Date(inicioEspera).getTime()) : null;
      if (demoraInicialMs != null) {
        const { error: demoraError } = await supabase
          .from('conversations')
          .update({ demora_inicial_ms: demoraInicialMs })
          .eq('id', conversationId)
          .is('demora_inicial_ms', null);
        if (demoraError) {
          console.error('❌ [DEBUG-SERVICE-TOMACONSULTA] tomarConsulta() — error guardando demora_inicial_ms (no crítico):', demoraError);
        }
      }
    }

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
