-- Preferencia de tema (claro/oscuro) por cuenta: cada admin/empleado guarda
-- la suya propia, así que dos sucursales (o el admin) pueden tener el CRM en
-- modos distintos sin pisarse entre sí, incluso si comparten la misma
-- computadora del mostrador.
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark'));
ALTER TABLE public.staff_users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark'));
