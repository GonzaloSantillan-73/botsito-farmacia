// Hosts de Google Maps que el server tiene permitido "seguir" (whitelist):
// sin esto, aceptar cualquier URL que un cliente pegue por WhatsApp y
// pedirle al servidor que le haga un fetch sería una puerta abierta a SSRF
// (el server haciendo requests a donde un tercero le indique).
const HOSTS_PERMITIDOS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'www.google.com',
  'google.com',
  'maps.google.com'
]);

const REGEX_URL = /https?:\/\/[^\s]+/i;

const esHostPermitido = (url) => {
  try {
    return HOSTS_PERMITIDOS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
};

// Patrones de coordenadas que aparecen en distintos formatos de URL de
// Google Maps. Se prueban en orden de precisión: !3d/!4d es la coordenada
// exacta del pin en links de "lugar" (más confiable); @lat,lng suele ser
// sólo el centro del mapa; ?q=lat,lng es el formato viejo de "compartir ubicación".
const extraerCoordenadasDeTexto = (texto) => {
  const pinMatch = texto.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pinMatch) return { lat: parseFloat(pinMatch[1]), lng: parseFloat(pinMatch[2]) };

  const atMatch = texto.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

  const qMatch = texto.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };

  return null;
};

// Los links cortos (maps.app.goo.gl/xxxx) no traen coordenadas en la URL:
// hay que seguir la redirección HTTP hasta la URL larga que sí las tiene.
const resolverUrlFinal = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    return res.url || url;
  } catch (err) {
    console.error('[MAPS LOCATION] Error siguiendo el link de Maps:', err.message);
    return url;
  } finally {
    clearTimeout(timeout);
  }
};

// Extrae lat/lng de una URL de Google Maps ya identificada, siguiendo la
// redirección si hace falta (link acortado). Devuelve null si el host no es
// de Google Maps o si no se le pudieron sacar coordenadas.
export const extraerCoordenadasDeUrl = async (url) => {
  if (!url || !esHostPermitido(url)) return null;

  const directas = extraerCoordenadasDeTexto(url);
  if (directas) return directas;

  const urlFinal = await resolverUrlFinal(url);
  return extraerCoordenadasDeTexto(urlFinal);
};

// Busca un link de Google Maps dentro de un texto libre (mensaje del
// cliente) y devuelve sus coordenadas. Null si el texto no trae ningún link
// reconocible o no se pudo resolver a coordenadas.
export const extraerCoordenadasDeMensaje = async (texto) => {
  if (!texto) return null;
  const match = texto.match(REGEX_URL);
  if (!match) return null;
  return extraerCoordenadasDeUrl(match[0]);
};
