-- Histórico de pedidos confirmados desde el carrito del bot. cart_items se
-- vacía y conversations.pending_order se limpia apenas el operador lo carga
-- al Cotizador, así que ninguna de esas dos tablas sirve para métricas
-- históricas de ventas: esta tabla registra una copia permanente de cada
-- pedido en el momento exacto en que se confirma.
CREATE TABLE IF NOT EXISTS public.pedidos_confirmados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    client_phone TEXT NOT NULL,
    items JSONB NOT NULL, -- [{ product_id, nombre, cantidad, precio_unitario, subtotal }]
    total NUMERIC NOT NULL,
    confirmed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pedidos_confirmados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on pedidos_confirmados" ON public.pedidos_confirmados;
CREATE POLICY "Allow all on pedidos_confirmados" ON public.pedidos_confirmados FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.pedidos_confirmados TO anon, authenticated, service_role;
