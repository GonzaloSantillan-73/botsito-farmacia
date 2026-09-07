-- Plantillas de respuestas rápidas, editables desde el CRM (Configuración > Respuestas Rápidas)
-- y usadas en la caja de texto del chat al escribir "/" o hacer clic en el ícono de rayo.
CREATE TABLE IF NOT EXISTS public.quick_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shortcut TEXT NOT NULL UNIQUE,
    message_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on quick_replies" ON public.quick_replies;
CREATE POLICY "Allow all on quick_replies" ON public.quick_replies FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.quick_replies TO anon, authenticated, service_role;

-- Datos iniciales: las mismas plantillas que antes estaban hardcodeadas en el frontend.
INSERT INTO public.quick_replies (shortcut, message_text) VALUES
    ('/receta', 'Por favor, recuerda que la foto de la receta debe incluir fecha, firma y diagnóstico legible.'),
    ('/pago', 'Puedes transferir a nuestro CBU: 0000000000000000000000, Alias: FARMACIA.PAGO. Recuerda enviarnos el comprobante.'),
    ('/sucursal', 'Nuestra sucursal se encuentra en Av. Principal 123. Los horarios de atención son de Lunes a Viernes de 9 a 20hs. Recuerda traer tu DNI o el de la persona que retira.'),
    ('/obrasocial', 'Para consultar cobertura, por favor envíanos una foto de tu credencial de obra social y el número de DNI del afiliado.')
ON CONFLICT (shortcut) DO NOTHING;
