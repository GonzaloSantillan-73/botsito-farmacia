-- Marca el momento exacto en que una conversación entra a la cola "En espera"
-- (status = 'esperando'), para poder calcular el tiempo de espera real en el
-- CRM sin depender de updated_at (que cambia con cualquier mensaje entrante).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ;
