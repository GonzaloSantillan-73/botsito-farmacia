-- Cierra la base a usuarios anónimos: hasta ahora casi todas las tablas
-- tenían políticas "Allow all ... USING (true)" para el rol public, así que
-- cualquiera con la anon key (que viaja dentro del JavaScript del panel)
-- podía leer, modificar y borrar clientes, chats, recetas, pedidos y archivos.
--
-- Después de esto, sólo pueden entrar:
--   * el backend (service_role key, que saltea RLS: el bot no se ve afectado);
--   * el panel con el pase que firma el backend al iniciar sesión (rol
--     "authenticated", ver generarTokenSupabase en server/services/adminAuth.js).
--
-- Cómo lo hace, sin tener que listar tabla por tabla:
--   1. Toda política de los esquemas public y storage que aplicaba a
--      public/anon pasa a aplicar sólo a authenticated (ALTER POLICY ... TO).
--      Las condiciones de cada política quedan iguales.
--   2. Toda tabla de public que tenía RLS apagado (abierta a todos sin
--      importar políticas) lo prende, con una política sólo para authenticated.
--   3. La función migrar_cliente_por_dni deja de poder llamarse como anónimo.
-- Lo que cambia queda anotado en seguridad_backup_politicas, que es lo que
-- usa seguridad_solo_usuarios_logueados_revertir.sql para dejar todo como estaba.
--
-- ORDEN: correr esto DESPUÉS de que el código nuevo (backend + panel) esté
-- subido y SUPABASE_JWT_SECRET cargada en el backend. Si se corre antes, el
-- panel deja de ver los datos hasta que se suba el código.
--
-- Es todo-o-nada: si algún paso falla, no se aplica ningún cambio. Única
-- excepción: una política que Supabase no deje modificar por falta de permiso
-- se saltea con un WARNING (y aparece en la consulta de control del final).
-- Correrlo dos veces no hace daño (la segunda vez no encuentra nada abierto).

CREATE TABLE IF NOT EXISTS public.seguridad_backup_politicas (
    id BIGSERIAL PRIMARY KEY,
    tipo TEXT NOT NULL,              -- 'politica' | 'rls' | 'funcion'
    esquema TEXT NOT NULL,
    tabla TEXT NOT NULL,             -- nombre de la tabla, o firma de la función
    politica TEXT,
    roles_originales NAME[],
    creado_en TIMESTAMPTZ DEFAULT now()
);
-- RLS prendido y sin políticas: sólo la ve el backend (service_role).
ALTER TABLE public.seguridad_backup_politicas ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    r RECORD;
BEGIN
    -- 1. Políticas abiertas a public/anon -> sólo authenticated.
    FOR r IN
        SELECT schemaname, tablename, policyname, roles
        FROM pg_policies
        WHERE schemaname IN ('public', 'storage')
          AND roles && ARRAY['public', 'anon']::NAME[]
    LOOP
        -- Sub-bloque propio: si Supabase no deja modificar alguna política
        -- (pasa a veces con storage.objects, que es de Supabase y no del
        -- proyecto), se avisa y se sigue con el resto en vez de abortar todo.
        BEGIN
            INSERT INTO public.seguridad_backup_politicas (tipo, esquema, tabla, politica, roles_originales)
            VALUES ('politica', r.schemaname, r.tablename, r.policyname, r.roles);

            EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated', r.policyname, r.schemaname, r.tablename);
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE WARNING 'Sin permiso para cerrar la política "%" de %.%: queda como estaba.', r.policyname, r.schemaname, r.tablename;
        END;
    END LOOP;

    -- 2. Tablas de public sin RLS -> RLS prendido + política sólo para authenticated.
    FOR r IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND NOT rowsecurity
    LOOP
        INSERT INTO public.seguridad_backup_politicas (tipo, esquema, tabla)
        VALUES ('rls', r.schemaname, r.tablename);

        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
        EXECUTE format('CREATE POLICY "Solo usuarios logueados" ON %I.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', r.schemaname, r.tablename);
    END LOOP;

    -- 3. La función de migración de clientes sólo la usa el backend.
    IF to_regprocedure('public.migrar_cliente_por_dni(text, text, text)') IS NOT NULL
       AND has_function_privilege('anon', 'public.migrar_cliente_por_dni(text, text, text)', 'EXECUTE') THEN
        INSERT INTO public.seguridad_backup_politicas (tipo, esquema, tabla)
        VALUES ('funcion', 'public', 'migrar_cliente_por_dni(text, text, text)');

        REVOKE EXECUTE ON FUNCTION public.migrar_cliente_por_dni(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
    END IF;
END $$;

-- Resultado: debería devolver 0 filas (ninguna política abierta a anónimos
-- ni tablas de public sin RLS).
SELECT 'politica abierta' AS problema, schemaname || '.' || tablename AS donde, policyname AS detalle
FROM pg_policies
WHERE schemaname IN ('public', 'storage') AND roles && ARRAY['public', 'anon']::NAME[]
UNION ALL
SELECT 'tabla sin RLS', schemaname || '.' || tablename, NULL
FROM pg_tables
WHERE schemaname = 'public' AND NOT rowsecurity;
