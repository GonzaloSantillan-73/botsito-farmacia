-- Cada día de `horarios_dias` pasa de ser un array "pelado" de franjas a un
-- objeto { abierta24hs, franjas }: `abierta24hs` es un toggle independiente
-- del "Abierto 24hs" global de la sucursal, para poder marcar sólo algunos
-- días (ej. el sábado) como 24hs mientras el resto de la semana tiene
-- horario normal. Envuelve los arrays de franjas que ya existan (de la
-- migración sucursales_horarios_por_dia.sql) sin tocar los días que ya
-- estén en el formato nuevo, para que sea seguro correrla más de una vez.
UPDATE public.sucursales
SET horarios_dias = (
  SELECT COALESCE(
    jsonb_object_agg(
      key,
      CASE
        WHEN jsonb_typeof(value) = 'array' THEN jsonb_build_object('abierta24hs', false, 'franjas', value)
        ELSE value
      END
    ),
    '{}'::jsonb
  )
  FROM jsonb_each(horarios_dias)
)
WHERE horarios_dias IS NOT NULL AND horarios_dias != '{}'::jsonb;
