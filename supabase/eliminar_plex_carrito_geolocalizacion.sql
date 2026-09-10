-- OPCIONAL — correr a mano en el SQL Editor de Supabase solo si querés borrar
-- físicamente los datos de Plex/carrito/geolocalización (ya no los usa el
-- código desde este commit). No es necesario para que la app funcione: si no
-- lo corrés, estas tablas/columnas quedan ahí sin uso, sin romper nada.
--
-- ADVERTENCIA: DROP TABLE borra los datos para siempre. Si tenés dudas,
-- hacé un backup antes (Supabase > Database > Backups) o simplemente no
-- corras este script.

-- La limpieza de las tablas/columnas de Plex (plex_stock, plex_productos,
-- plex_sucursales, sucursales.plex_id_sucursal) vive en purga_plex.sql.
-- latitud/longitud NO se tocan acá: ahora son coordenadas propias, cargadas a
-- mano desde el panel de Administración, sin ninguna relación con Plex.

-- Carrito del bot y catálogo simulado viejo (pre-Plex)
DROP TABLE IF EXISTS public.cart_items;
DROP TABLE IF EXISTS public.productos;

-- Histórico de pedidos confirmados desde el carrito (si te interesa
-- conservarlo como registro histórico de ventas, no corras esta línea)
-- DROP TABLE IF EXISTS public.pedidos_confirmados;

-- Columnas que quedaron sin escritor una vez removido el flujo de carrito
ALTER TABLE public.conversations DROP COLUMN IF EXISTS pending_order;

-- Configuración de sucursal de referencia para stock (solo la usaba el Plex viejo)
DELETE FROM public.app_settings WHERE key = 'plex_sucursal_stock_default';
