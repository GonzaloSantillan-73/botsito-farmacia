import { supabase } from '../supabase.js';
import { sucursalesMasCercanas } from './geolocalizacion.js';
import { formatInternalReason } from './internalNotes.js';
import { registrarUltimoTraspaso } from './ultimoTraspaso.js';

// Un operador que no puede seguir atendiendo (ej. sin stock) devuelve el chat
// a la cola general de "En espera": vuelve a estar disponible para cualquier
// sucursal (se libera sucursal_id) y se recalculan las sucursales
// recomendadas EXCLUYENDO a la que lo devolvió (para no volver a sugerirle la
// misma al próximo asesor). Acción directa, sin ningún dato a completar; a
// propósito, NO se le manda ningún mensaje al cliente: de cara a él, la
// devolución es completamente silenciosa.
export const devolverConversacionAEspera = async (conversationId, razon) => {
  console.log('🔍 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — conversationId:', conversationId, 'razon:', razon);
  try {
    console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — SELECT conversations, filtros: { id:', conversationId, '}, columnas: id, sucursal_id, client_lat, client_lng');
    const { data: conv, error: fetchError } = await supabase
      .from('conversations')
      .select('id, sucursal_id, client_lat, client_lng')
      .eq('id', conversationId)
      .single();
    console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — resultado SELECT conversations — data:', conv, 'error:', fetchError);

    if (fetchError || !conv) {
      console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — conversación no encontrada. fetchError:', fetchError);
      throw new Error('Conversación no encontrada.');
    }

    const sucursalQueDevuelve = conv.sucursal_id;
    console.log('🔍 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — CAMBIO DE ESTADO — sucursal que devuelve la conversación:', sucursalQueDevuelve, '(estado actual de la conversación pasará de tomada por esta sucursal a "esperando" sin sucursal asignada)');

    // Sólo tiene sentido recalcular si en su momento se guardó la ubicación del
    // cliente (ver bot.js: manejarUbicacionHumano). Si no la tenía, simplemente
    // no hay recomendaciones que mostrar.
    let sucursalesRecomendadas = [];
    if (conv.client_lat != null && conv.client_lng != null) {
      try {
        console.log('🔍 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — recalculando sucursales más cercanas con lat:', conv.client_lat, 'lng:', conv.client_lng, 'excluyendo:', sucursalQueDevuelve ? [sucursalQueDevuelve] : [], 'y todo el historial de la conversación:', conversationId);
        sucursalesRecomendadas = await sucursalesMasCercanas(
          conv.client_lat,
          conv.client_lng,
          2,
          sucursalQueDevuelve ? [sucursalQueDevuelve] : [],
          conversationId
        );
        console.log('✅ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — sucursalesRecomendadas calculadas:', sucursalesRecomendadas);
      } catch (err) {
        // Un fallo acá no debe impedir devolver el chat a la cola.
        console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — Error recalculando sucursales cercanas:', err?.message, err?.stack);
        console.error('[DEVOLUCION] Error recalculando sucursales cercanas:', err);
      }
    }

    console.log('🔍 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — CAMBIO DE ESTADO — de "tomada por sucursal', sucursalQueDevuelve, '" a "esperando" (sucursal_id=null), devuelta_por_sucursal_id:', sucursalQueDevuelve || null);
    console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — UPDATE conversations, filtros: { id:', conversationId, '}, valores:', {
      status: 'esperando',
      sucursal_id: null,
      sucursales_recomendadas: sucursalesRecomendadas,
      devuelta_por_sucursal_id: sucursalQueDevuelve || null
    });
    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        status: 'esperando',
        sucursal_id: null,
        // OJO: waiting_since NO se reinicia acá a propósito. El chat ya llevaba
        // esperando desde que el cliente pidió un humano por primera vez, y
        // devolverlo no lo "hace más nuevo" — al contrario, en la bandeja "En
        // espera" (FIFO por waiting_since, ver Sidebar.jsx) tiene que quedar por
        // encima de los chats que recién están entrando.
        sucursales_recomendadas: sucursalesRecomendadas,
        // Queda registrado hasta que otra sucursal la tome (ver tomarConsulta.js),
        // para mostrarle "Devolviste" a esta sucursal y "Devuelta" al resto.
        devuelta_por_sucursal_id: sucursalQueDevuelve || null,
        // Ya no está "recién derivada": vuelve a la cola general, así que esa
        // marca deja de aplicar (queda devuelta_por_sucursal_id en su lugar).
        derivado_por_sucursal_id: null,
        derivado_por_sucursal_nombre: null
      })
      .eq('id', conversationId);
    console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — resultado UPDATE conversations — error:', updateError);

    if (updateError) {
      console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — updateError:', updateError);
      throw updateError;
    }

    // Marca "Devuelto a espera" para la pestaña Global del admin (no crítico).
    await registrarUltimoTraspaso(conversationId, 'devuelto');

    // El motivo es opcional en el modal (ver ReturnToQueueModal.jsx), pero la
    // nota interna se genera SIEMPRE, con "sin especificar" como fallback si
    // vino vacío (ver formatInternalReason en internalNotes.js). Es un
    // sender_type 'system' — no es un mensaje real ni se envía al cliente
    // por WhatsApp, sólo queda registrado en el timeline para operadores.
    let sucursalQueDevuelveNombre = null;
    if (sucursalQueDevuelve) {
      const { data: sucursal, error: sucursalError } = await supabase
        .from('sucursales')
        .select('nombre')
        .eq('id', sucursalQueDevuelve)
        .maybeSingle();
      if (sucursalError) console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — error consultando nombre de sucursal:', sucursalError);
      sucursalQueDevuelveNombre = sucursal?.nombre || null;
    }
    const { error: notaError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'system',
        message_text: formatInternalReason('return', sucursalQueDevuelveNombre, razon),
        media_type: 'text'
      });
    if (notaError) {
      console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — error registrando nota interna de motivo (no crítico):', notaError);
    }

    const resultado = { sucursalesRecomendadas };
    console.log('✅ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — resultado a devolver:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — error:', err?.message, err?.stack);
    throw err;
  }
};
