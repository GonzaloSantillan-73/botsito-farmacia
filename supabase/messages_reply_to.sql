-- Respuestas citadas ("responder" a un mensaje puntual, como en WhatsApp).
-- Guarda el wamid del mensaje al que responde esta fila:
-- - Mensajes del cliente: Meta lo manda en message.context.id cuando el
--   cliente desliza/responde un mensaje puntual (ver routes/webhook.js).
-- - Mensajes de la sucursal: el operador elige "Responder" en el CRM y el
--   backend lo envía a Meta como context.message_id (ver services/whatsapp.js).
-- El CRM ubica el mensaje citado buscando ese wamid en la columna wamid.
-- NULL = mensaje común, sin cita.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_wamid text NULL;
