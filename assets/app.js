/* =============================================================
   APP — routage, rendu des vues et interactions
   ============================================================= */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* Un montant masque porte une balise <svg>. La passer dans esc() l'imprimait
   en clair, « objectif <svg class="oeil-masque"... ». Les intitules qui
   melangent du texte libre et un montant utilisent donc cette variante :
   elle echappe tout, puis restitue le seul fragment que nous ayons produit.
   Rien d'autre ne traverse, un texte saisi reste echappe. */
const escMontant = s => {
  const t = esc(s);
  return t.includes('oeil-masque') ? t.split(esc(OEIL_MASQUE)).join(OEIL_MASQUE) : t;
};

const S1 = () => Charts.cssv('--series-1');
const S2 = () => Charts.cssv('--series-2');
const S3 = () => Charts.cssv('--series-3');
const S4 = () => Charts.cssv('--series-4');
const S5 = () => Charts.cssv('--series-5');

function cls(v) { return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'; }
/* Deux fonctions calculaient les mois restants, et pas de la même façon :
   celle-ci comptait le mois en cours, l'autre non, et les deux plafonnaient
   à 12 quelle que soit l'année visée. Une seule référence désormais, dans
   store.js, correcte pour n'importe quelle année. */
const monthsLeftInYear = () => monthsToObjective();
function arrow(v) { return v > 0 ? '▲' : v < 0 ? '▼' : '•'; }

let savedTimer = null;
function flashSaved() {
  const f = $('#savedFlag');
  if (!f) return;
  f.textContent = trad('Sauvegardé ✓');
  f.classList.add('flash');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { f.classList.remove('flash'); f.textContent = trad('Sauvegardé localement'); }, 1400);
}

/* Le champ qui vient d'etre enregistre le dit lui-meme.

   « Ça rend fou, il n'y a jamais de bouton enregistrer. » Le defaut n'etait pas
   l'absence de bouton : c'etait l'absence de reponse. Tout ce qui se saisit dans
   une page entre dans l'etat a la frappe — ce qui est le bon comportement, on ne
   peut rien perdre en changeant d'ecran — mais le seul temoin etait
   « Sauvegardé ✓ », dix pixels et demi au bas de la barre laterale, donc dans le
   tiroir ferme sur telephone. On tapait dans le vide.

   Un bouton « Enregistrer » sur une page serait pire : on corrige un montant en
   haut, on descend, on quitte, et tout est perdu. Les fenetres en ont un parce
   qu'on peut les fermer sans valider — c'est le sens du bouton la-bas. Ici, c'est
   la confirmation qui manquait, pas la validation.

   Elle se pose donc sur le champ qu'on vient de quitter du regard : un liseré
   vert qui s'efface en huit dixiemes de seconde. La ou l'oeil est. */
let champsEcrits = new WeakMap();
function marquerEcrit(champ) {
  if (!champ) return;
  champ.classList.remove('champ-ecrit');
  /* Retirer puis reposer la classe dans deux images differentes : sans cela le
     navigateur ne rejoue pas l'animation, et une seconde frappe ne clignoterait
     pas. Meme motif que le toast. */
  clearTimeout(champsEcrits.get(champ));
  requestAnimationFrame(() => {
    champ.classList.add('champ-ecrit');
    champsEcrits.set(champ, setTimeout(() => champ.classList.remove('champ-ecrit'), 900));
  });
}

/* Un message peut porter une porte de sortie.

   Le bouton vit le temps du message. Au-dela, la pile reste — l'onglet Donnees
   y donne acces — mais l'occasion de defaire d'un geste a passe. */
function toast(msg, action) {
  msg = ponct(msg);
  const t = $('#toast');
  /* escMontant : une dizaine de toasts annoncent un montant (« ajouté ·
     160 € »), et en mode discret fmtEUR0 rend l'oeil SVG. Le canal texte
     l'imprimait en toutes lettres. Tout le reste — noms de comptes compris —
     ressort echappe, comme avant. */
  t.innerHTML = escMontant(msg); t.hidden = false;
  /* Un vrai bouton, pose apres le texte : la reecriture vient d'effacer les
     enfants du message precedent, donc rien a nettoyer. On l'assemble en DOM
     plutot qu'en HTML parce que `msg` porte des noms de comptes. */
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action.label;
    b.onclick = () => {
      t.hidden = true; t.classList.remove('toast-sort');
      clearTimeout(t._t); clearTimeout(t._s);
      action.run();
    };
    t.append(b);
  }
  /* L'entree rejoue a chaque message : retirer puis reposer la classe de
     sortie remet l'animation d'entree a zero meme si un toast en remplace un
     autre en plein vol. */
  t.classList.remove('toast-sort');
  clearTimeout(t._t); clearTimeout(t._s);
  /* Un message qui offre d'annuler vit plus longtemps que les autres. Deux
     secondes suffisent pour lire « enregistre », pas pour comprendre qu'on
     s'est trompe de mois, viser le bouton et l'atteindre. */
  const vie = action ? 6000 : 2300;
  t._s = setTimeout(() => t.classList.add('toast-sort'), vie);
  t._t = setTimeout(() => { t.hidden = true; t.classList.remove('toast-sort'); }, vie + 350);
}

/* La porte de sortie d'une ecriture, a passer en second argument de `toast`.

   Elle n'existe que si la pile a de quoi revenir. Offrir « Annuler » sur une
   pile vide serait la pire des promesses : le bouton ne rendrait pas l'etat
   d'avant, il en remonterait un plus ancien, ou rien du tout. */
const porteDeSortie = (label = 'Annuler') =>
  Store.canUndo() ? { label, run: () => ACTIONS['undo']() } : null;

/* Une sauvegarde avant d'ecraser un releve deja rempli.

   C'est le seul geste de l'application qui detruise des chiffres qu'on ne peut
   pas retrouver ailleurs : les montants d'un mois passe ne se recalculent pas,
   ils ont ete saisis. La pile d'annulation ne suffit pas ici — elle vit en
   memoire et se vide au rechargement, donc elle ne protege pas celui qui ferme
   l'application avant de s'apercevoir de l'erreur, ce qui est le cas le plus
   probable sur telephone. Une sauvegarde survit.

   Rien pour une ligne vide : il n'y a rien a perdre, et une sauvegarde par mois
   rempli au fil de l'annee chasserait les vraies de la liste. */
function sauvegardeAvantEcrasement(row) {
  if (!row || rowIsEmpty(row)) return;
  Store.addBackup(`avant écrasement du relevé de ${fmtMonth(row.date)}`);
}

/* Ouverture et fermeture de la fenetre, animees dans les deux sens.

   L'entree etait deja animee — retirer `hidden` fait rejouer les keyframes du
   panneau — mais la fermeture posait `hidden = true` d'un coup : la feuille qui
   glisse depuis le bas du telephone disparaissait sans le geste inverse, et
   c'est precisement la sortie qui donne la sensation de fluidite, parce qu'on
   la regarde toujours.

   La logique des appelants ne change pas : `masquerModal` rend la main tout de
   suite — les `resolve()` qui suivent partent sans attendre — seul le voile
   visuel s'attarde 170 ms. Le compteur de generation protege le cas reel ou
   une fenetre se rouvre pendant la sortie de la precedente (« Nouvelle
   categorie » ferme la saisie puis la rouvre) : la fermeture perimee ne doit
   pas eteindre la fenetre fraiche.

   Le compteur est par fenetre, et il a d'abord ete global — ce qui donnait
   l'inverse du but recherche. Deux fenetres existent, `#modal` et `#confirm`,
   et elles se ferment souvent l'une apres l'autre : « Annuler » sur la saisie
   d'un mois ferme la confirmation puis la saisie. La seconde fermeture faisait
   avancer le compteur, la sortie differee de la premiere se croyait perimee et
   rendait la main sans rien eteindre : `#confirm` restait avec `hidden = false`
   pour le reste de la session. Invisible — `pointer-events: none` et opacite
   nulle — donc jamais signale, mais present dans l'arbre d'accessibilite, et
   une seule regle de style en aurait fait un voile mort sur la page.

   Une `WeakMap` plutot qu'un champ sur l'element : rien a nettoyer, et aucun
   attribut de plus dans le DOM. */
const generationModal = new WeakMap();
const generationSuivante = m => {
  const g = (generationModal.get(m) || 0) + 1;
  generationModal.set(m, g);
  return g;
};
/* --- geler le fond pendant qu'une fenetre est ouverte ---------------------
   `overflow: hidden` sur le corps empeche bien la page de defiler derriere, et
   c'est ce que faisaient dix endroits, chacun a la main. Mais il ne garde pas la
   position : la page revenait tout en haut a l'ouverture, et on la retrouvait au
   sommet en fermant. Le defaut valait pour toutes les fenetres de
   l'application — aperçus, fiches, confirmations, formulaires.

   On fige donc le corps la ou il est : `position: fixed` avec un decalage
   negatif egal au defilement, puis on le rend et on remet le defilement a la
   fermeture. Les bords a zero, sinon un corps fixe se reduit a la largeur de son
   contenu.

   Le compteur sert aux fenetres empilees : une fiche ouvre une confirmation, et
   degeler a la premiere fermeture rendrait la page mobile sous la seconde. */
let fondGele = 0, modalesOuvertes = 0;

function gelerFond() {
  if (modalesOuvertes++ > 0) return;
  fondGele = window.scrollY || document.documentElement.scrollTop || 0;
  const b = document.body;
  b.style.position = 'fixed';
  b.style.top = `-${fondGele}px`;
  b.style.left = '0';
  b.style.right = '0';
  /* Pas d'`overflow: hidden` ici, et c'est un correctif, pas un oubli.

     Il rendait le fond noir des qu'on ouvrait une fenetre depuis une page
     defilee. `overflow: hidden` fait du corps une boite de rognage, et un corps
     en `position: fixed` sans hauteur prend alors celle de l'ecran : 812 px au
     lieu de 2 937. Pose a `top: -1833px`, ce bloc couvre la bande -1833 a
     -1021 — donc rien de ce qui est visible n'est peint, et on voit le vide.

     Il etait de toute façon inutile : `position: fixed` sort le corps du flux,
     `html` n'a plus de contenu, donc plus rien a faire defiler. C'est le
     positionnement qui gele la page, pas le rognage. */

  /* Le retrait de l'`overflow` n'a pourtant pas suffi, et voici l'autre moitie du
     meme defaut : `html, body { height: 100% }` donne au corps la hauteur de
     l'ecran, 812 px, quelle que soit la longueur de la page. Pose a `top: -700px`,
     il couvre la bande -700 a 112 : sous 112 px, plus rien n'est peint, et le
     voile de la fenetre — noir a 55 %, floute a 3 px — se pose alors sur du vide.
     « En bas c'est tout noir, on voit pas en flou l'ecran de derriere. »

     Mesure sur une fiche ouverte depuis un defilement de 700 px : 700 px d'ecran
     nus sur 812. La hauteur rendue au corps additionne donc l'ecran et le
     decalage, ce qui garantit qu'il couvre la zone visible d'un bord a l'autre,
     quel que soit l'endroit d'ou l'on ouvre. */
  b.style.height = `${window.innerHeight + fondGele}px`;
}

function degelerFond() {
  modalesOuvertes = Math.max(0, modalesOuvertes - 1);
  if (modalesOuvertes > 0) return;
  const b = document.body;
  b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = '';
  /* La hauteur posee au gel repart avec lui : la laisser bornerait la page a la
     hauteur d'un ecran plus un decalage qui n'existe plus. */
  b.style.height = '';
  /* Plus d'`overflow` a remettre : `gelerFond()` n'en pose plus. Le laisser ici
     ferait croire que ce reglage est gere a cet endroit, et le prochain qui
     cherche pourquoi la page ne defile pas le lirait comme une piste. */
  window.scrollTo(0, fondGele);
}

/* Le gel s'apparie a la fenetre, pas a l'appel.

   La cause est un compteur desynchronise. `apercu-enregistrer` rouvre le panneau
   apres avoir enregistre — c'est voulu, on veut voir le total bouger — mais il le
   rouvrait **alors qu'il etait deja ouvert**. Le compteur passait donc a deux, et
   la fermeture suivante le ramenait a un : le fond restait gele pour toujours.

   Compter les appels supposait qu'ils vont par paires, ce que rien ne garantit.
   On marque donc la fenetre elle-meme : elle gele une fois, elle degele une fois,
   quel que soit le nombre d'appels et leur ordre. Le compteur garde son role — les
   fenetres empilees, une fiche qui ouvre une confirmation — mais il ne peut plus
   compter deux fois la meme. */
/* On gele le fond AVANT de montrer la fenetre, jamais apres.

   L'ordre etait inverse : la fenetre apparaissait, son animation demarrait, puis
   `gelerFond()` posait `position: fixed` et une hauteur calculee sur le corps.
   Or ça invalide la mise en page du document entier — trois mille pixels de
   cartes et de graphiques — au moment precis de la premiere image. L'animation
   partait donc avec une trame de retard, et sur un telephone ce retard se voit.

   Geler d'abord coute exactement la meme chose, mais avant que quoi que ce soit
   ne bouge a l'ecran : le recalcul se fait pendant que la page est encore
   immobile, et l'animation demarre sur une mise en page stable. */
function montrerModal(m) {
  generationSuivante(m);
  const dejaGelee = m.dataset.gele === '1';
  if (!dejaGelee) {
    m.dataset.gele = '1';
    gelerFond();
    /* La mise en page se paie AVANT le lever de rideau. Le gel vient de
       changer position, top et hauteur du corps entier : demarrer l'animation
       dans la meme image lui fait porter cette note, et les premieres trames
       sautent. C'est pour ca que « juste la premiere ouverture est fluide »
       sur iPhone : la premiere se fait page en haut, gel a cout nul, les
       suivantes depuis un defilement. La lecture force la mise en page ici,
       et l'entree demarre sur une image propre. A confirmer sur l'appareil,
       le navigateur pilote ne composite pas. */
    void document.body.offsetHeight;
  }
  m.classList.remove('modal-ferme');
  m.hidden = false;
}
/* Combien de temps la fenetre met a partir, lu sur la feuille de style.

   Ce delai valait 170 en dur, la meme valeur que l'animation de sortie ecrite
   a deux endroits du CSS. Ralentir l'animation sans toucher a ce nombre aurait
   masque la fenetre au milieu de son mouvement : elle aurait disparu d'un coup
   apres un debut de glissement, ce qui est pire que pas d'animation du tout.

   La duree se declare donc une fois, en variable CSS, et le JavaScript la lit
   la ou elle est. `parseFloat` sur « .26s » rend 0,26 ; le repli couvre le cas
   d'une variable absente, sur un navigateur qui n'aurait pas encore la feuille.
   La marge de 30 ms laisse la derniere image se peindre. */
function dureeSortieModal() {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--duree-fenetre-sortie').trim();
  const s = parseFloat(v);
  return (Number.isFinite(s) && s > 0 ? s * 1000 : 260) + 30;
}
/* Un panneau ne survit pas a ce qu'il decrit.

   Le detail d'une vente porte le bouton qui la retire : sans cette fermeture, le
   panneau restait ouvert sur une vente qui n'existe plus, et son rafraichissement
   sortait en silence faute de la retrouver — donc un ecran fige, avec des
   montants justes la seconde d'avant. */
function fermerApercuSi(cle) {
  if (apercuOuvert !== cle) return;
  apercuOuvert = null;
  masquerModal($('#modal'));
}

function masquerModal(m) {
  if (m.dataset.gele === '1') { delete m.dataset.gele; degelerFond(); }
  const gen = generationSuivante(m);
  m.classList.add('modal-ferme');
  setTimeout(() => {
    if (gen !== generationModal.get(m)) return;   // cette fenetre a rouvert entre-temps
    m.classList.remove('modal-ferme');
    m.hidden = true;
  }, dureeSortieModal());
}

/* ---------- lecture / écriture par chemin ---------- */
function setPath(path, value) {
  const parts = path.split('.');
  let o = Store.state;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] === undefined) o[parts[i]] = {};
    o = o[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === '' || value === null) delete o[last];
  else o[last] = value;
}
function getPath(path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), Store.state);
}

/* =============================================================
   VUES
   ============================================================= */

const VIEWS = {
  /* Projection est devenue un sous-onglet de la vue d'ensemble.
     J'avais objecte que le regroupement etait le moins naturel des quatre, en
     disant que les deux repondent a deux questions differentes. C'etait faux, et
     il a suffi de regarder ce que la vue d'ensemble contient deja : la courbe de
     l'evolution passee et la carte « Objectif a fin 20xx ». C'est le meme sujet
     — le total, dans le temps — sur deux axes, l'un vers l'arriere et l'autre
     vers l'avant. Les deux autres candidats etaient plus faibles : Allocation
     porte un nom qui ne couvre pas une projection.
     Le titre suit l'onglet, sinon « Projection » s'annoncerait
     « Vue d'ensemble ». */
  overview:   { cle: 'overview', render: () => barreSousOnglets('overview') + (
    sousOngletActif.overview === 'projection' ? viewObjective() : viewOverview()) },
  /* Budget porte trois sous-onglets, sur le meme motif que Marches et
     Allocation : une seule vue, qui choisit quoi rendre. Les routes
     `history` et `budget-cadre` sont des redirections, elles n'ont pas
     d'entree ici. Le titre suit l'onglet, sinon « Relevés mensuels »
     s'annoncerait « Budget ». */
  budget:     { cle: 'budget',      render: () => barreSousOnglets('budget') + (
    sousOngletActif.budget === 'releves' ? viewHistory()
    : sousOngletActif.budget === 'cadre' ? viewBudgetCadre()
    : viewBudget()) },
  positions:  { cle: 'positions',   render: () =>
    barreSousOnglets('positions') + (sousOngletActif.positions === 'performance'
      ? viewPerformance() : viewPositions()) },
  allocation: { cle: 'allocation',  render: () =>
    barreSousOnglets('allocation') + (sousOngletActif.allocation === 'cible'
      ? viewRebalance() : viewAllocation()) },
  accounts:   { cle: 'accounts',    render: viewAccounts },
  /* Données et Préférences ont chacune leur entrée de menu depuis que le tiroir
     ne montre plus les doublons de la barre du bas. Deux portes et une barre de
     sous-onglets faisaient deux chemins pour le même choix, à quinze pixels
     l'un de l'autre : ce sont donc deux vues, sans barre. */
  data:       { cle: 'data',        render: viewData },
  settings:   { cle: 'settings',    render: viewSettings },
  notifications: { cle: 'notifications', render: viewNotifs },
  ficheCompte:{ cle: 'accounts',    render: () => viewFicheCompte(routeParam()?.id) },
  ficheEtab:  { cle: 'accounts',    render: () => viewFicheEtab(routeParam()?.id) },
};

/* Les adresses d'avant le regroupement mènent au sous-onglet correspondant. */
const REDIRECTIONS = {
  /* Projection est devenue un onglet de la vue d'ensemble. Son adresse reste
     `#/objective` : l'entree du menu la porte, elle est dans des signets, et
     c'est aussi la route de l'onglet. */
  objective:   ['overview', 'overview', 'projection'],
  rebalance:   ['allocation', 'allocation', 'cible'],
  /* `#/patrimoine` est la route de l'onglet, `#/allocation` l'adresse de base
     de la vue : les deux doivent mener au meme endroit, sinon un signet pose
     avant que Patrimoine ait sa propre adresse tomberait sur Objectifs sans
     explication. */
  patrimoine:  ['allocation', 'allocation', 'reel'],
  performance: ['positions',  'positions',  'performance'],
  /* `settings` n'est plus une redirection : Preferences est une vue a part
     entiere, avec son entree de menu. Elle n'a plus rien a rediriger. */
  /* Les relevés rejoignent Budget en sous-onglet : c'était la seconde entrée
     du groupe « Suivi », et les deux seules pages où l'on saisit quelque
     chose méritaient de vivre au même endroit. L'ancienne adresse continue de
     fonctionner, elle est dans les favoris de quelqu'un. */
  history:       ['budget', 'budget', 'releves'],
  'budget-cadre': ['budget', 'budget', 'cadre'],
};

/* Les symboles dont le cours vient de changer, le temps d'un rendu.

   Rempli par `refresh-quotes` a partir des `changes` que la passerelle renvoie
   deja, vide par `render()` juste apres. Le meme mecanisme que la cascade des
   reperes : l'intention vit dans le geste, la marque ne survit pas au rendu
   qu'elle decore. Sans ce vidage, chaque re-rendu ferait re-clignoter des
   cours qui n'ont pas bouge depuis dix minutes. */
let coursFraichis = new Set();

/* Titre et sous-titre d'une vue, dans la langue choisie. */
const viewTitle = k => t('view.' + k);
const viewSub   = k => t('view.' + k + '.sub');

/* --- sous-onglets -------------------------------------------------------
   Onze destinations dans la barre pour une application personnelle, dont
   trois paires qui parlaient du même sujet : « Allocation » et
   « Rééquilibrage » sont deux lectures du même argent — où il est, où il
   devrait être ; « Performance » ne parle que du portefeuille de titres, que
   « Marchés » porte déjà ; « Préférences » tenait en trois réglages et une
   carte qui renvoyait à « Données ».

   Elles deviennent des sous-onglets : le sujet garde une seule entrée dans la
   barre, et la seconde lecture est à un geste, sans quitter la page. Les
   anciennes adresses continuent de fonctionner et ouvrent le bon sous-onglet
   — un lien partagé ou un signet ne doit pas se casser sur un rangement.

   Chaque sous-onglet garde son adresse : basculer change le `#/`, donc le
   bouton retour du navigateur défait le geste, un rechargement retombe au
   même endroit, et un lien se partage. Un état d'affichage qui ne vit que
   dans une variable se perd au premier F5 — c'est ce qui distingue un
   sous-onglet d'un simple bouton. */
const SOUS_ONGLETS = {
  /* Projection rejoint la vue d'ensemble. C'etait le dernier ecran de pilotage
     qui demandait deux gestes, avec Comptes et Donnees — mais ces deux-la sont
     des reglages, la projection est une lecture quotidienne.
     « Aujourd'hui » et non « Vue d'ensemble » : l'onglet doit dire ce qui le
     distingue de son voisin, et c'est l'axe du temps. */
  overview:   [['aujourdhui', 'Aujourd’hui', 'overview'], ['projection', 'Projection', 'objective']],
  /* « Positions » et non « Portefeuille ».

     Trois raisons. La page appelait deja cette chose « Titres » deux
     centimetres plus bas, dans sa premiere barre : deux noms pour le meme
     contenu. « Portefeuille » est ensuite le sujet de l'application entiere —
     Allocation en parle, Comptes aussi, l'accueil aussi — alors qu'un onglet
     doit dire ce qui le distingue de son voisin. Et « Titres », qu'on avait
     retenu d'abord, exclut les cryptomonnaies, qui vivent pourtant dans cette
     page.

     « Positions » couvre une action, un ETF, une obligation et un bitcoin sans
     en privilegier aucun, c'est le mot des courtiers, et c'est deja l'adresse
     de la vue : le libelle dit enfin ce que dit la route. */
  positions:  [['portefeuille', 'Positions', 'positions'], ['performance', 'Performance', 'performance']],
  /* « Réel » et « Cible » ne disaient pas ce qu'on y trouve : deux adjectifs
     sans sujet, qui obligeaient a ouvrir pour comprendre. Les deux onglets
     repondent a deux questions, ils en portent desormais le nom.
     Pas de « Pilotage » ici : c'est deja le titre d'une section du menu.

     « Cible » est revenu contre « Objectifs », pour une raison que le premier
     choix n'avait pas vue : le mot « objectif » designe deja deux autres
     choses ailleurs — l'objectif mensuel de depenses, et l'objectif de
     patrimoine a fin d'annee. Trois objectifs pour trois calculs. Et tout ce
     que la page contient s'appelle « cible » : la colonne, les menus, la base
     des pourcentages, jusqu'a sa route. L'onglet parle enfin la langue de son
     contenu.

     Patrimoine en premier, donc c'est lui qui s'ouvre : `currentView()` remet
     toujours l'adresse de base sur le premier onglet de la liste, et c'est donc
     cet ordre qui decide de l'atterrissage.

     C'est aussi ce que l'application decide partout ailleurs : « Aujourd'hui »
     porte le constat et vient avant « Projection », qui porte le cap.

     Patrimoine porte son adresse propre, `#/patrimoine`, et Cible la sienne,
     `#/rebalance` : aucun des deux ne depend de l'adresse de base, donc cet
     ordre peut changer sans rendre un onglet inatteignable. Ce n'etait pas le
     cas avant — le jour ou Cible est passe devant, Patrimoine, dont la route
     ETAIT l'adresse de base, ne s'ouvrait plus. L'ancienne adresse reste servie
     par REDIRECTIONS. */
  allocation: [['reel', 'Patrimoine', 'patrimoine'], ['cible', 'Cible', 'rebalance']],
  /* Budget portait 4 344 px de haut pour huit cartes, et melangeait deux
     sujets : ce qui se repete chaque mois, et ce qui a ete reellement
     depense. Les relevés, seule autre page ou l'on saisit, les rejoignent.
     Trois onglets, un seul affiche a la fois, chacun autour de 2 000 px. */
  /* « Depenses » en premier : l'entree du menu s'appelle Budget, et c'est la
     qu'on arrive en la touchant. `currentView()` remet toujours l'adresse de
     base sur le premier onglet de cette liste, c'est donc l'ordre qui decide
     de l'atterrissage. Les releves gardent la pastille ambre, ils se voient
     sans etre au premier plan. */
  /* L'ordre groupe les deux onglets de budget et laisse le patrimoine au
     bout. « Depenses | Relevés | Charges » separait les deux sujets voisins
     par un troisieme sans rapport, et on lisait « depenses » puis « charges »
     comme deux noms du meme chose.

     « Charges fixes » et non « Charges » : dans la langue courante les deux
     mots disent la meme chose, de l'argent qui sort. C'est « fixes » qui porte
     l'opposition avec « Depenses », ce qui se repete contre ce qui varie.
     Mesure a 375 px : les trois onglets font 112 px, soit 88 px de texte
     utile, et « Charges fixes » en occupe 78. Ca tient sur une ligne — mais
     seulement nu. Une pastille ajoute 6 px plus son ecart et le libelle passe
     a la ligne, la barre gagnant 17 px. Cet onglet ne doit donc jamais porter
     de pastille ; si un jour il en reclame une, il faut raccourcir le nom
     d'abord. Voir PASTILLE_SOUS_ONGLET juste en dessous. */
  /*     Les deux saisies devant, le réglage derrière. C'est déjà ce que fait le menu
     de l'application, où Données et Préférences sont en queue, et ce qu'on vient
     de faire sur Allocation en mettant le constat avant la décision. */
  budget:     [['depenses', 'Dépenses', 'budget'],
               ['releves', 'Relevés', 'history'],
               ['cadre', 'Charges fixes', 'budget-cadre']],
};
/* L'onglet ouvert au depart, derive de la table et non recopie a cote.

   Cette ligne portait ses quatre valeurs en dur — dont `allocation: 'reel'`. En
   mettant Objectifs devant Patrimoine dans SOUS_ONGLETS, l'ordre affiche a bien
   change mais l'atterrissage est reste sur Patrimoine : deux listes ecrites a la
   main, et celle-ci disait le contraire de l'autre. C'est la faute que ce projet
   corrige sans arret, et elle vient de se rejouer sur trois lignes d'ecart.

   Desormais le premier onglet de chaque vue est, par construction, celui qui
   s'ouvre. Changer l'ordre suffit. */
const sousOngletActif = Object.fromEntries(
  Object.entries(SOUS_ONGLETS).map(([vue, onglets]) => [vue, onglets[0][0]]));

/* Quel sous-onglet reclame une saisie. La pastille se voyait dans le menu et
   dans la barre du bas, mais pas sur l'onglet lui-meme : on savait que Budget
   attendait quelque chose sans savoir lequel des trois. */
const PASTILLE_SOUS_ONGLET = {
  releves:  () => currentMonthPending().missing,
  depenses: () => depensesEnAttente().missing,
};

/* Une barre de commutation qui n'est pas une navigation : elle ne change pas de
   page, elle change la façon de lire celle où l'on est. Même forme que les
   sous-onglets, parce que c'est le même geste et qu'un utilisateur n'a pas à
   apprendre deux fois le même bouton.

   Elle partage donc leur habillage — le lavis qui glisse, la couleur de la
   marque, le tassement d'appui — et n'en diffère que par l'action appelée.
   `aria-pressed` et non `aria-current` : ce sont des boutons d'état, pas des
   liens vers une autre page. */
function barreCommutateur(choix, actif, action, cle) {
  return `
  <div class="sous-onglets">
    <div class="segmented">
      ${choix.map(([v, label]) => `<button data-action="${esc(action)}"
        data-${esc(cle)}="${esc(v)}" class="${v === actif ? 'on' : ''}"
        aria-pressed="${v === actif}">${esc(trad(label))}</button>`).join('')}
    </div>
  </div>`;
}

function barreSousOnglets(vue) {
  const choix = SOUS_ONGLETS[vue];
  if (!choix) return '';
  const on = sousOngletActif[vue];
  return `
  <div class="sous-onglets">
    <div class="segmented">
      ${choix.map(([cle, label, route]) => `<button data-action="sous-onglet"
        data-route="${route}" class="${cle === on ? 'on' : ''}"
        aria-pressed="${cle === on}">${esc(trad(label))}${
          PASTILLE_SOUS_ONGLET[cle]?.() ? '<i class="pastille-onglet" aria-hidden="true"></i>' : ''
        }</button>`).join('')}
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   Vue d'ensemble
   ------------------------------------------------------------ */
/* --- les cinq poches du graphique d'evolution -------------------------
   Elles ne concernent pas tout le monde. Sans bien immobilier ni part non
   cotee, la serie reste plate a zero : elle n'ajoute qu'une pastille de
   legende, une ligne « 0 EUR » dans la bulle et une colonne vide dans le
   tableau. On ne garde que celles qui portent quelque chose sur la periode
   affichee, les liquidites restent toujours, sinon un patrimoine tout juste
   ouvert n'aurait plus de graphique du tout. */
const SERIES_PATRIMOINE = () => [
  { key: 'cash',   label: trad('Liquidités'),       color: S1() },
  { key: 'bourse', label: trad('Actifs de marché'), color: S2() },
  { key: 'crypto', label: trad('Cryptomonnaies'),   color: S5() },
  { key: 'pe',     label: trad('Non coté'),         color: S3() },
  { key: 'immo',   label: trad('Immobilier'),       color: S4() },
  /* La sixieme poche, nee avec la classe : sans elle, une montre comptait
     dans le total du graphique sans appartenir a aucune bande, et la pile
     cessait de faire le total. seriesUtiles() la tait chez qui n'a rien. */
  { key: 'biens',  label: trad('Biens de valeur'),  color: Charts.cssv('--series-9') },
  /* La septieme bande, nee avec la poche. Elle se pose apres les actifs de
     marche dans la lecture, mais l'ordre de cette table est celui de la pile :
     le capital garanti voisine les liquidites, qui est ce dont il est le plus
     proche pour l'oeil, sans en etre. */
  { key: 'garanti', label: trad('Capital garanti'), color: Charts.cssv('--series-8') },
];
function seriesUtiles(points) {
  return SERIES_PATRIMOINE().filter(s => s.key === 'cash'
    || points.some(p => Math.abs(Number(p[s.key]) || 0) > 0.005));
}
function legendeSeries(series, avecTotal = false) {
  return series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')
    + (avecTotal ? `<span><i style="background:var(--text-secondary)"></i>Total</span>` : '');
}

/* Les points de l'evolution, tels que le graphique les trace.
   En net, les credits se retranchent de la poche qui porte le bien —
   l'immobilier d'abord, puis le non cote : c'est la que vivent les prets.

   Chaque releve porte desormais le capital restant du du mois (`dettes`),
   note par la photo au meme titre que le prix de revient du portefeuille. La
   bande d'immobilier monte donc doucement d'un mois sur l'autre, a mesure que
   le pret se rembourse — c'est exactement ce que le net veut montrer. Seul le
   dernier point utilise la dette d'aujourd'hui.

   Les mois anterieurs a ce changement n'ont pas la donnee : ils restent
   traces bruts plutot que de se voir appliquer une dette d'aujourd'hui qui
   n'etait pas la leur. La courbe se corrige d'elle-meme, un releve par mois.

   La vue et le montage appellent tous deux cette fonction : la legende ne
   peut donc pas annoncer une serie que la courbe ne trace pas. */
function pointsEvolution() {
  const pts = historySeries();
  const dettesAuj = patrimoine().dettes;
  if (!evoNet) return pts;
  return pts.map((p, i) => {
    const dernier = i === pts.length - 1;
    const dettes = dernier ? dettesAuj : num(p.dettes);
    if (!dettes) return p;
    let reste = dettes;
    const q = { ...p };
    /* `biens` juste apres l'immobilier : un pret sur un bien (une voiture)
       se retranche de lui avant d'entamer les placements. */
    for (const cle of ['immo', 'biens', 'pe', 'crypto', 'bourse', 'cash']) {
      const pris = Math.min(reste, q[cle] || 0);
      q[cle] = (q[cle] || 0) - pris;
      reste -= pris;
    }
    /* Le total se derive des series tracees : la somme ecrite a la main a
       deja oublie une poche, et la pile cessait de faire le total. */
    q.total = SERIES_PATRIMOINE().reduce((s, se) => s + (q[se.key] || 0), 0);
    return q;
  });
}

/* La carte d'evolution, ecrite une seule fois pour les deux ecrans qui la
   montrent, la vue d'ensemble et les relevés.

   Elles avaient chacune la leur, et elles avaient donc divergé : l'accueil
   passait par pointsEvolution(), avec sa bascule Net / Brut, tandis que les
   relevés appelaient historySeries() sans elle et tracaient toujours le brut.
   Deux cartes de meme titre montrant deux chiffres differents, c'est exactement
   ce que ce projet s'interdit — et la cause n'etait pas un calcul, c'etait un
   balisage recopie. Un seul exemplaire, et la question ne peut plus se poser.

   Elles partagent aussi leur plage : deux fenetres temporelles reglees
   separement redonneraient deux cartes differentes a l'ecran, ce qui etait le
   reproche de depart.

   `avecDetail` est la seule chose qui les separe. Le depliant « Voir les
   donnees » a sa place sur l'accueil, ou le tableau n'existe nulle part
   ailleurs ; sur les relevés il doublerait le tableau qui suit
   immediatement. */
function carteEvolution(avecDetail = false) {
  const pts = limitRange(pointsEvolution(), evoRange);
  return `
    <div class="card">
      <!-- Même bascule que sur le grand chiffre, même réglage : elle se
           répète là où le regard se pose, comme le sélecteur d'année de
           Budget. Toujours affichée, y compris sans crédit, elle dit alors
           ce que la courbe montre. -->
      <div class="card-head"><h2>${trad('Évolution du patrimoine')}</h2>
        <span class="segmented seg-mini">
          <button data-action="evo-base" data-net="1" class="${evoNet ? 'on' : ''}"
                  title="${trad('Tes avoirs moins tes crédits')}">${trad('Net')}</button>
          <button data-action="evo-base" data-net="" class="${evoNet ? '' : 'on'}"
                  title="${trad('La valeur de tes avoirs, crédits non déduits')}">${trad('Brut')}</button>
        </span>
        ${rangeControl('evo-range', evoRange)}</div>
      <div class="chart" id="chartEvo"></div>
      <!-- Une courbe vide se contentait d'un axe a zero. Elle ne peut rien
           montrer avant deux releves, et c'est elle qui doit le dire : le
           graphique est monte apres le rendu, il ne connait pas ce qui le
           remplirait. L'invite s'efface au premier releve enregistre. -->
      ${invitePremierPas('releves')}
      <div class="legend">${legendeSeries(seriesUtiles(pts), true)}</div>
      ${avecDetail ? detailEvolution() : ''}
    </div>`;
}

/* Le depliant de donnees de la carte, sur l'accueil seulement.
   Le tableau se choisit par annee, la ou la plage du graphique se pense en
   duree glissante : « un an » ne repond pas a « qu'est-ce que 2025 a donne ? ».
   Les deux commandes coexistent donc, chacune sur son objet. Le depliant garde
   son etat d'un rendu a l'autre, sinon changer d'annee le refermerait. */
function detailEvolution() {
  const tous = pointsEvolution();
  const annees = [...new Set(tous.map(p => String(p.date).slice(0, 4)))].sort();
  const courante = todayISO().slice(0, 4);
  if (evoYear === 'all') evoYear = null;   // le cran a quitte le selecteur
  const an = evoYear ?? (annees.includes(courante) ? courante : annees[annees.length - 1]);
  const pts = an === 'all' ? tous : tous.filter(p => String(p.date).startsWith(an));
  const cols = seriesUtiles(pts);
  return `
    <details class="data-view" ${evoDetailOuvert ? 'open' : ''} id="evoDetail">
      <summary>${trad('Voir les données')}</summary>
      <div class="row" style="margin:10px 0 6px">
        <span class="hint">${pts.length} point${pts.length > 1 ? 's' : ''}</span>
        <span class="spacer"></span>
        ${yearControl('evo-year', annees, an)}
      </div>
      <!-- Le total est epingle a droite, et les parts defilent sous lui. Le nombre
           de colonnes suit les poches remplies : quatre series en font six, soit
           552 px pour une carte qui en offre 311 a 375 px, et le total sortait de
           l'ecran a l'ouverture — le chiffre meme que la courbe au-dessus raconte,
           et le seul qu'on ne voyait pas.

           Le mois porte la classe sticky-col comme dans les tableaux voisins,
           mais une regle du bloc mobile la neutralise sous 768 px : une colonne
           de noms figee y mangerait la moitie de l'ecran. Elle sert donc aux
           ecrans etroits au-dela de ce seuil, ou un patrimoine a six poches
           deborde aussi. Le total, lui, ne coute que 70 px : il tient partout.
           (Aucun backtick dans ce commentaire : il vit dans un litteral de
           gabarit, et fermerait la chaine.) -->
      <div class="table-wrap">
        <table>
          <thead><tr><th class="sticky-col">${trad('Mois')}</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}<th class="sticky-fin">Total</th></tr></thead>
          <tbody>${pts.map(p => `<tr><td class="name sticky-col">${esc(p.label)}</td>${
            cols.map(c => `<td>${fmtEUR0(Number(p[c.key]) || 0)}</td>`).join('')
          }<td class="sticky-fin"><b>${fmtEUR0(p.total)}</b></td></tr>`).join('')
            || `<tr><td colspan="${cols.length + 2}" class="empty">Aucun relevé sur cette année.</td></tr>`}</tbody>
        </table>
      </div>
    </details>`;
}

/* Le graphique de la carte ci-dessus. Les deux vues appellent ce montage :
   deux appels paralleles a Charts finiraient par ne plus passer les memes
   options, et c'est deja arrive — la legende des relevés omettait l'entree
   « Total » alors que la courbe, elle, tracait bien la ligne. */
function monterEvolution() {
  const pts = limitRange(pointsEvolution(), evoRange);
  const cible = $('#chartEvo');
  if (cible) Charts.stackedArea(cible, { points: pts, height: 300, series: seriesUtiles(pts) });
}

/* Les deux sorties d'un rappel de saisie : « Plus tard », qui le repousse
   d'une semaine, et la croix, qui s'en tait jusqu'au mois prochain.

   Un seul rendu pour les deux bandeaux, le relevé et les dépenses. Deux
   listes de boutons a tenir d'accord finissent toujours par diverger : c'est
   le defaut qu'on vient de corriger trois fois ailleurs. */
function sortiesRappel(genre, label, avant = '') {
  return `<span class="rappel-sorties">
    ${avant}
    <button type="button" class="btn sm ghost" data-action="reporter-rappel" data-genre="${esc(genre)}"
            title="Repousse ce rappel de ${REPORT_JOURS} jours">${trad('Plus tard')}</button>
    <button type="button" class="btn icon xs" data-action="taire-rappel" data-genre="${esc(genre)}"
            aria-label="Ne plus demander ${esc(label)} ce mois-ci"
            title="${trad('Ne plus le demander ce mois-ci')}">✕</button>
  </span>`;
}

/* « Plus tard » ne laisse rien à l'écran, et c'est le point : on vient de
   demander le silence. La date du prochain rappel se dit au moment du clic,
   dans le toast — assez pour savoir quand il revient, pas assez pour encombrer
   la page qu'on voulait justement dégager.

   Une note calme a vécu ici, avec sa croix pour la fermer. Deux gestes pour se
   débarrasser d'un rappel, c'était un de trop. */
function viewOverview() {
  const t = nowTotals();
  const d = deltas();
  const g = objectiveStatus();
  const pnl = portfolioPnl();
  const alloc = allocationByAsset();

  /* Le pourcentage ne s'affiche que s'il veut dire quelque chose : `deltas()`
     rend `null` quand la base de comparaison est nulle, negative, ou que le
     patrimoine a traverse zero entre les deux dates. L'euro, lui, reste exact
     dans tous les cas. */
  const deltaBlock = (label, x) => x ? `
    <div class="hero-delta">
      <span>${esc(label)}</span>
      <b class="${cls(x.eur)}">${arrow(x.eur)} ${fmtSigned(x.eur)}${x.pct == null ? ''
        : ` <span class="small">(${fmtSignedPct(x.pct, 1)})</span>`}</b>
    </div>` : '';

  const moisEnAttente = currentMonthPending();
  const depEnAttente = depensesEnAttente();

  return `
  <!-- Le bandeau porte trois gestes, pas un : faire la saisie, la repousser
       d'une semaine, ou se taire jusqu'au mois prochain. Un <button> englobant
       n'aurait pas pu contenir les deux derniers, d'ou la couverture. -->

  ${moisEnAttente.missing ? `
  <div class="rappel card-cliquable">
    <button type="button" class="card-couvre" data-action="go-snapshot"
            aria-label="${trad('Prendre le snapshot de')} ${esc(moisEnAttente.label)}"></button>
    <span class="rappel-pastille"></span>
    <span class="rappel-texte"><b>${trad('Prendre le snapshot de')} ${esc(moisEnAttente.label)} ›</b><br>
      <span class="muted">${trad('Enregistre')} ${fmtEUR0(nowTotals().total)} ${trad('dans tes données mensuelles')}</span></span>
    ${sortiesRappel('releve', moisEnAttente.label)}
  </div>` : ''}

  <!-- Le second rappel, celui des depenses du mois clos.

       Tout le mecanisme existait : le genre « depenses » etait cable dans
       « Plus tard » et dans la croix, et l'action de saisie attendait son
       appelant. Il ne manquait que la banniere.
       (Aucun guillemet oblique : ce commentaire vit dans un litteral de gabarit,
       un backtick y fermerait la chaine.) -->
  ${depEnAttente.missing ? `
  <div class="rappel card-cliquable">
    <button type="button" class="card-couvre" data-action="saisir-mois-en-attente"
            aria-label="${trad('Saisir les dépenses de')} ${esc(depEnAttente.label)}"></button>
    <span class="rappel-pastille"></span>
    <span class="rappel-texte"><b>${trad('Saisir les dépenses de')} ${esc(depEnAttente.label)} ›</b><br>
      <span class="muted">${trad('Le mois est clos, ce qu’il a coûté reste à enregistrer')}</span></span>
    ${sortiesRappel('depenses', depEnAttente.label)}
  </div>` : ''}

  <!-- La carte entière ouvre le détail par actif : c'est la question qui suit
       immédiatement « combien ? ». Un bouton de couverture plutôt qu'un
       <button> englobant — la carte contient déjà le montant cliquable, qui
       masque les chiffres, et deux boutons imbriqués n'existent pas. Le
       montant reste au-dessus et garde son geste. -->
  <div class="hero card-cliquable">
    <button type="button" class="card-couvre" data-action="apercu" data-apercu="patrimoineTotal"
            aria-label="${trad('Voir la répartition du patrimoine par actif')}"
            title="${trad('Voir la répartition par actif')}"></button>
    <div>
      <!-- Brut ou net, au choix, sur le chiffre que toute la page décline.
           Net par défaut : c'est ce qu'on possède réellement. Le brut sert
           quand un crédit écrase la lecture — 180 000 € de biens derrière
           130 000 € de prêt ne se voient pas dans le seul patrimoine net.
           Toujours affiché, même sans dette : le sélecteur dit alors ce que le
           chiffre est, et le jour où un prêt arrive on sait déjà où regarder. -->
      <!-- « · aujourd'hui » a saute. A 375 px, l'intitule, la bascule net/brut
           et l'oeil ne tenaient pas sur une ligne : l'oeil passait seul a la
           ligne suivante, colle au bord droit, ou il avait l'air d'un oubli.
           Le mot ne manque pas, le sous-titre de la page dit deja « photo
           instantanee », et les deux ecarts en dessous nomment leurs dates. -->
      <div class="hero-label">
        <span>${evoNet ? trad('Patrimoine net') : trad('Patrimoine brut')}</span>
        <span class="segmented seg-mini">
          <button data-action="hero-base" data-net="1" class="${evoNet ? 'on' : ''}"
                  title="${trad('Tes avoirs moins tes crédits')}">${trad('Net')}</button>
          <button data-action="hero-base" data-net="" class="${evoNet ? '' : 'on'}"
                  title="${trad('La valeur de tes avoirs, crédits non déduits')}">${trad('Brut')}</button>
        </span>
        <!-- Le masquage vivait sur le montant lui-meme, pour que le geste tombe
             la ou le regard est deja. Mais le montant est aussi l'endroit ou
             l'on clique pour ouvrir la repartition, et le bouton mangeait ce
             clic : la carte semblait morte a l'endroit precis ou elle repond.
             L'oeil descend donc a cote de Net / Brut. Il reste a un pouce du
             chiffre, c'est le meme dessin qu'au pied du menu — ou il n'etait
             qu'a deux gestes sur telephone — et le raccourci « h » demeure. -->
        <button type="button" class="btn-oeil hero-oeil" data-action="toggle-masque"
                aria-pressed="${masqueActif() ? 'true' : 'false'}"
                aria-label="${masqueActif() ? trad('Afficher les montants') : trad('Masquer les montants')}"
                title="${masqueActif() ? trad('Afficher les montants') : trad('Masquer les montants')} ${trad('(touche h)')}">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path class="o-contour" d="M1.9 12S5.9 5.6 12 5.6 22.1 12 22.1 12 18.1 18.4 12 18.4 1.9 12 1.9 12Z"/>
            <circle class="o-pupille" cx="12" cy="12" r="3"/>
            <line class="o-barre" x1="4.5" y1="19.5" x2="19.5" y2="4.5"/>
          </svg>
        </button>
      </div>
      <div class="hero-value">${fmtEUR(evoNet ? t.total : t.brut)}</div>
      ${!evoNet && patrimoine().dettes ? `<div class="hero-sous muted">
        dont ${fmtEUR0(patrimoine().dettes)} de crédits à rembourser</div>` : ''}
      <!-- Le premier ecran ouvert ne disait rien : « 0,00 € » et deux ecarts a
           zero, sans un mot sur le geste qui les remplirait. Les autres pages
           portaient bien leur texte d'ecran vide, mais aucune ne s'ouvrait la
           premiere. L'invite s'efface d'elle-meme au premier compte saisi. -->
      ${invitePremierPas('comptes')}
    </div>
    <div class="hero-deltas">
      <!-- La comparaison au mois dernier ne dit rien : elle se mesure sur le
           dernier releve enregistre, dont la date depend de la saisie, et le
           marche la fait osciller de quelques dizaines d'euros. Les deux
           horizons qui restent sont ancres sur des dates fixes. -->
      ${deltaBlock(trad('depuis le 1er janvier'), d.ytd)}
      ${deltaBlock(trad('depuis le début'), d.all)}
    </div>
    <!-- Une courbe vivait ici. Elle tracait la meme serie que la carte
         « Evolution du patrimoine », deux cents pixels plus bas, mais sans axe,
         sans plage et sans infobulle : elle ne pouvait etre qu'une version plus
         faible de sa voisine, et deux dessins du meme chiffre finissent
         toujours par se contredire. C'est le defaut qu'on venait de corriger
         entre les deux cartes d'evolution de l'Apercu et du Budget.

         A la place, la barre empilee des classes : elle ne redit rien, elle
         decompose le chiffre juste au-dessus. La somme de ses segments fait
         exactement le montant annonce, donc le haut de page compose au lieu de
         se repeter. -->
    ${(() => {
      const parts = repartitionClasses();
      if (!parts.length) return '';
      return `
      <!-- Pas d'infobulle sur les segments : la couverture cliquable de la carte
           coupe les evenements du contenu, un attribut title ne s'afficherait
           jamais. La legende est la liste juste en dessous, memes couleurs et
           memes montants, et la carte entiere ouvre le detail part par part. -->
      <div class="hero-barre" role="img"
           aria-label="${trad('Répartition')} : ${parts.map(x => `${trad(x.label)} ${fmtPct(x.pct, 0)}`).join(', ')}">
        ${parts.map(x => `<i style="width:${x.pct.toFixed(2)}%;background:${x.couleur}"></i>`).join('')}
      </div>`;
    })()}
  </div>

  <!-- Un seul axe : la classe d'actif, chaque euro dans une seule ligne, la
       somme des parts fait 100,0 %.

       Une liste plutôt qu'une grille de tuiles : une grille à deux colonnes
       laisse toujours un impair, un trou ou une tuile étirée, et le défaut
       s'aggrave à chaque classe qui apparaît. Ici, trois lignes aujourd'hui
       ou six demain se lisent pareil, et la barre donne le poids d'un coup
       d'œil sans qu'on ait à comparer des pourcentages. -->
  <div class="card repart">
    ${repartitionClasses().map(x => `
      <button type="button" class="repart-ligne" data-action="apercu"
              data-apercu="classe" data-arg="${esc(x.classe)}"
              title="${trad('Voir le détail de')} ${esc(trad(x.label))}">
        <span class="repart-haut">
          <span class="dot" style="background:${x.couleur}"></span>
          <span class="repart-nom">${esc(trad(x.label))}</span>
          <b>${fmtEUR(x.value)}</b>
          <span class="repart-pct">${fmtPct(x.pct, 1)}</span>
        </span>
        <span class="repart-barre"><i style="width:${x.pct.toFixed(1)}%;background:${x.couleur}"></i></span>
      </button>`).join('')}
    ${(() => {
      /* Le rapprochement « avoirs moins credits egale net » a quitte le pied de
         cette carte.

         La regle est tenue autrement : la base est nommee, avec son montant, et
         l'ecart avec le net vit dans l'infobulle — a un geste de qui se le
         demande, invisible pour qui ne se le demande pas. Le detail complet, lui,
         est dans la carte des credits, plus bas, apres la courbe de progression. */
      const p = patrimoine();
      if (!p.dettes) return '';
      const cr = creditsEnCours();
      return `
      <p class="perimetre repart-base">${mentionBase(BASES.avoirs, p.brut)}${aide(
        `Ces parts portent sur ce que tu possèdes, avant crédits. Ton patrimoine net, `
        + `en haut de page, vaut ${fmtEUR0(p.net)} : la différence est le capital qu’il te `
        + `reste à rembourser. Chaque mensualité le réduit, donc ton patrimoine net monte `
        + `d’autant, même si la valeur de tes biens ne bouge pas.`)}</p>
      <!-- Une ligne, sous les parts et hors d'elles : les trois poches font 100 %
           des avoirs, et une dette n'est pas une quatrieme poche. Pas de
           pourcentage dans sa colonne, donc, et elle vient apres le filet.

           C'est tout ce que la page dit de ses credits, et c'est assez : le
           montant, et la porte pour aller le corriger. Le rapprochement en trois
           lignes qui vivait ici etait de la comptabilite posee sous la premiere
           chose qu'on voit. -->
      <button type="button" class="repart-credits" data-action="apercu" data-apercu="credits"
              title="${trad('Voir et mettre à jour tes crédits')}">
        <span>${trad('Crédits en cours')}</span>
        <b class="dette">−${fmtEUR(cr.reste)}</b>
        <span class="ml-chev" aria-hidden="true">›</span>
      </button>`;
    })()}
  </div>

  ${pasAFaire('comptes') ? `
  <!-- Un premier lancement s'arrete ici.

       Ce qui suivait etait six cartes de zeros : une courbe plate, un rythme
       « pas assez d'historique », une autonomie de 0 mois, un portefeuille a
       0,00 €. Aucune ne pouvait rien dire, et les commenter toutes aurait
       remplace six zeros par six phrases — du bruit a la place du vide.

       Elles reviennent d'elles-memes des le premier compte saisi, et c'est la
       forme la plus simple d'un accueil : montrer ce qui existe, et une seule
       porte vers la suite. Ce n'est pas un ecran ampute, c'est un ecran qui n'a
       pas encore commence. -->
  <div class="card">
    <p class="empty" style="margin:0">${trad('Le reste de cette page se remplit tout seul : '
      + 'la courbe de ton patrimoine, ton rythme d’épargne, ce que tu tiendrais sans '
      + 'revenus, ton portefeuille. Tout part des comptes que tu déclares.')}</p>
  </div>`
  : `
  <!-- Cette carte occupait la colonne large d'une grille en deux parts ; la
       petite portait « Allocation par actif », partie le jour ou l'accueil a
       cesse de dupliquer la page Allocation. La grille est restee, avec une
       colonne vide : un tiers de la largeur en noir, a cote du graphique.
       Une grille de deux colonnes pour un seul enfant n'est plus une grille. -->
  <div class="grid">
    ${carteEvolution(true)}
  </div>

  <!-- La carte « Objectif à fin » a quitte cet onglet pour Projection.

       C'est une projection : elle compare ou l'on est a ou l'on veut etre, et
       calcule ce qu'il faudrait mettre de cote chaque mois pour y arriver.
       « Aujourd'hui » porte le constat, Projection porte le cap — et Trajectoire
       comme « Par horizon », qui repondent a la meme question, sont deja
       la-bas. Elle y ouvre desormais la page, avant la courbe qui la dessine. -->

  <div class="grid g-2-1">
    <div class="card">
      <div class="card-head"><h2>${trad('Rythme d\'accumulation')}</h2>
        ${rangeControl('pace-range', paceRange)}</div>
      <div class="chart" id="chartPace"></div>
      ${(() => {
        /* Sur la plage affichee, pas sur toute la serie : les barres et les
           chiffres doivent parler du meme intervalle. */
        const p = statsRythme(limitRange(monthlyPace().points, paceRange, { ecarts: true }));
        /* Les deux chiffres de « combien je mets de cote chaque mois », cote a
           cote, chacun avec sa base.

           Cette carte disait 756 EUR quand Budget disait 652 : deux nombres pour
           une meme question, sur deux ecrans, a 104 EUR d'ecart. Les deux etaient
           justes — l'un est la variation constatee du patrimoine, marches
           compris, l'autre ce que le budget laisse — et rien ne le disait a
           l'ecran. C'est la regle du projet : un chiffre annonce sa base.

           L'epargne budgetee est donc rappelee ici, nommee, avec le lien vers la
           carte qui la calcule. Le rapprochement complet vit dans Budget, avec
           l'ecart et son explication : on ne le refait pas, on y mene. */
        const budgetee = savingsReconciliation();
        return `<dl class="kv" style="margin-top:12px">
          ${p.apports ? `
          <!-- Un heritage n'est pas de l'epargne, et une voiture n'est pas un
               mauvais mois de marche. Sans cette ligne, la moyenne du dessous
               comptait l'argent tombe du ciel comme un effort mensuel, et une
               grosse sortie comme un effort manque. Elle ne s'affiche que s'il y a
               eu un mouvement exceptionnel sur la periode. -->
          <dt>${trad('Dont')} ${p.apports < 0 ? trad('sorties exceptionnelles') : trad('entrées extérieures')}${aide(
              trad('Les entrées et sorties exceptionnelles de la période affichée : un héritage, une prime, la vente d’un bien, ou à l’inverse une voiture, des travaux. Elles déplacent ton patrimoine sans rien dire de ton épargne, et la moyenne du dessous les compte : hors elles, ton rythme propre est de')
            + ' ' + fmtEUR0(p.averageHorsApports) + ' ' + trad('par mois. Le journal est dans Budget, onglet Relevés.'))}</dt>
            <dd><button type="button" class="mois-lien ${cls(p.apports)}" data-action="goto" data-view="history"
                        data-anchor="" title="${trad('Voir le journal des entrées et sorties exceptionnelles')}"
                >${fmtSigned(p.apports)}</button></dd>` : ''}
          <dt>${trad('Moyenne mensuelle du patrimoine')}${aide(trad("Moyenne des variations du patrimoine net d’un mois sur l’autre, sur la période affichée. Elle comprend les mouvements de marché et les apports, pas seulement ton épargne. Le mois en cours reste dehors : il est incomplet."))}
            <span class="sub">${trad('marchés et apports compris')}</span></dt><dd class="${cls(p.average)}">${fmtSigned(p.average)}</dd>
          <dt>${trad('Épargne que ton budget laisse')}${aide(trad("Revenus moins charges fixes moins tes dépenses moyennes. C’est une prévision tirée de tes saisies, là où la ligne du dessus est une variation constatée. L’écart entre les deux vient des marchés et des apports : Budget le détaille."))}
            <span class="sub">${trad('prévision, hors marchés')}</span></dt>
            <dd><button type="button" class="mois-lien" data-action="goto" data-view="budget" data-anchor=""
                        title="${trad('Voir le rapprochement dans Budget')}">${fmtEUR0(budgetee.theoretical)}</button></dd>
          <dt>${trad('Mois en hausse')}</dt><dd>${p.positive} / ${p.count}</dd>
          ${p.best ? `<dt>${trad('Meilleur mois')}</dt><dd>${esc(p.best.label)} · ${fmtSigned(p.best.delta)}</dd>` : ''}
          ${p.worst ? `<dt>${trad('Pire mois')}</dt><dd>${esc(p.worst.label)} · ${fmtSigned(p.worst.delta)}</dd>` : ''}
        </dl>`;
      })()}
    </div>
  <!-- L'autonomie, posée au-dessus de la trajectoire : d'abord le coussin,
       ensuite le cap. La jauge ne compte que l'épargne de précaution, c'est elle que la
       règle des 3 à 6 mois vise, pas l'argent déjà promis à autre chose. -->
  <div class="card">
    <div class="card-head"><h2>${trad('Autonomie financière')}${aide(trad("Combien de mois tu tiendrais si tes revenus s'arrêtaient demain. La jauge compte ton épargne de précaution ; la liste ajoute ce qui pourrait être mobilisé ensuite, du plus accessible au plus lent, en mois cumulés. L'immobilier et le non coté se vendent, mais en quelques mois et avec une décote si tu es pressé. Ce qui est bloqué jusqu'à son échéance reste affiché mais sort du cumul : cet argent n'arrivera pas, quoi qu'il se passe demain. Un titre coté se vend en séance, mais le virement met deux à trois jours ouvrés à arriver : c'est ce délai, pas la liquidité, qui le range en « quelques jours ». Casser un PEA de moins de cinq ans lui coûte son avantage fiscal, pas son accès. Coût mensuel retenu : charges fixes plus dépenses moyennes."))}</h2>
      <span class="hint">${trad('si les revenus s\'arrêtaient')}</span></div>
    ${(() => {
      const r = runway();
      /* Le coussin réel : l'épargne de précaution plus l'argent des dépenses
         courantes, c'est bien lui qu'on brûlerait en premier. */
      const pk = poches();
      const ep = pk.precaution + pk.courant;
      const cover = r.burn ? ep / r.burn : 0;
      const state = cover >= 3 ? 'up' : cover >= 1.5 ? '' : 'down';
      /* « 0,0 mois » en rouge sur un coussin de 0 € et un cout de 0 € n'accuse
         personne de rien : c'est un rapport entre deux vides. La carte dit alors
         ce qui lui manque, au lieu de peindre en rouge une absence de donnee. */
      if (!ep && !r.burn) return `
        <p class="empty" style="margin:0">${trad('Ce chiffre compare ton argent disponible '
          + 'à ce que te coûte un mois. Il attend donc deux choses : un compte avec du '
          + 'cash, et tes charges fixes.')}</p>`;
      return `
        <div class="goal-top goal-top-empile" style="margin-bottom:8px">
          <b class="${state}">${fmtMois(cover)} ${trad('mois')}</b>
          <span class="muted">${trad('épargne de précaution + cash disponible')} · ${fmtEUR0(ep)}</span>
        </div>
        <div class="goal-bar"><div class="goal-fill" style="width:${Math.min(100, cover / 6 * 100).toFixed(0)}%;
          background:${cover >= 3 ? 'var(--good)' : cover >= 1.5 ? 'var(--warning)' : 'var(--critical)'}"></div></div>
        <!-- Le « 0 » de l'origine flottait seul sous la barre : une jauge part
             toujours de zéro, et isolé il se lisait comme une valeur. -->
        <div class="goal-foot"><span></span><span>${trad('cible 3 à 6 mois')}</span></div>
        <!-- L'argent des projets, nomme.

             Ils n'y rejoignent pas : un argent qui a deja un travail n'est pas
             une reserve, et c'est la reserve que la regle des 3 a 6 mois vise.
             Mais il existe, il est disponible, et on y toucherait avant de
             manquer. La ligne le dit, et les deux nombres s'additionnent
             desormais a l'ecran. -->
        ${pk.projet > 0.005 ? `
        <p class="small muted" style="margin:8px 0 0">
          + ${fmtEUR0(pk.projet)} ${trad('réservés à un projet, disponibles si tu y touches.')}
          ${aide(trad('Ils ne comptent pas dans le coussin : la règle des 3 à 6 mois vise '
          + 'ce qui n’a pas encore d’emploi. Ils sont bien là, et ils figurent dans '
          + '« Disponible tout de suite » juste en dessous : c’est ce qui explique '
          + 'l’écart entre les deux montants.'))}
        </p>` : ''}
        <ul class="runway">${r.tiers.filter(x => x.value > 0).map(x => `
          <li class="rw-ligne${x.horsCumul ? ' rw-hors' : ''}">
            <div class="rw-haut"><span class="rw-lab">${esc(trad(x.label))}</span><b class="rw-val">${fmtEUR0(x.value)}</b></div>
            <div class="rw-bas"><span class="rw-note">${esc(trad(x.note))}</span>
              <span class="tag rw-mois">${x.horsCumul
                ? trad('hors autonomie') : `${fmtMois(x.months)} ${trad('mois cumulés')}`}</span></div>
          </li>`).join('')}</ul>
        <p class="small muted" style="margin:12px 0 0">
          ${trad('Coût de la vie retenu :')} ${fmtEUR0(r.burn)} ${trad('/ mois (charges fixes + dépenses moyennes).')}
        </p>`;
    })()}
  </div>

  </div>

  <!-- La carte « Credits en cours » a quitte cette page.

       Son contenu vit maintenant dans un panneau, ouvert par la ligne du pied de
       la liste des poches, juste au-dessus. Une carte pleine page pour deux
       lignes de dette, apres avoir cherche sa place trois fois dans la meme
       journee — en tete, en pied, au milieu — disait surtout qu'elle n'en avait
       pas : ce n'est pas une brique de constat, c'est un detail qu'on va
       consulter. Le panneau le donne a la demande, avec les montants modifiables,
       et chaque intitule y ouvre la fiche complete du credit.

       Ce que la page garde : le total, sur une ligne, sous les parts qu'il ne
       compose pas. Sa mise en forme est la classe repart-credits. -->

  <!-- « Allocation par actif » et « Répartition » vivaient ici et dans
       l'onglet Allocation, à l'identique. L'accueil résume et renvoie ; il
       n'a pas à refaire le travail de la page dédiée. La liste des poches en
       haut de cette page suffit à la vue d'ensemble. -->
  <!-- Trois cartes empilees dans les deux tiers de la largeur, le dernier
       tiers vide : la grille en deux parts avait perdu son second enfant. Ces
       trois-la portent chacune trois ou quatre chiffres, elles tiennent cote
       a cote et se lisent d'un seul regard. Sous 768 px, la classe g-3
       retombe en une colonne, comme avant. -->
  <div class="grid g-3">
      <div class="card">
        <!-- Les quatre chiffres s'ouvrent, chacun sur le detail qui le compose :
             la valeur ligne par ligne, le prix de revient ligne par ligne, la
             plus-value ligne par ligne. Ils ne renvoyaient nulle part, et c'est
             pourtant la carte ou la question « de quoi est-ce fait ? » se pose
             le plus vite.

             Les panneaux existaient deja, ouverts depuis le pied de Marches :
             ce sont eux qu'on ouvre ici, pas un quatrieme ecran a tenir a jour.
             La performance partage celui de la plus-value — c'est le meme calcul
             sur la meme base, ecrit en pourcentage. -->
        <!-- Des lignes cliquables sur toute leur largeur, et non plus quatre
             montants soulignes de pointilles.

             C'est le composant mlist des listes de telephone : ligne pleine
             largeur, chevron a droite, appui qui se voit. Plus-value et
             performance se rejoignent sur une ligne, deux lectures du meme
             calcul qui ouvraient le meme panneau, et le lien d'en-tete mene a
             Marches pour qui veut les lignes plutot qu'un total. -->
        <div class="card-head"><h2>${trad('Portefeuille titres')}</h2>
          <a class="hint lien-vue" href="#/positions">${trad('Marchés')} →</a></div>
        <div class="mlist-groupe">
          <!-- L'ecart du jour en premier, parce que l'onglet s'appelle
               « Aujourd'hui » et que la carte n'y montrait que des cumuls : la
               valeur, le prix de revient, la plus-value depuis l'achat. Ce qui a
               bouge depuis minuit est le seul chiffre que cet onglet promet.

               Hors seance, la ligne le dit au lieu d'afficher zero : aucun titre
               n'a cote, ce n'est pas une seance atone. C'est le meme principe que
               le correctif du matin, ou le portefeuille annonçait +2,14 % en
               additionnant hier et aujourd'hui. -->
          ${(() => {
            const j = dayPerformance();
            /* Deux causes pour une meme tuile muette, et deux phrases : aucune
               cloture de reference en memoire, ou des cours qui datent tous
               d'avant minuit. La seconde manquait, et la tuile annonçait alors
               « +0 € · +0,00 % » — un ecart du jour nul sur une journee qui
               n'avait pas encore de cours. */
            if (!j.lignes.length || j.toutHorsSeance) return `
          <div class="mlist" style="cursor:default">
            <span class="ml-nom">${trad('Aujourd’hui')}<span class="sub">${j.lignes.length
              ? `${trad('aucune ligne n’a coté depuis minuit')}${j.asOfMarche
                  ? ` · ${trad('cours')} ${esc(fmtCoursQuand(j.asOfMarche))}` : ''}`
              : trad('pas de clôture de veille en mémoire')}</span></span>
            <span class="ml-chiffres"><b class="muted">${trad('hors séance')}</b></span>
          </div>`;
            return `
          <button type="button" class="mlist" data-action="apercu" data-apercu="jourTitres">
            <span class="ml-nom">${trad('Aujourd’hui')}<span class="sub">${j.hausse} ${trad('en hausse')}, ${
              j.baisse} ${trad('en baisse')}${j.sansDonnee ? `, ${j.sansDonnee} ${trad('sans cours de veille')}` : ''}${
              j.horsSeance ? `, ${j.horsSeance} ${trad('sans cours du jour')}` : ''}</span></span>
            <span class="ml-chiffres"><b class="${cls(j.eur)}">${fmtSigned(j.eur)}</b>
              <span class="${cls(j.eur)}">${fmtSignedPct(j.pct)}</span></span>
            <span class="ml-chev" aria-hidden="true">›</span>
          </button>`;
          })()}
          <button type="button" class="mlist" data-action="apercu" data-apercu="portefeuille">
            <span class="ml-nom">${trad('Valeur')}<span class="sub">${Store.state.positions.length} ${
              Store.state.positions.length > 1 ? trad('lignes de titres') : trad('ligne de titres')}</span></span>
            <span class="ml-chiffres"><b>${fmtEUR(pnl.value)}</b></span>
            <span class="ml-chev" aria-hidden="true">›</span>
          </button>
          <button type="button" class="mlist" data-action="apercu" data-apercu="investiTitres">
            <span class="ml-nom">${trad('Investi')}<span class="sub">${trad('ce que ces lignes t’ont coûté')}</span></span>
            <span class="ml-chiffres"><b>${fmtEUR(pnl.invested)}</b></span>
            <span class="ml-chev" aria-hidden="true">›</span>
          </button>
          <button type="button" class="mlist" data-action="apercu" data-apercu="pnlLatent">
            <span class="ml-nom">${trad('Plus-value latente')}<span class="sub">${trad('tant que tu ne vends pas')}</span></span>
            <span class="ml-chiffres"><b class="${cls(pnl.pnl)}">${fmtSigned(pnl.pnl)}</b>
              ${pnl.pct == null ? '' : `<span class="${cls(pnl.pnl)}">${fmtSignedPct(pnl.pct)}</span>`}</span>
            <span class="ml-chev" aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <!--           C'etait vrai trois fois. Sa barre de progression est le heros de
           Budget → Depenses, qui porte le meme montant sur le meme objectif et
           ouvre la meme fenetre de saisie. Ses trois lignes du bas — charges
           fixes, epargne theorique, taux d'epargne — sont la carte « Epargne
           mensuelle » de Budget → Charges fixes, verifiees mot pour mot avant de
           couper. Une troisieme copie ne pouvait rien apprendre que les deux
           autres ne disent mieux, chacune entouree de ce qui l'explique.

           niveauDepassement() n'a plus d'appelant direct ici mais reste vivante :
           classeDepassement() s'en sert, et sept endroits l'appellent.
           (Aucun guillemet oblique : ce commentaire vit dans un litteral de
           gabarit, un backtick y fermerait la chaine.) -->

      <!--           Elle promettait une projection et n'en faisait aucune : elle ajoutait
           un nombre saisi a la main au patrimoine du jour, sans marches, sans
           epargne, sans charges. La vraie projection vit dans l'onglet du meme
           nom, avec ses hypotheses et son horizon.

           Son champ « Rentree exceptionnelle » portait en plus le meme nom, a un
           « s » pres, que le journal des rentrees exceptionnelles de Budget →
           Releves — pour deux choses sans rapport : ici une prevision sans date,
           ecrasee a chaque saisie, la-bas une ligne datee qui explique une marche
           de la courbe. Le journal reste, la prevision part.

           La fonction projection() est partie avec elle : plus d'appelant, donc
           du code mort, la moitie qu'on oublie en retirant un affichage. Le champ
           meta.expectedInflow reste dans l'etat, comme budget.supplements avant
           lui : retirer un ecran ne doit pas emporter ce que quelqu'un y avait
           saisi, ni empecher un export d'avant de se relire.
           (Aucun guillemet oblique ici : ce commentaire vit dans un litteral de
           gabarit, un backtick y fermerait la chaine.) -->
  </div>
`}
`;
}

function mountOverview() {
  monterEvolution();
  /* Tirer pour rafraichir, ici aussi : c'est la page ou l'on se demande « ou
     j'en suis », et son patrimoine bouge avec les cours. Le geste etait reserve
     a Marches, alors que personne n'y passe pour verifier un total. */
  monteTirerRafraichir();

  const t = nowTotals();

  const pace = monthlyPace();
  /* Meme fenetre que les chiffres du dessous : les barres dessinees et la
     moyenne annoncee doivent porter sur le meme intervalle. */
  const barres = limitRange(pace.points, paceRange, { ecarts: true });
  const moyenne = barres.length
    ? barres.reduce((s, p) => s + p.delta, 0) / barres.length : pace.average;
  Charts.deltaBars($('#chartPace'), {
    height: 220,
    items: barres.map(p => ({ label: p.label, value: p.delta, note: p.note })),
    average: moyenne,
  });

  const det = $('#evoDetail');
  if (det) det.addEventListener('toggle', () => { evoDetailOuvert = det.open; });
}

/* `goto` = "vue:ancre", rend la tuile cliquable et emmène à l'endroit
   où ce chiffre se modifie réellement. */

/* Sélecteur de période commun à tous les graphiques d'historique : les trois
   raccourcis courants, puis une liste pour les durées plus rares. Un seul
   composant, pour que la commande soit identique partout où elle apparaît. */
/* Les memes cinq boutons partout, dans le meme ordre, quelle que soit la
   profondeur des donnees. Trois graphiques s'en servent — l'evolution du
   patrimoine, le rythme d'accumulation et les ventes realisees — et ils
   passent tous par ici : le geste est le meme sur les trois.

   Un cran plus long que l'historique trace la meme courbe que « Tout ». On le
   laisse quand meme, comme le font les applications boursieres : une echelle
   dont les boutons apparaissent et disparaissent avec le temps ne s'apprend
   pas. `limitRange` elargit d'elle-meme quand une fenetre ne retient qu'un
   point, donc aucun cran ne peut donner un graphique vide.

   La liste deroulante « ⋯ » a disparu avec les durees calculees. Un selecteur
   ne se justifiait que pour des crans en nombre variable. */
/* La plage, et les annees quand on en fournit.

   Une seule valeur, deux facons de l'exprimer : les crans disent une duree qui
   court jusqu'a aujourd'hui, le menu dit une annee civile. C'est le motif des
   deux portes sur un meme champ — ce qui serait fautif, ce sont deux valeurs
   rangees separement, et c'est exactement ce qu'il y avait ici : la plage
   reglait les graphiques pendant qu'un second menu d'annee reglait le journal,
   et rien n'empechait l'un de dire 2025 et l'autre 2026.

   Le menu ne liste que les annees ou quelque chose s'est passe, et il disparait
   sous deux : choisir entre une seule annee n'est pas un choix. Quand une annee
   est active, aucun cran n'est allume — sinon deux contrôles se prevaudraient de
   la meme valeur. */
function rangeControl(action, courant, annees = []) {
  const surAnnee = estAnnee(courant);
  const connu = HISTORY_RANGES.some(r => r.id === courant);
  return `
    <div class="plage">
      <div class="segmented">
        ${HISTORY_RANGES.map(r => `<button data-action="${action}" data-range="${r.id}"
          class="${!surAnnee && (r.id === courant || (!connu && r.id === 'all')) ? 'on' : ''}"
          >${esc(r.label)}</button>`).join('')}
      </div>
      ${annees.length > 1 ? `
      <select data-action-change="${action}" class="annee" title="${trad('Année affichée')}">
        <option value="">${trad('Par année')}</option>
        ${annees.map(y => `<option value="${esc(y)}" ${String(y) === String(courant) ? 'selected' : ''}
          >${esc(y)}</option>`).join('')}
      </select>` : ''}
    </div>`;
}

/* Nom d'un compte, modifiable sur place. Renommer est sans danger : c'est
   l'identifiant interne qui porte les montants, jamais le libellé. Le nom
   change donc partout à la fois — relevés, allocation, exports — et aucune
   donnée n'est re-classée. Le nom court, lui, sert d'en-tête de colonne dans
   les relevés : on le laisse à part pour ne pas casser un tableau serré. */
function nomCompte(a) {
  const i = Store.state.accounts.indexOf(a);
  return `<input class="acct-nom" data-path="accounts.${i}.label" value="${esc(a.label)}"
                 title="${trad('Renommer ce compte, le nom suit partout')}" autocomplete="off">`;
}

/* Pastille de couleur, à poser devant un libellé pour le relier à sa part dans
   le graphique voisin. Le filtre écarte tout ce qui n'est pas une couleur que
   l'application produit elle-même : ces valeurs finissent dans un attribut
   `style`, et une chaîne venue d'ailleurs y aurait sa place trop facilement.
   Rien à afficher s'il n'y a pas de couleur — pas de pastille grise inerte. */
const COULEUR_SURE = /^(var\(--[\w-]+\)|#[0-9a-f]{3,8}|rgba?\([\d.,\s%/]+\)|hsla?\([\d.,\s%/deg]+\))$/i;
function pastilleTeinte(couleur) {
  const c = String(couleur ?? '').trim();
  return COULEUR_SURE.test(c) ? `<i class="teinte" style="--c:${c}" aria-hidden="true"></i>` : '';
}

/* Petite aide contextuelle. Un « ? » discret à côté d'un terme, qui explique
   d'où vient un chiffre sans encombrer la page. Le panneau se place à droite
   ou à gauche selon la place disponible — près du bord, il bascule. */
function aide(texte) {
  /* Un `<span>` et non un `<button>`, et c'est la correction d'un vrai defaut.

     Un `<label>` sans `for` designe le premier element etiquetable qu'il
     contient, et un `<button>` en est un. Le navigateur renvoyait donc au « ? »
     tout clic tombe sur l'intitule, et lui donnait le focus a la place du champ :
     la bulle s'ouvrait sur toute la ligne. Les treize intitules qui portent un
     « ? » etaient concernes, pas seulement celui qu'on a vu.

     Un `<span>` n'est pas etiquetable : le label ne le voit plus. `role` et
     `tabindex` lui rendent ce qu'un bouton donnait, et `monteAides` ecoute
     Entree et Espace, qu'un span ne convertit pas en clic tout seul. */
  return `<span class="aide" role="button" data-aide="${esc(texte)}"
                aria-label="Explication" tabindex="0">?</span>`;
}

/* La version du code en cours d'execution, lue sur la balise du script.

   Elle se **derive**, elle ne se recopie pas : la seule source est le `?v=` que
   `CLAUDE.md` impose de changer a chaque modification d'`assets/`, et un second
   endroit a mettre a jour aurait fini par mentir — ce qui serait le comble pour
   un numero de version.

   Pourquoi elle existe : deux fois dans la meme journee, la question « est-ce que
   je regarde la version deployee ? » a coute une demi-heure, et `ETAT.md` note
   deux mesures faites sur la version d'avant sans que rien ne le signale. Sur un
   telephone il n'y a pas d'outils de developpement pour trancher. Trois lignes
   ici, et la question ne se repose plus. */
const VERSION_APP = (() => {
  const s = [...document.scripts].map(x => x.src).find(x => /assets\/app\.js/.test(x));
  if (!s) return 'inconnue';
  try { return new URL(s, location.href).searchParams.get('v') || 'sans balise'; }
  catch { return 'inconnue'; }
})();

/* La date d'achat est demandee a trois endroits — les deux fenetres de creation
   et la fiche de la ligne. Le texte vit donc une fois : trois copies auraient
   diverge des la premiere retouche, et c'est deja arrive ici avec la formule du
   taux d'achat, qu'on a retrouvee en trois exemplaires dont deux fausses. */
const DATE_ACHAT_AIDE =
  'Facultative, mais deux chiffres en dépendent. Le rendement par an, qui ramène '
  + '« +36 % » à une échelle comparable, car sans date il ne dit pas s’il a fallu un '
  + 'an ou cinq. Et l’effet du jour : une ligne achetée aujourd’hui se compare à ton '
  + 'prix d’achat, pas à la clôture d’hier, que tu n’as pas vécue. Pour une ligne '
  + 'renforcée plusieurs fois, mets la date du premier achat.';

/* Tout est pose une fois, sur le document, et jamais sur les « ? » eux-memes.

   La delegation le corrige par construction, et pour celles qu'on ajoutera :
   un ecouteur ne connaît pas les elements, il connaît un attribut. C'est le
   raisonnement que la fermeture au premier appui ailleurs suivait deja, quelques
   lignes plus bas — il valait pour tout le reste. */
function monteAides() {
  if (monteAides.monte) return;
  monteAides.monte = true;

  const panneau = document.createElement('div');
  panneau.className = 'aide-panneau';
  panneau.hidden = true;
  document.body.appendChild(panneau);

  const montrer = btn => {
    panneau.textContent = btn.dataset.aide;
    panneau.hidden = false;                 // mesurable seulement une fois visible
    const r = btn.getBoundingClientRect();
    const largeur = panneau.offsetWidth;
    const place = window.innerWidth - r.right;
    // à droite si ça tient, à gauche sinon
    const gauche = place < largeur + 20
      ? Math.max(8, r.left - largeur - 10)
      : r.right + 10;
    /* Plus de `window.scrollY` dans ce calcul, et c'est le deuxieme defaut du
       lot : le panneau est en `fixed`, donc en coordonnees de fenetre, comme
       `getBoundingClientRect()`. L'addition etait deja fausse des qu'une fenetre
       etait ouverte — `gelerFond()` met le corps en `position: fixed`, le
       document n'a plus rien a faire defiler, `scrollY` retombe a zero, et la
       bulle se serait posee la ou la page etait avant le gel.
       Et elle ne sort pas par le bas : dans une feuille qui monte du bas, le
       « ? » d'une derniere ligne est a quelques pixels du bord. */
    panneau.style.left = `${gauche}px`;
    panneau.style.top = `${Math.max(8,
      Math.min(r.top - 4, window.innerHeight - panneau.offsetHeight - 8))}px`;
  };
  const cacher = () => { panneau.hidden = true; };

  /* Tout porteur de `data-aide` declenche le panneau, pas seulement le « ? ».

     Un intitule de colonne n'a pas la place d'un bouton a cote de lui : sur un
     telephone, « Poids » occupe deja 40 des 48 pixels de sa colonne. C'est donc
     l'intitule lui-meme qui porte l'explication, souligne d'un pointille. Le
     « ? » rond reste partout ou il y a de la place, en tete de carte. */
  const vise = e => e.target.closest?.('[data-aide]');

  /* `mouseover` et `focusin`, non `mouseenter` et `focus` : seuls les premiers
     remontent jusqu'au document, et un ecouteur delegue ne voit que ce qui
     remonte jusqu'a lui. */
  document.addEventListener('mouseover', e => { const b = vise(e); if (b) montrer(b); });
  document.addEventListener('mouseout',  e => { if (vise(e)) cacher(); });
  document.addEventListener('focusin',   e => { const b = vise(e); if (b) montrer(b); });
  document.addEventListener('focusout',  e => { if (vise(e)) cacher(); });
  document.addEventListener('click', e => {
    const b = vise(e);
    if (b) { e.preventDefault(); montrer(b); }
  });
  /* Un span ne repond pas au clavier de lui-meme : ce que le bouton faisait
     gratuitement, il faut l'ecrire. */
  document.addEventListener('keydown', e => {
    const b = vise(e);
    if (!b || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    montrer(b);
  });

  /* Un appui ailleurs referme le panneau.

     Le survol et la perte de focus suffisaient a la souris et au clavier. Au
     doigt il n'y a pas de survol, et un appui ne donne pas forcement le focus :
     le panneau restait donc ouvert jusqu'au rendu suivant, pose au milieu du
     tableau qu'on venait consulter. La phase de capture, pour fermer meme si la
     cible arrete l'evenement. */
  document.addEventListener('pointerdown', e => { if (!vise(e)) cacher(); }, true);
}

/* Sélecteur d'année. Une liste plutôt que des onglets : au bout de dix ans
   de relevés, une rangée de boutons déborderait de l'écran. */
/* Le cran « Toutes les années » n'existe plus, nulle part.

   Il a d'abord quitte Budget (9 aout, matin), puis tout le reste le meme
   jour : « ce sera illisible en l'etant apres longtemps ». Verification
   faite, les quatre selecteurs gouvernent tous des LISTES — releves,
   journal des apports, journal des ventes, tableau sous la courbe — et dix
   ans de lignes empilees ne repondent a aucune question. La courbe
   d'evolution, elle, garde sa vue longue par ses pastilles de duree : une
   courbe comprime, une liste s'allonge. Le comparatif d'annees note dans
   ETAT.md est l'autre reponse, celle qui compare au lieu d'empiler. */
function yearControl(action, annees, courante) {
  return `
    <select data-action-change="${action}" class="annee" title="${trad('Année affichée')}">
      ${annees.map(y => `<option value="${y}" ${String(y) === String(courante) ? 'selected' : ''}>${y}</option>`).join('')}
    </select>`;
}

function tile(label, value, pct, color, meta, apercu, arg) {
  const inner = `
    <span class="t-label">${esc(trad(label))}</span>
    <span class="t-value">${fmtEUR(value)}</span>
    <span class="t-meta">${pct == null ? '' : `<span class="tag">${fmtPct(pct)}</span>`}${escMontant(meta || '')}</span>`;
  if (!apercu) return `<div class="tile" style="--tile-color:${color}">${inner}</div>`;
  return `<button type="button" class="tile tile-link" style="--tile-color:${color}"
            data-action="apercu" data-apercu="${esc(apercu)}"${arg ? ` data-arg="${esc(arg)}"` : ''}
            title="${trad('Voir le détail de')} ${esc(trad(label))}">${inner}<span class="t-go">⋯</span></button>`;
}

/* ------------------------------------------------------------
   Préférences — ce qui règle l'app, pas ce qu'elle contient
   ------------------------------------------------------------ */
function viewSettings() {
  const m = Store.state.meta;
  return `
  <div class="grid g-2">
    <div class="card">
      <div class="card-head"><h2>${t('settings.language')}</h2></div>
      <div class="modal-champs">
        <div class="field">
          <label>${t('settings.language.label')}</label>
          <select data-action-change="set-lang">
            ${LANGS.map(([code, nom]) =>
              `<option value="${code}" ${code === currentLang() ? 'selected' : ''}>${nom}</option>`).join('')}
          </select>
          <span class="hint">${t('settings.language.hint')}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>${t('settings.appearance')}</h2></div>
      <div class="modal-champs">
        <div class="field">
          <label>${t('settings.theme')}</label>
          <select data-action-change="set-theme">
            <option value="dark" ${currentTheme() === 'dark' ? 'selected' : ''}>${t('settings.theme.dark')}</option>
            <option value="light" ${currentTheme() === 'light' ? 'selected' : ''}>${t('settings.theme.light')}</option>
          </select>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>${t('settings.behaviour')}</h2></div>
    <div class="modal-champs">
      <div class="field">
        <label>${t('settings.autorefresh')}</label>
        <select data-path="meta.autoRefresh" data-type="bool">
          <option value="true" ${m.autoRefresh ? 'selected' : ''}>${t('settings.autorefresh.on')}</option>
          <option value="false" ${m.autoRefresh ? '' : 'selected'}>${t('settings.autorefresh.off')}</option>
        </select>
        <span class="hint">${t('settings.autorefresh.hint')}</span>
      </div>
      <div class="field">
        <label>${t('settings.exchange')}</label>
        <select class="menu-serre" data-path="meta.preferredExchange">
          ${EXCHANGES.map(([region, places]) => `<optgroup label="${esc(region)}">${
            places.map(([v, l]) => `<option value="${v}" ${v === (m.preferredExchange ?? '.PA') ? 'selected' : ''}>${esc(l)}</option>`).join('')
          }</optgroup>`).join('')}
        </select>
        <span class="hint">${t('settings.exchange.hint')}</span>
      </div>
    </div>
  </div>

  <!-- Une carte disait ici où trouver l'export et les sauvegardes, avec un
       bouton pour y aller : elle existait du temps où Données était le
       sous-onglet voisin, que rien n'annonçait. Le menu porte les deux entrées,
       à deux lignes l'une de l'autre — l'indication répétait le menu. -->

`;
}

/* ------------------------------------------------------------
   Notifications — ce que la cloche a le droit de dire
   ------------------------------------------------------------ */
/* Une page à elle, et non une carte au bas des préférences : elle a son entrée
   de menu, donc sa vue. C'est la règle de cette application — une entrée, une
   adresse, un titre — et c'est aussi ce qui évite de régler la même chose à
   deux endroits.

   Les quatre familles viennent du modèle : un niveau ajouté au calcul
   manquerait sinon à ce menu sans que rien ne le dise. */
function viewNotifs() {
  const n = notifications();
  const masquees = notifsMasquees();
  return `
  <div class="card">
    <!-- « Ce que la cloche signale » est devenu « Notifications ».

         Et les listes deroulantes « Signaler / Ignorer » deviennent des
         interrupteurs. Un menu a deux choix, c'est un interrupteur qui demande
         deux gestes au lieu d'un, et qui cache son etat derriere un mot la ou
         une position se lit d'un coup d'oeil. -->
    <div class="card-head"><h2>Notifications</h2>
      <span class="hint">${n.length ? `${n.length} ${trad('en attente')}` : trad('rien à signaler')}</span></div>
    <p class="hint" style="margin:0 0 12px">${trad('La cloche de l’en-tête montre les saisies qui restent à faire et les contrôles de cohérence : ce que l’application sait d’incomplet ou de faux. Une famille éteinte ne compte plus dans sa pastille.')}</p>
    <div class="bascules">
      ${FAMILLES_NOTIF.map(([cle, nom, quoi]) => {
        const actif = reglagesNotifs()[cle];
        return `
        <button type="button" class="bascule${actif ? ' on' : ''}"
                data-action="famille-notif" data-cle="${esc(cle)}"
                role="switch" aria-checked="${actif}">
          <span class="bascule-txt">${esc(nom)}<span class="sub">${esc(quoi)}</span></span>
          <span class="bascule-piste" aria-hidden="true"><i></i></span>
        </button>`;
      }).join('')}
    </div>

    <!-- Le jour où la cloche réclame. Ici et non dans Budget : ce réglage ne
         déplace pas ce qu'on compte, seulement le moment où l'on est relancé, et
         c'est le sujet de cette page.

         Il vaut pour les deux saisies. Deux jours séparés, un pour le relevé et
         un pour les dépenses, se seraient contredits sans que rien ne le
         détecte, et personne ne fait ses comptes deux fois par mois. -->
    <div class="modal-champs" style="margin-top:12px">
      <div class="field">
        <label>${trad('Jour du rappel')}${aide(trad("Avant ce jour, la cloche ne réclame ni relevé ni dépenses. Utile si tu fais tes comptes à date fixe : payé le 15, tu ne veux pas d’une pastille allumée quinze jours pour rien. Les mois, eux, restent calendaires : ce réglage déplace le rappel, pas le calcul."))}</label>
        <select data-path="meta.jourRappel" data-type="num">
          ${Array.from({ length: 28 }, (_, i) => i + 1).map(j =>
            `<option value="${j}" ${j === jourRappel() ? 'selected' : ''}>${
              j === 1 ? trad('le 1er du mois') : `${trad('le')} ${j} ${trad('du mois')}`}</option>`).join('')}
        </select>
        <!-- 28 au plus, parce que fevrier existe : un jour 30 ne serait jamais
             atteint deux mois par an, et le rappel se tairait sans raison
             lisible. -->
        <span class="hint">${jourRappelAtteint()
          ? trad('Ce jour est passé : les saisies en attente sont réclamées.')
          : `${trad('La cloche attendra le')} ${jourRappel()} ${trad('pour réclamer les saisies de ce mois.')}`}</span>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>${trad('Masquées une à une')}</h2>
      <span class="hint">${trad('par leur croix, dans le panneau')}</span></div>
    ${masquees.length ? `
      <p class="hint" style="margin:0 0 12px">${masquees.length} ${masquees.length > 1 ? trad('notifications ne reviendront plus.') : trad('notification ne reviendra plus.')} ${trad('Une alerte masquée reste vraie : elle ne s’affiche plus, elle ne se corrige pas.')}</p>
      <button class="btn sm ghost" data-action="rendre-notifs">${trad('Tout réafficher')}</button>`
      : `<p class="empty">${trad('Aucune. La croix d’une ligne du panneau la fait disparaître, et c’est ici qu’on la ramène.')}</p>`}
  </div>

  ${n.length ? `
  <div class="card">
    <div class="card-head"><h2>${trad('En attente')}</h2></div>
    ${n.map(x => `
      <div class="plc-ligne">
        <span class="cpt-nom">${esc(x.title)}<span class="sub">${escMontant(x.detail)}</span></span>
        <button class="btn sm ghost" data-action="goto" data-view="${esc(x.view)}"
                data-anchor="">${trad('Voir')}</button>
        <button class="btn icon xs" data-action="masquer-notif" data-cle="${esc(x.cle)}"
                title="${trad('Ne plus signaler')}" aria-label="Ne plus signaler : ${esc(x.title)}">✕</button>
      </div>`).join('')}
  </div>` : ''}`;
}

/* ------------------------------------------------------------
   Performance — la plus-value, latente puis encaissée
   ------------------------------------------------------------ */
function viewPerformance() {
  const lat = latentPnl();
  const st = salesStats(salesRange);
  const tout = salesStats('all');
  const total = lat.pnl + tout.realised;
  /* La plage se nomme ici, dans les tuiles et les en-tetes des graphiques ; le
     contrôle qui la change vit sur la carte du journal, et lui seul. */
  const libellePlage = rangeLabel(salesRange);
  /* « Tout » est la seule plage ou la latente et l'encaisse couvrent la meme
     periode, donc la seule ou leur somme se tient. */
  const surTout = salesRange === 'all';

  /* Une page de plus-values pour quelqu'un qui ne detient rien et n'a rien
     vendu : des tuiles a zero, deux graphiques vides et un journal vide. La page
     voisine explique deja ou vivent les titres cotes et comment en poser un ;
     celle-ci dit de quoi une plus-value est faite, et y renvoie. */
  if (!lat.count && !tout.count) return `
  <div class="card">
    <p class="empty" style="margin:0 0 12px">${trad('Une plus-value se mesure sur des lignes que tu détiens : '
      + 'la latente vient de leur prix de revient, l’encaissée du journal de tes ventes. '
      + 'Pose une première ligne et cette page se remplit toute seule.')}</p>
    <button type="button" class="btn" data-action="sous-onglet" data-route="positions">${trad('Aller à Positions')}</button>
  </div>`;

  return `
  <!-- La plus-value latente vaut ce que les cours disent : la page porte donc
       leur anciennete, en haut, avant les chiffres qu'elle date. Elle ne la
       portait pas, et le grand chiffre s'affichait sans une heure. Rien a dater
       en revanche pour qui n'a que des ventes au journal, dont chaque ligne
       porte sa propre date. -->
  ${lat.count ? barreEtatCours() : ''}

  <!-- La rangee suit la plage, et chaque tuile dit sur quoi elle porte.

       L'encaissee suit le selecteur : c'est la demande, et elle a un sens, une
       vente ayant une date. La latente ne peut pas suivre, et ce n'est pas un
       oubli : elle mesure ce que valent les lignes qu'on detient aujourd'hui
       contre ce qu'elles ont coute. Il n'existe pas de « plus-value latente sur un
       an » sans une histoire des prix de revient mois par mois, qui n'est pas
       tenable ici. Elle reste donc au present, et son libelle ne promet rien
       d'autre.

       D'ou la borne dans le libelle et non dans la meta. La raison a change sans
       que la decision bouge : la meta etait masquee sous 768 px, elle s'affiche
       depuis qu'un chiffre doit dire sa base sur telephone comme ailleurs. Mais
       une borne de temps n'est pas une precision sur le chiffre, c'est une part de
       son nom : « PLUS-VALUE ENCAISSEE » qui vaudrait un an sans le dire serait
       faux des le libelle, pas seulement incomplet.

       Et le total n'apparait que sur « Tout ». Ailleurs il additionnerait une
       latente d'aujourd'hui a un encaisse d'un an : deux bornes dans une seule
       somme, exactement ce qu'une rangee ne doit pas faire. Sur « Tout » les deux
       parts couvrent la meme periode, et la somme se verifie a l'oeil. -->
  <div class="grid ${surTout && tout.count ? 'g-3' : 'g-2'} g-tuiles">
    <button type="button" class="tile tile-link" style="--tile-color:${
      !lat.count ? 'var(--series-2)' : lat.pnl >= 0 ? 'var(--good)' : 'var(--critical)'}"
            data-action="apercu" data-apercu="perfLatente">
      <span class="t-label">${trad('Plus-value latente')}</span>
      <!-- Meme regle que la tuile voisine : qui a tout vendu ne detient plus rien,
           et « +0 € » annoncerait un gain nul au lieu d'une absence de ligne. -->
      <span class="t-value ${lat.count ? cls(lat.pnl) : ''}">${
        lat.count ? fmtSigned(lat.pnl) : fmtEUR0(0)}</span>
      <!-- Le pourcentage se tait sans prix de revient : sa base serait nulle. -->
      <span class="t-meta">${lat.pct == null ? '' : `<span class="tag">${fmtSignedPct(lat.pct)}</span>`}${
        lat.count ? trad('pas encore vendue') : trad('aucune ligne détenue')}</span>
      <span class="t-go">⋯</span>
    </button>
    <button type="button" class="tile tile-link" style="--tile-color:${
      !st.count ? 'var(--series-2)' : st.realised >= 0 ? 'var(--good)' : 'var(--critical)'}"
            data-action="apercu" data-apercu="perfRealisee" data-arg="${esc(salesRange)}">
      <span class="t-label">${trad('Plus-value encaissée')}${surTout ? '' : ` · ${esc(libellePlage)}`}</span>
      <!-- Sans une seule vente sur la periode, « +0 € » annonce un gain nul la ou
           il n'y a rien eu : le zero se dit sans signe, et la meta dit pourquoi. -->
      <span class="t-value ${st.count ? cls(st.realised) : ''}">${
        st.count ? fmtSigned(st.realised) : fmtEUR0(0)}</span>
      <span class="t-meta">${st.count
        ? `${st.pct == null ? '' : `<span class="tag">${fmtSignedPct(st.pct)}</span>`}${
            st.wins}/${st.count} ${st.count > 1 ? trad('ventes gagnantes') : trad('vente gagnante')}`
        : tout.count ? trad('aucune vente sur cette période.') : trad('aucune vente encore')}</span>
      <span class="t-go">⋯</span>
    </button>
    ${surTout && tout.count ? `
    <button type="button" class="tile tile-link" style="--tile-color:${total >= 0 ? 'var(--good)' : 'var(--critical)'}"
            data-action="apercu" data-apercu="perfTotale">
      <span class="t-label">${trad('Résultat de tes positions')}</span>
      <span class="t-value ${cls(total)}">${fmtSigned(total)}</span>
      <span class="t-meta">${trad('latente et encaissée, depuis le début')}</span>
      <span class="t-go">⋯</span>
    </button>` : ''}
  </div>

  <!-- Latente, journal, realisee : ce qu'on detient, puis ce qu'on a vendu, puis
       le detail des ventes.

       Le journal ouvrait la page et separait les deux cartes des ventes par celle
       du portefeuille detenu. L'etat vide de la troisieme l'avouait : « le journal,
       plus haut, porte le bouton pour en saisir une ». Une carte qui doit donner
       l'itineraire vers sa voisine est mal placee.

       La grille qui enveloppait les deux dernieres portait une classe qui n'existe
       pas dans la feuille, g-1-2 : elle ne rendait donc qu'une colonne, et les
       cartes s'empilaient deja. Elle disparait sans rien changer au rendu, et les
       trois cartes deviennent trois voisines que la vue espace comme les autres.
       (Aucun backtick dans ce commentaire : il vit dans un litteral de gabarit,
       et fermerait la chaine.) -->
  <div class="card">
    <div class="card-head"><h2>${trad('Latente, ligne par ligne')}</h2>
      <span class="hint">${lat.count} ${lat.count > 1 ? trad('lignes') : trad('ligne')}</span></div>
    <div class="chart" id="perfLatente"></div>
    <dl class="kv" style="margin-top:12px">
      <dt>${trad('Valeur du portefeuille')}</dt><dd>${fmtEUR(lat.value)}</dd>
      <dt>${trad('Prix de revient')}</dt><dd>${fmtEUR(lat.invested)}</dd>
      <dt>${trad('Écart')}</dt><dd class="${cls(lat.pnl)}"><b>${fmtSigned(lat.pnl)}</b></dd>
      <!-- « Rendement annuel » vivait ici, et il est parti.

           Le chiffre n'etait alors ni pondere par le temps, ni par les
           montants : selon qu'on a renforce en hausse ou en baisse, il
           surestime ou sous-estime, et on ne sait meme pas dans quel sens. Un
           lecteur qui sait dans quel sens un chiffre se trompe peut s'en
           servir ; celui-la, non.

           Une case « alimentee regulierement » a ete envisagee puis ecartee :
           elle aurait demande du travail pour que l'application cesse de
           mentir, et sur ce portefeuille elle aurait eteint le chiffre sur les
           lignes qui portent l'essentiel de la valeur. Un indicateur qui ne
           couvre plus 20 % du portefeuille est une decoration.

           Ce qui reste dit vrai : l'ecart en euros et en pourcentage, qui ne
           depend pas de la façon dont la ligne s'est constituee. Et la fiche
           de chaque ligne annonce depuis combien de temps elle est detenue —
           la duree comme un fait, pas comme un taux. -->
    </dl>
    <!-- Trois lignes de prose vivaient ici, sous la colonne de chiffres, pour
         reserver l'ecart du jour : « ces lignes n'ont pas de date d'achat, leur
         ecart du jour suppose que tu les detenais hier soir ».

         Elles sont parties, et rien n'est perdu. La reserve etait juste, mais
         posee sur la mauvaise carte : celle-ci montre la plus-value latente,
         qui ne depend d'aucune date. L'ecart du jour s'affiche ailleurs, et sa
         colonne « Var. » porte deja la meme reserve dans son aide, a l'endroit
         exact ou le chiffre concerne se lit. Une reserve se dit une fois, la ou
         elle porte. -->
  </div>

  <!-- Le journal avant les graphiques, et non en pied de page.

       C'est la carte qu'on vient lire : elle porte des faits datés et nommés,
       quand les deux graphiques en dessous en donnent la forme. Elle porte aussi
       la borne de temps de toute la page, qui se trouve donc au-dessus de ce
       qu'elle commande — un contrôle range en bas d'ecran agirait sur des
       graphiques qu'on ne voit plus. -->
  ${salesCard()}

  <div class="card">
    <!-- L'intitule dit ce qu'une barre represente, et il change avec elle :
         « vente par vente » au-dessus de barres trimestrielles annoncerait la
         mauvaise lecture. -->
    <!-- Pas de selecteur de plage ici : le journal, juste au-dessus, porte
         celui de la page. Deux exemplaires du meme contrôle a deux cents pixels
         d'ecart se lisent comme deux reglages, et l'un des deux passe pour
         inerte. Il est en haut parce que c'est la que la borne se choisit, et
         ces graphiques la suivent. -->
    <div class="card-head"><h2>${trad('Réalisée')}, ${st.count && !ventesSeNomment(salesRange, st.count)
      ? `${trad('par')} ${pasDesVentes(salesRange)}` : trad('vente par vente')}</h2>
      <span class="hint">${esc(libellePlage)}</span></div>
    ${st.count ? `<div class="chart" id="perfVentes"></div>` : `
      <p class="empty">${tout.count
        ? `${trad('Aucune vente sur cette période.')} ${tout.count} ${trad('au total : élargis la plage.')}`
        : trad('Aucune vente enregistrée. Le journal, plus haut, porte le bouton pour en saisir une.')}</p>`}
  </div>

  ${st.count ? `
  <div class="card">
    <div class="card-head"><h2>${trad('Cumul des plus-values encaissées')}</h2>
      <span class="hint">${esc(libellePlage)} · ${st.count} vente${st.count > 1 ? 's' : ''}, dans l'ordre</span></div>
    <div class="chart" id="perfCumul"></div>
  </div>` : ''}`;
}

function mountPerformance() {
  /* Le pli du journal se retient sans passer par `render()` : le rappeler ici
     rendrait la page a chaque ouverture, donc detruirait le `<details>` qu'on
     vient d'ouvrir, donc annulerait le geste. */
  const pli = $('#pliVentes');
  if (pli) pli.ontoggle = () => { journalDeroule = pli.open; };

  /* L'indice voyage avec la barre. Il se retrouvait par le nom, `findIndex(p =>
     p.name === it.label)`, et deux titres homonymes sur deux comptes ouvraient
     donc la meme fiche — le defaut deja corrige sur le jumeau de ce graphique
     dans Marches, et reste ici parce que la correction n'avait vise qu'une des
     deux copies. Le jumeau est parti, celle-ci est la seule, et elle est juste. */
  const items = Store.state.positions
    .map((p, index) => ({ index, label: p.name, value: posPerfEur(p), pct: posPerfPct(p) }))
    .sort((a, b) => b.value - a.value);
  Charts.rankedBars($('#perfLatente'), { items, keepZero: true, color: Charts.cssv('--good'),
    onPick: it => ACTIONS['open-position']({ dataset: { i: String(it.index) } }) });

  /* Une barre par vente tant qu'il y en a peu, une barre par periode ensuite.

     Le seuil ne porte pas sur le nombre de ventes mais sur le pas de la plage :
     `pasDesVentes()` rend « mois » pour un an, « trimestre » pour cinq, « annee »
     pour tout. Une vue d'un an garde donc ses ventes nommees, ce qui est le cas
     ou l'on veut savoir laquelle ; au-dela, on cherche un rythme, et le nom de
     chaque titre n'y aide plus.

     La moyenne suit le meme decoupage : moyenne par vente sur la vue nommee,
     moyenne par periode sur les autres. Une moyenne qui ne se rapporte pas a ce
     que la barre represente est le genre de chiffre qui se recopie ailleurs et
     devient faux. */
  const stV = salesStats(salesRange);
  const ventes = stV.sales;
  if (ventes.length) {
    const parVente = ventesSeNomment(salesRange, ventes.length);
    const items = parVente
      ? ventes.slice().reverse().map(v => ({ label: v.name, value: num(v.realised) }))
      : ventesParPeriode(ventes, pasDesVentes(salesRange))
          .map(p => ({ label: p.label, value: p.value }));
    Charts.deltaBars($('#perfVentes'), {
      height: 260, items,
      average: items.length ? stV.realised / items.length : 0,
    });
  }

  const cumul = salesCumulative(salesRange);
  if (cumul.length) {
    Charts.deltaBars($('#perfCumul'), {
      height: 240,
      items: cumul.map(c => ({ label: c.label, value: c.cumulative })),
    });
  }
}

/* ------------------------------------------------------------
   Objectif, la cible de l'année, puis la trajectoire longue
   ------------------------------------------------------------ */
/* Ce qu'une ligne de projection dit quand aucun rendement ne lui est appliqué.

   Trois lignes portent cette phrase — l'immobilier net, le non coté à zéro, les
   liquidités — et c'est celle des liquidités qui annonçait « 8,00 % par an ».
   Une phrase recopiée à trois endroits finit toujours par ne plus l'être à l'un
   d'eux ; c'est arrivé à la formule du taux d'achat, retrouvée en trois
   exemplaires dont deux faux.

   Le champ « Rendement des liquidités » de la carte des hypothèses ne la porte
   pas, et ce n'est pas un oubli : il répond à « quel taux ? » par « aucun »,
   quand ces lignes-ci répondent à « qu'est-ce qui lui arrive ? ». Deux
   questions, deux réponses ; ce serait la même phrase à deux endroits qui
   poserait problème. */
const A_PLAT = trad('porté à plat, sans rendement');

/* La longueur maximale d'un nom de ligne.

   Trente, et pas vingt : « Uber Technologies, Inc. » en fait vingt-trois, et
   c'est un nom que la recherche remplit toute seule. Une borne qui couperait ce
   que l'application vient d'ecrire serait une borne fausse.

   Elle s'applique a la saisie, pas aux noms deja enregistres : tronquer en
   silence ce que quelqu'un a ecrit detruit une donnee sans le lui dire. Les
   anciens noms trop longs se coupent a l'affichage, avec des points de
   suspension, et se relisent en entier dans la fiche. */
const NOM_LIGNE_MAX = 30;


/* L'horizon vit dans l'état : le choix survit au rechargement, et la fenêtre
   d'aperçu peut le modifier par un simple data-path. */
Object.defineProperty(window, 'projHorizon', {
  get: () => num(Store.state?.meta?.projHorizon) || 20,
  set: v => { Store.state.meta.projHorizon = num(v) || 20; },
});

/* Le sélecteur d'horizon, écrit une fois pour ses deux portes.

   Une seule valeur, donc, et deux endroits qui l'écrivent. C'est le motif déjà
   retenu pour l'année du journal : deux portes sur un même champ sont saines,
   puisqu'il n'y a qu'une valeur et que changer l'une déplace l'autre. Ce qui
   serait fautif, ce sont deux valeurs rangées séparément — et c'est ce qu'on
   vient de retirer.

   Rien n'est perdu de la ligne libre : `capitalisation()` ajoute toujours
   l'horizon courant à ses jalons, donc choisir 60 ans fait apparaître la ligne
   60 ans dans le tableau, à sa place chronologique, et le graphique et le total
   de la première carte y vont avec. */
const selecteurHorizon = () => {
  /* L'horizon courant figure toujours dans la liste, même quand les jalons du
     tableau le portent déjà. Un menu qui n'offre pas sa propre valeur affiche
     la première venue : il annoncerait alors un horizon qui n'est pas celui du
     graphique ni de la ligne marquée. Le défaut, vingt ans, est exactement ce
     cas — et il disparaît de la liste dès qu'on en choisit un autre. */
  const choix = PROJECTION_CHOICES.includes(projHorizon)
    ? PROJECTION_CHOICES
    : [...PROJECTION_CHOICES, projHorizon].sort((a, b) => a - b);
  return `
  <select data-action-change="proj-horizon" style="width:auto">
    ${choix.map(h => `<option value="${h}" ${h === projHorizon ? 'selected' : ''}>
      ${h} ${trad('ans')}, ${new Date().getFullYear() + h}</option>`).join('')}
  </select>`;
};

/* Le depliant des hypotheses. Ferme par defaut : le resume des valeurs sert
   de poignee, on ne deplie que pour regler. */
let hypoOuvert = false;

function viewObjective() {
  /* Capitaliser zero pendant cinquante ans donne zero, sur dix horizons et deux
     graphiques. Le versement mensuel compte autant que le capital : quelqu'un
     qui part de rien mais versera 300 EUR par mois a une projection qui a du
     sens, et cette page doit alors s'afficher. */
  if (!(patrimoine().brut > 0.005) && !(num(Store.state.meta.projMonthly) > 0)) {
    return pageAvantDonnees('Une projection part de ce que tu as et de ce que tu mets de '
      + 'côté chaque mois. Sans l’un ni l’autre, elle ne peut que multiplier zéro par les '
      + 'années. Déclare un compte, ou règle un versement mensuel dans tes hypothèses.');
  }
  const g = objectiveStatus();
  /* La carte de l'objectif, arrivee de l'accueil : le cap d'abord, la
     trajectoire ensuite. */
  const carteObjectif = () => {
    const an = Store.state.meta.objectiveYear;
    const mois = monthsToObjective();

    /* Pas d'objectif déclaré, pas de carte : une ligne, et de quoi en poser un.

       « Si quelqu'un n'aime pas cette barre, il fait comment ? » Il ne faisait
       rien : la carte se rendait quand même, avec un objectif à zéro. Et zéro
       donne `remaining = total`, donc un montant positif — elle annonçait
       « +30 585 € de dépassement · Objectif atteint 🎉 » sur un cap que personne
       n'avait fixé. Une carte qui se félicite d'un objectif inexistant est pire
       qu'une carte qu'on ne veut pas.

       Mettre la cible à zéro est donc la sortie, et c'est la bonne : un état se
       déclare. Pas d'interrupteur « masquer cette carte » — un réglage dont le
       seul effet est de cacher quelque chose double la question, puisqu'il
       faudrait ensuite se souvenir qu'on l'a caché.

       Mais elle ne se verrouille pas : la carte est la seule porte vers ce
       réglage, la faire disparaître entièrement enfermerait dehors quiconque
       change d'avis. Il reste donc une ligne, discrète, qui ouvre la même
       fenêtre. */
    if (!(num(g.obj) > 0)) return `
  <button type="button" class="card goal card-link goal-vide" data-action="apercu"
          data-apercu="objectif" title="${trad('Fixer un objectif de patrimoine')}">
    <span>Aucun objectif fixé pour ${esc(an)}</span>
    <span class="muted">${trad('En poser un →')}</span>
  </button>`;

    return `
  <button type="button" class="card goal card-link" data-action="apercu" data-apercu="objectif"
          title="${trad('Modifier l\'objectif')}">
    <div class="card-head">
      <h2>${trad('Objectif à fin')} ${esc(an)}</h2>
      <span class="hint">${mois
        ? `${mois} ${mois > 1 ? trad('mois restants') : trad('mois restant')}`
        : trad('dernier mois')} · ${fmtPct(g.pct, 2)} ${trad('atteint')}</span>
    </div>
    <!-- L'écart en tête, le patrimoine en note.

         Ce que cette carte apporte en propre, personne d'autre ne le dit : la
         cible, ce qui manque pour l'atteindre, et le rythme qu'il faudrait
         tenir. Ces trois-là étaient écrits en petit, en bas, autour d'un
         montant qu'on connaissait déjà. Ils passent devant.

         Le patrimoine reste, en note : c'est lui qui donne son sens au reste —
         « il te manque 3 847 € » ne se lit pas sans savoir sur quoi. Mais il ne
         se lit plus en premier.

         « Il te manque » et non « reste à faire » : ce chiffre n'est pas un
         travail restant, c'est l'écart entre où l'on est et où l'on veut être,
         et il fait la paire avec « dépassement » de l'autre côté. -->
    <div class="goal-top">
      <b class="${g.remaining >= 0 ? 'up' : ''}">${g.remaining >= 0
        ? `+${fmtEUR(g.remaining)}` : fmtEUR(Math.abs(g.remaining))}</b>
      <!-- « Restant » et non « à trouver ». Le second sonnait comme une corvée
           dont on te charge, et il allongeait la phrase pour ne rien ajouter :
           l'intitule de la carte dit deja qu'il s'agit d'un objectif. -->
      <span class="muted">${g.remaining >= 0
        ? trad('de dépassement')
        : mois
          ? `${trad('restants, soit')} ${fmtEUR0(-g.remaining / mois)} ${trad('/ mois sur')} ${mois} ${trad('mois')}`
          : trad('restants avant la fin de l’année')}</span>
    </div>
    <div class="goal-bar"><div class="goal-fill" style="width:${Math.min(100, Math.max(0, g.pct)).toFixed(2)}%"></div></div>
    <div class="goal-foot">
      <span>${fmtEUR(g.total)} <span class="muted">${trad('sur.objectif', 'sur')} ${fmtEUR0(g.obj)}</span></span>
      <span>${g.remaining >= 0 ? `${trad('Objectif atteint')} 🎉` : ''}</span>
    </div>
  </button>`;
  };
  const s = projectionSettings();
  const p = capitalisation({ years: projHorizon });
  const dernier = p.points[p.points.length - 1];
  const anneeAtteinte = p.targetReached;

  /* Une liste plutôt qu'un champ libre : on choisit une hypothèse dans des
     paliers ronds, sans risquer une faute de frappe à un zéro près. La valeur
     courante est toujours ajoutée si elle ne tombe pas sur un palier — le
     versement repris du budget vaut 652 €, pas 650. */
  const listeChoix = (path, paliers, valeur, format) => {
    const v = valeur != null ? valeur : num(getPath(path));
    const options = paliers.includes(v) ? paliers : [...paliers, v].sort((a, b) => a - b);
    return options.map(o =>
      `<option value="${o}" ${o === v ? 'selected' : ''}>${format(o)}</option>`).join('');
  };
  /* L'explication passe dans l'info-bulle du libelle, plus sous le selecteur.

     Les cinq reglages portaient chacun une phrase en dessous, dont deux de
     trois lignes. Le depliant faisait donc quinze lignes de prose pour cinq
     menus : on ne voyait plus les reglages, seulement le texte qui les entoure.
     Et ces phrases se lisent une fois — la premiere — puis encombrent toutes
     les visites suivantes.

     Le « ? » les garde a portee sans les imposer. C'est le motif deja employe
     partout ailleurs sur les titres de cartes, et depuis peu sur les intitules
     de colonnes du tableau du jour.

     `aideTexte` et non `aide` en parametre : le second nom est celui de la
     fonction appelee juste dessous, et le masquer ici aurait rendu le champ
     muet sans qu'aucune erreur ne le signale. */
  const champ = (label, path, paliers, format, aideTexte, valeur) => `
    <div class="field">
      <label>${esc(trad(label))}${aideTexte ? aide(aideTexte) : ''}</label>
      <select data-path="${path}" data-type="num">
        ${listeChoix(path, paliers, valeur, format)}
      </select>
    </div>`;

  /* Le meme champ, pour une valeur qui n'est pas un nombre. `champ()` pose
     `data-type="num"` et sa liste de paliers : une destination n'est ni l'un ni
     l'autre, et l'y forcer aurait converti « marche » en zero. */
  const champText = (label, path, options, valeur, aideTexte) => `
    <div class="field">
      <label>${esc(trad(label))}${aideTexte ? aide(aideTexte) : ''}</label>
      <select data-path="${path}">
        ${options.map(([v, l]) => `<option value="${esc(v)}" ${v === valeur ? 'selected' : ''}
          >${esc(trad(l))}</option>`).join('')}
      </select>
    </div>`;

  const paliers = (max, pas, depuis = 0) =>
    Array.from({ length: Math.floor((max - depuis) / pas) + 1 }, (_, i) => depuis + i * pas);

  return `
  <!-- Quatre tuiles vivaient ici : patrimoine actuel, objectif, projection à
       l'horizon, pouvoir d'achat. Quatre nombres sans rapport arithmétique
       entre eux, dont un badge « 514,24 % » sur un objectif dépassé et un
       badge « 2,00 % » qui était le taux d'inflation posé là où toutes les
       autres cartes mettent une part.

       Or il y a une vraie décomposition dessous, et c'est la question que la
       page pose : de quoi sera fait ce patrimoine futur ? Le champ
       « contributed » contient le capital de départ, donc départ + versements
       + rendement font exactement le total. Trois barres qui répondent,
       plutôt que quatre chiffres qui coexistent.
       (Pas de guillemet oblique dans ce commentaire : il vit à l'intérieur
       d'un littéral de gabarit, où un backtick referme la chaîne.) -->
  ${(() => {
    /* Les mots viennent de la légende du graphique de Trajectoire, deux
       cartes plus bas — « Ce que tu verses », « Ce que le rendement ajoute »
       — et gardent ses couleurs. Les mêmes montants s'appelaient ici
       « Versements » et « Rendement » : deux vocabulaires pour une seule
       page. Le capital de départ, que le graphique fond dans ses versements,
       prend la troisième teinte. */
    const verses = Math.max(0, dernier.contributed - g.total);
    /* L'immobilier a sa propre ligne, et il n'en a une que si l'on en a. Le
       rendement ne s'y applique pas : il est porte a plat, et le dire ici est
       le seul endroit ou ca se voit. Sans cette ligne, son apport se cachait
       dans « ce que tu as deja » et on pouvait croire qu'il capitalisait comme
       le reste.
       La part peut etre negative — un credit sans bien en face, ou un bien qui
       vaut moins que son pret — et le libelle suit. */
    const plat = num(p.plat);
    const parts = [
      /* Sa fiche est baseProjection, pas « Patrimoine total » : la barre vaut
         la base qui capitalise, et la fiche qui s'ouvre doit faire exactement
         ce montant, ligne a ligne. L'autre fiche en montrait le quintuple. */
      { label: trad('Ce que tu as déjà'), value: g.total - plat, couleur: 'var(--series-3)', apercu: 'baseProjection' },
      /* « net » et non « a plat » : un intitule dit ce qu'il compte, la valeur
         du bien moins le capital restant du. Comment la projection le traite
         est dit deux fois ailleurs, dans l'infobulle de cette ligne et sous la
         courbe de Trajectoire. Meme vocabulaire que la fiche qui s'ouvre. */
      /* L'intitule suit ce que la part contient vraiment : avec une montre et
         sans studio, « Ton immobilier net » mentirait. Meme logique que la
         fiche immobilierNet qui s'ouvre dessus. */
      { label: plat < 0 ? trad('Tes crédits')
             : num(nowTotals().biens) > 0.005
               ? (num(nowTotals().immo) > 0.005 ? trad('Ton immobilier et tes biens, nets')
                                                : trad('Tes biens de valeur, nets'))
               : trad('Ton immobilier net'),
        value: plat, couleur: couleurClasse('immobilier'), apercu: 'immobilierNet',
        aide: trad('Aucun rendement ne lui est appliqué : la projection le porte tel quel') },
      { label: trad('Ce que tu verses'), value: verses, couleur: S1(), apercu: 'horizon' },
      /* Le rendement se coupe en deux des que la seconde poche en a un. Tant
         qu'elle est a zero, une ligne « 0 EUR » ne dirait rien : le filtre plus
         bas l'ecarte, et « Ce que le rendement ajoute » reste seul et complet.
         Deux lignes ou une, la somme des parts fait le total. */
      ...(num(s.rateAutres) ? [
        { label: trad('Rendement des actifs de marché'), value: num(dernier.gainsMarche),
          couleur: S2(), apercu: 'horizon' },
        /* « des autres actifs » designait une poche qui n'existe plus : ce gain
           est celui du non cote, les liquidites ne produisant rien. Le nom est
           celui de son reglage, dans « Tes hypotheses ». */
        { label: trad('Rendement du non coté'), value: num(dernier.gainsAutres),
          couleur: couleurClasse('nonCote'), apercu: 'horizon' },
      ] : [
        { label: trad('Ce que le rendement ajoute'), value: dernier.gains, couleur: S2(), apercu: 'horizon' },
      ]),
    ].filter(x => Math.abs(num(x.value)) > 0.005)
     .map(x => ({ ...x, pct: dernier.total ? num(x.value) / dernier.total * 100 : 0 }));
    return `
  ${carteObjectif()}

  <div class="card repart">
    <!-- L'horizon vivait dans l'en-tête de « Trajectoire », en bas de page,
         alors qu'il commande le montant affiché ici, tout en haut. On lisait
         « dans 20 ans » sans voir ce qui le réglait. Il monte avec le chiffre
         qu'il gouverne, et quitte Trajectoire : un seul réglage, posé avant
         tout ce qu'il modifie. -->
    <div class="card-head">
      <h2>${trad('De quoi sera fait ton patrimoine')}</h2>
      <label class="row" style="gap:8px; font-size:12px; color:var(--text-secondary)">
        Horizon
        ${selecteurHorizon()}
      </label>
    </div>
    ${parts.map(x => `
      <button type="button" class="repart-ligne" data-action="apercu"
              data-apercu="${esc(x.apercu)}"
              title="${esc(x.aide || `${trad('Voir le détail de')} ${trad(x.label)}`)}">
        <span class="repart-haut">
          <span class="dot" style="background:${x.couleur}"></span>
          <span class="repart-nom">${esc(trad(x.label))}</span>
          <b>${fmtEUR(x.value)}</b>
          <span class="repart-pct">${fmtPct(x.pct, 1)}</span>
        </span>
        <span class="repart-barre"><i style="width:${x.pct.toFixed(1)}%;background:${x.couleur}"></i></span>
      </button>`).join('')}
    <!-- L'objectif 2026 figurait aussi dans ce pied. Il a sa propre carte en
         bas de page, et il n'a rien à faire sous un total qui parle
         de ${dernier.year} : deux échéances, deux sujets. -->
    <!-- L'inflation se reglait dans « Tes hypotheses » sans rien changer a
         l'ecran : un menu deroulant sans effet visible est un bouton mort. La
         valeur etait pourtant calculee pour chaque point, dans le champ real,
         et jamais affichee. Deux issues possibles, montrer la ligne ou retirer le
         reglage ; on montre, parce que sur vingt ans c'est le seul chiffre
         qu'on sait vraiment lire. La ligne ne s'affiche qu'avec une inflation
         non nulle, sans quoi elle repeterait le total. -->
    <dl class="kv repart-pied">
      <dt><b>${trad('Total en')} ${dernier.year}</b></dt><dd><b>${fmtEUR(dernier.total)}</b></dd>
      ${s.inflation ? `<dt>${trad('Soit, après inflation')}${
        aide(`${trad('Le même montant, une fois retirée une inflation de')} ${fmtPct(s.inflation, 0)} ${trad('par an pendant')} ${projHorizon} ${trad('ans. C’est ce que cette somme permettrait d’acheter aux prix que tu connais.')}`)
      }</dt><dd>${fmtEUR(dernier.real)}</dd>` : ''}
    </dl>
  </div>`;
  })()}

  <div class="grid g-1-2">
    <div class="card">
      <div class="card-head"><h2>${trad('Tes hypothèses')}</h2></div>
      <!-- Les cinq reglages et leurs textes d'aide pesaient plus lourd que le
           graphique qu'ils gouvernent. Ils se replient donc, et c'est le resume
           des valeurs qui sert de poignee : les hypotheses restent lisibles
           carte fermee, on ne deplie que pour les changer. Meme motif que
           « Voir les donnees » sur l'accueil, et meme lecon : l'etat survit au
           rendu, sinon changer une valeur refermerait le panneau sous le doigt
           (chaque reglage relance render()). -->
      <!-- La poignee ne reprend pas .data-view : ce motif sert aux tableaux
           de donnees et se fait discret par construction, un petit chevron
           gris que personne ne voyait. Ici la poignee est LE contrôle de la
           carte : elle se lit comme un bouton, valeurs a gauche, « Régler »
           et chevron a droite. -->
      <details class="pli-reglages" ${hypoOuvert ? 'open' : ''} id="hypoDetail">
        <summary>
          <!-- La destination du versement figure dans le resume : c'est une
               hypothese, et le resume existe pour qu'on les lise sans deplier. -->
          <span class="pli-valeurs">${fmtEUR0(s.monthly)} ${trad('/ mois')} ${trad('sur')}
            ${trad(Object.fromEntries(VERSEMENT_VERS)[s.versementVers]).toLowerCase()} ·
            ${trad('marché')} ${fmtPct(s.rate, 0)} ·
            ${trad('non coté')} ${num(s.rateAutres) ? fmtPct(s.rateAutres, 0) : trad('à plat')} ·
            ${trad('inflation')} ${fmtPct(s.inflation, 0)}${num(s.target) ? ` · ${trad('cible')} ${fmtEUR0(s.target)}` : ''}</span>
          <span class="pli-action">${trad('Régler')}</span>
        </summary>
      <div class="modal-champs" style="margin-top:12px">
        ${champ('Versement mensuel', 'meta.projMonthly', paliers(10000, 50),
                v => `${fmtEUR0(v)} ${trad('/ mois')}`,
                /* Ou vont ces euros etait une hypothese invisible : ils
                   capitalisent tous au taux des actifs de marche. Elle est
                   porteuse, surtout depuis que la poche « autres » vaut zero par
                   defaut — s'ils y tombaient, l'epargne ne croitrait jamais. Une
                   hypothese se dit la ou on la regle.
                   « Versé sur » et non « Investis en » : l'imperatif se lisait
                   comme un conseil, et cette application n'en donne pas. */
                num(Store.state.meta.projMonthly)
                  ? `${trad('Ton budget dégage')} ${fmtEUR0(suggestedMonthly())} ${trad('par mois.')}`
                  : trad('Repris de ton budget ; choisis une valeur pour la figer.'),
                s.monthly)}
        <!-- Ou va ce versement etait dit dans la bulle d'aide du champ au-dessus,
             donc invisible tant qu'on ne la survolait pas, et surtout non
             modifiable : les euros capitalisaient au taux du marche, code en dur.
             Quelqu'un qui met 350 EUR par mois sur un livret lisait une courbe
             calculee a 8 % l'an.
             Un champ plutot qu'une mention, parce que la reponse depend de la
             personne : on epargne aussi sans investir. -->
        ${champText('Versé sur', 'meta.projVersementVers', VERSEMENT_VERS,
                s.versementVers,
                trad('Ces euros capitalisent au taux de la poche que tu choisis. '
                  + 'Sur les liquidités, ils s’accumulent sans rendement : c’est ce que fait '
                  + 'un livret que tu n’as pas déclaré rémunéré, et c’est le seul réglage '
                  + 'honnête si tu épargnes sans investir. '
                  /* Le partage se dit par le taux, pas par un second montant : trois
                     champs de versement sur une page qui en a six auraient affine un
                     chiffre dont l'incertitude du taux pese deja davantage — 24 300 EUR
                     entre 6 et 10 % contre 21 000 entre les deux poches extremes. */
                  + 'Si tu partages ton versement, garde un seul choix et ajuste le taux : '
                  + 'moitié à 8 %, moitié sans rendement, cela fait 4 % sur le tout.'))}
        <!-- Un seul taux s'appliquait a tout, et il ne decrivait qu'une partie
             de ce qu'il touchait. Deux champs maintenant, chacun nommant sa
             poche : « hors immobilier » ne suffisait plus, il disait ce que le
             taux exclut au lieu de ce sur quoi il porte.

             Les trois listes s'arretent a 20 % : elles montaient a 100, soit
             cent une options dont « 87 % par an », qu'aucune hypothese de
             travail ne justifie. Une valeur deja enregistree au-dela survit,
             listeChoix ajoute toujours la valeur courante si elle ne tombe pas
             sur un palier. -->
        <!-- La poche se dit par son montant, non par la liste de ce qu'elle
             contient.

             Elle enumerait « Actions, obligations, crypto » : trois classes sur
             sept, restees figees quand Immobilier cote et Multi-actifs sont
             arrives, et les metaux n'y ont jamais figure. Une liste tenue a la
             main a cote de sa source finit toujours par ne plus la decrire.

             La faire descendre de la table des classes reglait l'exactitude et ratait
             l'essentiel : six noms de classes a la file ne se lisent pas. Le
             champ voisin, celui du non cote, avait deja la bonne forme — le
             montant d'abord, puis la raison. Un montant se verifie d'un coup
             d'oeil contre la carte du patrimoine, une enumeration ne se verifie
             pas.

             Le cash a investir a quitte cette poche : il ne capitalise plus, donc
             la phrase n'a plus a le mentionner. Voir pochesProjection(). -->
        ${champ('Rendement des actifs de marché', 'meta.projRate', paliers(20, 1),
                v => `${fmtPct(v, 0)} ${trad('par an')}`,
                `${fmtEUR0(capitalisation({ years: 1 }).poches.marche)} ${trad('de titres et de crypto.')} `
                + trad('C’est une hypothèse de travail : aucun rendement n’est garanti'))}
        <!--    Ce taux couvrait « les autres actifs », soit le non cote ET les liquidites
   : deux choses sans rapport sous un seul pourcentage. Les liquidites ne
   capitalisent pas ici, livret ou non, donc il n'y a rien a regler pour elles
   : une constante n'a pas besoin d'un menu, et trois calculateurs sur une
   page d'hypotheses en font deux de trop. Ce taux ne parle plus que du non
   cote, et son intitule le dit.-->
        ${champ('Rendement du non coté', 'meta.projRateAutres', paliers(20, 1),
                v => v ? `${fmtPct(v, 0)} ${trad('par an')}` : trad('aucun, porté à plat'),
                `${fmtEUR0(capitalisation({ years: 1 }).poches.nonCote)} ${trad('de parts non cotées et de financement participatif. Zéro par défaut : personne ne connaît le rendement de parts non cotées, et c’est à toi de l’affirmer, pas à l’application')}`)}
        <!-- Le capital garanti a son taux, et il le fallait : sans poche a lui,
             un fonds euros tombait dans les actifs de marche et capitalisait a
             8 % l'an. Pour qui detient l'essentiel de son assurance-vie en
             fonds euros, c'etait la moitie d'un patrimoine projetee a trois
             fois son rendement reel, et toujours du cote flatteur.
             Zero par defaut, comme le non cote : un fonds euros rapporte, mais
             son taux est annonce en janvier pour l'annee ecoulee. L'application
             ne devine pas un chiffre que le detenteur seul connait. -->
        ${champ('Rendement du capital garanti', 'meta.projRateGaranti', paliers(8, 0.5),
                v => v ? `${fmtPct(v, 1)} ${trad('par an')}` : trad('aucun, porté à plat'),
                `${fmtEUR0(capitalisation({ years: 1 }).poches.garanti)} ${trad('de fonds euros et de supports garantis. Zéro par défaut : le taux d’une année n’est annoncé qu’en janvier suivant, donc c’est à toi de l’affirmer')}`)}
        <!-- La troisieme poche, dite sans etre reglable.

             Deux taux se reglaient, trois poches existaient, et la derniere
             n'apparaissait nulle part : on ne pouvait pas savoir ce que la
             projection faisait d'un livret. Le silence laissait deviner, et
             deviner est ce que cette carte doit eviter.

             Elle prend la forme des trois autres — intitule, valeur, « ? » — et
             sa valeur est un texte au lieu d'un menu. Les trois poches se lisent
             ainsi de la meme facon, et celle qui ne se regle pas se voit comme
             telle sans qu'une phrase ait a l'expliquer. -->
        <div class="field">
          <label>${trad('Rendement des liquidités')}${aide(
            `${fmtEUR0(capitalisation({ years: 1 }).poches.liquidites)} ${trad('de liquidités,')} `
            + trad('livret ou non, y compris le cash déjà chez ton courtier : tant qu’il '
            + 'n’est pas placé, il ne rapporte rien. Elles traversent donc la '
            + 'projection telles quelles, et il n’y a rien à régler.'))}</label>
          <p class="valeur-figee">${trad('aucun, portées à plat')}</p>
        </div>
        ${champ('Inflation', 'meta.projInflation', paliers(20, 1),
                v => `${fmtPct(v, 0)} ${trad('par an')}`,
                trad('Alimente les lignes « Après inflation » : le résultat traduit en euros d’aujourd’hui'))}
        ${champ('Cible long terme', 'meta.projTarget',
                [0, ...paliers(1000000, 50000, 50000), 1500000, 2000000, 3000000, 5000000],
                v => v ? fmtEUR0(v) : trad('aucune'),
                trad('Optionnel, pour savoir quand tu la franchis'))}
      </div>
      <!-- Le bouton ne sert que si une valeur manuelle est figee : quand le
           versement suit deja le budget, il proposait de reprendre un montant
           deja repris, et cliquer ne changeait rien a l'ecran. -->
      ${num(Store.state.meta.projMonthly) ? `
      <button class="btn sm ghost" data-action="proj-use-budget" style="margin-top:12px">
        ${trad('Reprendre')} ${fmtEUR0(suggestedMonthly())} ${trad('/ mois')} ${trad('depuis le budget')}</button>` : ''}
      </details>

      <!-- Les notes restent hors du depliant : la faisabilite de la cible et
           l'avertissement « pas une prevision » sont de l'information, pas du
           reglage, et se cacher avec les selecteurs les ferait manquer. -->
      <!-- La note « Ce que la courbe ne compte pas » vivait ici, pendant
           qu'une seconde note sous la courbe de Trajectoire disait presque la
           meme chose : l'immobilier gele d'un cote, l'amortissement ignore de
           l'autre. Deux avertissements a deux endroits pour un seul fait, et
           le lecteur devait les recouper lui-meme. Tout est fusionne sous la
           courbe, la ou l'on regarde ce que la note corrige. -->

      ${s.target ? `<div class="note" style="margin-top:12px">
        ${anneeAtteinte ? `◎ <span>${trad('Cible de')} <b>${fmtEUR0(s.target)}</b> ${trad('franchie en')}
            <b>${anneeAtteinte.year}${anneeAtteinte.months ? ` (+${anneeAtteinte.months} ${trad('mois')})` : ''}</b>,
            ${trad('soit dans')} ${Math.round(anneeAtteinte.yearsFromNow)} ${trad('ans')}.</span>`
          : (() => {
            /* Seule la part qui capitalise entre dans le calcul des leviers,
               et la cible se mesure donc au meme etalon : atteindre 500 000 EUR
               avec 60 000 EUR d'apport immobilier porte a plat, c'est amener le
               reste a 440 000 EUR. Passer le patrimoine entier avec le taux du
               seul portefeuille aurait annonce un versement trop faible. */
            const plat = num(p.plat);
            const req = targetRequirements({ start: g.total - plat, target: s.target - plat,
              monthly: s.monthly, rate: s.rate, years: projHorizon });
            const lignes = [];
            if (req.years) lignes.push(`${trad('attendre')} <b>${req.years.toFixed(1).replace('.', enAnglais() ? '.' : ',')} ${trad('ans')}</b> `
              + `(${trad('soit')} ${new Date().getFullYear() + Math.ceil(req.years)}) ${trad('sans rien changer')}`);
            if (req.monthly != null) lignes.push(`${trad('passer à')} <b>${fmtEUR0(req.monthly)} ${trad('par mois')}</b> `
              + `${trad('au lieu de')} ${fmtEUR0(s.monthly)}`);
            if (req.rate != null) lignes.push(`${trad('obtenir')} <b>${fmtPct(req.rate, 1)} ${trad('par an')}</b> `
              + `${trad('au lieu de')} ${fmtPct(s.rate, 1)}`);
            return `⚠ <span>${trad('Avec ces hypothèses, la cible de')} <b>${fmtEUR0(s.target)}</b>
              ${trad('n’est pas atteinte en')} ${projHorizon} ${trad('ans : tu arrives à')} ${fmtEUR0(dernier.total)}.<br>
              ${trad('Pour y parvenir, il faudrait')} ${lignes.length ? '' : trad('revoir les hypothèses')}
              ${lignes.length ? `:<br>${lignes.map(l => `• ${l}`).join('<br>')}` : ''}
              ${req.rate == null && req.monthly != null
                ? `<br><span class="muted">${trad('Aucun rendement réaliste ne suffit à lui seul.')}</span>` : ''}</span>`;
          })()}
      </div>` : ''}

      <div class="note" style="margin-top:12px">
        ⓘ <span>${trad('Cette page applique une formule de capitalisation à')}
        <b>${trad('tes')}</b> ${trad('hypothèses. Ce n’est pas une prévision : un portefeuille réel '
        + 'ne progresse jamais de façon régulière, et une mauvaise séquence de '
        + 'marché en début de période change beaucoup le résultat.')}</span>
      </div>
    </div>

    <div class="card">
      <!-- L'horizon est monté dans la première carte, où vit le chiffre qu'il
           commande. Le répéter ici donnerait deux listes réglant la même
           valeur sur un même écran. -->
      <div class="card-head">
        <h2>${trad('Trajectoire')}</h2>
        <!-- L'en-tete ne disait que la duree, alors que le versement et les
             taux gouvernent toute la courbe et ne se lisaient que deux cartes
             plus bas. Un graphique doit porter ses propres hypotheses.

             Mais depuis qu'il y a deux taux, tout empiler ici donnait trois
             lignes d'en-tete a 375 px. L'en-tete garde donc la duree et le
             versement, et les taux descendent sous la courbe, ou il y a la
             place de nommer chaque poche au lieu de dire « hors immobilier »,
             qui annonçait ce que le taux exclut plutot que ce qu'il touche. -->
        <span class="hint">${trad('Sur')} ${projHorizon} ${trad('ans, jusqu’en')} ${dernier.year} · ${
          fmtEUR0(s.monthly)} ${trad('/ mois')}</span>
      </div>
      <div class="chart" id="chartProjection"></div>
      <!-- « Ce que tu verses » nommait une bande qui vaut le capital de depart
           plus les versements : le champ contributed contient les deux. La
           carte de composition, elle, disait juste en separant « ce que tu as
           deja » de « ce que tu verses ». Deux vocabulaires pour une seule
           page, et le plus vague etait sur le graphique. -->
      <div class="legend">
        <span><i style="background:${S1()}"></i>${trad('Ce que tu as déjà et ce que tu verses')}</span>
        <span><i style="background:${S2()}"></i>${trad('Ce que le rendement ajoute')}</span>
        <!-- La bande etait expliquee, mais dans le paragraphe en petits
             caracteres sous les taux : personne ne l'y lisait, et deux courbes
             pointillees sans nom ressemblent a un defaut d'affichage. Sa place
             est ici, avec les autres cles du dessin, et son echantillon est
             pointille comme elle. -->
        <span><i class="legend-bande"></i>${trad('Si le rendement fait deux points de plus ou de moins')}</span>
      </div>
      <!-- Les taux, nommes par ce sur quoi ils portent. Deux phrases plutot
           qu'une mention dans l'en-tete : chaque poche a un nom, et le lecteur
           voit d'un coup ce qui capitalise et a combien. -->
      <!-- Trois cas, parce que tout etat existant herite d'un taux egal a
           l'autre : « 5,00 % sur tes actifs de marche, 5,00 % sur tes autres
           actifs » est la phrase que tout le monde verrait par defaut, et elle
           dit deux fois la meme chose. On la dit une fois quand les deux taux
           se rejoignent. -->
      <p class="small muted" style="margin:12px 0 0">
        <!-- Chaque poche nommee. La phrase disait « tes autres actifs » pour deux
             choses sans rapport, le non cote et les liquidites ; elles sont
             maintenant citees separement, et les liquidites sont annoncees comme
             ce qu'elles sont : plates par construction, sans reglage. -->
        ${fmtPct(s.rate)} ${trad('par an sur tes actifs de marché.')}
        ${num(s.rateAutres) ? `${fmtPct(s.rateAutres)} ${trad('sur ton non coté.')}`
                            : trad('Ton non coté est porté à plat.')}
        <!-- « Tes liquidites non investies » laissait croire que les autres,
             elles, capitalisaient : le cash qui attend chez le courtier est
             pourtant porte a plat comme le reste. La poche entiere, sans
             qualificatif, et le versement mensuel dit juste apres ou va
             l'argent qu'on place vraiment. -->
        ${trad('Tes liquidités sont portées à plat, le cash qui attend chez ton courtier compris.')}
      </p>
      <!-- LA note de la page, unique : ce que la courbe ne projette pas. Elle
           remplace deux avertissements qui se recoupaient, l'un ici, l'autre
           dans « Tes hypotheses ». Un seul endroit, sous la courbe qu'elle
           corrige, et une phrase finale qui donne le sens de l'erreur : un
           lecteur qui sait dans quel sens un chiffre se trompe peut s'en
           servir, sans ca il ne peut rien en faire.

           Les cas sont distingues parce que la verite change avec eux. Avec un
           pret, le remboursement est certain et non compte : la courbe
           sous-estime, toujours. Un bien paye, lui, est simplement fige — son
           prix peut monter comme baisser, et pretendre « sous-estime » serait
           faux. La version precedente melangait les deux et parlait de
           mensualites a quelqu'un qui n'en a plus. -->
      ${(() => {
        const t0 = nowTotals();
        const plat = num(p.plat), dettes = num(t0.dettes);
        const bien = num(t0.immo) + num(t0.biens);
        /* La part plate porte l'immobilier ET les biens de valeur : la phrase
           doit nommer ce qu'elle couvre, sinon une montre seule ferait dire
           « ton immobilier » a quelqu'un qui n'en a pas. */
        const aImmo = num(t0.immo) > 0.005, aBiens = num(t0.biens) > 0.005;
        const sujet = aImmo && aBiens ? trad('Ton immobilier et tes biens sont portés à leur')
                    : aBiens ? trad('Tes biens de valeur sont portés à leur')
                    : trad('Ton immobilier est porté à sa');
        if (!plat && !dettes) return '';
        const note = txt => `<p class="small muted" style="margin:12px 0 0">${txt}</p>`;
        if (plat > 0) return note(dettes
          ? `${sujet} ${trad('valeur d’aujourd’hui,')} ${fmtEUR0(plat)} ${trad('nets, du '
             + 'premier point au dernier. Ni le prix, ni le capital que tes mensualités '
             + 'remboursent chaque mois, ni la fin du prêt ne sont projetés : la courbe '
             + 'sous-estime cette part, elle ne la surestime jamais.')}`
          : `${sujet} ${trad('valeur d’aujourd’hui,')} ${fmtEUR0(plat)}${trad(', du '
             + 'premier point au dernier : la courbe ne prête à cette part ni hausse ni baisse.')}`);
        if (!plat) return note(
          trad('Le capital que tes mensualités remboursent chaque mois n’est pas projeté : '
           + 'la courbe sous-estime ton patrimoine, elle ne le surestime jamais.'));
        return note(bien
          ? `${trad('Tes crédits dépassent aujourd’hui la valeur de ton bien : cette part nette,')}
             ${fmtEUR0(plat)}${trad(', est portée telle quelle. Son remboursement n’est pas '
             + 'projeté : la courbe sous-estime ton patrimoine, elle ne le surestime jamais.')}`
          : `${trad('Tes crédits sont portés à leur montant d’aujourd’hui,')} ${fmtEUR0(Math.abs(plat))}${trad(', '
             + 'du premier point au dernier. Leur remboursement n’est pas projeté : la courbe '
             + 'sous-estime ton patrimoine, elle ne le surestime jamais.')}`);
      })()}
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>${trad('Par horizon')}</h2>
      <!-- Meme raison que sur Trajectoire : avec deux taux, l'en-tete ne peut
           plus les annoncer tous les deux sans deborder. Le tableau porte les
           memes hypotheses que la courbe juste au-dessus, qui les detaille. -->
      <span class="hint">${fmtEUR0(s.monthly)} ${trad('/ mois')} ${trad('à')} ${fmtPct(s.rate)} ${trad('par an')}${
        num(s.rateAutres) ? trad(', et le détail au-dessus') : ''}</span>
    </div>
    <!-- Six colonnes sous 768 px, c'est la regle du projet qui casse. Le
         telephone garde les trois qui repondent a la question de la carte :
         quand, combien, et combien en pouvoir d'achat. Le detail apports /
         gains reste sur grand ecran, et la fiche « horizon » le donne au
         doigt.
         « Apports » et non « Total versé » : la colonne contient aussi le
         capital de depart et l'immobilier, le pied le chiffre. -->
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Horizon</th>
          <th class="large-seulement">${trad('Apports')}</th>
          <th class="large-seulement">${trad('Gains cumulés')}</th>
          <!-- « Après inflation », comme le pied de la premiere carte et la
               fiche horizon : un meme montant porte le meme nom partout. Le
               nom precedent, « En euros d'aujourd'hui », debordait de 45 px a
               375 px et imposait un en-tete sur deux lignes ; il reste dans
               les textes d'aide, ou il explique ce que celui-ci veut dire. -->
          <th>${trad('Patrimoine')}</th><th>${trad('Après inflation')}</th>
        </tr></thead>
        <!-- La ligne de l'horizon retenu se marque, elle ne se nomme pas. La
             correspondance entre le reglage du pied et la ligne qui bouge doit
             se voir, sinon changer la duree deplace le graphique et le total de
             la premiere carte sans qu'on sache ou le choix a atterri ici. Mais
             la nommer coutait la largeur d'une phrase dans la colonne la plus
             etroite : a 375 px, « Après inflation » sortait de l'ecran et il
             fallait faire defiler pour lire la seule colonne que cette carte
             ajoute a la precedente. Un filet d'accent ne coute aucun pixel. -->
        <tbody>${p.jalons.map(j => {
          const retenu = j.horizon === projHorizon;
          return `
          <tr class="${retenu ? 'jalon-retenu' : ''}"${retenu ? ' aria-current="true"' : ''}>
            <td class="name">${j.horizon} ${trad('ans')} <span class="muted">· ${j.year}</span></td>
            <td class="large-seulement">${fmtEUR0(j.contributed)}</td>
            <td class="up large-seulement">${fmtEUR0(j.gains)}</td>
            <td><b>${fmtEUR0(j.total)}</b></td>
            <td class="muted">${fmtEUR0(j.real)}</td>
          </tr>`;
        }).join('')}
        <!-- La seconde porte du même réglage. Elle en réglait un autre, à elle
             seule, et posait une ligne que le graphique ignorait : le
             raisonnement vit sur selecteurHorizon, en tête de ce fichier.
             (Aucun accent grave ici : ce commentaire vit à l'intérieur d'un
             littéral de gabarit, où un backtick referme la chaîne. Il vient de
             coûter deux tests rouges.) -->
        <tr class="ligne-libre">
          <td colspan="5">
            <label class="row" style="gap:8px">
              <span class="hint">${trad('Voir un autre horizon')}</span>
              ${selecteurHorizon()}
            </label>
          </td></tr></tbody>
      </table>
    </div>
    <p class="hint" style="margin-top:12px">
      ${trad('« Apports » : ce que tu as déjà,')} ${fmtEUR0(g.total)} ${trad('aujourd’hui, plus ce que tu verses. '
      + 'Chaque horizon est compté à partir d’aujourd’hui, donc à la même période de l’année.')}
    </p>
  </div>

  <!-- La carte « Objectif 2026 » fermait cette page alors que l'objectif de
       l'annee vit sur l'accueil : sa carte y porte la barre de progression, et
       sa fiche donne deja le detail que la brique redisait ici, rythme
       necessaire, rythme observe, ecart. La page renommee « Projection » ne
       parle plus que de la trajectoire longue, son sous-titre suit. -->
  `;
}

function mountObjective() {
  const p = capitalisation({ years: projHorizon });
  const s = p.settings;
  /* La bande de scenarios : le meme calcul a deux points de rendement en plus
     et en moins, sur le seul taux de marche — les autres actifs gardent le
     taux affirme par l'utilisateur, zero compris, on ne fait pas varier une
     affirmation. Une courbe seule a l'air d'une promesse ; la bande dit,
     sans un mot, que le rendement est une hypothese. */
  const bas = capitalisation({ years: projHorizon, rate: num(s.rate) - 2 });
  const haut = capitalisation({ years: projHorizon, rate: num(s.rate) + 2 });
  const points = p.points.map((pt, i) => ({
    ...pt, bandeBas: bas.points[i].total, bandeHaut: haut.points[i].total,
  }));
  Charts.stackedArea($('#chartProjection'), {
    points, height: 320,
    bande: { min: 'bandeBas', max: 'bandeHaut' },
    /* « Versé » mentait dans la bulle : la bande contient aussi le capital de
       depart et l'immobilier. Meme rigueur que la legende sous la courbe. */
    series: [
      { key: 'contributed', label: trad('Départ et versements'), color: S1() },
      { key: 'gains', label: 'Rendement', color: S2() },
    ],
    /*    La cible long terme ne vivait que dans une note en texte ; tracee, on voit
   l'annee du croisement. Hors de portee, elle ecrase la courbe, et c'est
   exactement ce qu'il faut voir. Deux courbes quasi paralleles n'ajoutaient
   que du bruit, et le montant se lit deja au pied de la premiere carte et
   dans le tableau.*/
    guide: num(s.target) ? { value: num(s.target), label: 'Cible' } : null,
  });

  /* L'etat du depliant survit au rendu, comme celui de « Voir les donnees » :
     chaque reglage relance render(), et sans ca le panneau se refermerait
     sous le doigt a chaque valeur changee. */
  const hy = $('#hypoDetail');
  if (hy) hy.addEventListener('toggle', () => { hypoOuvert = hy.open; });
}

/* ------------------------------------------------------------
   Positions
   ------------------------------------------------------------ */
/* Donner le focus a un champ ouvre le clavier virtuel sur telephone : une
   fenetre qui s'ouvre avec le clavier deja deploye cache la moitie de son
   contenu avant qu'on ait decide de saisir quoi que ce soit. Au doigt, le
   focus attend donc qu'on touche un champ ; au clavier physique, il reste
   immediat. */
const POINTEUR_TACTILE = matchMedia('(pointer: coarse)').matches;
function focusChamp(el) {
  if (!el || POINTEUR_TACTILE) return;
  el.focus();
  el.select?.();
}

/* Les listes deroulantes de classe et de role, dans l'ordre du schema. */
const OPTIONS_CLASSE = Object.entries(ASSET_CLASSES);
const OPTIONS_ROLE = Object.entries(ROLES);

/* Part d'une ligne dans l'ensemble des titres cotes. Le tableau des lignes la
   donne deja par le detail ; la voir a cote de la variation du jour dit tout
   de suite si le mouvement compte ou s'il est anecdotique.

   La ligne recue porte deja sa valeur (dayPerformance la calcule) : plus de
   .find() par nom, qui donnait aux homonymes le poids du premier trouve. Le
   nom est un libelle, jamais une identite. */
function poidsLigne(ligne) {
  const total = Store.state.positions.reduce((s, p) => s + posValue(p), 0);
  return total ? num(ligne.value) / total * 100 : 0;
}

/* La categorie deduite du type que renvoie la recherche — « Cryptocurrency »,
   « ETF », « Equity ». On la propose, on ne l'impose pas : un ETF Core et un
   ETF satellite ne se distinguent pas de ce cote-la, et l'or non plus. */
const classeDuType = t => {
  const s = String(t || '').toLowerCase();
  if (/crypto/.test(s)) return 'crypto';
  if (/bond|obligation/.test(s)) return 'obligations';
  if (/currency|devise/.test(s)) return 'monetaire';
  return 'actions';
};

/* Les comptes qui peuvent porter cette categorie, prets pour une liste
   deroulante : une action ou un ETF ne se proposent que sur un CTO ou un PEA,
   une crypto que sur un portefeuille de cryptomonnaies. */
const comptesPourListe = cat => comptesPourCategorie(cat)
  .map(c => [c.id, sousNom('', nomCompteV2(c), nomEtabDe(c))]);
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'CAD', 'JPY'];

/* Places de cotation, par suffixe Yahoo. Ce réglage sert à départager un ISIN
   coté à plusieurs endroits : il est passé tel quel à la passerelle, donc
   ajouter une place ici suffit — rien à changer côté serveur. */
const EXCHANGES = [
  /* « Automatique » tout court, et la parenthese est partie. Un menu natif se
     serre a la largeur qu'on lui laisse et tronque sans rien dire : dans la carte
     de recherche, a cote d'un champ et d'un bouton, il affichait « Automatique
     (place de ré ». Une etiquette qui ne tient jamais entiere ne renseigne pas,
     elle encombre. Ce que la parenthese disait est deja sous le champ des
     Preferences, dans sa bulle — « Sert a departager un ISIN cote sur plusieurs
     marches » — c'est-a-dire au seul endroit ou l'on vient regler ce choix plutot
     que le subir. */
  [trad('Par défaut'), [
    ['auto', trad('Automatique')],
  ]],
  [trad('Europe'), [
    ['.PA', 'Euronext Paris'], ['.AS', 'Amsterdam'], ['.BR', trad('Bruxelles')], ['.LS', trad('Lisbonne')],
    ['.DE', 'Xetra'], ['.F', trad('Francfort')], ['.MU', 'Munich'], ['.SG', 'Stuttgart'], ['.BE', 'Berlin'],
    ['.MI', 'Milan'], ['.MC', 'Madrid'], ['.SW', trad('SIX Suisse')], ['.VI', trad('Vienne')],
    ['.L', trad('Londres (LSE)')], ['.IL', trad('Londres (cotations en devises)')], ['.IR', 'Dublin'],
    ['.ST', 'Stockholm'], ['.OL', 'Oslo'], ['.CO', trad('Copenhague')], ['.HE', 'Helsinki'],
    ['.WA', trad('Varsovie')], ['.PR', 'Prague'], ['.AT', trad('Athènes')], ['.IS', 'Istanbul'],
  ]],
  [trad('Amériques'), [
    ['', trad('États-Unis (NYSE / Nasdaq)')], ['.TO', 'Toronto'], ['.V', 'TSX Venture'],
    ['.NE', 'Cboe Canada'], ['.MX', 'Mexico'], ['.SA', 'São Paulo'],
  ]],
  [trad('Asie · Pacifique'), [
    ['.T', 'Tokyo'], ['.HK', 'Hong Kong'], ['.SS', 'Shanghai'], ['.SZ', 'Shenzhen'],
    ['.KS', trad('Séoul (KOSPI)')], ['.TW', trad('Taïwan')], ['.NS', trad('Inde (NSE)')], ['.BO', trad('Inde (BSE)')],
    ['.SI', trad('Singapour')], ['.AX', trad('Australie')], ['.NZ', trad('Nouvelle-Zélande')],
  ]],
  [trad('Afrique · Moyen-Orient'), [
    ['.JO', 'Johannesburg'], ['.TA', 'Tel Aviv'],
  ]],
];

/* Sigles des devises. Sans eux, « 604 » sur une ligne cotée en dollars se lit
   comme des euros — surtout à côté d'une ligne en euros à « 5,8 ». */
const CURRENCY_SIGNS = { EUR: '€', USD: '$', GBP: '£', CHF: 'Fr', SEK: 'kr', CAD: 'C$', JPY: '¥' };
const currencySign = c => CURRENCY_SIGNS[c] || c || '€';

/* `prixCell` vivait ici : une cellule de prix avec sa conversion en euros en
   dessous, pour le PRU et le cours du tableau des lignes. Ces deux colonnes sont
   parties avec les neuf autres que la fiche portait deja, et la fonction n'avait
   plus d'appelant. */

/* Tri du tableau des positions : clé + sens, ou null pour l'ordre de saisie */
/* Plage affichée par chaque graphique d'historique. Un an par défaut : assez
   pour voir une tendance, assez court pour que le mois dernier reste lisible. */
/* Une seule fenetre temporelle pour la carte d'evolution : elle est la
   meme sur l'accueil et sur les relevés, donc son reglage aussi. Deux
   variables donnaient deux cartes differentes a l'ecran. */
let evoRange = '1y';
/* Brut ou net : le bandeau annonce le net, la courbe doit dire la meme
   chose par defaut. Le brut reste accessible — il montre la composition
   des avoirs, que le net aplatit quand un credit est gros. */
/* Net ou brut : une seule notion, donc un seul réglage.
   Le grand chiffre et la courbe avaient chacun le leur : on pouvait afficher
   le titre en brut au-dessus d'une courbe tracée en net, sur le même écran,
   sans que rien ne le signale. Les deux contrôles restent — on bascule là où
   se pose le regard, comme le sélecteur d'année de Budget qui se répète sur
   chaque carte — mais ils commandent la même variable. */
let evoNet = true;    // évolution du patrimoine, vue d'ensemble
let paceRange = '1y';        // rythme d'accumulation
/* Le tableau « Voir les données » de l'évolution : son année, et son état
   ouvert/fermé. Le rendu remplace tout le HTML de la vue, donc un <details>
   perdrait son ouverture au premier changement d'année — celui-là même qu'on
   vient de faire depuis l'intérieur du dépliant. */
let evoYear = null;          // null = année en cours · 'all' = toute la série
let evoDetailOuvert = false;
/* Le journal des entrees et sorties exceptionnelles, replie par defaut. Meme
   mecanique que ci-dessus : le drapeau vit en memoire vive, donc il survit aux
   re-rendus d'une session — enregistrer une ligne ne referme pas la liste qu'on
   etait en train de lire — et un rechargement le remet a plie, ce qui est l'etat
   qu'on veut en arrivant. */
let journalOuvert = false;
/* La ligne « Revenus » de la carte « Ou va ce que tu gagnes » ouvre ses sources.
   L'etat vit ici, comme les autres replis de vue : un `details` natif se
   refermerait a chaque rendu, et le rendu suit chaque frappe dans un champ. */
let revenusOuvert = false;
/* Redessine la fenetre des revenus quand une source y est ajoutee ou retiree :
   ces deux actions rendent la vue de fond, pas le contenu de la fenetre. */
const rafraichirRevenus = () => { if (revenusOuvert) fenetreRevenus(); };
let salesRange = '1y';       // les deux graphiques de Performance
/* L'annee du journal des ventes, distincte de la plage glissante ci-dessus.

   Une annee et non une duree glissante, parce que ce journal se consulte comme
   un releve : « qu'est-ce que j'ai vendu en 2025 » a une reponse, « qu'est-ce
   que j'ai vendu ces douze derniers mois » n'en a pas qu'on retienne. C'est le
   choix deja fait pour le journal des apports, qui vit dans Releves.

   `null` = l'annee courante, decidee au rendu : la figer ici la rendrait fausse
   au 1er janvier. */
/* `salesYear` est parti : le journal se borne comme les graphiques, par
   `salesRange`, qui accepte desormais une annee civile autant qu'une duree. */

/* Comment le journal se lit : dans l'ordre du temps, ou par montant. « date »
   par defaut, parce qu'un journal est un recit avant d'etre un classement. */
let triVentes = 'date';

/* Le depliant du journal se souvient. Un `<details>` est recree a chaque rendu,
   et cette page se rend a chaque arrivee de cours : sans memoire, il se refermait
   sous les yeux de qui venait de l'ouvrir. Ouvert par defaut — la carte n'a plus
   de tuiles au-dessus, donc replie elle ne montrerait qu'un titre. */
let journalDeroule = true;
let posSort = null;
/* Filtre de role sur le portefeuille : « tous », « core » ou « satellite ».
   Il agit sur la liste des lignes et sur le graphique de performance ligne a
   ligne, pas sur les tuiles du haut — celles-ci disent ce que vaut le
   portefeuille, et une valeur qui change selon un filtre d'affichage serait
   un piege. Le nombre de lignes retenues est rappele a cote du filtre. */
let posRole = 'tous';
/*    Filtre de compte, meme regime que le role : la liste des lignes, pas les
   tuiles du haut. Les poids par ligne ne changent pas avec lui — la part
   d'une ligne dans le portefeuille est un fait de la ligne, pas de
   l'affichage — et le compteur « masquées » dit ce que le filtre retient.*/
let posCompte = 'tous';
const POS_SORT_KEYS = {
  name:     p => p.name?.toLowerCase() || '',
  value:    p => posValue(p),
  invested: p => posInvested(p),
  perfEur:  p => posPerfEur(p),
  perfPct:  p => posPerfPct(p),
  /* Quatre colonnes ne se triaient pas : la quantite, le prix de revient, le
     cours et le poids. Rien ne le justifiait — on trie un tableau par la colonne
     qu'on regarde, et « quelle ligne pese le plus » etait justement la question
     sans reponse. Le poids se trie par la valeur : c'est le meme classement, le
     denominateur etant commun a toutes les lignes. */
  qty:      p => num(p.qty),
  pru:      p => num(p.avgPrice),
  cours:    p => num(p.price),
  poids:    p => posValue(p),
  assetClass: p => ASSET_CLASSES[assetClassDe(p)],
  role:       p => ROLES[roleDe(p)],
  account:  p => ACC[p.account]?.short || '',
};

function sortPositions(entries) {
  if (!posSort) return entries;
  const get = POS_SORT_KEYS[posSort.key];
  if (!get) return entries;
  const dir = posSort.dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    const va = get(a.p), vb = get(b.p);
    if (typeof va === 'string') return va.localeCompare(vb, 'fr') * dir;
    return (va - vb) * dir;
  });
}

/* --- listes de telephone ------------------------------------------------
   Un tableau de plus de trois colonnes est un piege a defilement sur un
   ecran de 375 px : dans « Lignes de titres », on voyait Nom, ISIN et
   Symbole, pendant que la valeur, la performance et le poids restaient hors
   champ. Or la fenetre de detail existe deja pour chacun de ces tableaux :
   le tableau ne faisait que dupliquer ce qu'un clic ouvre en entier.

   La liste montre donc les deux ou trois chiffres qu'on vient chercher, et
   toute la ligne s'ouvre — la ligne entiere plutot qu'un bouton « details » :
   la cible est vingt fois plus grande au pouce.

   Les deux rendus coexistent, le CSS montre l'un ou l'autre selon la largeur.
   La liste ne porte aucun champ de saisie : deux elements partageant le meme
   `data-path` embrouilleraient le re-rendu qui suit une modification. */
/* `ancre` et `classe` : la liste doit pouvoir porter les memes reperes que la
   ligne de tableau qu'elle remplace — l'ancre visee par « Aller a la ligne »,
   et le fond du mois en cours. */
/* `barre` : un dessin pose sous la ligne, facultatif.

   La ligne restait a trois cases — nom, chiffres, chevron — ce qui suffit
   partout sauf la ou le montant se decompose. Un releve mensuel a un total ET
   des poches, et la liste n'avait pas d'endroit pour dire les secondes.

   Le balisage ne change que dans ce cas : sans `barre`, c'est exactement la
   ligne d'avant. Une ligne qui porterait un conteneur vide partout aurait
   ajoute un niveau de DOM a douze mois de releves pour rien. */
function ligneListe({ action, index, titre, sous, valeur, second, classeSecond, marque, ancre, classe, barre }) {
  const corps = `
    <span class="ml-nom">${esc(titre)}${marque || ''}${sous ? `<span class="sub">${esc(sous)}</span>` : ''}</span>
    <span class="ml-chiffres">
      <b>${valeur}</b>
      ${second ? `<span class="${classeSecond || 'muted'}">${second}</span>` : ''}
    </span>
    <span class="ml-chev" aria-hidden="true">›</span>`;
  return `
  <button type="button" class="mlist${barre ? ' mlist-empile' : ''}${classe ? ` ${classe}` : ''}"
          data-action="${action}" data-i="${index}"${ancre ? ` data-anchor="${esc(ancre)}"` : ''}>
    ${barre ? `<span class="ml-haut">${corps}</span>${barre}` : corps}
  </button>`;
}

/* Une en-tete triable, et sa bulle d'aide a cote plutot que dessus.

   `suffixe` porte l'unite (« dev. »), qui fait partie de l'intitule et reste
   donc dans la zone cliquable. */
function sortableTh(key, label, extraClass = '', explication = '', suffixe = '') {
  const on = posSort && posSort.key === key;
  const sens = !on ? trad('décroissant') : posSort.dir === 'desc' ? trad('croissant') : trad('aucun tri');
  return `<th class="sortable ${on ? posSort.dir : ''} ${extraClass}">`
       + `<button type="button" class="th-tri" data-action="sort-positions" data-key="${key}"`
       + ` title="${trad('Trier par')} ${esc(trad(label))}, ${trad('ordre')} ${sens}">${esc(trad(label))}${suffixe}</button>`
       + (explication ? aide(trad(explication)) : '')
       + `</th>`;
}

/* Le choix du compte d'une ligne de marche.
   Le nom court herite des anciennes donnees suffisait quand on connaissait
   par coeur ses quatre comptes : « Crypto » ne dit pas si c'est le
   portefeuille de cryptomonnaies ou autre chose, et un « CTO » de courtier
   se tronquait a mi-mot. On donne le nom complet, et l'etablissement
   devient l'en-tete de groupe — le navigateur le rend en section, sur
   telephone comme sur ordinateur. On groupe meme a un seul etablissement :
   savoir chez quel courtier le portefeuille de cryptomonnaies est tenu
   compte autant quand c'est le seul choix que quand il y en a trois. */
function optionsCompte(comptes, choisi) {
  const paretab = new Map();
  comptes.forEach(c => {
    const e = nomEtabDe(c) || 'Sans établissement';
    if (!paretab.has(e)) paretab.set(e, []);
    paretab.get(e).push(c);
  });
  const opt = c => `<option value="${c.id}" ${c.id === choisi ? 'selected' : ''}>${esc(nomCompteV2(c))}</option>`;
  return [...paretab].map(([e, liste]) =>
    `<optgroup label="${esc(e)}">${liste.map(opt).join('')}</optgroup>`).join('');
}

function viewPositions() {
  const pnl = portfolioPnl();
  const stockBase = stockTotals().balance;
  const brokerAccounts = ACCOUNTS.filter(a => a.holdings);

  /* Un compte disparu — vendu, archive — ne peut pas rester filtre : la page
     semblerait vide sans qu'aucun controle visible ne l'explique. */
  if (posCompte !== 'tous' && !Store.state.positions.some(p => p.account === posCompte)) {
    posCompte = 'tous';
  }

  // On trie une vue indexée : les data-path continuent de viser la vraie ligne.
  const retenues = Store.state.positions
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => posRole === 'tous' || roleDe(p) === posRole)
    .filter(({ p }) => posCompte === 'tous' || p.account === posCompte);
  const ps = sortPositions(retenues)
    .map(({ p, i }) => Object.assign(Object.create(Object.getPrototypeOf(p)), p, { __i: i }));
  const masquees = Store.state.positions.length - retenues.length;

  /* La devise de cotation d'une ligne, pour les trois colonnes de prix. */
  const dev = q => q.currency || 'EUR';
  const rows = ps.map((p) => {
    const i = p.__i;
    const v = posValue(p), inv = posInvested(p), pe = posPerfEur(p), pp = posPerfPct(p);
    /* Dix colonnes, contre dix-huit, et plus une seule ou l'on saisit.

       A dix-huit colonnes editables, un ecran de 1 400 px lisait « FR0 » pour un
       ISIN et n'affichait plus la quantite : le tableau ne se lisait plus. Huit
       colonnes sont donc parties, celles qu'on regle et qui se reglent dans la
       fiche : ISIN, symbole, devise, change, valeur manuelle, classe, role,
       compte.

       Quantite, prix de revient et cours restent, en lecture. Un tableau sert a
       comparer des lignes entre elles, et ces trois-la sont les termes du calcul
       que les quatre suivantes donnent en resultat — sans eux, on lit un ecart
       sans voir d'ou il vient. Elles ne sont plus des champs : la saisie vit dans
       la fiche, et deux surfaces pour la meme donnee se contredisent tot ou tard.

       L'identite de la ligne passe sous son nom, comme dans la liste du
       telephone — meme phrase, meme ordre.

       Pas de colonne de suppression. Une croix par ligne, collee contre le nom
       qu'on clique pour lire, met un geste irreversible a portee de pouce du
       geste de lecture — et cinq croix alignees font une colonne de destruction
       la ou le tableau sert a comparer. La suppression vit dans la fiche, avec
       les autres actes de la ligne : c'est la meme regle qui a sorti
       l'annulation du journal des ventes. */
    return `<tr>
      <td class="name sticky-col"><button type="button" class="mois-lien"
            data-action="open-position" data-i="${i}"
            title="${trad('Ouvrir la fiche : quantité, prix de revient, ISIN, compte…')}"
            >${esc(p.name || 'Sans nom')}<span class="sub">${
              esc([ASSET_CLASSES[assetClassDe(p)], ROLES[roleDe(p)],
                   ACC[p.account]?.short || ''].filter(Boolean).join(' · '))
            }</span></button></td>
      <td class="muted">${p.qty != null && p.qty !== '' ? num(p.qty).toLocaleString(locale()) : ''}</td>
      <td class="muted">${num(p.buyPrice) ? fmtCur(p.buyPrice, dev(p)) : ''}</td>
      <td class="muted">${num(p.price) ? fmtCur(p.price, dev(p)) : ''}</td>
      <td>${p.manual
            ? `<input type="number" step="any" data-path="positions.${i}.value" value="${p.value ?? ''}">`
            : `<b>${fmtEUR(v)}</b>`}</td>
      <td>${p.manual
            ? `<input type="number" step="any" data-path="positions.${i}.invested" value="${p.invested ?? ''}">`
            : fmtEUR(inv)}</td>
      <td class="${cls(pe)}">${fmtSigned(pe)}</td>
      <td class="${cls(pp)}">${arrow(pp)} ${fmtSignedPct(pp)}</td>
      <td class="muted">${fmtPct(stockBase ? v / stockBase * 100 : 0)}</td>
    </tr>`;
  }).join('');


  /* Une page de titres cotes pour quelqu'un qui n'en a pas.

     Elle dit maintenant ce qu'elle est, et ou aller. Ce n'est pas un ecran vide
     de plus : c'est le seul moment ou l'application peut expliquer sa propre
     division du travail — les titres cotes ici, parce qu'ils ont un cours qui
     tombe tout seul ; tout le reste dans Comptes, parce que c'est nous qui en
     donnons la valeur. Un investisseur en non cote n'a rien a rater ici, et il
     doit pouvoir le savoir sans essayer. */
  if (!Store.state.positions.length) {
    return `
  <div class="card">
    <div class="card-head"><h2>${trad('Aucun titre coté')}</h2>
      <span class="hint">${trad('actions, ETF, obligations, crypto')}</span></div>
    <p class="empty" style="margin:0 0 12px">Cette page suit les placements dont le
      cours arrive tout seul, du marché. Tes placements non cotés, ton immobilier et
      tes liquidités se déclarent dans Actifs, où c'est toi qui en donnes la valeur :
      ils comptent dans ton patrimoine, ta répartition et ton autonomie exactement
      comme le reste.</p>
    ${(() => {
      /* Le prerequis, et il manquait : un titre se pose sur le compte qui le
         detient, et sans compte eligible la fenetre d'ajout n'offrait qu'une
         liste deroulante vide — le titre n'avait nulle part ou aller, et rien ne
         disait pourquoi. L'ecran expliquait la frontiere avec Actifs, ce qui est
         utile, mais pas le geste a faire avant.

         Les types sont derives de leur table : celui qu'on ajoutera demain
         entrera dans cette phrase sans qu'on y pense. */
      const porteurs = TYPES_COMPTE.filter(t =>
        (t.classes || []).some(c => ['actions', 'obligations', 'crypto'].includes(c)));
      const eligibles = comptesOuverts().filter(c =>
        porteurs.some(t => t.id === c.type));
      if (eligibles.length) return `
    <div class="row" style="gap:8px">
      <button class="btn" data-action="goto" data-view="accounts" data-anchor="">${trad('Aller à Actifs')}</button>
      <button class="btn ghost" data-action="ajouter-ligne">${trad('+ Un titre coté')}</button>
    </div>`;
      /* Le bouton ci-dessus ouvre la carte de recherche, et cette carte doit donc
         exister : elle ne se rendait qu'avec le tableau des lignes, c'est-a-dire
         partout sauf ici. Le clic posait son drapeau, relançait le rendu, ne
         trouvait rien a ouvrir, et ne faisait donc rien — precisement sur l'ecran
         ou l'on n'a encore aucune ligne. */
      return `
    <div class="row" style="gap:8px">
      <button class="btn" data-action="ajouter-compte">${trad('Créer un compte-titres')}</button>
      <button class="btn ghost" data-action="goto" data-view="accounts" data-anchor="">${trad('Aller à Actifs')}</button>
    </div>
    <p class="small muted" style="margin:12px 0 0">${trad('Un titre se pose sur le compte qui le détient : commence par en créer un.')}
      ${trad('Ceux qui peuvent en porter :')} ${esc(porteurs.map(t => trad(t.label)).join(', '))}.</p>`;
    })()}
  </div>
  ${(() => {
    const porteurs = TYPES_COMPTE.filter(t =>
      (t.classes || []).some(c => ['actions', 'obligations', 'crypto'].includes(c)));
    /* La carte de recherche, la meme qu'en bas de la page pleine : un seul chemin
       pour ajouter une ligne, ici comme ailleurs. Elle ne se rend qu'avec un compte
       capable de porter le titre — sans lui, la fenetre d'ajout n'offrirait qu'une
       liste vide, et le bouton d'a cote propose deja d'en creer un. */
    return comptesOuverts().some(c => porteurs.some(t => t.id === c.type))
      ? symbolSearchCard() : '';
  })()}`;
  }

  return `
  ${barreEtatCours()}

  <!-- Ou en est la journee, avant de regarder ses propres lignes : deux
       indices americains, deux europeens, la parite qui pese sur toutes les
       lignes en dollars, l'or et le bitcoin. Rempli apres coup, la barre ne
       doit pas retarder l'affichage de la page. -->
  <!-- Les familles au-dessus du ruban : Indices, Metaux, Crypto, Devises. Une
       seule s'affiche a la fois, ce qui garde le ruban court — vingt tuiles a
       la file feraient un marathon de pouce a 375 px. -->
  <div class="reperes-familles" id="reperesFamilles" role="tablist"
       aria-label="${trad('Familles de repères')}" hidden></div>
  <div class="reperes" id="reperes" aria-label="${trad('Marchés')}" hidden></div>

  ${(() => {
    const j = dayPerformance();
    if (!j.lignes.length) {
      return `<div class="card">
        <div class="card-head"><h2>${trad('Aujourd\'hui')}</h2></div>
        <p class="empty">Pas encore de clôture de la veille en mémoire.
          Actualise les cours pour que la performance du jour apparaisse.</p>
      </div>`;
    }
    const positif = j.eur >= 0;
    return `
    <div class="card jour" data-anchor="jour">
      <div class="card-head">
        <h2>${trad('Aujourd\'hui')}</h2>
        <!-- L'anciennete des cours est desormais dite une fois, en haut de
             page ; la repeter ici donnait « cours de il y a 1 min ».

             Deux comptes, deux phrases, et il ne faut pas les melanger : « sans
             cours de veille » designe les lignes absentes de la liste, faute de
             reference ; « sans cours du jour » celles qui y sont avec un ecart
             nul, parce que notre prix date d'avant minuit. -->
        <span class="hint">${j.hausse} ${trad('en hausse')} · ${j.baisse} ${trad('en baisse')}
          ${j.sansDonnee ? `· ${j.sansDonnee} ${trad('sans cours de veille')}` : ''}
          ${j.horsSeance && !j.toutHorsSeance ? `· ${j.horsSeance} ${trad('sans cours du jour')}` : ''}</span>
      </div>

      <!--    Rien n'a cote depuis minuit : le total est nul par construction, et
   l'ecrire « +0 € · +0,00 % » se lit « journee sans mouvement ». Le meme
   principe que les lignes sans cours de veille, deja hors de la liste : un
   titre qui n'a pas cote ne dit rien, il ne dit pas zero.-->
      ${j.toutHorsSeance ? `
      <div class="jour-total">
        <span class="jour-eur muted">${trad('hors séance')}</span>
        <span class="jour-note">${trad('aucune de tes lignes n’a coté depuis minuit')}${
          j.asOfMarche ? ` : ${trad('le cours le plus récent date')} ${fmtCoursQuand(j.asOfMarche)}` : ''}</span>
      </div>` : `
      <div class="jour-total ${positif ? 'up' : 'down'}">
        <span class="jour-eur">${fmtSigned(j.eur)}</span>
        <span class="jour-pct">${arrow(j.pct)} ${fmtSignedPct(j.pct)}</span>
        <!-- La note dit sur quoi porte le total, donc elle change quand la base
             change : une ligne prise aujourd'hui compte depuis son achat, et
             annoncer « depuis la clôture d'hier » serait alors faux du montant
             que le titre avait deja perdu avant qu'on l'achete. -->
        <span class="jour-note">${trad('sur tes lignes de titres depuis la clôture d’hier')}${
          j.lignes.some(l => l.depuisAchat) ? `, ${trad('ou depuis ton achat du jour')}` : ''}</span>
      </div>`}

      <div class="jour-lignes">
        <!-- Chaque colonne porte son explication, l'intitule etant le
             declencheur : voir la note de monteAides(). Un paragraphe de cinq
             lignes vivait sous ce tableau et disait la meme chose. Il chargeait
             l'ecran a chaque visite pour un texte qu'on lit une fois. -->
        <div class="jour-ligne entete">
          <span>${trad('Ligne')}</span>
          <span><i class="col-aide" data-aide="${trad('La part de cette ligne dans tes titres cotés. Elle dit laquelle compte vraiment quand elle bouge : 1 % sur une ligne qui pèse 70 % du portefeuille déplace plus d’argent que 10 % sur une ligne à 3 %.')}" tabindex="0" role="button">${trad('Poids')}</i></span>
          <span><i class="col-aide" data-aide="${trad('La variation du titre depuis la clôture de la veille, dans sa propre devise : le mouvement affiché est celui du titre, pas celui du change. Les deux cours qui la produisent sont écrits sous le nom de la ligne, clôture de la veille puis cours du jour. Une ligne achetée aujourd’hui se compare à ton prix d’achat, et le dit sous son nom : tu ne la détenais pas hier soir.')}" tabindex="0" role="button">${trad('Var.')}</i></span>
          <span><i class="col-aide" data-aide="${trad('Ce que cette variation pèse sur ton patrimoine, convertie au taux du jour. C’est la colonne qui dit combien tu as gagné ou perdu, là où la variation ne dit qu’un pourcentage.')}" tabindex="0" role="button">${trad('Effet')}</i></span>
        </div>
        ${j.lignes.map(l => `
          <div class="jour-ligne">
            <!-- l.index vient de dayPerformance : la ligne porte sa position,
                 on ne la retrouve plus par son nom. Deux titres homonymes sur
                 deux comptes recevaient le poids et la fiche du premier. -->
            <!-- Le nom, celui que tu as choisi — et le meme qu'en bas de page.

                 Entre les deux, le nom gagne, et pas par gout. Il existe
                 toujours, y compris sur une ligne saisie a la main qui n'a aucun
                 symbole. Il porte ce que le detenteur a voulu distinguer — c'est
                 lui qui a ecrit « PEA » dans « MSCI World PEA ». Et toutes les
                 autres surfaces le portent deja : la fiche, la performance, le
                 journal des ventes, l'allocation. Le ticker aurait fait de cette
                 carte la seule exception.

                 La largeur se regle autrement : le nom est borne a la saisie, et
                 coupe a l'affichage si la colonne ne suffit pas. Le nom entier
                 reste en infobulle et dans la fiche. -->
            <span class="jl-nom"><button type="button" class="mois-lien"
              data-action="open-position" data-i="${l.index}"
              title="${esc(l.name)} · ${trad('voir la fiche complète')}">${
                esc(l.name)}</button></span>
            <span class="jl-poids muted">${fmtPct(poidsLigne(l), 1)}</span>
            <!-- Les colonnes Cours et Cloture veille sont parties d'ici, et avec
                 elles les deux regles qui les masquaient sous 460 px. Elles
                 disaient exactement ce que la ligne du dessous dit maintenant,
                 et le disaient seulement sur grand ecran : deux ecritures d'un
                 meme fait, dont celle qui comptait — le telephone — etait la
                 muette. (Aucun guillemet oblique : ce commentaire vit dans un
                 litteral de gabarit, un backtick y fermerait la chaine.) -->
            <!-- Vides hors seance, et non « +0,00 % · +0 € ». Le raisonnement
                 est celui qui sort deja les lignes sans cours de veille de la
                 liste : un titre qui n'a pas cote ne fait pas zero de
                 variation, il ne dit rien. Il restait applique a une moitie du
                 probleme seulement. -->
            <span class="jl-pct ${l.horsSeance ? '' : cls(l.pct)}">${
              l.horsSeance ? '' : fmtSignedPct(l.pct, 2)}</span>
            <span class="jl-eur ${l.horsSeance ? '' : cls(l.eur)}">${
              l.horsSeance ? '' : fmtSigned(l.eur)}</span>
              <!-- Le mouvement du jour, sous le nom, a la place de la place.

                   « La brique aujourd'hui donne la perf du jour mais ne donne
                   plus les mouvements du jour. » Mesure a 375 px : les colonnes
                   Cours et Cloture veille etaient masquees, il ne restait que le
                   resultat — « +0,29 % · +3 € » — sans les deux prix qui le
                   produisent. On voyait l'effet sans le mouvement.

                   Ce qui cede la place est le nom de la place de cotation :
                   « je m'en fous, on peut voir en cliquant dessus ». Il est dans
                   la fiche, qui le porte deja, et savoir qu'un titre passe de
                   19,24 a 19,30 sert tous les jours quand savoir qu'il cote sur
                   Euronext ne sert qu'une fois.

                   La pastille reste, seule : elle dit si la place est ouverte,
                   donc si ce prix vit encore ou s'il est fige depuis la cloture.
                   Son libelle passe en infobulle, le dessin suffit a l'oeil.

                   Sans cloture de veille — une ligne achetee aujourd'hui — le
                   prix se donne seul : une fleche partant de rien ne dirait
                   rien.

                   Il occupe toute la largeur de la ligne, et non la seule
                   colonne du nom. Loge dedans, il etait coupe net : « 588,77 $US
                   → 5… », la colonne faisant 110 px pour un texte qui en demande
                   150, et la cellule du nom rognant ce qui depasse pour les noms
                   longs. Une seconde rangee de la grille, sur toute sa largeur,
                   lui donne la ligne entiere : c'est un sous-titre de la ligne,
                   pas du nom.
                   (Aucun accent grave ici : ce commentaire vit dans un litteral
                   de gabarit, ou un backtick referme la chaine. Onzieme fois.) -->
              <span class="jl-mouv">${l.market
                ? `<i class="pastille ${l.market.cle}" title="${esc(
                    (GLYPHES_SEANCE[l.market.cle] || {}).titre || l.market.label)}"></i>`
                : ''}<!--
                Un seul prix, et sa couleur dit s'il vit encore.

                Reste ce qu'elles ne disent pas : le niveau, et sa fraicheur. En
                blanc, le prix est celui qui bouge en ce moment ; en gris, c'est
                une cloture, figee jusqu'a la prochaine seance. Une couleur au
                lieu d'un second montant. -->${`<b class="jl-prix${
                l.market && l.market.cle === 'open' ? '' : ' jl-fige'}${
                coursFraichis.has(l.symbol) ? ' valeur-maj' : ''}">${
                fmtCur(l.price, l.currency)}</b>`}<!--
                Ce que la ligne dit d'elle-meme, faute de quoi son ecart
                paraitrait faux : elle se compare a ton prix d'achat, pas a une
                cloture que tu n'as pas vecue. C'est ici et non dans une colonne
                a part, parce que sous 460 px il ne reste que le nom, le poids,
                la variation et l'effet.
             -->${l.depuisAchat ? `<span class="jl-quand">${trad('acheté aujourd’hui')}</span>` : ''}<!--
                Les deux faits sont vrais, et cote a cote ils se contredisent
                — sans cette mention, « ouvert · +0,00 % » se lit « le titre
                ne bouge pas ».-->${l.horsSeance ? `<span class="jl-quand">${l.quoteTime
                 ? `${trad('cours')} ${esc(fmtCoursQuand(l.quoteTime))}`
                 : trad('pas coté aujourd’hui')}</span>` : ''}</span>
          </div>`).join('')}
      </div>
      <!-- Le paragraphe qui vivait ici est parti dans les intitules de colonnes.
           Cinq lignes de texte sous un tableau de cinq lignes de titres : la
           moitie de la carte servait a expliquer l'autre, a chaque visite, pour
           quelque chose qu'on lit une fois. -->
    </div>`;
  })()}

  <!-- Quatre tuiles en grille 2×2 vivaient ici. Elles ne composaient rien :
       « Valeur du portefeuille » et « Montant investi » ne diffèrent que de la
       plus-value, affichée à côté comme si c'était une quatrième grandeur du
       même ordre, et la part de 12,3 % portée par « À investir » se rapportait
       à un total — les 15 131,72 € posés chez les courtiers — qui n'était
       écrit nulle part sur la page. Qui refaisait le calcul trouvait 14 %.

       Deux parts qui font le total, et l'arithmétique au pied : c'est la liste
       de l'accueil et du haut d'Allocation. Le total y est écrit, donc les
       pourcentages se vérifient. -->
  ${(() => {
    const st = stockTotals();
    const parts = [
      { label: 'Titres', value: st.invested, couleur: 'var(--series-2)', apercu: 'portefeuille' },
      /* La teinte des liquidites, celle de « Liquidites » sur l'accueil et dans
         Allocation : le cash a investir est du cash. Il portait `series-4`, la
         teinte de l'immobilier, et un studio et une poche d'especes se
         peignaient donc pareil d'un ecran a l'autre. */
      { label: BASES.cashPlacer.nom, value: st.cashToInvest, couleur: 'var(--series-1)', apercu: 'cashInvestir' },
    ].filter(x => Math.abs(num(x.value)) > 0.005)
     .map(x => ({ ...x, pct: st.balance ? num(x.value) / st.balance * 100 : 0 }));
    if (!parts.length) return '';
    return `
  <div class="card repart">
    ${parts.map(x => `
      <button type="button" class="repart-ligne" data-action="apercu"
              data-apercu="${esc(x.apercu)}"
              title="${esc(x.aide || `${trad('Voir le détail de')} ${trad(x.label)}`)}">
        <span class="repart-haut">
          <span class="dot" style="background:${x.couleur}"></span>
          <span class="repart-nom">${esc(trad(x.label))}</span>
          <b>${fmtEUR(x.value)}</b>
          <span class="repart-pct">${fmtPct(x.pct, 1)}</span>
        </span>
        <span class="repart-barre"><i style="width:${x.pct.toFixed(1)}%;background:${x.couleur}"></i></span>
      </button>`).join('')}
    <!-- « Total chez tes courtiers » vivait ici, en tête de ce pied. Deux
         raisons de le retirer, et la première suffit : il additionnait les
         titres et le cash à investir sous un nom qui situe l'argent, alors que
         ce cash peut dormir sur un livret ou un compte courant. Le nom était
         donc faux pour une partie de la somme.

         La seconde : les deux barres au-dessus disent déjà ces deux montants, et
         leur pourcentage se lit sur cette même somme. Un total sous ses parts
         qu'on vient de lire n'apprend rien. -->
    <dl class="kv repart-pied">
      <dt>${trad('Prix de revient des titres')}</dt>
        <dd><button type="button" class="mois-lien" data-action="apercu" data-apercu="investiTitres"
                    title="${trad('Voir le prix de revient ligne par ligne')}">${fmtEUR(pnl.invested)}</button></dd>
      <dt><b>${trad('Plus / moins-value latente')}</b></dt>
        <dd><button type="button" class="mois-lien ${cls(pnl.pnl)}" data-action="apercu" data-apercu="pnlLatent"
                    title="${trad('Voir le détail par ligne')}"><b>${fmtSigned(pnl.pnl)}</b>
              ${pnl.pct == null ? '' : `<span class="muted">·</span> ${fmtSignedPct(pnl.pct)}`}</button></dd>
    </dl>
  </div>`;
  })()}

  <!-- « Performance par ligne » est partie d'ici. C'était le même graphique que
       « Latente, ligne par ligne » dans Performance : même fonction, mêmes
       barres, mêmes données, la plus-value latente par position, triée.
       « Déjà performance par ligne est aussi dans performance non ? » Oui, à la
       fonction près.
       (Aucun accent grave dans ce commentaire : il vit à l'intérieur d'un
       littéral de gabarit, où un backtick referme la chaîne. C'est la neuvième
       fois que ce piège se referme, et la deuxième aujourd'hui.)

       Cette page listait donc trois fois les mêmes lignes : la carte du jour,
       ce graphique, puis le tableau. Trois listes qui répondent à deux
       questions seulement — ce qui a bougé aujourd'hui, et ce que je détiens.
       Le graphique répondait à une troisième, la plus-value latente, qui est le
       sujet entier d'une autre page.

       Ce qui reste ici répond à la question de la page : ce que font mes titres,
       et ce que je détiens. La plus-value, elle, se lit là où elle est le
       sujet. -->

  <div class="card" data-anchor="titres">
    <div class="card-head">
      <h2>${trad('Lignes de titres')}</h2>
      <!-- L'export vit dans Données, avec les dix autres feuilles et les
           sauvegardes : deux boutons d'export à deux endroits obligeaient à
           se demander lequel donne quoi. -->
      <div class="row">
        <button class="btn sm ghost" data-action="sell-position"
                ${ps.length ? '' : 'disabled'}
                title="${trad('Enregistrer une vente et sa plus-value')}">− Vendre</button>
        <button class="btn sm" data-action="ajouter-ligne">${trad('+ Ajouter une ligne')}</button>
      </div>
      <div class="row" style="margin:8px 0 0">
        <div class="segmented" role="group" aria-label="${trad('Filtrer par rôle')}">
          ${[['tous', trad('Tous')], ['core', 'Core'], ['satellite', 'Satellite']].map(([v, l]) =>
            `<button type="button" data-action="filtrer-role" data-role="${v}"
                     class="${posRole === v ? 'on' : ''}" aria-pressed="${posRole === v}">${l}</button>`).join('')}
        </div>
        <!-- Le filtre de compte se derive des positions : un compte sans ligne
             n'y figure pas, et il ne se rend qu'a partir de deux comptes — le
             proposer a qui n'a qu'un PEA serait un controle sans effet, qui se
             lit comme une panne. -->
        ${(() => {
          const ids = [...new Set(Store.state.positions.map(p => p.account))];
          if (ids.length < 2) return '';
          return `<select data-action-change="filtrer-compte-titres" class="annee"
                          title="${trad('Ne montrer que les lignes d’un compte')}">
            <option value="tous" ${posCompte === 'tous' ? 'selected' : ''}>${trad('Tous les comptes')}</option>
            ${ids.map(id => `<option value="${esc(id)}" ${posCompte === id ? 'selected' : ''}>${
              esc(ACC[id]?.label || ACC[id]?.short || id)}</option>`).join('')}
          </select>`;
        })()}
        <span class="hint">${ps.length} ${ps.length > 1 ? trad('lignes') : trad('ligne')}${
          masquees ? ` · ${masquees} ${masquees > 1 ? trad('masquées') : trad('masquée')}` : ''}</span>
      </div>
    </div>
    <div class="row" style="margin:-4px 0 12px">
      <span class="hint">${trad('Une ligne s’ouvre au doigt ou au clic : sa fiche porte la quantité, le prix de revient et le reste.')}</span>
    </div>
    <!-- Telephone : une ligne par titre, tout le reste dans la fiche. -->
    <div class="liste-mobile">
      ${ps.map(p => {
        const i = p.__i, v = posValue(p), pp = posPerfPct(p);
        return ligneListe({
          action: 'open-position', index: i,
          titre: p.name || 'Sans nom',
          sous: `${ASSET_CLASSES[assetClassDe(p)]} · ${ROLES[roleDe(p)]} · ${ACC[p.account]?.short || ''}`,
          valeur: fmtEUR(v), second: fmtSignedPct(pp, 1), classeSecond: cls(pp),
        });
      }).join('') || `<p class="empty">${trad('Aucune ligne.')}</p>`}
    </div>
    <div class="table-wrap large-seulement">
      <table class="editable">
        <thead><tr>
          ${sortableTh('name', 'Nom', 'sticky-col')}
          ${sortableTh('qty', 'Qté')}
          ${sortableTh('pru', 'PRU', '',
            'Prix de revient unitaire, dans la devise de cotation.', ` <span class="u">${trad('dev.')}</span>`)}
          ${sortableTh('cours', 'Cours', '',
            'Dernier cours connu, dans la devise de cotation.', ` <span class="u">${trad('dev.')}</span>`)}
          ${sortableTh('value', 'Valeur €')}${sortableTh('invested', 'Investi €')}
          ${sortableTh('perfEur', 'Perf €')}${sortableTh('perfPct', 'Perf %')}
          ${sortableTh('poids', '% portef.', '',
            'La part de cette ligne dans le portefeuille de titres, pas dans tes avoirs. '
            + 'Le classement est celui de la valeur : le dénominateur est le même pour toutes.')}
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="9" class="empty">Aucune position</td></tr>`}</tbody>
        <tfoot><tr>
          <td class="sticky-col">Total</td><td colspan="3"></td>
          <td>${fmtEUR(pnl.value)}</td><td>${fmtEUR(pnl.invested)}</td>
          <td class="${cls(pnl.pnl)}">${fmtSigned(pnl.pnl)}</td>
          <td class="${cls(pnl.pnl)}">${pnl.pct == null ? '' : fmtSignedPct(pnl.pct)}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>
  </div>

  ${symbolSearchCard()}

  <!-- La carte « Cours automatiques » vivait ici. Elle redisait ce que la
       pastille du haut dit deja — la fraicheur des cours, cliquable pour
       forcer une mise a jour — et son interrupteur « Au chargement » doublait
       celui des Preferences. Deux endroits pour une meme information, dont l'un
       tenait une demi-carte.

       Ce qui part avec elle : le detail par ligne des echecs de recuperation,
       et la table de resolution ISIN vers symbole. Le nombre d'echecs reste
       annonce par le message qui suit chaque actualisation, et l'etat par la
       pastille ; c'est laquelle qui manque. A remettre dans Donnees, avec les
       autres diagnostics, le jour ou une ligne echouera sans qu'on comprenne
       pourquoi. -->

  <!-- La carte « Cash a investir » vivait ici, avec sa table compte par compte.
       C'etait le troisieme affichage du meme argent sur la meme page : le resume
       du haut porte deja sa ligne, cliquable, et elle ouvre la fiche qui liste
       les memes comptes avec les memes champs modifiables.

       On a d'abord cru a un manque — les montants ne se signalaient pas comme
       modifiables — et c'etait vrai, mais d'un defaut general : la regle des
       tableaux modifiables rendait leurs champs entierement transparents jusqu'au survol, donc invisibles
       sur un telephone. Le pointille les revele partout desormais. Restait la
       redondance, qui n'avait plus d'excuse. -->

  <!-- Le renvoi vers le journal des ventes a quitte cette page. -->`;
}

/* Journal des ventes : la performance encaissée, celle que le tableau des
   lignes ne peut plus montrer une fois la position soldée. */
function salesCard() {
  const toutes = Store.state.sales || [];
  const aVendre = (Store.state.positions || []).length;

  /* Une seule borne de temps sur cette page, celle des graphiques au-dessus.

     Il y en avait deux : la plage glissante reglait les courbes, un menu d'annee
     reglait ce journal, et rien n'empechait l'un de dire 2025 et l'autre 2026.
     Deux contrôles jumeaux sur un ecran, chacun se prevalant de sa moitie, c'est
     le motif que ce projet corrige sans arret. Le menu des annees a donc rejoint
     les crans, dans un contrôle unique qui porte les deux facons de dire une
     borne : une duree qui court jusqu'a aujourd'hui, ou une annee civile.

     Le depliant reste, et il ne fait pas double emploi avec la borne : celle-ci
     dit **combien** de lignes existent, celui-la **quand** on les voit. Sur une
     annee chargee, cinq cents ventes restent cinq cents lignes. */
  const st = salesStats(salesRange);
  /* Le contrôle est ici aussi, et c'est la meme valeur qu'en haut : deux portes
     sur un champ unique, jamais deux champs. C'est ce qui separe ce montage du
     precedent — deux menus d'annee rangeaient deux etats, et l'un pouvait dire
     2025 pendant que l'autre disait 2026. Ils affichent desormais tous les deux
     la borne active, donc ils ne peuvent plus se contredire.
     Il se voit ici parce que c'est ici qu'on cherche une annee : un contrôle
     range deux cartes plus haut agirait sur ce qu'on lit sans etre sous les yeux. */
  const plages = rangeControl('sales-range', salesRange, anneesDesVentes());

  /* La carte porte le bouton qui l'alimente, et elle se rend même vide.

     « Ajouter une vente plus facilement. » Le seul chemin était le bouton
     « − Vendre » de la carte « Lignes de titres », dans Marchés — si loin que
     cette page l'écrivait noir sur blanc : « Le bouton "Vendre une ligne" se
     trouve dans Marchés ». Quand une page doit donner l'itinéraire vers son
     propre geste, c'est le geste qui est mal placé.

     C'est une deuxième porte sur la même action, pas un deuxième mécanisme :
     les deux appellent `sell-position`, qui demande la ligne. Ce qui serait
     fautif, ce serait deux saisies de vente.

     Et la carte ne disparaît plus faute de ventes : elle se rendait seulement
     s'il y en avait déjà, donc le bouton n'aurait jamais été là pour la
     première. C'est le cas qu'on ne voit pas en développant sur un jeu de
     données bien rempli. */
  return `
  <div class="card" data-anchor="ventes">
    <div class="card-head">
      <!-- La reserve fiscale est une bulle et non une phrase en pied de carte :
           elle vaut pour chaque ligne du journal, elle ne se lit qu'une fois, et
           posee en clair sous la liste elle occupait trois lignes d'ecran pour
           dire ce qu'on ne relit jamais. Sur le titre, elle reste a portee du
           doigt de qui se demande ce que ces montants comptent.
           Les noms d'enveloppes restent tels quels dans les deux langues : PEA
           et CTO sont des produits francais, les traduire inventerait des noms
           qui n'existent pas. -->
      <h2>${trad('Journal des ventes')}${aide(trad('Résultat brut, avant frais et fiscalité : '
        + 'le traitement fiscal dépend de l’enveloppe (PEA, CTO) et de ta situation.'))}</h2>
      ${toutes.length ? `<span class="hint">${st.count} ${st.count > 1 ? trad('ventes') : trad('vente')}${
        st.count === toutes.length ? '' : ` ${trad('sur.total', 'sur')} ${toutes.length}`}</span>
      ${plages}` : ''}
      <!-- Un seul bouton, et la nature se choisit dans la fenetre.

           Ils etaient deux : « Vendre », grise faute de ligne a vendre, et
           « Vente passee ». Deux entrees pour un seul geste — j'ai vendu quelque
           chose — dont une souvent inerte, avec une infobulle que personne ne lit
           au doigt. Le menu qui demande quoi vendre porte donc les lignes du
           portefeuille, puis « une vente passee, pour memoire » : la meme
           question, un seul controle.

           Plus d'etat desactive : sans aucune ligne, la fenetre s'ouvre sur ce
           repli. Un bouton qui a l'air disponible et se derobe est pire qu'un
           bouton qui dit ce qu'il peut.
           (Aucun backtick dans ce commentaire : il vit dans un litteral de
           gabarit, et fermerait la chaine.) -->
      <button class="btn sm ghost" data-action="sell-position"
              title="${trad('Enregistrer une vente et sa plus-value, ou en déclarer une passée')}">− ${trad('Vendre')}</button>
    </div>
    ${!toutes.length ? `<p class="empty">${trad('Aucune vente enregistrée.')} ${aVendre
      ? trad('Le bouton « Vendre » enregistre la vente, sa plus-value, et crédite le compte de ton choix.')
      : trad('Il faut une ligne de titres avant de pouvoir en vendre une.')}</p>` : `
    <!-- Une liste de ventes, chacune sa porte, et plus trois tuiles au-dessus.

         Les tuiles disaient le produit encaisse, le prix de revient cede et le
         taux de reussite : trois totaux de page pour des faits qui appartiennent
         a chaque vente, et dont deux se relisaient deja ailleurs — la plus-value
         encaissee est en tete de page avec son pourcentage, et le taux de
         reussite y tenait sa meta. Ils vivent maintenant dans le detail de la
         vente concernee, ou l'on va quand on veut savoir.

         Une liste et non un tableau, a toutes les largeurs. Celui-ci portait dix
         colonnes, donc un defilement lateral sous 768 px alors que la regle de la
         maison l'interdit au-dela de trois : le motif etait deja ecrit, dans
         ligneListe, et la seule carte qui l'ignorait etait celle-ci. Le nom qu'on
         lit est le bouton qu'on clique.

         L'annulation part avec le tableau et rejoint le panneau : un ↺ de 24 px
         colle contre une ligne cliquable, c'est un geste irreversible a portee de
         pouce du geste de lecture. -->
    ${st.count ? `<details class="data-view" id="pliVentes" ${journalDeroule ? 'open' : ''}>
      <summary>${trad('Voir les')} ${st.count} ${st.count > 1 ? trad('ventes') : trad('vente')}</summary>
      <!-- Deux lectures d'un journal, et elles repondent a deux questions.

           Par date, c'est ce qu'un journal est : le recit, dans l'ordre ou ca
           s'est passe. Par montant, c'est le classement : laquelle a rapporte,
           laquelle a coute. La barre d'ampleur donne deja la seconde a l'oeil,
           mais seulement au sein de la periode affichee et sans mettre les lignes
           cote a cote.

           Deux boutons d'etat et non un menu : il n'y a que deux valeurs, et un
           menu deroulant pour deux choix demande un geste de plus pour la meme
           chose. -->
      <div class="segmented seg-mini" style="margin:4px 0 8px">
        <button data-action="tri-ventes" data-tri="date" class="${triVentes === 'date' ? 'on' : ''}"
                aria-pressed="${triVentes === 'date'}">${trad('Par date')}</button>
        <button data-action="tri-ventes" data-tri="montant" class="${triVentes === 'montant' ? 'on' : ''}"
                aria-pressed="${triVentes === 'montant'}">${trad('Par montant')}</button>
      </div>
      <div class="liste-principale" style="margin-top:4px">
        ${(() => {
          /* L'ampleur de chaque plus-value, en barre, relative a la plus grosse de
             la periode affichee. Le journal reste dans l'ordre du temps — c'est ce
             qu'un journal est — et la barre donne ce que l'ordre chronologique ne
             donne pas : laquelle a porte la periode. Sans elle, trois montants
             alignes demandent de les comparer de tete.

             La base est la plus grande valeur absolue, gains et pertes sur la meme
             echelle : deux echelles separees feraient paraitre une perte de 40 EUR
             aussi grave qu'un gain de 700. Un plancher de 2 % pour qu'une petite
             vente ne disparaisse pas, et aucune barre du tout si rien ne depasse
             zero — comparer des riens n'apprend rien. */
          const plusGrand = Math.max(...st.sales.map(v => Math.abs(num(v.realised))), 0);
          /* Par montant, la plus grosse plus-value d'abord, et les pertes en
             queue : c'est un classement de resultat, donc l'ordre est signe et non
             pas absolu. Trier sur la valeur absolue aurait mis la pire perte en
             tete du classement des gains. */
          const listees = triVentes === 'montant'
            ? st.sales.slice().sort((a, b) => num(b.realised) - num(a.realised))
            : st.sales;
          return listees.map(v => {
            const dev = v.currency || 'EUR';
            const pct = num(v.invested) ? num(v.realised) / num(v.invested) * 100 : null;
            const part = plusGrand ? Math.abs(num(v.realised)) / plusGrand * 100 : 0;
            const teinte = num(v.realised) >= 0 ? 'var(--good)' : 'var(--critical)';
            /* Une vente declaree n'a ni quantite ni prix : son sous-titre dit d'ou
               elle vient plutot que d'afficher « 0 × 0 € ». */
            return ligneListe({
              action: 'open-sale', index: toutes.indexOf(v),
              titre: v.name,
              sous: [fmtDate(v.date), v.declaree ? trad('déclarée, pour mémoire')
                       : `${num(v.qty)} × ${fmtCur(v.price, dev)}`].filter(Boolean).join(' · '),
              valeur: `<span class="${cls(v.realised)}">${fmtSigned(v.realised)}</span>`,
              second: pct == null ? '' : fmtSignedPct(pct),
              classeSecond: cls(v.realised),
              barre: plusGrand ? `<span class="repart-barre"><i style="width:${
                Math.max(2, part).toFixed(1)}%;background:${teinte}"></i></span>` : '',
            });
          }).join('');
        })()}
      </div>
    </details>` : `<p class="empty">${trad('Aucune vente sur cette période.')}</p>`}`}
  </div>`;
}

/*    Le ticker est reparti — il rendait les deux cartes de Marches illisibles
   ensemble, « DCAM » en haut pour « MSCI World PEA » en bas — et la fonction
   avec lui. Une fonction sans appelant est la moitie qu'on oublie en retirant
   un affichage.*/


/* Soleil ou lune, selon que la place cote ou dort. Le cours d'un marche ferme
   est celui de la derniere cloture : sans ce signe, « +0,70 % » se lit comme
   un mouvement en cours alors qu'il est fige depuis des heures.

   Rien du tout quand l'etat est inconnu — `marketStatus()` rend `null` plutot
   que de supposer, et une lune posee a tort serait pire que pas de lune. Les
   seances etendues gardent le soleil, en ambre : ca cote, mais hors de la
   seance principale. */
const GLYPHES_SEANCE = {
  open:  { icone: 'soleil', titre: trad('Marché ouvert') },
  pre:   { icone: 'soleil', titre: trad('Pré-ouverture') },
  post:  { icone: 'soleil', titre: trad('Après clôture') },
  close: { icone: 'lune',   titre: trad('Marché fermé · dernier cours de clôture') },
};
function glypheSeance(etat) {
  const g = etat && GLYPHES_SEANCE[etat.cle];
  if (!g) return '';
  const dessin = g.icone === 'soleil'
    ? `<circle cx="12" cy="12" r="4.4"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3
        M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M19.2 4.8l-2.1 2.1M6.9 17.1l-2.1 2.1"/>`
    : `<path d="M20.5 14.6A8.8 8.8 0 0 1 9.4 3.5a8.8 8.8 0 1 0 11.1 11.1Z"/>`;
  return `<svg class="rp-seance ${esc(etat.cle)}" viewBox="0 0 24 24" role="img"
               aria-label="${esc(g.titre)}"><title>${esc(g.titre)}</title>${dessin}</svg>`;
}

/* La barre de reperes. Les valeurs restent visibles en mode discret : ce ne
   sont pas des avoirs, elles ne disent rien de ce que l'on possede. */
/* Les reperes affiches, gardes pour leurs fiches : APERCUS est synchrone, la
   fiche lit donc ce que la barre vient de recevoir plutot que de refetch. */
let REPERES_AFFICHES = [];

/* L'unite d'un repere : des points pour un indice, sinon sa devise.

   Le prefixe « ^ » designe un indice chez Yahoo, pour toutes les places : il ne
   se confond avec aucun ticker d'action ou d'ETF. On se garde de lire la devise
   plutot que de tenir une liste des cinq indices du ruban, qui oublierait le
   sixieme.

   La fonction vit ici parce que deux surfaces l'emploient, la tuile du ruban et
   la fiche qu'elle ouvre : un nombre nu se lisait « 1,08 » sans dire de quoi, et
   deux calculs separes auraient fini par donner deux unites pour un meme cours. */
const uniteRepere = l => String(l?.symbole || '').startsWith('^') ? ` ${trad('pts')}`
  : l?.devise === 'USD' ? ' $' : l?.devise === 'EUR' ? ' €'
  : l?.devise ? ` ${l.devise}` : '';

/* La famille affichee, gardee d'un rendu a l'autre. En memoire et non dans
   l'etat : c'est un reglage d'affichage, pas une donnee de patrimoine, et
   l'ecrire ferait une sauvegarde a chaque coup d'oeil sur les metaux. */
let familleReperes = null;
/* Vrai le temps d'un rendu, pose par le clic sur un onglet de famille. Le meme
   mecanisme que `tapeSousOnglets` : l'intention vit dans le geste, la classe
   est posee au rendu suivant puis retiree quand l'animation a fini. */
let reperesEntrent = false;
/* +1 si la nouvelle famille est a droite de l'ancienne dans la barre, -1 sinon.
   Les tuiles entrent alors du cote d'ou l'on vient. */
let reperesSens = 1;

async function mountReperes() {
  const box = $('#reperes');
  if (!box) return;
  familleReperes = familleReperes || Quotes.familleParDefaut;

  const familles = Quotes.famillesReperes();
  const onglets = $('#reperesFamilles');
  if (onglets) {
    /* La barre ne se reconstruit qu'une fois. C'est ce qui permet au
       soulignement de glisser : un element recree a chaque rendu n'a pas d'etat
       precedent, donc rien a animer — il apparaitrait deja en place. On ne
       reecrit donc que la classe active et la position du curseur. */
    if (!onglets.querySelector('[data-famille]')) {
      onglets.innerHTML = familles.map(([cle, nom]) => `
        <button type="button" class="rp-famille" data-famille="${esc(cle)}">${esc(nom)}</button>`).join('')
        + '<i class="rp-curseur" aria-hidden="true"></i>';
    }
    for (const b of onglets.querySelectorAll('[data-famille]')) {
      b.onclick = () => {
        if (b.dataset.famille === familleReperes) return;
        /* Le sens du trajet, avant de changer de famille : on va vers la droite
           dans la liste, les tuiles entrent donc par la droite. Sans ça le
           mouvement serait toujours le meme et ne dirait rien du chemin
           parcouru — c'est ce qui distingue un carrousel d'un simple
           remplacement. */
        const cles = familles.map(f => f[0]);
        reperesSens = cles.indexOf(b.dataset.famille) >= cles.indexOf(familleReperes) ? 1 : -1;
        familleReperes = b.dataset.famille;
        retourHaptique();
        /* La cascade ne joue qu'ici, au changement de famille, et jamais au
           rafraichissement des cours : c'est le clic qui la demande, pas le
           rendu. Une barre qui frissonne toutes les cinq minutes fatiguerait. */
        reperesEntrent = true;
        mountReperes();
      };
    }
    /* La classe active et le curseur, a chaque passage. Le curseur se mesure sur
       le bouton plutot que de se deduire d'un index : les libelles n'ont pas la
       meme largeur, « Crypto » est plus court que « Devises », et un
       soulignement de largeur fixe glisserait sous un mot qu'il ne couvre pas. */
    for (const b of onglets.querySelectorAll('[data-famille]'))
      b.classList.toggle('on', b.dataset.famille === familleReperes);
    const actif = onglets.querySelector('.rp-famille.on');
    const curseur = onglets.querySelector('.rp-curseur');
    if (actif && curseur) {
      curseur.style.width = `${actif.offsetWidth}px`;
      curseur.style.transform = `translateX(${actif.offsetLeft}px)`;
      /* Le premier placement ne s'anime pas : au chargement de la page, un
         soulignement qui arrive en glissant depuis la gauche se lit comme un
         mouvement dont personne n'a donne l'ordre. */
      if (!curseur.dataset.pose) {
        curseur.dataset.pose = '1';
        requestAnimationFrame(() => curseur.classList.add('glisse'));
      }
    }
    onglets.hidden = false;
  }

  let lignes;
  try { lignes = await Quotes.reperes(familleReperes); }
  catch (e) { box.hidden = true; return; }
  if (!box.isConnected) return;                 // la vue a change entre-temps
  const utiles = lignes.filter(l => l.ok);
  if (!utiles.length) { box.hidden = true; return; }
  REPERES_AFFICHES = utiles;
  const nb = (v, dec) => new Intl.NumberFormat(locale(),
    { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  box.innerHTML = utiles.map(l => `
    <button type="button" class="repere" data-action="apercu"
            data-apercu="repere" data-arg="${esc(l.symbole)}"
            title="${esc(l.nom)}${l.quoteTime ? ` · ${trad('cours')} ${fmtCoursQuand(l.quoteTime)}` : ''}">
      <span class="rp-tete">
        <span class="rp-nom">${esc(l.nom)}</span>
        ${glypheSeance(marketStatus(l))}
      </span>
      <span class="rp-prix">${nb(l.prix, l.prix < 10 ? 4 : 0)}<span class="rp-unite">${esc(uniteRepere(l))}</span></span>
      <!-- « hors séance » plutôt qu'un pourcentage de la veille. La tuile fait
           quatre-vingt-dix pixels : la date exacte du cours n'y tient pas, elle
           est dans l'infobulle et dans la fiche que la tuile ouvre. -->
      <span class="rp-var ${l.pct == null ? 'muted' : cls(l.pct)}">${
        l.pct == null ? trad('hors séance') : fmtSignedPct(l.pct, 2)}</span>
    </button>`).join('');
  box.hidden = false;
  /* La classe est retiree une fois l'animation finie : la laisser ferait
     rejouer la cascade au premier changement de style, et le ruban est
     redessine a chaque rendu de la vue. */
  if (reperesEntrent) {
    reperesEntrent = false;
    box.style.setProperty('--sens', String(reperesSens));
    box.classList.add('rp-entre');
    /* 0,42 s d'animation plus 0,22 s de decalage pour la derniere tuile : on
       retire la classe apres les deux, sinon la fin de la cascade est coupee. */
    setTimeout(() => box.classList.remove('rp-entre'), 700);
  }
  /* Le ruban revient a gauche : on vient de changer de famille, et rester au
     milieu du defilement precedent montrerait le troisieme repere d'une liste
     qu'on n'a pas encore lue. */
  box.scrollLeft = 0;
}

/* Pose par l'action « ajouter une ligne », consomme par `render()` : la carte
   de recherche n'existe pas encore au moment du clic si l'on arrive d'une
   autre vue. */
let ouvrirRechercheApresRendu = false;
/* Le compte d'ou l'on est parti, quand on vient de la fiche d'un compte. La
   fenetre de creation s'ouvre dessus au lieu du compte par defaut : on vient de
   dire ou l'on veut poser le titre, le redemander serait poser deux fois la
   meme question. Vide des qu'une ligne est creee, sinon le compte d'hier
   deciderait de la ligne d'aujourd'hui. */
let compteVisePourAjout = null;

function mountPositions() {
  /*    Le montage de « Performance par ligne » est parti avec sa carte : c'était
   le même graphique que celui de Performance.*/
  /* La recherche se monte meme sans aucune ligne, et c'est le correctif : l'etat
     vide porte le bouton « + Un titre coté » et desormais la carte qu'il ouvre.
     Le montage sortait avant, donc le champ restait inerte au moment precis ou
     l'on n'a rien et ou l'on vient tout ajouter. `mountSymbolSearch()` se tait
     de lui-meme si la carte n'est pas la — c'est le cas sans compte capable de
     porter un titre. */
  mountSymbolSearch();
  /* La recherche demandee depuis l'en-tete du tableau : on s'y rend, on donne
     le focus. `focusChamp` se tait sur ecran tactile, ce qui est voulu — le
     clavier ne doit pas recouvrir la carte a laquelle on vient d'arriver. */
  if (ouvrirRechercheApresRendu) {
    ouvrirRechercheApresRendu = false;
    const champ = $('#symQuery');
    /* Le defilement attend la fin de l'animation d'entree de la vue. Celle-ci
       deplace `.view` par un `transform`, et `scrollIntoView` appele pendant
       calcule sa cible sur la position transformee : la carte finissait hors de
       l'ecran une fois l'animation retombee. Le focus, lui, peut partir tout de
       suite : il ne depend pas de la geometrie. */
    focusChamp(champ);
    const carte = champ && champ.closest('.card');
    if (carte) setTimeout(() => carte.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  }

  /* Ce qui suit a besoin du tableau et de ses voisins : sans une seule ligne, la
     vue ne rend ni graphique ni barre de reperes, et monter dessus jetait
     « clientWidth de null » en laissant la page a moitie construite. */
  if (!Store.state.positions.length) return;
  mountReperes();
  monteTirerRafraichir();
}

/* ------------------------------------------------------------
   Cours automatiques
   ------------------------------------------------------------ */
function fmtWhen(iso) {
  if (!iso) return trad('jamais');
  const d = new Date(iso), mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return trad("à l'instant");
  /* Le nombre se place par gabarit et non par concatenation : l'anglais met
     l'anciennete apres la duree, « 5 min ago », et deux fragments cousus dans
     l'ordre francais donneraient « ago 5 min ». */
  if (mins < 60) return trad('il y a {n} min').replace('{n}', mins);
  if (mins < 1440) return trad('il y a {n} h').replace('{n}', Math.round(mins / 60));
  return d.toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
}

/* L'etat des cours, ecrit une fois pour les deux pages qui en vivent.

   Il datait les chiffres de Positions et pas ceux de Performance, ou la
   plus-value latente vaut exactement ce que les cours disent : le grand chiffre
   s'affichait sans une heure, et « depuis le debut » ne datait rien non plus.
   L'anciennete se dit une fois par page, en haut, avant les chiffres qu'elle
   date — la repeter dans chaque carte donnait « cours de il y a 1 min ».

   Une seule declaration : deux exemplaires de cette barre auraient porte deux
   boutons, et c'est arrive assez souvent dans ce depot pour qu'on n'essaie pas. */
function barreEtatCours() {
  return `
  <div class="barre-etat">
    <!-- Le ↻ manquait : « • il y a 2 min » se lit comme une étiquette d'état,
         et rien ne disait qu'on pouvait cliquer dessus pour relancer une
         récupération qui a échoué. L'icône tourne pendant l'appel. -->
    <button class="etat-cours" id="btnQuotes" type="button" data-action="refresh-quotes"
            title="${trad('Récupérer les cours de bourse')}"><i class="pt"></i><span id="coursQuand">${trad('Cours')}</span><span
            class="etat-maj" aria-hidden="true">↻</span></button>
  </div>`;
}

/* --- pastille d'etat des cours, dans la barre du haut ---
   Elle remplace le bouton « Cours » : les cours arrivent seuls, un bouton
   d'action promettait donc un travail deja fait. Reste l'information —
   fraicheur et anciennete — cliquable pour forcer une mise a jour. */
const COURS_FRAIS = 15 * 60 * 1000;   // en deca, on considere le cours a jour

function majEtatCours(etat) {
  const btn = $('#btnQuotes');
  if (!btn) return;
  const quand = $('#coursQuand');
  const on = Quotes.isOnline();
  const last = Store.state.quotes?.lastRun;
  const age = last ? Date.now() - new Date(last) : Infinity;

  btn.classList.remove('frais', 'tiede', 'hs', 'encours');

  if (etat === 'encours') {
    btn.classList.add('encours');
    quand.textContent = 'Cours…';
    btn.title = 'Récupération en cours';
    return;
  }
  if (on === false) {
    btn.classList.add('hs');
    btn.disabled = true;
    quand.textContent = 'Hors ligne';
    btn.title = 'Passerelle non détectée : lance « python serve.py »';
    return;
  }
  btn.disabled = false;
  if (!Quotes.plan().symbols.length) {
    quand.textContent = 'Cours';
    btn.title = 'Aucun symbole suivi pour l’instant';
    return;
  }
  /* Ce que la pastille date, c'est le PRIX, pas la requete.

     `coursAsOf()` donne l'heure du marche, celle que la place a mise sur le
     dernier echange. Quand elle manque — Stooq ne la publie pas — on retombe
     sur `lastRun`, qui est alors tout ce qu'on sait. */
  const marche = coursAsOf();
  const ageMarche = marche ? Date.now() - marche * 1000 : null;
  const reference = ageMarche == null ? age : ageMarche;
  btn.classList.add(reference < COURS_FRAIS ? 'frais' : 'tiede');

  /* Hors seance, la pastille dit « hors seance » plutot qu'un age.

     Elle affichait « il y a 11 h » juste apres une actualisation qui venait de
     dire « 5 cours mis a jour ». Deux signaux qui semblent se contredire, et le
     second a l'air d'annoncer une panne : on a clique, quelque chose s'est
     passe, le repere n'a pas bouge.

     Donc ni « a l'instant » ni un age : la raison. Quand aucune ligne n'a cote
     depuis minuit, la place est fermee, et « hors seance » est a la fois vrai et
     rassurant — c'est le mot que la page emploie deja sur ses tuiles d'indices
     et dans sa carte du jour. L'age reste dans l'infobulle pour qui le cherche.

     `dayPerformance().toutHorsSeance` plutot qu'un calcul d'horaires : les places
     n'ouvrent pas aux memes heures, et un ETF europeen dans un portefeuille
     americain ferait mentir n'importe quelle table. Ce qui compte n'est pas
     l'heure qu'il est, c'est qu'aucune ligne detenue n'ait bouge. */
  /* Trois etats, parce qu'un portefeuille peut etre a cheval sur deux places.

     Ni un age, donc, ni « hors seance » qui serait faux tant qu'une place cote :
     le compte de ce qui n'a pas bouge. « 2 hors seance » se lit sans effort, et
     l'infobulle nomme le reste. C'est le meme mot que sur les tuiles d'indices et
     dans la carte du jour, qui compte deja « n sans cours du jour ».

     La pastille reste tiede dans ce cas : un point vert au-dessus d'un
     portefeuille a moitie perime dirait que tout va bien. */
  const j = dayPerformance();
  const ferme = !!j.toutHorsSeance;
  const partiel = !ferme && j.horsSeance > 0;
  if (partiel) { btn.classList.remove('frais'); btn.classList.add('tiede'); }
  quand.textContent = ferme ? trad('hors séance')
                    : partiel ? `${j.horsSeance} ${trad('hors séance')}`
                    : marche ? fmtWhen(new Date(marche * 1000))
                    : last ? fmtWhen(last) : trad('Cours');
  /* Les deux heures dans l'infobulle, parce que leur ecart est justement ce
     qu'on cherche a savoir quand les chiffres ne bougent pas. */
  /* Le compte des lignes passe par un gabarit a deux nombres : l'accord du
     verbe et du pluriel differe d'une langue a l'autre, et l'anglais n'a qu'une
     forme la ou le francais en a deux. */
  btn.title = marche
    ? `${trad('Cours')} ${fmtCoursQuand(marche)}, ${trad('relevés')} ${fmtWhen(last)}`
      + (ferme ? ` · ${trad('aucune de tes lignes n’a coté depuis minuit')}`
       : partiel ? ' · ' + trad(j.horsSeance > 1
                    ? '{n} lignes sur {t} n’ont pas encore coté aujourd’hui'
                    : '{n} ligne sur {t} n’a pas encore coté aujourd’hui')
                    .replace('{n}', j.horsSeance).replace('{t}', j.lignes.length)
       : '')
      + ` · ${trad('cliquer pour actualiser')}`
    : last
    ? `${trad('Cours mis à jour')} ${fmtWhen(last)} · ${trad('cliquer pour actualiser')}`
    : trad('Récupérer les cours de bourse');
}

function symbolSearchCard() {
  const on = Quotes.isOnline();
  return `
    <div class="card">
      <!-- Pas de renvoi en tete. Il donnait le mode d'emploi de la carte,
           « cherche, puis ... », donc il nommait un controle qu'on a sous les
           yeux : le premier a changer de nom l'a rendu faux, et un mode
           d'emploi faux se lit avant le controle qu'il decrit. Un renvoi de
           carte porte ce que la carte ne montre pas, jamais l'ordre des gestes
           qu'elle affiche. -->
      <div class="card-head"><h2>${trad('Ajouter une ligne')}</h2></div>
      <!-- Le recours, et pas l'inverse. Ce formulaire etait le chemin principal,
           offert par le bouton de l'en-tete du tableau, alors qu'il fait taper a
           la main ce que la recherche remplit seule. Il garde sa raison d'etre :
           un titre sans ISIN, ou cote nulle part, n'a pas d'autre porte. -->
      <p class="small muted" style="margin:0 0 12px">
        ${trad('Pas d’ISIN, ou un titre coté nulle part ?')}
        <button class="lien-nu" data-action="add-position">${trad('Saisir la ligne à la main')}</button>
      </p>
      <!-- La barre est posee, pas depliee. Un depliant coute un clic pour
           reveler ce que le titre de la carte annonce deja, et son resume
           redisait mot pour mot le champ qu'il cachait : « ISIN ou nom du
           titre » au-dessus de « ISIN ou nom, ex. ... ». Un panneau se replie
           quand il porte des reglages qu'on ne touche qu'une fois ; celui-ci
           porte le geste pour lequel on vient. -->
      <div class="barre-recherche" style="margin-top:12px">
        <input id="symQuery" placeholder="${trad('ISIN ou nom, ex. IE000OJ5TQP4')}" style="text-align:left">
        <button class="btn sm" id="symSearch" ${on === false ? 'disabled' : ''}>${trad('Chercher')}</button>
        <select class="menu-serre" data-path="meta.preferredExchange"
                title="${trad('Place privilégiée quand un ISIN est coté sur plusieurs marchés')}">
          ${(() => {
            const choisi = Store.state.meta.preferredExchange ?? '.PA';
            return EXCHANGES.map(([region, places]) => `<optgroup label="${esc(region)}">${
              places.map(([v, l]) =>
                `<option value="${v}" ${v === choisi ? 'selected' : ''}>${esc(l)}</option>`).join('')
            }</optgroup>`).join('');
          })()}
        </select>
      </div>
      <!-- La consigne tient en une ligne ; les trois suivantes disaient
           pourquoi, et c'est une limite technique qui interesse le jour ou l'on
           se demande pourquoi le champ ISIN est reste vide. -->
      <p class="small muted" style="margin:8px 0 0">
        <b>${trad('Colle plutôt l\'ISIN de ton relevé')}</b>${trad(' : la ligne se remplit alors entièrement.')}${aide(trad("Une recherche par nom donne le nom, le symbole, la devise et le cours, mais pas l’ISIN : aucune source gratuite ne le retrouve à partir d’un symbole. Partir de l’ISIN est le seul chemin qui remplit tout."))}
      </p>
      <div id="symResults" class="small" style="margin-top:12px"></div>
    </div>`;
}

/* Le cours et la devise d'un symbole, ou `null`.
   Rend `null` a la moindre difficulte — passerelle endormie, symbole sans
   cotation, reponse illisible — parce que l'appelant s'en sert pour meubler
   une question, jamais pour calculer : un repere absent laisse la fenetre
   s'ouvrir, une exception l'empecherait. */
async function coteDuSymbole(symbole) {
  const sym = String(symbole || '').trim().toUpperCase();
  if (!sym) return null;
  if (Quotes.isOnline() === null) await Quotes.health();
  if (Quotes.isOnline() === false) return null;
  try {
    const r = await fetch(`${Quotes.BASE}/api/quotes?symbols=${encodeURIComponent(sym)}`,
                          { cache: 'no-store' });
    const q = (await r.json()).quotes?.[0];
    return q && !q.error && num(q.price) ? q : null;
  } catch {
    return null;
  }
}

function mountSymbolSearch() {
  const btn = $('#symSearch'), input = $('#symQuery'), out = $('#symResults');
  if (!btn) return;

  const looksLikeIsin = s => /^[A-Za-z]{2}[A-Za-z0-9]{9}[0-9]$/.test(s.replace(/\s/g, ''));

  async function run() {
    const q = input.value.trim();
    if (q.length < 2) { out.innerHTML = '<p class="muted">Tape au moins deux caractères.</p>'; return; }

    const asIsin = looksLikeIsin(q) ? q.replace(/\s/g, '').toUpperCase() : null;
    if (asIsin && !isinIsValid(asIsin)) {
      out.innerHTML = `<p class="down">⚠ <b>${esc(asIsin)}</b> a le bon format mais une clé de
        contrôle incorrecte : il y a probablement une faute de frappe.</p>`;
      return;
    }

    out.innerHTML = '<p class="muted">Recherche…</p>';
    try {
      let res, isinCode = null, bestSymbol = null;
      if (asIsin) {
        const r = await Quotes.resolveIsin(asIsin);
        if (r.error && !(r.candidates || []).length) { out.innerHTML = `<p class="down">⚠ ${esc(r.error)}</p>`; return; }
        res = r.candidates || [];
        isinCode = asIsin;
        bestSymbol = r.best && r.best.symbol;
      } else {
        res = await Quotes.search(q);
      }
      if (!res.length) { out.innerHTML = '<p class="muted">Aucun résultat.</p>'; return; }

      out.innerHTML = `
        ${isinCode ? `<p class="small muted" style="margin:0 0 8px">ISIN valide · ${res.length}
           cotation${res.length > 1 ? 's' : ''} trouvée${res.length > 1 ? 's' : ''}, la première
           correspond à ta place privilégiée.</p>` : ''}
        <!-- Un bouton, et non un menu de destinations : chercher un titre,
             c'est en ajouter un. Une ligne deja detenue se complete depuis sa
             fiche, ou la verification de l'ISIN pose le symbole ; deux portes
             sur le meme geste, c'est le defaut que ce projet defait ailleurs.
             Deux colonnes, pas trois : la place et le type descendent sous le
             nom, ou ils se lisent aussi bien. Le tableau n'a pas de conteneur
             defilant et la page coupe net ce qui depasse, donc une troisieme
             colonne rendrait l'action inatteignable a 343 px.
             (Aucun guillemet oblique ici : ce commentaire vit dans un
             littéral de gabarit, un backtick y fermerait la chaîne.) -->
        <table class="table-serree cols-nom-action"><tbody>${res.map(r => `
        <tr>
          <td class="name">${esc(r.symbol)}${r.symbol === bestSymbol ? ' <span class="tag">retenu</span>' : ''}
              <span class="sub">${esc(r.name)}${[r.exchange, r.type].filter(Boolean).length
                ? ` · ${esc([r.exchange, r.type].filter(Boolean).join(' · '))}` : ''}</span></td>
          <td><button class="btn sm assign-target" data-symbol="${esc(r.symbol)}"
                      data-nom="${esc(r.name || '')}" data-isin="${esc(isinCode || '')}"
                      data-type="${esc(r.type || '')}"
                      title="${trad('Créer une ligne de titres pour ce résultat')}">+ ${trad('Ajouter')}</button></td>
        </tr>`).join('')}</tbody></table>`;

      out.querySelectorAll('.assign-target').forEach(bouton => {
        bouton.addEventListener('click', async () => {
          /* Le cours du titre choisi, avant d'ouvrir la fenetre.
             Elle demande un prix de revient « par titre », et sans la devise ni
             un ordre de grandeur la question se pose a l'aveugle : la recherche
             de Yahoo ne rend ni l'un ni l'autre. Les chercher pour les vingt-cinq
             resultats couterait vingt-cinq appels pour un seul qu'on retient ;
             sur celui qu'on vient de designer, c'en est un.
             L'echec n'empeche rien : la fenetre s'ouvre sans le repere plutot
             que de refuser d'ouvrir parce que la passerelle dort. */
          bouton.disabled = true;
          const cote = await coteDuSymbole(bouton.dataset.symbol);
          bouton.disabled = false;

          /* Le titre doit atterrir quelque part, et pas n'importe ou : la
             categorie se deduit du type renvoye par la recherche, et le compte
             se limite a ceux qui peuvent la porter.

             Le compte se demande en premier : c'est la question a laquelle on
             sait repondre en arrivant — j'achete ce titre sur tel compte — la
             ou la classe et le role sont des reglages de rangement. La liste
             des comptes depend malgre tout de la classe, et se refait quand on
             la change. */
          const cat = classeDuType(bouton.dataset.type);
          const v = await askForm({
            titre: bouton.dataset.nom || bouton.dataset.symbol,
            sous: trad('Où ranger cette ligne ?'),
            ok: 'Créer la ligne',
            lie: { de: 'assetClass', vers: 'account', options: comptesPourListe,
                   vide: 'aucun compte ne peut porter cette classe' },
            champs: [
              { cle: 'account', label: 'Compte', type: 'liste', options: comptesPourListe(cat),
                valeur: compteVisePourAjout || defaultHoldingAccount(),
                aide: trad('limité aux comptes compatibles') },
              /* La quantite et le prix paye se demandent ici, sous le compte,
                 parce qu'ils font partie du meme geste : j'ai achete tant de
                 titres, a tel prix, sur tel compte. Les laisser a zero
                 obligeait a rouvrir la fiche juste apres, pour la seule ligne
                 qu'on vienne de creer. Zero reste accepte : on cree aussi une
                 ligne avant de l'acheter, et le champ n'est pas requis. */
              { cle: 'qty', label: 'Quantité', type: 'nombre', exemple: '0',
                aide: trad('laisse zéro si tu n’as pas encore acheté') },
              /* La devise se lit sur l'intitule, pas dans une bulle : c'est
                 l'unite du nombre qu'on tape, et une unite se pose contre le
                 champ. Le cours du jour sert de repere en fond de champ, sans
                 jamais remplir : un prix de revient est ce qu'on a paye, et
                 pre-remplir avec le cours d'aujourd'hui donnerait une valeur
                 fausse a l'air officiel, que personne ne relit. */
              { cle: 'buyPrice', type: 'nombre',
                label: cote && cote.currency
                  ? `${trad('Prix de revient unitaire')} (${cote.currency})`
                  : trad('Prix de revient unitaire'),
                exemple: cote ? String(cote.price) : '0',
                aide: cote
                  ? `${trad('cours du jour')} ${fmtCur(cote.price, cote.currency)} · ${
                      trad('ce que tu as payé peut être différent')}`
                  : trad('le prix payé par titre, dans la devise du titre') },
              { cle: 'assetClass', label: trad('Classe d’actif'), type: 'liste',
                options: OPTIONS_CLASSE, valeur: cat,
                aide: bouton.dataset.type ? `déduite de ${guill(bouton.dataset.type)}` : '' },
              { cle: 'role', label: 'Rôle', type: 'liste', options: OPTIONS_ROLE,
                valeur: 'satellite', aide: trad('coeur de portefeuille ou pari satellite') },
              /* Proposee au jour, parce qu'on cree une ligne le jour ou l'on
                 achete — et changeable, parce qu'on la cree aussi en installant
                 l'application sur un portefeuille deja constitue. Le champ est
                 pose ici plutot que laisse a la fiche : deux chiffres en
                 dependent, et l'un d'eux se trompe le jour meme si personne ne
                 repond. */
              { cle: 'dateAchat', label: trad('Date d’achat'), type: 'date', valeur: todayISO(),
                aide: DATE_ACHAT_AIDE },
            ],
          });
          if (!v) return;
          if (!v.account) { toast(trad('Ouvre d’abord un compte qui accepte cette catégorie')); return; }
          compteVisePourAjout = null;      // la visee ne vaut que pour ce geste
          Store.state.positions.push({
            id: 'p' + Date.now(), name: '', isin: '', symbol: '', currency: 'EUR',
            /* `fxBuy: null` et non 1 : la devise n'est pas encore choisie, donc
               le taux d'achat n'est pas connu. Un 1 pose ici se figeait pour
               toujours, et un titre en dollars comptait ensuite son prix de
               revient sans conversion. */
            qty: v.qty, buyPrice: v.buyPrice, price: 0, fx: 1, fxBuy: null,
            assetClass: v.assetClass, role: v.role, account: v.account, manual: false,
            dateAchat: v.dateAchat || '',
          });
          const i = Store.state.positions.length - 1;
          const p = Store.state.positions[i];

          p.symbol = bouton.dataset.symbol;
          if (bouton.dataset.isin) p.isin = bouton.dataset.isin;
          if (bouton.dataset.nom) p.name = bouton.dataset.nom;
          Store.save();
          toast(`${p.name || p.symbol} ${trad('ajouté')}`);
          render();

          // complète devise, cours et taux de change
          await lookupSymbol(i);
        });
      });
    } catch (e) {
      out.innerHTML = `<p class="down">${esc(e.message)}</p>`;
    }
  }

  btn.addEventListener('click', run);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

/* ------------------------------------------------------------
   Allocation
   ------------------------------------------------------------ */
/* Les poches du patrimoine, telles que la page Allocation les montre : une
   entrée par poche non vide, dans l'ordre et avec les libellés de la légende
   du graphique d'évolution. Une seule définition pour le tableau et pour le
   camembert — ils listaient chacun « Bourse, Non coté, Disponible » en dur, et
   oubliaient donc la crypto et l'immobilier depuis que `gAff` leur a donné
   leur propre poche. Le tableau totalisait 29 985 € de lignes sous un total
   de 179 985 € : 150 000 € d'immobilier manquaient à l'appel. */
function pochesPatrimoine() {
  const t = nowTotals();
  /* Le cash qui dort sur un PEA ou un CTO compte dans les liquidités, comme
     sur l'accueil. La ligne le précise : ces euros sont bien disponibles,
     mais ils ne sont pas du même cash que celui du compte courant — ils
     attendent d'être placés. */
  const attente = num(patrimoine().investir);
  return SERIES_PATRIMOINE()
    .filter(s => Math.abs(num(t[s.key])) > 0.005)
    .map(s => ({ key: s.key, label: s.label, color: s.color,
                 /* Formulation courte, et sans centimes : sur un écran de
                    téléphone, la colonne des libellés impose sa largeur aux
                    deux autres. « en attente d'investissement » la poussait
                    à 171 px et cassait « 150 000,00 € » en deux lignes.
                    « À investir » est déjà le nom de cette poche ailleurs
                    dans la page — même mot, même argent. */
                 note: s.key === 'cash' && attente > 0.005
                   ? `${trad('dont')} ${fmtEUR0(attente)} ${trad('à investir')}` : '',
                 value: num(t[s.key]), pct: t.brut ? num(t[s.key]) / t.brut * 100 : 0 }));
}

/* Zone, secteur et type de compte n'ont pas de couleur intrinsèque : leurs
   parts sont numérotées, pas classées. La teinte vient donc du rang — mais elle
   doit être attribuée au même endroit pour le tableau et pour le camembert,
   sinon la pastille d'une ligne ne désigne pas sa part. La vue et le montage
   appellent cette fonction sur la même liste, dans le même ordre : ils
   obtiennent les mêmes couleurs sans avoir à se les transmettre. */
const teinterParRang = items =>
  items.map((x, i) => ({ ...x, couleur: x.couleur || x.color || `var(--series-${(i % 8) + 1})` }));

function viewAllocation() {
  const t = nowTotals();
  /* Repartir zero entre sept classes donne sept fois zero, et trois tableaux
     vides sous trois camemberts absents. */
  if (!(patrimoine().brut > 0.005)) {
    return pageAvantDonnees('Une répartition dit où est ton argent : dans quelles classes '
      + 'd’actifs, chez quels intermédiaires. Elle attend donc que tu déclares au moins un '
      + 'compte ou un placement.');
  }
  const poches = pochesPatrimoine();
  /* Sans la ligne des credits : la carte compte en brut, comme son camembert.
     Le pied les porte, une fois, pour donner le net. */
  const byAsset = allocationByAsset({ credits: false });
  const byAcct = allocationByAccount();
  const byType = teinterParRang(byAccountType());

  /* La pastille rattache chaque ligne à sa part du camembert juste au-dessus.
     Sans elle, il fallait comparer des pourcentages pour savoir quelle tranche
     était laquelle — un tableau et un graphique qui parlent des mêmes données
     sans jamais se désigner l'un l'autre. */
  const tbl = (items, totalLabel, total) => `
    <table>
      <thead><tr><th>${trad('Ligne')}</th><th>${trad('Montant')}</th><th>%</th></tr></thead>
      <!-- escMontant et non esc : cette note porte un montant, « dont 1 856 € à
           investir », et un montant masqué est une balise SVG. Échappée comme du
           texte, elle s'imprimait en clair — la ligne « Liquidités » d'Allocation
           affichait cent caractères de balisage au lieu de son sous-titre.
           C'est le seul endroit du fichier où une note mêle du texte et un
           montant ; les autres portent de la prose ou une saisie, et gardent
           l'échappement strict, qui doit rester la règle.
           (Aucun accent grave dans ce commentaire : il vit dans un littéral de
           gabarit, où un backtick referme la chaîne.) -->
      <tbody>${items.map(i => `<tr><td class="name">${pastilleTeinte(i.couleur || i.color)}${esc(i.label)}
        ${i.note ? `<span class="sub">${escMontant(i.note)}</span>` : ''}</td>
        <td>${fmtEUR(i.value)}</td>
        <td class="muted">${fmtPct(i.pct)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>${esc(totalLabel)}</td><td>${fmtEUR(total)}</td><td></td></tr></tfoot>
    </table>`;

  /* Trois tuiles vivaient ici : « Total de vos avoirs », « Total
     investissements », « Argent disponible ». Elles ne composaient rien —
     la première contenait les deux autres — et surtout il en manquait une :
     le cash posé chez un courtier n'est ni du cash de vie ni de l'investi.
     Il n'apparaissait donc nulle part. Les deux parts affichées totalisaient
     98,97 % d'un patrimoine dont elles prétendaient rendre compte.

     Même axe pour les trois lignes maintenant — non pas la classe d'actif,
     mais l'état de l'argent : engagé, en attente, libre — et la somme fait
     100 %. Le total passe au pied, où il ne concurrence plus ses propres
     parts. C'est la liste de l'accueil, à l'identique : une grille de tuiles
     laisse toujours un impair, une liste se lit pareil à trois ou à six. */
  /* Trois teintes franchement distinctes, et pas voisines dans la palette :
     `series-7` (#00a5c3) et `series-2` (#00ab92) sont deux cyans que rien ne
     sépare sur une pastille de 8 px. L'ambre est déjà, dans l'application, la
     couleur de ce qui attend une action — c'est le point du menu quand un
     relevé manque. Il dit ici la même chose d'un argent qui ne travaille pas
     encore. */
  /* Le cash se decompose ici comme partout ailleurs : les quatre poches
     d'AFFECTATIONS, jamais un agregat. Cette carte agregeait courant +
     precaution + projet sous « Argent disponible », un montant de 3 270 EUR
     que l'accueil ne connaissait pas et qui portait presque le nom d'une de
     ses propres parts, « Cash disponible » a 3 250 EUR. Vingt euros d'ecart et
     deux ecrans qui se contredisent : c'est en grossissant l'epargne de
     precaution que la contradiction devient visible, donc trop tard.
     Les poches vides sont ecartees par le filtre plus bas, comme avant. */
  const teintesPoche = { courant: 'var(--series-1)', precaution: 'var(--series-7)',
                         projet: 'var(--series-5)', investir: 'var(--series-4)' };
  const disponibilite = [
    { label: BASES.place.nom, value: t.invested, couleur: 'var(--series-2)', apercu: 'investiTotal' },
    /* Chaque poche ouvre SA poche. Les trois lignes de cash pointaient sur la
       fiche « Liquidites » sans argument : on cliquait une ligne de 20 EUR
       d'epargne de precaution et on obtenait les 5 126 EUR des quatre poches.
       Le total etait juste, la question posee n'etait pas celle a laquelle on
       repondait. */
    ...pochesLiquidites().map(p => ({
      label: p.nom, value: p.value, couleur: teintesPoche[p.cle] || 'var(--series-1)',
      apercu: p.cle === 'investir' ? 'cashInvestir' : 'cash',
      arg: p.cle === 'investir' ? '' : p.cle,
    })),
  ].filter(x => Math.abs(num(x.value)) > 0.005)
   .map(x => ({ ...x, pct: t.brut ? num(x.value) / t.brut * 100 : 0 }));

  return `
  <!-- Le renvoi vers l'autre onglet est parti.

       Il disait « pour fixer des cibles, va dans X », ou X etait lu dans la table
       des sous-onglets par son index, le second. L'ordre des onglets a change
       depuis, et l'index n'a pas suivi : la phrase invitait a aller dans
       « Patrimoine » depuis Patrimoine. Encore un index ecrit a la main a cote de
       la liste qui fait foi, et le defaut ne se voit qu'a la lecture. -->

  <!--       Elle ne dit pas la meme chose, et c'est voulu. Sur Cible, le perimetre
       surprend : un livret A n'y compte pas. Ici rien ne surprend, tout est
       compte — le repeter serait redire le sous-titre de la barre du haut, qui
       annonce deja « tout ce que tu possedes ». -->
  <!--    « immobilier et non cote compris » est devenu « non cote compris ». Deux
   mots de moins, et le « ? » cesse de tomber seul sur la ligne suivante. Le
   dernier mot et le « ? » sont colles par la classe sans-veuve, en
   white-space nowrap : c'est ce qui garantit que le rond ne s'isole pas,
   quelle que soit la largeur. Raccourcir la phrase seul ne le garantissait
   pas, il aurait suffi d'un montant plus long. (Aucun guillemet oblique ici :
   ce commentaire vit dans un litteral de gabarit, un backtick y fermerait la
   chaine.)-->
  <p class="perimetre perimetre-tete">${trad('Ici,')} <b>${trad('tout est compté')}</b> :
    ${fmtEUR0(t.brut)}, <span class="sans-veuve">${trad('non coté compris')}${aide(trad("Trois bases sur cette page, et c’est normal : elles répondent à trois questions. « Tes avoirs » est tout ce que tu possèdes. « Patrimoine net » retire tes crédits. « Ce qui est placé » écarte les liquidités, parce qu’une répartition par enveloppe ne dit rien de l’argent qui dort sur un compte courant. La mention grise en tête de chaque carte donne la sienne, avec son montant."))}.</span></p>

  <div class="card repart">
    ${disponibilite.map(x => `
      <button type="button" class="repart-ligne" data-action="apercu"
              data-apercu="${esc(x.apercu)}"${x.arg ? ` data-arg="${esc(x.arg)}"` : ''}
              title="${trad('Voir le détail de')} ${esc(trad(x.label))}">
        <span class="repart-haut">
          <span class="dot" style="background:${x.couleur}"></span>
          <span class="repart-nom">${esc(trad(x.label))}</span>
          <b>${fmtEUR(x.value)}</b>
          <span class="repart-pct">${fmtPct(x.pct, 1)}</span>
        </span>
        <span class="repart-barre"><i style="width:${x.pct.toFixed(1)}%;background:${x.couleur}"></i></span>
      </button>`).join('')}
    <dl class="kv repart-pied">
      <dt>${BASES.avoirs.nom}<span class="sub">${trad('la base des pourcentages ci-dessus')}</span></dt>
        <dd>${fmtEUR(t.brut)}</dd>
      ${t.dettes ? `<dt>${trad('Crédits en cours')}${aide(trad("Le capital qu’il te reste à rembourser. Chaque mensualité le réduit, donc ton patrimoine net monte d’autant, même si la valeur de tes biens ne bouge pas."))}</dt>
        <dd class="dette">−${fmtEUR(t.dettes)}</dd>
        <dt><b>${trad('Patrimoine net')}</b></dt><dd><b>${fmtEUR(t.net)}</b></dd>` : ''}
    </dl>
  </div>

  <!-- Deux cartes, deux questions, deux bases. Et une seule base par carte.

       Il y en avait quatre. « Allocation par actif » comptait en net, « Répartition »
       en brut : le meme axe, deux granularites, et surtout le meme montant sous
       deux noms differents tant qu'aucun credit n'existe — ce qui se lit comme une
       incoherence alors que les deux etaient justes. Le jour ou un credit parait,
       elles divergent sans que rien n'explique pourquoi. « Type de compte » et
       « Comptes » etaient la meme paire sur l'axe du contenant, avec deja la meme
       base.

       Une carte porte donc un axe, du gros grain au detail, sous une base unique
       annoncee une fois. Les credits redescendent au pied, la ou ils ne
       concurrencent plus les parts qu'ils ne composent pas. -->
  <div class="card" data-anchor="actifs">
    <!-- Le titre nomme l'axe de la repartition, et non la question posee a voix
         haute : « Dans quoi c'est reparti » redoublait « c'est » et sonnait
         familier a cote du reste. Le sous-titre dit deja la base en euros. -->
    <div class="card-head"><h2>${trad('Par classe d’actif')}</h2>
      <span class="hint">${mentionBase(BASES.avoirs, t.brut)}</span></div>
    <div class="chart" id="aMacro"></div>
    ${tbl(poches, BASES.avoirs.nom, t.brut)}
    <!-- Le detail sous le gros grain, sans separateur de carte : c'est la meme
         question posee de plus pres, et la barre la plus longue du bas est une
         part de la plus grosse tranche du haut. -->
    <h3 class="sous-titre-carte">${trad('Ligne par ligne')}</h3>
    <div class="chart" id="aAsset"></div>
    ${t.dettes ? `<dl class="kv" style="margin-top:8px">
      <dt>${trad('Crédits en cours')}${aide(trad("Ils ne figurent pas dans les parts ci-dessus : une répartition dit où est ton argent, et un crédit n’est pas un endroit. Il se retire du total, ici, pour donner le patrimoine net."))}</dt>
        <dd class="dette">−${fmtEUR(t.dettes)}</dd>
      <dt><b>${trad('Patrimoine net')}</b></dt><dd><b>${fmtEUR(t.net)}</b></dd>
    </dl>` : ''}
  </div>

  <div class="card">
    <div class="card-head"><h2>${trad('Par compte')}</h2>
      <span class="hint">${mentionBase(BASES.place, t.invested)}</span></div>
    <div class="chart" id="aType"></div>
    ${tbl(byType, BASES.place.nom, byType.reduce((s, i) => s + i.value, 0))}
    <h3 class="sous-titre-carte">${trad('Compte par compte')}</h3>
    <div class="chart" id="aAcct"></div>
  </div>

  <!-- « Zone géographique » et « Secteur » vivaient ici. Ils agrégeaient des
       classements devinés du libellé de chaque ligne, faute de source gratuite
       donnant la composition d'un fonds — et l'agrégat mentait plus que
       chacune de ses parts : un MSCI World compte pour 100 % « Monde » et
       100 % « Diversifié » quand il est en réalité à ~70 % américain et très
       concentré en technologie. Deux camemberts qui répondent faux à la seule
       question qu'on leur pose valent moins que pas de camembert du tout.
       Le classement reste affiché sur la fiche de chaque ligne, où il est
       juste : « Amérique du Nord » pour un S&P 500 ne trompe personne. Le jour
       où on saura lire la composition réelle d'un fonds, ces cartes
       reviendront — les données du modèle sont intactes. -->`;
}

function mountAllocation() {
  Charts.rankedBars($('#aAsset'), { items: allocationByAsset({ credits: false }) });
  Charts.rankedBars($('#aAcct'), { items: allocationByAccount() });
  const t = nowTotals();
  Charts.donut($('#aMacro'), {
    height: 200, centerLabel: trad('Tes avoirs'), centerValue: t.brut,
    items: pochesPatrimoine().map(p => ({ label: p.label, value: p.value, color: p.color })),
  });
  /* Même liste, même fonction de teinte que dans la vue : les pastilles du
     tableau et les parts du camembert ne peuvent plus diverger. */
  const bt = teinterParRang(byAccountType());
  Charts.donut($('#aType'), {
    height: 200, centerLabel: trad('Bourse'),
    centerValue: bt.reduce((s, i) => s + i.value, 0),
    items: bt.map(x => ({ label: x.label, value: x.value, color: x.couleur })),
  });
}

/* ------------------------------------------------------------
   Rééquilibrage
   ------------------------------------------------------------ */
/* Ce que le partage socle / satellites apprend, en une phrase. Un tableau de
   deux lignes ne dit rien qu'on ne voie deja ; ce qui compte, c'est de quoi
   la part arbitrable est faite, « satellites 58 922 EUR » n'informe pas,
   « dont 93 % de bitcoin » informe. */
function diagnosticRoles(rr) {
  if (!rr.base) return '';
  const socle = rr.roles.find(x => x.cle === 'core');
  const sat = rr.roles.find(x => x.cle === 'satellite');
  /* La phrase nomme une classe : elle doit donc peser la classe entiere.
     `composition` est indexee par classe **et** par nature, si bien qu'« Actions
     en direct » et « Actions en fonds » y sont deux entrees ; prendre la
     premiere annoncait « 57 % actions » quand les actions faisaient 83 % des
     satellites — 2 437 EUR en direct sur 4 295, au lieu de 2 437 + 1 109. Le
     chiffre etait juste, son intitule mentait. On agrege par classe avant de
     chercher la plus grosse. */
  const parClasse = new Map();
  for (const p of (rr.composition.satellite || [])) {
    parClasse.set(p.classe, (parClasse.get(p.classe) || 0) + p.value);
  }
  const gros = [...parClasse].sort((a, b) => b[1] - a[1])[0];
  const partGros = gros && sat.value ? gros[1] / sat.value * 100 : 0;
  const phrases = [`${trad('Le')} ${ROLES.core.toLowerCase()} ${trad('représente')} <b>${fmtPct(socle.pct, 1)}</b> ${BASES.baseCibles.de}.`];
  if (gros && partGros >= 50) {
    phrases.push(`${trad('La part arbitrable est à')} <b>${fmtPct(partGros, 0)}</b> ${
      esc(gros[0].toLowerCase())}${trad(' : une seule classe en porte l’essentiel.')}`);
  }
  return `<p class="plan-phrase" style="font-size:13.5px">${phrases.join(' ')}</p>`;
}

function viewRebalance() {
  const r = rebalanceRows();
  const rr = rebalanceRoles();
  const per = perimetreReequilibrage();
  const tg = Store.state.targets;
  /* Une seule definition de la somme des cibles, dans le modele : elle sait
     descendre dans une classe decoupee par role, et elle ecarte les classes
     mises hors jeu. Trois copies vivaient ici et ailleurs, dont deux
     annoncaient zero des qu'une classe portait deux cibles. */
  const sumT = sommeCibles();

  /* Ce qui reste hors du rééquilibrage, nommé morceau par morceau. La liste
     était écrite en dur — « cash du quotidien, précaution, non coté » — et un
     studio de 150 000 € s'y ajoutait sans être cité, alors qu'il pesait plus
     que tout le reste réuni. Elle se calcule maintenant, donc elle reste vraie
     quoi qu'on détienne. Les trois parts totalisent exactement le montant
     annoncé : l'immobilier et le non coté vivent hors des comptes
     d'investissement, et le cash hors « à investir » aussi. */
  const dehorsDetail = (() => {
    const p = patrimoine();
    return [
      [trad('immobilier'), "d'immobilier", p.classes.immobilier],
      [trad('non coté'), 'de non coté', per.nonCote],
      /* Les noms viennent d'AFFECTATIONS, comme partout : cette liste ecrivait
         « cash du quotidien et precaution », un huitieme mot pour ces euros. */
      [`${AFFECTATION_LABEL.courant.toLowerCase()} ${trad('et')} ${AFFECTATION_LABEL.precaution.toLowerCase()}`,
       `de ${AFFECTATION_LABEL.courant.toLowerCase()} et d’${AFFECTATION_LABEL.precaution.toLowerCase()}`,
       p.courant + p.precaution + p.projet],
    ].filter(([, , v]) => v > 0.005);
  })();

  /* Profondeur libre : une classe decoupee porte sa cible en
     `classes.actions.core`, soit trois niveaux. L'ancienne version en lisait
     deux et rendait zero au troisieme. */
  const valeurCible = chemin =>
    num(chemin.split('.').reduce((o, k) => (o == null ? o : o[k]), tg));

  /* Le plan : ce qu'il faut vendre, ce qu'il faut acheter. Quand les cibles
     totalisent 100 %, les deux colonnes s'equilibrent au centime : une seule
     vente finance tout le reste. C'est la phrase que la page doit dire en
     premier, et elle etait jusqu'ici en bas, apres deux graphiques et trois
     tableaux. */
  /* `r.cash` vaut null quand la tresorerie est sortie du reequilibrage : elle
     ne figure alors ni dans les mouvements, ni dans la phrase « ta tresorerie
     disponible en couvre tant ». Trois lectures la supposaient presente, et la
     page tombait des qu'on la retirait. */
  const mouvements = r.classes.concat(r.cash ? [r.cash] : [])
    .filter(c => Math.abs(c.delta) >= 1);
  const alleger   = mouvements.filter(c => c.delta < 0).sort((x, y) => x.delta - y.delta);
  const renforcer = mouvements.filter(c => c.delta > 0).sort((x, y) => y.delta - x.delta);
  const totalVente = alleger.reduce((s, c) => s - c.delta, 0);
  const totalAchat = renforcer.reduce((s, c) => s + c.delta, 0);
  const equilibre = Math.abs(totalVente - totalAchat) < 1;
  const dispo = r.cash && r.cash.delta < 0 ? -r.cash.delta : 0;

  /* `dansLaPhrase()` est partie avec la phrase de tete de la carte : elle ne
     servait qu'a mettre un intitule de tableau au milieu d'une phrase, et il n'y
     a plus de phrase. Une fonction sans appelant est du code mort, et c'est la
     moitie qu'on oublie en retirant un affichage. */

  /* Meme raison que pour l'ecart des lignes : un mouvement a faire n'est ni une
     bonne ni une mauvaise nouvelle, et le rouge d'alerte sur « a placer »
     faisait de la moitie de ce plan une liste d'incidents. La couleur de la page
     porte les deux sens, le signe les distingue. */
  const listeMvt = (lignes, sens) => lignes.map(c =>
    `<li><b>${esc(c.label)}</b> <span class="montant-plan${sens > 0 ? ' renfort' : ''}">${
      sens > 0 ? '+' : '−'}${fmtEUR0(Math.abs(c.delta))}</span>
      <span class="muted">${trad('pour atteindre')} ${fmtPct(c.targetPct, 0)}</span></li>`).join('');

  /* Une ligne par classe, pas un tableau.
     Six colonnes ne tiennent pas dans 375 px : le tableau debordait de 109 px
     et la colonne la plus utile, l'ecart, sortait de l'ecran. Ici tout
     s'empile : intitule et montant sur une ligne, la jauge en dessous, la part
     et la cible sous elle. Rien ne defile lateralement, a aucune largeur.

     La jauge porte la part reelle en barre pleine et la cible en repere : on
     voit d'un coup de quel cote et de combien on s'ecarte, sans avoir a
     comparer deux nombres. */
  const ligneReeq = (row, key, base) => {
    const part = Math.max(0, Math.min(100, row.pct));
    const cible = Math.max(0, Math.min(100, row.targetPct));
    const ecartFait = Math.abs(row.delta) < 1;
    return `
    <li class="reeq-ligne">
      <div class="reeq-haut">
        <span class="reeq-nom">${esc(row.label)}</span>
        <span class="reeq-droite">
          <b class="reeq-val">${fmtEUR(row.value)}</b>
          <!-- Toute classe se retire, detenue ou non. Quand elle porte un
               encours, son montant quitte la base plutot que de disparaitre
               en silence : les pourcentages continuent de totaliser 100 %. -->
          ${key && key.startsWith('classes.') ? `
            <!--                 Le chevron est le seul pictogramme que personne n'a besoin
                 d'apprendre : ferme il annonce qu'il y a quelque chose dedans,
                 ouvert il annonce qu'on peut refermer. Il tourne d'un quart de
                 tour, comme celui des depliants de la page. En violet, parce que
                 c'est le seul outil de cette liste qui change la forme des
                 lignes et non un chiffre. -->
            ${row.classeParente
              /* Ligne de role : le chevron ouvert referme le groupe. Il figure
                 sur les deux lignes, chacune etant une poignee du meme groupe —
                 ne le mettre que sur la premiere aurait laisse la seconde sans
                 explication de sa presence. */
              ? `<button class="chevron-role ouvert" data-action="refusionner-classe"
                         data-cle="${esc(row.classeParente)}"
                         aria-expanded="true"
                         title="Refermer : une seule cible pour ${esc(row.labelClasse)}"
                         aria-label="Refermer les deux rôles de ${esc(row.labelClasse)}"
                         >›</button>`
              /* Classe entiere : elle se decoupe par role, mais seulement si
                 elle est reellement detenue dans les deux — sinon l'un des deux
                 roles serait une ligne morte a zero. */
              : (() => {
                  const pr = stockTotals().parClasseRole?.[key.split('.')[1]];
                  return pr && pr.core > 0.005 && pr.satellite > 0.005
                    ? `<button class="chevron-role" data-action="decouper-classe"
                               data-cle="${esc(key.split('.')[1])}"
                               aria-expanded="false"
                               title="Ouvrir en deux cibles : ${esc(row.label)} core et satellite"
                               aria-label="${trad('Séparer {c} en core et satellite').replace('{c}', esc(row.label))}"
                               >›</button>` : '';
                })()}
            <button class="btn icon xs" data-action="retirer-classe-cible"
                    data-cle="${esc(key.split('.')[1])}"
                    title="${trad('Sortir {c} du rééquilibrage').replace('{c}', esc(row.labelClasse || row.label))}">✕</button>` : ''}
          <!-- La tresorerie se retire aussi. Quelqu'un qui place tout le jour
               meme garde une ligne a zero sous un intitule de groupe, pour rien.
               Meme action que les classes : elle passe par la meme liste
               d'exclusions, donc le meme chemin de retour. -->
          ${key === CLE_TRESORERIE ? `
            <button class="btn icon xs" data-action="retirer-classe-cible"
                    data-cle="${esc(CLE_TRESORERIE)}"
                    title="${trad('Sortir {c} du rééquilibrage').replace('{c}', esc(row.label))}">✕</button>` : ''}
        </span>
      </div>
      <!-- La jauge ouvre les placements qu'elle compte.
           « Actions core, +1 200 EUR a renforcer » laissait sans reponse la
           seule question qui reste : renforcer laquelle. Il fallait aller dans
           Marches et lire le role ligne par ligne. La barre est donc un bouton,
           et chaque ligne de la fiche ouvre la sienne.

           La tresorerie mene a ses poches de cash : elle n'est pas faite de
           positions, sa fiche existe deja ailleurs et c'est celle-la.

           L'attribut aria-hidden a saute avec la souris : une barre qui s'ouvre
           doit s'annoncer. Elle porte donc son intitule complet, la part et la
           cible etant deja lues juste en dessous par le lecteur d'ecran. -->
      ${(() => {
        const jauge = `
          <i class="reeq-reel ${row.delta > 0 ? 'sous' : row.delta < 0 ? 'sur' : 'ok'}" style="width:${part.toFixed(2)}%"></i>
          <!-- Le repere est dessine meme a zero : « cible 0 % » est une decision,
               son absence se lirait comme un oubli. -->
          <i class="reeq-cible" style="left:${cible.toFixed(2)}%"></i>`;
        const ouvre = key === CLE_TRESORERIE
          ? { apercu: 'cashCible', arg: 'investir', quoi: 'les poches de cash' }
          : key && positionsDeCible(key)
            ? { apercu: 'cible', arg: key, quoi: 'les placements' }
            : null;
        return ouvre
          ? `<button type="button" class="reeq-jauge ouvrable" data-action="apercu"
                     data-apercu="${esc(ouvre.apercu)}" data-arg="${esc(ouvre.arg)}"
                     aria-label="Voir ${ouvre.quoi} de ${esc(row.label)}"
                     >${jauge}</button>`
          : `<div class="reeq-jauge" aria-hidden="true">${jauge}</div>`;
      })()}
      <div class="reeq-bas">
        <span class="reeq-part">${fmtPct(row.pct, 1)}
          ${key ? `<span class="muted">· cible</span>
            <select class="cible-champ" data-path="targets.${key}" data-type="num"
                    aria-label="Cible pour ${esc(row.label)}">${
              paliersCible(valeurCible(key)).map(v =>
                `<option value="${v}" ${v === valeurCible(key) ? 'selected' : ''}>${v}</option>`).join('')
            }</select><span class="u">%</span>`
                : `<span class="muted">· cible ${fmtPct(row.targetPct, 0)}</span>`}</span>
        <!-- L'ecart dit ce qu'il y a a faire, pas si c'est bien ou mal.
             Il portait le vert des hausses et le rouge des baisses : « −1 086
             EUR a placer » s'affichait donc en rouge d'alerte, alors qu'avoir de
             la tresorerie a placer n'est pas un probleme, et « a alleger » non
             plus. Les deux sont des arbitrages, un seul poids leur suffit. La
             couleur de la page les porte, le signe et le verbe disent le sens. -->
        <span class="reeq-ecart ${ecartFait ? 'muted' : 'a-faire'}">${ecartFait
          ? trad('à la cible')
          /* Le montant se detache du verbe pour porter sa couleur seul : vert
             quand il faut renforcer — on ajoute, c'est le sens de la croissance
             et le geste qu'on vient chercher ici — neutre quand il faut alleger
             ou placer, car ni l'un ni l'autre n'est une mauvaise nouvelle. Le
             verbe reste gris dans les deux cas : c'est une consigne, pas un
             chiffre. */
          : `<b class="${row.delta > 0 ? 'renfort' : ''}">${
                row.delta > 0 ? '+' : '−'}${fmtEUR0(Math.abs(row.delta))}</b> ${
              row.delta > 0 ? trad('à renforcer')
              /* Réduire de la trésorerie, c'est la placer, pas l'alléger. */
              : row.cle === 'cashToInvest' ? trad('à placer') : trad('à alléger')}`}</span>
      </div>
    </li>`;
  };

  return `
  <!-- Le perimetre en premier, avant meme le plan.

       Cette phrase vivait dans la troisieme carte, sous « Allocation par
       classe ». Or la premiere chose que la page dit est « Place 1 076 EUR de
       tresorerie » : un ordre, donne sans avoir precise sur quel argent il
       porte. Un lecteur qui a 20 000 EUR sur un livret A se demande s'ils sont
       comptes — ils ne le sont pas, et il l'apprenait trois cartes plus bas, ou
       jamais.

       Elle porte le montant, parce qu'un perimetre nomme sans chiffre laisse
       encore chercher. Et elle ne vaut que pour cet onglet : « Patrimoine »
       couvre tout, ses cartes annoncent chacune leur base. -->
  <!--       « Liquides » : le PER est dans le perimetre et c'est la chose la moins
       liquide qu'on puisse detenir. « Arbitrable » : le non cote de Trade
       Republic s'arbitre tres bien, le mot ne separe rien. « Ce qui a un
       cours » separe juste, mais alourdit une phrase qui se lit deja bien.

       Le libelle reste donc celui d'origine, et c'est la bulle qui porte la
       precision — ce qui est sa fonction. Le vrai critere, pour memoire : le
       perimetre est celui de stockTotals(), les lignes de marche. Une cible se
       mesure contre un prix qu'on n'a pas fixe soi-meme ; la valeur d'une part
       non cotee est celle qu'on saisit, il n'y a rien contre quoi la
       rebalancer.
       (Aucun guillemet oblique ici : ce commentaire vit dans un litteral de
       gabarit, un backtick y fermerait la chaine.) -->
  <p class="perimetre perimetre-tete">${trad('Ces cibles ne portent que sur')}
    <b>${trad('tes comptes d’investissement')}</b> ${trad('et leur trésorerie,')}
    ${fmtEUR0(r.base)}${aide(trad("PEA, compte-titres, assurance-vie, PER, portefeuille de cryptomonnaies, avec leurs lignes et l’argent qui y attend d’être placé. Ton cash du quotidien, ton épargne de précaution, ton immobilier et ton non coté n’en font pas partie : ils ne s’arbitrent pas d’un clic, et les mélanger donnerait des pourcentages qu’aucune décision ne peut suivre. L’onglet Patrimoine, lui, montre tout."))}.</p>

  <!-- Ce qu'il y a a faire, avant tout le reste. -->
  <div class="card plan">
    <div class="card-head"><h2>${trad('Ce qu’il y a à faire')}${aide(trad("Les mouvements qui ramènent chaque classe à sa cible. Quand tes pourcentages totalisent 100 %, ce qu’il faut vendre finance exactement ce qu’il faut acheter."))}</h2>
      <span class="hint">${mouvements.length ? `${mouvements.length} ${mouvements.length > 1 ? trad('mouvements') : trad('mouvement')}` : trad('rien à faire')}</span></div>
    ${!mouvements.length
      ? `<p class="empty">${trad('✓ Chaque classe est à sa cible. Rien à arbitrer.')}</p>`
      : `
      <!-- La phrase de tete est partie. Elle disait « Vends 1 956 EUR et
           redeploie-les : 1 800 EUR en actions core, 156 EUR en metaux
           precieux » — c'est-a-dire les deux listes qui la suivent
           immediatement, recopiees dans une autre grammaire. « On s'en fout,
           c'est ecrit juste en dessous ce qu'il y a a faire. »

           C'est le defaut que ce projet defait partout : une liste se derive,
           elle ne se recopie pas. Ici la copie etait meme automatique, donc
           toujours d'accord avec sa source — elle ne coutait pas un risque de
           divergence, seulement le double de lecture pour la meme information,
           en tete de la carte, a chaque visite. -->
      <div class="plan-cols">
        ${alleger.length ? `<div>
          <h3>${alleger.every(c => c.cle === 'cashToInvest') ? trad('À placer') : trad('À alléger')}</h3>
          <ul>${listeMvt(alleger, -1)}</ul>
        </div>` : ''}
        ${renforcer.length ? `<div>
          <h3>${trad('À renforcer')}</h3>
          <ul>${listeMvt(renforcer, 1)}</ul>
          <!-- Inutile de préciser « sans rien vendre » quand la seule ligne à
               réduire est déjà la trésorerie : il n'y a alors aucune vente dont
               se dispenser, et l'intitulé d'à côté dit « À placer », pas
               « À alléger ». -->
          ${dispo && !alleger.every(c => c.cle === 'cashToInvest')
            ? `<p class="hint" style="margin:8px 0 0">${trad('Ta trésorerie disponible en couvre')} ${fmtEUR0(Math.min(dispo, totalAchat))} ${trad('sans rien vendre.')}</p>` : ''}
        </div>` : ''}
      </div>
      ${equilibre ? '' : `<p class="hint" style="margin:12px 0 0">
        ${trad('Ventes et achats ne s’équilibrent pas')} (${fmtEUR0(totalVente)} ${trad('contre')} ${fmtEUR0(totalAchat)})
        ${trad('parce que tes cibles totalisent')} ${sumT} % ${trad('et non 100 %.')}</p>`}`}
  </div>

  ${sumT === 100 ? '' : `
  <div class="note" style="background:color-mix(in oklab, var(--${sumT > 100 ? 'critical' : 'warning'}) 12%, var(--surface-1));
       border-color:color-mix(in oklab, var(--${sumT > 100 ? 'critical' : 'warning'}) 40%, transparent)">
    ${sumT > 100 ? '⚠' : 'ⓘ'}
    <span><b>Tes cibles totalisent ${sumT} %${sumT > 100 ? `, soit ${sumT - 100} % de trop` : `, il en manque ${100 - sumT}`}.</b>
    ${sumT > 100
      ? `Additionnés, les montants cibles demandent ${fmtEUR0(r.base * sumT / 100)} alors que tu as ${fmtEUR0(r.base)}.`
      : `Les ${100 - sumT} % restants ne sont attribués à aucune classe.`}</span>
  </div>`}

  <!-- Etage 1 : dans quoi l'argent est place. -->
  <div class="card">
    <!-- Le pave de perimetre faisait quatre a six lignes avant le premier
         chiffre, et il repetait ce que le pied de carte chiffre deja. Il ne
         reste que la phrase qui repond a « de quoi parle cette page ». Le
         detail — composition du perimetre, montants dehors, traitement du non
         cote — descend dans l'infobulle du titre, qui existait deja : c'est la
         qu'on va chercher une precision, pas en haut d'une carte. -->
    <div class="card-head"><h2>${trad('Allocation par classe')}${aide(`${trad('L’allocation stratégique : quelle part du portefeuille dans chaque classe d’actif. C’est la première décision, celle qui pèse le plus sur le résultat. Modifie une cible dans le champ, la jauge et le plan suivent.')}

${trad('Le périmètre : tes comptes d’investissement (PEA, compte-titres, assurance-vie, PER, portefeuille crypto), avec leurs lignes et leur trésorerie à investir.')} ${
      per.montantDehors > 0
        ? `${fmtEUR0(per.montantDehors)} ${trad('restent dehors, soit')} ${dehorsDetail
             .map(([, phrase, v]) => `${fmtEUR0(v)} ${trad(phrase)}`).join(', ')}.${
           per.nonCote > 0 ? ` ${trad('Le non coté se suit en lignes de compte et non en lignes de marché : il se lit dans l’onglet')} ${SOUS_ONGLETS.allocation[0][1]}.` : ''}`
        : trad('Tout ton patrimoine y est.')}`)}</h2>
      <span class="hint">${mentionBase(BASES.baseCibles, r.base)}</span></div>
    <!-- La phrase de perimetre est partie en tete de page : elle repondait ici a
         une question qu'on se posait deux cartes plus haut. -->
    ${per.exclues.length ? `<p class="perimetre exclues">
      Sorties du rééquilibrage à ta demande :
      ${per.exclues.map(x => `<button type="button" class="mois-lien" data-action="reintegrer-classe"
          data-cle="${esc(x.cle)}" title="Remettre ${esc(x.label)} dans le rééquilibrage"
          >${esc(x.label)}${x.value ? ` (${fmtEUR0(x.value)})` : ''}</button>`).join(', ')}.
      Clique dessus pour les remettre.</p>` : ''}
    ${per.horsAtteinte.length ? `<div class="note" style="margin:0 0 12px;
         background:color-mix(in oklab, var(--warning) 12%, var(--surface-1));
         border-color:color-mix(in oklab, var(--warning) 40%, transparent)">⚠ <span>
      <b>${per.horsAtteinte.map(h => esc(h.label)).join(' et ')} :
      cible impossible à atteindre ici.</b>
      Tu en détiens ${per.horsAtteinte.map(h => fmtEUR0(h.montant)).join(' et ')},
      mais sur un compte hors de cette base. La jauge restera à zéro
      quoi que tu achètes. Mets sa cible à 0, ou suis cette classe depuis Allocation.
    </span></div>` : ''}
    <!-- La tresorerie se lisait au meme niveau qu'Actions et Metaux precieux,
         comme si « du cash » etait une classe d'actif de plus. Ce n'en est pas
         une : c'est ce qui n'est pas encore place, et sa cible ne dit pas la
         meme chose — 5 % d'actions est une conviction, 5 % de cash est une
         reserve. Deux intitules de groupe et un filet suffisent a le dire, sans
         toucher a un seul calcul : les pourcentages et les cibles sont ceux
         d'avant, la somme fait toujours la base. -->
    <ul class="reeq">
      <li class="reeq-groupe">${trad('Classes d’actif')}</li>
      ${r.classes.map(c => ligneReeq(c, c.cle)).join('')}
      <!--    Le bouton vivait dans l'en-tete, ou il s'est perdu des que la mention de
   base l'a fait passer sur deux lignes : 79 px, et un bouton pousse hors du
   regard. Il est ici, sous la liste, la ou l'on constate qu'une classe
   manque.-->
      <!-- Sortie, la tresorerie n'a plus ni ligne ni intitule de groupe : un
           titre au-dessus de rien se lirait comme une panne. Elle se remet
           depuis la phrase de perimetre, comme une classe. -->
      ${r.cash ? `<li class="reeq-groupe reeq-groupe-suite">${trad('Trésorerie')}</li>
      ${ligneReeq(r.cash, CLE_TRESORERIE)}` : ''}
    </ul>
    <button class="btn sm ghost" data-action="ajouter-classe-cible"
            style="margin-top:12px">${trad('+ Suivre une classe')}</button>
    <dl class="kv reeq-pied">
      <dt>${BASES.placeBourse.nom}</dt><dd>${fmtEUR(r.invested.value)} <span class="muted">· ${fmtPct(r.invested.pct, 1)}</span></dd>
      <dt>${BASES.baseCibles.nom}<span class="sub">${trad('base des pourcentages ci-dessus')}</span></dt><dd>${fmtEUR(r.base)}</dd>
      <!-- « Hors perimetre » nommait ces euros par ce qu'ils ne sont pas, et
           les laissait sans destination : on apprenait qu'un tiers du patrimoine
           echappait a cette page sans savoir ou le retrouver. La ligne dit
           maintenant ce qu'ils sont, et mene la ou ils se lisent. -->
      ${per.montantDehors > 0 ? `<dt class="muted">${trad('Reste de')} ${BASES.avoirs.nom.toLowerCase()}${trad(', non arbitrable')}<span class="sub">${
        esc(dehorsDetail.map(([lib]) => lib).join(' · '))}${trad(', suivis dans l’')}<button type="button"
          class="mois-lien" data-action="sous-onglet" data-route="allocation"
          >${trad('onglet')} ${SOUS_ONGLETS.allocation[0][1]}</button></span></dt>
        <dd class="muted">${fmtEUR(per.montantDehors)}</dd>
      <dt>${BASES.avoirs.nom}</dt><dd>${fmtEUR(per.brut)}</dd>` : ''}
    </dl>
  </div>

  <!-- Etage 2 : pourquoi tu le detiens. Un sous-niveau du precedent, pas un
       concurrent : le pourcentage se lit sur l'investi. -->
  <div class="card">
    <div class="card-head"><h2>${ROLES.core} ${trad('et satellites')}${aide(trad("À l’intérieur de ce qui est placé en bourse : ce que tu alimentes sans le remettre en question, et ce que tu arbitres. Le core n’est pas de l’argent immobile, c’est souvent là qu’arrive l’essentiel des versements : c’est de l’argent que tu ne comptes pas vendre. C’est une lecture, pas un objectif : le plan de rééquilibrage ne vient que des classes. Poser une seconde série de cibles sur ce même argent pourrait la contredire sans que rien ne le signale."))}</h2>
      <span class="hint">${mentionBase(BASES.baseCibles, rr.base)}</span></div>
    <!-- Ce paragraphe repetait mot pour mot la premiere phrase de la bulle du
         titre, deux centimetres plus bas. Il definissait deux mots de metier,
         ce qui etait juste — mais la bulle le fait deja, et une definition lue
         deux fois se lit une fois de trop. La carte garde ses barres et son
         diagnostic ; l'explication vit dans le « ? », a un geste. -->
    ${diagnosticRoles(rr)}
    <ul class="reeq">
      ${rr.roles.map(x => {
        const parts = rr.composition[x.cle] || [];
        return `
        <li class="reeq-ligne">
          <div class="reeq-haut">
            <span class="reeq-nom">${esc(x.label)}</span>
            <b class="reeq-val">${fmtEUR(x.value)} <span class="muted">· ${fmtPct(x.pct, 1)}</span></b>
          </div>
          <!-- Deux dimensions dans une barre : la couleur dit la classe, la
               hachure dit le titre en direct. Une seconde teinte aurait laissé
               croire à une autre classe ; un motif se lit comme une variante
               et reste visible en cas de daltonisme. -->
          <!-- La barre ouvre les placements du role, comme les jauges de cibles
               au-dessus. Elle en compte un autre ensemble : ici « Satellite »
               couvre toutes les classes, la-haut il ne couvre qu'une. La fiche
               nomme donc la classe de chaque ligne, sans quoi on lirait les
               memes mots pour deux montants differents.

               La tresorerie mene a ses poches de cash : elle n'a pas de role et
               elle n'est pas faite de positions. -->
          <!-- La barre vaut la part, et non toute la largeur.

               Les deux lectures tiennent maintenant ensemble : la longueur dit
               la part, les segments a l'interieur disent de quoi le role est
               fait, et les trois barres mises bout a bout font la largeur
               entiere. Un plancher de 1,5 % garde visible un role minuscule. -->
          ${(() => {
            const empile = parts.map(p =>
              `<i class="${p.nature === 'fonds' ? '' : 'raye'}"
                  style="width:${(x.value ? p.value / x.value * 100 : 0).toFixed(2)}%;--c:${p.couleur}"
                  title="${esc(p.label)} · ${fmtEUR0Texte(p.value)}"></i>`).join('');
            const dedans = empile
              ? `<span class="role-part" style="width:${Math.max(1.5, x.pct).toFixed(2)}%">${empile}</span>`
              : '<i class="vide"></i>';
            const ouvre = x.cle === CLE_TRESORERIE
              ? { apercu: 'cashCible', arg: 'investir', quoi: 'les poches de cash' }
              : positionsDeRole(x.cle) ? { apercu: 'role', arg: x.cle, quoi: 'les placements' }
                                       : null;
            return ouvre
              ? `<button type="button" class="role-barre-lien" data-action="apercu"
                         data-apercu="${esc(ouvre.apercu)}" data-arg="${esc(ouvre.arg)}"
                         aria-label="Voir ${ouvre.quoi} de ${esc(x.label)}"
                         ><span class="role-barre">${dedans}</span></button>`
              : `<div class="role-barre">${dedans}</div>`;
          })()}
          <!-- Une legende qui ne dirait que le nom de la ligne au-dessus
               n'apprend rien : la tresorerie est d'un seul tenant, sa couleur
               et son intitule suffisent. -->
          ${parts.length === 1 && parts[0].label === x.label ? '' : `
          <div class="role-legende">${parts.map(p =>
            `<span><i class="${p.nature === 'fonds' ? '' : 'raye'}" style="--c:${p.couleur}"></i>${
              esc(p.label)} ${fmtEUR0(p.value)}</span>`).join('')
            || '<span class="muted">aucune ligne</span>'}</div>`}
        </li>`;
      }).join('')}
    </ul>
    <!-- Le dépliant « Fonds ou titres en direct » répétait ce que les barres
         disent maintenant d'elles-mêmes. Restait un paragraphe de 48 mots dont
         sept seulement servaient a lire le dessin ; les 41 autres expliquaient
         d'ou vient la nature et pourquoi elle n'entre pas dans les cibles.
         C'est vrai, c'est utile, et ça n'a pas à occuper le bas d'une carte
         qu'on ouvre pour regarder des barres. La legende decode, le « ? »
         explique. -->
    ${rr.parNature.some(n => n.nature === 'Titre en direct') ? `
      <p class="hint" style="margin:12px 0 0">
        ${trad('Hachuré : titre en direct. Plein : fonds.')}${aide(trad("La nature est déduite de l’instrument et se corrige dans la fiche de chaque ligne. Elle n’entre pas dans les cibles, qui portent sur la classe d’actif : sur le risque, pas sur l’enveloppe."))}
      </p>` : ''}
  </div>`;
}

function mountRebalance() {
  /* Plus de graphique a monter : le tableau porte ses barres d'ecart et les
     roles leurs barres empilees, en HTML. Moins de code, et tout reste lisible
     sur un telephone sans axe a comprimer. */
}

/* ------------------------------------------------------------
   Releves mensuels
   ------------------------------------------------------------ */
let historyShowLegacy = false;
let historyYear = null;      // null = année en cours

function viewHistory() {
  const cols = ACCOUNTS.filter(a => historyShowLegacy || !a.legacy);
  const annees = historyYears();
  const anneeCourante = todayISO().slice(0, 4);
  if (historyYear === 'all') historyYear = null;   // le cran a quitte le selecteur
  const annee = historyYear ?? (annees.includes(anneeCourante) ? anneeCourante : annees[annees.length - 1]);

  /* On garde l'index réel de chaque ligne : les champs de saisie pointent
     dessus. Total et variation se calculent une fois pour les deux rendus, le
     tableau et la liste de telephone — deux calculs paralleles finissent
     toujours par diverger.

     Le total est celui de `rowTotal`. La somme des trois poches affichees en
     oubliait deux depuis que la crypto et l'immobilier ont la leur : la
     colonne Total sous-estimait le patrimoine d'un portefeuille de
     cryptomonnaies entier, pendant que la colonne Δ, elle, comparait deja des
     totaux complets. */
  const lignes = Store.state.monthly
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => annee === 'all' || r.date.startsWith(annee))
    .map(({ r, i }) => {
      const total = rowTotal(r);
      const prev = i > 0 ? rowTotal(Store.state.monthly[i - 1]) : 0;
      return { r, i, g: rowGroups(r), total, dlt: prev && total ? total - prev : 0 };
    });

  /* Les poches vides ne prennent pas de colonne, et celles qui portent
     quelque chose en ont une : le tableau est deja large, mais un total qui
     ne se retrouve pas dans ses parts ne se verifie pas. Meme liste, memes
     libelles que la legende du graphique juste au-dessus. */
  const poches = seriesUtiles(lignes.map(({ g }) => g));
  /* Le plafond commun des barres de la liste : le plus gros mois affiche. Sans
     lui, chaque barre se normalise sur son propre total et les douze font la
     meme longueur. Il suit l'annee choisie, donc les barres se recalibrent en
     changeant d'annee — c'est voulu : on compare ce qui est a l'ecran. */
  const maxTotal = Math.max(0, ...lignes.map(({ total }) => Math.abs(num(total))));

  const rows = lignes.map(({ r, i, g, total, dlt }) => {
    const estMoisCourant = r.date === currentMonthKey();
    /* Le ⤒ du mois qui attend sa photo s'allume. Douze glyphes gris
       identiques ne disaient pas lequel réclamait un geste, et c'est
       pourtant la seule ligne où il y a quelque chose à faire. */
    const attendSaPhoto = estMoisCourant && rowIsEmpty(r);
    /* Le ⤒ des mois a venir s'eteint. Le geste y est refuse de toute facon,
       mais un bouton qui a l'air disponible et se derobe au clic est pire
       qu'un bouton qui annonce qu'il ne l'est pas. */
    const aVenir = !moisRevolu(r.date);
    return `<tr ${estMoisCourant ? 'data-anchor="mois-courant" class="mois-courant"' : ''}>
      <td class="snap-cell">
        <button class="btn icon snap${attendSaPhoto ? ' snap-attendu' : ''}${aVenir ? ' snap-avenir' : ''}"
                data-action="snapshot-row" data-i="${i}"
                title="${aVenir
                  ? `${esc(fmtMonth(r.date))} ${trad('n’a pas encore eu lieu')}`
                  : attendSaPhoto
                  ? `${trad('Enregistrer le relevé de')} ${esc(fmtMonth(r.date))} : ${trad('reprend tous les montants actuels')}`
                  : trad('Reprendre tous les montants actuels dans cette ligne')}">⤒</button>
      </td>
      <td class="name sticky-col"><input type="date" data-path="monthly.${i}.date" value="${r.date}" style="min-width:130px"></td>
      <td><b>${total ? fmtEUR0(total) : ''}</b></td>
      <td class="${cls(dlt)}">${dlt ? fmtSigned(dlt) : ''}</td>
      ${poches.map(p => `<td>${g[p.key] ? fmtEUR0(g[p.key]) : ''}</td>`).join('')}
      ${cols.map(a => `<td><input type="number" step="any" data-path="monthly.${i}.v.${a.id}" value="${r.v[a.id] ?? ''}" placeholder=""></td>`).join('')}
      <td style="min-width:260px"><input data-path="monthly.${i}.comment" value="${esc(r.comment || '')}" placeholder="${trad('Note du mois…')}" style="text-align:left"></td>
      <td><button class="btn icon" data-action="del-month" data-i="${i}" title="${trad('Supprimer la ligne')}">✕</button></td>
    </tr>`;
  }).join('');

  return `
  ${(() => {
    /* Le rappel passe tout en haut : il etait sous le graphique, donc apres
       un ecran de defilement, alors qu'il porte le seul geste qu'on vient
       faire ici. Un rappel qu'on decouvre apres avoir lu la page arrive trop
       tard.
       Il se tait aussi. « J'attends une rentree d'argent, ne me le demande pas
       maintenant » est une raison legitime, et les deux sorties sont les memes
       que sur les autres bandeaux : `sortiesRappel` les rend une seule fois.
       Ce bouton disait « Plus tard » en taisant le mois entier, quand celui de
       l'accueil ne repoussait que d'une semaine — deux gestes, un seul mot. */
    const p = currentMonthPending();
    if (!p.missing) return '';
    return `<div class="note">⤒ <span><b>${esc(p.label)} ${trad('n’est pas encore enregistré.')}</b>
      ${trad('Depuis sa ligne, reprendre d’un coup tous les montants actuels')}
      (${fmtEUR0(nowTotals().total)}) ${trad('tient en un geste.')}</span>
      ${sortiesRappel('releve', p.label,
        `<button class="btn sm" data-action="go-snapshot">${trad('Aller à la ligne')}</button>`)}</div>`;
  })()}

  <!-- La courbe d'evolution vivait ici, identique a celle de l'accueil : meme
       titre, meme graphique, memes commandes. Elle y etait redondante deux fois
       plutot qu'une — l'accueil la porte, et le tableau des releves, juste en
       dessous, donne les memes montants mois par mois avec leur ecart. Cette
       page sert a saisir ; on relit ailleurs. -->

  <!-- Le relevé ouvre la page, et c'est le sujet de la page.

       Il venait après le journal des entrées exceptionnelles, donc après un écran
       de défilement : on arrivait sur un journal d'événements rares pour trouver
       le calendrier des douze mois, qui est ce qu'on vient remplir. Une page
       s'ouvre sur son geste. -->
  <div class="card">
    <div class="card-head">
      <!-- Ce tableau compte le meme total que le graphique de l'accueil, par
           rowTotal(), donc lui aussi sans retirer les dettes. Il ne dit pas
           « net », il ne dit pas « brut » non plus : « du patrimoine » suffit a
           lever l'ambiguite qu'on lui reprochait, savoir de quoi ces euros
           sont le releve. -->
      <h2>${trad('Relevé mensuel du patrimoine')}</h2>
      ${yearControl('history-year', annees, annee)}
    </div>
    <div class="row" style="margin:-4px 0 12px">
      <span class="hint">${lignes.length} ${lignes.length > 1 ? trad('mois affichés') : trad('mois affiché')}</span>
      <span class="spacer"></span>
      <label class="small row" style="gap:6px"><input type="checkbox" id="toggleLegacy" ${historyShowLegacy ? 'checked' : ''} style="width:auto">${trad(' Comptes clôturés')}</label>
      <button class="btn sm ghost" data-action="add-month">${trad('+ Ouvrir l’année suivante')}</button>
    </div>
    <!-- Douze lignes cliquables et pas un mot sur ce qu'on y met. Le calendrier
         existe des le premier lancement, donc la carte n'a jamais l'air vide : sa
         phrase ne peut pas dependre du nombre de lignes, seulement de ce qu'un
         releve suppose — un compte a photographier. -->
    ${pasAFaire('comptes') ? `
    <p class="empty" style="margin:0 0 12px">${trad('Un relevé est la photo de tes comptes '
      + 'à une date : leur montant, mois par mois. C’est lui qui donne la courbe de ton '
      + 'patrimoine et ton rythme d’épargne. Il attend donc un compte.')}</p>
    ${invitePremierPas('comptes')}`
    : invitePremierPas('releves')}
    <!-- La liste sur tous les ecrans, et non plus seulement sur telephone.

         Cette page portait une grille de treize colonnes sur le web et une liste
         cliquable sur le telephone. Or le ⤒ remplit une ligne entiere d'un clic :
         la grille est une surface de saisie pour quelque chose qu'on ne saisit
         presque jamais case par case. Ce qu'on vient chercher ici, c'est comment
         le patrimoine a bouge et quelle poche a bouge — une lecture.

         La grille reste, derriere un depliant, pour la correction manuelle rare
         et pour comparer douze mois sur treize axes — c'est la seule chose
         qu'une grille fait mieux que tout le reste. -->
    <div class="liste-principale">
      ${lignes.map(({ r, i, g, total, dlt }) => {
        const courant = r.date === currentMonthKey();
        /* La barre ne se dessine que si le mois porte quelque chose : douze
           pistes vides sous douze lignes vides feraient un accordeon gris.

           Sa LONGUEUR vaut le total, rapporte au plus gros mois affiche ; ses
           segments valent la composition. Sans ce plafond commun, chaque mois
           etait normalise sur lui-meme et remplissait toute la largeur : aout a
           36 107 EUR faisait exactement la longueur de janvier a 24 110. On
           lisait la repartition, jamais la taille — alors que douze barres
           alignees sont precisement l'endroit ou la taille se compare.

           C'est la troisieme fois que ce defaut se presente dans cette
           application, apres les barres de role et celles des charges fixes.
           La regle est devenue celle de la maison : une barre posee a cote d'un
           montant ou d'un pourcentage doit valoir ce montant, sinon elle le
           contredit. */
        const barre = total ? `<span class="ml-poches" aria-hidden="true">
          <span class="ml-part" style="width:${(total / maxTotal * 100).toFixed(2)}%">${
          poches.map(p => {
            const v = Math.abs(num(g[p.key]));
            if (!v) return '';
            return `<i style="width:${(v / total * 100).toFixed(2)}%;background:${p.color}"
                       title="${esc(p.label)}"></i>`;
          }).join('')}</span></span>` : '';
        return ligneListe({
          action: 'edit-month', index: i,
          ancre: courant ? 'mois-courant' : '',
          classe: courant ? 'mois-courant' : '',
          titre: fmtMonth(r.date),
          sous: r.comment || '',
          marque: courant && rowIsEmpty(r)
            ? `<span class="marque-attendu" title="${trad('Le relevé de ce mois n\'est pas encore pris')}">⤒</span>` : '',
          valeur: total ? fmtEUR0(total) : '',
          second: dlt ? fmtSigned(dlt) : '', classeSecond: cls(dlt),
          barre,
        });
      }).join('') || `<p class="empty">${trad('Aucun mois sur cette année.')}</p>`}
    </div>
    <!-- La classe est celle du graphique juste au-dessus, et non un nom
         invente : elle porte l'espacement, les pastilles de couleur et la
         teinte du texte. Une premiere version employait un nom qui n'existe
         pas, et les quatre libelles sortaient colles, sans pastille et dans la
         mauvaise couleur. Meme legende que la courbe, memes mots, memes
         teintes : c'est la meme decomposition.
         (Aucun guillemet oblique dans ce commentaire : il vit dans un litteral
         de gabarit, un backtick y fermerait la chaine.) -->
    ${poches.length ? `<div class="legend">${legendeSeries(poches)}</div>` : ''}

    <!-- Le tableau de correction ne se propose plus sous 767 px, et ce n'est pas
         un renoncement : il porte quinze colonnes dans un conteneur qui defile,
         quand la liste juste au-dessus ouvre le meme mois dans une fenetre qui
         tient dans l'ecran. La fenetre offre tout ce que le tableau offre, la
         reprise des montants actuels comprise, et desormais l'effacement de la
         ligne. Deux surfaces pour la meme saisie, dont une inutilisable au
         doigt : c'est la regle des trois colonnes. -->
    <details class="data-view large-seulement" style="margin-top:12px">
      <summary>${trad('Corriger mois par mois, compte par compte')}</summary>
      <p class="hint" style="margin:12px 0 0">${trad('Le ⤒ d’une ligne y reprend tous les '
        + 'montants actuels d’un clic. La saisie case par case ne sert qu’à corriger un mois passé.')}</p>
    <div class="table-wrap" style="max-height:70vh; overflow-y:auto">
      <table class="editable">
        <thead><tr>
          <th title="${trad('Reprendre les montants actuels dans la ligne')}">⤒</th>
          <th class="sticky-col">Date</th><th>Total</th><th>Δ</th>
          ${poches.map(p => `<th>${esc(p.label)}</th>`).join('')}
          ${cols.map(a => `<th title="${esc([a.label, a.broker].filter(Boolean).join(' · '))}"
            >${esc(a.short)}<span class="th-etab">${esc(a.broker || '')}</span></th>`).join('')}
          <th>Commentaire</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    </details>
  </div>

  <!-- Le journal des rentrees exceptionnelles.

       Ici, dans les releves, parce que c'est la page des evenements du passe : un
       apport explique une marche du patrimoine, et c'est cette page qui garde le
       mois ou elle s'est produite. Il en faut la memoire, pas une prevision.

       Ce que ce journal change ailleurs : « Rythme d'accumulation » peut enfin
       dire « dont tant d'apports exterieurs », et l'export du classeur a sa
       feuille. Un heritage n'est pas de l'epargne. -->
  ${(() => {
    /* Le journal suit l'annee choisie en tete de page, comme « Notes de marche »
       deux cartes plus bas. C'est la reponse a « si j'ai 300 lignes on va
       derouler une liste de 300 ? » : le depliant seul ne bornait rien, il
       cachait. Dix ans de mouvements exceptionnels tiennent dans un menu qui
       existe deja, et aucun controle nouveau n'apparaît sur la carte.

       Les bornes sont les deux bouts de l'annee, et `apportsDetail()` les prend
       telles quelles. « Toutes les annees » retire les bornes : c'est la seule
       vue qui peut etre longue, et c'est celle qu'on demande expressement. */
    const tout = apportsTries();
    const bornes = annee === 'all' ? [null, null] : [`${annee}-01-01`, `${annee}-12-31`];
    const liste = annee === 'all' ? tout
      : tout.filter(a => String(a.date || '').startsWith(String(annee)));
    const d = apportsDetail(...bornes);
    return `
  <div class="card">
    <div class="card-head"><h2>${trad('Entrées et sorties exceptionnelles')}</h2>
      <span class="hint">${liste.length
        ? `${liste.length} ligne${liste.length > 1 ? 's' : ''} · ${
            annee === 'all' ? 'toutes années' : esc(String(annee))} · ${fmtSigned(d.net)} net`
        : tout.length
          ? `aucune en ${annee === 'all' ? 'mémoire' : esc(String(annee))} · ${tout.length} au total`
          : trad('héritage, prime, vente d’un bien, ou une grosse dépense')}</span>
      <!-- Le meme selecteur que celui du releve mensuel, et la meme variable.

           Le journal suit l'annee de la page, mais il se rend **au-dessus** de la
           carte qui la choisit — mesure : journal a 749 px, selecteur a 953. Il
           annonçait donc « 30 lignes, 2026 » avec sa commande deux cents pixels
           plus bas, sur une autre carte. « Notes de marche » n'a pas ce probleme,
           elle se rend en dessous.

           Deux portes sur un meme champ sont saines, c'est la regle de la
           maison : les deux ecrivent la variable historyYear, il n'y a qu'une
           valeur et elles ne peuvent pas se contredire. Ce qui serait fautif, ce
           serait deux annees rangees separement.
           (Aucun guillemet oblique : ce commentaire vit dans un litteral de
           gabarit, un backtick y fermerait la chaine.)

           Pas de selecteur sur un journal vide : il n'y aurait rien a filtrer, et
           un controle sans effet se lit comme une panne. -->
      ${tout.length ? yearControl('history-year', annees, annee) : ''}
      <!-- Deux boutons plutot qu'un menu de nature dans la fenetre : le sens est
           connu au moment ou l'on appuie, et le demander ensuite ferait repondre
           deux fois a la meme question. La fenetre de modification, elle, le
           propose — c'est le seul endroit ou l'on peut s'etre trompe. -->
      <span class="paire-btn">
        <button class="btn sm ghost" data-action="ajouter-apport" data-sens="entree">${trad('+ Rentrée')}</button>
        <button class="btn sm ghost" data-action="ajouter-apport" data-sens="sortie">${trad('+ Dépense')}</button>
      </span></div>
    ${!liste.length && !tout.length ? `
    <p class="small muted" style="margin:0">${trad('Rien pour l’instant. Une somme reçue ou dépensée '
      + 'une seule fois se note ici, avec sa date : le rythme d’accumulation sait alors que '
      + 'ce mois-là ne dit rien de ton épargne.')}</p>`
    /* Une annee vide n'est pas un journal vide, et les deux ne se disent pas
       pareil : « rien pour l'instant » devant dix lignes rangees ailleurs serait
       faux, et enverrait chercher un defaut. */
    : !liste.length ? `
    <p class="small muted" style="margin:0">Aucune ligne en ${esc(String(annee))}.
      Le journal en compte ${tout.length} au total : change l’année en tête de page.</p>`
    /* La liste est repliee, et c'est une decision : « je ne veux pas voir une
       liste d'une annee tout le temps, peut-etre un bouton voir liste, sinon
       rien ». Un journal ne se vide jamais — il doit rester lisible aussi
       longtemps que le graphique peut remonter jusqu'a lui, sinon le rythme
       d'accumulation recompterait une voiture de 2026 comme de l'epargne en
       2029. Mais ce qui ne se vide pas s'allonge.

       Deux bornes, donc, et elles ne font pas double emploi : l'annee borne
       **combien** de lignes existent, le depliant borne **quand** on les voit.
       L'annee seule aurait montre douze mois de lignes en permanence ; le
       depliant seul aurait cache trois cents lignes derriere un bouton sans en
       reduire une.

       `details` natif plutot qu'une classe et un ecouteur : le contenu reste
       dans le document, donc les lignes gardent leur clic d'edition — ce qu'un
       apercu en fenetre aurait perdu, `APERCUS` ne rendant que de la lecture.
       Le drapeau survit au re-rendu, comme `evoDetailOuvert`. */
    : `<details class="data-view" id="journalApports" ${journalOuvert ? 'open' : ''}>
      <summary>${trad('Voir le journal')}</summary>
      <div class="mlist-groupe" style="margin-top:12px">
      ${liste.map(a => `
        <button type="button" class="mlist" data-action="editer-apport" data-i="${a.index}"
                title="${trad('Modifier cette ligne')}">
          <span class="ml-nom">${esc(a.libelle || (a.montant < 0 ? 'Dépense' : 'Rentrée'))}
            <span class="sub">${esc([fmtJourMois(a.date) || a.date || 'sans date',
              a.note || ''].filter(Boolean).join(' · '))}</span></span>
          <span class="ml-chiffres"><b class="${cls(a.montant)}">${fmtSigned(a.montant)}</b></span>
          <span class="ml-chev" aria-hidden="true">›</span>
        </button>`).join('')}
      </div>
    </details>
    <!-- Les deux sens puis leur net : le total est la somme de ses parts, et sans
         les parts un net de -5 000 EUR ne dirait pas s'il vient d'une grosse
         sortie ou de l'absence d'entrees. Ils restent hors du depliant : ce sont
         trois lignes, et c'est ce qu'on vient lire. -->
    <dl class="kv" style="margin-top:12px">
      ${d.entrees ? `<dt>${trad('Entrées')}</dt><dd class="up">${fmtSigned(d.entrees)}</dd>` : ''}
      ${d.sorties ? `<dt>${trad('Sorties')}</dt><dd class="down">${fmtSigned(d.sorties)}</dd>` : ''}
      <dt>Net${aide(trad("La somme de tes entrées et de tes sorties exceptionnelles, toutes dates confondues. Elle ne s’ajoute à aucun total de patrimoine : ces montants sont déjà passés sur tes comptes, c’est leur origine que ce journal garde en mémoire. Le rythme d’accumulation s’en sert pour distinguer ce que tu as mis de côté de ce qui t’est tombé du ciel, ou de ce qui est parti d’un coup. Une grosse dépense se note ici et non dans les dépenses du mois : là-bas elle gonflerait ta moyenne toute l’année, et avec elle le coût de la vie qui sert à ton autonomie financière et à ta cible d’épargne de précaution."))}</dt>
        <dd class="${cls(d.net)}">${fmtSigned(d.net)}</dd>
    </dl>`}
  </div>`;
  })()}

  <div class="card">
    <div class="card-head"><h2>${trad('Notes de marché')}</h2>
      <span class="hint">${annee === 'all' ? 'toutes années' : esc(annee)}</span></div>
    <ul class="small" style="line-height:1.75; margin:0; padding-left:18px; color:var(--text-secondary)">
      ${lignes.filter(({ r }) => r.comment).map(({ r }) =>
        `<li><b>${esc(fmtMonth(r.date))}</b>, ${esc(r.comment)}</li>`).join('') || '<li class="muted">Aucune note</li>'}
    </ul>
  </div>`;
}

function mountHistory() {
  monterEvolution();
  const cb = $('#toggleLegacy');
  if (cb) cb.addEventListener('change', () => { historyShowLegacy = cb.checked; render(); });
  /* Le depliant du journal retient son etat, comme celui des donnees d'evolution
     juste au-dessus. Sans ce cablage il se refermerait au premier enregistrement :
     `render()` reconstruit le balisage, et un `details` neuf naît plie. */
  const j = $('#journalApports');
  if (j) j.addEventListener('toggle', () => { journalOuvert = j.open; });
}

/* ------------------------------------------------------------
   Avoirs — comptes, portefeuilles, parts non cotées, dettes
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   Comptes — la vue de la barre d'onglets

   Trois lectures du même patrimoine, par un contrôle segmenté :
   par banque, par type de compte, par type de placement. La liste
   est hiérarchique et repliable ; les en-têtes de groupe collent en
   haut de l'écran avec leur total et leur part du patrimoine.

   Tout est cliquable : un groupe se replie, un compte ouvre sa
   fiche, un montant d'espèces se modifie sur place. Sur téléphone,
   glisser une ligne de compte vers la gauche révèle Modifier et
   Archiver.
   ------------------------------------------------------------ */
let compteVue = 'banque';            // banque | type
let compteRecherche = '';
/* Les groupes repliés survivent au rechargement.
   Ils vivaient dans une variable : on repliait ses six établissements pour
   avoir la structure d'un coup d'œil, et tout se rouvrait au premier F5. Un
   réglage d'affichage qu'il faut refaire à chaque visite n'est pas un
   réglage. Déplié reste le défaut — la page existe pour montrer les comptes,
   les cacher derrière un appui serait un mauvais échange — mais qui préfère
   le contraire ne le règle qu'une fois. */
/* L'etat vit dans `meta`, pas dans une variable qui le recopie : le `Set`
   etait construit au chargement du script, donc avant que le store soit lu —
   il partait toujours vide et le repli memorise ne s'appliquait jamais. Une
   seule source, interrogee au moment du rendu. */
/* Les groupes d'usage de la fenetre des liquidites partagent ce registre, sous
   un prefixe : c'est le meme fait — « ce groupe est replie » — et deux listes
   auraient fini par se contredire. Le prefixe evite qu'un usage nomme comme un
   contenant ne referme le mauvais groupe. */
const cleLiqPli = aff => `liq:${aff}`;

const compteReplies = {
  liste: () => Store.state?.meta?.comptesReplies || [],
  has(cle) { return this.liste().includes(cle); },
  add(cle) { if (!this.has(cle)) Store.state.meta.comptesReplies = [...this.liste(), cle]; },
  delete(cle) { Store.state.meta.comptesReplies = this.liste().filter(c => c !== cle); },
};
/* Les groupes du dernier rendu, dans l'ordre : « tout replier » a besoin de
   savoir sur quoi il agit, et cela dépend de la lecture choisie. */
let groupesRendus = [];
function memoriserReplies() { Store.save(); }

/* Le libellé court sert au badge comme à la liste déroulante : « Auto,
   Disponible sous quelques jours » ne tient dans aucune colonne, et se faisait
   couper en « Auto, Disponible s… ». La phrase entière reste en infobulle. */
const MOBILISABLE_COURT = {
  immediat: 'Immédiat', differe: 'Quelques jours',
  lent: 'Quelques mois', bloque: 'Inaccessible',
};

function badgeMobilisable(niveau) {
  return `<span class="tag mob-${niveau}" title="${esc(trad(MOBILISABLE_LABEL[niveau]))}">${trad(MOBILISABLE_COURT[niveau])}</span>`;
}

/* Variation d'un compte depuis le dernier relevé qui le mentionne. */
function variationCompte(id) {
  const releves = Store.state.monthly
    .filter(r => r.v && r.v[id] != null && num(r.v[id]) !== 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const dernier = releves[releves.length - 1];
  if (!dernier) return null;
  const avant = num(dernier.v[id]);
  const maintenant = nowValue(id);
  if (!avant) return null;
  return { eur: maintenant - avant, pct: (maintenant / avant - 1) * 100, depuis: fmtMonth(dernier.date) };
}

/* Mini-courbe d'un compte : ses relevés passés, puis aujourd'hui. */
function sparkCompte(id) {
  const vals = Store.state.monthly
    .filter(r => r.v && r.v[id] != null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(r => num(r.v[id]));
  vals.push(nowValue(id));
  if (vals.filter(v => v !== 0).length < 3) return '';
  const W = 64, H = 20, min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const pts = vals.map((v, i) => `${(i * W / (vals.length - 1)).toFixed(1)},${(H - 2 - (v - min) / span * (H - 4)).toFixed(1)}`).join(' ');
  const monte = vals[vals.length - 1] >= vals[0];
  return `<svg class="spark-mini" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="${monte ? 'var(--good)' : 'var(--critical)'}" stroke-width="1.5"/>
  </svg>`;
}

/* Une ligne de compte, avec son tiroir d'actions révélé au glissement. */
/* Une teinte par etablissement, tiree de son nom.
   Six blocs gris empiles se ressemblaient tous : on ne voyait plus ou l'un
   finissait et l'autre commencait, et rien ne rattachait une ligne a son
   groupe une fois l'en-tete parti en haut de l'ecran. La couleur vient du
   nom, donc elle ne bouge pas quand on ajoute ou retire un compte — une
   teinte attribuee par rang aurait tout redistribue au premier ajout. */
/* Une teinte neutre, et non plus une couleur tiree du nom.

   Elle etait un hachage du nom du groupe vers les huit teintes de serie. Trois
   choses en decoulaient, toutes mauvaises.

   Le hachage collisionne : « t-courant » et « t-cto » tombaient tous deux sur
   `series-6`, soit deux groupes de la meme couleur dans la meme liste, ce qui est
   exactement ce que la couleur etait censee eviter.

   Il pioche dans un vocabulaire qui veut dire autre chose. Dans toute
   l'application, `series-1` est le bleu des liquidites et `series-2` le vert des
   actifs de marche — c'est teste, « un actif porte la meme couleur partout ».
   Un etablissement de banque heritait donc du vert des actifs de marche, un
   courtier du bleu des liquidites : un faux signal, dans une langue que le reste de l'app s'applique a
   tenir juste. Pire que pas de couleur du tout.

   Et il n'apportait rien : le role de la pastille est de rattacher une ligne a
   son groupe quand l'en-tete collant a quitte l'ecran. Une teinte unique le fait
   aussi bien, sans rien affirmer.

   Le regroupement par placement garde ses vraies couleurs : la, le groupe *est*
   une classe d'actif, et il recoit `CLASSE_COULEURS` en argument. Sur Comptes,
   une couleur veut donc dire une classe d'actif, ou rien. */
function teinteGroupe() {
  return 'var(--border-strong)';
}

/* `avecEtab` : quand la liste est deja groupee par etablissement, le repeter
   sur chaque ligne n'apprend rien et pousse le type du compte sur deux
   lignes. « le courtier · Portefeuille de cryptomonnaies » devient
   « Portefeuille de cryptomonnaies ». */
/* Ce qui se dit sous le nom d'un compte : son établissement, son type. Un
   compte sans libellé prend le nom de son type — « Espèces » sous « Espèces »,
   deux fois le même mot sur deux lignes. Le sous-titre ne répète pas le titre,
   et la règle vit ici plutôt qu'en deux copies, la liste et la fiche. */
function sousTitreCompte(c, avecEtab = true) {
  const nom = nomCompteV2(c);
  /* Le libelle du type se traduit a l'affichage : la table le porte en
     francais, et les noms saisis (compte, etablissement) restent tels quels. */
  return [avecEtab ? nomEtabDe(c) : '', trad(typeCompte(c.type).label)]
    .filter(x => x && x !== nom).join(' · ');
}

function ligneCompte(c, avecEtab = true) {
  const v = variationCompte(c.id);
  const idx = Store.state.comptes.indexOf(c);
  return `
  <div class="cpt-swipe" data-compte="${esc(c.id)}">
    <div class="cpt-actions" aria-hidden="true">
      <button class="btn sm" data-action="fiche-compte" data-id="${esc(c.id)}">${trad('Modifier')}</button>
      <button class="btn sm ghost" data-action="archiver-compte" data-id="${esc(c.id)}">${trad('Archiver')}</button>
    </div>
    <button type="button" class="cpt-ligne" data-action="fiche-compte" data-id="${esc(c.id)}">
      <span class="cpt-nom">${esc(nomCompteV2(c))}
        <span class="sub">${esc(sousTitreCompte(c, avecEtab))}</span></span>
      ${sparkCompte(c.id)}
      <span class="cpt-val">${fmtEUR(valeurCompte(c))}
        ${v ? `<span class="sub ${cls(v.eur)}">${fmtSigned(v.eur)} ${trad('depuis')} ${esc(v.depuis)}</span>`
            : `<span class="sub">&nbsp;</span>`}</span>
      <span class="cpt-chev">›</span>
    </button>
  </div>`;
}

/* Une ligne de placement ou d'espèces, feuille de l'arborescence.
   Dans une fiche, la disponibilité devient un réglage : la règle calculée
   se trompe parfois — un non coté qui se revend sur un marché secondaire
   n'est pas bloqué — et c'est le placement qui sait, pas le type. */
function lignePlacement(l, compte, editable = false) {
  const mob = mobiliteLigne(l, compte);
  const gain = l.prixDeRevient ? l.valeur - l.prixDeRevient : null;
  /* La disponibilite se lit comme une pastille, pas comme un menu deroulant.

     Elle en etait un, large, sur chaque ligne : la moitie de la largeur utile
     pour un reglage qu'on touche une fois dans la vie de l'application — la
     regle du type de compte est juste presque toujours. Et « Auto, Quelques
     jours » est une valeur, pas un intitule : rien ne disait de quoi il
     s'agissait.

     C'est donc la pastille compacte, la meme que partout ailleurs, avec le menu
     natif rendu invisible par-dessus. Un seul appui, le selecteur du systeme
     s'ouvre, et la ligne ne paie plus une colonne entiere pour cela. Le menu
     reste un vrai `<select>` : il porte l'accessibilite et le clavier, ce qu'un
     faux menu reconstruit aurait fallu refaire. */
  const dispo = editable && l.refMobilite ? `
    <span class="dispo-reglable">
      ${badgeMobilisable(mob)}
      <select data-path="${esc(l.refMobilite)}"
              aria-label="${trad('Disponibilité de')} ${esc(l.libelle)}">
        <option value="auto" ${!l.mobilite || l.mobilite === 'auto' ? 'selected' : ''}>
          ${trad('Auto,')} ${esc(trad(MOBILISABLE_COURT[mobilisabilite(l.classe, compte.type, compte.ouvertLe)]))}</option>
        ${Object.entries(MOBILISABLE_COURT).map(([v, lib]) =>
          `<option value="${v}" ${l.mobilite === v ? 'selected' : ''}>${esc(trad(lib))}</option>`).join('')}
      </select>
    </span>` : badgeMobilisable(mob);
  /* Ce que la ligne dit d'elle-meme, sous son nom : sa classe, son compte, et pour
     un placement non cote son echeance et son etat. C'est la que se lit « en
     retard » — un portefeuille de prets participatifs vit avec ça. */
  const st = statutLigne(l);
  /* Le nom affiche de la ligne. */
  const libelle = nomLignePlacement(l, compte);
  /* Un sous-titre ne repete pas le titre. */
  const replie = x => String(x || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const pareil = (a, b) => {
    const x = replie(a), y = replie(b);
    return !!x && (x === y || x === y + 's' || x + 's' === y);
  };
  /*    Le repli `sansClasse` vivait ici : dans la vue groupee par classe,
   l'en-tete du groupe portait deja le mot, et le repeter sous chaque ligne
   remplissait la colonne de ce que le titre venait de dire.*/
  const sousTitre = [CLASSES_ACTIFS[l.classe] || l.classe, nomCompteV2(compte),
    l.taux ? `${fmtNombre(num(l.taux))} % annoncé` : '',
    l.echeance ? `échéance ${fmtJourMois(l.echeance)} ${String(l.echeance).slice(0, 4)}` : '',
    st !== 'encours' ? STATUTS_LIGNE[st] : '']
    .filter((x, i, t) => x && !pareil(x, libelle)
                           && t.indexOf(t.find(y => y && pareil(y, x))) === i)
    .join(' · ');
  /* L'edition se prend par un bouton, plus par le nom.

     Toute la ligne ne peut pas devenir le bouton : elle porte deja un `<select>`
     pour la disponibilite, et un bouton dans un bouton n'existe pas. C'est donc
     un « Modifier » explicite au bout de la rangee, la ou la fiche du compte pose
     deja le sien pour la carte « Informations ». Le meme mot au meme endroit. */
  const modifiable = editable && !l.marche && l.ref != null;
  const corps = `
    <span class="cpt-nom">${esc(libelle)}
      <span class="sub">${esc(sousTitre)}</span></span>
    <span class="plc-dispo">${dispo}</span>
    <span class="cpt-val">${fmtEUR(l.valeur)}
      ${gain != null && Math.abs(gain) > 0.005
        ? `<span class="sub ${cls(gain)}">${fmtSigned(gain)}</span>` : '<span class="sub">&nbsp;</span>'}</span>
    ${modifiable ? `<button type="button" class="btn sm ghost plc-modif"
        data-action="editer-placement" data-id="${esc(compte.id)}" data-i="${l.ref}"
        title="${trad('Modifier')} ${esc(libelle)}">${trad('Modifier')}</button>` : ''}`;

  /* Dans une fiche, la ligne porte déjà une liste déroulante : elle reste
     inerte, un bouton dans un bouton n'existe pas. Ailleurs — la vue par type
     de placement — toute la ligne ouvre la fiche, comme une ligne de compte.
     Une ligne de marché mène à son titre, une ligne saisie à la main au compte
     qui la porte : c'est là que chacune se modifie. */
  if (editable) return `<div class="plc-ligne plc-placement">${corps}</div>`;

  const cible = l.marche
    ? `data-action="open-position" data-i="${Store.state.positions.indexOf(l.marche)}"`
    : `data-action="fiche-compte" data-id="${esc(compte.id)}"`;
  return `
  <button type="button" class="plc-ligne plc-placement plc-lien" ${cible}
          title="${l.marche ? `Voir la fiche de ${esc(libelle)}`
                            : `Ouvrir ${esc(nomCompteV2(compte))}`}">
    ${corps}<span class="cpt-chev">›</span>
  </button>`;
}

/*    `enteteePlacements()` et `ligneEspeces()` vivaient ici. Une fonction sans
   appelant se garde sans se maintenir, et finit par decrire un ecran qui
   n'existe plus.*/

function viewAccounts() {
  const pat = patrimoine();
  const d = deltas();
  groupesRendus = [];                  // rempli par `groupe()` au fil du rendu
  const filtre = compteRecherche.trim().toLowerCase();
  const correspond = texte => !filtre || texte.toLowerCase().includes(filtre);

  const ouverts = comptesOuverts().filter(c =>
    correspond(nomCompteV2(c)) || correspond(nomEtabDe(c)) ||
    lignesDe(c).some(l => correspond(l.libelle)));

  /* Un groupe : en-tête collant (total, part du brut), lignes repliables. */
  /* `teinte` : la couleur d'un groupe n'est tirée de son nom que faute de
     mieux. Quand le groupe *est* une classe d'actif, il porte la couleur que
     la classe a déjà partout ailleurs — le camembert de l'accueil, la légende
     de la courbe, la répartition. Liquidités bleu, actifs de marché vert,
     immobilier jaune : la même chose se reconnaît à la même couleur d'un écran
     à l'autre, sinon la couleur ne veut plus rien dire. */
  /* Le pourcentage a quitte l'en-tete des groupes.

     Chacun annoncait « 10,0 % du total » alors que le total n'etait ecrit nulle
     part sur la page : six pourcentages renvoyant a un nombre absent, ce que la
     regle de ce projet interdit. La question s'est posee d'afficher le total pour
     leur donner leur base, et la reponse a ete de retirer les pourcentages.

     Parce que l'axe ne commande aucune decision : on ne reequilibre pas entre ses
     banques. Ce qui se pilote est la repartition par classe et le partage entre
     roles, et Allocation le fait deja, avec sa base nommee et ses totaux testes.
     Comptes est un annuaire — on y vient retrouver un compte, verifier un solde,
     corriger un montant — et un annuaire n'a pas besoin de poids. Les montants
     restent, donc qui veut la part la voit a l'oeil.

     Le total de la page reste affiche, pour une autre raison : elle montre douze
     parties, elle doit dire leur somme, ne serait-ce que pour qu'on la recoupe
     avec l'accueil. Il sert a verifier, pas a fonder un pourcentage. */
  const groupe = (cle, titre, sousTitre, corps, total, lien = '', teinte = null) => {
    if (!corps.trim()) return '';
    const replie = compteReplies.has(cle);
    groupesRendus.push(cle);
    return `
    <section class="cpt-groupe ${replie ? 'replie' : ''}" style="--teinte:${teinte || teinteGroupe()}">
      <div class="cpt-gtitre">
        <button type="button" class="cpt-gplier" data-action="replier-groupe" data-cle="${esc(cle)}"
                aria-expanded="${!replie}">
          <span class="cpt-pastille" aria-hidden="true"></span>
          <span class="cpt-gnom">${esc(trad(titre))}${sousTitre ? `<span class="sub">${esc(trad(sousTitre))}</span>` : ''}</span>
          <!-- Rien et non zero : un groupe peut n'avoir aucun total a donner.
               C'est le cas des comptes archives, sortis de tous les cumuls, ou
               un « 0,00 € » se lirait comme un solde.
               (Pas d'accent grave ici : ce commentaire vit dans un litteral de
               gabarit, ou un backtick referme la chaine.) -->
          <span class="cpt-gtotal">${total == null ? '' : fmtEUR(total)}</span>
          <span class="cpt-chev">${replie ? '›' : '⌄'}</span>
        </button>
        ${lien}
      </div>
      <!-- Le pli est une grille qui passe de 0fr a 1fr : c'est ce qui permet
           une hauteur animee sans la mesurer, et la visibilite differee sort
           le contenu replie du clavier et des lecteurs — le role que tenait
           l'attribut hidden avant l'animation. -->
      <div class="cpt-pli${replie ? '' : ' ouvert'}"><div class="cpt-corps">${corps}</div></div>
    </section>`;
  };

  /* Les intertitres de la vue par contenant, et le drapeau qui dit s'ils sont
     la. Le groupe des comptes archives se rend en dehors du if/else, tout en
     bas : sans ce drapeau il tombait sous « Biens et especes », qui ne le
     contient pas. Un titre pose une etagere, il doit donc en poser une pour
     tout ce qui suit. */
  let sectionsAffichees = false;
  const titreSection = (t, sous) => `
      <h3 class="cpt-section">${esc(trad(t))}<span class="sub">${esc(trad(sous))}</span></h3>`;

  let corps = '';
  /* Le compte des especes existe pour tout le monde, pose par le modele : la page
     n'etait donc jamais « vide » a ses yeux, et son texte d'accueil ne s'affichait
     pas. C'est un compte que personne n'a cree, il ne peut pas tenir lieu de
     premier pas. */
  if (!ouverts.some(c => !typeCompte(c.type).interne) && !filtre) {
    corps = `<div class="card">${invitePremierPas('comptes')
      || `<p class="empty">${trad('Aucun compte pour l’instant.')}</p>`}</div>`;
  } else if (!ouverts.length) {
    corps = `<div class="card"><p class="empty">Rien ne correspond à ${guill(esc(compteRecherche))}.
      Essaie avec le nom de la banque ou du placement.</p></div>`;
  } else if (compteVue === 'banque') {
    /* Deux sections, et la frontiere se derive des comptes.

       Cette vue melait deux choses de nature differente sous un seul axe : les
       banques et les courtiers, qui tiennent de l'argent pour toi, et les biens,
       ou le contenant EST la chose — un appartement s'affichait comme
       « Appartement, 1 compte » au milieu des banques. La confusion venait de
       la : « ou puis-je ranger l'immobilier ? » n'avait pas de bonne reponse
       parce que la page n'avait qu'une seule etagere.

       Un etablissement passe dans la seconde section quand tous ses comptes sont
       detenus en direct — `estDetenuEnDirect()`, pose sur la classe et non sur le
       type. Le premier essai lisait `estUnBien()`, qui repond a « se saisit-il par
       une valeur et un prix d'achat ? » : le non cote dit oui, et les
       plateformes de financement se retrouvaient sous « Biens et especes »
       alors qu'elles tiennent des parts pour toi. Un etablissement sans compte reste dans la premiere : il ne
       subsiste que pour un credit, et un credit se doit a un preteur.

       Les titres ne paraissent que si les deux sections existent. Un seul titre
       ne range rien, il ajoute une ligne. */
    const sansContenant = ouverts.filter(c => !c.etabId || !etabById(c.etabId));
    const estEtabDeBiens = e => {
      const siens = ouverts.filter(c => c.etabId === e.id);
      return siens.length > 0 && siens.every(c => estDetenuEnDirect(typeCompte(c.type)));
    };
    const groupeEtab = e => {
      const siens = ouverts.filter(c => c.etabId === e.id);
      /* Un établissement sans compte disparaissait de la liste — y compris
         quand il portait encore un crédit, qui continuait de peser sur le
         patrimoine net sans qu'aucun écran ne le montre. S'il doit de
         l'argent, il reste visible : c'est le seul moyen d'aller le retirer. */
      const doitEncore = (e.dettes || []).reduce((s, x) => s + num(x.montant), 0);
      if (!siens.length && !doitEncore) return '';
      const totalE = siens.reduce((s, c) => s + valeurCompte(c), 0);
      const credits = (e.dettes || []).reduce((s, x) => s + num(x.montant), 0);
      const lignes = siens.map(c => ligneCompte(c, false)).join('');
      /* Le total du groupe reste la valeur des avoirs ; le credit s'affiche
         en dessous avec le net, sinon on ne sait pas ce que le bien vaut
         reellement une fois la dette deduite. */
      const dette = credits ? `
        <div class="plc-ligne">
          <span class="cpt-nom">${trad('Crédits en cours')}
            <span class="sub">${esc((e.dettes || []).map(x => x.libelle).join(', '))}</span></span>
          <span class="cpt-val down">−${fmtEUR(credits)}</span>
        </div>
        <div class="plc-ligne">
          <span class="cpt-nom"><b>${trad('Valeur nette')}</b></span>
          <span class="cpt-val"><b>${fmtEUR(totalE - credits)}</b></span>
        </div>` : '';
      const orphelin = !siens.length && doitEncore ? `
        <div class="note note-relance" style="margin:0">⚠ <span>
          <b>${trad('Ce crédit ne finance plus rien.')}</b> Le compte qu'il accompagnait a été
          supprimé, mais ${fmtEUR0(doitEncore)} continuent de se soustraire de ton
          patrimoine net. Ouvre la fiche pour le retirer.</span>
          <button class="btn sm" data-action="fiche-etab" data-id="${esc(e.id)}">${trad('Ouvrir la fiche')}</button>
        </div>` : '';
      return groupe(`e-${e.id}`, e.nom,
        siens.length ? `${siens.length} ${motContenu(e.id, siens.length)}`
                     : `${trad('plus aucun')} ${motContenu(e.id, 1)}`, orphelin + lignes + dette, totalE,
        `<button type="button" class="btn sm ghost" data-action="fiche-etab" data-id="${esc(e.id)}"
                 title="${trad('Ouvrir la fiche')} · ${esc(e.nom)}">${trad('Fiche')} ›</button>`,
        teinteDominante(siens));
    };

    const chezUnTiers = ETABS().filter(e => !estEtabDeBiens(e)).map(groupeEtab).join('');
    /* Les espèces et les biens de valeur n'ont aucun contenant : sans ce groupe
       ils n'apparaîtraient nulle part, et le total de la page cesserait d'égaler
       la somme de ses parts sans que rien ne le dise. */
    const enDirect = ETABS().filter(estEtabDeBiens).map(groupeEtab).join('')
      + (sansContenant.length
        /* Le titre dit ce qui unit ces lignes, le sous-titre ce qu'on y trouve.
           Il a d'abord dit « Hors etablissement », une absence sous un
           sous-titre qui disait deja laquelle ; puis « Chez toi », qui affirme
           un lieu que l'application ne connait pas — une voiture n'est pas chez
           toi, une montre peut dormir dans un coffre en banque. Ce qui est vrai
           de toutes ces lignes, et d'elles seules, c'est que personne ne les
           tient pour toi. La paire s'inverse donc : l'absence monte en titre,
           parce qu'elle est le seul fait commun, et le contenu descend. */
        ? groupe('e-sans', trad('Sans intermédiaire'), trad('espèces et objets de valeur'),
            sansContenant.map(c => ligneCompte(c, false)).join(''),
            sansContenant.reduce((s, c) => s + valeurCompte(c), 0), '',
            teinteDominante(sansContenant))
        : '');

    sectionsAffichees = !!chezUnTiers.trim() && !!enDirect.trim();
    /* Les trois appels s'ecrivent pareil, sans raccourci : le troisieme vit
       cent lignes plus bas, avec le groupe des archives, et un alias local ne
       l'aurait pas atteint. Trois lignes qui se lisent de la meme facon valent
       mieux qu'une abreviation qui ne couvre que deux des trois. */
    corps = (sectionsAffichees ? titreSection('Comptes', 'chez une banque ou un courtier') : '')
          + chezUnTiers
          + (sectionsAffichees ? titreSection('Biens et espèces', 'ce que tu détiens en direct') : '')
          + enDirect;
  } else if (compteVue === 'type') {
    /* Les groupes viennent de `groupesParEnveloppe()`, cote store : un compte
       dont le type ne figure pas dans TYPES_COMPTE y garde un groupe au lieu de
       disparaitre de la page sans quitter son total. Un test somme la fonction. */
    corps = groupesParEnveloppe(ouverts).map(g =>
      groupe(`t-${g.id}`, trad(g.label), '', g.comptes.map(c => ligneCompte(c)).join(''),
             g.total, '', teinteDominante(g.comptes))).join('');
  }
  /* Il y avait un troisieme onglet, « Placement », qui groupait les lignes par
     classe d'actif. Il disait pour la troisieme fois la meme chose : l'accueil
     porte la carte « Repartition », qui donne les memes classes avec leur
     montant, leur part et une barre, et dont chaque ligne ouvre la liste des
     placements qui la composent ; Allocation la reprend avec les cibles. Celui-ci
     n'avait ni pourcentage ni base, donc la moins bonne des trois versions. */

  return `
  <!-- Le patrimoine net occupait ici une carte entière, en gros caractères.
       Il est déjà écrit en permanence au pied de la barre latérale et dans
       l'en-tête du tiroir sur téléphone, et l'accueil lui consacre une carte
       avec sa variation et sa courbe. Sans crédit, celle-ci répétait trois
       fois le même nombre — le grand chiffre, « Total de vos avoirs », et un
       net qui lui est égal — en repoussant la liste des comptes, seule raison
       d'ouvrir cette page, sous la ligne de flottaison du téléphone.

       Le total, lui, s'affiche toujours, et il a change de raison d'etre.

       Il ne paraissait qu'en presence de credits, et les en-tetes de groupes
       annoncaient pendant ce temps « 10 % du total » : six pourcentages renvoyant
       a un nombre absent. Les pourcentages sont partis — l'axe ne commande aucune
       decision, on ne reequilibre pas entre ses banques — mais le total reste.

       Sa raison n'est plus de fonder une part : c'est que cette page montre douze
       parties, et qu'elle doit dire leur somme. C'est la regle cardinale du projet
       prise dans l'autre sens, et elle sert a recouper cette page avec l'accueil.
       Les lignes de credits et de net ne s'y ajoutent que s'il y a une dette :
       sans dette, « net » repeterait « avoirs ». -->
  <dl class="kv cpt-resume">
    <dt>${BASES.avoirs.nom}${aide(trad("La somme des comptes ouverts de cette page. Le même nombre que sur l’accueil : si les deux diffèrent, c’est qu’un compte est archivé ou qu’un montant vient d’être corrigé."))}</dt><dd>${fmtEUR(pat.brut)}</dd>
    ${pat.dettes ? `
    <dt>${trad('Crédits en cours')}${aide(trad("Le capital qu’il te reste à rembourser. Les comptes archivés ne comptent pas."))}</dt>
      <dd class="dette">−${fmtEUR(pat.dettes)}</dd>
    <dt><b>${trad('Patrimoine net')}</b></dt><dd><b>${fmtEUR(pat.net)}</b></dd>` : ''}
  </dl>

  <!-- Ce commutateur a la forme des sous-onglets des autres pages, et sa place :
       une barre a lui, en tete, plutot qu'un bouton coince a gauche d'un champ
       de recherche. C'est le meme geste — choisir comment lire la page — et
       Comptes etait la seule ou il ne se presentait pas pareil.

       La forme impose la place : le lavis glissant se deplace par index sur des
       cellules egales, ce que la barre pleine largeur garantit. Dans la rangee,
       les boutons se dimensionnaient sur leur texte et le lavis serait tombe a
       cote.

       « Comptes et supports » et non « Établissement » : cet onglet montre deux
       sections, les comptes tenus par un tiers et les biens tenus soi-meme, et
       un appartement n'est dans aucun etablissement. Le mot doit couvrir les
       deux. « Type », en face, nomme le regroupement par nature de compte,
       du meme mot que la fenetre qui regle ce type. -->
  ${barreCommutateur([
    ['banque', 'Comptes et avoirs'], ['type', 'Type'],
  ], compteVue, 'compte-vue', 'vue')}

  <div class="card" style="padding:12px 16px">
    <div class="row" style="gap:10px">
      <input id="chercheCompte" type="search" placeholder="${trad('Rechercher…')}" value="${esc(compteRecherche)}"
             style="max-width:12em; text-align:left" aria-label="${trad('Rechercher un compte ou un placement')}">
      <span class="spacer"></span>
      <!-- Replier les sept groupes un par un pour obtenir la vue de structure,
           personne ne le fait deux fois. Le choix est mémorisé : replié une
           fois, l'écran rouvre replié. -->
      ${groupesRendus.length > 1 ? `<button class="btn sm ghost" data-action="plier-tout"
        title="${groupesRendus.every(c => compteReplies.has(c))
          ? 'Rouvrir tous les groupes' : 'Ne garder que les totaux'}"
        >${groupesRendus.every(c => compteReplies.has(c)) ? trad('Tout déplier') : trad('Tout replier')}</button>` : ''}
      <button class="btn sm" data-action="ajouter-compte">${trad('+ Ajouter')}</button>
    </div>
  </div>

  <div class="cpt-liste">${corps}</div>

  ${(() => {
    /* Les comptes archivés dans un groupe repliable, comme les autres.

       Il se replie et se déplie comme les autres, et retient son état par le
       même mécanisme : « comme le reste des comptes » veut dire le même
       comportement, pas un cas de plus à connaître.

       Le total est celui de ces comptes, et le sous-titre dit qu'il ne compte
       nulle part ailleurs. L'écrire sans le dire aurait posé un montant qui ne
       s'additionne à rien de ce que la page affiche. */
    const archives = COMPTES().filter(c => c.statut === 'archive');
    if (!archives.length) return '';
    /* Aucun montant sur un compte archivé, ni ici ni dans sa fiche.

       Le total du groupe affichait « 0,00 € », et c'était pire qu'un vide :
       `valeurCompte` rend zéro sur un compte sorti des totaux, donc le chiffre
       ne disait pas ce que le compte contient — il disait ce qu'il pèse, c'est
       à dire rien. « Compte archivé, il n'y a pas de montant, enlever tout
       montant y compris dans la fiche. Là c'est écrit 0. »

       Un zéro affiché se lit comme un solde. Le sous-titre dit déjà que ces
       comptes sont hors totaux ; il n'y a pas de somme à en tirer. */
    return (sectionsAffichees ? titreSection('Archivés', 'hors de tous les totaux') : '')
      + groupe('archives', 'Comptes archivés', 'hors totaux, conservés pour l’historique',
               archives.map(c => ligneCompte(c)).join(''), null);
  })()}`;
}

function mountAccounts() {
  const cherche = $('#chercheCompte');
  if (cherche) {
    cherche.addEventListener('input', () => {
      compteRecherche = cherche.value;
      /* On re-rend la liste seule, pas le champ : il garderait pas le focus. */
      const pos = cherche.selectionStart;
      render();
      const encore = $('#chercheCompte');
      if (encore) { encore.focus(); encore.setSelectionRange(pos, pos); }
    });
  }
  monteSwipeComptes();
}

/* ------------------------------------------------------------
   Fiche compte — une page entière, pas une fenêtre

   La fiche s'adapte à ce que l'enveloppe contient. Un studio n'a pas de
   trésorerie, un livret n'a pas de lignes de titres, et « Placements détenus »
   ne veut pas dire la même chose pour un CTO et pour un bien : la même mise en
   page pour les onze types donnait à chacun deux cartes vides et une carte
   mal nommée.
   ------------------------------------------------------------ */
const estBien = t => !!t.bienImmo;

/* Les crédits qui financent ce compte. Le modèle les range sur l'établissement
   qui porte le bien — c'est là que la valeur nette se lit — donc on remonte à
   lui, avec les index dont `data-path` a besoin pour les rendre modifiables. */
function creditsDuCompte(c) {
  const idxEtab = ETABS().findIndex(e => e.id === c.etabId);
  const etab = ETABS()[idxEtab];
  if (!etab) return { idxEtab: -1, etab: null, dettes: [], total: 0 };
  const dettes = (etab.dettes || []).map((d, i) => ({ d, i }));
  return { idxEtab, etab, dettes, total: dettes.reduce((s, x) => s + num(x.d.montant), 0) };
}

/* L'invite d'un premier pas : un bouton, et la phrase qui dit pourquoi.

   La forme vient de la carte des flux, qui portait deja « Déclarer tes revenus »
   suivi d'une ligne d'explication. Elle est reprise telle quelle plutot
   qu'inventee a cote : trois invites de trois formes differentes auraient donne
   trois apprentissages au lieu d'un.

   Le texte et l'action viennent de `PREMIERS_PAS`, pas de l'appelant : les
   ecrans vides de cette application se sont deja contredits pour avoir ete
   ecrits chacun de son cote. */
function invitePremierPas(cle) {
  const p = PAS_PAR_CLE[cle];
  if (!p || !pasAFaire(cle)) return '';
  return `
      <button type="button" class="btn sm" data-action="${esc(p.action)}"
              style="margin:4px 0 0">${trad(p.bouton)}</button>
      <p class="small muted" style="margin:12px 0 0">${trad(p.quoi)}</p>`;
}

/* Une page entiere qui n'a rien a montrer.

   Trois pages restaient des murs de zeros : Allocation repartissait 0 € entre
   sept classes, Projection etalait « 0 € » sur cinquante ans et dix horizons,
   Releves ouvrait un tableau de douze mois vides. Un tableau de zeros n'est pas
   un resultat, c'est une question mal posee — et sur une application qui va au
   grand public, c'est la premiere impression.

   Une carte, une phrase qui dit ce qui la remplira, la porte du pas manquant, et
   rien d'autre. Le contenu revient de lui-meme des que la donnee existe : ce
   n'est pas un ecran ampute, c'est un ecran qui n'a pas encore commence. */
function pageAvantDonnees(phrase, cle = 'comptes') {
  return `
  <div class="card">
    <p class="empty" style="margin:0 0 4px">${trad(phrase)}</p>
    ${invitePremierPas(cle)}
  </div>`;
}

/* Les trois reglages d'exploitation : ce qu'on a mis, ce qu'on encaisse
   vraiment, ce que l'impot prend. Ils vivent sur le compte et non sur la ligne,
   au meme niveau que les loyers et les charges qui s'y rattachent — un compte
   qui tiendrait deux lots n'aurait pas deux vacances ni deux taux. */
function reglagesExploitation(c, idx, { apport = true } = {}) {
  return `
    <div class="grid g-3" style="margin-top:12px">
      ${apport ? `
      <div class="field"><label>${trad('Apport à l\'achat (€)')}${aide(trad("Ce que tu as sorti de ta poche le jour de l'achat, frais de notaire compris. Il sert de base au rendement sur apport, le seul qui ne bouge pas tout seul avec le temps."))}</label>
        <input type="number" step="any" class="champ-large"
               data-path="comptes.${idx}.apport" value="${num(c.apport) || ''}"
               placeholder="${trad('facultatif')}"></div>` : ''}
      <div class="field"><label>${trad('Mois loués par an')}${aide(trad("Douze si le locataire ne part jamais. Un mois de vacance entre deux baux coûte 8 % du loyer annuel, et le rendement calculé sur douze mois pleins ne le voit pas."))}</label>
        <input type="number" step="1" min="0" max="12" class="champ-large"
               data-path="comptes.${idx}.moisLoues" value="${num(c.moisLoues) || ''}"
               placeholder="12"></div>
      <div class="field"><label>${trad('Impôt sur ce loyer (%)')}${aide(trad("Ton taux à toi, celui que tu constates sur ta déclaration. L'application ne devine aucun régime fiscal : micro-foncier, réel, meublé, les règles changent et une estimation automatique finirait par mentir. Le taux s'applique au loyer moins les charges."))}</label>
        <input type="number" step="0.1" min="0" max="100" class="champ-large"
               data-path="comptes.${idx}.tauxImpot" value="${num(c.tauxImpot) || ''}"
               placeholder="${trad('facultatif')}"></div>
    </div>`;
}

/* Les deux boutons qui rattachent, communs aux deux visages de la carte.

   Ils font, ils ne renvoient pas : la carte Financement montrait deja la bonne
   forme avec « + Credit ». Le rattachement se fait tout seul puisqu'on part du
   bien ; la fenetre generique reste, pour rattacher un loyer deja saisi. */
function boutonsRattachement(c) {
  return `
      <button class="btn sm ghost" data-action="ajouter-loyer" data-id="${esc(c.id)}"
              title="${trad('Créer un loyer déjà rattaché à ce bien')}">+ ${trad('Loyer')}</button>
      <!-- L'infobulle se derive de la table des postes : elle les listait a la
           main, si bien qu'ajouter un poste demandait de penser a deux endroits
           et que celui qu'on oubliait disait le contraire de l'autre. -->
      <button class="btn sm ghost" data-action="ajouter-charge-bien" data-id="${esc(c.id)}"
              title="${esc(chargesProposees(c).map(([l]) => trad(l)).join(', '))}">${trad('+ Charge')}</button>`;
}

/* Une ligne de la carte d'exploitation, avec la porte vers sa source.

   Le nom porte l'action plutot qu'un crayon a cote : c'est le nom qu'on lit et
   qu'on veut corriger, et un second element a viser sur un telephone est un
   second element a manquer. `.lien-nu` existe pour ca — un vrai bouton, puisque
   ce n'est pas une navigation, qui n'en garde que le souligne.

   Un montant qui s'affiche sans porte pour le corriger oblige a chercher sa
   source ailleurs, et rien a l'ecran ne dit ou : le loyer vit dans les revenus
   du budget, la taxe fonciere dans les charges fixes, la mensualite chez le
   preteur. La fenetre ouverte est celle du budget, la meme : deux portes sur un
   meme champ sont saines, deux champs pour un meme montant ne le sont pas. */
/* Les lignes du mois, communes aux deux versants : leur somme fait le solde, et
   ce solde est le meme nombre des deux cotes — « Cash-flow » ou « Sortie du
   compte » selon la question posee, jamais deux calculs. */
function lignesDuMois(cf) {
  const periodeDite = p => p !== 'mois' ? trad(CHARGE_PERIODE_LABEL[p]) : '';
  return [
    ...cf.sourcesLoyer.map(s => ligneSource({
      nom: s.label, montant: s.mensuel, signe: 1,
      action: 'edit-income', donnees: { i: s.i },
      sub: [s.periode !== 'mois' ? `${fmtEUR0(s.montant)} ${periodeDite(s.periode)}` : '',
            s.estime ? trad('estimé') : ''].filter(Boolean).join(' · '),
    })),
    /* La vacance n'a pas de source a ouvrir : elle se regle par « Mois loues par
       an », au bas de cette carte. Elle s'affiche quand meme, parce qu'elle
       retire des euros et qu'une part invisible casserait l'egalite entre le
       total et la somme de ses parts. */
    cf.vacanceEuros > 0.005 ? `
      <dt>${trad('Vacance locative')}${aide(trad("Les mois où le bien n'est pas loué, lissés sur l'année. Se règle par « Mois loués par an », au bas de cette carte."))}
        <span class="sub">${fmtNombre(cf.moisLoues)} ${trad('mois loués sur 12')}</span></dt>
        <dd class="dette">−${fmtEUR(cf.vacanceEuros)} ${trad('/ mois')}</dd>` : '',
    ...cf.postesCharge.map(p => ligneSource({
      nom: p.label, montant: p.mensuel, signe: -1,
      action: 'edit-charge', donnees: { i: p.i },
      sub: p.periode !== 'mois' ? `${fmtEUR0(p.montant)} ${periodeDite(p.periode)}` : '',
    })),
    cf.impot ? `
      <dt>${trad('Impôt déclaré')}${aide(trad("Ton taux appliqué au loyer moins les charges. Il vient de toi, pas d'une règle fiscale que l'application aurait devinée. Se règle par « Impôt sur ce loyer », au bas de cette carte."))}
        <span class="sub">${fmtPct(cf.tauxImpot, 1)}</span></dt>
        <dd class="dette">−${fmtEUR(cf.impot)} ${trad('/ mois')}</dd>` : '',
    /* La mensualite s'ouvre la ou son montant se regle : chez la charge qui
       rembourse le credit quand il y en a une, sinon chez le credit. */
    ...cf.creditsListe.filter(x => x.mensualite > 0.005).map(x => ligneSource({
      nom: x.libelle, montant: x.mensualite, signe: -1,
      action: x.chargeIndex != null ? 'edit-charge' : 'editer-credit',
      donnees: x.chargeIndex != null ? { i: x.chargeIndex } : { etab: x.etabId, i: x.index },
      sub: trad('mensualité du crédit'),
    })),
  ].filter(Boolean).join('');
}

function ligneSource({ nom, montant, signe, action, donnees, sub = '', aideTxt = '' }) {
  const attrs = Object.entries(donnees).map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ');
  return `
      <dt><button type="button" class="lien-nu" data-action="${esc(action)}" ${attrs}
                  title="${trad('Modifier ou supprimer')}">${esc(nom)}</button>${aideTxt ? aide(aideTxt) : ''}
        ${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</dt>
        <dd class="${signe > 0 ? 'up' : 'dette'}">${signe > 0 ? '+' : '−'}${fmtEUR(Math.abs(montant))} ${trad('/ mois')}</dd>`;
}

/* Ce que ce bien fait chaque mois : il rapporte, ou il coute.

   Le meme logement ne pose pas la meme question selon son usage, et la carte
   n'en posait qu'une. Rattacher sa taxe fonciere a sa propre maison suffisait a
   declencher « Rendement brut 0,00 % » : le garde-fou testait l'absence de
   loyer ET de charge, or une residence principale a des charges.

   Les pieces se listent nommees, au lieu d'un « Loyer perçu » et d'un « Charges
   rattachees » qui sommaient sans dire quoi. Deux raisons : le nom qu'on a donne
   en dit plus que la categorie, et chaque ligne porte alors sa propre porte. La
   somme des lignes affichees fait le cash-flow, a l'euro — la vacance comprise,
   qui etait la seule part a agir sans se montrer.

   Deux chiffres separes et jamais un seul agrege pour dire le mois : la
   tresorerie baisse pendant que le patrimoine monte, les deux sont vrais, et
   leur somme ne veut rien dire — elle melangerait de l'argent disponible avec
   de l'argent immobilise dans des murs. */
function carteExploitation(c, idx) {
  const cf = cashFlowBien(c);
  if (!cf) return '';
  const usage = usageBien(c);
  const habite = usage === 'principale' || usage === 'secondaire';
  const rien = !cf.loyers && !cf.charges && !cf.mensualite;

  if (rien) return `
  <div class="card">
    <div class="card-head"><h2>${trad('Ce que ce bien rapporte, et ce qu’il coûte')}</h2>
      <span class="hint">${trad('loyer, charges, cash-flow')}</span>
      ${boutonsRattachement(c)}</div>
    <!-- Classe « empty » et non « small muted » : c'est un ecran vide, pas une
         note en bas de carte. La classe le dit, et la regle des 35 mots
         l'exempte pour cette raison, quand il n'y a aucun chiffre a montrer le
         texte est le contenu.
         (Aucun guillemet oblique ici : ce commentaire vit dans un litteral de
         gabarit, un backtick y fermerait la chaine.) -->
    <p class="empty" style="margin:0">${trad('Aucun loyer ni charge rattaché à ce bien. '
      + '« + Loyer » et « + Charge » les créent déjà rattachés ; un loyer déjà saisi dans le '
      + 'budget se rattache par sa liste « Bien ». Le cash-flow et le rendement se calculent '
      + 'alors tout seuls. Une provision pour travaux se déclare de la même façon, en charge '
      + 'annuelle : c\'est la dépense que tout le monde oublie et qui décide du vrai rendement.')}</p>
  </div>`;

  /* Ce que le logement coute pour de bon. La mensualite sort du compte en
     entier, mais sa part de capital revient a son proprietaire : c'est de
     l'epargne forcee, pas une depense, et confondre les deux fait passer un
     achat pour deux fois plus lourd qu'il ne l'est. */
  if (habite) {
    /* La sortie compte l'impot, parce qu'il sort vraiment du compte. Il ne
       s'affichait pas ici alors qu'un logement partiellement loue peut en
       porter un : le total aurait ete plus petit que la somme de ses lignes. */
    const sortie = cf.charges + cf.mensualite + cf.impot - cf.loyers;
    const interets = cf.capitalMois == null ? null : Math.max(0, cf.mensualite - cf.capitalMois);
    /* Signe et non moins force : une chambre bien louee peut couvrir plus que la
       mensualite. Borner a zero aurait affiche « −0 € » sur un logement qui
       rapporte, et c'est l'intitule qui aurait menti. */
    const reel = cf.capitalMois == null ? null : sortie - cf.capitalMois;
    return `
  <div class="card">
    <div class="card-head"><h2>${trad('Ce que ce logement te coûte, et ce qu’il rapporte')}</h2>
      <span class="hint">${esc(trad(USAGE_BIEN_LABEL[usage]).toLowerCase())}</span>
      ${boutonsRattachement(c)}</div>
    <dl class="kv">
      ${lignesDuMois(cf)}
      <dt><b>${trad('Sortie du compte')}</b>${aide(trad("La somme des lignes au-dessus. Chacune s'ouvre par son nom, pour la corriger ou la supprimer."))}</dt>
        <dd class="${cls(-sortie)}"><b>${fmtSigned(-sortie)} ${trad('/ mois')}</b></dd>
      ${reel != null ? `
      <dt>${trad('Dont capital remboursé')}${aide(trad("Cette part de la mensualité ne part pas : elle passe de ton compte à tes murs. C'est de l'épargne forcée, et c'est pour ça que ton patrimoine monte le mois même où ta trésorerie baisse."))}</dt>
        <dd class="up">+${fmtEUR(cf.capitalMois)} ${trad('en patrimoine')}</dd>
      <dt><b>${trad('Coût réel du mois')}</b>${aide(trad("La sortie du compte moins le capital que tu te rembourses à toi-même. C'est ce que ce logement te prend vraiment, et c'est ce chiffre qui se compare à un loyer."))}</dt>
        <dd class="${cls(-reel)}"><b>${fmtSigned(-reel)} ${trad('/ mois')}</b></dd>
      ${interets ? `<dt>${trad('Dont intérêts')}</dt>
        <dd class="muted">−${fmtEUR(interets)} ${trad('/ mois')}</dd>` : ''}` : ''}
    </dl>
    <!-- Les reglages suivent le loyer, pas l'usage : declares sur un locatif puis
         bascules en residence principale, la vacance et l'impot continueraient
         d'agir sans qu'aucun champ ne permette de les corriger. -->
    ${cf.loyersPleins ? reglagesExploitation(c, idx, { apport: false }) : ''}
  </div>`;
  }

  const baseDite = cf.surAchat ? trad('le prix payé') : trad('la valeur actuelle');
  return `
  <div class="card">
    <div class="card-head"><h2>${trad('Ce que ce bien rapporte, et ce qu’il coûte')}</h2>
      <!-- Le loyer plein, celui que le locataire verse et que le budget compte,
           et non le montant lisse par la vacance : le meme libelle donnait deux
           chiffres sur le meme ecran, 688 en tete et 750 sur la ligne juste en
           dessous. La vacance a sa propre ligne, c'est la qu'elle se lit. -->
      <span class="hint">${fmtEUR0(cf.loyersPleins)} ${trad('de loyer par mois')}</span>
      ${boutonsRattachement(c)}</div>
    <dl class="kv">
      ${lignesDuMois(cf)}
      <!-- Negatif est normal les premieres annees d'un credit, et c'est justement
           ce qu'il faut savoir : la couleur le dit sans le juger. -->
      <dt><b>${trad('Cash-flow')}</b>${aide(trad("Ce qui reste sur ton compte en fin de mois, une fois le crédit payé. La somme des lignes au-dessus, chacune ouvrable par son nom. Négatif les premières années d’un crédit, c’est fréquent et ce n’est pas une erreur : tu rembourses du capital, donc ton patrimoine monte pendant que ta trésorerie baisse. Les deux chiffres sont vrais."))}</dt>
        <dd class="${cls(cf.cashFlow)}"><b>${fmtSigned(cf.cashFlow)} ${trad('/ mois')}</b></dd>
      ${cf.capitalMois ? `<dt>${trad('En patrimoine, le même mois')}${aide(trad("La part de capital de ta mensualité : elle quitte ta trésorerie et rejoint tes murs. Les deux lignes ne s'additionnent pas, elles répondent à deux questions différentes."))}</dt>
        <dd class="up"><b>+${fmtEUR(cf.capitalMois)} ${trad('/ mois')}</b></dd>` : ''}
    </dl>
    <dl class="kv" style="margin-top:12px">
      <dt>${trad('Rendement brut')}${aide(trad('Loyer annuel rapporté à la base indiquée. C’est la convention du marché : un rendement calculé sur une estimation du jour n’est pas le même chiffre, et il baisse quand le bien prend de la valeur.'))}
        <span class="sub">${trad('sur')} ${baseDite}, ${fmtEUR0(cf.base)}</span></dt>
        <dd>${fmtPct(cf.rendementBrut, 2)}</dd>
      ${cf.charges ? `<dt>${trad('Rendement net de charges')}</dt>
        <dd>${fmtPct(cf.rendementNet, 2)}</dd>` : ''}
      ${cf.rendementNetNet != null ? `<dt>${trad('Net d\'impôt')}${aide(trad("Le seul des trois qui dise ce qui te reste. Il n'apparaît que si tu as déclaré ton taux."))}</dt>
        <dd><b>${fmtPct(cf.rendementNetNet, 2)}</b></dd>` : ''}
      ${cf.cashOnCash != null ? `<dt>${trad('Sur ton apport')}${aide(trad("Le cash-flow annuel rapporté à ce que tu as sorti de ta poche. C'est le chiffre qui répond à « ce montage vaut-il mieux qu'un livret », parce qu'il tient compte du levier du crédit. Il se calcule sur ton apport, qui ne bouge pas : le rapporter au capital déjà remboursé le ferait baisser tout seul à mesure que tu rembourses, alors que rien ne se dégrade."))}
        <span class="sub">${fmtEUR0(cf.apport)} ${trad('engagés')}</span></dt>
        <dd class="${cls(cf.cashOnCash)}">${fmtSignedPct(cf.cashOnCash, 1)}</dd>` : ''}
    </dl>
    ${reglagesExploitation(c, idx)}
  </div>`;
}

/* L'espace d'un bien : ce qu'il vaut, ce qu'il a coûté, et où en est le prêt.
   « 150 000 € » tout seul ne dit pas ce qu'on possède — le capital restant dû
   change la réponse du tout au tout. */
function espaceBien(c, idx, t) {
  if (!estBien(t)) return '';
  const biens = (c.lignes || []).map((l, i) => ({ l, i }))
    .filter(({ l }) => (l.classe || 'immobilier') === 'immobilier');
  const { idxEtab, dettes, total: credit } = creditsDuCompte(c);
  /* Deux valeurs, et l'ecran dit laquelle : celle du bien entier, qui se compare
     a une annonce, et la part qu'on en detient, qui seule entre au patrimoine.
     Sans quote-part saisie les deux se confondent, et rien ne s'affiche en plus. */
  const entiere = biens.reduce((s, { l }) => s + num(l.valeur), 0);
  const achatEntier = biens.reduce((s, { l }) => s + num(l.prixDeRevient), 0);
  const valeur = biens.reduce((s, { l }) => s + num(l.valeur) * partDetention(l), 0);
  const achat = biens.reduce((s, { l }) => s + num(l.prixDeRevient) * partDetention(l), 0);
  const partagee = Math.abs(entiere - valeur) > 0.005;
  const gain = achat ? valeur - achat : null;

  return `
  <div class="card">
    <div class="card-head"><h2>${trad('Le bien')}</h2>
      <span class="hint">${biens.length > 1 ? `${biens.length} lots` : esc(t.label)}</span></div>
    ${biens.map(({ l, i }) => `
      <div class="modal-champs">
        <!-- Le nom du bien, une seule fois. Il vivait en double — sur la ligne
             et sur le contenant — et les deux pouvaient diverger : « studio »
             ici, « Studio Lyon 3e » là, sans que rien ne dise lequel comptait.
             Ce champ renomme les deux. -->
        <div class="field"><label>${trad('Nom du bien')}</label>
          <input data-action-change="renommer-bien" data-compte="${esc(c.id)}"
                 value="${esc(l.libelle || '')}" placeholder="${trad('ex. Studio Lyon 3e')}"></div>
        <div class="grid g-2">
          <!-- Deux champs voisins, l'un frais compris et l'autre pas, et un seul
               le disait. La confusion a une consequence chiffree : saisir ici le
               prix paye frais compris surevalue le bien de ses frais de notaire,
               qui sont partis en taxes et ne se revendent pas. C'est aussi ce qui
               explique qu'un achat recent affiche un patrimoine net negatif. -->
          <div class="field"><label>${trad('Valeur estimée aujourd\'hui (€)')}${aide(trad("Ce qu'un acheteur te paierait aujourd'hui, frais de notaire exclus : ceux-là sont partis en taxes le jour de l'achat et ne se revendent pas. C'est pour ça qu'un achat récent financé à crédit peut afficher un patrimoine net négatif, sans que rien ne soit faux."))}</label>
            <input type="number" step="any" class="champ-large"
                   data-path="comptes.${idx}.lignes.${i}.valeur" value="${num(l.valeur)}"></div>
          <div class="field"><label>Prix d'acquisition (€)${aide(trad("Frais de notaire et travaux compris si tu veux que la plus-value affichée soit la vraie."))}</label>
            <input type="number" step="any" class="champ-large"
                   data-path="comptes.${idx}.lignes.${i}.prixDeRevient" value="${num(l.prixDeRevient) || ''}"></div>
        </div>
        <div class="grid g-2">
          <div class="field"><label>${trad('Date d\'acquisition')}</label>
            <input type="date" data-path="comptes.${idx}.lignes.${i}.dateAcquisition"
                   value="${esc(l.dateAcquisition || '')}"></div>
          <div class="field"><label>Surface (m²)${aide(trad("Elle donne le prix au mètre carré, le seul chiffre qui permette de confronter ton estimation aux annonces du quartier. Sans elle, « 150 000 € » ne se vérifie contre rien."))}</label>
            <input type="number" step="any" class="champ-large"
                   data-path="comptes.${idx}.lignes.${i}.surface" value="${num(l.surface) || ''}"></div>
        </div>
        <div class="grid g-2">
          <!-- L'usage se declare : la fiche d'une residence principale n'a pas
               les memes questions que celle d'un locatif, et rien ne permet de
               le deviner. Un bien sans loyer saisi peut etre en travaux. -->
          <div class="field"><label>${trad('Usage')}${aide(trad("Il décide de ce que la fiche te montre : un logement mis en location a un rendement, celui que tu habites a un coût. Ta résidence principale sort aussi des avoirs mobilisables en quelques mois, parce que la vendre veut dire te reloger."))}</label>
            <select data-path="comptes.${idx}.lignes.${i}.usage" class="annee">
              <option value="">${trad('à préciser')}</option>
              ${USAGES_BIEN.map(([cle, label]) => `<option value="${cle}"
                ${usageLigne(l) === cle ? 'selected' : ''}>${trad(label)}</option>`).join('')}
            </select></div>
          <div class="field"><label>${trad('Ta part (%)')}${aide(trad("À remplir seulement si tu détiens ce bien à plusieurs : indivision, SCI, achat en couple sur deux tableaux de bord. Ton patrimoine ne compte alors que ta part. La valeur ci-dessus reste celle du bien entier, c'est elle que tu compares aux annonces. Le crédit, lui, se saisit tel que tu le dois."))}</label>
            <input type="number" step="any" min="0" max="100" class="champ-large"
                   data-path="comptes.${idx}.lignes.${i}.part" value="${num(l.part) || ''}"
                   placeholder="100">
            <!-- Une saisie hors bornes vaut le bien entier, et le taire laisserait
                 croire qu'elle a ete prise en compte : le champ garde le chiffre
                 tape, seul ce mot dit ce que le calcul en fait. -->
            ${num(l.part) && (num(l.part) < 0 || num(l.part) > 100) ? `<p class="hint" style="margin:4px 0 0">${
              trad('Une part va de 0 à 100. Au-delà, le bien compte en entier.')}</p>` : ''}</div>
        </div>
        <div class="field"><label>Adresse</label>
          <input data-path="comptes.${idx}.lignes.${i}.adresse" value="${esc(l.adresse || '')}"
                 placeholder="${trad('facultatif')}" style="text-align:left"></div>
      </div>`).join('')}
    ${(() => {
      /* Le prix au mètre carré : c'est lui qu'on compare aux annonces du
         quartier, et il dit tout de suite si l'estimation a vieilli. Il
         n'apparaît qu'avec une surface renseignée, et se double du prix payé
         à l'époque quand on le connaît — l'écart entre les deux est
         l'histoire du bien en une ligne. */
      const surface = biens.reduce((s, { l }) => s + num(l.surface), 0);
      if (!surface || !entiere) return '';
      /* Le prix au metre carre est celui du bien entier, quote-part ou pas :
         c'est le chiffre des annonces, et le diviser par deux ne se comparerait
         a rien. */
      return `<dl class="kv" style="margin-top:12px">
        <dt>Prix au m²<span class="sub">${fmtNombre(surface)} m² au total</span></dt>
        <dd><b>${fmtEUR0(entiere / surface)}</b> / m²${achatEntier ? `
          <span class="muted">acheté ${fmtEUR0(achatEntier / surface)}</span>` : ''}</dd>
      </dl>`;
    })()}
    <dl class="kv" style="margin-top:12px">
      <dt>${trad('Valeur du bien')}</dt><dd><b>${fmtEUR(entiere)}</b></dd>
      ${partagee ? `<dt>${trad('Ta part')}${aide(trad("Ton patrimoine ne compte que cette fraction. La ligne au-dessus reste la valeur du bien entier."))}
        <span class="sub">${biens.map(({ l }) => fmtPct(partDetention(l) * 100, 0)).join(', ')}</span></dt>
        <dd><b>${fmtEUR(valeur)}</b></dd>` : ''}
      ${gain != null ? `<dt>${trad('Plus-value latente')}${partagee ? aide(trad("Sur ta part, comme le reste de ton patrimoine.")) : ''}</dt>
        <dd class="${cls(gain)}">${fmtSigned(gain)}
          <span class="muted">${fmtSignedPct((valeur / achat - 1) * 100, 1)}</span></dd>` : ''}
      ${credit ? `<dt>${trad('Capital restant dû')}</dt><dd class="dette">−${fmtEUR(credit)}</dd>
        <dt><b>${trad('Ce que tu possèdes')}</b>${aide(trad("La valeur du bien moins ce qu'il reste à rembourser. C'est ce montant qui compte dans ton patrimoine net."))}</dt>
        <dd><b>${fmtEUR(valeur - credit)}</b></dd>` : ''}
    </dl>
  </div>

  ${carteExploitation(c, idx)}

  <div class="card">
    <div class="card-head"><h2>Financement</h2>
      <button class="btn sm ghost" data-action="ajouter-credit" data-id="${esc(c.etabId)}">${trad('+ Crédit')}</button></div>
    ${!dettes.length ? `
      <!-- Un état vide qui n'indique pas la sortie n'est qu'un constat : le
           bouton y est répété, parce que c'est ici qu'on se demande où il est. -->
      <div class="empty">
        <p style="margin:0 0 12px">Aucun crédit déclaré : le bien est compté en entier dans
          ton patrimoine, et sa valeur nette est donc sa valeur tout court.</p>
        <button class="btn sm" data-action="ajouter-credit" data-id="${esc(c.etabId)}">
          + Déclarer un crédit sur ce bien</button>
      </div>` : dettes.map(({ d, i }) => {
      const initial = num(d.initial);
      const restant = num(d.montant);
      const paye = initial ? Math.max(0, initial - restant) : null;
      const pct = initial ? Math.min(100, Math.max(0, paye / initial * 100)) : null;
      return `
      <div class="pret">
        <div class="bien-tete">
          <!-- Le nom ouvre la fenetre du credit : renommer et supprimer ne se
               faisaient que depuis la fiche de l'etablissement, un ecran qu'on
               n'ouvre pas quand on regarde son bien. Les champs de montant
               restent en place juste dessous, ils se corrigent chaque mois. -->
          <span class="cpt-nom"><button type="button" class="lien-nu"
                  data-action="editer-credit" data-etab="${esc(c.etabId)}" data-i="${i}"
                  title="${trad('Renommer, corriger ou supprimer')}">${esc(d.libelle)}</button>
            ${(() => {
              /* L'organisme prêteur rejoint la mensualité sous le libellé :
                 « Crédit Agricole · 1 186 € par mois ». Les deux sont
                 facultatifs, la ligne s'adapte à ce qui est renseigné. */
              const bits = [
                d.organisme ? esc(d.organisme) : '',
                d.mensualite ? `${fmtEUR0(num(d.mensualite))} par mois` : '',
              ].filter(Boolean);
              return bits.length ? `<span class="sub">${bits.join(' · ')}</span>` : '';
            })()}</span>
          <b class="dette">−${fmtEUR(restant)}</b>
        </div>
        ${pct != null ? `
          <div class="goal-bar"><div class="goal-fill"
               style="width:${pct.toFixed(1)}%; background:var(--good)"></div></div>
          <div class="goal-foot">
            <span>${trad('Remboursé')} <b class="up">${fmtEUR0(paye)}</b> · ${fmtPct(pct, 0)}</span>
            <span>${trad('Reste')} <b>${fmtEUR0(restant)}</b> ${trad('sur')} ${fmtEUR0(initial)}</span>
          </div>`
        : `<p class="hint" style="margin:8px 0 0">${trad('Renseigne le capital emprunté au départ pour voir ce qui est déjà remboursé.')}</p>`}
        ${(() => {
          /* Quand ce sera paye, et ce que ca coutera d'ici la. La question que
             tout emprunteur se pose, et les trois pieces necessaires etaient
             deja saisies. Rien a voir avec la projection de patrimoine, gelee a
             dessein : ici on ne lit qu'un contrat, sans le rapporter a la valeur
             du bien. */
          const f = finCredit(d);
          if (!f) return num(d.taux) || !restant ? '' : `
            <p class="hint" style="margin:12px 0 0">${trad('Renseigne le taux et la mensualité : l’application dira alors quand ce crédit sera soldé et ce qu’il te reste à payer d’intérêts.')}</p>`;
          return `
          <dl class="kv" style="margin-top:12px">
            <dt>${trad('Soldé en')}${aide(trad("Calculé depuis ton capital restant dû, ta mensualité et ton taux. Un remboursement anticipé ou une renégociation avance cette date : elle se recalcule dès que tu corriges le capital."))}
              <span class="sub">${fmtDureeMois(f.mois)}</span></dt>
              <dd><b>${esc(fmtMoisAn(f.finLe))}</b></dd>
            <dt>${trad('Intérêts restants')}${aide(trad("Ce que ce crédit te coûtera encore, du premier au dernier mois. Ce n'est pas une dette de plus : c'est le prix du temps, déjà compris dans tes mensualités."))}</dt>
              <dd class="dette">−${fmtEUR0(f.interets)}</dd>
            ${f.derniere < mensualiteCredit(d) - 1 ? `
            <dt>${trad('Dernière échéance')}${aide(trad("Elle solde le reliquat, elle est donc plus petite que les autres."))}</dt>
              <dd class="muted">${fmtEUR(f.derniere)}</dd>` : ''}
          </dl>`;
        })()}
        <div class="grid g-3" style="margin-top:12px">
          <div class="field"><label>${trad('Capital emprunté (€)')}</label>
            <input type="number" step="any" class="champ-large"
                   data-path="etabs.${idxEtab}.dettes.${i}.initial" value="${initial || ''}"></div>
          <div class="field"><label>${trad('Capital restant dû (€)')}</label>
            <input type="number" step="any" class="champ-large"
                   data-path="etabs.${idxEtab}.dettes.${i}.montant" value="${restant}"></div>
          <!-- La mensualite n'a qu'un porteur, et le lien decide lequel : quand
               une charge fixe rembourse ce credit, c'est elle qui la detient, et
               la lecture va la chercher chez elle. Offrir le champ ici en ferait
               une seconde surface d'edition, et la perdante : on y ecrirait un
               montant que rien ne relirait. La regle vaut deja pour la fenetre
               du credit ; elle valait pour cette fiche aussi.
               (Aucun backtick dans ce commentaire : il vit dans un litteral de
               gabarit, et fermerait la chaine.) -->
          ${chargeDuCredit(d.id) ? `
          <div class="field"><label>${trad('Mensualité (€)')}${aide(trad("Elle se règle dans la charge fixe qui rembourse ce crédit, pour n'exister qu'à un seul endroit. Un second champ ici laisserait les deux diverger, et c'est celui-ci que rien ne relirait."))}</label>
            <p class="hint" style="margin:0">${fmtEUR(mensualiteCredit(d))} ${trad('par mois, depuis la charge')}
              <b>${esc(chargeDuCredit(d.id).charge.label || trad('Charge fixe'))}</b></p></div>`
          : `
          <div class="field"><label>${trad('Mensualité (€)')}</label>
            <input type="number" step="any" class="champ-large"
                   data-path="etabs.${idxEtab}.dettes.${i}.mensualite" value="${num(d.mensualite) || ''}"></div>`}
          <!-- Le taux sert a lire le contrat : date de fin, interets restants,
               part de capital de la mensualite. Il n'ecrit jamais le capital
               restant du, qui reste ce que dit le releve de la banque. -->
          <div class="field"><label>Taux annuel (%)${aide(trad("Il donne la date de fin du crédit, ce qu'il te reste à payer d'intérêts, et la part de capital de chaque mensualité. Ton capital restant dû, lui, reste celui que tu saisis : jamais un montant projeté."))}</label>
            <input type="number" step="0.01" class="champ-large"
                   data-path="etabs.${idxEtab}.dettes.${i}.taux" value="${num(d.taux) || ''}"></div>
          <!-- Qui prête. Le contenant porte le nom du bien, « Appartement », pas
               celui de la banque : sans ce champ, rien dans l'application ne
               disait aupres de qui le pret est souscrit. « Organisme » est deja
               le mot employe par les charges fixes. -->
          <div class="field"><label>Organisme</label>
            <input class="champ-large" style="text-align:left"
                   data-path="etabs.${idxEtab}.dettes.${i}.organisme"
                   value="${esc(d.organisme || '')}" placeholder="${trad('ex. Crédit Agricole')}"></div>
        </div>
      </div>`;
    }).join('')}
    ${credit ? `<p class="small muted" style="margin:12px 0 0">
      Après chaque mensualité, baisse le capital restant dû : ton patrimoine net
      monte d'autant, sans que la valeur du bien change. Le crédit est porté par
      ${esc(nomEtabDe(c))}, il se retrouve aussi sur sa fiche.
    </p>` : ''}
  </div>`;
}

/* Un bouton « Enregistrer » sur une fiche, alors que tout y est deja ecrit.

   La regle du projet dit qu'une page ecrit a la frappe et qu'un bouton
   « Enregistrer » y serait pire : on corrige un montant en haut, on descend, on
   quitte, et un bouton non clique aurait tout jete. Ce bouton-ci ne change donc
   rien a l'ecriture — elle a deja eu lieu, champ par champ, avec le lisere vert
   de `marquerEcrit()`.

   Il ecrit et il reste, comme dans une fenetre de saisie en serie : une fiche de
   bien porte une dizaine de champs et trois cartes de chiffres derives, et on
   vient justement voir ce que la saisie a change. « Enregistrer et fermer »
   emportait l'ecran avant qu'on ait pu relire les comptes, et il fallait
   revenir. Le depart, lui, se fait par la navigation, qui ne perd rien.

   « Annuler » reste, et rend la fiche telle qu'elle etait au dernier point
   connu — l'ouverture, ou le dernier « Enregistrer ». */
/* La rangee de validation d'une fiche, au bas de la carte qui porte les champs.

   Elle appartient au formulaire qu'elle valide : c'est la qu'on vient de taper, et
   une rangee posee hors des cartes flotterait dans une page ou tout est encadre.
   Rassemblee avec Archiver et Cloturer-supprimer, elle formait un mur de quatre
   rectangles identiques sous un seul titre, sans ordre de lecture.

   `.fiche-actes` porte la geometrie, la meme pour toutes les rangees de boutons
   d'une fiche : les cartes ayant la meme largeur, les quatre boutons gardent leur
   taille et leur bord droit d'une carte a l'autre. `apres-champs` n'ajoute qu'un
   filet, parce que celle-ci ferme une carte au lieu de suivre son titre.

   Elle vient avant ce qui detruit : le doigt ne doit pas traverser le rouge pour
   atteindre « Enregistrer ». */
function barreValiderFiche(retour = 'accounts') {
  return `
    <div class="fiche-actes apres-champs">
      <button class="btn ghost" data-action="annuler-fiche"
              data-view="${esc(retour)}">${trad('Annuler')}</button>
      <button class="btn primary" data-action="enregistrer-fiche">${trad('Enregistrer')}</button>
    </div>`;
}

/* L'etat d'une fiche a son ouverture, pour pouvoir y revenir.

   « Annuler » ne peut pas vouloir dire « ne rien ecrire » : la fiche ecrit a
   chaque frappe, et c'est ce qui garantit qu'on ne perd jamais un montant en
   changeant d'ecran. La regle du projet est explicite la-dessus, avec sa raison :
   un bouton qui conditionne l'ecriture jette tout ce qu'on a tape si on quitte
   sans le voir.

   L'instantane se prend au premier rendu d'une route, pas a chaque rendu : la
   fiche se re-rend a chaque frappe de certains champs, et reprendre la photo a
   ce moment-la la rendrait toujours identique. */
let ficheAvant = null;

function memoriserFiche(cle, objet) {
  if (!ficheAvant || ficheAvant.cle !== cle) {
    ficheAvant = { cle, copie: JSON.stringify(objet) };
  }
}

function ficheModifiee() {
  if (!ficheAvant) return false;
  const o = objetDeFiche(ficheAvant.cle);
  return !!o && JSON.stringify(o) !== ficheAvant.copie;
}

function objetDeFiche(cle) {
  const [quoi, id] = String(cle).split(':');
  return quoi === 'compte' ? compteById(id) : etabById(id);
}

function retablirFiche() {
  if (!ficheAvant) return false;
  const [quoi, id] = String(ficheAvant.cle).split(':');
  const liste = quoi === 'compte' ? Store.state.comptes : Store.state.etabs;
  const i = liste.findIndex(x => x.id === id);
  if (i < 0) return false;
  liste[i] = JSON.parse(ficheAvant.copie);
  return true;
}

function viewFicheCompte(id) {
  const c = compteById(id);
  if (!c) return `<div class="card"><p class="empty">${trad('Ce compte n’existe plus.')}</p>
    <button class="btn" data-action="goto" data-view="accounts" data-anchor="">${trad('Retour aux actifs')}</button></div>`;
  const idx = Store.state.comptes.indexOf(c);
  const t = typeCompte(c.type);
  memoriserFiche(`compte:${c.id}`, c);
  const lignes = lignesDe(c);
  const parClasse = new Map();
  for (const e of (c.cash || [])) parClasse.set('liquidites', (parClasse.get('liquidites') || 0) + num(e.montant));
  for (const l of lignes) if (!l.marche || true) parClasse.set(l.classe, (parClasse.get(l.classe) || 0) + l.valeur);

  return `
  <button type="button" class="btn sm ghost retour-page" data-action="goto" data-view="accounts" data-anchor="">‹ ${trad('Actifs')}</button>

  <div class="card cpt-entete">
    <div>
      <!-- Les deux fiches se ressemblent maintenant, et c'est le but : on ne
           savait pas dire si l'on regardait un compte ou un etablissement.
           Les deux pages portaient le meme titre de barre du haut, « Comptes »,
           et le nom se lisait dans une etiquette grise de 11 px qui melangeait
           le nom du compte et celui du courtier, separes d'un point median.

           Meme structure des deux cotes : la nature en petit, le nom en grand,
           le montant, puis ce qui precise. La difference se lit a la pastille —
           un titre pastille est un etablissement, un titre nu est un compte. -->
      <span class="hero-label">${majuscule(motCompte(t))}</span>
      <h2 class="fiche-nom">${esc(nomCompteV2(c))}</h2>
      <!-- Un compte archive n'affiche pas de montant. La valeur d'un compte
           sorti des totaux vaut zero : le chiffre ne disait pas ce que le compte
           contient, il disait ce qu'il pese. Et « 0,00 € » en gros, sous le nom,
           se lit comme un solde. Le sous-titre dit « archive », c'est tout ce
           qu'il y a a savoir.
           (Pas d'accent grave ici, meme raison qu'ailleurs dans ce fichier.) -->
      ${c.statut === 'archive' ? '' : `<div class="cpt-net">${fmtEUR(valeurCompte(c))}</div>`}
      <span class="sub">${esc([sousTitreCompte(c, false), c.statut === 'archive' ? trad('archivé') : '']
        .filter(Boolean).join(' · '))}</span>
      <!-- Ce qu'il reste a verser, sous le montant : c'est la que la question se
           pose, en regardant ce qu'il y a dessus. Une jauge et une phrase, parce
           que « 12 950 EUR » sans la barre ne dit pas si on en est loin, et que
           la barre sans le montant ne dit pas de combien. -->
      ${(() => {
        const p = resteAVerser(c);
        if (!p) return '';
        return `
        <div class="plafond${p.plein ? ' plein' : ''}">
          <div class="plafond-jauge" aria-hidden="true">
            <i style="width:${p.part.toFixed(1)}%"></i>
          </div>
          <span class="sub">${p.plein
            ? `Plafond de ${fmtEUR0(p.plafond)} atteint`
            : `Il reste <b>${fmtEUR0(p.reste)}</b> à verser sur ${fmtEUR0(p.plafond)}`}</span>
        </div>`;
      })()}
      <!-- Le chemin vers l'etablissement, toujours la quand le compte en a un.
           Il existait deja, mais au fond de la carte « Financement », qui ne se
           rend que s'il y a un credit : un compte sans dette n'avait aucun
           chemin vers la banque qui le tient, alors que la liste, elle, range
           les comptes sous leur etablissement.
           La teinte vient de teinteDominante() sur les comptes de cet
           etablissement, la meme source que la liste et que sa fiche.
           (Aucun guillemet oblique dans ce commentaire : il vit dans un
           litteral de gabarit, un backtick y fermerait la chaine.) -->
      ${(() => {
        const et = c.etabId && etabById(c.etabId);
        if (!et) return '';
        const siens = COMPTES().filter(x => x.etabId === et.id);
        return `<button type="button" class="btn sm ghost lien-etab"
                data-action="fiche-etab" data-id="${esc(et.id)}"
                style="--teinte:${teinteDominante(siens)}"
                title="${trad('Voir l’établissement qui tient ce compte')}">
          <span class="cpt-pastille" aria-hidden="true"></span>${esc(et.nom)} ›</button>`;
      })()}
    </div>
    <dl class="kv" style="margin-left:auto">
      ${[...parClasse.entries()].filter(([, v]) => v).map(([k, v]) =>
        `<dt>${esc(CLASSES_ACTIFS[k] || k)}</dt><dd>${fmtEUR(v)}</dd>`).join('')}
    </dl>
  </div>

  ${espaceBien(c, idx, t)}

  <!-- Un studio n'a pas de trésorerie : la carte ne s'affiche que pour les
       enveloppes qui peuvent en porter, ou celles qui en portent déjà. -->
  <!-- Un contrat n'a pas de poche de cash : l'argent verse est sur un support
       des son arrivee. La carte disparait donc, sauf si elle porte deja quelque
       chose — retirer un ecran ne doit pas emporter ce que quelqu'un y avait
       saisi, et ces euros-la doivent pouvoir etre reclasses a la main. -->
  ${(t.sansCash || !t.classes.includes('liquidites')) && !(c.cash || []).length ? '' : `
  <div class="card">
    <div class="card-head"><h2>${BASES.liquidites.nom} ${trad('sur ce compte')}</h2>
      <button class="btn sm ghost" data-action="scinder-cash" data-id="${esc(c.id)}"
              title="${trad('Déclarer un second usage sur le même compte')}">${trad('Scinder')}</button>
    </div>
    ${(c.cash || []).length ? (c.cash || []).map((e, i) => `
      <div class="plc-ligne">
        <span class="cpt-nom">${trad('Liquidités')}</span>
        <select data-path="comptes.${idx}.cash.${i}.affectation" class="annee" title="${trad('À quoi sert cet argent ?')}">
          ${AFFECTATIONS.map(([v, l]) => `<option value="${v}" ${v === e.affectation ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <!-- L'unite se dit a cote du champ. « Le champ liquidite, c'est precise
             nulle part euro ou autre. » Tous les autres montants de l'application
             s'affichent formates, donc avec leur symbole ; celui-ci est un champ
             de saisie, il montrait un nombre nu. L'ambiguite ne coutait rien tant
             qu'on savait, et c'est exactement le genre de chose qu'on ne sait plus
             six mois apres.

             L'application compte en euros de bout en bout — seules les lignes de
             titres portent une devise, avec leur taux de change. Ce n'est donc pas
             un choix a offrir ici mais un fait a rappeler. -->
        <input type="number" step="any" class="champ-inline" data-path="comptes.${idx}.cash.${i}.montant" value="${num(e.montant)}">
        <span class="champ-unite" aria-hidden="true">€</span>
        <!-- Retirer la derniere part d'un compte d'especes le laisserait sans
             champ ou saisir un montant, sur un compte qu'on ne peut pas
             supprimer : un cul-de-sac. Mettre a 0 est le geste. -->
        <!-- Nomme, comme le bouton qui retire un credit : un ✕ gris est le signe
             le plus discret de l'ecran pour l'acte qui en efface un montant, et
             on ne le trouve que par accident. Fantome et non plein, a la
             difference du credit : un compte peut declarer trois parts, et trois
             aplats rouges dans une carte se lisent comme une alerte. C'est aussi
             le traitement de « Cloturer et supprimer », l'autre acte destructeur
             de cette page. -->
        ${t.interne && (c.cash || []).length < 2 ? ''
          : `<button class="btn sm ghost danger" data-action="retirer-cash" data-id="${esc(c.id)}" data-i="${i}" title="${trad('Retirer cette part')}">${trad('Retirer')}</button>`}
      </div>`).join('')
    : `<p class="empty">${t.titres
        ? trad('Aucune espèce en attente. « Scinder » déclare un montant à investir.')
        : trad('Pas d’argent déclaré sur ce compte. « Scinder » ajoute une première part.')}</p>`}
  </div>`}

  <!-- Un bien a déjà sa carte au-dessus : la répéter en « placement détenu »
       montrerait deux fois la même ligne, dans deux mises en forme. Un compte
       courant ou un livret ne portent que des espèces : la carte y restait
       vide à vie, sous un titre qui promettait autre chose. -->
  ${estBien(t) || (!t.classes.some(x => x !== 'liquidites') && !lignes.length) ? '' : `
  <div class="card">
    <!-- La liste deroulante de chaque ligne n'avait d'explication que dans son
         attribut title : invisible au doigt, et « Auto, Quelques jours » est une
         valeur, pas un intitule. On ne pouvait donc pas savoir ce que ce menu commande.

         L'explication est posee une fois, sur l'en-tete, parce que toutes les
         listes de la carte font la meme chose — une par ligne aurait repete la
         meme phrase autant de fois qu'il y a de placements. Le mot
         « Disponibilite » sert de titre de colonne, ce qui manquait aussi. -->
    <!-- « Supports » sur une enveloppe : la carte y porte les deux natures, et
         « Lignes de titres » en nommait une seule — le fonds euros et la SCPI
         qui vivent dessous auraient ete annonces comme des titres. C'est aussi
         le mot du contrat, celui qu'on lit sur son releve d'assurance. -->
    <div class="card-head"><h2>${trad(t.melange ? 'Supports du contrat'
      : t.titres ? 'Lignes de titres' : 'Placements détenus')}</h2>
      <span class="hint">${trad('Disponibilité')}${aide(trad("Sous combien de temps chaque placement redevient de l’argent disponible. Elle alimente la carte « Autonomie financière » de l’accueil. « Auto » suit la règle du type de compte : un PEA de moins de cinq ans est bloqué, un compte-titres se vend en séance. La règle se trompe parfois : un non coté peut se revendre sur un marché secondaire, c’est pourquoi chaque ligne peut la contredire."))}</span>
      <!-- Le geste, jamais l'itineraire. Un compte a titres renvoyait a Marches
           par un lien : quand une page doit donner le chemin vers son propre
           geste, c'est le geste qui est mal place. Le bouton ouvre la recherche
           en visant ce compte, et la ligne creee y atterrit sans qu'on ait a le
           rechoisir.
           Deux boutons sur une enveloppe, celle que son type dit melangee : la
           moitie de ses supports cote et l'autre non, il faut les deux portes.
           Un compte-titres n'en garde qu'une, sinon on saisirait a la main un
           titre dont le cours arrive seul, et cette ligne-la ne se mettrait
           plus jamais a jour.
           (Aucun backtick ici : ce commentaire vit dans un litteral de gabarit,
           et le premier refermerait la chaine.) -->
      ${t.titres ? `<button class="btn sm ghost" data-action="ajouter-ligne" data-compte="${esc(c.id)}"
                   title="${trad('Chercher un titre coté et le poser sur ce compte')}">${trad('+ Titre coté')}</button>` : ''}
      ${!t.titres || t.melange ? `<button class="btn sm ghost" data-action="ajouter-placement" data-id="${esc(c.id)}"
                   title="${trad('Ajouter un placement à ce compte')}">${trad('+ Placement')}</button>` : ''}
    </div>
    ${lignes.length ? lignes.map(l => lignePlacement(l, c, true)).join('')
      : `<div class="empty">
          <p style="margin:0 0 12px">${trad('Aucun placement pour l’instant.')} ${trad(t.melange
            ? 'Un contrat porte ce qu’il propose : un ETF qui cote, un fonds euros qui ne cote nulle part, une SCPI. Les deux boutons ci-dessus mènent chacun à l’un des deux.'
            : t.titres
            ? 'Les lignes se créent dans l’onglet Marchés, rattachées à ce compte.'
            : 'Un prêt participatif, une part de société, un projet : chacun sa ligne, avec son échéance.')}</p>
          ${t.titres && !t.melange ? '' : `<button class="btn sm" data-action="ajouter-placement" data-id="${esc(c.id)}"
                   >${trad('+ Ajouter un placement')}</button>`}
        </div>`}
  </div>`}

  ${(() => {
    /* Le financement, sur toute fiche de compte et non plus seulement sur celle
       d'un bien.

       Un courtier qui prete sur marge se declare comme un credit, et le seul endroit ou on pouvait le saisir etait la fiche de
       l'etablissement, un etage au-dessus. Or la question se pose en regardant le
       compte qui porte les titres achetes avec cet argent : c'est la qu'on vient
       la poser, et il n'y avait rien. Un bien immobilier, lui, avait sa carte
       depuis le debut, par `espaceBien()`.

       La dette reste rangee sur l'etablissement, elle n'est pas recopiee ici : le
       bouton ecrit au meme endroit que la fiche du dessus, et le sous-titre nomme
       l'etablissement pour qu'on ne croie pas qu'elle appartient a ce compte-la.
       Un etablissement qui tient deux comptes montre donc le meme credit sur les
       deux fiches — c'est une lecture, et elle dit d'ou elle vient. */
    if (estBien(t) || !c.etabId) return '';
    const { etab, dettes, total } = creditsDuCompte(c);
    if (!etab) return '';
    const valeur = valeurCompte(c);
    return `
  <div class="card">
    <div class="card-head"><h2>${trad('Financement')}${aide(trad("Ce que cet établissement te prête : une marge de courtier, un prêt sur titres, une avance. Les placements achetés avec cet argent restent comptés en entier dans tes avoirs, puisque tu les possèdes, et le montant prêté se retranche de ton patrimoine net. Ne le note pas en liquidités négatives sur le compte : il compterait deux fois, et aucun écran ne le dirait. Le crédit appartient à l’établissement, pas à ce compte : s’il en tient plusieurs, il n’est déduit qu’une fois du patrimoine."))}</h2>
      <span class="hint">${dettes.length
        ? `${trad('chez')} ${esc(etab.nom)}, ${trad('pour tous ses comptes')}`
        : trad('marge, prêt sur titres, avance')}</span>
      <button class="btn sm ghost" data-action="ajouter-credit" data-id="${esc(c.etabId)}">${trad('+ Crédit')}</button></div>
    ${!dettes.length ? `
    <p class="small muted" style="margin:0">${trad('Aucun crédit chez')} ${esc(etab.nom)}.
      ${trad('Si ce courtier te prête, sur marge par exemple, déclare-le ici.')}</p>`
    : `<div class="mlist-groupe">${dettes.map(({ d, i }) => `
      <button type="button" class="mlist" data-action="editer-credit"
              data-etab="${esc(etab.id)}" data-i="${i}" title="${trad('Modifier ce crédit')}">
        <span class="ml-nom">${esc(d.libelle || 'Crédit')}
          <span class="sub">${esc([d.preteur, d.taux ? `${fmtNombre(num(d.taux))} % l’an` : '',
            d.mensualite ? `${fmtEUR0(num(d.mensualite))} par mois` : ''].filter(Boolean).join(' · ')
            || 'capital restant dû')}</span></span>
        <span class="ml-chiffres"><b class="dette">−${fmtEUR(num(d.montant))}</b></span>
        <span class="ml-chev" aria-hidden="true">›</span>
      </button>`).join('')}</div>
    <dl class="kv" style="margin-top:12px">
      <dt>${trad('Valeur du')} ${motCompte(t)}</dt><dd>${fmtEUR(valeur)}</dd>
      <dt>${trad('Crédits chez')} ${esc(etab.nom)}</dt><dd class="dette">−${fmtEUR(total)}</dd>
      <dt><b>${trad('Ce que tu possèdes')}</b>${aide(trad("La valeur du compte moins ce que tu dois à cet établissement. C’est ce montant qui compte dans ton patrimoine net. Si l’établissement tient plusieurs comptes, le crédit est déduit une seule fois du patrimoine, pas une fois par compte."))}</dt>
      <!-- Un solde negatif se peint comme une dette : devoir plus que ce que le
           compte porte est un etat reel, et il ne doit pas se lire comme un
           avoir. -->
      <dd class="${valeur - total < 0 ? 'dette' : ''}"><b>${fmtEUR(valeur - total)}</b></dd>
      ${valeur - total > 0.005 ? `<dt>Effet de levier${aide(trad("Ce que tu contrôles rapporté à ce qui est vraiment à toi sur ce compte. À 150 %, une baisse de 10 % des titres coûte 15 % de tes capitaux propres. Ce chiffre ne dit rien de la marge d’appel : l’application ne connaît pas les règles de ton courtier."))}</dt>
        <dd>${fmtPct(valeur / (valeur - total) * 100, 0)}
          <span class="muted">${trad('de tes capitaux propres')}</span></dd>` : ''}
    </dl>
    <button class="btn sm ghost" data-action="fiche-etab" data-id="${esc(etab.id)}"
            style="margin-top:12px">${trad('Fiche')} ${esc(etab.nom)} ›</button>`}
  </div>`;
  })()}

  <div class="card">
      <div class="card-head"><h2>${trad('Informations')}</h2>
        <button class="btn sm ghost" data-action="modifier-compte" data-id="${esc(c.id)}">${trad('Modifier')}</button></div>
      <!-- Ces champs se lisent, ils ne se saisissent plus.

           Le montant des liquidites, lui, reste en saisie directe ailleurs sur
           cette page : c'est le seul champ de la fiche qu'on revient corriger
           tous les mois. La regle n'est pas « tout derriere un bouton », elle
           est « la frequence commande la forme ».

           Les notes restent ouvertes pour la meme raison, en sens inverse :
           une note s'ajoute a n'importe quel moment, souvent parce qu'on vient
           justement de penser a quelque chose.

           Ce qui n'est pas renseigne ne s'affiche pas, sauf la ou son absence
           est un manque : un PEA sans date d'ouverture ne peut pas dire quand
           il se debloque, donc la ligne reste et reclame. -->
      <dl class="kv">
        <!-- Sans nom propre, la ligne repetait le type mot pour mot juste
             au-dessus de la ligne « Type de compte » : « Bien de valeur /
             Bien de valeur ». Un champ vide se dit vide, il ne se remplit pas
             du voisin. -->
        <dt>${trad('Nom du')} ${motCompte(t)}</dt><dd>${c.libelle ? esc(c.libelle)
          : `<span class="muted">${trad('non renseigné')}</span>`}</dd>
        <!-- Le type se change, ce qui n'etait pas le cas.

             La seule issue apres une faute de frappe etait de supprimer et
             recreer, et les releves mensuels etant indexes par identifiant de
             compte, recreer perd tout l'historique. L'absence de ce reglage ne
             protegeait rien, elle poussait vers un contournement destructeur.

             Tous les types restent proposes, meme ceux qui ne conviennent pas :
             un choix impossible se refuse avec sa raison, et cette raison dit
             quoi deplacer. Griser l'option aurait laisse deviner pourquoi. Cette
             validation vit maintenant dans l'action modifier-compte, qui rouvre
             la fenetre en gardant la saisie plutot que de la perdre.
             (Aucun guillemet oblique ici : ce commentaire vit dans un litteral
             de gabarit, un backtick y fermerait la chaine.) -->
        <dt>${trad('Type de')} ${motCompte(t)}${aide(t.interne
          ? trad('Les espèces n’ont pas d’établissement : personne ne les tient pour '
          + 'toi. Ce compte existe une fois, il ne se choisit pas dans la liste '
          + 'et ne se supprime pas. S’il n’y a plus de billets, mets-le à 0.')
          : trad('Il commande la poche du patrimoine, les classes que le compte peut '
          + 'porter et la disponibilité de ce qu’il contient. On peut le corriger '
          + 'à tout moment : l’historique des relevés suit le compte, il ne se '
          + 'perd pas. Un changement qui laisserait un placement sans place est '
          + 'refusé, en disant lequel déplacer. '
          + 'Non coté : deux types, deux métiers. « Placements non cotés » pour des '
          + 'parts de société, Plateforme A ou un pacte d’associés : on sort au rachat, '
          + 'pas à une date. « Financement participatif » pour un prêt à un taux, '
          + 'avec une échéance et un état : ces lignes-là portent une date de '
          + 'remboursement, et l’application te rappelle celles qui l’ont dépassée.'))}</dt>
        <dd>${esc(trad(t.label))}${t.interne ? trad(', sans établissement') : ''}</dd>
        <!-- Le plafond, sur les livrets seulement, et saisi plutot que deduit :
             le modele connait le type « livret », pas le produit. Une table des
             plafonds par produit aurait demande d'etre tenue a jour a chaque
             revalorisation reglementaire, pour un chiffre que le detenteur a sous
             les yeux. Il reste facultatif, mais la ligne s'affiche meme vide :
             sur un livret, savoir qu'on peut declarer un plafond fait partie de
             ce que la fiche doit dire. -->
        ${t.id === 'livret' ? `
        <dt>${trad('Plafond de versement')}${aide(trad("Facultatif. Une fois posé, la fiche dit ce qu’il reste à verser. Les plafonds courants : 22 950 € pour un Livret A, 12 000 € pour un LDDS, 10 000 € pour un LEP. Les intérêts peuvent faire dépasser le plafond, c’est normal et la fiche l’annonce alors comme plein."))}</dt>
        <dd>${num(c.plafond) ? fmtEUR(c.plafond)
              : `<span class="muted">${trad('non renseigné')}</span>`}</dd>` : ''}
        ${t.dateSensible ? `
        <dt>${trad('Date d’ouverture')}${aide(trad("Elle conditionne la disponibilité : un PEA se débloque à cinq ans, une assurance-vie à huit, un PER à la retraite. C’est pour cela qu’elle est demandée ici et pas sur les autres types de compte."))}</dt>
        <dd>${c.ouvertLe ? esc(fmtDate(c.ouvertLe))
              : `<span class="muted">${trad('à renseigner')}</span>`}</dd>`
        : c.ouvertLe ? `<dt>${motDateCompte(t)}</dt><dd>${esc(fmtDate(c.ouvertLe))}</dd>` : ''}
        <!-- L'autre bout de la vie du compte. Elle ne s'affiche que sur un
             compte archivé : sur un compte ouvert, une ligne « Date de
             clôture » vide inviterait à la remplir, ce qui reviendrait à
             déclarer une fermeture par un champ de date au lieu du bouton qui
             la fait. Un état se déclare, il ne se déduit pas d'une date. -->
        ${c.statut === 'archive' ? `<dt>${trad('Date de clôture')}</dt>
        <dd>${c.clotureLe ? esc(fmtDate(c.clotureLe))
              : `<span class="muted">${trad('non renseignée')}</span>`}</dd>` : ''}
        ${!t.interne && c.numero ? `<dt>${trad('Numéro de compte')}</dt><dd>${esc(c.numero)}</dd>` : ''}
      </dl>
      <!-- Le depliant portait numero, notes et date d'ouverture. Les deux
           champs administratifs sont passes derriere « Modifier » avec le reste
           de l'identite du compte ; il ne restait que les notes, et un depliant
           qui cache une seule ligne coute un geste pour ne rien ranger. La note
           s'ecrit donc a decouvert, en saisie directe : c'est le champ qu'on
           remplit au moment ou l'on y pense. -->
      <div class="field" style="margin-top:12px"><label>Notes</label>
        <input data-path="comptes.${idx}.notes" value="${esc(c.notes || '')}"
               placeholder="${trad('facultatif')}" style="text-align:left"></div>
      ${barreValiderFiche()}
    </div>
    <!-- La carte ne porte que la vie du compte, et son titre le dit.

         Rassembles, les quatre boutons formaient un mur : quatre rectangles de meme
         taille empiles sous un seul titre, sans ordre de lecture, et deux natures
         d'acte que seul le remplissage distinguait. La validation appartient au
         formulaire qu'elle valide, donc au bas de la carte des champs ; ici ne reste
         que ce qui decide de la vie du compte, juste au-dessus de la phrase qui
         explique archiver et supprimer.

         Les deux rangees gardent la meme classe et donc la meme geometrie : les deux
         cartes ont la meme largeur, leurs colonnes coincident, et les quatre boutons
         partagent leur taille et leur bord droit d'une carte a l'autre.
         (Aucun backtick dans ce commentaire : il vit dans un litteral de gabarit,
         et fermerait la chaine.) -->
    <div class="card">
      <div class="card-head"><h2>${trad('actions.fiche', 'Actions')}</h2></div>
      <div class="fiche-actes">
        ${c.statut === 'archive'
          ? `<button class="btn ghost" data-action="restaurer-compte" data-id="${esc(c.id)}">${trad('Restaurer')}</button>`
          : `<button class="btn ghost" data-action="archiver-compte" data-id="${esc(c.id)}">${trad('Archiver')}</button>`}
        <button class="btn ghost danger" data-action="supprimer-compte" data-id="${esc(c.id)}">${trad('Clôturer et supprimer')}</button>
      </div>
      <p class="small muted" style="margin:12px 0 0">
        ${trad('Archiver conserve l’historique et sort le compte de tous les totaux. '
          + 'Supprimer efface aussi ses montants des vues. Les relevés passés restent lisibles.')}
      </p>
    </div>`;
}

/* ------------------------------------------------------------
   Fiche établissement
   ------------------------------------------------------------ */
function viewFicheEtab(id) {
  const e = etabById(id);
  if (!e) return `<div class="card"><p class="empty">${trad('Cet établissement n’existe plus.')}</p>
    <button class="btn" data-action="goto" data-view="accounts" data-anchor="">${trad('Retour aux actifs')}</button></div>`;
  const idx = Store.state.etabs.indexOf(e);
  memoriserFiche(`etab:${e.id}`, e);
  const siens = COMPTES().filter(c => c.etabId === e.id && c.statut !== 'archive');
  const total = siens.reduce((s, c) => s + valeurCompte(c), 0);
  const credits = (e.dettes || []).reduce((s, d) => s + num(d.montant), 0);

  return `
  <button type="button" class="btn sm ghost retour-page" data-action="goto" data-view="accounts" data-anchor="">‹ ${trad('Actifs')}</button>

  <!-- Le nom s'ecrit, il ne se saisit plus.

       Il n'etait affiche nulle part ailleurs sur cette page : le titre de la
       barre du haut dit « Comptes », pas le nom du courtier. Le seul endroit ou on lisait
       le nom de l'etablissement etait donc l'interieur de son champ de saisie —
       une valeur qu'on ne peut lire qu'en la mettant en danger. Il devient un
       titre, et le champ part derriere « Modifier ». -->
  <div class="card cpt-entete" style="--teinte:${teinteDominante(siens)}">
    <div>
      <!-- Pas de bulle d'aide ici : ce mot se lit comme une etiquette de
           categorie, il ne pose aucune question. L'explication de sa derivation
           reste dans la fenetre « Modifier », a cote du champ en lecture qui la
           porte : c'est la seule ou quelqu'un peut se demander pourquoi il ne
           se regle pas. -->
      <span class="hero-label">${esc(trad(contenantDeLEtab(e.id).titre))}</span>
      <!-- La meme pastille que dans la liste, et surtout la meme teinte : elle
           vient de teinteDominante(siens), la fonction qui colore deja le
           groupe. La recalculer autrement aurait donne deux couleurs pour un
           seul etablissement, celle de la liste et celle de sa fiche, sans que
           rien ne dise laquelle a raison.
           (Aucun guillemet oblique ici : ce commentaire vit dans un litteral
           de gabarit, un backtick y fermerait la chaine.) -->
      <h2 class="fiche-nom"><span class="cpt-pastille" aria-hidden="true"></span>${esc(e.nom)}</h2>
      <div class="cpt-net">${fmtEUR(total - credits)}</div>
      <span class="sub">${siens.length} ${motContenu(e.id, siens.length)}${credits ? ` · ${fmtEUR0(credits)} ${trad('de crédits')}` : ''}</span>
    </div>
    <button class="btn sm ghost" style="margin-left:auto"
            data-action="modifier-etab" data-id="${esc(e.id)}">${trad('Modifier')}</button>
  </div>

  <div class="card">
    <!-- La carte s'appelait « Comptes rattachés » sans offrir d'en rattacher
         un : il fallait revenir à la liste, relancer l'ajout, et rechoisir
         l'établissement sur la page duquel on se trouvait déjà. -->
    <div class="card-head"><h2>${majuscule(motContenu(e.id, 2))} ${trad('rattachés')}</h2>
      <button class="btn sm ghost" data-action="ajouter-compte" data-etab="${esc(e.id)}"
              title="${trad('Ajouter un')} ${motContenu(e.id, 1)} ${trad('chez')} ${esc(e.nom)}"
              >+ ${majuscule(motContenu(e.id, 1))}</button></div>
    ${siens.length ? siens.map(c => ligneCompte(c, false)).join('')
      : `<div class="empty">
          <p style="margin:0 0 12px">${trad('Aucun compte ici pour l’instant.')}</p>
          <button class="btn sm" data-action="ajouter-compte" data-etab="${esc(e.id)}"
            >+ ${trad('Ajouter un')} ${motContenu(e.id, 1)} ${trad('chez')} ${esc(e.nom)}</button>
        </div>`}
  </div>

  <div class="card">
    <div class="card-head"><h2>${trad('Crédits en cours')}${aide(trad("Un crédit pèse en négatif sur le patrimoine net : patrimoine net = total de tes avoirs moins tes crédits."))}</h2>
      <button class="btn sm ghost" data-action="ajouter-credit" data-id="${esc(e.id)}">${trad('+ Crédit')}</button></div>
    ${(e.dettes || []).length ? e.dettes.map((d, i) => `
      <div class="plc-ligne">
        <input data-path="etabs.${idx}.dettes.${i}.libelle" value="${esc(d.libelle)}" style="text-align:left; max-width:14em">
        <span class="spacer"></span>
        <input type="number" step="any" class="champ-inline" data-path="etabs.${idx}.dettes.${i}.montant" value="${num(d.montant)}">
        <!-- Un ✕ gris pour retirer un prêt de 30 000 € : l'action la plus
             lourde de l'écran portait le signe le plus discret. Elle est
             nommée et rouge — c'est ce qu'on vient faire ici quand un crédit
             ne finance plus rien. -->
        <button class="btn sm danger" data-action="retirer-credit"
                data-id="${esc(e.id)}" data-i="${i}">${trad('Supprimer')}</button>
      </div>`).join('') + `
      <p class="small muted" style="margin:12px 0 0">
        ${trad('Après chaque mensualité, baisse le capital restant dû : ton patrimoine net '
          + 'monte d’autant, sans que la valeur du bien change.')}
      </p>`
    : `<p class="empty">${trad('Aucun crédit déclaré chez')} ${esc(e.nom)}.</p>`}
  </div>

  <!-- La carte des champs de cette fiche, donc celle qui porte la validation. Un
       etablissement ne s'archive ni ne se cloture depuis sa fiche : il n'y a pas de
       carte « Actions » ou la ranger, et une carte a elle seule pour deux boutons
       pesait plus que ce qu'elle annonce. -->
  <div class="card">
    <div class="card-head"><h2>${trad('Notes')}</h2></div>
    <input data-path="etabs.${idx}.notes" value="${esc(e.notes || '')}" placeholder="${trad('facultatif')}" style="text-align:left">
    ${barreValiderFiche()}
  </div>`;
}

/* Glisser une ligne vers la gauche révèle Modifier / Archiver.

   Le geste ne s'engage qu'une fois le sens décidé — sinon un défilement
   vertical du doigt entraînait la ligne de quelques pixels sur le côté, et
   toute la liste tremblait pendant qu'on la parcourait.

   La position se pose dans une trame d'animation, pas à chaque événement
   tactile : un doigt émet jusqu'à 120 événements par seconde là où l'écran
   n'en affiche que 60 ou 120. Écrire deux fois la même trame ne se voit pas,
   mais coûte deux recalculs de style — et c'est ce qui donne la sensation de
   caoutchouc. `translate3d` garde la ligne sur sa propre couche.

   La course s'amortit en fin de trajet : passé la butée, le doigt continue et
   la ligne ne suit plus qu'au tiers. Rien ne bloque net, ce qui est la
   différence entre un geste qui répond et un geste qui bute. */
function monteSwipeComptes() {
  const BUTEE = 132, DECLENCHE = 60;
  for (const bloc of $$('.cpt-swipe')) {
    const ligne = bloc.querySelector('.cpt-ligne');
    let x0 = null, y0 = 0, dx = 0, sens = null, trame = 0;

    const poser = () => {
      trame = 0;
      const d = dx < -BUTEE ? -BUTEE + (dx + BUTEE) / 3 : dx;
      ligne.style.transform = `translate3d(${d}px, 0, 0)`;
    };

    ligne.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
      dx = 0; sens = null;
      ligne.style.transition = 'none';
      ligne.style.willChange = 'transform';
    }, { passive: true });

    ligne.addEventListener('touchmove', e => {
      if (x0 === null) return;
      const ex = e.touches[0].clientX - x0, ey = e.touches[0].clientY - y0;
      if (sens === null) {
        if (Math.abs(ex) < 6 && Math.abs(ey) < 6) return;
        sens = Math.abs(ex) > Math.abs(ey) ? 'lateral' : 'vertical';
      }
      if (sens === 'vertical') return;             // on défile, la ligne ne bouge pas
      dx = Math.min(0, ex);
      if (!trame) trame = requestAnimationFrame(poser);
    }, { passive: true });

    const fin = () => {
      if (x0 === null) return;
      if (trame) { cancelAnimationFrame(trame); trame = 0; }
      const ouvre = sens === 'lateral' && dx < -DECLENCHE;
      /* Une courbe qui décélère, pas un `ease` symétrique : le mouvement part
         vite et se pose, comme un objet qu'on lâche. */
      ligne.style.transition = 'transform .22s cubic-bezier(.22,.61,.36,1)';
      ligne.style.transform = ouvre ? `translate3d(${-BUTEE}px, 0, 0)` : '';
      bloc.classList.toggle('ouvert', ouvre);
      ligne.addEventListener('transitionend', () => { ligne.style.willChange = ''; }, { once: true });
      x0 = null; dx = 0; sens = null;
    };
    ligne.addEventListener('touchend', fin);
    ligne.addEventListener('touchcancel', fin);
  }
}


/* ------------------------------------------------------------
   Stratégie
   ------------------------------------------------------------ */
function viewStrategy() {
  const st = Store.state.strategy;
  const capital = Store.state.meta.modelCapital;
  let cum = 0;
  const thr = st.thresholds.map(t => {
    const amount = st.reserveMonthly * t.pct / 100;
    cum += amount;
    return `<tr><td class="name">${esc(t.label)}</td><td>${fmtPct(t.pct, 0)}</td>
      <td>${fmtEUR0(amount)}</td><td class="muted">${fmtEUR0(cum)}</td></tr>`;
  }).join('');

  return `
  <div class="card">
    <div class="card-head"><h2>${trad('Règle d\'achat')}</h2></div>
    <input data-path="strategy.rule" value="${esc(st.rule)}" style="text-align:left">
  </div>

  <div class="grid g-2-1">
    <div class="card">
      <div class="card-head"><h2>${trad('Déploiement par seuil')}</h2>
        <span class="hint">Réserve tactique de ${fmtEUR0(st.reserveMonthly)} ${trad('/ mois')}</span></div>
      <table>
        <thead><tr><th>Seuil</th><th>${trad('% de la réserve')}</th><th>${trad('À déployer')}</th><th>${trad('Cumul si tout déclenché')}</th></tr></thead>
        <tbody>${thr}</tbody>
        <tfoot><tr><td>Total</td><td>${fmtPct(st.thresholds.reduce((s, t) => s + t.pct, 0), 0)}</td>
          <td>${fmtEUR0(cum)}</td><td></td></tr></tfoot>
      </table>
    </div>
    <div class="card">
      <div class="card-head"><h2>${trad('Réserve tactique')}</h2></div>
      <div class="field"><label>${trad('Épargne mensuelle (€)')}</label>
        <input type="number" step="50" data-path="strategy.reserveBase" value="${st.reserveBase}"></div>
      <div class="field" style="margin-top:12px"><label>${trad('Part réservée au tactique (%)')}</label>
        <input type="number" step="5" data-path="strategy.reservePct" value="${st.reservePct}"></div>
      <div class="field" style="margin-top:12px"><label>${trad('Réserve mensuelle (€)')}</label>
        <input type="number" step="50" data-path="strategy.reserveMonthly" value="${st.reserveMonthly}"></div>
      <p class="small muted" style="margin:12px 0 0">
        ${fmtPct(st.reservePct, 0)} de ${fmtEUR0(st.reserveBase)} = ${fmtEUR0(st.reserveBase * st.reservePct / 100)}.
      </p>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>${trad('Modèles d\'allocation')}</h2>
      <div class="row"><span class="hint">${trad('Base de calcul')}</span>
        <input type="number" step="1000" data-path="meta.modelCapital" value="${capital}" style="max-width:130px"></div></div>
    <div class="grid g-2">
      ${st.models.map((m, mi) => `
        <div>
          <h3 style="margin:0 0 4px;font-size:14px">Allocation ${mi + 1}, ${esc(m.name)}</h3>
          <p class="small muted" style="margin:0 0 12px">${esc(m.note || '')}</p>
          <table>
            <thead><tr><th>${trad('Classe d\'actif')}</th><th>%</th><th>Montant</th><th style="text-align:left">Véhicules</th></tr></thead>
            <tbody>${m.lines.map(l => `<tr>
              <td class="name">${esc(l.label)}</td>
              <td>${fmtPct(l.pct, 0)}</td>
              <td>${fmtEUR0(capital * l.pct / 100)}</td>
              <td style="text-align:left" class="muted small">${esc(l.vehicles)}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr><td>Total</td><td>${fmtPct(m.lines.reduce((s, l) => s + l.pct, 0), 0)}</td>
              <td>${fmtEUR0(capital)}</td><td></td></tr></tfoot>
          </table>
        </div>`).join('')}
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   Budget & dépenses
   ------------------------------------------------------------ */
let budgetYear = null;   // null = l'année en cours
/* Tri du detail mensuel : { key, dir }, ou null pour l'ordre du calendrier.
   `key` vaut 'mois', 'total', ou le nom d'une categorie. Il ne trie que le
   tableau du grand ecran — la liste de telephone reste chronologique, elle
   n'a pas d'en-tetes pour dire son ordre, et un ordre muet est un piege. */
let depSort = null;

/* L'année affichée par défaut est l'année en cours, pas la dernière du
   calendrier : ouvrir 2027 d'avance faisait basculer tout l'onglet sur une
   année vide. La vue et son montage la calculent au même endroit, sinon le
   tableau et son graphique peuvent parler de deux années différentes. */
function budgetAnnee() {
  const annees = expenseYears();
  const courante = todayISO().slice(0, 4);
  /* « Toutes les années » a quitte le selecteur de Budget : une valeur `all`
     restee d'avant (ou posee par un vieux geste) retombe sur l'annee en
     cours, sans quoi la page afficherait un choix que le menu n'offre plus. */
  if (budgetYear === 'all') budgetYear = null;
  return budgetYear ?? (annees.includes(courante) ? courante : annees[annees.length - 1]);
}

/* « Revenus et charges » : le cadre du mois, ce qu'on regle une fois puis
   qu'on ne touche plus. Meme fonction que les depenses, meme etat calcule une
   seule fois — seuls les blocs affiches changent. Decouper en deux fonctions
   aurait duplique la vingtaine de constantes du haut, et la moindre evolution
   se serait faite a deux endroits. */
const viewBudgetCadre = () => viewBudget('cadre');

function viewBudget(section = 'depenses') {
  /* Quatre cartes vont au cadre — revenus, charges fixes, epargne, autres
     depenses — le reste au suivi des depenses. Un seul onglet s'affiche a la
     fois, la page passe de 4 400 px a environ 2 000. */
  const cadre = section === 'cadre';
  const f = budgetFrame();
  const years = expenseYears();
  const year = budgetAnnee();
  const stats = expenseYearStats(year);
  const cats = expenseByCategory(year);
  /* On garde l'index réel de chaque ligne : les champs de saisie pointent
     dessus, et le filtre par année ne doit pas les décaler. */
  const lignesDepenses = Store.state.budget.expenses
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => year === 'all' || String(r.month).startsWith(year));
  const cur = currentExpenseMonth();
  const rec = savingsReconciliation();
  const b = Store.state.budget;

  const curDiff = cur ? cur.total - f.target : 0;
  const attendu = depensesEnAttente();

  return `
  ${cadre ? '' : `
  <div class="grid g-hero">
    <!-- La brique s'ouvre sur la saisie du mois courant : c'est le geste que
         l'on vient faire ici.

         Un <button> englobant ne peut pas contenir de champ — deux controles
         imbriques n'existent pas — et l'objectif mensuel se reglait donc trois
         cartes plus bas, dans l'en-tete du graphique, alors que son montant
         s'affiche ici, la ou le regard tombe. Le motif de couverture resout
         les deux : la carte entiere declenche la saisie, et ce qui porte son
         propre geste le garde. C'est celui de la carte patrimoine de
         l'accueil. -->
    <div class="hero card-cliquable">
      <button type="button" class="card-couvre" data-action="saisir-mois-courant"
              aria-label="${trad('Saisir les dépenses du mois')}"
              title="${trad('Saisir les dépenses du mois')}"></button>
      <div>
        <div class="hero-label">${cur ? (cur.isCurrent ? trad('Dépenses du mois en cours') : `${trad('Dernier mois renseigné')} · ${esc(cur.label)}`) : trad('Dépenses')}</div>
        <div class="hero-value">${cur ? fmtEUR0(cur.total) : ''}</div>
      </div>
      <div class="hero-deltas">
        <!-- L'objectif se regle en touchant son montant, la ou il s'affiche.

             Un champ discret a vecu ici, souligne d'un pointille : il etait joli
             et il ne se trouvait pas, faute d'intitule. Il est ensuite descendu
             au bas de la carte, etiquete, ou il se trouvait mais doublonnait avec
             son jumeau de l'onglet Charges fixes — une valeur, deux champs.

             Le montant cliquable leve les deux objections a la fois : il est la
             ou le regard tombe, et c'est la fenetre qui porte l'intitule. Un
             reglage a besoin de son nom, pas d'etre ecrit en petit a cote du
             chiffre qu'il commande. -->
        <!-- Le chevron et l'accent, comme le montant des revenus deux cartes
             plus bas. « On ne voit pas bien ou on peut changer l'objectif » :
             c'est mot pour mot la remarque qui avait valu son chevron au
             4 500 EUR de « Ou va ce que tu gagnes », et le pointille seul
             n'avait pas suffi ici. Meme probleme, meme signal — inventer une
             troisieme facon de dire « ceci s'ouvre » aurait surtout ajoute une
             convention a apprendre. -->
        <button type="button" class="hero-delta hero-delta-reglable"
                data-action="regler-objectif-depenses"
                aria-label="${trad('Régler l’objectif de dépenses mensuel,')} ${fmtEUR0Texte(f.target)}">
          <span>${trad('Objectif mensuel')}</span>
          <b>${fmtEUR0(f.target)}<span class="hero-delta-chev" aria-hidden="true">›</span></b>
        </button>
        <div class="hero-delta">
          <span>${trad('Écart')}</span>
          <b class="${classeDepassement(cur ? cur.total : 0, f.target)}">${
            curDiff > 0 ? '▲' : '▼'} ${fmtSigned(curDiff)}</b>
        </div>
        <!--    La part de l'objectif deja consommee. L'ecart en euros dit combien il
   reste, le pourcentage dit ou l'on en est du chemin — a mi-mois, « 80 % »
   alerte la ou « −900 € » rassure. Il ne se rend que sur une base positive,
   la regle de la maison : sans objectif, pas de pourcentage. Sa base est
   nommee par la carte elle-meme, l'objectif est deux lignes plus haut.-->
        ${cur && f.target > 0 ? `
        <div class="hero-delta">
          <span>${trad('Budget consommé')}</span>
          <b class="${classeDepassement(cur.total, f.target)}">${fmtPct(cur.total / f.target * 100, 0)}</b>
        </div>` : ''}
        <div class="hero-delta">
          <span>${trad('Moyenne')} ${esc(year)}</span>
          <b>${fmtEUR0(stats.average)}</b>
        </div>
      </div>
      ${cur && cur.note ? `<p class="small muted" style="margin:0">${esc(cur.note)}</p>` : ''}
      ${(() => {
        /* La carte s'arretait aux trois ecarts et laissait, sur grand ecran,
           un grand vide : elle est etiree a la hauteur de sa voisine, qui est
           longue. Plutot que de la raccourcir seule, elle dit ce qu'on vient
           y chercher — ou l'argent du mois est parti. Un mois vide le dit
           aussi, et invite au geste que la carte declenche. */
        const ligne = cur && Store.state.budget.expenses.find(r => r.month === cur.month);
        const parts = Object.entries((ligne && ligne.v) || {})
          .map(([nom, v]) => ({ nom, v: num(v) }))
          .filter(x => x.v > 0)
          .sort((a, b2) => b2.v - a.v);
        if (!parts.length) {
          return `<p class="small muted" style="margin:0">
            ${trad('Aucune dépense saisie')}${cur ? ` ${trad('pour')} ${esc(cur.label)}` : ''}. ${trad('Touche cette carte pour les entrer.')}</p>`;
        }
        const haut = parts[0].v;
        return `<div class="flow">
          ${parts.slice(0, 6).map(p => `
            <div class="flow-row">
              <span class="flow-label">${esc(p.nom)}</span>
              <!-- Le degrade du budget, celui de la jauge de l'accueil : la
                   meme couleur pour le meme sujet sur les deux ecrans. Le jaune
                   qui vivait ici ne se retrouvait nulle part ailleurs. -->
              <div class="flow-bar"><div style="width:${Math.max(2, p.v / haut * 100)}%;
                background:var(--degrade-budget)"></div></div>
              <b class="flow-val">${fmtEUR0(p.v)}</b>
            </div>`).join('')}
          ${parts.length > 6 ? `<p class="small muted" style="margin:4px 0 0">
            et ${parts.length - 6} autre${parts.length - 6 > 1 ? 's' : ''} catégorie${parts.length - 6 > 1 ? 's' : ''}</p>` : ''}
        </div>`;
      })()}
      <!-- Le champ etiquete qui vivait ici est parti : l'objectif se regle en
           touchant son montant, en haut de la carte, et la fenetre qui s'ouvre
           porte l'intitule qui manquait a la premiere version. -->
    </div>

    <!-- « Ou va ce que tu gagnes » vivait dans l'onglet Charges fixes, le
         troisieme. Or la barre « Revenus fixes » est le seul endroit de
         l'application ou l'on declare ce que l'on gagne : il fallait ouvrir un
         onglet nomme d'apres les depenses pour regler ses revenus. Elle est
         maintenant sur l'ecran d'arrivee de Budget, a cote de la saisie du mois.

         Son nom disait « salaire », alors que les sources qu'elle ouvre
         comptent aussi les loyers percus et les revenus d'un conjoint. -->
    <div class="card">
      <div class="card-head"><h2>${trad('Où va ce que tu gagnes')}</h2><span class="hint">${trad('chaque mois')}</span></div>
      <!-- Une barre empilee, et non quatre barres.

           Les deux cartes du haut de cet onglet se ressemblaient trop depuis
           qu'elles sont cote a cote : meme forme, libelle a gauche, barre fine,
           montant a droite, on lisait deux fois le meme objet. Or elles ne
           repondent pas a la meme question. Celle de gauche classe les
           categories d'un mois les unes contre les autres — des barres
           paralleles sont faites pour ca. Celle-ci decompose un seul total, et
           quatre barres dont la premiere valait toujours 100 % le disaient mal :
           le revenu n'est pas une part a cote des autres, c'est le tout.

           La barre empilee le montre, et elle apporte ce que l'autre forme
           taisait — que les trois parts font exactement le revenu, 54,3 + 26,7 +
           19,0 = 100. C'est la regle du projet rendue visible.

           Le montant du haut ouvre les sources de revenus : c'est le seul endroit
           de l'application ou l'on declare ce que l'on gagne, et il etait cache
           derriere la premiere des quatre barres. -->
      ${(() => {
        const parts = [
          [trad('Charges fixes'), f.fixed, 'var(--series-2)', f.fixedPct, 'ancre'],
          [trad('Objectif dépenses'), f.target, 'var(--series-4)', f.targetPct, 'objectif'],
          [trad('Reste à investir / épargner'), f.investTarget, 'var(--series-1)', f.investTargetPct],
        ];
        /* Sans revenu declare, il n'y a pas de tout a decouper : la carte le dit
           et mene la ou on le declare, au lieu d'afficher une piste vide. */
        /* Le motif vient de `PREMIERS_PAS` : il est ne ici, et les deux autres
           invites le reprennent depuis la meme table plutot que de le recopier. */
        if (!f.income) return invitePremierPas('revenus');
        /*    Le chevron n'est pas un ornement. Un grand montant ressemble a un titre,
   pas a un bouton, et c'est pourtant la seule porte vers les sources de
   revenus. Le nombre de sources annonce la liste, le chevron dit qu'elle
   s'ouvre. Meme signal que les lignes de comptes et les fiches
   d'etablissement.*/
        const sources = Store.state.budget.income.length;
        return `
        <!-- Le ≈ suit la declaration : une source marquee « estimee » rend le
             total estime lui aussi, et le partage qui en decoule. Le dire ici
             plutot que sur chaque ecran derive : c'est le chiffre-source. -->
        <button type="button" class="flux-total" data-action="toggle-revenus"
                title="${trad('Voir et modifier les sources de revenus')}${revenuEstime()
                  ? trad(' · une partie est déclarée en montant estimé') : ''}">
          <b>${revenuEstime() ? '≈ ' : ''}${fmtEUR0(f.income)}</b>
          <span class="muted">${sources} ${sources > 1 ? trad('sources de revenus') : trad('source de revenus')}${
            revenuEstime() ? trad(', en partie estimés') : ''}</span>
          <span class="flux-chev" aria-hidden="true">›</span>
        </button>
        <div class="hero-barre" role="img"
             aria-label="Partage : ${parts.map(([l, , , pct]) => `${l} ${fmtPct(pct, 0)}`).join(', ')}">
          ${parts.map(([, , couleur, pct]) => `<i style="width:${Math.max(0, Math.min(100, pct)).toFixed(2)}%;
            background:${couleur}"></i>`).join('')}
        </div>
        <div class="flux-legende">
          ${parts.map(([label, val, couleur, pct, ouvrable]) => {
            const corps = `
              <span class="dot" style="background:${couleur}"></span>
              <span class="repart-nom">${label}</span>
              <b>${fmtEUR0(val)}</b>
              <span class="repart-pct">${fmtPct(pct, 1)}</span>`;
            /* Deux lignes menent quelque part, et pas au meme endroit : les
               charges fixes ont leur propre carte dans l'onglet voisin, et
               l'objectif de depenses se regle dans la fenetre que le montant de
               la carte du mois ouvre aussi. Un seul champ, deux portes.

               `goto` vise `budget-cadre`, la route du sous-onglet : viser
               `budget` rendrait la page des depenses, ou l'ancre « charges »
               n'existe pas, et le clic ne ferait rien du tout.

               La troisieme ligne reste inerte a dessein : c'est un reste, il se
               deduit des deux autres et ne se saisit pas. */
            if (ouvrable === 'ancre') {
              return `<button type="button" class="repart-haut flux-lien"
                              data-action="goto" data-view="budget-cadre" data-anchor="charges"
                              title="${trad('Aller au détail des charges fixes')}">${corps}</button>`;
            }
            if (ouvrable === 'objectif') {
              return `<button type="button" class="repart-haut flux-lien"
                              data-action="regler-objectif-depenses"
                              title="${trad('Modifier l’objectif de dépenses')}">${corps}</button>`;
            }
            return `<div class="repart-haut">${corps}</div>`;
          }).join('')}
        </div>`;
      })()}
      </div>
      <!-- Le second champ d'objectif est parti d'ici. -->
    </div>
  </div>`}

  ${cadre ? '' : `
  <div class="grid g-4 g-tuiles">
    ${tile(`${trad('Dépenses')} ${year}`, stats.total, null, 'var(--series-2)',
           `${stats.months} ${trad('mois · hors charges fixes')}`, 'depensesAnnee')}
    ${tile('Moyenne par mois', stats.average, null, 'var(--series-4)',
           `${trad('sur')} ${stats.moisRetenus} ${trad('mois clos, hors charges fixes')}`
             + (stats.moisEnCoursExclu ? ' ' + trad('et hors mois en cours') : ''),
           'depensesCategories')}
    <!-- Chaque tuile ouvre SA liste : les deux partageaient une fiche melangee
         ou il fallait retrouver soi-meme les mois de sa couleur. -->
    <button type="button" class="tile tile-link" style="--tile-color:var(--good)"
            data-action="apercu" data-apercu="moisObjectif" data-arg="sous">
      <span class="t-label">${trad('Mois sous objectif')}</span>
      <span class="t-value">${stats.under}</span>
      <span class="t-meta">${trad('sur')} ${stats.moisRetenus} ${trad('mois clos')}</span>
      <span class="t-go">⋯</span>
    </button>
    <button type="button" class="tile tile-link" style="--tile-color:var(--critical)"
            data-action="apercu" data-apercu="moisObjectif" data-arg="sur">
      <span class="t-label">${trad('Mois dépassés')}</span>
      <span class="t-value">${stats.over}</span>
      <span class="t-meta">${stats.worst ? `${trad('pire :')} ${esc(stats.worst.label)} ${trad('à')} ${fmtEUR0(stats.worst.total)}` : ''}</span>
      <span class="t-go">⋯</span>
    </button>
  </div>

  <div class="card">
    <!-- L'objectif est rappele ici, pas reglable ici : sa ligne pointillee
         traverse ce graphique, donc son montant doit se lire a cote. Le reglage
         vit dans la brique du haut de cet onglet, et lui seul — deux champs
         editables pour une meme valeur sur un meme ecran, c'est le doublon que
         ce projet passe son temps a supprimer. -->
    <div class="card-head">
      <h2>${trad('Dépenses mensuelles')}</h2>
      <span class="hint">${trad('objectif')} ${fmtEUR0(b.monthlyTarget)}</span>
      ${yearControl('budget-year', years, year)}
    </div>
    <div class="chart" id="bChart"></div>
    <!-- La moyenne sous le graphique : la barre de chaque mois se lit contre
         l'objectif, pas contre les autres mois, et « est-ce que je dépense
         plus que d'habitude ? » n'avait plus de reponse sur cette carte. -->
    <div class="goal-foot" style="margin-top:12px">
      <span>${trad('Moyenne')} ${esc(year)}
        <b>${fmtEUR0(stats.average)} ${trad('/ mois')}</b>${stats.moisEnCoursExclu
          ? `<span class="sub">${trad('sur')} ${stats.moisRetenus} ${trad('mois clos, le mois en cours est écarté')}</span>` : ''}</span>
      <span class="${classeDepassement(stats.average, f.target)}">${
        stats.average ? `${fmtSigned(stats.average - f.target)} ${trad('vs objectif')}` : ''}</span>
    </div>
    <p class="small muted" style="margin:12px 0 0">
      ${trad('Vert sous l’objectif, orange au-dessus, rouge à partir de')} ${fmtPct(SEUIL_DEPASSEMENT_GRAVE * 100, 0)} ${trad('de dépassement. Survole une barre pour la note du mois.')}
    </p>
    <details class="data-view">
      <summary>${trad('Voir les données')}</summary>
      <table>
        <thead><tr><th>${trad('Mois')}</th><th>${trad('Dépensé')}</th><th>${trad('vs objectif')}</th><th style="text-align:left">Note</th></tr></thead>
        <tbody>${(year === 'all' ? expenseSeries() : expenseSeries(year)).map(r => `<tr>
          <td class="name">${esc(r.label)}</td>
          <td>${r.total ? fmtEUR0(r.total) : ''}</td>
          <td class="${classeDepassement(r.total, f.target)}">${r.total ? fmtSigned(r.total - f.target) : ''}</td>
          <td style="text-align:left" class="muted small">${esc(r.note || '')}</td></tr>`).join('')}</tbody>
      </table>
    </details>
  </div>

  <!-- Une carte, un axe. « Par catégorie » et « Moyenne par mois » etaient les
       memes categories vues deux fois cote a cote : un graphique donnant le
       total de l'annee, un tableau donnant la moyenne mensuelle. Deux cartes
       pour un seul axe, et il fallait comparer deux listes pour rapprocher les
       deux chiffres d'une meme categorie.

       Le tableau descend sous le graphique et porte les deux colonnes. Il se
       replie, comme celui des depenses mensuelles juste au-dessus : c'est
       l'idiome de cette page pour les donnees qu'on verifie sans les regarder
       tout le temps. -->
  <div class="card">
    <div class="card-head"><h2>${trad('Par catégorie')}</h2>
      <div class="row">
        <span class="hint">${fmtEUR0(stats.total)} ${trad('au total')}</span>
        ${yearControl('budget-year', years, year)}
      </div>
    </div>
    <div class="chart" id="bCats"></div>
    <details class="data-view">
      <summary>${trad('Voir les données')}</summary>
      <table>
        <thead><tr><th>${trad('Catégorie')}</th><th>${trad('Total')}</th>
          <th>${trad('/ mois')}</th><th>%</th></tr></thead>
        <tbody>${cats.map(c => `<tr>
          <td class="name">${esc(trad(c.label))}</td>
          <td>${fmtEUR0(c.value)}</td>
          <td>${fmtEUR0(c.average)}</td>
          <td class="muted">${fmtPct(c.pct, 1)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>${trad('Total')}</td><td>${fmtEUR0(stats.total)}</td>
          <td>${fmtEUR0(stats.average)}</td><td></td></tr></tfoot>
      </table>
    </details>
  </div>
  <!-- Le tableau de correction ferme la page, il ne la coupe plus.

       Il s'intercalait entre les cartes qui font lire — la repartition, le
       graphique des mois, les categories — avec ses 880 px : on traversait l'outil
       de saisie pour atteindre la lecture. C'est l'argument qui a deja range
       l'onglet voisin : un tableau est un outil de correction, on y vient changer
       un montant, et on ne l'ouvre qu'une fois qu'on a vu ce qui cloche. -->
  <div class="card" data-anchor="detail-mensuel">
    <div class="card-head">
      <h2>${trad('Détail mensuel')}</h2>
      ${yearControl('budget-year', years, year)}
    </div>
    <div class="row" style="margin:-4px 0 12px">
      <span class="hint">${lignesDepenses.length} ${lignesDepenses.length > 1 ? trad('mois affichés') : trad('mois affiché')} · ${expenseCategories().length} ${trad('catégories')}</span>
      <span class="spacer"></span>
      <button class="btn sm ghost" data-action="add-category">${trad('+ Ajouter une catégorie')}</button>
      <button class="btn sm ghost" data-action="add-expense-month">${trad('+ Ouvrir l’année suivante')}</button>
    </div>
    ${(() => {
      /* La relance se pose juste au-dessus du tableau qu'elle designe, et la
         ligne concernee y porte un liseré : on comprend d'ou vient la
         pastille sans avoir a la chercher parmi douze mois. */
      const att = depensesEnAttente();
      if (!att.missing) return '';
      const visible = year === 'all' || String(att.key).startsWith(year);
      return `<div class="note note-relance" style="margin-bottom:12px">⚠ <span>
        <b>${esc(att.label)} n'est pas saisi.</b> Le mois est clos : c'est le moment
        d'enregistrer ce qu'il a coûté.${visible ? ' Sa ligne est signalée ci-dessous.'
          : ` Change l'année pour ${esc(String(att.key).slice(0, 4))} pour la voir.`}</span>
        ${sortiesRappel('depenses', att.label,
          `<button class="btn sm" data-action="saisir-mois-en-attente">Saisir ${esc(att.label)}</button>`)}
      </div>`;
    })()}
    <!-- Telephone : mois, total, ecart. Le reste dans la fenetre de saisie. -->
    <div class="liste-mobile">
      ${lignesDepenses.map(({ r, i }) => {
        const tot = expenseRowTotal(r);
        const diff = tot - f.target;
        const att = attendu.missing && r.month === attendu.key;
        return ligneListe({
          action: 'edit-expense-month', index: i,
          titre: fmtMonth(r.month),
          sous: r.note || '',
          marque: att ? `<span class="marque-attendu" title="${trad('Le mois que la relance attend')}">⚠</span>` : '',
          valeur: tot ? fmtEUR0(tot) : '',
          second: tot ? fmtSigned(diff) : '', classeSecond: classeDepassement(tot, f.target),
        });
      }).join('')}
    </div>
    <!-- Il defile en largeur, jamais en hauteur.

         Un plafond de 60 vh enfermait douze mois dans une boite de 530 px : sur un
         ecran de 900, on faisait defiler un tableau a l'interieur d'une page qui
         defile deja, et la barre du conteneur se confondait avec celle du
         navigateur. Douze lignes sont douze lignes — l'annee entiere tient sur la
         page, et c'est justement ce qu'on vient comparer d'un mois a l'autre.

         La largeur, elle, garde son defilement : onze categories plus le mois, le
         total et l'ecart ne rentrent dans aucun ecran, et la classe table-wrap est
         faite pour ca. La hauteur n'a pas ce probleme, elle n'a que le nombre de
         mois — douze, et le selecteur d'annee les borne.
         (Aucun backtick dans ce commentaire : il vit dans un litteral de gabarit,
         et fermerait la chaine.) -->
    <div class="table-wrap large-seulement">
      <table class="editable">
        <!--    Les en-tetes trient, comme celles des lignes de titres : on trie un tableau
   par la colonne qu'on regarde, et « quel mois a le plus coute en Voyages »
   n'avait pas de reponse. « vs obj. » ne trie pas, son classement serait
   exactement celui du total (l'objectif est le meme pour tous les mois) ; la
   note non plus, on ne classe pas de la prose.-->
        <thead><tr>
          ${(() => {
            const th = (key, label, classe = '') => {
              const on = depSort && depSort.key === key;
              const sens = !on ? trad('décroissant') : depSort.dir === 'desc' ? trad('croissant') : trad('calendrier');
              return `<th class="sortable ${on ? depSort.dir : ''} ${classe}">`
                + `<button type="button" class="th-tri" data-action="sort-depenses" data-key="${esc(key)}"`
                + ` title="${trad('Trier par')} ${esc(trad(label))}, ${trad('ordre')} ${sens}">${esc(trad(label))}</button></th>`;
            };
            return th('mois', 'Mois', 'sticky-col') + th('total', 'Total') + `<th>${trad('vs obj.')}</th>`
              + expenseCategories().map(c => th(`cat:${c}`, c)).join('');
          })()}
          <th class="prose">${trad('Note du mois')}</th><th></th>
        </tr></thead>
        <tbody>${(depSort ? (() => {
          /* On trie une copie de la vue indexee : `data-i` continue de viser
             la vraie ligne, exactement comme le tableau des positions. */
          const cle = depSort.key.startsWith('cat:')
            ? ({ r }) => num(r.v[depSort.key.slice(4)])
            : depSort.key === 'total' ? ({ r }) => expenseRowTotal(r)
            : ({ r }) => String(r.month);
          const dir = depSort.dir === 'asc' ? 1 : -1;
          return [...lignesDepenses].sort((a, b) => {
            const va = cle(a), vb = cle(b);
            return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir;
          });
        })() : lignesDepenses).map(({ r, i }) => {
          const tot = expenseRowTotal(r);
          const diff = tot - f.target;
          const estMoisCourant = r.month === currentMonthKey();
          const estAttendu = attendu.missing && r.month === attendu.key;
          const classes = [estMoisCourant ? 'mois-courant' : '', estAttendu ? 'mois-attendu' : '']
            .filter(Boolean).join(' ');
          return `<tr class="ligne-ouvre${classes ? ` ${classes}` : ''}"
              data-action="edit-expense-month" data-i="${i}"
              title="${trad('Saisir les dépenses de')} ${esc(fmtMonth(r.month))}"${
              estMoisCourant ? ' data-anchor="mois-courant"' : ''}${estAttendu ? ' data-anchor="mois-attendu"' : ''}>
            <td class="name sticky-col"><span class="mois-lien">${esc(fmtMonth(r.month))}</span>${
              estAttendu ? '<span class="marque-attendu" title="Le mois que la relance attend">⚠</span>' : ''}</td>
            <td><b>${tot ? fmtEUR0(tot) : ''}</b></td>
            <td class="${classeDepassement(tot, f.target)}">${tot ? fmtSigned(diff) : ''}</td>
            <!-- Les cases se lisent, elles ne se saisissent plus.

                 Onze champs par ligne, douze lignes : la grille se presentait
                 comme la surface de saisie, et c'est ce qu'on croyait devoir
                 remplir. Or la fenetre du mois fait tout ce que les cases ne
                 savent pas faire — un libelle par montant, la somme qui suit la
                 frappe, l'objectif compare en direct, et la question avant de
                 jeter une saisie. Elle etait a un clic sur le nom du mois, et
                 rien ne le disait.

                 Toute la ligne ouvre la fenetre, pas seulement le nom : viser
                 huit caracteres quand la ligne en fait mille est un peage
                 inutile. La croix de suppression garde sa propre action, le clic
                 ne remonte pas jusqu'a la ligne. -->
            ${expenseCategories().map(c => `<td>${r.v[c] != null && r.v[c] !== ''
                ? fmtEUR0(r.v[c]) : ''}</td>`).join('')}
            <td class="name prose">${esc(r.note || '')}</td>
            <td><button class="btn icon" data-action="del-expense-month" data-i="${i}" title="${trad('Supprimer')}">✕</button></td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr>
          <td class="sticky-col">Total ${esc(year)}</td>
          <td>${fmtEUR0(stats.total)}</td><td></td>
          ${expenseCategories().map(c => {
            const v = cats.find(x => x.label === c);
            return `<td>${v ? fmtEUR0(v.value) : ''}</td>`;
          }).join('')}
          <td colspan="2"></td>
        </tr></tfoot>
      </table>
    </div>

    <details class="data-view" style="margin-top:12px">
      <summary>${trad('Renommer, retirer ou supprimer une catégorie')}</summary>
      <!-- Classe « table-serree » : ce tableau vit hors de tout conteneur
           defilant, il doit donc tenir dans sa carte. Sans mise en page fixe, la
           cellule des deux boutons imposait sa largeur et poussait l'ensemble a
           347 px pour 311 disponibles.
           (Aucun guillemet oblique ici : ce commentaire vit dans un litteral de
           gabarit, un backtick y fermerait la chaine.) -->
      <table class="editable table-serree">
        <!-- Une colonne « Colonne » donnait le rang de la catégorie, « 3ᵉ ».
             L'ordre des lignes le dit déjà, et elle coûtait 75 px sur les
             311 disponibles à 375 px : le tableau débordait de 44 px, hors de
             tout conteneur défilant, donc le bouton de suppression tombait
             derrière le bord de l'écran, hors d'atteinte.

             Deux gestes et non un seul. Supprimer efface les montants de tous
             les mois : c'est ce qu'il faut pour une colonne créée par erreur,
             et jamais pour un poste dans lequel on a cessé de dépenser. Retirer
             sort la catégorie de la saisie du mois et ne touche à rien d'autre.
             La croix seule poussait à effacer un historique pour faire de la
             place à l'écran. -->
        <thead><tr><th>${trad('Catégorie')}</th><th>${trad('Total saisi')}</th><th></th></tr></thead>
        <tbody>${expenseCategories().map(c => {
          const total = expenseCategoryTotal(c);
          const retiree = categorieRetiree(c);
          return `<tr${retiree ? ' class="cat-retiree"' : ''}>
            <td class="name"><input value="${esc(c)}" data-action-change="rename-category"
                data-cat="${esc(c)}" title="${trad('Modifie le nom puis quitte le champ')}">
              ${retiree ? '<span class="tag">retirée</span>' : ''}</td>
            <td class="${total ? '' : 'muted'}">${total ? fmtEUR0(total) : ''}</td>
            <!-- Les deux gestes dans une seule cellule. En colonnes separees le
                 tableau passait a quatre et debordait de 40 px a 375 px, hors de
                 tout conteneur defilant : la croix tombait derriere le bord de
                 l'ecran, injoignable. C'est le defaut exact que le commentaire
                 du dessus decrit, et que la colonne « Retirer » a fait revenir. -->
            <td class="cat-actions">
              <!-- L'ordre des colonnes se regle ici, sur grand ecran seulement :
                   c'est la que les colonnes existent — le telephone lit une
                   liste — et la cellule est deja a l'etroit a 375 px. Une seule
                   liste porte l'ordre, budget.categories : la saisie du mois,
                   les graphiques et les exports suivent d'eux-memes. -->
              <span class="large-seulement">
                <button class="btn icon" data-action="monter-category" data-cat="${esc(c)}"
                  title="${trad('Avancer cette colonne d’un cran')}">↑</button>
                <button class="btn icon" data-action="descendre-category" data-cat="${esc(c)}"
                  title="${trad('Reculer cette colonne d’un cran')}">↓</button>
              </span>
              <button class="btn sm ghost" data-action="${retiree ? 'reprendre' : 'retirer'}-category"
                data-cat="${esc(c)}"
                title="${trad(retiree ? 'La reproposer à la saisie du mois'
                                    : 'La sortir de la saisie du mois, sans toucher aux montants passés')}"
                >${trad(retiree ? 'Reprendre' : 'Retirer')}</button>
              <button class="btn icon" data-action="del-category" data-cat="${esc(c)}"
                title="${trad('Supprimer cette colonne et tous ses montants')}">✕</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <p class="hint" style="margin-top:8px">
        <b>${trad('Retirer')}</b> ${trad("garde l'historique,")} <b>${trad('Supprimer')}</b> ${trad("l'efface.")}${aide(trad("Renommer déplace les montants déjà saisis. Retirer sort la catégorie de la saisie du mois sans toucher aux montants passés : c’est le geste pour un poste dans lequel tu ne dépenses plus. Supprimer retire la colonne et tout ce qu’elle contient. Ctrl+Z annule dans les deux cas."))}
      </p>
    </details>
  </div>`}

  ${!cadre ? '' : `
  <!-- La tete de l'onglet.

       Depuis que « Ou va ce que tu gagnes » a rejoint l'onglet Depenses, celui-ci
       s'ouvrait sur un tableau de huit colonnes et rien d'autre. Or un tableau
       est un outil de correction : on y vient changer un montant. La question
       qu'on se pose en arrivant, elle, est « combien sort tous les mois, et pour
       quoi » — et elle se lisait en additionnant treize lignes de l'oeil. -->
  <div class="card">
    <!-- Le compte porte sur les postes qui pesent, pas sur les lignes
         declarees : la carte annoncait « 13 postes » et le panneau qu'elle
         ouvre en montrait 12, la treizieme etant a zero. Un intitule dit
         exactement ce qu'il compte, et deux ecrans qui comptent la meme chose
         doivent donner le meme nombre. -->
    <div class="card-head"><h2>${trad('Ce qui sort chaque mois')}</h2>
      ${(() => {
        const n = b.fixedCharges.filter(c => chargeMensuelle(c) > 0).length;
        return `<span class="hint">${n} ${n > 1 ? trad('postes') : trad('poste')}</span>`;
      })()}</div>
    ${(() => {
      const st = sharedTotals();
      const postes = b.fixedCharges
        .map(c => ({ nom: c.label || 'Sans nom', v: chargeMensuelle(c) }))
        .filter(x => x.v > 0)
        .sort((a, x) => x.v - a.v);
      /* Le texte vit dans `PREMIERS_PAS` : c'est le meme que celui de l'invite,
         et l'ecrire ici en plus les aurait laisses diverger. Le repli sert au cas
         ou des charges existent mais toutes a zero — le pas est franchi, il n'y a
         pourtant rien a montrer. */
      if (!postes.length) return invitePremierPas('depenses')
        || `<p class="empty" style="margin:0">${trad('Aucune charge fixe déclarée.')}</p>`;
      /* `haut` ne sert plus aux barres, qui valent desormais la part. Il reste
         la parce que le total, lui, doit venir des postes affiches et non de
         `f.fixed` : les deux sont egaux aujourd'hui, et le jour ou ils
         cesseraient de l'etre, les pourcentages de cette carte ne feraient plus
         100 % sans que rien ne le dise. */
      const total = postes.reduce((s, x) => s + x.v, 0);
      const montre = postes.slice(0, 6);
      return `
      <div class="charges-tete">
        <div class="ct-chiffre">
          <b>${fmtEUR(f.fixed)}</b>
          <span class="muted">${trad('par mois,')} ${fmtPct(f.fixedPct, 1)} ${trad('de tes revenus')}</span>
        </div>
        <div class="ct-cote">
          <div class="ct-petit">
            <span class="muted">${trad('Sur douze mois')}${aide(trad("Le même total, vu à l’année. Un abonnement de 30 € par mois coûte 360 € par an : c’est à cette échelle qu’on décide de le garder ou non."))}</span>
            <b>${fmtEUR0(f.fixed * 12)}</b>
          </div>
          ${st.partage ? `
          <div class="ct-petit">
            <span class="muted">${trad('Vraiment à ta charge')}${aide(trad("Ce que tu paies une fois retirée la part de qui partage avec toi. Le budget, lui, retient les charges entières : c’est bien toi qui les paies, et ce qu’on te reverse entre de son côté dans tes revenus."))}</span>
            <b>${fmtEUR0(st.mine)}</b>
          </div>` : ''}
        </div>
      </div>
      <!-- Les barres prennent le degrade du budget, celui des categories de
           depenses : c'est le meme sujet, de l'argent qui sort.

           Toute la liste ouvre le panneau qui montre les treize postes avec
           leur part. Elle renvoyait au tableau du dessous, qui repond mal a
           « lequel pese le plus » : neuf colonnes de nombres a comparer ligne a
           ligne, la ou six barres le disaient d'un regard. Le renvoi disait donc
           d'aller lire ailleurs une reponse moins bonne que celle qu'on avait
           sous les yeux.

           Ici les barres restent proportionnelles au plus gros poste, pas a la
           part. -->
      <button type="button" class="flow-lien" style="margin-top:12px"
              data-action="apercu" data-apercu="chargesFixes"
              title="${trad('Voir les')} ${postes.length} ${trad('postes avec leur part')}">
        <div class="flow">
          ${montre.map(x => `
            <div class="flow-row">
              <span class="flow-label">${esc(x.nom)}</span>
              <div class="flow-bar"><div style="width:${Math.max(1.5, total ? x.v / total * 100 : 0).toFixed(1)}%;
                background:var(--degrade-budget)"></div></div>
              <b class="flow-val">${fmtEUR0(x.v)}</b>
              <span class="flow-pct">${fmtPct(total ? x.v / total * 100 : 0, 1)}</span>
            </div>`).join('')}
        </div>
        <p class="small muted" style="margin:12px 0 0">${postes.length > montre.length
          ? `${trad('et')} ${postes.length - montre.length} ${postes.length - montre.length > 1
              ? trad('autres postes') : trad('autre poste')} : ${trad('voir les.minuscule', 'voir les')} ${postes.length}${trad(', avec leur part ›')}`
          : trad('Voir la part de chaque poste ›')}</p>
      </button>`;
    })()}
  </div>

  <!-- Une seule colonne, et l'ordre d'affichage renverse : « Charges fixes » et
       « Autres dépenses » portent neuf et sept colonnes, elles etaient a l'etroit
       cote a cote dans une grille en deux parts. Elles se suivent maintenant sur
       toute la largeur, les variables puis les fixes, et l'epargne mensuelle
       passe devant : elle resume, elle ne detaille pas.
       C'est la propriete CSS d'ordre qui les remet dans cet ordre, pas un
       deplacement de balisage : les deux cartes font soixante lignes chacune,
       les bouger a la main coute un fichier casse pour un resultat
       identique. -->
  <div class="grid budget-charges">
    <div class="card" data-anchor="charges">
      <div class="card-head"><h2>${trad('Charges fixes')}</h2>
        <div class="row">
          <span class="hint">${fmtEUR(f.fixed)} ${trad('/ mois')} · ${fmtPct(f.fixedPct, 1)} ${trad('des revenus')}</span>
          <button class="btn sm ghost" data-action="add-contributor">+ ${trad('Personne')}</button>
          <button class="btn sm ghost" data-action="add-charge">${trad('+ Ligne')}</button>
        </div>
      </div>
      ${(() => {
        const gens = contributors();
        const st = sharedTotals();
        return `
      <!-- Telephone : une ligne par charge, la fenetre fait le reste. Le
           tableau a huit colonnes reste le chemin du bureau — c'est la regle
           du projet, aucun tableau de plus de trois colonnes sous 768 px. -->
      <div class="liste-mobile">
        ${b.fixedCharges.map((c, i) => ligneListe({
          action: 'edit-charge', index: i,
          titre: c.label || 'Sans nom',
          /* La periodicite se nomme quelle qu'elle soit. La ligne ne disait
             « facturée à l'année » que pour l'annuel : un abonnement
             trimestriel affichait son equivalent mensuel sans rien qui explique
             l'ecart avec le montant qu'on a sous les yeux sur sa facture. */
          /* Une charge qui rembourse un credit n'est pas une depense comme une
             autre : sa part de capital rejoint le patrimoine. La ligne le dit,
             sinon on la lit comme un abonnement de plus. */
          sous: [c.provider || '', chargePeriode(c) === 'mois' ? ''
            : `${trad('facturée')} ${CHARGE_PERIODE_LABEL[chargePeriode(c)]}`,
            (() => {
              if (!c.creditId) return '';
              const cr = creditsEnCours().lignes.find(x => x.id === c.creditId);
              if (!cr) return '';
              return cr.capital != null
                ? `${trad('rembourse')} ${guill(cr.libelle)}, ${trad('dont')} ${fmtEUR0(cr.capital)} ${trad('de capital')}`
                : `${trad('rembourse')} ${guill(cr.libelle)}`;
            })()].filter(Boolean).join(' · '),
          valeur: `${fmtEUR(chargeMensuelle(c))} ${trad('/ mois')}`,
          second: gens.length ? `${fmtEUR(myShareMensuelle(c))} ${trad('à ma charge')}` : '',
        })).join('')}
        <dl class="kv repart-pied">
          <dt>${trad('Total / mois')}</dt><dd>${fmtEUR(st.total)}</dd>
          ${gens.length ? `<dt><b>${trad('À ma charge')}</b></dt><dd><b>${fmtEUR(st.mine)}</b></dd>` : ''}
        </dl>
        <!-- Les personnes qui partagent, et le moyen de les retirer.
             Le ✕ ne vivait que dans l'en-tete du tableau, donc sur grand ecran
             seulement : sur telephone on pouvait ajouter une personne et plus
             jamais la retirer. Chaque nom porte ici son total mensuel, ce que
             l'en-tete du tableau ne dit pas. -->
        ${gens.length ? `<div class="contrib-liste">
          ${st.parPersonne.map(p => `
            <span class="contrib-jeton">
              <b>${esc(p.name)}</b>
              <span class="muted">${fmtEUR(p.total)} ${trad('/ mois')}</span>
              <button class="btn icon xs" data-action="del-contributor" data-id="${esc(p.id)}"
                      title="Retirer ${esc(p.name)} des charges partagées"
                      aria-label="Retirer ${esc(p.name)}">✕</button>
            </span>`).join('')}
        </div>` : ''}
      </div>
      <div class="table-wrap large-seulement">
        <table class="editable">
          <thead><tr>
            <th class="sticky-col">Poste</th><th>Montant</th><th>Facturé</th>
            <th title="${trad('Ce que la ligne pèse chaque mois, quelle que soit sa périodicité')}">${trad('€ / mois')}</th>
            <th>${trad('% charges')}</th>
            ${gens.map(p => `<th title="Ce que ${esc(p.name)} prend en charge, sur la même période que le montant">
              Part de ${esc(p.name)}
              <button class="btn icon xs" data-action="del-contributor" data-id="${esc(p.id)}"
                      title="Retirer ${esc(p.name)}">✕</button></th>`).join('')}
            <th title="${trad('Ce qui sort réellement de ton compte, ramené au mois')}">${trad('À ma charge')}</th>
            <th>Organisme</th><th></th>
          </tr></thead>
          <!--               Ce que la fenetre sait faire et que les cases ne savaient pas : le
               rattachement a un credit ou a un bien, qui n'a pas de colonne ici,
               l'equivalent mensuel annonce en sous-titre, et la question posee
               avant de jeter une saisie. Les champs en place, eux, offraient une
               deuxieme surface d'edition pour un sous-ensemble des champs — celle
               qui perd, puisqu'elle ne peut pas tout dire. -->
          <tbody>${b.fixedCharges.map((c, i) => `<tr class="ligne-ouvre"
              data-action="edit-charge" data-i="${i}"
              title="Modifier ${guill(esc(c.label || 'Sans nom'))}">
            <td class="name sticky-col"><span class="mois-lien">${esc(c.label || 'Sans nom')}</span></td>
            <td>${fmtEUR(num(c.amount))}</td>
            <!-- La periodicite se lit dans la meme table que la liste de la
                 fenetre : deux libelles pour une periode finiraient par diverger. -->
            <td>${esc(CHARGE_PERIODE_LABEL[chargePeriode(c)])}</td>
            <!-- L'equivalent mensuel s'affiche en clair des qu'il differe du
                 montant saisi, et en grise quand il le repete. Le test portait
                 sur « annuel » : un trimestriel voyait donc son calcul grise
                 comme s'il n'apportait rien. -->
            <td class="${chargePeriode(c) === 'mois' ? 'muted' : ''}">${fmtEUR(chargeMensuelle(c))}</td>
            <td class="muted">${fmtPct(f.fixed ? chargeMensuelle(c) / f.fixed * 100 : 0, 1)}</td>
            ${gens.map(p => `<td>${shareOf(c, p.id) ? fmtEUR(shareOf(c, p.id)) : ''}</td>`).join('')}
            <td><b>${fmtEUR(myShareMensuelle(c))}</b></td>
            <td class="name">${esc(c.provider || '')}</td>
            <td><button class="btn icon" data-action="del-charge" data-i="${i}" title="${trad('Supprimer')}">✕</button></td>
          </tr>`).join('')}</tbody>
          <tfoot><tr>
            <td class="sticky-col">Total / mois</td><td colspan="2"></td>
            <td>${fmtEUR(st.total)}</td><td>${fmtPct(100)}</td>
            ${st.parPersonne.map(p => `<td>${fmtEUR(p.total)}</td>`).join('')}
            <td><b>${fmtEUR(st.mine)}</b></td><td colspan="2"></td>
          </tr></tfoot>
        </table>
      </div>
      <!-- Le message rapprochait ces parts des lignes de revenu pour annoncer
           un ecart. Il le faisait sur le libelle : une ligne comptait pour une
           personne si son intitule portait son nom, rien ne reliant les deux
           dans les donnees. Renommer « PK » en « Virement colocation » faisait
           tomber le compte a zero et annoncait un manque inexistant ; un
           contributeur nomme « Lea » aurait ramasse un revenu « Galea ». Un
           chiffre faux vaut moins que pas de chiffre : la note se contente
           desormais de dire la regle, qui est vraie sans rien apparier. -->
      ${gens.length ? `<p class="hint" style="margin:12px 0 0">
        ${trad('Ces parts sont indicatives : les charges retenues sont les charges fixes '
        + 'totales. La part de quelqu’un doit être ajoutée dans tes revenus.')}
      </p>` : ''}`;
      })()}
    </div>

    <div class="grid" style="gap:16px; align-content:start">
      <div class="card">
        <div class="card-head"><h2>${trad('Épargne mensuelle')}</h2><span class="hint">${trad('théorique vs réelle')}</span></div>
        <dl class="kv">
          <dt>${trad('Revenus fixes')}</dt><dd>${fmtEUR0(rec.income)}</dd>
          <dt>${trad('− Charges fixes')}</dt><dd>−${fmtEUR0(rec.fixed)}</dd>
          <dt>− ${trad('Dépenses (moy.')} ${esc(year)})</dt><dd>−${fmtEUR0(rec.spend)}</dd>
          <dt><b>${trad('= Épargne théorique')}</b>${aide(trad("Ce que ton budget laisse chaque mois une fois les charges fixes et tes dépenses moyennes retirées. C'est une prévision tirée de tes saisies, pas un montant constaté sur un compte."))}</dt><dd><b class="${cls(rec.theoretical)}">${fmtEUR0(rec.theoretical)}</b></dd>
          <dt>${trad('Taux d’épargne')}${aide(trad("Part de tes revenus que cette épargne théorique représente. Au-dessus de 20 %, tu mets de côté nettement plus que la moyenne."))}</dt><dd>${fmtPct(rec.theoreticalRate, 1)}</dd>
          <dt>${trad('Objectif d’investissement')}${aide(trad("Revenus moins charges fixes moins ton objectif de dépenses. C'est le montant que tu vises, là où l'épargne théorique est ce que tes dépenses réelles laissent."))}</dt><dd>${fmtEUR0(rec.targetSaving)}</dd>
        </dl>
        ${rec.realPerMonth != null ? `
          <hr style="border:none;border-top:1px solid var(--grid);margin:14px 0">
          <dl class="kv">
            <dt>${trad('Croissance réelle du patrimoine')}${aide(trad("Moyenne des variations du patrimoine net d'un mois sur l'autre, sur tes relevés. Elle comprend les mouvements de marché et tout apport extérieur, pas seulement ton épargne. C'est le même chiffre que « ton rythme observé » dans Objectif."))}</dt><dd>${fmtEUR0(rec.realPerMonth)} ${trad('/ mois')}</dd>
            <dt>${trad('Écart avec la théorie')}${aide(trad("Différence entre ce que ton patrimoine a réellement gagné et ce que ton budget prévoyait. Un écart positif vient souvent des marchés ou d'un apport supplémentaire : ce n'est pas une erreur de budget."))}</dt><dd class="${cls(rec.gap)}">${fmtSigned(rec.gap)}</dd>
          </dl>
          <p class="small muted" style="margin:12px 0 0">
            ${trad('Mesuré sur les')} ${rec.monthsSpan} ${trad('derniers mois clos. Le mois en cours est '
            + 'écarté, il est incomplet. L’écart vient des performances de marché et des '
            + 'apports supplémentaires : ce n’est pas une erreur de budget.')}
          </p>` : ''}
      </div>

      <!-- Deux cartes ont quitte cet onglet, pour la meme raison.

           « A verifier » etait un reliquat du tableur d'origine, jamais utilise
           ici : les charges annuelles se saisissent dans le tableau des charges
           fixes, avec leur periode.

           « Autres depenses » etait un memo chiffre qui ne comptait nulle part,
           ni dans les charges fixes ni dans le budget : son propre pied le
           disait. Un intitule doit dire ce qu'il compte, et celui-la comptait
           zero tout en annoncant des depenses de plus. Il faisait aussi mentir
           l'onglet qui le portait. Une whey ou un abonnement sont de vraies
           depenses : leur place est dans les depenses du mois, ou elles
           comptent, pas dans un tableau parallele qu'il fallait tenir a jour
           pour ne rien calculer.

           Dans les deux cas les donnees restent dans l'etat et dans l'export
           tant qu'elles n'ont pas ete effacees a la main : retirer un ecran ne
           doit pas emporter ce que quelqu'un y avait saisi. -->
    </div>
  </div>`}`;
}

/* Paliers de cible, de 0 a 100 % par pas de 1.
   Le pas etait de 5, au motif que « personne ne vise 63 % d'actions ». C'etait
   faux pour une raison qu'on ne voit qu'en s'en servant : une cible ne se
   choisit pas toujours en premier, elle se deduit souvent des autres. Qui pose
   3 % d'or et 5 % de crypto n'a plus 92 % a repartir, il a un reste, et le pas
   de 5 lui refusait de l'ecrire. Le total devait tomber juste a 100, avec un
   outil qui ne savait compter que de cinq en cinq.
   La liste fait donc 101 entrees. C'est long a derouler, mais le clavier saute
   a la valeur des qu'on tape « 92 », et la liste deroulante reste preferable au
   champ libre : elle borne a 0-100 sans validation, et elle s'ajuste par crans
   en comparant a la jauge d'a cote.
   La valeur courante y est glissee si elle n'est pas entiere, sinon un 62,5 %
   deja enregistre serait ecrase au premier rendu. */
function paliersCible(courant) {
  const p = [];
  for (let v = 0; v <= 100; v += 1) p.push(v);
  const c = Math.max(0, Math.min(100, num(courant)));
  if (!p.includes(c)) p.push(c);
  return p.sort((a, b) => a - b);
}

/* Paliers de 100 €, de 0 a 5 000. La valeur courante y est glissee si elle
   n'est pas ronde, sinon la liste l'ecraserait au premier rendu. */
/* `paliersObjectif()` vivait ici : les cent-en-cent d'une liste deroulante
   pour l'objectif de depenses. Elle est partie avec la liste. Un objectif se
   saisit maintenant a l'euro, parce que quelqu'un qui vit avec 640 EUR par mois
   doit pouvoir viser juste, et que les paliers ronds ne servaient qu'a essayer
   des hypotheses — un champ libre le fait aussi bien. */

function mountBudget() {
  const year = budgetAnnee();
  const rows = (year === 'all' ? expenseSeries() : expenseSeries(year));
  Charts.barsWithTarget($('#bChart'), {
    height: 300,
    items: rows.map(r => ({ label: r.label, value: r.total, note: r.note })),
    target: num(Store.state.budget.monthlyTarget),
    targetLabel: 'Objectif',
  });
  Charts.rankedBars($('#bCats'), { items: expenseByCategory(year) });
}

/* ------------------------------------------------------------
   Données
   ------------------------------------------------------------ */
function viewData() {
  const checks = healthChecks();
  const backups = Store.backups();
  /* Les icones et le classement viennent du modele, ils ne sont plus recopies
     ici. Cette copie locale ignorait le niveau `action`, ajoute avec la cloche :
     son icone valait `undefined` a l'ecran, et son rang `NaN` — donc un ordre de
     tri indefini. Le defaut exact que ce projet corrige sans arret : deux listes
     du meme fait, dont une seule est tenue a jour. */
  checks.sort((a, b) => RANG_NOTIF[a.level] - RANG_NOTIF[b.level]);

  return `
  <div class="card">
    <div class="card-head">
      <h2>${trad('Contrôles de cohérence')}</h2>
      <!-- Le decompte suit les familles du modele : il en nommait trois sur
           quatre, et les saisies en attente ne se comptaient nulle part. -->
      <span class="hint">${checks.length
        ? FAMILLES_NOTIF.map(([cle, nom]) => [nom, checks.filter(c => c.sujet === cle).length])
            .filter(([, n]) => n).map(([nom, n]) => `${n} ${nom.toLowerCase()}`).join(' · ')
        : trad('Tout est cohérent')}</span>
    </div>
    ${checks.length ? `<ul class="checks">${checks.map(c => `
      <li class="chk chk-${c.level}">
        <span class="chk-ic">${ICONE_NOTIF[c.level] || '•'}</span>
        <div><b>${esc(c.title)}</b><br><span class="muted">${escMontant(c.detail)}</span></div>
        <a href="#/${c.view}" class="btn ghost sm">${trad('Voir')}</a>
      </li>`).join('')}</ul>`
      : `<p class="empty">${trad('✓ Aucune incohérence détectée.')}</p>`}
  </div>

  <!-- L'etat de l'application suit ses controles : les deux repondent a la meme
       question, comment elle va. Il fermait la page, coince entre les sauvegardes
       et la remise a zero — un encart de lecture au milieu de deux actes. -->
  <div class="card">
    <div class="card-head"><h2>${trad('État')}</h2></div>
    <dl class="kv">
      <dt>Positions</dt><dd>${Store.state.positions.length}</dd>
      <dt>${trad('Lignes d\'historique')}</dt><dd>${Store.state.monthly.length}</dd>
      <dt>${trad('Comptes suivis')}</dt><dd>${ACCOUNTS.length}</dd>
      <dt>${trad('Taille du stockage')}</dt><dd>${(JSON.stringify(Store.state).length / 1024).toFixed(1)} Ko</dd>
      <dt>${trad('Version')}${aide(trad("La version du code que tu es en train d’exécuter, lue sur la balise du script. Si elle ne change pas après un déploiement, c’est que le navigateur ressert l’ancienne : ferme complètement l’application et rouvre-la, un simple rechargement ne suffit pas toujours."))}</dt>
        <dd style="font-family:var(--font-nb)">${esc(VERSION_APP)}</dd>
    </dl>
  </div>

  <div class="note">
    🔒 <span><b>${trad('Données personnelles.')}</b> ${trad('Ce tableau de bord contient des informations financières qui te concernent directement : au sens du RGPD, ce sont des <b>données à caractère personnel</b>, et tu en es responsable.')}
    ${CloudSync.isAvailable()
      ? trad('Elles sont enregistrées <b>chez Cloudflare</b> (stockage KV, Europe), en plus de ce navigateur. Elles n’y sont <b>pas chiffrées de bout en bout</b> : techniquement, Cloudflare peut y accéder. L’accès est protégé par ton mot de passe, change-le s’il a pu fuiter, cela déconnecte aussitôt tous les appareils. Pour tout retirer : supprime l’espace KV et le projet Pages.')
      : trad('Elles restent <b>uniquement dans le navigateur de cette machine</b>, rien n’est envoyé sur un serveur.')}
    ${trad('Un export JSON ou Excel sort de ce cadre : évite de le déposer sur un service tiers non maîtrisé ou de l’envoyer par e-mail non chiffré, et efface ceux dont tu n’as plus besoin.')}</span>
  </div>

  <div class="grid g-2">
    <div class="card">
      <div class="card-head"><h2>${trad('Exporter')}</h2><span class="hint">${trad('Toutes tes données')}</span></div>
      <div class="row">
        <button class="btn ghost" data-action="export-xlsx-all">${trad('⤓ Classeur Excel')}</button>
        <button class="btn" data-action="export-json">${trad('⤓ Sauvegarde JSON')}</button>
      </div>
      <dl class="kv" style="margin-top:12px">
        <dt><b>JSON</b>, sauvegarde</dt><dd class="up">${trad('réimportable ✓')}</dd>
        <dt><b>Excel</b>, lecture</dt><dd class="muted">${trad('non réimportable')}</dd>
      </dl>
      <!-- Soixante-dix mots sous deux lignes de tableau qui disaient deja
           l'essentiel : « réimportable » contre « non réimportable ». Le
           paragraphe detaillait la structure du fichier Excel a quelqu'un qui
           ne l'a pas encore ouvert. La phrase garde la decision, la bulle garde
           le detail. -->
      <p class="small muted" style="margin:12px 0 0">
        ${trad('Le <b>JSON</b> pour restaurer, l’<b>Excel</b> pour lire ailleurs.')}${aide(trad("Le JSON restitue ton tableau de bord à l’identique : c’est celui à garder pour restaurer ou changer de machine. L’Excel est une photo pour lire et retravailler ailleurs : une feuille par thème, montants au format €, pourcentages calculables. Le découpage d’une catégorie de dépenses y a sa propre feuille, une ligne par montant. Il ne contient pas tous les réglages, il ne peut donc pas être rechargé ici."))}
      </p>
    </div>

    <div class="card">
      <div class="card-head"><h2>${trad('Importer')}</h2><span class="hint">${trad('Fichier JSON uniquement')}</span></div>
      <input type="file" id="importFile" accept="application/json,.json">
      <p class="small muted" style="margin:12px 0 0">
        <b>${trad('Fichier JSON uniquement')}</b>${trad(', celui produit par « Sauvegarde JSON ». L’import écrase l’état enregistré ; une confirmation est demandée. Exporte d’abord si tu as un doute.')}
      </p>
      <!-- La demonstration se charge d'ici : c'est un jeu de donnees qui remplace
           l'etat, donc un import, et elle reste dans la carte qui porte les imports.
           Elle a longtemps vecu a cote de la remise a zero, les deux gestes qui
           changent tout l'etat d'un coup ; celle-ci est partie dans sa propre carte,
           en bas de page, parce qu'elle detruit. Celle-la n'efface rien : elle n'a
           pas suivi. -->
      <div class="row" style="margin-top:14px; padding-top:14px; border-top:1px solid var(--grid)">
        ${modeDemo()
          ? `<button class="btn sm" data-action="quitter-demo">← Revenir à mes données</button>
             <span class="hint">La démonstration reste disponible</span>`
          : `<button class="btn ghost sm" data-action="charger-demo">▷ ${trad('Voir la démonstration')}</button>
             <span class="hint">${trad('Des chiffres fictifs, sans toucher aux vôtres')}</span>`}
      </div>
    </div>
  </div>

  ${(() => {
    if (!CloudSync.isAvailable()) return '';
    const s = CloudSync.status();
    const u = CloudSync.getUser();
    return `
    <div class="card">
      <div class="card-head">
        <h2>${trad('Synchronisation en ligne')}</h2>
        <span class="hint">${u ? `${trad('connecté en tant que')} <b>${esc(u)}</b>` : 'Cloudflare KV'}</span>
      </div>
      <dl class="kv">
        <dt>${trad('État')}</dt><dd class="up">✓ ${trad('active')}</dd>
        <dt>${trad('Dernier envoi')}</dt><dd>${s.lastPush ? fmtWhen(s.lastPush) : ''}</dd>
        ${s.error ? `<dt>Erreur</dt><dd class="down">${esc(s.error)}</dd>` : ''}
      </dl>
      ${s.conflict ? `<div class="note" style="margin-top:12px">⚠ <span>
        <b>Conflit.</b> La version en ligne
        (${new Date(s.conflict.remoteSavedAt).toLocaleString(locale())}) est plus récente
        que celle de cet appareil. Choisis laquelle garder.</span></div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" data-action="cloud-pull">${trad('↓ Prendre la version en ligne')}</button>
          <button class="btn sm ghost" data-action="cloud-force">${trad('↑ Imposer celle-ci')}</button>
        </div>` : `
        <div class="row" style="margin-top:12px">
          <button class="btn sm ghost" data-action="cloud-push">${trad('↻ Synchroniser maintenant')}</button>
        </div>`}
      <p class="small muted" style="margin:12px 0 0">
        La synchronisation est <b>automatique</b> : tout est envoyé quelques secondes
        après chaque modification, et tes appareils partagent le même état. Ce bouton
        ne sert qu'à forcer l'envoi avant de fermer.
      </p>
    </div>`;
  })()}


  <!-- Revenir en arriere, et le dire quelque part.

       Deux chemins, du plus leger au plus lourd, et dans cet ordre : ce bouton
       defait le dernier geste, les sauvegardes ci-dessous refont la journee. Le
       bouton dit combien de gestes la pile porte, sinon « annuler » ne dit pas
       s'il reste quelque chose a annuler. -->
  <div class="card">
    <div class="card-head">
      <h2>${trad('Revenir en arrière')}</h2>
      <span class="hint">${Store.undoCount()
        ? `${Store.undoCount()} ${Store.undoCount() > 1 ? trad('modifications annulables') : trad('modification annulable')}`
        : trad('rien à annuler pour l’instant')}</span>
    </div>
    <!-- Un bouton de la taille des autres, et non la classe « pleine ». Celle-ci
         existe pour l'action qui remplace douze gestes de saisie, et elle donnait
         ici un quatrieme gabarit de bouton sur une page qui en portait deja trois :
         30, 31, 36 et 43 px. La hierarchie se dit par le remplissage, jamais par la
         taille, et celui-ci est deja seul dans sa carte, en plein.
         (Aucun backtick dans ce commentaire : il vit dans un litteral de gabarit,
         et fermerait la chaine.) -->
    <button class="btn" data-action="undo" ${Store.undoCount() ? '' : 'disabled'}
      >${trad('↶ Annuler la dernière modification')}</button>
    <p class="small muted" style="margin:12px 0 0">
      ${trad('Défait le dernier changement enregistré, quel qu’il soit : un relevé écrasé, un montant corrigé, une ligne supprimée. Au clavier, Ctrl+Z fait la même chose. Pour remonter plus loin qu’un geste, prends une sauvegarde ci-dessous.')}
    </p>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>${trad('Sauvegardes automatiques')}</h2>
      <div class="row">
        <span class="hint">${backups.length} / ${BACKUP_LIMIT} ${trad('conservées dans ce navigateur')}</span>
        <button class="btn sm ghost" data-action="make-backup">${trad('+ Sauvegarder maintenant')}</button>
      </div>
    </div>
    ${backups.length ? `
      <!-- Cinq colonnes ne passent pas sous 768 px, et la regle du projet
           l'interdit. Celles-la se pliaient d'une facon spectaculaire : la date
           cassait en « 03/0 08/20 26 », le motif en « quoti dienn e », et le
           bouton « Restaurer » se lisait verticalement, une lettre par ligne. Le
           tableau reste sur grand ecran ; en dessous, la liste cliquable, comme
           partout ailleurs. -->
      <table class="large-seulement">
        <thead><tr><th>${trad('Date')}</th><th>${trad('Motif')}</th><th>${trad('Patrimoine')}</th><th>${trad('Taille')}</th><th></th></tr></thead>
        <tbody>${backups.map((b, i) => {
          const t = (b.data.positions || []).length;
          return `<tr>
            <td class="name">${new Date(b.at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}
              <span class="sub">${fmtWhen(b.at)}</span></td>
            <td class="muted">${esc(b.reason)}</td>
            <td>${t} positions</td>
            <td class="muted">${(JSON.stringify(b.data).length / 1024).toFixed(0)} Ko</td>
            <td><button class="btn ghost sm" data-action="restore-backup" data-i="${i}">${trad('Restaurer')}</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <div class="liste-mobile">
        ${backups.map((b, i) => ligneListe({
          action: 'restore-backup', index: i,
          titre: new Date(b.at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }),
          /* Motif, anciennete et taille sur une seule ligne de sous-titre : ce
             sont trois precisions sur la meme sauvegarde, pas trois grandeurs a
             comparer entre elles. */
          sous: `${b.reason} · ${fmtWhen(b.at)} · ${(JSON.stringify(b.data).length / 1024).toFixed(0)} Ko`,
          valeur: `${(b.data.positions || []).length} positions`,
          second: trad('Restaurer'),
        })).join('')}
      </div>
      <p class="small muted" style="margin:12px 0 0">
        ${trad('Une sauvegarde est prise automatiquement au premier chargement de la journée, et avant toute réinitialisation ou restauration. Restaurer crée d’abord une sauvegarde de l’état actuel, rien n’est jamais perdu d’un seul clic.')}
      </p>`
      : `<p class="empty">${trad('Aucune sauvegarde pour l\'instant.')}</p>`}
  </div>

  <!-- L'acte le plus destructeur de l'application vivait sous le titre
       « Importer », en petit bouton fantome, sous un filet, a cote d'un champ de
       fichier : le titre n'annoncait rien de ce qu'il fait, et les boutons d'une
       carte doivent porter sur le sujet de cette carte. Il a donc la sienne, et
       elle vient en dernier, comme sur la fiche d'un compte : ce qui detruit se
       range apres ce qui repare, pour que le doigt ne le traverse pas.

       Le glyphe ↻ est retire. Il veut dire « actualiser » partout ailleurs — les
       cours, la synchronisation, le symbole depuis l'ISIN — et le meme signe ne
       peut pas dire aussi « effacer seize mois de releves ». -->
  <div class="card">
    <div class="card-head"><h2>${trad('Repartir de zéro')}</h2>
      <span class="hint">${trad('Pour qu\'une autre personne parte de ses propres chiffres')}</span>
    </div>
    <button class="btn ghost danger" data-action="start-blank">${trad('Tout effacer et repartir')}</button>
    <p class="small muted" style="margin:12px 0 0">
      ${trad('Efface les comptes, les relevés, le budget et les dépenses, et laisse un tableau de bord vierge. Une sauvegarde est prise avant, et Ctrl+Z annule.')}
    </p>
  </div>`;
}

function mountData() {
  const f = $('#importFile');
  if (!f) return;
  f.addEventListener('change', async () => {
    const file = f.files[0];
    if (!file) return;
    if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
      await askConfirm(trad("L'Excel ne peut pas être réimporté") + '\n'
        + trad("C'est une photo pour lire et retravailler ailleurs : il ne contient pas tous les "
        + 'réglages du tableau de bord. Pour restaurer, prends le fichier « Sauvegarde JSON ».'),
        { ok: 'Compris', danger: false });
      f.value = '';
      return;
    }
    if (!await askConfirm(`${trad('Importer')} ${guill(file.name)} ?\n\n${trad('Cela remplacera toutes les données actuellement enregistrées dans ce navigateur.')}`)) {
      f.value = ''; return;
    }
    try {
      const data = JSON.parse(await file.text());
      if (!data.positions || !data.monthly) throw new Error('Format inattendu');
      Store.state = data;
      Store.migrate();
      Store.save();
      render();
      toast(trad('Import réussi'));
    } catch (e) {
      alert('Import impossible : ' + e.message);
    }
  });
}

/* =============================================================
   EXPORTS
   ============================================================= */
function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 10);




/* =============================================================
   EXPORT EXCEL (.xlsx)
   Les pourcentages sont écrits en fraction : Excel applique le
   format %, donc 0,0483 s'affiche « 4,83 % » et reste calculable.
   ============================================================= */
const POCKET = { cash: 'Quotidien', bourse: 'Bourse', pe: 'Non coté' };

function sheetPositions() {
  const base = stockTotals().balance;
  const pnl = portfolioPnl();
  return {
    name: 'Positions',
    cols: [
      { h: 'Nom', t: 'text', w: 26 }, { h: 'ISIN', t: 'text', w: 15 }, { h: 'Symbole', t: 'text', w: 12 },
      { h: 'Compte', t: 'text', w: 14 },
      { h: 'Classe', t: 'text', w: 13 }, { h: 'Rôle', t: 'text', w: 11 },
      { h: 'Quantité', t: 'num', w: 11 }, { h: 'PRU', t: 'num', w: 11 },
      { h: 'Cours', t: 'num', w: 11 }, { h: 'Devise', t: 'text', w: 9 },
      { h: 'FX', t: 'num', w: 8 },
      { h: 'Valeur', t: 'eur', w: 15 }, { h: 'Investi', t: 'eur', w: 15 },
      { h: 'Perf €', t: 'eur', w: 14 }, { h: 'Perf %', t: 'pct', w: 11 },
      { h: '% portefeuille', t: 'pct', w: 14 },
    ],
    rows: Store.state.positions.map(p => [
      p.name, p.isin || '', p.symbol || '', ACC[p.account]?.short || p.account,
      ASSET_CLASSES[assetClassDe(p)], ROLES[roleDe(p)],
      num(p.qty), num(p.buyPrice), num(p.price), p.currency || 'EUR', num(p.fx || 1),
      round2(posValue(p)), round2(posInvested(p)), round2(posPerfEur(p)),
      posPerfPct(p) / 100, base ? posValue(p) / base : 0,
    ]),
    total: ['Total', '', '', '', '', null, null, null, '', null,
      round2(pnl.value), round2(pnl.invested), round2(pnl.pnl),
      pnl.pct == null ? null : pnl.pct / 100, base ? pnl.value / base : 0],
  };
}

function sheetAllocation() {
  const total = nowTotals().total;
  const items = allocationByAsset();
  return {
    name: 'Allocation',
    cols: [{ h: 'Actif', t: 'text', w: 34 }, { h: 'Montant', t: 'eur', w: 16 }, { h: '% du patrimoine', t: 'pct', w: 17 }],
    rows: items.map(i => [i.label, round2(i.value), i.pct / 100]),
    total: ['Patrimoine total', round2(total), 1],
  };
}

/* Deux axes, deux feuilles.

   Une seule feuille les melangeait : « Actions core » et « Actions satellite »
   voisinaient avec « Metaux precieux » — jusque-la coherent, la cible se fixe par
   classe et une classe peut se decouper par role — mais deux lignes d'agregat
   fermaient le tableau, « Cash a investir » puis « Place en bourse », cette
   derniere valant la somme des precedentes. Dans un tableur, une ligne de somme
   posee au milieu de ses membres est un piege : elle passe dans les filtres,
   dans les sous-totaux et dans les graphiques comme si elle etait une part, et
   la colonne « % actuel » y annonçait 83,93 % sur une base differente des
   lignes du dessus.

   La feuille des classes ne porte donc plus que des membres, et leur somme fait
   la base. Le partage socle / satellites devient sa propre feuille : c'est le
   second etage de la page Cible, il repond a une autre question — « dans ce qui
   est place, quelle part je n'ai pas l'intention de vendre » — et il a sa propre
   base. Une troisieme feuille dit de quoi chaque role est fait, la seule qui
   apprenne quelque chose qu'un total ne dit pas. */
function sheetRebalance() {
  const r = rebalanceRows();
  const line = c => [c.label, round2(c.value), c.pct / 100, c.targetPct / 100, round2(c.targetVal), round2(c.delta)];
  return {
    name: 'Cibles par classe',
    cols: [
      { h: "Classe d'actif", t: 'text', w: 28 }, { h: 'Montant', t: 'eur', w: 16 },
      { h: '% actuel', t: 'pct', w: 12 }, { h: 'Cible %', t: 'pct', w: 12 },
      { h: 'Montant cible', t: 'eur', w: 16 }, { h: 'À ajuster', t: 'eur', w: 16 },
    ],
    /* La tresorerie sortie du reequilibrage ne figure pas dans l'export : la
       feuille doit dire ce que la page dit, sans quoi le total ne retomberait
       pas sur la base annoncee. */
    rows: [...r.classes.map(line), ...(r.cash ? [line(r.cash)] : [])],
    total: [BASES.baseCibles.nom, round2(r.base), 1, null, null, null],
  };
}

/* Les entrees et sorties exceptionnelles : la memoire de ce qui est passe une
   fois. Sans elle, un mois a +12 000 EUR — ou a -15 000 — dans l'onglet Relevés
   reste inexplicable un an plus tard.

   Le signe porte le sens, ici comme dans l'etat : une colonne « Nature » en plus
   serait une seconde ecriture du meme fait, et le tableur sait deja peindre un
   negatif. Le total est donc un net, et la ligne le dit. */
function sheetApports() {
  const liste = apportsTries();
  return {
    name: 'Entrées et sorties',
    cols: [
      { h: 'Date', t: 'text', w: 12 }, { h: 'Intitulé', t: 'text', w: 30 },
      { h: 'Montant', t: 'eur', w: 16 }, { h: 'Note', t: 'text', w: 34 },
    ],
    rows: liste.map(a => [a.date || '', a.libelle || '', round2(a.montant), a.note || '']),
    total: ['Net', '', round2(apportsTotal()), ''],
  };
}

function sheetRoles() {
  const rr = rebalanceRoles();
  return {
    name: 'Socle et satellites',
    cols: [
      { h: 'Rôle', t: 'text', w: 24 }, { h: 'Montant', t: 'eur', w: 16 },
      { h: '% de la base', t: 'pct', w: 14 },
    ],
    rows: rr.roles.filter(x => x.value).map(x => [x.label, round2(x.value), x.pct / 100]),
    total: [BASES.baseCibles.nom, round2(rr.base), 1],
  };
}

/* De quoi chaque role est fait, par classe et par nature : « satellites,
   58 922 EUR » n'apprend rien, « satellites, dont 93 % de bitcoin » apprend
   tout. C'est ce que la carte de la page montre en barres empilees. */
function sheetRoleComposition() {
  const rr = rebalanceRoles();
  const rows = [];
  for (const cle of ['core', 'satellite']) {
    const parts = rr.composition[cle] || [];
    const somme = parts.reduce((s, x) => s + x.value, 0);
    for (const p of parts) {
      rows.push([ROLES[cle], p.classe, p.nature === 'fonds' ? 'Fonds' : 'En direct',
                 round2(p.value), somme ? p.value / somme : 0,
                 rr.base ? p.value / rr.base : 0]);
    }
  }
  return {
    name: 'Composition des rôles',
    cols: [
      { h: 'Rôle', t: 'text', w: 14 }, { h: "Classe d'actif", t: 'text', w: 22 },
      { h: 'Nature', t: 'text', w: 12 }, { h: 'Montant', t: 'eur', w: 16 },
      { h: '% du rôle', t: 'pct', w: 12 }, { h: '% de la base', t: 'pct', w: 14 },
    ],
    rows,
    total: ['Total', '', '', round2(rows.reduce((s, x) => s + x[3], 0)), null,
            rr.base ? rows.reduce((s, x) => s + x[3], 0) / rr.base : 0],
  };
}

/* Les lignes de cibles a afficher : les classes, plus la tresorerie si elle est
   encore suivie. `rebalanceRows().cash` vaut null quand on l'a sortie. */
const lignesAvecTresorerie = r => r.cash ? [...r.classes, r.cash] : [...r.classes];

function sheetAccounts() {
  const info = Store.state.accountInfo;
  const rows = ACCOUNTS
    .map(a => {
      const i = info[a.id] || {};
      const cash = cashOf(a.id);
      const value = nowValue(a.id) + cash;
      const invested = a.holdings
        ? holdingsOf(a.id).reduce((s, p) => s + posInvested(p), 0) + cash
        : (i.deposit != null ? i.deposit - (i.withdrawal || 0) : null);
      return [a.label, a.broker, POCKET[a.group], i.opened || '',
        i.liquidity === 'illiquid' ? 'Illiquide' : 'Liquide',
        i.deposit ?? null, round2(value),
        invested == null ? null : round2(invested),
        invested == null ? null : round2(value - invested)];
    })
    .filter(r => r[6] !== 0);
  const t = nowTotals();
  return {
    name: 'Comptes',
    cols: [
      { h: 'Compte', t: 'text', w: 24 }, { h: 'Courtier', t: 'text', w: 17 },
      { h: 'Poche', t: 'text', w: 15 }, { h: 'Ouverture', t: 'date', w: 13 },
      { h: 'Liquidité', t: 'text', w: 12 }, { h: 'Dépôts', t: 'eur', w: 15 },
      { h: 'Valeur', t: 'eur', w: 15 }, { h: 'Investi', t: 'eur', w: 15 },
      { h: 'Plus-value', t: 'eur', w: 15 },
    ],
    rows,
    total: ['Patrimoine total', '', '', '', '', null, round2(t.total), null, null],
  };
}

function sheetHistory() {
  return {
    name: 'Releves mensuels',
    cols: [
      { h: 'Date', t: 'date', w: 12 }, { h: 'Cash', t: 'eur', w: 14 },
      { h: 'Bourse', t: 'eur', w: 14 }, { h: 'Private equity', t: 'eur', w: 15 },
      { h: 'Total net worth', t: 'eur', w: 16 },
      ...ACCOUNTS.map(a => ({ h: a.label, t: 'eur', w: 15 })),
      { h: 'Commentaire', t: 'text', w: 60 },
    ],
    rows: Store.state.monthly.map(r => {
      const g = rowGroups(r);
      return [r.date, round2(g.cash), round2(g.bourse), round2(g.pe), round2(g.cash + g.bourse + g.pe),
        ...ACCOUNTS.map(a => r.v[a.id] == null ? null : num(r.v[a.id])), r.comment || ''];
    }),
  };
}

/* Journal des ventes. Cette feuille porte la seule information que les
   autres ne peuvent plus montrer : la performance des lignes soldées. */
function sheetSales() {
  const ventes = (Store.state.sales || [])
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const st = salesStats('all');
  return {
    name: 'Ventes',
    cols: [
      { h: 'Date', t: 'date', w: 12 }, { h: 'Ligne', t: 'text', w: 26 },
      { h: 'ISIN', t: 'text', w: 15 }, { h: 'Compte', t: 'text', w: 16 },
      { h: 'Qté', t: 'num', w: 10 }, { h: 'Prix de vente', t: 'eur', w: 14 },
      { h: 'Devise', t: 'text', w: 8 }, { h: 'Taux vente', t: 'num', w: 11 },
      { h: 'Prix de revient', t: 'eur', w: 15 }, { h: 'Encaissé', t: 'eur', w: 14 },
      { h: 'Coût des titres', t: 'eur', w: 15 }, { h: 'Résultat', t: 'eur', w: 14 },
      { h: '%', t: 'num', w: 10 }, { h: 'Crédité sur', t: 'text', w: 18 },
      { h: 'Note', t: 'text', w: 40 },
    ],
    rows: ventes.map(v => [
      v.date, v.name, v.isin || '', ACC[v.account]?.label || v.account || '',
      num(v.qty), round2(num(v.price)), v.currency || 'EUR', num(v.fxSell) || 1,
      round2(num(v.buyPrice)), round2(num(v.gross)), round2(num(v.invested)),
      round2(num(v.realised)),
      num(v.invested) ? round2(num(v.realised) / num(v.invested) * 100) : null,
      ACC[v.cashAccount]?.label || '', v.note || '',
    ]),
    /* Une cellule vide, et non un zero, quand il n'y a pas de base : dans un
       tableur un 0 se moyenne, se trie et se recopie comme un resultat. */
    total: ['Total', `${st.count} vente${st.count > 1 ? 's' : ''}`, '', '', null, null, '', null,
            null, round2(st.gross), round2(st.invested), round2(st.realised),
            st.pct == null ? null : round2(st.pct), '', ''],
  };
}

function sheetExpenses() {
  const f = budgetFrame();
  const rows = Store.state.budget.expenses.map(r => [
    r.month, round2(expenseRowTotal(r)), round2(expenseRowTotal(r) - f.target),
    ...expenseCategories().map(c => r.v[c] == null ? null : num(r.v[c])),
    r.note || '',
  ]);
  const totals = expenseCategories().map(c =>
    round2(Store.state.budget.expenses.reduce((s, r) => s + num(r.v[c]), 0)));
  const grand = round2(totals.reduce((s, v) => s + v, 0));
  return {
    name: 'Dépenses',
    cols: [
      { h: 'Mois', t: 'date', w: 12 }, { h: 'Total', t: 'eur', w: 14 },
      { h: 'vs objectif', t: 'eur', w: 14 },
      ...expenseCategories().map(c => ({ h: c, t: 'eur', w: 13 })),
      { h: 'Note du mois', t: 'text', w: 60 },
    ],
    rows,
    total: ['Total', grand, null, ...totals, ''],
  };
}

function sheetFixedCharges() {
  const f = budgetFrame();
  const gens = contributors();          // une colonne par personne qui partage
  const st = sharedTotals();
  return {
    name: 'Charges fixes',
    cols: [
      { h: 'Poste', t: 'text', w: 32 }, { h: 'Montant', t: 'eur', w: 15 },
      { h: '% des charges', t: 'pct', w: 15 },
      ...gens.map(p => ({ h: `Part de ${p.name}`, t: 'eur', w: 15 })),
      { h: 'À ma charge', t: 'eur', w: 15 }, { h: 'Organisme', t: 'text', w: 24 },
    ],
    rows: Store.state.budget.fixedCharges.map(c => [
      c.label, round2(num(c.amount)), f.fixed ? num(c.amount) / f.fixed : 0,
      ...gens.map(p => shareOf(c, p.id) || null),
      round2(myShare(c)), c.provider || '',
    ]),
    total: ['Total', round2(st.total), 1,
      ...st.parPersonne.map(p => round2(p.total)), round2(st.mine), ''],
  };
}

/* =============================================================
   ACTIONS
   ============================================================= */

/* Après un ajout, on place le curseur dans la nouvelle ligne et on la
   sélectionne : la valeur par défaut se remplace en tapant directement. */
function focusLast(listPath, field) {
  const list = getPath(listPath) || [];
  const el = $(`[data-path="${CSS.escape(`${listPath}.${list.length - 1}.${field}`)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest' });
  el.focus();
  el.select?.();
}

/* Suppression d'une ligne d'une liste du budget, avec confirmation.

   Le nom peut manquer, et la question doit rester lisible : « Supprimer la
   charge fixe «  » ? » designait un vide par un vide. Une ligne sans nom est
   justement celle qu'on veut le plus souvent effacer — c'est celle qu'on a
   creee par megarde. */
function makeDeleter(listKey, what, nameOf) {
  return async function (btn) {
    const i = +btn.dataset.i;
    const list = Store.state.budget[listKey];
    const item = list[i];
    if (!item) return;
    const nom = String(nameOf(item) || '').trim();
    /* Ce que la suppression emporte ailleurs.

       Un loyer rattache a un bien alimente son cash-flow et ses trois
       rendements ; une charge qui rembourse un credit lui donne sa mensualite,
       donc sa date de fin et sa part de capital. Supprimer la ligne fait tomber
       tout cela, sur un ecran qu'on ne regarde pas a ce moment-la : une
       consequence a deux ecrans de distance doit se lire avant, pas se
       decouvrir apres. */
    const suites = [];
    const bien = item.bienId ? compteById(item.bienId) : null;
    if (bien) {
      suites.push(`${trad('Le cash-flow et le rendement de')} ${guill(nomCompteV2(bien))} ${
        trad('ne la compteront plus.')}`);
    }
    if (item.creditId) {
      const cr = creditsEnCours().lignes.find(x => x.id === item.creditId);
      if (cr) {
        suites.push(`${guill(cr.libelle)} ${trad('n’aura plus de mensualité : sa date de fin '
          + 'et la part de capital de chaque échéance cesseront de se calculer.')}`);
      }
    }
    if (!await askConfirm(`${trad('Supprimer')} ${what}${nom ? ` ${guill(nom)}` : trad(', qui n’a pas de nom')} ?\n\n`
      + (suites.length ? `${suites.join(' ')}\n\n` : '')
      + trad("Cette action est réversible avec Ctrl+Z, et une sauvegarde du jour existe dans l'onglet Données."))) return;
    list.splice(i, 1);
    Store.save(); render(); toast(trad('Ligne supprimée'));
  };
}

/* Les credits proposables au rattachement d'une charge fixe.

   Hors de l'objet ACTIONS : ce n'est pas une action, et une declaration `const`
   dans un litteral d'objet ne se parse pas — le fichier entier tombait.

   Un credit deja rembourse par une autre charge n'y figure pas : deux charges sur
   le meme credit doubleraient la mensualite lue, et la premiere trouvee
   gagnerait sans qu'on sache laquelle. Celui de la charge en cours d'edition, lui,
   reste dans la liste : sinon la modifier le detacherait. */
/* Les biens proposables au rattachement d'un loyer ou d'une charge. Plusieurs
   charges peuvent viser le meme bien — une taxe fonciere et une copropriete le
   font — donc pas de garde d'unicite ici, contrairement aux credits. */
function optionsBiens() {
  return [['', trad('aucun, ce n’est pas lié à un bien')],
    ...comptesBiens().map(c => [c.id, nomCompteV2(c)])];
}

/* Les champs d'un placement saisi a la main, et la lecture du formulaire.

   Ecrits une fois pour l'ajout et pour la modification : deux listes de champs a
   tenir d'accord auraient fini par diverger, et c'est le defaut que ce projet
   corrige sans arret. Les trois champs de l'echeance ne s'affichent que pour du
   non cote — un bien immobilier n'a pas de date de remboursement, et une SCPI
   n'en a pas non plus. */
/* `type` : le type du compte qui porte la ligne, pas seulement sa classe. */
/* L'exemple suit la classe du support, parce qu'il enseigne autant qu'il
   illustre : « ex. Projet Bordeaux » sous l'intitule d'un fonds euros ne dit pas
   ce qu'on attend, il fait douter d'etre au bon endroit. Le motif est celui des
   autres exemples de l'application, qui nomment tous une chose de leur espece. */
const EXEMPLE_PLACEMENT = {
  actions:     'ex. ETF MSCI World',
  garanti:     'ex. Fonds euros',
  obligations: 'ex. Fonds obligataire',
  liquidites:  'ex. Fonds monétaire',
  immobilier:  'ex. SCPI de rendement',
  nonCote:     'ex. Projet Bordeaux',
  crypto:      'ex. Bitcoin',
};

function champsPlacement(classe, l = null, prete = false, type = null) {
  const echeancier = !!prete;
  const estime = estDetenuEnDirect(type);
  return [
    { cle: 'libelle', label: 'Intitulé', type: 'texte', requis: true, max: NOM_LIGNE_MAX,
      valeur: l ? (l.libelle || '') : '',
      exemple: EXEMPLE_PLACEMENT[classe] || 'ex. Projet Bordeaux' },
    { cle: 'valeur',
      label: `${estime ? 'Valeur estimée' : 'Valeur aujourd’hui'} (€)`, type: 'nombre',
      valeur: l ? num(l.valeur) : '', exemple: '0',
      aide: estime ? 'ce que tu en tirerais en le vendant aujourd’hui'
                   : 'ce que la ligne vaut, capital et intérêts courus compris' },
    { cle: 'prixDeRevient', label: trad('Montant investi (€)'), type: 'nombre',
      valeur: l ? (num(l.prixDeRevient) || '') : '', exemple: '0',
      aide: trad('facultatif, il donne la plus-value') },
    /* « Date d'entree » et non « date d'achat » : ce libelle-la est reserve aux
       lignes de marche, ou il porte une aide commune sur le rendement par an et
       l'effet du jour, textes qui ne veulent rien dire pour une moto. */
    { cle: 'dateAcquisition', label: trad('Date d’entrée'), type: 'date',
      valeur: l ? (l.dateAcquisition || '') : todayISO() },
    /* La date de l'estimation, pour les seules classes dont la valeur est une
       appreciation. Un pret non cote vaut son nominal, une SCPI a un prix de
       part publie : ni l'un ni l'autre ne se « revoit ». Une Rolex, si. */
    ...(estime ? [{ cle: 'estimeLe', label: trad('Estimée le'), type: 'date',
      valeur: l ? (l.estimeLe || '') : todayISO(),
      aide: trad('la cloche te rappellera de la revoir dans un an') }] : []),
    ...(echeancier ? [
      { cle: 'taux', label: trad('Taux annoncé (%)'), type: 'nombre',
        valeur: l ? (num(l.taux) || '') : '', exemple: '0',
        aide: trad('facultatif, celui du contrat') },
      { cle: 'echeance', label: 'Échéance', type: 'date',
        valeur: l ? (l.echeance || '') : '',
        aide: trad('la date de remboursement prévue') },
      { cle: 'statut', label: trad('Où en est-il ?'), type: 'liste',
        options: Object.entries(STATUTS_LIGNE),
        valeur: l ? statutLigne(l) : 'encours',
        aide: trad('à déclarer : une échéance dépassée ne veut pas dire en retard') },
    ] : []),
  ];
}

function litPlacement(v, base) {
  return {
    ...base,
    libelle: v.libelle,
    valeur: num(v.valeur),
    prixDeRevient: num(v.prixDeRevient) || null,
    dateAcquisition: v.dateAcquisition || '',
    ...(v.estimeLe !== undefined ? { estimeLe: v.estimeLe || '' } : {}),
    ...(v.taux !== undefined ? { taux: num(v.taux) || null } : {}),
    ...(v.echeance !== undefined ? { echeance: v.echeance || '' } : {}),
    ...(v.statut !== undefined ? { statut: v.statut || 'encours' } : {}),
  };
}

function creditsRattachables(sien = null) {
  const pris = new Set(Store.state.budget.fixedCharges
    .map(c => c.creditId).filter(x => x && x !== sien));
  return [['', 'aucun, c’est une charge ordinaire'],
    ...creditsEnCours().lignes.filter(c => !pris.has(c.id))
      .map(c => [c.id, `${c.libelle} · ${c.etabNom} · ${fmtEUR0(c.reste)} restant dû`])];
}

const ACTIONS = {
  /* Les crans et le menu d'annees ecrivent la meme valeur : un bouton porte sa
     plage en `data-range`, le menu la porte en `value`. Le cran vide du menu
     (« Par année ») ramene a la derniere plage glissante plutot qu'a rien —
     sortir d'une annee sans rien choisir laisserait la page sans borne. */
  'sales-range'(btn) {
    const v = btn.dataset.range ?? btn.value;
    salesRange = v || '1y';
    render();
  },
  'go-performance'() { location.hash = '#/performance'; },
  /* Annuler une vente, pour de bon. Ce bouton ne retirait que la ligne du
     journal, en annonçant que ni les titres ni le cash ne bougeaient : un geste
     qui ressemble à une annulation et n'en est pas. Il en est une maintenant. */
  async 'del-sale'(btn) {
    const i = +btn.dataset.i;
    const v = Store.state.sales[i];
    if (!v) return;
    /* Une vente declaree n'a rien ecrit : la question n'est pas la meme, et
       promettre un retour de titres qui n'existent pas serait un mensonge. */
    if (v.declaree) {
      if (!await askConfirm(`${trad('Retirer')} ${guill(v.name)} ${trad('du journal ?')}\n\n`
        + trad("Cette vente était déclarée pour mémoire : elle n'avait rien écrit "
        + "d'autre, il n'y a rien à défaire. Réversible avec Ctrl+Z."),
        { ok: 'Retirer du journal', danger: true })) return;
      Store.addBackup('avant retrait d’une vente déclarée');
      annulerVente(i);
      fermerApercuSi('vente');
      Store.save(); render();
      toast(trad('Vente retirée du journal'));
      return;
    }
    const ou = v.cashAccount ? ACC[v.cashAccount]?.short || compteById(v.cashAccount)
      && nomCompteV2(compteById(v.cashAccount)) || 'le cash' : null;
    if (!await askConfirm(trad('Annuler cette vente ?') + '\n'
      + `${v.name}, ${num(v.qty)} × ${fmtCur(num(v.price), v.currency)}, ${fmtSigned(v.realised)}.\n\n`
      + trad('Les {n} titres reviennent sur leur ligne').replace('{n}', num(v.qty))
      + (ou ? ` ${trad('et {m} repartent de {ou}').replace('{m}', fmtEUR(num(v.gross))).replace('{ou}', ou)}` : '')
      + `, ${trad('et la vente quitte le journal.')}\n\n`
      + trad("Le total ne revient pas forcément à l'euro d'avant : les titres rendus valent le "
      + 'cours du jour. Réversible avec Ctrl+Z.'), { ok: 'Annuler la vente', danger: true })) return;
    Store.addBackup('avant annulation de vente');
    annulerVente(i);
    fermerApercuSi('vente');
    refreshAccounts();
    Store.save(); render();
    toast(`${trad('Vente annulée,')} ${num(v.qty)} ${trad('titres rendus')}`);
  },
  async 'sell-position'() {
    const v = await askSale();
    if (!v) return;
    /* Le dernier choix du menu des lignes est « une vente passee » : la fenetre
       rend alors ce que rendait sa jumelle, et c'est ici que les deux chemins se
       separent — l'un touche le portefeuille, l'autre le seul journal. */
    if (v.passee) {
      declarerVente(v);
      Store.save(); render();
      toast(`${guill(v.name)} ${trad('ajoutée au journal')} · ${fmtSigned(num(v.realised))}`);
      return;
    }
    Store.addBackup('avant vente');
    const a = sellPosition(v);
    if (!a) { toast(trad('Vente impossible')); return; }
    Store.save(); render();
    const ou = v.cashAccount ? ` · encaissé sur ${ACC[v.cashAccount]?.short || 'le cash'}` : '';
    toast(`${a.realised >= 0 ? trad('Plus-value') : trad('Moins-value')} ${trad('de')} ${fmtSigned(a.realised)}${ou}`);
  },
  /* Ajouter une ligne : un seul chemin, et c'est la recherche.

     Deux surfaces pour un seul travail, c'est le defaut que ce projet defait
     partout ailleurs : on ne les met pas cote a cote, on en garde une. Le bouton
     ouvre donc la recherche, et la saisie a la main reste au pied de cette
     carte, pour un titre sans ISIN ou cote nulle part.

     Le drapeau plutot qu'un `requestAnimationFrame` : changer de vue passe par
     `hashchange`, donc le champ n'existe pas encore au retour de cette
     fonction. `render()` le consomme quand la carte est posee. */
  'ajouter-ligne'(btn) {
    compteVisePourAjout = btn?.dataset.compte || null;
    ouvrirRechercheApresRendu = true;
    if (location.hash.startsWith('#/positions')) render();
    else location.hash = '#/positions';
  },

  async 'add-position'() {
    /* La categorie vient avant le compte : c'est elle qui decide des comptes
       proposes. Les deux champs sont lies, la liste se refait a chaque
       changement. */
    const v = await askForm({
      titre: trad('Nouvelle ligne de titres'),
      sous: trad('L’ISIN suffit : le symbole et le cours se remplissent à la prochaine actualisation'),
      lie: { de: 'assetClass', vers: 'account', options: comptesPourListe,
             vide: 'aucun compte ne peut porter cette classe' },
      champs: [
        { cle: 'name', label: 'Nom', type: 'texte', requis: true, max: NOM_LIGNE_MAX,
          exemple: 'ex. MSCI World', aide: `${NOM_LIGNE_MAX} caractères au plus : ce nom se lit `
            + `dans une colonne de tableau. Le nom officiel du titre reste sur sa fiche` },
        { cle: 'isin', label: 'ISIN', type: 'texte', exemple: 'ex. IE000OJ5TQP4',
          aide: trad('douze caractères, laisse vide si tu saisis le cours à la main') },
        { cle: 'assetClass', label: trad('Classe d’actif'), type: 'liste', options: OPTIONS_CLASSE, valeur: 'actions' },
        { cle: 'role', label: 'Rôle', type: 'liste', options: OPTIONS_ROLE, valeur: 'satellite',
          aide: trad('coeur de portefeuille ou pari satellite') },
        /* `nomCompte()` rend un champ de renommage, pas un libelle : dans une
           liste deroulante il s'afficherait comme du HTML brut. */
        { cle: 'account', label: 'Compte', type: 'liste', options: comptesPourListe('ETF'),
          valeur: defaultHoldingAccount(), aide: trad('limité aux comptes compatibles') },
        { cle: 'qty', label: 'Quantité', type: 'nombre', exemple: '0' },
        { cle: 'buyPrice', label: trad('Prix de revient unitaire'), type: 'nombre', exemple: '0' },
        { cle: 'currency', label: 'Devise', type: 'liste', options: CURRENCIES.map(c => [c, c]), valeur: 'EUR' },
        { cle: 'dateAchat', label: trad('Date d’achat'), type: 'date', valeur: todayISO(),
          aide: DATE_ACHAT_AIDE },
        { cle: 'manual', label: trad('Valeur saisie à la main'), type: 'case',
          aide: trad('coche si aucun cours ne peut être récupéré') },
      ],
    });
    if (!v) return;
    if (!v.account) { toast(trad('Ouvre d’abord un compte qui accepte cette catégorie')); return; }
    const isin = v.isin.toUpperCase();
    if (isin && !isinIsValid(isin)) toast(trad('ISIN accepté, mais sa clé de contrôle est incorrecte'));
    Store.state.positions.push({
      id: 'p' + Date.now(), name: v.name, isin, symbol: '', currency: v.currency,
      qty: v.qty, buyPrice: v.buyPrice, price: 0, fx: 1,
      assetClass: v.assetClass, role: v.role, account: v.account, manual: v.manual,
      dateAchat: v.dateAchat || '',
    });
    Store.save(); render();
    toast(`${guill(v.name)} ${trad('ajoutée')}`);
  },
  /* Depuis une tuile : on change de vue, on descend à la bonne carte,
     et on la fait clignoter une fois pour qu'on la repère. */
  'apercu'(btn) { openApercu(btn.dataset.apercu, btn.dataset.arg); },
  /* Fermer un panneau ou l'on a saisi sans enregistrer : on le dit, et on propose
     de garder. Sans cette question, quatre montants corriges disparaissaient au
     premier « Fermer » — le contraire de ce que la saisie differee doit apporter.
     Meme geste et memes mots que la fiche d'une ligne de titres. */
  async 'modal-close'() {
    const corps = $('#modalBody');
    if (corps?.dataset.differe === 'sale') {
      const garder = await askConfirm(trad('Modifications non enregistrées') + '\n'
        + trad('Ce panneau porte des montants qui ne sont pas encore dans tes données.'),
        { ok: 'Enregistrer et fermer', refus: 'Fermer sans enregistrer', danger: false });
      if (garder) { appliquerDiffere(); Store.save(); render(); toast(trad('Montants enregistrés')); }
    }
    closeApercu();
  },

  /* « Enregistrer » d'un panneau d'apercu : les champs entrent dans l'etat, la
     page derriere suit, et le panneau reste ouvert — c'est la qu'on verifie que le
     total a bouge comme prevu. */
  'apercu-enregistrer'() {
    appliquerDiffere();
    /* Relever ses soldes de credit, c'est les avoir regardes : la date de
       verification se pose donc ici comme elle se pose dans la fenetre d'un
       credit, et le rappel des trois mois repart de zero. Sans cela, le panneau
       corrigeait les montants et l'alerte continuait de reclamer. */
    if (apercuOuvert === 'credits') {
      for (const e of ETABS()) for (const d of (e.dettes || [])) d.verifieLe = todayISO();
    }
    Store.save();
    render();
    if (apercuOuvert) openApercu(apercuOuvert, apercuArg);
    toast(trad('Montants enregistrés'));
  },
  'notifications'() { retourHaptique(); basculeNotifs(); },
  /* Revenir d'où l'on vient, sauf si l'on vient de nulle part : un signet ouvert
     directement n'a pas d'histoire dans l'application, et `history.back()`
     sortirait du site. L'accueil sert alors de sortie. */
  'retour-arriere'() {
    retourHaptique();
    if (navsInternes > 0) history.back(); else location.hash = '#/overview';
  },
  'fermer-notifs'() { fermeNotifs(); },
  /* Masquer une notification, pas la corriger : elle ne reviendra plus tant que
     ses mots ne changent pas. Le panneau se refait sur place — le fermer aurait
     obligé à le rouvrir pour masquer la suivante. */
  'masquer-notif'(btn) {
    masquerNotif(btn.dataset.cle);
    Store.save();
    rendNotifs();
    majOnglets();
    toast(trad('Notification masquée. On la ramène depuis Notifications.'));
  },
  'rendre-notifs'() {
    rendreNotifs();
    Store.save(); render();
    toast(trad('Toutes les notifications sont réaffichées'));
  },
  /* Une famille entière s'éteint, depuis le menu de réglages. */
  /* L'interrupteur bascule ce qu'il trouve, il ne recoit plus une valeur.
     C'etait un `data-action-change` sur une liste deroulante, qui lisait
     `sel.value` ; c'est un bouton, et l'etat vit dans les reglages. Lire l'etat
     plutot que le recevoir supprime la question « et si les deux divergent ». */
  'famille-notif'(btn) {
    const cle = btn.dataset.cle;
    const actif = !reglagesNotifs()[cle];
    Store.state.meta.notifsReglages = {
      ...(Store.state.meta.notifsReglages || {}), [cle]: actif };
    Store.save(); render();
    retourHaptique();
    toast(`${actif ? trad('Activé') : trad('Éteint')} : ${
      (FAMILLES_NOTIF.find(f => f[0] === cle) || [, cle])[1].toLowerCase()}`);
  },
  /* Depuis un panneau : la fiche s'ouvre a la place, la fenetre se ferme. */
  'aller-fiche'(btn) { closeApercu(); location.hash = btn.dataset.route; },

  'goto'(btn) {
    closeApercu();
    pendingAnchor = btn.dataset.anchor || null;
    const view = btn.dataset.view;
    if (currentView() === view) { focusAnchor(); return; }
    location.hash = '#/' + view;
  },
  /* Suivre une classe qu'on ne detient pas encore : sans cela, impossible de
     se fixer un objectif d'obligations avant d'en avoir achete une. La ligne
     n'apparait que si elle porte un encours ou une cible — c'est la cible
     qu'on pose ici. */
  /* Decouper une classe en deux cibles, une par role. Le partage au prorata est
     dans `partageDeCible()`, cote store, pour qu'un test l'exerce vraiment. */
  'decouper-classe'(btn) {
    const cle = btn.dataset.cle;
    const tg = Store.state.targets.classes || (Store.state.targets.classes = {});
    if (tg[cle] !== null && typeof tg[cle] === 'object') return;
    tg[cle] = partageDeCible(tg[cle], stockTotals().parClasseRole?.[cle]);
    Store.save(); render();
    toast(`${ASSET_CLASSES[cle]} · ${ROLES.core} ${tg[cle].core} % ${trad('et')} ${ROLES.satellite.toLowerCase()} ${tg[cle].satellite} %`);
  },

  /* Revenir a une seule cible : la somme des deux, pour que le total des cibles
     ne bouge pas davantage au retour qu'a l'aller. */
  'refusionner-classe'(btn) {
    const cle = btn.dataset.cle;
    const tg = Store.state.targets.classes || {};
    const v = tg[cle];
    if (v === null || typeof v !== 'object') return;
    tg[cle] = Object.values(v).reduce((s, x) => s + num(x), 0);
    Store.save(); render();
    toast(`${ASSET_CLASSES[cle]} · ${trad('une seule cible,')} ${tg[cle]} %`);
  },

  /* « Suivre une classe » propose aussi les classes qu'on a sorties.

     Elles en etaient exclues par une logique defendable — une classe sortie se
     remet depuis la ligne de perimetre — mais cette ligne est une phrase de
     prose au-dessus de la liste, et personne ne l'y cherche. Qui vient de
     retirer « Actions » par megarde ouvre le seul bouton qui parle d'ajouter une
     classe, ne l'y trouve pas, et conclut qu'elle est perdue. Le chemin de
     retour doit passer par la porte qui porte le nom du geste. */
  async 'ajouter-classe-cible'() {
    const cibles = Store.state.targets;
    const tg = cibles.classes || (cibles.classes = {});
    const r = rebalanceRows();
    const visibles = r.classes.map(c => c.cle.split('.')[1]);
    const sorties = r.exclues.map(x => x.cle);
    const libres = Object.entries(ASSET_CLASSES)
      .filter(([k]) => !visibles.includes(k))
      .map(([k, label]) => [k, sorties.includes(k) ? `${label} (sortie, à remettre)` : label]);
    if (!libres.length) { toast(trad('Toutes les classes sont déjà suivies')); return; }
    const somme = sommeCibles();
    /* La cible mise de cote au retrait est proposee par defaut : celui qui
       remet une classe veut presque toujours retrouver ce qu'il avait. */
    const premiere = libres[0][0];
    const gardee = cibles.ciblesRetirees && cibles.ciblesRetirees[premiere];
    const v = await askForm({
      titre: trad('Suivre une classe'),
      sous: `Tes cibles totalisent ${somme} %. Une somme de 100 % rend les montants cibles exacts.`,
      ok: 'Suivre',
      champs: [
        { cle: 'classe', label: trad('Classe d’actif'), type: 'liste', options: libres, valeur: premiere },
        { cle: 'cible', label: 'Cible', type: 'nombre',
          valeur: gardee !== undefined ? sommeCibleDe(gardee) : 0,
          aide: trad('en % du portefeuille, modifiable ensuite dans la liste') },
      ],
    });
    if (!v) return;
    /* Remettre une classe sortie, c'est la reintegrer : sans cela sa cible
       s'inscrivait pendant que son encours restait hors de la base, et la ligne
       revenait avec une jauge condamnee a rester vide. */
    if (sorties.includes(v.classe)) {
      cibles.exclues = (cibles.exclues || []).filter(x => x !== v.classe);
      if (cibles.ciblesRetirees) delete cibles.ciblesRetirees[v.classe];
    }
    tg[v.classe] = Math.max(0, Math.min(100, num(v.cible)));
    Store.save(); render();
    toast(`${ASSET_CLASSES[v.classe]} · ${trad('cible')} ${tg[v.classe]} %`);
  },
  /* Sortir une classe du reequilibrage. Son encours quitte la base — sinon les
     pourcentages ne totaliseraient plus 100 % sans explication.

     Sa cible est mise de cote au lieu d'etre ecrasee. Elle retombait a zero, et
     un decoupage par role partait avec : « 70 % de core, 20 % de satellite »
     devenait `0`, un seul nombre, et remettre la classe rendait une ligne a
     zero. Un geste reversible ne doit rien detruire en chemin. */
  /* La tresorerie passe par les memes deux actions que les classes. Sa cible ne
     vit pas dans `classes` mais a la racine, `targets.cashToInvest` : ce petit
     detour est le prix de ne pas dupliquer tout le mecanisme d'exclusion. */
  'retirer-classe-cible'(btn) {
    const k = btn.dataset.cle;
    const tg = Store.state.targets;
    const tresorerie = k === CLE_TRESORERIE;
    tg.exclues = [...new Set([...(tg.exclues || []), k])];
    const cible = tresorerie ? tg.cashToInvest : (tg.classes || {})[k];
    if (cible !== undefined && cible !== 0) {
      tg.ciblesRetirees = tg.ciblesRetirees || {};
      tg.ciblesRetirees[k] = cible;
    }
    if (tresorerie) tg.cashToInvest = 0;
    else if (tg.classes) tg.classes[k] = 0;
    Store.save(); render();
    toast(`${nomDeLaCible(k)} ${trad('sortie du rééquilibrage, sa cible est gardée')}`);
  },
  'reintegrer-classe'(btn) {
    const k = btn.dataset.cle;
    const tg = Store.state.targets;
    tg.exclues = (tg.exclues || []).filter(x => x !== k);
    /* La cible d'avant revient telle quelle, decoupage par role compris. */
    const gardee = tg.ciblesRetirees && tg.ciblesRetirees[k];
    if (gardee !== undefined && gardee !== null) {
      if (k === CLE_TRESORERIE) tg.cashToInvest = gardee;
      else (tg.classes || (tg.classes = {}))[k] = gardee;
      delete tg.ciblesRetirees[k];
    }
    Store.save(); render();
    toast(`${nomDeLaCible(k)} ${trad('de retour')}${gardee !== undefined && gardee !== null
      ? `, cible ${sommeCibleDe(gardee)} %` : ''}`);
  },
  'filtrer-role'(btn) { posRole = btn.dataset.role; render(); },
  /* Meme cycle que le tableau des positions : décroissant, croissant, puis
     retour au calendrier. */
  'sort-depenses'(btn) {
    const key = btn.dataset.key;
    depSort = !depSort || depSort.key !== key ? { key, dir: 'desc' }
            : depSort.dir === 'desc' ? { key, dir: 'asc' } : null;
    render();
  },
  'monter-category'(btn) {
    if (deplacerCategorie(btn.dataset.cat, -1)) { Store.save(); render(); }
  },
  'descendre-category'(btn) {
    if (deplacerCategorie(btn.dataset.cat, +1)) { Store.save(); render(); }
  },
  /* Deux routeurs de `change` visent ce selecteur — le generique, et celui des
     `select.annee` dont il porte la classe pour l'habillage et la garde des
     16 px. Le second appel arrive avec la meme valeur : on ne re-rend pas. */
  'filtrer-compte-titres'(sel) {
    const v = sel?.value ?? sel?.dataset?.year;
    if (v == null || v === posCompte) return;
    posCompte = v; render();
  },
  'sort-positions'(th) {
    const key = th.dataset.key;
    if (!posSort || posSort.key !== key) posSort = { key, dir: 'desc' };
    else if (posSort.dir === 'desc') posSort = { key, dir: 'asc' };
    else posSort = null;                       // 3e clic : retour à l'ordre de saisie
    render();
  },
  /* Entrer en demonstration. Rien n'est ecrase : le mode bascule la cle de
     stockage, si bien que les vraies donnees restent ou elles sont et se
     retrouvent intactes en sortant.
     Le jeu de donnees n'est pas charge par index.html : il est lu ici, au
     clic, pour ne rien couter au demarrage. */
  async 'charger-demo'() {
    if (modeDemo()) return;
    if (!await askConfirm(trad('Voir la démonstration ?') + '\n\n'
      + trad('Tes données ne sont pas touchées : elles restent enregistrées de leur côté, '
      + 'et tu les retrouves en quittant le mode. Rien ne part en ligne pendant ce temps.'),
      { ok: 'Charger la démonstration' })) return;
    /* Le jeu de demonstration est la graine, et il n'en existe pas de second.

       Un instantane a part a vecu a cote d'elle, decrivant la meme personne
       fictive : il fallait se souvenir de modifier les deux, c'est le motif que
       ce projet defait partout ailleurs, et ils avaient deja diverge. La graine
       est de toute facon ce qu'un visiteur voit au premier chargement, donc
       c'est elle qui doit etre bonne.

       Le mode demonstration n'a plus qu'a la reposer, sous sa propre cle de
       stockage : il sert a quelqu'un qui a deja saisi ses donnees et veut
       regarder sans y toucher. Aucune requete, donc aucune « Demonstration
       indisponible » possible. */
    setModeDemo(true);
    Store.state = structuredClone(SEED);
    Store.migrate();
    Store.save();
    render();
    toast(trad('Démonstration chargée, tes données sont en sécurité'));
  },

  /* Sortir. On remet la cle reelle et on relit : l'etat de demonstration reste
     dans son coin, pret a etre repris sans avoir a le recharger. */
  'quitter-demo'() {
    if (!modeDemo()) return;
    setModeDemo(false);
    Store.load();
    refreshAccounts();
    render();
    toast(trad('Retour à tes données'));
  },

  async 'start-blank'() {
    if (!await askConfirm(trad('Repartir de zéro ?') + '\n'
      + trad('Toutes les données actuelles seront effacées : {p} positions, {c} comptes, '
        + '{m} mois de relevés, le budget et les dépenses.')
        .replace('{p}', Store.state.positions.length)
        .replace('{c}', ACCOUNTS.length)
        .replace('{m}', Store.state.monthly.filter(r => !rowIsEmpty(r)).length)
      + '\n\n' + trad('Une sauvegarde est prise avant, et Ctrl+Z annule.'),
      { ok: 'Tout effacer et repartir', danger: true })) return;

    Store.addBackup('avant remise à zéro');
    Store.state = blankState();
    Store.migrate();
    Store.save();
    render();
    toast(trad('Tableau de bord vierge, à toi de le remplir'));
  },

  /* --- espace Comptes ------------------------------------------------- */
  /* Corriger le type d'un compte. La regle vit dans `changementDeTypePossible`,
     cote store, pour qu'un test l'exerce : c'est elle qui empeche un Livret A de
     se retrouver a detenir des actions.

     Un refus repose la liste sur l'ancienne valeur. Sans cela le menu resterait
     sur un type que l'etat n'a pas pris, et le prochain rendu le corrigerait
     dans le dos — on aurait vu son choix s'annuler tout seul, sans raison. */
  'changer-type-compte'(sel) {
    const c = compteById(sel.dataset.id);
    if (!c) return;
    const cible = sel.value;
    const v = changementDeTypePossible(c, cible);
    if (!v.ok) { sel.value = c.type; toast(v.raison); return; }
    if (v.sansChangement) return;
    const avant = typeCompte(c.type).label;
    c.type = cible;
    Store.save(); render();
    toast(`${nomCompteV2(c)} : ${avant} ${trad('devient')} ${trad(typeCompte(cible).label)}`);
  },

  /* Le nom d'un etablissement, et la note qu'on lui attache.

     Les credits gardent leur propre fenetre : ils ont sept champs a eux, une
     echeance et une projection, et les entasser ici ferait une fenetre qui
     melange l'identite du contenant et le detail de ses dettes. */
  async 'modifier-etab'(btn) {
    const e = etabById(btn.dataset.id);
    if (!e) return;
    const mot = contenantDeLEtab(e.id);
    const siens = COMPTES().filter(c => c.etabId === e.id && c.statut !== 'archive');
    const v = await askForm({
      titre: trad('Modifier l’établissement'), sous: e.nom, ok: 'Enregistrer',
      champs: [
        { cle: 'nom', label: 'Nom', type: 'texte', requis: true,
          valeur: e.nom, exemple: 'ex. ta banque en ligne' },
        /* En lecture, et nomme comme tel : c'est une consequence, pas un choix.
           Le libelle porte le compte qui le determine, sinon « deduit des comptes
           rattaches » obligerait a aller les compter ailleurs. */
        { cle: 'type', label: 'Type', type: 'texte', valeur: trad(mot.titre), lecture: true,
          /* La phrase entiere est la clef, ponctuation comprise : l'anglais ne
             met pas d'espace avant un deux-points, et coudre « deduit de son
             compte » + « : » + la liste imposait la typographie francaise aux
             deux langues. */
          aide: siens.length
            ? (siens.length === 1
                ? trad('déduit de son compte : {types}. Pour le changer, change ce qu’il contient.')
                : trad('déduit de ses {n} comptes : {types}. Pour le changer, change ce qu’il contient.')
                    .replace('{n}', siens.length))
                .replace('{types}', siens.map(c => trad(typeCompte(c.type).label)).join(', '))
            : trad('aucun compte rattaché pour l’instant, donc le terme le plus large') },
        { cle: 'notes', label: 'Notes', type: 'texte', valeur: e.notes || '',
          exemple: 'ex. le numéro du conseiller, la date du prochain point',
          aide: trad('facultatif') },
      ],
    });
    if (!v) return;
    e.nom = v.nom.trim();
    /* Cas miroir du champ « Nom du bien » : le contenant d'un bien detenu en
       direct et ce bien ne designent qu'une chose, ils ne doivent porter qu'un
       nom. Renommer l'etablissement renomme donc aussi la ligne et le compte,
       sinon la carte de la liste des actifs et son contenu divergent. */
    const tous = COMPTES().filter(x => x.etabId === e.id);
    if (tous.length === 1 && estDetenuEnDirect(typeCompte(tous[0].type))
        && (tous[0].lignes || []).length === 1 && !(tous[0].cash || []).length) {
      tous[0].lignes[0].libelle = e.nom;
      if (tous[0].libelle) tous[0].libelle = e.nom;
    }
    /* Une note vide efface la cle plutot que d'ecrire une chaine vide : c'est ce
       que fait `setPath` pour la saisie directe, et deux regimes d'effacement sur
       le meme champ finiraient par se contredire. */
    if (v.notes.trim()) e.notes = v.notes.trim(); else delete e.notes;
    Store.save(); render();
    toast(`${e.nom} ${trad('enregistré')}`);
  },

  /* L'identite d'un compte : nom, type, plafond, date d'ouverture, numero.
     Cinq champs qu'on regle une fois, et qui restaient ouverts sur la fiche.

     La boucle n'est pas une precaution de style. Un changement de type peut
     etre refuse — il laisserait un placement sans place — et refuser en
     fermant la fenetre jetterait aussi le nom que la personne venait de
     corriger. On rouvre donc en gardant la saisie, avec la raison du refus
     dans un toast. Annuler reste le seul chemin qui n'ecrit rien.

     Les champs proposes suivent le type actuel, pas celui qu'on est en train
     de choisir : le plafond n'apparait que sur un livret. Passer un compte en
     livret puis lui donner son plafond demande donc deux passages, ce qui est
     le cas rare ; faire suivre la liste en direct demanderait de reconstruire
     la fenetre a chaque changement de menu, pour un gain qui ne se produit
     presque jamais. */
  async 'modifier-compte'(btn) {
    const c = compteById(btn.dataset.id);
    if (!c) return;
    const t = typeCompte(c.type);
    let saisi = null;

    for (;;) {
      const valeur = (cle, defaut) => (saisi ? saisi[cle] : defaut);
      const champs = [{ cle: 'libelle', label: `${trad('Nom du')} ${motCompte(typeCompte(c.type))}`, type: 'texte',
        valeur: valeur('libelle', c.libelle || ''), exemple: t.label }];

      if (!t.interne) champs.push({ cle: 'type', label: `${trad('Type de')} ${motCompte(t)}`, type: 'liste',
        options: [...typesCompteChoix().map(x => [x.id, x.label]),
                  ['__nouveau', trad('+ Autre type…')]],
        valeur: valeur('type', c.type),
        aide: trad('il commande la poche du patrimoine et la disponibilité') });

      /* Le rattachement, modifiable apres coup.

         Depuis ce matin chaque bien cree le sien, donc le cas ne se reproduit
         plus ; restaient les biens poses avant, qu'aucun geste ne pouvait
         separer. « Supprime et recree » n'est pas une reponse quand un credit et
         un historique sont derriere.

         Les contenants proposes sont ceux du meme mot — on ne range pas un PEA
         dans un appartement — plus le sien, qui doit rester choisissable pour
         pouvoir ne rien changer, et « Nouveau », qui est justement le geste qui
         separe. */
      if (!t.interne && !t.sansEtab) {
        const mot = contenantDuType(c.type);
        const compatibles = ETABS().filter(e => e.id === c.etabId
          || !COMPTES().some(x => x.etabId === e.id)
          || contenantDeLEtab(e.id).titre === mot.titre);
        champs.push({ cle: 'etab', label: trad(mot.titre), type: 'liste',
          options: [...compatibles.map(e => [e.id, e.nom]), ['__nouveau', `+ ${trad(mot.nouveau)}…`]],
          valeur: valeur('etab', c.etabId || compatibles[0]?.id || '__nouveau'),
          /* La phrase tient en une clef : coupee en deux, la seconde moitie
             restait francaise derriere une premiere traduite, et la bulle
             disait « two assets attached to the same le partagent ». */
          aide: trad('un crédit se pose sur ce niveau : deux biens rattachés au même le partagent') });
      }

      if (t.id === 'livret') champs.push({ cle: 'plafond', label: trad('Plafond de versement (€)'),
        type: 'nombre', valeur: valeur('plafond', num(c.plafond) || ''), exemple: 'ex. 22950',
        aide: trad('facultatif') });

      if (!t.interne) champs.push(
        { cle: 'ouvertLe', label: motDateCompte(typeCompte(c.type)), type: 'date',
          valeur: valeur('ouvertLe', c.ouvertLe || ''),
          aide: t.dateSensible ? 'elle commande la disponibilité de ce compte' : 'facultatif' },
        { cle: 'numero', label: trad('Numéro de compte'), type: 'texte',
          valeur: valeur('numero', c.numero || ''), aide: trad('facultatif') });

      /* La date de cloture ne se corrige que sur un compte deja archive. Elle
         se pose au moment ou l'on archive ; ce champ sert a la retoucher quand
         on s'est trompe, ou a la renseigner sur un compte archive avant qu'elle
         n'existe. L'offrir sur un compte ouvert ferait de ce formulaire une
         seconde facon de cloturer, muette et sans confirmation. */
      if (c.statut === 'archive') champs.push(
        { cle: 'clotureLe', label: trad('Date de clôture'), type: 'date',
          valeur: valeur('clotureLe', c.clotureLe || ''),
          aide: trad('facultative, elle situe le compte dans le temps') });

      const v = await askForm({ titre: `${trad('Modifier le')} ${motCompte(typeCompte(c.type))}`, sous: nomCompteV2(c),
                                champs, ok: 'Enregistrer' });
      if (!v) return;

      /* Le type libre suit le motif du contenant, juste en dessous : l'option
         « + Autre… » se regle a la validation, et un renoncement ne doit rien
         avoir change. */
      if (v.type === '__nouveau') {
        const id = await demanderTypePerso();
        if (!id) { saisi = v; continue; }
        v.type = id;
      }

      if (v.type && v.type !== c.type) {
        const verdict = changementDeTypePossible(c, v.type);
        if (!verdict.ok) { toast(verdict.raison); saisi = v; continue; }
      }

      /* Un champ vide efface, il n'ecrit pas une chaine vide : c'est ce que
         fait `setPath` pour la saisie directe, et deux regimes d'effacement
         sur les memes champs finiraient par se contredire. */
      const pose = (cle, val) => {
        if (val === '' || val == null || val === 0) delete c[cle]; else c[cle] = val;
      };
      const avant = typeCompte(c.type).label;
      const typeChange = v.type && v.type !== c.type;

      /* Le contenant se change avant le reste : creer le nouveau peut echouer
         — on ferme la fenetre du nom — et rien ne doit avoir bouge alors. */
      if ('etab' in v && v.etab !== c.etabId) {
        let cible = v.etab;
        if (cible === '__nouveau') {
          const mot = contenantDuType(c.type);
          const nom = await askText(trad(mot.nouveau),
            trad('Son nom, tel qu’il s’affichera partout.'), trad(mot.exemple));
          if (!nom) { saisi = v; continue; }
          const slug = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'etab';
          let id = 'e_' + slug, n = 2;
          while (etabById(id)) id = 'e_' + slug + (n++);
          Store.state.etabs.push({ id, nom, notes: '', dettes: [] });
          cible = id;
        }
        c.etabId = cible;
      }

      pose('libelle', String(v.libelle || '').trim());
      /* Un bien porte un seul nom, et il vit a deux endroits.

         Le compte et sa ligne unique sont la meme chose : le parcours de
         creation les ecrit ensemble, `nomCompteV2()` et `nomLignePlacement()`
         se replient l'un sur l'autre pour l'afficher. Renommer par cette fenetre
         ne touchait que le compte, et la fiche montrait alors « Studio Lyon 7e »
         en titre au-dessus d'une ligne « studio lyon » : deux noms pour une
         chose, ce que ce projet refuse partout ailleurs.

         La garde tient en trois conditions : detenu en direct, une seule ligne,
         aucune espece. Des qu'un compte porte deux placements, chacun a son nom
         propre et rien ne doit l'ecraser. */
      if (estDetenuEnDirect(typeCompte(c.type))
          && (c.lignes || []).length === 1 && !(c.cash || []).length
          && String(v.libelle || '').trim()) {
        c.lignes[0].libelle = String(v.libelle).trim();
        /* Le contenant est le troisieme exemplaire du meme nom : un bien
           detenu en direct EST son contenant, et la carte de la liste des
           actifs affiche `etab.nom`. Meme regle que le champ « Nom du bien » :
           seulement quand l'etablissement n'a que ce compte — un parking
           rattache au meme contenant garde son nom propre. */
        const etab = etabById(c.etabId);
        if (etab && COMPTES().filter(x => x.etabId === etab.id).length === 1) {
          etab.nom = String(v.libelle).trim();
        }
      }
      if (v.type) c.type = v.type;
      if ('plafond' in v) pose('plafond', num(v.plafond) || 0);
      if ('ouvertLe' in v) pose('ouvertLe', v.ouvertLe);
      if ('clotureLe' in v) pose('clotureLe', v.clotureLe);
      if ('numero' in v) pose('numero', String(v.numero || '').trim());

      Store.save(); render();
      toast(typeChange
        ? `${nomCompteV2(c)} : ${trad(avant)} ${trad('devient')} ${trad(typeCompte(c.type).label)}`
        : `${nomCompteV2(c)} ${trad('enregistré')}`);
      return;
    }
  },
  /* Le clic haptique et le tassement d'appui, comme sur les sous-onglets : la
     barre a leur forme, elle doit avoir leur réponse. Sans cela, deux barres
     identiques réagiraient différemment sous le doigt. */
  'compte-vue'(btn) {
    retourHaptique();
    tapeSousOnglets = true;
    compteVue = btn.dataset.vue;
    render();
  },
  /* Le pli s'anime SUR PLACE : render() remplacerait l'element, et une
     transition a besoin qu'il survive au geste — c'est la meme lecon que le
     lavis des sous-onglets. L'etat s'ecrit pareil qu'avant ; seul le chemin
     visuel change, et le prochain render() relira l'etat sans desaccord.
     Rien d'autre ne depend du pli : les totaux du groupe restent affiches
     sur son en-tete, replie ou non. */
  'replier-groupe'(btn) {
    const cle = btn.dataset.cle;
    const ouvre = compteReplies.has(cle);          // etat d'avant : replie, donc on ouvre
    ouvre ? compteReplies.delete(cle) : compteReplies.add(cle);
    memoriserReplies();
    const groupe = btn.closest('.cpt-groupe');
    const pli = groupe?.querySelector('.cpt-pli');
    if (!pli) { render(); return; }
    pli.classList.toggle('ouvert', ouvre);
    groupe.classList.toggle('replie', !ouvre);
    btn.setAttribute('aria-expanded', String(ouvre));
    const chev = groupe.querySelector('.cpt-chev');
    if (chev) chev.textContent = ouvre ? '⌄' : '›';
  },
  /* Tout replier d'un geste : sept groupes à refermer un par un pour obtenir
     la vue de structure, personne ne le fait deux fois. Le bouton bascule —
     s'il reste un groupe ouvert il ferme tout, sinon il rouvre tout.
     Sur place aussi, pour la meme raison : les sept plis glissent ensemble. */
  'plier-tout'() {
    /* Les cles viennent du dernier rendu, pas d'un attribut : elles portent
       des identifiants de compte, et les recoller en une chaine pour les
       redecouper aurait fini par casser sur un separateur. */
    const cles = groupesRendus;
    const tousReplies = cles.length && cles.every(c => compteReplies.has(c));
    for (const c of cles) tousReplies ? compteReplies.delete(c) : compteReplies.add(c);
    memoriserReplies();
    let animeTout = true;
    for (const b of $$('.cpt-gplier[data-cle]')) {
      const groupe = b.closest('.cpt-groupe');
      const pli = groupe?.querySelector('.cpt-pli');
      if (!pli) { animeTout = false; break; }
      pli.classList.toggle('ouvert', tousReplies);
      groupe.classList.toggle('replie', !tousReplies);
      b.setAttribute('aria-expanded', String(tousReplies));
      const chev = groupe.querySelector('.cpt-chev');
      if (chev) chev.textContent = tousReplies ? '⌄' : '›';
    }
    if (!animeTout) render();
  },

  /* Les memes deux gestes, dans le panneau des liquidites.

     Ils ne passent pas par `render()` : le panneau porte des champs de saisie,
     et le reconstruire sous les doigts perdrait le focus et la frappe en cours.
     L'etat vit donc dans le DOM du panneau, qui ne survit pas a sa fermeture —
     c'est voulu, une fenetre s'ouvre repliee ou depliee de la meme facon a
     chaque fois, sans se souvenir d'un geste fait la fois d'avant. */
  /* La portee est la fenetre entiere et non son corps : le bouton collectif vit
     sur la ligne du sous-titre, les groupes dans le corps. Deux parents
     differents, un seul ancetre commun. */
  /* Le geste bascule la classe sur place — c'est ce qui permet l'animation, un
     re-rendu la tuerait — et il ecrit dans l'etat, pour que le rendu suivant la
     retrouve. Les deux, pas l'un ou l'autre : sans l'ecriture, « Enregistrer »
     redepliait tout ; sans la bascule sur place, le pli sauterait. */
  'liq-plier'(btn) {
    const section = btn.closest('.liq-groupe');
    const pli = section?.querySelector('.cpt-pli');
    if (!pli) return;
    const ouvert = !pli.classList.contains('ouvert');
    pli.classList.toggle('ouvert', ouvert);
    btn.setAttribute('aria-expanded', String(ouvert));
    const cle = btn.dataset.cle;
    if (cle) {
      if (ouvert) compteReplies.delete(cle); else compteReplies.add(cle);
      memoriserReplies();
    }
    majBoutonLiqTout(btn.closest('#modal'));
  },
  'liq-plier-tout'(btn) {
    const corps = btn.closest('#modal');
    const plis = $$('.liq-groupe .cpt-pli', corps);
    /* Le bouton bascule : s'il reste un groupe ouvert il ferme tout, sinon il
       rouvre tout. Meme regle que « Tout replier » de la page Actifs. */
    const ouvrir = !plis.some(p => p.classList.contains('ouvert'));
    for (const p of plis) {
      p.classList.toggle('ouvert', ouvrir);
      const s = p.closest('.liq-groupe')?.querySelector('.liq-sommaire');
      if (s) {
        s.setAttribute('aria-expanded', String(ouvrir));
        if (s.dataset.cle) {
          if (ouvrir) compteReplies.delete(s.dataset.cle); else compteReplies.add(s.dataset.cle);
        }
      }
    }
    memoriserReplies();
    majBoutonLiqTout(corps);
  },

  /* Création en trois étapes — une décision par écran. Les champs
     secondaires (numéro, notes) vivent dans la fiche ; seule la date
     d'ouverture d'un PEA ou d'un PER est demandée ici, parce qu'elle
     conditionne la disponibilité. */
  /* `data-etab` : depuis la fiche d'un établissement, le contenant est déjà
     connu. On saute l'étape 2 plutôt que de faire rechoisir son établissement
     à quelqu'un qui est justement sur la page de cet établissement. */
  async 'ajouter-compte'(btn) {
    const etabImpose = btn?.dataset?.etab && etabById(btn.dataset.etab) ? btn.dataset.etab : null;
    let etapes = etabImpose ? 2 : 3;
    /* Le type vient en premier : c'est lui qui dit comment nommer le
       contenant. Demander « banque ou courtier » avant de savoir qu'il
       s'agit d'une maison n'avait pas de sens. */
    const e1 = await askForm({
      titre: trad('Qu’ajoutes-tu ?'),
      sous: `${trad('Étape')} 1 ${trad('sur.etape', 'sur')} ${etapes}${etabImpose
        ? `, ${trad('chez')} ${etabById(etabImpose).nom}`
        : `, ${trad('cela détermine les placements possibles')}`}`,
      ok: 'Continuer',
      /* Les especes sont hors liste : il en existe deja un, pour tout le monde.
         En creer un second partagerait le meme argent en deux endroits. */
      champs: [{ cle: 'type', label: 'Type', type: 'liste',
        options: [...typesCompteChoix().map(t => [t.id, t.label]),
                  ['__nouveau', trad('+ Autre type…')]], valeur: 'courant' }],
    });
    if (!e1) return;
    if (e1.type === '__nouveau') {
      e1.type = await demanderTypePerso();
      if (!e1.type) return;
    }
    const t = typeCompte(e1.type);
    const mot = contenantDuType(t.id);

    // Étape 2 : le contenant, nommé selon ce qu'il contient
    /*       `sansEtab` porte deja cette propriete sur le type — les especes s'en
       servent — mais l'assistant ne la lisait pas : il n'avait jamais eu a le
       faire, les especes etant posees par le code et non par ce formulaire.
       L'etape saute, et le compte se cree sans contenant. */
    let etabId = etabImpose;
    let nomNouveauContenant = null;      // cree apres le dernier ecran, pas avant
    /* Le nom du contenant, qu'il existe deja ou qu'il vienne d'etre tape. Les
       ecrans en ont besoin avant que l'etablissement ne soit pose dans l'etat :
       une seule porte, pour que « le nom de la banque » veuille dire la meme
       chose des deux cotes de sa creation. */
    const nomContenant = () => etabById(etabId)?.nom || nomNouveauContenant || '';
    if (t.sansEtab) { etabId = null; etapes--; }
    /* Un bien detenu en direct cree toujours le sien.

       Le contenant ne disparait pas pour autant, contrairement au bien de
       valeur : c'est lui qui porte le credit, une dette vivant sur un
       etablissement. Il se cree simplement sans qu'on ait a le choisir, et
       `askText` en dessous demande son nom — un seul nom, pour le bien et pour
       son contenant.

       Rattacher un second bien au meme contenant reste possible, et c'est le
       bon chemin pour un parking sous l'appartement qu'il accompagne : le
       bouton « + Bien » de la fiche pose `etabImpose`, et cette branche ne
       s'execute pas. Le geste deliberat le fait, le parcours par defaut ne le
       propose plus. */
    else if (!etabId && estDetenuEnDirect(t)) etabId = '__nouveau';
    else if (!etabId) {
      /* Un contenant vide reste proposable, mais en dernier et jamais choisi
         d'avance.

         Il n'a plus de famille : `contenantDeLEtab` la derive des comptes
         rattaches, et sans compte elle retombe sur « banque ou courtier ». Un
         « Studio » dont le bien a ete supprime se proposait donc partout, et
         `proposables[0]` en faisait le choix par defaut : la fenetre qui demande
         chez quel assureur tenir un contrat s'ouvrait sur un studio. Le retirer
         d'office serait pire — on retaperait un nom qui existe, et deux
         etablissements homonymes vivraient cote a cote — mais rien n'oblige a
         le mettre en tete ni a le preselectionner. */
      const memeFamille = e => contenantDeLEtab(e.id).titre === mot.titre;
      const aDesComptes = e => COMPTES().some(c => c.etabId === e.id);
      const proposables = [
        ...ETABS().filter(e => aDesComptes(e) && memeFamille(e)),
        ...ETABS().filter(e => !aDesComptes(e)),
      ];
      /* Un contenant vide se dit vide.

         On continue de le proposer : on peut vouloir le repeupler, et le retirer
         d'office jetterait un nom qu'il a fallu taper. Mais il porte desormais la
         raison de sa presence. */
      const e2 = await askForm({
        titre: trad(mot.titre),
        sous: `${trad('Étape')} 2 ${trad('sur.etape', 'sur')} ${etapes}`,
        ok: 'Continuer',
        champs: [{ cle: 'etab', label: mot.question, type: 'liste', aide: mot.aide,
          options: [...proposables.map(e => [e.id,
            aDesComptes(e) ? e.nom : `${e.nom} (aucun compte)`]),
            ['__nouveau', `+ ${trad(mot.nouveau)}…`]],
          /* Le defaut ne tombe que sur un contenant de la bonne famille. Sans
             lui, mieux vaut ouvrir sur « + Nouveau » que sur un nom qui ne
             veut rien dire ici : on valide une fenetre a trois champs sans
             relire celui qui etait deja rempli. */
          valeur: proposables.find(e => aDesComptes(e) && memeFamille(e))?.id || '__nouveau' }],
      });
      if (!e2) return;
      etabId = e2.etab;
    }
    if (etabId === '__nouveau') {
      const nom = await askText(trad(mot.nouveau),
        trad('Son nom, tel qu’il s’affichera partout.'), trad(mot.exemple));
      if (!nom) return;
      /* Le contenant se nomme ici, il ne se cree qu'a la fin.

         Un parcours qu'on abandonne ne doit rien laisser. */
      nomNouveauContenant = nom;
      etabId = null;
    }

    /* Étape 3 : deux questions differentes selon la nature.
       Un bien ou une part de societe n'a pas d'« argent qui sert a quelque
       chose » : il a une valeur et un prix d'acquisition. Demander une
       affectation pour 150 000 EUR de studio le rangeait en liquidites. */
    const bien = estUnBien(t);
    const classeDuBien = t.classes.find(c => c !== 'liquidites') || 'nonCote';

    const e3 = await askForm({
      titre: bien ? (estDetenuEnDirect(t) ? 'Valeur estimée'
                  : `Valeur ${t.classes.includes('nonCote') ? 'de la participation' : 'du bien'}`)
                  : t.sansCash ? trad('Nommer le contrat')
                  : `${BASES.liquidites.nom} ${trad('sur ce compte')}`,
      /* Le compte des étapes suit le parcours réellement suivi : annoncer
         « 3 sur 3 » après un « 1 sur 2 » ferait douter d'en avoir sauté une. */
      sous: `${trad('Étape')} ${etapes} ${trad('sur.etape', 'sur')} ${etapes}${bien
        ? `, ${trad('la plus-value se calcule sur ces deux montants')}`
        : t.sansCash ? `, ${trad('sa valeur viendra des supports que tu y ajouteras')}` : ''}`,
      ok: 'Créer',
      champs: bien ? [
        /* Le nom, pour un bien sans contenant.

           Pour un appartement, l'etape 2 l'a deja nomme : le contenant EST le
           bien, et le redemander ferait deux champs pour une valeur. Un bien de
           valeur saute cette etape — « quand je mets bien de valeur il ne doit
           pas se cabler a une banque mais a rien » — donc plus rien ne le nomme,
           et la ligne retombait sur le libelle du type : deux montres et un
           tableau s'affichaient tous les trois « Bien de valeur ». Signale dans
           le meme echange : « il faut pouvoir mettre un nom sur le bien ». */
        ...(t.sansEtab ? [{ cle: 'nom', label: trad('Nom du bien'), type: 'texte', requis: true,
          max: NOM_LIGNE_MAX, exemple: 'ex. Rolex Submariner',
          aide: trad('une montre, une voiture, un tableau : ce nom s’affichera partout') }] : []),
        /* « Valeur estimée » et non « valeur actuelle » pour un bien de valeur.

           La demande vaut pour le bien de valeur, mais l'immobilier est logé à
           la même enseigne : une maison n'a pas de cours non plus. Seule la
           participation garde « valeur actuelle », son prix venant d'une
           derniere levee ou d'un pacte, pas d'une appreciation. */
        { cle: 'valeur',
          label: `${estDetenuEnDirect(t) ? 'Valeur estimée' : 'Valeur actuelle'} (€)`,
          type: 'nombre', exemple: '0',
          aide: estDetenuEnDirect(t) ? 'ce que tu en tirerais en le vendant aujourd’hui'
              : 'ce que cela vaut aujourd’hui' },
        { cle: 'revient', label: trad('Montant investi (€)'), type: 'nombre', exemple: '0',
          aide: trad('prix d’acquisition, frais compris') },
        { cle: 'ouvertLe', label: motDateCompte(t), type: 'date' },
        /* La date de l'estimation, distincte de celle de l'achat.

           C'est le seul champ de cette fenetre qui devient faux sans que
           personne y touche : une montre achetee 3 000 EUR en 2019 n'en vaut
           plus 3 000 aujourd'hui, et rien a l'ecran ne dit depuis quand le
           chiffre affiche n'a pas ete revu. Meme raison que `verifieLe` sur un
           credit, et meme regle : c'est le geste de quelqu'un qui a regarde,
           jamais une supposition. Pre-remplie au jour de la saisie, parce qu'on
           saisit ce qu'on vient d'estimer. */
        { cle: 'estimeLe', label: trad('Estimée le'), type: 'date', valeur: todayISO(),
          aide: trad('la cloche te rappellera de la revoir dans un an') },
        /* L'usage se demande a la creation, la ou on le sait : pose plus tard
           dans une fiche, il resterait vide chez presque tout le monde, et la
           fiche d'une residence principale continuerait de parler rendement.
           Reserve a l'immobilier — une montre ne s'habite pas. */
        ...(classeDuBien === 'immobilier' ? [{ cle: 'usageBien', label: trad('Usage'),
          type: 'liste', options: [['', trad('à préciser')], ...USAGES_BIEN],
          aide: trad('il décide de ce que la fiche te montre : un rendement, ou un coût') }] : []),
        /* Le credit se saisit ici, pas plus tard : un bien finance a credit
           sans sa dette affiche un patrimoine net faux des la creation.

           Sauf sans contenant : une dette se pose sur un etablissement, et un
           bien de valeur n'en a aucun. Offrir le champ demanderait d'en inventer
           un pour le porter, ce que ce parcours vient justement d'eviter. */
        ...(t.sansEtab ? [] : [
        { cle: 'credit', label: trad('Capital restant dû (€)'), type: 'nombre', exemple: '0',
          aide: trad('laisse 0 si c’est payé, sinon la dette se déduit du patrimoine net') },
        { cle: 'preteur', label: 'Prêteur', type: 'texte', exemple: 'ex. Crédit Agricole',
          suggestions: valeursConnues('preteur'),
          aide: trad('la banque qui prête, si ce n’est pas toi') },
        /* La mensualite et le taux, ici aussi.

           Deux champs de plus et la case, les memes que la fenetre du credit. Le
           taux n'est pas un ornement : c'est lui qui permet de dire quelle part de
           la mensualite rembourse vraiment, et de projeter le solde. */
        { cle: 'mensualite', label: trad('Mensualité (€)'), type: 'nombre', exemple: '0',
          aide: trad('facultatif, mais c’est elle qui entre dans ton budget') },
        { cle: 'taux', label: trad('Taux annuel (%)'), type: 'nombre', exemple: '0',
          aide: trad('facultatif, il sert à suivre le capital qui reste') },
        { cle: 'charge', label: trad('Ajouter une charge mensuelle fixe'), type: 'case', valeur: true,
          aide: trad('seulement si tu renseignes une mensualité : elle entrera dans ton ')
              + 'budget sous ce nom' },
        ]),
      ] : [
        /* Le nom du compte, demande a la creation.

           Pre-rempli plutot que vide, pour ne pas ajouter une corvee a un
           parcours en trois etapes : le type et la banque sont deja connus,
           leur assemblage fait un nom juste, qu'on corrige si on veut. Un champ
           efface reste possible et retombe sur l'ancien comportement.

           Seuls les comptes tenus par une banque le demandent. Pour un bien ou
           une part de societe, l'etape 2 a deja nomme la chose elle-meme, et
           redemander ici ferait deux champs pour une seule valeur. */
        { cle: 'libelle', label: trad(t.sansCash ? 'Nom du contrat' : 'Nom du compte'), type: 'texte',
          valeur: `${t.label} ${nomContenant()}`.trim(),
          aide: trad(t.sansCash ? 'c’est lui qui distingue deux contrats du même type'
                                : 'c’est lui qui distingue deux comptes du même type') },
        /* Un contrat ne porte pas de poche de cash : ces trois questions y
           inventaient une affectation pour de l'argent qui est deja sur un
           support, au pire le fonds euros. Sa valeur vient donc de ce qu'on y
           ajoutera, et la fenetre le dit plutot que de demander un montant qui
           n'aurait nulle part ou se ranger. */
        ...(t.sansCash ? [] : [
        { cle: 'montant', label: trad('Montant (€)'), type: 'nombre', exemple: '0' },
        { cle: 'usage', label: trad('À quoi sert cet argent ?'), type: 'liste',
          options: AFFECTATIONS, valeur: t.defaut,
          aide: trad('pré-rempli selon le type de compte, modifiable librement') },
        { cle: 'scinder', label: trad('Scinder : déclarer un second usage'), type: 'case',
          aide: trad('deux usages sur le même compte, sans le dupliquer') },
        ]),
        ...(t.dateSensible ? [{ cle: 'ouvertLe', label: trad('Date d’ouverture'), type: 'date',
          aide: trad('elle conditionne la disponibilité, cinq ans pour un PEA') }] : []),
      ],
    });
    if (!e3) return;

    /* Plus rien ne peut echouer : le contenant peut naitre. */
    if (nomNouveauContenant) {
      const slug = nomNouveauContenant.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'etab';
      let id = 'e_' + slug, n = 2;
      while (etabById(id)) id = 'e_' + slug + (n++);
      Store.state.etabs.push({ id, nom: nomNouveauContenant, notes: '', dettes: [] });
      etabId = id;
    }

    const cash = [], lignes = [];
    if (bien) {
      lignes.push({ id: 'l' + Date.now().toString(36), classe: classeDuBien,
        libelle: String(e3.nom || '').trim() || nomContenant() || t.label,
        valeur: num(e3.valeur), prixDeRevient: num(e3.revient),
        dateAcquisition: e3.ouvertLe || '', estimeLe: e3.estimeLe || todayISO(),
        ...(e3.usageBien ? { usage: e3.usageBien } : {}) });
      /* La dette se pose sur le contenant du bien, pas sur la banque qui
         prete : c'est la que la valeur nette se lit — le bien a son prix
         plein dans la repartition, le credit s'en deduit au niveau du
         patrimoine. Le preteur est note dans l'intitule. */
      if (num(e3.credit)) {
        const et = etabById(etabId);
        et.dettes = et.dettes || [];
        /* L'intitule ne recopie plus le preteur : il a son champ, et l'affichage
           compose les deux. Et la date de verification est posee des la creation,
           pour que la projection du solde ait un point de depart. */
        et.dettes.push({ id: 'd' + Date.now().toString(36),
          libelle: `Crédit ${nomContenant()}`.trim(),
          montant: num(e3.credit), preteur: e3.preteur || '', note: '',
          mensualite: num(e3.mensualite) || null, taux: num(e3.taux) || null,
          verifieLe: todayISO() });
        /* La charge fixe dans le meme geste : c'est le seul moment ou l'on a la
           mensualite en tete. `creerChargeDuCredit()` ne fait rien sans elle. */
        if (e3.charge) creerChargeDuCredit(et.dettes[et.dettes.length - 1]);
      }
    } else {
      cash.push({ montant: num(e3.montant), affectation: e3.usage });
      if (e3.scinder) {
        const e4 = await askForm({
          titre: trad('Seconde part'), sous: trad('Le même compte, un autre usage'),
          ok: 'Ajouter cette part',
          champs: [
            { cle: 'montant', label: trad('Montant (€)'), type: 'nombre', exemple: '0' },
            { cle: 'usage', label: trad('À quoi sert cet argent ?'), type: 'liste',
              options: AFFECTATIONS.filter(([v]) => v !== e3.usage),
              valeur: AFFECTATIONS.find(([v]) => v !== e3.usage)[0] },
          ],
        });
        if (e4) cash.push({ montant: num(e4.montant), affectation: e4.usage });
      }
    }

    let id = 'c_' + Date.now().toString(36), n = 2;
    while (compteById(id)) id = 'c_' + Date.now().toString(36) + (n++);
    Store.state.comptes.push({
      id, etabId, type: t.id, statut: 'ouvert',
      libelle: String(e3.libelle || e3.nom || '').trim(),
      ouvertLe: e3.ouvertLe || '', numero: '', notes: '',
      cash, lignes,
    });
    refreshAccounts(); Store.save(); render();
    toast([t.label, nomContenant() || String(e3.nom || '').trim()].filter(Boolean).join(' · ')
      + (t.titres ? trad(', les placements s’ajoutent dans Marchés')
                  : bien ? (num(e3.credit)
                      ? ` · ${trad('{v} moins {c} de crédit')
                          .replace('{v}', fmtEUR0(num(e3.valeur)))
                          .replace('{c}', fmtEUR0(num(e3.credit)))}`
                      : ` · ${fmtEUR0(num(e3.valeur))}`) : ''));
  },

  'fiche-compte'(btn) {
    /* Une ligne dont le tiroir d'actions est ouvert se referme au lieu
       d'ouvrir la fiche : le doigt qui vient de glisser tape souvent là. */
    const swipe = btn.closest?.('.cpt-swipe');
    if (swipe?.classList.contains('ouvert')) {
      swipe.classList.remove('ouvert');
      swipe.querySelector('.cpt-ligne').style.transform = '';
      return;
    }
    location.hash = '#/compte/' + encodeURIComponent(btn.dataset.id);
  },
  'fiche-etab'(btn) { location.hash = '#/etab/' + encodeURIComponent(btn.dataset.id); },

  /* Archiver demande la date de cloture.

     Un compte portait sa date d'ouverture et rien a l'autre bout : « on a une
     date ouverture mais pas cloture ». La question se pose au moment ou l'on
     archive, parce que c'est le seul moment ou on la connait — la redemander
     plus tard supposerait qu'on s'en souvienne, et une fenetre de confirmation
     qui ne demande rien est une occasion perdue.

     Elle reste facultative : un vieux compte dont on a oublie la date exacte
     doit pouvoir s'archiver quand meme. Mais elle est proposee au jour, comme
     la date d'achat d'une ligne de titres, parce que c'est le cas courant. */
  async 'archiver-compte'(btn) {
    const c = compteById(btn.dataset.id);
    if (!c) return;
    const v = await askForm({
      titre: `Archiver ${guill(nomCompteV2(c))} ?`,
      sous: trad('Il sort de tous les totaux et garde son historique. Restaurable à tout moment.'),
      ok: 'Archiver',
      champs: [
        { cle: 'clotureLe', label: trad('Date de clôture'), type: 'date', valeur: todayISO(),
          aide: trad('facultative. C’est elle qui situe le compte dans le temps : une ')
              + 'vente passée sur un PEA clôturé se relit autrement quand on sait '
              + 'quand il a fermé' },
      ],
    });
    if (!v) return;
    c.statut = 'archive';
    /* Un champ vide efface plutot que d'ecrire une chaine vide, comme partout
       ailleurs dans cette fenetre de compte. */
    if (v.clotureLe) c.clotureLe = v.clotureLe; else delete c.clotureLe;
    refreshAccounts(); Store.save(); render();
    toast(`${guill(nomCompteV2(c))} ${trad('archivé')}${v.clotureLe ? ` ${trad('au')} ${fmtDate(v.clotureLe)}` : ''}`);
  },
  /* Restaurer se confirme, et ne vit plus que dans la fiche.

     Le bouton etait sur chaque ligne de la liste des archives, a portee de
     pouce, sans question — alors qu'on n'archive pas un compte pour le rouvrir
     le lendemain. « En general on ne restaure pas un compte archive », et
     l'action, elle, remet un montant dans tous les totaux du patrimoine : c'est
     le genre de geste qu'on ne veut pas faire en visant autre chose.

     La question dit ce qui change, et nomme la perte : restaurer efface la date
     de cloture, parce qu'un compte rouvert n'est pas cloture. La garder ferait
     cohabiter « ouvert » et « ferme le 12 mars », deux etats qui se
     contredisent, et c'est la date qu'on croirait sur parole. */
  async 'restaurer-compte'(btn) {
    const c = compteById(btn.dataset.id);
    if (!c) return;
    const v = valeurCompte(c);
    if (!await askConfirm(`${trad('Restaurer')} ${guill(nomCompteV2(c))} ?\n`
      + `${trad('Il revient dans tous les totaux de ton patrimoine')}${
          Math.abs(v) > 0.005 ? `, ${trad('pour')} ${fmtEUR(v)}` : ''}.\n\n`
      + (c.clotureLe
        ? trad("Sa date de clôture, le {d}, sera retirée : un compte rouvert n'est pas clôturé.")
            .replace('{d}', fmtDate(c.clotureLe))
        : trad("Réversible : tu peux l'archiver de nouveau.")),
      { danger: false, ok: 'Restaurer' })) return;
    const avait = c.clotureLe;
    c.statut = 'ouvert';
    delete c.clotureLe;
    refreshAccounts(); Store.save(); render();
    toast(`${guill(nomCompteV2(c))} ${trad('restauré')}${avait ? trad(', sa date de clôture est retirée') : ''}`);
  },
  async 'annuler-fiche'(btn) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const retour = () => ACTIONS.goto({ dataset: { view: btn?.dataset?.view || 'accounts', anchor: '' } });
    if (!ficheModifiee()) { retourHaptique(); ficheAvant = null; retour(); return; }
    const ok = await askConfirm(
      trad('Annuler tes modifications ?') + '\n'
      + trad('Cette fiche revient telle qu’elle était en l’ouvrant. '
      + 'Ce que tu as saisi depuis sera perdu.'),
      { ok: 'Annuler les modifications', refus: 'Continuer à modifier' });
    if (!ok) return;
    retablirFiche();
    ficheAvant = null;
    refreshAccounts(); Store.save(); render();
    toast(trad('Modifications annulées'));
    retour();
  },

  'enregistrer-fiche'() {
    /* Le blur d'abord : sur iOS, un champ encore actif peut n'avoir pas emis son
       dernier `input`, et l'ecriture se ferait sans lui. */
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    retourHaptique();
    Store.save();
    toast(trad('Enregistré ✓'));
    /* L'instantane se reprend au lieu de disparaitre : « Annuler » ne peut pas
       defaire ce qui vient d'etre enregistre, sinon il promettrait un point de
       retour qui n'existe plus. Vide, il se repose au rendu suivant sur l'etat
       du moment — `memoriserFiche()` ne le reprend que dans ce cas.
       La position dans la page est gardee : la fiche est longue, et remonter en
       haut apres un enregistrement ferait perdre la ligne qu'on relisait. */
    ficheAvant = null;
    const y = window.scrollY;
    refreshAccounts(); render();
    window.scrollTo(0, y);
  },

  async 'supprimer-compte'(btn) {
    const c = compteById(btn.dataset.id);
    if (!c) return;
    /* Les especes ne se suppriment pas : elles seraient reposees au prochain
       chargement, vides, et l'historique du compte efface pour rien. Mettre a
       zero dit la meme chose et garde les mois passes. */
    if (typeCompte(c.type).interne) {
      await askConfirm(trad('Les espèces ne se suppriment pas') + '\n'
        + trad('Ce compte existe pour tout le monde, sans établissement. S’il n’y a '
        + 'plus de billets, mets son montant à 0 : il sort alors de tous les '
        + 'totaux, et les relevés passés restent lisibles.'),
        { ok: 'Compris', danger: false });
      return;
    }
    const titres = Store.state.positions.filter(p => p.account === c.id).length;
    if (titres) {
      await askConfirm(`${trad('Impossible de supprimer')} ${guill(nomCompteV2(c))}\n`
        + trad(titres > 1 ? '{n} placements de marché y sont rattachés.'
                          : '{n} placement de marché y est rattaché.').replace('{n}', titres)
        + ' ' + trad("Déplace-les d'abord vers un autre compte dans Marchés."),
        { ok: 'Compris', danger: false });
      return;
    }
    const v = valeurCompte(c);
    const mois = Store.state.monthly.filter(r => r.v && r.v[c.id] != null).length;
    /* Les crédits du contenant partent avec son dernier compte.
       Ils restaient : supprimer un appartement laissait son prêt en place,
       toujours soustrait du patrimoine net, et devenu invisible puisque la
       liste des comptes saute les établissements vides. Un patrimoine amputé
       de plusieurs dizaines de milliers d'euros par une ligne qu'aucun écran
       ne montrait plus. */
    const etab = etabById(c.etabId);
    const dernierDeSonEtab = etab
      && COMPTES().filter(x => x.etabId === etab.id && x.id !== c.id).length === 0;
    const credits = dernierDeSonEtab ? (etab.dettes || []) : [];
    const duCredit = credits.reduce((s, d) => s + num(d.montant), 0);
    if (!await askConfirm(`${trad('Clôturer et supprimer')} ${guill(nomCompteV2(c))} ?\n\n`
      + (v ? trad('Sa valeur de {v} sortira du patrimoine.').replace('{v}', fmtEUR(v)) + '\n' : '')
      + (duCredit ? trad('Le crédit qui le finance, {c} de capital restant dû, sera supprimé en '
                       + 'même temps : il ne peut pas rester seul.').replace('{c}', fmtEUR(duCredit)) + '\n' : '')
      + (mois ? trad(mois > 1 ? 'Ses montants restent lisibles dans {n} relevés passés.'
                              : 'Ses montants restent lisibles dans {n} relevé passé.')
                  .replace('{n}', mois) + '\n' : '')
      + (dernierDeSonEtab ? `${guill(etab.nom)} ${trad("disparaîtra avec lui : c'était son dernier compte.")}\n` : '')
      + `\n${trad('Réversible avec Ctrl+Z.')}`, { ok: 'Supprimer', danger: true })) return;
    if (credits.length) etab.dettes = [];
    /* Pierre tombale : les relevés passés portent des colonnes à son nom. */
    if (!Store.state.accounts.some(a => a.id === c.id)) {
      Store.state.accounts.push({ id: c.id, label: nomCompteV2(c), short: c.court || '',
        broker: nomEtabDe(c), type: c.type, group: typeCompte(c.type).groupe, legacy: true });
    }
    Store.state.comptes = Store.state.comptes.filter(x => x.id !== c.id);
    /* Le contenant part avec son dernier compte, comme ses credits juste avant.

       Il restait, vide, et plus aucun ecran ne le montrait : la liste des comptes
       saute les etablissements sans compte. Il ne reapparaissait que dans la
       liste de l'etape 2 d'un ajout, ou la regle propose les vides sous
       n'importe quel type — d'ou l'impression d'une memoire residuelle, un
       appartement qu'on avait supprime et qui revient proposer de s'y rattacher.

       Apres la pierre tombale, jamais avant : celle-ci recopie le nom de
       l'etablissement dans son champ `broker`, et les releves passes s'en servent
       pour nommer leur colonne. */
    if (dernierDeSonEtab) {
      Store.state.etabs = Store.state.etabs.filter(x => x.id !== etab.id);
    }
    refreshAccounts(); Store.save();
    if (currentView() === 'ficheCompte') location.hash = '#/accounts'; else render();
    toast(`${guill(nomCompteV2(c))} ${trad('supprimé')}`);
  },

  'scinder-cash'(btn) {
    const c = compteById(btn.dataset.id);
    if (!c) return;
    c.cash = c.cash || [];
    const dejaPris = new Set(c.cash.map(e => e.affectation));
    const libre = AFFECTATIONS.find(([v]) => !dejaPris.has(v));
    c.cash.push({ montant: 0, affectation: libre ? libre[0] : 'projet' });
    Store.save(); render();
  },
  async 'retirer-cash'(btn) {
    const c = compteById(btn.dataset.id);
    const i = +btn.dataset.i;
    if (!c || !c.cash?.[i]) return;
    const e = c.cash[i];
    if (num(e.montant) && !await askConfirm(
      trad('Retirer cette part de {v} ?').replace('{v}', fmtEUR(num(e.montant)))
      + '\n\n' + trad('Le montant sortira du patrimoine. Réversible avec Ctrl+Z.'),
      { ok: 'Retirer', danger: true })) return;
    c.cash.splice(i, 1);
    Store.save(); render();
  },

  /* Ajouter et modifier un placement saisi a la main.

     Il n'y avait aucun chemin : une ligne non cotee ne se creait qu'au moment ou
     l'on creait son compte, et ne se modifiait plus jamais. Un portefeuille de
     trente prets participatifs demandait donc trente comptes, et une valeur
     corrigee etait impossible. L'etat vide de la carte disait « Ajoutez-en un »
     et ne menait nulle part.

     Les trois champs du financement participatif sont la : le taux annonce,
     l'echeance, et l'etat. Le retard et le defaut sont la realite de ce metier, et
     l'etat se declare — une date depassee ne veut pas dire « en retard », un
     virement arrive souvent avec quelques jours de decalage. L'application signale,
     le detenteur tranche. */
  async 'ajouter-placement'(btn) {
    const c = compteById(btn.dataset.id);
    if (!c) return;
    const t = typeCompte(c.type);
    /* Une seule nature possible : la deduire est juste, et la demander serait
       poser une question qui n'a qu'une reponse. Une enveloppe en porte cinq,
       et la deduire revient a tirer au sort — `find()` rendait « actions », donc
       un fonds euros et une SCPI tombaient tous deux en actifs de marche sans
       que rien ne le dise. La question se pose alors, et ses options se derivent
       de la liste du type : celle qu'on y ajoutera demain y apparaitra sans
       qu'on y pense. */
    const possibles = (t.classes || []).filter(x => x !== 'liquidites');
    const parDefaut = possibles[0] || 'nonCote';
    const demandeSupport = possibles.length > 1;
    const v = await askForm({
      titre: `Placement dans ${nomCompteV2(c)}`,
      sous: demandeSupport
        ? trad('c’est toi qui en donnes la valeur')
        : `${CLASSES_ACTIFS[parDefaut] || parDefaut} · ${trad('c’est toi qui en donnes la valeur')}`,
      ok: 'Ajouter',
      champs: [
        ...(demandeSupport ? [{ cle: 'classe', label: trad('Support'), type: 'liste',
              valeur: parDefaut, options: possibles.map(x => [x, CLASSES_ACTIFS[x] || x]),
              aide: trad('ce que le contrat propose : un fonds actions, un fonds euros, une SCPI') }] : []),
        ...champsPlacement(parDefaut, null, t.prete, t),
      ],
    });
    if (!v) return;
    const classe = demandeSupport ? (v.classe || parDefaut) : parDefaut;
    c.lignes = c.lignes || [];
    c.lignes.push(litPlacement(v, { id: 'l' + Date.now().toString(36), classe }));
    refreshAccounts(); Store.save(); render();
    toast(`${guill(v.libelle)} ${trad('ajouté')} · ${fmtEUR0(num(v.valeur))}`);
  },

  async 'editer-placement'(btn) {
    const c = compteById(btn.dataset.id);
    const i = +btn.dataset.i;
    const l = c && (c.lignes || [])[i];
    if (!l) return;
    const v = await askForm({
      titre: l.libelle || 'Placement',
      sous: `${CLASSES_ACTIFS[l.classe] || l.classe} · ${nomCompteV2(c)}`,
      ok: 'Enregistrer',
      champs: [...champsPlacement(l.classe, l, typeCompte(c.type).prete, typeCompte(c.type)),
        { cle: 'supprimer', label: trad('Retirer ce placement'), type: 'case',
          aide: trad('La ligne disparaît en validant, et son montant quitte ton patrimoine. ')
              + 'Réversible avec Ctrl+Z' }],
    });
    if (!v) return;
    if (v.supprimer) {
      c.lignes.splice(i, 1);
      refreshAccounts(); Store.save(); render();
      toast(`${guill(l.libelle)} ${trad('retiré')}`);
      return;
    }
    Object.assign(l, litPlacement(v, l));
    refreshAccounts(); Store.save(); render();
    toast(`${guill(l.libelle)} · ${fmtEUR0(num(v.valeur))}`);
  },

  /* Un loyer cree depuis la fiche du bien : rattache d'office.

     Le rattachement n'est pas un champ de ce formulaire, il est la raison d'etre
     du bouton. Le proposer ici avec un menu ou l'on pourrait choisir « aucun »
     redonnerait le geste qu'on vient d'eviter. */
  async 'ajouter-loyer'(btn) {
    const c = compteById(btn.dataset.id);
    if (!c) return;
    const v = await askForm({
      titre: `Loyer de ${nomCompteV2(c)}`,
      sous: trad('Le montant net perçu chaque mois, charges déduites si tu les paies'),
      ok: 'Ajouter',
      champs: [
        { cle: 'label', label: 'Source', type: 'texte', requis: true, max: NOM_LIGNE_MAX,
          valeur: `Loyer ${nomCompteV2(c)}`, exemple: 'ex. Loyer studio Lyon' },
        { cle: 'amount', label: trad('Montant mensuel (€)'), type: 'nombre', exemple: '0' },
      ],
    });
    if (!v) return;
    Store.state.budget.income.push({ label: v.label, amount: num(v.amount), bienId: c.id });
    Store.save(); render();
    toast(`${guill(v.label)} · ${fmtEUR0(num(v.amount))} ${trad('/ mois')}`);
  },

  /* Une charge du bien, meme raisonnement. La periode reste offerte : une taxe
     fonciere se paie une fois l'an, une copropriete par trimestre, et saisir
     « 1 200 par an » plutot que « 100 par mois » est ce qu'on lit sur l'avis. */
  async 'ajouter-charge-bien'(btn) {
    const c = compteById(btn.dataset.id);
    if (!c) return;
    /* Les postes d'un bien sont proposes, pas imposes : taxe fonciere,
       copropriete, travaux, plus l'assurance qui va avec son usage. Un champ
       vide obligeait a se souvenir de ce qu'un logement coute, et la provision
       pour travaux est justement celle qu'on oublie. Ceux deja nommes sur un
       autre bien suivent, sans doublon. */
    const proposes = chargesProposees(c);
    const v = await askForm({
      titre: `Charge de ${nomCompteV2(c)}`,
      sous: trad('Le montant se saisit tel qu’il est facturé, le budget ramène au mois'),
      ok: 'Ajouter',
      champs: [
        { cle: 'label', label: 'Poste', type: 'texte', requis: true, max: NOM_LIGNE_MAX,
          exemple: `ex. ${proposes[0][0]}`,
          suggestions: [...proposes.map(([l]) => l), ...valeursConnues('posteBien')]
            .filter((l, i, t) => t.findIndex(x => x.toLowerCase() === l.toLowerCase()) === i) },
        { cle: 'amount', label: 'Montant', type: 'nombre', exemple: '0' },
        /* La periode du premier poste propose : la taxe fonciere ouvre la liste,
           et c'est elle qu'on saisit en premier sur un bien qui vient d'entrer. */
        { cle: 'period', label: 'Facturé', type: 'liste', options: CHARGE_PERIODES,
          valeur: proposes[0][1] },
        { cle: 'provider', label: 'Organisme', type: 'texte', exemple: 'ex. Trésor public',
          suggestions: valeursConnues('organisme') },
      ],
    });
    if (!v) return;
    Store.state.budget.fixedCharges.push({
      label: v.label, amount: num(v.amount), period: v.period,
      provider: v.provider || '', shares: {}, creditId: null, bienId: c.id,
    });
    Store.save(); render();
    toast(`${guill(v.label)} · ${fmtEUR(chargeMensuelle({ amount: num(v.amount), period: v.period }))} ${trad('/ mois')}`);
  },

  async 'ajouter-credit'(btn) {
    const e = etabById(btn.dataset.id);
    if (!e) return;
    const v = await askForm({
      titre: `Crédit chez ${e.nom}`,
      sous: trad('Il pèse en négatif sur le patrimoine net'),
      ok: 'Ajouter',
      champs: [
        { cle: 'libelle', label: 'Intitulé', type: 'texte', requis: true, max: NOM_LIGNE_MAX, exemple: 'ex. Prêt immobilier' },
        { cle: 'montant', label: trad('Capital restant dû (€)'), type: 'nombre', exemple: '0' },
        /* Le capital emprunté ne se déduit pas du restant dû, et c'est lui qui
           permet de dire ce qui est déjà remboursé. Facultatif : un vieux prêt
           dont on a oublié le montant initial reste utilisable. */
        { cle: 'initial', label: trad('Capital emprunté au départ (€)'), type: 'nombre', exemple: '0',
          aide: trad('facultatif, sert à mesurer ce qui est déjà remboursé') },
        { cle: 'mensualite', label: trad('Mensualité (€)'), type: 'nombre', exemple: '0', aide: trad('facultatif') },
        { cle: 'taux', label: trad('Taux annuel (%)'), type: 'nombre', exemple: '0',
          aide: trad('facultatif, noté pour mémoire') },
        { cle: 'preteur', label: 'Prêteur', type: 'texte', exemple: 'ex. Crédit Agricole',
          suggestions: valeursConnues('preteur') },
        { cle: 'charge', label: trad('Ajouter une charge mensuelle fixe'), type: 'case', valeur: true,
          aide: trad('seulement si tu renseignes une mensualité : elle entrera dans ton ')
              + 'budget sous ce nom, et suivra le capital restant dû' },
      ],
    });
    if (!v) return;
    e.dettes = e.dettes || [];
    /* Le preteur ne se recopie plus dans l'intitule. Il y etait colle — « Prêt
       immobilier · Crédit Agricole » — tout en etant garde dans son propre
       champ : la meme information a deux endroits, dont un que l'edition ne
       pouvait plus corriger. C'est l'affichage qui les compose. */
    e.dettes.push({ id: 'd' + Date.now(),
      libelle: v.libelle, montant: num(v.montant), initial: num(v.initial) || null,
      mensualite: num(v.mensualite) || null, taux: num(v.taux) || null,
      preteur: v.preteur || '', note: '', verifieLe: todayISO() });
    Store.save(); render();
    /* La charge fixe dans le meme geste, si la case est restee cochee et qu'une
       mensualite a ete saisie. */
    const posee = v.charge && creerChargeDuCredit(e.dettes[e.dettes.length - 1]);
    if (posee) { Store.save(); render(); }
    toast(posee
      ? `${trad('Crédit')} ${guill(v.libelle)} ${trad('ajouté, et sa charge de')} `
        + `${fmtEUR0(num(v.mensualite))} ${trad('/ mois')}`
      : `${trad('Crédit')} ${guill(v.libelle)} ${trad('ajouté')}`);
  },

  /* Modifier un credit, depuis n'importe ou il s'affiche.
     Corriger un capital restant du est le geste qu'on refait le plus sur un
     credit — une fois par an sur un tableau d'amortissement, ou apres un
     remboursement anticipe. Il demandait d'ouvrir la fiche de l'etablissement,
     de trouver la bonne carte, puis le bon champ. Une seule fenetre, appelee
     par la carte de l'accueil comme par la fiche du compte : un champ, plusieurs
     portes, jamais deux champs.

     Le sous-titre dit a quoi ce credit est attache — l'etablissement, ce qu'il
     tient, et les autres credits qui y vivent. C'est la question qu'on se pose
     en voyant « moins 96 000 EUR » sans plus d'explication. */
  async 'editer-credit'(btn) {
    const e = etabById(btn.dataset.etab);
    const i = +btn.dataset.i;
    const d = e && (e.dettes || [])[i];
    if (!d) return;
    const siens = COMPTES().filter(c => c.etabId === e.id && c.statut !== 'archive');
    const autres = (e.dettes || []).length - 1;
    /* Si une charge fixe rembourse ce credit, elle detient la mensualite : le
       champ ne s'affiche pas ici. L'offrir quand meme ferait deux endroits pour
       un montant, et celui-ci serait le perdant — la projection lit la charge. */
    const lien = chargeDuCredit(d.id);
    const v = await askForm({
      titre: d.libelle || 'Crédit',
      sous: [`chez ${e.nom}`,
        lien ? `remboursé par ${guill(lien.charge.label || 'charge fixe')}, ${
          fmtEUR0(chargeMensuelle(lien.charge))} par mois` : '',
        siens.length ? `${siens.map(c => nomCompteV2(c)).join(', ')} · ${fmtEUR0(
          siens.reduce((s, c) => s + valeurCompte(c), 0))}` : 'aucun compte rattaché',
        autres > 0 ? `${autres} autre${autres > 1 ? 's' : ''} crédit${autres > 1 ? 's' : ''} ici` : '',
      ].filter(Boolean).join(' · '),
      ok: 'Enregistrer',
      champs: [
        /* La projection en aide, jamais dans le champ. Ecrire d'office le montant
           calcule serait commode et faux : un remboursement anticipe, une
           renegociation ou un differe le rendent caduc, et l'application ne peut
           pas le savoir. Elle propose un chiffre a recopier si rien n'a change,
           et c'est le detenteur qui tranche. */
        { cle: 'montant', label: trad('Capital restant dû (€)'), type: 'nombre', valeur: num(d.montant),
          aide: (() => {
            const pr = projectionCredit(d);
            if (pr.projete == null || pr.ecart < 1) {
              return 'le premier champ : c’est celui qu’on vient corriger';
            }
            return `d’après ta mensualité, ${fmtEUR0(pr.projete)} après ${pr.moisDepuis} `
              + `mois : à recopier si tu n’as rien remboursé par avance`;
          })() },
        { cle: 'libelle', label: 'Intitulé', type: 'texte', requis: true, max: NOM_LIGNE_MAX, valeur: d.libelle || '' },
        { cle: 'initial', label: trad('Capital emprunté au départ (€)'), type: 'nombre',
          valeur: num(d.initial) || '', aide: trad('facultatif, sert à mesurer ce qui est déjà remboursé') },
        ...(lien ? [] : [{ cle: 'mensualite', label: trad('Mensualité (€)'), type: 'nombre',
          valeur: num(d.mensualite) || '',
          aide: trad('facultatif. Mieux : rattache-le à une charge fixe, le montant ')
              + 'ne sera alors saisi qu’une fois' }]),
        { cle: 'taux', label: trad('Taux annuel (%)'), type: 'nombre',
          valeur: num(d.taux) || '', aide: trad('facultatif, noté pour mémoire') },
        { cle: 'preteur', label: 'Prêteur', type: 'texte', valeur: d.preteur || '',
          exemple: 'ex. Crédit Agricole', suggestions: valeursConnues('preteur') },
        /* Pas de case quand une charge rembourse deja : il n'y a rien a creer, et
           la fenetre le dit deja dans son sous-titre. */
        ...(lien ? [] : [{ cle: 'charge', label: trad('Ajouter une charge mensuelle fixe'),
          type: 'case', valeur: true,
          aide: trad('seulement si une mensualité est renseignée : elle entrera dans ton ')
              + 'budget sous ce nom, et suivra le capital restant dû' }]),
        /* La suppression vit ici, avec la modification : le credit ne s'effaçait
           que depuis la fiche de l'etablissement qui le porte, un ecran qu'on
           n'ouvre pas quand on regarde son bien. Meme case que chez les charges
           fixes, meme phrase. */
        { cle: 'supprimer', label: trad('Supprimer ce crédit'), type: 'case',
          aide: `${trad('Le patrimoine net remontera de')} ${fmtEUR0(num(d.montant))}. ${
            trad('Réversible avec Ctrl+Z.')}` },
      ],
    });
    if (!v) return;
    if (v.supprimer) {
      const nom = d.libelle || trad('Crédit');
      const rendu = num(d.montant);
      e.dettes.splice(i, 1);
      Store.save(); render();
      toast(`${guill(nom)} ${trad('supprimé')} · ${trad('patrimoine net')} +${fmtEUR0(rendu)}`);
      return;
    }
    const avant = num(d.montant);
    d.libelle = v.libelle || d.libelle;
    d.montant = num(v.montant);
    /* La date de verification, posee ici et nulle part ailleurs : c'est le seul
       moment ou quelqu'un a regarde ce montant. Elle fait tourner la projection
       et le rappel — sans elle, l'application ne saurait pas depuis quand ce
       chiffre a vieilli. */
    d.verifieLe = todayISO();
    d.initial = num(v.initial) || null;
    if (v.mensualite !== undefined) d.mensualite = num(v.mensualite) || null;
    d.taux = num(v.taux) || null;
    d.preteur = v.preteur || '';
    Store.save(); render();
    /* Le sens compte : une dette qui baisse fait monter le patrimoine net
       d'autant. Le toast le dit, parce que c'est la consequence qu'on cherche en
       corrigeant ce champ, et qu'elle se lit a l'envers du montant saisi. */
    const baisse = avant - d.montant;
    toast(Math.abs(baisse) > 0.005
      ? `${d.libelle} · ${fmtEUR0(d.montant)} ${trad('restant dû, patrimoine net')} ${
        baisse > 0 ? `+${fmtEUR0(baisse)}` : `−${fmtEUR0(-baisse)}`}`
      : `${d.libelle} ${trad('enregistré')}`);
    if (v.charge && creerChargeDuCredit(d)) {
      Store.save(); render();
      toast(`${guill(d.libelle)} ${trad('ajoutée aux charges fixes')} · ${fmtEUR0(fixedTotal())} ${trad('/ mois')}`);
    }
  },
  async 'retirer-credit'(btn) {
    const e = etabById(btn.dataset.id);
    const i = +btn.dataset.i;
    if (!e || !e.dettes?.[i]) return;
    const d = e.dettes[i];
    if (!await askConfirm(`${trad('Retirer le crédit')} ${guill(d.libelle)} ?\n\n${trad('Le patrimoine net remontera de')} ${fmtEUR(num(d.montant))}. ${trad('Réversible avec Ctrl+Z.')}`,
      { ok: 'Retirer', danger: false })) return;
    e.dettes.splice(i, 1);
    Store.save(); render();
  },

  'history-year'(btn) { historyYear = btn.dataset.year; render(); },
  'proj-use-budget'() {
    const m = suggestedMonthly();
    Store.state.meta.projMonthly = m;
    Store.save(); render();
    toast(`${trad('Versement mensuel réglé sur')} ${fmtEUR0(m)}`);
  },
  'evo-range'(btn) { evoRange = btn.dataset.range; render(); },
  /* Les deux controles — le grand chiffre et la courbe — commandent le meme
     reglage : `hero-base` est un alias historique de `evo-base`. */
  'evo-base'(btn) { evoNet = !!btn.dataset.net; render(); },
  'hero-base'(btn) { evoNet = !!btn.dataset.net; render(); },
  /* On change d'adresse, pas d'état : `hashchange` déclenche le rendu, et le
     bouton retour du navigateur ramène au sous-onglet précédent. */
  /* Taire un rappel pour le mois en cours. Le report porte une cle de mois :
     il expire de lui-meme au suivant, on n'a pas a penser a le lever. Il
     eteint la pastille partout a la fois, menu et barre du bas comprises,
     ainsi que le controle de coherence : un rappel qu'on a choisi de reporter
     n'a pas a ressortir ailleurs. */
  'taire-rappel'(btn) {
    const genre = btn.dataset.genre;
    const p = genre === 'depenses' ? depensesEnAttente() : currentMonthPending();
    masquerRappel(genre, p.key);
    Store.save();
    render();
    toast(`${trad('Rappel de')} ${p.label} ${trad('masqué jusqu’au mois prochain')}`);
  },

  /* « Plus tard » : sept jours, pas le mois entier. C'est la sortie de celui
     qui veut bien saisir, mais pas maintenant — la croix reste pour celui qui
     ne veut pas du tout. */
  'reporter-rappel'(btn) {
    const genre = btn.dataset.genre;
    const p = genre === 'depenses' ? depensesEnAttente() : currentMonthPending();
    const quand = reporterRappel(genre);
    Store.save();
    render();
    toast(`${trad('Rappel de')} ${p.label} ${trad('repoussé au')} ${fmtJourMois(quand)}`);
  },

  /* Le tassement d'appui, comme la barre du bas. Il est pose avant la
     navigation et survit au rendu, parce que la classe est reappliquee sur la
     barre neuve : sans cela il disparaitrait dans la milliseconde. */
  'sous-onglet'(btn) {
    retourHaptique();
    /* Plus de remise a zero ici : `render()` retient une position par vue, et
       sous-onglet compris. La poser a zero avant de router faisait retenir zero
       pour l'onglet qu'on quitte, donc lui faisait perdre sa place. */
    tapeSousOnglets = true;
    location.hash = '#/' + btn.dataset.route;
  },
  /* « proj-extra-clear » est parti avec la ligne libre du tableau « Par
     horizon » : les deux sélecteurs de la page écrivent désormais le même
     réglage, il n'y a plus de ligne surnuméraire à retirer. Une action sans
     bouton pour l'appeler est du code mort, et le balayage de vérification
     cherche justement les `data-action` qui ne mènent à rien. */
  'toggle-masque'() { setMasque(!masqueActif()); render(); },
  'pace-range'(btn) { paceRange = btn.dataset.range; render(); },
  'budget-year'(btn) {
    budgetYear = btn.dataset.year === 'all' ? 'all' : btn.dataset.year;
    render();
  },
  /* Le dépliant reste ouvert : on vient de changer l'année depuis l'intérieur. */
  'toggle-revenus'() { fenetreRevenus(); },
  /* La marque « estime » d'une source de revenu. Un bouton-case plutot qu'un
     data-path : la coche doit rafraichir la fenetre (le ≈ du sous-titre) et
     la page derriere, ce que l'ecriture au fil de la frappe ne fait pas. */
  'revenu-estime'(el) {
    const r = B().income[+el.dataset.i];
    if (!r) return;
    r.estime = !!el.checked;
    Store.save();
    fenetreRevenus();
    render();
  },
  'evo-year'(btn) { evoYear = btn.dataset.year; evoDetailOuvert = true; render(); },
  /* L'annee du journal des ventes. Elle ne survit pas au rechargement, comme
     celle du graphique d'evolution : c'est une question du moment, pas un
     reglage — on revient toujours a l'annee en cours. */
  /* Le journal n'a plus de borne propre : elle est celle de la page, et le menu
     des annees a rejoint les crans de la plage. `sales-year` est parti avec. */
  'open-sale'(btn) { openApercu('vente', btn.dataset.i); },
  'tri-ventes'(btn) { triVentes = btn.dataset.tri; render(); },

  /* Modifier une vente au journal, et la frontiere est celle des consequences.

     Ce qui ne touche a rien d'autre se corrige partout : la date, le nom, la
     note. Une date fausse deplace la vente d'une periode a l'autre et fait
     mentir les barres, et c'est le champ qu'on se trompe le plus souvent a
     saisir.

     Les montants d'une vraie vente, non. Elle a credite un compte et reduit une
     ligne au moment de la saisie : changer son prix apres coup ferait dire au
     journal 900 EUR quand 944 sont arrives sur le compte, sans que rien ne le
     signale. Le chemin exact existe deja, en deux gestes : annuler la vente, qui
     rend les titres et reprend les especes, puis la ressaisir. La fenetre le dit
     plutot que de laisser chercher.

     Une vente declaree, elle, n'a rien ecrit d'autre : ses montants sont donc
     entierement modifiables. C'est la meme asymetrie que son annulation, qui
     retire une ligne au lieu de defaire un mouvement. */
  async 'edit-sale'(btn) {
    const i = +btn.dataset.i;
    const v = Store.state.sales?.[i];
    if (!v) return;
    const dev = v.currency || 'EUR';
    const saisi = await askForm({
      titre: trad('Modifier la vente'),
      sous: v.declaree ? trad('déclarée, pour mémoire') : `${fmtDate(v.date)} · ${esc(v.name)}`,
      ok: trad('Enregistrer'),
      champs: [
        { cle: 'date', label: 'Date', type: 'date', valeur: v.date,
          aide: trad('elle décide de la période où la vente compte, donc de la barre où elle apparaît') },
        { cle: 'name', label: 'Nom', type: 'texte', valeur: v.name, max: NOM_LIGNE_MAX },
        ...(v.declaree ? [
          { cle: 'gross', label: trad('Produit encaissé (€)'), type: 'nombre', valeur: num(v.gross) },
          { cle: 'realised', label: trad('Plus ou moins-value réalisée (€)'), type: 'nombre',
            valeur: num(v.realised),
            aide: trad('le prix de revient s’en déduit : produit moins plus-value') },
        ] : [
          { cle: 'lecture_montants', label: trad('Montants'), lecture: true,
            valeur: `${num(v.qty)} × ${fmtCur(v.price, dev)} = ${fmtEUR(num(v.gross))}, ${
              fmtSigned(v.realised)}`,
            aide: trad('ils ont crédité un compte et réduit une ligne le jour de la vente. Pour les '
              + 'corriger : annuler cette vente, puis la ressaisir, ce qui remet le cash et les titres d’aplomb') },
        ]),
        { cle: 'note', label: 'Note', type: 'texte', valeur: v.note || '' },
      ],
    });
    if (!saisi) return;
    Store.addBackup('avant modification d’une vente');
    v.date = saisi.date || v.date;
    v.name = String(saisi.name || '').trim() || v.name;
    v.note = saisi.note || '';
    if (v.declaree) {
      /* Le prix de revient se derive, il ne se saisit pas : trois champs pour
         deux libertes laisseraient produit, revient et plus-value se contredire. */
      v.gross = round2(num(saisi.gross));
      v.realised = round2(num(saisi.realised));
      v.invested = round2(v.gross - v.realised);
    }
    Store.save(); render();
    toast(trad('Vente modifiée'));
  },
  /* Modifier un compte existant. Son identifiant ne bouge jamais : les
     montants déjà saisis, l'historique et les positions restent rattachés. */
  /* Fiche d'une ligne de titres, ouvrable depuis le tableau, la brique du
     jour et la performance par ligne. */
  async 'open-position'(btn) {
    const i = +btn.dataset.i;
    const suite = await askPosition(i);
    Store.save(); render();
    /* La suppression d'abord : elle deplace les index de la liste, et tout ce
       qui suit travaille sur des index. La confirmation a deja ete donnee dans
       la fiche, ou la ligne et son montant pouvaient encore etre nommes. */
    if (suite && suite.supprimer != null) {
      const p = Store.state.positions[suite.supprimer];
      if (!p) return;
      Store.addBackup('avant suppression de ligne');
      Store.state.positions.splice(suite.supprimer, 1);
      Store.save(); render();
      toast(`${guill(p.name || trad('Ligne'))} ${trad('supprimée')}`);
      return;
    }
    if (suite && suite.vendre != null) {
      const v = await askSale(suite.vendre);
      if (!v) return;
      Store.addBackup('avant vente');
      const a = sellPosition(v);
      if (!a) { toast(trad('Vente impossible')); return; }
      Store.save(); render();
      toast(`${a.realised >= 0 ? trad('Plus-value') : trad('Moins-value')} ${trad('de')} ${fmtSigned(a.realised)}`);
    }
    if (suite && suite.acheter != null) {
      const a = await askBuy(suite.acheter);
      if (!a) return;
      Store.addBackup('avant achat');
      const p = Store.state.positions[a.index];
      const anciennes = num(p.qty), cout = a.qty * a.price;
      /* PRU pondere : l'ancien lot au prix d'avant, le nouveau au prix paye. */
      p.buyPrice = round4((anciennes * num(p.buyPrice) + cout) / (anciennes + a.qty));
      p.qty = anciennes + a.qty;
      if (a.cashAccount) {
        const enEuros = cout * (num(p.fx) || 1);
        const cc = compteById(a.cashAccount);
        if (cc) {
          const e = cashInvestirEntree(cc, true);
          e.montant = round2(num(e.montant) - enEuros);
        }
      }
      Store.save(); render();
      toast(`${a.qty} × ${fmtCur(a.price, p.currency)} · ${trad('nouveau PRU')} ${fmtCur(p.buyPrice, p.currency)}`
        + (a.cashAccount ? ` · ${trad('débité de')} ${ACC[a.cashAccount]?.short || 'cash'}` : ''));
    }
  },
  /* Depuis la brique du haut de Budget : ouvre la saisie du mois courant.
     La ligne est creee au besoin — en tout debut de mois, le calendrier de
     l'annee peut ne pas encore la porter. */
  /* L'objectif de depenses mensuel, regle depuis le montant qui l'affiche.

     Le champ libre est garde tel quel, a l'euro : les paliers de cent ne
     laissaient pas viser juste avec un petit budget, et quelqu'un qui vit avec
     640 EUR par mois doit pouvoir ecrire 640. */
  async 'regler-objectif-depenses'() {
    const actuel = num(Store.state.budget.monthlyTarget);
    const r = await askForm({
      titre: trad('Objectif de dépenses'),
      sous: trad('Ce que tu ne veux pas dépasser sur un mois'),
      champs: [{ cle: 'montant', label: trad('Objectif de dépenses mensuel (€)'),
                 type: 'nombre', valeur: actuel || '', exemple: '1000',
                 aide: trad('À l’euro. Laisse vide pour ne pas te fixer d’objectif.') }],
      ok: 'Enregistrer',
    });
    if (!r) return;
    Store.state.budget.monthlyTarget = Math.max(0, num(r.montant));
    Store.save(); render();
    toast(Store.state.budget.monthlyTarget
      ? `${trad('Objectif de dépenses :')} ${fmtEUR0(Store.state.budget.monthlyTarget)} ${trad('par mois')}`
      : trad('Objectif de dépenses retiré'));
  },

  async 'saisir-mois-courant'() {
    const cle = todayISO().slice(0, 7) + '-01';
    let i = Store.state.budget.expenses.findIndex(r => r.month === cle);
    if (i < 0) {
      Store.state.budget.expenses.push({ month: cle, note: '', v: {} });
      Store.state.budget.expenses.sort((a, b) => String(a.month).localeCompare(String(b.month)));
      Store.save();
      i = Store.state.budget.expenses.findIndex(r => r.month === cle);
    }
    return ACTIONS['edit-expense-month']({ dataset: { i: String(i) } });
  },
  /* Depuis la relance : ouvre la saisie du mois clos, en creant sa ligne si
     le calendrier de l'annee ne la porte pas encore. */
  async 'saisir-mois-en-attente'() {
    const att = depensesEnAttente();
    let i = att.index;
    if (i < 0) {
      Store.state.budget.expenses.push({ month: att.key, note: '', v: {} });
      Store.state.budget.expenses.sort((a, b) => String(a.month).localeCompare(String(b.month)));
      Store.save();
      i = Store.state.budget.expenses.findIndex(r => r.month === att.key);
    }
    budgetYear = att.key.slice(0, 4);     // sinon la ligne visee resterait filtree
    return ACTIONS['edit-expense-month']({ dataset: { i: String(i) } });
  },
  async 'edit-expense-month'(btn) {
    const i = +btn.dataset.i;
    const saisi = await askExpenseMonth(i);
    if (!saisi) return;
    const r = Store.state.budget.expenses[i];
    ecrireDepensesMois(i, saisi);
    /* Une catégorie vient d'être créée : on revient à la saisie, grille
       complétée, montants conservés. */
    if (saisi.rouvrir) { render(); return ACTIONS['edit-expense-month'](btn); }
    if (saisi.versTableau) {
      budgetYear = String(r.month).slice(0, 4);   // sinon le mois quitté serait filtré
      pendingAnchor = 'detail-mensuel';
      if (currentView() === 'budget') render(); else location.hash = '#/budget';
      return;
    }
    render();
    toast(`${fmtMonth(r.month)} · ${fmtEUR0(expenseRowTotal(r))}`);
  },
  async 'add-contributor'() {
    const nom = await askText('Partager une charge',
      'La personne apparaîtra en colonne : tu indiqueras ce qu’elle prend en charge, ligne par ligne.',
      'ex. Camille');
    if (!nom) return;
    const liste = Store.state.budget.contributors;
    const base = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'perso';
    let id = base, n = 2;
    while (liste.some(p => p.id === id)) id = base + (n++);
    liste.push({ id, name: nom });
    Store.save(); render();
    toast(`${guill(nom)} ${trad('ajoutée aux charges partagées')}`);
  },
  async 'del-contributor'(btn) {
    const id = btn.dataset.id;
    const p = Store.state.budget.contributors.find(x => x.id === id);
    if (!p) return;
    const total = Store.state.budget.fixedCharges.reduce((s, c) => s + shareOf(c, id), 0);
    const lignes = Store.state.budget.fixedCharges.filter(c => shareOf(c, id)).length;
    if (!await askConfirm(`${trad('Retirer')} ${p.name} ${trad('des charges partagées ?')}\n`
      + (total ? trad(lignes > 1
                    ? '{v} de parts réparties sur {n} lignes seront effacées. Les montants des '
                      + 'charges ne changent pas, ni ton budget.'
                    : '{v} de parts réparties sur {n} ligne seront effacées. Les montants des '
                      + 'charges ne changent pas, ni ton budget.')
                    .replace('{v}', fmtEUR0(total)).replace('{n}', lignes) + '\n\n'
               : trad('Aucune part ne lui est attribuée.') + '\n\n')
      + trad('Réversible avec Ctrl+Z.'), { danger: total > 0, ok: 'Retirer' })) return;
    Store.state.budget.contributors = Store.state.budget.contributors.filter(x => x.id !== id);
    for (const c of Store.state.budget.fixedCharges) if (c.shares) delete c.shares[id];
    Store.save(); render();
    toast(`${p.name} ${trad('retirée')}`);
  },
  async 'add-category'() {
    const nom = await askText('Nouvelle catégorie de dépenses',
      'Elle devient une colonne du tableau, vide sur tous les mois.', 'ex. Abonnements');
    if (!nom) return;
    if (!addExpenseCategory(nom)) { toast(trad('Cette catégorie existe déjà')); return; }
    Store.save(); render();
    toast(`${trad('Colonne')} ${guill(nom.trim())} ${trad('ajoutée')}`);
  },
  /* Retirer ne demande pas confirmation : rien n'est perdu, et le geste inverse
     est a cote, sur la meme ligne. Une question a chaque fois pour une action
     reversible apprend surtout a repondre oui sans lire. */
  'retirer-category'(btn) {
    const cat = btn.dataset.cat;
    if (!retirerCategorie(cat)) return;
    Store.save(); render();
    const total = expenseCategoryTotal(cat);
    toast(total
      ? `${guill(cat)} ${trad('quitte la saisie. Ses {v} restent dans l’historique.')
          .replace('{v}', fmtEUR0(total))}`
      : `${guill(cat)} ${trad('quitte la saisie du mois.')}`);
  },
  'reprendre-category'(btn) {
    const cat = btn.dataset.cat;
    if (!reprendreCategorie(cat)) return;
    Store.save(); render();
    toast(`${guill(cat)} ${trad('revient dans la saisie du mois')}`);
  },
  async 'del-category'(btn) {
    const cat = btn.dataset.cat;
    const total = expenseCategoryTotal(cat);
    const mois = Store.state.budget.expenses.filter(r => num(r.v?.[cat])).length;
    if (!await askConfirm(`${trad('Supprimer la catégorie')} ${guill(cat)} ?\n`
      + (total
        ? trad("Elle contient {v} répartis sur {m} mois. Ces montants seront effacés et tes "
             + "totaux baisseront d'autant.")
            .replace('{v}', fmtEUR0(total)).replace('{m}', mois) + '\n\n'
        : trad('Elle est vide, rien ne sera perdu.') + '\n\n')
      + trad('Réversible avec Ctrl+Z.'), { danger: total > 0, ok: 'Supprimer la colonne' })) return;
    Store.addBackup('avant suppression de catégorie');
    removeExpenseCategory(cat);
    Store.save(); render();
    toast(`${trad('Colonne')} ${guill(cat)} ${trad('supprimée')}`);
  },
  'add-expense-month'() {
    const list = Store.state.budget.expenses;
    const derniere = Math.max(...list.map(r => +String(r.month).slice(0, 4)), new Date().getFullYear());
    const an = derniere + 1;
    for (let m = 1; m <= 12; m++) {
      list.push({ month: `${an}-${String(m).padStart(2, '0')}-01`, note: '', v: {} });
    }
    list.sort((a, b) => String(a.month).localeCompare(String(b.month)));
    budgetYear = String(an);
    Store.save(); render();
    toast(`${trad('Année')} ${an} ${trad('ouverte, 12 mois à remplir')}`);
  },
  async 'del-expense-month'(btn) {
    const i = +btn.dataset.i, r = Store.state.budget.expenses[i];
    if (!r) return;
    const calendrier = isCalendarMonth(r.month);
    if (!await askConfirm(calendrier
      ? trad('Effacer les dépenses de {m} ?').replace('{m}', fmtMonth(r.month)) + '\n\n'
        + trad("La ligne reste dans le tableau, vide, les douze mois de l'année restent affichés.")
        + '\n\n' + trad('Réversible avec Ctrl+Z.')
      : trad('Supprimer la ligne du {d} des dépenses ?').replace('{d}', fmtDate(r.month))
        + '\n\n' + trad('Réversible avec Ctrl+Z.'))) return;
    if (calendrier) clearMonthRow(r, 'note');
    else Store.state.budget.expenses.splice(i, 1);
    Store.save(); render();
    toast(calendrier ? `${fmtMonth(r.month)} ${trad('vidé')}` : trad('Mois supprimé'));
  },
  /* Une rentree exceptionnelle : quatre champs et une date.

     Le compte credite n'est pas demande, volontairement. L'argent est deja sur le
     compte quand on saisit — on note ce qui s'est passe, on ne deplace rien — et
     demander « ou est-il arrive » ferait croire que l'application va l'y mettre.
     Le solde se corrige la ou il se lit, dans Comptes ou dans le panneau des
     liquidites. */
  async 'ajouter-apport'(btn) {
    /* Le sens vient du bouton, et le montant se saisit toujours positif : demander
       « moins quinze mille » serait offrir une faute de frappe qui inverse un fait.
       Le signe est pose ici, une fois, a partir d'une declaration. */
    const sortie = btn?.dataset.sens === 'sortie';
    const v = await askForm({
      titre: sortie ? 'Dépense exceptionnelle' : 'Rentrée exceptionnelle',
      sous: sortie
        ? 'De l’argent parti une fois : une voiture, des travaux, un voyage'
        : 'De l’argent reçu une fois : héritage, prime, vente d’un bien',
      champs: [
        { cle: 'libelle', label: trad('De quoi s’agit-il ?'), type: 'texte', requis: true,
          exemple: sortie ? 'ex. Voiture' : 'ex. Succession' },
        { cle: 'montant', label: sortie ? 'Montant dépensé (€)' : 'Montant reçu (€)',
          type: 'nombre', exemple: '0' },
        { cle: 'date', label: 'Date', type: 'date', valeur: todayISO(),
          aide: sortie ? 'elle situe la dépense dans ton historique'
                       : 'elle situe la rentrée dans ton historique' },
        { cle: 'note', label: 'Note', type: 'texte', exemple: trad('facultatif') },
      ],
    });
    if (!v) return;
    const montant = sortie ? -Math.abs(num(v.montant)) : Math.abs(num(v.montant));
    APPORTS().push({ id: 'a' + Date.now().toString(36), libelle: v.libelle,
      montant, date: v.date || todayISO(), note: v.note || '' });
    Store.save(); render();
    toast(`${guill(v.libelle)} · ${fmtSigned(montant)}`);
  },

  async 'editer-apport'(btn) {
    const i = +btn.dataset.i;
    const a = APPORTS()[i];
    if (!a) return;
    /* Le sens se propose ici, et nulle part ailleurs : c'est le seul endroit ou
       l'on peut s'etre trompe de bouton. Le montant reste positif dans le champ,
       le signe vit dans la liste — un champ qui porterait le signe et une liste
       qui le declare seraient deux ecritures du meme fait. */
    const etaitSortie = num(a.montant) < 0;
    const v = await askForm({
      titre: a.libelle || (etaitSortie ? 'Dépense exceptionnelle' : 'Rentrée exceptionnelle'),
      sous: trad('Ces montants ne bougent aucun solde : ils disent d’où vient l’argent, ou où il est parti'),
      ok: 'Enregistrer',
      champs: [
        { cle: 'libelle', label: trad('De quoi s’agit-il ?'), type: 'texte', requis: true,
          valeur: a.libelle || '' },
        { cle: 'sens', label: 'Nature', type: 'liste',
          options: [['entree', 'Rentrée, de l’argent reçu'], ['sortie', 'Dépense, de l’argent parti']],
          valeur: etaitSortie ? 'sortie' : 'entree' },
        { cle: 'montant', label: trad('Montant (€)'), type: 'nombre', valeur: Math.abs(num(a.montant)) },
        { cle: 'date', label: 'Date', type: 'date', valeur: a.date || '' },
        { cle: 'note', label: 'Note', type: 'texte', valeur: a.note || '' },
        { cle: 'supprimer', label: trad('Supprimer cette ligne'), type: 'case',
          aide: trad('La ligne disparaît en validant. Réversible avec Ctrl+Z') },
      ],
    });
    if (!v) return;
    if (v.supprimer) {
      APPORTS().splice(i, 1);
      Store.save(); render();
      toast(`${guill(a.libelle)} ${trad('retirée du journal')}`);
      return;
    }
    a.libelle = v.libelle;
    a.montant = v.sens === 'sortie' ? -Math.abs(num(v.montant)) : Math.abs(num(v.montant));
    a.date = v.date || a.date; a.note = v.note || '';
    Store.save(); render();
    toast(`${guill(a.libelle)} · ${fmtSigned(a.montant)}`);
  },

  /* On en saisit rarement une seule. Depuis que le tableau passe par la fenetre,
     poser dix charges demandait dix allers-retours par « + Ligne » : le bouton
     d'enchainement enregistre et rouvre une fenetre vide, curseur sur le poste.

     La boucle vit ici et non dans `askForm` parce que c'est ici qu'on sait quoi
     recalculer entre deux saisies : les credits deja rattaches changent des que
     la charge precedente en prend un, et `creditsRattachables()` les ecarte. Une
     boucle generique aurait resservi la liste d'avant. */
  async 'add-charge'() {
    for (;;) {
      const gens = contributors();
      const v = await askForm({
        titre: trad('Nouvelle charge fixe'),
        sous: trad('Le montant se saisit tel qu’il est facturé, le budget ramène au mois'),
        encore: 'Enregistrer et en ajouter une autre',
        champs: [
          { cle: 'label', label: 'Poste', type: 'texte', requis: true, exemple: 'ex. Assurance habitation' },
          { cle: 'amount', label: 'Montant', type: 'nombre', exemple: '0' },
          { cle: 'period', label: 'Facturé', type: 'liste', options: CHARGE_PERIODES, valeur: 'mois' },
          { cle: 'provider', label: 'Organisme', type: 'texte', exemple: 'ex. MAIF',
            suggestions: valeursConnues('organisme') },
          ...(creditsEnCours().lignes.length ? [{ cle: 'creditId', type: 'liste',
            label: trad('Rembourse un crédit ?'), options: creditsRattachables(), valeur: '',
            aide: trad('la mensualité servira alors à suivre le capital restant dû') }] : []),
          ...(comptesBiens().length ? [{ cle: 'bienId', type: 'liste',
            label: trad('Charge d’un bien immobilier ?'), options: optionsBiens(), valeur: '',
            aide: trad('taxe foncière, copropriété, assurance PNO : elle entrera dans le ')
                + 'cash-flow du bien' }] : []),
          ...gens.map(p => ({ cle: `part_${p.id}`, label: `Part de ${p.name}`, type: 'nombre',
                              aide: trad('sur la même période que le montant') })),
        ],
      });
      if (!v) return;
      const shares = {};
      for (const p of gens) if (v[`part_${p.id}`]) shares[p.id] = v[`part_${p.id}`];
      Store.state.budget.fixedCharges.push({
        label: v.label, amount: v.amount, period: v.period, provider: v.provider, shares,
        creditId: v.creditId || null, bienId: v.bienId || null,
      });
      Store.save(); render();
      toast(`${guill(v.label)} ${trad('ajoutée')} · ${fmtEUR(chargeMensuelle({ amount: v.amount, period: v.period }))} ${trad('/ mois')}`);
      if (!v.__encore) return;
    }
  },
  'del-charge': makeDeleter('fixedCharges', 'la charge fixe', c => c.label),

  /*    Editer une charge dans une fenetre : le seul chemin sur telephone, ou le
   tableau a huit colonnes ne se rend pas. Le tableau reste le chemin du
   bureau.*/
  async 'edit-charge'(btn) {
    const i = +btn.dataset.i;
    const c = Store.state.budget.fixedCharges[i];
    if (!c) return;
    const gens = contributors();
    const v = await askForm({
      titre: c.label || 'Charge fixe',
      /* Le sous-titre donne l'equivalent mensuel calcule, ce que la fenetre
         disait seulement en principe : « le budget ramene au mois » n'apprend
         pas combien pese une assurance de 480 EUR au semestre. C'est le chiffre
         qui entre dans le budget, il doit se lire ici. */
      sous: chargePeriode(c) === 'mois'
        ? 'Le montant se saisit tel qu’il est facturé'
        : `Facturée ${CHARGE_PERIODE_LABEL[chargePeriode(c)]}, soit ${
            fmtEUR(chargeMensuelle(c))} par mois dans le budget`,
      ok: 'Enregistrer',
      champs: [
        { cle: 'label', label: 'Poste', type: 'texte', requis: true, max: NOM_LIGNE_MAX, valeur: c.label },
        { cle: 'amount', label: 'Montant', type: 'nombre', valeur: num(c.amount) },
        { cle: 'period', label: 'Facturé', type: 'liste', options: CHARGE_PERIODES, valeur: chargePeriode(c) },
        { cle: 'provider', label: 'Organisme', type: 'texte', valeur: c.provider || '',
          suggestions: valeursConnues('organisme') },
        ...(creditsEnCours().lignes.length || c.creditId ? [{ cle: 'creditId', type: 'liste',
          label: trad('Rembourse un crédit ?'), options: creditsRattachables(c.creditId),
          valeur: c.creditId || '',
          aide: trad('la mensualité servira alors à suivre le capital restant dû') }] : []),
        ...(comptesBiens().length || c.bienId ? [{ cle: 'bienId', type: 'liste',
          label: trad('Charge d’un bien immobilier ?'), options: optionsBiens(),
          valeur: c.bienId || '',
          aide: trad('taxe foncière, copropriété, assurance PNO : elle entrera dans le ')
              + 'cash-flow du bien' }] : []),
        ...gens.map(p => ({ cle: `part_${p.id}`, label: `Part de ${p.name}`, type: 'nombre',
                            valeur: shareOf(c, p.id) || '',
                            aide: trad('sur la même période que le montant') })),
        { cle: 'supprimer', label: trad('Supprimer cette charge'), type: 'case',
          aide: trad('La ligne disparaît en validant. Réversible avec Ctrl+Z') },
      ],
    });
    if (!v) return;
    if (v.supprimer) {
      Store.state.budget.fixedCharges.splice(i, 1);
      Store.save(); render();
      /* Meme raison que dans `makeDeleter` : sans nom, on ne cite pas un vide. */
      toast(c.label ? `${guill(c.label)} ${trad('supprimée')}` : trad('Charge fixe supprimée'));
      return;
    }
    c.label = v.label; c.amount = v.amount; c.period = v.period; c.provider = v.provider;
    if (v.creditId !== undefined) c.creditId = v.creditId || null;
    if (v.bienId !== undefined) c.bienId = v.bienId || null;
    c.shares = c.shares || {};
    for (const p of gens) c.shares[p.id] = num(v[`part_${p.id}`]) || 0;
    Store.save(); render();
    toast(`${guill(c.label)} · ${fmtEUR(chargeMensuelle(c))} ${trad('/ mois')}`);
  },

  async 'add-income'() {
    const v = await askForm({
      titre: trad('Nouvelle source de revenu'),
      sous: trad('Montant net perçu chaque mois'),
      champs: [
        { cle: 'label', label: 'Source', type: 'texte', requis: true, exemple: 'ex. Salaire',
          suggestions: valeursConnues('source') },
        { cle: 'amount', label: trad('Montant mensuel (€)'), type: 'nombre', exemple: '0' },
      ],
    });
    /* La fenetre de saisie a pris la place de celle des revenus : on y
       revient dans tous les cas, validation comme annulation, sinon on laisse
       l'utilisateur devant la page nue apres un geste commence dans une
       fenetre. */
    if (!v) { rafraichirRevenus(); return; }
    Store.state.budget.income.push({ label: v.label, amount: v.amount });
    Store.save(); render(); rafraichirRevenus();
    toast(`${guill(v.label)} ${trad('ajoutée aux revenus')}`);
  },
  /* Une source de revenu, modifiable depuis ailleurs que la page Budget.

     Elle ne s'editait qu'en place, dans la liste des revenus : un loyer affiche
     sur la fiche de son bien n'avait donc aucune porte, et rien a l'ecran ne
     disait ou aller le corriger. La page Budget garde ses champs en place, c'est
     sa nature — on y saisit en serie. Cette fenetre est la seconde porte sur le
     meme champ, pas un second champ : les deux ecrivent `budget.income[i]`.

     Meme forme que sa jumelle des charges fixes, case de suppression comprise :
     deux fenetres qui font le meme geste sur deux listes voisines n'ont pas de
     raison de se ressembler a moitie. */
  async 'edit-income'(btn) {
    const i = +btn.dataset.i;
    const r = Store.state.budget.income[i];
    if (!r) return;
    const v = await askForm({
      titre: r.label || trad('Source de revenu'),
      sous: chargePeriode(r) === 'mois'
        ? trad('Le montant se saisit tel qu’il est perçu')
        : `${trad('Perçu')} ${trad(CHARGE_PERIODE_LABEL[chargePeriode(r)])}, ${trad('soit')} ${
            fmtEUR(revenuMensuel(r))} ${trad('par mois dans le budget')}`,
      ok: 'Enregistrer',
      champs: [
        { cle: 'label', label: 'Source', type: 'texte', requis: true, max: NOM_LIGNE_MAX,
          valeur: r.label || '', suggestions: valeursConnues('source') },
        { cle: 'amount', label: 'Montant', type: 'nombre', valeur: num(r.amount) },
        { cle: 'period', label: 'Perçu', type: 'liste', options: CHARGE_PERIODES,
          valeur: chargePeriode(r) },
        ...(comptesBiens().length || r.bienId ? [{ cle: 'bienId', type: 'liste',
          label: trad('Loyer d’un bien immobilier ?'), options: optionsBiens(),
          valeur: r.bienId || '',
          aide: trad('il entrera dans le cash-flow et le rendement de ce bien') }] : []),
        { cle: 'estime', label: trad(' montant estimé'), type: 'case', valeur: !!r.estime,
          aide: trad('un revenu variable déclaré en moyenne : les écrans qui s’en servent le diront') },
        { cle: 'supprimer', label: trad('Supprimer cette source'), type: 'case',
          aide: trad('La ligne disparaît en validant. Réversible avec Ctrl+Z') },
      ],
    });
    if (!v) return;
    if (v.supprimer) {
      Store.state.budget.income.splice(i, 1);
      Store.save(); render();
      toast(r.label ? `${guill(r.label)} ${trad('supprimée')}` : trad('Source supprimée'));
      return;
    }
    r.label = v.label; r.amount = num(v.amount); r.period = v.period;
    r.estime = !!v.estime;
    if (v.bienId !== undefined) r.bienId = v.bienId || null;
    Store.save(); render();
    toast(`${guill(r.label)} · ${fmtEUR(revenuMensuel(r))} ${trad('/ mois')}`);
  },

  /* Meme retour que pour l'ajout : la demande de confirmation ferme la
     fenetre des revenus, on la rouvre une fois la reponse donnee. */
  async 'del-income'(btn) {
    await makeDeleter('income', 'la source de revenu', r => r.label).call(this, btn);
    rafraichirRevenus();
  },

  /* « add-supplement » et « del-supplement » sont partis avec la carte
     « Autres depenses ». Une action sans bouton pour l'appeler est du code
     mort, et le balayage de verification cherche justement des `data-action`
     qui ne mènent à rien : autant ne pas lui laisser l'inverse a trouver. */

  /* Le tableau est un calendrier : on ouvre une année entière, pas un mois
     isolé qui laisserait une année à un seul janvier. */
  'add-month'() {
    const rows = Store.state.monthly;
    const derniere = Math.max(...rows.map(r => +String(r.date).slice(0, 4)), new Date().getFullYear());
    const an = derniere + 1;
    for (let m = 1; m <= 12; m++) {
      rows.push({ date: `${an}-${String(m).padStart(2, '0')}-01`, comment: '', v: {} });
    }
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    historyYear = String(an);
    Store.save(); render();
    toast(`${trad('Année')} ${an} ${trad('ouverte, 12 mois à remplir')}`);
  },
  async 'del-month'(btn) {
    if (await viderOuSupprimerMois(+btn.dataset.i)) render();
  },
  async 'resolve-row'(btn) {
    const p = Store.state.positions[+btn.dataset.i];
    if (!p) return;
    if (Quotes.isOnline() === null) await Quotes.health();
    if (Quotes.isOnline() === false) { toast(trad('Passerelle non détectée')); return; }
    if (!isinIsValid(p.isin)) { toast(`${trad('ISIN invalide pour')} ${guill(p.name)}`); return; }
    btn.disabled = true;
    try {
      const r = await Quotes.resolveIsin(p.isin.trim());
      if (r.best && r.best.symbol) {
        p.symbol = r.best.symbol;
        Store.save(); render();
        /* La fiche est ouverte par-dessus : son champ doit suivre, sinon il
           affiche encore l'ancien symbole et la prochaine frappe le remet. */
        const champ = document.querySelector(`#modalBody [data-path$=".symbol"]`);
        if (champ) champ.value = r.best.symbol;
        toast(`${p.name} → ${r.best.symbol} (${r.best.exchange})`);
      } else {
        toast(r.error || trad('Aucune cotation trouvée'));
        btn.disabled = false;
      }
    } catch (e) {
      toast(trad('Échec :') + ' ' + e.message);
      btn.disabled = false;
    }
  },
  async 'refresh-quotes'(btn) {
    if (Quotes.isOnline() === null) await Quotes.health();
    if (Quotes.isOnline() === false) {
      /* La demonstration se lance par `python serve.py`, jamais par le script
         Windows du depot prive : c'est un depot qu'on clone, pas une machine
         qu'on a deja installee. La clef lui appartient donc, et vit dans son
         propre i18n. */
      toast(trad('Passerelle non détectée : lance « python serve.py »'));
      return;
    }
    /* La pastille d'etat porte des enfants : on la met en « encours » par
       sa classe plutot qu'en ecrasant son contenu. Les autres boutons
       (fiche Donnees) gardent leur libelle texte. */
    const chip = btn && btn.classList.contains('etat-cours');
    const label = btn && !chip ? btn.textContent : null;
    if (btn) { btn.disabled = true; }
    if (chip) majEtatCours('encours');
    else if (btn) btn.textContent = '↻ Récupération…';
    try {
      const { changes, empty } = await Quotes.refresh();
      /* Les lignes dont le cours a REELLEMENT bouge, avant le rendu qui les
         affiche. `changes` porte deja le `from` et le `to` de chaque ligne : la
         donnee existait, elle etait jetee. Un rafraichissement qui ne change
         rien n'allume donc rien — c'est ce qui separe « ce chiffre est frais »
         de « j'ai appuye sur un bouton ». */
      coursFraichis = new Set(changes
        .filter(c => !c.error && Math.abs(num(c.to) - num(c.from)) > 1e-9)
        .map(c => c.symbol));
      render();
      if (empty) { toast(trad('Aucun symbole à suivre')); return; }
      const ok = changes.filter(c => !c.error).length;
      const ko = changes.length - ok;
      toast(`${ok} ${trad('cours mis à jour')}${ko ? ` · ${ko} ${trad('en échec')}` : ''}`);
    } catch (e) {
      if (btn) { btn.disabled = false; if (label !== null) btn.textContent = label; }
      majEtatCours();
      toast(trad('Échec :') + ' ' + e.message);
    }
  },
  async 'cloud-push'() {
    const r = await CloudSync.push({ force: false });
    render();
    toast(r.ok ? trad('Envoyé en ligne') : r.skipped ? trad('Déjà à jour') : r.conflict ? trad('Conflit détecté') : trad('Échec'));
  },
  async 'cloud-force'() {
    if (!await askConfirm(trad('Imposer les données de cet appareil ?') + '\n\n' + trad('La version en ligne, plus récente, sera remplacée.'))) return;
    const r = await CloudSync.push({ force: true });
    render(); toast(r.ok ? trad('Version imposée') : trad('Échec'));
  },
  async 'cloud-pull'() {
    try {
      const data = await CloudSync.pull();
      if (!data) { toast(trad('Rien en ligne')); return; }
      const at = data.meta?.savedAt;
      if (!await askConfirm(trad('Recharger les données depuis le cloud ?') + '\n\n'
        + `${trad('En ligne :')} ${at ? new Date(at).toLocaleString(locale()) : trad('inconnue')}\n`
        + `${trad('Ici :')} ${new Date(Store.state.meta.savedAt || Date.now()).toLocaleString(locale())}\n\n`
        + trad("L'état actuel sera sauvegardé avant remplacement."))) return;
      Store.addBackup('avant rechargement cloud');
      Store.state = data; Store.migrate(); Store.save();
      render(); toast(trad('Données rechargées'));
    } catch (e) { toast(trad('Échec :') + ' ' + e.message); }
  },
  'make-backup'() {
    Store.addBackup('manuelle') ? toast(trad('Sauvegarde créée')) : toast(trad('Sauvegarde impossible (stockage plein)'));
    render();
  },
  async 'restore-backup'(btn) {
    const i = +btn.dataset.i, b = Store.backups()[i];
    if (!b) return;
    if (!await askConfirm(trad('Restaurer la sauvegarde du {d} ?').replace('{d}', new Date(b.at).toLocaleString(locale()))
      + '\n\n' + trad("L'état actuel sera d'abord sauvegardé, tu pourras donc revenir en arrière."))) return;
    Store.restoreBackup(i);
    render(); toast(trad('Sauvegarde restaurée'));
  },
  'undo'() {
    if (!Store.undo()) { toast(trad('Rien à annuler')); return; }
    render(); toast(trad('Modification annulée'));
  },
  'export-json'() {
    download(`tallya-${stamp()}.json`, JSON.stringify(Store.state, null, 2));
    toast(trad('Sauvegarde exportée'));
  },
  'export-xlsx-positions'() {
    Xlsx.save(`positions-${stamp()}.xlsx`, [sheetPositions()]);
    toast(trad('Positions exportées en Excel'));
  },
  'export-xlsx-all'() {
    // La feuille Ventes n'a de sens que s'il y a des ventes.
    const feuilles = [
      sheetPositions(), sheetAllocation(), sheetRebalance(), sheetRoles(),
      /* La composition n'a de sens qu'avec des titres : sans position, les deux
         roles sont vides et la feuille ne porterait que son en-tete. */
      ...(rebalanceRoles().base ? [sheetRoleComposition()] : []),
      sheetAccounts(), sheetHistory(),
      ...((Store.state.sales || []).length ? [sheetSales()] : []),
      sheetExpenses(),
      // Pas de feuille vide : le journal n'existe que s'il porte quelque chose.
      ...(apportsTries().length ? [sheetApports()] : []),
      sheetFixedCharges(),
    ];
    Xlsx.save(`tallya-${stamp()}.xlsx`, feuilles);
    toast(`${trad('Classeur Excel exporté,')} ${feuilles.length} ${trad('feuilles')}`);
  },
  async 'reset'() {
    if (!await askConfirm(trad("Revenir aux données d'origine importées du Google Sheet ?") + '\n\n'
      + trad("Toutes tes modifications locales seront perdues. Exporte d'abord une sauvegarde si besoin."))) return;
    Store.reset(); render(); toast(trad('Données réinitialisées'));
  },
  async 'wipe'() {
    if (!await askConfirm(trad('Effacer TOUTES les données de ce tableau de bord dans ce navigateur ?') + '\n\n' + trad('Irréversible.'))) return;
    if (!await askConfirm(trad('Dernière confirmation : tout effacer ?'))) return;
    /* `cleStockage()` et non `STORAGE_KEY` : la demonstration ecrit sous une
       clef a elle, pour qu'un visiteur qui remet tout a zero ne touche pas les
       donnees d'un tableau de bord reel ouvert dans le meme navigateur. */
    try { localStorage.removeItem(cleStockage()); } catch (e) {}
    /* La graine passe par la migration, comme partout ailleurs ou elle sert.
       Elle est ecrite dans l'ancien modele, un compte par ligne de releve :
       c'est la migration qui en tire les etablissements, les comptes et leurs
       poches. Posee telle quelle, elle rendait un etat a moitie construit —
       `comptes` absent, et tout ce qui en descend a zero. L'ecran affichait
       donc 0 EUR sur huit cartes apres un effacement, et le premier
       enregistrement figeait cet etat vide pour les visites suivantes. */
    Store.state = structuredClone(SEED);
    Store.migrate();
    refreshAccounts();
    render(); toast(trad('Données effacées'));
  },
  /* Photo de la situation actuelle, écrite dans une ligne précise du relevé. */
  async 'snapshot-row'(btn) {
    const i = +btn.dataset.i;
    const row = Store.state.monthly[i];
    if (!row) return;
    /* « Les montants actuels » n'ont pas de sens sur un mois a venir, et ce
       bouton-la est le chemin le plus court vers l'erreur : douze lignes se
       suivent, celles de la fin de l'annee sont vides et appellent le doigt.
       On refuse en disant pourquoi, plutot que de proposer une confirmation :
       il n'existe pas de version juste de ce geste. La saisie a la main reste
       ouverte par la fenetre du mois, qui elle avertit et laisse passer. */
    if (!moisRevolu(row.date)) {
      toast(`${fmtMonth(row.date)} ${trad('n’a pas encore eu lieu')}`);
      return;
    }
    const t = nowTotals();
    /* Toujours confirmer : meme sur une ligne vide, le geste fige un mois
       d'historique — et un doigt qui visait la ligne d'a cote ne doit pas
       ecrire sans prevenir. */
    const vide = rowIsEmpty(row);
    if (!await askConfirm(vide
      ? trad('Enregistrer le relevé de {m} ?').replace('{m}', fmtMonth(row.date)) + '\n\n'
        + trad('La photo du jour, {v}, sera écrite dans cette ligne, compte par compte.')
            .replace('{v}', fmtEUR0(t.total))
      : trad('Remplacer les montants de {m} par la photo actuelle ?').replace('{m}', fmtMonth(row.date))
        + '\n\n' + `${trad('Actuellement :')} ${fmtEUR0(rowTotal(row))}\n`
        + `${trad('Photo du jour :')} ${fmtEUR0(t.total)}\n\n`
        + trad('Annulable juste après, et une sauvegarde est prise avant.'),
      vide ? { danger: false, ok: 'Enregistrer' } : {})) return;

    sauvegardeAvantEcrasement(row);
    const values = {};
    for (const a of ACCOUNTS) { const v = nowValue(a.id); if (v) values[a.id] = round2(v); }
    row.v = values;
    /* Le capital restant du : c'est ce qui fait monter la part nette d'un bien
       immobilier mois apres mois. */
    row.dettes = round2(patrimoine().dettes);
    Store.save(); render();
    toast(`${fmtMonth(row.date)} · ${fmtEUR0(t.total)} ${trad('enregistré')}`, porteDeSortie());
  },

  /* Saisir un mois entier dans une fenêtre : le seul chemin sur téléphone,
     ou le tableau et ses colonnes par compte ne se rendent pas.
     L'ecriture vit dans la fenetre elle-meme (appliquerReleve) depuis que
     « Enregistrer » y ecrit sans fermer : appliquer ici une seconde fois
     ferait deux ecritures pour un geste. */
  async 'edit-month'(btn) {
    await askMonthlySnapshot(+btn.dataset.i);
  },

  /* Crée la ligne du mois en cours si elle manque, puis y va. */
  'go-snapshot'() {
    const p = currentMonthPending();
    if (p.index < 0) {
      Store.state.monthly.push({ date: p.key, comment: '', v: {} });
      Store.state.monthly.sort((a, b) => a.date.localeCompare(b.date));
      Store.save();
    }
    historyYear = p.key.slice(0, 4);      // sinon la ligne visée serait filtrée
    pendingAnchor = 'mois-courant';
    /*    La decision se prend sur le hash, pas sur un nom de vue. Si l'adresse ne
   bougera pas, c'est a nous de rendre.*/
    if (location.hash === '#/history') render();
    else location.hash = '#/history';
  },
};

/* =============================================================
   RENDU
   ============================================================= */
const MOUNTS = {
  /* Le montage suit le sous-onglet affiché : brancher les graphiques du
     portefeuille sur une page qui montre la performance chercherait des
     conteneurs absents. */
  overview: () => sousOngletActif.overview === 'projection' ? mountObjective() : mountOverview(),
  positions: () => sousOngletActif.positions === 'performance' ? mountPerformance() : mountPositions(),
  allocation: () => sousOngletActif.allocation === 'cible' ? mountRebalance() : mountAllocation(),
  /* Les préférences n'ont rien à monter : leurs réglages passent tous par
     `data-path` et `data-action`, câblés une fois pour toute l'application. */
  data: () => { if (sousOngletActif.data !== 'preferences') mountData(); },
  /* Le montage suit le sous-onglet : brancher les graphiques des depenses sur
     l'onglet des releves chercherait des conteneurs absents. « Revenus et
     charges » n'a aucun graphique, donc rien a monter. */
  budget: () => {
    if (sousOngletActif.budget === 'releves') mountHistory();
    else if (sousOngletActif.budget === 'depenses') mountBudget();
  },
  /* `objective` n'est plus une vue mais un onglet de `overview`, dont le montage
     ci-dessus appelle `mountObjective()`. L'entree reste : `#/objective` est
     redirigee, jamais rendue directement, mais une entree qui coute une ligne
     protege contre un appel oublie. */
  objective: mountObjective,
  /* `accounts` manquait : le champ de recherche et le glissement lateral des
     lignes sont branches dans mountAccounts(), qui n'etait donc jamais
     appele. La recherche laissait passer tout le monde — « zzz » affichait
     les six etablissements — et les actions revelees au glissement etaient
     inaccessibles. Le filtrage lui-meme etait juste : seul le cablage
     manquait. */
  accounts: mountAccounts,
};

/* Les fiches sont des pages, pas des fenêtres : `#/compte/<id>` et
   `#/etab/<id>` sont des routes à part entière — le bouton retour du
   navigateur fonctionne, et un lien vers une fiche se partage. */
function routeParam() {
  const m = location.hash.match(/^#\/(compte|etab)\/(.+)$/);
  return m ? { genre: m[1], id: decodeURIComponent(m[2]) } : null;
}

/* Un bien qui ne contient qu'un compte n'a pas deux fiches.
   Le modèle empile un contenant et son contenu : pour une banque c'est juste
   — une banque héberge un livret et un CTO. Pour un studio, le contenant
   *est* l'actif. On obtenait donc deux pages pour un seul objet, avec deux
   totaux différents : 20 000 € net de crédit sur la fiche du bien, 50 000 €
   bruts sur celle du compte. Impossible de savoir laquelle est « la » page du
   studio, parce que les deux le sont.

   La fiche du compte porte déjà tout — valeur, prix d'acquisition,
   plus-value, financement, ce qu'on possède vraiment. Elle absorbe l'autre :
   les deux adresses y mènent, et il n'y a plus qu'un endroit à connaître. */
function ficheUnique(id) {
  const e = ETABS().find(x => x.id === id);
  if (!e || contenantDeLEtab(e.id).titre !== CONTENANTS.bien.titre) return null;
  const siens = COMPTES().filter(c => c.etabId === e.id && c.statut !== 'archive');
  return siens.length === 1 ? siens[0].id : null;
}

function currentView() {
  const r = routeParam();
  if (r && r.genre === 'etab') {
    const seul = ficheUnique(r.id);
    if (seul) { location.replace('#/compte/' + encodeURIComponent(seul)); return 'ficheCompte'; }
  }
  if (r) return r.genre === 'compte' ? 'ficheCompte' : 'ficheEtab';
  const v = (location.hash.replace('#/', '') || 'overview');
  /* Ancienne adresse : on ouvre la vue qui l'a absorbée, sur le bon
     sous-onglet. Le signet continue de mener où il menait. */
  const red = REDIRECTIONS[v];
  if (red) { sousOngletActif[red[1]] = red[2]; return red[0]; }
  /* L'adresse de base ramène au premier sous-onglet : sans ça, revenir sur
     « Allocation » depuis le menu rouvrait « Cible » parce que la variable
     avait gardé le dernier choix. L'URL fait foi, toujours. */
  if (SOUS_ONGLETS[v]) sousOngletActif[v] = SOUS_ONGLETS[v][0][0];
  return VIEWS[v] ? v : 'overview';
}

/* =============================================================
   CONFIRMATION
   Le await askConfirm() du navigateur est fragile : après quelques dialogues,
   Chrome propose « empêcher cette page d'en créer d'autres », et il
   renvoie alors « non » en silence — toutes les suppressions échouent
   sans le moindre message. On garde donc la main.
   ============================================================= */
/* Demander un texte court. Même esprit qu'askConfirm : pas de prompt() natif,
   que Chrome peut désactiver sans prévenir. Renvoie null si on annule. */
/* Les sources de revenu, dans une fenêtre. Elles vivaient au bas de la carte
   « Où va ce que tu gagnes », dans un dépliant qui redisait le montant déjà porté
   par la barre du haut et terminait la carte par un tableau. C'est la barre
   « Revenus » qui les ouvre maintenant, là où le regard se pose.

   Le balisage est celui d'avant, à l'identique : les champs portent leur
   `data-path`, la suppression et l'ajout leurs actions, et les écouteurs qui
   les servent sont posés sur le document. Rien à recâbler, et la saisie
   s'enregistre au fil de la frappe comme partout ailleurs. D'où l'absence de
   bouton « Valider » : il n'y a rien à valider. */
function fenetreRevenus() {
  const m = $('#modal');
  const b = Store.state.budget;
  /* Le total est mensuel meme quand une source est annuelle : chaque ligne
     passe par auMois(), comme les charges fixes. */
  const total = b.income.reduce((s, r) => s + revenuMensuel(r), 0);
  apercuOuvert = null;

  $('#modalTitle').textContent = trad('Revenus');
  /* Le « ≈ » dit qu'une partie du chiffre est declaree estimee : un revenu
     variable lisse en moyenne n'est pas un fait, et le sous-titre ne doit pas
     le vendre comme tel. */
  $('#modalSub').innerHTML = escMontant(
    `${revenuEstime() ? '≈ ' : ''}${fmtEUR0(total)} ${trad('par mois sur')} ${b.income.length} ${b.income.length > 1 ? trad('sources') : trad('source')}`
    + (revenuEstime() ? trad(', dont des montants estimés') : ''));
  /* La colonne « Bien » n'apparait que s'il y a un bien immobilier a proposer :
     sans logement locatif, elle serait une colonne vide de plus dans un tableau
     qui tient a peine sur un telephone. Un loyer rattache a son bien permet a la
     fiche de ce bien de dire son rendement et son cash-flow — c'est le seul
     moyen de relier ce qui entre a ce qui le produit. */
  const biens = comptesBiens();
  $('#modalBody').innerHTML = `
    <!-- Une liste de fiches, et non un tableau.

         Il en fut un, a cinq colonnes, et il ne tenait nulle part : « Part du
         loyer » se coupait en « Part du » sur PC, et pire sur telephone. Le
         passer en blocs a regle la largeur et cree le defaut suivant — sans
         ses en-tetes, « 2800 », « mensuel », « aucun » ne disaient plus rien :
         « on n'explique pas a quoi correspondent les champs ? ». Un tableau
         nomme ses colonnes une fois en haut ; des que les lignes se replient,
         chaque champ doit porter son nom. On emploie donc le motif des
         fenetres, la paire label + champ, comme partout ailleurs.
         (Aucun guillemet oblique dans ce commentaire : il vit dans un
         litteral de gabarit, ou un backtick refermerait la chaine. C'est la
         dixieme fois que ce piege se referme.) -->
    <div class="rev-liste">${b.income.map((r, i) => `
      <div class="rev-source">
        <div class="rev-tete">
          <div class="field rev-nom">
            <label>${trad('Source')}</label>
            <input data-path="budget.income.${i}.label" value="${esc(r.label)}"
                   placeholder="${trad('ex. Salaire, loyer perçu')}">
          </div>
          <button class="btn icon rev-suppr" data-action="del-income" data-i="${i}"
                  title="${trad('Supprimer cette source')}">✕</button>
        </div>
        <div class="rev-champs">
          <div class="field">
            <label>${trad('Montant')}</label>
            <input type="number" step="any" data-path="budget.income.${i}.amount" value="${r.amount}">
          </div>
          <div class="field">
            <label>${trad('Période')}</label>
            <select data-path="budget.income.${i}.period" class="annee">
              ${CHARGE_PERIODES.map(([cle, label]) => `<option value="${cle}"
                ${chargePeriode(r) === cle ? 'selected' : ''}>${trad(label)}</option>`).join('')}
            </select>
          </div>
          ${biens.length ? `<div class="field">
            <label>${trad('Bien rattaché')}</label>
            <select data-path="budget.income.${i}.bienId" class="annee">
              <option value="">${trad('aucun')}</option>
              ${biens.map(c => `<option value="${esc(c.id)}" ${c.id === r.bienId ? 'selected' : ''}
                >${esc(nomCompteV2(c))}</option>`).join('')}
            </select>
          </div>` : ''}
        </div>
        <div class="rev-pied">
          <label class="rev-estime" title="${trad('Un revenu variable déclaré en moyenne : les écrans qui s’en servent le diront')}">
            <input type="checkbox" data-action-change="revenu-estime" data-i="${i}"
                   ${r.estime ? 'checked' : ''}>${trad(' montant estimé')}</label>
          <span class="spacer"></span>
          <span class="muted">${chargePeriode(r) !== 'mois'
            ? `${trad('soit')} ${fmtEUR0(revenuMensuel(r))} ${trad('/ mois')} · ` : ''}${
            fmtPct(total ? revenuMensuel(r) / total * 100 : 0, 1)} ${trad('du total')}</span>
        </div>
      </div>`).join('')}</div>
    <div class="rev-total">
      <span>${trad('Total')}</span><b>${fmtEUR(total)} ${trad('/ mois')}</b>
    </div>
    <div class="row" style="margin-top:12px">
      <button class="btn sm ghost" data-action="add-income">${trad('+ Ajouter une source de revenu')}</button>
    </div>`;
  /* La paire de la famille « saisie en serie », comme la fenetre des depenses, le
     releve mensuel, la fiche d'une ligne et les apercus modifiables. Celle-ci
     etait la derniere a ne porter que « Fermer » : douze champs sous les yeux,
     tous ecrits a la frappe, et rien qui confirme que c'est bien parti.
     « Enregistrer » n'ajoute pas l'ecriture — elle a deja eu lieu — il ajoute le
     temoin, et il reste sur place pour qu'on relise le total. */
  $('#modalFoot').innerHTML =
    `<button class="btn" id="revOk" type="button">${trad('Enregistrer')}</button>
     <button class="btn ghost" id="revClose" type="button">${trad('Fermer')}</button>`;
  montrerModal(m);

  const fermer = () => {
    masquerModal(m);    $('#modalClose').onclick = null;
    revenusOuvert = false;
    render();
  };
  revenusOuvert = true;
  $('#revOk').onclick = () => {
    /* Le blur d'abord, comme ailleurs : sur iOS un champ encore actif peut
       n'avoir pas emis son dernier `input`. */
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    Store.save();
    toast(`${trad('Enregistré ✓')} · ${fmtEUR(incomeTotal())} ${trad('/ mois')}`);
  };
  $('#revClose').onclick = fermer;
  $('#modalClose').onclick = fermer;
}

/* Une seule ligne de texte, bornee comme toutes les autres. */
function askText(titre, message, exemple = '', valeur = '', max = NOM_LIGNE_MAX) {
  return new Promise(resolve => {
    const m = $('#modal');
    apercuOuvert = null;
    /* Les trois textes se traduisent ici, pas chez l'appelant : c'est le meme
       regime que les descripteurs d'`askForm`, et le français passe pour la
       clef. Sans cela, chaque appel devait y penser, et sept sur dix l'oubliaient. */
    $('#modalTitle').textContent = trad(titre);
    $('#modalSub').textContent = message ? trad(message) : '';
    $('#modalBody').innerHTML = `
      <div class="modal-champs">
        <div class="field">
          <input id="txtValeur" value="${esc(valeur)}" placeholder="${esc(trad(exemple))}"
                 maxlength="${max}" autocomplete="off" spellcheck="false">
        </div>
      </div>`;
    $('#modalFoot').innerHTML =
      `<button class="btn ghost" id="txtCancel" type="button">${trad('Annuler')}</button>
       <button class="btn" id="txtOk" type="button">${trad('Valider')}</button>`;
    montrerModal(m);
    const champ = $('#txtValeur');
    focusChamp(champ);

    const fermer = v => {
      masquerModal(m);      $('#modalClose').onclick = null;
      champ.onkeydown = null;
      resolve(v);
    };
    /* Valider a vide ne ferme pas : cette fenetre ne demande qu'une chose, et
       repartir sans elle n'a jamais de sens. Elle le dit et garde la main, comme
       un champ `requis` d'`askForm` — c'est « Annuler » qui sert a renoncer. */
    const valider = () => {
      const v = champ.value.trim();
      if (!v) { champ.focus(); toast(`${titre} : ${trad('à remplir')}`); return; }
      fermer(v);
    };
    champ.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); valider(); }
      if (e.key === 'Escape') { e.stopPropagation(); fermer(null); }
    };
    $('#txtCancel').onclick = () => fermer(null);
    $('#modalClose').onclick = () => fermer(null);
    $('#txtOk').onclick = valider;
  });
}

/* ------------------------------------------------------------
   Formulaire generique

   Ajouter une ligne creait jusqu'ici une rangee vide « Nouvelle charge » a
   remplir dans le tableau, case par case, en devinant ce qu'attendait
   chaque colonne. Une fenetre nomme les champs, propose des listes la ou
   les valeurs sont contraintes, et ne cree la ligne qu'une fois remplie —
   donc pas de rangee fantome si l'on renonce.

   Un champ : { cle, label, type, valeur, options, aide, exemple, requis }
   type : 'texte' | 'nombre' | 'liste' | 'case'. Renvoie un objet, ou null.

   `encore` : le libelle d'un troisieme bouton, qui enregistre et rouvre la
   fenetre vide. Il ne s'affiche que si l'appelant le demande — une fenetre de
   modification n'a rien a enchainer, on ne modifie pas deux fois la meme ligne.
   La reponse porte alors `__encore`, et c'est l'appelant qui boucle : lui seul
   sait ce qu'il faut recalculer entre deux saisies. Le double blanc au nom du
   drapeau evite la collision avec un champ, dont les cles remplissent le meme
   objet.
   ------------------------------------------------------------ */
/* Le type libre, demande par les deux formulaires de compte : celui de la
   fiche et l'assistant d'ajout. Une seule fenetre — deux copies auraient fini
   par poser deux questions differentes. Rend l'identifiant, existant ou cree,
   ou null si on renonce : rien n'a alors bouge, creerTypePerso n'ayant pas
   ete appelee. */
async function demanderTypePerso() {
  const r = await askForm({
    titre: trad('Nouveau type de compte'),
    sous: trad('Il rejoint la liste, pour ce compte et les suivants'),
    ok: 'Créer',
    champs: [
      /* `requis` : sans lui, valider a vide fermait la fenetre sans un mot. Le
         type ne se creait pas — `creerTypePerso` refuse un nom vide — mais rien
         ne le disait, et le geste ressemblait a une reussite. Un champ dont
         l'absence annule tout doit le dire avant de fermer. */
      { cle: 'nom', label: trad('Nom du nouveau type'), type: 'texte', requis: true,
        exemple: trad('ex. Plan d’épargne logement') },
      /* La question porte sur le comportement, pas sur une « poche » : ce mot
         designe partout ailleurs les classes de la repartition, et la liste
         n'offre que les trois familles de types. Chaque option decrit ce que
         la famille change, avec des exemples. Le defaut suit l'exemple du
         champ du nom : un plan d'epargne logement est de l'argent disponible,
         pas un compte de titres. */
      { cle: 'poche', label: trad('Il se comporte comme'), type: 'liste', valeur: 'cash',
        options: [['cash', trad('De l’argent disponible (livret, compte courant)')],
                  ['bourse', trad('Un compte de titres (PEA, CTO)')],
                  ['pe', trad('Une part ou un placement non coté')]],
        aide: trad('ce choix commande les regroupements d’écran et la disponibilité') },
    ],
  });
  if (!r || !String(r.nom || '').trim()) return null;
  const id = creerTypePerso(r.nom, r.poche);
  Store.save();
  return id;
}

function askForm({ titre, sous = '', champs, ok = 'Ajouter', lie = null, encore = '' }) {
  return new Promise(resolve => {
    const m = $('#modal');
    apercuOuvert = null;
    $('#modalTitle').textContent = trad(titre);
    /* Le meme regime que les apercus : un sous-titre peut porter un montant,
       donc l'oeil SVG en mode discret. escMontant echappe tout le reste. */
    $('#modalSub').innerHTML = escMontant(sous);

    const rendu = c => {
      const id = `f_${c.cle}`;
      /* Un fait qui se deduit s'affiche, il ne s'edite pas.
         Le type d'un etablissement en est un : il vient des comptes rattaches.
         Il manquait a cette fenetre, et son absence se lisait comme un oubli
         plutot que comme une consequence — « si je veux changer le type, pas
         possible ? ». Le montrer en lecture repond a la question sur place.
         Pas d'`<input disabled>` : un champ grise invite quand meme au clic, et
         il faudrait ensuite l'ecarter du depouillement. Du texte est du texte. */
      if (c.lecture) return `<div class="field">
        <label>${esc(trad(c.label))}${c.aide ? `<span class="sub">${esc(trad(c.aide))}</span>` : ''}</label>
        <p class="champ-lecture">${esc(String(c.valeur ?? ''))}</p>
      </div>`;
      if (c.type === 'case') return `
        <label class="field-case">
          <input type="checkbox" id="${id}" ${c.valeur ? 'checked' : ''}>
          <span>${esc(trad(c.label))}${c.aide ? `<span class="sub">${esc(trad(c.aide))}</span>` : ''}</span>
        </label>`;
      /* `suggestions` : ce qui a deja ete tape dans ce champ, propose sans etre
         impose. Un `datalist` et non une liste deroulante — le choix ferme
         conviendrait a un type de compte, pas a un organisme : il y en a une
         infinite, et le jour ou l'on change d'assureur il faut pouvoir taper le
         nouveau nom sans passer par « Autre… ».
         Le `<datalist>` ne s'affiche pas, il n'ajoute donc rien a la mise en
         page ; `autocomplete="off"` le laisse fonctionner, il ne parle qu'aux
         suggestions du navigateur. */
      /* `max` : la longueur maximale d'un champ de texte. Le navigateur refuse
         alors la frappe au-dela, ce qui vaut mieux qu'un message apres coup —
         on n'ecrit pas trente-cinq caracteres pour se les voir refuser. */
      const dl = (c.suggestions || []).length ? `dl_${c.cle}` : '';
      const saisie = c.type === 'liste'
        ? `<select id="${id}">${(c.options || []).map(([v, l]) =>
            `<option value="${esc(String(v))}" ${String(v) === String(c.valeur ?? '') ? 'selected' : ''}>${esc(trad(l))}</option>`).join('')}</select>`
        : `<input id="${id}" type="${c.type === 'nombre' ? 'number' : c.type === 'date' ? 'date' : 'text'}"
              ${c.type === 'nombre' ? 'step="any" inputmode="decimal"' : 'autocomplete="off"'}
              ${dl ? `list="${dl}"` : ''}
              ${c.max ? `maxlength="${+c.max}"` : ''}
              value="${esc(String(c.valeur ?? ''))}" placeholder="${esc(trad(c.exemple || ''))}">
           ${dl ? `<datalist id="${dl}">${c.suggestions.map(s =>
              `<option value="${esc(s)}"></option>`).join('')}</datalist>` : ''}`;
      return `<div class="field">
        <label for="${id}">${esc(trad(c.label))}${c.aide ? `<span class="sub">${esc(trad(c.aide))}</span>` : ''}</label>
        ${saisie}
      </div>`;
    };

    $('#modalBody').innerHTML = `<div class="modal-champs">${champs.map(rendu).join('')}</div>`;
    /* Le bouton d'enchainement prend sa propre ligne, en pied. Trois boutons
       cote a cote, dont un qui porte six mots, ne tiennent pas dans 375 px :
       `.modal-foot` les fait deja se replier, mais le repli tombait ou il
       tombait. Une ligne declaree vaut mieux qu'un repli subi. */
    $('#modalFoot').innerHTML =
      `<button class="btn ghost" id="frmCancel" type="button">${trad('Annuler')}</button>
       <button class="btn" id="frmOk" type="button">${esc(trad(ok))}</button>
       ${encore ? `<button class="btn ghost btn-encore" id="frmEncore" type="button">${esc(trad(encore))}</button>` : ''}`;
    montrerModal(m);

    /* Un champ peut dependre d'un autre : une action ne se loge pas sur un
       portefeuille de cryptomonnaies. On reconstruit la liste dependante a
       chaque changement, plutot que de laisser choisir un couple impossible
       et le refuser ensuite. */
    if (lie) {
      const source = $(`#f_${lie.de}`), cible = $(`#f_${lie.vers}`);
      const majCible = () => {
        const opts = lie.options(source.value);
        const garde = cible.value;
        cible.innerHTML = opts.length
          ? opts.map(([v, l]) => `<option value="${esc(String(v))}">${esc(l)}</option>`).join('')
          : `<option value="">${esc(lie.vide || 'aucun choix possible')}</option>`;
        if (opts.some(([v]) => String(v) === garde)) cible.value = garde;
        cible.disabled = !opts.length;
      };
      source.addEventListener('change', majCible);
      majCible();
    }

    const premier = $('#modalBody').querySelector('input, select');
    focusChamp(premier);

    const fermer = v => {
      masquerModal(m);      $('#modalClose').onclick = null;
      m.onkeydown = null;
      resolve(v);
    };
    /* Ce que portent les champs a cet instant. Une seule lecture, servie a deux
       usages : valider pour enregistrer, et comparer pour savoir si quelque
       chose a bouge. Deux boucles auraient fini par diverger sur un type de
       champ, et c'est la comparaison qui se serait trompee — en silence. */
    const valeurs = () => {
      const out = {};
      for (const c of champs) {
        const el = $(`#f_${c.cle}`);
        if (!el) continue;
        out[c.cle] = c.type === 'case' ? el.checked
          : c.type === 'nombre' ? num(el.value)
          : el.value.trim();
      }
      return out;
    };
    const lire = (suite = false) => {
      const out = valeurs();
      /* Une ligne qu'on efface n'a plus de champ obligatoire.

         Un champ obligatoire garantit qu'on ne cree pas une ligne muette. Il
         n'a rien a garantir sur une ligne qui ne sera plus la.

         La regle vit ici et non chez les appelants : les trois fenetres qui
         portent cette case lisent toutes `v.supprimer`, ce nom est donc deja le
         contrat entre elles et `askForm`. La quatrieme l'aurait oublie. */
      const efface = champs.some(c => c.type === 'case' && c.cle === 'supprimer') && out.supprimer;
      /* Un champ obligatoire vide ne ferme pas la fenetre en silence : on le
         designe, plutot que de creer une ligne sans nom. */
      const manquant = efface ? null : champs.find(c => c.requis && !String(out[c.cle]).trim());
      if (manquant) { $(`#f_${manquant.cle}`).focus(); toast(`${manquant.label} : ${trad('à remplir')}`); return; }
      if (suite) out.__encore = true;
      fermer(out);
    };

    /* L'etat de depart, releve apres le cablage des champs lies : `majCible()`
       reconstruit la liste dependante et peut changer sa valeur, le relever
       avant aurait rendu la fenetre sale des son ouverture. */
    const depart = JSON.stringify(valeurs());

    /*       La question vit ici, dans `askForm`, et non dans chaque appelant : il y a
       une dizaine de fenetres de ce type, et la onzieme aurait oublie de poser
       la question. Elle ne se pose que si quelque chose a change : retaper la
       meme valeur ne salit rien, et une question qui revient sans raison
       s'apprend a fermer sans lire. */
    const annulerOuDemander = async () => {
      if (JSON.stringify(valeurs()) === depart) { fermer(null); return; }
      const garder = await askConfirm(trad('Modifications non enregistrées') + '\n'
        + trad('Ce que tu viens de saisir n’est pas encore dans tes données.'),
        { ok: 'Enregistrer et fermer', refus: 'Fermer sans enregistrer', danger: false });
      if (garder) lire(); else fermer(null);
    };

    m.onkeydown = e => {
      if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); lire(); }
      if (e.key === 'Escape') { e.stopPropagation(); annulerOuDemander(); }
    };
    $('#frmCancel').onclick = annulerOuDemander;
    $('#modalClose').onclick = annulerOuDemander;
    /* La lambda n'est pas une precaution de style : `onclick = lire` passerait
       l'evenement de clic en premier argument, donc un objet toujours vrai a la
       place du drapeau d'enchainement. Chaque « Enregistrer » aurait rouvert la
       fenetre. */
    $('#frmOk').onclick = () => lire();
    if (encore) $('#frmEncore').onclick = () => lire(true);
  });
}

/* Choisir une valeur dans une liste. Renvoie null si on annule. */
function askChoice(titre, message, options, valeur) {
  return new Promise(resolve => {
    const m = $('#modal');
    apercuOuvert = null;
    $('#modalTitle').textContent = titre;
    $('#modalSub').textContent = message || '';
    $('#modalBody').innerHTML = `
      <div class="modal-champs">
        <div class="field">
          <select id="chxVal" size="1">
            ${options.map(([v, l]) =>
              `<option value="${esc(String(v))}" ${String(v) === String(valeur) ? 'selected' : ''}>${esc(trad(l))}</option>`).join('')}
          </select>
        </div>
      </div>`;
    $('#modalFoot').innerHTML =
      `<button class="btn ghost" id="chxCancel" type="button">${trad('Annuler')}</button>
       <button class="btn" id="chxOk" type="button">${trad('Valider')}</button>`;
    montrerModal(m);
    const champ = $('#chxVal');
    focusChamp(champ);

    const fermer = v => {
      masquerModal(m);      $('#modalClose').onclick = null;
      resolve(v);
    };
    $('#chxCancel').onclick = () => fermer(null);
    $('#modalClose').onclick = () => fermer(null);
    $('#chxOk').onclick = () => fermer(Number(champ.value));
    champ.ondblclick = () => fermer(Number(champ.value));
  });
}

/* `refus` : le libelle du bouton de refus. Il valait « Annuler » en dur, ce qui
   se lit mal des que la question n'est pas « faire ou ne pas faire » — devant
   « Enregistrer et fermer », « Annuler » veut dire « annuler la fermeture », alors
   que le refus ferme quand meme, sans enregistrer. Un choix a deux issues nommees.

   `refus` et non `non` : `non` est deja le bouton lui-meme, quelques lignes plus
   bas. Le parametre s'est fait masquer par lui, et le libelle affiche etait
   « [object HTMLButtonElement] ». Meme piege que `aideTexte`, note ailleurs dans
   ce fichier. */
function askConfirm(texte, { danger = true, ok = 'Confirmer', refus = 'Annuler' } = {}) {
  // Même signature d'appel que await askConfirm() : la première ligne devient le titre,
  // le reste le corps du message.
  /* `ponct()` retire l'espace avant un « ? » en anglais : la question se compose
     d'un morceau traduit et du signe, ecrit dans le gabarit, donc hors de la clef. */
  const [titre, ...suite] = ponct(String(texte)).split('\n');
  const message = suite.join('\n').trim();
  return new Promise(resolve => {
    const m = $('#confirm'), oui = $('#confirmYes'), non = $('#confirmNo');
    $('#confirmTitle').textContent = titre;
    /* escMontant : « Supprimer ce crédit ? 40 000 € restants » porte un
       montant, qui est un SVG en mode discret. */
    $('#confirmMsg').innerHTML = escMontant(message).replace(/\n/g, '<br>');
    $('#confirmMsg').hidden = !message;
    oui.textContent = trad(ok);
    oui.className = 'btn' + (danger ? ' danger' : '');
    non.textContent = trad(refus);
    montrerModal(m);
    oui.focus({ preventScroll: true });

    const fermer = v => {
      masquerModal(m);
      oui.onclick = non.onclick = m.onclick = null;
      document.removeEventListener('keydown', touche, true);
      resolve(v);
    };
    const touche = e => {
      if (e.key === 'Escape') { e.stopPropagation(); fermer(false); }
      if (e.key === 'Enter') { e.preventDefault(); fermer(true); }
    };
    oui.onclick = () => fermer(true);
    non.onclick = () => fermer(false);
    m.onclick = e => { if (e.target === m) fermer(false); };
    document.addEventListener('keydown', touche, true);
  });
}

/* Formulaire d'ajout de compte. Résout avec les champs saisis, ou null. */
/* Vendre une ligne. Le calcul s'affiche en direct pendant la saisie : on voit
   la plus-value avant de valider, pas après. */
/* Vendre, et « pour mémoire » comme dernier choix de la même liste.

   Deux boutons vivaient dans l'en-tete du journal : « Vendre », grise faute de
   ligne a vendre, et « Vente passee ». Deux entrees pour un seul geste — j'ai
   vendu quelque chose — et l'une des deux souvent inerte, avec une infobulle que
   personne ne lit au doigt.

   La nature se choisit donc dans le menu qui demande deja quoi vendre : les
   lignes du portefeuille, puis « une vente passee ». C'est le meme controle
   parce que c'est la meme question — de quoi parle-t-on — et elle se pose avant
   les montants, ce qui compte : la nature change ce que les chiffres veulent
   dire, la deviner apres sept champs remplis les jetterait.

   L'asymetrie justifie ici ce qu'on a refuse ailleurs. « + Rentree » et
   « + Depense » sont deux sens opposes du meme acte, connus au moment ou l'on
   appuie : deux boutons, et pas de menu de nature. Une vente passee n'est pas
   l'oppose d'une vente, c'en est la variante degradee — celle que l'application
   n'a pas pu calculer et qu'on ne fait que declarer. Le repli se choisit apres
   avoir cherche sa ligne, pas avant.

   Sans aucune ligne de titres, la fenetre s'ouvre directement sur ce repli au
   lieu de refuser de s'ouvrir. */
function askSale(indexInitial) {
  return new Promise(resolve => {
    const m = $('#modal');
    apercuOuvert = null;
    const ps = Store.state.positions;
    const sansLigne = !ps.length;

    $('#modalTitle').textContent = trad('Vendre une ligne');
    $('#modalSub').textContent = 'La plus-value est calculée sur ton prix de revient';
    $('#modalBody').innerHTML = `
      <div class="modal-champs">
        <div class="field"><label>Ligne</label>
          <select id="vePos">${ps.map((p, i) =>
            `<option value="${i}" ${!sansLigne && i === (indexInitial ?? 0) ? 'selected' : ''}>${esc(p.name)}, ${num(p.qty)} × ${fmtCur(num(p.price), p.currency)}</option>`).join('')}<option
            value="passee" ${sansLigne ? 'selected' : ''}>${trad('Une vente passée, pour mémoire')}</option></select></div>
        <div class="field" data-vente="passee" hidden><label>${trad('Titre vendu')}</label>
          <input id="vePasNom" maxlength="${NOM_LIGNE_MAX}" autocomplete="off"
                 placeholder="${trad('ex. Total, vendu sur l’ancien PEA')}" style="text-align:left"></div>
        <div class="field" data-vente="reelle"><label>${trad('Nombre d\'actions vendues')}</label>
          <input type="number" step="any" id="veQty" autocomplete="off">
          <span class="hint" id="veDispo"></span></div>
        <div class="field" data-vente="reelle"><label>${trad('Prix de vente unitaire')}</label>
          <input type="number" step="any" id="vePrice" autocomplete="off">
          <span class="hint" id="veDev"></span></div>
        <div class="field" data-vente="reelle" id="veFxWrap" hidden><label>${trad('Taux de change à la vente')}</label>
          <input type="number" step="any" id="veFx" autocomplete="off">
          <span class="hint">${trad('1 unité de devise = ce montant en euros')}</span></div>
        <div class="field" data-vente="passee" hidden><label>${trad('Montant encaissé (€)')}</label>
          <input type="number" step="any" id="vePasGross" autocomplete="off"></div>
        <div class="field" data-vente="passee" hidden><label>${trad('Plus ou moins-value réalisée (€)')}</label>
          <input type="number" step="any" id="vePasPnl" autocomplete="off">
          <span class="hint">${trad('négative si la vente a perdu : le prix de revient s’en déduit')}</span></div>
        <div class="field"><label>Date</label>
          <input type="date" id="veDate" value="${todayISO()}">
          <span class="hint" data-vente="passee" hidden>${trad('même approximative : elle range la vente dans son année')}</span></div>
        <div class="field" data-vente="reelle"><label>${trad('Le produit va sur')}</label>
          <select id="veCash"></select>
          <span class="hint">${trad('Sans ça, ton patrimoine baisserait du montant vendu')}</span></div>
        <div class="field"><label>Note</label>
          <input id="veNote" placeholder="${trad('Pourquoi cette vente ?')}" autocomplete="off"></div>
      </div>
      <div id="veApercu" style="margin-top:4px"></div>`;
    $('#modalFoot').innerHTML =
      `<button class="btn ghost" id="veCancel" type="button">Annuler</button>
       <button class="btn" id="veOk" type="button">${trad('Enregistrer la vente')}</button>`;
    montrerModal(m);

    const sel = $('#vePos'), qte = $('#veQty'), prix = $('#vePrice'), fx = $('#veFx');
    const passee = () => sel.value === 'passee';

    /* Les champs de chaque nature s'affichent ou s'effacent d'un coup. Le taux de
       change garde son propre secret : il ne se montre que sur une ligne en
       devise, donc `chargerLigne()` le decide apres, jamais celle-ci. */
    const majNature = () => {
      const p = passee();
      $('#modalBody').querySelectorAll('[data-vente]').forEach(el => {
        el.hidden = el.dataset.vente !== (p ? 'passee' : 'reelle');
      });
      if (p) $('#veFxWrap').hidden = true;
      $('#modalTitle').textContent = p ? trad('Déclarer une vente passée') : trad('Vendre une ligne');
      $('#modalSub').textContent = p
        ? trad('Pour mémoire : rien d’autre ne bouge, ni cash ni patrimoine')
        : 'La plus-value est calculée sur ton prix de revient';
      $('#veOk').textContent = p ? trad('Ajouter au journal') : trad('Enregistrer la vente');
    };

    /* Quand on change de ligne, on repart de ses propres valeurs. */
    const chargerLigne = () => {
      majNature();
      if (passee()) { majApercuVente(); return; }
      const p = ps[+sel.value];
      qte.value = num(p.qty);
      qte.max = num(p.qty);
      prix.value = num(p.price);
      $('#veDispo').innerHTML = `${num(p.qty)} en portefeuille · prix de revient ${fmtCur(num(p.buyPrice), p.currency)}`;
      const devise = p.currency || 'EUR';
      $('#veDev').textContent = devise === 'EUR' ? 'en euros' : `en ${devise}`;
      $('#veFxWrap').hidden = devise === 'EUR';
      fx.value = num(p.fx) || 1;
      // destination : le cash du même courtier, sinon les autres comptes
      const cibles = cashTargets();
      const defaut = defaultCashTarget(p.account);
      $('#veCash').innerHTML = cibles.map(c =>
        `<option value="${c.id}" ${c.id === defaut ? 'selected' : ''}>${esc(sousNom('', nomCompteV2(c), nomEtabDe(c)))}</option>`).join('')
        + `<option value="">Ne rien créditer</option>`;
      majApercuVente();
    };

    const majApercuVente = () => {
      /* La vente passee n'a rien a verifier : on ne connait ni quantite ni prix
         de revient, c'est le detenteur qui donne le resultat. L'apercu se
         contente donc de le relire, et le bouton ne se bloque que sur un nom
         manquant — sans nom, la ligne du journal ne dirait pas de quoi elle
         parle. */
      if (passee()) {
        const nom = $('#vePasNom').value.trim();
        const pnl = num($('#vePasPnl').value);
        $('#veOk').disabled = !nom;
        $('#veApercu').innerHTML = !nom
          ? `<div class="note">⚠ <span>${trad('Indique le titre vendu.')}</span></div>`
          : `<div class="note" style="${pnl >= 0
              ? 'background:color-mix(in oklab, var(--good) 12%, var(--surface-1)); border-color:color-mix(in oklab, var(--good) 38%, transparent)'
              : 'background:color-mix(in oklab, var(--critical) 10%, var(--surface-1)); border-color:color-mix(in oklab, var(--critical) 34%, transparent)'}">
              ${pnl >= 0 ? '↗' : '↘'}
              <span><b>${pnl >= 0 ? trad('Plus-value') : trad('Moins-value')} ${trad('de')} ${fmtSigned(pnl)}</b><br>
              ${trad('Au journal seulement : ni cash, ni position, ni patrimoine ne bougent.')}</span>
            </div>`;
        return;
      }
      const p = ps[+sel.value];
      const a = salePreview(p, qte.value, prix.value, $('#veFxWrap').hidden ? 1 : fx.value);
      const trop = a.qty > num(p.qty), nul = a.qty <= 0;
      $('#veOk').disabled = trop || nul;
      if (trop || nul) {
        $('#veApercu').innerHTML = `<div class="note">⚠ <span>${trop
          ? `Tu n'as que ${num(p.qty)} action${num(p.qty) > 1 ? 's' : ''} sur cette ligne.`
          : 'Indique combien d’actions tu vends.'}</span></div>`;
        return;
      }
      const gagnant = a.realised >= 0;
      $('#veApercu').innerHTML = `
        <div class="note" style="${gagnant
          ? 'background:color-mix(in oklab, var(--good) 12%, var(--surface-1)); border-color:color-mix(in oklab, var(--good) 38%, transparent)'
          : 'background:color-mix(in oklab, var(--critical) 10%, var(--surface-1)); border-color:color-mix(in oklab, var(--critical) 34%, transparent)'}">
          ${gagnant ? '↗' : '↘'}
          <span><b>${gagnant ? 'Plus-value' : 'Moins-value'} de ${fmtSigned(a.realised)}</b>
          (${fmtSignedPct(a.pct)})<br>
          Encaissé ${fmtEUR(a.gross)} · prix de revient ${fmtEUR(a.invested)}<br>
          ${a.full ? 'La ligne sera retirée du tableau, la vente reste au journal.'
                   : `Il te restera ${round2(a.remaining)} action${a.remaining > 1 ? 's' : ''}.`}</span>
        </div>`;
    };

    sel.onchange = chargerLigne;
    for (const el of [qte, prix, fx, $('#vePasNom'), $('#vePasGross'), $('#vePasPnl')]) el.oninput = majApercuVente;
    chargerLigne();
    /* Le premier champ de la nature choisie, et non toujours la quantite : sans
       ligne a vendre, le curseur tombait dans un champ cache. */
    if (passee()) focusChamp($('#vePasNom'));
    else { focusChamp(qte); qte.select(); }

    const fermer = v => {
      masquerModal(m);      $('#modalClose').onclick = null;
      resolve(v);
    };
    $('#veCancel').onclick = () => fermer(null);
    $('#modalClose').onclick = () => fermer(null);
    $('#veOk').onclick = () => {
      if (passee()) {
        const name = $('#vePasNom').value.trim();
        if (!name) return;
        fermer({
          passee: true, name,
          gross: num($('#vePasGross').value), realised: num($('#vePasPnl').value),
          date: $('#veDate').value, note: $('#veNote').value.trim(),
        });
        return;
      }
      const p = ps[+sel.value];
      const a = salePreview(p, qte.value, prix.value, $('#veFxWrap').hidden ? 1 : fx.value);
      if (a.qty <= 0 || a.qty > num(p.qty)) return;
      fermer({
        index: +sel.value, qty: a.qty, price: num(prix.value),
        fxSell: $('#veFxWrap').hidden ? 1 : num(fx.value),
        cashAccount: $('#veCash').value, date: $('#veDate').value, note: $('#veNote').value.trim(),
      });
    };
  });
}

/* Fiche complète d'une ligne de titres : tout ce que la ligne du tableau
   contient, plus ce qu'elle ne montre pas, le compte qui la porte, la
   performance du jour, la place de cotation. Le nom se modifie ici, ce qui
   évite d'aller le chercher dans une cellule serrée. */
function askPosition(index) {
  return new Promise(resolve => {
    const p = Store.state.positions[index];
    if (!p) { resolve(null); return; }
    const dev = p.currency || 'EUR';
    const jour = posDayChange(p);
    const marche = marketStatus(p);
    const compte = ACC[p.account];
    const m = $('#modal');
    apercuOuvert = null;

    const ligne = (label, valeur, classe) =>
      `<dt>${label}</dt><dd class="${classe || ''}">${valeur}</dd>`;

    $('#modalTitle').textContent = p.name || 'Ligne sans nom';
    $('#modalSub').textContent = [compte?.label, ASSET_CLASSES[assetClassDe(p)],
                                  ROLES[roleDe(p)], dev].filter(Boolean).join(' · ');
    /* `data-differe` : rien de ce qui est saisi ici n'entre dans l'etat avant
       « Enregistrer ». Voir l'ecouteur des champs, plus bas dans ce fichier. */
    $('#modalBody').dataset.differe = 'propre';
    $('#modalBody').innerHTML = `
      <div class="modal-total">
        <b>${fmtEUR(posValue(p))}</b>
        <span>${num(p.qty)} × ${fmtCur(p.price, dev)}${dev !== 'EUR' ? ` · change ${round4(num(p.fx) || 1)}` : ''}</span>
      </div>

      <!-- Les deux seuls champs qu'on modifie souvent, juste sous le montant.

           Ils vivaient au bas de la fiche, apres le nom, le compte, la classe
           d'actif, la date, la nature et le role : six reglages qu'on pose une
           fois pour deux qu'on retouche a chaque achat. L'ordre disait le
           contraire de l'usage.

           Cote a cote, parce que c'est un produit : la quantite fois le prix
           donne le montant investi, rappele juste dessous. Et ils ne sont plus
           qu'ici — la liste au-dessous les donnait en lecture, le bas de la
           fiche en saisie, et deux champs sur le meme chemin se disputaient la
           frappe. -->
      <div class="modal-champs champs-cote" style="margin:14px 0 4px">
        <div class="field"><label>${trad('Quantité')}</label>
          <input type="number" step="any" data-path="positions.${index}.qty" value="${p.qty ?? ''}"></div>
        <div class="field"><label>${trad('Prix de revient')} (${esc(dev)})</label>
          <input type="number" step="any" data-path="positions.${index}.buyPrice" value="${p.buyPrice ?? ''}"></div>
      </div>
      <p class="hint" style="margin:0 0 12px">${trad('soit')} ${fmtEUR(posInvested(p))} ${trad('investis')}</p>

      ${(() => {
        const emetteur = issuerOf(p), pays = isinCountry(p.isin), r = rangePosition(p);
        const TYPES = { ETF: trad('Fonds coté (ETF)'), EQUITY: trad('Action'), MUTUALFUND: trad('Fonds'),
                        CRYPTOCURRENCY: 'Crypto', CURRENCY: trad('Devise'), INDEX: trad('Indice') };
        return `
      <!-- « kv-texte » : cette liste porte de la prose, pas des montants.
           « HANetf ICAV - Future of Defence UCITS ETF - Accumulating » ne peut
           pas tenir sur une ligne de 339 px, et l'interdiction de repli que
           .kv applique a ses valeurs, indispensable pour qu'un montant ne se
           coupe jamais entre le nombre et sa devise, poussait ici toute la
           grille 23 px au-dela du bord de la fenetre. -->
      <!-- Les quatre lignes d'identite sont toujours la, dans cet ordre.

           « Selon la fiche rien n'est dans le meme ordre » : deux fiches cote a
           cote, Uber et Nvidia. Uber n'a ni ISIN ni nom officiel, donc tout ce
           qui suit — aujourd'hui, plus-value, cloture, part du portefeuille —
           remontait de trois crans. On ne peut apprendre ou vit un chiffre que
           s'il est toujours au meme endroit, et la fiche s'ouvre plusieurs fois
           par jour.

           Une valeur absente se dit donc « non renseigne », elle ne fait pas
           disparaitre sa ligne. C'est deja ce que fait le plafond d'un livret,
           pour la meme raison : savoir qu'on peut le declarer fait partie de ce
           que la fiche doit dire. Ici, une ligne « ISIN : non renseigne » vaut
           mieux qu'une ligne absente — c'est elle qui explique pourquoi le cours
           n'arrive pas tout seul, et le bouton qui la remplit est juste dessous.

           Nom officiel et Emetteur sont la aussi, et pour la meme raison. Ils
           avaient d'abord ete laisses conditionnels, en fin de bloc, au motif
           qu'ils sont deduits et n'ont rien a dire quand ils ne different pas du
           nom : mesure faite, ça laissait deux lignes de battement entre deux
           fiches, donc tout le bloc des chiffres qui bougeait encore. La moitie
           d'un correctif ne corrige rien.

           Leur etat vide n'est pas « non renseigne » mais la raison de leur
           absence : « identique au nom de la ligne » dit que la question est
           reglee, pas qu'il manque une donnee. C'est la difference entre un trou
           et une reponse. -->
      <!-- Six lignes, toujours les memes, dans cet ordre : c'est ce qui permet
           d'apprendre ou vit un chiffre. -->
      <dl class="kv kv-texte">
        ${ligne(trad('Nature'), p.kind ? esc(TYPES[p.kind] || p.kind)
          : `<span class="muted">${trad('inconnue, le cours ne l’a pas dit')}</span>`)}
        <!-- « Non renseigne » ne vaut que la ou quelque chose manque vraiment.

             « Je veux eviter des trucs non renseignes, c'est pas pro. » Une
             cryptomonnaie n'a pas d'ISIN, une ligne saisie a la main non plus :
             leur afficher un vide a combler designe un defaut qui n'existe pas.
             Elles disent donc « sans objet ».

             Pour un titre qui devrait en avoir un, le vide reste, et il est
             utile : c'est lui qui explique pourquoi le cours n'arrive pas seul.
             L'aide dit ou le trouver, faute de pouvoir le deduire : Yahoo ne
             publie pas les ISIN, et OpenFIGI ne fait que le chemin inverse.
             (Pas de tiret cadratin ici, un controle balaye ce bloc.) -->
        ${ligne('ISIN', p.isin
          ? `<span style="font-family:var(--font-nb)">${esc(p.isin)}</span>`
          : (assetClassDe(p) === 'crypto' || p.manual
             ? `<span class="muted">${trad('sans objet')}</span>`
             : `<span class="muted">${trad('à copier depuis ton courtier')}${aide(trad("Aucune source gratuite ne donne l’ISIN à partir d’un symbole : Yahoo ne le publie pas, et OpenFIGI ne fait que le chemin inverse. Ton relevé de courtier le porte, et le bouton « Vérifier » plus bas confirme qu’il désigne le bon titre."))}</span>`))}
        ${ligne(trad('Pays d’émission'), pays
          ? `${esc(pays)} <span class="muted">${esc(String(p.isin).slice(0, 2))}</span>`
          : (assetClassDe(p) === 'crypto' || p.manual
             ? `<span class="muted">${trad('sans objet')}</span>`
             : `<span class="muted">${trad('se déduit de l’ISIN')}</span>`))}
        ${ligne(trad('Place'), marche
          ? `${esc(p.exchange || p.symbol || '')} <span class="muted">${marche.label}</span>`
          : (p.manual ? `<span class="muted">${trad('saisie à la main')}</span>`
                      : `<span class="muted">${trad('non résolue')}</span>`))}
        <!-- Le nom officiel se lit, il ne s'actionne pas. Un bouton « Utiliser »
             recopiait ce nom dans le champ du nom de la ligne : le seul bouton de
             ce bloc, pose au milieu de six valeurs alignees, et pour un geste qui
             se fait aussi bien en retapant le nom une fois. Le bloc redevient ce
             qu'il est, six faits sur le titre.
             (Pas de tiret cadratin ici : un controle balaye ce bloc a la
             recherche du texte affiche, et ne distingue pas le commentaire.) -->
        ${ligne(trad('Nom officiel'), p.longName
          ? (p.longName === p.name
             ? `<span class="muted">${trad('identique au nom de la ligne')}</span>`
             : esc(p.longName))
          : `<span class="muted">${trad('arrive avec le cours')}</span>`)}
        ${ligne(trad('Émetteur'), emetteur
          ? `${esc(emetteur)} <span class="muted">${trad('d’après le nom du fonds')}</span>`
          : `<span class="muted">${trad('se déduit du nom d’un fonds')}</span>`)}
      </dl>

      <dl class="kv" style="margin-top:12px">
        <!-- Le pourcentage d'abord, en couleur, le montant derriere et neutre.

             Ces deux lignes se lisaient dans deux ordres opposes a deux lignes
             d'ecart : le jour donnait le pourcentage puis les euros, la
             plus-value les euros puis le pourcentage. L'oeil devait redemarrer a
             chaque ligne pour savoir lequel des deux nombres il lisait.

             Et la couleur ne porte plus que sur le pourcentage. Toute la ligne
             etait verte, montant compris : deux valeurs peintes pour un seul
             signe, alors que le « + » le dit deja. La colonne se lit maintenant
             comme une seule serie de pourcentages, avec son montant a cote. -->
        <!-- Une ligne achetee aujourd'hui ne porte qu'un seul de ces deux
             chiffres, parce qu'ils sont le meme : tout ce qui lui est arrive est
             arrive depuis l'achat. Les afficher tous les deux imprimerait deux
             fois le meme montant a deux lignes d'ecart, et la premiere question
             serait « pourquoi ne sont-ils pas differents ». -->
        <!-- Hors seance, la fiche disait « +0,00 % · +0 € », ce qui se lit
             « le titre n'a pas bouge ». Elle dit maintenant que notre cours
             date d'avant minuit, et de quand exactement : c'est la seule chose
             que l'application sache vraiment de la journee. -->
        ${jour && !jour.depuisAchat ? ligne(trad('Aujourd’hui'), jour.horsSeance
            ? `<span class="muted">${trad('hors séance')}</span>`
              + (num(p.quoteTime) ? ` <span class="muted">${trad('cours')} ${esc(fmtCoursQuand(p.quoteTime))}</span>` : '')
            : `<span class="${cls(jour.eur)}">${fmtSignedPct(jour.pct, 2)}</span>`
              + ` <span class="muted">${fmtSigned(jour.eur)}</span>`) : ''}
        ${ligne(`${trad('Plus / moins-value')}${jour?.depuisAchat
            ? `<span class="sub">${trad('achetée aujourd’hui : c’est aussi ton résultat du jour')}</span>` : ''}`,
            `<span class="${cls(posPerfEur(p))}">${fmtSignedPct(posPerfPct(p), 2)}</span>`
            + ` <span class="muted">${fmtSigned(posPerfEur(p))}</span>`)}
        ${(() => {
          /* La duree de detention, comme un fait — et non comme un taux.

             « Par an » vivait ici : la plus-value etalee sur la duree depuis
             l'achat, parce que « +36 % » ne dit rien sans elle, excellent sur un
             an et mediocre sur cinq. Le besoin etait juste, le calcul non : une
             ligne alimentee progressivement n'a pas de duree unique, et
             annualiser un resultat produit en partie le mois dernier ne repond
             a aucune question. Voir la note de la carte « Latente » dans
             Performance.

             La duree seule dit ce qui manquait au pourcentage, sans rien
             affirmer que les donnees ne portent pas : « +13,8 % » et « detenue
             depuis 8 mois » cote a cote se lisent tres bien, et restent vrais
             quelle que soit la façon dont la ligne s'est constituee.

             « Depuis le premier achat » et non « depuis l'achat » : sur une
             ligne renforcee, la date marque le debut, pas la totalite. */
          const debut = String(p.dateAchat || '').trim();
          if (!debut) return '';
          const jours = (Date.now() - Date.parse(debut + 'T12:00:00')) / 86400000;
          if (!Number.isFinite(jours) || jours < 0) return '';
          return ligne(`${trad('Détenue depuis')}<span class="sub">${trad('ton premier achat sur cette ligne')}</span>`,
            `<span class="muted">${jours < 31 ? `${Math.round(jours)} ${Math.round(jours) > 1 ? trad('jours') : trad('jour')}`
              : esc(fmtDuree(jours / 365.25))}</span>`);
        })()}
        <!-- Elle reste affichee sur une ligne achetee aujourd'hui : c'est un
             fait sur le titre, et c'est meme lui qui explique l'ecart entre ce
             qu'a fait le titre et ce qu'a fait ton argent. -->
        ${jour && num(jour.prev) ? ligne(trad('Clôture de la veille'), fmtCur(jour.prev, dev)) : ''}
        ${num(p.dayLow) && num(p.dayHigh)
          ? ligne(trad('Séance'), `${fmtCur(p.dayLow, dev)} <span class="muted">${trad('à')}</span> ${fmtCur(p.dayHigh, dev)}`) : ''}
        ${num(p.volume) ? ligne(trad('Volume du jour'), num(p.volume).toLocaleString(locale()) + ' ' + trad('titres')) : ''}
        <!-- Elle ne disait pas sur quoi elle porte, et la meme ligne s'affiche
             a 3,12 % ici pour 3,6 % en « Poids » sur l'accueil. Les deux sont
             justes : ce ne sont pas les memes bases, et ce n'est pas un defaut
             tant que chacune l'annonce. Celle-ci compte la tresorerie du
             courtier, comme les cibles ; « Poids » ne compte que ce qui cote,
             parce qu'il sert a dire si un mouvement du jour pese. -->
        ${ligne(`${trad('Part du portefeuille')}${aide(trad("Sur tes comptes d’investissement, titres et trésorerie qui y attend d’être placée : la même base que tes cibles de répartition. La colonne « Poids » de l’accueil ne compte, elle, que les titres cotés, parce qu’elle sert à dire si une variation du jour pèse ou non. D’où deux pourcentages différents pour une même ligne, et tous les deux justes."))}`,
            fmtPct(stockTotals().balance ? posValue(p) / stockTotals().balance * 100 : 0))}
      </dl>

      <!-- Zone et secteur se lisent, ne se choisissent pas.
           Ils etaient proposes en menus deroulants : c'etait demander a
           l'utilisateur un travail que l'application doit faire seule. Ils
           restent deduits du libelle, faute de source publique donnant la
           composition d'un fonds, et s'affichent en clair. Le jour ou la
           passerelle saura interroger la repartition sectorielle d'un ETF,
           c'est elle qui remplira ce champ, pas un menu. -->
      <dl class="kv" style="margin-top:12px">
        <dt>${trad('Classement')}<span class="sub">${trad('déduit automatiquement')}</span></dt>
        <dd>${esc(trad(ZONES[zoneDe(p)]))} <span class="muted">·</span> ${esc(trad(SECTEURS[secteurDe(p)]))}</dd>
      </dl>

      ${r ? `<div class="an52">
        <div class="an52-tete">
          <span>${trad('Sur un an')}</span>
          <span class="muted">${fmtCur(r.bas, dev)}, ${fmtCur(r.haut, dev)}</span>
        </div>
        <div class="an52-piste"><i style="left:${r.pct.toFixed(1)}%"></i></div>
        <div class="an52-pied muted">
          ${r.pct >= 90 ? trad('proche de son plus haut de l’année')
            : r.pct <= 10 ? trad('proche de son plus bas de l’année')
            : `${trad('à')} ${Math.round(r.pct)} % ${trad('de l’amplitude annuelle')}`}
        </div>
      </div>` : ''}`;
      })()}

      <div class="modal-champs" style="margin-top:12px">
        <div class="field"><label>${trad('Nom')}${aide(
          `${NOM_LIGNE_MAX} ${trad('caractères au plus : ce nom se lit dans les colonnes de '
          + 'Marchés, où la place est comptée. Le nom officiel du titre reste plus '
          + 'haut sur cette fiche, et le bouton qui le suit le recopie ici.')}`)}</label>
          <input data-path="positions.${index}.name" maxlength="${NOM_LIGNE_MAX}"
                 value="${esc(p.name || '')}"></div>
        <div class="field"><label>${trad('Compte')}</label>
          <select data-path="positions.${index}.account">
            ${accountsWhere(a => a.holdings).map(a =>
              `<option value="${a.id}" ${a.id === p.account ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}
          </select></div>
        <div class="field"><label>${trad('Classe d’actif')}</label>
          <select data-path="positions.${index}.assetClass">
            ${OPTIONS_CLASSE.map(([v, l]) => `<option value="${v}" ${v === assetClassDe(p) ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select></div>
        <div class="field"><label>${trad('Date d’achat')}${aide(trad(DATE_ACHAT_AIDE))}</label>
          <input type="date" data-path="positions.${index}.dateAchat" value="${esc(p.dateAchat || '')}"></div>
        <div class="field"><label>${trad('Nature')}${aide(trad("Un fonds répartit le risque sur des centaines de lignes, un titre en direct le concentre sur une société. La classe d'actif ne le dit pas (un MSCI World et une action Meta sont tous deux des actions), et c'est pourtant ce qui distingue un socle d'un pari. Déduit de l'instrument, corrigeable ici."))}</label>
          <select data-path="positions.${index}.nature">
            <option value="" ${!p.nature ? 'selected' : ''}>Auto, ${esc(trad(NATURES[natureDe({ ...p, nature: '' })]))}</option>
            ${Object.entries(NATURES).map(([v, l]) =>
              `<option value="${v}" ${p.nature === v ? 'selected' : ''}>${esc(trad(l))}</option>`).join('')}
          </select></div>
        <!-- Le role manquait ici : depuis que le tableau cede la place a une
             liste sur telephone, la fiche est le seul endroit ou classer une
             ligne, et il faut donc y trouver les quatre reglages. -->
        <div class="field"><label>${trad('Rôle')}</label>
          <select data-path="positions.${index}.role">
            ${OPTIONS_ROLE.map(([v, l]) => `<option value="${v}" ${v === roleDe(p) ? 'selected' : ''}>${esc(trad(l))}</option>`).join('')}
          </select></div>

        <div class="field"><label>${trad('Cours')} (${esc(dev)})</label>
          <input type="number" step="any" data-path="positions.${index}.price" value="${p.price ?? ''}"></div>
        <!-- La valeur calculee ou saisie. Cette bascule n'existait que dans le
             tableau de quinze colonnes, sous la forme d'une case a cocher
             « man. » : en cachant ce tableau, elle devenait inatteignable. -->
        <div class="field"><label>${trad('Valeur')}${aide(trad("Par défaut, la valeur d’une ligne est quantité × cours, et le cours se rafraîchit tout seul. « Saisie à la main » sert aux lignes qu’aucune place ne cote : une part de société, un contrat, un actif que tu valorises toi-même. Le cours cesse alors d’être interrogé."))}</label>
          <select data-path="positions.${index}.manual" data-type="bool">
            <option value="false" ${p.manual ? '' : 'selected'}>${trad('Calculée, quantité × cours')}</option>
            <option value="true" ${p.manual ? 'selected' : ''}>${trad('Saisie à la main')}</option>
          </select></div>
        <!-- Verifier un ISIN, c'est deux questions : est-il bien forme, et
             designe-t-il le bon titre. La premiere se repond hors ligne, la clé
             de controle etant calculable ; la seconde demande la passerelle, qui
             rend le nom et le symbole auxquels le code correspond vraiment. Le
             bouton fait les deux, dans cet ordre, parce qu'un code mal forme ne
             vaut pas la peine d'un appel reseau.

             Chercher l'ISIN depuis le nom n'est pas propose : la recherche ne
             rend que symbole, nom, place et type. Yahoo ne publie pas les ISIN,
             et un bouton qui promettrait de le trouver mentirait. -->
        <div class="field"><label>ISIN
            <button type="button" class="btn xs ghost" id="posIsinVerif"
                    style="margin-left:8px"
                    title="${trad('Vérifier la clé de contrôle, puis à quel titre ce code correspond')}">${trad('Vérifier')}</button></label>
          <input data-path="positions.${index}.isin" value="${esc(p.isin || '')}"
                 maxlength="12" style="text-transform:uppercase">
          <p class="hint" id="posIsinAvis" style="margin:8px 0 0"></p></div>
        <div class="field"><label>${trad('Symbole')}${(p.isin || '').trim() ? `
            <button type="button" class="btn xs ghost" data-action="resolve-row" data-i="${index}"
                    style="margin-left:8px"
                    title="${trad('Remplacer le symbole par celui que désigne l\'ISIN')}">${trad('↻ Depuis l\'ISIN')}</button>` : ''}</label>
          <!-- Un symbole boursier depasse rarement six caracteres et jamais
               douze : le declarer borne la saisie, et la largeur du champ
               s'en deduit sans qu'on ait a l'habiller. -->
          <input data-path="positions.${index}.symbol" value="${esc(p.symbol || '')}"
                 maxlength="12" style="text-transform:uppercase"></div>
      </div>

      <!-- Supprimer sans vendre, en bas de la fiche.

           En bas, à part, et rouge : ce n'est pas un geste qu'on cherche en
           ouvrant une fiche, et le pied de la fenêtre porte déjà les quatre
           qu'on y cherche — vendre, acheter, enregistrer, fermer. Un cinquième
           bouton les aurait tous repliés à 375 px, et celui-là aurait été
           voisin d'« Enregistrer ».

           La phrase dit ce qui distingue les deux sorties d'une ligne, parce que
           rien d'autre ne le dit : vendre encaisse et laisse une trace au
           journal, supprimer efface l'existence de la ligne. Se tromper de
           bouton coûte une plus-value qui n'apparaîtra jamais nulle part. -->
      <div class="fiche-danger">
        <button type="button" class="btn ghost danger" id="posDelete">${trad('Supprimer cette ligne')}</button>
        <p class="hint">${trad('Elle quitte le portefeuille sans passer par une vente : rien '
          + 'n’est encaissé, et aucune plus-value n’entre au journal. Pour solder en '
          + 'encaissant, c’est « Vendre ».')}</p>
      </div>`;
    /* « Enregistrer » ne sauvegarde rien de plus : chaque frappe est deja ecrite,
       et c'est le probleme — rien ne le disait. Le bouton rafraichit la fiche sur
       place, donc le montant en tete et le total investi suivent la nouvelle
       quantite, et un message confirme. On reste sur la ligne : verifier sa
       correction ne doit pas demander de la rouvrir. */
    $('#modalFoot').innerHTML =
      `<button class="btn ghost" id="posSell" type="button">− ${trad('Vendre')}</button>
       <button class="btn ghost" id="posBuy" type="button">+ ${trad('Acheter')}</button>
       <span class="spacer"></span>
       <button class="btn" id="posSave" type="button">${trad('Enregistrer')}</button>
       <button class="btn ghost" id="posOk" type="button">${trad('Fermer')}</button>`;
    montrerModal(m);

    const fermer = v => {
      masquerModal(m);      $('#modalClose').onclick = null;
      resolve(v);
    };
    const propre = () => ($('#modalBody')?.dataset.differe || 'propre') === 'propre';
    const enregistrer = () => {
      /* `appliquerDiffere()` : la meme fonction que les panneaux d'apercu, et la
         meme que l'ecriture a la frappe, appelee une fois pour toutes. Le corps
         de cette fiche en portait sa propre copie, a deux lignes d'ecart. */
      appliquerDiffere();
      Store.save();
      render();                     // la page derriere suit
      const t = $('#modalBody .modal-total');
      if (t) t.innerHTML = `<b>${fmtEUR(posValue(p))}</b>`
        + `<span>${num(p.qty)} × ${fmtCur(p.price, dev)}`
        + `${dev !== 'EUR' ? ` · change ${round4(num(p.fx) || 1)}` : ''}</span>`;
      const investi = $('#modalBody .hint');
      if (investi) investi.innerHTML = `soit ${fmtEUR(posInvested(p))} investis`;
      toast(trad('Ligne enregistrée'));
    };
    $('#posSave').onclick = enregistrer;
    /* Fermer sans enregistrer abandonne : autant le dire, et proposer de garder.
       Sans cette question, une quantite corrigee puis « Fermer » disparaissait
       sans un mot — le contraire de ce que la saisie differee doit apporter. */
    const fermerOuDemander = async () => {
      if (propre()) { fermer('ferme'); return; }
      const garder = await askConfirm(trad('Modifications non enregistrées') + '\n'
        + trad('Cette ligne porte des changements qui ne sont pas encore dans tes données.'),
        { ok: 'Enregistrer et fermer', refus: 'Fermer sans enregistrer', danger: false });
      if (garder) enregistrer();
      fermer('ferme');
    };
    $('#posOk').onclick = fermerOuDemander;
    $('#modalClose').onclick = () => fermer('ferme');
    $('#posSell').onclick = () => fermer({ vendre: index });
    $('#posBuy').onclick = () => fermer({ acheter: index });
    /* La confirmation est ici, avant la fermeture, parce que c'est ici qu'on
       peut encore nommer la ligne et son montant. La suppression, elle, se fait
       chez l'appelant, apres que la fenetre est partie : c'est lui qui pose la
       sauvegarde et rafraichit la page, comme pour la vente et l'achat.

       Les champs sales ne se demandent pas. La fenetre proposerait de garder des
       corrections sur une ligne qu'on vient d'accepter de faire disparaitre. */
    $('#posDelete').onclick = async () => {
      const ok = await askConfirm(`${trad('Supprimer')} ${guill(p.name || trad('cette ligne'))} ?\n`
        + `${num(p.qty)} × ${fmtCur(p.price, dev)}, ${trad('soit')} ${fmtEUR(posValue(p))}.\n\n`
        + trad('La ligne quitte le portefeuille sans vente : ni encaissement, ni '
        + "plus-value au journal. Réversible avec Ctrl+Z, et une sauvegarde du "
        + "jour existe dans l'onglet Données."), { ok: 'Supprimer', danger: true });
      if (!ok) return;
      fermer({ supprimer: index });
    };

    /* Verification de l'ISIN, en deux temps.

       D'abord la cle de controle, hors ligne : le douzieme caractere se calcule
       a partir des onze premiers, donc une faute de frappe se repare sans rien
       deviner et sans reseau. Le champ est corrige sur place, et l'avis le dit —
       on ne remplace pas une saisie en silence.

       Ensuite la passerelle, qui rend le titre auquel le code correspond
       vraiment. C'est la seule verification qui compte : un ISIN peut etre
       parfaitement forme et coller a la mauvaise ligne, et le calcul de cle n'y
       verrait rien. Le nom rendu s'affiche a cote de celui de la ligne, et c'est
       l'oeil qui tranche.

       Le symbole se remplit dans la foulee s'il manquait : il est le fruit de
       cette resolution, et le redemander apres aurait ete un second geste pour
       une reponse deja obtenue. */
    const avis = $('#posIsinAvis');
    const champIsin = $(`#modalBody [data-path="positions.${index}.isin"]`);
    const dire = (texte, ton) => {
      avis.className = `hint ${ton || ''}`;
      avis.innerHTML = texte;
    };
    $('#posIsinVerif').onclick = async () => {
      const saisi = (champIsin.value || '').trim().toUpperCase();
      if (!saisi) { dire('Aucun ISIN à vérifier sur cette ligne.'); return; }

      const corrige = isinCorrige(saisi);
      if (!cleIsin(saisi)) {
        dire(`<b>${esc(saisi)}</b> n'a pas la forme d'un ISIN : deux lettres de pays,
              neuf caractères, puis une clé de contrôle.`, 'down');
        return;
      }
      let code = saisi;
      if (corrige) {
        code = corrige;
        champIsin.value = code;
        champIsin.dispatchEvent(new Event('change', { bubbles: true }));
        dire(`Clé de contrôle corrigée : <b>${esc(saisi)}</b> devient
              <b>${esc(code)}</b>. Vérification du titre…`);
      } else {
        dire('Clé de contrôle valide. Vérification du titre…');
      }

      try {
        const r = await Quotes.resolveIsin(code);
        const best = r && r.best;
        if (!best || !best.symbol) {
          dire(`<b>${esc(code)}</b> est bien formé, mais aucune cotation ne lui
                répond. ${esc(r && r.error ? r.error : 'Vérifie le code auprès de ton courtier.')}`, 'down');
          return;
        }
        const p2 = Store.state.positions[index];
        const dejaBon = (p2.symbol || '').toUpperCase() === best.symbol.toUpperCase();
        if (!p2.symbol) {
          p2.symbol = best.symbol;
          Store.save();
          const champSym = $(`#modalBody [data-path="positions.${index}.symbol"]`);
          if (champSym) champSym.value = best.symbol;
        }
        dire(`<b>${esc(code)}</b> correspond à <b>${esc(best.name || best.symbol)}</b>
              · ${esc(best.symbol)}${best.exchange ? ` · ${esc(best.exchange)}` : ''}.
              ${dejaBon || !p2.symbol ? '' : `Ta ligne porte le symbole
              <b>${esc(p2.symbol)}</b> : si les deux titres diffèrent, c'est l'un des deux qui est faux.`}`,
          dejaBon || !best ? 'up' : '');
      } catch (e) {
        dire(`Impossible de joindre la passerelle : ${esc(e.message)}.
              La clé de contrôle, elle, est vérifiée.`, 'down');
      }
    };
  });
}

/* Renforcer une ligne : la quantite s'ajoute, et le prix de revient devient
   la moyenne ponderee de l'ancien et du nouveau lot — la seule definition
   du PRU qui laisse la plus-value latente juste apres l'achat. Le montant
   sort du cash a investir apparie, comme une vente l'y depose. */
function askBuy(index) {
  return new Promise(async resolve => {
    const p = Store.state.positions[index];
    if (!p) { resolve(null); return; }
    const comptesCash = cashTargets();
    const cashParDefaut = compteById(defaultCashTarget(p.account));
    const dev = p.currency || 'EUR';

    const v = await askForm({
      titre: `Acheter · ${p.name}`,
      sous: `Position actuelle : ${num(p.qty)} × ${fmtCur(p.buyPrice, dev)} de prix de revient`,
      ok: 'Acheter',
      champs: [
        { cle: 'qty', label: trad('Quantité achetée'), type: 'nombre', requis: true, exemple: '0' },
        { cle: 'price', label: `Prix unitaire (${dev})`, type: 'nombre',
          valeur: num(p.price) || '', aide: trad('pré-rempli avec le dernier cours') },
        ...(comptesCash.length ? [{
          cle: 'cash', label: trad('Payé depuis'), type: 'liste',
          options: [...comptesCash.map(c => [c.id, sousNom('', nomCompteV2(c), nomEtabDe(c))]),
                    ['', 'Aucun compte, ne pas toucher aux espèces']],
          valeur: cashParDefaut?.id || '',
        }] : []),
      ],
    });
    if (!v || !num(v.qty)) { resolve(null); return; }
    resolve({ index, qty: num(v.qty), price: num(v.price), cashAccount: v.cash || null });
  });
}

/* Saisir un mois de dépenses en une fois. Le tableau reste utile pour
   comparer, mais remplir douze colonnes dans une ligne serrée est pénible :
   ici chaque catégorie a son champ, et le total se recalcule à chaque frappe. */
/* Ecrire les depenses d'un mois dans l'etat.

   A un seul endroit, parce que deux gestes y menent desormais : le bouton
   « Enregistrer » de la fenetre, qui n'en sort plus, et sa fermeture, qui
   enregistre encore par « Enregistrer et fermer » ou par « Voir les autres
   mois ». Deux copies de ces quatre lignes auraient fini par ne plus traiter
   le detail de la meme façon — c'est le champ le plus facile a oublier, il
   n'apparait que sur les categories qui ont plus d'un terme. */
/* Le « + » qui écrit un « + », dans un champ de montant.

   L'aide promet « tape-les additionnées, 100+50+70 » et le pavé numérique d'un
   téléphone n'a pas cette touche : sans ce bouton, la phrase annonce depuis
   l'écran de saisie un geste qu'on ne peut pas faire.

   Il a déjà été posé puis retiré, parce qu'il faisait deux « + » de sens
   différents sur la même rangée — l'autre ajoutait un montant détaillé. Ce
   système-là est parti : celui-ci est le seul « + » de la fenêtre, et l'ambiguïté
   avec lui.

   Il se place à gauche dans le champ : les montants sont alignés à droite, donc
   c'est là qu'est la place libre. */
function champSomme(html) {
  return `<span class="champ-somme">${html}<button type="button" class="somme-plus"
    tabindex="-1" title="${trad('Additionner un autre montant dans ce champ')}"
    aria-label="${trad('Additionner un autre montant dans ce champ')}">+</button></span>`;
}

/* Le « + » s'ajoute à la fin, jamais au curseur : le gestionnaire de focus
   sélectionne le champ entier à l'entrée, donc `selectionStart` vaut 0, et une
   insertion au curseur aurait soit refusé d'écrire, soit remplacé le montant.
   C'est de toute façon le sens du bouton — un autre montant s'ajoute à la suite.

   Deux refus, pour ne jamais rendre la saisie invalide : rien à additionner à un
   champ vide, et pas de « + » sur un « + ». */
function insererPlus(champ) {
  if (!champ) return;
  const texte = String(champ.value).replace(/\s+$/, '');
  if (!/\d$/.test(texte)) { champ.focus(); return; }
  champ.value = `${texte}+`;
  const q = champ.value.length;
  /* Le curseur au bout, et le champ défilé jusqu'au bout avec lui : sur un champ
     étroit, le « + » qu'on vient d'écrire pouvait rester hors cadre. */
  const placerCurseur = () => {
    try { champ.setSelectionRange(q, q); } catch (e) {}
    champ.scrollLeft = champ.scrollWidth;
  };
  /* Passer après le gestionnaire de focus global, qui sélectionne tout une image
     après la prise de focus : sans ce décalage le chiffre suivant effaçait la
     somme. Inutile quand le champ a déjà le focus, ce que `onmousedown` garantit
     dans le cas courant. */
  if (document.activeElement === champ) placerCurseur();
  else { champ.focus(); requestAnimationFrame(() => requestAnimationFrame(placerCurseur)); }
  champ.dispatchEvent(new Event('input', { bubbles: true }));
}

function cablerSommePlus(racine) {
  for (const b of racine.querySelectorAll('.somme-plus')) {
    /* Le bouton ne prend pas le focus : sans cela le champ le perd, le regagne, et
       le gestionnaire global le sélectionne en entier. Il garde aussi le pavé
       numérique ouvert sur téléphone. */
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => insererPlus(b.previousElementSibling);
  }
}

function ecrireDepensesMois(index, saisi) {
  const r = Store.state.budget.expenses[index];
  if (!r || !saisi) return null;
  r.v = saisi.v;
  r.note = saisi.note;
  Store.save();
  return r;
}

function askExpenseMonth(index) {
  return new Promise(resolve => {
    const r = Store.state.budget.expenses[index];
    if (!r) { resolve(null); return; }
    /* Les categories retirees ne sont pas proposees ici, et seulement ici :
       leurs montants passes restent partout ailleurs. Une categorie retiree qui
       porte encore un montant sur CE mois-la reste montree — la masquer ferait
       disparaitre de l'ecran un montant qui compte toujours dans le total du
       mois, et le total cesserait d'egaler la somme de ses parts. */
    const cats = expenseCategories()
      .filter(c => !categorieRetiree(c) || num(r.v?.[c]));
    const cible = num(Store.state.budget.monthlyTarget);
    const m = $('#modal');
    apercuOuvert = null;

    $('#modalTitle').textContent = `${trad('Dépenses de')} ${fmtMonth(r.month)}`;
    $('#modalSub').innerHTML = cible ? `${trad('Objectif mensuel :')} ${fmtEUR0(cible)}` : '';
    $('#modalBody').innerHTML = `
      <div class="dep-total" id="depTotal"></div>
      <div class="dep-grille">
        ${cats.map(c => `
          <div class="field dep-champ" data-champ="${esc(c)}">
            <label class="dep-lab"><span>${esc(c)}</span></label>
            ${champSomme(`<input type="text" inputmode="decimal" data-cat="${esc(c)}"
                   value="${r.v?.[c] ?? ''}" placeholder="" autocomplete="off">`)}
          </div>`).join('')}
      </div>
      <!-- Créer une catégorie sans quitter la saisie : la dépense qui n'entre
           dans aucune case se présente au moment où l'on remplit, pas en
           relisant le tableau. Elle rejoint la grille aussitôt, prête à
           recevoir son montant. -->
      <!-- L'explication se replie dans un « ? », a cote du geste qu'elle
           concerne : ce quatre lignes occupait le tiers d'un ecran de telephone
           pour un texte qu'on lit une fois, juste au-dessus du champ de note
           qu'il repoussait hors du cadre. -->
      <div class="row" style="margin-top:12px">
        <button class="btn sm ghost" id="depNouvelleCat" type="button">${trad('+ Nouvelle catégorie')}</button>
        ${aide(trad('Plusieurs dépenses dans une catégorie : tape-les additionnées, 100+50+70. '
          + 'Le + du champ écrit le signe, que le pavé numérique n’a pas. Pour suivre deux '
          + 'choses séparément, fais deux catégories.'))}
      </div>
      <div class="field" style="margin-top:12px">
        <label>${trad('Note du mois')}</label>
        <input id="depNote" value="${esc(r.note || '')}" placeholder="${trad('Ce qui explique ce mois-là…')}">
      </div>`;
    /* « Voir les autres mois » mène au tableau du détail mensuel : la fenêtre
       ne montre qu'un mois, et comparer est le geste d'après. Elle enregistre
       en partant — quitter une saisie en cours par une porte de sortie ne
       doit pas la jeter. */
    /* « Enregistrer » n'est plus une sortie.

       Le pied porte donc les deux gestes separement, comme la fiche d'une ligne
       de titres : Enregistrer ecrit et reste, Fermer s'en va — et demande s'il
       reste des montants non enregistres. « Annuler » est parti avec : devant un
       bouton qui n'enregistre plus en fermant, il ne designait plus rien de
       distinct de Fermer. */
    /* Trois boutons se partagent la largeur a 375 px, soit 107 px chacun :
       « Voir les autres mois » s'y pliait en trois lignes et faisait gonfler tout
       le pied, ses voisins avec. Un libelle de pied reste court, c'est le seul
       endroit de l'application ou la place est comptee d'avance. */
    $('#modalFoot').innerHTML =
      `<button class="btn ghost sm" id="depAutres" type="button">${trad('Autres mois')}</button>
       <span class="spacer"></span>
       <button class="btn" id="depOk" type="button">${trad('Enregistrer')}</button>
       <button class="btn ghost" id="depFermer" type="button">${trad('Fermer')}</button>`;
    montrerModal(m);

    const champs = $$('#modalBody [data-cat]');
    const champDe = cat => champs.find(c => c.dataset.cat === cat);
    /* Un « + » sans rien après est un geste inachevé, pas une saisie invalide :
       on l'ignore au lieu de rejeter le champ entier. Deux conséquences, et la
       seconde est grave. Le total tombait à zéro entre le clic sur « + » et la
       frappe du second montant. Et surtout, un « 157+ » laissé en place valait
       zéro à l'enregistrement : `saisie()` fait `if (!t) continue`, donc la
       catégorie quittait `v`, et le 157 déjà saisi était perdu sans un mot. Le
       bouton qui met le « + » à portée d'un doigt rendait cette perte facile.

       `parseSomme()` n'est pas touchée : elle continue de rejeter ce qui est
       vraiment invalide, et ce rejet ne devient jamais un zéro ici. */
    const valeurChamp = el => parseSomme(String(el.value).replace(/[+\s]+$/, ''))?.total ?? 0;

    const majTotal = () => {
      const t = champs.reduce((s, c) => s + valeurChamp(c), 0);
      const ecart = t - cible;
      $('#depTotal').innerHTML = `
        <span class="dep-somme">${fmtEUR(t)}</span>
        ${cible ? `<span class="dep-ecart ${classeDepassement(t, cible)}">
          ${ecart > 0 ? '▲' : '▼'} ${fmtSigned(Math.abs(ecart) * (ecart > 0 ? 1 : -1))} ${trad('vs objectif')}</span>` : ''}`;
    };

    for (const c of champs) {
      c.oninput = () => majTotal();
      /* Au sortir du champ, « 100+50+70 » devient 220. La somme se tape, elle ne
         se garde pas : ce qui restait d'elle etait un detail par categorie, et il
         est parti. Qui veut suivre deux choses separement fait deux categories,
         c'est ce que les categories sont. */
      c.onchange = () => {
        const s = parseSomme(c.value);
        /* Une saisie illisible ne vaut pas zero : le champ reprend ce qu'il avait,
           sans quoi une faute de frappe effacerait un montant. */
        c.value = s ? (s.total || '') : (r.v?.[c.dataset.cat] ?? '');
        majTotal();
      };
    }
    cablerSommePlus($('#modalBody'));
    majTotal();
    focusChamp(champs[0]);

    /* Créer une catégorie sans perdre la saisie en cours. La catégorie est
       une colonne du budget, donc un objet partagé par tous les mois : elle
       s'enregistre pour de bon. Ce qui est déjà tapé part avec, et la fenêtre
       se rouvre sur la grille complétée — plus sûr que d'injecter une case
       dans une grille dont tout le câblage est déjà posé. */
    $('#depNouvelleCat').onclick = async () => {
      /* La saisie se relève **avant** d'ouvrir la question par-dessus : les
         deux fenêtres partagent le même corps, et `saisie()` cherchait le
         champ de note dans un panneau qu'`askText` venait de remplacer. Elle
         échouait en silence, la fenêtre se fermait et rien ne revenait. */
      const etat = saisie();
      const nom = await askText('Nouvelle catégorie de dépenses',
        'Elle devient une colonne du tableau, vide sur tous les autres mois.', 'ex. Abonnements');
      /* Annuler ramène à la saisie, montants intacts : la fenêtre a été
         recouverte, il faut bien la rendre. */
      if (!nom) { fermer({ ...etat, rouvrir: true }); return; }
      if (!addExpenseCategory(nom)) {
        toast(trad('Cette catégorie existe déjà'));
        fermer({ ...etat, rouvrir: true });
        return;
      }
      Store.save();
      fermer({ ...etat, rouvrir: true });
    };

    const fermer = v => {
      masquerModal(m);      $('#modalClose').onclick = null;
      resolve(v);
    };
    const saisie = () => {
      const v = {};
      for (const c of champs) {
        const cat = c.dataset.cat;
        const t = valeurChamp(c);
        if (!t) continue;
        v[cat] = round2(t);
      }
      return { v, note: $('#depNote').value };
    };
    /* L'etat de depart, releve par la fonction meme qui enregistre.

       Comparer deux `saisie()` plutot que poser un drapeau sur chaque champ :
       il y a ici trois sortes de saisie — les montants de categorie, le detail
       ligne a ligne, la note du mois — et un drapeau se serait tot ou tard
       oublie sur la troisieme. Ce qui compte n'est pas qu'on ait touche un
       champ, c'est que ce qui partirait soit different de ce qui est arrive :
       taper 40 par-dessus 40 ne salit rien. */
    /* `depart` bouge : c'est ce qui permet d'enregistrer sans fermer.

       Il valait l'etat d'ouverture, une fois pour toutes. Enregistrer en cours
       de saisie l'aurait laisse en arriere, et fermer ensuite aurait redemande
       « modifications non enregistrees » pour des montants deja ecrits. Il
       marque desormais le dernier etat mis a l'abri, ouverture comprise. */
    let depart = JSON.stringify(saisie());
    const sale = () => JSON.stringify(saisie()) !== depart;

    /* Annuler jetait la saisie sans un mot. Sur cette fenetre-la c'est le pire
       endroit ou le faire : on y remplit douze categories a la suite, et la
       perte ne se voit qu'au retour sur le tableau. */
    const annulerOuDemander = async () => {
      if (!sale()) { fermer(null); return; }
      const garder = await askConfirm(trad('Modifications non enregistrées') + '\n'
        + trad('Les dépenses de {m} portent des changements qui ne sont pas encore dans tes données.')
            .replace('{m}', fmtMonth(r.month)),
        { ok: 'Enregistrer et fermer', refus: 'Fermer sans enregistrer', danger: false });
      fermer(garder ? saisie() : null);
    };

    /* Enregistrer sur place : les montants entrent dans l'etat, la page derriere
       suit, la fenetre reste ouverte et redevient propre. On reste sur le mois
       qu'on est en train de remplir — c'est la que le total se verifie. */
    const enregistrer = () => {
      const r2 = ecrireDepensesMois(index, saisie());
      depart = JSON.stringify(saisie());
      render();
      toast(`${fmtMonth(r.month)} · ${fmtEUR0(expenseRowTotal(r2 || r))}`);
    };

    $('#depFermer').onclick = annulerOuDemander;
    $('#modalClose').onclick = annulerOuDemander;
    $('#depOk').onclick = enregistrer;
    $('#depAutres').onclick = () => fermer({ ...saisie(), versTableau: true });
  });
}

/* Saisir un relevé mensuel en une fois — la fenêtre qui manquait au dernier
   gros tableau sans version téléphone. Une colonne par compte se lit bien sur
   un écran large et pas du tout au pouce : ici chaque compte a son champ, et
   le total se recalcule à la frappe, comparé au mois précédent.

   Les comptes clôturés que la vue masque restent affichés dès qu'ils portent
   un montant : la fenêtre réécrit la ligne entière, et effacer en aveugle
   l'historique d'un compte qu'on ne voit même pas serait une perte muette.
   Les colonnes d'identifiants inconnus — un compte disparu du modèle — ne
   sont pas montrées mais sont recopiées telles quelles.

   Le bouton de photo remplit les champs sans rien enregistrer : c'est le ⤒
   du tableau, mais relu avant d'être écrit, donc sans confirmation à donner. */
/* L'ecriture d'un releve, appelee par « Enregistrer » de la fenetre : elle
   ecrit et la fenetre reste, comme sa jumelle des depenses. Les dettes du mois
   viennent du champ : ce qui s'affiche est ce qui s'enregistre. */
function appliquerReleve(index, saisi) {
  const row = Store.state.monthly[index];
  if (!row) return false;
  sauvegardeAvantEcrasement(row);
  row.v = saisi.v;
  row.comment = saisi.comment;
  row.dettes = round2(num(saisi.dettes));
  Store.save(); render();
  return true;
}

/* Un mois du calendrier se vide ; seules les lignes hors calendrier (une clôture
   au 31/12, par exemple) se suppriment vraiment.

   Deux portes appellent ceci, le ✕ du tableau de correction et le bouton rouge de
   la fenêtre du mois, et la nuance entre les deux cas ne se redit pas à chaque
   fois : la question est un fait, elle se règle à un seul endroit. Rend vrai si
   quelque chose a changé, et ne rafraîchit pas, l'appelant seul sachant s'il a
   une fenêtre à fermer d'abord. */
async function viderOuSupprimerMois(index) {
  const r = Store.state.monthly[index];
  if (!r) return false;
  const calendrier = isCalendarMonth(r.date);
  if (!await askConfirm(calendrier
    ? trad('Effacer les montants de {m} ?').replace('{m}', fmtMonth(r.date)) + '\n\n'
      + trad("La ligne reste dans le tableau, vide, les douze mois de l'année restent affichés.")
      + '\n\n' + trad('Réversible avec Ctrl+Z.')
    : trad('Supprimer la ligne du {d} ?').replace('{d}', fmtDate(r.date)) + '\n\n'
      + trad("Ce n'est pas un mois du calendrier : la ligne disparaîtra du tableau.")
      + '\n\n' + trad('Réversible avec Ctrl+Z.'))) return false;
  if (calendrier) clearMonthRow(r, 'comment');
  else Store.state.monthly.splice(index, 1);
  Store.save();
  /* Clef pointée : « Ligne supprimée » dit « Holding deleted » en anglais, une
     ligne du portefeuille, et ce n'en est pas une. Un homographe se résout par
     une clef, jamais en changeant celle du voisin. */
  toast(calendrier ? `${fmtMonth(r.date)} ${trad('vidé')}`
                   : trad('releve.ligneSupprimee', 'Ligne supprimée'));
  return true;
}

function askMonthlySnapshot(index) {
  return new Promise(resolve => {
    const r = Store.state.monthly[index];
    if (!r) { resolve(null); return; }
    const visibles = ACCOUNTS.filter(a => historyShowLegacy || !a.legacy);
    const vus = new Set(visibles.map(a => a.id));
    const comptes = [...visibles, ...ACCOUNTS.filter(a => !vus.has(a.id) && num(r.v?.[a.id]))];
    const montres = new Set(comptes.map(a => a.id));
    /* La reference est le dernier mois **renseigne**, pas la ligne du dessus :
       le calendrier ouvre douze mois d'avance, donc septembre a presque
       toujours un aout vide au-dessus de lui. On la nomme, sinon « +715 € »
       ne dirait pas depuis quand. */
    const avant = Store.state.monthly.slice(0, index).filter(x => !rowIsEmpty(x)).pop();
    const precedent = avant ? rowTotal(avant) : 0;
    const photo = nowTotals().total;
    /* Un mois a venir n'a pas de montants a reprendre : le bouton disparait
       plutot que d'ecrire aout dans decembre. La saisie reste ouverte — on
       peut vouloir corriger une ligne creee trop tot — mais elle est
       annoncee pour ce qu'elle est, et confirmee a l'enregistrement. */
    const revolu = moisRevolu(r.date);
    const m = $('#modal');
    apercuOuvert = null;

    $('#modalTitle').textContent = `${trad('Relevé de')} ${fmtMonth(r.date)}`;
    /* « Valeur des avoirs » plutôt que rien : chaque champ porte ce que le
       compte valait, crédits non déduits. Sans le dire, on ne savait pas s'il
       fallait saisir 150 000 € pour un studio ou les 20 000 € qui restent une
       fois le prêt retiré — et les deux chiffres existent dans l'application,
       à deux endroits différents. */
    /* escMontant : le montant du dernier releve est un SVG en mode discret. */
    $('#modalSub').innerHTML = escMontant((avant
      ? `${trad('Dernier relevé,')} ${fmtMonth(avant.date)} : ${fmtEUR0(precedent)}`
      : trad('Aucun relevé avant celui-ci')) + ` · ${trad('valeurs brutes, crédits à part')}`);
    $('#modalBody').innerHTML = `
      <div class="dep-total" id="relTotal"></div>
      ${/* Sans avoirs saisis, la photo vaut zero : proposer d'ecraser douze
            champs avec des zeros n'aiderait personne. */''}
      ${/* Le bouton de photo est l'action principale, et il ne l'etait pas.

            Il est donc plein, pleine largeur, et son libelle dit ce qu'il fait
            plutot que de se nommer : « Reprendre les montants actuels » et le
            total qu'il va ecrire. La phrase en dessous degrade les champs a ce
            qu'ils sont vraiment — une surface de correction — et emploie les
            memes mots que le depliant de la page, pour que les deux ecrans
            racontent la meme chose.

            Sans avoirs saisis, la photo vaut zero : proposer d'ecraser douze
            champs avec des zeros n'aiderait personne, le bloc disparait. */''}
      ${photo && revolu ? `
      <button class="btn pleine" id="relPhoto" type="button"
              >⤒ ${trad('Reprendre les montants actuels,')} ${fmtEUR0(photo)}</button>
      <p class="hint" style="margin:6px 0 14px; text-align:center">${trad('Remplir tous les champs '
        + 'automatiquement')}${aide(trad("Chaque champ ci-dessous reçoit la valeur actuelle du compte correspondant. Rien n’est enregistré avant que tu ne cliques sur « Enregistrer » : tu peux corriger ce qu’il a écrit, ou renoncer."))}</p>` : ''}
      ${revolu ? '' : `
      <p class="avert">${trad('Ce mois n’a pas encore eu lieu. Il n’y a pas de montants à en '
        + 'reprendre, et ce que tu saisirais ici serait lu comme un relevé passé.')}</p>`}
      <div class="dep-grille">
        ${comptes.map(a => `
          <div class="field">
            <!-- « clôturé » était faux pour une pierre tombale : ce n'est pas
                 un compte qu'on a fermé, c'est un identifiant que la migration
                 a retiré du modèle. Le distinguer évite de croire qu'on a
                 clôturé un compte qu'on utilise encore. -->
            <!-- L'etablissement sur sa propre ligne, et cette ligne existe
                 meme vide : accolee au nom, elle passait a la ligne pour les
                 noms longs et le champ dessous descendait d'un cran par rapport
                 a son voisin de rangee. Une hauteur de libelle constante aligne
                 les douze champs quel que soit le nom. -->
            <label title="${esc([a.label, a.broker].filter(Boolean).join(' · '))}"
              >${esc(a.label)}${a.fantome ? ' <span class="muted">(ancien modèle)</span>'
              : a.legacy ? ' <span class="muted">(clôturé)</span>' : ''}<span
                class="f-etab">${esc(a.broker || '')}</span></label>
            <input type="number" step="any" inputmode="decimal" data-compte="${esc(a.id)}"
                   value="${r.v?.[a.id] ?? ''}" placeholder="">
          </div>`).join('')}
      </div>
      <!-- Le capital restant dû du mois, à côté des avoirs et non mêlé à eux.
           La photo du jour le note déjà ; sans ce champ, un mois rempli à la
           main resterait sans dette et sa part nette ne monterait jamais. -->
      <div class="field" style="margin-top:12px">
        <label>${trad('Crédits en cours ce mois-là (€)')}${aide(trad("Le total du capital restant dû à cette date. Il ne se soustrait pas des champs ci-dessus (ceux-ci portent la valeur brute de chaque compte), mais il fait monter la part nette de tes biens, mois après mois, à mesure que tu rembourses."))}</label>
        <input type="number" step="any" inputmode="decimal" id="relDettes"
               class="champ-large" value="${num(r.dettes) || ''}" placeholder="0">
      </div>
      <div class="field" style="margin-top:12px">
        <label>${trad('Commentaire du mois')}</label>
        <input id="relNote" value="${esc(r.comment || '')}" placeholder="${trad('Ce qui explique ce mois-là…')}">
      </div>
      <!-- Effacer le mois, en bas, a part et rouge : la meme place que sur la
           fiche d'une ligne, et pour la meme raison. Ce n'est pas ici qu'on
           l'ecrit sous le pied de la fenetre, ou un troisieme bouton serait
           voisin d'« Enregistrer ».

           Il ferme le seul manque du tableau de correction, qui ne se propose
           plus au doigt : sans lui, un mois saisi par erreur ne s'effacerait
           plus depuis un telephone. Le libelle suit la nature de la ligne,
           puisque l'acte n'est pas le meme. -->
      <div class="fiche-danger">
        <button type="button" class="btn ghost danger" id="relVider">${
          isCalendarMonth(r.date) ? trad('Effacer ce relevé')
                                  : trad('releve.supprimerLigne', 'Supprimer cette ligne')}</button>
        <p class="hint">${isCalendarMonth(r.date)
          ? trad('Les montants partent, le mois reste dans la liste, vide : les douze mois '
            + 'de l’année s’affichent toujours.')
          : trad('Ce n’est pas un mois du calendrier : la ligne disparaît de la liste.')}</p>
      </div>`;
    /*    Le meme pied que la fenetre jumelle des depenses, et c'est le point. «
   Certaines cartes il faut enregistrer puis fermer. La regle vaut pour la
   famille entiere — une fenetre ou l'on saisit en serie : Enregistrer ecrit
   et reste, Fermer s'en va et demande s'il reste du non-enregistre. Une
   fenetre qui accomplit un acte (creer, vendre) : le bouton porte le nom de
   l'acte et ferme. « Annuler » est parti avec, comme chez la jumelle : devant
   un bouton qui n'enregistre plus en fermant, il ne designait plus rien de
   distinct de Fermer.*/
    $('#modalFoot').innerHTML =
      `<button class="btn" id="relOk" type="button">${trad('Enregistrer')}</button>
       <button class="btn ghost" id="relFermer" type="button">${trad('Fermer')}</button>`;
    montrerModal(m);

    const champs = $$('#modalBody [data-compte]');
    const majTotal = () => {
      const t = champs.reduce((s, c) => s + num(c.value), 0);
      const d = precedent && t ? t - precedent : 0;
      /* Le gros chiffre reste le brut — c'est la somme des champs au-dessus,
         il doit s'y retrouver. Le net s'ajoute en dessous dès qu'un crédit
         est saisi : c'est lui qu'on retiendra, mais pas au prix d'un total
         qui ne correspondrait à aucune addition visible. */
      const dettes = num($('#relDettes')?.value);
      $('#relTotal').innerHTML = `
        <span class="dep-somme">${fmtEUR0(t)}</span>
        ${d ? `<span class="dep-ecart ${cls(d)}">
          ${d > 0 ? '▲' : '▼'} ${fmtSigned(d)} ${trad('depuis')} ${esc(fmtMonth(avant.date))}</span>` : ''}
        ${dettes ? `<span class="dep-ecart muted" style="flex-basis:100%">
          net de crédits : <b>${fmtEUR0(t - dettes)}</b></span>` : ''}`;
    };
    /* Ce qui a change depuis le dernier enregistrement. C'est lui que Fermer
       interroge : fermer une saisie propre ne demande rien, fermer une saisie
       sale propose de la garder — la jumelle des depenses fait pareil, et le
       releve, lui, jetait tout sans un mot. */
    let sale = false;
    const touche = () => { sale = true; majTotal(); };
    for (const c of champs) c.oninput = touche;
    $('#relDettes').oninput = touche;       // le net suit la frappe
    $('#relNote').oninput = () => { sale = true; };
    majTotal();
    /* Le focus va au bouton quand il existe.

       `focusChamp` ne conviendrait pas ici : il se tait sur ecran tactile, pour
       ne pas ouvrir le clavier, et il selectionne le contenu. Un bouton n'a ni
       clavier a ouvrir ni contenu a selectionner. */
    if ($('#relPhoto')) $('#relPhoto').focus({ preventScroll: true });
    else focusChamp(champs[0]);

    /* La photo se retient : c'est le seul geste qui remplace douze champs d'un
       coup, donc le seul qui ait un ecrasement a confirmer. */
    let photoPrise = false;
    if ($('#relPhoto')) $('#relPhoto').onclick = () => {
      for (const c of champs) {
        const v = nowValue(c.dataset.compte);
        c.value = v ? round2(v) : '';
      }
      /* La photo remplit aussi le champ des credits : ce qui s'affiche est ce
         qui s'enregistre, et ce champ etait le seul que la photo laissait
         vide pendant que l'ecriture prenait la dette du jour en douce. */
      const detteJour = round2(patrimoine().dettes);
      $('#relDettes').value = detteJour || '';
      photoPrise = true;
      sale = true;
      majTotal();
      toast(trad('Montants actuels repris, à vérifier puis enregistrer'));
    };

    const fermer = v => {
      masquerModal(m);      $('#modalClose').onclick = null;
      resolve(v);
    };
    /* Enregistre sans fermer, et rend vrai si l'ecriture a eu lieu : Fermer
       s'en sert pour « Enregistrer et fermer ». */
    const enregistrer = async () => {
      const v = {};
      for (const [k, val] of Object.entries(r.v || {})) if (!montres.has(k)) v[k] = val;
      for (const c of champs) if (num(c.value)) v[c.dataset.compte] = round2(num(c.value));

      /* Deux gardes avant d'ecrire, et elles se posent ici plutot que chez
         l'appelant : refuser laisse la saisie a l'ecran, alors qu'une question
         posee apres la fermeture obligerait a tout retaper.

         Le mois a venir d'abord. La ligne existe parce que le calendrier ouvre
         douze mois d'avance, pas parce qu'on a vecu ce mois-la.

         L'ecrasement ensuite, et seulement apres une photo : elle remplace les
         douze champs d'un seul geste, et c'est le seul chemin par lequel un mois
         deja rempli se perd sans qu'on l'ait voulu. Corriger un champ a la main
         est delibere, champ par champ, et n'a rien a confirmer. */
      if (!revolu && !await askConfirm(
          trad('Enregistrer un relevé pour {m} ?').replace('{m}', fmtMonth(r.date)) + '\n\n'
        + trad('Ce mois n’a pas encore eu lieu. La ligne comptera comme un relevé '
        + 'passé, dans les courbes comme dans les écarts d’un mois à l’autre.'),
          { ok: 'Enregistrer quand même' })) return false;

      if (photoPrise && !rowIsEmpty(r) && !await askConfirm(
          trad('Remplacer les montants de {m} ?').replace('{m}', fmtMonth(r.date)) + '\n\n'
        + `${trad('Enregistré :')} ${fmtEUR0(rowTotal(r))}\n`
        + `${trad('Après reprise :')} ${fmtEUR0(champs.reduce((s, c) => s + num(c.value), 0))}\n\n`
        + trad('Réversible : le message qui suit propose de revenir en arrière.'),
          { ok: 'Remplacer' })) return false;

      appliquerReleve(index, { v, comment: $('#relNote').value,
                               dettes: $('#relDettes').value });
      sale = false;
      photoPrise = false;
      toast(`${fmtMonth(r.date)} · ${fmtEUR0(rowTotal(Store.state.monthly[index]))} ${trad('enregistré')}`);
      return true;
    };
    $('#relOk').onclick = enregistrer;
    /* Fermer demande son avis a la saisie, pas a l'utilisateur : propre, elle
       part sans un mot ; sale, elle propose de garder — le meme dialogue que
       les apercus et la fenetre des depenses. Avant, « Annuler » jetait douze
       champs sans une question. */
    const quitter = async () => {
      if (sale) {
        const garder = await askConfirm(trad('Modifications non enregistrées') + '\n'
          + trad('Ce relevé porte des montants qui ne sont pas encore dans tes données.'),
          { ok: 'Enregistrer et fermer', refus: 'Fermer sans enregistrer', danger: false });
        if (garder && !await enregistrer()) return;   // garde refusee : on reste
      }
      fermer(null);
    };
    $('#relFermer').onclick = quitter;
    $('#modalClose').onclick = quitter;
    /* La saisie sale ne se demande pas : la question qui vient de recevoir un oui
       portait deja sur l'effacement de ce mois-la, et proposer ensuite de garder
       douze champs serait la contredire. C'est le raisonnement de la fiche d'une
       ligne, au meme endroit. */
    $('#relVider').onclick = async () => {
      if (!await viderOuSupprimerMois(index)) return;
      fermer(null);
      render();
    };
  });
}

/* =============================================================
   FENÊTRE D'APERÇU
   Un clic sur une tuile montre le détail sans quitter la page ;
   un second clic emmène là où ça se modifie.
   ============================================================= */

const APERCUS = {
  /* Détail d'une classe d'actif. Les liquidités se ventilent par usage
     déclaré ; les autres classes, placement par placement. */
  classe: (classe) => {
    const p = patrimoine();
    const total = p.classes[classe] || 0;
    let lignes;
    if (classe === 'liquidites') {
      /* Ces montants changent souvent : chaque usage est un menu déroulant
         qui liste ses comptes, montants modifiables sur place. Les totaux
         d'usage et le total du panneau suivent la frappe. */
      const groupes = AFFECTATIONS.map(([aff, label]) => {
        const entrees = [];
        Store.state.comptes.forEach((c, ic) => {
          if (c.statut === 'archive') return;
          (c.cash || []).forEach((e, j) => {
            if (e.affectation === aff) entrees.push({ c, ic, j, e });
          });
        });
        return { aff, label, entrees };
      }).filter(g => g.entrees.length);

      const sommes = () => Object.fromEntries(groupes.map(g =>
        [g.aff, fmtEUR(g.entrees.reduce((s, x) => s + num(x.e.montant), 0))]));

      return {
        titre: CLASSES_ACTIFS[classe],
        sous: `${groupes.length} ${groupes.length > 1 ? trad('usages') : trad('usage')} · ${trad('modifiable ici même')}`,
        total: poches().classes.liquidites,
        lignes: [],
        live: sommes,
        /* Le meme pli anime que les groupes de la page Actifs, et le meme
           bouton pour les mener tous : `.cpt-pli` passe sa rangee de 0fr a 1fr,
           seule facon d'animer une hauteur inconnue. `<details>` tenait ce role
           et ne s'anime pas — et surtout il n'offrait aucune prise pour un geste
           collectif, alors que c'est precisement ce qu'on vient faire ici :
           replier les usages pour comparer leurs totaux d'un coup d'oeil. */
        /* Le geste collectif vit sur la ligne du sous-titre, pas sur une ligne
           a lui : c'est une commande de lecture, elle n'a pas a pousser le
           contenu vers le bas dans une fenetre qui defile deja, et cette ligne
           etait a moitie vide. */
        sousAction: groupes.length > 1
          ? `<button type="button" class="btn sm ghost" data-action="liq-plier-tout"
                     aria-expanded="true">${trad('Tout replier')}</button>`
          : '',
        html: `
          <!-- Le pli se relit dans l'etat, il n'est plus ecrit « ouvert » en dur :
               le geste ne basculait qu'une classe CSS, donc le premier rendu
               suivant — celui d'« Enregistrer » — reconstruisait tout deplie.
               Les groupes de la page Actifs memorisaient deja le leur ; c'est la
               meme cle, prefixee, et le meme accesseur. -->
          ${groupes.map(g => `
          <section class="liq-groupe">
            <button type="button" class="liq-sommaire" data-action="liq-plier"
                    data-cle="${esc(cleLiqPli(g.aff))}"
                    aria-expanded="${compteReplies.has(cleLiqPli(g.aff)) ? 'false' : 'true'}">
              <span>${esc(g.label)}</span>
              <b data-live="${esc(g.aff)}">${sommes()[g.aff]}</b><span class="cpt-chev">⌄</span></button>
            <div class="cpt-pli ${compteReplies.has(cleLiqPli(g.aff)) ? '' : 'ouvert'}"><div class="liq-corps">
              ${g.entrees.map(x => {
                const etab = sousNom(nomCompteV2(x.c), nomEtabDe(x.c));
                return `
                <div class="liq-ligne">
                  <span class="cpt-nom">${esc(nomCompteV2(x.c))}${etab ? `<span class="sub">${esc(etab)}</span>` : ''}</span>
                  <input type="number" step="any" class="champ-inline"
                         data-path="comptes.${x.ic}.cash.${x.j}.montant" value="${num(x.e.montant)}">
                </div>`; }).join('')}
            </div></div>
          </section>`).join('')}`,
        vue: 'accounts', ancre: '', cta: trad('Ouvrir Actifs'),
      };
    }
    /* Un bien immobilier ne se resume pas a sa valeur du jour : ce qu'il a
       coute, ce qu'il a pris, depuis quand on l'a, et surtout ce qui reste du
       pret. « 150 000 € » sans le credit en face ne dit pas ce qu'on possede.
       Le pret est porte par l'etablissement qui detient le bien — c'est la que
       le modele le range — donc on le nomme plutot que de l'attribuer en
       silence. */
    if (classe === 'immobilier') {
      const biens = [];
      for (const c of comptesOuverts()) {
        for (const l of lignesDe(c)) {
          if (l.classe !== 'immobilier') continue;
          const cr = creditsDuCompte(c);
          biens.push({ l, c, idxEtab: cr.idxEtab, dettes: cr.dettes, credits: cr.total });
        }
      }
      biens.sort((a, b) => b.l.valeur - a.l.valeur);
      const creditTotal = biens.reduce((s, b) => s + b.credits, 0);
      /* Le capital restant dû se modifie ici même, comme les liquidités : il
         baisse à chaque mensualité, et aller le corriger au fond d'une fiche
         d'établissement pour un geste mensuel n'a pas de sens.
         Le grand total ne bouge pas — c'est la valeur du bien — donc c'est la
         valeur nette qui suit la frappe, sinon la saisie n'aurait l'air
         d'avoir aucun effet. */
      const netDe = b => num(b.l.valeur) - b.dettes.reduce((s, x) => s + num(x.d.montant), 0);
      const vivants = () => Object.fromEntries(biens.flatMap((b, k) => [
        [`net-${k}`, fmtEUR(netDe(b))],
        [`credit-${k}`, `−${fmtEUR(b.dettes.reduce((s, x) => s + num(x.d.montant), 0))}`],
      ]));
      return {
        titre: 'Immobilier',
        sous: creditTotal
          ? `${biens.length} bien${biens.length > 1 ? 's' : ''} · ${fmtEUR0(total - creditTotal)} net de crédits`
          : `${biens.length} bien${biens.length > 1 ? 's' : ''} · sans crédit`,
        total, lignes: [], live: vivants,
        html: biens.map((b, k) => {
          const gain = b.l.prixDeRevient ? b.l.valeur - b.l.prixDeRevient : null;
          const pct = b.l.prixDeRevient ? (b.l.valeur / b.l.prixDeRevient - 1) * 100 : null;
          const meta = sousNom(b.l.libelle, nomCompteV2(b.c), nomEtabDe(b.c));
          return `
          <div class="bien">
            <div class="bien-tete">
              <span class="cpt-nom">${esc(b.l.libelle)}
                ${meta ? `<span class="sub">${esc(meta)}</span>` : ''}</span>
              <b>${fmtEUR(b.l.valeur)}</b>
            </div>
            <dl class="kv">
              ${b.l.part ? `
                <!-- Le montant en tete est deja la part : sans cette ligne, il
                     paraitrait simplement faux a qui connait son bien. -->
                <dt>${trad('Ta part')}</dt>
                  <dd>${fmtPct(b.l.part, 0)} ${trad('de')} ${fmtEUR0(b.l.valeurEntiere)}</dd>` : ''}
              ${gain != null ? `
                <dt>${trad('Prix d\'acquisition')}</dt><dd>${fmtEUR0(b.l.prixDeRevient)}</dd>
                <dt>${trad('Plus-value latente')}</dt>
                  <dd class="${cls(gain)}">${fmtSigned(gain)} <span class="muted">${fmtSignedPct(pct, 1)}</span></dd>`
                : `<dt>${trad('Prix d\'acquisition')}</dt><dd class="muted">${trad('non renseigné')}</dd>`}
              ${b.l.dateAcquisition ? `<dt>${trad('Acquis le')}</dt><dd>${fmtDate(b.l.dateAcquisition)}</dd>` : ''}
              ${usageLigne(b.l) ? `<dt>${trad('Usage')}</dt>
                <dd>${trad(USAGE_BIEN_LABEL[usageLigne(b.l)])}</dd>` : ''}
              <dt>${trad('Disponibilité')}</dt>
                <dd>${esc(trad(MOBILISABLE_LABEL[mobiliteLigne(b.l, b.c)]))}</dd>
            </dl>
            ${b.dettes.length ? `
              <div class="pret-vif">
                ${b.dettes.map(({ d, i }) => `
                  <div class="liq-ligne">
                    <span class="cpt-nom">${esc(d.libelle)}
                      <span class="sub">${trad('capital restant dû, à baisser après chaque mensualité')}</span></span>
                    <input type="number" step="any" class="champ-inline"
                           data-path="etabs.${b.idxEtab}.dettes.${i}.montant" value="${num(d.montant)}"
                           aria-label="Capital restant dû, ${esc(d.libelle)}">
                  </div>`).join('')}
                <dl class="kv">
                  <dt>${trad('Crédits en cours')}</dt><dd class="dette" data-live="credit-${k}">−${fmtEUR(b.credits)}</dd>
                  <dt><b>${trad('Ce que tu possèdes')}</b></dt>
                    <dd><b data-live="net-${k}">${fmtEUR(b.l.valeur - b.credits)}</b></dd>
                </dl>
              </div>` : ''}
            <!-- « Ouvrir la fiche », sans répéter le nom : il est écrit juste
                 au-dessus. Le bouton portait celui du compte — « Immobilier »,
                 le libellé du type — ce qui donnait « Ouvrir Immobilier » sous
                 une carte déjà intitulée Immobilier. -->
            <button class="btn sm ghost" data-action="aller-fiche"
                    data-route="#/compte/${encodeURIComponent(b.c.id)}"
                    aria-label="Ouvrir la fiche de ${esc(b.l.libelle || nomCompteV2(b.c))}"
                    >${trad('Ouvrir la fiche →')}</button>
          </div>`;
        }).join('') || `<p class="empty">${trad('Aucun bien immobilier.')}</p>`,
        vue: 'accounts', ancre: '', cta: trad('Ouvrir Actifs'),
      };
    }

    {
      lignes = [];
      for (const c of comptesOuverts()) {
        for (const l of lignesDe(c)) {
          if (l.classe !== classe) continue;
          /* Une ligne de marché mène à sa propre fiche, pas au compte qui
             l'héberge : cliquer une ligne pour atterrir sur le compte qui la porte
             répondait à côté de la question posée. */
          const i = l.marche ? Store.state.positions.indexOf(l.marche) : -1;
          /* Le meme repli que dans la liste, et un separateur qui ne pend pas :
             un bien de valeur n'a pas d'etablissement, et la meta se terminait
             par un point median suivi de rien. */
          const nomL = nomLignePlacement(l, c);
          lignes.push({ label: nomL,
                        meta: sousNom(nomL, nomCompteV2(c), nomEtabDe(c)),
                        valeur: l.valeur,
                        ...(i >= 0 ? { ouvre: { action: 'open-position', i } }
                                   : { route: `#/compte/${encodeURIComponent(c.id)}` }) });
        }
      }
      lignes.sort((a, b) => b.valeur - a.valeur);
    }
    /* Les titres cotés se gèrent dans Marchés, pas dans Comptes : c'est là
       qu'on ajoute une ligne, qu'on corrige une quantité, qu'on relance les
       cours. Le bouton menait à Comptes pour toutes les classes, ce qui était
       juste pour un bien ou une part non cotée et faux pour un ETF. */
    const surMarche = classe === 'actions' || classe === 'obligations' || classe === 'crypto';
    /* Le sous-titre dit le compte, la note du total dit la part : les
       repeter tous les deux ne servait a rien. */
    return {
      titre: CLASSES_ACTIFS[classe] || classe,
      sous: `${lignes.length} placement${lignes.length > 1 ? 's' : ''}`,
      total, lignes,
      vue: surMarche ? 'positions' : 'accounts', ancre: '',
      cta: surMarche ? 'Ouvrir Marchés' : 'Ouvrir Actifs',
    };
  },

  /* Les placements derriere une ligne de cible, appelee depuis sa jauge.

     Le pourcentage annonce sa base, et cette base est celle des cibles — pas le
     patrimoine brut que la fenetre prend par defaut. Les deux existent, ils ne
     valent pas la meme chose : 13 558 EUR font 44,8 % de la base des cibles et
     20,1 % des avoirs. Ouvrir une jauge a 44,8 % pour lire « 20,1 % de vos
     avoirs » aurait donne trois chiffres pour la meme ligne sur deux ecrans,
     le defaut que cette application a deja corrige trois fois.

     La fiche n'est pas une carte d'analyse : c'est le chemin le plus court de
     « Actions core, +1 200 EUR a renforcer » vers la ligne qu'on va renforcer.
     Chaque intitule ouvre donc la fiche de la position, pas son compte. */
  cible: (cle) => ficheDeBarre(positionsDeCible(cle)),

  /* La barre de la carte « Core et satellites », qui compte un role entier.
     Meme fenetre, autre ensemble : le filtre est dans store.js et les deux
     partagent leur code, sinon ils finiraient par se contredire. */
  role: (role) => ficheDeBarre(positionsDeRole(role)),

  /* Le cash se saisit à la main et souvent : il est modifiable ici même. */
  /* Les liquidites en entier, poche par poche. Deux defauts d'un coup :

     Le titre etait « Argent disponible », un agregat de trois affectations sur
     quatre qui n'existe plus. La fiche s'appelle desormais comme le montant
     qu'elle porte, et chaque ligne dit sa poche dans son sous-titre.

     Et son total valait nowByGroup().cash, soit les quatre poches, alors que
     ses lignes excluaient le cash a investir : 5 126 EUR affiches au-dessus de
     3 270 EUR de lignes. Un total qui n'egale pas la somme de ses parts, la
     regle cardinale de ce projet. Les quatre poches sont la maintenant, et le
     total est la somme des lignes — pas un calcul parallele qui peut deriver. */
  /* Un argument facultatif restreint la fiche a une seule poche.

     « Cash disponible » et « Epargne de precaution » ouvraient tous deux cette
     fiche sans argument : on cliquait une ligne de 20 EUR et on obtenait les
     5 126 EUR de toutes les liquidites. Le total etait juste, la question posee
     n'etait pas celle a laquelle on repondait — et c'est le meme defaut que
     partout ailleurs, un intitule qui promet autre chose que ce qu'il compte.

     Sans argument, la fiche garde son role de vue d'ensemble : les quatre
     poches, chaque ligne disant la sienne. */
  cash: (poche) => {
    const cle = AFFECTATION_LABEL[poche] ? poche : null;
    const lignes = [];
    Store.state.comptes?.forEach((c, idxCompte) => {
      if (c.statut === 'archive') return;
      (c.cash || []).forEach((e, idxCash) => {
        if (cle && e.affectation !== cle) return;
        lignes.push({ label: nomCompteV2(c),
          /* Dans une fiche dediee a une poche, redire son nom sur chaque ligne
             ne renseigne personne : le titre le dit deja. */
          meta: [nomEtabDe(c), cle ? '' : AFFECTATION_LABEL[e.affectation]].filter(Boolean).join(' · '),
          valeur: num(e.montant), champ: `comptes.${idxCompte}.cash.${idxCash}.montant` });
      });
    });
    return {
      titre: cle ? AFFECTATION_LABEL[cle] : BASES.liquidites.nom,
      sous: cle
        ? `${trad('Les comptes qui portent cette poche.')} ${
            lignes.length ? trad('Modifiable directement ici') : trad('Aucun compte ne la porte pour l’instant')}`
        : trad('Modifiable directement, ces montants se saisissent à la main'),
      total: lignes.reduce((s, l) => s + l.valeur, 0), lignes,
      vue: 'accounts', ancre: '', cta: trad('Ouvrir Actifs'),
    };
  },

  /* La meme fiche de poche, ouverte depuis Objectifs.

     La page Objectifs compte en pourcentage de la base des cibles ; la fiche de
     poche, en pourcentage des avoirs. Cliquer une barre annoncant 12,0 % pour
     lire « 6,1 % de vos avoirs » donnait donc deux chiffres pour la meme ligne a
     un clic d'ecart. Aucun des deux n'etait faux, et c'est ce qui rend ce defaut
     tenace : il ne se voit pas, il se ressent comme une hesitation.

     Une seule chose change, la base du pourcentage. Le reste est repris tel
     quel — refaire la fiche aurait donne deux definitions de la meme poche a
     tenir d'accord, et c'est ainsi que naissent les divergences. */
  cashCible: (poche) => {
    const a = APERCUS.cash(poche);
    const base = rebalanceRows().base;
    return { ...a,
      totalNote: `${fmtPct(base ? a.total / base * 100 : 0, 1)} ${BASES.baseCibles.de}` };
  },

  objectif: () => {
    const g = objectiveStatus();
    const pj = objectiveProjection();
    const an = Store.state.meta.objectiveYear;
    const anCourante = new Date().getFullYear();
    /* Sans cible, la fenêtre ne calcule rien : il n'y a rien à calculer.

       Elle garde ses deux champs, qui sont la raison de l'ouvrir, et le
       patrimoine du jour, qui est le point de départ. Le reste attend d'avoir
       une cible à laquelle se comparer. C'est la règle du projet : un
       pourcentage n'existe que sur une base positive. */
    const sansCible = !(num(g.obj) > 0);
    return {
      titre: `${trad('Objectif à fin')} ${an}`,
      sous: sansCible ? trad('aucune cible fixée') : `${fmtPct(g.pct, 1)} ${trad('atteint')}`,
      total: g.total,
      totalNote: sansCible ? trad('ton patrimoine aujourd’hui') : `${trad('sur.objectif', 'sur')} ${fmtEUR0(g.obj)}`,
      lignes: sansCible ? [] : [
        { label: trad('Il te manque'), meta: `${trad('d’ici fin')} ${an}`, valeur: Math.max(0, -g.remaining) },
        { label: trad('Rythme nécessaire'), meta: `${pj.monthsLeft} ${pj.monthsLeft > 1 ? trad('mois restants') : trad('mois restant')}`, valeur: pj.needed },
        { label: trad('Ton rythme observé'), meta: trad('moyenne mensuelle'), valeur: pj.paceRate },
        { label: `${trad('Fin')} ${an} ${trad('à ce rythme')}`, meta: pj.onTrackPace ? trad('objectif atteint') : trad('sous l’objectif'), valeur: pj.atPace },
      ],
      champs: [
        { label: `${trad('Montant visé pour fin')} ${an} (€)`, path: 'meta.objective', step: 500 },
        /* Trente ans d'horizon, pas soixante-quinze. La liste allait jusqu'a
           2100 : elle faisait defiler des dizaines d'annees que personne ne
           choisit pour un objectif de patrimoine, et sur telephone il fallait
           traverser tout ca pour atteindre les seules utiles, les premieres.
           Un objectif plus lointain se pose en avancant. */
        { label: trad('Objectif à fin…'), path: 'meta.objectiveYear',
          options: Array.from({ length: 31 }, (_, i) => {
            const y = anCourante + i;
            return [y, `${trad('fin')} ${y}${i ? `, ${trad('dans')} ${i} ${i > 1 ? trad('ans') : trad('an')}` : `, ${trad('cette année')}`}`];
          }) },
      ],
      vue: 'history', ancre: '', cta: trad('Voir les relevés'),
    };
  },

  /* Le recu chiffre de la carte de composition, a l'horizon courant : memes
     libelles, memes parts, et la somme des parts fait le total affiche.

     Le selecteur d'horizon qui vivait ici est parti. Cette fiche est une
     consultation, et son selecteur ecrivait meta.projHorizon, le reglage de la
     page entiere : on venait regarder « et a 40 ans ? », on fermait, et la
     page restait sur 40 ans sans qu'on l'ait decide — c'est arrive pour de
     vrai. L'horizon se regle dans l'en-tete de la premiere carte, et
     l'exploration d'un autre horizon a son outil dedie, la ligne libre du
     tableau « Par horizon », qui compare cote a cote sans rien persister. */
  horizon: () => {
    const s = projectionSettings();
    const p = capitalisation({ years: projHorizon });
    const j = p.points[p.points.length - 1];
    const aujourdhui = new Date();
    const date = new Date(aujourdhui.getFullYear() + projHorizon, aujourdhui.getMonth(), aujourdhui.getDate());
    const plat = num(p.plat);
    const base = p.poches.marche + p.poches.autres;
    const verses = Math.max(0, j.contributed - base - plat);
    return {
      titre: `${trad('Projection à')} ${projHorizon} ${trad('ans')}`,
      sous: `${trad('au')} ${fmtDate(date.toISOString().slice(0, 10))}${trad(', même période de l’année qu’aujourd’hui')}`,
      total: j.total,
      totalNote: `${trad('dont')} ${fmtEUR0(j.gains)} ${trad('de rendement')}`,
      lignes: [
        { label: trad('Ce que tu as déjà'), meta: trad('aujourd’hui, hors immobilier'), valeur: base },
        ...(plat ? [{ label: plat > 0 ? trad('Ton immobilier net') : trad('Tes crédits'),
                      meta: A_PLAT, valeur: plat }] : []),
        { label: trad('Ce que tu verses'),
          meta: `${fmtEUR0(s.monthly)} × ${projHorizon * 12} ${trad('mois')}`, valeur: verses },
        /* « Rendement des autres actifs » nommait une poche qui n'existe plus
           depuis que le non cote et les liquidites ont chacun le leur : ce
           montant est celui du seul non cote, les liquidites ne produisant
           rien. Et quand le non cote est a zero, le taux affiche a cote de
           « Ce que le rendement ajoute » est celui du marche seul — le dire
           evite de le lire comme un rendement moyen du patrimoine. */
        ...(num(s.rateAutres) ? [
          { label: trad('Rendement des actifs de marché'),
            meta: `${fmtPct(s.rate, 1)} ${trad('par an')}`, valeur: num(j.gainsMarche) },
          { label: trad('Rendement du non coté'),
            meta: `${fmtPct(s.rateAutres, 1)} ${trad('par an')}`, valeur: num(j.gainsAutres) },
        ] : [
          { label: trad('Ce que le rendement ajoute'),
            meta: `${fmtPct(s.rate, 1)} ${trad('par an sur tes actifs de marché')}`, valeur: j.gains },
        ]),
        { label: trad('Après inflation'), meta: `${fmtPct(s.inflation, 1)} ${trad('par an retirée, en euros d’aujourd’hui')}`, valeur: j.real },
      ],
      vue: 'objective', ancre: '', cta: trad('Voir la trajectoire'),
    };
  },

  bourse: () => {
    const lignes = Store.state.positions.map(p => ({
      label: p.name, meta: `${ACC[p.account]?.short || ''} · ${ASSET_CLASSES[assetClassDe(p)]}`,
      valeur: posValue(p), perf: posPerfPct(p),
    }));
    // liquidités et levier de la poche bourse, en plus des lignes de titres
    for (const a of accountsWhere(x => x.group === 'bourse' && !x.holdings)) {
      if (nowValue(a.id)) lignes.push({ label: a.label, meta: 'liquidités', valeur: nowValue(a.id) });
    }
    return {
      titre: trad('Bourse'), sous: `${Store.state.positions.length} ${trad('lignes de titres et liquidités')}`,
      total: nowByGroup().bourse, lignes: lignes.sort((a, b) => b.valeur - a.valeur),
      vue: 'positions', ancre: 'jour', cta: trad('Voir les marchés'),
    };
  },

  /* --- Allocation ------------------------------------------------------ */
  patrimoineTotal: () => ({
    titre: trad('Patrimoine total'), sous: trad('Toutes poches confondues'),
    total: nowTotals().total,
    lignes: allocationByAsset().map(l => ({ label: l.label, meta: fmtPct(l.pct, 1), valeur: l.value })),
    vue: 'accounts', ancre: '', cta: trad('Voir les avoirs'),
  }),
  /* La base qui capitalise, ouverte par « Ce que tu as deja ». Cette barre
     affichait 30 000 EUR et ouvrait « Patrimoine total », qui en montrait
     160 000 : le clic contredisait la ligne cliquee. Ici la somme des lignes
     fait exactement la barre, et chaque ligne porte le taux qui lui est
     applique — c'est la reponse a « qu'est-ce qui capitalise, et a combien ? »,
     posee la ou on se la pose. */
  /* Les trois poches, et le taux que la projection applique vraiment a chacune.

     La cause est celle que ce projet corrige sans arret : deux listes du meme
     fait, dont une seule est tenue a jour. Les lignes se derivent donc des
     poches, et le libelle de chacune est celui de son reglage dans « Tes
     hypotheses » — trois noms, trois taux, aucun endroit ou l'un puisse
     contredire l'autre. « Cash a investir » disparait comme ligne : il est dans
     les liquidites, il subit leur sort, et lui garder une ligne a part laissait
     croire qu'il en avait un autre. */
  baseProjection: () => {
    const t = nowTotals();
    const s = projectionSettings();
    const q = pochesProjection(t);
    const tauxM = `${fmtPct(s.rate)} ${trad('par an')}`;
    const tauxNC = num(s.rateAutres) ? `${fmtPct(s.rateAutres)} ${trad('par an')}` : A_PLAT;
    return {
      titre: trad('Ce que tu as déjà'),
      sous: trad('La base de la projection') + (num(t.immo) ? trad(', ton immobilier à part') : ''),
      total: q.marche + q.autres,
      totalNote: trad('chaque ligne porte le taux qui lui est appliqué'),
      lignes: [
        { label: trad('Actifs de marché'), meta: tauxM, valeur: num(t.bourse) },
        { label: trad('Cryptomonnaies'), meta: tauxM, valeur: num(t.crypto) },
        { label: trad('Non coté'), meta: tauxNC, valeur: q.nonCote },
        { label: trad('Liquidités'), meta: A_PLAT, valeur: q.liquidites },
      ].filter(l => Math.abs(l.valeur) > 0.005),
      vue: 'accounts', ancre: '', cta: trad('Voir les avoirs'),
    };
  },

  /* La part que la projection porte a plat : la valeur des biens, moins tout le
     capital restant du. La brique « Ton immobilier, a plat » ouvrait
     « Patrimoine total », qui deballe les cinq poches alors qu'elle n'en
     designe qu'une : on cliquait sur une ligne et on obtenait la page entiere.

     Les lignes sont les vraies parts, un bien par ligne et un pret par ligne en
     negatif, donc leur somme fait le total affiche. C'est la regle du projet, et
     ici elle sert a quelque chose de concret : on voit d'ou vient le net. */
  immobilierNet: () => {
    const lignes = [];
    for (const c of (Store.state.comptes || [])) {
      if (c.statut === 'archive') continue;
      for (const l of (c.lignes || [])) {
        /* Les biens de valeur vivent ici avec l'immobilier : partPlate() les
           compte ensemble, et cette fiche doit faire son total ligne a ligne.
           Une montre a 10 000 EUR comptee dans le total sans ligne en face
           aurait ete exactement le defaut qu'on repare. */
        if (!['immobilier', 'bienValeur'].includes(l.classe || 'immobilier')
            || !num(l.valeur)) continue;
        lignes.push({ label: l.libelle || c.libelle, meta: trad('valeur estimée'),
                      valeur: num(l.valeur) });
      }
    }
    for (const e of (ETABS() || [])) {
      for (const d of (e.dettes || [])) {
        if (!num(d.montant)) continue;
        lignes.push({ label: d.libelle || 'Crédit',
                      meta: `${trad('capital restant dû')} · ${e.nom}`, valeur: -num(d.montant) });
      }
    }
    const plat = partPlate();
    const aUnBien = lignes.some(l => l.valeur > 0);
    const aImmo = num(nowTotals().immo) > 0.005, aBiens = num(nowTotals().biens) > 0.005;
    return {
      titre: !aUnBien ? trad('Tes crédits')
           : aImmo && aBiens ? trad('Ton immobilier et tes biens, nets')
           : aBiens ? trad('Tes biens de valeur, nets') : trad('Ton immobilier net'),
      sous: trad('Ce que la projection porte à plat'),
      total: plat,
      totalNote: trad('Aucun rendement ne lui est appliqué'),
      lignes,
      vue: 'accounts', ancre: '', cta: trad('Voir les avoirs'),
    };
  },
  investiTotal: () => ({
    titre: BASES.place.nom, sous: trad('Tout sauf le cash de vie'),
    total: nowTotals().invested,
    totalNote: `${fmtPct(nowTotals().total ? nowTotals().invested / nowTotals().total * 100 : 0)} ${trad('du patrimoine')}`,
    lignes: allocationByAccount().map(l => ({ label: l.label, meta: fmtPct(l.pct, 1), valeur: l.value })),
    vue: 'accounts', ancre: '', cta: trad('Voir les avoirs'),
  }),

  /* --- Rééquilibrage --------------------------------------------------- */
  /* Les lignes de cibles, tresorerie comprise quand elle est suivie. Cinq
     endroits lisaient `[...r.classes, r.cash]` en supposant `r.cash` toujours
     present : le jour ou la tresorerie a pu se retirer, la page tombait sur un
     `null.delta`. Un seul passage, donc un seul endroit ou se tromper. */
  portefeuilleBoursier: () => {
    const r = rebalanceRows();
    return {
      titre: trad('Comptes d’investissement'), sous: trad('Base de calcul du rééquilibrage'),
      total: r.base,
      lignes: lignesAvecTresorerie(r).map(c => ({
        label: c.label, meta: `${fmtPct(c.pct, 1)} · cible ${fmtPct(c.targetPct, 0)}`, valeur: c.value })),
      vue: 'rebalance', ancre: '', cta: trad('Voir les cibles'),
    };
  },
  ecartCible: () => {
    const r = rebalanceRows();
    return {
      titre: trad('Écarts à la cible'), sous: trad('Ce qu’il faudrait déployer (+) ou alléger (−)'),
      total: r.base, totalNote: trad('comptes d’investissement'),
      lignes: lignesAvecTresorerie(r).map(c => ({
        label: c.label, meta: `${fmtEUR0(c.value)} ${trad('pour')} ${fmtEUR0(c.targetVal)} ${trad('visés')}`, valeur: c.delta })),
      vue: 'rebalance', ancre: '', cta: trad('Ajuster'),
    };
  },

  /* --- Budget ---------------------------------------------------------- */
  depensesAnnee: () => {
    const an = budgetAnnee();
    const st = expenseYearStats(an);
    return {
      titre: `${trad('Dépenses')} ${an}`, sous: `${st.months} ${st.months > 1 ? trad('mois renseignés') : trad('mois renseigné')}`,
      total: st.total, totalNote: `${fmtEUR0(st.average)} ${trad('par mois en moyenne')}`,
      lignes: expenseSeries(an).filter(r => r.total).reverse()
        .map(r => ({ label: r.label, meta: r.note ? String(r.note).slice(0, 60) : '', valeur: r.total })),
      vue: 'budget', ancre: '', cta: trad('Voir le détail'),
    };
  },
  depensesCategories: () => {
    const an = budgetAnnee();
    const st = expenseYearStats(an);
    return {
      titre: trad('Moyenne mensuelle'), sous: `${trad('objectif')} ${fmtEUR0(budgetFrame().target)} ${trad('par mois')}`,
      total: st.average,
      totalNote: st.average > budgetFrame().target
        ? `${fmtEUR0(st.average - budgetFrame().target)} ${trad('au-dessus de l’objectif')}`
        : `${fmtEUR0(budgetFrame().target - st.average)} ${trad('sous l’objectif')}`,
      lignes: expenseByCategory(an).map(c => ({ label: c.label, meta: fmtPct(c.pct, 1), valeur: c.average })),
      vue: 'budget', ancre: '', cta: trad('Voir le détail'),
    };
  },

  /* Tous les postes fixes, avec leur part. La carte de l'onglet n'en montre que
     les six premiers et renvoyait au tableau du dessous pour le reste : un
     tableau de neuf colonnes repond mal a « lequel pese le plus », qui se lit
     d'un regard sur des barres et pas en comparant des nombres ligne a ligne.

     La barre EST le pourcentage : sa largeur vaut la part, pas le rapport au
     plus gros poste. La carte, elle, met le plus gros a pleine largeur — c'est
     lisible pour six lignes, mais ici la barre et le nombre seraient cote a
     cote, et une barre pleine en face de « 77 % » les ferait se contredire.
     Entre les deux, c'est le nombre qui a raison.

     La base est nommee sous le total, comme partout : ces pourcentages se
     rapportent au total mensuel des charges fixes, pas aux revenus. Trois ecrans
     ont deja donne trois parts differentes pour une meme ligne faute de le
     dire. */
  chargesFixes: () => {
    const postes = (Store.state.budget.fixedCharges || [])
      .map(c => ({ nom: c.label || 'Sans nom', v: chargeMensuelle(c),
                   periode: chargePeriode(c), facture: num(c.amount) }))
      .filter(x => x.v > 0)
      .sort((a, x) => x.v - a.v);
    const total = postes.reduce((s, x) => s + x.v, 0);
    return {
      titre: trad('Ce qui sort chaque mois'),
      sous: `${postes.length} ${postes.length > 1 ? trad('postes') : trad('poste')} · ${fmtEUR0(total * 12)} ${trad('sur douze mois')}`,
      total,
      totalNote: `${fmtPct(budgetFrame().fixedPct, 1)} ${trad('de tes revenus')}`,
      /*         Le total a l'annee etait deja en sous-titre — 29 332 EUR — mais poste par
         poste il fallait multiplier de tete, et c'est a cette echelle qu'on decide
         de garder un abonnement : 21 EUR par mois se lisent autrement a 252 EUR
         par an. Douze lignes de plus a l'ecran l'auraient dit en permanence pour
         un chiffre qu'on consulte une fois, d'ou la bulle.

         `data-aide` et rien d'autre : le survol, l'appui, le clavier et la
         fermeture au premier geste ailleurs y sont deja, et depuis que ces
         ecouteurs sont delegues ils atteignent l'interieur d'une fenetre. C'est
         ce qui rend cette demande gratuite.

         La periodicite s'y ajoute quand elle n'est pas mensuelle : la ligne
         affiche un montant ramene au mois, qu'on ne retrouve sur aucune facture,
         et la bulle est le seul endroit qui puisse rapprocher les deux. */
      html: postes.length ? `<div class="flow">${postes.map(x => `
        <div class="flow-row" tabindex="0" role="button" data-aide="${esc(
          `${x.nom} : ${fmtEUR0(x.v * 12)} ${trad('sur douze mois')}${x.periode === 'mois' ? ''
            : `, ${trad('facturée')} ${CHARGE_PERIODE_LABEL[x.periode]} ${fmtEUR0(x.facture)}`}`)}">
          <span class="flow-label">${esc(x.nom)}</span>
          <div class="flow-bar"><div style="width:${Math.max(1.5, total ? x.v / total * 100 : 0).toFixed(1)}%;
            background:var(--degrade-budget)"></div></div>
          <b class="flow-val">${fmtEUR0(x.v)}</b>
          <span class="flow-pct">${fmtPct(total ? x.v / total * 100 : 0, 1)}</span>
        </div>`).join('')}</div>
        <p class="small muted" style="margin:12px 0 0">${trad('Touche une ligne pour voir '
          + 'ce qu’elle coûte sur douze mois. Les parts se rapportent aux')}
          ${fmtEUR0(total)} ${trad('qui sortent chaque mois.')}</p>`
        : `<p class="empty" style="margin:0">${trad('Aucune charge fixe déclarée.')}</p>`,
      vue: 'budget', ancre: 'charges', cta: trad('Modifier les charges'),
    };
  },

  /* --- Performance ----------------------------------------------------- */
  /* Le detail d'une vente.

     Ce que trois tuiles disaient pour toute la page — produit encaisse, prix de
     revient cede, taux de reussite — appartient a chaque vente : ce sont des
     faits de celle-la, pas des totaux d'ecran. Deux d'entre eux se relisaient
     deja en tete de page, ou la plus-value encaissee porte son pourcentage et son
     compte de ventes gagnantes.

     Le panneau porte aussi l'annulation, qui vivait au bout d'une ligne de
     tableau. Ici le geste a la place de dire ce qu'il emporte, et il n'est plus a
     portee de pouce de la lecture.

     `ventesRealisees` a disparu avec la tuile qui l'ouvrait : une fonction sans
     appelant est la moitie qu'on oublie en retirant un affichage. */
  vente: (i) => {
    const idx = Number(i);
    const v = (Store.state.sales || [])[idx];
    if (!v) return null;
    const dev = v.currency || 'EUR';
    const pct = num(v.invested) ? num(v.realised) / num(v.invested) * 100 : null;
    const depuis = v.account ? (ACC[v.account]?.label || '') : '';
    const vers = v.cashAccount ? (ACC[v.cashAccount]?.label || '') : '';
    return {
      titre: v.name || trad('Vente'),
      sous: [fmtDate(v.date), v.declaree ? trad('déclarée, pour mémoire') : '']
            .filter(Boolean).join(' · '),
      total: num(v.realised),
      totalNote: pct == null ? trad('prix de revient non renseigné')
        : `${fmtSignedPct(pct)} ${trad('sur.investis', 'sur')} ${fmtEUR0(v.invested)} ${trad('investis')}`,
      /* Une vente declaree n'a ni quantite ni prix : ces trois lignes se taisent
         plutot que d'ecrire des zeros qui se liraient comme une saisie amputee. */
      html: `
        <dl class="kv">
          ${v.declaree ? '' : `
          <dt>${trad('Quantité vendue')}</dt><dd>${num(v.qty)}</dd>
          <dt>${trad('Prix de vente')}</dt><dd>${fmtCurEur(v.price, dev, v.fxSell)}</dd>
          <dt>${trad('Prix de revient unitaire')}</dt><dd>${fmtCurEur(v.buyPrice, dev, v.fxBuy)}</dd>`}
          <dt>${trad('Produit encaissé')}</dt><dd>${fmtEUR(num(v.gross))}</dd>
          <dt>${trad('Prix de revient vendu')}</dt><dd>${fmtEUR(num(v.invested))}</dd>
          <dt>${trad('Plus-value')}</dt>
            <dd class="${cls(v.realised)}"><b>${fmtSigned(v.realised)}</b></dd>
          ${depuis ? `<dt>${trad('Ligne vendue sur')}</dt><dd>${esc(depuis)}</dd>` : ''}
          ${vers ? `<dt>${trad('Encaissé sur')}</dt><dd>${esc(vers)}</dd>` : ''}
          ${v.note ? `<dt>Note</dt><dd>${esc(v.note)}</dd>` : ''}
        </dl>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" data-action="edit-sale" data-i="${idx}">${trad('Modifier')}</button>
          <button class="btn ghost sm" data-action="del-sale" data-i="${idx}">${
            v.declaree ? trad('Retirer du journal') : trad('Annuler cette vente')}</button>
        </div>`,
      vue: 'performance', ancre: 'ventes', cta: trad('Rester ici'),
    };
  },

  /* --- Performance ----------------------------------------------------- */
  perfLatente: () => {
    const lat = latentPnl();
    return {
      titre: trad('Plus-value latente'), sous: `${lat.winners} ${trad('lignes en gain sur')} ${lat.count}`,
      /* Sans prix de revient saisi, il n'y a pas de base : la note se contente
         alors de nommer ce qui manque, plutot que d'annoncer 0,00 %. */
      total: lat.pnl, totalNote: lat.pct == null
        ? trad('prix de revient non renseigné')
        : `${fmtSignedPct(lat.pct)} ${trad('sur.investis', 'sur')} ${fmtEUR0(lat.invested)} ${trad('investis')}`,
      lignes: Store.state.positions
        .map(p => ({ label: p.name, meta: `${ACC[p.account]?.short || ''} · ${ASSET_CLASSES[assetClassDe(p)]}`,
                     valeur: posPerfEur(p), perf: posPerfPct(p) }))
        .sort((a, b) => b.valeur - a.valeur),
      vue: 'positions', ancre: 'titres', cta: trad('Voir les lignes'),
    };
  },
  /* La plage se passe en argument. La tuile parle depuis le debut, la carte des
     ventes suit le selecteur : un apercu qui deciderait seul de sa borne
     mentirait a l'une des deux. Le titre ne bouge pas, la borne va dans le
     sous-titre, ou elle se lit avec ce qu'elle qualifie. */
  perfRealisee: (range) => {
    const r = range || salesRange;
    const st = salesStats(r);
    return {
      titre: trad('Plus-value encaissée'),
      /* Sans une seule vente, la borne n'a rien a qualifier : « depuis le debut,
         aucune vente sur la periode » dit deux fois la meme absence, et la
         seconde moitie nomme une periode qui est tout le temps. */
      sous: !st.count
        ? (r === 'all' ? trad('aucune vente encore')
                       : `${rangeLabel(r)} · ${trad('aucune vente sur la période')}`)
        : [r === 'all' ? trad('depuis le début') : rangeLabel(r),
           `${st.wins} ${st.wins > 1 ? trad('ventes gagnantes sur') : trad('vente gagnante sur')} ${st.count}`
          ].join(' · '),
      total: st.realised, totalNote: `${fmtEUR0(st.gross)} ${trad('encaissés')}`,
      lignes: st.sales.map(v => ({ label: v.name, meta: fmtDate(v.date), valeur: v.realised })),
      vue: 'performance', ancre: 'ventes', cta: trad('Voir le journal'),
    };
  },
  perfTotale: () => {
    const lat = latentPnl(), tout = salesStats('all');
    /* « Depuis le debut » ne datait rien, et le grand chiffre n'avait aucune
       heure. Chaque part porte donc la date de ce qui la fixe : un cours pour le
       latent, les ventes elles-memes pour l'encaisse. Aucune des deux n'est
       devinee — l'une vient de la place, l'autre du journal. */
    const jours = (tout.sales || []).map(v => String(v.date || '')).filter(Boolean).sort();
    const bornes = !jours.length ? ''
      : jours[0] === jours[jours.length - 1] ? fmtDate(jours[0])
      : `${trad('de')} ${fmtDate(jours[0])} ${trad('à')} ${fmtDate(jours[jours.length - 1])}`;
    return {
      titre: trad('Résultat de tes positions'), sous: trad('Latent et encaissé depuis le début'),
      total: lat.pnl + tout.realised,
      lignes: [
        { label: trad('Plus-value latente'),
          meta: [`${lat.count} ${lat.count > 1 ? trad('lignes détenues') : trad('ligne détenue')}`,
                 coursAsOf() ? `${trad('cours')} ${fmtCoursQuand(coursAsOf())}` : '']
                .filter(Boolean).join(' · '),
          valeur: lat.pnl },
        { label: trad('Plus-value encaissée'),
          meta: [`${tout.count} ${tout.count > 1 ? trad('ventes') : trad('vente')}`, bornes]
                .filter(Boolean).join(' · '),
          valeur: tout.realised },
      ],
      vue: 'performance', ancre: '', cta: trad('Rester ici'),
    };
  },

  /* --- Budget : les mois par rapport à l'objectif -----------------------
     Une fiche par tuile, et non plus une liste commune : « Mois sous
     objectif » et « Mois dépassés » ouvraient le meme melange, ou il fallait
     retrouver soi-meme les mois de sa couleur — et qui comptait le mois en
     cours vide comme « sous l'objectif », puisqu'elle refaisait son propre
     filtre au lieu de prendre celui des tuiles. Les listes viennent
     d'expenseYearStats : ce que la tuile compte, la fiche le liste, par
     construction. */
  moisObjectif: (sens) => {
    const an = budgetAnnee();
    const stats = expenseYearStats(an);
    const cible = budgetFrame().target;
    const sous = sens !== 'sur';
    const rows = sous ? stats.sousObjectif : stats.surObjectif;
    return {
      titre: `${sous ? trad('Mois sous l’objectif') : trad('Mois au-dessus de l’objectif')} · ${an}`,
      sous: `${trad('objectif')} ${fmtEUR0(cible)} ${trad('par mois')}`
        + (stats.moisEnCoursExclu ? ` · ${trad('le mois en cours, incomplet, est écarté')}` : ''),
      total: rows.reduce((s, r) => s + r.total, 0),
      totalNote: `${rows.length} ${trad('mois')}`,
      /* La note du mois se lit ici. « 2 400 € au-dessus » sans sa raison
         n'apprend rien : c'est le commentaire saisi dans le détail mensuel qui
         dit s'il s'agit d'un déménagement ou d'un mois qui a dérapé. */
      lignes: rows.slice().reverse().map(r => ({
        label: r.label,
        meta: [sous ? `${fmtEUR0(cible - r.total)} ${trad('de marge')}`
                    : `${fmtEUR0(r.total - cible)} ${trad('au-dessus')}`,
               r.note || ''].filter(Boolean).join(' · '),
        valeur: r.total })),
      vue: 'budget', ancre: '', cta: trad('Voir le détail'),
    };
  },

  /* --- Objectif -------------------------------------------------------- */
  /*    L'aperçu « pouvoir d'achat » vivait ici. La colonne des euros constants
   reste dans le tableau « Par horizon », qui porte la même information sans
   détour.*/

  /* --- un repere de la barre de marches ---------------------------------
     La fiche d'un indice : sa valeur, sa veille, sa seance — et, quand le
     repere touche le portefeuille, le pont est fait : l'EUR/USD pese sur les
     lignes en dollars, l'or sur la poche metaux, le bitcoin sur la poche
     crypto. Un indice boursier ne pretend rien de personnel : sans lien
     honnete, pas de ligne inventee. */
  repere: (sym) => {
    const l = REPERES_AFFICHES.find(x => x.symbole === sym);
    if (!l) return null;
    const dec = l.prix < 10 ? 4 : 2;
    const nb = v => new Intl.NumberFormat(locale(),
      { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
    const estIndice = String(l.symbole || '').startsWith('^');
    const unite = uniteRepere(l);
    const m = marketStatus(l);
    const delta = l.prix - l.veille;

    const ponts = [];
    if (sym === 'EURUSD=X') {
      const usd = Store.state.positions.filter(p => (p.currency || 'EUR') === 'USD')
        .reduce((s, p) => s + posValue(p), 0);
      if (usd > 0.005) ponts.push(['Tes lignes en dollars', usd,
        'leur valeur en euros bouge avec cette parité']);
    }
    if (sym === 'GC=F') {
      const or = Store.state.positions.filter(p => assetClassDe(p) === 'metaux')
        .reduce((s, p) => s + posValue(p), 0);
      if (or > 0.005) ponts.push(['Ta poche métaux', or, 'suit le cours de l’or']);
    }
    if (sym === 'BTC-USD') {
      const cr = num(nowTotals().crypto);
      if (cr > 0.005) ponts.push(['Ta poche crypto', cr, 'suit le marché des cryptomonnaies']);
    }

    return {
      titre: l.nom,
      /* Le sous-titre disait « ^FCHI » : un identifiant technique, illisible,
         et qui n'apprend rien a qui vient de cliquer sur « CAC 40 ». Il dit
         desormais ce que la chose EST — un indice, une matiere premiere, une
         parite — et garde le symbole en second, pour qui le cherche. */
      /* Un indice se nomme, il ne s'identifie pas : « ^IXIC » derriere
         « Indice boursier » n'apprend rien a qui vient de cliquer sur
         « Nasdaq ». Le symbole reste pour ce qui se cote et s'achete, ou
         il sert a retrouver la ligne chez un courtier. */
      sous: estIndice ? 'Indice boursier' : l.symbole,
      totalTexte: `${nb(l.prix)}${unite}`,
      totalNote: m ? m.label : '',
      html: `<dl class="kv">
        <!-- Hors seance, l'ecart affiche serait celui de la veille : la fiche
             dit alors de quand date le cours, ce que la tuile n'a pas la place
             d'ecrire. Le delta se tait avec le pourcentage, il porte le meme
             mensonge en euros. -->
        <dt>${trad('Variation du jour')}</dt>
          <dd class="${l.pct == null ? 'muted' : cls(l.pct)}">${l.pct == null
            ? `${trad('hors séance')}${l.quoteTime ? ` · ${trad('cours')} ${esc(fmtCoursQuand(l.quoteTime))}` : ''}`
            : `${fmtSignedPct(l.pct, 2)} · ${delta >= 0 ? '+' : '−'}${nb(Math.abs(delta))}${unite}`}</dd>
        <dt>${trad('Clôture précédente')}</dt><dd>${nb(l.veille)}${unite}</dd>
        ${m ? `<dt>Séance</dt><dd>${glypheSeance(m)} ${esc(m.label)}</dd>` : ''}
        ${ponts.map(([t, v, note]) => `
          <dt>${esc(t)}<span class="sub">${esc(note)}</span></dt><dd><b>${fmtEUR(v)}</b></dd>`).join('')}
      </dl>`,
      vue: 'positions', ancre: '', cta: trad('Voir les marchés'),
    };
  },

  /* --- les quatre tuiles de Marchés ------------------------------------ */
  portefeuille: () => {
    const pnl = portfolioPnl();
    return {
      titre: trad('Valeur du portefeuille'), sous: `${Store.state.positions.length} ${trad('lignes de titres')}`,
      total: pnl.value, totalNote: pnl.pct == null
        ? trad('prix de revient non renseigné')
        : `${fmtSignedPct(pnl.pct)} ${trad('sur le prix de revient')}`,
      lignes: Store.state.positions
        .map(p => ({ label: p.name, meta: `${ACC[p.account]?.short || ''} · ${num(p.qty)} × ${fmtCur(p.price, p.currency)}`,
                     valeur: posValue(p), perf: posPerfPct(p) }))
        .sort((a, b) => b.valeur - a.valeur),
      vue: 'positions', ancre: 'titres', cta: trad('Voir les lignes'),
    };
  },

  investiTitres: () => ({
    titre: trad('Montant investi'), sous: trad('Ce que tes lignes t’ont coûté'),
    total: portfolioPnl().invested,
    totalNote: `${trad('pour')} ${fmtEUR0(portfolioPnl().value)} ${trad('de valeur actuelle')}`,
    lignes: Store.state.positions
      .map(p => ({ label: p.name, meta: `${num(p.qty)} × ${fmtCur(p.buyPrice, p.currency)} ${trad('à l’achat')}`,
                   valeur: posInvested(p) }))
      .sort((a, b) => b.valeur - a.valeur),
    vue: 'positions', ancre: 'titres', cta: trad('Voir les lignes'),
  }),

  pnlLatent: () => {
    const pnl = portfolioPnl();
    const j = dayPerformance();
    return {
      titre: trad('Plus / moins-value latente'),
      sous: [pnl.pct == null ? trad('prix de revient non renseigné') : fmtSignedPct(pnl.pct),
             j.lignes.length ? `${fmtSigned(j.eur)} ${trad('aujourd’hui')}` : trad('pas de cours du jour')].join(' · '),
      total: pnl.pnl, totalNote: `${trad('sur.investis', 'sur')} ${fmtEUR0(pnl.invested)} ${trad('investis')}`,
      lignes: Store.state.positions
        .map(p => ({ label: p.name, meta: `${ACC[p.account]?.short || ''} · ${ASSET_CLASSES[assetClassDe(p)]}`,
                     valeur: posPerfEur(p), perf: posPerfPct(p) }))
        .sort((a, b) => b.valeur - a.valeur),
      vue: 'performance', ancre: '', cta: trad('Voir la performance'),
    };
  },

  /* Les credits, montants modifiables.

     Le meme panneau que les liquidites, pour la meme raison : relever ses soldes
     est une passe, pas une fiche par fiche. On ouvre, on recopie ce que disent la
     banque et le courtier, on enregistre.

     Il ne remplace pas la fenetre d'un credit — celle-la porte le taux, la
     mensualite, le preteur, tout ce qui ne change qu'une fois. Ici il n'y a que le
     chiffre qui vieillit. Un seul champ, deux portes, comme partout ailleurs.

     Et l'enregistrement pose la date de verification sur chaque credit : appuyer
     sur « Enregistrer » ici, c'est precisement dire « je les ai regardes », ce qui
     remet le rappel des trois mois a zero. Voir `apercu-enregistrer`. */
  credits: () => {
    const cr = creditsEnCours();
    const etabs = ETABS();
    return {
      titre: trad('Crédits en cours'),
      sous: cr.lignes.length
        ? `${cr.lignes.length} ${cr.lignes.length > 1 ? trad('crédits') : trad('crédit')} · ${trad('modifiable ici même')}`
        : trad('aucun crédit'),
      totalTexte: `−${fmtEUR(cr.reste)}`,
      total: cr.reste,
      totalNote: `${trad('à retrancher de')} ${fmtEUR0(patrimoine().brut)} ${trad('d’avoirs')}`,
      lignes: cr.lignes.map(c => ({
        label: c.libelle,
        /* L'intitule ouvre la fiche complete : taux, mensualite, preteur, capital
           emprunte. Ce panneau ne porte que le solde ; le reste ne change qu'une
           fois, et il faut pouvoir y aller sans passer par la page Comptes. */
        ouvre: { action: 'editer-credit', donnees: { etab: c.etabId, i: c.index } },
        /* La date de solde figure ici comme sur la fiche du bien : le meme fait
           lu au meme endroit du modele, jamais recalcule a cote. */
        meta: [c.etabNom, c.preteur, c.taux ? `${fmtNombre(c.taux)} % ${trad('l’an')}` : '',
               c.mensualite ? `${fmtEUR0(c.mensualite)} ${trad('par mois')}` : '',
               c.fin ? `${trad('soldé')} ${fmtMoisAn(c.fin.finLe)}` : ''].filter(Boolean).join(' · '),
        /* Le chemin d'ecriture passe par l'index de l'etablissement et celui de la
           dette chez lui : c'est le meme couple que la fenetre d'edition, et le
           tri par montant de la liste ne le decale pas. */
        champ: `etabs.${etabs.findIndex(e => e.id === c.etabId)}.dettes.${c.index}.montant`,
        valeur: c.reste,
      })),
    };
  },

  /* L'ecart du jour, ligne par ligne.
     La carte du portefeuille vit dans l'onglet « Aujourd'hui » et n'y montrait
     que des cumuls : la valeur, le prix de revient, la plus-value depuis
     l'achat. Ce qui a bouge aujourd'hui n'y etait pas, alors que c'est le seul
     chiffre que cet onglet promet.

     Un titre qui n'a pas cote ne fait pas « 0 EUR de variation » : il ne dit
     rien, et l'annoncer a plat ferait croire a une seance atone. Deux manques
     distincts en decoulent, et ils se comptent separement — les lignes sans
     cloture de reference sortent de la liste, celles dont notre cours date
     d'avant minuit y restent avec un ecart nul, donc en le declarant. */
  jourTitres: () => {
    const j = dayPerformance();
    return {
      titre: trad('Aujourd’hui'),
      /* L'heure fait partie du chiffre : un ecart du jour a 11 h et le meme a la
         cloture ne disent pas la meme chose, et l'un des deux va encore bouger.

         C'est l'heure du MARCHE, pas celle de la requete. La ligne disait
         « cours de 16:15 » parce qu'on avait interroge la passerelle a 16:15 —
         alors que les prix recus dataient de la veille 22:00. Une heure fraiche
         collee a une donnee vieille est pire que pas d'heure du tout : elle
         certifie ce qu'elle devrait mettre en doute. */
      sous: j.lignes.length
        ? [`${j.hausse} ${trad('en hausse')}`, `${j.baisse} ${trad('en baisse')}`,
           j.sansDonnee ? `${j.sansDonnee} ${trad('sans cours de veille')}` : '',
           j.horsSeance ? `${j.horsSeance} ${trad('sans cours du jour')}` : '',
           j.asOfMarche ? `${trad('cours')} ${fmtCoursQuand(j.asOfMarche)}` : ''].filter(Boolean).join(' · ')
        : trad('pas de clôture de veille en mémoire'),
      total: j.eur,
      /* Le total ne se commente pas de la meme façon quand rien n'a cote : « sur
         la cloture precedente » promet une comparaison qui n'a pas eu lieu. */
      totalNote: j.toutHorsSeance
        ? trad('aucune de tes lignes n’a coté depuis minuit')
        : `${fmtSignedPct(j.pct)} ${trad('sur la clôture précédente')}`,
      lignes: j.lignes.map(l => ({
        label: l.name,
        meta: [l.exchange || l.symbol, l.market?.label,
               l.horsSeance ? (l.quoteTime ? `${trad('cours')} ${fmtCoursQuand(l.quoteTime)}`
                                           : trad('pas coté aujourd’hui')) : ''].filter(Boolean).join(' · '),
        valeur: l.eur, perf: l.pct,
      })),
      vue: 'positions', ancre: 'jour', cta: trad('Voir la séance'),
    };
  },

  /* Les montants sont modifiables ici : c'est la question qu'on se pose en
     ouvrant cette tuile — combien me reste-t-il à placer, et où. */
  cashInvestir: () => ({
    titre: BASES.cashPlacer.nom, sous: trad('Liquidités posées chez tes courtiers'),
    total: stockTotals().cashToInvest,
    totalNote: `${fmtPct(stockTotals().balance ? stockTotals().cashToInvest / stockTotals().balance * 100 : 0)} ${trad('du portefeuille')}`,
    lignes: entreesInvestir().map(({ compte, idxCompte, idxCash }) => ({
      label: nomCompteV2(compte),
      meta: [nomEtabDe(compte), trad(typeCompte(compte.type).label)].filter(Boolean).join(' · '),
      champ: `comptes.${idxCompte}.cash.${idxCash}.montant`,
    })),
    vue: 'accounts', ancre: '', cta: trad('Voir les comptes'),
  }),

  /* Les lignes suivent la CLASSE du total, pas le groupe d'ecran : le groupe
     `pe` rassemble aussi l'immobilier et les biens de valeur, et la fenetre
     listait donc des comptes pour bien plus que son total — un studio a
     120 000 EUR sous un titre qui annonce le non cote. La valeur par compte
     est celle de ses lignes non cotees seulement, et la somme des parts
     refait le total. */
  /* L'ecart du non cote se lit ici, et nulle part ailleurs.

     Pas dans Marchés › Performance : cette page-la ne suit que ce dont le cours
     arrive tout seul, elle le dit elle-meme dans son ecran vide, et y ramener le
     non cote serait le remettre exactement d'ou l'application a mis du temps a le
     sortir. Pas dans une carte de plus non plus : le panneau existe deja, il
     s'ouvre depuis l'accueil, et il montrait des valeurs sans jamais dire ce
     qu'elles avaient coute.

     Aucun total commun avec les titres cotes, jamais. Une plus-value cotee est
     constatee — un cours l'a fixee — quand celle-ci est declaree par son
     detenteur. Les additionner rendrait une performance dont une part est une
     opinion, sans que rien ne le signale. Le sous-titre nomme donc la nature du
     chiffre, et la note du total sa base. */
  pe: () => {
    const nc = latentNonCote();
    const lignes = nc.lignes.filter(l => l.classe === 'nonCote');
    const value = lignes.reduce((s, l) => s + l.value, 0);
    const invested = lignes.reduce((s, l) => s + l.invested, 0);
    const pnl = value - invested;
    const vieilles = lignes.filter(l => l.vieille).length;
    return {
      titre: trad('Placements non cotés'),
      /* La nature avant la liquidite : c'est elle qui explique pourquoi l'ecart
         ci-dessous n'est pas une performance de marche. Le rappel de revue s'y
         ajoute plutot que dans un champ que le composant ne rend pas — la cloche
         le porte deja a un an, ici il ne fait que se voir au bon moment. */
      sous: [trad('valeurs que tu déclares, pas des cours'),
             vieilles ? `${vieilles} ${vieilles > 1 ? trad('à revoir') : trad('à revoir')}`
                      : trad('pas mobilisables à court terme')].join(' · '),
      total: nowByGroup().pe,
      /* Un pourcentage dit sa base : ici le montant investi, et rien d'autre.
         Sans prix de revient saisi, il n'y a pas d'ecart a dire — la note se
         contente alors du total. */
      totalNote: invested > 0
        ? `${fmtEUR0(invested)} ${trad('investis')} · ${trad('écart')} ${fmtSigned(pnl)} (${
            fmtSignedPct(pnl / invested * 100, 1)})`
        : trad('prix de revient non renseigné'),
      lignes: lignes.map(l => ({
        label: l.nom,
        meta: [sousNom(l.nom, nomCompteV2(l.compte), nomEtabDe(l.compte)),
               /* L'age de la valeur fait partie du chiffre : une estimation d'il
                  y a trois ans ne vaut pas celle d'hier, et c'est la seule
                  difference qu'une valeur declaree puisse honnetement montrer. */
               l.estimeLe ? `${trad('estimé')} ${fmtDate(l.estimeLe)}`
                          : trad('jamais estimé')].filter(Boolean).join(' · '),
        valeur: l.value,
        perf: l.invested > 0 ? l.pct : null,
        route: `#/compte/${encodeURIComponent(l.compteId)}`,
      })),
      vue: 'accounts', ancre: '', cta: trad('Ouvrir Actifs'),
    };
  },

  investi: () => ({
    titre: BASES.place.nom,
    sous: trad('Réparti par enveloppe'),
    total: nowTotals().invested,
    lignes: allocationByAccount().filter(r => r.value)
      .map(r => ({ label: r.label, meta: fmtPct(r.pct, 1), valeur: r.value })),
    vue: 'allocation', ancre: 'actifs', cta: trad('Voir l\'allocation'),
  }),
};

let apercuOuvert = null;
let apercuArg = null;

/* Appliquer les champs d'un bloc differe : la meme fonction que l'ecriture a la
   frappe, appelee une fois pour toutes au clic sur « Enregistrer ».

   Elle vit ici, en un seul endroit, parce que deux fenetres s'en servent — la
   fiche d'une ligne de titres et les panneaux d'apercu — et qu'un second
   exemplaire finirait par oublier un cas. Le bloc redevient propre : fermer
   ensuite ne demande plus rien. */
/* Le libelle du bouton dit ce que le clic va faire, pas l'etat courant.

   Il se recalcule apres chaque geste, celui d'un groupe seul comme celui de
   tous : replier le dernier groupe ouvert a la main doit retourner le bouton,
   sinon il proposerait de replier ce qui l'est deja. */
function majBoutonLiqTout(fenetre) {
  const btn = fenetre && $('[data-action="liq-plier-tout"]', fenetre);
  if (!btn) return;
  const reste = $$('.liq-groupe .cpt-pli', fenetre).some(p => p.classList.contains('ouvert'));
  btn.textContent = reste ? trad('Tout replier') : trad('Tout déplier');
  btn.setAttribute('aria-expanded', String(reste));
}

function appliquerDiffere(bloc = $('#modalBody')) {
  if (!bloc) return false;
  $$('[data-path]', bloc).forEach(applyField);
  if (bloc.dataset.differe !== undefined) bloc.dataset.differe = 'propre';
  return true;
}

/* La note sous le grand total d'un apercu : ce que la ligne pese dans le brut,
   sauf si le panneau donne la sienne.

   Elle etait ecrite deux fois, a l'ouverture du panneau et a chaque mise a jour
   `live`. Deux copies d'une meme phrase finissent par diverger : celle-ci
   vouvoyait des deux cotes, et corriger le premier exemplaire seul aurait fait
   dire « vos avoirs » a l'ouverture et « tes avoirs » a la premiere frappe. */
const noteApercu = a => a.totalNote
  || `${fmtPct(patrimoine().brut ? a.total / patrimoine().brut * 100 : 0, 1)} ${trad('de tes avoirs')}`;

function openApercu(cle, arg) {
  const a = APERCUS[cle]?.(arg);
  if (!a) return;
  apercuOuvert = cle;
  apercuArg = arg;
  $('#modalTitle').textContent = a.titre;
  /*    escMontant, et non textContent : une quarantaine d'apercus composent leur
   sous-titre avec fmtEUR0(), qui rend l'oeil SVG en mode masque. Meme regime
   que les tuiles et les notifications : tout est echappe, seul notre fragment
   traverse. Corriger les producteurs un a un aurait refait le defaut au
   prochain apercu.*/
  /* `sousAction` : une commande de lecture posee au bout du sous-titre. Elle
     n'est pas echappee — c'est du balisage que le panneau fournit, comme `html`
     juste en dessous — et le sous-titre, lui, l'est toujours. */
  $('#modalSub').innerHTML = escMontant(a.sous) + (a.sousAction || '');
  $('#modalSub').classList.toggle('avec-action', !!a.sousAction);
  $('#modalBody').innerHTML = `
    <!-- totalTexte : un repere de marche se compte en points ou en dollars,
         fmtEUR aurait colle un « € » sur le S&P 500. -->
    <div class="modal-total"><b>${a.totalTexte || fmtEUR(a.total)}</b>
      <span>${escMontant(noteApercu(a))}</span></div>

    ${a.champs ? `<div class="modal-champs">${a.champs.map(c => `
      <div class="field">
        <label>${esc(c.label)}</label>
        ${c.options
          ? `<select data-path="${esc(c.path)}" data-type="num">${c.options.map(([v, l]) =>
              `<option value="${v}" ${String(v) === String(getPath(c.path)) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
          : `<input type="number" step="${c.step || 1}" data-path="${esc(c.path)}" value="${getPath(c.path) ?? ''}">`}
      </div>`).join('')}</div>` : ''}

    ${a.html || `<table><tbody>${(a.lignes || []).map(l => `<tr>
      <td class="name">${nomLigneApercu(l)}${l.meta ? `<span class="sub">${escMontant(l.meta)}</span>` : ''}</td>
      <td class="${l.perf != null ? cls(l.perf) : 'muted'}">${l.perf != null ? fmtSignedPct(l.perf, 1) : ''}</td>
      <td>${l.champ
        ? `<input type="number" step="any" data-path="${esc(l.champ)}" value="${getPath(l.champ) ?? 0}" class="champ-inline">`
        : `<b>${fmtEUR(l.valeur)}</b>`}</td>
    </tr>`).join('')}</tbody></table>`}`;
  /* Une fenetre ou l'on saisit porte « Enregistrer », et rien n'entre dans
     l'etat avant le clic.

     Le mecanisme est celui de la fiche d'une ligne : `data-differe` sur le corps,
     les deux ecouteurs de champs le respectent, `appliquerDiffere()` applique tout
     au clic. Le bouton « aller ailleurs » ne s'affiche donc plus quand il y a des
     champs : deux boutons pleins cote a cote, l'un qui enregistre et l'autre qui
     s'en va, se seraient disputes le meme geste.

     Un panneau sans champ garde son renvoi : il n'y a rien a enregistrer. */
  /* On demande au DOM, pas a la description du panneau : un apercu peut poser ses
     champs par `champs`, par `lignes[].champ`, ou dans son propre `html` — et
     c'est ce troisieme cas qui portait les liquidites, si bien que le test sur les
     deux premiers rendait faux et que « Enregistrer » n'apparaissait pas. Le
     balisage est la seule source qui connaisse les trois. */
  const saisissable = $$('#modalBody [data-path]').length > 0;
  $('#modalBody').dataset.differe = saisissable ? 'propre' : '';
  if (!saisissable) delete $('#modalBody').dataset.differe;
  const ailleurs = a.vue && a.vue !== currentView() && !saisissable;
  $('#modalFoot').innerHTML =
    `<button class="btn ghost" data-action="modal-close">${trad('Fermer')}</button>
     ${saisissable ? `<button class="btn" data-action="apercu-enregistrer">${trad('Enregistrer')}</button>` : ''}
     ${ailleurs ? `<button class="btn" data-action="goto" data-view="${a.vue}" data-anchor="${a.ancre}">${esc(a.cta)} →</button>` : ''}`;
  /* `montrerModal` et non `hidden = false` : c'est elle qui gele le fond, et
     l'apercu passait a cote. La page derriere restait donc libre de defiler, et
     le `focus()` ci-dessous la ramenait en haut — un panneau fixe qui prend le
     focus fait remonter le document. C'etait le defaut : « la page derriere
     revient tout en haut », sur toutes les fenetres qui passaient par ici.

     `preventScroll` en plus, ceinture et bretelles : le focus reste utile au
     clavier, il n'a pas a deplacer quoi que ce soit. */
  montrerModal($('#modal'));
  if (!a.champs && !a.html && !(a.lignes || []).some(l => l.champ)) {
    $('#modalClose').focus({ preventScroll: true });
  }
}

/* La fenetre d'une barre de la page Objectifs : ses placements, un par ligne.

   Le pourcentage annonce sa base, et cette base est celle des cibles — pas le
   patrimoine brut que la fenetre prend par defaut. Les deux existent, ils ne
   valent pas la meme chose : 13 558 EUR font 44,8 % de la base des cibles et
   20,1 % des avoirs. Ouvrir une barre a 44,8 % pour lire « 20,1 % de vos
   avoirs » aurait donne deux chiffres pour la meme ligne a un clic d'ecart,
   le defaut que cette application a deja corrige trois fois.

   La fiche n'est pas une carte d'analyse : c'est le chemin le plus court de
   « Actions core, +1 200 EUR a renforcer » vers la ligne qu'on va renforcer.
   Chaque intitule ouvre donc la fiche de la position, pas son compte.

   Ce que chaque ligne dit d'elle-meme depend de ce que le titre dit deja. Une
   fiche de role melange les classes, donc elle les nomme ; une fiche de classe
   entiere melange les roles, donc elle les nomme — et c'est ce qui permet de
   decider si la classe vaut d'etre decoupee. Une fiche de classe et de role
   n'a plus rien a preciser : tout est dans son titre. */
function ficheDeBarre(d) {
  if (!d) return null;
  const base = rebalanceRows().base;
  const lignes = d.lignes.map(l => ({
    label: l.nom,
    meta: [d.classe ? null : ASSET_CLASSES[l.classe],
           d.role ? null : ROLES[l.role],
           l.compte, l.etab].filter(Boolean).join(' · '),
    valeur: l.valeur,
    ouvre: { action: 'open-position', i: l.i },
  }));
  return {
    titre: d.label,
    sous: lignes.length ? `${lignes.length} ligne${lignes.length > 1 ? 's' : ''}`
                        : 'aucune ligne ici',
    total: d.total,
    totalNote: `${fmtPct(base ? d.total / base * 100 : 0, 1)} ${BASES.baseCibles.de}`,
    lignes,
    vue: 'positions', ancre: '', cta: trad('Ouvrir Marchés'),
  };
}

/* L'intitulé d'une ligne d'aperçu, cliquable ou non.

   `route` mène à une page — la fiche d'un compte, celle d'un établissement.
   `ouvre` déclenche une action, parce que tout ce qui s'ouvre n'est pas une
   page : la fiche d'une ligne de titres est une fenêtre. Sans ce second
   chemin, cliquer « Meta » dans les actifs de marché menait au compte qui
   l'héberge, pas à Meta. */
function nomLigneApercu(l) {
  if (l.ouvre) {
    /* `donnees` : les attributs que l'action attend, quels qu'ils soient. Seul
       `data-i` etait prevu, parce que la seule ligne ouvrante visait une position
       par son index — un credit, lui, se designe par son etablissement ET son
       rang chez lui. Une action qui a besoin de deux cles ne doit pas demander
       qu'on en invente une troisieme. */
    const donnees = Object.entries(l.ouvre.donnees || { i: l.ouvre.i })
      .map(([k, v]) => `data-${esc(k)}="${esc(String(v))}"`).join(' ');
    return `<button type="button" class="mois-lien" data-action="${esc(l.ouvre.action)}"
                    ${donnees}>${esc(l.label)}</button>`;
  }
  if (l.route) {
    return `<button type="button" class="mois-lien" data-action="aller-fiche"
                    data-route="${esc(l.route)}">${esc(l.label)}</button>`;
  }
  return esc(l.label);
}

/* Rafraîchit les totaux de la fenêtre après une saisie, sans voler le focus. */
function majApercu() {
  if (!apercuOuvert || $('#modal').hidden) return;
  const a = APERCUS[apercuOuvert]?.(apercuArg);
  if (!a) return;
  const total = $('#modalBody .modal-total b');
  if (total) total.innerHTML = fmtEUR(a.total);
  const note = $('#modalBody .modal-total span');
  /* Les memes canaux que l'ouverture, le meme regime : ce rafraichissement
     reecrit ce que openApercu a ecrit, et un canal sur deux qui echappe
     autrement referait apparaitre le SVG a la premiere frappe. */
  if (note) note.innerHTML = escMontant(noteApercu(a));
  // le titre dépend parfois d'un champ de la fenêtre elle-même (l'année visée)
  $('#modalTitle').textContent = a.titre;
  $('#modalSub').innerHTML = escMontant(a.sous || '');
  // et les lignes chiffrées, qui bougent avec le même champ
  if (a.live) {
    const L = a.live();
    for (const el of $$('#modalBody [data-live]')) {
      /* Ces valeurs sont des chaines deja formatees par les apercus, montants
         compris : meme canal, meme regime que le sous-titre. */
      if (L[el.dataset.live] != null) el.innerHTML = escMontant(L[el.dataset.live]);
    }
  }
  const cellules = $$('#modalBody table tbody tr');
  (a.lignes || []).forEach((l, i) => {
    const tr = cellules[i];
    if (!tr) return;
    const nom = tr.querySelector('.name');
    if (nom) nom.innerHTML = `${nomLigneApercu(l)}${l.meta ? `<span class="sub">${escMontant(l.meta)}</span>` : ''}`;
    const val = tr.querySelector('td:last-child b');
    if (val) val.innerHTML = fmtEUR(l.valeur);
  });
}

function closeApercu() {
  /* `masquerModal` degele le fond et remet le defilement ou il etait. Fermer en
     posant `hidden` a la main laissait le corps fige, donc la page bloquee. */
  masquerModal($('#modal'));
  apercuOuvert = null;
}

/* Ancre demandée par une tuile, consommée au prochain rendu. */
let pendingAnchor = null;

function focusAnchor() {
  if (!pendingAnchor) return;
  /* Depuis que les gros tableaux ont une liste de telephone, deux rendus
     portent la meme ancre et un seul est affiche. Viser le premier du
     document menait sur le tableau cache : rien ne bougeait a l'ecran. */
  /* `data-anchor` sert a deux choses : dire ou aller, sur le bouton qui
     declenche `goto`, et marquer la destination. Un bouton porte donc la meme
     valeur que sa cible, et il etait trouve en premier : on « defilait » vers
     un element deja sous les yeux, sans que rien ne bouge. Une destination
     n'est jamais un declencheur. */
  const cibles = $$(`[data-anchor="${CSS.escape(pendingAnchor)}"]`)
    .filter(x => x.dataset.action !== 'goto');
  const el = cibles.find(x => x.offsetParent !== null) || cibles[0];
  pendingAnchor = null;
  if (!el) return;
  const bar = window.matchMedia('(max-width: 900px)').matches ? 70 : 90;
  const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY - bar);
  const depart = window.scrollY;
  window.scrollTo({ top: y, behavior: 'smooth' });
  /* Filet : certains navigateurs ignorent purement `behavior: smooth` et ne
     bougent pas du tout. Une ancre qui ne fait rien est pire qu'une ancre qui
     saute : si rien n'a demarre au bout de deux images, on y va sans
     animation. Aucun effet la ou le defilement doux fonctionne, puisqu'il a
     deja commence. */
  if (Math.abs(y - depart) > 4) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - depart) < 2) window.scrollTo(0, y);
    }));
  }
  el.classList.remove('flash-target');
  void el.offsetWidth;                       // relance l'animation
  el.classList.add('flash-target');
  setTimeout(() => el.classList.remove('flash-target'), 1600);
}

function render() {
  const key = currentView();
  const v = VIEWS[key];
  /* Une vue a sous-onglets peut porter un titre et un sous-titre par onglet :
     « Allocation » couvre deux sujets, et un libelle unique en decrivait
     forcement un seul. La cle suit l'onglet actif, et le repli sur la cle de vue
     garde les autres vues inchangees.

     Le titre a rejoint le sous-titre le jour ou Projection est devenue un onglet
     de la vue d'ensemble : sans cela, la page de projection s'annoncait
     « Vue d'ensemble ». */
  const cleOnglet = SOUS_ONGLETS[v.cle] && sousOngletActif[v.cle]
    ? `${v.cle}.${sousOngletActif[v.cle]}` : null;
  const propre = suffixe => {
    const k = `view.${cleOnglet}${suffixe}`;
    return cleOnglet && t(k) !== k ? t(k) : null;
  };
  const titre = propre('') || viewTitle(v.cle);
  $('#viewTitle').textContent = titre;
  $('#viewSub').textContent = propre('.sub') || viewSub(v.cle);
  $('#brandView').textContent = titre;              // barre fixe, écran replié
  /* La vue courante, lisible depuis le CSS. Elle servait a ne pas dessiner la
     poignee de glissement sur l'accueil ; cette poignee est partie avec le geste,
     mais l'attribut reste : c'est un point d'accroche a cout nul pour styler une
     page en particulier, et une vue nommee dans le DOM aide a s'y retrouver. */
  document.body.dataset.vue = key;
  /* Le bandeau suit le mode a chaque rendu : entrer et sortir ne passe pas par
     un rechargement de page. */
  const bandeau = $('#bandeauDemo');
  if (bandeau) bandeau.hidden = !modeDemo();

  /* Le retour de l'en-tête. Deux sortes d'écrans le portent, et leur retour n'est
     pas le même.

     Une fiche a un parent : sa clé désigne une autre vue — `ficheCompte` porte
     `cle: 'accounts'`. La règle vit donc dans le registre et non dans une liste
     de routes tenue à côté : une fiche ajoutée demain aura son retour sans qu'on
     y pense. Son chevron remonte à ce parent, toujours au même endroit.

     Les pages du tiroir — Données, Préférences, Notifications — n'ont pas de
     parent : elles ne sont dans aucun onglet, et le tiroir qui les ouvre n'est
     pas un écran. Leur chevron revient donc d'où l'on vient, ce qui est la seule
     réponse juste : on y entre depuis n'importe quelle page.

     L'accueil, lui, n'en porte pas : c'est le premier onglet de la barre, il n'y
     a rien au-dessus. */
  const retour = $('#btnRetour');
  if (retour) {
    const dansBarre = $$('#tabbar a').map(a => a.dataset.view);
    const parent = key !== v.cle && VIEWS[v.cle] ? v.cle : null;
    const orpheline = !parent && v.cle !== 'overview' && !dansBarre.includes(v.cle);
    retour.hidden = !parent && !orpheline;
    if (parent) {
      retour.dataset.action = 'goto';
      retour.dataset.view = parent;
      retour.dataset.anchor = '';
      retour.setAttribute('aria-label', `Retour à ${viewTitle(parent)}`);
    } else if (orpheline) {
      retour.dataset.action = 'retour-arriere';
      delete retour.dataset.view;
      retour.setAttribute('aria-label', trad('Revenir à l’écran précédent'));
    }
    document.body.classList.toggle('sous-page', !retour.hidden);
  }
  /* Chaque entrée vise sa propre vue : la comparaison suffit. Le temps où
     Données et Préférences partageaient la leur, il fallait départager sur le
     sous-onglet ouvert, sans quoi les deux s'allumaient ensemble. */
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === key));
  majOnglets();
  const host = $('#view');
  const scroll = window.scrollY;
  /* La cascade d'entree ne joue qu'a l'arrivee sur une vue — changement de
     page ou de sous-onglet — jamais sur un simple re-rendu. render() tourne a
     chaque frappe dans un champ : les cartes rejouaient alors leur entree en
     boucle, et l'application paraissait clignoter precisement quand on s'en
     servait. La signature suit le sous-onglet actif, pour que passer de
     Depenses a Releves compose la page comme une arrivee. */
  const signatureVue = cleOnglet || key;
  /* Arriver sur une vue, ou la redessiner : les deux ne veulent pas la meme
     position de defilement, et c'est cette distinction qui manquait.

     Un re-rendu garde la position, evidemment — `render()` tourne a chaque frappe
     dans un champ. Mais une arrivee la gardait aussi, si bien que la position de
     l'ecran qu'on quitte s'appliquait a celui qu'on ouvre : descendu au bas
     d'Allocation, on arrivait au bas de Budget. Aucun systeme ne fait ça — iOS
     garde une position par onglet, Android remet en haut — et appliquer celle du
     voisin n'est ni l'un ni l'autre.

     Chaque vue retient donc la sienne, et la retrouve en y revenant. Une vue
     jamais visitee s'ouvre en haut, ce qui est le seul defaut acceptable. La
     memoire vit en memoire vive : un rechargement de page la vide, et c'est
     voulu — on rouvre l'application en haut de l'ecran d'accueil. */
  const arrivee = signatureVue !== derniereVueRendue;
  /* Changer de sous-onglet n'est pas changer de destination : c'est un selecteur
     segmente, et il ramene en haut. La memoire de position vaut pour les cinq
     onglets du bas, qui sont des destinations — iOS et Material 3 les traitent
     ainsi tous les deux — mais deux sous-onglets sont deux contenus de la meme
     page, de longueurs differentes : rester a 1 500 px dans le second ne designe
     rien. C'est aussi ce qui avait ete tranche pour la barre du haut, « le
     changement de menu, oui on doit arriver en haut forcement ». */
  const changeOnglet = arrivee && derniereCleRendue === key;
  if (arrivee) {
    if (derniereVueRendue) positionsVues.set(derniereVueRendue, scroll);
    derniereVueRendue = signatureVue;
    derniereCleRendue = key;
    host.classList.add('vue-entre');
    clearTimeout(render._finEntree);
    render._finEntree = setTimeout(() => host.classList.remove('vue-entre'), 700);
  } else {
    host.classList.remove('vue-entre');
  }
  /* Ou se trouvait le lavis des sous-onglets avant ce rendu.

     Il glisse d'un onglet a l'autre par une transition CSS, et une transition
     demande que l'element survive au changement. Or la barre de sous-onglets
     vit dans `#view`, que la ligne suivante remplace en entier : le lavis
     repart donc d'un element neuf, deja en place, et ne glisse pas.

     On note sa position avant, on la force sur l'element neuf, puis on la
     relache a l'image suivante. Le style en ligne bat les regles `:has()` le
     temps d'une image, le temps de donner un point de depart a la transition.

     L'autre issue etait de sortir cette barre de `#view`, comme la barre du bas
     et le bandeau de demonstration. C'est plus juste sur le fond — une barre de
     navigation n'est pas du contenu — mais cela touche le routage et les quatre
     vues qui l'appellent. A garder pour le jour ou cette barre posera un second
     probleme. */
  const lavisAvant = (() => {
    const seg = $('.sous-onglets .segmented');
    if (!seg) return null;
    const i = [...seg.children].findIndex(b => b.classList.contains('on'));
    return i >= 0 ? i : null;
  })();

  host.innerHTML = v.render();

  if (lavisAvant !== null) {
    const seg = $('.sous-onglets .segmented');
    const i = seg && [...seg.children].findIndex(b => b.classList.contains('on'));
    if (seg && i >= 0 && i !== lavisAvant) {
      seg.style.setProperty('--onglet', lavisAvant);
      requestAnimationFrame(() => requestAnimationFrame(() =>
        seg.style.removeProperty('--onglet')));
    }
  }
  /* Le tassement suit le meme chemin que le lavis : pose sur la barre neuve,
     puis retire quand l'animation a fini. */
  if (tapeSousOnglets) {
    tapeSousOnglets = false;
    const seg = $('.sous-onglets .segmented');
    if (seg) {
      seg.classList.add('tape');
      setTimeout(() => seg.classList.remove('tape'), 400);
    }
    /* Pas de fondu ajoute ici, et c'est un correctif.

       La lecon est plus generale qu'un reglage de duree : avant d'ajouter une
       animation, verifier que l'endroit n'en a pas deja une. Deux mouvements
       superposes ne font pas un mouvement deux fois plus riche, ils font un
       defaut.

       Ce qui reste a corriger est la barre elle-meme : elle participe a la
       cascade alors qu'on vient de la toucher. Une commande ne bouge pas quand
       on l'actionne — c'est ce que dit la classe posee juste apres. */
    const host = $('#view');
    if (host) {
      host.classList.add('barre-immobile');
      setTimeout(() => host.classList.remove('barre-immobile'), 700);
    }
  }

  MOUNTS[key]?.();
  monteAides();
  renderSidebar();
  /* La marque de fraicheur ne vaut que pour le rendu qu'elle vient de decorer :
     sans ce vidage, changer d'onglet ferait re-clignoter des cours vieux de dix
     minutes, et l'animation cesserait de dire « ça a change » pour ne plus dire
     que « la page s'est redessinee ». */
  coursFraichis = new Set();
  /* Une ancre demandee passe devant tout : c'est un geste explicite, il commande
     sur la position retenue. Sinon, l'arrivee restaure celle de la vue ouverte, et
     un re-rendu ne bouge pas d'un pixel. */
  if (pendingAnchor) focusAnchor();
  /* Le retour au sommet est un geste, pas une navigation : il commande sur la
     position retenue, au meme titre qu'une ancre demandee. Sans lui, le logo
     ramenait sur l'accueil a l'endroit ou on l'avait quitte — « je reviens sur
     la page mais pas en haut, c'est pas bon ». La memoire par vue, juste pour
     un changement d'onglet, ne doit pas repondre a la demande inverse. */
  else if (retourHautDemande || changeOnglet) { retourHautDemande = false; window.scrollTo(0, 0); }
  else window.scrollTo(0, arrivee ? (positionsVues.get(signatureVue) || 0) : scroll);
}
/* Consomme par le rendu qui suit, et par lui seul : le poser sans naviguer le
   laisserait vivre jusqu'au prochain re-rendu, qui remonterait alors une page
   qu'on venait de descendre. Le seul poseur verifie donc qu'il navigue. */
let retourHautDemande = false;
/* La vue rendue, sous-onglet exclu — `derniereVueRendue` porte la signature
   complete. Les deux sont necessaires : c'est leur difference qui distingue un
   changement d'onglet du bas d'un changement de sous-onglet. */
let derniereCleRendue = null;
let derniereVueRendue = null;
/* La position de defilement de chaque vue, retenue le temps de la session. */
const positionsVues = new Map();
/* Combien de fois on a change d'ecran depuis l'ouverture. Sert au retour des
   pages sans parent : sans ce compteur, un signet ouvert sur Preferences aurait
   un chevron qui fait sortir du site. */
let navsInternes = 0;
/* Un appui sur un sous-onglet vient d'avoir lieu : le rendu qui suit doit
   rejouer le tassement sur la barre qu'il vient de recreer. */
let tapeSousOnglets = false;

/* --- le panneau des notifications ---------------------------------------
   Il descend de sa cloche et ne couvre que ce qu'il faut. Chaque ligne est un
   bouton : le titre dit ce qui manque, la ligne mène là où ça se règle.

   Il se remplit à l'ouverture et non à chaque rendu : ce qu'il montre ne bouge
   pas tant qu'il est ouvert, et un panneau qui se réécrit sous le doigt fait
   perdre la ligne qu'on visait. */
const ICONE_NOTIF = { action: '●', error: '⛔', warn: '⚠', info: 'ℹ' };

function rendNotifs() {
  const n = notifications();
  const panneau = $('#panneauNotifs');
  if (!panneau) return;
  panneau.innerHTML = `
    <div class="notif-tete">
      <b>${trad('À faire')}</b>
      <span>${n.length ? `${n.length} point${n.length > 1 ? 's' : ''}` : 'rien à signaler'}</span>
      <!--    L'engrenage mene aux reglages : c'est la, devant la liste, qu'on se dit «
   je ne veux plus de celle-la ».-->
      <button type="button" class="btn icon xs notif-reglages"
              data-action="goto" data-view="notifications" data-anchor=""
              title="${trad('Réglages des notifications')}" aria-label="${trad('Réglages des notifications')}">
        <!-- Trois points, apres deux engrenages et une cle dessines en grand
             pour les juger : un cercle a huit rayons detaches fait un soleil, un
             cercle epais en pointille aussi — ses dents ne touchent pas le
             moyeu — et la cle etait laide a cette taille.

             Trois points ne pretendent rien dire d'autre que « il y a autre
             chose ici », et c'est vrai : la ligne mene aux reglages. A quinze
             pixels, c'est la seule forme qu'on ne peut pas confondre. Pleins,
             pas cercles : trois anneaux se liraient comme des boutons. -->
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="none">
          <circle cx="5.6" cy="12" r="1.75"/>
          <circle cx="12" cy="12" r="1.75"/>
          <circle cx="18.4" cy="12" r="1.75"/>
        </svg>
      </button>
    </div>
    ${n.length ? n.map(x => `
      <div class="notif-ligne n-${esc(x.level)}">
        <button type="button" class="notif-corps"
                data-action="goto" data-view="${esc(x.view)}" data-anchor="">
          <span class="notif-ic" aria-hidden="true">${ICONE_NOTIF[x.level] || '•'}</span>
          <span class="notif-txt"><b>${esc(x.title)}</b><span>${escMontant(x.detail)}</span></span>
        </button>
        <!-- Deux boutons cote a cote, pas l'un dans l'autre : un <button> ne peut
             pas en contenir un second. La ligne mene la ou ca se regle, la croix
             dit « ne me le dis plus ». -->
        <button type="button" class="btn icon xs notif-x" data-action="masquer-notif"
                data-cle="${esc(x.cle)}" title="${trad('Ne plus signaler')}"
                aria-label="Ne plus signaler : ${esc(x.title)}">✕</button>
      </div>`).join('')
    : `<p class="notif-vide">${trad('✓ Rien à signaler.')}</p>`}
    <!-- Le bord libre du panneau, et le geste qui le referme : il descend de sa
         cloche, il remonte par la. Un chevron seul, pleine largeur, parce que la
         zone touchee doit etre facile a viser au pouce — et parce que rien
         d'autre ne disait comment sortir sans viser le vide autour. -->
    <button type="button" class="notif-fermer" data-action="fermer-notifs"
            aria-label="Fermer">
      <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6,14.5 12,8.5 18,14.5"/></svg>
    </button>`;
}

function fermeNotifs() {
  const p = $('#panneauNotifs');
  if (p) p.hidden = true;
  $('#btnCloche')?.setAttribute('aria-expanded', 'false');
}

function basculeNotifs() {
  const p = $('#panneauNotifs');
  if (!p) return;
  const ouvrir = p.hidden;
  if (ouvrir) rendNotifs();
  p.hidden = !ouvrir;
  $('#btnCloche')?.setAttribute('aria-expanded', String(ouvrir));
}

/* --- barre d'onglets (téléphone) ---
   Cinq onglets, cinq destinations. « Plus » a occupé la dernière place : un
   onglet qui n'allait nulle part, à toucher avant de toucher sa destination.
   Comptes l'a remplacé, et les réglages s'ouvrent par le logo.

   Aucun onglet ne s'allume donc sur Données, seule vue hors barre : c'est le
   logo qui en tient lieu, et il porte l'état ouvert du tiroir. */
function majOnglets() {
  const barre = $('#tabbar');
  if (!barre) return;
  const key = currentView();
  const directs = [...barre.querySelectorAll('a')].map(a => a.dataset.view);
  const ouvert = document.body.classList.contains('nav-open');

  for (const a of barre.querySelectorAll('a')) {
    a.classList.toggle('on', !ouvert && a.dataset.view === key);
    a.setAttribute('aria-current', (!ouvert && a.dataset.view === key) ? 'page' : 'false');
  }
  /* Le tiroir « Plus » montrait les six entrées du menu, dont quatre que la
     barre du bas porte déjà, à un doigt. Trois en-têtes organisaient donc
     surtout des doublons, et il fallait lire six lignes pour trouver les deux
     qui n'étaient nulle part ailleurs.

     La liste des doublons vient de la barre elle-même, jamais recopiée : deux
     listes à tenir d'accord finissent toujours par diverger, et c'est le défaut
     qu'on a corrigé trois fois ailleurs. Le masquage se fait en CSS, sous
     768 px seulement — sur ordinateur, les six vivent dans le menu latéral et
     le regroupement y mérite sa place. */
  let titre = null, restants = 0;
  const trancher = () => titre && titre.classList.toggle('sans-suite', restants === 0);
  for (const el of $$('#nav > *')) {
    if (el.classList.contains('nav-groupe')) { trancher(); titre = el; restants = 0; continue; }
    if (!el.matches('a[data-view]')) continue;
    const double = directs.includes(el.dataset.view);
    el.classList.toggle('dans-barre', double);
    if (!double) restants++;
  }
  trancher();

  /* Les deux saisies en attente se signalent au meme endroit, depuis que les
     relevés sont un sous-onglet de Budget. Le releve avertissait sur « Plus »,
     ou il vivait dans le tiroir : il n'y est plus, et une pastille pointant
     vers un menu qui ne contient plus rien a saisir enverrait chercher au
     mauvais endroit. Le titre dit laquelle des deux attend, ou les deux. */
  const dep = depensesEnAttente();
  const rel = currentMonthPending();
  const enAttente = [
    dep.missing ? `${dep.label} : ${trad('dépenses pas encore saisies')}` : '',
    rel.missing ? `${rel.label} : ${trad('relevé pas encore enregistré')}` : '',
  ].filter(Boolean);

  const pastille = (id, actif, texte) => {
    const p = $(id);
    if (!p) return;
    p.hidden = !actif;
    p.title = actif ? texte : '';
  };
  pastille('#tabBadgeBudget', enAttente.length, enAttente.join(' · '));

  /* La cloche s'allume pour tout ce qui demande une action ou signale un chiffre
     faux — les saisies en attente comme les contrôles de cohérence. Un rappel
     repoussé n'en fait pas partie : `notifications()` s'appuie sur `missing`. */
  const n = notifications();
  pastille('#pastilleCloche', n.length,
    n.length === 1 ? n[0].title : trad('{n} points à regarder').replace('{n}', n.length));
}

function renderSidebar() {
  const t = nowTotals();
  const d = deltas();

  // pastilles rouges tant que le mois en cours n'est pas saisi
  const pastille = (id, p, texte) => {
    const b = $(id);
    if (!b) return;
    b.hidden = !p.missing;
    b.title = p.missing ? `${p.label}, ${texte}` : '';
  };
  /* Une seule entree de menu, une seule pastille : « Relevés » a quitte le
     menu pour devenir un sous-onglet de Budget. Elle s'allume pour l'une ou
     l'autre des deux saisies, et son infobulle dit laquelle. */
  const dep = depensesEnAttente();
  const rel = currentMonthPending();
  pastille('#badgeBudget',
    { missing: dep.missing || rel.missing, label: (dep.missing ? dep : rel).label },
    [dep.missing ? trad('dépenses pas encore saisies') : '',
     rel.missing ? trad('relevé pas encore enregistré') : ''].filter(Boolean).join(` ${trad('et')} `));

  /* Le patrimoine clignote brièvement quand il bouge : on voit qu'une saisie
     a porté, sans avoir à chercher où. */
  const netWorth = $('#sbNetWorth');
  const montant = fmtEUR0(t.total);
  /* La comparaison se fait sur le même terrain que l'écriture, sinon elle
     oppose du texte à du balisage et déclenche le clignotement à chaque
     rendu — y compris quand rien n'a bougé. */
  if (netWorth.innerHTML && netWorth.innerHTML !== montant) {
    netWorth.classList.remove('valeur-maj');
    void netWorth.offsetWidth;
    netWorth.classList.add('valeur-maj');
  }
  /* `innerHTML` et non `textContent` : masqué, un montant n'est pas du texte
     mais l'œil barré, une balise <svg> que nous produisons nous-mêmes.
     Posée en texte, elle s'imprimait en clair — le patrimoine devenait un
     pavé de balisage au milieu du menu. Rien d'extérieur ne passe ici :
     `fmtEUR0` rend soit un nombre formaté, soit cette icône. */
  netWorth.innerHTML = montant;
  /* La tête du tiroir porte le même chiffre : deux endroits, une seule
     source, sinon l'un des deux finit par mentir. */
  const netTiroir = $('#navNetWorth');
  if (netTiroir) netTiroir.innerHTML = montant;
  const el = $('#sbDelta');
  const deltaHtml = d.ytd ? `${arrow(d.ytd.eur)} ${fmtSigned(d.ytd.eur)} ${trad('depuis janvier')}` : '';
  const deltaCls = 'sb-delta ' + (d.ytd ? cls(d.ytd.eur) : '');
  el.innerHTML = deltaHtml;
  el.className = deltaCls;
  const dTiroir = $('#navDelta');
  if (dTiroir) { dTiroir.innerHTML = deltaHtml; dTiroir.className = deltaCls; }

  /* Le bouton dit dans quel etat on se trouve, pas ce qu'il va faire :
     masque actif, il reste allume, sinon on oublie qu'on a cache les
     montants et on croit l'app en panne. */
  majEtatCours();

  /* Tous les yeux, et non celui du menu seul.

     Il y en a trois maintenant : le pied du menu sur grand ecran, la carte du
     patrimoine, et la barre du haut sur telephone. Viser un identifiant en
     laissait deux dans l'etat precedent — celui de la barre du haut n'est pas
     re-rendu, c'est du balisage statique, donc il serait reste barre alors que
     les montants sont revenus. La liste se derive de l'action : le quatrieme
     bouton posee demain suivra sans qu'on y pense. */
  const on = masqueActif();
  document.body.classList.toggle('discret', on);
  for (const oeil of $$('[data-action="toggle-masque"]')) {
    oeil.setAttribute('aria-pressed', on ? 'true' : 'false');
    oeil.title = (on ? trad('Afficher les montants') : trad('Masquer les montants')) + ' ' + trad('(touche h)');
    oeil.setAttribute('aria-label', on ? trad('Afficher les montants') : trad('Masquer les montants'));
  }
  /* Le patrimoine du menu est lui aussi une bascule : son infobulle doit
     dire l'etat courant, comme l'oeil. */
  const nw = $('#sbNetWorth');
  if (nw) nw.title = (masqueActif() ? trad('Afficher les montants') : trad('Masquer les montants'))
    + ' ' + trad('(touche h)');
}

/* -------------------------------------------------------------
   Fermer une fenêtre en la faisant glisser vers le bas

   Sur téléphone, la croix est en haut à droite — le coin le plus
   loin du pouce. Le geste attendu d'une feuille qui monte du bas,
   c'est de la repousser vers le bas.

   Le glissement ne démarre que si le contenu est déjà en haut de
   sa course : autrement on ne pourrait plus faire défiler une
   fenêtre longue vers le haut sans la refermer.
   ------------------------------------------------------------- */
function monteGlissementFermeture(fenetre) {
  if (!fenetre) return;
  const panneau = fenetre.querySelector('.modal-panel');
  if (!panneau) return;

  let depart = null, delta = 0;
  const SEUIL = 90;          // en deçà, la fenêtre revient en place

  const fermable = () => {
    /* La croix porte déjà la bonne action selon la fenêtre ouverte : on la
       déclenche plutôt que de dupliquer sa logique de résolution. */
    const croix = fenetre.querySelector('#modalClose, #confirmNo');
    return croix || null;
  };

  /* Le geste de fermeture doit se retirer devant le défilement. Il écrivait
     `transform` et `opacity` à chaque événement tactile, sans trame
     d'animation et sans verrou de direction : sur une fenêtre longue — les
     dépenses du mois en portent une par catégorie — chaque doigt posé en haut
     de la liste tirait le panneau au lieu de la faire défiler, et le moindre
     retour vers le haut le replaquait d'un coup, sans transition. D'où une
     page qui accroche.

     Trois corrections. Le verrou de direction : on observe les huit premiers
     pixels sans rien bouger, et on tranche une fois pour toutes entre défiler
     et fermer. La trame : une seule écriture de style par image, au lieu
     d'une par événement. Et l'opacité rejoint la même écriture — animée
     séparément sur un panneau flouté, elle repeignait tout le fond. */
  let axe = null;                      // null = indécis, 'ferme' ou 'defile'
  let departX = 0, trame = 0;

  const peindre = () => {
    trame = 0;
    if (axe !== 'ferme') return;
    panneau.style.transform = `translateY(${delta * .7}px)`;
    panneau.style.opacity = String(Math.max(.4, 1 - delta / 600));
  };

  const SEUIL_INTENTION = 8;

  /* Le glissement de fermeture ne part QUE de la poignee et de l'en-tete.

     Il partait de n'importe ou dans la fenetre, contenu compris, a la seule
     condition que le corps soit en haut de son defilement. Deux gestes se
     disputaient donc la meme surface, et le desaccord s'est solde par trois
     tentatives ratees : un seuil a huit pixels, puis a vingt-six, puis des
     durcissements CSS. Rien n'y a fait, et pour une raison de fond — au sommet
     d'une fiche, un doigt qui descend est ambigu, et aucune valeur de seuil ne
     leve l'ambiguite. Une fiche longue s'ouvre toujours en haut, donc
     l'ambiguite etait la regle et non l'exception.

     La poignee existe pour ce geste : elle le prend, seule. Dans le contenu, il
     n'y a plus qu'une chose possible, defiler, et plus rien a arbitrer. C'est
     ainsi que se comportent les feuilles du systeme quand leur contenu defile.
     La croix et « Fermer » restent, evidemment.

     Reste le cas ou le contenu ne defile pas du tout, et c'est le plus courant :
     « Depenses 2026 » mesure 481 px de contenu dans 481 px de corps. La regle
     ci-dessus y devenait absurde. Elle disait « dans le contenu, il n'y a plus
     qu'une chose possible, defiler » — sauf que la, defiler est impossible. Le
     geste ne faisait donc rien, et partait a la page derriere, qu'on voyait
     bouger sous la feuille.

     La condition n'est donc plus « le corps est en haut de son defilement »,
     qui etait ambigue parce qu'une fiche longue s'ouvre toujours en haut, mais
     « le corps ne peut pas defiler ». La difference est entiere : dans le
     premier cas deux gestes se disputaient la surface, dans le second un seul
     existe. */
  const ZONE_GLISSEMENT = '.modal-head';
  const corpsDefile = () => {
    const c = fenetre.querySelector('.modal-body');
    return !!c && c.scrollHeight - c.clientHeight > 2;
  };
  /* Retenu au depart du geste : le contenu peut changer de hauteur en cours de
     route — une saisie qui ajoute une ligne — et la regle ne doit pas basculer
     sous le doigt. */
  let corpsFige = false;

  panneau.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    /* Le pseudo-element de la poignee n'est pas une cible d'evenement : un
       appui dessus arrive sur le panneau lui-meme. On accepte donc aussi les
       touches qui ne tombent dans aucun enfant. */
    const surLaPoignee = e.target === panneau;
    corpsFige = !corpsDefile();
    if (!surLaPoignee && !corpsFige && !e.target.closest(ZONE_GLISSEMENT)) return;
    if (e.target.closest('input, textarea, select, button, a, select')) return;
    depart = e.touches[0].clientY;
    departX = e.touches[0].clientX;
    delta = 0; axe = null;
    panneau.style.transition = 'none';
    panneau.style.willChange = 'transform, opacity';
  }, { passive: true });

  /* Cet ecouteur n'est pas passif, et c'est le seul du fichier.

     C'est ce qui manquait : un ecouteur passif ne peut pas appeler
     `preventDefault`, donc le navigateur gardait la main sur le geste et faisait
     glisser ce qu'il trouvait derriere. `body { overflow: hidden }` ne suffit
     pas — iOS laisse le document rebondir malgre lui — et
     `overscroll-behavior: contain` sur le corps ne s'applique que s'il defile
     vraiment, ce qui est faux precisement dans le cas qui posait probleme.

     On confisque donc le geste dans deux situations, et seulement celles-la :
     la fermeture est engagee, ou la feuille ne defile pas et il n'y a rien
     d'autre a preserver. Un geste de defilement rend la main immediatement,
     avant meme d'etre qualifie, donc le cout en performance est nul la ou le
     defilement compte. */
  panneau.addEventListener('touchmove', e => {
    if (depart === null) return;
    if (corpsFige || axe === 'ferme') e.preventDefault();
    const dy = e.touches[0].clientY - depart;
    const dx = e.touches[0].clientX - departX;

    if (axe === null) {
      /* Sous huit pixels, l'intention n'est pas lisible : on ne bouge rien. Un
         panneau qui frémit au premier pixel donne l'impression d'un contrôle
         qui glisse des mains. */
      if (Math.abs(dy) < SEUIL_INTENTION && Math.abs(dx) < SEUIL_INTENTION) return;
      /* Vers le haut, ou plus latéral que vertical : ce n'est pas une
         fermeture. On rend la main, définitivement pour ce geste — sans quoi
         une main qui redescend reprendrait le panneau en cours de route. */
      axe = (dy > 0 && Math.abs(dy) > Math.abs(dx)) ? 'ferme' : 'defile';
      if (axe === 'defile') { depart = null; panneau.style.willChange = ''; return; }
    }

    delta = Math.max(0, dy);
    if (!trame) trame = requestAnimationFrame(peindre);
  }, { passive: false });

  const relacher = () => {
    if (trame) { cancelAnimationFrame(trame); trame = 0; }
    if (depart === null) { axe = null; panneau.style.willChange = ''; return; }
    panneau.style.transition = 'transform .2s ease, opacity .2s ease';
    panneau.style.transform = '';
    panneau.style.opacity = '';
    panneau.style.willChange = '';
    const assez = axe === 'ferme' && delta > SEUIL;
    depart = null; delta = 0; axe = null;
    if (assez) fermable()?.click();
  };
  panneau.addEventListener('touchend', relacher);
  panneau.addEventListener('touchcancel', relacher);
}

/* -------------------------------------------------------------
   Tirer vers le bas pour rafraichir les cours

   Ce projet a retire un geste de tirage il y a peu — celui qui ramenait a
   l'accueil — et la lecon merite d'etre reprise, parce qu'elle explique pourquoi
   celui-ci est different. L'ancien s'armait a `scrollY === 0` et menait a une
   destination : au sommet d'une page, un doigt qui descend etait alors ambigu,
   il pouvait vouloir naviguer ou defiler, et aucun seuil ne levait l'ambiguite.

   Ici il n'y a rien a arbitrer. A `scrollY === 0`, un glissement vers le bas ne
   peut pas defiler : il n'y a rien au-dessus. Le geste ne dispute donc aucune
   autre intention, exactement comme le glissement de fermeture d'une feuille qui
   ne defile pas. C'est la meme regle, et c'est elle qui rend le geste sain.

   Trois gardes tout de meme. Une fenetre ouverte prend la main, sinon on
   rafraichirait derriere elle. Un rafraichissement en cours ne se relance pas.
   Et le verrou de direction observe huit pixels avant de trancher : un
   glissement lateral, ou vers le haut, rend la main definitivement pour ce
   geste. */
let tirerMonte = null;
/* Les vues ou le geste a un sens, nommees une fois. Le test de la vue vit dans
   `touchstart` et non au montage : `.view` est le meme noeud pour toutes les
   vues, les ecouteurs y sont poses une seule fois et vivent ensuite partout. */
const VUES_TIRER = new Set(['positions', 'overview']);
function monteTirerRafraichir() {
  const hote = $('.view');
  if (!hote || tirerMonte === hote) return;
  tirerMonte = hote;

  /* La jauge vit en `fixed` : elle ne participe donc pas au flux et ne pousse
     rien. Recreee a chaque rendu de la vue, comme le reste. */
  let jauge = document.querySelector('.tirer');
  if (!jauge) {
    jauge = document.createElement('div');
    jauge.className = 'tirer';
    jauge.setAttribute('aria-hidden', 'true');
    jauge.innerHTML = '<i></i>';
    document.body.appendChild(jauge);
  }

  /* 165 px, apres 72 puis 118. Le geste doit couter, parce qu'il part chercher le
     reseau et reecrit tous les cours — et parce qu'un doigt qui descend au sommet
     d'une page, c'est aussi ce qu'on fait pour commencer a lire.

     Le seuil se mesure sur la course du **doigt**, pas sur celle de la page :
     celle-ci est desormais bornee, elle ne pourrait plus l'atteindre. */
  const SEUIL = 165;           // au-dela, on lache et ca part
  const INTENTION = 8;         // en deca, l'intention n'est pas lisible
  let depart = null, departX = 0, dy = 0, axe = null, enCours = false;

  /* La page descend avec le doigt, et c'est elle qui fait sentir le geste.

     La premiere version ne bougeait que le disque, au-dessus d'un contenu
     rigide : le disque paraissait flotter devant une page qui ne participait
     pas. Un tirage se sent parce que la matiere resiste et revient — c'est le
     meme principe que les feuilles de l'application, qui suivent le doigt avant
     de se remettre en place, et le meme que le geste natif du systeme.

     Seul `.view` bouge : la barre du haut et celle du bas sont en `fixed`, elles
     restent donc en place, comme il faut. */

  /* La resistance, et c'est tout le sujet.

     L'amortissement etait **lineaire** : 60 % de la course du doigt, sans borne.
     Tirer deux fois plus loin descendait deux fois plus bas, indefiniment — d'ou
     « un ecran peut se tirer beaucoup trop ». Un ratio n'est pas une resistance :
     il se contente de ralentir, il ne s'oppose jamais.

     La loi est donc asymptotique, celle des elastiques du systeme et de Trade
     Republic : au depart la page suit le doigt presque au pixel, ce qui rend le
     geste vivant, puis elle donne de moins en moins et tend vers `COURSE_MAX`
     sans jamais l'atteindre. Mesure de la courbe retenue, pour 140 px de course
     maximale : 50 px de doigt donnent 42, 100 en donnent 71, 200 en donnent 107,
     et 660 — le tirage de la capture — en donnent 139. On ne peut plus creuser un
     demi-ecran de vide, et surtout on **sent** que ça resiste, parce que la
     reponse s'aplatit sous le doigt.

     `1 - exp(-d / M)` et non `d / (1 + d / M)` : les deux ont la meme asymptote,
     la premiere a une pente initiale de 1 exactement, donc le premier centimetre
     colle au doigt. C'est ce premier centimetre qui dit que le geste est pris. */
  const COURSE_MAX = 140;
  const amorti = d => COURSE_MAX * (1 - Math.exp(-d / COURSE_MAX));

  const peindre = () => {
    const t = Math.min(1, dy / SEUIL);
    const y = amorti(dy);
    jauge.style.opacity = String(t);
    jauge.style.transform = `translate(-50%, ${y}px) rotate(${t * 300}deg)`;
    jauge.classList.toggle('prete', dy >= SEUIL);
    hote.style.transform = `translateY(${y}px)`;
  };
  /* Le retour : le disque s'efface, la page remonte. La courbe rend un peu
     au-dela de sa place avant de s'y poser, sinon la remontee s'arrete net et le
     geste finit sans reponse. */
  const RESSORT = 'cubic-bezier(.22, 1.28, .42, 1)';
  const reposer = () => {
    jauge.style.transition = 'opacity .2s ease, transform .25s ease';
    jauge.style.opacity = '0';
    jauge.style.transform = 'translate(-50%, 0) rotate(0deg)';
    jauge.classList.remove('prete');
    hote.style.transition = `transform .34s ${RESSORT}`;
    hote.style.transform = '';
    setTimeout(() => {
      jauge.style.transition = '';
      hote.style.transition = '';
    }, 360);
  };

  hote.addEventListener('touchstart', e => {
    /* `.view` est le meme noeud pour toutes les vues : seul son contenu change
       d'un rendu a l'autre. Les ecouteurs sont donc poses une fois et vivent
       ensuite sous Budget comme sous Marches — c'est ici qu'on decide, pas au
       montage. Le garde du montage ne fait qu'eviter de les empiler. */
    /* Deux vues, et pas une : Marches parce qu'on y regarde les cours, et la vue
       d'ensemble parce que c'est la qu'on vient voir son patrimoine, qui bouge
       avec eux. Ailleurs, rien a rafraichir — un budget ne vient pas du reseau,
       et le geste y volerait le rebond natif de la page pour rien. */
    if (!VUES_TIRER.has(currentView())) return;
    if (enCours || e.touches.length !== 1) return;
    if (window.scrollY > 0) return;
    if (!$('#modal').hidden || !$('#confirm').hidden) return;
    /* Ce qui defile lateralement garde son geste, entierement. Le ruban de
       reperes de Marches se trouve en haut de page, la ou le tirage s'arme :
       les deux gestes partaient du meme endroit et le tirage gagnait des que le
       doigt descendait un peu. On ne s'arme donc pas du tout au-dessus d'une
       zone qui defile en x — mieux vaut renoncer au tirage sur ces quelques
       centimetres que de rendre le ruban inutilisable. */
    if (e.target.closest('.reperes, .reperes-familles, .table-wrap, [data-defile-x]')) return;
    depart = e.touches[0].clientY; departX = e.touches[0].clientX; dy = 0; axe = null;
    jauge.style.transition = '';
  }, { passive: true });

  hote.addEventListener('touchmove', e => {
    if (depart === null) return;
    const y = e.touches[0].clientY - depart;
    const x = e.touches[0].clientX - departX;
    if (axe === null) {
      if (Math.abs(y) < INTENTION && Math.abs(x) < INTENTION) return;
      /*         On compare donc les deux axes, comme le fait deja la fermeture des
         feuilles. Le geste lateral rend la main definitivement — sans quoi une
         main qui finit par descendre reprendrait le tirage en cours de route. */
      axe = (y > 0 && Math.abs(y) > Math.abs(x)) ? 'tirer' : 'autre';
      if (axe === 'autre') { depart = null; return; }
    }
    dy = Math.max(0, y);
    /* Le geste est confisque : sans cela le navigateur fait rebondir la page et
       la jauge glisse sous un contenu qui bouge en meme temps. */
    e.preventDefault();
    peindre();
  }, { passive: false });

  const relacher = async () => {
    if (depart === null || axe !== 'tirer') { depart = null; axe = null; return; }
    const assez = dy >= SEUIL;
    depart = null; axe = null;
    if (!assez) { dy = 0; reposer(); return; }
    dy = 0;
    enCours = true;
    retourHaptique();
    jauge.classList.remove('prete');
    jauge.classList.add('tourne');
    jauge.style.opacity = '1';
    /* Le contenu reste pousse pendant la requete, a la hauteur du disque : c'est
       ce qui dit que le travail est en cours. Le laisser remonter aussitot
       donnerait un geste avale, et le disque tournerait devant une page revenue
       en place comme s'il ne la concernait plus. */
    jauge.style.transition = 'transform .2s ease';
    jauge.style.transform = 'translate(-50%, 34px)';
    hote.style.transition = 'transform .2s ease';
    hote.style.transform = 'translateY(44px)';
    try {
      await ACTIONS['refresh-quotes']();
    } finally {
      enCours = false;
      jauge.classList.remove('tourne');
      reposer();
    }
  };
  hote.addEventListener('touchend', relacher);
  hote.addEventListener('touchcancel', relacher);
}

/* -------------------------------------------------------------
   Le petit clic physique de l'appui

   Android seulement, et c'est tout ce qui existe.

   `navigator.vibrate()` est la voie normale, et elle n'est implementee que la.
   Huit millisecondes : c'est un clic, pas une alerte.

   Sur iOS, il n'y a rien, et c'est ecrit ici pour qu'on n'y revienne pas.

   L'API de vibration n'y a jamais ete implementee, ni dans Safari ni en
   application installee sur l'ecran d'accueil. Un detour a ete tente et
   retire : le systeme declenche son propre retour pour le controle natif
   `<input type="checkbox" switch>`, et l'activer par script semblait pouvoir
   emprunter ce retour. Essai fait sur un iPhone, en Safari : rien. Et rien non
   plus a esperer d'une application installee, c'est le meme moteur de rendu.

   Quinze lignes de contournement qui ne contournent rien sont pires que leur
   absence : elles laissent croire que le sujet est traite. Elles sont donc
   parties, et cette note reste a leur place.

   Ce qui porte l'appui sur iOS est donc entierement visuel — le tassement de la
   barre, la pastille qui glisse, la page qui suit le doigt. C'est la raison
   d'avoir fait ces animations avant de chercher l'haptique, et non apres.
   ------------------------------------------------------------- */
function retourHaptique() {
  /* Envelope : un retour tactile absent ne doit jamais casser un appui. */
  try { navigator.vibrate?.(8); } catch (e) {}
}

/* -------------------------------------------------------------
   Vider un champ d'un geste

   Corriger un montant demandait de selectionner son contenu puis de
   l'effacer, ou de reculer chiffre par chiffre. Une croix apparait
   maintenant dans le champ actif des qu'il porte quelque chose : elle le
   vide et y laisse le curseur, pret a recevoir le nouveau montant.

   Un seul bouton pour toute l'application, pose au-dessus du champ actif
   plutot que place dans les gabarits : les champs a `data-path` sont
   soixante-treize, repartis dans une vingtaine de gabarits, et les fenetres
   en creent d'autres a la volee. Flottant, il ne touche a aucune largeur de
   colonne.
   ------------------------------------------------------------- */
function monteVideChamp() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'champ-vider';
  btn.hidden = true;
  btn.setAttribute('aria-label', 'Vider le champ');
  btn.setAttribute('title', 'Vider le champ');
  btn.textContent = '×';
  document.body.appendChild(btn);

  let cible = null;

  /* Ce que couvre ce mecanisme — la croix qui vide, et la selection a l'arrivee.

     Il ne visait que les champs a `data-path`. Or les depenses d'un mois se
     saisissent dans des champs a `data-cat`, et les fenetres de vente et d'achat
     dans des champs a identifiant : ni la croix ni la selection ne les
     atteignaient, alors que ce sont exactement ceux qu'on retape le plus.
     « Rentrer un chiffre dans liquidite ou autre » — le « ou autre » etait la
     moitie manquante.

     Trois portes, donc : le chemin d'etat, la categorie de depense, et
     l'appartenance a une fenetre. La troisieme est la plus large et la plus
     juste : dans une fenetre, un champ de texte ou de nombre est toujours une
     valeur qu'on vient poser ou remplacer. Les champs de date en sont exclus
     par leur type — on n'y tape pas par-dessus, le navigateur y met son propre
     selecteur. */
  const eligible = el => el instanceof HTMLInputElement
    && (el.type === 'text' || el.type === 'number')
    && !el.readOnly && !el.disabled
    && (el.dataset.path !== undefined || el.dataset.cat !== undefined
        || !!el.closest('#modalBody'));

  /* La reserve a droite se pose en style direct plutot que par une classe :
     `table.editable input` fixe deja un `padding`, et une regle de feuille
     de style aurait demande de surenchierir en specificite a chaque endroit
     ou un champ est habille autrement. */
  let padAvant = null;
  const cacher = () => {
    if (cible) {
      cible.classList.remove('champ-vidable');
      cible.style.paddingRight = padAvant || '';
    }
    padAvant = null;
    cible = null;
    btn.hidden = true;
  };

  const placer = () => {
    if (!cible || !cible.isConnected) return cacher();
    const r = cible.getBoundingClientRect();
    /* Hors de l'ecran, ou dans un tableau qu'on vient de faire defiler
       lateralement : la croix suivrait un champ que l'on ne voit plus. */
    if (!r.width || r.bottom < 4 || r.top > innerHeight - 4) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.style.left = `${r.right - 23}px`;
    btn.style.top  = `${r.top + r.height / 2 - 10}px`;
  };

  const suivre = () => {
    if (!cible) return;
    if (String(cible.value).length) placer(); else btn.hidden = true;
  };

  document.addEventListener('focusin', e => {
    if (!eligible(e.target)) return cacher();
    cacher();
    cible = e.target;
    /* Le contenu se selectionne a l'arrivee : taper remplace, sans effacer.

       Le geste demande tient en un appui, et il n'a besoin d'aucun bouton : ce
       qu'on veut n'est pas un champ vide, c'est de ne pas avoir a effacer. Un
       contenu selectionne disparait au premier caractere tape — c'est la meme
       chose, en un geste au lieu de deux, et sans rien poser a droite de
       soixante-treize champs.

       La croix reste pour le cas qu'elle seule couvre : vider et regarder le
       total avant de retaper. Elle rend un champ vide, la selection rend un
       champ qu'on remplace.

       `select()` differe d'une image : sur iOS, appeler la selection dans le
       gestionnaire de focus se fait ecraser par le placement du curseur que le
       navigateur execute juste apres, et le champ se retrouve avec un simple
       point d'insertion. */
    const champ = cible;
    requestAnimationFrame(() => {
      if (document.activeElement === champ && String(champ.value).length) {
        try { champ.select(); } catch (err) { /* type de champ sans selection */ }
      }
    });
    cible.classList.add('champ-vidable');
    padAvant = cible.style.paddingRight;
    cible.style.paddingRight = '28px';
    suivre();
  });

  /* Le bouton n'est pas dans le champ : le quitter le ferait disparaitre
     avant le clic. On attend de savoir ou le focus a atterri. */
  document.addEventListener('focusout', e => {
    if (e.target !== cible) return;
    setTimeout(() => { if (document.activeElement !== cible) cacher(); }, 0);
  });

  document.addEventListener('input', e => { if (e.target === cible) suivre(); });
  addEventListener('scroll', suivre, { passive: true, capture: true });
  addEventListener('resize', suivre);

  /* `pointerdown` plutot que `click` : un clic commence par retirer le focus
     du champ, ce qui declenche le re-rendu du blur et remplace le noeud sous
     le doigt. En prenant la main avant, et en empechant le deplacement du
     focus, le champ reste celui qu'on vise. */
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!cible) return;
    const champ = cible;
    champ.value = '';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.focus();
    btn.hidden = true;
  });
}

/* Le geste « repousser la page pour revenir a la vue d'ensemble » vivait ici,
   sur cent-soixante-dix lignes. Il est parti, et c'etait la bonne decision.

   Il dupliquait une destination qui a un bouton permanent : Apercu est le
   premier onglet de la barre du bas, toujours a un appui. Un geste qui ne fait
   gagner aucun geste mais qui peut se tromper est un solde negatif.

   Il s'armait au sommet de la page, quand `scrollY` valait zero — exactement
   la condition ambigue qui a coute quatre tentatives sur la feuille des fiches,
   ou un doigt qui descend peut vouloir defiler ou fermer. Meme maladie, meme
   application.

   Et il portait une liste d'exclusions ecrite a la main — champs de saisie,
   tableaux defilants, ruban de reperes, lignes de compte, listes mobiles —
   qu'il fallait etendre a chaque nouveau composant qui defile ou qui glisse.
   Le prochain aurait vu son geste vole en silence. Ce depot a deja supprime
   plusieurs listes de ce genre, toujours pour la meme raison.

   Partent avec lui : la poignee dessinee en tete des pages autres que
   l'accueil, et le calque qui donnait la profondeur pendant le glissement. */

/* =============================================================
   ÉVÉNEMENTS
   ============================================================= */
function bindGlobal() {
  /* Chaque changement d'adresse compte : c'est ce qui permet au retour des pages
     sans parent de savoir s'il y a un « avant » dans l'application. Un signet
     ouvert directement n'en a pas, et `history.back()` sortirait du site. */
  window.addEventListener('hashchange', () => { navsInternes++; render(); });

  /* Le pincement n'est pas bloque, et c'est delibere.

     On a essaye : refuser les evenements `gesturestart` de WebKit interdit bien
     le zoom sur Safari, faute de quoi rien ne le fait — le viewport est ignore
     depuis iOS 10 et `touch-action: manipulation` n'arrete que le double-tap.
     Retire le jour meme : « si c'est bizarre de faire ça on fait pas. »

     Ça l'etait deux fois. C'est l'anti-motif que ce refus d'iOS existe pour
     empecher — une page n'a pas a empecher quelqu'un d'agrandir ce qu'il lit
     mal. Et surtout ça ne reglait pas le defaut signale : le zoom qui « reste
     zoome » est le recadrage automatique sur un champ sous 16px, qui ne se defait
     jamais, la ou un pincement se defait en pincant. Le correctif est dans la
     feuille de style, sur la taille des champs. Un blocage qui ne supprime pas le
     symptome est un blocage faux. */

  /* La barre du haut se retire quand on descend, et revient après un battement.

     Le défaut que ça corrige n'est pas théorique : en lisant, on remonte sans
     arrêt de quelques dizaines de pixels — pour relire une ligne, pour revoir un
     total qu'on vient de dépasser. Chacune de ces corrections faisait retomber
     la barre sur le contenu, et elle repartait au geste suivant. Une barre qui
     entre et sort à ce rythme se remarque plus que ce qu'elle contient.

     Le battement est donc une distance **cumulée** vers le haut, un tiers de la
     hauteur de l'écran, et toute reprise vers le bas la remet à zéro. C'est ce
     qui distingue une correction de lecture d'une vraie intention de revenir en
     haut : la première fait quarante pixels et s'arrête, la seconde est un
     lancer. On garde donc l'essentiel de `enterAlways` — la barre revient sans
     qu'on ait à atteindre le sommet, sans quoi la cloche et le profil se
     paieraient d'un retour complet — mais elle ne suit plus le bruit.

     Un tiers de l'écran et non un nombre de pixels : sur un iPhone SE et sur une
     tablette, le même geste couvre une fraction d'écran comparable, pas une
     distance comparable. Relu à chaque événement, donc juste après une rotation.

     Les autres garde-fous ne bougent pas, chacun pour un défaut qu'on obtient
     sans lui.

     Le seuil : sous 64 px on est encore en haut de page, et la barre y reste.
     Sinon le moindre geste vers le bas la ferait disparaître alors qu'on n'a rien
     gagné à la cacher — la page n'a pas encore de contenu au-dessus. C'est aussi
     lui qui court-circuite le battement : arriver au sommet rend la barre sans
     rien avoir à cumuler, sinon la page du haut pourrait rester décapitée.

     Le pas : un doigt posé tremble de deux ou trois pixels, et une barre qui joue
     sur ce bruit clignote. Six pixels, c'est un geste.

     Les fenêtres : `gelerFond()` met le corps en `position: fixed`, ce qui
     déclenche un événement de défilement au moment où l'on ouvre et un autre à la
     fermeture. Ni l'un ni l'autre n'est un geste de lecture, et sans ce test la
     barre se retirait à l'ouverture d'une fenêtre pour rester cachée derrière
     elle.

     Une sous-page ne cache jamais la sienne : c'est là qu'un « retour » vit, et
     iOS fait la même exception. */
  (() => {
    const SEUIL = 64, PAS = 6;
    const battement = () => Math.round(window.innerHeight / 3);
    let dernier = Math.max(0, window.scrollY);
    /* Ce qu'on a remonté depuis le dernier changement de sens. C'est la seule
       mémoire du mécanisme, et elle ne vaut que pour le geste en cours. */
    let remontee = 0;
    const suivre = () => {
      /* Ni pendant une fenetre, ni pendant que le tiroir est ouvert : dans les deux
         cas le defilement residuel n'est pas un geste de lecture, et retirer la
         barre sous un tiroir qu'elle contient le decrocherait de l'ecran. */
      if (modalesOuvertes > 0 || document.body.classList.contains('nav-open')) return;
      const y = Math.max(0, window.scrollY);
      const delta = y - dernier;
      if (Math.abs(delta) < PAS) return;
      dernier = y;

      if (document.body.classList.contains('sous-page')) {
        document.body.classList.remove('haut-cache');
        remontee = 0;
        return;
      }
      if (delta > 0) {
        /* On descend : la barre part passé le seuil de page, et le battement
           repart de zéro. C'est ce zéro qui fait la différence entre lire et
           vouloir revenir : quarante pixels vers le haut suivis de vingt vers le
           bas ne s'additionnent pas. */
        remontee = 0;
        document.body.classList.toggle('haut-cache', y > SEUIL);
        return;
      }
      remontee += -delta;
      if (y <= SEUIL || remontee >= battement()) {
        document.body.classList.remove('haut-cache');
        remontee = 0;
      }
    };
    window.addEventListener('scroll', suivre, { passive: true });
    /* Changer d'écran rend la barre : on arrive en haut d'une page neuve, et une
       barre restée cachée depuis l'écran précédent se lirait comme une bande
       manquante. */
    window.addEventListener('hashchange', () => {
      dernier = 0;
      remontee = 0;
      document.body.classList.remove('haut-cache');
    });
  })();

  // clics sur actions
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const fn = ACTIONS[btn.dataset.action];
    if (fn) { e.preventDefault(); fn(btn); }
  });

  // Saisie : à la volée dans l'état, re-rendu au blur. Écouté sur tout le
  // document pour que les champs des fenêtres d'aperçu marchent aussi.
  /* Ecrire a la frappe, sauf dans un bloc qui attend son bouton.

     Toute l'application ecrit a chaque frappe : c'est ce qui permet de corriger
     un montant sans rien valider, et la barre laterale suit. Une fiche de ligne
     de titres, elle, se relit avant de compter — on y change une quantite apres
     un achat, et rien ne disait si c'etait pris en compte. Elle porte donc
     `data-differe`, et ses champs n'entrent dans l'etat qu'au clic sur
     « Enregistrer ». Fermer sans enregistrer les abandonne, et le demande. */
  document.addEventListener('input', e => {
    const f = e.target.closest('[data-path]');
    if (!f) return;
    const bloc = f.closest('[data-differe]');
    if (bloc) { bloc.dataset.differe = 'sale'; return; }
    applyField(f);
    /* Le seul cas ou l'envoi au cloud se regroupe : taper « 12500 » produit cinq
       de ces evenements, et une meme cle n'accepte qu'une ecriture par seconde.
       Partout ailleurs — un bouton, une fenetre validee — l'envoi part tout de
       suite, parce que le geste est fini. */
    Store.save({ differe: true });
    marquerEcrit(f);
    renderSidebar();
    majApercu();                       // les totaux de la fenêtre suivent
  });
  // Renommer une catégorie de dépenses : au blur, pour ne pas déplacer les
  // montants à chaque frappe.
  /* Un routeur pour les listes deroulantes, comme il en existe un pour les clics.

     `data-action` route vers ACTIONS depuis un seul ecouteur ; `data-action-change`
     n'avait rien de tel, chaque cas ayant son propre `addEventListener` avec son
     selecteur ecrit a la main. J'ai pose un attribut en supposant le routeur
     existant : la liste du type de compte ne declenchait donc rien, ni changement
     ni message, et seule la relecture du code l'a montre.

     Les six cas existants gardent leurs ecouteurs et ne passent pas par ici :
     aucun n'a d'entree dans ACTIONS, donc ce routeur ne les trouve pas et ne
     double personne. Les prochains n'auront plus qu'a exister dans ACTIONS. */
  document.addEventListener('change', e => {
    const sel = e.target.closest('[data-action-change]');
    const nom = sel && sel.dataset.actionChange;
    if (nom && ACTIONS[nom]) ACTIONS[nom](sel);
  });

  document.addEventListener('change', e => {
    const sel = e.target.closest('[data-action-change="proj-horizon"]');
    if (!sel) return;
    projHorizon = +sel.value;
    Store.save(); render();
  });

  /* L'ecouteur des listes de duree est parti avec elles : l'echelle des plages
     est fixe, cinq boutons, plus aucun « ⋯ » a ouvrir. Il ne restait qu'un
     `change` a l'ecoute d'un selecteur que plus rien ne produit. */

  /* Les listes d'année et le filtre d'avoirs. */
  document.addEventListener('change', e => {
    const sel = e.target.closest('select.annee[data-action-change]');
    if (!sel) return;
    const fn = ACTIONS[sel.dataset.actionChange];
    if (fn) fn({ dataset: { year: sel.value, type: sel.value } });
  });

  /* Renommer un bien renomme son contenant du même coup : ils ne désignent
     qu'une chose, ils ne doivent porter qu'un nom. */
  document.addEventListener('change', e => {
    const champ = e.target.closest('[data-action-change="renommer-bien"]');
    if (!champ) return;
    const nom = champ.value.trim();
    const c = compteById(champ.dataset.compte);
    if (!c || !nom) { render(); return; }
    for (const l of (c.lignes || [])) if ((l.classe || 'immobilier') === 'immobilier') l.libelle = nom;
    const etab = ETABS().find(x => x.id === c.etabId);
    if (etab && COMPTES().filter(x => x.etabId === etab.id).length === 1) etab.nom = nom;
    Store.save(); render();
    toast(`${trad('Renommé en')} ${guill(nom)}`);
  });

  document.addEventListener('change', e => {
    const champ = e.target.closest('[data-action-change="rename-category"]');
    if (!champ) return;
    const ancien = champ.dataset.cat, nouveau = champ.value.trim();
    if (!nouveau || nouveau === ancien) { champ.value = ancien; return; }
    if (!renameExpenseCategory(ancien, nouveau)) {
      champ.value = ancien;
      toast(trad('Ce nom est déjà pris'));
      return;
    }
    Store.save(); render();
    toast(`${guill(ancien)} ${trad('renommée')} ${guill(nouveau)}`);
  });

  document.addEventListener('change', e => {
    const f = e.target.closest('[data-path]');
    if (!f) return;
    const bloc = f.closest('[data-differe]');
    if (bloc) { bloc.dataset.differe = 'sale'; return; }
    applyField(f);
    /* `change` clot une saisie — une liste choisie, un champ quitte — donc rien a
       regrouper : l'envoi part tout de suite. Seul `input`, caractere par
       caractere, a besoin du delai. */
    Store.save();
    marquerEcrit(f);
    /* Une liste ne reprend pas le focus, et c'est un correctif.

       Le rendu du focus existe pour les champs de texte : `render()` reconstruit
       le balisage a chaque frappe, et sans lui le curseur sauterait du champ des
       qu'on tape un chiffre. Sur une liste, il fait l'inverse de ce qu'on veut —
       on vient de choisir, le selecteur natif se referme, et lui rendre le focus
       le rouvre. Sur iPhone la liste restait donc ouverte apres le choix :
       « ça force a cliquer 2 fois ».

       Le `blur()` avant le rendu est la seconde moitie : sans lui, le selecteur
       natif survit a la destruction du `<select>` qui le portait, et flotte
       au-dessus d'un element qui n'existe plus. */
    const estListe = f.tagName === 'SELECT';
    if (estListe) f.blur();
    const path = estListe ? null : document.activeElement?.dataset?.path;
    render();
    majApercu();
    if (path) {
      const again = $(`[data-path="${CSS.escape(path)}"]`);
      if (again && again.focus) again.focus();
    }
    // une recherche de symbole vient d'être saisie : on identifie la ligne
    const m = path && path.match(/^positions\.(\d+)\.symbol$/);
    if (m) lookupSymbol(+m[1]);
  });

  // Ctrl+Z / ⌘Z : annule la dernière modification, hors champ de saisie
  document.addEventListener('keydown', e => {
    const key = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
    if (!key) return;
    const el = document.activeElement;
    if (el && /^(input|textarea|select)$/i.test(el.tagName)) return;  // laisse l'undo natif
    e.preventDefault();
    ACTIONS['undo']();
  });

  /* Pas de « Entrée ajoute la ligne suivante » dans le tableau des charges
     fixes : il a existé une heure, et il est parti avec les champs qu'il visait.

     Le tableau du bureau éditait ces lignes en place, et Entrée y enchaînait les
     saisies. Le tableau passe maintenant par la fenêtre, comme celui des mois de
     dépenses, donc il n'y a plus de champ où enchaîner quoi que ce soit. Un
     écouteur qui cherche un `data-path` disparu ne se plaint pas, il ne fait
     simplement plus rien — c'est pourquoi il est retiré plutôt que laissé là.

     Le geste survit là où il a un sens, dans le détail d'une catégorie de
     dépenses : cette fenêtre porte de vraies lignes de saisie. */

  /* Le patrimoine du menu n'est pas un <button> — c'est un montant qu'on
     peut toucher. Il faut donc lui rendre a la main ce qu'un bouton donne
     gratuitement : Entree et Espace l'activent. */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('[role="button"][data-action]');
    if (!el) return;
    e.preventDefault();
    ACTIONS[el.dataset.action]?.(el);
  });

  /* « h » masque les montants. Sans modificateur : Ctrl+H ouvre l'historique
     du navigateur, et un raccourci qu'on doit chercher ne sert a rien dans
     le moment ou l'on en a besoin — quelqu'un qui s'approche de l'ecran. */
  document.addEventListener('keydown', e => {
    if (e.key !== 'h' && e.key !== 'H') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable)) return;
    e.preventDefault();
    ACTIONS['toggle-masque']();
  });

  monteGlissementFermeture($('#modal'));
  monteGlissementFermeture($('#confirm'));
  monteVideChamp();

  /* La molette ne doit pas changer une liste deroulante.
     Chrome et Firefox font defiler les options d'un `select` survole ou
     actif : dans un tableau large ou l'on fait defiler beaucoup, un coup de
     molette suffit a changer la classe d'une ligne sans que rien ne le
     signale. La valeur est enregistree aussitot, et rien ne distingue ensuite
     l'accident d'un choix. On laisse la molette faire defiler la page. */
  document.addEventListener('wheel', e => {
    const sel = e.target.closest?.('select');
    if (sel && document.activeElement === sel) sel.blur();
  }, { passive: true, capture: true });

  /* --- tiroir : burger sur tablette, logo sur téléphone ---------------------
     L'onglet « Plus » ouvrait ce tiroir ; sa place dans la barre est passée à
     Comptes. Sous 768 px, c'est donc le logo qui l'ouvre — la seule largeur où
     le burger est masqué, et celle où « retour à l'accueil » ne servait à rien,
     Aperçu étant le premier onglet.

     Le lien garde son `href` : au-dessus de 768 px il mène à la vue d'ensemble,
     et sans JavaScript il y mène toujours. La largeur est relue à chaque appui
     plutôt que mémorisée, sinon une rotation d'écran laisserait le geste de
     l'orientation précédente. */
  const burger = $('#burger'), backdrop = $('#navBackdrop'), profil = $('#btnProfil');
  const setNav = open => {
    document.body.classList.toggle('nav-open', open);
    /* Ouvrir le tiroir rend la barre du haut. Deux raisons, et la seconde est un
       garde-fou : le tiroir monte du bas de la fenetre, mais il est un enfant de
       cette barre — un `transform` sur elle en ferait le bloc conteneur du tiroir,
       qui s'ouvrirait alors hors de l'ecran. Et sur le fond, un menu qu'on ouvre
       n'a pas de raison de cohabiter avec une barre a moitie partie. */
    if (open) document.body.classList.remove('haut-cache');
    for (const b of [burger, profil]) {
      if (!b) continue;
      b.setAttribute('aria-expanded', String(open));
      b.setAttribute('aria-label', trad(open ? 'Fermer le menu' : 'Ouvrir le menu'));
    }
    backdrop.hidden = !open;
    majOnglets();
  };
  const bascule = () => setNav(!document.body.classList.contains('nav-open'));
  burger.addEventListener('click', bascule);
  /* Le bouton profil est la porte de la feuille. Le logo, lui, redevient un
     logo : il mène à l'accueil, et rien d'autre. */
  profil?.addEventListener('click', () => { retourHaptique(); fermeNotifs(); bascule(); });

  /* L'appui sur le logo se voit aussi au doigt.

     Safari sur iOS n'applique pas `:active` au toucher tant qu'aucun écouteur
     tactile ne vit sur l'élément : la règle d'appui existait et ne jouait jamais
     là où elle comptait. Le halo de survol, lui, a été rangé sous
     `@media (hover: hover)` — à raison, il restait allumé après un appui — si
     bien que le téléphone n'avait plus aucun retour.

     Le seuil de 160 ms est ce qui rend un tap visible : posée et retirée au
     rythme du doigt, la classe pouvait vivre 40 ms et l'animation ne se voyait
     pas. Au-delà du seuil, c'est la levée du doigt qui commande — un appui long
     garde donc le logo enfoncé, ce qui est le comportement d'une touche. */
  const marque = $('.brand');
  if (marque) {
    let debut = 0, fin = null;
    marque.addEventListener('pointerdown', () => {
      clearTimeout(fin);
      marque.classList.add('tape');
      debut = performance.now();
    });
    const lever = () => {
      clearTimeout(fin);
      fin = setTimeout(() => marque.classList.remove('tape'),
        Math.max(0, 160 - (performance.now() - debut)));
    };
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      marque.addEventListener(ev, lever);
    }

    /* Et il ramene a l'accueil, tout en haut — c'est ce qu'on attend d'un logo,
       et c'est ce qu'il faisait avant que chaque vue retienne sa position. « Je
       reviens sur la page mais pas en haut, c'est pas bon. »

       Deux chemins, parce que le geste a deux issues. Depuis un autre ecran il
       navigue, et c'est le rendu qui suit qui doit ignorer la position retenue.
       Depuis l'accueil lui-meme l'adresse ne change pas, donc rien ne se rend, et
       il faut remonter ici : ce cas-la ne se voit jamais en essayant depuis une
       autre page. Meme glissement doux que le reappui sur un onglet du bas.

       Ce bloc reste apres le cablage tactile ci-dessus, et pas avant : un
       controle lit ce qui suit `$('.brand')` pour verifier que le `pointerdown`
       existe, et l'en eloigner l'a fait echouer. */
    marque.addEventListener('click', () => {
      /* On compare l'adresse entiere et non la vue : l'accueil a des
         sous-onglets, et venir du deuxieme vers le premier est bien une
         navigation, avec sa position retenue a ignorer. */
      if (location.hash !== marque.getAttribute('href')) { retourHautDemande = true; return; }
      if (window.scrollY > 0) {
        window.scrollTo({ top: 0,
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    });
  }
  backdrop.addEventListener('click', () => setNav(false));
  /* Un lien ferme la feuille, et un bouton qui navigue aussi : les deux mènent
     ailleurs, elle n'a plus de raison d'être ouverte. */
  $('#nav').addEventListener('click', e => {
    const porte = e.target.closest('a, [data-action="goto"]');
    if (!porte) return;
    setNav(false);
    /* Meme regle que la barre du bas et le logo : le menu est une navigation,
       elle arrive en haut. La memoire de position ne sert que le retour d'une
       fiche vers sa liste. */
    const href = porte.getAttribute?.('href');
    if (href && href !== location.hash) retourHautDemande = true;
  });
  /* Retoucher l'onglet où l'on est déjà remonte la page.
     C'est la convention de toutes les barres d'onglets, et elle manquait :
     l'adresse ne changeant pas, le clic ne déclenchait rien du tout. Sur une
     page longue, redescendre à la main pour retrouver le haut est la seule
     manœuvre que l'application imposait encore.

     L'icône répond d'un petit bond — sans lui, sur une page déjà en haut, le
     geste n'aurait aucun effet visible et on le croirait perdu. */
  $('#tabbar')?.addEventListener('click', e => {
    const lien = e.target.closest('a');
    if (!lien) return;
    retourHaptique();
    /* La barre entiere accuse l'appui, d'un tassement d'un pour cent.

       C'est l'animation des barres d'onglets du systeme : la pilule se
       tasse une fraction de seconde sous le doigt, comme une touche qui
       s'enfonce. Elle vaut pour tous les onglets, y compris ceux qui changent
       de page — c'est le seul retour tactile avant que la nouvelle vue arrive,
       et sans elle un appui sur une page lente ne repond pas.

       Un pour cent parce que la barre est large : sur 355 px, la meme
       proportion qui passe pour un appui sur un bouton deviendrait une secousse.
       On retire la classe avant de la reposer, sinon deux appuis rapproches ne
       rejoueraient pas l'animation. */
    const barre = e.currentTarget;
    barre.classList.remove('tape');
    void barre.offsetWidth;
    barre.classList.add('tape');
    setTimeout(() => barre.classList.remove('tape'), 400);

    setNav(false);
    /* « Deja sur place » se juge sur l'adresse, pas sur la vue.

       Laisser le lien naviguer suffit a tout regler : `currentView()` remet le
       premier sous-onglet des qu'on arrive sur l'adresse de base, et c'est deja
       la regle ecrite pour le menu lateral. Le rebond et le retour en haut
       restent pour le seul cas qu'ils visaient — reappuyer sur l'onglet ou l'on
       est deja, ou l'adresse ne bouge pas et ou rien ne se produirait. */
    /* Un appui sur la barre arrive en haut de la page, toujours.

       La memoire de position par vue avait fini par couvrir ce chemin-la
       aussi : revenir sur Apercu par la barre rendait la page a 1 500 px,
       la ou on l'avait laissee la veille. « De nouveau le bug sur mobile
       quand je retourne sur apercu, ça doit revenir en haut de la page » —
       et c'est la regle qu'il avait deja donnee pour les onglets : « le
       changement de menu, oui on doit arriver en haut forcement ».

       Le drapeau se pose sur le GESTE, comme pour le logo : la memoire de
       position reste entiere pour l'autre chemin, revenir d'une fiche a la
       liste qu'on parcourait. C'est elle qu'on veut la-bas, et lui seul. */
    if (lien.getAttribute('href') !== location.hash) { retourHautDemande = true; return; }
    e.preventDefault();
    lien.classList.remove('rebond');
    void lien.offsetWidth;
    lien.classList.add('rebond');
    setTimeout(() => lien.classList.remove('rebond'), 420);
    if (window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setNav(false); });

  /* Le panneau des notifications se ferme comme tous les panneaux flottants :
     au premier appui ailleurs, et à Échap. Le bouton de la cloche est exclu,
     sinon il refermerait ce qu'il vient d'ouvrir. */
  document.addEventListener('pointerdown', e => {
    const p = $('#panneauNotifs');
    if (!p || p.hidden) return;
    if (e.target.closest('#panneauNotifs, #btnCloche')) return;
    fermeNotifs();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fermeNotifs(); });
  /* Tout ce qui navigue depuis le panneau le referme : `goto` ferme les fenêtres
     d'aperçu, pas celui-ci. La croix, elle, le laisse ouvert — on masque souvent
     deux lignes de suite. */
  $('#panneauNotifs')?.addEventListener('click', e => {
    if (e.target.closest('[data-action="goto"]')) fermeNotifs();
  });

  /* La feuille se referme en la repoussant vers le bas.

     Elle monte du bas : le meme chemin doit la faire sortir, et c'est le geste
     de toutes les feuilles du systeme. Sans lui il fallait viser le voile,
     alors que le pouce est deja pose sur la feuille.

     Elle suit le doigt — une feuille qui attend la fin du geste pour reagir
     donne l'impression d'avoir rate le mouvement. Vers le haut elle ne bouge
     presque plus : elle est deja ouverte, rien a gagner. Un lancer vif referme
     meme a mi-course.

     L'axe du geste est aussi celui du defilement : la feuille ne se laisse
     repousser que si elle est en haut de son contenu. Sinon le doigt defile,
     comme dans n'importe quelle liste. */
  (() => {
    const nav = $('#nav');
    if (!nav) return;
    let y0 = null, x0 = 0, dy = 0, sens = null, trame = 0, vitesse = 0, dernierY = 0, dernierT = 0;

    const enHaut = () => nav.scrollTop <= 0;
    const poser = () => {
      trame = 0;
      const d = dy < 0 ? dy / 6 : dy;      // vers le haut : resistance forte
      nav.style.transform = 'translate3d(0, ' + d + 'px, 0)';
    };
    const relacher = () => {
      nav.style.transition = '';
      nav.style.transform = '';
      nav.style.willChange = '';
    };

    nav.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || !document.body.classList.contains('nav-open')) return;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
      dy = 0; sens = null; vitesse = 0;
      dernierY = y0; dernierT = performance.now();
      nav.style.transition = 'none';
      nav.style.willChange = 'transform';
    }, { passive: true });

    nav.addEventListener('touchmove', e => {
      if (y0 === null) return;
      const ey = e.touches[0].clientY - y0, ex = e.touches[0].clientX - x0;
      if (sens === null) {
        if (Math.abs(ex) < 8 && Math.abs(ey) < 8) return;
        sens = Math.abs(ey) > Math.abs(ex) * 1.2 ? 'vertical' : 'lateral';
        /* Un geste de biais ne doit pas trainer la feuille, et une feuille
           deroulee doit defiler avant de se refermer. */
        if (sens === 'lateral' || (ey > 0 && !enHaut())) { relacher(); y0 = null; return; }
      }
      const t = performance.now();
      /* Un intervalle plancher : deux evenements separes d'une fraction de
         milliseconde donneraient une vitesse absurde, et une simple secousse
         du pouce refermerait la feuille. */
      const dt = Math.max(8, t - dernierT);
      vitesse = vitesse * 0.7 + ((e.touches[0].clientY - dernierY) / dt) * 0.3;
      dernierY = e.touches[0].clientY; dernierT = t;
      dy = ey;
      if (!trame) trame = requestAnimationFrame(poser);
    }, { passive: true });

    const fin = () => {
      if (y0 === null) return;
      if (trame) { cancelAnimationFrame(trame); trame = 0; }
      const hauteur = nav.getBoundingClientRect().height || innerHeight;
      const ferme = dy > hauteur * 0.3 || (vitesse > 0.6 && dy > 70);
      y0 = null; sens = null;
      if (!ferme) {
        /* Retour en place : la meme courbe que partout ailleurs. */
        nav.style.transition = 'transform .28s cubic-bezier(.16,1,.3,1)';
        nav.style.transform = '';
        setTimeout(() => { nav.style.transition = ''; nav.style.willChange = ''; }, 300);
        return;
      }
      /* On laisse la transition du CSS finir la sortie, en repartant de la
         position reelle du doigt : la fermeture prolonge le geste au lieu de
         sauter a son debut. */
      nav.style.transition = 'transform .2s cubic-bezier(.3,0,.2,1)';
      nav.style.transform = 'translate3d(0, ' + hauteur + 'px, 0)';
      setNav(false);
      setTimeout(relacher, 210);
    };
    nav.addEventListener('touchend', fin);
    nav.addEventListener('touchcancel', fin);
  })();

  // --- fenêtre d'aperçu ---
  $('#modalClose').addEventListener('click', closeApercu);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeApercu(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden) closeApercu();
  });

  /* Le rechargement remplace le `render()` : il repeint tout, y compris le fond
     du corps, que l'attribut seul ne suffit pas a repeindre. Voir applyTheme. */
  $('#themeToggle').addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  });

  /* Langue et thème depuis la vue Préférences. */
  document.addEventListener('change', e => {
    const lang = e.target.closest('[data-action-change="set-lang"]');
    if (lang) { setLang(lang.value); location.reload(); return; }
    const theme = e.target.closest('[data-action-change="set-theme"]');
    if (theme) { applyTheme(theme.value, true); }
  });
}

const THEME_KEY = 'wealth-dashboard:theme';
function currentTheme() {
  return document.documentElement.dataset.theme
    || (() => { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } })()
    || 'dark';
}
/* Le theme s'ecrit, puis la page se recharge. Comme la langue, et pour une
   raison plus betement technique.

   Changer l'attribut suffit a repeindre la barre laterale, les cartes, les
   textes, les graphiques : tout suit les variables. Tout, sauf le fond du corps.
   Mesure sur ce navigateur, thème passe en clair sans rechargement :
   `getComputedStyle(document.documentElement)` rend bien #f7f9fb, la variable
   `--page` lue sur le corps rend #f7f9fb, un element cree a l'instant avec
   `background: var(--page)` rend #f7f9fb — et le corps, lui, reste peint en
   #08090b. Il ne se repeint qu'au rechargement suivant. On obtenait donc des
   cartes claires posees sur une page noire, jusqu'a ce que quelqu'un recharge.

   Trois pistes essayees avant celle-ci : `background-color` au lieu du raccourci
   `background` (meme resultat), retirer la declaration en double sur le corps,
   forcer un cycle de rendu. Le rechargement est la seule qui tienne, et il ne
   coute rien ici : l'etat est deja enregistre, aucune saisie ne se perd, et le
   selecteur de langue fait exactement ce geste depuis toujours.

   Le drapeau, enfin : appeler ceci au demarrage rechargerait en boucle. Il reste
   donc faux quand on applique le theme lu au chargement, et vrai quand c'est
   quelqu'un qui vient de le changer. */
function applyTheme(nom, recharger = false) {
  document.documentElement.dataset.theme = nom;
  try { localStorage.setItem(THEME_KEY, nom); } catch (e) {}
  if (recharger) location.reload();
}

/* Saisie d'un symbole : on identifie la ligne (nom, devise, cours) sans
   attendre. L'ISIN n'est pas récupérable dans ce sens — aucune source
   gratuite ne fait symbole → ISIN de façon fiable. */
async function lookupSymbol(i) {
  const p = Store.state.positions[i];
  if (!p) return;
  const sym = (p.symbol || '').trim().toUpperCase();
  if (!sym) return;
  if (Quotes.isOnline() === null) await Quotes.health();
  if (Quotes.isOnline() === false) return;

  try {
    const r = await fetch(`${Quotes.BASE}/api/quotes?symbols=${encodeURIComponent(sym)}`, { cache: 'no-store' });
    const q = (await r.json()).quotes?.[0];
    if (!q || q.error || !q.price) {
      toast(`${trad('Symbole')} ${guill(sym)} ${trad('introuvable')}`);
      return;
    }
    p.symbol = q.symbol || sym;
    if (q.currency) p.currency = q.currency;
    // on ne remplace jamais un nom que tu as choisi
    if (!p.name || p.name === 'Nouvelle ligne') p.name = q.name || p.symbol;
    Store.save();
    await Quotes.refresh();          // cours et taux de change cohérents
    render();
    toast(`${q.name || p.symbol} · ${q.price} ${q.currency || ''}`);
  } catch (e) {
    toast(trad('Recherche impossible :') + ' ' + e.message);
  }
}

function showFileModeBanner() {
  // En file://, certains navigateurs refusent l'accès au stockage : ce bandeau
  // ne doit surtout pas être ce qui casse le démarrage.
  try { if (sessionStorage.getItem('wd:fileBannerSeen')) return; } catch (e) {}
  const el = document.createElement('div');
  el.className = 'file-banner';
  el.innerHTML = `
    <span>📄</span>
    <div><b>${trad('Mode fichier.')}</b> Les cours de bourse ne peuvent pas être récupérés, et
      tes données sont enregistrées <b>séparément</b> de celles du mode serveur.
      Pour n'avoir qu'un seul jeu de données, lance plutôt
      <code>python serve.py</code>.</div>
    <button class="btn ghost sm" type="button">Compris</button>`;
  el.querySelector('button').addEventListener('click', () => {
    try { sessionStorage.setItem('wd:fileBannerSeen', '1'); } catch (e) {}
    el.remove();
  });
  $('.main').insertBefore(el, $('#view'));
}

function applyField(f) {
  const path = f.dataset.path;
  if (f.type === 'checkbox') { setPath(path, f.checked); return; }
  if (f.type === 'number') { setPath(path, f.value === '' ? '' : Number(f.value)); return; }
  // une liste peut porter un nombre ou un booléen : sans ça on enregistrerait
  // la chaîne, et « false » serait vrai
  if (f.dataset.type === 'num') { setPath(path, Number(f.value)); return; }
  if (f.dataset.type === 'bool') { setPath(path, f.value === 'true'); return; }

  // L'ISIN fait autorité : s'il change, le symbole dérivé devient caduc et
  // sera re-résolu à la prochaine actualisation des cours.
  const m = path.match(/^positions\.(\d+)\.isin$/);
  if (m) {
    const p = Store.state.positions[+m[1]];
    const next = f.value.trim().toUpperCase();
    if (p && next !== (p.isin || '')) p.symbol = '';
    setPath(path, next);
    return;
  }

  setPath(path, f.value);
}

/* =============================================================
   DÉMARRAGE
   ============================================================= */
(async function init() {
  /* Sombre par défaut : c'est le mode dans lequel on lit des chiffres de
     marché, et le thème clair reste à un clic dans Préférences. */
  try {
    document.documentElement.dataset.theme =
      localStorage.getItem('wealth-dashboard:theme') || 'dark';
  } catch (e) { document.documentElement.dataset.theme = 'dark'; }
  Store.load();
  Store.autoBackup();
  translateStatic();          // libellés du menu, avant le premier rendu
  bindGlobal();
  render();

  /* L'écran de lancement s'efface une fois la première image dessinée, pas
     après un délai : il couvre le vrai temps de démarrage — lecture du
     stockage, migration, rendu — et rien de plus. Sur une machine rapide il
     ne fait que passer, ce qui est exactement ce qu'on veut.
     Deux trames pour laisser le navigateur peindre : sans elles, l'écran
     part avant que la page soit à l'image, et on voit un fond nu. */
  const lancement = $('#lancement');
  if (lancement) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      lancement.classList.add('parti');
      setTimeout(() => lancement.remove(), 400);
    }));
  }

  // Service worker : uniquement en http(s). En file:// il n'est pas autorisé,
  // et le mode local fonctionne déjà sans réseau.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW non enregistré', e));
  }

  // Ouvert en double-cliquant index.html : le stockage est propre à l'origine
  // « file:// », donc distinct de celui du mode serveur. Deux jeux de données
  // qui divergent en silence, c'est le piège à éviter.
  if (location.protocol === 'file:') showFileModeBanner();

  // Synchro cloud (Cloudflare KV) : prioritaire quand elle est disponible.
  CloudSync.setOnChange(() => { if (currentView() === 'data') render(); });
  /* Un refus d'ecriture se dit la ou l'on se trouve. La cloche le garde ensuite
     tant qu'il dure — c'est le seul etat de l'application ou fermer fait perdre
     quelque chose. */
  CloudSync.setOnConflit(() => {
    toast(trad('Modification gardée ici : une autre version existe en ligne'));
    render();
  });
  try {
    /* Pas de lecture en demonstration : elle remplacerait la demo par les
       vraies donnees a chaque chargement. Une demo ne parle a personne. */
    const cloud = modeDemo() ? { available: false } : await CloudSync.init();
    if (cloud.adopted) {
      /* Cet appareil était simplement en retard, sans modification locale :
         on prend la version en ligne sans rien demander.

         Avec une sauvegarde, désormais. Cette branche remplace tout l'état sur
         la foi d'un repère, et le repère a déjà menti — voir la note de
         `init()` dans cloudsync.js. Le remplacement se fait sans question par
         construction, donc la seule chose qui rende l'erreur réparable est un
         point de retour : Données → sauvegardes. Elle ne coûte rien et elle
         couvre le jour où ce raisonnement se trompera encore. */
      Store.addBackup('avant adoption de la version en ligne');
      Store.state = cloud.data;
      Store.migrate();
      refreshAccounts();
      try { localStorage.setItem(cleStockage(), JSON.stringify(Store.state)); } catch (e) {}
      render();
      toast(trad('Données à jour depuis le cloud'));
    } else if (cloud.newer) {
      /* Vrai conflit : cet appareil porte des modifications jamais envoyées
         et le cloud a bougé de son côté. Là seulement, on demande. */
      const ok = await askConfirm(
        trad('Deux versions différentes de tes données') + '\n\n'
        + trad("Cet appareil a des modifications qui n'ont jamais été envoyées, et une "
        + 'version plus récente existe en ligne.') + '\n\n'
        + `${trad('En ligne :')} ${new Date(cloud.at).toLocaleString(locale())}\n`
        + `${trad('Ici :')} ${cloud.localAt ? new Date(cloud.localAt).toLocaleString(locale()) : trad('inconnue')}\n\n`
        + trad("Charger la version en ligne ? (Annuler garde celle de cet appareil et l'envoie.)"),
        { danger: false, ok: 'Charger celle en ligne' });
      if (ok) {
        Store.addBackup('avant chargement cloud');
        Store.state = cloud.data;
        Store.migrate();
        /* La version qu'on vient de lire devient la base des ecritures suivantes.
           Sans ce reperage, le `Store.save()` juste apres declarerait avoir lu une
           version qui n'est plus en place, et le serveur le refuserait. */
        CloudSync.noterVersionLue(cloud.at);
        Store.save();
      }
      else { await CloudSync.push({ force: true }); }
      render();
    } else if (cloud.aEnvoyer) {
      /* Cet appareil est en avance : il porte des modifications que le cloud
         n'a pas encore. Elles partent maintenant, sans attendre la prochaine
         frappe — c'est cette attente qui les perdait quand l'application
         passait en veille avant l'envoi différé.

         `force` parce que c'en est un, et un arbitrage deja tranche : `init()`
         vient de lire le cloud et d'etablir qu'il est plus ancien. La base que
         cet appareil connait ne peut pas correspondre — c'est justement le sens
         de « jamais envoye » — donc le garde-fou de filiation refuserait une
         ecriture qu'on sait pourtant la bonne. */
      await CloudSync.push({ force: true });
    } else if (cloud.empty) {
      await CloudSync.push({ force: true });   // premier envoi
    }
    /* Deux evenements, et c'est le second qui repare la perte.

       `pagehide` ne suffit pas sur telephone : verrouiller l'ecran ou passer a
       une autre application ne decharge pas la page, elle est gelee puis
       restauree. L'evenement n'arrive donc jamais, le minuteur d'envoi differe ne
       tire pas non plus — un onglet gele n'execute rien — et la modification
       reste dans le seul `localStorage`. Elle se perd au premier appareil qui
       pousse ensuite.

       `visibilitychange` vers `hidden` est le seul signal fiable de ce
       passage-la, sur iOS comme sur Android. C'est le dernier moment ou du code
       tourne encore, donc le dernier ou l'on peut ecrire.

       Les deux restent branches : `pagehide` couvre la fermeture d'onglet sur
       ordinateur, ou la page peut disparaitre sans jamais devenir cachee.
       `flushOnUnload` ne fait rien quand le corps n'a pas change, donc le double
       appel est sans effet. */
    if (cloud.available) {
      window.addEventListener('pagehide', () => CloudSync.flushOnUnload());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) CloudSync.flushOnUnload();
      });
      /* Le reseau revient : ce qui n'a pas pu partir repart. Un reessai arme
         couvre le serveur qui tousse, celui-ci couvre le tunnel et le mode
         avion — les deux cas ou insister n'aurait servi a rien. */
      window.addEventListener('online', () => CloudSync.push());
    }
  } catch (e) { console.warn('Synchro cloud indisponible', e); }


  // La passerelle de cours est optionnelle : on la sonde sans bloquer l'affichage.
  const online = await Quotes.health();
  majEtatCours();
  if (!online) { if (currentView() === 'positions') render(); return; }

  const last = Store.state.quotes?.lastRun;
  const stale = !last || (Date.now() - new Date(last)) > 10 * 60 * 1000;
  if (Store.state.meta.autoRefresh && stale) {
    try { await Quotes.refresh(); } catch (e) { console.warn('Cours indisponibles', e); }
  }
  render();

  /* Les cours ne se rafraichissaient qu'au chargement : un onglet laisse
     ouvert la journee affichait ceux du matin, sans rien qui le dise. On
     repasse toutes les cinq minutes, mais seulement quand ca sert — onglet
     visible et au moins une place ouverte. Marches fermes, le cours ne
     bouge pas : interroger Yahoo n'apprendrait rien. */
  const placeOuverte = () => Store.state.positions.some(p => {
    const s = marketStatus(p);
    return s && (s.cle === 'open' || s.cle === 'pre' || s.cle === 'post');
  });

  async function rafraichirSiUtile() {
    if (!Store.state.meta.autoRefresh) return;
    if (document.hidden || !Quotes.isOnline()) return;
    const l = Store.state.quotes?.lastRun;
    if (l && Date.now() - new Date(l) < 5 * 60 * 1000) return;
    if (!placeOuverte()) return;
    try { await Quotes.refresh(); render(); }
    catch (e) { console.warn('Cours indisponibles', e); }
  }

  setInterval(rafraichirSiUtile, 5 * 60 * 1000);
  // Revenir sur l'onglet apres une heure ailleurs doit montrer le cours du moment.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rafraichirSiUtile(); });

  // L'anciennete affichee vieillit toute seule : « il y a 3 min » doit
  // devenir « il y a 4 min » sans qu'on ait a recharger la page.
  setInterval(() => majEtatCours(), 60 * 1000);
})();
