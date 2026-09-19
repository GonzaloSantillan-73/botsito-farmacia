-- Preview del último mensaje de la conversación, usado por el Sidebar del CRM
-- (ver server/services/bot.js, server/routes/webhook.js y server/routes/api.js).
-- Esta columna existía en producción pero nunca quedó un script versionado acá
-- que la creara (se agregó a mano en algún momento) — se detectó el 2026-09-19
-- al migrar a una base nueva desde cero con solo los scripts de este directorio.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_message TEXT;
