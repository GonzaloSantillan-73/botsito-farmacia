-- Estado manual de pago y entrega, gestionado por el vendedor desde el CRM
-- una vez que el bot deriva el pedido armado desde el carrito. Vive en
-- conversations porque es 1:1 con la consulta activa del cliente.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS payment_status TEXT; -- 'pendiente' | 'confirmado'
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS order_status TEXT;   -- 'armando' | 'enviado'

-- Plantillas de respuesta rápida para el flujo de pago/entrega, para que el
-- vendedor las dispare con un solo clic desde el nuevo panel "Estado del
-- Pedido" (o manualmente desde el chat escribiendo el atajo).
INSERT INTO public.quick_replies (shortcut, message_text) VALUES
    ('/cbu', 'Para confirmar tu pedido, podés transferir a nuestro CBU: 0000000000000000000000, Alias: FARMACIA.PAGO. Cuando hagas la transferencia, envianos el comprobante por acá. 🙂'),
    ('/pagook', '✅ ¡Recibimos tu pago! Ya estamos preparando tu pedido.'),
    ('/armando', '📦 Estamos armando tu pedido. Te avisamos apenas esté listo para el envío.'),
    ('/enviado', '🚚 ¡Tu pedido ya salió! En breve debería llegar a tu domicilio.'),
    ('/demora', '⚠️ Puede que tu pedido demore un poco más de lo esperado. Ante cualquier inconveniente, escribinos por acá y te ayudamos enseguida.')
ON CONFLICT (shortcut) DO NOTHING;
