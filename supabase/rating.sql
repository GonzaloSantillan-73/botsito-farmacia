-- Calificación de satisfacción (1 a 5) que el cliente responde tras finalizar una consulta.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS rating INTEGER;

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_rating_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_rating_check
  CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
