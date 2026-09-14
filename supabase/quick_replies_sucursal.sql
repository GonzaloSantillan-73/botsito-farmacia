-- Respuestas rápidas exclusivas por sucursal: sucursal_id NULL = plantilla
-- global (gestionada por el admin, visible para todos, no editable/borrable
-- por sucursales); sucursal_id con valor = plantilla propia de esa sucursal,
-- invisible para las demás. Las filas ya existentes quedan como globales
-- (NULL) al no tener valor por defecto, así se preserva el comportamiento
-- actual sin migrar datos.
ALTER TABLE public.quick_replies ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE CASCADE;

-- El shortcut ya no puede ser único a nivel global: dos sucursales distintas
-- (o una sucursal y el set global) tienen que poder usar el mismo atajo
-- (ej. "/horarios") sin pisarse, cada una dentro de su propio ámbito.
ALTER TABLE public.quick_replies DROP CONSTRAINT IF EXISTS quick_replies_shortcut_key;

-- Sigue habiendo unicidad, pero por (shortcut, ámbito): el COALESCE trata
-- todas las filas globales (sucursal_id NULL) como un mismo "ámbito" para que
-- no puedan repetirse entre sí, mientras cada sucursal tiene su propio
-- ámbito independiente.
DROP INDEX IF EXISTS quick_replies_shortcut_sucursal_unique;
CREATE UNIQUE INDEX quick_replies_shortcut_sucursal_unique
  ON public.quick_replies (shortcut, COALESCE(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid));
