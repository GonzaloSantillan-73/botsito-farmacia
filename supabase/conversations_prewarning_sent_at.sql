-- Marca cuándo se mandó el aviso preventivo de inactividad ("¿Seguís ahí?",
-- ver server/services/sessionExpiryChecker.js) de ESTA ventana de
-- inactividad, para no reenviarlo varias veces antes de que la conversación
-- se cierre. Se limpia a NULL apenas el cliente vuelve a escribir (ver
-- server/routes/webhook.js), para que un futuro tramo de inactividad en la
-- misma conversación pueda disparar el aviso de nuevo.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS prewarning_sent_at TIMESTAMPTZ;
