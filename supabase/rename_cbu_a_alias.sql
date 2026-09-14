-- Migra los datos ya existentes en producción de "CBU" a "Alias" (el
-- código ya no busca la clave/atajo viejos, así que sin esto la farmacia
-- perdería el alias y la plantilla que ya tenía cargados).

-- 1) Renombra la clave de app_settings que guarda el alias institucional
--    (antes 'cbu_alias'), preservando el valor ya cargado por la farmacia.
UPDATE public.app_settings
SET key = 'alias'
WHERE key = 'cbu_alias'
  AND NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'alias');

-- 2) Renombra el atajo de respuesta rápida '/cbu' a '/alias' (el que usa el
--    botón "Enviar Alias" del panel de Estado del Pedido), preservando el
--    texto que la farmacia ya haya personalizado.
UPDATE public.quick_replies
SET shortcut = '/alias'
WHERE shortcut = '/cbu'
  AND NOT EXISTS (SELECT 1 FROM public.quick_replies WHERE shortcut = '/alias');

-- 3) Sólo si el texto de la plantilla seguía siendo el default original (es
--    decir, la farmacia nunca lo personalizó), se reemplaza la mención a
--    "CBU" por una redacción que habla sólo de Alias.
UPDATE public.quick_replies
SET message_text = 'Para confirmar tu pedido, podés transferir a nuestro Alias: FARMACIA.PAGO. Cuando hagas la transferencia, envianos el comprobante por acá. 🙂'
WHERE shortcut = '/alias'
  AND message_text = 'Para confirmar tu pedido, podés transferir a nuestro CBU: 0000000000000000000000, Alias: FARMACIA.PAGO. Cuando hagas la transferencia, envianos el comprobante por acá. 🙂';

UPDATE public.quick_replies
SET message_text = 'Puedes transferir a nuestro Alias: FARMACIA.PAGO. Recuerda enviarnos el comprobante.'
WHERE shortcut = '/pago'
  AND message_text = 'Puedes transferir a nuestro CBU: 0000000000000000000000, Alias: FARMACIA.PAGO. Recuerda enviarnos el comprobante.';

-- 4) Si alguna plantilla personalizada usaba la etiqueta vieja {{CBU}} para
--    insertar el alias cargado en Configuración, se actualiza a {{ALIAS}}
--    (la única que el código reemplaza de ahora en más) sin tocar el resto
--    del texto.
UPDATE public.quick_replies
SET message_text = REPLACE(message_text, '{{CBU}}', '{{ALIAS}}')
WHERE message_text LIKE '%{{CBU}}%';
