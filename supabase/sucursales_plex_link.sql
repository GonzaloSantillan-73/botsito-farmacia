-- Vincula cada sucursal interna (la que usan los empleados para loguearse y
-- el bot para horarios/direcciones) con su sucursal real de Plex, y suma
-- coordenadas para poder calcular distancia (Haversine) contra la ubicación
-- que el cliente comparte por WhatsApp. google_maps_url sigue existiendo
-- para el link que se le manda al cliente; latitud/longitud son para el
-- cálculo interno (un link de Maps acortado no siempre trae coordenadas).
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS plex_id_sucursal TEXT REFERENCES public.plex_sucursales(id_sucursal) ON DELETE SET NULL;
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS latitud NUMERIC;
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS longitud NUMERIC;

-- Una sucursal de Plex no puede quedar vinculada a dos sucursales internas
-- distintas al mismo tiempo (índice parcial: no aplica a las que no tengan vínculo).
CREATE UNIQUE INDEX IF NOT EXISTS sucursales_plex_id_sucursal_key
  ON public.sucursales(plex_id_sucursal) WHERE plex_id_sucursal IS NOT NULL;
