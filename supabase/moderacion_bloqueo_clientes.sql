-- Moderación de chats reportados: bloqueo de clientes y purga de archivos
-- obscenos, ambas exclusivas del admin (ver server/routes/moderacion.js).
-- El "Reportar" del modal de cierre reutiliza conversations.sale_status /
-- sale_reason que ya existen (ver sale_status.sql) con el valor nuevo
-- 'reportado' — no hace falta ninguna columna extra para eso, sólo lo
-- específico del bloqueo y la purga se agrega acá.

-- Un cliente bloqueado: mientras exista esta fila, el bot no le contesta
-- nada (ver estaClienteBloqueado en server/services/moderacion.js, usado
-- desde el webhook) y no se lo deriva a ninguna sucursal. "Desbloquear"
-- borra la fila directamente — no se guarda historial de bloqueos pasados,
-- sólo el estado activo.
CREATE TABLE IF NOT EXISTS public.clientes_bloqueados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_phone TEXT NOT NULL UNIQUE REFERENCES public.clientes(client_phone) ON DELETE CASCADE,
    motivo TEXT NOT NULL,
    reported_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    blocked_by_username TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clientes_bloqueados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on clientes_bloqueados" ON public.clientes_bloqueados;
CREATE POLICY "Allow all on clientes_bloqueados" ON public.clientes_bloqueados FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.clientes_bloqueados TO anon, authenticated, service_role;

-- Purga de archivos obscenos: al eliminar un adjunto se borra el archivo de
-- Storage y el mensaje queda con media_url NULL, media_type 'file_deleted'
-- y este motivo, para que MessageBubble.jsx muestre el placeholder
-- "Archivo eliminado: {motivo}" en vez de la burbuja original.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_reason TEXT;
