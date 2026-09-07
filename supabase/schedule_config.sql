-- Horarios de atención del bot y de los asesores humanos. Reutiliza la tabla
-- app_settings ya existente (clave/valor). El bot arranca en 24/7 (enabled: false).
INSERT INTO public.app_settings (key, value) VALUES
    ('bot_schedule', '{"enabled": false, "days": [0,1,2,3,4,5,6], "startTime": "00:00", "endTime": "23:59", "message": "En este momento estamos fuera de nuestro horario de atención automática. Por favor, escribinos más tarde."}'),
    ('human_schedule', '{"enabled": true, "days": [1,2,3,4,5], "startTime": "09:00", "endTime": "18:00", "message": "Nuestros asesores no se encuentran disponibles en este momento. Nuestro horario de atención es {horario}. Dejanos tu consulta y te responderemos apenas estemos disponibles."}')
ON CONFLICT (key) DO NOTHING;
