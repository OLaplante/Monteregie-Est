// Service worker autonome du brouillon Montérégie-Est.
// Ce cache est indépendant de celui du site officiel trouvetaclinique.ca.
const CACHE = 'ptem-2027-monteregie-est-draft-v6';
const CORE = [
  './',
  './index.html',
  './leaflet.css',
  './leaflet.js',
  './data.json',
  './manifest.webmanifest',
  './icon-est-192.png',
  './icon-est-512.png',
  './icon-est-192-maskable.png',
  './icon-est-512-maskable.png',
  './apple-touch-icon-est.png',
  './favicon-16.png',
  './favicon-32.png',
  './favicon-48.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  const basePath = scope.pathname.endsWith('/') ? scope.pathname : scope.pathname + '/';
  const memeOrigine = url.origin === scope.origin;
  const accueil = memeOrigine &&
    (url.pathname === basePath || url.pathname === basePath + 'index.html');
  const donnees = memeOrigine && url.pathname === basePath + 'data.json';

  // Les pages PTEM, AMP, RLS et cliniques restent des documents indépendants.
  if (req.mode === 'navigate' && !accueil) return;

  if (accueil || donnees) {
    const cle = accueil ? new Request(new URL('./index.html', scope).href) : req;
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) {
          const copie = res.clone();
          caches.open(CACHE).then(cache => cache.put(cle, copie)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(cle))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(enCache => {
      const reseau = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copie = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copie)).catch(() => {});
        }
        return res;
      }).catch(() => enCache);
      return enCache || reseau;
    })
  );
});
