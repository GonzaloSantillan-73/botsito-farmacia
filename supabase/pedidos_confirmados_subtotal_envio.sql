-- Desglosa el "total" de cada pedido confirmado en subtotal (neto de
-- descuento) + costo de envío, para poder mostrarlos por separado en la
-- tabla de "Detalle de consultas" de Métricas y en su exportación a Excel.
-- Pedidos confirmados ANTES de esta migración quedan con subtotal/costo_envio
-- en NULL (no hay forma de reconstruirlos retroactivamente); la fila sigue
-- mostrando su "total" igual que siempre, sólo sin el desglose.
ALTER TABLE public.pedidos_confirmados ADD COLUMN IF NOT EXISTS subtotal NUMERIC;
ALTER TABLE public.pedidos_confirmados ADD COLUMN IF NOT EXISTS costo_envio NUMERIC;
