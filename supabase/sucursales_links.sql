-- Enlaces por sucursal: link de Google Maps (para el mensaje del bot y el
-- botón "Ver en mapa" del CRM) y WhatsApp institucional de esa sucursal
-- (para el botón directo del operador en el CRM).
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS whatsapp_url TEXT;
