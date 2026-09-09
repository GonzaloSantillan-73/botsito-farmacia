-- El carrito del bot pasa a referenciar el catálogo REAL sincronizado desde
-- Plex Concentrador (plex_productos) en vez de la tabla de productos
-- simulados ("productos"). Como cambia el tipo de dato del identificador
-- (UUID -> TEXT, el codproducto de Plex), vaciamos el carrito viejo: los ids
-- guardados hasta ahora de todos modos ya no existen en el catálogo real.
DELETE FROM public.cart_items;

ALTER TABLE public.cart_items DROP CONSTRAINT IF EXISTS cart_items_product_id_fkey;
ALTER TABLE public.cart_items ALTER COLUMN product_id TYPE TEXT USING product_id::text;
ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.plex_productos(cod_producto) ON DELETE CASCADE;

-- Nota: la tabla "productos" (catálogo simulado) queda sin uso en la app a
-- partir de ahora. No se borra acá por seguridad (no es destructivo dejarla),
-- pero puede eliminarse manualmente más adelante si se confirma que no hace falta.
