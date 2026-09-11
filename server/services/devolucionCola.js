import { supabase } from '../supabase.js';
import { enviarMensajeBot } from './bot.js';
import { sucursalesMasCercanas } from './geolocalizacion.js';

const mensajeDevolucion = (motivo, motivoTexto) => {
  const razon = motivo === 'stock'
    ? 'no contamos con stock disponible para tu pedido en esta sucursal'
    : (motivoTexto?.trim() || 'no pudimos continuar la atención en esta sucursal');

  return `Tu consulta fue retomada por la cola de espera: ${razon}.\n\nEn breve otro asesor se va a poner en contacto contigo. Perdón por la demora. 🙏`;
};

// Un operador que no puede seguir atendiendo (ej. sin stock) devuelve el chat
// a la cola general de "En espera": vuelve a estar disponible para cualquier
// sucursal (se libera sucursal_id), se recalculan las sucursales recomendadas
// EXCLUYENDO a la que lo devolvió (para no volver a sugerirle la misma al
// próximo asesor) y se le avisa al cliente por WhatsApp del motivo.
export const devolverConversacionAEspera = async (conversationId, { motivo, motivoTexto } = {}) => {
  const { data: conv, error: fetchError } = await supabase
    .from('conversations')
    .select('id, client_phone, sucursal_id, client_lat, client_lng')
    .eq('id', conversationId)
    .single();

  if (fetchError || !conv) throw new Error('Conversación no encontrada.');

  const sucursalQueDevuelve = conv.sucursal_id;

  // Sólo tiene sentido recalcular si en su momento se guardó la ubicación del
  // cliente (ver bot.js: manejarUbicacionHumano). Si no la tenía, simplemente
  // no hay recomendaciones que mostrar.
  let sucursalesRecomendadas = [];
  if (conv.client_lat != null && conv.client_lng != null) {
    try {
      sucursalesRecomendadas = await sucursalesMasCercanas(
        conv.client_lat,
        conv.client_lng,
        2,
        sucursalQueDevuelve ? [sucursalQueDevuelve] : []
      );
    } catch (err) {
      // Un fallo acá no debe impedir devolver el chat a la cola.
      console.error('[DEVOLUCION] Error recalculando sucursales cercanas:', err);
    }
  }

  const { error: updateError } = await supabase
    .from('conversations')
    .update({
      status: 'esperando',
      sucursal_id: null,
      waiting_since: new Date().toISOString(),
      sucursales_recomendadas: sucursalesRecomendadas
    })
    .eq('id', conversationId);

  if (updateError) throw updateError;

  if (conv.client_phone) {
    await enviarMensajeBot(conversationId, conv.client_phone, mensajeDevolucion(motivo, motivoTexto));
  }

  return { sucursalesRecomendadas };
};
