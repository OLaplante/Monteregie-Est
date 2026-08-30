// Service worker de l'application autonome Montérégie-Est.
// Le préfixe est propre à ce dépôt afin de ne jamais supprimer les caches d'autres projets
// hébergés sur le même compte GitHub Pages.
const CACHE_PREFIX = 'ptem-2027-est-';
const CACHE = CACHE_PREFIX + 'v53';

const CORE = [
  './',
  './index.html',
  './data.json',
  './territoires-rls-est.js',
  './leaflet.css',
  './leaflet.js',
  './vendor/maplibre-gl.css',
  './vendor/maplibre-gl.js',
  './vendor/leaflet-maplibre-gl.js',
  './manifest.json',
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
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE && key.startsWith(CACHE_PREFIX))
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const scopePath = new URL(self.registration.scope).pathname.replace(/\/?$/, '/');

function cheminRelatif(url) {
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)) return null;
  return url.pathname.slice(scopePath.length);
}

function reseauDabord(request, cacheKey) {
  return fetch(request, { cache: 'no-store' }).then(response => {
    if (response && response.ok) {
      const copie = response.clone();
      caches.open(CACHE).then(cache => cache.put(cacheKey, copie)).catch(() => {});
    }
    return response;
  }).catch(() => caches.match(cacheKey));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const relatif = cheminRelatif(url);
  if (relatif === null) return;

  const estAccueil = relatif === '' || relatif === 'index.html';
  const estMutable = relatif === 'data.json' || relatif === 'territoires-rls-est.js';

  // L'accueil et les données doivent toujours essayer la version en ligne avant le cache.
  if (estAccueil || estMutable) {
    const cle = estAccueil ? './index.html' : './' + relatif;
    event.respondWith(reseauDabord(request, cle));
    return;
  }

  // Les pages de contenu (PTEM, AMP, RLS et fiches) restent de simples documents réseau.
  if (request.mode === 'navigate') return;

  // Ressources statiques : réponse rapide du cache, puis actualisation silencieuse.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      const network = fetch(request).then(response => {
        if (response && response.ok) {
          const copie = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copie)).catch(() => {});
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
