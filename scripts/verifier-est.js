#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const rlsPermis = new Set(['Pierre-Boucher', 'Richelieu-Yamaska', 'Pierre-De Saurel']);
const erreurs = [];

function fichiers(dir) {
  const resultat = [];
  for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entree.name === '.git') continue;
    const absolu = path.join(dir, entree.name);
    if (entree.isDirectory()) resultat.push(...fichiers(absolu));
    else if (entree.isFile()) resultat.push(absolu);
  }
  return resultat;
}

const data = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
const cliniques = data.cliniques || [];
const recruteuses = cliniques.filter(c => c.visible !== false && c.recrutementActif !== false);
const nonRecruteuses = cliniques.filter(c => c.visible === false || c.recrutementActif === false);

if (cliniques.length !== 69) erreurs.push('Le répertoire doit contenir 69 cliniques, trouvé: ' + cliniques.length);
if (recruteuses.length !== 26) erreurs.push('La vue par défaut doit contenir 26 cliniques en recrutement, trouvé: ' + recruteuses.length);
if (nonRecruteuses.length !== 43) erreurs.push('Le répertoire complet doit ajouter 43 cliniques non recruteuses, trouvé: ' + nonRecruteuses.length);

const ids = cliniques.map(c => c.id);
if (new Set(ids).size !== ids.length) erreurs.push('Identifiants de cliniques en double dans data.json.');

const repartitionAttendue = { 'Pierre-Boucher': 22, 'Richelieu-Yamaska': 17, 'Pierre-De Saurel': 4 };
for (const [rls, attendu] of Object.entries(repartitionAttendue)) {
  const trouve = nonRecruteuses.filter(c => c.rls === rls).length;
  if (trouve !== attendu) erreurs.push('Cliniques non recruteuses du RLS ' + rls + ': attendu ' + attendu + ', trouvé ' + trouve);
}

for (const c of cliniques) {
  if (c.region !== 'Est' || !rlsPermis.has(c.rls)) erreurs.push('Clinique hors Est dans data.json: ' + c.nom);
  if (!Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) erreurs.push('Coordonnées invalides: ' + c.nom);
  if (!c.nom || !String(c.nom).trim()) erreurs.push('Nom de clinique manquant pour l’identifiant ' + c.id);
}
for (const c of nonRecruteuses) {
  if (c.visible !== false || c.recrutementActif !== false) erreurs.push('Statut incomplet pour la clinique non recruteuse: ' + c.nom);
  if (c.statutRecrutement !== 'Ne recrute pas actuellement') erreurs.push('Libellé de statut incorrect: ' + c.nom);
  if (!c.adresse || !c.ville || !c.horaire || !Object.keys(c.horaire).length) erreurs.push('Fiche incomplète: ' + c.nom);
}
for (const h of data.hopitaux || []) {
  if (h.region !== 'Est' || !rlsPermis.has(h.rls)) erreurs.push('Hôpital hors Est dans data.json: ' + h.nom);
}

for (const interdit of ['CNAME', 'manifest-est.webmanifest', 'manifestest.webmanifest', 'PTEM2027_v2.gs', 'PTEM2027_saisie_tournee.html', 'collecte-cliniques-monteregie.xlsx']) {
  if (fs.existsSync(path.join(root, interdit))) erreurs.push('Fichier interdit dans le brouillon: ' + interdit);
}

const htmls = fichiers(root).filter(f => f.endsWith('.html'));
for (const fichier of htmls) {
  const html = fs.readFileSync(fichier, 'utf8');
  const rel = path.relative(root, fichier);
  if (!/<meta\b[^>]*name=["']robots["'][^>]*content=["']noindex,nofollow["'][^>]*>/i.test(html) &&
      !/<meta\b[^>]*content=["']noindex,nofollow["'][^>]*name=["']robots["'][^>]*>/i.test(html)) {
    erreurs.push('Balise noindex manquante: ' + rel);
  }
  if (/cloudflareinsights|data-cf-beacon/i.test(html)) erreurs.push('Analytics officiel encore présent: ' + rel);
  if (/\b(?:href|src)="\/(?:monteregie-est|assets|favicon-|apple-touch-icon)/i.test(html)) {
    erreurs.push('Chemin interne non portable: ' + rel);
  }

  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const valeur = match[1].split(/[?#]/)[0];
    if (!valeur || valeur.includes('${') || /^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(valeur)) continue;
    let cible = path.resolve(path.dirname(fichier), valeur);
    if (valeur.endsWith('/')) cible = path.join(cible, 'index.html');
    if (!fs.existsSync(cible)) erreurs.push('Référence locale introuvable dans ' + rel + ': ' + match[1]);
  }
}

const app = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!app.includes('const MODE_EST = true;')) erreurs.push('MODE_EST n’est pas forcé à true.');
if (!app.includes('let showAllClinics = false;')) erreurs.push('La vue initiale n’est pas forcée aux seules cliniques en recrutement.');
if (!app.includes('id="all-clinics-toggle"')) erreurs.push('Bouton « Toutes les cliniques » manquant.');
if (!app.includes('id="all-clinics-info"')) erreurs.push('Bouton d’information des cliniques non recruteuses manquant.');
if (!app.includes('RLS_COLORS_EST_PALES')) erreurs.push('Couleurs pâles des épingles non recruteuses manquantes.');
if (!app.includes('L.maplibreGL({')) erreurs.push('Fond vectoriel MapLibre manquant.');
if (!app.includes('positron-gl-style/style.json')) erreurs.push('Style vectoriel clair CARTO Positron manquant.');
if (!app.includes('dark-matter-gl-style/style.json')) erreurs.push('Style vectoriel sombre CARTO Dark Matter manquant.');
if (!app.includes('function coucheRasterRepli(sombre)')) erreurs.push('Fond raster de secours manquant pour les appareils sans WebGL.');
if (!app.includes("maplibregl.supported()")) erreurs.push('Détection de compatibilité WebGL manquante.');
for (const requis of [
  'vendor/maplibre-gl.css',
  'vendor/maplibre-gl.js',
  'vendor/leaflet-maplibre-gl.js',
  'vendor/LICENSE-maplibre-gl.txt',
  'vendor/LICENSE-maplibre-gl-leaflet.txt'
]) {
  if (!fs.existsSync(path.join(root, requis))) erreurs.push('Dépendance vectorielle manquante: ' + requis);
}

const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
for (const requis of ['vendor/maplibre-gl.css', 'vendor/maplibre-gl.js', 'vendor/leaflet-maplibre-gl.js']) {
  if (!serviceWorker.includes(requis)) erreurs.push('Fichier vectoriel absent du cache PWA: ' + requis);
}

const slugs = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'slugs.json'), 'utf8'));
if (Object.keys(slugs).length !== cliniques.length) erreurs.push('scripts/slugs.json ne couvre pas les 69 cliniques.');
for (const c of cliniques) {
  const slug = slugs[String(c.id)];
  if (!slug) { erreurs.push('Slug manquant pour ' + c.nom); continue; }
  const page = path.join(root, 'cliniques', slug, 'index.html');
  if (!fs.existsSync(page)) erreurs.push('Page statique manquante pour ' + c.nom + ': ' + slug);
}

if (erreurs.length) {
  console.error(erreurs.map(e => '- ' + e).join('\n'));
  process.exit(1);
}

console.log('Vérification réussie.');
console.log((data.cliniques || []).length + ' cliniques, ' + (data.hopitaux || []).length + ' hôpitaux, ' + htmls.length + ' pages HTML.');
