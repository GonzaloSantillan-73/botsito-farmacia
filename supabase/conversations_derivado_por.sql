-- Registra qué sucursal derivó DIRECTAMENTE esta conversación a la sucursal
-- que la tiene ahora (ver server/services/derivacionSucursal.js), para poder
-- mostrarle a la sucursal receptora "Derivado de <sucursal>" en la tarjeta
-- del Sidebar (a diferencia de devuelta_por_sucursal_id, que marca una
-- devolución a la cola general, no una derivación directa entre sucursales).
-- El nombre se guarda tal cual en el momento de derivar (no se resuelve por
-- join en la consulta de bandejas de App.jsx) para no tener que tocarla.
-- Se limpia apenas la conversación vuelve a cambiar de mano: nueva
-- derivación (se pisa con la nueva sucursal de origen), se devuelve a la
-- cola general (devolucionCola.js) o se vuelve a tomar de la cola (tomaConsulta.js).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS derivado_por_sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS derivado_por_sucursal_nombre TEXT;
