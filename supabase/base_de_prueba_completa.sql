-- =============================================================================
-- BASE COMPLETA PARA UN PROYECTO NUEVO DE SUPABASE (entorno de pruebas)
-- =============================================================================
-- Arma en un solo paso la estructura que tiene hoy la base de producción
-- (verificada contra producción el 2026-11-10), SIN datos de clientes.
-- Reemplaza a correr uno por uno los .sql de esta carpeta: esos son el
-- historial de cambios (varios crean cosas que otros después borran, como
-- todo lo de Plex, carrito y productos) y NO hay que correrlos en una base nueva.
--
-- Cómo usarlo: Supabase (proyecto NUEVO) → SQL Editor → pegar todo → Run.
-- Se puede correr más de una vez sin romper nada.
--
-- Queda creado:
--   * 13 tablas que usa el sistema + checks, índices y claves foráneas.
--   * Triggers del registro de mensajes enviados (Métricas).
--   * Seguridad: igual que producción después de
--     seguridad_solo_usuarios_logueados.sql (sólo backend y panel logueado).
--   * Tiempo real para conversations, messages, prescriptions y clientes.
--   * Bucket de Storage "media" (público) para fotos/audios/PDF del chat.
--   * Usuario admin inicial: admin / admin123 (cambiarlo al entrar).
-- =============================================================================


-- 1. TABLAS ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sucursales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    direccion TEXT NOT NULL,
    dias INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6}', -- 0=domingo … 6=sábado
    hora_apertura TEXT NOT NULL DEFAULT '09:00',
    hora_cierre TEXT NOT NULL DEFAULT '18:00',
    activo BOOLEAN NOT NULL DEFAULT true,
    orden INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    google_maps_url TEXT,
    whatsapp_url TEXT,
    latitud NUMERIC,
    longitud NUMERIC,
    abierta_24hs BOOLEAN NOT NULL DEFAULT false,
    horarios_dias JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark'))
);

CREATE TABLE IF NOT EXISTS public.staff_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    sucursal_id UUID NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark'))
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_phone TEXT NOT NULL UNIQUE,
    nombre_completo TEXT,
    dni TEXT,
    obra_social TEXT,
    notas_operador TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    interacciones_bot INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_phone TEXT,
    client_name TEXT,
    status TEXT DEFAULT 'pending_validation'
        CHECK (status IN ('open', 'pending_validation', 'preparation', 'ready', 'resolved', 'rejected', 'esperando', 'finalizada')),
    assigned_to TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    bot_state TEXT,
    rating INTEGER CONSTRAINT conversations_rating_check
        CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    bot_context JSONB,
    payment_status TEXT,  -- 'pendiente' | 'confirmado'
    order_status TEXT,    -- 'armando' | 'enviado'
    sale_status TEXT,     -- 'concretada' | 'no_concretada'
    sale_amount NUMERIC,
    sale_reason TEXT,
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
    product_rating INTEGER CONSTRAINT conversations_product_rating_check
        CHECK (product_rating IS NULL OR (product_rating >= 1 AND product_rating <= 5)),
    waiting_since TIMESTAMPTZ,
    client_lat NUMERIC,
    client_lng NUMERIC,
    sucursales_recomendadas JSONB, -- [{ id, nombre, distancia_km }, ...]
    devuelta_por_sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
    payment_method TEXT,
    last_read_at TIMESTAMPTZ,
    primera_sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
    cotizador_draft JSONB,
    notas_operador TEXT,
    prewarning_sent_at TIMESTAMPTZ,
    derivado_por_sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
    derivado_por_sucursal_nombre TEXT,
    last_message TEXT,
    ultimo_traspaso TEXT CONSTRAINT conversations_ultimo_traspaso_check
        CHECK (ultimo_traspaso IS NULL OR ultimo_traspaso IN ('derivado', 'devuelto')),
    demora_inicial_ms BIGINT,
    motivo_cierre TEXT
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_type TEXT CONSTRAINT messages_sender_type_check
        CHECK (sender_type IN ('client', 'agent', 'bot', 'system')),
    message_text TEXT,
    media_url TEXT,
    media_type TEXT DEFAULT 'text' CONSTRAINT messages_media_type_check
        CHECK (media_type IN ('text', 'image', 'video', 'document', 'pdf', 'blocked_pdf', 'location', 'audio')),
    created_at TIMESTAMPTZ DEFAULT now(),
    tagged_as TEXT CONSTRAINT messages_tagged_as_check
        CHECK (tagged_as IS NULL OR tagged_as IN ('comprobante', 'receta')),
    is_auto_reminder BOOLEAN NOT NULL DEFAULT false,
    estado TEXT,
    wamid TEXT,
    reaction_emoji TEXT,
    deleted_reason TEXT,
    reply_to_wamid TEXT,
    botones JSONB,
    botones_usado BOOLEAN NOT NULL DEFAULT false,
    tipo_bot TEXT
);

CREATE TABLE IF NOT EXISTS public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    image_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    obra_social TEXT,
    notes TEXT,
    validated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_sucursal_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pedidos_confirmados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    client_phone TEXT NOT NULL,
    items JSONB NOT NULL,
    total NUMERIC NOT NULL,
    confirmed_at TIMESTAMPTZ DEFAULT now(),
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
    subtotal NUMERIC,
    costo_envio NUMERIC,
    envio_gratis BOOLEAN
);

CREATE TABLE IF NOT EXISTS public.pedidos_cotizados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    client_phone TEXT NOT NULL,
    items JSONB NOT NULL, -- [{ nombre, precio_unitario, cantidad, descuento_pct, total_item }]
    subtotal NUMERIC NOT NULL,
    descuento_total NUMERIC NOT NULL DEFAULT 0,
    costo_envio NUMERIC NOT NULL DEFAULT 0,
    envio_gratis BOOLEAN NOT NULL DEFAULT false,
    total NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quick_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shortcut TEXT NOT NULL,
    message_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE CASCADE
);

-- Registro de mensajes enviados (Métricas). Sin claves foráneas a propósito:
-- si se borra el chat o la sucursal, el registro queda.
CREATE TABLE IF NOT EXISTS public.mensajes_enviados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID UNIQUE,
    conversation_id UUID,
    client_phone TEXT,
    sucursal_id UUID,
    sucursal_nombre TEXT,
    sender_type TEXT NOT NULL,
    tipo_bot TEXT,
    fallido BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 2. ÍNDICES -----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_messages_wamid ON public.messages (wamid);
CREATE INDEX IF NOT EXISTS idx_conversation_sucursal_historial_conv ON public.conversation_sucursal_historial (conversation_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cotizados_client_phone ON public.pedidos_cotizados (client_phone);
CREATE INDEX IF NOT EXISTS idx_mensajes_enviados_created_at ON public.mensajes_enviados (created_at);
CREATE INDEX IF NOT EXISTS idx_mensajes_enviados_sucursal ON public.mensajes_enviados (sucursal_id, created_at);
-- Un mismo atajo puede existir una vez como global (sucursal_id NULL) y una vez por sucursal.
CREATE UNIQUE INDEX IF NOT EXISTS quick_replies_shortcut_sucursal_unique
  ON public.quick_replies (shortcut, COALESCE(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid));


-- 3. TRIGGERS DE MÉTRICAS (registro de mensajes enviados) --------------------

CREATE OR REPLACE FUNCTION public.registrar_mensaje_enviado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.mensajes_enviados
      (message_id, conversation_id, client_phone, sucursal_id, sucursal_nombre, sender_type, tipo_bot, fallido, created_at)
    SELECT NEW.id, NEW.conversation_id, c.client_phone, c.sucursal_id, s.nombre,
           NEW.sender_type, NEW.tipo_bot, COALESCE(NEW.estado = 'error', false), COALESCE(NEW.created_at, now())
    FROM (SELECT 1) AS uno
    LEFT JOIN public.conversations c ON c.id = NEW.conversation_id
    LEFT JOIN public.sucursales s ON s.id = c.sucursal_id
    ON CONFLICT (message_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'registrar_mensaje_enviado: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registrar_mensaje_enviado ON public.messages;
CREATE TRIGGER trg_registrar_mensaje_enviado
AFTER INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.sender_type IN ('bot', 'agent'))
EXECUTE FUNCTION public.registrar_mensaje_enviado();

CREATE OR REPLACE FUNCTION public.actualizar_mensaje_enviado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE public.mensajes_enviados
    SET fallido = COALESCE(NEW.estado = 'error', false),
        tipo_bot = COALESCE(NEW.tipo_bot, tipo_bot)
    WHERE message_id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'actualizar_mensaje_enviado: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_mensaje_enviado ON public.messages;
CREATE TRIGGER trg_actualizar_mensaje_enviado
AFTER UPDATE OF estado, tipo_bot ON public.messages
FOR EACH ROW
WHEN (NEW.sender_type IN ('bot', 'agent'))
EXECUTE FUNCTION public.actualizar_mensaje_enviado();


-- 4. SEGURIDAD (RLS) ---------------------------------------------------------
-- Igual que producción: el backend entra con la service_role key (saltea RLS)
-- y el panel con el pase "authenticated" que firma el backend al iniciar
-- sesión (SUPABASE_JWT_SECRET). Los anónimos no ven nada.

DO $$
DECLARE
  t TEXT;
BEGIN
  -- Tablas que el panel usa directo: sólo usuarios logueados.
  FOREACH t IN ARRAY ARRAY[
    'sucursales', 'app_settings', 'clientes', 'conversations', 'messages',
    'prescriptions', 'conversation_sucursal_historial', 'pedidos_confirmados',
    'pedidos_cotizados', 'quick_replies'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all on %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Allow all on %s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('GRANT ALL ON public.%I TO authenticated, service_role', t);
  END LOOP;

  -- Tablas que sólo toca el backend: RLS prendido y sin políticas.
  FOREACH t IN ARRAY ARRAY['admin_users', 'staff_users', 'mensajes_enviados'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;


-- 5. TIEMPO REAL -------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversations', 'messages', 'prescriptions', 'clientes'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- ya estaba agregada
    END;
  END LOOP;
END $$;


-- 6. STORAGE: bucket "media" -------------------------------------------------
-- Público para leer (el código usa getPublicUrl); subir/borrar desde el panel
-- sólo logueado. El backend sube con la service_role key.

INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Allow all on media bucket" ON storage.objects;
CREATE POLICY "Allow all on media bucket" ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'media')
WITH CHECK (bucket_id = 'media');


-- 7. DATOS INICIALES ---------------------------------------------------------

-- Admin inicial: admin / admin123. Cambiar la contraseña apenas entres
-- (Configuración > Administrador).
INSERT INTO public.admin_users (username, password_hash)
VALUES ('admin', '$2b$10$mD7uL8Kg3z0VR.5120zt7uIGBfDqntRLJsxUPr/dUajV8gPI6GNA.')
ON CONFLICT (username) DO NOTHING;

-- Configuración base (el resto de los ajustes tienen valor por defecto en el
-- código y se guardan solos al cambiarlos desde el panel).
INSERT INTO public.app_settings (key, value) VALUES
    ('session_timeout_ms', '180000'),
    ('bot_reactivation_keyword', '"BOT"'),
    ('bot_schedule', '{"enabled": false, "days": [0,1,2,3,4,5,6], "startTime": "00:00", "endTime": "23:59", "message": "En este momento estamos fuera de nuestro horario de atención automática. Por favor, escribinos más tarde."}')
ON CONFLICT (key) DO NOTHING;

-- Respuestas rápidas globales de ejemplo.
INSERT INTO public.quick_replies (shortcut, message_text)
SELECT v.shortcut, v.message_text
FROM (VALUES
    ('/receta', 'Por favor, recuerda que la foto de la receta debe incluir fecha, firma y diagnóstico legible.'),
    ('/pago', 'Puedes transferir a nuestro Alias: FARMACIA.PAGO. Recuerda enviarnos el comprobante.'),
    ('/obrasocial', 'Para consultar cobertura, por favor envíanos una foto de tu credencial de obra social y el número de DNI del afiliado.'),
    ('/alias', 'Para confirmar tu pedido, podés transferir a nuestro Alias: FARMACIA.PAGO. Cuando hagas la transferencia, envianos el comprobante por acá. 🙂'),
    ('/pagook', '✅ ¡Recibimos tu pago! Ya estamos preparando tu pedido.'),
    ('/armando', '📦 Estamos armando tu pedido. Te avisamos apenas esté listo para el envío.'),
    ('/enviado', '🚚 ¡Tu pedido ya salió! En breve debería llegar a tu domicilio.'),
    ('/demora', '⚠️ Puede que tu pedido demore un poco más de lo esperado. Ante cualquier inconveniente, escribinos por acá y te ayudamos enseguida.')
) AS v(shortcut, message_text)
WHERE NOT EXISTS (
    SELECT 1 FROM public.quick_replies q WHERE q.shortcut = v.shortcut AND q.sucursal_id IS NULL
);


-- 8. CONTROL -----------------------------------------------------------------
-- Tiene que devolver 13 filas, una por tabla, todas con rls = true.
SELECT tablename, rowsecurity AS rls
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
