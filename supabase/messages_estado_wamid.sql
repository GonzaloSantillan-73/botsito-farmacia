-- Estado de entrega de cada mensaje ('pendiente' | 'enviado' | 'recibido' |
-- 'entregado' | 'leido' | 'error', ver server/services/bot.js,
-- server/routes/webhook.js y server/routes/api.js) y el ID de WhatsApp
-- (wamid) que Meta asigna a cada mensaje enviado, usado para poder
-- actualizar después su estado de entrega/lectura vía el webhook de status.
-- Igual que last_message: existían en producción sin script versionado acá,
-- detectado el 2026-09-19 al migrar a una base nueva desde cero.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS estado TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS wamid TEXT;
