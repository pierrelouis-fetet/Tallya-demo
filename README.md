# Tallya

Un tableau de bord patrimonial personnel. Il répond à trois questions : combien
j'ai, où c'est placé, et où je vais.

**[Voir la démonstration](https://tallya-demo.pages.dev)** — données fictives,
rien à installer.

---

## Ce qui distingue ce projet

**Aucune dépendance, aucune étape de compilation.** Plus de vingt mille lignes
de JavaScript, du CSS, un fichier HTML. Pas de npm, pas de bundler, pas de
framework. On clone, on ouvre, ça tourne. Le déploiement consiste à copier des
fichiers.

**Une règle gouverne tous les calculs : un total égale la somme de ses parts.**
Elle a l'air évidente. En pratique, six écrans la violaient sans que rien ne se
voie : des pourcentages qui totalisaient 98,97 %, une colonne « Total » qui
oubliait deux poches sur cinq, le même libellé valant deux montants différents
sur deux pages, les deux totaux justes. Les chiffres avaient l'air corrects.
Ils étaient faux.

**Plusieurs centaines de tests, sans outillage.** Ni npm ni Node : on ouvre
`/tests.html`, le titre de l'onglet donne le résultat. Chaque suite correspond
à un défaut réellement rencontré, et la suite a été validée en la faisant
échouer exprès. Beaucoup d'entre eux lisent le code source lui-même : ils
dérivent la règle du fichier au lieu de la recopier, si bien que la valeur
écrite demain est déjà couverte.

**L'application refuse d'afficher ce qu'elle ne sait pas.** Aucune source
gratuite ne publie la répartition par pays d'un fonds : plutôt que de montrer un
camembert « Monde, 100 % » pour un MSCI World réellement américain à 70 %, les
graphiques de répartition géographique ont été retirés. Un graphique faux vaut
moins qu'un graphique absent.

## Fonctionnalités

| | |
|---|---|
| Patrimoine | Comptes, établissements, crédits, brut et net, quatre paliers de disponibilité |
| Marchés | Cours en direct par une passerelle Yahoo, performance du jour, plus-value latente |
| Allocation | Par actif, par classe, par type de compte, avec cibles et plan de rééquilibrage |
| Budget | Revenus, charges fixes partageables, dépenses par catégorie et par mois |
| Projection | Capitalisation à horizon choisi, en euros courants et constants |
| Relevés | Un instantané mensuel, saisi en une fenêtre, qui alimente toutes les courbes |

Installable sur téléphone (PWA), utilisable hors ligne, synchronisée entre
appareils, et pensée d'abord pour un écran de 375 px : aucun tableau de plus de
trois colonnes ne s'y rend, il cède la place à une liste cliquable.

## Faire tourner en local

```bash
python serve.py
```

Puis ouvrir `http://localhost:8765`. Le serveur sert les fichiers et fait
passerelle vers les cours de bourse. Rien à installer d'autre.

Les tests sont sur `http://localhost:8765/tests.html`.

## Architecture

```
index.html              une seule page, routage par ancre
assets/
    store.js            etat, migrations, tous les calculs derives
    app.js              rendu des vues et interactions
    charts.js           graphiques SVG ecrits a la main
    quotes.js           client des cours
    cloudsync.js        synchronisation entre appareils
_worker.js              passerelle et authentification (Cloudflare)
tests/                  harnais, fixture synthetique, assertions
```

L'état vit dans le navigateur (`localStorage`) et se synchronise par Cloudflare
KV. Le calcul est séparé du rendu : `store.js` ne touche jamais au DOM, ce qui
le rend testable sans piloter un navigateur.

## Hébergement

Cloudflare Pages, sur les plans gratuits. Douze requêtes par visite, pour un
plafond de cent mille par jour.

## Licence

AGPL v3. Toute version modifiée et mise en ligne doit publier son code.
