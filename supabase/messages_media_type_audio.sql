-- El esquema original de messages.media_type tenía un CHECK que sólo
-- permitía 'text'/'image'/'document' (ver supabase/schema.sql). El código ya
-- usa además 'video', 'pdf', 'blocked_pdf' y 'location' desde hace tiempo (lo
-- que sugiere que ese CHECK ya se amplió a mano en producción en algún
-- momento sin dejar el script acá) y ahora suma 'audio' para las notas de
-- voz del operador y del cliente. Este script busca el CHECK constraint
-- actual sobre esa columna (sea cual sea su nombre real) y lo reemplaza por
-- uno que incluya explícitamente todos los media_type que usa el código hoy,
-- para que insertar un mensaje de audio no lo rechace la base.
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
  CHECK (media_type IN ('text', 'image', 'video', 'document', 'pdf', 'blocked_pdf', 'location', 'audio'));
