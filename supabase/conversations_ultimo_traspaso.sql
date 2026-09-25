-- Último movimiento de traspaso que tuvo la conversación: 'derivado' (una
-- sucursal se la pasó directo a otra, ver server/services/derivacionSucursal.js)
-- o 'devuelto' (una sucursal la devolvió a la cola general "En espera", ver
-- server/services/devolucionCola.js). NULL = nunca cambió de mano.
-- A diferencia de derivado_por_sucursal_id / devuelta_por_sucursal_id, NO se
-- limpia cuando otra sucursal toma la consulta: así la pestaña "Global" del
-- admin (Sidebar.jsx) puede seguir mostrando "Derivado" o "Devuelto a espera"
-- arriba del nombre de la sucursal que la atiende ahora. Cada traspaso nuevo
-- pisa el valor anterior (se muestra solo el último evento, sin acumular).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ultimo_traspaso TEXT;

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_ultimo_traspaso_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_ultimo_traspaso_check
  CHECK (ultimo_traspaso IS NULL OR ultimo_traspaso IN ('derivado', 'devuelto'));
