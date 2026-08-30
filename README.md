# Trouve ta clinique : Montérégie-Est Brouillon

Prototype autonome de la carte des cliniques et établissements de la Montérégie-Est, avec une identité visuelle inspirée de la palette de Santé Québec.

Ce dépôt est un brouillon distinct. Il ne remplace pas la carte officielle et ne modifie pas le dépôt `DTMF-Monteregie/Map`.

Adresse du brouillon : <https://olaplante.github.io/Monteregie-Est/>

## Portée

La carte active et les fichiers qu'elle référence contiennent uniquement :

- les lieux de la Montérégie-Est;
- les RLS Pierre-Boucher, Richelieu-Yamaska et Pierre-De Saurel;
- les pages PTEM et AMP;
- les pages de cliniques et de RLS générées depuis `data.json`;
- les fonctions existantes de carte, recherche, filtres, favoris, notes, comparaison, partage et installation PWA;
- le prototype du mode `Établissements`, avec les 7 établissements actuellement disponibles;
- les 3 hôpitaux de référence.

Au 30 août 2026, `data.json` contient 71 lieux de l'Est. Parmi eux, 33 cliniques sont publiées dans le répertoire, 7 sont classées comme établissements et 3 hôpitaux sont fournis dans la collection dédiée.

## Fichiers principaux

| Fichier | Rôle |
|---|---|
| `index.html` | Application cartographique Montérégie-Est |
| `data.json` | Source unique des lieux et hôpitaux |
| `manifest.json` | Configuration PWA du brouillon |
| `sw.js` | Cache hors ligne limité à cette application |
| `territoires-rls-est.js` | Limites des trois RLS de l'Est |
| `ptem/`, `amp/` | Pages d'information conservées |
| `cliniques/`, `rls/` | Pages générées depuis les données |
| `scripts/generer-pages-seo.js` | Générateur strictement limité à l'Est |
| `scripts/slugs.json` | Adresses stables des fiches de l'Est |

Des archives historiques Centre/Ouest sont conservées dans le dépôt afin de ne supprimer
aucun ancien travail. Elles ne sont reliées ni à la carte active, ni au manifeste, ni au sitemap,
et le workflow Montérégie-Est ne les modifie pas.

## Mise à jour des données

Modifier `data.json`, puis lancer :

```bash
node scripts/generer-pages-seo.js
```

Le générateur refuse toute région autre que `Est` et tout RLS extérieur aux trois RLS prévus. Le workflow GitHub Actions exécute les mêmes contrôles à chaque mise à jour des données.

Les champs `notes`, `alias`, `posApprox` et les courriels ne sont jamais copiés dans les pages générées.

## Statut de publication

Ce prototype est volontairement exclu des moteurs de recherche :

- `robots.txt` bloque toute exploration;
- chaque page porte `noindex,nofollow,noarchive`;
- aucun domaine personnalisé ni fichier Search Console n'est installé;
- les URL canoniques pointent uniquement vers le brouillon GitHub Pages.

L'indexation ne doit être activée qu'après une décision explicite.

## Développement local

Servir la racine avec un serveur HTTP statique. Pour reproduire le sous-chemin GitHub Pages, ouvrir l'application sous `/Monteregie-Est/`.

Après une modification du code ou des ressources PWA, augmenter la version du cache dans `sw.js`.
