-- Ficha del cliente: datos personales que el bot recolecta la primera vez
-- que un cliente escribe (o cuando elige "Actualizar mis datos" desde el
-- menú), más las observaciones internas que carga el operador humano desde
-- el CRM. Se vincula por client_phone (no por conversación), para que
-- persista sin importar cuántas conversaciones distintas tenga ese cliente.
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_phone TEXT NOT NULL UNIQUE,
    nombre_completo TEXT,
    dni TEXT,
    obra_social TEXT,
    notas_operador TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on clientes" ON public.clientes;
CREATE POLICY "Allow all on clientes" ON public.clientes FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.clientes TO anon, authenticated, service_role;
