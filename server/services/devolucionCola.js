import { supabase } from '../supabase.js';
import { enviarMensajeBot } from './bot.js';
import { sucursalesMasCercanas } from './geolocalizacion.js';

const mensajeDevolucion = (motivo, motivoTexto, sucursal) => {
  const razon = motivo === 'stock'
    ? 'no contamos con stock disponible para tu pedido en esta sucursal'
    : (motivoTexto?.trim() || 'no pudimos continuar la atención en esta sucursal');

  const ubicacion = sucursal?.direccion ? ` (${sucursal.direccion})` : '';
  const origen = sucursal?.nombre
    ? `La sucursal *${sucursal.nombre}*${ubicacion} te devolvió a la cola de espera: ${razon}.`
    : `Tu consulta fue retomada por la cola de espera: ${razon}.`;

  return `${origen}\n\nEn breve otro asesor se va a poner en contacto contigo. Perdón por la demora. 🙏`;
};

// Un operador que no puede seguir atendiendo (ej. sin stock) devuelve el chat
// a la cola general de "En espera": vuelve a estar disponible para cualquier
// sucursal (se libera sucursal_id), se recalculan las sucursales recomendadas
// EXCLUYENDO a la que lo devolvió (para no volver a sugerirle la misma al
// próximo asesor) y se le avisa al cliente por WhatsApp del motivo.
export const devolverConversacionAEspera = async (conversationId, { motivo, motivoTexto } = {}) => {
  console.log('🔍 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — conversationId:', conversationId, 'motivo:', motivo, 'motivoTexto:', motivoTexto);
  try {
    console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — SELECT conversations, filtros: { id:', conversationId, '}, columnas: id, client_phone, sucursal_id, client_lat, client_lng');
    const { data: conv, error: fetchError } = await supabase
      .from('conversations')
      .select('id, client_phone, sucursal_id, client_lat, client_lng')
      .eq('id', conversationId)
      .single();
    console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — resultado SELECT conversations — data:', conv, 'error:', fetchError);

    if (fetchError || !conv) {
      console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — conversación no encontrada. fetchError:', fetchError);
      throw new Error('Conversación no encontrada.');
    }

    const sucursalQueDevuelve = conv.sucursal_id;
    console.log('🔍 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — CAMBIO DE ESTADO — sucursal que devuelve la conversación:', sucursalQueDevuelve, '(estado actual de la conversación pasará de tomada por esta sucursal a "esperando" sin sucursal asignada)');

    // Se usa tanto para el mensaje ("qué sucursal te devolvió y dónde queda")
    // como para excluirla del recálculo de recomendadas más abajo.
    let sucursalInfo = null;
    if (sucursalQueDevuelve) {
      console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — SELECT sucursales, filtros: { id:', sucursalQueDevuelve, '}, columnas: nombre, direccion');
      const { data, error: sucursalInfoError } = await supabase
        .from('sucursales')
        .select('nombre, direccion')
        .eq('id', sucursalQueDevuelve)
        .maybeSingle();
      console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — resultado SELECT sucursales — data:', data, 'error:', sucursalInfoError);
      sucursalInfo = data;
    }

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
        devuelta_por_sucursal_id: sucursalQueDevuelve || null
      })
      .eq('id', conversationId);
    console.log('📡 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — resultado UPDATE conversations — error:', updateError);

    if (updateError) {
      console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — updateError:', updateError);
      throw updateError;
    }

    if (conv.client_phone) {
      console.log('🔍 [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — enviando mensaje de devolución a', conv.client_phone);
      await enviarMensajeBot(conversationId, conv.client_phone, mensajeDevolucion(motivo, motivoTexto, sucursalInfo));
    }

    const resultado = { sucursalesRecomendadas };
    console.log('✅ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — resultado a devolver:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-DEVOLUCIONCOLA] devolverConversacionAEspera() — error:', err?.message, err?.stack);
    throw err;
  }
};
