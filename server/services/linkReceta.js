// Link que se puede marcar como receta en un mensaje de texto del cliente
// (ej. recetas electrónicas que llegan como enlace en vez de foto/PDF).
// Devuelve el primer link del texto que NO sea de Google Maps (esos son
// ubicaciones, no recetas), ya normalizado con https://, o null si no hay.
//
// Misma lógica que src/lib/linkReceta.js (el panel la usa para mostrar
// "Marcar como receta"): si se cambia una, cambiar la otra.

// Igual que URL_REGEX de whatsappFormat.jsx: links con http(s):// o www.
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const PUNTUACION_FINAL = /[.,;:!?)\]]+$/;

const MAPS_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'maps.google.com.ar']);

const esLinkDeMaps = (url) => {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.toLowerCase();
    if (MAPS_HOSTS.has(host)) return true;
    // google.com / www.google.com (o .com.ar) sólo son Maps bajo /maps.
    return /^(www\.)?google\.com(\.ar)?$/.test(host) && pathname.startsWith('/maps');
  } catch {
    return false;
  }
};

export const extraerLinkReceta = (texto) => {
  if (!texto) return null;
  for (const match of texto.match(URL_REGEX) || []) {
    const limpio = match.replace(PUNTUACION_FINAL, '');
    const url = /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
    if (!esLinkDeMaps(url)) return url;
  }
  return null;
};
