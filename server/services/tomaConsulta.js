import { supabase } from '../supabase.js';
import { enviarMensajeBot } from './bot.js';

const mensajeConsultaTomada = (sucursal) => {
  const ubicacion = sucursal?.direccion ? `, ubicada en ${sucursal.direccion}` : '';
  return `¡Buenas noticias! 🎉 Tu consulta va a ser atendida por la sucursal *${sucursal?.nombre || 'nuestro equipo'}*${ubicacion}.\n\nEn breve un asesor se va a poner en contacto contigo. 🙂`;
};

// Un empleado de sucursal reclama una conversación de la cola general. El
// UPDATE queda condicionado a que siga en 'esperando' y sin sucursal
// asignada: si dos sucursales tocan "Tomar" casi al mismo tiempo, sólo la
// primera consulta que llegue a Postgres se la queda (la segunda no matchea
// ninguna fila y tira error). También limpia devuelta_por_sucursal_id: esa
// marca ya no aplica una vez que alguien la toma. Al confirmarse, le avisa
// al cliente por WhatsApp qué sucursal lo va a atender y dónde queda.
export const tomarConsulta = async (conversationId, sucursalId) => {
  const { data: sucursal, error: sucursalError } = await supabase
    .from('sucursales')
    .select('id, nombre, direccion')
    .eq('id', sucursalId)
    .maybeSingle();
  if (sucursalError) throw sucursalError;
  if (!sucursal) throw new Error('Sucursal no encontrada.');

  // primera_sucursal_id no se pisa nunca: solo se completa la primera vez que
  // alguien toma la consulta, para poder saber después (aunque haya habido
  // una devolución y otra sucursal la haya retomado) si intervino una sola
  // sucursal o dos.
  const { data: actual } = await supabase
    .from('conversations')
    .select('primera_sucursal_id')
    .eq('id', conversationId)
    .maybeSingle();

  const updates = { sucursal_id: sucursalId, devuelta_por_sucursal_id: null };
  if (!actual?.primera_sucursal_id) updates.primera_sucursal_id = sucursalId;

  const { data: conv, error: updateError } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', conversationId)
    .eq('status', 'esperando')
    .is('sucursal_id', null)
    .select()
    .maybeSingle();

  if (updateError) throw updateError;
  if (!conv) throw new Error('Esta consulta ya fue tomada por otra sucursal.');

  if (conv.client_phone) {
    await enviarMensajeBot(conversationId, conv.client_phone, mensajeConsultaTomada(sucursal));
  }

  return conv;
};
