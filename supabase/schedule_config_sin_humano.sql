-- Ya no existe un horario propio de "Asesores Humanos" (ver
-- server/services/geolocalizacion.js: la disponibilidad de atención humana
-- pasa a depender del horario real de cada sucursal, no de un valor global).
-- Se borra la key 'human_schedule' de app_settings para no dejar datos
-- huérfanos que nadie vuelve a leer.
DELETE FROM public.app_settings WHERE key = 'human_schedule';
