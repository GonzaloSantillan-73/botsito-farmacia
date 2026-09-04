import { supabase } from '../supabase.js';

// Búsqueda flexible por nombre (coincidencia parcial, sin distinguir mayúsculas/minúsculas).
export const buscarProductos = async (texto) => {
  const query = texto.trim();
  if (!query) return { data: [], error: null };

  const { data, error } = await supabase
    .from('productos')
    .select('nombre, precio, stock')
    .ilike('nombre', `%${query}%`)
    .order('nombre')
    .limit(5);

  return { data: data || [], error };
};
