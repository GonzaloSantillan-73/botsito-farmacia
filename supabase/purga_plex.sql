-- Purga definitiva de "Sincronización Plex" en Supabase.
-- Correr a mano en el SQL Editor de Supabase. Es idempotente (podés
-- ejecutarlo más de una vez sin error) y usa CASCADE solo donde hace falta
-- para no fallar si quedó alguna FK vieja apuntando a estas tablas.
--
-- ADVERTENCIA: DROP TABLE borra los datos para siempre. Si tenés dudas, hacé
-- un backup antes (Supabase > Database > Backups).

-- 1) Asegurar que las coordenadas propias de cada sucursal existen. Son
--    columnas propias (cargadas a mano desde el panel de Administración),
--    sin relación con Plex.
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS latitud NUMERIC;
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS longitud NUMERIC;

-- 2) Quitar el vínculo de la sucursal interna con su sucursal espejo de Plex.
DROP INDEX IF EXISTS public.sucursales_plex_id_sucursal_key;
ALTER TABLE public.sucursales DROP COLUMN IF EXISTS plex_id_sucursal;

-- 3) Eliminar las tablas espejo de Plex Concentrador (catálogo, stock,
--    sucursales). CASCADE se lleva puesta cualquier FK vieja que todavía
--    dependa de ellas (por ejemplo cart_items.product_id, si esa tabla
--    sigue existiendo).
DROP TABLE IF EXISTS public.plex_stock CASCADE;
DROP TABLE IF EXISTS public.plex_productos CASCADE;
DROP TABLE IF EXISTS public.plex_sucursales CASCADE;

-- 4) Limpiar configuración huérfana que solo usaba la sincronización de Plex.
DELETE FROM public.app_settings WHERE key = 'plex_sucursal_stock_default';
