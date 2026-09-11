-- Ubicación que el cliente comparte al pedir hablar con un humano (ya sea por
-- el botón nativo de ubicación de WhatsApp o pegando un link de Google Maps),
-- y las sucursales que el bot le recomendó según esa ubicación (calculadas
-- con la fórmula de Haversine contra sucursales.latitud/longitud). Se guarda
-- en la propia conversación para poder mostrarlo en las tarjetas del CRM.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS client_lat NUMERIC;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS client_lng NUMERIC;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS sucursales_recomendadas JSONB; -- [{ id, nombre, distancia_km }, ...]
