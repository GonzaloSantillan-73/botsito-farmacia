-- Suma 'system' como sender_type válido en `messages`, para notas internas
-- generadas por el CRM (motivo de derivación/devolución a la cola, ver
-- derivacionSucursal.js / devolucionCola.js) que se muestran SOLO a
-- operadores/sucursales (nunca se envían al cliente por WhatsApp: eso pasa
-- por una función aparte y explícita, insertar acá no dispara ningún envío).
--
-- No se asume el nombre exacto de la restricción CHECK existente (Postgres
-- lo autogeneró al crear la tabla, ver supabase/schema.sql): se busca
-- dinámicamente por su definición y se reemplaza, para que esto funcione
-- sin importar cómo haya quedado nombrada en cada proyecto.
DO $$
DECLARE
  nombre_restriccion text;
BEGIN
  SELECT con.conname INTO nombre_restriccion
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'messages'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%sender_type%';

  IF nombre_restriccion IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', nombre_restriccion);
  END IF;

  ALTER TABLE public.messages
    ADD CONSTRAINT messages_sender_type_check
    CHECK (sender_type IN ('client', 'agent', 'bot', 'system'));
END $$;
