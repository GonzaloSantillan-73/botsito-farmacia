-- Copia estructurada de cada cotización que un operador arma y envía desde el
-- Cotizador del CRM (ValidationPanel): antes esos datos sólo quedaban como
-- texto plano dentro de `messages`, sin forma de listarlos por cliente. Esta
-- tabla persiste los items (nombre, precio unitario, cantidad, % descuento),
-- los totales y si tuvo envío gratis, para poder mostrar un "Historial de
-- Pedidos" ordenado por fecha en el CRM.
CREATE TABLE IF NOT EXISTS public.pedidos_cotizados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    client_phone TEXT NOT NULL,
    items JSONB NOT NULL, -- [{ nombre, precio_unitario, cantidad, descuento_pct, total_item }]
    subtotal NUMERIC NOT NULL,
    descuento_total NUMERIC NOT NULL DEFAULT 0,
    costo_envio NUMERIC NOT NULL DEFAULT 0,
    envio_gratis BOOLEAN NOT NULL DEFAULT false,
    total NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_cotizados_client_phone ON public.pedidos_cotizados(client_phone);

ALTER TABLE public.pedidos_cotizados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on pedidos_cotizados" ON public.pedidos_cotizados;
CREATE POLICY "Allow all on pedidos_cotizados" ON public.pedidos_cotizados FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.pedidos_cotizados TO anon, authenticated, service_role;
