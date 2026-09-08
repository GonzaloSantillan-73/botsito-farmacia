-- Resultado final de la gestión comercial, marcado manualmente por el
-- vendedor desde el CRM (botones "Venta Concretada" / "Venta No Concretada").
-- Vive en conversations porque es 1:1 con la consulta activa, y NUNCA toca
-- `status`: marcar el resultado de la venta no cierra ni finaliza el chat.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS sale_status TEXT; -- 'concretada' | 'no_concretada'
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS sale_amount NUMERIC; -- monto cotizado al momento de marcar la venta como concretada
