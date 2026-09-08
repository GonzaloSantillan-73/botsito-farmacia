-- Empleados del CRM, cada uno vinculado obligatoriamente a una sucursal.
-- Igual que admin_users: sin policy "allow all" para anon/authenticated (RLS
-- deniega todo por defecto sin policies) — solo el backend, con la
-- service_role key, puede leer o escribir esta tabla.
CREATE TABLE IF NOT EXISTS public.staff_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    sucursal_id UUID NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.staff_users TO service_role;
