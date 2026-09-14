-- Sucursal que tomó esta conversación por PRIMERA vez (a diferencia de
-- sucursal_id, que es la actual/última). No se pisa nunca una vez seteada:
-- sirve para poder mostrar, en un ticket ya finalizado, si intervino una
-- sola sucursal o si hubo una derivación (primera_sucursal_id distinta de
-- sucursal_id) sin depender de devuelta_por_sucursal_id, que se limpia en
-- cada ciclo de devolución/toma (ver server/services/tomaConsulta.js).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS primera_sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL;
