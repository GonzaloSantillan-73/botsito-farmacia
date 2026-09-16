-- Observaciones internas que carga el operador humano desde el CRM (ver
-- ClientNotesPanel.jsx), ahora por conversación en vez de por cliente: antes
-- vivían en clientes.notas_operador (vinculadas por client_phone), así que
-- se repetían en todas las consultas de un mismo número. Se mudan a esta
-- columna para que cada chat tenga su propia nota, independiente del resto
-- del historial de ese cliente. La columna vieja en clientes queda sin uso,
-- no se borra por si hay datos que el operador todavía quiera rescatar.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS notas_operador TEXT;
