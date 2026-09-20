import { supabase } from './supabase';

/**
 * Recibe un array de conversaciones, extrae los teléfonos, busca en la tabla `clientes`
 * y devuelve el mismo array pero con un campo `real_name` inyectado.
 */
export const withClientNames = async (conversations) => {
  if (!conversations || conversations.length === 0) {
    return conversations;
  }

  const phones = [...new Set(conversations.map(c => c.client_phone).filter(Boolean))];
  if (phones.length === 0) {
    return conversations;
  }

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('client_phone, nombre_completo')
    .in('client_phone', phones);

  if (error) {
    console.error('❌ [DEBUG-LIB-CLIENTUTILS] Error fetching client names:', error);
    return conversations;
  }

  const phoneMap = {};
  clientes?.forEach(c => {
    if (c.nombre_completo) phoneMap[c.client_phone] = c.nombre_completo;
  });

  const result = conversations.map(c => ({
    ...c,
    real_name: phoneMap[c.client_phone] || null
  }));
  return result;
};

/**
 * Recibe un array de conversaciones e inyecta `sucursales_historial`: la
 * lista COMPLETA y en orden de las sucursales que tomaron o recibieron por
 * derivación cada una (ver server/services/tomaConsulta.js y
 * derivacionSucursal.js, que van registrando cada evento en
 * conversation_sucursal_historial) — a diferencia de sucursal_id/
 * primera_sucursal_id/derivado_por_sucursal_id, que sólo guardan un puñado
 * de puntos sueltos y pierden las sucursales intermedias si hubo varios
 * ciclos de "devolver a la cola" entre medio.
 */
export const withSucursalesHistorial = async (conversations) => {
  if (!conversations || conversations.length === 0) {
    return conversations;
  }

  const ids = conversations.map(c => c.id);
  const { data: eventos, error } = await supabase
    .from('conversation_sucursal_historial')
    .select('conversation_id, sucursal_id, created_at, sucursales(nombre)')
    .in('conversation_id', ids)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ [DEBUG-LIB-CLIENTUTILS] Error fetching sucursales historial:', error);
    return conversations;
  }

  const porConversacion = {};
  (eventos || []).forEach(ev => {
    if (!ev.sucursal_id || !ev.sucursales?.nombre) return;
    const lista = (porConversacion[ev.conversation_id] ||= []);
    // No repite la MISMA sucursal si aparece dos veces seguidas (ej. la tomó,
    // la devolvió y la volvió a tomar ella misma sin que nadie más
    // interviniera en el medio) — sí la repite si hubo otra sucursal en el
    // medio y después volvió a ser la misma.
    if (lista[lista.length - 1]?.id !== ev.sucursal_id) {
      lista.push({ id: ev.sucursal_id, nombre: ev.sucursales.nombre });
    }
  });

  return conversations.map(c => {
    const historial = porConversacion[c.id] || [];
    // Filtro definitivo, hecho acá mismo (no en el momento en que se calculan
    // las recomendadas en el backend): `sucursal_recomendadas` es una
    // "foto" que sólo se recalcula en algunos pasos del ciclo de vida del
    // chat (ver devolverConversacionAEspera en devolucionCola.js) y queda
    // intacta en otros (ej. una derivación directa entre sucursales, ver
    // derivarASucursal en derivacionSucursal.js). Filtrando siempre acá,
    // contra el historial real y completo que se acaba de armar arriba, la
    // tarjeta nunca puede mostrar como "recomendada" a una sucursal que ya
    // está en el historial, sin importar qué tan vieja quedó esa foto.
    const historialIds = new Set(historial.map(h => h.id));
    const recomendadas = Array.isArray(c.sucursales_recomendadas)
      ? c.sucursales_recomendadas.filter(r => !historialIds.has(r.id))
      : c.sucursales_recomendadas;
    return {
      ...c,
      sucursales_historial: historial,
      sucursales_recomendadas: recomendadas
    };
  });
};
