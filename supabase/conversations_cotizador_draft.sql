-- Borrador del Cotizador (ítems agregados pero todavía no enviados/cobrados)
-- de esta conversación puntual. Se autoguarda desde ValidationPanel.jsx cada
-- vez que el operador agrega/quita/edita un ítem, para que si el chat se
-- devuelve a la cola de espera y otra sucursal lo toma, no tenga que volver
-- a cargar los mismos productos desde cero. El costo de envío NO se guarda
-- acá a propósito: cada sucursal tiene su propia tarifa/ubicación, así que
-- siempre arranca en blanco al abrir la conversación (ver ValidationPanel.jsx).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS cotizador_draft JSONB;
