-- Falta pura de moderacion_bloqueo_clientes.sql: crear la tabla no la deja
-- automáticamente suscribible por Realtime, hay que sumarla a mano a la
-- publicación (mismo motivo y mismo patrón que habilitar_realtime_clientes.sql
-- para `clientes`). Sin este ALTER, App.jsx nunca recibe ningún evento
-- INSERT/DELETE de clientes_bloqueados — el bloqueo/desbloqueo se guarda bien
-- en la base, pero el sidebar no se entera hasta un F5 (que vuelve a hacer
-- fetchConversations desde cero).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes_bloqueados;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Con REPLICA IDENTITY por default (el que trae toda tabla nueva), un evento
-- DELETE por Realtime sólo trae la clave primaria en `payload.old` (acá,
-- `id`) — NINGUNA otra columna. App.jsx necesita `payload.old.client_phone`
-- al desbloquear (ver el listener de clientes_bloqueados) para saber a quién
-- reincorporar al sidebar, así que hace falta que Postgres mande la fila
-- vieja completa.
ALTER TABLE public.clientes_bloqueados REPLICA IDENTITY FULL;
