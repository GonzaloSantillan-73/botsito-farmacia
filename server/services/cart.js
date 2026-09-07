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

// Trae el carrito con los datos del producto embebidos (nombre, precio).
export const obtenerCarrito = async (clientPhone) => {
  const { data, error } = await supabase
    .from('cart_items')
    .select('id, quantity, productos(id, nombre, precio, stock)')
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
  items.reduce((sum, item) => sum + (Number(item.productos?.precio) || 0) * item.quantity, 0);

// Devuelve tanto el texto formateado como los datos crudos, para no tener que
// recalcular el total dos veces en distintos mensajes.
export const formatearCarrito = (items) => {
  const lineas = items.map((item, idx) =>
    `${idx + 1}. ${item.productos?.nombre || 'Producto'} x${item.quantity} — $${((Number(item.productos?.precio) || 0) * item.quantity).toLocaleString('es-AR')}`
  );
  const total = calcularTotal(items);
  return { lineas, texto: lineas.join('\n'), total };
};
