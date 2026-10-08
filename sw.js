/* Service worker: la app funciona sin conexión (PWA).
   Estrategia:
   - Todo lo que se pida va primero a la red (sin caché del navegador) para que los
     cambios se vean enseguida y se guarda una copia nueva.
   - Si no hay internet o el servidor falla (502...), se sirve la copia guardada.
   Cambia VERSION cuando cambien los archivos para limpiar la caché vieja. */

const VERSION = 'v16';
const CACHE = `voluntariado-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/ui.js',
  './js/sugerencias.js',
  './js/views/desayunos.js',
  './js/views/inventario.js',
  './js/views/compras.js',
  './js/views/miembros.js',
  './js/views/graficas.js',
  './js/views/fotos.js',
  './js/views/precios.js',
  './js/photos.js',
  './js/collage.js',
  './js/prices.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Red primero (sin caché del navegador) para que los cambios lleguen enseguida;
  // si no hay internet o el servidor falla, se sirve la copia guardada.
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        if (response && response.ok) return response;
        // Error del servidor (502, 500...): preferimos la copia en caché.
        return caches.match(request).then((hit) => hit || response);
      })
      .catch((err) => caches.match(request).then((hit) => hit || Promise.reject(err)))
  );
});
