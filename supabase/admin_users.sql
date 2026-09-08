-- Credenciales del administrador del CRM. A diferencia del resto de las
-- tablas del proyecto, esta NO tiene una política "allow all" para
-- anon/authenticated: las credenciales solo deben leerse/escribirse desde
-- el backend (con la service_role key), nunca directo desde el navegador.
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Ninguna policy para anon/authenticated a propósito (RLS deniega todo por
-- defecto sin policies). Solo el service_role (usado por el backend) puede
-- leer o escribir esta tabla.
GRANT ALL ON public.admin_users TO service_role;

-- Usuario administrador inicial: admin / admin123 (hash bcrypt de esa
-- contraseña, ya generado). Cambiala apenas entres por primera vez desde
-- Configuración > Administrador.
INSERT INTO public.admin_users (username, password_hash)
VALUES ('admin', '$2b$10$mD7uL8Kg3z0VR.5120zt7uIGBfDqntRLJsxUPr/dUajV8gPI6GNA.')
ON CONFLICT (username) DO NOTHING;
