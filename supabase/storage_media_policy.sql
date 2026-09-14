-- El bucket 'media' de Supabase Storage tiene Row Level Security activado en
-- storage.objects pero sin ninguna policy para ese bucket, así que Supabase
-- rechaza cualquier operación hecha con la anon key ("new row violates
-- row-level security policy"). El webhook nunca tuvo este problema porque
-- sube la media entrante con la service_role key desde el servidor (que
-- salta el RLS); pero cuando el operador adjunta un archivo desde el CRM en
-- el navegador, la subida se hace con la anon key (no hay sesión real de
-- Supabase Auth: el login del CRM es un JWT propio, no el de Supabase), y
-- ahí sí pega contra el RLS.
--
-- Mismo criterio que el resto de las tablas del proyecto (RLS habilitado
-- pero con policy "permitir todo" porque es un CRM interno de confianza, no
-- una app pública): se agrega una policy que permite subir/leer/actualizar/
-- borrar objetos del bucket 'media' tanto a anon como a authenticated.
DROP POLICY IF EXISTS "Allow all on media bucket" ON storage.objects;
CREATE POLICY "Allow all on media bucket" ON storage.objects
FOR ALL
TO anon, authenticated
USING (bucket_id = 'media')
WITH CHECK (bucket_id = 'media');
