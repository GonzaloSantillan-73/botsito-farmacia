-- Registra a qué sucursal quedó asignado cada pedido confirmado por el motor
-- de cercanía + stock (null si ninguna sucursal cubría el pedido completo).
ALTER TABLE public.pedidos_confirmados ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL;
