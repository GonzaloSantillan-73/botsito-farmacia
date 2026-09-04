-- Tabla genérica de configuración clave/valor para ajustes del sistema (ej: tiempo
-- de expiración de sesiones), editable desde el CRM sin tener que redeployar código.
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on app_settings" ON public.app_settings;
CREATE POLICY "Allow all on app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- Valor inicial: 3 minutos (180000 ms), el mismo límite de prueba que ya estaba
-- hardcodeado. Se puede cambiar después desde el panel de configuración del CRM.
INSERT INTO public.app_settings (key, value) VALUES ('session_timeout_ms', '180000')
ON CONFLICT (key) DO NOTHING;
