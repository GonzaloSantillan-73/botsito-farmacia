-- Borra TODOS los datos de clientes y su actividad, conservando:
--   admin_users, sucursales, app_settings, quick_replies, staff_users
-- Se usa TRUNCATE ... CASCADE para no depender del orden de las FKs.
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
