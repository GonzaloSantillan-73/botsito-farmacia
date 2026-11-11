-- Corrección manual de la venta de una consulta, hecha por el administrador
-- desde el bloque "Venta" de los datos de la consulta (Métricas o Directorio).
-- Sirve para las ventas en las que la sucursal no usó el Cotizador o marcó
-- mal el resultado.
--
-- Cuando venta_editada_at tiene fecha, la venta de esa consulta sale de
-- conversations (sale_status, sale_amount = total, sale_subtotal,
-- sale_envio, payment_method) y los pedidos del Cotizador de esa consulta
-- NO se suman en Métricas (no se borran: quedan en pedidos_confirmados).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS sale_subtotal NUMERIC;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS sale_envio NUMERIC;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS venta_editada_at TIMESTAMPTZ;
