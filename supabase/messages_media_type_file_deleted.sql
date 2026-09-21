-- messages_media_type_audio.sql dejó el CHECK de media_type en ('text',
-- 'image', 'video', 'document', 'pdf', 'blocked_pdf', 'location', 'audio').
-- La purga de archivos obscenos (ver server/services/moderacion.js:
-- purgarArchivoMensaje) necesita guardar 'file_deleted', así que se vuelve a
-- reemplazar el CHECK (mismo mecanismo: buscarlo por columna, sea cual sea su
-- nombre real, y recrearlo) sumando ese valor nuevo a la lista.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'messages'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%media_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.messages ADD CONSTRAINT messages_media_type_check
  CHECK (media_type IN ('text', 'image', 'video', 'document', 'pdf', 'blocked_pdf', 'location', 'audio', 'file_deleted'));
