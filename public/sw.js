// Service Worker mínimo: existe sobre todo para cumplir el requisito de
// instalabilidad de los navegadores (manifest + SW registrado), no para
// convertir el CRM en una app offline completa. Este CRM depende de datos en
// vivo (chats por Realtime, métricas, media de Supabase Storage), así que
// cachear esas respuestas mostraría información vieja sin que el operador se
// dé cuenta — por eso NO se cachea nada de /api/ ni de Supabase, sólo se
// guarda el documento raíz como red de contención mínima si la conexión se
// corta un instante al navegar.
const CACHE_NAME = 'botsito-shell-v1';
const SHELL_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(SHELL_URL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(() => caches.match(SHELL_URL))
  );
});
