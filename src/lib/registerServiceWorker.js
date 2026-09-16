// Registra el Service Worker (ver public/sw.js) que exigen los navegadores
// para habilitar el botón nativo de "Instalar app" del manifest. Se llama
// una sola vez desde main.jsx.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('❌ [DEBUG-LIB-REGISTERSERVICEWORKER] No se pudo registrar el service worker:', err);
    });
  });
}
