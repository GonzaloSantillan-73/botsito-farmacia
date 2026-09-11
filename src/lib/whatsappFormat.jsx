import React from 'react';

// WhatsApp interpreta *negrita*, _itálica_ y ~tachado~ de forma nativa en el
// teléfono del cliente, pero en el CRM lo mostrábamos como texto plano (los
// asteriscos quedaban literales). Esto replica ese mismo formateo acá.
const FORMAT_REGEX = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

export function renderWhatsAppText(text) {
  if (!text) return text;

  return text.split('\n').map((line, lineIndex, lines) => {
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
}
