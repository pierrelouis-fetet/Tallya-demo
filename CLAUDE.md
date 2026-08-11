# Tallya — consignes de travail

Lire `ETAT.md` en premier : il porte l'état réel du projet, les décisions
prises et les pièges rencontrés. Ce fichier-ci ne dit que les règles.

## Avant chaque push, sans exception

1. **Lancer les tests** : ouvrir `/tests.html` sur le serveur local, **sur le
   port 8765**. Le titre de l'onglet donne le résultat. Aucun push si un test
   est rouge. Si un serveur y répond déjà, s'y rattacher (`launch.json`, entrée
   « dashboard ») : le port n'est pas un détail de confort, `localStorage` est
   lié à l'origine et un autre port donne une application vide. S'il n'y en a
   pas : `python serve.py --port 8765 --no-browser`.
2. **Compléter les tests** avec ce que le changement vient d'introduire. Un
   correctif sans test qui le protège se re-cassera. La question à se poser :
   *quelle assertion aurait attrapé ce bug avant moi ?*
3. **Remplacer la version** dans les balises `?v=…` d'`index.html` **et** de
   `tests.html` dès qu'un fichier d'`assets/` change. Sans ça, un navigateur
   qui a déjà vu le site resert l'ancien JavaScript — et la page de tests
   donnerait un vert mensonger. Une suite le vérifie désormais (« Les balises de
   version ne mentent pas ») : les deux pages doivent porter la même valeur,
   une seule, et aucun fichier d'`assets/` ne peut être servi sans balise.
   Régénérer les icônes compte comme un changement d'`assets/` : voir
   `ICONES.md` et `icones.py`.
4. **Demander l'accord** du mainteneur. `git push` déclenche le déploiement
   Cloudflare : on ne pousse jamais de sa propre initiative.

## Ce que les tests doivent couvrir

La règle qui les gouverne tient en une phrase : **un total égale la somme de
ses parts**. Presque tous les bugs de calcul rencontrés la violaient sans que
rien ne se voie à l'écran.

À vérifier à chaque fois qu'un chiffre nouveau apparaît :

- La somme des parts fait le total affiché, et les pourcentages font 100 %.
- Le même libellé donne le même montant sur tous les écrans. « Liquidités »
  a déjà valu deux choses différentes sur deux pages, les deux totaux justes.
- Un pourcentage dit sur quelle base il est calculé. Trois écrans ont déjà
  donné trois parts différentes pour la même ligne.
- Rien ne sort de l'écran à 375 px. Un bouton hors cadre est inatteignable :
  `body` est en `overflow-x: clip`, les pixels au-delà du bord sont perdus.
- Les migrations sont idempotentes : les jouer deux fois donne le même état.
- **Un fait se règle à un seul endroit.** Deux portes sur le même champ sont
  saines — le montant de la carte du mois et la barre « Objectif dépenses »
  ouvrent la même fenêtre. Deux champs pour la même valeur ne le sont pas :
  personne ne peut vérifier qu'ils s'accordent, et l'argument « jamais visibles
  en même temps » est exactement l'aveu du problème.
- **Une liste se dérive, elle ne se recopie pas.** Le défaut qui revient le plus
  souvent ici : deux listes écrites à la main pour une seule vérité, et celle
  qu'on oublie de changer dit le contraire de l'autre. Le regroupement par
  enveloppe parcourait `TYPES_COMPTE` : un compte au type inconnu disparaissait
  de la page sans quitter le total affiché en tête. `groupesParEnveloppe()` part
  des comptes, la table ne sert plus qu'à ordonner. Même faute côté vue : un
  renvoi lisait `SOUS_ONGLETS.allocation[1][1]`, l'ordre des onglets a changé, et
  la phrase invitait à aller dans « Patrimoine » depuis Patrimoine.
- **Un pourcentage n'existe que sur une base positive.** Diviser par une base
  négative retourne le signe, et une base qui traverse zéro rend le rapport
  arbitrairement grand : un crédit saisi sans son bien affichait « −475,5 % ».
  `deltas()` rend `pct: null` dans ces cas, et l'écran se contente de l'euro.
- **Une base qui bouge toute seule inverse le signal.** Le rendement immobilier
  se calculait sur « prix payé moins capital restant dû », un dénominateur qui
  grossit à chaque mensualité : à cash-flow égal le pourcentage baissait pendant
  que l'opération s'améliorait. Un ratio dont la base dérive avec le temps ne se
  compare pas à lui-même d'une année sur l'autre, et c'est pourtant l'usage
  qu'on en fait. Préférer une base que le détenteur déclare une fois — l'apport.
- **Quand plusieurs approximations manquent, vérifier si elles tirent du même
  côté.** L'immobilier ignorait la période du loyer, la vacance et l'impôt : les
  trois gonflaient le rendement. Un outil imprécis se trompe des deux côtés ;
  celui qui se trompe toujours du côté flatteur est biaisé, et ça ne se voit
  jamais sur un seul chiffre.
- **Un état se déclare, il ne se déduit pas.** Une échéance dépassée ne veut pas
  dire « en retard » : le virement arrive souvent avec quelques jours de retard,
  et peindre la ligne en rouge le lendemain crierait au loup à chaque fois.
  L'application signale, le détenteur tranche. Idem pour `verifieLe` sur un
  crédit : c'est le geste de quelqu'un qui a regardé, jamais une supposition.
- **Un chiffre qui vieillit tout seul doit se projeter et se rappeler.** Un
  capital restant dû est le seul champ qui devient faux sans que personne y
  touche. `projectionCredit()` rejoue l'amortissement depuis la dernière
  vérification, la cloche réclame au bout de trois mois en portant le montant
  projeté, et la fenêtre le propose sans jamais l'écrire — un remboursement
  anticipé la démentirait.
- **La cloche ne parle que de ce qui existe chez celui qui la regarde.** Elle
  réclamait une actualisation des cours à quelqu'un qui n'a aucun titre coté.
  Deux contrôles gardés par `Store.state.positions.length`, et les échéances par
  le drapeau `prete` du type de compte.

Vérifier dans le navigateur **sans jamais écrire dans les données réelles** : le
le `localStorage` de qui lance les tests n'est pas un bac à sable. Pour voir un état qu'il
n'a pas, remplacer `Store.state` par un `structuredClone` modifié, appeler
`render()`, lire, puis remettre l'original — `Store.save()` n'étant jamais
appelé, rien n'est écrit. Mettre tout de même le contenu de `localStorage` de
côté avant, et le remettre après.

## Où l'on écrit, et ce qui le confirme

Deux régimes, et le choix n'est pas décoratif.

- **Dans une page, on écrit à la frappe.** Rien ne se perd en changeant d'écran,
  et c'est ce qui compte le plus. Un bouton « Enregistrer » sur une page serait
  pire : on corrige un montant en haut, on descend, on quitte, tout est perdu.
  Ce qui manquait n'était pas la validation mais la **confirmation** — le seul
  témoin était « Sauvegardé ✓ », 10,5 px au bas de la barre latérale, donc dans
  le tiroir fermé sur téléphone. Le champ qu'on vient de remplir porte donc un
  liseré vert huit dixièmes de seconde, `marquerEcrit()`, là où l'œil se trouve.
- **Dans une fenêtre, on diffère.** `data-differe` sur le corps, les deux
  écouteurs de champs le respectent, `appliquerDiffere()` applique tout au clic
  sur « Enregistrer ». C'est justifié là parce qu'on peut fermer sans valider :
  fermer avec des champs sales le dit et propose de garder. Le bouton « aller
  ailleurs » disparaît alors — deux boutons pleins côte à côte, l'un qui
  enregistre et l'autre qui s'en va, se disputent le même geste.
- **« Enregistrer » suit une règle, par famille.** Inventaire du 9 août 2026 :
  une fenêtre de **saisie en série** (fiche de ligne, dépenses du mois, relevé
  mensuel, aperçus modifiables) porte « Enregistrer », qui écrit **et reste**,
  plus « Fermer », qui demande s'il reste du non-enregistré. Une fenêtre
  d'**acte** (créer, vendre, archiver) porte le **nom de l'acte**, qui ferme.
  Le relevé mensuel a été le transfuge — douze champs comme sa jumelle des
  dépenses, mais qui fermait en enregistrant et jetait sans question. Un test
  garde la paire relOk / relFermer.
- La détection se fait **sur le balisage** (`[data-path]` présents), pas sur la
  description du panneau : un aperçu pose ses champs par `champs`, par
  `lignes[].champ` ou dans son propre `html`, et c'est ce troisième cas qui
  portait les liquidités.

## Relier deux faits plutôt que les saisir deux fois

Le motif le plus utile de cette base de code, appliqué quatre fois : une charge
fixe rembourse un crédit (`creditId`), une charge et un loyer se rattachent à un
bien (`bienId`).

- **Un seul porteur du montant**, et le lien décide lequel. La charge détient la
  mensualité, le crédit la lit : le budget ne change pas d'un octet, et la
  fenêtre du crédit n'offre plus le champ. L'offrir ferait deux surfaces
  d'édition, et celle-ci serait la perdante puisque la projection lit la charge.
- **Le sens du lien se choisit et s'explique.** Une charge peut exister sans
  crédit, un crédit sans charge (on ne rembourse pas une marge de courtier par
  mensualités), mais une mensualité ne peut pas exister sans sortir du budget :
  la charge est donc la source.
- **Garder l'unicité là où elle compte.** Deux charges sur un même crédit
  doubleraient la mensualité lue et la première trouvée gagnerait :
  `creditsRattachables()` écarte les crédits déjà pris. Deux charges sur un même
  bien sont normales — une taxe foncière et une copropriété — donc pas de garde.

## Écriture

- **Un commentaire dit pourquoi le code est ainsi, jamais ce qui s'est passé.**
  Au présent, sans date, sans nom, sans citation. Deux raisons, et la première
  suffit : **une application web sert ses fichiers en clair**, donc tout
  commentaire part en ligne et se lit dans `view-source` — les échanges cités,
  les noms d'établissements, les décisions abandonnées. La seconde est la règle
  de la maison : git garde déjà l'historique, le redire en commentaire crée une
  seconde copie que personne ne met à jour.
  Ce qui mérite un commentaire : une contrainte que le code ne peut pas dire
  lui-même — « cette règle doit rester après telle autre, même spécificité,
  c'est l'ordre qui tranche », « aucun backtick ici, il fermerait la chaîne ».
  Ce qui n'en mérite pas : « signalé le 5 août », « X a demandé », « le
  correctif précédent avait posé… ». Le quand et le qui vont dans le message de
  commit, le récit dans `ETAT.md`.
  Nettoyage fait une fois, 185 paragraphes et phrases retirés, `index.html`
  allégé de 43 % : ne pas le refaire une deuxième fois.

- **On développe en deux langues, français et anglais, dans le même geste.**
  Toute chaîne affichée naît enveloppée de `trad()` avec sa clé dans
  `i18n.js`, traduction anglaise comprise, dans le même commit. Le rattrapage
  de 2026 a montré le prix de l'autre méthode : près de deux mille chaînes
  reprises une à une, sur plusieurs jours. Une chaîne posée sans sa clé n'est
  pas un raccourci, c'est un bug. Seules les données du détenteur (noms de
  comptes, d'établissements, libellés saisis) ne se traduisent jamais.
- **Pas de tiret cadratin (—) dans le texte affiché.** Une virgule, un
  deux-points ou une parenthèse. Les commentaires de code peuvent en garder.
- **Le texte affiché porte ses accents ; les commentaires, non.** Les
  commentaires s'écrivent en ASCII, volontairement — ce fichier a déjà porté des
  octets invisibles. Mais « sur la periode affichee » dans une bulle d'aide
  n'est pas une variante, c'est une faute, et neuf bulles en portaient. Un test
  cherche une liste de mots toujours faux sans accent dans tout ce qui
  s'affiche ; y ajouter le mot suivant quand il se présente.
- **L'application tutoie, partout, bulles d'aide comprises.** Cette règle a
  longtemps dit l'inverse pour les textes d'aide, et le code ne l'a jamais
  suivie : au moment de la mesure, les bulles portaient 60 tutoiements pour 30
  vouvoiements. Une règle à deux régimes rendait le défaut invisible, puisque
  chaque exemplaire pouvait se réclamer d'une moitié. Un seul régime, et un
  test qui ne tolère plus un seul « vous », « vos » ou « votre » dans le texte
  affiché. Tranché le 5 août 2026.
- Un intitulé dit exactement ce qu'il compte. « Patrimoine total » affichant
  le net a déjà coûté une demi-journée.

## Interface

- Aucun tableau de plus de trois colonnes sous 768 px : liste cliquable
  (`ligneListe()`, `.liste-mobile`, `.large-seulement`).
- Un tableau hors conteneur défilant doit tenir dans sa carte. Voir
  `.table-serree`, dont la règle CSS doit rester **après**
  `.data-view > table` : même spécificité, c'est l'ordre qui tranche.
- Pas de grille de tuiles pour des chiffres qui ne composent rien. La liste à
  barres de l'accueil (`.card.repart`) dit mieux la même chose.

## Pièges de cette base de code

- `store.js` a déjà porté des octets invisibles : deux `0x08` là où `\b` était
  voulu, et de vrais NUL. Si `grep` annonce « binary file », c'est revenu.
- L'outil Bash n'arrive pas toujours à réécrire ces octets ; passer par
  PowerShell.
- Un backtick dans un commentaire HTML placé à l'intérieur d'un littéral de
  gabarit ferme la chaîne et casse tout le fichier.
- Un `
` qui passe par un script (heredoc, python) peut devenir un vrai
  retour à la ligne au milieu d'un littéral : tout texte contenant `
` ou des
  backticks s'écrit avec l'éditeur, jamais via un script. Le test « chaque
  fichier de l'application se parse » attrape la récidive.
- `couleurClasse` est un `const` lexical : `window.couleurClasse = …` ne le
  remplace pas. Pour simuler une panne, éditer la table.
- **Un document en ligne (`cat << 'FIN'`) mange un niveau d'antislash**, malgré
  le délimiteur entre guillemets. `[^\\w]` arrive dans le fichier en `[^\w]`,
  qui vaut `[^w]` dans une chaîne JavaScript, et l'expression rationnelle se met
  à mentir sans erreur. Écrire tout ce qui porte des antislashs avec l'outil
  d'écriture de fichier, puis vérifier le fichier avec `grep`. Le même piège
  vaut pour Python : `'\\u2019'` y arrive en `'’'`.
- **Un `’` peut être écrit littéralement dans la source**, sous forme
  d'échappement JavaScript et non de caractère. Une recherche portant sur
  l'apostrophe typographique ne le trouve alors pas.

## Données personnelles

Ce dépôt est public. `assets/seed.js`, `assets/seed-budget.js` et
`assets/demo.json` sont entièrement fictifs et **doivent le rester** : aucun
montant constaté, aucune personne réelle, aucune donnée de santé, jamais.
Un chiffre réel commité ici part en ligne au push suivant, et un dépôt public
ne se dépublie pas. Le fixture des tests est synthétique, et il doit le rester.
