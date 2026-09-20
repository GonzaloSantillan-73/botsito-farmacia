-- Revierte la unificación de identidad por DNI (ver migrar_cliente_por_dni.sql,
-- clientes_telefonos_historicos.sql, clientes_dni_unique_index.sql): el
-- modelo vuelve a ser estricto por client_phone — cada número de WhatsApp es
-- una ficha/identidad independiente, y el DNI queda como un dato meramente
-- informativo de esa ficha, sin ninguna restricción ni vínculo cruzado con
-- otros números que puedan tener el mismo DNI cargado.

-- 1) El índice único de DNI impedía que dos fichas (dos teléfonos distintos)
--    tuvieran el mismo DNI cargado — ya no aplica: dos números pueden
--    compartir DNI sin conflicto. Sin este DROP, guardar el mismo DNI en un
--    segundo teléfono falla con un error de unicidad (23505) en la base.
DROP INDEX IF EXISTS public.clientes_dni_unique_idx;

-- 2) La función de migración automática de ficha por DNI ya no se llama
--    desde ningún lado del código (ver server/services/clientes.js).
DROP FUNCTION IF EXISTS public.migrar_cliente_por_dni(TEXT, TEXT, TEXT);

-- 3) La tabla de teléfonos históricos ya no se consulta en ningún lado.
DROP TABLE IF EXISTS public.clientes_telefonos_historicos;
