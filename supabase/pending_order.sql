-- Pedido confirmado desde el carrito del bot, pendiente de cargarse en el
-- Cotizador del CRM. El frontend lo lee una vez y lo vuelve a poner en null.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS pending_order JSONB;
