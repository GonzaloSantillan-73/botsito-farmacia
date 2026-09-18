-- Horario de atención del bot. Reutiliza la tabla app_settings ya existente
-- (clave/valor). El bot arranca en 24/7 (enabled: false).
-- (La atención humana ya no tiene un horario propio acá: ver
-- schedule_config_sin_humano.sql y server/services/geolocalizacion.js.)
INSERT INTO public.app_settings (key, value) VALUES
    ('bot_schedule', '{"enabled": false, "days": [0,1,2,3,4,5,6], "startTime": "00:00", "endTime": "23:59", "message": "En este momento estamos fuera de nuestro horario de atención automática. Por favor, escribinos más tarde."}')
ON CONFLICT (key) DO NOTHING;
