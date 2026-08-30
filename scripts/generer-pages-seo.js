#!/usr/bin/env node
/*
 * GÉNÉRATEUR DE PAGES — Brouillon Montérégie-Est
 * =================================================================
 * Créé le 19 août 2026. Ne dépend d'AUCUNE bibliothèque externe : `node scripts/generer-pages-seo.js`
 * à la racine du dépôt suffit.
 *
 * CE QU'IL FAIT
 *   data.json  ──►  cliniques/index.html              (répertoire Montérégie-Est)
 *                   cliniques/<slug>/index.html       (une page par clinique publiée)
 *                   rls/<slug>/index.html             (les 3 RLS de l'Est)
 *                   rls/index.html                    (hub des RLS)
 *                   sitemap.xml                       (URL du brouillon)
 *
 * POURQUOI
 *   Avant, la liste des cliniques existait en 3 exemplaires tenus à la main (data.json, le bloc
 *   caché de l'accueil, la page /cliniques/). Chaque modification devait être répétée partout et
 *   les copies dérivaient. Désormais data.json est l'UNIQUE source de vérité : on modifie
 *   data.json, on relance ce script, tout le reste se reconstruit.
 *
 * RÈGLES DE SÉCURITÉ DES DONNÉES (à ne pas assouplir sans y réfléchir)
 *   1. LISTE BLANCHE. Seuls les champs listés dans CHAMPS_PUBLICS ci-dessous sortent dans le HTML.
 *      Un nouveau champ ajouté à data.json n'apparaîtra JAMAIS tout seul sur le site public : il
 *      faut l'ajouter ici volontairement. C'est l'inverse d'une liste noire, qui laisserait fuir
 *      tout champ oublié.
 *   2. "notes" NE SORT JAMAIS. C'est le champ réservé aux notes personnelles des usagers.
 *   3. Les fiches "visible: false" sont ignorées partout (page, répertoire, sitemap).
 *   4. Les courriels de recrutement ne sont PAS publiés (voir PUBLIER_COURRIELS).
 *   5. On ne copie jamais le HTML de la fiche de l'application (#dp-body / exportFiche) : cette
 *      fiche contient des éléments propres à l'app (notes, boutons). Les pages ci-dessous sont
 *      construites à partir des DONNÉES, pas de l'affichage.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const SITE = 'https://olaplante.github.io';
const BASE_PATH = '/Monteregie-Est';

/*
 * Badge « Vérifié » — bascule l'infobulle au toucher/clic. Le survol et le focus clavier sont
 * déjà gérés en CSS pure (voir assets/seo-pages.css) ; seul le toucher a besoin de JS, un simple
 * :focus ne se déclenchant pas de façon fiable au tap sur mobile. Ajouté le 26 août 2026, aucune
 * dépendance externe. N'apparaît dans la page que si elle contient au moins un badge (voir
 * l'usage de cette constante dans page() plus bas).
 */
const BADGE_VERIF_SCRIPT = `<script>
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.badge-verif');document.querySelectorAll('.badge-verif.show').forEach(function(x){if(x!==b)x.classList.remove('show')});if(b){e.stopPropagation();b.classList.toggle('show')}});
document.addEventListener('keydown',function(e){if(e.key==='Escape')document.querySelectorAll('.badge-verif.show').forEach(function(b){b.classList.remove('show')})});
</script>`;

/* ------------------------------------------------------------------------------------------- */
/* RÉGLAGES                                                                                     */
/* ------------------------------------------------------------------------------------------- */

/*
 * Publier ou non les courriels de recrutement sur les pages indexables.
 * Choix confirmé le 30 août 2026 : NON. Le dépôt public conserve seulement le nom des
 * responsables du recrutement. Les adresses courriel nominatives sont retirées de data.json et
 * ne doivent pas être remises dans les pages indexables ou dans la carte.
 */
const PUBLIER_COURRIELS = false;

/*
 * Seuil de contenu à partir duquel une page de clinique est jugée assez substantielle pour être
 * proposée à l'indexation. En dessous, la page existe quand même (elle sert au visiteur) mais
 * porte "noindex" et reste hors du sitemap.
 *
 * Pourquoi : au 19 août 2026, 23 fiches sur 61 n'ont que 2 à 4 champs remplis (pas d'horaire, pas
 * d'équipe). 23 pages quasi vides publiées d'un coup, c'est le motif que Google appelle « contenu
 * mince produit à grande échelle » — le risque n'est pas seulement que ces pages ne classent pas,
 * c'est qu'elles tirent le domaine entier vers le bas.
 *
 * Ce seuil est AUTOMATIQUE : dès qu'une fiche se remplit dans data.json et repasse au-dessus, la
 * prochaine génération la bascule en indexable toute seule. Rien à surveiller à la main.
 */
const SEUIL_INDEXATION = 5;

/* Champs comptés pour évaluer la substance d'une fiche (voir SEUIL_INDEXATION). */
const CHAMPS_SUBSTANCE = [
  'adresse', 'horaire', 'personnel', 'dme', 'pratiques', 'niveau',
  'frais', 'bureau', 'site', 'presentation', 'infos', 'gardeUrgence', 'gardeAutre'
];

/*
 * LISTE BLANCHE des champs de data.json autorisés à sortir sur le site public.
 * Tout ce qui n'est pas ici n'est jamais rendu. Volontairement absents :
 *   notes            → notes personnelles des usagers, ne doivent jamais fuir
 *   personneRessource→ courriels de recrutement (voir PUBLIER_COURRIELS)
 *   alias            → mots-clés de recherche interne, pas du contenu
 *   lat / lng        → utiles à la carte, inutiles au lecteur ; restent dans data.json
 *   posApprox        → indicateur technique de précision du géocodage
 *   visible          → drapeau de publication, pas du contenu
 *   recrutementActif → drapeau de statut (même nature que « visible »), voir recrute() plus
 *                      bas ; sert à choisir entre deux textes tout faits, jamais affiché tel quel
 *   statutRecrutement→ texte libre du brouillon d'origine, non repris ; recrute() + un texte fixe
 *                      (« Ne recrute pas actuellement ») suffisent et restent cohérents avec
 *                      l'application (voir index.html)
 */
const CHAMPS_PUBLICS = [
  'id', 'nom', 'ville', 'adresse', 'type', 'region', 'rls', 'niveau', 'niveaux',
  'dme', 'pratiques', 'bureau', 'frais', 'horaire', 'personnel', 'site',
  'porteOuverte', 'presentation', 'infos', 'gardeUrgence', 'gardeAutre',
  /* validation → ajouté le 26 août 2026. N'est PAS affiché comme ligne de fiche ; sert
     uniquement à décider si le badge « Vérifié » apparaît et à afficher sa date (voir
     estValide()/badgeVerif() plus bas). Le sous-champ "source" n'est jamais publié. */
  'validation',
  /* responsableNom → ajouté le 29 août 2026, avec l'accord explicite d'Olivier. Seul le NOM
     du médecin responsable est publié. Le champ personneRessource reste vide dans la version
     publique. Affiché en ligne de fiche
     (« Responsable du recrutement ») et dans le JSON-LD (ContactPoint) — voir pageClinique(). */
  'responsableNom'
];

/*
 * Un milieu « ne recrute pas actuellement » (recrutementActif === false, 27 août 2026 — 43
 * fiches importées du brouillon Montérégie-Est) reste publié : sa page, sa présence
 * dans le répertoire et dans sa page de RLS suivent exactement les mêmes règles qu'un milieu en
 * recrutement (seuil de substance, liste blanche, etc.). Seul le TEXTE change à quelques
 * endroits précis, pour ne jamais affirmer qu'un milieu recrute quand ce n'est pas le cas — voir
 * chaque usage de recrute() ci-dessous.
 */
function recrute(c) { return c.recrutementActif !== false; }

/* Libellés lisibles des codes de pratique (mêmes libellés que la légende de la carte). */
const PRATIQUES = {
  pec:  'Prise en charge',
  gap:  "Guichet d'accès à la première ligne",
  sad:  'Soins à domicile',
  peri: 'Périnatalité',
  msk:  'Médecine sportive',
  chir: 'Chirurgie mineure'
};

/* Libellés lisibles des catégories de personnel. */
const PERSONNEL = {
  medecins: 'Médecins',
  residents: 'Résidents',
  ipspl: 'IPSPL',
  infirmieres: 'Infirmières',
  infauxiliaires: 'Infirmières auxiliaires',
  pharmaciennes: 'Pharmaciennes',
  nutritionnistes: 'Nutritionnistes',
  physiotherapeutes: 'Physiothérapeutes',
  psychologues: 'Psychologues',
  travailleuresSociales: 'Travailleuses sociales',
  intervenantspsychosociaux: 'Intervenants psychosociaux',
  specialistes: 'Spécialistes'
};

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const JOURS_SCHEMA = {
  Lundi: 'Monday', Mardi: 'Tuesday', Mercredi: 'Wednesday', Jeudi: 'Thursday',
  Vendredi: 'Friday', Samedi: 'Saturday', Dimanche: 'Sunday'
};

/* ------------------------------------------------------------------------------------------- */
/* OUTILS                                                                                       */
/* ------------------------------------------------------------------------------------------- */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rempli(v) {
  if (v == null) return false;
  if (typeof v === 'string') {
    const t = v.trim();
    return t !== '' && !['à compléter', 'a completer', 'tbd', 'n/a'].includes(t.toLowerCase());
  }
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v).some(rempli);
  return true;
}

/*
 * Badge « Vérifié » — voir aussi index.html (.badge-verif / estValide / badgeVerifHtml, ajoutés
 * le 26 août 2026 pour l'application). Même logique côté pages statiques : le badge n'apparaît
 * QUE si validation.statut === 'valide' (révision manuelle terminée), jamais sur une simple
 * réponse reçue au formulaire. Champ ajouté volontairement à CHAMPS_PUBLICS ci-dessus — voir la
 * liste blanche — mais UNIQUEMENT pour décider d'afficher ce badge et sa date ; le contenu brut
 * de "validation" n'est jamais affiché comme ligne de la fiche (pas de source/statut visibles).
 */
const MOIS_FR_SEO = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function dateLisibleFr(iso) {
  const m = typeof iso === 'string' && iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const mois = MOIS_FR_SEO[parseInt(m[2], 10) - 1];
  return mois ? `${parseInt(m[3], 10)} ${mois} ${m[1]}` : '';
}
function estValide(c) { return !!(c && c.validation && c.validation.statut === 'valide'); }
const SVG_BADGE_VERIF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>';
function badgeVerif(c) {
  if (!estValide(c)) return '';
  const date = dateLisibleFr(c.validation.date);
  const msg = 'Informations confirmées par la clinique via le formulaire.'
    + (date ? ' Dernière validation : ' + date + '.' : '');
  return `<button type="button" class="badge-verif" title="${esc(msg)}" aria-label="${esc(msg)}"><span class="badge-verif-tip" aria-hidden="true">${esc(msg)}</span>${SVG_BADGE_VERIF}</button>`;
}

/* Slug lisible et stable : minuscules, sans accent, tirets. Le contenu entre parenthèses est
   CONSERVÉ — c'est parfois la seule chose qui distingue deux fiches (« GMF Saint-Constant
   (Monchamp) » et « GMF Saint-Constant (de la gare) »). */
function slugifier(nom) {
  return String(nom)
    /* Les ligatures "oe"/"ae" (27 aout 2026) ne sont pas des lettres accentuees : NFD ne les
       decompose pas, elles survivraient donc telles quelles jusqu'au filtre [^a-z0-9] suivant et
       tomberaient comme un tiret ("Coeur" -> "c-ur"). Repris de la meme normalisation que
       normTxt() dans index.html (recherche), pour que "coeur" reste lisible dans l'URL plutot
       qu'un tiret au milieu du mot. */
    .replace(/\u0153/g, 'oe').replace(/\u0152/g, 'Oe').replace(/\u00e6/g, 'ae').replace(/\u00c6/g, 'Ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80).replace(/-+$/, '');
}

/*
 * Anciennes URL créées avant la prise en charge des ligatures « œ ». Elles ont déjà été publiées
 * et peuvent donc exister dans des favoris ou dans l'index d'un moteur de recherche : on ne les
 * supprime pas, on les transforme en redirections permanentes côté contenu vers le slug corrigé.
 */
const REDIRECTIONS_SLUGS_HISTORIQUES = [
  {
    ancien: 'cabinet-medical-au-c-ur-des-vergers',
    nouveau: 'cabinet-medical-au-coeur-des-vergers',
    libelle: 'La fiche du Cabinet Médical au Cœur des Vergers'
  },
  {
    ancien: 'cmi-contrec-ur',
    nouveau: 'cmi-contrecoeur',
    libelle: 'La fiche du CMI Contrecœur'
  },
  {
    ancien: 'gmf-contrec-ur-cooperative-sante-contrec-ur',
    nouveau: 'gmf-contrecoeur-cooperative-sante-contrecoeur',
    libelle: 'La fiche du GMF Contrecœur (Coopérative Santé Contrecœur)'
  },
  /* 29 août 2026 : suppression du doublon technique id 89. L'ancienne URL est conservée comme
     redirection vers le GMF Richelieu canonique, au 500, route Marie-Victorin, bureau 200.
     La clinique distincte du 300, rue Paradis demeure publiée sous sa propre fiche (id 86). */
  {
    ancien: 'gmf-richelieu-clinique-de-medecine-familiale',
    nouveau: 'gmf-richelieu',
    libelle: 'La fiche du GMF Richelieu'
  }
];

/*
 * Slugs STABLES. Une URL déjà indexée par Google ne doit pas changer parce qu'on a corrigé une
 * faute dans le nom d'une clinique. On garde donc une correspondance id → slug dans
 * scripts/slugs.json : une fois qu'un identifiant a reçu son slug, il le garde pour toujours.
 * Seules les fiches nouvelles reçoivent un slug calculé.
 */
function chargerSlugs(fichier) {
  try { return JSON.parse(fs.readFileSync(fichier, 'utf8')); }
  catch (e) { return {}; }
}

function attribuerSlugs(cliniques, memoire) {
  const pris = new Set(Object.values(memoire));
  const nouveaux = [];
  for (const c of cliniques) {
    const cle = String(c.id);
    if (memoire[cle]) continue;             // déjà attribué : on n'y touche jamais
    let base = slugifier(c.nom) || ('clinique-' + cle);
    let slug = base, n = 2;
    while (pris.has(slug)) { slug = base + '-' + n; n++; }
    memoire[cle] = slug;
    pris.add(slug);
    nouveaux.push({ id: cle, nom: c.nom, slug });
  }
  return nouveaux;
}

/* Découpe l'adresse pour schema.org sans jamais inventer. Le code postal n'est extrait que s'il
   correspond exactement au format canadien ; la ville vient du champ « ville », pas d'une
   supposition sur la chaîne. Si on ne sait pas découper, on omet le morceau. */
function decouperAdresse(adresse, ville) {
  const out = { addressLocality: ville || undefined, addressRegion: 'QC', addressCountry: 'CA' };
  if (!rempli(adresse)) return out;
  let reste = String(adresse).trim();
  const cp = reste.match(/\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/);
  if (cp) { out.postalCode = cp[1]; reste = reste.replace(cp[0], ''); }
  reste = reste.replace(/\bQC\b|\bQu[ée]bec\b/gi, '');
  if (ville) reste = reste.replace(new RegExp('\\b' + ville.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), '');
  reste = reste.replace(/[,\s]+$/g, '').replace(/^[,\s]+/g, '').replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',');
  if (reste) out.streetAddress = reste;
  return out;
}

/* « 8h00 – 20h00 » → { opens:'08:00', closes:'20:00' }. Gère les journées coupées
   (« 8h30 – 11h45 / 13h00 – 16h30 » → deux plages). Tout ce qui n'est pas une plage horaire
   claire (« Fermé », « Urgence sur RDV seulement ») ne produit RIEN plutôt qu'une approximation. */
function analyserPlages(texte) {
  const plages = [];
  for (const morceau of String(texte).split('/')) {
    const m = morceau.match(/(\d{1,2})\s*h\s*(\d{2})?\s*[–\-—]\s*(\d{1,2})\s*h\s*(\d{2})?/);
    if (!m) continue;
    const p = (h, min) => String(h).padStart(2, '0') + ':' + (min || '00');
    plages.push({ opens: p(m[1], m[2]), closes: p(m[3], m[4]) });
  }
  return plages;
}

/* ------------------------------------------------------------------------------------------- */
/* GABARIT COMMUN                                                                               */
/* ------------------------------------------------------------------------------------------- */

/*
 * Ce dépôt ne connaît qu'un seul univers. Le préfixe correspond au sous-chemin GitHub Pages
 * du brouillon. Les pages sont écrites à la racine du dépôt et tous leurs liens restent dans
 * Montérégie-Est.
 */
const UNIVERS_EST = {
  regional: true,
  region: 'Est',
  nom: 'Montérégie-Est',
  prefixe: BASE_PATH,
  accueil: BASE_PATH + '/',
  dossier: '',
  marque: 'Trouve ta clinique — Montérégie-Est',
  canonique: true,
  ordreRls: ['Pierre-Boucher', 'Richelieu-Yamaska', 'Pierre-De Saurel'],
  banniere: { fichier: 'banniere_monteregie-est.png', largeur: '1600', hauteur: '400' }
};
const UNIVERS_GENERAL = UNIVERS_EST;
const UNIVERS_REGIONS = [UNIVERS_EST];
const UNIVERS_PAR_REGION = { Est: UNIVERS_EST };

function page({ titre, description, url, profondeur, indexable = true, canonical, jsonLd,
                filDAriane, corps, actif, univers = UNIVERS_GENERAL }) {
  const u = univers;
  const cssHref = `${BASE_PATH}/assets/seo-pages.css`;
  const robots = 'noindex,nofollow,noarchive';
  const ogImage = `${SITE}${BASE_PATH}/assets/${u.banniere.fichier}`;
  const ogImageW = u.banniere ? u.banniere.largeur : '1200';
  const ogImageH = u.banniere ? u.banniere.hauteur : '630';
  const ogImageAlt = `Carte interactive ${u.nom} — Trouve ta clinique.`;
  const liens = [[u.accueil, 'Carte ' + u.nom, 'carte'],
    [u.prefixe + '/cliniques/', 'Cliniques', 'cliniques'],
    [u.prefixe + '/ptem/', 'PTEM', 'ptem'],
    [u.prefixe + '/amp/', 'AMP', 'amp']];
  const nav = liens.map(([href, txt, cle]) =>
    `      <a href="${href}"${actif === cle ? ' aria-current="page"' : ''}>${txt}</a>`).join('\n');

  return `<!doctype html>
<html lang="fr-CA">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(titre)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(canonical || url)}">
  <meta name="robots" content="${robots}">
  <meta property="og:locale" content="fr_CA">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Trouve ta clinique">
  <meta property="og:title" content="${esc(titre)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="${ogImageW}">
  <meta property="og:image:height" content="${ogImageH}">
  <meta property="og:image:alt" content="${esc(ogImageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(titre)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${ogImage}">
  <link rel="icon" type="image/png" sizes="32x32" href="${BASE_PATH}/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="${BASE_PATH}/favicon-16.png">
  <link rel="icon" type="image/png" sizes="48x48" href="${BASE_PATH}/favicon-48.png">
  <link rel="apple-touch-icon" href="${BASE_PATH}/apple-touch-icon-est.png">
  <link rel="stylesheet" href="${cssHref}">
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2).split('\n').map(l => '  ' + l).join('\n')}
  </script>
</head>
<body>
<a class="skip-link" href="#contenu">Aller au contenu</a>
<header class="site-header">
  <div class="site-header__inner">
    <a class="brand" href="${u.accueil}">${esc(u.marque)}</a>
    <nav class="nav" aria-label="Navigation principale">
${nav}
    </nav>
  </div>
</header>
<main id="contenu">
  <nav class="breadcrumbs" aria-label="Fil d’Ariane">${filDAriane}</nav>
${corps}
</main>
<footer class="site-footer"><div class="site-footer__inner">Trouve ta clinique est un outil d’information et de comparaison, indépendant du gouvernement du Québec et des DTMF. Les fiches regroupent les données du répertoire, des sources publiques et, lorsqu’elles sont disponibles, des informations communiquées par les milieux. Ces renseignements peuvent changer; pour toute décision officielle, validez l’information auprès du milieu, du DTMF ou des sources gouvernementales compétentes.<div class="site-footer__copyright">© ${new Date().getFullYear()} Olivier Laplante — Trouve ta clinique</div></div></footer>
${corps.includes('badge-verif') ? BADGE_VERIF_SCRIPT + '\n' : ''}
</body>
</html>
`;
}

/* ------------------------------------------------------------------------------------------- */
/* PAGE D'UNE CLINIQUE                                                                          */
/* ------------------------------------------------------------------------------------------- */

function pageClinique(c, slug, majDonnees, u = UNIVERS_GENERAL) {
  const url = `${SITE}${u.prefixe}/cliniques/${slug}/`;
  const substance = CHAMPS_SUBSTANCE.filter(k => rempli(c[k])).length;
  const assezRemplie = substance >= SEUIL_INDEXATION;
  const enRecrutement = recrute(c);
  const canonical = url;
  /* Le brouillon entier reste volontairement hors index. `assezRemplie` est conservé dans le
     rapport pour signaler les fiches à enrichir avant une éventuelle publication officielle. */
  const indexable = false;

  /* --- Renseignements, champ par champ, uniquement depuis la liste blanche --- */
  const lignes = [];
  const ajouter = (etiquette, valeur) => {
    if (rempli(valeur)) lignes.push(`      <dt>${esc(etiquette)}</dt><dd>${valeur}</dd>`);
  };

  ajouter('Type de milieu', esc(c.type));
  ajouter('Ville', esc(c.ville));
  ajouter('Adresse', esc(c.adresse));
  ajouter('Territoire', rempli(c.region) ? esc('Montérégie-' + c.region) : '');
  ajouter('Réseau local de services (RLS)', rempli(c.rls)
    ? `<a href="${u.prefixe}/rls/${slugifier(c.rls)}/">${esc(c.rls)}</a>` : '');
  ajouter('Niveau', esc(c.niveau));
  ajouter('Dossier médical électronique (DMÉ)', esc(c.dme));

  if (Array.isArray(c.pratiques) && c.pratiques.length) {
    ajouter('Pratiques offertes',
      esc(c.pratiques.map(p => PRATIQUES[p] || p).join(', ')));
  }
  ajouter('Bureau', esc(c.bureau));
  ajouter('Frais de bureau', esc(c.frais));
  ajouter('Garde à l’urgence', esc(c.gardeUrgence));
  ajouter('Autres gardes', esc(c.gardeAutre));
  ajouter('Porte ouverte', esc(c.porteOuverte));
  ajouter('Site web', rempli(c.site)
    ? `<a href="${esc(c.site)}" rel="noopener nofollow" target="_blank">${esc(c.site)}</a>` : '');
  if (rempli(c.responsableNom)) {
    ajouter('Responsable du recrutement', esc(c.responsableNom));
  }
  if (PUBLIER_COURRIELS && rempli(c.personneRessource)) {
    ajouter('Contact recrutement', esc(c.personneRessource));
  }

  /* --- Horaires --- */
  let blocHoraire = '';
  if (rempli(c.horaire)) {
    const rangs = JOURS.filter(j => rempli(c.horaire[j]))
      .map(j => `        <tr><th scope="row">${j}</th><td>${esc(c.horaire[j])}</td></tr>`).join('\n');
    if (rangs) {
      blocHoraire = `
  <section id="horaire">
    <h2>Heures d’ouverture</h2>
    <table class="horaire">
      <tbody>
${rangs}
      </tbody>
    </table>
  </section>`;
    }
  }

  /* --- Équipe --- */
  let blocEquipe = '';
  if (rempli(c.personnel)) {
    const items = Object.keys(PERSONNEL).filter(k => rempli(c.personnel[k]))
      .map(k => `      <li><span class="eq-n">${esc(c.personnel[k])}</span> ${esc(PERSONNEL[k])}</li>`).join('\n');
    if (items) {
      blocEquipe = `
  <section id="equipe">
    <h2>Équipe sur place</h2>
    <ul class="equipe">
${items}
    </ul>
    <p class="note">Composition indiquée dans le répertoire; à confirmer auprès du milieu, puisqu’elle peut évoluer.</p>
  </section>`;
    }
  }

  /* --- Texte libre du milieu (vide pour l'instant dans data.json, apparaîtra tout seul) --- */
  let blocTexte = '';
  if (rempli(c.presentation) || rempli(c.infos)) {
    blocTexte = `
  <section id="presentation">
    <h2>Présentation du milieu</h2>
${rempli(c.presentation) ? '    <p>' + esc(c.presentation) + '</p>' : ''}
${rempli(c.infos) ? '    <p>' + esc(c.infos) + '</p>' : ''}
  </section>`;
  }

  /* --- Données structurées : uniquement ce qu'on sait réellement --- */
  const clinique = {
    '@type': 'MedicalClinic',
    '@id': url + '#clinique',
    name: c.nom,
    url: url,
    address: Object.assign({ '@type': 'PostalAddress' }, decouperAdresse(c.adresse, c.ville))
  };
  if (rempli(c.site)) clinique.sameAs = [c.site];
  if (typeof c.lat === 'number' && typeof c.lng === 'number') {
    clinique.geo = { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lng };
  }
  if (rempli(c.horaire)) {
    const specs = [];
    for (const j of JOURS) {
      for (const p of analyserPlages(c.horaire[j] || '')) {
        specs.push({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: 'https://schema.org/' + JOURS_SCHEMA[j],
          opens: p.opens, closes: p.closes
        });
      }
    }
    if (specs.length) clinique.openingHoursSpecification = specs;
  }
  /* Nom du responsable du recrutement (29 août 2026) : uniquement le nom, jamais le courriel
     brut, conformément à la règle d'or — aucune identité personnelle autre que le nom du
     médecin responsable, déjà public par ailleurs. */
  if (rempli(c.responsableNom)) {
    clinique.contactPoint = [{
      '@type': 'ContactPoint',
      contactType: 'recrutement médical',
      name: c.responsableNom
    }];
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url + '#webpage',
        url: url,
        name: enRecrutement
          ? `${c.nom} — clinique en recrutement en Montérégie-Est | Trouve ta clinique`
          : `${c.nom} — clinique de la Montérégie-Est | Trouve ta clinique`,
        inLanguage: 'fr-CA',
        dateModified: majDonnees,
        isPartOf: { '@id': SITE + BASE_PATH + '/#website' },
        about: { '@id': url + '#clinique' }
      },
      clinique,
      {
        '@type': 'BreadcrumbList',
        itemListElement: u.regional
          ? [
            { '@type': 'ListItem', position: 1, name: u.nom, item: SITE + u.accueil },
            { '@type': 'ListItem', position: 2, name: 'RLS ' + c.rls, item: `${SITE}${u.prefixe}/rls/${slugifier(c.rls || '')}/` },
            { '@type': 'ListItem', position: 3, name: c.nom, item: url }
          ]
          : [
            { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
            { '@type': 'ListItem', position: 2, name: 'Cliniques', item: SITE + '/cliniques/' },
            { '@type': 'ListItem', position: 3, name: c.nom, item: url }
          ]
      }
    ]
  };

  /* 27 août 2026 : un milieu qui ne recrute pas actuellement n'a pas de courriel de recrutement
     à joindre (voir data.json — personneRessource y est vide sur ces 43 fiches). Le bandeau de
     contact est donc remplacé par une simple mention de statut, jamais affiché comme un appel à
     contacter le milieu au sujet d'un recrutement qui n'a pas lieu. */
  const contact = !enRecrutement
    ? `
  <div class="callout"><strong>Ne recrute pas actuellement :</strong> ce milieu est publié à titre de référence dans le répertoire. Consultez la carte interactive pour connaître les milieux du secteur qui recrutent actuellement.</div>`
    : PUBLIER_COURRIELS
    ? ''
    : `
  <div class="callout"><strong>Pour joindre ce milieu au sujet du recrutement :</strong> les coordonnées de la personne-ressource sont affichées dans la fiche de la clinique sur la carte interactive. <a href="${u.accueil}?c=${c.id}">Ouvrir la fiche de ${esc(c.nom)} sur la carte →</a></div>`;

  const corps = `  <section class="hero">
    <p class="eyebrow">${esc(c.type)}${rempli(c.rls) ? ' · RLS ' + esc(c.rls) : ''}${enRecrutement ? '' : ' · Ne recrute pas actuellement'}</p>
    <h1>${esc(c.nom)}${badgeVerif(c)}</h1>
    <p class="lead">${enRecrutement
      ? `${esc(c.nom)} — ${esc(c.type)} situé à ${esc(c.ville)}, en Montérégie-Est — recrute des médecins de famille. Cette page rassemble les renseignements actuellement publiés dans le répertoire pour aider à évaluer le milieu avant de le contacter.`
      : `${esc(c.nom)} — ${esc(c.type)} situé à ${esc(c.ville)}, en Montérégie-Est. Ce milieu ne recrute pas de médecin de famille actuellement; cette page rassemble les renseignements publiés dans le répertoire à titre de référence.`}</p>
    <p class="updated"><strong>Données mises à jour le :</strong> ${esc(majDonnees)}.</p>
    <div class="cta-row">
      <a class="button primary" href="${u.accueil}?c=${c.id}">Voir sur la carte interactive</a>
      ${u.regional
        ? `<a class="button secondary" href="${u.prefixe}/rls/${slugifier(c.rls || '')}/">Autres cliniques du RLS ${esc(c.rls)}</a>`
        : `<a class="button secondary" href="/cliniques/">Toutes les cliniques</a>`}
    </div>
  </section>
${contact}
  <section id="renseignements">
    <h2>Renseignements</h2>
    <dl class="fiche">
${lignes.join('\n')}
    </dl>
  </section>${blocHoraire}${blocEquipe}${blocTexte}
  <div class="data-note"><strong>Source et vérification :</strong> cette fiche reproduit les données actuellement consignées dans le répertoire (date de mise à jour affichée ci-dessus). Certains champs peuvent provenir de sources publiques ou d’informations communiquées par le milieu. Lorsqu’un site officiel est disponible, il est lié dans la section « Renseignements ». Les éléments susceptibles d’évoluer — DMÉ, équipe, frais, horaires et pratiques offertes — doivent être confirmés auprès du milieu; pour le PTEM et les AMP, les sources officielles et le DTMF priment.</div>

  <section id="suite">
    <h2>Pour aller plus loin</h2>
    <ul class="source-list">
      <li><a href="${u.prefixe}/rls/${slugifier(c.rls || '')}/">Autres milieux du RLS ${esc(c.rls)}</a></li>
      <li><a href="${u.prefixe}/ptem/">Comprendre le PTEM et l’avis de conformité</a></li>
      <li><a href="${u.prefixe}/amp/">Comprendre les activités médicales particulières (AMP)</a></li>
      <li><a href="${u.accueil}?c=${c.id}">Fiche complète et itinéraire sur la carte interactive</a></li>
    </ul>
  </section>`;

  return {
    html: page({
      titre: `${c.nom} — ${c.ville} | Trouve ta clinique`,
      description: enRecrutement
        ? `${c.nom}, ${c.type} de ${c.ville} (RLS ${c.rls}) en recrutement de médecins de famille en Montérégie-Est : type de milieu, pratiques offertes${rempli(c.dme) ? ', DMÉ' : ''}${rempli(c.horaire) ? ', heures d’ouverture' : ''}.`
        : `${c.nom}, ${c.type} de ${c.ville} (RLS ${c.rls}) en Montérégie-Est — ne recrute pas de médecin de famille actuellement : type de milieu, coordonnées et heures d’ouverture publiées à titre de référence.`,
      url, canonical, profondeur: 2, indexable, jsonLd, univers: u,
      actif: u.regional ? null : 'cliniques',
      filDAriane: u.regional
        ? `<a href="${u.accueil}">${esc(u.nom)}</a> › <a href="${u.prefixe}/rls/${slugifier(c.rls || '')}/">RLS ${esc(c.rls)}</a> › ${esc(c.nom)}`
        : `<a href="/">Accueil</a> › <a href="/cliniques/">Cliniques</a> › ${esc(c.nom)}`,
      corps
    }),
    indexable, substance
  };
}

/* ------------------------------------------------------------------------------------------- */
/* PAGE D'UN RLS                                                                                */
/* ------------------------------------------------------------------------------------------- */

/*
 * Les 3 RLS de la Montérégie-Est. Choix du 21 août 2026, affiné le même jour après
 * une suggestion reçue : sur CES pages RLS-là uniquement, on ne renvoie plus vers
 * /cliniques/ (le répertoire des TROIS territoires) — pour ne jamais offrir, même indirectement
 * (via le menu discret « i » de /monteregie-est/ → une de ces 3 pages), un chemin de clic vers les
 * cliniques des autres territoires. Contrairement au premier réflexe (retirer purement et
 * simplement le lien), on le REMPLACE par un lien vers /monteregie-est/ : les pages restent
 * indexables et gardent leur valeur SEO (le maillage interne du site n'est pas amputé), mais pour
 * un visiteur humain qui vient de l'univers Montérégie-Est, tout reste fermé sur ce territoire —
 * fil d'Ariane et bouton renvoient vers la carte Est plutôt que vers le répertoire des 3
 * territoires. Ces 3 RLS sont d'ailleurs exclusivement Montérégie-Est : aucune de leurs cliniques
 * n'appartient à un autre territoire, donc ce cadrage reste cohérent même pour un visiteur venu de
 * la carte générale.
 */
/* Territoire de chaque RLS — DÉDUIT de data.json plutôt qu'écrit à la main : un RLS
   appartient à un seul CISSS, et la liste bougerait à chaque territoire ajouté. Si un RLS
   apparaissait un jour à cheval sur deux territoires (erreur de saisie la plus probable), on
   s'arrête net : tout le cadrage régional en dépend. */
let REGION_DU_RLS = {};
function indexerRlsParRegion(cliniques) {
  const vu = {};
  for (const c of cliniques) {
    if (!rempli(c.rls) || !rempli(c.region)) continue;
    if (vu[c.rls] && vu[c.rls] !== c.region) {
      throw new Error(`RLS « ${c.rls} » rattaché à deux territoires (${vu[c.rls]} et ${c.region}) ` +
                      'dans data.json — corriger la donnée avant de régénérer les pages.');
    }
    vu[c.rls] = c.region;
  }
  REGION_DU_RLS = vu;
}

function pageRls(rls, liste, slugs, majDonnees, u = UNIVERS_GENERAL) {
  const slug = slugifier(rls);
  const url = `${SITE}${u.prefixe}/rls/${slug}/`;
  const canonical = url;
  const indexable = false;
  const villes = [...new Set(liste.map(c => c.ville))].sort((a, b) => a.localeCompare(b, 'fr'));
  const types = [...new Set(liste.map(c => c.type))].sort((a, b) => a.localeCompare(b, 'fr'));
  const prats = [...new Set(liste.flatMap(c => c.pratiques || []))].map(p => PRATIQUES[p] || p).sort();

  /* 27 août 2026 : un RLS peut désormais contenir des milieux qui ne recrutent pas actuellement
     (recrutementActif:false). Ils restent publiés — chacun a sa propre page — mais dans une
     section séparée, sous un titre distinct, pour ne jamais gonfler le compte « qui recrutent »
     annoncé dans le titre et le résumé de cette page. */
  const actifs = liste.filter(recrute);
  const inactifs = liste.filter(c => !recrute(c));
  const villesActifs = [...new Set(actifs.map(c => c.ville))].sort((a, b) => a.localeCompare(b, 'fr'));

  // NB : le badge est un frère de <a>, jamais imbriqué dedans — un <button> à l'intérieur d'un
  // <a> est du HTML invalide (contenu interactif imbriqué) et casserait le clic/le focus.
  const item = c => `      <li>
        <a href="${u.prefixe}/cliniques/${slugs[String(c.id)]}/"><strong>${esc(c.nom)}</strong></a>${badgeVerif(c)}
        <span class="rep-meta">${esc(c.ville)} · ${esc(c.type)}${rempli(c.dme) ? ' · DMÉ ' + esc(c.dme) : ''}${recrute(c) ? '' : ' · Ne recrute pas actuellement'}</span>
      </li>`;
  const items = actifs.map(item).join('\n');
  const itemsInactifs = inactifs.map(item).join('\n');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', '@id': url + '#webpage', url,
        name: `Cliniques en recrutement — RLS ${rls} | Trouve ta clinique`,
        inLanguage: 'fr-CA', dateModified: majDonnees,
        isPartOf: { '@id': SITE + BASE_PATH + '/#website' }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: u.regional ? [
          { '@type': 'ListItem', position: 1, name: u.nom, item: SITE + u.accueil },
          { '@type': 'ListItem', position: 2, name: 'RLS ' + rls, item: url }
        ] : [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Cliniques', item: SITE + '/cliniques/' },
          { '@type': 'ListItem', position: 3, name: 'RLS ' + rls, item: url }
        ]
      }
    ]
  };

  const corps = `  <section class="hero">
    <p class="eyebrow">Réseau local de services · Montérégie-Est</p>
    <h1>Cliniques en recrutement — RLS ${esc(rls)}</h1>
    <p class="lead">${actifs.length} milieu${actifs.length > 1 ? 'x' : ''} du réseau local de services ${esc(rls)} recrute${actifs.length > 1 ? 'nt' : ''} actuellement des médecins de famille, réparti${actifs.length > 1 ? 's' : ''} dans ${villesActifs.length} municipalité${villesActifs.length > 1 ? 's' : ''} : ${esc(villesActifs.join(', '))}.${inactifs.length ? ` Le RLS compte aussi ${inactifs.length} autre${inactifs.length > 1 ? 's' : ''} milieu${inactifs.length > 1 ? 'x' : ''} publié${inactifs.length > 1 ? 's' : ''} à titre de référence, qui ${inactifs.length > 1 ? 'ne recrutent' : 'ne recrute'} pas actuellement.` : ''}</p>
    <p class="updated"><strong>Données mises à jour le :</strong> ${esc(majDonnees)}.</p>
    <div class="cta-row">
      <a class="button primary" href="${u.accueil}">Voir ce RLS sur la carte</a>
      ${u.regional
        ? `<a class="button secondary" href="${u.prefixe}/ptem/">Comprendre le PTEM</a>`
        : `<a class="button secondary" href="/cliniques/">Toutes les cliniques</a>`}
    </div>
  </section>

  <div class="callout official"><strong>Pourquoi le RLS compte :</strong> l’avis de conformité PTEM précise la région ou le sous-territoire où le médecin doit réaliser au moins 55 % de ses jours de facturation. Le choix du RLS se fait donc en même temps que celui du milieu. <a href="${u.prefixe}/ptem/">Comprendre le PTEM →</a> <a class="source-chip" href="https://www.quebec.ca/gouvernement/travailler-gouvernement/sante-services-sociaux/travailler-comme-medecin-famille-quebec/plans-regionaux-effectifs-medicaux-medecine-famille" rel="noopener">Source officielle</a></div>

  <section id="milieux">
    <h2>Les ${actifs.length} milieu${actifs.length > 1 ? 'x' : ''} qui recrutent</h2>
    <ul class="repertoire">
${items}
    </ul>
  </section>
${inactifs.length ? `
  <section id="autres-milieux">
    <h2>Autres milieux du RLS <span class="compte">${inactifs.length}</span></h2>
    <p class="note">Publiés à titre de référence; ils ne recrutent pas de médecin de famille pour le moment.</p>
    <ul class="repertoire">
${itemsInactifs}
    </ul>
  </section>
` : ''}
  <section id="apercu">
    <h2>Aperçu du territoire</h2>
    <dl class="fiche">
      <dt>Types de milieux représentés</dt><dd>${esc(types.join(', '))}</dd>
      <dt>Municipalités</dt><dd>${esc(villes.join(', '))}</dd>
${prats.length ? `      <dt>Pratiques offertes dans le RLS</dt><dd>${esc(prats.join(', '))}</dd>` : ''}
    </dl>
    <p class="note">Ces éléments sont calculés à partir des fiches publiées ci-dessus; ils décrivent les milieux répertoriés par Trouve ta clinique, pas l’ensemble de l’offre du territoire.</p>
  </section>`;

  return { indexable, html: page({
    titre: `Cliniques en recrutement — RLS ${rls} (Montérégie-Est) | Trouve ta clinique`,
    description: `Les ${actifs.length} cliniques en recrutement de médecins de famille du RLS ${rls}, en Montérégie-Est : ${villesActifs.slice(0, 4).join(', ')}. Type de milieu, pratiques et fiche détaillée pour chacune.${inactifs.length ? ` ${inactifs.length} autre(s) milieu(x) du RLS, publiés à titre de référence, ne recrutent pas actuellement.` : ''}`,
    url, canonical, profondeur: 2, indexable, jsonLd, univers: u,
    actif: u.regional ? null : 'cliniques',
    filDAriane: u.regional
      ? `<a href="${u.accueil}">${esc(u.nom)}</a> › RLS ${esc(rls)}`
      : `<a href="/">Accueil</a> › <a href="/cliniques/">Cliniques</a> › RLS ${esc(rls)}`,
    corps
  }) };
}

/* ------------------------------------------------------------------------------------------- */
/* HUB /rls/ : les 3 RLS de la Montérégie-Est                                                   */
/* ------------------------------------------------------------------------------------------- */

/* Le hub ne liste que les trois RLS autorisés par UNIVERS_EST. */
function pageRlsHubRegion(u, parRls, majDonnees) {
  const url = `${SITE}${u.prefixe}/rls/`;

  const rangRls = rls => { const i = u.ordreRls.indexOf(rls); return i === -1 ? 99 : i; };
  const rlsPresents = [...parRls.keys()]
    .filter(rls => REGION_DU_RLS[rls] === u.region)
    .sort((a, b) => rangRls(a) - rangRls(b) || a.localeCompare(b, 'fr'));

  /* Ce hub reste focalisé sur le recrutement (voir son titre et son texte) : le compte affiché
     par RLS, et le total ci-dessous, ne portent donc que sur les milieux en recrutement — les
     milieux qui ne recrutent pas actuellement (recrutementActif:false) restent listés sur leur
     propre page de RLS (voir pageRls), pas ici. */
  const sections = rlsPresents.map(rls => {
    const liste = parRls.get(rls).filter(recrute);
    const villes = [...new Set(liste.map(c => c.ville))].sort((a, b) => a.localeCompare(b, 'fr'));
    return `  <section id="rls-${slugifier(rls)}">
    <h2>RLS ${esc(rls)} <span class="compte">${liste.length}</span></h2>
    <p class="rep-lien">${esc(villes.join(', '))}</p>
    <p class="rep-lien"><a href="${u.prefixe}/rls/${slugifier(rls)}/">Voir les ${liste.length} milieu${liste.length > 1 ? 'x' : ''} en recrutement du RLS ${esc(rls)} →</a></p>
  </section>`;
  }).join('\n\n');

  const total = rlsPresents.reduce((n, rls) => n + parRls.get(rls).filter(recrute).length, 0);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', '@id': url + '#webpage', url,
        name: `Réseaux locaux de services (RLS) — ${u.nom} | Trouve ta clinique`,
        inLanguage: 'fr-CA', dateModified: majDonnees,
        isPartOf: { '@id': SITE + BASE_PATH + '/#website' }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: u.nom, item: SITE + u.accueil },
          { '@type': 'ListItem', position: 2, name: 'RLS', item: url }
        ]
      }
    ]
  };

  const corps = `  <section class="hero">
    <p class="eyebrow">Réseaux locaux de services · ${esc(u.nom)}</p>
    <h1>Les RLS de la ${esc(u.nom)}</h1>
    <p class="lead">Le territoire de la ${esc(u.nom)} compte <strong>${rlsPresents.length} ${rlsPresents.length > 1 ? 'réseaux locaux' : 'réseau local'} de services</strong>, avec au total ${total} milieu${total > 1 ? 'x' : ''} actuellement en recrutement de médecins de famille.</p>
    <p class="updated"><strong>Données mises à jour le :</strong> ${esc(majDonnees)}.</p>
    <div class="cta-row">
      <a class="button primary" href="${u.accueil}">Voir sur la carte interactive</a>
      <a class="button secondary" href="${u.prefixe}/ptem/">Comprendre le PTEM</a>
    </div>
  </section>

${sections}`;

  return page({
    titre: `Réseaux locaux de services (RLS) — ${u.nom} | Trouve ta clinique`,
    description: `Les ${rlsPresents.length} RLS de la ${u.nom} et leurs milieux en recrutement de médecins de famille.`,
    url, profondeur: 1, indexable: false, jsonLd, univers: u, actif: null,
    filDAriane: `<a href="${u.accueil}">${esc(u.nom)}</a> › RLS`,
    corps
  });
}

/* ------------------------------------------------------------------------------------------- */
/* RÉPERTOIRE /cliniques/                                                                       */
/* ------------------------------------------------------------------------------------------- */

/* Répertoire strictement limité à l'univers Montérégie-Est. */
function pageRepertoire(cliniques, slugs, parRls, majDonnees, u = null) {
  const prefixe = u ? u.prefixe : '';
  const nomTerritoire = u ? u.nom : 'Montérégie';
  const url = `${SITE}${prefixe}/cliniques/`;
  const villes = new Set(cliniques.map(c => c.ville));

  const enRecrutementTotal = cliniques.filter(recrute).length;
  const sections = [...parRls.keys()].sort((a, b) => a.localeCompare(b, 'fr')).map(rls => {
    const liste = parRls.get(rls);
    const items = liste.map(c => `      <li>
        <a href="${prefixe}/cliniques/${slugs[String(c.id)]}/"><strong>${esc(c.nom)}</strong></a>${badgeVerif(c)}
        <span class="rep-meta">${esc(c.ville)} · ${esc(c.type)}${recrute(c) ? '' : ' · Ne recrute pas actuellement'}</span>
      </li>`).join('\n');
    return `  <section id="rls-${slugifier(rls)}">
    <h2>RLS ${esc(rls)} <span class="compte">${liste.length}</span></h2>
    <p class="rep-lien"><a href="${prefixe}/rls/${slugifier(rls)}/">Voir la page du RLS ${esc(rls)} →</a></p>
    <ul class="repertoire">
${items}
    </ul>
  </section>`;
  }).join('\n\n');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', '@id': url + '#webpage', url,
        name: `Cliniques en recrutement en ${nomTerritoire} | Trouve ta clinique`,
        inLanguage: 'fr-CA', dateModified: majDonnees,
        isPartOf: { '@id': SITE + BASE_PATH + '/#website' }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: u
          ? [
              { '@type': 'ListItem', position: 1, name: u.nom, item: SITE + u.accueil },
              { '@type': 'ListItem', position: 2, name: 'Cliniques', item: url }
            ]
          : [
              { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
              { '@type': 'ListItem', position: 2, name: 'Cliniques', item: url }
            ]
      }
    ]
  };

  const corps = `  <section class="hero">
    <p class="eyebrow">Médecine familiale · Montérégie</p>
    <h1>Cliniques en recrutement en ${esc(nomTerritoire)}</h1>
    <p class="lead"><strong>${enRecrutementTotal} milieu${enRecrutementTotal > 1 ? 'x' : ''} en recrutement actif</strong> de médecins de famille, sur ${cliniques.length} milieux publiés au total dans le répertoire, répartis dans <strong>${parRls.size} RLS</strong> et ${villes.size} municipalités${enRecrutementTotal < cliniques.length ? ` — les autres milieux publiés le sont à titre de référence et ne recrutent pas actuellement` : ''}. Chaque fiche permet de comparer les caractéristiques disponibles; la <a href="${u ? u.accueil : '/'}">carte interactive</a> ajoute les filtres et la vue géographique.</p>
    <p class="updated"><strong>Données mises à jour le :</strong> ${esc(majDonnees)}.</p>
    <div class="cta-row">
      <a class="button primary" href="${u ? u.accueil : '/'}">Explorer sur la carte interactive</a>
      <a class="button secondary" href="${prefixe}/ptem/">Guide PTEM</a>
    </div>
  </section>

  <figure class="sqb-wrap compact directory-banner"><a class="sqb" href="${u.accueil}" aria-label="Ouvrir la carte interactive des cliniques en recrutement en ${esc(nomTerritoire)}"><span class="sqb-pattern" aria-hidden="true"></span><span class="sqb-inner"><img class="sqb-logo" src="${BASE_PATH}/assets/logo-banniere.png" alt="" width="210" height="252" loading="lazy"><span class="sqb-vline" aria-hidden="true"></span><span class="sqb-eyebrow">Carte interactive</span><span class="sqb-title">Trouve ta clinique</span><span class="sqb-region">${esc(nomTerritoire)}</span><span class="sqb-rule" aria-hidden="true"></span></span></a></figure>

  <div class="callout official"><strong>Comment choisir :</strong> le RLS peut être déterminant pour l’avis de conformité PTEM, qui exige au moins 55 % des jours de facturation dans le territoire visé. Le type de milieu (GMF, GMF-U, CLSC…), le DMÉ, les frais de bureau et les pratiques offertes aident ensuite à comparer le quotidien de pratique. <a class="source-chip" href="https://www.quebec.ca/gouvernement/travailler-gouvernement/sante-services-sociaux/travailler-comme-medecin-famille-quebec/plans-regionaux-effectifs-medicaux-medecine-famille" rel="noopener">Source officielle</a></div>

${sections}`;

  return page({
    titre: `Cliniques en recrutement en ${nomTerritoire} | Trouve ta clinique`,
    description: `Répertoire des ${cliniques.length} milieux publiés en ${nomTerritoire} (dont ${enRecrutementTotal} en recrutement actif de médecins de famille), classés par ${parRls.size} RLS avec fiche détaillée.`,
    url, profondeur: 2, indexable: false, jsonLd, actif: 'cliniques', univers: u || UNIVERS_GENERAL,
    filDAriane: u ? `<a href="${u.accueil}">${esc(u.nom)}</a> › Cliniques` : `<a href="/">Accueil</a> › Cliniques`,
    corps
  });
}

/* ------------------------------------------------------------------------------------------- */
/* SITEMAP                                                                                      */
/* ------------------------------------------------------------------------------------------- */

/* Pages de contenu écrites à la main (pas générées). Ajouter ici toute nouvelle page-guide. */
const PAGES_FIXES = [
  { loc: `${BASE_PATH}/`, lastmod: null, changefreq: 'weekly', priority: '1.0' },
  { loc: `${BASE_PATH}/ptem/`, lastmod: '2026-08-30', changefreq: 'weekly', priority: '0.9' },
  { loc: `${BASE_PATH}/amp/`, lastmod: '2026-08-30', changefreq: 'monthly', priority: '0.9' },
  { loc: `${BASE_PATH}/cliniques/`, lastmod: null, changefreq: 'weekly', priority: '0.8' },
  { loc: `${BASE_PATH}/rls/`, lastmod: null, changefreq: 'weekly', priority: '0.8' }
];

function sitemap(entrees) {
  const urls = entrees.map(e => `  <url>
    <loc>${SITE}${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Généré automatiquement par scripts/generer-pages-seo.js — ne pas modifier à la main. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/* ------------------------------------------------------------------------------------------- */
/* PROGRAMME PRINCIPAL                                                                          */
/* ------------------------------------------------------------------------------------------- */

function ecrire(relatif, contenu) {
  const cible = path.join(RACINE, relatif);
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.writeFileSync(cible, contenu, 'utf8');
}

/*
 * GitHub Pages ne fournit pas de redirections HTTP. Ces petites pages conservent les anciens
 * favoris sans créer une seconde fiche et restent elles aussi hors index.
 */
function pageRedirectionStatique(destination, libelle) {
  const urlHtml = esc(destination);
  const libelleHtml = esc(libelle);
  return `<!doctype html>
<html lang="fr-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page déplacée | Trouve ta clinique</title>
<meta name="robots" content="noindex,nofollow,noarchive">
<link rel="canonical" href="${urlHtml}">
<meta http-equiv="refresh" content="0; url=${urlHtml}">
<script>location.replace(${JSON.stringify(String(destination))});</script>
</head>
<body>
<p>${libelleHtml} a été déplacée. <a href="${urlHtml}">Continuer vers la nouvelle adresse</a>.</p>
</body>
</html>
`;
}

function main() {
  const donnees = JSON.parse(fs.readFileSync(path.join(RACINE, 'data.json'), 'utf8'));
  const majDonnees = donnees.miseAJour || new Date().toISOString().slice(0, 10);
  const majGabaritsSeo = '2026-08-30';
  const majPagesSeo = [majDonnees, majGabaritsSeo].sort().at(-1);
  const rlsPermis = new Set(UNIVERS_EST.ordreRls);

  const toutes = Array.isArray(donnees.cliniques) ? donnees.cliniques : [];
  const horsEst = toutes.filter(c => c.region !== 'Est');
  const rlsHorsEst = toutes.filter(c => rempli(c.rls) && !rlsPermis.has(c.rls));
  const hopitauxHorsEst = (donnees.hopitaux || []).filter(h => h.region && h.region !== 'Est');
  if (horsEst.length || rlsHorsEst.length || hopitauxHorsEst.length) {
    throw new Error('data.json contient encore un territoire ou un RLS hors Montérégie-Est.');
  }

  const cliniques = toutes.filter(c =>
    c.region === 'Est' && c.visible !== false && c.categorie !== 'etablissement' && rempli(c.nom)
  );
  const ordre = (a, b) => (a.ville || '').localeCompare(b.ville || '', 'fr') ||
                          (a.nom || '').localeCompare(b.nom || '', 'fr');
  cliniques.sort(ordre);

  const fichierSlugs = path.join(__dirname, 'slugs.json');
  const slugs = chargerSlugs(fichierSlugs);
  const idsEst = new Set(toutes.map(c => String(c.id)));
  for (const id of Object.keys(slugs)) {
    if (!idsEst.has(id)) delete slugs[id];
  }
  const nouveaux = attribuerSlugs(cliniques, slugs);
  fs.writeFileSync(fichierSlugs, JSON.stringify(slugs, null, 2) + '\n', 'utf8');

  const champsVus = new Set();
  cliniques.forEach(c => Object.keys(c).forEach(k => champsVus.add(k)));
  const horsListe = [...champsVus].filter(k => !CHAMPS_PUBLICS.includes(k));

  const parRls = new Map();
  for (const rls of UNIVERS_EST.ordreRls) parRls.set(rls, []);
  for (const c of cliniques) {
    if (!parRls.has(c.rls)) {
      throw new Error(`RLS inattendu « ${c.rls} » pour ${c.nom}.`);
    }
    parRls.get(c.rls).push(c);
  }
  indexerRlsParRegion(cliniques);

  const entrees = PAGES_FIXES.map(p => ({
    ...p,
    lastmod: p.lastmod || majPagesSeo
  }));

  const minces = [];
  for (const c of cliniques) {
    const slug = slugs[String(c.id)];
    const fiche = pageClinique(c, slug, majDonnees, UNIVERS_EST);
    ecrire(path.join('cliniques', slug, 'index.html'), fiche.html);
    entrees.push({
      loc: `${BASE_PATH}/cliniques/${slug}/`,
      lastmod: majPagesSeo,
      changefreq: 'monthly',
      priority: '0.7'
    });
    if (fiche.substance < SEUIL_INDEXATION) {
      minces.push({ nom: c.nom, substance: fiche.substance });
    }
  }

  for (const r of REDIRECTIONS_SLUGS_HISTORIQUES) {
    if (!Object.values(slugs).includes(r.nouveau)) continue;
    const destination = `${SITE}${BASE_PATH}/cliniques/${r.nouveau}/`;
    ecrire(path.join('cliniques', r.ancien, 'index.html'),
      pageRedirectionStatique(destination, r.libelle));
  }

  for (const rls of UNIVERS_EST.ordreRls) {
    const liste = parRls.get(rls);
    const slug = slugifier(rls);
    ecrire(path.join('rls', slug, 'index.html'),
      pageRls(rls, liste, slugs, majDonnees, UNIVERS_EST).html);
    entrees.push({
      loc: `${BASE_PATH}/rls/${slug}/`,
      lastmod: majPagesSeo,
      changefreq: 'weekly',
      priority: '0.8'
    });
  }

  ecrire(path.join('cliniques', 'index.html'),
    pageRepertoire(cliniques, slugs, parRls, majDonnees, UNIVERS_EST));
  ecrire(path.join('rls', 'index.html'),
    pageRlsHubRegion(UNIVERS_EST, parRls, majDonnees));

  ecrire('sitemap.xml', sitemap(entrees));

  const etablissements = toutes.filter(c => c.categorie === 'etablissement').length;
  const hopitaux = Array.isArray(donnees.hopitaux) ? donnees.hopitaux.length : 0;
  console.log('=== GÉNÉRATION MONTÉRÉGIE-EST ===');
  console.log(`data.json du ${majDonnees} : ${toutes.length} lieux, dont ${etablissements} établissements et ${hopitaux} hôpitaux.`);
  console.log(`Pages de cliniques : ${cliniques.length}; pages de RLS : ${parRls.size}.`);
  console.log(`Brouillon hors index : robots.txt et toutes les pages utilisent noindex.`);
  console.log(`Sitemap du brouillon : ${entrees.length} URL.`);
  if (nouveaux.length) {
    console.log(`Nouveaux slugs attribués : ${nouveaux.length}.`);
    nouveaux.forEach(n => console.log(`  id ${n.id} → /cliniques/${n.slug}/`));
  }
  if (minces.length) {
    console.log(`Fiches à enrichir avant une publication indexable : ${minces.length}.`);
  }
  if (horsListe.length) {
    console.log(`Champs de travail non publiés : ${horsListe.join(', ')}.`);
  }
}

main();
