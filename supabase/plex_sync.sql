-- Espejo de solo lectura de la API externa "Plex Concentrador" (wsplexcenter):
-- sucursales, catálogo de productos (excluyendo drogas/principios activos) y
-- stock por sucursal. La API externa solo se consulta con GET (nunca se le
-- escribe nada); estas tablas se sincronizan desde el backend con la
-- service_role key y el CRM/bot solo las LEEN.

CREATE TABLE IF NOT EXISTS public.plex_sucursales (
    id_sucursal TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    empresa TEXT,
    cuit TEXT,
    synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plex_productos (
    cod_producto TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    precio NUMERIC,
    id_rubro TEXT,
    id_subrubro TEXT,
    id_laboratorio TEXT,
    codebar TEXT,
    unidades_por_caja INTEGER,
    synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plex_stock (
    id_sucursal TEXT NOT NULL REFERENCES public.plex_sucursales(id_sucursal) ON DELETE CASCADE,
    cod_producto TEXT NOT NULL,
    cajas INTEGER,
    unidades INTEGER,
    minimo INTEGER,
    maximo INTEGER,
    seguridad INTEGER,
    abc TEXT,
    synced_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id_sucursal, cod_producto)
);

ALTER TABLE public.plex_sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plex_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plex_stock ENABLE ROW LEVEL SECURITY;

-- El CRM (con la anon key) solo necesita LEER estas tablas; solo el backend,
-- con la service_role key (que bypassea RLS), puede escribirlas al sincronizar.
DROP POLICY IF EXISTS "Lectura publica de plex_sucursales" ON public.plex_sucursales;
CREATE POLICY "Lectura publica de plex_sucursales" ON public.plex_sucursales FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lectura publica de plex_productos" ON public.plex_productos;
CREATE POLICY "Lectura publica de plex_productos" ON public.plex_productos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lectura publica de plex_stock" ON public.plex_stock;
CREATE POLICY "Lectura publica de plex_stock" ON public.plex_stock FOR SELECT USING (true);

GRANT SELECT ON public.plex_sucursales, public.plex_productos, public.plex_stock TO anon, authenticated;
GRANT ALL ON public.plex_sucursales, public.plex_productos, public.plex_stock TO service_role;
