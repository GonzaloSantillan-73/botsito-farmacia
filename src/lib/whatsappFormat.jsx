import React from 'react';

// WhatsApp interpreta *negrita*, _itálica_ y ~tachado~ de forma nativa en el
// teléfono del cliente, pero en el CRM lo mostrábamos como texto plano (los
// asteriscos quedaban literales). Esto replica ese mismo formateo acá.
const FORMAT_REGEX = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

// `singleLine`: para previsualizaciones de una sola línea (ej. el último
// mensaje en la card del sidebar, ver Sidebar.jsx). Sin esto, un mensaje con
// saltos de línea reales (el menú del bot, una lista larga) sigue rompiendo
// en varios renglones pase lo que pase con `truncate`/`line-clamp` en CSS:
// un <br/> explícito fuerza el salto igual, incluso con `white-space:
// nowrap`. Uniendo los renglones con un espacio ANTES de formatear, el
// contenedor sí puede truncar a una sola línea de verdad.
export function renderWhatsAppText(text, { singleLine = false } = {}) {
  if (!text) {
    return text;
  }

  const normalizado = singleLine ? text.replace(/\s*\n+\s*/g, ' ').trim() : text;

  const result = normalizado.split('\n').map((line, lineIndex, lines) => {
    const parts = line.split(FORMAT_REGEX).filter(part => part !== '');

    const rendered = parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <strong key={i}>{part.slice(1, -1)}</strong>;
      }
      if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('~') && part.endsWith('~') && part.length > 2) {
        return <s key={i}>{part.slice(1, -1)}</s>;
      }
      return part;
    });

    return (
      <React.Fragment key={lineIndex}>
        {rendered}
        {lineIndex < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });

  return result;
}
