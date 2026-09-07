-- Carrito de compras por cliente (uno o varios productos, con cantidad).
CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_phone TEXT NOT NULL,
    product_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (client_phone, product_id)
);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on cart_items" ON public.cart_items;
CREATE POLICY "Allow all on cart_items" ON public.cart_items FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.cart_items TO anon, authenticated, service_role;

-- Espacio de contexto genérico para que el bot recuerde datos entre pasos de un
-- mismo flujo (ej: qué productos se mostraron en la última búsqueda), sin tener
-- que volver a consultarlos ni forzar todo dentro del texto de bot_state.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS bot_context JSONB;
