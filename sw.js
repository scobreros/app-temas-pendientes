// Service worker de App Temas pendientes
// - La app (index.html) se busca primero en internet: siempre ves la última versión.
//   Si no hay conexión (o tarda más de 4 segundos), se usa la copia guardada.
// - Íconos y manifest se muestran desde la copia guardada y se actualizan por detrás.
// - Google Sheets, fuentes y la librería de Excel van siempre directo a internet.

const CACHE_NAME = 'app-operaciones-v2'; // cambiar el número borra la caché vieja
const URLS_TO_CACHE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Uno por uno: si falta algún archivo, no se cae toda la instalación
      Promise.all(URLS_TO_CACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function redConTiempo(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
    fetch(request, { cache: 'no-store' }).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Solo se manejan archivos de la propia app; todo lo externo va directo a la red
  if (url.origin !== self.location.origin) return;

  const esPagina = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');

  if (esPagina) {
    // Red primero, caché como respaldo
    event.respondWith(
      redConTiempo(req)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((c) => c || caches.match('./index.html')).then((c) => c || caches.match('./'))
        )
    );
    return;
  }

  // Resto (íconos, manifest): caché primero y se actualiza por detrás
  event.respondWith(
    caches.match(req).then((cached) => {
      const red = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => cached);
      return cached || red;
    })
  );
});
