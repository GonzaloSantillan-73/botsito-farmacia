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
  console.log('🔍 [DEBUG-SERVICE-MAPSLOCATION] esHostPermitido() — url:', url);
  try {
    const resultado = HOSTS_PERMITIDOS.has(new URL(url).hostname.toLowerCase());
    console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] esHostPermitido() — resultado:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-MAPSLOCATION] esHostPermitido() — error parseando URL:', err?.message, err?.stack);
    return false;
  }
};

// Patrones de coordenadas que aparecen en distintos formatos de URL de
// Google Maps. Se prueban en orden de precisión: !3d/!4d es la coordenada
// exacta del pin en links de "lugar" (más confiable); /search/lat,+lng es el
// formato que usa hoy el botón "Ubicación actual" de WhatsApp al compartirse
// como link de Maps; @lat,lng suele ser sólo el centro del mapa; ?q=lat,lng
// es el formato viejo de "compartir ubicación".
const extraerCoordenadasDeTexto = (texto) => {
  console.log('🔍 [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeTexto() — texto:', texto);

  const pinMatch = texto.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pinMatch) {
    const resultado = { lat: parseFloat(pinMatch[1]), lng: parseFloat(pinMatch[2]) };
    console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeTexto() — match !3d/!4d, resultado:', resultado);
    return resultado;
  }

  const searchMatch = texto.match(/\/search\/(-?\d+\.\d+),\+?(-?\d+\.\d+)/);
  if (searchMatch) {
    const resultado = { lat: parseFloat(searchMatch[1]), lng: parseFloat(searchMatch[2]) };
    console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeTexto() — match /search/, resultado:', resultado);
    return resultado;
  }

  const atMatch = texto.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const resultado = { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeTexto() — match @lat,lng, resultado:', resultado);
    return resultado;
  }

  const qMatch = texto.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    const resultado = { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeTexto() — match ?q=, resultado:', resultado);
    return resultado;
  }

  console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeTexto() — sin match, resultado: null');
  return null;
};

// Los links cortos (maps.app.goo.gl/xxxx) no traen coordenadas en la URL:
// hay que seguir la redirección HTTP hasta la URL larga que sí las tiene.
const resolverUrlFinal = async (url) => {
  console.log('🔍 [DEBUG-SERVICE-MAPSLOCATION] resolverUrlFinal() — url:', url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    const resultado = res.url || url;
    console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] resolverUrlFinal() — url resuelta:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-MAPSLOCATION] resolverUrlFinal() — error siguiendo el link de Maps:', err?.message, err?.stack);
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
  console.log('🔍 [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeUrl() — url:', url);

  if (!url || !esHostPermitido(url)) {
    console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeUrl() — url vacía o host no permitido, resultado: null');
    return null;
  }

  const directas = extraerCoordenadasDeTexto(url);
  if (directas) {
    console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeUrl() — coordenadas directas encontradas en la url:', directas);
    return directas;
  }

  console.log('🔍 [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeUrl() — no hay coordenadas directas, resolviendo redirección...');
  const urlFinal = await resolverUrlFinal(url);
  console.log('🔍 [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeUrl() — urlFinal:', urlFinal);
  const resultado = extraerCoordenadasDeTexto(urlFinal);
  console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeUrl() — resultado a devolver:', resultado);
  return resultado;
};

// Busca un link de Google Maps dentro de un texto libre (mensaje del
// cliente) y devuelve sus coordenadas. Null si el texto no trae ningún link
// reconocible o no se pudo resolver a coordenadas.
export const extraerCoordenadasDeMensaje = async (texto) => {
  console.log('🔍 [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeMensaje() — texto:', texto);

  if (!texto) {
    console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeMensaje() — texto vacío, resultado: null');
    return null;
  }
  const match = texto.match(REGEX_URL);
  if (!match) {
    console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeMensaje() — no se encontró url en el texto, resultado: null');
    return null;
  }
  console.log('🔍 [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeMensaje() — url encontrada en el texto:', match[0]);
  const resultado = await extraerCoordenadasDeUrl(match[0]);
  console.log('✅ [DEBUG-SERVICE-MAPSLOCATION] extraerCoordenadasDeMensaje() — resultado a devolver:', resultado);
  return resultado;
};
