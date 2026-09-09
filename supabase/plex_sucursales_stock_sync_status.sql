-- Resultado de la última sincronización de stock (individual o dentro de un
-- "sincronizar todas") para esta sucursal de Plex. Permite que el panel de
-- Sucursales marque "No disponible" a una sucursal cuyo stock no se pudo
-- traer, sin depender de que el admin esté mirando el panel de sincronización
-- en el momento exacto del fallo.
ALTER TABLE public.plex_sucursales ADD COLUMN IF NOT EXISTS last_stock_sync_ok BOOLEAN;
ALTER TABLE public.plex_sucursales ADD COLUMN IF NOT EXISTS last_stock_sync_error TEXT;
ALTER TABLE public.plex_sucursales ADD COLUMN IF NOT EXISTS last_stock_sync_at TIMESTAMPTZ;
