-- Registra qué sucursal fue la última en devolver esta conversación a la cola
-- general (ver server/services/devolucionCola.js), para poder mostrarle a esa
-- sucursal "Devolviste" y al resto "Devuelta" en la tarjeta del CRM. Se
-- limpia apenas otra sucursal toma la consulta (ver src/lib/tomarConsulta.js).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS devuelta_por_sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL;
