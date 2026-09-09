import { supabase } from '../supabase.js';
import { getSucursalStockPorDefecto } from './appConfig.js';

// Búsqueda flexible por nombre (parcial, sin distinguir mayúsculas/minúsculas)
// o por código de barra exacto, contra el catálogo REAL sincronizado desde
// Plex Concentrador. El catálogo local ya excluye cualquier subrubro de
// drogas/principios activos desde la sincronización (ver plexSync.js), así
// que acá no hace falta filtrar nada más.
export const buscarProductos = async (texto) => {
  const query = texto.trim();
  if (!query) return { data: [], error: null };

  const { data: productos, error } = await supabase
    .from('plex_productos')
    .select('cod_producto, nombre, precio, codebar, unidades_por_caja')
    .or(`nombre.ilike.%${query}%,codebar.eq.${query}`)
    .order('nombre')
    .limit(5);

  if (error || !productos || productos.length === 0) {
    return { data: productos || [], error };
  }

  const conStock = await agregarStockDisponible(productos);
  return { data: conStock, error: null };
};

// Suma, para cada producto, las unidades reales disponibles (cajas*unidades
// por caja + sueltas) en la sucursal configurada como referencia de stock.
// `stockDisponible` queda en null si todavía no hay una sucursal configurada
// (para poder distinguir "sin stock" de "no sabemos todavía").
export const agregarStockDisponible = async (productos) => {
  const idSucursal = await getSucursalStockPorDefecto();
  if (!idSucursal) {
    return productos.map(p => ({ ...p, stockDisponible: null }));
  }

  const { data: stockRows, error } = await supabase
    .from('plex_stock')
    .select('cod_producto, cajas, unidades')
    .eq('id_sucursal', idSucursal)
    .in('cod_producto', productos.map(p => p.cod_producto));

  if (error) {
    console.error('[PRODUCTOS] Error consultando stock real:', error);
    return productos.map(p => ({ ...p, stockDisponible: null }));
  }

  const stockPorCodigo = new Map((stockRows || []).map(s => [s.cod_producto, s]));
  return productos.map(p => {
    const s = stockPorCodigo.get(p.cod_producto);
    const unidadesPorCaja = p.unidades_por_caja || 1;
    const stockDisponible = s ? (s.cajas || 0) * unidadesPorCaja + (s.unidades || 0) : 0;
    return { ...p, stockDisponible };
  });
};
