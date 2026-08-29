// Mise à jour automatique et mode hors ligne du brouillon Montérégie-Est.
// Quand le réseau est disponible, tous les fichiers locaux sont demandés sans utiliser
// le cache HTTP. La copie locale ne sert qu'en cas d'indisponibilité du réseau.
const CACHE_PREFIX = 'monteregie-est-brouillon-';
// v2 : overlays RLS dessinés dans le canvas MapLibre pour supprimer le lag au déplacement.
// v3 : retrait du crédit MSSS/RLS au bas de la carte et nouveau thème Santé Québec
// pour les pages SEO, sans modification des données des cliniques.
// v4 (29 août) : bandeau rose uniformisé sur toutes les pages SEO — l'ancienne formule
// longue a été retirée des 75 pages qui l'avaient encore, il ne reste que le texte court,
// nouvelle bannière PTEM/AMP reconstruite en HTML/CSS d'après la maquette retenue
// (assets/logo-banniere-est.png ajouté), opacité des overlays RLS relevée à 0,21,
// mention « Outil d'aide au PTEM 2027 » ajoutée aux pages guides.
// L'en-tête de la carte n'est volontairement pas modifié.
// Données des cliniques et champ visible strictement inchangés (SHA-256 revérifiées).
// v5 (29 août, suite d'audit) : correctif du survol (le titre de l'en-tête et les liens du
// pied de page devenaient invisibles sur fond foncé), commentaires dépersonnalisés (plus aucun
// nom de personne), code QR des PDF régénéré vers trouvetaclinique.ca/monteregie-est/ (il
// encodait encore une ancienne adresse de dépôt), et retrait des 10 fiches de cliniques
// portant un nom de médecin et ne recrutant pas. Données des cliniques inchangées.
const CACHE = CACHE_PREFIX + 'v5';
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
