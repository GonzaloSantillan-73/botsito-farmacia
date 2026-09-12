-- Medio de pago elegido al confirmar el pago desde OrderStatusPanel (Efectivo,
-- Transferencia, Tarjeta, Mercado Pago, etc.). Se usa en la nueva tabla de
-- detalle de "Métricas y Estadísticas" y en su exportación a CSV.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS payment_method TEXT;
