-- Vuelve atrás supabase/seguridad_solo_usuarios_logueados.sql: deja las
-- políticas, el RLS y los permisos de la función exactamente como estaban,
-- usando lo anotado en seguridad_backup_politicas.
--
-- Usarlo sólo si después de cerrar la base algo del panel dejó de andar y
-- hace falta volver a la situación anterior mientras se corrige (con esto la
-- base vuelve a quedar abierta a cualquiera con la anon key).
--
-- Es todo-o-nada, igual que el original.

DO $$
DECLARE
    r RECORD;
    roles_txt TEXT;
BEGIN
    IF to_regclass('public.seguridad_backup_politicas') IS NULL THEN
        RAISE NOTICE 'No hay nada para revertir (no existe seguridad_backup_politicas).';
        RETURN;
    END IF;

    FOR r IN SELECT * FROM public.seguridad_backup_politicas ORDER BY id DESC
    LOOP
        IF r.tipo = 'politica' THEN
            SELECT string_agg(quote_ident(rol), ', ') INTO roles_txt FROM unnest(r.roles_originales) AS rol;
            EXECUTE format('ALTER POLICY %I ON %I.%I TO %s', r.politica, r.esquema, r.tabla, roles_txt);

        ELSIF r.tipo = 'rls' THEN
            EXECUTE format('DROP POLICY IF EXISTS "Solo usuarios logueados" ON %I.%I', r.esquema, r.tabla);
            EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', r.esquema, r.tabla);

        ELSIF r.tipo = 'funcion' THEN
            EXECUTE 'GRANT EXECUTE ON FUNCTION public.migrar_cliente_por_dni(TEXT, TEXT, TEXT) TO PUBLIC, anon';
        END IF;
    END LOOP;

    DELETE FROM public.seguridad_backup_politicas;
END $$;
