-- Revierte supabase/messages_reaction_emoji.sql: se sacó del código el
-- manejo de reacciones de WhatsApp (ver commit "Revert: sacar el manejo de
-- reacciones de emojis del webhook"), así que esta columna ya no se usa.
ALTER TABLE public.messages DROP COLUMN IF EXISTS reaction_emoji;
