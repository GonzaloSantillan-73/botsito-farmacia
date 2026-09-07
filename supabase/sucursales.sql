-- Sucursales físicas de la farmacia, con su horario de atención, para que el
-- bot pueda responder "4. Horarios y sucursales" en el menú principal y el
-- CRM las administre desde Configuración > Sucursales.
CREATE TABLE IF NOT EXISTS public.sucursales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    direccion TEXT NOT NULL,
    dias INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6}', -- 0=domingo … 6=sábado
    hora_apertura TEXT NOT NULL DEFAULT '09:00',
    hora_cierre TEXT NOT NULL DEFAULT '18:00',
    activo BOOLEAN NOT NULL DEFAULT true,
    orden INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on sucursales" ON public.sucursales;
CREATE POLICY "Allow all on sucursales" ON public.sucursales FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.sucursales TO anon, authenticated, service_role;
