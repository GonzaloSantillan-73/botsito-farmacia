-- Borra TODOS los datos de clientes y su actividad, conservando:
--   admin_users, sucursales, app_settings, quick_replies, staff_users
-- Se usa TRUNCATE ... CASCADE para no depender del orden de las FKs: esto
-- también vacía de paso clientes_telefonos_historicos (FK -> clientes) y
-- conversation_sucursal_historial (FK -> conversations), y limpia las
-- columnas de conversations que guardan datos de la consulta del cliente
-- (rating, product_rating, pending_order, bot_context, payment_status,
-- order_status, sale_status, sale_amount, sale_reason) al borrarse la fila.
-- ADVERTENCIA: esto es IRREVERSIBLE. Hacer un backup/export antes de correrlo
-- si hay alguna duda.

TRUNCATE TABLE
  public.messages,
  public.prescriptions,
  public.pedidos_confirmados,
  public.pedidos_cotizados,
  public.conversations,
  public.clientes
CASCADE;

-- cart_items (carrito de compras armado por el cliente) es una tabla aparte
-- sin FK hacia clientes/conversations, así que el CASCADE de arriba no la
-- toca. Se vacía condicionalmente porque en algunos entornos ya fue
-- eliminada por eliminar_plex_carrito_geolocalizacion.sql.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cart_items'
  ) THEN
    EXECUTE 'TRUNCATE TABLE public.cart_items CASCADE';
  END IF;
END $$;
