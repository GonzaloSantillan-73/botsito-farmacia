-- Vuelve a agregar reaction_emoji (ver messages_reaction_emoji.sql /
-- messages_reaction_emoji_revert.sql): el manejo de reacciones de WhatsApp
-- se sacó del webhook y después se volvió a agregar (commit "Feat: volver a
-- capturar reacciones de emojis..."), pero esa reintroducción no vino
-- acompañada de un nuevo script SQL — la columna se agregó a mano en
-- producción. Detectado el 2026-09-19 al migrar a una base nueva desde cero.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reaction_emoji TEXT NULL;
