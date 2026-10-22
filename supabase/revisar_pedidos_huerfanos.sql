-- Pedidos y cotizaciones de chats que se eliminaron ANTES de que el CRM los
-- borrara junto con la conversación (antes quedaban sueltos, con
-- conversation_id en NULL, y seguían sumando en el Monto Total de Métricas).
--
-- PASO 1 (solo lectura): revisar la lista. Puede haber ventas reales: un
-- pedido queda sin conversación sólo si se eliminó su chat, pero conviene
-- mirarlos uno por uno (teléfono, fecha, total) antes de borrar.

SELECT 'pedidos_confirmados' AS tabla, id, client_phone, total, confirmed_at AS fecha
FROM public.pedidos_confirmados
WHERE conversation_id IS NULL
UNION ALL
SELECT 'pedidos_cotizados', id, client_phone, total, created_at
FROM public.pedidos_cotizados
WHERE conversation_id IS NULL
ORDER BY fecha DESC;

-- PASO 2 (borrar): sólo con la aprobación de otro integrante de Sistemas.
-- Sacá los dos guiones del comienzo de las líneas de abajo para ejecutarlo.
-- Si alguno de la lista es una venta real, agregá "AND id <> '<id>'" para dejarlo.
--
-- BEGIN;
-- DELETE FROM public.pedidos_confirmados WHERE conversation_id IS NULL;
-- DELETE FROM public.pedidos_cotizados WHERE conversation_id IS NULL;
-- COMMIT;
