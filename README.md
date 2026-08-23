# Trouve ta clinique | Montérégie-Est

Ce dépôt est un brouillon autonome consacré uniquement à la Montérégie-Est.

## Source officielle

- Dépôt officiel et source ultime: `DTMF-Monteregie/Map`
- Site public officiel: https://trouvetaclinique.ca/monteregie-est/
- Dépôt de travail: `OLaplante/Monteregie-Est`

Les changements faits ici ne sont jamais transférés automatiquement vers le dépôt officiel.

## Contenu de cette copie

- 69 cliniques des RLS Pierre-Boucher, Richelieu-Yamaska et Pierre-De Saurel
  - 26 cliniques en recrutement, visibles par défaut
  - 43 autres cliniques, accessibles avec le bouton « Toutes les cliniques »
- 3 hôpitaux de la Montérégie-Est
- Carte, filtres, favoris, notes locales, comparatif PDF et PWA
- Épingles pâles par RLS pour distinguer les cliniques qui ne recrutent pas actuellement
- Pages PTEM, AMP, RLS et 69 fiches de cliniques propres à l'univers Montérégie-Est

## Garde-fous du brouillon

- Aucun fichier `CNAME`
- Aucune configuration de domaine ou de déploiement vers `trouvetaclinique.ca`
- Aucune automatisation GitHub qui écrit dans un autre dépôt
- Pages marquées `noindex` et fichier `robots.txt` bloquant l'indexation
- Suivi Cloudflare du site officiel retiré
- `data.json` limité aux trois RLS de la Montérégie-Est

Les liens canoniques et les boutons de partage continuent de désigner le vrai site. C'est volontaire: le brouillon ne doit jamais devenir la référence publique par accident.

## Vérification locale

À la racine du dépôt:

```bash
node scripts/verifier-est.js
python -m http.server 8000
```

Ouvrir ensuite http://localhost:8000/ dans le navigateur.
