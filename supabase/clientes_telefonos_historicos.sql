-- Registro de todos los client_phone que alguna vez fueron "el" teléfono
-- vigente de una persona (ver migrar_cliente_por_dni.sql y
-- server/services/clientesAdmin.js: actualizarDatosCliente). No reemplaza a
-- clientes.client_phone (que sigue siendo el vigente); es el historial de los
-- que dejó de usar, para poder sumar sus conversaciones/pedidos de ANTES del
-- cambio sin tener que reescribir esas filas viejas (eso destruiría el
-- snapshot real de con qué número se habló en cada sesión — ver el comentario
-- en obtenerListaClientesDirectorio en clientDirectory.js).
CREATE TABLE IF NOT EXISTS public.clientes_telefonos_historicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    client_phone TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_telefonos_historicos_phone ON public.clientes_telefonos_historicos (client_phone);
CREATE INDEX IF NOT EXISTS idx_clientes_telefonos_historicos_cliente ON public.clientes_telefonos_historicos (cliente_id);

ALTER TABLE public.clientes_telefonos_historicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on clientes_telefonos_historicos" ON public.clientes_telefonos_historicos;
CREATE POLICY "Allow all on clientes_telefonos_historicos" ON public.clientes_telefonos_historicos FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.clientes_telefonos_historicos TO anon, authenticated, service_role;
