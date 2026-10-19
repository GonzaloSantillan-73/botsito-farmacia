-- Botones y listas de WhatsApp en los mensajes del bot (menú principal y
-- encuesta de calificación, ver server/services/bot.js y ratingSurvey.js).
--
-- botones: lo que se mandó como interactivo, para que el CRM lo dibuje debajo
--   del texto: { tipo: 'botones' | 'lista', boton?, opciones: [{ id, titulo }] }.
-- botones_usado: se pone en true cuando el cliente ya eligió una opción de ese
--   mensaje. Si vuelve a tocar un botón de un mensaje usado, el webhook guarda
--   el toque en el chat pero el bot no responde (cada respuesta se cobra).
--
-- Correr ANTES de subir el backend. Si el backend se sube antes, los mensajes
-- salen igual (se guardan sin estas columnas), pero el CRM no muestra los
-- botones y los toques repetidos no se ignoran.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS botones JSONB;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS botones_usado BOOLEAN NOT NULL DEFAULT false;

-- El webhook busca el mensaje del bot por su wamid en cada toque de botón.
CREATE INDEX IF NOT EXISTS idx_messages_wamid ON public.messages(wamid);
