-- Tabla de productos de farmacia, usada por el bot para responder consultas de precio/stock.
CREATE TABLE IF NOT EXISTS public.productos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    precio NUMERIC(10, 2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on productos" ON public.productos;
CREATE POLICY "Allow all on productos" ON public.productos FOR ALL USING (true) WITH CHECK (true);

-- Columna usada por el bot para saber en qué paso de una sub-conversación está
-- (ej: esperando que el cliente escriba el nombre de un producto a buscar).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS bot_state TEXT;

-- Datos de prueba
INSERT INTO public.productos (nombre, precio, stock) VALUES
    ('Ibuprofeno 400mg x 10 comprimidos', 1850.00, 40),
    ('Ibuprofeno 600mg x 20 comprimidos', 3200.00, 25),
    ('Paracetamol 500mg x 20 comprimidos', 1490.00, 60),
    ('Paracetamol Gotas Pediátricas 100ml', 2100.00, 15),
    ('Aspirina 500mg x 20 comprimidos', 1690.00, 30),
    ('Aspirina Prevent 100mg x 30 comprimidos', 2450.00, 20),
    ('Alplax 0.5mg x 30 comprimidos', 4200.00, 12),
    ('Alplax 1mg x 30 comprimidos', 4800.00, 8),
    ('Amoxicilina 500mg x 8 comprimidos', 3600.00, 18),
    ('Losartan 50mg x 30 comprimidos', 5200.00, 22),
    ('Ibuprofeno Jarabe Pediátrico 120ml', 2300.00, 10),
    ('Alcohol en Gel 500ml', 2800.00, 50),
    ('Omeprazol 20mg x 14 comprimidos', 2950.00, 35),
    ('Vitamina C 1g x 10 comprimidos efervescentes', 1750.00, 45)
ON CONFLICT DO NOTHING;
