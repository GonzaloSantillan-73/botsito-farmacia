-- Datos base para Métricas y Estadísticas (etapa 1).
-- Ejecutar ANTES de subir el backend de este cambio. Se puede correr más de
-- una vez sin problema (todo es IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT).
--
-- 1. messages.tipo_bot: qué tipo de mensaje mandó el bot (menu, registro,
--    ubicacion, derivacion, encuesta, ...). Lo completa el backend al enviar.
-- 2. conversations.motivo_cierre: por qué se cerró cada consulta.
-- 3. pedidos_confirmados.envio_gratis: si el envío de ese pedido fue gratis.
-- 4. mensajes_enviados: registro de cada mensaje que sale (bot o sucursal),
--    que NO se borra al eliminar un chat (Meta ya cobró esos mensajes). Lo
--    completa la propia base con un trigger; si el trigger falla por lo que
--    sea, el mensaje se guarda y se envía igual (el error sólo se registra
--    como WARNING).

-- 1, 2 y 3: columnas nuevas ---------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS tipo_bot TEXT;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS motivo_cierre TEXT;
ALTER TABLE public.pedidos_confirmados ADD COLUMN IF NOT EXISTS envio_gratis BOOLEAN;

-- 4: registro de mensajes enviados --------------------------------------------
-- Sin claves foráneas a propósito: si se borra la conversación, el mensaje o
-- la sucursal, el registro queda (con el nombre de la sucursal guardado).
CREATE TABLE IF NOT EXISTS public.mensajes_enviados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID UNIQUE,
    conversation_id UUID,
    client_phone TEXT,
    sucursal_id UUID,
    sucursal_nombre TEXT,
    sender_type TEXT NOT NULL,          -- 'bot' | 'agent'
    tipo_bot TEXT,                      -- sólo para sender_type = 'bot'
    fallido BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_enviados_created_at ON public.mensajes_enviados (created_at);
CREATE INDEX IF NOT EXISTS idx_mensajes_enviados_sucursal ON public.mensajes_enviados (sucursal_id, created_at);

-- Sólo el backend (service role) la lee; nadie la escribe a mano.
ALTER TABLE public.mensajes_enviados ENABLE ROW LEVEL SECURITY;

-- Trigger: al guardarse un mensaje del bot o de una sucursal, se anota acá.
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
    -- Nunca frena el guardado del mensaje: Métricas no es más importante
    -- que mandarle la respuesta al cliente.
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

-- Trigger: si después Meta rechaza el mensaje (estado 'error'), se marca
-- como fallido en el registro (los fallidos no se cobran).
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

-- Carga inicial: los mensajes que ya existen hoy. El tipo de los mensajes
-- viejos del bot se deduce por el texto (aproximado); los nuevos lo traen
-- marcado desde el backend. Los de chats ya eliminados no se pueden recuperar.
INSERT INTO public.mensajes_enviados
  (message_id, conversation_id, client_phone, sucursal_id, sucursal_nombre, sender_type, tipo_bot, fallido, created_at)
SELECT m.id, m.conversation_id, c.client_phone, c.sucursal_id, s.nombre, m.sender_type,
       CASE
         WHEN m.sender_type <> 'bot' THEN NULL
         WHEN m.tipo_bot IS NOT NULL THEN m.tipo_bot
         WHEN m.is_auto_reminder OR m.message_text ILIKE '%seguís ahí%' OR m.message_text ILIKE '%seguís necesitando ayuda%' THEN 'aviso_inactividad'
         WHEN m.message_text ILIKE '%calific%' OR m.message_text ILIKE '%satisfecho%' THEN 'encuesta'
         WHEN m.message_text ILIKE '%derivando con un asesor%' OR m.message_text ILIKE '%ninguna sucursal cercana%' THEN 'derivacion'
         WHEN m.message_text ILIKE '%ubicación%' THEN 'ubicacion'
         WHEN m.message_text ILIKE '%tocá uno de estos botones%' THEN 'recordatorio'
         WHEN m.message_text ILIKE 'Estas son nuestras sucursales%' THEN 'sucursales'
         WHEN m.message_text ILIKE '%Tuvimos un problema%' THEN 'error'
         WHEN m.message_text ILIKE '%Qué querés hacer%' THEN 'menu'
         WHEN m.message_text ILIKE '%nombre%' OR m.message_text ILIKE '%DNI%' THEN 'registro'
         WHEN m.message_text ILIKE '%horario%' THEN 'fuera_horario'
         ELSE 'otro'
       END,
       COALESCE(m.estado = 'error', false),
       m.created_at
FROM public.messages m
LEFT JOIN public.conversations c ON c.id = m.conversation_id
LEFT JOIN public.sucursales s ON s.id = c.sucursal_id
WHERE m.sender_type IN ('bot', 'agent')
ON CONFLICT (message_id) DO NOTHING;
