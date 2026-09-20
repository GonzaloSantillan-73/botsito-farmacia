import { supabase } from '../supabase.js';
import { estaAbiertaAhora } from './sucursales.js';

// Un empleado de sucursal deriva DIRECTAMENTE la conversación que está
// atendiendo a otra sucursal puntual que él elige — a diferencia de
// devolverla a la cola general (ver devolucionCola.js), acá el operador ya
// sabe a quién quiere pasársela. Sólo se puede derivar a una sucursal activa
// y que esté abierta en este momento: el frontend ya la muestra deshabilitada
// en el selector si está cerrada, pero se revalida siempre del lado del
// servidor para no confiar ciegamente en eso.
export const derivarASucursal = async (conversationId, sucursalDestinoId, razon) => {
  console.log('🔍 [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — conversationId:', conversationId, 'sucursalDestinoId:', sucursalDestinoId, 'razon:', razon);
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

    // A propósito, NO se le manda ningún aviso al cliente por esta derivación:
    // de cara a él, la atención tiene que sentirse continua y unificada bajo
    // una sola marca, sin ningún rastro de que la consulta cambió de mano
    // entre sucursales (ni el nombre de la sucursal, ni que hubo un cambio).

    // Registro histórico (ver conversation_sucursal_historial.sql): un fallo
    // acá no debe tirar abajo la derivación, que ya quedó confirmada arriba.
    const { error: histError } = await supabase
      .from('conversation_sucursal_historial')
      .insert({ conversation_id: conversationId, sucursal_id: sucursalDestinoId });
    if (histError) {
      console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — error registrando historial de sucursal (no crítico):', histError);
    }

    // Motivo opcional: sólo genera la nota interna si el operador escribió
    // algo (ver ReturnToQueueModal.jsx). Es un sender_type 'system' — no es
    // un mensaje real ni se envía al cliente por WhatsApp (eso requiere una
    // llamada explícita a la API de Meta, que acá nunca se hace), sólo queda
    // registrado en el timeline del chat para que lo vean los operadores.
    const razonLimpia = razon?.trim();
    if (razonLimpia) {
      const origenTexto = sucursalOrigenNombre || 'Una sucursal';
      const { error: notaError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_type: 'system',
          message_text: `${origenTexto} te pasó el chat por: ${razonLimpia}`,
          media_type: 'text'
        });
      if (notaError) {
        console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — error registrando nota interna de motivo (no crítico):', notaError);
      }
    }

    console.log('✅ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — resultado a devolver:', conv);
    return conv;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-DERIVACIONSUCURSAL] derivarASucursal() — error:', err?.message, err?.stack);
    throw err;
  }
};
