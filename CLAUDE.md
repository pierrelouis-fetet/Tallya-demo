# Tallya — consignes de travail

Lire `ETAT.md` en premier s'il est présent : il porte l'état réel du projet,
les décisions prises et les pièges rencontrés. Ce fichier-ci ne dit que les
règles.

Ce journal n'est pas publié : il décrit le profil d'investisseur du
propriétaire, ce qu'un dépôt public n'a pas à porter. Il vit dans le dépôt
privé et, ici, hors du suivi Git. Un clone du dépôt public ne l'a pas, et
c'est normal.

## Avant chaque push, sans exception

1. **Lancer les tests** : ouvrir `/tests.html` sur le serveur local, **sur le
   port 8766**. Le titre de l'onglet donne le résultat. Aucun push si un test
   est rouge. Si un serveur y répond déjà, s'y rattacher (`launch.json`, entrée
   « demo ») : le port n'est pas un détail de confort, `localStorage` est lié à
   l'origine et un autre port donne une application vide. S'il n'y en a pas :
   `python serve.py --port 8766 --no-browser`.

   **8766 et non 8765**, et la confusion coûte une demi-heure : 8765 est
   l'origine du dossier principal, `Dashboard wealth`, dont l'application
   répond aussi et affiche aussi « Tallya ». Une suite verte lue sur 8765
   n'aura rien vérifié de ce dépôt-ci. La balise `?v=` du fichier servi
   tranche : celle de la démonstration se termine par `-demo`.
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
   `public-purge2:main` et par elle seule. `public-propre` existe encore et porte
   le même genre de nom : elle date du 18 août et accuse 63 commits de retard. La
   nommer a déjà envoyé une session ailleurs. Et en cas de rejet pour
   non-fast-forward, on regarde ce que le distant porte en plus avant de faire
   quoi que ce soit : quelqu'un a écrit ailleurs, l'écraser perdrait son travail.

   **Et l'arbre doit être propre AVANT tout `git checkout`.** Le miroir se pose
   par `git read-tree -u --reset`, qui écrase l'arbre de travail sans rien
   demander : une modification non commitée qui traînait au moment du basculement
   est perdue, et git ne l'a pas — elle n'a jamais été indexée. C'est arrivé à
   ce fichier-ci, le 25 août, pendant la publication qui corrigeait justement le
   nom de branche ci-dessus. `git status --porcelain` doit rendre le vide, et
   c'est un arrêt, pas un avertissement.

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
- **Le point d'entrée qui tourne est `_worker.js`, pas `functions/`.** Chez
  Cloudflare Pages, un `_worker.js` à la racine prend toute la main et le dossier
  `functions/` n'est **jamais chargé**. Les cinq fichiers de `functions/api/` sont
  des copies mortes de `handleState()`, `handleQuotes()` et compagnie — le dépôt
  public les a supprimés le 9 août pour cette raison. Corriger le mauvais fichier
  donne un commit qui prétend réparer, un déploiement sans effet et des tests au
  vert : c'est arrivé au correctif de synchro ci-dessous, et seul le merge vers la
  démo l'a fait voir. Un contrôle exige maintenant que les deux copies disent la
  même chose tant que la morte existe.
- **On n'écrase que la version qu'on a lue.** Le garde-fou du serveur comparait
  deux horodatages : il refusait une écriture dont le `savedAt` était plus ancien
  que celui en ligne. Ça ne peut pas tenir, et la preuve est arrivée par les
  sauvegardes du détenteur — **six « avant adoption de la version en ligne » dans
  une seule journée**, et des montants saisis qui disparaissaient. Le mécanisme :
  un onglet resté ouvert garde en mémoire l'état d'il y a six heures, le
  rafraîchissement des cours y appelle `Store.save()` toutes les cinq minutes, et
  `Store.save()` estampille `savedAt = maintenant`. Contenu périmé, estampille
  fraîche — donc plus récente que celle du téléphone qui vient de saisir. Le
  serveur acceptait, puis le téléphone adoptait en se croyant en retard.
  **Un horodatage récent ne dit rien de l'âge du contenu.** L'écrivain déclare
  donc la version qu'il a lue (`?base=…`, le repère `synced-at`), et le serveur
  n'accepte que si c'est encore celle en place — un `If-Match`. Trois corollaires :
  le contrôle vit **côté serveur**, parce que le `sendBeacon` de la fermeture ne
  peut rien vérifier avant de partir ; adopter une version en ligne doit la
  **noter comme lue**, sinon l'enregistrement suivant se fait refuser sans raison ;
  et un refus se dit **là où l'on se trouve** (toast, et famille `synchro` de la
  cloche), pas sur la seule page Données, où personne ne va après avoir saisi un
  montant.
  Ce qui reste sans garantie, et qu'il faut dire : il n'y a toujours pas de fusion.
  Deux appareils modifiés chacun de leur côté demandent un arbitrage — mais
  l'arbitrage est désormais **posé**, au lieu que le plus rapide gagne en silence.
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
  (`ligneListe()`, `.liste-mobile`, `.large-seulement`). La règle vise les
  tableaux **qui portent une action** — un bouton hors cadre est inatteignable.
  Un tableau de lecture peut défiler dans un `.table-wrap`, à une condition :
  **la colonne du total reste épinglée** (`.sticky-fin`). Sans elle, six colonnes
  dans 311 px cachaient le seul chiffre que la carte raconte. La colonne des noms,
  elle, ne s'épingle pas sous 768 px : elle mangerait la moitié de l'écran.
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
- **Deux boutons, ou un bouton et un menu de nature : ça se tranche par la
  symétrie.** « + Rentrée » et « + Dépense » sont deux sens opposés du même acte,
  connus au moment où l'on appuie : deux boutons, et pas de menu — le demander
  ensuite ferait répondre deux fois à la même question. « Vendre » et « Vente
  passée » ne sont pas symétriques : la seconde est la variante dégradée de la
  première, celle que l'application n'a pas pu calculer et qu'on ne fait que
  déclarer. Un seul bouton, donc, et le repli en dernier choix du menu qui demande
  **quoi** vendre : la nature se choisit dans le même contrôle que le sujet, et
  avant les montants — elle change ce que les chiffres veulent dire.
  Bénéfice de bord : plus de bouton désactivé. Sans ligne à vendre, la fenêtre
  s'ouvre sur le repli au lieu de refuser de s'ouvrir, et un `disabled` dont la
  raison vit dans une infobulle ne se lit pas au doigt.
- **Deux boutons du même geste passent à la ligne ensemble, et mesurent pareil.**
  `.paire-btn` en fait un seul élément de flex — donc un seul point de rupture —
  et une grille à colonnes `1fr` leur donne la largeur du libellé le plus long.
  « − Vendre » et « + Vente passée » finissaient à 77 et 120 px, l'une au-dessus
  de l'autre : deux commandes de la même paire lues comme deux commandes sans
  rapport. Toute paire de ce genre porte la classe, pas seulement la première.
- **Une rangée de boutons a la géométrie de sa voisine, et ça se mesure.** Deux
  rangées dans une même carte, l'une en `btn` justifiée à droite et l'autre en
  `btn sm` à gauche, se lisent comme un oubli. La hiérarchie se dit par le
  remplissage — plein, fantôme, rouge — jamais par la taille. Et « même
  géométrie » ne veut pas dire « même classe » : en flex, la longueur du libellé
  décide de la largeur, donc `Archiver` faisait 79 px quand « Clôturer et
  supprimer » en faisait 157, dans deux rangées qui se voulaient jumelles.
  `.fiche-actes` est une **grille** : deux colonnes de même fraction, partagées
  par les deux rangées, donnent quatre boutons de largeur et de hauteur
  identiques et un seul bord droit. La preuve est une mesure, pas une lecture du
  CSS.
- **Ce qui porte un filet garde sa largeur ; on plafonne les colonnes, pas la
  rangée.** `max-width` sur la rangée la réduit à la largeur de ses boutons, et le
  filet, qui est dessiné sur elle, cesse de traverser la carte : il flotte au-dessus
  des deux boutons comme un trait sans raison. La rangée garde donc toute la largeur
  du contenu de la carte, ses colonnes sont plafonnées (`14em`) et
  `justify-content: end` les pousse à droite. Un test mesure que la rangée fait la
  largeur du contenu de sa carte **et** que ses boutons restent à droite.
- **Une rangée de boutons vit dans une carte, jamais entre deux.** Une rangée
  posée hors des cartes flotte au milieu d'une page où tout est encadré : un filet
  dans le vide et des boutons sans cadre.
- **La validation ferme la carte des champs ; elle ne rejoint pas les autres
  actes.** Trois places essayées en un jour, et c'est la troisième qui tient. La
  rangée « Annuler / Enregistrer » appartient au formulaire qu'elle valide, donc au
  bas de la carte qui porte les champs — « Informations » sur la fiche d'un compte,
  « Notes » sur celle d'un établissement, qui n'a pas de carte « Actions ». Groupés
  dans une seule carte, les quatre boutons formaient un mur : quatre rectangles de
  même taille sous un titre unique, sans ordre de lecture, et deux natures d'acte
  que seul le remplissage distinguait. Ce que la géométrie a gagné, elle le garde :
  une carte de moins ne dispense pas deux rangées voisines de s'accorder, la classe
  est la même dans les deux cartes et `apres-champs` n'ajoute qu'un filet.
- **Ce qui valide vient avant ce qui détruit**, et c'est une règle de pouce : les
  cartes se suivent, et le doigt descendrait sur « Clôturer et supprimer » pour
  atteindre « Enregistrer ».
- **Sous 768 px, une rangée de boutons passe à une seule colonne.** À 375 px, deux
  colonnes laissent 152 px : « Clôturer et supprimer » s'y plie en deux lignes, sa
  rangée prend 17 px de plus que sa voisine, et les hauteurs ne s'accordent plus.
  Empilés, les boutons sont identiques et la cible est plus large sous le pouce.
- **Une rangée dans une carte ne pose aucun remplissage latéral** : la carte le
  donne déjà, et en poser un la décalerait de ses propres voisins.
- **Un menu déroulant a la largeur de ce qu'il montre, et jamais plus que sa
  carte.** Deux fautes opposées vivaient sur la page Préférences. « Français »
  s'affichait dans une boîte de 442 px, parce que la règle des grilles était
  écrite avec un combinateur descendant (`.grid .field`) : une cellule de grille
  est un **enfant** de la grille, jamais un descendant, et le sélecteur attrapait
  le moindre champ posé dans une carte posée dans une grille. À l'inverse
  « Oui, chercher les cours automatiquem » se coupait en plein mot, faute d'un
  plafond assez large. Le plafond est `min(28em, 100%)` : la seconde borne n'est
  pas décorative, un menu prend la largeur de sa plus longue option sans regarder
  où il est posé, et 28 em valent 364 px quand la carte n'en offre que 311 à
  375 px — il sortait de l'écran. `text-overflow: ellipsis` dit le reste.
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
- **Le contraste se calcule, il ne s'estime pas.** Personne ne voit la différence
  entre 4,3:1 et 4,6:1, et c'est pourtant la frontière de l'illisible. `--muted`
  portait le texte le plus petit de l'application — intitulés de colonnes à 11 px,
  bulles d'aide à 12, étiquettes de tuiles à 10,5 — à 3,61:1 sur une carte et 3,32
  sur `--surface-2`, dans les **deux** thèmes. Toute encre qui sert de texte franchit
  4,5:1 sur les trois fonds (`--surface-1`, `--surface-2`, `--page`), et un test le
  calcule pour les deux thèmes. Corollaire : une couleur d'aplat qui devient une
  couleur de texte change de seuil — l'orange `--serious` écrit les écarts au budget,
  il n'est pas qu'un remplissage. `--good-text` existe pour cette raison.
- **La cible du doigt est plus grande que le dessin.** Vingt-quatre pixels minimum,
  et un `✕` de 22 px ne s'agrandit pas pour autant : ce serait un aplat là où il
  faut un signe discret. `.btn.icon::after` en `position: absolute` avec un `inset`
  négatif étend la zone cliquable sans rien déplacer ni rien peindre. Deux garde-fous :
  jamais de fond sur ce pseudo-élément, et **jamais d'empiétement sur le voisin** —
  à huit pixels, la croix mordait sur « Plus tard », donc l'action destructrice
  gagnait du terrain sur celle qui reporte. Six pixels suffisent.
- **Tout ce qui se focalise porte l'anneau de l'application.** Vingt-cinq composants
  déclaraient leur `:focus-visible` en accent, et les deux plus courants s'en
  remettaient au navigateur : `.btn`, dont l'anneau système ne se voit presque pas
  sur un bouton plein clair, et `.aide`, qui posait `outline: none` en changeant la
  couleur d'un filet de 1 px sur une pastille de 15. Un `outline: none` sans
  remplacement visible n'est jamais un choix de style.
- **Le rouge est réservé à ce qui est faux.** Une saisie mensuelle en attente n'est
  pas une panne : la pastille de l'onglet Budget s'annonce en `--warning`, comme sa
  jumelle `.badge` de la barre latérale, qui l'était déjà — deux couleurs pour le
  même signal selon la taille de l'écran, personne ne pouvait le voir. Une alerte
  rouge qui revient tous les mois cesse d'être lue.
- **Un glyphe ne dit qu'une chose.** `↻` veut dire « actualiser » à quatre endroits
  (les cours, la synchronisation, le symbole depuis l'ISIN, l'état du chargement) :
  il ne peut pas annoncer aussi « effacer seize mois de relevés ». `+` reste au
  geste qui crée — et il est donc juste sur « + Sauvegarder maintenant », qui ajoute
  une sauvegarde à la liste.
- **Le thème se change en rechargeant.** Changer l'attribut `data-theme` repeint
  la barre latérale, les cartes, les textes et les graphiques — tout sauf le fond
  du corps, qui reste à la couleur de l'ancien thème jusqu'au rechargement suivant.
  Mesuré : `--page` lue sur le corps rend bien la nouvelle valeur, un élément créé
  à l'instant la rend aussi, et le corps reste peint à l'ancienne. On obtenait des
  cartes claires sur une page noire. `applyTheme(nom, true)` recharge, comme le
  sélecteur de langue depuis toujours ; le drapeau reste faux au démarrage, sinon
  la page se recharge en boucle.
- **Un chiffre garde sa base sur téléphone.** `font-size: 0` masquait « sur 7 mois
  clos, hors charges fixes » sous la tuile qui affiche 1 404 € : un dividende sans
  son diviseur n'est pas un chiffre plus court, c'est un chiffre faux. La base se
  serre (10,5 px), elle ne disparaît pas. Les deux raisons du masquage étaient
  tombées sans que personne le remarque — le texte ne se tronque plus, et
  `grid-auto-rows: 1fr` égalise déjà les hauteurs de tuiles.
- **Un pied de fenêtre tient sur une ligne à 375 px.** Ses boutons se partagent
  la largeur à parts égales : trois font 107 px chacun, et un libellé trop long
  s'y plie en trois lignes — la hauteur double et le bouton voisin paraît énorme.
  Un test refuse tout pied dont les libellés dépassent 36 caractères au total.
- **Une page s'ouvre sur son sujet, se lit, puis se corrige.** L'ordre des cartes
  ne se voit dans aucun calcul et aucun rendu ne le signale : un bloc déplacé se
  remet en place au prochain coup d'éditeur, sans que rien ne casse. Quatre suites
  le mesurent désormais, une par écran. Le principe, dans cet ordre : le grand
  chiffre ou le geste qu'on vient faire, les cartes qui font lire, **puis** l'outil
  de correction, **et la destruction en dernier**. Sur Dépenses, le tableau de
  correction de 880 px s'intercalait entre les cartes de lecture ; sur Performance,
  les deux cartes des ventes encadraient celle du portefeuille détenu — l'état vide
  de la seconde l'avouait, « le journal, plus haut, porte le bouton », et une carte
  qui donne l'itinéraire vers sa voisine est mal placée ; sur Données, « État »
  était coincé entre les sauvegardes et la remise à zéro.
  **Exception, et elle est du détenteur** : sur Positions, la carte du jour ouvre la
  page, avant même la valeur du portefeuille. C'est un choix explicite — « c'est ça
  qui nous intéresse » — et un test le garde avec sa citation. Une règle générale ne
  défait pas une décision prise ; on la lit avant de proposer.
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

**Et la règle porte sur l'historique, pas seulement sur le fichier.** Une graine
peut être fictive aujourd'hui et ne pas l'avoir toujours été : ce sont les
commits qu'un dépôt public expose, pas l'état de l'arbre. Trois conséquences, à
tenir :

1. **Une branche de travail ne va jamais sur un dépôt public.** Son historique
   porte tout ce qu'on a essayé puis retiré, et personne ne relit six cents
   commits avant un push. Ici, seule `public-purge2:main` est publiable, et son
   historique a été reparti de zéro le 9 août pour cette raison exacte. Les
   branches `public`, `public-propre` et `public-purge` sont ses ancêtres
   abandonnés : elles portent le même genre de nom et des mois de retard, donc
   la seule façon de savoir laquelle est la bonne est de la comparer au distant,
   `git rev-list --count public-purge2..origin/main`, qui doit rendre 0.
2. **Avant de pousser vers un distant public, on regarde ce que la branche
   porte**, et pas seulement ce que l'arbre montre. `git log -S"<un nom>"` coûte
   trois secondes et répond.
3. Un test tient la graine (« aucun nom réel n'a repris place dans la graine »).
   Il liste ce qui est **attendu** plutôt que ce qui est interdit : une liste
   d'interdits demanderait d'écrire ici les vrais noms, donc de les publier pour
   les interdire. Et il ne remplace pas la règle : un historique ne se teste pas,
   il se contrôle avant d'être publié.

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
