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
4. **Pousser sans demander, si et seulement si les trois points ci-dessus sont
   faits.** L'accord est donné d'avance, le 12 août 2026 : ce qui le remplace,
   c'est la liste. Les tests verts, complétés, la balise de version remplacée,
   l'arbre de travail propre, et alors le push.

   Ce qui reste interdit sans un mot, parce qu'aucune vérification ne le rattrape :
   `--force` et toute réécriture d'un historique déjà publié ; un `git push` qui
   pousse une branche autre que celle demandée ; ici, pousser la branche de
   travail, dont l'historique est privé, la publication passant par
   `public-propre:main` et par elle seule. Et en cas de rejet pour
   non-fast-forward, on regarde ce que le distant porte en plus avant de faire
   quoi que ce soit : quelqu'un a écrit ailleurs, l'écraser perdrait son travail.

   Les deux `fatal: Failed to write item to store` de chaque push sont du bruit :
   c'est la ligne d'avancement des refs qui dit si l'envoi a abouti, jamais le
   code de sortie.

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

**Cliquer un bouton, c'est appeler `Store.save()`.** Garder `Store.state` de
côté ne suffit alors plus : le clic a déjà réécrit le `localStorage`, et l'état
simulé y reste. Avant tout clic sur une action, mettre **la chaîne brute** de
côté (`localStorage.getItem('wealth-dashboard:v1')`) et la remettre telle quelle
à la fin, `savedAt` compris. Une longueur en octets identique avant et après le
prouve.

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

- **Le cloud reçoit tout de suite, sauf pendant une frappe.** `Store.save()`
  pousse immédiatement ; `Store.save({ differe: true })` regroupe, et un seul
  appelant le demande — l'écouteur `input`, où cinq caractères valent cinq
  écritures sur une clé qui n'en accepte qu'une par seconde. C'était l'inverse :
  un clic sur « Enregistrer » attendait comme une frappe, et c'est dans cette
  attente que l'écran se verrouillait.
  Trois autres pièces, chacune fermant un trou : le flush écoute
  `visibilitychange` vers `hidden` en plus de `pagehide` — sur téléphone la page
  est gelée, pas déchargée, et un onglet gelé n'exécute aucun minuteur ; un seul
  envoi est en vol à la fois, sinon deux `PUT` concurrents laissent le plus lent
  écrire en dernier ; un échec est réessayé une fois, puis sur l'événement
  `online`. Ce qui reste sans garantie, et qu'il faut dire : deux appareils
  modifiés hors ligne demandent un arbitrage, il n'y a pas de fusion.

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
- **Dans une grille, un champ remplit sa cellule.** Les plafonds de `.field`
  (9 em pour un nombre, largeur naturelle pour un menu) ont leur raison hors
  grille, mais dans une rangée ils donnaient quatre largeurs sur une même fiche —
  117, 160, 299 et 364 px — et rien ne s'alignait. C'est la grille qui décide de
  la largeur, le champ l'occupe.
- **Une rangée de boutons a la géométrie de sa voisine.** Deux rangées dans une
  même carte, l'une en `btn` justifiée à droite et l'autre en `btn sm` à gauche,
  se lisent comme un oubli. La hiérarchie se dit par le remplissage — plein,
  fantôme, rouge — jamais par la taille.
- **Les boutons d'une carte agissent sur le sujet de cette carte**, et ce qui
  porte sur la page entière vit dans une barre de page, hors des cartes
  (`.fiche-pied`). La carte « Actions » d'une fiche portait quatre boutons en deux
  rangées : deux qui validaient la visite entière, deux qui décidaient de la vie du
  compte. Même poids visuel pour deux natures d'acte, sous un titre qui ne
  décrivait ni l'une ni l'autre.
- **Ce qui valide vient avant ce qui détruit**, et c'est une règle de pouce : à
  375 px les cartes se suivent, et le doigt descendait sur « Clôturer et supprimer »
  pour atteindre « Enregistrer ».
- **Une barre hors carte s'aligne sur le contenu des cartes, pas sur leur bord.**
  Une carte porte 18 px de remplissage plus 1 px de bordure : son premier pixel de
  contenu est à 19, et à 15 px de remplissage sous 900 px il est à 16. Sans ce
  calcul la barre touchait les bords de l'écran.
- **Un en-tête de carte ne mélange pas un lien et des boutons.** Un renvoi vers un
  autre écran prend `btn sm ghost` comme ses voisins ; `.btn` retire le
  soulignement pour qu'un `<a>` puisse la porter.
- **Un bouton qui passe à la ligne reste à droite.** `justify-content:
  space-between` distribue ligne par ligne : seul sur la seconde, un bouton partait
  à gauche pendant que la carte voisine, dont le titre est plus court, gardait le
  sien à droite. `margin-left: auto` sur le dernier bouton d'un en-tête.
- **Une vue paramétrée ne se vérifie pas sur une instance.** La fiche d'un compte
  a été mesurée sur un compte de liquidités, qui ne rend ni carte de titres ni
  carte de placements : six types de compte sur douze portaient encore du français.
  Les balayer tous coûte trois lignes de plus.
- **Un pied de fenêtre tient sur une ligne à 375 px.** Ses boutons se partagent
  la largeur à parts égales : trois font 107 px chacun, et un libellé trop long
  s'y plie en trois lignes — la hauteur double et le bouton voisin paraît énorme.
  Un test refuse tout pied dont les libellés dépassent 36 caractères au total.
- **Une page qui ne peut rien montrer dit ce qui la remplirait**, et ne montre
  rien d'autre. Allocation répartissait 0 € entre sept classes, Projection étalait
  des zéros sur cinquante ans : commenter chaque carte aurait remplacé six zéros
  par six phrases. `pageAvantDonnees()` et `invitePremierPas()` portent la forme,
  `PREMIERS_PAS` les textes. Corollaire : `mount()` de `charts.js` sort en silence
  quand son conteneur n'a pas été rendu, sinon masquer une carte lève une
  exception jusqu'à `render()`.
- **Une réserve se dit une fois, là où elle porte.** Trois lignes réservaient
  l'écart du jour sous la carte de la plus-value latente, qui ne dépend d'aucune
  date d'achat. Elle est dite dans l'aide de la colonne concernée, là où le
  chiffre se lit.

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
- **Un commentaire HTML n'est pas du JavaScript.** Écrit *avant* le backtick
  d'ouverture d'un littéral, `<!-- … -->` casse le fichier entier. Le piège se
  double du précédent : dedans, un backtick ferme la chaîne. Deux fautes commises
  le même jour, chacune détectée par la suite qui parse chaque fichier — mais
  seulement après un rechargement, donc plusieurs minutes perdues. La règle
  tient en deux mots : **dans** le gabarit, `<!-- -->` sans backtick ; **hors**
  du gabarit, `/* */`.
- **Une f-string Python ne s'étend pas à la ligne suivante.** Dans une
  concaténation implicite, seule la ligne préfixée `f` interprète ses accolades :
  `f"{{ a "` `"}}"` produit `{ a }}`. Le JavaScript généré reçoit alors une
  accolade de trop. Écrire le code injecté d'un seul tenant, ou passer les
  valeurs par `json.dumps()`.

## Données personnelles

Ce dépôt est public. `assets/seed.js` et `assets/seed-budget.js` sont
entièrement fictifs et **doivent le rester** : aucun montant constaté, aucune
personne réelle, aucune donnée de santé, jamais.
Un chiffre réel commité ici part en ligne au push suivant, et un dépôt public
ne se dépublie pas. Le fixture des tests est synthétique, et il doit le rester.

**Les captures du README se regénèrent par `python captures.py`**, jamais à la
main. Les quatre doivent montrer le même patrimoine : prises à des moments
différents, elles se contredisaient de 918,83 € et un lecteur attentif en
concluait que l'application compte mal. Le script pose la graine une fois, passe
en anglais, et prend les quatre images d'un seul tenant. Il faut que le serveur
tourne (`python serve.py --port 8766 --no-browser`).

Deux détails qui coûtent une heure si on les redécouvre : Chrome refuse la
connexion de débogage sans `--remote-allow-origins`, et `--screenshot` ne suffit
pas — il agrandit la fenêtre sans émuler l'appareil, donc les règles CSS de
téléphone ne s'appliquent pas et le rendu déborde. C'est
`Emulation.setDeviceMetricsOverride` qui donne ce qu'un téléphone affiche.

**La graine est le jeu de démonstration**, et il n'en existe pas de second :
`assets/demo.json` a vécu à côté d'elle, les deux ont divergé, le fichier est
parti. C'est donc la graine qu'un visiteur voit au premier chargement, et
`autoRefresh` y reste à `false` — une démonstration montre la même chose à tout
le monde, sinon les captures du README se contredisent et le lecteur en conclut
que l'application compte mal. Un test le garde.
