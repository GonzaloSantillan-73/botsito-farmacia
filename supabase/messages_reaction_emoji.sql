-- Meta envía las reacciones a un mensaje como un evento de webhook aparte
-- (message.type === 'reaction'), con el wamid del mensaje reaccionado y el
-- emoji usado. Esta columna guarda ese emoji sobre la fila del mensaje
-- original (localizado por wamid) para poder mostrarlo en el CRM.
-- emoji = NULL representa "sin reacción" o "reacción quitada" (Meta manda
-- reaction.emoji: "" cuando el cliente remueve la reacción).
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reaction_emoji text NULL;
