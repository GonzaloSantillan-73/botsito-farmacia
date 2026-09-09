import { supabase } from '../supabase.js';
import { calcularDistanciaKm } from './geo.js';

// Sucursales internas "asignables": tienen que estar activas, vinculadas a
// una sucursal real de Plex (para poder consultar su stock) y con coordenadas
// cargadas (si no, no hay forma de calcular la distancia).
const obtenerSucursalesOrdenadasPorCercania = async (lat, lng) => {
  const { data: sucursales, error } = await supabase
    .from('sucursales')
    .select('id, nombre, plex_id_sucursal, latitud, longitud')
    .eq('activo', true)
    .not('plex_id_sucursal', 'is', null)
    .not('latitud', 'is', null)
    .not('longitud', 'is', null);
  if (error) throw error;

  return (sucursales || [])
    .map(s => ({ ...s, distanciaKm: calcularDistanciaKm(lat, lng, Number(s.latitud), Number(s.longitud)) }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
};

// Verifica que una sucursal (por su id_sucursal de Plex) tenga stock
// suficiente para TODOS los ítems del carrito ("todo o nada"): si falta
// stock de uno solo, la sucursal queda descartada por completo.
const sucursalCubreElPedido = async (idSucursalPlex, itemsCarrito) => {
  const { data: stockRows, error } = await supabase
    .from('plex_stock')
    .select('cod_producto, cajas, unidades')
    .eq('id_sucursal', idSucursalPlex)
    .in('cod_producto', itemsCarrito.map(i => i.cod_producto));
  if (error) throw error;

  const stockPorCodigo = new Map((stockRows || []).map(s => [s.cod_producto, s]));

  return itemsCarrito.every(item => {
    const stock = stockPorCodigo.get(item.cod_producto);
    if (!stock) return false;
    const disponible = (stock.cajas || 0) * (item.unidades_por_caja || 1) + (stock.unidades || 0);
    return disponible >= item.cantidad;
  });
};

// Recorre las sucursales de más cercana a más lejana y devuelve la primera
// que cubra el pedido completo (todos los ítems, con la cantidad pedida).
// Devuelve null si ninguna sucursal cubre el pedido entero.
export const asignarSucursalParaPedido = async (lat, lng, itemsCarrito) => {
  const sucursalesOrdenadas = await obtenerSucursalesOrdenadasPorCercania(lat, lng);

  for (const sucursal of sucursalesOrdenadas) {
    const cubre = await sucursalCubreElPedido(sucursal.plex_id_sucursal, itemsCarrito);
    if (cubre) return sucursal;
  }
  return null;
};
