import { supabase } from '../supabase.js';

// `sucursalId` es siempre el que sale del JWT verificado (req.admin), nunca
// algo que mande el cliente: es lo que garantiza que una sucursal no pueda
// ver ni tocar las respuestas rápidas de otra.
export const listarRespuestasRapidas = async ({ sucursalId }) => {
  console.log('🔍 [DEBUG-SERVICE-QUICKREPLIES] listarRespuestasRapidas() — sucursalId:', sucursalId);

  let query = supabase.from('quick_replies').select('*').order('shortcut');
  // Admin (sucursalId null) gestiona sólo las globales; una sucursal ve las
  // globales (de sólo lectura para ella) más las suyas propias.
  query = sucursalId
    ? query.or(`sucursal_id.is.null,sucursal_id.eq.${sucursalId}`)
    : query.is('sucursal_id', null);

  const { data, error } = await query;
  console.log('📡 [DEBUG-SERVICE-QUICKREPLIES] Resultado query quick_replies (select) — data:', data, 'error:', error);
  if (error) throw error;

  return data || [];
};

export const crearRespuestaRapida = async ({ shortcut, messageText, sucursalId }) => {
  console.log('🔍 [DEBUG-SERVICE-QUICKREPLIES] crearRespuestaRapida() — parámetros:', { shortcut, messageText, sucursalId });

  const shortcutLimpio = (shortcut || '').trim();
  const textoLimpio = (messageText || '').trim();
  if (!shortcutLimpio || !textoLimpio) {
    throw new Error('Completá el atajo y el mensaje.');
  }

  const { data, error } = await supabase
    .from('quick_replies')
    .insert([{ shortcut: shortcutLimpio, message_text: textoLimpio, sucursal_id: sucursalId || null }])
    .select()
    .single();
  console.log('📡 [DEBUG-SERVICE-QUICKREPLIES] Resultado query quick_replies (insert) — data:', data, 'error:', error);
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una respuesta rápida con ese atajo.');
    throw error;
  }
  return data;
};

// Sólo se puede editar/borrar una fila que pertenezca al ámbito de quien la
// pide: el admin, las globales (sucursal_id null); una sucursal, únicamente
// las suyas. Esto es lo que impide borrar/editar las plantillas globales
// desde una cuenta de sucursal, y las de otra sucursal desde la propia.
const verificarPropiedad = async (id, { role, sucursalId }) => {
  const { data: fila, error } = await supabase.from('quick_replies').select('id, sucursal_id').eq('id', id).maybeSingle();
  console.log('📡 [DEBUG-SERVICE-QUICKREPLIES] verificarPropiedad() — fila:', fila, 'error:', error);
  if (error) throw error;
  if (!fila) throw new Error('La respuesta rápida no existe.');

  const esGlobal = fila.sucursal_id === null;
  const esPropiaDeLaSucursal = sucursalId && fila.sucursal_id === sucursalId;

  if (role === 'admin' && !esGlobal) {
    throw new Error('Esa respuesta rápida pertenece a una sucursal; el administrador no puede editarla ni borrarla.');
  }
  if (role !== 'admin' && !esPropiaDeLaSucursal) {
    throw new Error(esGlobal
      ? 'Las respuestas rápidas globales no se pueden editar ni borrar desde una sucursal.'
      : 'Esa respuesta rápida pertenece a otra sucursal.');
  }
};

export const actualizarRespuestaRapida = async (id, { shortcut, messageText }, { role, sucursalId }) => {
  console.log('🔍 [DEBUG-SERVICE-QUICKREPLIES] actualizarRespuestaRapida() — id:', id, 'shortcut:', shortcut, 'messageText:', messageText, 'role:', role, 'sucursalId:', sucursalId);

  await verificarPropiedad(id, { role, sucursalId });

  const shortcutLimpio = (shortcut || '').trim();
  const textoLimpio = (messageText || '').trim();
  if (!shortcutLimpio || !textoLimpio) {
    throw new Error('Completá el atajo y el mensaje.');
  }

  const { data, error } = await supabase
    .from('quick_replies')
    .update({ shortcut: shortcutLimpio, message_text: textoLimpio })
    .eq('id', id)
    .select()
    .single();
  console.log('📡 [DEBUG-SERVICE-QUICKREPLIES] Resultado query quick_replies (update) — data:', data, 'error:', error);
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una respuesta rápida con ese atajo.');
    throw error;
  }
  return data;
};

export const eliminarRespuestaRapida = async (id, { role, sucursalId }) => {
  console.log('🔍 [DEBUG-SERVICE-QUICKREPLIES] eliminarRespuestaRapida() — id:', id, 'role:', role, 'sucursalId:', sucursalId);

  await verificarPropiedad(id, { role, sucursalId });

  const { error } = await supabase.from('quick_replies').delete().eq('id', id);
  console.log('📡 [DEBUG-SERVICE-QUICKREPLIES] Resultado query quick_replies (delete) — error:', error);
  if (error) throw error;
};
