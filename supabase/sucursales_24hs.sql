-- Modo "abierta 24hs" para una sucursal: cuando está activo, el bot muestra
-- "Abierto 24 hs" en vez de días/horario, y el frontend bloquea los
-- selectores de días y hora de apertura/cierre (que quedan con su último
-- valor guardado, simplemente ignorados mientras esta columna sea true).
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS abierta_24hs BOOLEAN NOT NULL DEFAULT false;
