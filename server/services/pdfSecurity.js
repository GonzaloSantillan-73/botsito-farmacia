// Análisis de seguridad básico para PDFs recibidos por WhatsApp, antes de
// guardarlos en Supabase Storage. No reemplaza un antivirus real, pero
// bloquea los vectores más comunes de PDFs maliciosos: archivos que no son
// PDFs de verdad (ejecutables/scripts disfrazados con extensión .pdf) y
// PDFs con acciones automáticas embebidas (JavaScript, lanzar programas,
// archivos incrustados).

const FIRMA_PDF = '%PDF-';

// Cada patrón se busca como token de PDF (con "/" adelante, como aparece en
// el diccionario de objetos) para no disparar con texto de contenido normal
// que casualmente contenga estas palabras.
const PATRONES_PELIGROSOS = [
  { patron: /\/JavaScript\b/i, motivo: 'contiene JavaScript embebido (/JavaScript)' },
  { patron: /\/JS\b/i, motivo: 'contiene JavaScript embebido (/JS)' },
  { patron: /\/OpenAction\b/i, motivo: 'ejecuta una acción automática al abrirse (/OpenAction)' },
  { patron: /\/AA\b/i, motivo: 'contiene una acción automática asociada (/AA)' },
  { patron: /\/Launch\b/i, motivo: 'intenta lanzar un programa o comando externo (/Launch)' },
  { patron: /\/EmbeddedFile\b/i, motivo: 'contiene un archivo incrustado (/EmbeddedFile)' },
  { patron: /\/RichMedia\b/i, motivo: 'contiene contenido Flash/RichMedia embebido' },
  { patron: /\/SubmitForm\b/i, motivo: 'envía datos del formulario a una URL externa (/SubmitForm)' }
];

// Analiza el buffer crudo del archivo. Devuelve { seguro, motivos } — si
// seguro es false, motivos siempre tiene al menos una entrada legible.
export const analizarPdf = (buffer) => {
  const motivos = [];

  // 1. Firma binaria real: un PDF legítimo empieza con "%PDF-" (dentro de los
  // primeros bytes; algunos generadores agregan un pequeño preámbulo). Esto
  // atrapa ejecutables o scripts renombrados con extensión/mime falso.
  const inicio = buffer.subarray(0, 1024).toString('latin1');
  if (!inicio.includes(FIRMA_PDF)) {
    motivos.push('El archivo no tiene la firma binaria de un PDF real (falta "%PDF-" en la cabecera).');
    return { seguro: false, motivos };
  }

  // 2. Validación estructural básica: buscamos los tokens peligrosos como
  // texto latin1 (preserva byte a byte, sin perder los caracteres de control
  // propios del formato PDF) en todo el contenido del archivo.
  const contenido = buffer.toString('latin1');
  for (const { patron, motivo } of PATRONES_PELIGROSOS) {
    if (patron.test(contenido)) {
      motivos.push(motivo);
    }
  }

  return { seguro: motivos.length === 0, motivos };
};

// Determina si un documento entrante de WhatsApp debe tratarse como PDF,
// mirando tanto el mime type real (del header de descarga) como el nombre
// de archivo declarado por Meta.
export const esDocumentoPdf = (mimeType, filename) =>
  mimeType === 'application/pdf' || (filename || '').toLowerCase().endsWith('.pdf');
