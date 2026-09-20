-- Historial completo de sucursales que tomaron o recibieron por derivación
-- esta consulta a lo largo de su ciclo de vida. A diferencia de
-- primera_sucursal_id / sucursal_id / derivado_por_sucursal_id (que sólo
-- guardan un puñado de puntos sueltos), esta tabla registra CADA vez que una
-- sucursal empieza a atender la conversación (ver server/services/
-- tomaConsulta.js y derivacionSucursal.js) — así no se pierden las
-- sucursales intermedias cuando hay varios ciclos de "devolver a la cola"
-- entre medio (algo que los campos sueltos de conversations no pueden
-- representar, porque devuelta_por_sucursal_id se pisa en cada ciclo).
CREATE TABLE IF NOT EXISTS public.conversation_sucursal_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_sucursal_historial_conv ON public.conversation_sucursal_historial(conversation_id);

ALTER TABLE public.conversation_sucursal_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on conversation_sucursal_historial" ON public.conversation_sucursal_historial;
CREATE POLICY "Allow all on conversation_sucursal_historial" ON public.conversation_sucursal_historial FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.conversation_sucursal_historial TO anon, authenticated, service_role;
