import { supabase } from '../supabase.js';

// Agrega un producto al carrito del cliente. Si ya lo tenía, suma 1 a la cantidad.
export const agregarAlCarrito = async (clientPhone, productId) => {
  const { data: existing, error: fetchError } = await supabase
    .from('cart_items')
    .select('id, quantity')
    .eq('client_phone', clientPhone)
    .eq('product_id', productId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing) {
    const { error } = await supabase.from('cart_items').update({ quantity: existing.quantity + 1 }).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('cart_items').insert([{ client_phone: clientPhone, product_id: productId, quantity: 1 }]);
    if (error) throw error;
  }
};

// Trae el carrito con los datos reales del producto embebidos (nombre, precio),
// consultando el catálogo real sincronizado desde Plex Concentrador.
export const obtenerCarrito = async (clientPhone) => {
  const { data, error } = await supabase
    .from('cart_items')
    .select('id, quantity, plex_productos(cod_producto, nombre, precio, codebar, unidades_por_caja)')
    .eq('client_phone', clientPhone)
    .order('created_at');

  if (error) throw error;
  return data || [];
};

export const eliminarItemCarrito = async (clientPhone, cartItemId) => {
  const { error } = await supabase.from('cart_items').delete().eq('id', cartItemId).eq('client_phone', clientPhone);
  if (error) throw error;
};

export const vaciarCarrito = async (clientPhone) => {
  const { error } = await supabase.from('cart_items').delete().eq('client_phone', clientPhone);
  if (error) throw error;
};

export const calcularTotal = (items) =>
  items.reduce((sum, item) => sum + (Number(item.plex_productos?.precio) || 0) * item.quantity, 0);

export const FREE_SHIPPING_THRESHOLD = 20000;

// Mensaje de envío según qué tan cerca esté el total del umbral de envío gratis,
// para reutilizar en cualquier punto del flujo que muestre el carrito o el resumen.
export const mensajeEnvioGratis = (total) => {
  if (total >= FREE_SHIPPING_THRESHOLD) {
    return `🎉 ¡Felicitaciones! Tu pedido supera los $${FREE_SHIPPING_THRESHOLD.toLocaleString('es-AR')} y tenés envío gratis.`;
  }
  const faltante = FREE_SHIPPING_THRESHOLD - total;
  return `🚚 Te faltan $${faltante.toLocaleString('es-AR')} para obtener envío gratis (a partir de $${FREE_SHIPPING_THRESHOLD.toLocaleString('es-AR')}).`;
};

// Devuelve tanto el texto formateado como los datos crudos, para no tener que
// recalcular el total dos veces en distintos mensajes.
export const formatearCarrito = (items) => {
  const lineas = items.map((item, idx) => {
    return `${idx + 1}. ${item.plex_productos?.nombre || 'Producto'} x${item.quantity} — $${((Number(item.plex_productos?.precio) || 0) * item.quantity).toLocaleString('es-AR')}`;
  });
  const total = calcularTotal(items);
  return { lineas, texto: lineas.join('\n\n'), total, envioGratisTexto: mensajeEnvioGratis(total) };
};
