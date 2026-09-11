-- Satisfacción con el producto recibido (1 a 5), independiente de `rating`
-- (que mide la atención). El bot la pregunta como segundo paso de la encuesta,
-- después de la calificación de atención (ver server/services/ratingSurvey.js).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS product_rating INTEGER;

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_product_rating_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_product_rating_check
  CHECK (product_rating IS NULL OR (product_rating >= 1 AND product_rating <= 5));
