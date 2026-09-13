-- Marca cuándo el operador vio por última vez esta conversación (se actualiza
-- al abrirla desde el Sidebar y al responderle al cliente). Se usa para
-- calcular el badge de "mensajes no leídos" en las tarjetas del CRM: cuenta
-- los mensajes de sender_type='client' con created_at posterior a esta marca.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;
