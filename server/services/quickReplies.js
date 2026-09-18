import { supabase } from '../supabase.js';

// Las respuestas rápidas son todas globales: cualquier cuenta autenticada
// (admin o staff) las ve y las usa en el chat, pero sólo el admin puede
// crearlas/editarlas/borrarlas (ver requireAdminRole en server/routes/
// quickReplies.js). Ya no existe el concepto de "respuesta rápida propia de
// una sucursal": las filas viejas con sucursal_id siguen existiendo en la
// base pero se listan y gestionan igual que cualquier otra.
export const listarRespuestasRapidas = async () => {
  console.log('🔍 [DEBUG-SERVICE-QUICKREPLIES] listarRespuestasRapidas() — sin parámetros');

  const { data, error } = await supabase.from('quick_replies').select('*').order('shortcut');
  console.log('📡 [DEBUG-SERVICE-QUICKREPLIES] Resultado query quick_replies (select) — data:', data, 'error:', error);
  if (error) throw error;

  return data || [];
};

export const crearRespuestaRapida = async ({ shortcut, messageText }) => {
  console.log('🔍 [DEBUG-SERVICE-QUICKREPLIES] crearRespuestaRapida() — parámetros:', { shortcut, messageText });

  const shortcutLimpio = (shortcut || '').trim();
  const textoLimpio = (messageText || '').trim();
  if (!shortcutLimpio || !textoLimpio) {
    throw new Error('Completá el atajo y el mensaje.');
  }

  const { data, error } = await supabase
    .from('quick_replies')
    .insert([{ shortcut: shortcutLimpio, message_text: textoLimpio }])
    .select()
    .single();
  console.log('📡 [DEBUG-SERVICE-QUICKREPLIES] Resultado query quick_replies (insert) — data:', data, 'error:', error);
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una respuesta rápida con ese atajo.');
    throw error;
  }
  return data;
};

export const actualizarRespuestaRapida = async (id, { shortcut, messageText }) => {
  console.log('🔍 [DEBUG-SERVICE-QUICKREPLIES] actualizarRespuestaRapida() — id:', id, 'shortcut:', shortcut, 'messageText:', messageText);

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

export const eliminarRespuestaRapida = async (id) => {
  console.log('🔍 [DEBUG-SERVICE-QUICKREPLIES] eliminarRespuestaRapida() — id:', id);

  const { error } = await supabase.from('quick_replies').delete().eq('id', id);
  console.log('📡 [DEBUG-SERVICE-QUICKREPLIES] Resultado query quick_replies (delete) — error:', error);
  if (error) throw error;
};
