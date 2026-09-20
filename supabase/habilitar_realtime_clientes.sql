-- Habilita Realtime (postgres_changes) para la tabla `clientes`. Sin esto,
-- cualquier suscripción del frontend a cambios en `clientes` (App.jsx,
-- ClientDirectory.jsx, ValidationPanel.jsx) nunca recibe ningún evento: la
-- tabla simplemente no está publicada, aunque el código de suscripción esté
-- bien. Mismo patrón que supabase/schema.sql usa para conversations/
-- messages/prescriptions: agregar directo y atrapar el error puntual de "ya
-- es miembro de la publicación" para que sea seguro correr esto más de una
-- vez sin romper.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
