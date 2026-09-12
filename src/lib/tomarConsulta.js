import { supabase } from './supabase';

// Reclama una conversación de la cola general para la propia sucursal. El
// UPDATE queda condicionado a que siga en 'esperando' y sin sucursal
// asignada: si dos sucursales tocan "Tomar" casi al mismo tiempo, sólo la
// primera consulta que llegue a Postgres se la queda (la segunda no matchea
// ninguna fila y devuelve null, ver más abajo). También limpia
// devuelta_por_sucursal_id: esa marca ya no aplica una vez que alguien la toma.
export const tomarConsulta = async (conversationId, sucursalId) => {
  const { data, error } = await supabase
    .from('conversations')
    .update({ sucursal_id: sucursalId, devuelta_por_sucursal_id: null })
    .eq('id', conversationId)
    .eq('status', 'esperando')
    .is('sucursal_id', null)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Esta consulta ya fue tomada por otra sucursal.');
  return data;
};
