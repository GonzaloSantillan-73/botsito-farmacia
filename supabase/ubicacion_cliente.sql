-- Ubicación guardada en la ficha del cliente: la sucursal marca un mensaje
-- de ubicación del chat (la ubicación de WhatsApp o un link de Google Maps)
-- con "Marcar como ubicación" y queda en la ficha con "Ver en mapa", para
-- preguntarle al cliente si el envío va ahí. Una sola por cliente: la nueva
-- reemplaza a la anterior.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS ubicacion_lat NUMERIC;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS ubicacion_lng NUMERIC;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS ubicacion_label TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS ubicacion_message_id UUID;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS ubicacion_at TIMESTAMPTZ;

-- Nueva marca 'ubicacion' para los mensajes (además de comprobante y receta).
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_tagged_as_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_tagged_as_check
    CHECK (tagged_as IS NULL OR tagged_as IN ('comprobante', 'receta', 'ubicacion'));
