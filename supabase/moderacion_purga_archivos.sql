-- Purga de archivos adjuntos por el admin (audio, video, PDF, imagen,
-- documento) dentro de cualquier conversación — ver
-- server/services/moderacion.js: purgarArchivoMensaje. Al purgar se borra
-- el archivo de Storage y el mensaje queda con media_url NULL y este
-- motivo, sin tocar media_type (sigue siendo 'image'/'video'/'audio'/
-- 'document'/'pdf' de siempre, no hace falta ningún valor nuevo en su
-- CHECK), para que MessageBubble.jsx pueda mostrar qué tipo de archivo era
-- en el placeholder "{Tipo} eliminado: {motivo}".
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_reason TEXT;
