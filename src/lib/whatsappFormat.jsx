import React from 'react';

// WhatsApp interpreta *negrita*, _itálica_ y ~tachado~ de forma nativa en el
// teléfono del cliente, pero en el CRM lo mostrábamos como texto plano (los
// asteriscos quedaban literales). Esto replica ese mismo formateo acá.
const FORMAT_REGEX = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

// Enlaces (con http(s):// o empezando con www.), igual que WhatsApp: se
// detectan ANTES que el formato, porque muchos links traen "_" o "*" (ej.
// ".../ABC_123.pdf") y si no se partían en cursiva/negrita y quedaban rotos.
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
// Puntuación que suele quedar pegada al final de un link en una oración
// ("mirá https://x.com/abc.") y que no forma parte de él.
const PUNTUACION_FINAL = /[.,;:!?)\]]+$/;

// Verde de los links de WhatsApp, en claro y oscuro.
const LINK_CLASSES = 'underline text-[#0B8A47] dark:text-[#3FD07F] hover:opacity-80';

const aplicarFormato = (texto, keyPrefix) =>
  texto.split(FORMAT_REGEX).filter(part => part !== '').map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <strong key={key}>{part.slice(1, -1)}</strong>;
    }
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('~') && part.endsWith('~') && part.length > 2) {
      return <s key={key}>{part.slice(1, -1)}</s>;
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });

// Una línea de texto: los links quedan como <a> que se abren en otra pestaña
// (noopener/noreferrer: la página abierta no puede tocar el CRM), y el resto
// pasa por el formato de WhatsApp. En `singleLine` (previews del sidebar,
// que ya son una card clickeable) los links quedan como texto común.
const renderLinea = (line, lineIndex, singleLine) =>
  line.split(URL_REGEX).filter(part => part !== '').flatMap((part, i) => {
    const key = `${lineIndex}-${i}`;
    if (singleLine || !/^(?:https?:\/\/|www\.)/i.test(part)) {
      return aplicarFormato(part, key);
    }
    const sobrante = part.match(PUNTUACION_FINAL)?.[0] || '';
    const url = sobrante ? part.slice(0, -sobrante.length) : part;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return [
      <a
        key={key}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASSES}
      >
        {url}
      </a>,
      sobrante && <React.Fragment key={`${key}-p`}>{sobrante}</React.Fragment>
    ];
  });

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
    const rendered = renderLinea(line, lineIndex, singleLine);

    return (
      <React.Fragment key={lineIndex}>
        {rendered}
        {lineIndex < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });

  return result;
}
