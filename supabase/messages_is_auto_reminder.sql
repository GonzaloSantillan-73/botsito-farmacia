-- Distingue el mensaje automático "¿Seguís ahí?" (ver
-- server/services/sessionExpiryChecker.js) del resto de los mensajes del
-- bot: hace falta poder EXCLUIRLO al calcular la "última actividad" de la
-- conversación (tanto para decidir el cierre por inactividad como para el
-- contador visual del CRM), porque si contara como actividad normal
-- reiniciaría el propio conteo que originó el aviso y la conversación nunca
-- llegaría a cerrarse sola.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_auto_reminder BOOLEAN NOT NULL DEFAULT false;
