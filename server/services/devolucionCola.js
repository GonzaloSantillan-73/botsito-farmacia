import { supabase } from '../supabase.js';
import { sucursalesMasCercanas } from './geolocalizacion.js';

// Un operador que no puede seguir atendiendo (ej. sin stock) devuelve el chat
// a la cola general de "En espera": vuelve a estar disponible para cualquier
// sucursal (se libera sucursal_id) y se recalculan las sucursales
// recomendadas EXCLUYENDO a la que lo devolvió (para no volver a sugerirle la
// misma al próximo asesor). A propósito, NO se le manda ningún mensaje al
// cliente: de cara a él, la devolución es completamente silenciosa. El
// motivo es opcional y sólo para uso interno del operador (se anexa a
// notas_operador si lo escribió, sin pisar lo que ya hubiera anotado ahí).
export const devolverConversacionAEspera = async (conversationId, { motivoTexto } = {}) => {
  console.log('🔍 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — conversationId:', conversationId, 'motivoTexto:', motivoTexto);
  try {
    console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — SELECT conversations, filtros: { id:', conversationId, '}, columnas: id, client_phone, sucursal_id, client_lat, client_lng, notas_operador');
    const { data: conv, error: fetchError } = await supabase
      .from('conversations')
      .select('id, client_phone, sucursal_id, client_lat, client_lng, notas_operador')
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
        console.log('🔍 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — recalculando sucursales más cercanas con lat:', conv.client_lat, 'lng:', conv.client_lng, 'excluyendo:', sucursalQueDevuelve ? [sucursalQueDevuelve] : []);
        sucursalesRecomendadas = await sucursalesMasCercanas(
          conv.client_lat,
          conv.client_lng,
          2,
          sucursalQueDevuelve ? [sucursalQueDevuelve] : []
        );
        console.log('✅ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — sucursalesRecomendadas calculadas:', sucursalesRecomendadas);
      } catch (err) {
        // Un fallo acá no debe impedir devolver el chat a la cola.
        console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — Error recalculando sucursales cercanas:', err?.message, err?.stack);
        console.error('[DEVOLUCION] Error recalculando sucursales cercanas:', err);
      }
    }

    // Motivo opcional: se anexa a las notas internas de la conversación (sin
    // pisar lo que el operador ya hubiera anotado ahí desde ClientNotesPanel),
    // nunca se le informa nada de esto al cliente.
    const motivoLimpio = motivoTexto?.trim();
    let notasActualizadas = conv.notas_operador || null;
    if (motivoLimpio) {
      const linea = `[Devuelta a la cola] ${motivoLimpio}`;
      notasActualizadas = notasActualizadas ? `${notasActualizadas}\n${linea}` : linea;
    }

    console.log('🔍 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — CAMBIO DE ESTADO — de "tomada por sucursal', sucursalQueDevuelve, '" a "esperando" (sucursal_id=null), devuelta_por_sucursal_id:', sucursalQueDevuelve || null);
    console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — UPDATE conversations, filtros: { id:', conversationId, '}, valores:', {
      status: 'esperando',
      sucursal_id: null,
      sucursales_recomendadas: sucursalesRecomendadas,
      devuelta_por_sucursal_id: sucursalQueDevuelve || null,
      notas_operador: notasActualizadas
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
        derivado_por_sucursal_nombre: null,
        notas_operador: notasActualizadas
      })
      .eq('id', conversationId);
    console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — resultado UPDATE conversations — error:', updateError);

    if (updateError) {
      console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — updateError:', updateError);
      throw updateError;
    }

    const resultado = { sucursalesRecomendadas };
    console.log('✅ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — resultado a devolver:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — error:', err?.message, err?.stack);
    throw err;
  }
};
