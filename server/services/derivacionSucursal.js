import { supabase } from '../supabase.js';
import { enviarMensajeBot } from './bot.js';
import { estaAbiertaAhora } from './sucursales.js';

const mensajeDerivacion = (sucursal) => {
  const ubicacion = sucursal?.direccion ? `, ubicada en ${sucursal.direccion}` : '';
  return `Tu consulta fue derivada a la sucursal *${sucursal?.nombre || 'otra sucursal'}*${ubicacion}.\n\nEn breve un asesor de esa sucursal se va a poner en contacto contigo. 🙂`;
};

// Un empleado de sucursal deriva DIRECTAMENTE la conversación que está
// atendiendo a otra sucursal puntual que él elige — a diferencia de
// devolverla a la cola general (ver devolucionCola.js), acá el operador ya
// sabe a quién quiere pasársela. Sólo se puede derivar a una sucursal activa
// y que esté abierta en este momento: el frontend ya la muestra deshabilitada
// en el selector si está cerrada, pero se revalida siempre del lado del
// servidor para no confiar ciegamente en eso.
export const derivarASucursal = async (conversationId, sucursalDestinoId) => {
  console.log('🔍 [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — conversationId:', conversationId, 'sucursalDestinoId:', sucursalDestinoId);
  try {
    console.log('📡 [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — SELECT sucursales, filtros: { id:', sucursalDestinoId, '}');
    const { data: sucursal, error: sucursalError } = await supabase
      .from('sucursales')
      .select('*')
      .eq('id', sucursalDestinoId)
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — resultado SELECT sucursales — data:', sucursal, 'error:', sucursalError);

    if (sucursalError) {
      console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — sucursalError:', sucursalError);
      throw sucursalError;
    }
    if (!sucursal) {
      console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — sucursal no encontrada:', sucursalDestinoId);
      throw new Error('Sucursal no encontrada.');
    }
    if (!sucursal.activo) {
      console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — sucursal apagada:', sucursalDestinoId);
      throw new Error(`La sucursal ${sucursal.nombre} está apagada y no puede recibir consultas.`);
    }
    if (!estaAbiertaAhora(sucursal)) {
      console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — sucursal cerrada en este momento:', sucursalDestinoId);
      throw new Error(`La sucursal ${sucursal.nombre} está cerrada en este momento.`);
    }

    // La sucursal de origen se lee de la propia conversación (nunca de lo que
    // mande el frontend) para que "Derivado de X" sea confiable: es quien la
    // tenía asignada justo antes de este UPDATE.
    console.log('📡 [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — SELECT conversations, filtros: { id:', conversationId, '}, columnas: sucursal_id');
    const { data: convActual, error: convActualError } = await supabase
      .from('conversations')
      .select('sucursal_id')
      .eq('id', conversationId)
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — resultado SELECT conversations (actual) — data:', convActual, 'error:', convActualError);
    if (convActualError) {
      console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — convActualError:', convActualError);
      throw convActualError;
    }

    const sucursalOrigenId = convActual?.sucursal_id || null;
    let sucursalOrigenNombre = null;
    if (sucursalOrigenId) {
      const { data: origen, error: origenError } = await supabase
        .from('sucursales')
        .select('nombre')
        .eq('id', sucursalOrigenId)
        .maybeSingle();
      if (origenError) console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — error consultando sucursal de origen:', origenError);
      sucursalOrigenNombre = origen?.nombre || null;
    }

    console.log('🔍 [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — CAMBIO DE ESTADO — conversationId:', conversationId, 'pasa a estar a cargo de sucursal:', sucursalDestinoId, '(', sucursal.nombre, ') — derivada desde:', sucursalOrigenId, '(', sucursalOrigenNombre, ')');
    const updates = {
      sucursal_id: sucursalDestinoId,
      devuelta_por_sucursal_id: null,
      derivado_por_sucursal_id: sucursalOrigenId,
      derivado_por_sucursal_nombre: sucursalOrigenNombre
    };
    console.log('📡 [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — UPDATE conversations, filtros: { id:', conversationId, '}, valores:', updates);
    const { data: conv, error: updateError } = await supabase
      .from('conversations')
      .update(updates)
      .eq('id', conversationId)
      .select()
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — resultado UPDATE conversations — data:', conv, 'error:', updateError);

    if (updateError) {
      console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — updateError:', updateError);
      throw updateError;
    }
    if (!conv) {
      console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — la conversación no existe:', conversationId);
      throw new Error('La consulta no existe.');
    }

    if (conv.client_phone) {
      console.log('🔍 [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — enviando mensaje de derivación a', conv.client_phone);
      try {
        await enviarMensajeBot(conversationId, conv.client_phone, mensajeDerivacion(sucursal));
      } catch (avisoError) {
        // La derivación (el UPDATE de arriba) ya quedó confirmada en la base:
        // si sólo falla el aviso por WhatsApp, no hay que tirar la operación
        // entera, o el operador ve "no se pudo derivar" cuando en realidad sí
        // se reasignó a la otra sucursal.
        console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — la derivación se guardó pero falló el aviso por WhatsApp:', avisoError?.message, avisoError?.stack);
      }
    }

    console.log('✅ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — resultado a devolver:', conv);
    return conv;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — error:', err?.message, err?.stack);
    throw err;
  }
};
