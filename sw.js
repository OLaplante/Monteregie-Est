// Mise à jour automatique et mode hors ligne du brouillon Montérégie-Est.
// Quand le réseau est disponible, tous les fichiers locaux sont demandés sans utiliser
// le cache HTTP. La copie locale ne sert qu'en cas d'indisponibilité du réseau.
const CACHE_PREFIX = 'monteregie-est-brouillon-';
// v2 : overlays RLS dessinés dans le canvas MapLibre pour supprimer le lag au déplacement.
// v3 : retrait du crédit MSSS/RLS au bas de la carte et nouveau thème Santé Québec
// pour les pages SEO, sans modification des données des cliniques.
const CACHE = CACHE_PREFIX + 'v3';
const FICHIERS_INITIAUX = ['./', './index.html', './territoires-rls-est.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(FICHIERS_INITIAUX.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const requete = event.request;
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(cache =>
      fetch(requete, { cache: 'no-store' })
        .then(reponse => {
          if (reponse && reponse.ok) cache.put(requete, reponse.clone()).catch(() => {});
          return reponse;
        })
        .catch(() => cache.match(requete, { ignoreSearch: requete.mode === 'navigate' })
          .then(copie => copie || (requete.mode === 'navigate' ? cache.match('./index.html') : undefined)))
    )
  );
});
