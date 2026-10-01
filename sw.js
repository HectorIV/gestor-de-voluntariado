/* Service worker: la app funciona sin conexión (PWA).
   Estrategia:
   - Navegaciones: red primero (para actualizarse), si falla → caché (offline).
   - Resto de archivos: se sirve de caché si existe y en paralelo se revalida,
     así se actualiza sin necesidad de recargar (y funciona igual sin internet).
   Cambia VERSION cuando cambien los archivos para que se limpie la caché vieja. */

const VERSION = 'v2';
const CACHE = `voluntariado-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/ui.js',
  './js/views/desayunos.js',
  './js/views/inventario.js',
  './js/views/miembros.js',
  './js/views/graficas.js',
  './js/views/precios.js',
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

  // Páginas (navegación): red primero, caché como respaldo.
  if (request.mode === 'navigate') {
    const fromCache = () =>
      caches.match(request).then((hit) => hit || caches.match('./index.html'));
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Si la red devuelve un error (502, 500...), preferimos la copia en caché.
          if (!response || !response.ok) return fromCache().then((hit) => hit || response);
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(fromCache)
    );
    return;
  }

  // Ficheros estáticos: caché al instante y revalidación en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
