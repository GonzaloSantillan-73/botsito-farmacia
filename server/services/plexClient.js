import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const PLEX_HOST = process.env.PLEX_API_HOST;
const PLEX_USER = process.env.PLEX_API_USER;
const PLEX_PASSWORD = process.env.PLEX_API_PASSWORD;

if (!PLEX_HOST || !PLEX_USER || !PLEX_PASSWORD) {
  console.error('[PLEX] Faltan las variables de entorno PLEX_API_HOST / PLEX_API_USER / PLEX_API_PASSWORD.');
}

const authHeader = () => 'Basic ' + Buffer.from(`${PLEX_USER}:${PLEX_PASSWORD}`).toString('base64');

// Cliente HTTP EXCLUSIVAMENTE de lectura para la API externa de Plex
// Concentrador (wsplexcenter). A propósito no existe ningún plexPost /
// plexPut / plexDelete en este archivo: la API de la farmacia es de solo
// lectura y bajo ninguna circunstancia debe recibir escrituras desde acá.
// Todo lo que se sincroniza se guarda como espejo en Supabase
// (ver server/services/plexSync.js); nunca se vuelve a escribir hacia Plex.
export const plexGet = async (endpoint, params = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  ).toString();
  const url = `${PLEX_HOST}/${endpoint}${query ? `?${query}` : '?'}`;

  console.log(`[PLEX] ==> GET ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader(),
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error(`[PLEX] ❌ No se pudo conectar a Plex (${endpoint}):`, err.message);
    throw new Error(`No se pudo conectar con Plex Concentrador (${endpoint}).`);
  }

  const raw = await res.text();

  if (!res.ok) {
    console.error(`[PLEX] ❌ HTTP ${res.status} en ${endpoint}:`, raw.slice(0, 300));
    throw new Error(`Plex respondió ${res.status} en ${endpoint}.`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`[PLEX] ❌ Respuesta no es JSON válido en ${endpoint}:`, raw.slice(0, 300));
    throw new Error(`Respuesta no válida de Plex en ${endpoint}.`);
  }

  const respcode = data?.response?.respcode;
  if (respcode !== undefined && respcode !== '0') {
    console.error(`[PLEX] ❌ respcode=${respcode} (${data.response.respmsg}) en ${endpoint}`);
    throw new Error(data.response.respmsg || `Plex devolvió un error (respcode ${respcode}) en ${endpoint}.`);
  }

  return data?.response?.content ?? data;
};
