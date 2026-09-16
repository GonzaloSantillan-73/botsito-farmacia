-- Permite marcar manualmente un mensaje con adjunto del cliente como "el"
-- comprobante de pago o "la" receta oficial de la conversación, en vez de
-- adivinarlo heurísticamente (último archivo de imagen/pdf que mandó el
-- cliente), que fallaba cuando mandaba más de un archivo.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS tagged_as TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_tagged_as_check'
  ) THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_tagged_as_check
      CHECK (tagged_as IS NULL OR tagged_as IN ('comprobante', 'receta'));
  END IF;
END $$;
