-- Contador de sesiones nuevas que este cliente inició con el bot (se
-- incrementa una vez por sesión nueva, no por cada mensaje suelto dentro de
-- la misma consulta — ver incrementarInteraccionesBot en
-- server/services/clientes.js y procesarMensajeBot en server/services/bot.js).
-- Se usa para decidir el saludo de "cliente frecuente" configurable desde
-- Configuración > Ajustes de Chat (ver app_settings: frequent_client_message
-- / frequent_client_threshold).
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS interacciones_bot INTEGER NOT NULL DEFAULT 0;
