-- Sucursal a la que pertenece cada conversación. Nula hasta que un empleado
-- la atiende por primera vez (momento en el que el frontend se la asigna
-- automáticamente a su propia sucursal), para que las conversaciones nuevas
-- sigan siendo visibles para cualquier empleado hasta que alguien las tome.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL;
