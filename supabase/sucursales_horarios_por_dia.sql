-- Horario "cortado" por día: hasta 2 franjas horarias distintas por cada día
-- de la semana (ej. mañana 08:00 a 13:00 y tarde 17:00 a 20:00), en vez de
-- un único rango que aplicaba igual a todos los días marcados en `dias`.
-- Objeto JSON con una clave por día (mismo valor 0=domingo…6=sábado que ya
-- usaba `dias`), cada una con un array de 0 a 2 objetos { inicio, fin } en
-- formato "HH:MM". Un día sin esa clave (o con array vacío) significa que
-- la sucursal no atiende ese día. Las columnas viejas (dias/hora_apertura/
-- hora_cierre) quedan sin usar en el código pero no se borran, por si hace
-- falta consultar el horario anterior.
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS horarios_dias JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Migra el horario plano que ya tenía cada sucursal (un mismo rango en
-- todos sus `dias`) a la nueva estructura por día, para no perder la
-- configuración existente.
UPDATE public.sucursales
SET horarios_dias = (
  SELECT jsonb_object_agg(d::text, jsonb_build_array(jsonb_build_object('inicio', hora_apertura, 'fin', hora_cierre)))
  FROM unnest(dias) AS d
)
WHERE horarios_dias = '{}'::jsonb
  AND dias IS NOT NULL
  AND array_length(dias, 1) > 0
  AND hora_apertura IS NOT NULL
  AND hora_cierre IS NOT NULL;
