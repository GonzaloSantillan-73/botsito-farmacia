// Sólo para la vista previa en el CRM (ver WelcomeMessagePanel.jsx y
// FrequentClientPanel.jsx): el reemplazo real, con el nombre real del
// cliente y el fallback si no tiene nombre cargado, lo hace el backend
// (formatearSaludo en server/services/bot.js) al armar el mensaje.
const NOMBRE_EJEMPLO = 'Juan';

export const previsualizarSaludo = (template) => {
  if (!template) return template;
  return template.replace(/\{\{\s*nombre\s*\}\}/gi, NOMBRE_EJEMPLO);
};
