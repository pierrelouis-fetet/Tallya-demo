
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

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

let champsEcrits = new WeakMap();
function marquerEcrit(champ) {
  if (!champ) return;
  champ.classList.remove('champ-ecrit');
  clearTimeout(champsEcrits.get(champ));
  requestAnimationFrame(() => {
    champ.classList.add('champ-ecrit');
    champsEcrits.set(champ, setTimeout(() => champ.classList.remove('champ-ecrit'), 900));
  });
}

function toast(msg, action) {
  msg = ponct(msg);
  const t = $('#toast');
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
  t.classList.remove('toast-sort');
  clearTimeout(t._t); clearTimeout(t._s);
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

const VIEWS = {
  overview:   { cle: 'overview', render: () => barreSousOnglets('overview') + (
    sousOngletActif.overview === 'historique' ? viewHistory()
    : sousOngletActif.overview === 'projection' ? viewObjective()
    : viewOverview()) },
  /* Budget porte trois sous-onglets, sur le meme motif que Marches et
     Allocation : une seule vue, qui choisit quoi rendre. Les routes
     `history` et `budget-cadre` sont des redirections, elles n'ont pas
     d'entree ici. Le titre suit l'onglet, sinon « Relevés mensuels »
     s'annoncerait « Budget ». */
  budget:     { cle: 'budget',      render: () => barreSousOnglets('budget') + (
    sousOngletActif.budget === 'cadre' ? viewBudgetCadre() : viewBudget()) },
  positions:  { cle: 'positions',   render: () =>
    barreSousOnglets('positions') + (
      sousOngletActif.positions === 'cible' ? viewRebalance()
      : viewPositions()) },
  allocation: { cle: 'allocation',  render: () =>
    barreSousOnglets('allocation') + viewAllocation() },
  accounts:   { cle: 'accounts',    render: viewAccounts },
  data:       { cle: 'data',        render: viewData },
  settings:   { cle: 'settings',    render: viewSettings },
  ficheCompte:{ cle: 'accounts',    render: () => viewFicheCompte(routeParam()?.id) },
  ficheEtab:  { cle: 'accounts',    render: () => viewFicheEtab(routeParam()?.id) },
};

const REDIRECTIONS = {
  /* Projection est devenue un onglet de la vue d'ensemble. Son adresse reste
     `#/objective` : l'entree du menu la porte, elle est dans des signets, et
     c'est aussi la route de l'onglet. */
  notifications: ['settings', 'settings', null],
  objective:   ['overview', 'overview', 'projection'],
  rebalance:   ['positions', 'positions', 'cible'],
  /* `#/patrimoine` est la route de l'onglet, `#/allocation` l'adresse de base
     de la vue : les deux doivent mener au meme endroit, sinon un signet pose
     avant que Patrimoine ait sa propre adresse tomberait sur Objectifs sans
     explication. */
  patrimoine:  ['allocation', 'allocation', 'reel'],
  /* `#/performance` a survecu a sa page. Un signet dessus menait a une plus-value
     latente et a un journal de ventes ; le journal est desormais dans Positions,
     donc c'est la qu'on renvoie. Une adresse qui a existe ne doit pas rendre une
     page vide. */
  performance: ['positions',  'positions',  'portefeuille'],
  /* `settings` n'est plus une redirection : Preferences est une vue a part
     entiere, avec son entree de menu. Elle n'a plus rien a rediriger. */
  history:       ['overview', 'overview', 'historique'],
  'budget-cadre': ['budget', 'budget', 'cadre'],
};

/* Les symboles dont le cours vient de changer, le temps d'un rendu.

   Rempli par `refresh-quotes` a partir des `changes` que la passerelle renvoie
   deja, vide par `render()` juste apres. Le meme mecanisme que la cascade des
   reperes : l'intention vit dans le geste, la marque ne survit pas au rendu
   qu'elle decore. Sans ce vidage, chaque re-rendu ferait re-clignoter des
   cours qui n'ont pas bouge depuis dix minutes. */
let coursFraichis = new Set();

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
  overview:   [['aujourdhui', 'Aujourd’hui', 'overview'],
               ['historique', 'Historique', 'history'],
               ['projection', 'Projection', 'objective']],
  positions:  [['portefeuille', 'Positions', 'positions'], ['cible', 'Cible', 'rebalance']],
  /* Allocation n'a plus qu'un onglet, et plus de barre : `barreSousOnglets`
     s'efface sous deux choix.

     Cible a rejoint Marches, et c'est son calcul qui l'y envoyait depuis le
     debut. `rebalanceRows()` part de `stockTotals()` : l'immobilier et le non
     cote sortent de sa base, comme toute classe qu'on met hors jeu. La page ne
     pilote que le portefeuille investissable, cash a investir compris.

     La paire « Patrimoine | Cible » avait donc l'air d'opposer le reel au vise
     alors qu'elle comparait deux perimetres differents : l'un montrait tout,
     l'autre les seuls titres. Deux bases sous une meme barre, ce que ce projet
     s'interdit ailleurs. Ce qui reste ici repond a une seule question — ou est
     l'argent — et une page a une question n'a pas besoin d'un selecteur.

     Le nom du menu ne bouge pas. « Allocation » nommait la paire, mais c'est
     aussi le mot que l'utilisateur emploie pour la chose elle-meme.

     « Cible » plutot que « Objectifs » : le mot « objectif » designe deja
     l'objectif mensuel de depenses et l'objectif de patrimoine a fin d'annee,
     et tout ce que la page contient s'appelle « cible » — la colonne, les
     menus, la base des pourcentages, jusqu'a sa route.

     Aucun onglet ne depend de l'adresse de base : `#/patrimoine`, `#/rebalance`
     et `#/positions` portent chacun la leur, donc l'ordre peut changer sans
     rendre un onglet inatteignable. Ce n'etait pas le cas avant. L'ancienne
     adresse de Cible reste servie par REDIRECTIONS, qui la mene desormais a
     Marches : un signet pose du temps d'Allocation continue d'ouvrir la bonne
     page. */
  allocation: [['reel', 'Allocation', 'patrimoine']],
  /* « Depenses » en premier : l'entree du menu s'appelle Budget, et c'est la
     qu'on arrive en la touchant. `currentView()` remet toujours l'adresse de
     base sur le premier onglet de cette liste, c'est donc l'ordre qui decide
     de l'atterrissage. La saisie devant, le reglage derriere — c'est deja ce
     que fait le menu de l'application, ou Donnees et Preferences sont en queue.

     « Charges fixes » et non « Charges » : dans la langue courante les deux
     mots disent la meme chose, de l'argent qui sort. C'est « fixes » qui porte
     l'opposition avec « Depenses », ce qui se repete contre ce qui varie.

     Cette barre en a porte trois, dont « Relevés ». La contrainte de largeur
     s'est donc relachee : a deux onglets ils font 168 px au lieu de 112, et
     « Charges fixes », mesure a 78 px de texte, y tient meme avec une pastille.
     L'invariant reste malgre tout — voir PASTILLE_SOUS_ONGLET — parce qu'il ne
     coute rien et qu'un troisieme onglet peut revenir. */
  budget:     [['depenses', 'Dépenses', 'budget'],
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

const PASTILLE_SOUS_ONGLET = {
  historique: () => currentMonthPending().missing,
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

/* Le choix d'un jeu d'hypotheses, et son habillage lui appartient.

   Les trois pilules d'un `.segmented` etaient exactement le dessin des onglets
   « Aujourd'hui | Historique | Projection » qui coiffent la meme page : deux
   controles identiques a l'oeil, l'un qui change d'ecran et l'autre qui change
   un calcul. Un pave borde ne se confond avec aucune navigation, et il a la
   place d'afficher ce qu'il suppose — c'est le taux qui distingue les trois
   choix, pas le mot.

   Le taux imprime est celui du scenario, une propriete de la table, jamais un
   reglage relu : ces trois valeurs ne dependent pas de l'etat. */
const TAUX_DESTINATION = {
  marche: s => s.rate,
  autres: s => s.rateAutres,
  garanti: s => s.rateGaranti,
  liquidites: () => 0,
};
/* Le repli sur le marche est celui de `repartitionVersement()` : une valeur qui
   ne nomme aucune poche verse sur les actifs de marche. */
const tauxDeDestination = s => (TAUX_DESTINATION[s.versementVers] || TAUX_DESTINATION.marche)(s);

function choixHypothese(actif) {
  /* La quatrieme case n'est pas un quatrieme scenario : elle n'a ni taux ni
     valeurs a elle, elle dit seulement que les hypotheses en vigueur ne sont
     plus exactement celles d'un preset. Elle s'allume donc toute seule, par
     `detecteScenario()`, et jamais par un enregistrement.

     Ce qui manquait sans elle : rien ne montrait qu'on peut sortir des trois
     paves. Le depliant existait, mais il faut le chercher, et personne ne
     cherche un reglage dont il ne sait pas qu'il existe.

     Aucun taux affiche dessous, et c'est voulu : un jeu personnalise peut
     changer plusieurs rendements a la fois, donc en montrer un seul designerait
     le mauvais. Les trois autres n'annoncent que celui du marche parce que c'est
     celui qui change le plus d'un scenario a l'autre -- le capital garanti varie
     aussi, de 2 a 3 %, et la ligne sous les paves le dit. */
  const cases = [
    ...SCENARIOS_PROJECTION.map(([cle, nom, taux]) =>
      [cle, nom, `${trad('marché')} ${fmtPct(taux.marche, 0)}`]),
    ['perso', 'Personnalisé', trad('tes hypothèses')],
  ];
  return `
    <div class="choix-hypothese" role="group">
      ${cases.map(([cle, nom, sous]) => `<button
        data-action="proj-scenario" data-scenario="${esc(cle)}"
        class="${cle === actif ? 'on' : ''}" aria-pressed="${cle === actif}">
        <b>${esc(trad(nom))}</b>
        <span>${sous}</span>
      </button>`).join('')}
    </div>`;
}

function barreSousOnglets(vue) {
  const choix = SOUS_ONGLETS[vue];
  if (!choix) return '';
  if (choix.length < 2) return '';
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

/* Le nom d'une poche est celui de sa classe, et il se derive.

   Sept poches declaraient leur libelle a la main, a cote de `CLASSES_ACTIFS`
   qui les nomme deja. Deux avaient divergé : la poche `pe` disait « Non coté »
   quand sa classe dit « Placements non cotés », et la poche `biens` disait
   « Biens de valeur » au pluriel quand sa classe le dit au singulier.

   En anglais, ça donnait le meme argent sous deux noms sur deux cartes du meme
   ecran : « Private assets » dans le tableau des classes, « Private
   investments » dans l'infobulle et sur l'accueil. Signale sur une capture de
   telephone, pas par un test — parce qu'aucun test ne peut voir qu'un mot juste
   et un autre mot juste designent la meme chose.

   Une liste se derive, elle ne se recopie pas. La table ci-dessous ne dit plus
   que le rattachement, et un controle exige qu'elle couvre chaque poche. */
const POCHE_CLASSE = {
  cash: 'liquidites', bourse: 'actions', crypto: 'crypto', pe: 'nonCote',
  immo: 'immobilier', biens: 'bienValeur', garanti: 'garanti',
};
const SERIES_PATRIMOINE = () => [
  { key: 'cash',   color: S1() },
  { key: 'bourse', color: S2() },
  { key: 'crypto', color: S5() },
  { key: 'pe',     color: S3() },
  { key: 'immo',   color: S4() },
  { key: 'biens',  color: Charts.cssv('--series-9') },
  { key: 'garanti', color: Charts.cssv('--series-8') },
].map(s => ({ ...s, label: trad(CLASSES_ACTIFS[POCHE_CLASSE[s.key]]) }));
/* Les bandes que la courbe trace vraiment, donc celles que la legende annonce.

   Deux filtres, et le premier est nouveau : le perimetre. Il se derive de
   `pochesEvolution()`, la meme fonction dont `pointsEvolution()` tire ses points
   -- une seconde liste de poches a ecarter aurait fini par annoncer en legende
   une bande absente du dessin, ou l'inverse.

   Le second n'a pas change : une poche qui ne porte rien sur la periode affichee
   n'ajouterait qu'une pastille de legende et une ligne « 0 EUR » dans la bulle.
   Les liquidites restent toujours, sinon un patrimoine tout juste ouvert n'aurait
   plus de graphique du tout. */
function seriesUtiles(points, { financier = false } = {}) {
  const gardees = pochesEvolution({ financier });
  return SERIES_PATRIMOINE()
    .filter(s => gardees.includes(s.key))
    .filter(s => s.key === 'cash'
      || points.some(p => Math.abs(Number(p[s.key]) || 0) > 0.005));
}
function legendeSeries(series, avecTotal = false) {
  return series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')
    + (avecTotal ? `<span><i style="background:var(--text-secondary)"></i>Total</span>` : '');
}

/* `pointsEvolution()` a quitte ce fichier pour `store.js`.

   Il y calculait la courbe -- imputation des dettes poche par poche, total
   derive des bandes -- et le harnais de tests ne charge pas `app.js` : le
   controle le plus important de cette fonction, « la pile fait son total »,
   etait donc une expression rationnelle sur la source, doublee d'un test qui
   REJOUAIT la regle sur ses propres donnees. Deux ecritures d'un seul calcul,
   dont l'une servait a verifier l'autre : la copie ne pouvait rien prouver.

   Le calcul est du modele, pas de la vue. Depuis `store.js` il se lit avec de
   vrais nombres, sur le meme fixture que le reste, et le perimetre Financier /
   Global y rejoint les autres regles d'exclusion, qui y vivaient deja.

   Ce qui reste ici : le dessin, les couleurs, et le choix de l'utilisateur. */

function basculesAffichees() {
  return basculesEvolution({ net: evoNet, financier: evoFinancier, range: evoRange });
}

function evolutionAffichee() {
  const points = limitRange(
    pointsEvolution({ net: evoNet, financier: evoFinancier }), evoRange);
  return { points, series: seriesUtiles(points, { financier: evoFinancier }) };
}

function carteEvolution() {
  const { series } = evolutionAffichee();
  const perimetreUtile = basculesAffichees().perimetre;
  return `
    <div class="card">
      <div class="card-head"><h2>${trad('Évolution du patrimoine')}${
        perimetreUtile ? aide(trad(AIDE_PERIMETRE)) : ''}</h2>${
        perimetreUtile ? `
        <span class="segmented seg-mini">
          <button data-action="evo-perimetre" data-perimetre="financier"
                  class="${evoFinancier ? 'on' : ''}" aria-pressed="${evoFinancier}"
                  title="${trad('Tes placements et tes liquidités, hors immobilier physique')}"
                  >${trad('Financier')}</button>
          <button data-action="evo-perimetre" data-perimetre="global"
                  class="${evoFinancier ? '' : 'on'}" aria-pressed="${!evoFinancier}"
                  title="${trad('Tout ton patrimoine')}">${trad('Global')}</button>
        </span>` : ''}</div>
      <div class="evo-commandes">${rangeControl('evo-range', evoRange)}</div>
      <div class="chart" id="chartEvo"></div>
      ${invitePremierPas('releves')}
      <div class="legend">${legendeSeries(series, true)}</div>
    </div>`;
}

/* Le depliant « Voir les donnees » sous la courbe est parti. Il rendait le
   tableau des points par annee : les memes nombres que la courbe trace juste
   au-dessus, sous une autre forme, derriere un pli que personne n'ouvrait. Le
   journal des releves donne deja mois par mois ce qu'il montrait, avec la porte
   pour corriger chaque ligne -- ce que le tableau n'avait pas.

   Sont partis avec lui : son selecteur d'annee (`evo-year`), les deux drapeaux
   de session qui portaient son annee et son ouverture, et son ecouteur de pli.
   Un depliant sans lecteur est du poids mort, et son etat en memoire vive
   l'etait deux fois. */
function monterEvolution() {
  const { points, series } = evolutionAffichee();
  const cible = $('#chartEvo');
  const anime = evoTransition;
  evoTransition = false;
  /* L'echelle verticale se recalcule toute seule sur les bandes passees :
     `Charts.stackedArea` somme `series` point par point pour son maximum et pour
     sa ligne Total. Retirer l'immobilier de la liste suffit donc a rendre l'axe
     aux placements, sans qu'un seul chiffre soit force ici. */
  if (cible) Charts.stackedArea(cible, { points, height: 300, series, anime });
}

/* « Combien est-ce que j'accumule en ce moment ? »

   La reponse vivait dans Budget > Charges fixes, sous le titre « Epargne et
   croissance », et elle y depassait de loin son onglet : revenus, charges,
   depenses, capacite d'epargne, capital rembourse, accumulation, taux, plus la
   croissance constatee du patrimoine et son ecart au budget. Un onglet qui
   s'appelle « Charges fixes » doit repondre « quelles sont mes charges fixes ».

   Ici la carte ne garde que la question qu'on se pose sur l'accueil, et le
   chiffre qui y repond est le total, pas ses parts. Les deux lignes au-dessus
   ne sont la que pour dire de quoi il est fait.

   Rien n'est recalcule : `savingsReconciliation()` est la seule source, et elle
   n'a pas bouge d'une ligne. Le detail — revenus, charges, depenses moyennes —
   reste dans Budget et dans le panneau `capaciteEpargne`, ou la premiere ligne
   mene. Une synthese qui refait le detail cesse d'etre une synthese.

   Elle ne suit pas Net / Brut, et il n'y avait rien a decider : cette carte
   mesure un FLUX mensuel, `savingsReconciliation()` ne lit ni `patrimoine()` ni
   les dettes en stock, donc le commutateur du haut de page ne la traverse
   nulle part. Un test le tient. */
function carteAccumulation() {
  const rec = savingsReconciliation();
  /* La carte se lit comme une equation, et c'est tout son interet.

     Elle a d'abord ete reduite a quatre chiffres — capacite, capital,
     accumulation, taux. C'etait trop peu : « +1 333 € » sans les trois lignes
     qui le fabriquent affiche un resultat au lieu d'expliquer une mecanique, et
     la question que cette carte existe pour repondre est justement « comment mes
     revenus deviennent du patrimoine ». Les operateurs vivent dans les intitules
     pour que la colonne se lise de haut en bas comme une addition posee.

     Ce n'est pas pour autant l'ancienne carte de Budget : l'objectif
     d'investissement n'y revient pas — il n'est pas une composante de
     l'accumulation, et il vit deja dans la barre « Ou va ce que tu gagnes » — et
     la note de methode tient en une ligne au lieu d'un paragraphe.

     Rien n'est recalcule ici : `savingsReconciliation()` reste la seule source
     des sept montants, et elle n'a pas bouge. */
  /* Un montant dans une AIDE ne se formate pas comme a l'ecran : l'aide range
     son texte dans un attribut, ou le masque des montants s'imprimerait en
     clair, balise SVG comprise. `fmtEUR0Texte` y rend « ••• € ». */
  const aEcran = v => montantSigne(v);
  const enTexte = v => montantSigne(v, fmtEUR0Texte);
  /* Le troisieme terme porte le nom de la branche prise : `savingsReconciliation`
     retombe sur l'objectif de depenses quand aucune depense n'est saisie, et
     l'annoncer « observees » dirait une formule que le moteur n'a pas jouee. */
  const nomDepenses = rec.spendObserved
    ? trad('− Dépenses observées') : trad('− Objectif de dépenses');
  const aideDepenses = trad(rec.spendObserved
    ? 'La moyenne de tes dépenses saisies cette année.'
    : 'Aucune dépense saisie cette année : c’est ton objectif qui sert de base.');
  const aideCapacite = trad(rec.spendObserved
      ? 'Revenus − charges fixes − dépenses observées.'
      : 'Revenus − charges fixes − objectif de dépenses.')
    + ` ${fmtEUR0Texte(rec.income)} − ${fmtEUR0Texte(rec.fixed)} − ${fmtEUR0Texte(rec.spend)}`
    + ` = ${enTexte(rec.investable)}`;
  const aideTotal = trad('Capacité d’épargne + capital remboursé.')
    + ` ${fmtEUR0Texte(rec.investable)} + ${fmtEUR0Texte(rec.capitalRembourse)}`
    + ` = ${enTexte(rec.theoretical)}`;
  const aideTaux = trad('Accumulation patrimoniale ÷ revenus.') + ' ' + (rec.income
    ? `${fmtEUR0Texte(rec.theoretical)} ÷ ${fmtEUR0Texte(rec.income)} = ${fmtPct(rec.theoreticalRate, 1)}`
    : trad('Aucun revenu déclaré pour l’instant.'));
  return `
  <div class="card">
    <div class="card-head"><h2>${trad('Accumulation ce mois-ci')}</h2>
      <span class="hint">${trad('Comment tes revenus se transforment en patrimoine')}</span></div>
    <dl class="kv kv-accumul">
      <dt>${trad('Revenus fixes')}</dt><dd>${fmtEUR0(rec.income)}</dd>
      <dt>${trad('− Charges fixes')}</dt><dd>${aEcran(-rec.fixed)}</dd>
      <dt>${esc(nomDepenses)}${aide(aideDepenses)}</dt><dd>${aEcran(-rec.spend)}</dd>
      <dt class="somme"><b>${trad('= Capacité d’épargne')}</b>${aide(aideCapacite)}</dt>
        <dd class="somme">${aEcran(rec.investable)}</dd>
      <dt>${trad('+ Capital remboursé')}${aide(trad('La part de tes mensualités qui rembourse le capital de tes crédits. Elle réduit ta dette, donc elle augmente ton patrimoine net.'))}</dt>
        <dd>${aEcran(rec.capitalRembourse)}</dd>
      <dt class="somme cle"><b>${trad('= Accumulation patrimoniale')}</b>${aide(aideTotal)}</dt>
        <dd class="somme cle"><b class="${cls(rec.theoretical)}">${aEcran(rec.theoretical)}</b></dd>
      <dt class="sobre">${trad('Taux d’accumulation')}${aide(aideTaux)}</dt>
        <dd class="sobre">${fmtPct(rec.theoreticalRate, 1)}</dd>
    </dl>
    ${rec.realPerMonth == null ? '' : `
    <div class="kv-filet"></div>
    <dl class="kv kv-accumul">
      <dt>${trad('Croissance observée du patrimoine')}${aide(trad('Moyenne des variations de ton patrimoine net d’un mois sur l’autre, marchés et apports extérieurs compris. Elle porte toujours sur les douze derniers mois clos, là où la carte « Rythme d’accumulation » suit la période que tu y choisis.'))}</dt>
        <dd>${aEcran(rec.realPerMonth)} ${trad('/ mois')}</dd>
      <dt>${trad('Ce qui ne vient pas du budget')}${aide(trad('L’écart entre la croissance réellement observée de ton patrimoine et ce que ton budget et tes remboursements expliquent : les marchés, un apport extérieur, la valeur d’un bien qui bouge. Rien de tout cela ne passe par tes revenus et tes dépenses, donc rien de tout cela n’est une erreur de budget.'))}</dt>
        <dd class="${cls(rec.gap)}">${aEcran(rec.gap)}</dd>
    </dl>
    <p class="small muted" style="margin:12px 0 0">${trad('Croissance observée calculée sur les')}
      ${rec.monthsSpan} ${rec.monthsSpan > 1 ? trad('derniers mois clos') : trad('dernier mois clos')}${aide(trad('Le mois en cours est écarté : il est incomplet, et il ferait bouger le chiffre chaque jour.'))}</p>`}
  </div>`;
}

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

  ${moisEnAttente.missing ? `
  <div class="rappel card-cliquable">
    <button type="button" class="card-couvre" data-action="ajouter-releve"
            aria-label="${trad('Prendre le snapshot de')} ${esc(moisEnAttente.label)}"></button>
    <span class="rappel-pastille"></span>
    <span class="rappel-texte"><b>${trad('Prendre le snapshot de')} ${esc(moisEnAttente.label)} ›</b><br>
      <span class="muted">${trad('Enregistre')} ${fmtEUR0(nowTotals().total)} ${trad('dans tes données mensuelles')}</span></span>
    ${sortiesRappel('releve', moisEnAttente.label)}
  </div>` : ''}

  ${depEnAttente.missing ? `
  <div class="rappel card-cliquable">
    <button type="button" class="card-couvre" data-action="saisir-mois-en-attente"
            aria-label="${trad('Saisir les dépenses de')} ${esc(depEnAttente.label)}"></button>
    <span class="rappel-pastille"></span>
    <span class="rappel-texte"><b>${trad('Saisir les dépenses de')} ${esc(depEnAttente.label)} ›</b><br>
      <span class="muted">${trad('Le mois est clos, ce qu’il a coûté reste à enregistrer')}</span></span>
    ${sortiesRappel('depenses', depEnAttente.label)}
  </div>` : ''}

  <div class="hero card-cliquable">
    <button type="button" class="card-couvre" data-action="apercu" data-apercu="patrimoineTotal"
            aria-label="${trad('Voir la répartition du patrimoine par actif')}"
            title="${trad('Voir la répartition par actif')}"></button>
    <div>
      <div class="hero-label">
        <span>${trad('Patrimoine')}</span>
        ${basculesAffichees().netBrut ? `<span class="segmented seg-mini">
          <button data-action="hero-base" data-net="1" class="${evoNet ? 'on' : ''}"
                  title="${trad('Tes avoirs moins tes crédits')}">${trad('Net')}</button>
          <button data-action="hero-base" data-net="" class="${evoNet ? '' : 'on'}"
                  title="${trad('La valeur de tes avoirs, crédits non déduits')}">${trad('Brut')}</button>
        </span>` : ''}
      </div>
      <div class="hero-value">${fmtEUR(evoNet ? t.total : t.brut)}</div>
      ${!evoNet && patrimoine().dettes ? `<div class="hero-sous muted">
        dont ${fmtEUR0(patrimoine().dettes)} de crédits à rembourser</div>` : ''}
      ${invitePremierPas('comptes')}
    </div>
    <div class="hero-deltas">
      ${deltaBlock(trad('depuis le 1er janvier'), d.ytd)}
      ${deltaBlock(trad('depuis le début'), d.all)}
    </div>
    ${(() => {
      const parts = repartitionClasses({ net: evoNet });
      if (!parts.length) return '';
      return `
      <div class="hero-barre" role="img"
           aria-label="${trad('Répartition')}${deuxPoints()} ${parts.map(x => `${trad(x.label)} ${fmtPct(x.pct, 0)}`).join(', ')}">
        ${parts.map(x => `<i style="width:${x.pct.toFixed(2)}%;background:${x.couleur}"></i>`).join('')}
      </div>`;
    })()}
  </div>

  <div class="card repart">
    ${repartitionClasses({ net: evoNet }).map(x => `
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
      const p = patrimoine();
      if (!p.dettes) return '';
      const cr = creditsEnCours();
      return `
      <p class="perimetre repart-base">${mentionBase(
        evoNet ? BASES.net : BASES.avoirs, evoNet ? p.net : p.brut)}${aide(evoNet
        ? `Ces parts portent sur ton patrimoine net : le capital qu’il te reste à `
          + `rembourser, ${fmtEUR0(p.dettes)}, est retiré de l’immobilier, qui est ce `
          + `que tes crédits financent. Chaque mensualité le réduit, donc cette part `
          + `monte d’autant, même si la valeur de tes biens ne bouge pas. Bascule sur `
          + `« Brut » pour voir la valeur de tes biens avant crédits.`
        : `Ces parts portent sur ce que tu possèdes, avant crédits. Ton patrimoine net, `
          + `en haut de page, vaut ${fmtEUR0(p.net)} : la différence est le capital qu’il te `
          + `reste à rembourser. Bascule sur « Net » pour voir la même répartition, `
          + `crédits déduits.`)}</p>
      <button type="button" class="repart-credits" data-action="apercu" data-apercu="credits"
              title="${trad('Voir et mettre à jour tes crédits')}">
        <span>${evoNet ? trad('Crédits déjà déduits') : trad('Crédits en cours')}</span>
        <b class="dette">${evoNet ? '' : '−'}${fmtEUR(cr.reste)}</b>
        <span class="ml-chev" aria-hidden="true">›</span>
      </button>`;
    })()}
  </div>

  ${pasAFaire('comptes') ? `
  <div class="card">
    <p class="empty" style="margin:0">${trad('Le reste de cette page se remplit tout seul : '
      + 'la courbe de ton patrimoine, ton rythme d’accumulation, ce que tu tiendrais sans '
      + 'revenus, ton portefeuille. Tout part des comptes que tu déclares.')}</p>
  </div>`
  : `
  <div class="grid">
    ${carteEvolution()}
  </div>

  ${carteAccumulation()}

  <div class="grid g-2-1">
    <div class="card">
      <div class="card-head"><h2>${trad('Rythme d\'accumulation')}</h2>
        ${rangeControl('pace-range', paceRange)}</div>
      <div class="chart" id="chartPace"></div>
      ${(() => {
        const p = statsRythme(limitRange(monthlyPace().points, paceRange, { ecarts: true }));
        return `<dl class="kv" style="margin-top:12px">
          ${p.apports ? `
          <dt>${trad('Dont')} ${p.apports < 0 ? trad('sorties exceptionnelles') : trad('entrées extérieures')}${aide(
              trad('Les entrées et sorties exceptionnelles de la période affichée : un héritage, une prime, la vente d’un bien, ou à l’inverse une voiture, des travaux. Elles déplacent ton patrimoine sans rien dire de ton épargne, et la moyenne du dessous les compte : hors elles, ton rythme propre est de')
            + ' ' + fmtEUR0(p.averageHorsApports) + ' ' + trad('par mois. Retrouve le journal dans Aperçu > Historique.'))}</dt>
            <dd><button type="button" class="mois-lien ${cls(p.apports)}" data-action="goto" data-view="history"
                        data-anchor="" title="${trad('Voir le journal des entrées et sorties exceptionnelles')}"
                >${fmtSigned(p.apports)}</button></dd>` : ''}
          <dt>${trad('Moyenne mensuelle du patrimoine')}${aide(trad("Moyenne des variations du patrimoine net d’un mois sur l’autre, sur la période affichée. Elle comprend les mouvements de marché et les apports, pas seulement ton épargne. Le mois en cours reste dehors : il est incomplet."))}
            <span class="sub">${trad('marchés et apports compris')}</span></dt><dd class="${cls(p.average)}">${fmtSigned(p.average)}</dd>
          <dt>${trad('Mois en hausse')}</dt><dd>${p.positive} / ${p.count}</dd>
          ${p.best ? `<dt>${trad('Meilleur mois')}</dt><dd>${esc(p.best.label)} · ${fmtSigned(p.best.delta)}</dd>` : ''}
          ${p.worst ? `<dt>${trad('Pire mois')}</dt><dd>${esc(p.worst.label)} · ${fmtSigned(p.worst.delta)}</dd>` : ''}
        </dl>`;
      })()}
    </div>
  <div class="card">
    <div class="card-head"><h2>${trad('Autonomie financière')}${aide(trad("Combien de mois tu tiendrais si tes revenus s'arrêtaient demain. La jauge compte ton épargne de précaution ; la liste ajoute ce qui pourrait être mobilisé ensuite, du plus accessible au plus lent, en mois cumulés. L'immobilier et le non coté se vendent, mais en quelques mois et avec une décote si tu es pressé. Ce qui est bloqué jusqu'à son échéance reste affiché mais sort du cumul : cet argent n'arrivera pas, quoi qu'il se passe demain. Un titre coté se vend en séance, mais le virement met deux à trois jours ouvrés à arriver : c'est ce délai, pas la liquidité, qui le range en « quelques jours ». Casser un PEA de moins de cinq ans lui coûte son avantage fiscal, pas son accès. Coût mensuel retenu : charges fixes plus dépenses moyennes."))}</h2>
      <span class="hint">${trad('si les revenus s\'arrêtaient')}</span></div>
    ${(() => {
      const r = runway();
      const pk = poches();
      const ep = pk.precaution + pk.courant;
      const cover = r.burn ? ep / r.burn : 0;
      const state = cover >= 3 ? 'up' : cover >= 1.5 ? '' : 'down';
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
        <div class="goal-foot"><span></span><span>${trad('cible 3 à 6 mois')}</span></div>
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

  <div class="grid g-3">
      <div class="card">
        <div class="card-head"><h2>${trad('Portefeuille titres')}</h2>
          <a class="hint lien-vue" href="#/positions">${trad('Marchés')} →</a></div>
        <div class="mlist-groupe">
          ${(() => {
            const j = dayPerformance();
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

  </div>
`}
  ${carteObjectif()}
`;
}

function mountOverview() {
  monterEvolution();
  monteTirerRafraichir();

  const t = nowTotals();

  const pace = monthlyPace();
  const barres = limitRange(pace.points, paceRange, { ecarts: true });
  const moyenne = barres.length
    ? barres.reduce((s, p) => s + p.delta, 0) / barres.length : pace.average;
  Charts.deltaBars($('#chartPace'), {
    height: 220,
    items: barres.map(p => ({ label: p.label, value: p.delta, note: p.note })),
    average: moyenne,
  });

}

/* `goto` = "vue:ancre", rend la tuile cliquable et emmène à l'endroit
   où ce chiffre se modifie réellement. */

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
function rangeControl(action, courant, annees = []) {
  const surAnnee = estAnnee(courant);
  const connu = HISTORY_RANGES.some(r => r.id === courant);
  return `
    <div class="plage">
      <div class="segmented seg-mini">
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

/* Deux cas, et l'ordre compte : le texte nu d'abord, puis les intitules en gras.
   Le premier motif exclut « > » de son mot, donc il ne touche pas aux seconds ;
   l'inverse ferait envelopper deux fois. Le gras se traite a part parce qu'un
   groupe insecable ne peut pas ouvrir dedans et fermer dehors : il se pose donc a
   l'interieur du `<b>`, avec le badge, ce qui reste un emboitement valide.

   Des litterales, et non `new RegExp` depuis une chaine : celle-la demande trois
   niveaux d'echappement — le fichier, la chaine, la regex — et un niveau perdu
   donne `[^s<>]`, une classe qui exclut la lettre « s ». Elle ne matche rien
   d'utile et ne leve aucune erreur. */
const MOTIF_AIDE_COLLEE = /([^\s<>]+)(<span class="aide"[^>]*>\?<\/span>)/g;
const MOTIF_AIDE_GRAS = /<b>([^<]*?)(\S+)<\/b>(<span class="aide"[^>]*>\?<\/span>)/g;
const collerAides = html => String(html)
  .replace(MOTIF_AIDE_COLLEE, (m, mot, badge) => `<span class="aide-collee">${mot}${badge}</span>`)
  .replace(MOTIF_AIDE_GRAS, (m, debut, mot, badge) =>
    `<b>${debut}<span class="aide-collee">${mot}${badge}</span></b>`);

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

const DATE_ACHAT_AIDE =
  'Facultative, mais deux chiffres en dépendent. Le rendement par an, qui ramène '
  + '« +36 % » à une échelle comparable, car sans date il ne dit pas s’il a fallu un '
  + 'an ou cinq. Et l’effet du jour : une ligne achetée aujourd’hui se compare à ton '
  + 'prix d’achat, pas à la clôture d’hier, que tu n’as pas vécue. Pour une ligne '
  + 'renforcée plusieurs fois, mets la date du premier achat.';

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
  document.addEventListener('keydown', e => {
    const b = vise(e);
    if (!b || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    montrer(b);
  });

  document.addEventListener('pointerdown', e => { if (!vise(e)) cacher(); }, true);
}

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

function viewSettings() {
  const m = Store.state.meta;
  return `
  <div class="grid g-2">
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

  ${viewNotifs()}
`;
}

function viewNotifs() {
  const n = notifications();
  const masquees = notifsMasquees();
  return `
  <div class="card">
    <div class="card-head"><h2>${trad('Notifications & rappels')}</h2>
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

    <div class="modal-champs" style="margin-top:12px">
      <div class="field">
        <label>${trad('Jour du rappel')}${aide(trad("Avant ce jour, la cloche ne réclame ni relevé ni dépenses. Utile si tu fais tes comptes à date fixe : payé le 15, tu ne veux pas d’une pastille allumée quinze jours pour rien. Les mois, eux, restent calendaires : ce réglage déplace le rappel, pas le calcul."))}</label>
        <select data-path="meta.jourRappel" data-type="num">
          ${Array.from({ length: 28 }, (_, i) => i + 1).map(j =>
            `<option value="${j}" ${j === jourRappel() ? 'selected' : ''}>${
              j === 1 ? trad('le 1er du mois') : `${trad('le')} ${j} ${trad('du mois')}`}</option>`).join('')}
        </select>
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

const A_PLAT = trad('sans rendement');

const NOM_LIGNE_MAX = 30;

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
  const choix = PROJECTION_CHOICES.includes(projHorizon)
    ? PROJECTION_CHOICES
    : [...PROJECTION_CHOICES, projHorizon].sort((a, b) => a - b);
  return `
  <select data-action-change="proj-horizon" style="width:auto">
    ${choix.map(h => `<option value="${h}" ${h === projHorizon ? 'selected' : ''}>
      ${h} ${trad('ans')}, ${new Date().getFullYear() + h}</option>`).join('')}
  </select>`;
};

let hypoOuvert = false;
let avanceOuvert = false;

const carteObjectif = () => {
  const g = objectiveStatus();
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
    <div class="goal-top">
      <b class="${g.remaining >= 0 ? 'up' : ''}">${g.remaining >= 0
        ? `+${fmtEUR(g.remaining)}` : fmtEUR(Math.abs(g.remaining))}</b>
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

function viewObjective() {
  if (!(patrimoine().brut > 0.005) && !(num(Store.state.meta.projMonthly) > 0)) {
    return pageAvantDonnees('Une projection part de ce que tu as et de ce que tu mets de '
      + 'côté chaque mois. Sans l’un ni l’autre, elle ne peut que multiplier zéro par les '
      + 'années. Déclare un compte, ou règle un versement mensuel dans tes hypothèses.');
  }
  const g = objectiveStatus();
  const s = projectionSettings();
  const p = capitalisation({ years: projHorizon });
  const dernier = p.points[p.points.length - 1];
  const anneeAtteinte = p.targetReached;

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
  /* `sous` : une ligne d'annotation sous le controle, pour dire d'ou vient une
     valeur que l'application a calculee. Le « ? » du libelle explique la notion,
     cette ligne dit la provenance — deux questions differentes, et celle de la
     provenance ne doit pas demander un survol. */
  const champ = (label, path, paliers, format, aideTexte, valeur, sous) => `
    <div class="field">
      <label>${esc(trad(label))}${aideTexte ? aide(aideTexte) : ''}</label>
      <select data-path="${path}" data-type="num">
        ${listeChoix(path, paliers, valeur, format)}
      </select>
      ${sous ? `<span class="hint">${sous}</span>` : ''}
    </div>`;

  /* Le meme champ, pour une valeur qui n'est pas un nombre. `champ()` pose
     `data-type="num"` et sa liste de paliers : une destination n'est ni l'un ni
     l'autre, et l'y forcer aurait converti « marche » en zero. */
  const champText = (label, path, options, valeur, aideTexte, sous) => `
    <div class="field">
      <label>${esc(trad(label))}${aideTexte ? aide(aideTexte) : ''}</label>
      <select data-path="${path}">
        ${options.map(([v, l]) => `<option value="${esc(v)}" ${v === valeur ? 'selected' : ''}
          >${esc(trad(l))}</option>`).join('')}
      </select>
      ${sous ? `<span class="hint">${sous}</span>` : ''}
    </div>`;

  const paliers = (max, pas, depuis = 0) =>
    Array.from({ length: Math.floor((max - depuis) / pas) + 1 }, (_, i) => depuis + i * pas);

  return `
  ${(() => {
    const verses = Math.max(0, dernier.contributed - g.total);
    const plat = num(p.plat);
    const parts = [
      { label: trad('Ce que tu as déjà'), value: g.total - plat, couleur: 'var(--series-3)', apercu: 'baseProjection' },
      { label: plat < 0 ? trad('Tes crédits')
             : num(nowTotals().biens) > 0.005
               ? (num(nowTotals().immo) > 0.005 ? trad('Ton immobilier et tes biens, nets')
                                                : trad('Tes biens de valeur, nets'))
               : trad('Ton immobilier net'),
        value: plat, couleur: couleurClasse('immobilier'), apercu: 'immobilierNet',
        aide: trad('Aucun rendement ne lui est appliqué : la projection le porte tel quel') },
      { label: trad('Ce que tu verses'), value: verses, couleur: S1(), apercu: 'horizon' },
      /* Une seule ligne de rendement, et c'est un choix.

         Elle s'est coupee en deux, puis en trois, a mesure que les poches se
         multipliaient — et la ligne « Rendement du non cote » portait en fait le
         non cote PLUS le capital garanti PLUS les liquidites, parce qu'elle
         lisait `gainsAutres`. Un intitule qui nomme une poche et en somme trois
         est pire qu'un intitule general.

         Le detail par poche existe, et a sa place : le depliant des hypotheses
         donne un taux par poche, et « Ce que tu as deja » donne un montant par
         poche avec le taux qui lui est applique. Cette carte-ci repond a une
         autre question — depart, versements, rendement — et trois parts y
         suffisent. */
      { label: trad('Ce que le rendement ajoute'), value: dernier.gains,
        couleur: S2(), apercu: 'horizon',
        aide: trad('Chaque poche capitalise à son propre taux : déplie « Personnaliser les hypothèses » pour les voir') },
    ].filter(x => Math.abs(num(x.value)) > 0.005)
     .map(x => ({ ...x, pct: dernier.total ? num(x.value) / dernier.total * 100 : 0 }));
    return `
  <div class="card repart">
    <div class="card-head">
      <h2>${trad('De quoi sera fait ton patrimoine')}</h2>
      <label class="row" style="gap:8px; font-size:12px; color:var(--text-secondary)">
        ${trad('Horizon')}
        ${selecteurHorizon()}
      </label>
    </div>
    <p class="small muted" style="margin:-6px 0 12px">${trad('Projette ton patrimoine '
      + 'selon ton épargne et différentes hypothèses de rendement.')}</p>
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
    <dl class="kv repart-pied">
      <dt><b>${trad('Total en')} ${dernier.year}</b></dt><dd><b>${fmtEUR(dernier.total)}</b></dd>
      ${s.inflation ? `<dt>${trad('Soit, après inflation')}${
        aide(`${trad('Le même montant, une fois retirée une inflation de')} ${fmtPct(s.inflation, 0)} ${trad('par an pendant')} ${projHorizon} ${trad('ans. C’est ce que cette somme permettrait d’acheter aux prix que tu connais.')}`)
      }</dt><dd>${fmtEUR(dernier.real)}</dd>` : ''}
    </dl>
    ${s.target ? `<p class="ligne-cible">${trad('Cible de')} ${fmtEUR0(s.target)}${deuxPoints()}
      <b>${!anneeAtteinte ? `${trad('non atteinte')} ${trad('d’ici')} ${dernier.year}`
        : anneeAtteinte.dejaAtteinte ? trad('déjà atteinte')
        : `${trad('franchie en')} ${anneeAtteinte.year}`}</b>${
        anneeAtteinte && !anneeAtteinte.dejaAtteinte
        ? ` <span class="muted">(${trad('dans')} ${Math.round(anneeAtteinte.yearsFromNow)} ${trad('ans')})</span>`
        : ''}</p>` : ''}
  </div>`;
  })()}

  <div class="grid g-1-2">
    <div class="card">
      <div class="card-head"><h2>${trad('Tes hypothèses')}</h2>
        <span class="hint">${trad('hypothèses de simulation, pas prévisions de marché')}</span></div>
      <details class="pli-reglages" ${hypoOuvert ? 'open' : ''} id="hypoDetail">
        <summary>
          <span class="pli-valeurs">${fmtEUR0(s.monthly)} ${trad('/ mois')} ·
            ${trad('scénario')} ${trad(nomScenario(s.scenario)).toLowerCase()}${
              num(s.target) ? ` · ${trad('cible')} ${fmtEUR0(s.target)}` : ''}</span>
          <span class="pli-action">${trad('Régler')}</span>
        </summary>
      <div class="modal-champs" style="margin-top:12px">
        ${champ('Versement mensuel', 'meta.projMonthly', paliers(10000, 50),
                v => `${fmtEUR0(v)} ${trad('/ mois')}`,
                trad('Le cash qui reste chaque mois : revenus moins charges fixes '
                  + 'moins dépenses moyennes. Le capital remboursé sur tes crédits '
                  + 'n’y est pas : il augmente ton patrimoine, mais il est déjà '
                  + 'parti avec la mensualité, donc il n’est pas disponible à '
                  + 'investir.'),
                s.monthly,
                /* La condition suit `monthlyAuto` et non la valeur : depuis que
                   zero veut dire zero, un versement fige a 0 est un choix. */
                s.monthlyAuto
                  ? `${trad('Repris de ta capacité d’épargne dans Budget')}
                     <button type="button" class="mois-lien" data-action="apercu"
                             data-apercu="capaciteEpargne">${trad('Voir le calcul')}</button>`
                  : `${trad('Valeur figée. Ta capacité d’épargne est de')} ${fmtEUR0(suggestedMonthly())}
                     <button type="button" class="mois-lien" data-action="apercu"
                             data-apercu="capaciteEpargne">${trad('Voir le calcul')}</button>
                     <button type="button" class="mois-lien" data-action="proj-use-budget"
                             >${trad('Reprendre ce montant')}</button>`)}
        ${champText('Affectation des versements', 'meta.projVersementVers', VERSEMENT_VERS,
                s.versementVers,
                trad('Ces euros capitalisent au taux de la poche que tu choisis. '
                  + 'Sur les liquidités, ils s’accumulent sans rendement : c’est ce que fait '
                  + 'un livret que tu n’as pas déclaré rémunéré, et c’est le seul réglage '
                  + 'honnête si tu épargnes sans investir. '
                  + 'Un seul choix à la fois : la projection verse tout dans la poche '
                  + 'sélectionnée, elle ne répartit pas un versement entre plusieurs.'),
                trad('Où va ton épargne future.')
                  + (num(tauxDeDestination(s)) ? ''
                    : ' ' + trad('Cette poche ne produit aucun rendement dans les scénarios : '
                        + 'ce que tu y verses s’accumule sans grossir.')))}
        <div class="field">
          <label>${trad('Scénario de projection')}${aide(trad(
            'Ces valeurs sont des hypothèses de simulation, pas des prévisions de '
            + 'rendement. Les marchés peuvent évoluer très différemment. Le scénario '
            + 'fixe un rendement par poche ; tu peux les poser toi-même plus bas.'))}</label>
          ${choixHypothese(s.scenario)}
          <span class="hint">${trad(PHRASE_SCENARIO[s.scenario] || PHRASE_SCENARIO.perso)}</span>
          <span class="hint">${trad('Capital garanti')} ${fmtPct(s.rateGaranti, 1)} ${trad('par an')} ·
            ${trad('autres actifs')} ${num(s.rateAutres)
              ? `${fmtPct(s.rateAutres, 1)} ${trad('par an')}` : trad('valeur constante')} ·
            ${trad('liquidités')} ${trad('sans rendement')}</span>
        </div>
      <details class="pli-reglages pli-avance" id="hypoAvance"
               ${avanceOuvert || s.scenario === 'perso' ? 'open' : ''}>
        <summary>
          <span class="pli-valeurs">${trad('Personnaliser les hypothèses')}</span>
          <span class="pli-action">${s.scenario === 'perso'
            ? trad('personnalisé') : trad('Ouvrir')}</span>
        </summary>
        <div class="modal-champs" style="margin-top:8px">
        ${champ('Rendement des actifs de marché', 'meta.projRate', paliers(20, 1),
                v => `${fmtPct(v, 0)} ${trad('par an')}`,
                `${fmtEUR0(capitalisation({ years: 1 }).poches.marche)} ${trad('de portefeuille financier coté, auquel Tallya applique le rendement du scénario. La crypto, les métaux précieux et le non coté sont regroupés dans l’hypothèse « Autres actifs », juste en dessous.')} `
                + trad('C’est une hypothèse de travail : aucun rendement n’est garanti'),
                /* Le taux EN VIGUEUR, et non celui qui dort dans l'etat.
                   Ces trois champs lisaient `meta.projRate` et compagnie, alors
                   que c'est le scenario qui gouverne : « Dynamique » affichait
                   8 % sur son pave et « 0 % par an » dans le champ juste en
                   dessous. Un reglage qui montre autre chose que ce qu'il
                   commande n'est pas un reglage, c'est un piege. */
                s.rate)}
        ${champ('Rendement des autres actifs', 'meta.projRateAutres', paliers(20, 1),
                v => `${fmtPct(v, 0)} ${trad('par an')}`,
                `${fmtEUR0(capitalisation({ years: 1 }).poches.autres)} ${trad('de crypto, de métaux précieux et de non coté. Valeur constante par défaut : trop incertains pour une hypothèse standard')}`,
                s.rateAutres)}
        ${champ('Rendement du capital garanti', 'meta.projRateGaranti', paliers(8, 0.5),
                v => `${fmtPct(v, 1)} ${trad('par an')}`,
                `${fmtEUR0(capitalisation({ years: 1 }).poches.garanti)} ${trad('de fonds euros et de supports garantis. Le scénario y applique une hypothèse prudente, que tu peux changer ici')}`,
                s.rateGaranti)}

        <div class="field">
          <label>${trad('Rendement des liquidités')}${aide(
            `${fmtEUR0(capitalisation({ years: 1 }).poches.liquidites)} ${trad('de liquidités,')} `
            + trad('livret ou non, y compris le cash déjà chez ton courtier : tant qu’il '
            + 'n’est pas placé, il ne rapporte rien. Elles traversent donc la '
            + 'projection telles quelles, et il n’y a rien à régler.'))}</label>
          <p class="valeur-figee">0 % ${trad('par an')}</p>
        </div>
        ${champ('Inflation', 'meta.projInflation', paliers(20, 1),
                v => `${fmtPct(v, 0)} ${trad('par an')}`,
                trad('Les rendements des scénarios sont nominaux : l’inflation se retire '
                  + 'ensuite, une fois, sur le total. La ligne « Après inflation » donne '
                  + 'donc le résultat en euros d’aujourd’hui, c’est-à-dire ce que cette '
                  + 'somme permettrait d’acheter aux prix que tu connais.'))}
        </div>
      </details>
        ${champ('Cible', 'meta.projTarget',
                [0, 100000, 250000, 500000, 1000000],
                v => v ? fmtEUR0(v) : trad('Pas de cible'),
                trad('Optionnel. Si tu en poses une, la page dit en quelle année tu la franchis. '
                  + 'La cible se lit en euros courants, comme le total : elle se compare '
                  + 'au montant nominal, pas à sa valeur après inflation.'))}
      </div>
      </details>

      ${s.target && !anneeAtteinte ? `<div class="note" style="margin-top:12px">
        ${(() => {
            const req = targetRequirements({ target: s.target, years: projHorizon });
            const lignes = [];
            if (req.years) lignes.push(`${trad('attendre')} <b>${req.years.toFixed(1).replace('.', enAnglais() ? '.' : ',')} ${trad('ans')}</b> `
              + `(${trad('soit')} ${new Date().getFullYear() + Math.ceil(req.years)}) ${trad('sans rien changer')}`);
            if (req.monthly != null) lignes.push(`${trad('passer à')} <b>${fmtEUR0(req.monthly)} ${trad('par mois')}</b> `
              + `${trad('au lieu de')} ${fmtEUR0(s.monthly)}`);
            /* Le levier ne touche QUE le taux des actifs de marche :
               `targetRequirements` rejoue le moteur avec `rate` modifie et laisse
               les autres poches telles quelles. Sans le dire, « obtenir 8,4 %
               par an » se lisait comme un rendement du patrimoine entier, et
               personne n'aurait su quel reglage bouger. */
            if (req.rate != null) lignes.push(`${trad('obtenir')} <b>${fmtPct(req.rate, 1)} ${trad('par an')}</b> `
              + `${trad('sur les actifs de marché, au lieu de')} ${fmtPct(s.rate, 1)}`);
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
      <div class="card-head">
        <h2>${trad('Trajectoire')}</h2>
        <span class="hint">${trad('Sur')} ${projHorizon} ${trad('ans, jusqu’en')} ${dernier.year} · ${
          fmtEUR0(s.monthly)} ${trad('/ mois')}</span>
      </div>
      <div class="chart" id="chartProjection"></div>
      <div class="legend">
        <span><i style="background:${S1()}"></i>${trad('Ce que tu as déjà et ce que tu verses')}</span>
        <span><i style="background:${S2()}"></i>${trad('Ce que le rendement ajoute')}</span>
        <span><i class="legend-bande"></i>${trad('Avec ±2 points sur le rendement des actifs de marché')}</span>
      </div>
      <p class="small muted" style="margin:12px 0 0">
        ${fmtPct(s.rate)} ${trad('par an sur tes actifs de marché.')}
        ${num(pochesProjection().autres)
          ? (num(s.rateAutres) ? `${fmtPct(s.rateAutres)} ${trad('sur tes autres actifs.')}`
                               : trad('Tes autres actifs gardent leur valeur actuelle.'))
          : ''}
        ${trad('Tes liquidités gardent leur valeur, le cash qui attend chez ton courtier compris.')}
      </p>
      ${(() => {
        const t0 = nowTotals();
        const plat = num(p.plat), dettes = num(t0.dettes);
        const bien = num(t0.immo) + num(t0.biens);
        const aImmo = num(t0.immo) > 0.005, aBiens = num(t0.biens) > 0.005;
        const sujet = aImmo && aBiens ? trad('Ton immobilier et tes biens sont portés à leur')
                    : aBiens ? trad('Tes biens de valeur sont portés à leur')
                    : trad('Ton immobilier est porté à sa');
        if (!plat && !dettes) return '';
        const note = txt => `<p class="small muted" style="margin:12px 0 0">${txt}</p>`;
        /* La note affirmait que « le capital que tes mensualites remboursent
           chaque mois » n'est pas projete. C'etait vrai d'une version anterieure
           du moteur, et c'est faux depuis : `moteurProjection` amortit les
           credits mois par mois et ajoute le capital rendu a la part plate, qui
           monte donc toute seule. Un texte qui dit le contraire de ce que le
           calcul fait est pire qu'un texte absent : il fait douter du chiffre
           juste.

           `dettesAmortissables()` decide, et il ne prend pas tout : un credit
           sans taux ni mensualite declares, ou dont la mensualite ne couvre pas
           ses interets, reste constant. La phrase suit donc ce que le moteur
           amortit reellement, et non ce qu'on aimerait qu'il amortisse. */
        const amortis = dettesAmortissables().length;
        const dette = !dettes ? ''
          : amortis
            ? ' ' + trad('Le capital que tes mensualités remboursent est projeté : cette part '
                + 'monte mois après mois, à mesure que la dette baisse. La mensualité libérée '
                + 'à la fin du prêt, elle, n’est pas réinvestie.')
            : ' ' + trad('Tes crédits restent à leur montant d’aujourd’hui : sans taux ni '
                + 'mensualité déclarés, leur remboursement ne peut pas être projeté, et la '
                + 'courbe sous-estime donc ton patrimoine.');
        if (plat > 0) return note(`${sujet} ${trad('valeur d’aujourd’hui,')} ${fmtEUR0(plat)}${
          dettes ? ' ' + trad('nets,') : ''}${trad(' du premier point au dernier : son prix '
          + 'ne monte ni ne baisse.')}${dette}`);
        if (!plat) return note((dette || ' ').slice(1));
        return note(bien
          ? `${trad('Tes crédits dépassent aujourd’hui la valeur de ton bien : cette part nette,')}
             ${fmtEUR0(plat)}${trad(', est portée telle quelle, le prix du bien ne bougeant pas.')}${dette}`
          : `${trad('Tes crédits sont portés à leur montant d’aujourd’hui,')} ${fmtEUR0(Math.abs(plat))}.${dette}`);
      })()}
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>${trad('Par horizon')}</h2>
      <span class="hint">${fmtEUR0(s.monthly)} ${trad('/ mois')} ·
        ${trad('scénario')} ${trad(nomScenario(s.scenario)).toLowerCase()}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Horizon</th>
          <th class="large-seulement">${trad('Apports')}</th>
          <th class="large-seulement">${trad('Gains cumulés')}</th>
          <th>${trad('Patrimoine')}</th><th>${trad('Après inflation')}</th>
        </tr></thead>
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

  `;
}

function mountObjective() {
  const p = capitalisation({ years: projHorizon });
  const s = p.settings;
  const bas = capitalisation({ years: projHorizon, rate: num(s.rate) - 2 });
  const haut = capitalisation({ years: projHorizon, rate: num(s.rate) + 2 });
  const points = p.points.map((pt, i) => ({
    ...pt, bandeBas: bas.points[i].total, bandeHaut: haut.points[i].total,
  }));
  Charts.stackedArea($('#chartProjection'), {
    points, height: 320,
    bande: { min: 'bandeBas', max: 'bandeHaut' },
    series: [
      { key: 'contributed', label: trad('Départ et versements'), color: S1() },
      { key: 'gains', label: 'Rendement', color: S2() },
    ],
    guide: num(s.target) ? { value: num(s.target), label: 'Cible' } : null,
  });

  const hy = $('#hypoDetail');
  if (hy) hy.addEventListener('toggle', () => { hypoOuvert = hy.open; });
  const av = $('#hypoAvance');
  if (av) av.addEventListener('toggle', () => { avanceOuvert = av.open; });
}

const POINTEUR_TACTILE = matchMedia('(pointer: coarse)').matches;
function focusChamp(el) {
  if (!el || POINTEUR_TACTILE) return;
  el.focus();
  el.select?.();
}

const OPTIONS_CLASSE = Object.entries(ASSET_CLASSES);
const OPTIONS_ROLE = Object.entries(ROLES);

/* `poidsLigne` a vecu ici : elle divisait par la somme des titres cotes seuls,
   quand les quatre autres surfaces divisaient par le portefeuille Marches
   entier. Une meme ligne valait donc 66,8 % dans le tableau du jour et 53,89 %
   sur sa fiche. `poidsPortefeuille()`, dans store.js, porte la seule
   definition ; la ligne recue porte deja sa valeur, calculee par
   dayPerformance, donc rien ne se cherche par nom. */

const classeDuType = t => {
  const s = String(t || '').toLowerCase();
  if (/crypto/.test(s)) return 'crypto';
  if (/bond|obligation/.test(s)) return 'obligations';
  if (/currency|devise/.test(s)) return 'monetaire';
  return 'actions';
};

const comptesPourListe = cat => comptesPourCategorie(cat)
  .map(c => [c.id, sousNom('', nomCompteV2(c), nomEtabDe(c))]);
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'CAD', 'JPY'];

const EXCHANGES = [
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

const CURRENCY_SIGNS = { EUR: '€', USD: '$', GBP: '£', CHF: 'Fr', SEK: 'kr', CAD: 'C$', JPY: '¥' };
const currencySign = c => CURRENCY_SIGNS[c] || c || '€';

/* `prixCell` vivait ici : une cellule de prix avec sa conversion en euros en
   dessous, pour le PRU et le cours du tableau des lignes. Ces deux colonnes sont
   parties avec les neuf autres que la fiche portait deja, et la fonction n'avait
   plus d'appelant. */

let evoRange = '1y';
/* Net ou brut : une seule notion, un seul réglage, et désormais un seul
   commutateur.

   Le grand chiffre et la courbe ont d'abord eu chacun le leur, et deux états :
   on pouvait afficher le titre en brut au-dessus d'une courbe tracée en net, sur
   le même écran, sans que rien ne le signale. Ils ont ensuite commandé la même
   variable, ce qui réglait le mensonge sans régler la question posée — deux
   boutons identiques à deux endroits laissent croire qu'ils font deux choses.

   Il n'en reste qu'un, dans la grande carte, et il gouverne toute la page. La
   place libérée sous le graphique porte le seul réglage qui lui appartienne en
   propre : le périmètre, `evoFinancier` juste dessous. Deux questions, deux
   commandes, chacune à un seul endroit. */
let evoNet = true;    // valorisation de toute la page Aujourd'hui
/* Le perimetre de la seule courbe d'evolution, et rien d'autre sur la page.

   Financier par defaut, et c'est le point de tout le reglage : l'immobilier
   physique pese 60 a 80 % d'un patrimoine ordinaire, sa bande ecrase l'echelle,
   et les mouvements de placements -- la seule chose qu'on pilote vraiment --
   deviennent un trait plat. La vue globale reste a un clic pour qui veut le
   patrimoine entier dans le temps.

   Il ne s'enregistre pas, comme le commutateur d'Allocation : un reglage de
   lecture vit le temps d'une session. La difference avec lui est le defaut, et
   elle est assumee dans les deux sens -- Allocation compte tout par defaut parce
   que quelqu'un qui a oublie son reglage y lirait un patrimoine amoindri, alors
   qu'ici le grand chiffre juste au-dessus continue d'annoncer le patrimoine
   complet : la courbe ne peut donc tromper personne sur ce qu'il possede.

   Independant de `evoNet`, qui dit comment on valorise et non ce qu'on regarde.
   Les quatre combinaisons ont un sens, et le net financier vaut le brut financier
   tant qu'aucune dette ne declare l'actif qu'elle finance : voir
   `pointsEvolution()`. */
let evoFinancier = true;
/* Une transition a montrer au prochain montage de la courbe, et une seule.

   `render()` remonte le graphique a chaque frappe, a chaque changement de plage
   et a chaque retour sur la vue : animer a chaque montage rejouerait une demi
   seconde de mouvement pour un rafraichissement que personne n'a demande. C'est
   la regle deja posee pour le balayage d'arrivee, qui ne joue que sous
   `.vue-entre`. Le drapeau se leve sur le seul geste qui change le cadrage, et
   le montage de la courbe le consomme. */
let evoTransition = false;
let paceRange = '1y';        // rythme d'accumulation
let journalOuvert = false;
/* La ligne « Revenus » de la carte « Ou va ce que tu gagnes » ouvre ses sources.
   L'etat vit ici, comme les autres replis de vue : un `details` natif se
   refermerait a chaque rendu, et le rendu suit chaque frappe dans un champ. */
let revenusOuvert = false;
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

let triVentes = 'date';

/* Le depliant du journal se souvient. Un `<details>` est recree a chaque rendu,
   et cette page se rend a chaque arrivee de cours : sans memoire, il se refermait
   sous les yeux de qui venait de l'ouvrir. Ouvert par defaut — la carte n'a plus
   de tuiles au-dessus, donc replie elle ne montrerait qu'un titre. */
let journalDeroule = true;
let posSort = null;
let posRole = 'tous';
let posCompte = 'tous';
const POS_SORT_KEYS = {
  name:     p => p.name?.toLowerCase() || '',
  value:    p => posValue(p),
  invested: p => posInvested(p),
  perfEur:  p => posPerfEur(p),
  perfPct:  p => posPerfPct(p),
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
/* `barre` a vecu ici : un dessin pose sous la ligne, qui empilait les poches du
   mois sous chaque releve. Le journal patrimonial n'en veut plus — douze barres
   dont l'immobilier occupe les quatre cinquiemes se ressemblent toutes, et la
   composition d'un mois se lit dans la fenetre de ce mois. Un parametre sans
   appelant est la moitie qu'on oublie : il part avec ses trois regles CSS. */
/* `jauge` : une part signee entre -1 et +1, ou `null`. Elle vit dans l'espace
   laisse libre entre le nom du mois et les montants, et elle ne dit rien de plus
   que la variation deja ecrite a droite -- d'ou `aria-hidden` : un lecteur
   d'ecran lit le nombre, il n'a que faire du dessin.

   Le centre vaut zero, la longueur vaut l'amplitude, le cote vaut le signe. Un
   mois sans variation -- ou le premier de la serie, qui n'a rien avant lui --
   pose un point neutre au centre plutot que rien : une case vide se lit comme une
   donnee manquante, un point se lit comme un mois plat.

   L'appelant fournit la part, jamais le montant : l'echelle est commune aux
   lignes affichees, et une ligne ne peut pas la calculer pour elle seule.

   La ligne porte `avec-jauge` : c'est cette classe qui deplace la croissance du
   nom du mois vers la piste, et elle seule. `ligneListe` sert a six ecrans, et
   les cinq autres gardent leur mise en page. */
function ligneListe({ action, index, titre, sous, valeur, second, classeSecond, marque, ancre, classe, jauge }) {
  const part = jauge == null ? null : Math.max(-1, Math.min(1, num(jauge)));
  return `
  <button type="button" class="mlist${part == null ? '' : ' avec-jauge'}${classe ? ` ${classe}` : ''}"
          data-action="${action}" data-i="${index}"${ancre ? ` data-anchor="${esc(ancre)}"` : ''}>
    <span class="ml-nom">${esc(titre)}${marque || ''}${sous ? `<span class="sub">${esc(sous)}</span>` : ''}</span>
    ${part == null ? '' : `<span class="ml-jauge" aria-hidden="true">${
      Math.abs(part) < 0.005
        ? '<i class="plat"></i>'
        : `<i class="${part > 0 ? 'up' : 'down'}" style="${
            part > 0 ? 'left' : 'right'}:50%; width:${(Math.abs(part) * 50).toFixed(1)}%"></i>`
    }</span>`}
    <span class="ml-chiffres">
      <b>${valeur}</b>
      ${second ? `<span class="${classeSecond || 'muted'}">${second}</span>` : ''}
    </span>
    <span class="ml-chev" aria-hidden="true">›</span>
  </button>`;
}

/* Une en-tete triable, et sa bulle d'aide a cote plutot que dessus.

   `suffixe` porte l'unite (« dev. »), qui fait partie de l'intitule et reste
   donc dans la zone cliquable. */
let jourSort = null;

function triJourTh(key, label, explication = '') {
  const on = jourSort && jourSort.key === key;
  const sens = !on ? trad('décroissant')
             : jourSort.dir === 'desc' ? trad('croissant') : trad('aucun tri');
  return `<span class="tri-jour ${on ? jourSort.dir : ''}">`
       + `<button type="button" class="th-tri" data-action="sort-jour" data-key="${key}"`
       + ` title="${trad('Trier par')} ${esc(trad(label))}, ${trad('ordre')} ${sens}">${esc(trad(label))}</button>`
       + (explication ? `<i class="col-aide" data-aide="${esc(trad(explication))}" tabindex="0" role="button">?</i>` : '')
       + `</span>`;
}

/* Les lignes du jour dans l'ordre demande. Sans tri, l'ordre naturel de
   `dayPerformance()`, qui est deja celui de l'ampleur du mouvement. */
function trierJour(lignes) {
  if (!jourSort) return lignes;
  /* La base, lue une fois : la passer au comparateur plutot que de la laisser
     au parametre par defaut evite un `stockTotals()` par comparaison, donc des
     dizaines de parcours des positions pour un chiffre qui ne bouge pas. */
  const base = basePortefeuilleMarches();
  const cle = {
    nom: l => String(l.name || '').toLowerCase(),
    poids: l => poidsPortefeuille(l.value, base),
    pct: l => (l.horsSeance ? -Infinity : num(l.pct)),
    eur: l => (l.horsSeance ? -Infinity : num(l.eur)),
  }[jourSort.key];
  if (!cle) return lignes;
  const signe = jourSort.dir === 'asc' ? 1 : -1;
  return lignes.slice().sort((a, b) => {
    const x = cle(a), y = cle(b);
    return typeof x === 'string' ? signe * x.localeCompare(y) : signe * (x - y);
  });
}

function sortableTh(key, label, extraClass = '', explication = '', suffixe = '') {
  const on = posSort && posSort.key === key;
  const sens = !on ? trad('décroissant') : posSort.dir === 'desc' ? trad('croissant') : trad('aucun tri');
  return `<th class="sortable ${on ? posSort.dir : ''} ${extraClass}">`
       + `<button type="button" class="th-tri" data-action="sort-positions" data-key="${key}"`
       + ` title="${trad('Trier par')} ${esc(trad(label))}, ${trad('ordre')} ${sens}">${esc(trad(label))}${suffixe}</button>`
       + (explication ? aide(trad(explication)) : '')
       + `</th>`;
}

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
  /* Les trois valeurs des cartes de ventes, en bas de page. Elles vivaient dans
     l'ancienne vue Performance ; le journal et ses deux graphiques ayant
     demenage ici, leur base les suit. `salesRange` est la borne de temps que le
     journal affiche et regle lui-meme. */
  const st = salesStats(salesRange);
  const tout = salesStats('all');
  const libellePlage = rangeLabel(salesRange);
  const stockBase = stockTotals().balance;
  const brokerAccounts = ACCOUNTS.filter(a => a.holdings);

  if (posCompte !== 'tous' && !Store.state.positions.some(p => p.account === posCompte)) {
    posCompte = 'tous';
  }

  const retenues = Store.state.positions
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => posRole === 'tous' || roleDe(p) === posRole)
    .filter(({ p }) => posCompte === 'tous' || p.account === posCompte);
  const ps = sortPositions(retenues)
    .map(({ p, i }) => Object.assign(Object.create(Object.getPrototypeOf(p)), p, { __i: i }));
  const masquees = Store.state.positions.length - retenues.length;

  const dev = q => q.currency || 'EUR';
  const rows = ps.map((p) => {
    const i = p.__i;
    const v = posValue(p), inv = posInvested(p), pe = posPerfEur(p), pp = posPerfPct(p);
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
      <td class="muted">${fmtPct(poidsPortefeuille(v, stockBase))}</td>
    </tr>`;
  }).join('');

  if (!Store.state.positions.length) {
    return `
  <div class="card">
    <div class="card-head"><h2>${trad('Aucun titre coté')}</h2>
      <span class="hint">${trad('actions, ETF, obligations, crypto')}</span></div>
    <p class="empty" style="margin:0 0 12px">${trad('Cette page suit les placements '
      + 'dont le cours arrive tout seul, du marché. Tes placements non cotés, ton '
      + 'immobilier et tes liquidités se déclarent dans Actifs, où c’est toi qui en '
      + 'donnes la valeur : ils comptent dans ton patrimoine, ta répartition et ton '
      + 'autonomie exactement comme le reste.')}</p>
    ${(() => {
      const porteurs = TYPES_COMPTE.filter(t =>
        (t.classes || []).some(c => ['actions', 'obligations', 'crypto'].includes(c)));
      const eligibles = comptesOuverts().filter(c =>
        porteurs.some(t => t.id === c.type));
      if (eligibles.length) return `
    <div class="row" style="gap:8px">
      <button class="btn" data-action="goto" data-view="accounts" data-anchor="">${trad('Aller à Actifs')}</button>
      <button class="btn ghost" data-action="ajouter-ligne">${trad('+ Un titre coté')}</button>
    </div>`;
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
    return comptesOuverts().some(c => porteurs.some(t => t.id === c.type))
      ? symbolSearchCard() : '';
  })()}`;
  }

  return `
  ${barreEtatCours()}

  ${(() => {
    const j = dayPerformance();
    if (!j.lignes.length) {
      return `<div class="card">
        <div class="card-head"><h2>${trad('Aujourd\'hui')}</h2></div>
        <p class="empty">${trad('Pas encore de clôture de la veille en mémoire. '
          + 'Actualise les cours pour que la performance du jour apparaisse.')}</p>
      </div>`;
    }
    const positif = j.eur >= 0;
    /* La base des poids, lue une fois pour toute la carte : `stockTotals()`
       reparcourt les positions, et l'appeler par ligne puis par comparaison de
       tri le ferait des dizaines de fois pour un chiffre qui ne bouge pas. */
    const poidsBase = basePortefeuilleMarches();
    return `
    <div class="card jour" data-anchor="jour">
      <div class="card-head">
        <h2>${trad('Aujourd\'hui')}</h2>
        <span class="hint">${j.hausse} ${trad('en hausse')} · ${j.baisse} ${trad('en baisse')}
          ${j.sansDonnee ? `· ${j.sansDonnee} ${trad('sans cours de veille')}` : ''}
          ${j.horsSeance && !j.toutHorsSeance ? `· ${j.horsSeance} ${trad('sans cours du jour')}` : ''}</span>
      </div>

      ${j.toutHorsSeance ? `
      <div class="jour-total">
        <span class="jour-eur muted">${trad('hors séance')}</span>
        <span class="jour-note">${trad('aucune de tes lignes n’a coté depuis minuit')}${
          j.asOfMarche ? ` : ${trad('le cours le plus récent date')} ${fmtCoursQuand(j.asOfMarche)}` : ''}</span>
      </div>` : `
      <div class="jour-total ${positif ? 'up' : 'down'}">
        <span class="jour-eur">${fmtSigned(j.eur)}</span>
        <span class="jour-pct">${arrow(j.pct)} ${fmtSignedPct(j.pct)}</span>
        <span class="jour-note">${trad('sur ton portefeuille Marchés depuis la clôture d’hier')}${
          j.lignes.some(l => l.depuisAchat) ? `, ${trad('ou depuis ton achat du jour')}` : ''}${
          j.sansDonnee ? ` · ${
            (j.sansDonnee > 1 ? trad('{n} lignes sans clôture de référence n’y sont pas comptées')
                              : trad('{n} ligne sans clôture de référence n’y est pas comptée'))
              .replace('{n}', j.sansDonnee)}` : ''}</span>
      </div>`}

      <div class="jour-lignes">
        <div class="jour-ligne entete">
          ${triJourTh('nom', 'Ligne')}
          ${triJourTh('poids', 'Poids', 'Part de cette ligne dans l’ensemble de ton portefeuille Marchés, cash à investir inclus. Elle dit laquelle compte vraiment quand elle bouge : 1 % sur une ligne qui pèse la moitié du portefeuille déplace plus d’argent que 10 % sur une ligne à 3 %.')}
          ${triJourTh('pct', 'Var.', 'La variation du titre depuis la clôture de la veille, dans sa propre devise : le mouvement affiché est celui du titre, pas celui du change. Les deux cours qui la produisent sont écrits sous le nom de la ligne, clôture de la veille puis cours du jour. Une ligne achetée aujourd’hui se compare à ton prix d’achat, et le dit sous son nom : tu ne la détenais pas hier soir.')}
          ${triJourTh('eur', 'Effet', 'Ce que cette variation pèse sur ton patrimoine, convertie au taux du jour. C’est la colonne qui dit combien tu as gagné ou perdu, là où la variation ne dit qu’un pourcentage.')}
        </div>
        ${trierJour(j.lignes).map(l => `
          <div class="jour-ligne">
            <span class="jl-nom"><button type="button" class="mois-lien"
              data-action="open-position" data-i="${l.index}"
              title="${esc(l.name)} · ${trad('voir la fiche complète')}">${
                esc(l.name)}</button></span>
            <span class="jl-poids muted">${fmtPct(poidsPortefeuille(l.value, poidsBase), 1)}</span>
            <span class="jl-pct ${l.horsSeance ? '' : cls(l.pct)}">${
              l.horsSeance ? '' : fmtSignedPct(l.pct, 2)}</span>
            <span class="jl-eur ${l.horsSeance ? '' : cls(l.eur)}">${
              l.horsSeance ? '' : fmtSigned(l.eur)}</span>
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
    </div>`;
  })()}

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

  <div class="reperes-familles" id="reperesFamilles" role="tablist"
       aria-label="${trad('Familles de repères')}" hidden></div>
  <div class="reperes" id="reperes" aria-label="${trad('Marchés')}" hidden></div>

  <div class="card" data-anchor="titres">
    <div class="card-head">
      <h2>${trad('Lignes de titres')}</h2>
      <div class="row">
        <button class="btn sm ghost" data-action="sell-position"
                ${ps.length ? '' : 'disabled'}
                title="${trad('Enregistrer une vente et sa plus-value')}">− Vendre</button>
        <button class="btn sm" data-action="ajouter-ligne">${trad('+ Ajouter une ligne')}</button>
      </div>
      <div class="row" style="margin:8px 0 0">
        <div class="segmented seg-mini" role="group" aria-label="${trad('Filtrer par rôle')}">
          ${[['tous', trad('Tous')], ['core', 'Core'], ['satellite', 'Satellite']].map(([v, l]) =>
            `<button type="button" data-action="filtrer-role" data-role="${v}"
                     class="${posRole === v ? 'on' : ''}" aria-pressed="${posRole === v}">${l}</button>`).join('')}
        </div>
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
            'Part de cette ligne dans l’ensemble de ton portefeuille Marchés, cash à '
            + 'investir inclus. Le même calcul que la colonne « Poids » de la carte du jour '
            + 'et que la fiche de la ligne.')}
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

  ${salesCard()}

  <div class="card">
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
      <span class="hint">${esc(libellePlage)} · ${
        (st.count > 1 ? trad('{n} ventes, dans l’ordre') : trad('{n} vente, dans l’ordre'))
          .replace('{n}', st.count)}</span></div>
    <div class="chart" id="perfCumul"></div>
  </div>` : ''}`;
}

function salesCard() {
  const toutes = Store.state.sales || [];
  const aVendre = (Store.state.positions || []).length;

  const st = salesStats(salesRange);
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
      <h2>${trad('Journal des ventes')}${aide(trad('Résultat brut, avant frais et fiscalité : '
        + 'le traitement fiscal dépend de l’enveloppe (PEA, CTO) et de ta situation.'))}</h2>
      ${toutes.length ? `<span class="hint">${st.count} ${st.count > 1 ? trad('ventes') : trad('vente')}${
        st.count === toutes.length ? '' : ` ${trad('sur.total', 'sur')} ${toutes.length}`}</span>
      ${plages}` : ''}
      <button class="btn sm ghost" data-action="sell-position"
              title="${trad('Enregistrer une vente et sa plus-value, ou en déclarer une passée')}">− ${trad('Vendre')}</button>
    </div>
    ${!toutes.length ? `<p class="empty">${trad('Aucune vente enregistrée.')} ${aVendre
      ? trad('Le bouton « Vendre » enregistre la vente, sa plus-value, et crédite le compte de ton choix.')
      : trad('Il faut une ligne de titres avant de pouvoir en vendre une.')}</p>` : `
    ${st.count ? `<details class="data-view" id="pliVentes" ${journalDeroule ? 'open' : ''}>
      <summary>${trad('Voir les')} ${st.count} ${st.count > 1 ? trad('ventes') : trad('vente')}</summary>
      <div class="segmented seg-mini" style="margin:4px 0 8px">
        <button data-action="tri-ventes" data-tri="date" class="${triVentes === 'date' ? 'on' : ''}"
                aria-pressed="${triVentes === 'date'}">${trad('Par date')}</button>
        <button data-action="tri-ventes" data-tri="montant" class="${triVentes === 'montant' ? 'on' : ''}"
                aria-pressed="${triVentes === 'montant'}">${trad('Par montant')}</button>
      </div>
      <div class="liste-principale" style="margin-top:4px">
        ${(() => {
          const plusGrand = Math.max(...st.sales.map(v => Math.abs(num(v.realised))), 0);
          const listees = triVentes === 'montant'
            ? st.sales.slice().sort((a, b) => num(b.realised) - num(a.realised))
            : st.sales;
          return listees.map(v => {
            const dev = v.currency || 'EUR';
            const pct = num(v.invested) ? num(v.realised) / num(v.invested) * 100 : null;
            const part = plusGrand ? Math.abs(num(v.realised)) / plusGrand * 100 : 0;
            const teinte = num(v.realised) >= 0 ? 'var(--good)' : 'var(--critical)';
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

let REPERES_AFFICHES = [];

const AIDE_VIX = 'Le VIX mesure la volatilité implicite attendue sur le S&P 500. '
  + 'Plus il est élevé, plus le marché anticipe de fortes variations.';

const NIVEAUX_VIX = [
  [30, 'Très élevée'],
  [20, 'Élevée'],
  [15, 'Modérée'],
  [0,  'Faible'],
];
/* Ce que les deux perimetres contiennent, et la consequence qu'on observe :
   en Financier, la bascule net/brut ne bouge pas la courbe. Ce n'est pas une
   approximation, c'est la regle de `repartitionClasses` dite a l'endroit ou on
   la constate. */
const AIDE_PERIMETRE = 'Financier : tes placements et tes liquidités. Global : tout, immobilier et biens compris. Un crédit finance un bien, que le Financier laisse dehors : il ne s’y retire donc pas, et net et brut y donnent la même courbe.';

const estVix = l => String(l?.symbole || '') === '^VIX';
/* `null` plutot qu'un libelle par defaut : sans valeur utilisable, la tuile ne
   doit rien affirmer. C'est la meme regle que le « hors seance » des autres
   reperes, qui se tait plutot que d'afficher la variation de la veille. */
function niveauVix(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return trad((NIVEAUX_VIX.find(([seuil]) => n >= seuil) || NIVEAUX_VIX[NIVEAUX_VIX.length - 1])[1]);
}

const uniteRepere = l => estVix(l) ? ''
  : String(l?.symbole || '').startsWith('^') ? ` ${trad('pts')}`
  : l?.devise === 'USD' ? ' $' : l?.devise === 'EUR' ? ' €'
  : l?.devise ? ` ${l.devise}` : '';

let familleReperes = null;
/* Vrai le temps d'un rendu, pose par le clic sur un onglet de famille. Le meme
   mecanisme que `tapeSousOnglets` : l'intention vit dans le geste, la classe
   est posee au rendu suivant puis retiree quand l'animation a fini. */
let reperesEntrent = false;
let reperesSens = 1;

async function mountReperes() {
  const box = $('#reperes');
  if (!box) return;
  familleReperes = familleReperes || Quotes.familleParDefaut;

  const familles = Quotes.famillesReperes();
  const onglets = $('#reperesFamilles');
  if (onglets) {
    if (!onglets.querySelector('[data-famille]')) {
      onglets.innerHTML = familles.map(([cle, nom]) => `
        <button type="button" class="rp-famille" data-famille="${esc(cle)}">${esc(nom)}</button>`).join('')
        + '<i class="rp-curseur" aria-hidden="true"></i>';
    }
    for (const b of onglets.querySelectorAll('[data-famille]')) {
      b.onclick = () => {
        if (b.dataset.famille === familleReperes) return;
        const cles = familles.map(f => f[0]);
        reperesSens = cles.indexOf(b.dataset.famille) >= cles.indexOf(familleReperes) ? 1 : -1;
        familleReperes = b.dataset.famille;
        retourHaptique();
        reperesEntrent = true;
        mountReperes();
      };
    }
    for (const b of onglets.querySelectorAll('[data-famille]'))
      b.classList.toggle('on', b.dataset.famille === familleReperes);
    const actif = onglets.querySelector('.rp-famille.on');
    const curseur = onglets.querySelector('.rp-curseur');
    if (actif && curseur) {
      curseur.style.width = `${actif.offsetWidth}px`;
      curseur.style.transform = `translateX(${actif.offsetLeft}px)`;
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
            title="${esc(l.nom)}${estVix(l) ? ` · ${esc(trad(AIDE_VIX))}` : ''}${
              l.quoteTime ? ` · ${trad('cours')} ${fmtCoursQuand(l.quoteTime)}` : ''}">
      <span class="rp-tete">
        <span class="rp-nom">${esc(l.nom)}</span>
        ${glypheSeance(marketStatus(l))}
      </span>
      <span class="rp-prix">${nb(l.prix, estVix(l) ? 1 : l.prix < 10 ? 4 : 0)}<span class="rp-unite">${esc(uniteRepere(l))}</span></span>
      ${estVix(l) ? `<span class="rp-var rp-vix">${esc(niveauVix(l.prix) || trad('hors séance'))}</span>`
        : `<span class="rp-var ${l.pct == null ? 'muted' : cls(l.pct)}">${
        l.pct == null ? trad('hors séance') : fmtSignedPct(l.pct, 2)}</span>`}
    </button>`).join('');
  box.hidden = false;
  if (reperesEntrent) {
    reperesEntrent = false;
    box.style.setProperty('--sens', String(reperesSens));
    box.classList.add('rp-entre');
    setTimeout(() => box.classList.remove('rp-entre'), 700);
  }
  box.scrollLeft = 0;
}

/* Pose par l'action « ajouter une ligne », consomme par `render()` : la carte
   de recherche n'existe pas encore au moment du clic si l'on arrive d'une
   autre vue. */
let ouvrirRechercheApresRendu = false;
let compteVisePourAjout = null;

function mountPositions() {
  const pli = $('#pliVentes');
  if (pli) pli.ontoggle = () => { journalDeroule = pli.open; };

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

  if (!Store.state.positions.length) return;
  mountReperes();
  monteTirerRafraichir();
}

function fmtWhen(iso) {
  if (!iso) return trad('jamais');
  const d = new Date(iso), mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return trad("à l'instant");
  if (mins < 60) return trad('il y a {n} min').replace('{n}', mins);
  if (mins < 1440) return trad('il y a {n} h').replace('{n}', Math.round(mins / 60));
  return d.toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
}

function barreEtatCours() {
  return `
  <div class="barre-etat">
    <button class="etat-cours" id="btnQuotes" type="button" data-action="refresh-quotes"
            title="${trad('Récupérer les cours de bourse')}"><i class="pt"></i><span id="coursQuand">${trad('Cours')}</span><span
            class="etat-maj" aria-hidden="true">↻</span></button>
  </div>`;
}

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
    quand.textContent = trad('Cours…');
    btn.title = trad('Récupération en cours');
    return;
  }
  if (on === false) {
    btn.classList.add('hs');
    btn.disabled = true;
    quand.textContent = trad('Hors ligne');
    btn.title = trad('Impossible de mettre à jour les cours pour le moment');
    return;
  }
  btn.disabled = false;
  if (!Quotes.plan().symbols.length) {
    quand.textContent = trad('Cours');
    btn.title = trad('Aucun symbole suivi pour l’instant');
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
  const j = dayPerformance();
  const ferme = !!j.toutHorsSeance;
  const partiel = !ferme && j.horsSeance > 0;
  if (partiel) { btn.classList.remove('frais'); btn.classList.add('tiede'); }
  quand.textContent = ferme ? trad('hors séance')
                    : partiel ? `${j.horsSeance} ${trad('hors séance')}`
                    : marche ? fmtWhen(new Date(marche * 1000))
                    : last ? fmtWhen(last) : trad('Cours');
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
      <div class="card-head"><h2>${trad('Ajouter une ligne')}</h2></div>
      <p class="small muted" style="margin:0 0 12px">
        ${trad('Pas d’ISIN, ou un titre coté nulle part ?')}
        <button class="lien-nu" data-action="add-position">${trad('Saisir la ligne à la main')}</button>
      </p>
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
    if (q.length < 2) {
      out.innerHTML = `<p class="muted">${trad('Tape au moins deux caractères.')}</p>`;
      return;
    }

    const asIsin = looksLikeIsin(q) ? q.replace(/\s/g, '').toUpperCase() : null;
    if (asIsin && !isinIsValid(asIsin)) {
      out.innerHTML = `<p class="down">⚠ <b>${esc(asIsin)}</b> ${trad('a le bon format '
        + 'mais une clé de contrôle incorrecte : il y a probablement une faute de frappe.')}</p>`;
      return;
    }

    out.innerHTML = `<p class="muted">${trad('Recherche…')}</p>`;
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
      if (!res.length) {
        out.innerHTML = `<p class="muted">${trad('Aucun résultat.')}</p>`;
        return;
      }

      out.innerHTML = `
        ${isinCode ? `<p class="small muted" style="margin:0 0 8px">${trad(res.length > 1
           ? 'ISIN valide · {n} cotations trouvées, la première correspond à ta place privilégiée.'
           : 'ISIN valide · {n} cotation trouvée, la première correspond à ta place privilégiée.')
           .replace('{n}', res.length)}</p>` : ''}
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
          bouton.disabled = true;
          const cote = await coteDuSymbole(bouton.dataset.symbol);
          bouton.disabled = false;

          const cat = classeDuType(bouton.dataset.type);
          const deduite = !!bouton.dataset.type;
          const v = await askForm({
            titre: bouton.dataset.nom || bouton.dataset.symbol,
            sous: trad('Où ranger cette ligne ?'),
            ok: 'Créer la ligne',
            ...(deduite ? {} : { lie: { de: 'assetClass', vers: 'account', options: comptesPourListe,
                   vide: 'aucun compte ne peut porter cette classe' } }),
            champs: [
              { cle: 'account', label: 'Compte', type: 'liste', options: comptesPourListe(cat),
                valeur: compteVisePourAjout || defaultHoldingAccount(),
                aide: trad('limité aux comptes compatibles') },
              { cle: 'qty', label: 'Quantité', type: 'nombre', exemple: '0',
                aide: trad('laisse zéro si tu n’as pas encore acheté') },
              { cle: 'buyPrice', type: 'nombre',
                label: cote && cote.currency
                  ? `${trad('Prix de revient unitaire')} (${cote.currency})`
                  : trad('Prix de revient unitaire'),
                exemple: cote ? String(cote.price) : '0',
                aide: cote
                  ? `${trad('cours du jour')} ${fmtCur(cote.price, cote.currency)} · ${
                      trad('ce que tu as payé peut être différent')}`
                  : trad('le prix payé par titre, dans la devise du titre') },
              ...(cashTargets().length ? [{
                cle: 'cash', label: trad('Payé depuis'), type: 'liste',
                options: [...cashTargets().map(c => [c.id, sousNom('', nomCompteV2(c), nomEtabDe(c))]),
                          ['', trad('Aucun compte, ne pas toucher aux espèces')]],
                valeur: '',
                aide: trad('laisse vide si tu déclares une ligne que tu détiens déjà') }] : []),
              deduite
                ? { cle: 'assetClass', label: trad('Classe d’actif'), lecture: true,
                    valeur: ASSET_CLASSES[cat] || cat,
                    aide: `${trad('déduite de')} ${guill(bouton.dataset.type)}${
                      trad(', modifiable sur la fiche de la ligne')}` }
                : { cle: 'assetClass', label: trad('Classe d’actif'), type: 'liste',
                    options: OPTIONS_CLASSE, valeur: cat },
              { cle: 'role', label: 'Rôle', type: 'liste', options: OPTIONS_ROLE,
                valeur: 'satellite', aide: trad('coeur de portefeuille ou pari satellite') },
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
            /* Un champ en lecture ne rend aucune valeur : `askForm` ne lit que
               les champs qui portent un element. La classe deduite vient donc
               de `cat`, jamais de la reponse, sinon la ligne naissait sans
               classe et retombait en « actions » pour tout le monde. */
            assetClass: deduite ? cat : v.assetClass, role: v.role, account: v.account, manual: false,
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

          await lookupSymbol(i);

          /* Le debit vient APRES la resolution du symbole, et c'est la seule
             place juste : a la creation, `fx` vaut 1 par defaut et la devise
             n'est pas encore connue. Debiter avant aurait compte des dollars
             comme des euros. `lookupSymbol` pose la devise et le taux, donc le
             cout se convertit ici pour de vrai. */
          const achete = num(v.qty) * num(v.buyPrice);
          if (v.cash && achete) {
            const cc = compteById(v.cash);
            if (cc) {
              const enEuros = achete * (num(Store.state.positions[i]?.fx) || 1);
              const e = cashInvestirEntree(cc, true);
              e.montant = round2(num(e.montant) - enEuros);
              Store.save(); render();
              toast(`${fmtEUR0(enEuros)} ${trad('débité de')} ${ACC[v.cash]?.short || 'cash'}`);
            }
          }
        });
      });
    } catch (e) {
      out.innerHTML = `<p class="down">${esc(e.message)}</p>`;
    }
  }

  btn.addEventListener('click', run);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

/* Les poches du patrimoine, telles que la page Allocation les montre : une
   entrée par poche non vide, dans l'ordre et avec les libellés de la légende
   du graphique d'évolution. Une seule définition pour le tableau et pour le
   camembert — ils listaient chacun « Bourse, Non coté, Disponible » en dur, et
   oubliaient donc la crypto et l'immobilier depuis que `gAff` leur a donné
   leur propre poche. Le tableau totalisait 29 985 € de lignes sous un total
   de 179 985 € : 150 000 € d'immobilier manquaient à l'appel. */
/* `financier` : sans les murs ni les objets. La regle et les deux listes de
   poches exclues vivent dans `store.js`, une seule fois. */
function pochesPatrimoine({ financier = false } = {}) {
  const t = nowTotals();
  const attente = num(patrimoine().investir);
  const base = financier ? totalFinancier() : num(t.brut);
  return SERIES_PATRIMOINE()
    .filter(s => Math.abs(num(t[s.key])) > 0.005)
    .filter(s => !financier || !serieHorsFinancier(s.key))
    .map(s => ({ key: s.key, label: s.label, color: s.color,
                 note: s.key === 'cash' && attente > 0.005
                   ? `${trad('dont')} ${fmtEUR0(attente)} ${trad('à investir')}` : '',
                 value: num(t[s.key]), pct: base ? num(t[s.key]) / base * 100 : 0 }));
}

const teinterParRang = items =>
  items.map((x, i) => ({ ...x, couleur: x.couleur || x.color || `var(--series-${(i % 8) + 1})` }));

/* Ce que le classement par poids montre sans le dire : une ligne pese un tiers
   de tout, et il fallait lire l'axe pour s'en apercevoir.

   La phrase se pose sous les barres, la ou le classement se lit, et pas en tete
   de carte : c'est une lecture du graphique, pas un chiffre de plus.

   En `hint` gris, jamais en couleur et jamais en rouge. Le rouge dit ce qui est
   faux, et une concentration ne l'est pas — elle depend d'un projet que
   l'application ne connait pas. `concentration()` se tait deja quand il n'y a
   rien a dire ; ici on ne fait que rendre. */
function phraseConcentration() {
  const c = concentration({ financier: allocFinancier });
  if (!c) return '';
  const base = baseAlloc().de;
  const tete = `<b>${esc(c.premiere.label)}</b> ${trad('pèse')} `
    + `${fmtPct(c.premiere.pct, 1)} ${base}`;
  const trois = c.top3
    ? ` · ${trad('tes trois premières lignes')} ${fmtPct(c.top3.pct, 1)}` : '';
  return `<p class="hint" style="margin:8px 0 0">${tete}${trois}</p>`;
}

function viewAllocation() {
  const t = nowTotals();
  if (!(patrimoine().brut > 0.005)) {
    return pageAvantDonnees('Une répartition dit où est ton argent : dans quelles classes '
      + 'd’actifs, chez quels intermédiaires. Elle attend donc que tu déclares au moins un '
      + 'compte ou un placement.');
  }
  const poches = pochesPatrimoine({ financier: allocFinancier });
  const byAsset = allocationByAsset({ credits: false, financier: allocFinancier });
  const byAcct = allocationByAccount({ financier: allocFinancier });
  const byType = teinterParRang(byAccountType({ financier: allocFinancier }));
  const dispo = teinterParRang(allocationParDisponibilite({ financier: allocFinancier }));

  const tbl = (items, totalLabel, total) => `
    <table>
      <thead><tr><th>${trad('Ligne')}</th><th>${trad('Montant')}</th><th>%</th></tr></thead>
      <tbody>${items.map(i => `<tr><td class="name">${pastilleTeinte(i.couleur || i.color)}${esc(i.label)}
        ${i.note ? `<span class="sub">${escMontant(i.note)}</span>` : ''}</td>
        <td>${fmtEUR(i.value)}</td>
        <td class="muted">${fmtPct(i.pct)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>${esc(totalLabel)}</td><td>${fmtEUR(total)}</td><td></td></tr></tfoot>
    </table>`;

  /* Trois teintes franchement distinctes, et pas voisines dans la palette :
     `series-7` (#00a5c3) et `series-2` (#00ab92) sont deux cyans que rien ne
     sépare sur une pastille de 8 px. L'ambre est déjà, dans l'application, la
     couleur de ce qui attend une action — c'est le point du menu quand un
     relevé manque. Il dit ici la même chose d'un argent qui ne travaille pas
     encore. */
  const teintesPoche = { courant: 'var(--series-1)', precaution: 'var(--series-7)',
                         projet: 'var(--series-5)', investir: 'var(--series-4)' };
  const disponibilite = [
    { label: BASES.place.nom,
      value: allocFinancier ? t.invested - horsFinancierTotal() : t.invested,
      couleur: 'var(--series-2)', apercu: 'investiTotal' },
    ...pochesLiquidites().map(p => ({
      label: p.nom, value: p.value, couleur: teintesPoche[p.cle] || 'var(--series-1)',
      apercu: p.cle === 'investir' ? 'cashInvestir' : 'cash',
      arg: p.cle === 'investir' ? '' : p.cle,
    })),
  ].filter(x => Math.abs(num(x.value)) > 0.005)
   .map(x => ({ ...x, pct: valeurBaseAlloc()
                  ? num(x.value) / valeurBaseAlloc() * 100 : 0 }));

  return `
  ${horsFinancierExiste() ? barreCommutateur([
    ['tout', 'Tout'], ['financier', 'Financier'],
  ], allocFinancier ? 'financier' : 'tout', 'alloc-base', 'base') : ''}

  <p class="perimetre perimetre-tete">${trad('Ici,')} <b>${allocFinancier
      ? trad('immobilier et biens de valeur écartés') : trad('tout est compté')}</b>${deuxPoints()}
    ${fmtEUR0(valeurBaseAlloc())}, <span class="sans-veuve">${trad('non coté compris')}${aide(allocFinancier
      ? trad("Une seule base sur cette page : « Patrimoine financier », tout ce que tu possèdes sauf tes murs et tes objets de valeur. Le non coté reste : on choisit d’y remettre ou non, alors qu’on ne vend pas trois mètres carrés de salon. Toutes les cartes partagent cette base, donc leurs pourcentages se comparent entre eux. Tes crédits n’en sont pas retirés : le prêt finance le bien, qui est déjà écarté.")
      : trad("Une seule base sur cette page : « Tes avoirs », tout ce que tu possèdes, non coté et immobilier compris. Toutes les cartes la partagent, donc leurs pourcentages se comparent entre eux et chaque total redonne ce même nombre. La mention grise en tête de chaque carte la rappelle, avec son montant. Le patrimoine net, qui retire tes crédits, se lit sur l’accueil : ici rien n’est soustrait."))}.</span></p>

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
      <dt>${baseAlloc().nom}<span class="sub">${trad('la base des pourcentages ci-dessus')}</span></dt>
        <dd>${fmtEUR(valeurBaseAlloc())}</dd>
      ${t.dettes && !allocFinancier ? `<dt>${trad('Crédits en cours')}${aide(trad("Le capital qu’il te reste à rembourser. Chaque mensualité le réduit, donc ton patrimoine net monte d’autant, même si la valeur de tes biens ne bouge pas."))}</dt>
        <dd class="dette">−${fmtEUR(t.dettes)}</dd>
        <dt><b>${trad('Patrimoine net')}</b></dt><dd><b>${fmtEUR(t.net)}</b></dd>` : ''}
    </dl>
  </div>

  <div class="card" data-anchor="actifs">
    <div class="card-head"><h2>${trad('Répartition.carte', 'Répartition')}</h2></div>
    <p class="tete-legende">${mentionBase(baseAlloc(), valeurBaseAlloc())}</p>
    <div class="chart" id="aMacro"></div>
    ${tbl(poches, baseAlloc().nom,
           valeurBaseAlloc())}
    <h3 class="sous-titre-carte">${trad('Par catégorie d’actif')}</h3>
    <div class="chart" id="aAsset"></div>
    ${phraseConcentration()}
    ${t.dettes && !allocFinancier ? `<dl class="kv" style="margin-top:8px">
      <dt>${trad('Crédits en cours')}${aide(trad("Ils ne figurent pas dans les parts ci-dessus : une répartition dit où est ton argent, et un crédit n’est pas un endroit. Il se retire du total, ici, pour donner le patrimoine net."))}</dt>
        <dd class="dette">−${fmtEUR(t.dettes)}</dd>
      <dt><b>${trad('Patrimoine net')}</b></dt><dd><b>${fmtEUR(t.net)}</b></dd>
    </dl>` : ''}
  </div>

  <div class="card">
    <div class="card-head"><h2>${trad('Où est placé ton argent')}</h2></div>
    <p class="tete-legende">${mentionBase(baseAlloc(), valeurBaseAlloc())}</p>
    <h3 class="sous-titre-carte">${trad('Par type de détention')}</h3>
    <div class="chart" id="aType"></div>
    ${tbl(byType, baseAlloc().nom, byType.reduce((s, i) => s + i.value, 0))}
    <h3 class="sous-titre-carte">${trad('Par compte')}</h3>
    <div class="chart" id="aAcct"></div>
  </div>

  <div class="card" data-anchor="disponibilite">
    <div class="card-head"><h2>${trad('Par disponibilité')}</h2></div>
    <p class="tete-legende">${mentionBase(baseAlloc(), valeurBaseAlloc())}</p>
    <p class="hint" style="margin:0 0 12px">${trad('Quand cet argent peut redevenir disponible.')}${aide(allocFinancier
      ? trad("Le délai vient de la classe de la ligne et du type de compte qui la porte, jamais d’une supposition sur ton projet. Tes murs et tes objets de valeur sont écartés de cette vue, et c’est ce qui fait disparaître le palier du logement que tu habites.")
      : trad("Le délai vient de la classe de la ligne et du type de compte qui la porte, jamais d’une supposition sur ton projet. Le logement que tu habites et ce qui est bloqué jusqu’à une échéance figurent ici parce qu’ils font partie de tes avoirs, mais l’autonomie financière de l’accueil les écarte de son cumul : elle compte ce sur quoi tu peux vivre, pas ce que tu possèdes."))}</p>
    <div class="chart" id="aDispo"></div>
    ${tbl(dispo, baseAlloc().nom, dispo.reduce((s, i) => s + i.value, 0))}
  </div>

`;
}

function mountAllocation() {
  Charts.rankedBars($('#aAsset'), { items: allocationByAsset({ credits: false, financier: allocFinancier }) });
  Charts.rankedBars($('#aAcct'), { items: allocationByAccount({ financier: allocFinancier }) });
  const t = nowTotals();
  const animAlloc = allocTransition;
  Charts.donut($('#aMacro'), {
    anime: animAlloc,
    height: 200, centerLabel: baseAlloc().nom, centerValue: valeurBaseAlloc(),
    items: pochesPatrimoine({ financier: allocFinancier }).map(p => ({ label: p.label, value: p.value, color: p.color })),
  });
  const bt = teinterParRang(byAccountType({ financier: allocFinancier }));
  Charts.donut($('#aType'), {
    anime: animAlloc,
    height: 200, centerLabel: baseAlloc().nom,
    centerValue: bt.reduce((s, i) => s + i.value, 0),
    items: bt.map(x => ({ label: x.label, value: x.value, color: x.couleur })),
  });
  const bd = teinterParRang(allocationParDisponibilite({ financier: allocFinancier }));
  Charts.donut($('#aDispo'), {
    anime: animAlloc,
    height: 200, centerLabel: baseAlloc().nom,
    centerValue: bd.reduce((s, i) => s + i.value, 0),
    items: bd.map(x => ({ label: x.label, value: x.value, color: x.couleur })),
  });
  allocTransition = false;
}

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
  if (!gros || partGros < 50) return '';
  return `<p class="plan-phrase" style="font-size:13.5px"><b>${fmtPct(partGros, 0)}</b> ${
    trad('de ta part arbitrable est en')} ${esc(gros[0].toLowerCase())}.</p>`;
}

function viewRebalance() {
  const r = rebalanceRows();
  const rr = rebalanceRoles();
  const per = perimetreReequilibrage();
  const tg = Store.state.targets;
  const sumT = sommeCibles();

  const dehorsDetail = (() => {
    const p = patrimoine();
    return [
      [trad('immobilier'), "d'immobilier", p.classes.immobilier],
      [trad('non coté'), 'de non coté', per.nonCote],
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

  const listeMvt = (lignes, sens) => lignes.map(c =>
    `<li><b>${esc(c.label)}</b> <span class="montant-plan${sens > 0 ? ' renfort' : ''}">${
      sens > 0 ? '+' : '−'}${fmtEUR0(Math.abs(c.delta))}</span>
      <span class="muted">${trad('pour atteindre')} ${fmtPct(c.targetPct, 0)}</span></li>`).join('');

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
          ${key && key.startsWith('classes.') ? `
            ${row.classeParente
              ? `<button class="chevron-role ouvert" data-action="refusionner-classe"
                         data-cle="${esc(row.classeParente)}"
                         aria-expanded="true"
                         title="${esc(trad('Refermer : une seule cible pour {c}')
                           .replace('{c}', row.labelClasse))}"
                         aria-label="${esc(trad('Refermer les deux rôles de {c}')
                           .replace('{c}', row.labelClasse))}"
                         >›</button>`
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
          ${key === CLE_TRESORERIE ? `
            <button class="btn icon xs" data-action="retirer-classe-cible"
                    data-cle="${esc(CLE_TRESORERIE)}"
                    title="${trad('Sortir {c} du rééquilibrage').replace('{c}', esc(row.label))}">✕</button>` : ''}
        </span>
      </div>
      ${(() => {
        const jauge = `
          <i class="reeq-reel ${row.delta > 0 ? 'sous' : row.delta < 0 ? 'sur' : 'ok'}" style="width:${part.toFixed(2)}%"></i>
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
        <span class="reeq-ecart ${ecartFait ? 'muted' : 'a-faire'}">${ecartFait
          ? trad('à la cible')
          : `<b class="${row.delta > 0 ? 'renfort' : ''}">${
                row.delta > 0 ? '+' : '−'}${fmtEUR0(Math.abs(row.delta))}</b> ${
              row.delta > 0 ? trad('à renforcer')
              : row.cle === 'cashToInvest' ? trad('à placer') : trad('à alléger')}`}</span>
      </div>
    </li>`;
  };

  return `
  <p class="perimetre perimetre-tete">${trad('Ces cibles ne portent que sur')}
    <b>${trad('tes comptes d’investissement')}</b> ${trad('et leur trésorerie,')}
    ${fmtEUR0(r.base)}${aide(trad("PEA, compte-titres, assurance-vie, PER, portefeuille de cryptomonnaies, avec leurs lignes et l’argent qui y attend d’être placé. Ton cash du quotidien, ton épargne de précaution, ton immobilier et ton non coté n’en font pas partie : ils ne s’arbitrent pas d’un clic, et les mélanger donnerait des pourcentages qu’aucune décision ne peut suivre. Allocation, elle, montre tout ton patrimoine."))}.</p>

  <div class="card plan">
    <div class="card-head"><h2>${trad('Ce qu’il y a à faire')}${aide(trad("Les mouvements qui ramènent chaque classe à sa cible. Quand tes pourcentages totalisent 100 %, ce qu’il faut vendre finance exactement ce qu’il faut acheter."))}</h2>
      <span class="hint">${mouvements.length ? `${mouvements.length} ${mouvements.length > 1 ? trad('mouvements') : trad('mouvement')}` : trad('rien à faire')}</span></div>
    ${!mouvements.length
      ? `<p class="empty">${trad('✓ Chaque classe est à sa cible. Rien à arbitrer.')}</p>`
      : `
      <div class="plan-cols">
        ${alleger.length ? `<div>
          <h3>${alleger.every(c => c.cle === 'cashToInvest') ? trad('À placer') : trad('À alléger')}</h3>
          <ul>${listeMvt(alleger, -1)}</ul>
        </div>` : ''}
        ${renforcer.length ? `<div>
          <h3>${trad('À renforcer')}</h3>
          <ul>${listeMvt(renforcer, 1)}</ul>
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
    <span><b>${sumT > 100
      ? trad('Tes cibles totalisent {v} %, soit {x} % de trop.')
          .replace('{v}', sumT).replace('{x}', sumT - 100)
      : trad('Tes cibles totalisent {v} %, il en manque {x}.')
          .replace('{v}', sumT).replace('{x}', 100 - sumT)}</b>
    ${sumT > 100
      ? trad('Additionnés, les montants cibles demandent {v} alors que tu as {b}.')
          .replace('{v}', fmtEUR0(r.base * sumT / 100)).replace('{b}', fmtEUR0(r.base))
      : trad('Les {v} % restants ne sont attribués à aucune classe.')
          .replace('{v}', 100 - sumT)}</span>
  </div>`}

  <div class="card">
    <div class="card-head"><h2>${trad('Allocation par classe')}${aide(`${trad('L’allocation stratégique : quelle part du portefeuille dans chaque classe d’actif. C’est la première décision, celle qui pèse le plus sur le résultat. Modifie une cible dans le champ, la jauge et le plan suivent.')}

${trad('Le périmètre : tes comptes d’investissement (PEA, compte-titres, assurance-vie, PER, portefeuille crypto), avec leurs lignes et leur trésorerie à investir.')} ${
      per.montantDehors > 0
        ? `${fmtEUR0(per.montantDehors)} ${trad('restent dehors, soit')} ${dehorsDetail
             .map(([, phrase, v]) => `${fmtEUR0(v)} ${trad(phrase)}`).join(', ')}.${
           per.nonCote > 0 ? ` ${trad('Le non coté se suit en lignes de compte et non en lignes de marché : il se lit dans l’onglet')} ${SOUS_ONGLETS.allocation[0][1]}.` : ''}`
        : trad('Tout ton patrimoine y est.')}`)}</h2></div>
    <p class="tete-legende">${mentionBase(BASES.baseCibles, r.base)}</p>
    ${per.exclues.length ? `<p class="perimetre exclues">
      Sorties du rééquilibrage à ta demande :
      ${per.exclues.map(x => `<button type="button" class="mois-lien" data-action="reintegrer-classe"
          data-cle="${esc(x.cle)}" title="Remettre ${esc(x.label)} dans le rééquilibrage"
          >${esc(x.label)}${x.value ? ` (${fmtEUR0(x.value)})` : ''}</button>`).join(', ')}.
      Clique dessus pour les remettre.</p>` : ''}
    ${per.horsAtteinte.length ? `<div class="note" style="margin:0 0 12px;
         background:color-mix(in oklab, var(--warning) 12%, var(--surface-1));
         border-color:color-mix(in oklab, var(--warning) 40%, transparent)">⚠ <span>
      <b>${per.horsAtteinte.map(h => esc(h.label)).join(' et ')}${deuxPoints()}
      ${trad('cible impossible à atteindre ici.')}</b>
      ${trad('Tu en détiens')} ${per.horsAtteinte.map(h => fmtEUR0(h.montant)).join(' et ')},
      ${trad('mais sur un compte hors de cette base. La jauge restera à zéro quoi que '
        + 'tu achètes. Mets sa cible à 0, ou suis cette classe depuis Allocation.')}
    </span></div>` : ''}
    <ul class="reeq">
      <li class="reeq-groupe">${trad('Classes d’actif')}</li>
      ${r.classes.map(c => ligneReeq(c, c.cle)).join('')}
      ${r.cash ? `<li class="reeq-groupe reeq-groupe-suite">${trad('Trésorerie')}</li>
      ${ligneReeq(r.cash, CLE_TRESORERIE)}` : ''}
    </ul>
    <button class="btn sm ghost" data-action="ajouter-classe-cible"
            style="margin-top:12px">${trad('+ Suivre une classe')}</button>
    <dl class="kv reeq-pied">
      <dt>${BASES.placeBourse.nom}</dt><dd>${fmtEUR(r.invested.value)} <span class="muted">· ${fmtPct(r.invested.pct, 1)}</span></dd>
      <dt>${BASES.baseCibles.nom}<span class="sub">${trad('base des pourcentages ci-dessus')}</span></dt><dd>${fmtEUR(r.base)}</dd>
      ${per.montantDehors > 0 ? `<dt class="muted">${trad('Reste de')} ${BASES.avoirs.nom.toLowerCase()}${trad(', non arbitrable')}<span class="sub">${
        esc(dehorsDetail.map(([lib]) => lib).join(' · '))}${trad(', suivis dans l’')}<button type="button"
          class="mois-lien" data-action="sous-onglet" data-route="allocation"
          >${trad('onglet')} ${SOUS_ONGLETS.allocation[0][1]}</button></span></dt>
        <dd class="muted">${fmtEUR(per.montantDehors)}</dd>
      <dt>${BASES.avoirs.nom}</dt><dd>${fmtEUR(per.brut)}</dd>` : ''}
    </dl>
  </div>

  <div class="card">
    <div class="card-head"><h2>${ROLES.core} ${trad('et satellites')}${aide(trad("À l’intérieur de ce qui est placé en bourse : ce que tu alimentes sans le remettre en question, et ce que tu arbitres. Le core n’est pas de l’argent immobile, c’est souvent là qu’arrive l’essentiel des versements : c’est de l’argent que tu ne comptes pas vendre. C’est une lecture, pas un objectif : le plan de rééquilibrage ne vient que des classes. Poser une seconde série de cibles sur ce même argent pourrait la contredire sans que rien ne le signale."))}</h2></div>
    <p class="tete-legende">${mentionBase(BASES.baseCibles, rr.base)}</p>
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
          ${parts.length === 1 && parts[0].label === x.label ? '' : `
          <div class="role-legende">${parts.map(p =>
            `<span><i class="${p.nature === 'fonds' ? '' : 'raye'}" style="--c:${p.couleur}"></i>${
              esc(p.label)} ${fmtEUR0(p.value)}</span>`).join('')
            || '<span class="muted">aucune ligne</span>'}</div>`}
        </li>`;
      }).join('')}
    </ul>
    ${rr.parNature.some(n => n.nature === 'Titre en direct') ? `
      <p class="hint" style="margin:12px 0 0">
        ${trad('Hachuré : titre en direct. Plein : fonds.')}${aide(trad("La nature est déduite de l’instrument et se corrige dans la fiche de chaque ligne. Elle n’entre pas dans les cibles, qui portent sur la classe d’actif : sur le risque, pas sur l’enveloppe."))}
      </p>` : ''}
  </div>`;
}

function mountRebalance() {
}

let historyShowLegacy = false;
let historyYear = null;      // null = l'annee du dernier releve

function viewHistory() {
  const annees = historyYears();
  const anneeCourante = todayISO().slice(0, 4);
  if (historyYear === 'all') historyYear = null;   // le cran a quitte le selecteur

  const tous = [];
  for (let i = 0; i < Store.state.monthly.length; i++) {
    const r = Store.state.monthly[i];
    if (rowIsEmpty(r)) continue;
    const net = rowNet(r), total = rowTotal(r);
    const avant = tous[tous.length - 1];
    tous.push({ r, i, net, total, dlt: avant ? net - avant.net : 0 });
  }

  const anneeDernier = tous.length
    ? String(tous[tous.length - 1].r.date).slice(0, 4) : anneeCourante;
  const annee = historyYear ?? (annees.includes(anneeDernier) ? anneeDernier : anneeCourante);

  const lignes = tous.filter(x => String(x.r.date).startsWith(annee)).reverse();

  const amplitudes = lignes.map(x => Math.abs(x.dlt)).filter(v => v > 0.005).sort((a, b) => a - b);
  const mediane = amplitudes.length
    ? (amplitudes.length % 2
        ? amplitudes[(amplitudes.length - 1) / 2]
        : (amplitudes[amplitudes.length / 2 - 1] + amplitudes[amplitudes.length / 2]) / 2)
    : 0;
  const echelleJauge = amplitudes.length
    ? Math.min(amplitudes[amplitudes.length - 1], 3 * mediane) : 0;
  const jaugeDe = dlt => (echelleJauge > 0 ? num(dlt) / echelleJauge : 0);
  const attente = currentMonthPending();

  return `
  ${(() => {
    if (!attente.missing) return '';
    return `<div class="note">⤒ <span><b>${esc(attente.label)} ${trad('n’est pas encore enregistré.')}</b>
      ${trad('Un relevé reprend d’un coup tous les montants actuels ({v}), et tient en un geste.')
        .replace('{v}', fmtEUR0(nowTotals().total))}</span>
      ${sortiesRappel('releve', attente.label,
        `<button class="btn sm" data-action="ajouter-releve">${trad('Enregistrer le relevé')}</button>`)}</div>`;
  })()}

  <div class="card">
    <div class="card-head">
      <div class="tete-titre">
        <h2>${trad('Relevé mensuel du patrimoine')}</h2>
        ${lignes.length ? `<span class="hint">${
          (lignes.length > 1 ? trad('{n} relevés en {a}') : trad('{n} relevé en {a}'))
            .replace('{n}', lignes.length).replace('{a}', esc(String(annee)))}</span>` : ''}
      </div>
      <div class="row">
        ${annees.length > 1 ? yearControl('history-year', annees, annee) : ''}
        <button class="btn sm" data-action="ajouter-releve">${trad('+ Ajouter un relevé')}</button>
      </div>
    </div>
    ${pasAFaire('comptes') ? `
    <p class="empty" style="margin:0 0 12px">${trad('Un relevé est la photo de tes comptes '
      + 'à une date : leur montant, mois par mois. C’est lui qui donne la courbe de ton '
      + 'patrimoine et ton rythme d’accumulation. Il attend donc un compte.')}</p>
    ${invitePremierPas('comptes')}`
    : !tous.length ? `
    <p class="empty" style="margin:0 0 10px">${trad('Aucun relevé mensuel pour le moment.')}
      ${trad('Un relevé est la photo de tes comptes à une date. C’est lui qui donne la courbe '
      + 'de ton patrimoine et ton rythme d’accumulation, et il en faut deux pour qu’ils aient '
      + 'une pente à montrer.')}</p>
    <button class="btn sm" data-action="ajouter-releve">${trad('+ Ajouter ton premier relevé')}</button>`
    : !lignes.length ? `
    <p class="empty" style="margin:0 0 10px">${trad('Aucun relevé en {a}.')
      .replace('{a}', esc(String(annee)))}
      ${trad('Le journal en compte {n} au total, sur les autres années.')
        .replace('{n}', tous.length)}</p>
    <button class="btn sm" data-action="ajouter-releve">${trad('+ Ajouter un relevé')}</button>`
    : `
    ${annee === anneeCourante && attente.vide && !attente.missing ? `
    <p class="hint" style="margin:0 0 10px">${trad('Aucun relevé pour {m}.')
      .replace('{m}', esc(attente.label))}
      <button type="button" class="lien-nu" data-action="ajouter-releve"
              >${trad('+ Ajouter le relevé')}</button></p>` : ''}
    <div class="liste-principale">
      ${lignes.map(({ r, i, net, dlt }) => ligneListe({
        action: 'voir-releve', index: i,
        classe: r.date === attente.key ? 'mois-courant' : '',
        titre: fmtMonth(r.date),
        sous: r.comment || '',
        valeur: fmtEUR0(net),
        second: dlt ? fmtSigned(dlt) : '', classeSecond: cls(dlt),
        jauge: jaugeDe(dlt),
      })).join('')}
    </div>`}
  </div>

  ${(() => {
    const tout = apportsTries();
    const bornes = [`${annee}-01-01`, `${annee}-12-31`];
    const liste = tout.filter(a => String(a.date || '').startsWith(String(annee)));
    const d = apportsDetail(...bornes);
    return `
  <div class="card">
    <div class="card-head"><h2>${trad('Entrées et sorties exceptionnelles')}</h2>
      <span class="hint">${liste.length
        ? `${(liste.length > 1 ? trad('{n} lignes') : trad('{n} ligne'))
              .replace('{n}', liste.length)} · ${esc(String(annee))} · ${
            fmtSigned(d.net)} ${trad('net')}`
        : tout.length
          ? `${trad('aucune en')} ${esc(String(annee))} · ${
              trad('{n} au total').replace('{n}', tout.length)}`
          : trad('héritage, prime, vente d’un bien, ou une grosse dépense')}</span>
      ${tout.length && annees.length > 1 ? yearControl('history-year', annees, annee) : ''}
      <span class="paire-btn">
        <button class="btn sm ghost" data-action="ajouter-apport" data-sens="entree">${trad('+ Entrée')}</button>
        <button class="btn sm ghost" data-action="ajouter-apport" data-sens="sortie">${trad('+ Dépense')}</button>
      </span></div>
    ${!liste.length && !tout.length ? `
    <p class="small muted" style="margin:0">${trad('Rien pour l’instant. Une somme reçue ou dépensée '
      + 'une seule fois se note ici, avec sa date : le rythme d’accumulation sait alors que '
      + 'ce mois-là ne dit rien de ton épargne.')}</p>`
    : !liste.length ? `
    <p class="small muted" style="margin:0">Aucune ligne en ${esc(String(annee))}.
      Le journal en compte ${tout.length} au total : change l’année en tête de page.</p>`
    : `<details class="data-view" id="journalApports" ${journalOuvert ? 'open' : ''}>
      <summary>${trad('Voir le journal')}</summary>
      <div class="mlist-groupe" style="margin-top:12px">
      ${liste.map(a => `
        <button type="button" class="mlist" data-action="editer-apport" data-i="${a.index}"
                title="${trad('Modifier cette ligne')}">
          <span class="ml-nom">${esc(a.libelle || trad(a.montant < 0 ? 'Dépense' : 'Entrée'))}
            <span class="sub">${esc([fmtJourMois(a.date) || a.date || 'sans date',
              a.note || ''].filter(Boolean).join(' · '))}</span></span>
          <span class="ml-chiffres"><b class="${cls(a.montant)}">${fmtSigned(a.montant)}</b></span>
          <span class="ml-chev" aria-hidden="true">›</span>
        </button>`).join('')}
      </div>
    </details>
    <dl class="kv" style="margin-top:12px">
      ${d.entrees ? `<dt>${trad('Entrées')}</dt><dd class="up">${fmtSigned(d.entrees)}</dd>` : ''}
      ${d.sorties ? `<dt>${trad('Sorties')}</dt><dd class="down">${fmtSigned(d.sorties)}</dd>` : ''}
      <dt>Net${aide(trad("La somme de tes entrées et de tes sorties exceptionnelles sur l’année affichée. Elle ne s’ajoute à aucun total de patrimoine : ces montants sont déjà passés sur tes comptes, c’est leur origine que ce journal garde en mémoire. Le rythme d’accumulation s’en sert pour distinguer ce que tu as mis de côté de ce qui t’est tombé du ciel, ou de ce qui est parti d’un coup. Une grosse dépense se note ici et non dans les dépenses du mois : là-bas elle gonflerait ta moyenne toute l’année, et avec elle le coût de la vie qui sert à ton autonomie financière et à ta cible d’épargne de précaution."))}</dt>
        <dd class="${cls(d.net)}">${fmtSigned(d.net)}</dd>
    </dl>`}
  </div>`;
  })()}`;
}

function mountHistory() {
  const j = $('#journalApports');
  if (j) j.addEventListener('toggle', () => { journalOuvert = j.open; });
}

let compteVue = 'banque';            // banque | type
let allocFinancier = false;
/* Une transition a montrer au prochain montage des anneaux, et une seule.

   Meme mecanique que `evoTransition` pour la courbe, et pour la meme raison :
   `render()` remonte les graphiques a chaque frappe et a chaque retour sur la
   vue. Le drapeau se leve sur le seul geste qui change le perimetre, et le
   montage le consomme. */
let allocTransition = false;
let relanceGraphes = false;

/* La base de cette page, en un seul endroit.

   Elle se recopiait a sept endroits sous la forme d'un ternaire, et le huitieme
   a ete oublie : le centre de l'anneau annonçait 354,6 k EUR « Tes avoirs » au
   milieu de parts qui totalisaient 66 551. Un total qui n'egale pas la somme de
   ses parts, sur la carte meme, et le pire des defauts de cette base de code
   puisqu'il rassure. Le preambule et la carte des usages avaient le meme.

   Une base qui se derive a huit endroits finit par en oublier un. Elle se
   nomme donc ici, et un test interdit desormais `BASES.avoirs` ailleurs dans
   cette page. */
const baseAlloc = () => (allocFinancier ? BASES.financier : BASES.avoirs);
const valeurBaseAlloc = () => (allocFinancier ? totalFinancier() : nowTotals().brut);
let compteRecherche = '';
/* L'etat vit dans `meta`, pas dans une variable qui le recopie : le `Set`
   etait construit au chargement du script, donc avant que le store soit lu —
   il partait toujours vide et le repli memorise ne s'appliquait jamais. Une
   seule source, interrogee au moment du rendu. */
const cleLiqPli = aff => `liq:${aff}`;

const compteReplies = {
  liste: () => Store.state?.meta?.comptesReplies || [],
  has(cle) { return this.liste().includes(cle); },
  add(cle) { if (!this.has(cle)) Store.state.meta.comptesReplies = [...this.liste(), cle]; },
  delete(cle) { Store.state.meta.comptesReplies = this.liste().filter(c => c !== cle); },
};
let groupesRendus = [];
function memoriserReplies() { Store.save(); }

const MOBILISABLE_COURT = {
  immediat: 'Immédiat', differe: 'Quelques jours',
  lent: 'Quelques mois', bloque: 'Inaccessible',
};

function badgeMobilisable(niveau) {
  return `<span class="tag mob-${niveau}" title="${esc(trad(MOBILISABLE_LABEL[niveau]))}">${trad(MOBILISABLE_COURT[niveau])}</span>`;
}

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
function sousTitreCompte(c, avecEtab = true) {
  const nom = nomCompteV2(c);
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
          ${trad('Auto,')} ${esc(trad(MOBILISABLE_COURT[mobilisabilite(l.classe, compte.type)]))}</option>
        ${Object.entries(MOBILISABLE_COURT).map(([v, lib]) =>
          `<option value="${v}" ${l.mobilite === v ? 'selected' : ''}>${esc(trad(lib))}</option>`).join('')}
      </select>
    </span>` : badgeMobilisable(mob);
  const st = statutLigne(l);
  const libelle = nomLignePlacement(l, compte);
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
    l.taux ? `${fmtNombre(num(l.taux))} % ${trad('annoncé')}` : '',
    l.echeance ? `${trad('échéance')} ${fmtJourMois(l.echeance)} ${String(l.echeance).slice(0, 4)}` : '',
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

  const correspondAuCompte = c =>
    correspond(nomCompteV2(c)) || correspond(nomEtabDe(c)) ||
    lignesDe(c).some(l => correspond(l.libelle));

  const ouverts = comptesOuverts().filter(correspondAuCompte);
  const archives = COMPTES().filter(c => c.statut === 'archive' && correspondAuCompte(c));

  /* `teinte` : la couleur d'un groupe n'est tirée de son nom que faute de
     mieux. Quand le groupe *est* une classe d'actif, il porte la couleur que
     la classe a déjà partout ailleurs — le camembert de l'accueil, la légende
     de la courbe, la répartition. Liquidités bleu, actifs de marché vert,
     immobilier jaune : la même chose se reconnaît à la même couleur d'un écran
     à l'autre, sinon la couleur ne veut plus rien dire. */
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
          <span class="cpt-gtotal">${total == null ? '' : fmtEUR(total)}</span>
          <span class="cpt-chev">${replie ? '›' : '⌄'}</span>
        </button>
        ${lien}
      </div>
      <div class="cpt-pli${replie ? '' : ' ouvert'}"><div class="cpt-corps">${corps}</div></div>
    </section>`;
  };

  let sectionsAffichees = false;
  const titreSection = (t, sous) => `
      <h3 class="cpt-section">${esc(trad(t))}<span class="sub">${esc(trad(sous))}</span></h3>`;

  let corps = '';
  if (!ouverts.some(c => !typeCompte(c.type).interne) && !filtre) {
    corps = `<div class="card">${invitePremierPas('comptes')
      || `<p class="empty">${trad('Aucun compte pour l’instant.')}</p>`}</div>`;
  } else if (!ouverts.length && !archives.length) {
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
    const groupeEtab = e => {
      const siens = ouverts.filter(c => c.etabId === e.id);
      const doitEncore = (e.dettes || []).reduce((s, x) => s + num(x.montant), 0);
      if (!siens.length && !doitEncore) return '';
      const totalE = siens.reduce((s, c) => s + valeurCompte(c), 0);
      const credits = (e.dettes || []).reduce((s, x) => s + num(x.montant), 0);
      const lignes = siens.map(c => ligneCompte(c, false)).join('');
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
        teinteEtab(e));
    };

    const chezUnTiers = ETABS().filter(e => !estEtabDeBiens(e)).map(groupeEtab).join('');
    const enDirect = ETABS().filter(estEtabDeBiens).map(groupeEtab).join('')
      + (sansContenant.length
        ? groupe('e-sans', trad('Sans intermédiaire'), trad('espèces et objets de valeur'),
            sansContenant.map(c => ligneCompte(c, false)).join(''),
            sansContenant.reduce((s, c) => s + valeurCompte(c), 0), '',
            teinteDominante(sansContenant))
        : '');

    sectionsAffichees = !!chezUnTiers.trim() && !!enDirect.trim();
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

  return `
  <dl class="kv cpt-resume">
    <dt>${BASES.avoirs.nom}${aide(trad("La somme des comptes ouverts de cette page. Le même nombre que sur l’accueil : si les deux diffèrent, c’est qu’un compte est archivé ou qu’un montant vient d’être corrigé."))}</dt><dd>${fmtEUR(pat.brut)}</dd>
    ${pat.dettes ? `
    <dt>${trad('Crédits en cours')}${aide(trad("Le capital qu’il te reste à rembourser. Les comptes archivés ne comptent pas."))}</dt>
      <dd class="dette">−${fmtEUR(pat.dettes)}</dd>
    <dt><b>${trad('Patrimoine net')}</b></dt><dd><b>${fmtEUR(pat.net)}</b></dd>` : ''}
  </dl>

  ${barreCommutateur([
    ['banque', 'Comptes et avoirs'], ['type', 'Type'],
  ], compteVue, 'compte-vue', 'vue')}

  <div class="card" style="padding:12px 16px">
    <div class="row" style="gap:10px">
      <input id="chercheCompte" type="search" placeholder="${trad('Rechercher…')}" value="${esc(compteRecherche)}"
             style="max-width:12em; text-align:left" aria-label="${trad('Rechercher un compte ou un placement')}">
      <span class="spacer"></span>
      ${groupesRendus.length > 1 ? `<button class="btn sm ghost" data-action="plier-tout"
        title="${groupesRendus.every(c => compteReplies.has(c))
          ? trad('Rouvrir tous les groupes') : trad('Ne garder que les totaux')}"
        >${groupesRendus.every(c => compteReplies.has(c)) ? trad('Tout déplier') : trad('Tout replier')}</button>` : ''}
      <button class="btn sm" data-action="ajouter-compte">${trad('+ Ajouter')}</button>
    </div>
  </div>

  <div class="cpt-liste">${corps}</div>

  ${(() => {
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
      const pos = cherche.selectionStart;
      render();
      const encore = $('#chercheCompte');
      if (encore) { encore.focus(); encore.setSelectionRange(pos, pos); }
    });
  }
  monteSwipeComptes();
}

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

function pageAvantDonnees(phrase, cle = 'comptes') {
  return `
  <div class="card">
    <p class="empty" style="margin:0 0 4px">${trad(phrase)}</p>
    ${invitePremierPas(cle)}
  </div>`;
}

function reglagesExploitation(c, idx) {
  return `
    <div class="grid g-3" style="margin-top:12px">
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

function boutonsRattachement(c) {
  return `
      <button class="btn sm ghost" data-action="ajouter-loyer" data-id="${esc(c.id)}"
              title="${trad('Créer un loyer déjà rattaché à ce bien')}">+ ${trad('Loyer')}</button>
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
function lignesDuMois(cf) {
  const periodeDite = p => p !== 'mois' ? trad(CHARGE_PERIODE_LABEL[p]) : '';
  return [
    ...cf.sourcesLoyer.map(s => ligneSource({
      nom: s.label, montant: s.mensuel, signe: 1,
      action: 'edit-income', donnees: { i: s.i },
      sub: [s.periode !== 'mois' ? `${fmtEUR0(s.montant)} ${periodeDite(s.periode)}` : '',
            s.estime ? trad('estimé') : ''].filter(Boolean).join(' · '),
    })),
    cf.vacanceEuros > 0.005 ? `
      <dt>${trad('Vacance locative')}${aide(trad("Les mois où le bien n'est pas loué, lissés sur l'année. Se règle par « Mois loués par an », au bas de cette carte."))}
        <span class="sub">${fmtNombre(cf.moisLoues)} ${trad('mois loués sur 12')}</span></dt>
        <dd class="dette">−${fmtEUR(cf.vacanceEuros)} ${trad('/ mois')}</dd>` : '',
    ...(cf.postesCharge.length === 1 ? cf.postesCharge.map(p => ligneSource({
      nom: p.label, montant: p.mensuel, signe: -1,
      action: 'edit-charge', donnees: { i: p.i },
      sub: p.periode !== 'mois' ? `${fmtEUR0(p.montant)} ${periodeDite(p.periode)}` : '',
    })) : []),
    ...(cf.postesCharge.length > 1 ? [`
      <dt>${trad('Charges du bien')}${aide(trad('Le total des charges rattachées à ce bien. Chacune se corrige dans le budget, où elle porte son nom.'))}
        <span class="sub">${trad('{n} charges').replace('{n}', cf.postesCharge.length)}</span></dt>
        <dd class="dette">−${fmtEUR(cf.postesCharge.reduce((s, p) => s + p.mensuel, 0))} ${trad('/ mois')}</dd>`] : []),
    cf.impot ? `
      <dt>${trad('Impôt déclaré')}${aide(trad("Ton taux appliqué au loyer moins les charges. Il vient de toi, pas d'une règle fiscale que l'application aurait devinée. Se règle par « Impôt sur ce loyer », au bas de cette carte."))}
        <span class="sub">${fmtPct(cf.tauxImpot, 1)}</span></dt>
        <dd class="dette">−${fmtEUR(cf.impot)} ${trad('/ mois')}</dd>` : '',
    ...(() => {
      const avec = cf.creditsListe.filter(x => x.mensualite > 0.005);
      if (!avec.length) return [];
      const total = avec.reduce((s, x) => s + x.mensualite, 0);
      const nom = avec.length > 1 ? trad('Mensualités de crédit')
                                  : trad('Mensualité de crédit');
      if (avec.length > 1) return [`
      <dt>${nom}${aide(trad('Le total des mensualités des crédits rattachés à ce bien. Chaque prêt se lit séparément dans « Financement », plus bas.'))}
        <span class="sub">${trad('{n} crédits, détaillés dans Financement')
          .replace('{n}', avec.length)}</span></dt>
        <dd class="dette">−${fmtEUR(total)} ${trad('/ mois')}</dd>`];
      const x = avec[0];
      return [ligneSource({
        nom, montant: total, signe: -1,
        action: x.chargeIndex != null ? 'edit-charge' : 'editer-credit',
        donnees: x.chargeIndex != null ? { i: x.chargeIndex } : { etab: x.etabId, i: x.index },
      })];
    })(),
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

function carteExploitation(c, idx) {
  const cf = cashFlowBien(c);
  if (!cf) return '';
  const usage = usageBien(c);
  const loue = cf.loyersPleins > 0.005;
  const rien = !cf.loyers && !cf.charges && !cf.mensualite;

  if (rien) return `
  <div class="card">
    <div class="card-head"><h2>${trad('Impact mensuel')}</h2>
      <span class="hint">${trad('loyer, charges, cash-flow')}</span>
      ${boutonsRattachement(c)}</div>
    <p class="empty" style="margin:0">${trad('Aucun loyer ni charge rattaché à ce bien. '
      + '« + Loyer » et « + Charge » les créent déjà rattachés ; un loyer déjà saisi dans le '
      + 'budget se rattache par sa liste « Bien ». Le cash-flow et le rendement se calculent '
      + 'alors tout seuls. Une provision pour travaux se déclare de la même façon, en charge '
      + 'annuelle : c\'est la dépense que tout le monde oublie et qui décide du vrai rendement.')}</p>
  </div>`;

  const baseDite = cf.surAchat ? trad('le prix payé') : trad('la valeur actuelle');
  return `
  <div class="card">
    <div class="card-head"><h2>${trad('Impact mensuel')}</h2>
      <span class="hint">${loue
        ? `${fmtEUR0(cf.loyersPleins)} ${trad('de loyer par mois')}`
        : (usage ? esc(trad(USAGE_BIEN_LABEL[usage]).toLowerCase()) : '')}</span>
      ${boutonsRattachement(c)}</div>
    <dl class="kv">
      ${lignesDuMois(cf)}
      <dt><b>${trad('Cash-flow')}</b>${aide(trad("Ce qui reste sur ton compte en fin de mois, une fois le crédit payé. La somme des lignes au-dessus, chacune ouvrable par son nom. Négatif les premières années d’un crédit, c’est fréquent et ce n’est pas une erreur : tu rembourses du capital, donc ton patrimoine monte pendant que ta trésorerie baisse. Les deux chiffres sont vrais."))}</dt>
        <dd class="${cls(cf.cashFlow)}"><b>${fmtSigned(cf.cashFlow)} ${trad('/ mois')}</b></dd>
      ${cf.capitalMois ? `<dt>${trad('Patrimoine constitué ce mois')}${aide(trad("La part de capital de ta mensualité : elle réduit ta dette et augmente ton patrimoine net d’autant. Elle quitte ta trésorerie et rejoint tes murs, donc les deux lignes ne s'additionnent pas : elles répondent à deux questions différentes."))}</dt>
        <dd class="up"><b>+${fmtEUR(cf.capitalMois)} ${trad('/ mois')}</b></dd>` : ''}
    </dl>
    ${!loue ? '' : `
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
    ${reglagesExploitation(c, idx)}`}
  </div>`;
}

function espaceBien(c, idx, t) {
  if (!estBien(t)) return '';
  const biens = (c.lignes || []).map((l, i) => ({ l, i }))
    .filter(({ l }) => (l.classe || 'immobilier') === 'immobilier');
  const { idxEtab, dettes, total: credit } = creditsDuCompte(c);
  const entiere = biens.reduce((s, { l }) => s + num(l.valeur), 0);
  const achatEntier = biens.reduce((s, { l }) => s + num(l.prixDeRevient), 0);
  const valeur = biens.reduce((s, { l }) => s + num(l.valeur) * partDetention(l), 0);
  const achat = biens.reduce((s, { l }) => s + num(l.prixDeRevient) * partDetention(l), 0);
  const partagee = Math.abs(entiere - valeur) > 0.005;
  const gain = achat ? valeur - achat : null;

  return `
  <div class="card">
    <div class="card-head"><h2>${trad('Le bien')}</h2>
      <span class="hint">${biens.length > 1
        ? `${biens.length} ${trad('lots')}` : esc(trad(t.label))}</span></div>
    ${biens.map(({ l, i }) => `
      <div class="modal-champs">
        <div class="field"><label>${trad('Nom du bien')}</label>
          <input data-action-change="renommer-bien" data-compte="${esc(c.id)}"
                 value="${esc(l.libelle || '')}" placeholder="${trad('ex. Studio Lyon 3e')}"></div>
        <div class="grid g-2 g-paire">
          <div class="field"><label>${trad('Valeur estimée aujourd\'hui (€)')}${aide(trad("Ce qu'un acheteur te paierait aujourd'hui, frais de notaire exclus : ceux-là sont partis en taxes le jour de l'achat et ne se revendent pas. C'est pour ça qu'un achat récent financé à crédit peut afficher un patrimoine net négatif, sans que rien ne soit faux."))}</label>
            <input type="number" step="any" class="champ-large"
                   data-path="comptes.${idx}.lignes.${i}.valeur" value="${num(l.valeur)}"></div>
          <div class="field"><label>${trad('Prix d\'acquisition (€)')}${aide(trad("Frais de notaire et travaux compris si tu veux que la plus-value affichée soit la vraie."))}</label>
            <input type="number" step="any" class="champ-large"
                   data-path="comptes.${idx}.lignes.${i}.prixDeRevient" value="${num(l.prixDeRevient) || ''}"></div>
        </div>
        <div class="grid g-2 g-paire">
          <div class="field"><label>${trad('Date d\'acquisition')}</label>
            <input type="date" data-path="comptes.${idx}.lignes.${i}.dateAcquisition"
                   value="${esc(l.dateAcquisition || '')}"></div>
          <div class="field"><label>Surface (m²)${aide(trad("Elle donne le prix au mètre carré, le seul chiffre qui permette de confronter ton estimation aux annonces du quartier. Sans elle, « 150 000 € » ne se vérifie contre rien."))}</label>
            <input type="number" step="any" class="champ-large"
                   data-path="comptes.${idx}.lignes.${i}.surface" value="${num(l.surface) || ''}"></div>
        </div>
        <div class="grid g-2 g-paire">
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
            ${num(l.part) && (num(l.part) < 0 || num(l.part) > 100) ? `<p class="hint" style="margin:4px 0 0">${
              trad('Une part va de 0 à 100. Au-delà, le bien compte en entier.')}</p>` : ''}</div>
        </div>
        <div class="field"><label>Adresse</label>
          <textarea rows="3" data-path="comptes.${idx}.lignes.${i}.adresse"
                    placeholder="${trad('facultatif')}"
                    style="text-align:left">${esc(l.adresse || '')}</textarea></div>
      </div>`).join('')}
    ${(() => {
      const surface = biens.reduce((s, { l }) => s + num(l.surface), 0);
      if (!surface || !entiere) return '';
      return `<dl class="kv" style="margin-top:12px">
        <dt>${trad('Prix au m²')}<span class="sub">${trad('{v} m² au total')
          .replace('{v}', fmtNombre(surface))}</span></dt>
        <dd><b>${fmtEUR0(entiere / surface)}</b> / m²${achatEntier ? `
          <span class="muted">${trad('acheté')} ${fmtEUR0(achatEntier / surface)}</span>` : ''}</dd>
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
    <div class="field" style="margin-top:12px">
      <label>${trad('Apport à l\'achat (€)')}${aide(trad("Ce que tu as sorti de ta poche le jour de l'achat, frais de notaire compris. Il sert au rendement sur apport ; il ne change pas la valeur nette actuelle du bien, qui vaut sa valeur moins ce que tu dois encore."))}</label>
      <input type="number" step="any" class="champ-large"
             data-path="comptes.${idx}.apport" value="${num(c.apport) || ''}"
             placeholder="${trad('facultatif')}"></div>
    ${(() => {
      const aFinancer = financementIndicatif(c);
      if (aFinancer != null) {
        return `<p class="hint" style="margin:8px 0 0">${
          trad('Reste à financer')} <b>${fmtEUR0(aFinancer)}</b>${
          trad(', si tu empruntes le reste. Ajoute le crédit quand il existera : Tallya n’en crée aucun toute seule.')}</p>`;
      }
      const co = coherenceAcquisition(c);
      if (!co || co.coherent) return '';
      return `<div class="note" style="margin-top:12px">⚠ <span>${
        trad('L’apport et le montant emprunté ne correspondent pas au prix d’acquisition renseigné.')} ${
        trad('Vérifie les montants ou les frais financés.')} <b>${
        montantSigne(co.ecart)}</b> ${trad('d’écart')}.</span></div>`;
    })()}
  </div>

  ${carteExploitation(c, idx)}

  <div class="card">
    <div class="card-head"><h2>Financement</h2>
      <button class="btn sm ghost" data-action="ajouter-credit" data-id="${esc(c.etabId)}">${trad('+ Crédit')}</button></div>
    ${!dettes.length ? `
      <div class="empty">
        <p style="margin:0 0 12px">${trad('Aucun crédit déclaré : le bien est compté '
          + 'en entier dans ton patrimoine, et sa valeur nette est donc sa valeur tout '
          + 'court.')}</p>
        <button class="btn sm" data-action="ajouter-credit" data-id="${esc(c.etabId)}">
          ${trad('+ Déclarer un crédit sur ce bien')}</button>
      </div>` : dettes.map(({ d, i }) => {
      const initial = num(d.initial);
      const restant = num(d.montant);
      const paye = initial ? Math.max(0, initial - restant) : null;
      const pct = initial ? Math.min(100, Math.max(0, paye / initial * 100)) : null;
      return `
      <div class="pret">
        <div class="bien-tete">
          <span class="cpt-nom"><button type="button" class="lien-nu"
                  data-action="editer-credit" data-etab="${esc(c.etabId)}" data-i="${i}"
                  title="${trad('Renommer, corriger ou supprimer')}">${esc(d.libelle)}</button>
            ${(() => {
              const bits = [
                d.preteur ? esc(d.preteur) : '',
                /* `mensualiteCredit` et non `d.mensualite` : quand une charge
                   fixe porte la mensualite, le champ du credit est vide et cette
                   ligne se taisait sur un pret qui coute pourtant 894 EUR par
                   mois. La charge est la source, le credit la lit. */
                mensualiteCredit(d)
                  ? `${fmtEUR0(mensualiteCredit(d))} ${trad('par mois')}` : '',
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
          ${chargeDuCredit(d.id) ? `
          <div class="field"><label>${trad('Mensualité (€)')}${aide(trad("Elle se règle dans la charge fixe qui rembourse ce crédit, pour n'exister qu'à un seul endroit. Un second champ ici laisserait les deux diverger, et c'est celui-ci que rien ne relirait."))}</label>
            <p class="hint" style="margin:0">${fmtEUR(mensualiteCredit(d))} ${trad('par mois, depuis la charge')}
              <b>${esc(chargeDuCredit(d.id).charge.label || trad('Charge fixe'))}</b></p></div>`
          : `
          <div class="field"><label>${trad('Mensualité (€)')}</label>
            <input type="number" step="any" class="champ-large"
                   data-path="etabs.${idxEtab}.dettes.${i}.mensualite" value="${num(d.mensualite) || ''}"></div>`}
          ${(() => {
            const r = resteAPayer(d);
            if (!r) return '';
            const ans = Math.floor(r.mois / 12), mois = r.mois % 12;
            const duree = [ans ? `${ans} ${ans > 1 ? trad('ans') : trad('an')}` : '',
                           mois ? `${mois} ${trad('mois.pl', 'mois')}` : '']
                          .filter(Boolean).join(' ' + trad('et') + ' ');
            return `
            <dl class="kv" style="margin-top:4px">
              <dt>${trad('Il te reste')}</dt>
                <dd class="phrase">${esc(duree)} <span class="muted">· ${r.mois} ${trad('échéances')}</span></dd>
              <dt>${trad('Dernière échéance')}</dt>
                <dd>${esc(fmtMoisAn(r.fin))}</dd>
              <dt>${trad('Intérêts restants')}${aide(trad('Ce que le crédit te coûtera encore, hors assurance, si tu le mènes à son terme sans remboursement anticipé.'))}</dt>
                <dd>${fmtEUR0(r.interets)}</dd>
              ${r.assurance > 0.5 ? `
              <dt>${trad('Assurance restante')}</dt>
                <dd>${fmtEUR0(r.assurance)}</dd>` : ''}
              <dt>${trad('Ta mensualité, ce mois-ci')}${aide(trad('La part de capital monte chaque mois, celle des intérêts baisse : c’est le même montant qui se répartit autrement.'))}</dt>
                <dd class="phrase"><span class="muted">${trad('capital')}</span> ${fmtEUR(r.capitalDuMois)}
                  <span class="muted">· ${trad('intérêts')}</span> ${fmtEUR(r.interetsDuMois)}${
                  r.assuranceDuMois > 0.5 ? ` <span class="muted">· ${trad('assurance')}</span> ${fmtEUR(r.assuranceDuMois)}` : ''}</dd>
            </dl>`;
          })()}
          <div class="field"><label>${trad('Taux annuel (%)')}${aide(trad("Il donne la date de fin du crédit, ce qu'il te reste à payer d'intérêts, et la part de capital de chaque mensualité. Ton capital restant dû, lui, reste celui que tu saisis : jamais un montant projeté."))}</label>
            <input type="number" step="0.01" class="champ-large"
                   data-path="etabs.${idxEtab}.dettes.${i}.taux" value="${num(d.taux) || ''}"></div>
          <div class="field"><label>${trad('Banque / prêteur')}</label>
            <input class="champ-large" style="text-align:left"
                   data-path="etabs.${idxEtab}.dettes.${i}.preteur"
                   value="${esc(d.preteur || '')}" placeholder="${trad('ex. Crédit Agricole')}"></div>
        </div>
      </div>`;
    }).join('')}
    ${credit ? `<p class="small muted" style="margin:12px 0 0">${
      trad('Après chaque mensualité, baisse le capital restant dû : ton patrimoine net '
      + 'monte d’autant, sans que la valeur du bien change. Le crédit est porté par {e}, '
      + 'il se retrouve aussi sur sa fiche.').replace('{e}', esc(nomEtabDe(c)))}
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
  for (const l of lignes) parClasse.set(l.classe, (parClasse.get(l.classe) || 0) + l.valeur);

  return `
  <button type="button" class="btn sm ghost retour-page" data-action="goto" data-view="accounts" data-anchor="">‹ ${trad('Actifs')}</button>

  <div class="card cpt-entete">
    <div>
      <span class="hero-label">${majuscule(motCompte(t))}</span>
      <h2 class="fiche-nom">${esc(nomCompteV2(c))}</h2>
      ${c.statut === 'archive' ? '' : `<div class="cpt-net">${fmtEUR(valeurCompte(c))}</div>`}
      <span class="sub">${esc([sousTitreCompte(c, false), c.statut === 'archive' ? trad('archivé') : '']
        .filter(Boolean).join(' · '))}</span>
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
      ${(() => {
        const et = c.etabId && etabById(c.etabId);
        if (!et) return '';
        const siens = COMPTES().filter(x => x.etabId === et.id);
        return `<button type="button" class="btn sm ghost lien-etab"
                data-action="fiche-etab" data-id="${esc(et.id)}"
                style="--teinte:${teinteEtab(et)}"
                title="${trad('Voir l’établissement qui tient ce compte')}">
          <span class="cpt-pastille" aria-hidden="true"></span>${esc(et.nom)} ›</button>`;
      })()}
    </div>
    <dl class="kv" style="margin-left:auto">
      ${[...parClasse.entries()].filter(([, v]) => v).map(([k, v]) =>
        `<dt>${esc(CLASSES_ACTIFS[k] || k)}</dt><dd>${fmtEUR(v)}</dd>`).join('')}
    </dl>
    ${(() => {
      const a = ancienneteCompte(c);
      if (!a) return '';
      const duree = `${a.annees} ${trad(a.annees > 1 ? 'ans' : 'an')}${
        /* « mois » est invariable en francais : la clef au pluriel porte un
           repli, sinon `trad()` rend la clef elle-meme et l'ecran affiche
           « 11 mois.pl ». Meme motif que `trad('sur.total', 'sur')`. */
        a.reste ? ` ${trad('et')} ${a.reste} ${trad(a.reste > 1 ? 'mois.pl' : 'mois', 'mois')}` : ''}`;
      return `<p class="hint" style="margin:12px 0 0">${trad('Ouvert depuis')} ${duree} · ${
        a.atteint
          ? `<b class="up">${trad('seuil des')} ${a.seuilAns} ${trad('ans atteint')}</b>`
          : `${trad('seuil des')} ${a.seuilAns} ${trad('ans le')} ${fmtDate(a.seuilLe)}`
      }${aide(trad('Un seuil fiscal, pas une barrière à la sortie : avant lui, retirer reste possible, on y perd l’avantage d’impôt et non l’accès à l’argent. C’est pourquoi la disponibilité affichée plus bas n’en dépend pas.'))}</p>`;
    })()}
  </div>

  ${espaceBien(c, idx, t)}

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
        <input type="number" step="any" class="champ-inline" data-path="comptes.${idx}.cash.${i}.montant" value="${num(e.montant)}">
        <span class="champ-unite" aria-hidden="true">€</span>
        ${t.interne && (c.cash || []).length < 2 ? ''
          : `<button class="btn sm ghost danger" data-action="retirer-cash" data-id="${esc(c.id)}" data-i="${i}" title="${trad('Retirer cette part')}">${trad('Retirer')}</button>`}
      </div>`).join('')
    : `<p class="empty">${t.titres
        ? trad('Aucune espèce en attente. « Scinder » déclare un montant à investir.')
        : trad('Pas d’argent déclaré sur ce compte. « Scinder » ajoute une première part.')}</p>`}
  </div>`}

  ${estBien(t) || (!t.classes.some(x => x !== 'liquidites') && !lignes.length) ? '' : `
  <div class="card">
    <div class="card-head"><h2>${trad(t.melange ? 'Supports du contrat'
      : t.titres ? 'Lignes de titres' : 'Placements détenus')}</h2>
      <span class="hint">${trad('Disponibilité')}${aide(trad("Sous combien de temps chaque placement redevient de l’argent disponible. Elle alimente la carte « Autonomie financière » de l’accueil. « Auto » suit la règle du type de compte : un PEA de moins de cinq ans est bloqué, un compte-titres se vend en séance. La règle se trompe parfois : un non coté peut se revendre sur un marché secondaire, c’est pourquoi chaque ligne peut la contredire."))}</span>
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
      <dl class="kv">
        <dt>${trad('Nom du')} ${motCompte(t)}</dt><dd>${c.libelle ? esc(c.libelle)
          : `<span class="muted">${trad('non renseigné')}</span>`}</dd>
        <dt>${trad('Type de')} ${motCompte(t)}${aide(t.interne
          ? trad('Les espèces n’ont pas d’établissement : personne ne les tient pour '
          + 'toi. Ce compte existe une fois, il ne se choisit pas dans la liste '
          + 'et ne se supprime pas. S’il n’y a plus de billets, mets-le à 0.')
          : trad('Il commande la poche du patrimoine, les classes que le compte peut '
          + 'porter et la disponibilité de ce qu’il contient. On peut le corriger '
          + 'à tout moment : l’historique des relevés suit le compte, il ne se '
          + 'perd pas. Un changement qui laisserait un placement sans place est '
          + 'refusé, en disant lequel déplacer. '
          + 'Non coté : deux types, deux métiers. « Parts de société » pour des '
          + 'parts de société ou un pacte d’associés : on sort au rachat, '
          + 'pas à une date. « Prêt participatif » pour un prêt à un taux, '
          + 'avec une échéance et un état : ces lignes-là portent une date de '
          + 'remboursement, et l’application te rappelle celles qui l’ont dépassée.'))}</dt>
        <dd>${esc(trad(t.label))}${t.interne ? trad(', sans établissement') : ''}</dd>
        ${t.id === 'livret' ? `
        <dt>${trad('Plafond de versement')}${aide(trad("Facultatif. Une fois posé, la fiche dit ce qu’il reste à verser. Les plafonds courants : 22 950 € pour un Livret A, 12 000 € pour un LDDS, 10 000 € pour un LEP. Les intérêts peuvent faire dépasser le plafond, c’est normal et la fiche l’annonce alors comme plein."))}</dt>
        <dd>${num(c.plafond) ? fmtEUR(c.plafond)
              : `<span class="muted">${trad('non renseigné')}</span>`}</dd>` : ''}
        ${t.dateSensible ? `
        <dt>${trad('Date d’ouverture')}${aide(trad("Elle donne l’ancienneté du contrat, affichée en tête de cette fiche : cinq ans pour un PEA, huit pour une assurance-vie. Ce sont des seuils d’impôt, pas des barrières à la sortie : avant eux, retirer reste possible, on y perd l’avantage fiscal et non l’accès à l’argent. C’est pour cela qu’elle est demandée ici et pas sur les autres types de compte."))}</dt>
        <dd>${c.ouvertLe ? esc(fmtDate(c.ouvertLe))
              : `<span class="muted">${trad('à renseigner')}</span>`}</dd>`
        : c.ouvertLe ? `<dt>${motDateCompte(t)}</dt><dd>${esc(fmtDate(c.ouvertLe))}</dd>` : ''}
        ${c.statut === 'archive' ? `<dt>${trad('Date de clôture')}</dt>
        <dd>${c.clotureLe ? esc(fmtDate(c.clotureLe))
              : `<span class="muted">${trad('non renseignée')}</span>`}</dd>` : ''}
        ${!t.interne && c.numero ? `<dt>${trad('Numéro de compte')}</dt><dd>${esc(c.numero)}</dd>` : ''}
      </dl>
      <div class="field" style="margin-top:12px"><label>Notes</label>
        <input data-path="comptes.${idx}.notes" value="${esc(c.notes || '')}"
               placeholder="${trad('facultatif')}" style="text-align:left"></div>
      ${barreValiderFiche()}
    </div>
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

  <div class="card cpt-entete" style="--teinte:${teinteEtab(e)}">
    <div>
      <span class="hero-label">${esc(trad(contenantDeLEtab(e.id).titre))}</span>
      <h2 class="fiche-nom"><span class="cpt-pastille" aria-hidden="true"></span>${esc(e.nom)}</h2>
      <div class="cpt-net">${fmtEUR(total - credits)}</div>
      <span class="sub">${siens.length} ${motContenu(e.id, siens.length)}${credits ? ` · ${fmtEUR0(credits)} ${trad('de crédits')}` : ''}</span>
    </div>
    <button class="btn sm ghost" style="margin-left:auto"
            data-action="modifier-etab" data-id="${esc(e.id)}">${trad('Modifier')}</button>
  </div>

  <div class="card">
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
        <button class="btn sm danger" data-action="retirer-credit"
                data-id="${esc(e.id)}" data-i="${i}">${trad('Supprimer')}</button>
      </div>`).join('') + `
      <p class="small muted" style="margin:12px 0 0">
        ${trad('Après chaque mensualité, baisse le capital restant dû : ton patrimoine net '
          + 'monte d’autant, sans que la valeur du bien change.')}
      </p>`
    : `<p class="empty">${trad('Aucun crédit déclaré chez')} ${esc(e.nom)}.</p>`}
  </div>

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
      <div class="field"><label>${trad('Épargne mensuelle (€)')}${aide(trad('Le montant que tu places chaque mois, saisi à la main. Il sert de base au partage ci-dessous, et il est indépendant de la capacité d’épargne que Budget calcule.'))}</label>
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
            <thead><tr><th>${trad('Classe d\'actif')}</th><th>%</th><th>${trad('Montant')}</th><th style="text-align:left">${trad('Véhicules')}</th></tr></thead>
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

let budgetYear = null;   // null = l'année en cours
/* Tri du detail mensuel : { key, dir }, ou null pour l'ordre du calendrier.
   `key` vaut 'mois', 'total', ou le nom d'une categorie. Il ne trie que le
   tableau du grand ecran — la liste de telephone reste chronologique, elle
   n'a pas d'en-tetes pour dire son ordre, et un ordre muet est un piege. */
let depSort = null;

function budgetAnnee() {
  const annees = expenseYears();
  const courante = todayISO().slice(0, 4);
  /* « Toutes les années » a quitte le selecteur de Budget : une valeur `all`
     restee d'avant (ou posee par un vieux geste) retombe sur l'annee en
     cours, sans quoi la page afficherait un choix que le menu n'offre plus. */
  if (budgetYear === 'all') budgetYear = null;
  return budgetYear ?? (annees.includes(courante) ? courante : annees[annees.length - 1]);
}

const viewBudgetCadre = () => viewBudget('cadre');

function viewBudget(section = 'depenses') {
  const cadre = section === 'cadre';
  const f = budgetFrame();
  const years = expenseYears();
  const year = budgetAnnee();
  const stats = expenseYearStats(year);
  const cats = expenseByCategory(year);
  const lignesDepenses = Store.state.budget.expenses
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => year === 'all' || String(r.month).startsWith(year));
  const cur = currentExpenseMonth();
  /* `savingsReconciliation()` etait lu ici, pour la carte « Epargne et
     croissance » qui a rejoint l'accueil. Elle en etait le seul lecteur de cette
     vue : la ligne est partie avec elle, sans quoi c'etait un appel dont plus
     personne ne se servait — la moitie qu'on oublie en retirant un affichage. */
  const b = Store.state.budget;

  const resteObjectif = f.target - (cur ? cur.total : 0);
  const attendu = depensesEnAttente();

  return `
  ${cadre ? '' : `
  <div class="grid g-hero">
    <div class="hero card-cliquable">
      <button type="button" class="card-couvre" data-action="saisir-mois-courant"
              aria-label="${trad('Saisir les dépenses du mois')}"
              title="${trad('Saisir les dépenses du mois')}"></button>
      <div>
        <div class="hero-label">${cur ? (cur.isCurrent ? trad('Dépenses du mois en cours') : `${trad('Dernier mois renseigné')} · ${esc(cur.label)}`) : trad('Dépenses')}</div>
        <div class="hero-value">${cur ? fmtEUR0(cur.total) : ''}</div>
      </div>
      <div class="hero-deltas">
        <button type="button" class="hero-delta hero-delta-reglable"
                data-action="regler-objectif-depenses"
                aria-label="${trad('Régler l’objectif de dépenses mensuel,')} ${fmtEUR0Texte(f.target)}">
          <span>${trad('Objectif mensuel')}</span>
          <b>${fmtEUR0(f.target)}<span class="hero-delta-chev" aria-hidden="true">›</span></b>
        </button>
        <div class="hero-delta">
          <span>${resteObjectif >= 0 ? trad('Reste sur l’objectif') : trad('Dépassement')}</span>
          <b class="${resteObjectif >= 0 ? '' : classeDepassement(cur ? cur.total : 0, f.target)}"
            >${fmtEUR0(Math.abs(resteObjectif))}</b>
        </div>
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
              <div class="flow-bar"><div style="width:${Math.max(2, p.v / haut * 100)}%;
                background:var(--degrade-budget)"></div></div>
              <b class="flow-val">${fmtEUR0(p.v)}</b>
            </div>`).join('')}
          ${parts.length > 6 ? `<p class="small muted" style="margin:4px 0 0">
            ${trad(parts.length - 6 > 1 ? 'et {n} autres catégories' : 'et {n} autre catégorie')
              .replace('{n}', parts.length - 6)}</p>` : ''}
        </div>`;
      })()}
    </div>

    <div class="card">
      <div class="card-head"><h2>${trad('Où va ce que tu gagnes')}</h2><span class="hint">${trad('chaque mois')}</span></div>
      ${(() => {
        const parts = [
          [trad('Charges fixes'), f.fixed, 'var(--series-2)', f.fixedPct, 'ancre'],
          [trad('Objectif dépenses'), f.target, 'var(--series-4)', f.targetPct, 'objectif'],
          /* L'aide vit dans sa propre case, et non collee au libelle : celui-ci
             sert aussi a l'etiquette d'accessibilite de la barre, ou un
             `<span>` se lirait a voix haute. */
          [trad('Objectif d’investissement'), f.investTarget, 'var(--series-1)',
            f.investTargetPct, '', trad('Revenus moins charges fixes moins ton objectif de '
            + 'dépenses. C’est le montant que tu vises, là où la capacité d’épargne est ce '
            + 'que tes dépenses réelles laissent.')],
        ];
        /* Le motif vient de `PREMIERS_PAS` : il est ne ici, et les deux autres
           invites le reprennent depuis la meme table plutot que de le recopier. */
        if (!f.income) return invitePremierPas('revenus');
        const sources = Store.state.budget.income.length;
        return `
        <button type="button" class="flux-total" data-action="toggle-revenus"
                title="${trad('Voir et modifier les sources de revenus')}${revenuEstime()
                  ? trad(' · une partie est déclarée en montant estimé') : ''}">
          <b>${revenuEstime() ? '≈ ' : ''}${fmtEUR0(f.income)}</b>
          <span class="muted">${sources} ${sources > 1 ? trad('sources de revenus') : trad('source de revenus')}${
            revenuEstime() ? trad(', en partie estimés') : ''}</span>
          <span class="flux-chev" aria-hidden="true">›</span>
        </button>
        <div class="hero-barre" role="img"
             aria-label="${trad('Partage')}${deuxPoints()} ${parts.map(([l, , , pct]) =>
               `${esc(l)} ${fmtPct(pct, 0)}`).join(', ')}">
          ${parts.map(([, , couleur, pct]) => `<i style="width:${Math.max(0, Math.min(100, pct)).toFixed(2)}%;
            background:${couleur}"></i>`).join('')}
        </div>
        <div class="flux-legende">
          ${parts.map(([label, val, couleur, pct, ouvrable, aideTexte]) => {
            const corps = `
              <span class="dot" style="background:${couleur}"></span>
              <span class="repart-nom">${esc(label)}${aideTexte ? aide(aideTexte) : ''}</span>
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
    </div>
  </div>`}

  ${cadre ? '' : `
  <div class="grid g-4 g-tuiles">
    ${tile(`${trad('Dépenses')} ${year}`, stats.total, null, 'var(--series-2)',
           `${stats.months} ${trad('mois · hors charges fixes')}`, 'depensesAnnee')}
    ${tile('Moyenne par mois', stats.average, null, 'var(--series-4)',
           `${trad('sur')} ${stats.moisRetenus} ${trad('mois clos, hors charges fixes')}`
             + (stats.moisEnCoursExclu ? ' ' + trad('et hors mois en cours') : ''),
           /* Sa fiche ventile la moyenne par categorie : elle n'a plus de
              question a laquelle repondre quand on a demande a ne plus les
              detailler. Sans apercu, `tile()` rend une tuile simple et non
              cliquable -- le chiffre reste, il est global, c'est sa
              DECOMPOSITION qui s'en va. Ouvrir la liste des mois a la place
              aurait double la fiche de la tuile voisine, qui la porte deja. */
           sansDistinction() ? null : 'depensesCategories')}
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
    <div class="card-head">
      <h2>${trad('Dépenses mensuelles')}</h2>
      <span class="hint">${trad('objectif')} ${fmtEUR0(b.monthlyTarget)}</span>
      ${yearControl('budget-year', years, year)}
    </div>
    <div class="chart" id="bChart"></div>
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
        <tbody>${expenseSeriesVisible(year).map(r => `<tr>
          <td class="name">${esc(r.label)}</td>
          <td>${r.total ? fmtEUR0(r.total) : ''}</td>
          <td class="${classeDepassement(r.total, f.target)}">${r.total ? fmtSigned(r.total - f.target) : ''}</td>
          <td style="text-align:left" class="muted small">${esc(r.note || '')}</td></tr>`).join('')}</tbody>
      </table>
    </details>
  </div>

  ${sansDistinction() ? '' : `
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
  </div>`}
  <div class="card" data-anchor="detail-mensuel">
    <div class="card-head">
      <h2>${trad('Détail mensuel')}</h2>
      ${yearControl('budget-year', years, year)}
    </div>
    <div class="row" style="margin:-4px 0 12px">
      <span class="hint">${lignesDepenses.length} ${lignesDepenses.length > 1 ? trad('mois affichés') : trad('mois affiché')}${
        sansDistinction() ? '' : ` · ${expenseCategories().length} ${trad('catégories')}`}</span>
      <span class="spacer"></span>
      ${sansDistinction()
        ? `<button class="btn sm ghost" data-action="reprendre-detail" type="button"
                   title="${esc(trad('Reprendre le détail remet toutes tes catégories dans la saisie, y compris celles que tu avais retirées à la main : l’application ne sait pas les distinguer. Tu peux en retirer à nouveau, ligne par ligne, sans rien perdre.'))}"
             >${trad('Remettre toutes les catégories')}</button>`
        : `<button class="btn sm ghost" data-action="sans-distinction" type="button"
                   title="${esc(trad('Pour qui ne veut pas ventiler ses dépenses : une seule catégorie reste proposée à la saisie du mois, les autres sont retirées. Rien n’est effacé, les mois déjà détaillés gardent leur découpage dans le tableau, les graphiques et les exports. Réversible, et Ctrl+Z annule.'))}"
             >${trad('Une seule case à remplir')}</button>`}
      ${sansDistinction() ? ''
        : `<button class="btn sm ghost" data-action="add-category"
             >${trad('+ Ajouter une catégorie')}</button>`}
    </div>
    ${(() => {
      const att = depensesEnAttente();
      if (!att.missing) return '';
      const visible = year === 'all' || String(att.key).startsWith(year);
      return `<div class="note note-relance" style="margin-bottom:12px">⚠ <span>
        <b>${esc(att.label)} ${trad('n’est pas saisi.')}</b> ${trad('Le mois est clos : '
          + 'c’est le moment d’enregistrer ce qu’il a coûté.')}${visible
          ? ` ${trad('Sa ligne est signalée ci-dessous.')}`
          : ` ${trad('Change l’année pour {a} pour la voir.')
              .replace('{a}', esc(String(att.key).slice(0, 4)))}`}</span>
        ${sortiesRappel('depenses', att.label,
          `<button class="btn sm" data-action="saisir-mois-en-attente">${trad('Saisir')} ${esc(att.label)}</button>`)}
      </div>`;
    })()}
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
    <div class="table-wrap large-seulement">
      <table class="editable">
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
              + (sansDistinction() ? ''
                 : expenseCategories().map(c => th(`cat:${c}`, c)).join(''));
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
              estAttendu ? `<span class="marque-attendu" title="${
                trad('Le mois que la relance attend')}">⚠</span>` : ''}</td>
            <td><b>${tot ? fmtEUR0(tot) : ''}</b></td>
            <td class="${classeDepassement(tot, f.target)}">${tot ? fmtSigned(diff) : ''}</td>
            ${sansDistinction() ? '' : expenseCategories().map(c => `<td>${
                r.v[c] != null && r.v[c] !== '' ? fmtEUR0(r.v[c]) : ''}</td>`).join('')}
            <td class="name prose">${esc(r.note || '')}</td>
            <td><button class="btn icon" data-action="del-expense-month" data-i="${i}" title="${trad('Supprimer')}">✕</button></td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr>
          <td class="sticky-col">Total ${esc(year)}</td>
          <td>${fmtEUR0(stats.total)}</td><td></td>
          ${sansDistinction() ? '' : expenseCategories().map(c => {
            const v = cats.find(x => x.label === c);
            return `<td>${v ? fmtEUR0(v.value) : ''}</td>`;
          }).join('')}
          <td colspan="2"></td>
        </tr></tfoot>
      </table>
    </div>

    ${sansDistinction() ? '' : `    <details class="data-view" style="margin-top:12px">
      <summary>${trad('Renommer, retirer ou supprimer une catégorie')}</summary>
      <table class="editable table-serree">
        <thead><tr><th>${trad('Catégorie')}</th><th>${trad('Total saisi')}</th><th></th></tr></thead>
        <tbody>${expenseCategories().map(c => {
          const total = expenseCategoryTotal(c);
          const retiree = categorieRetiree(c);
          return `<tr${retiree ? ' class="cat-retiree"' : ''}>
            <td class="name"><input value="${esc(c)}" data-action-change="rename-category"
                data-cat="${esc(c)}" title="${trad('Modifie le nom puis quitte le champ')}">
              ${retiree ? '<span class="tag">retirée</span>' : ''}</td>
            <td class="${total ? '' : 'muted'}">${total ? fmtEUR0(total) : ''}</td>
            <td class="cat-actions">
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
    </details>`}
  </div>`}

  ${!cadre ? '' : `
  <div class="card">
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
              ? trad('autres postes') : trad('autre poste')}${deuxPoints()} ${trad('voir les.minuscule', 'voir les')} ${postes.length}${trad(', avec leur part ›')}`
          : trad('Voir la part de chaque poste ›')}</p>
      </button>`;
    })()}
  </div>

  <div class="grid">
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
      <div class="liste-mobile">
        ${b.fixedCharges.map((c, i) => ligneListe({
          action: 'edit-charge', index: i,
          titre: c.label || 'Sans nom',
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
        ${gens.length ? `<div class="contrib-liste">
          ${st.parPersonne.map(p => `
            <span class="contrib-jeton">
              <b>${esc(p.name)}</b>
              <span class="muted">${fmtEUR(p.total)} ${trad('/ mois')}</span>
              <button class="btn icon xs" data-action="del-contributor" data-id="${esc(p.id)}"
                      title="${esc(trad('Retirer {n} des charges partagées')
                        .replace('{n}', p.name))}"
                      aria-label="${esc(trad('Retirer {n}').replace('{n}', p.name))}">✕</button>
            </span>`).join('')}
        </div>` : ''}
      </div>
      <div class="table-wrap large-seulement">
        <table class="editable">
          <thead><tr>
            <th class="sticky-col">${trad('Poste')}</th><th>${trad('Montant')}</th><th>${trad('Facturé')}</th>
            <th title="${trad('Ce que la ligne pèse chaque mois, quelle que soit sa périodicité')}">${trad('€ / mois')}</th>
            <th>${trad('% charges')}</th>
            ${gens.map(p => `<th title="${esc(trad('Ce que {n} prend en charge, sur la même période que le montant').replace('{n}', p.name))}">
              Part de ${esc(p.name)}
              <button class="btn icon xs" data-action="del-contributor" data-id="${esc(p.id)}"
                      title="Retirer ${esc(p.name)}">✕</button></th>`).join('')}
            <th title="${trad('Ce qui sort réellement de ton compte, ramené au mois')}">${trad('À ma charge')}</th>
            <th>Organisme</th><th></th>
          </tr></thead>
          <tbody>${b.fixedCharges.map((c, i) => `<tr class="ligne-ouvre"
              data-action="edit-charge" data-i="${i}"
              title="Modifier ${guill(esc(c.label || 'Sans nom'))}">
            <td class="name sticky-col"><span class="mois-lien">${esc(c.label || 'Sans nom')}</span></td>
            <td>${fmtEUR(num(c.amount))}</td>
            <td>${esc(CHARGE_PERIODE_LABEL[chargePeriode(c)])}</td>
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
      ${gens.length ? `<p class="hint" style="margin:12px 0 0">
        ${trad('Ces parts sont indicatives : les charges retenues sont les charges fixes '
        + 'totales. La part de quelqu’un doit être ajoutée dans tes revenus.')}
      </p>` : ''}`;
      })()}
    </div>

  </div>`}`;
}

function paliersCible(courant) {
  const p = [];
  for (let v = 0; v <= 100; v += 1) p.push(v);
  const c = Math.max(0, Math.min(100, num(courant)));
  if (!p.includes(c)) p.push(c);
  return p.sort((a, b) => a - b);
}

/* `paliersObjectif()` vivait ici : les cent-en-cent d'une liste deroulante
   pour l'objectif de depenses. Elle est partie avec la liste. Un objectif se
   saisit maintenant a l'euro, parce que quelqu'un qui vit avec 640 EUR par mois
   doit pouvoir viser juste, et que les paliers ronds ne servaient qu'a essayer
   des hypotheses — un champ libre le fait aussi bien. */

function mountBudget() {
  const year = budgetAnnee();
  /* `expenseSeriesVisible` et non `expenseSeries` : un mois a venir n'est pas
     un mois a zero euro, et une barre plate se lit comme un mois sans depenses. */
  const rows = expenseSeriesVisible(year);
  Charts.barsWithTarget($('#bChart'), {
    height: 300,
    items: rows.map(r => ({ label: r.label, value: r.total, note: r.note })),
    target: num(Store.state.budget.monthlyTarget),
    targetLabel: trad('Objectif'),
  });
  /* Le conteneur n'existe pas quand les categories sont desactivees : la carte
     entiere ne se rend plus. `mount()` sort en silence dans ce cas, mais on ne
     l'appelle meme pas -- une carte absente n'a pas de graphique a monter. */
  if ($('#bCats')) Charts.rankedBars($('#bCats'), { items: expenseByCategory(year) });
}

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
      <div class="row" style="margin-top:14px; padding-top:14px; border-top:1px solid var(--grid)">
        ${modeDemo()
          ? `<button class="btn sm" data-action="quitter-demo">← ${trad('Revenir à mes données')}</button>
             <span class="hint">${trad('La démonstration reste disponible')}</span>`
          : `<button class="btn ghost sm" data-action="charger-demo">▷ ${trad('Voir la démonstration')}</button>
             <span class="hint">${trad('Des chiffres fictifs, sans toucher aux tiennes')}</span>`}
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
        <b>${trad('Conflit.')}</b> ${trad('La version en ligne ({d}) est plus récente '
        + 'que celle de cet appareil. Choisis laquelle garder.')
        .replace('{d}', new Date(s.conflict.remoteSavedAt).toLocaleString(locale()))}</span></div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" data-action="cloud-pull">${trad('↓ Prendre la version en ligne')}</button>
          <button class="btn sm ghost" data-action="cloud-force">${trad('↑ Imposer celle-ci')}</button>
        </div>` : `
        <div class="row" style="margin-top:12px">
          <button class="btn sm ghost" data-action="cloud-push">${trad('↻ Synchroniser maintenant')}</button>
        </div>`}
      <p class="small muted" style="margin:12px 0 0">
        ${trad('La synchronisation est automatique : tout est envoyé quelques secondes '
          + 'après chaque modification, et tes appareils partagent le même état. Ce bouton '
          + 'ne sert qu’à forcer l’envoi avant de fermer.')}
      </p>
    </div>`;
  })()}

  <div class="card">
    <div class="card-head">
      <h2>${trad('Revenir en arrière')}</h2>
      <span class="hint">${Store.undoCount()
        ? `${Store.undoCount()} ${Store.undoCount() > 1 ? trad('modifications annulables') : trad('modification annulable')}`
        : trad('rien à annuler pour l’instant')}</span>
    </div>
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

  <details class="data-view" style="margin-top:12px">
    <summary>${trad('Diagnostic')}</summary>
    <dl class="kv" style="margin-top:12px">
      <dt>Positions</dt><dd>${Store.state.positions.length}</dd>
      <dt>${trad('Relevés enregistrés')}</dt>
        <dd>${Store.state.monthly.filter(r => !rowIsEmpty(r)).length}</dd>
      <dt>${trad('Comptes suivis')}</dt><dd>${ACCOUNTS.length}</dd>
      <dt>${trad('Taille du stockage')}</dt><dd>${(JSON.stringify(Store.state).length / 1024).toFixed(1)} Ko</dd>
      <dt>${trad('Version')}${aide(trad("La version du code que tu es en train d’exécuter, lue sur la balise du script. Si elle ne change pas après un déploiement, c’est que le navigateur ressert l’ancienne : ferme complètement l’application et rouvre-la, un simple rechargement ne suffit pas toujours."))}</dt>
        <dd style="font-family:var(--font-nb)">${esc(VERSION_APP)}</dd>
    </dl>
  </details>

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

function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 10);

/* Une cellule de tableur est du texte affiche : sans `trad()`, l'export d'une
   application en anglais sortait « Quotidien » et « Non cote ». La fonction
   plutot qu'un objet constant, parce que la langue peut changer entre deux
   exports dans la meme session. */
const POCKET = () => ({
  cash: trad(CLASSES_ACTIFS.liquidites),
  bourse: trad(CLASSES_ACTIFS.actions),
  pe: trad(CLASSES_ACTIFS.nonCote),
});

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
      posPerfPct(p) / 100, poidsPortefeuille(posValue(p), base) / 100,
    ]),
    total: ['Total', '', '', '', '', null, null, null, '', null,
      round2(pnl.value), round2(pnl.invested), round2(pnl.pnl),
      pnl.pct == null ? null : pnl.pct / 100, poidsPortefeuille(pnl.value, base) / 100],
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
    rows: [...r.classes.map(line), ...(r.cash ? [line(r.cash)] : [])],
    total: [BASES.baseCibles.nom, round2(r.base), 1, null, null, null],
  };
}

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
      return [a.label, a.broker, POCKET()[a.group], i.opened || '',
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

function focusLast(listPath, field) {
  const list = getPath(listPath) || [];
  const el = $(`[data-path="${CSS.escape(`${listPath}.${list.length - 1}.${field}`)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest' });
  el.focus();
  el.select?.();
}

function makeDeleter(listKey, what, nameOf) {
  return async function (btn) {
    const i = +btn.dataset.i;
    const list = Store.state.budget[listKey];
    const item = list[i];
    if (!item) return;
    const nom = String(nameOf(item) || '').trim();
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
function optionsBiens() {
  return [['', trad('aucun, ce n’est pas lié à un bien')],
    ...comptesBiens().map(c => [c.id, nomCompteV2(c)])];
}

/* `type` : le type du compte qui porte la ligne, pas seulement sa classe. */
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
    { cle: 'dateAcquisition', label: trad('Date d’entrée'), type: 'date',
      valeur: l ? (l.dateAcquisition || '') : todayISO() },
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
    { cle: 'projet', label: trad('Réservé à un projet'), type: 'case',
      valeur: l ? !!l.projet : false,
      aide: trad('cet argent est déjà promis : la projection le porte à plat au lieu de le faire travailler') },
    { cle: 'projetLe', label: trad('Pour quand ?'), type: 'date',
      valeur: l ? (l.projetLe || '') : '',
      aide: trad('facultatif, sans effet sur les calculs') },
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
    ...(v.projet !== undefined ? { projet: !!v.projet } : {}),
    ...(v.projetLe !== undefined ? { projetLe: v.projetLe || '' } : {}),
  };
}

function creditsRattachables(sien = null) {
  const pris = new Set(Store.state.budget.fixedCharges
    .map(c => c.creditId).filter(x => x && x !== sien));
  return [['', 'aucun, c’est une charge ordinaire'],
    ...creditsEnCours().lignes.filter(c => !pris.has(c.id))
      .map(c => [c.id, `${c.libelle} · ${c.etabNom} · ${fmtEUR0(c.reste)} ${trad('restant dû')}`])];
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
  async 'del-sale'(btn) {
    const i = +btn.dataset.i;
    const v = Store.state.sales[i];
    if (!v) return;
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
    const ou = v.cashAccount
      ? ` · ${trad('encaissé sur')} ${ACC[v.cashAccount]?.short || trad('le cash')}` : '';
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
    const v = await askForm({
      titre: trad('Nouvelle ligne de titres'),
      sous: trad('L’ISIN suffit : le symbole et le cours se remplissent à la prochaine actualisation'),
      lie: { de: 'assetClass', vers: 'account', options: comptesPourListe,
             vide: 'aucun compte ne peut porter cette classe' },
      champs: [
        { cle: 'name', label: 'Nom', type: 'texte', requis: true, max: NOM_LIGNE_MAX,
          exemple: 'ex. MSCI World',
          aide: trad('{n} caractères au plus : ce nom se lit dans une colonne de tableau. '
            + 'Le nom officiel du titre reste sur sa fiche').replace('{n}', NOM_LIGNE_MAX) },
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
  'apercu'(btn) { openApercu(btn.dataset.apercu, btn.dataset.arg); },
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

  'apercu-enregistrer'() {
    appliquerDiffere();
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
    toast(`${actif ? trad('Activé') : trad('Éteint')}${deuxPoints()} ${
      (FAMILLES_NOTIF.find(f => f[0] === cle) || [, cle])[1].toLowerCase()}`);
  },
  'aller-fiche'(btn) { closeApercu(); location.hash = btn.dataset.route; },

  'goto'(btn) {
    closeApercu();
    pendingAnchor = btn.dataset.anchor || null;
    const view = btn.dataset.view;
    if (currentView() === view) { focusAnchor(); return; }
    location.hash = '#/' + view;
  },
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

  'refusionner-classe'(btn) {
    const cle = btn.dataset.cle;
    const tg = Store.state.targets.classes || {};
    const v = tg[cle];
    if (v === null || typeof v !== 'object') return;
    tg[cle] = Object.values(v).reduce((s, x) => s + num(x), 0);
    Store.save(); render();
    toast(`${ASSET_CLASSES[cle]} · ${trad('une seule cible,')} ${tg[cle]} %`);
  },

  async 'ajouter-classe-cible'() {
    const cibles = Store.state.targets;
    const tg = cibles.classes || (cibles.classes = {});
    const r = rebalanceRows();
    const visibles = r.classes.map(c => c.cle.split('.')[1]);
    const sorties = r.exclues.map(x => x.cle);
    const libres = Object.entries(ASSET_CLASSES)
      .filter(([k]) => !visibles.includes(k))
      .map(([k, label]) => [k, sorties.includes(k)
        ? `${label} ${trad('(sortie, à remettre)')}` : label]);
    if (!libres.length) { toast(trad('Toutes les classes sont déjà suivies')); return; }
    const somme = sommeCibles();
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
  'sort-jour'(btn) {
    const key = btn.dataset.key;
    if (!jourSort || jourSort.key !== key) jourSort = { key, dir: 'desc' };
    else if (jourSort.dir === 'desc') jourSort = { key, dir: 'asc' };
    else jourSort = null;                      // 3e clic : retour à l'ordre naturel
    render();
  },
  'sort-positions'(th) {
    const key = th.dataset.key;
    if (!posSort || posSort.key !== key) posSort = { key, dir: 'desc' };
    else if (posSort.dir === 'desc') posSort = { key, dir: 'asc' };
    else posSort = null;                       // 3e clic : retour à l'ordre de saisie
    render();
  },
  async 'charger-demo'() {
    if (modeDemo()) return;
    if (!await askConfirm(trad('Voir la démonstration ?') + '\n\n'
      + trad('Tes données ne sont pas touchées : elles restent enregistrées de leur côté, '
      + 'et tu les retrouves en quittant le mode. Rien ne part en ligne pendant ce temps.'),
      { ok: 'Charger la démonstration' })) return;
    setModeDemo(true);
    Store.state = structuredClone(SEED);
    Store.migrate();
    Store.save();
    render();
    toast(trad('Démonstration chargée, tes données sont en sécurité'));
  },

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
        { cle: 'type', label: 'Type', type: 'texte', valeur: trad(mot.titre), lecture: true,
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

      if (!t.interne && !t.sansEtab) {
        const mot = contenantDuType(c.type);
        const compatibles = ETABS().filter(e => e.id === c.etabId
          || !COMPTES().some(x => x.etabId === e.id)
          || contenantDeLEtab(e.id).titre === mot.titre);
        champs.push({ cle: 'etab', label: trad(mot.titre), type: 'liste',
          options: [...compatibles.map(e => [e.id, e.nom]), ['__nouveau', `+ ${trad(mot.nouveau)}…`]],
          valeur: valeur('etab', c.etabId || compatibles[0]?.id || '__nouveau'),
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

      if (c.statut === 'archive') champs.push(
        { cle: 'clotureLe', label: trad('Date de clôture'), type: 'date',
          valeur: valeur('clotureLe', c.clotureLe || ''),
          aide: trad('facultative, elle situe le compte dans le temps') });

      const v = await askForm({ titre: `${trad('Modifier le')} ${motCompte(typeCompte(c.type))}`, sous: nomCompteV2(c),
                                champs, ok: 'Enregistrer' });
      if (!v) return;

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
  'compte-vue'(btn) {
    retourHaptique();
    tapeSousOnglets = true;
    compteVue = btn.dataset.vue;
    render();
  },
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
  'plier-tout'() {
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
     d'ouverture d'une enveloppe a seuil est demandée ici, parce qu'elle donne
     l'anciennete que sa fiche affiche. Elle ne commande aucune disponibilite :
     ces seuils sont fiscaux, et `mobilisabilite()` ne lit aucune date. */
  /* `data-etab` : depuis la fiche d'un établissement, le contenant est déjà
     connu. On saute l'étape 2 plutôt que de faire rechoisir son établissement
     à quelqu'un qui est justement sur la page de cet établissement. */
  async 'ajouter-compte'(btn) {
    const etabImpose = btn?.dataset?.etab && etabById(btn.dataset.etab) ? btn.dataset.etab : null;
    let etapes = etabImpose ? 2 : 3;
    const e1 = await askForm({
      titre: trad('Qu’ajoutes-tu ?'),
      sous: `${trad('Étape')} 1 ${trad('sur.etape', 'sur')} ${etapes}${etabImpose
        ? `, ${trad('chez')} ${etabById(etabImpose).nom}`
        : `, ${trad('cela détermine les placements possibles')}`}`,
      ok: 'Continuer',
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

    /*       `sansEtab` porte deja cette propriete sur le type — les especes s'en
       servent — mais l'assistant ne la lisait pas : il n'avait jamais eu a le
       faire, les especes etant posees par le code et non par ce formulaire.
       L'etape saute, et le compte se cree sans contenant. */
    let etabId = etabImpose;
    let nomNouveauContenant = null;      // cree apres le dernier ecran, pas avant
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
      const e2 = await askForm({
        titre: trad(mot.titre),
        sous: `${trad('Étape')} 2 ${trad('sur.etape', 'sur')} ${etapes}`,
        ok: 'Continuer',
        champs: [{ cle: 'etab', label: mot.question, type: 'liste', aide: mot.aide,
          options: [...proposables.map(e => [e.id,
            aDesComptes(e) ? e.nom : `${e.nom} (aucun compte)`]),
            ['__nouveau', `+ ${trad(mot.nouveau)}…`]],
          valeur: proposables.find(e => aDesComptes(e) && memeFamille(e))?.id || '__nouveau' }],
      });
      if (!e2) return;
      etabId = e2.etab;
    }
    if (etabId === '__nouveau') {
      const nom = await askText(trad(mot.nouveau),
        trad('Son nom, tel qu’il s’affichera partout.'), trad(mot.exemple));
      if (!nom) return;
      nomNouveauContenant = nom;
      etabId = null;
    }

    const bien = estUnBien(t);
    const classeDuBien = t.classes.find(c => c !== 'liquidites') || 'nonCote';

    const e3 = await askForm({
      titre: bien ? (estDetenuEnDirect(t) ? 'Valeur estimée'
                  : `Valeur ${t.classes.includes('nonCote') ? 'de la participation' : 'du bien'}`)
                  : t.sansCash ? trad('Nommer le contrat')
                  : `${BASES.liquidites.nom} ${trad('sur ce compte')}`,
      sous: `${trad('Étape')} ${etapes} ${trad('sur.etape', 'sur')} ${etapes}${bien
        ? `, ${trad('la plus-value se calcule sur ces deux montants')}`
        : t.sansCash ? `, ${trad('sa valeur viendra des supports que tu y ajouteras')}` : ''}`,
      ok: 'Créer',
      champs: bien ? [
        ...(t.sansEtab ? [{ cle: 'nom', label: trad('Nom du bien'), type: 'texte', requis: true,
          max: NOM_LIGNE_MAX, exemple: 'ex. Rolex Submariner',
          aide: trad('une montre, une voiture, un tableau : ce nom s’affichera partout') }] : []),
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
        ...(classeDuBien === 'immobilier' ? [{ cle: 'usageBien', label: trad('Usage'),
          type: 'liste', options: [['', trad('à préciser')], ...USAGES_BIEN],
          aide: trad('il décide de ce que la fiche te montre : un rendement, ou un coût') }] : []),
        ...(t.sansEtab ? [] : [
        { cle: 'credit', label: trad('Capital restant dû (€)'), type: 'nombre', exemple: '0',
          aide: trad('laisse 0 si c’est payé, sinon la dette se déduit du patrimoine net') },
        { cle: 'preteur', label: 'Prêteur', type: 'texte', exemple: 'ex. Crédit Agricole',
          suggestions: valeursConnues('preteur'),
          aide: trad('la banque qui prête, si ce n’est pas toi') },
        { cle: 'mensualite', label: trad('Mensualité (€)'), type: 'nombre', exemple: '0',
          aide: trad('facultatif, mais c’est elle qui entre dans ton budget') },
        { cle: 'taux', label: trad('Taux annuel (%)'), type: 'nombre', exemple: '0',
          aide: trad('facultatif, il sert à suivre le capital qui reste') },
        { cle: 'tauxAssurance', label: trad('Taux d’assurance (%)'), type: 'nombre', exemple: '0',
          aide: trad('facultatif, environ 0,3 % du capital emprunte : elle sort de la mensualite sans rembourser') },
        { cle: 'charge', label: trad('Ajouter une charge mensuelle fixe'), type: 'case', valeur: true,
          aide: trad('seulement si tu renseignes une mensualité : elle entrera dans ton ')
              + 'budget sous ce nom' },
        ]),
      ] : [
        { cle: 'libelle', label: trad(t.sansCash ? 'Nom du contrat' : 'Nom du compte'), type: 'texte',
          valeur: `${t.label} ${nomContenant()}`.trim(),
          aide: trad(t.sansCash ? 'c’est lui qui distingue deux contrats du même type'
                                : 'c’est lui qui distingue deux comptes du même type') },
        ...(t.sansCash ? [] : [
        { cle: 'montant', label: trad('Montant (€)'), type: 'nombre', exemple: '0' },
        { cle: 'usage', label: trad('À quoi sert cet argent ?'), type: 'liste',
          options: AFFECTATIONS, valeur: t.defaut,
          aide: trad('pré-rempli selon le type de compte, modifiable librement') },
        { cle: 'scinder', label: trad('Scinder : déclarer un second usage'), type: 'case',
          aide: trad('deux usages sur le même compte, sans le dupliquer') },
        ]),
        ...(t.dateSensible ? [{ cle: 'ouvertLe', label: trad('Date d’ouverture'), type: 'date',
          aide: trad('elle donne l’ancienneté, que la fiche affiche : cinq ans pour un PEA, huit pour une assurance-vie') }] : []),
      ],
    });
    if (!e3) return;

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
      if (num(e3.credit)) {
        const et = etabById(etabId);
        et.dettes = et.dettes || [];
        et.dettes.push({ id: 'd' + Date.now().toString(36),
          libelle: `${trad('Crédit')} ${nomContenant()}`.trim(),
          montant: num(e3.credit), preteur: e3.preteur || '', note: '',
          mensualite: num(e3.mensualite) || null, taux: num(e3.taux) || null,
          tauxAssurance: num(e3.tauxAssurance) || null,
          verifieLe: todayISO() });
        /* La charge fixe dans le meme geste : c'est le seul moment ou l'on a la
           mensualite en tete. `creerChargeDuCredit()` ne fait rien sans elle. */
        if (e3.charge) creerChargeDuCredit(et.dettes[et.dettes.length - 1]);
      }
    } else if (t.sansCash) {
      /* Un contrat nait sans part de cash. L'etape 3 ne pose plus les trois
         champs pour ces types-la, mais la creation les lisait quand meme : elle
         ecrivait une part a zero portant une affectation `undefined`. La carte
         de tresorerie, qui ne se masque que lorsqu'elle est vide, reapparaissait
         donc aussitot avec son menu — « Cash disponible » sur une assurance-vie,
         exactement ce que `sansCash` devait retirer. Ne rien ecrire est la seule
         facon de ne rien montrer. */
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
    const swipe = btn.closest?.('.cpt-swipe');
    if (swipe?.classList.contains('ouvert')) {
      swipe.classList.remove('ouvert');
      swipe.querySelector('.cpt-ligne').style.transform = '';
      return;
    }
    location.hash = '#/compte/' + encodeURIComponent(btn.dataset.id);
  },
  'fiche-etab'(btn) { location.hash = '#/etab/' + encodeURIComponent(btn.dataset.id); },

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
    if (v.clotureLe) c.clotureLe = v.clotureLe; else delete c.clotureLe;
    refreshAccounts(); Store.save(); render();
    toast(`${guill(nomCompteV2(c))} ${trad('archivé')}${v.clotureLe ? ` ${trad('au')} ${fmtDate(v.clotureLe)}` : ''}`);
  },
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

  async 'ajouter-loyer'(btn) {
    const c = compteById(btn.dataset.id);
    if (!c) return;
    const v = await askForm({
      titre: `Loyer de ${nomCompteV2(c)}`,
      /* La convention du loyer, et il n'y en a qu'une : le loyer du logement
         AVANT les depenses du proprietaire. Le texte disait « charges deduites si
         tu les paies », or `cashFlowBien()` retranche ensuite les charges
         rattachees au bien : qui avait compris « net de charges » les voyait
         retirees deux fois, et son cash-flow tombait de 900 a 800 EUR.

         Les montants deja saisis ne sont pas touches : personne ne peut savoir
         comment un ancien texte a ete lu. Seule la convention des saisies a venir
         change, et l'aide le dit. */
      sous: trad('Le loyer hors charges récupérables. Les charges du propriétaire se déclarent séparément et sont déduites une seule fois'),
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

  async 'ajouter-charge-bien'(btn) {
    const c = compteById(btn.dataset.id);
    if (!c) return;
    const proposes = chargesProposees(c);
    const v = await askForm({
      titre: trad('Charge de {v}').replace('{v}', nomCompteV2(c)),
      sous: trad('Le montant se saisit tel qu’il est facturé, le budget ramène au mois'),
      ok: 'Ajouter',
      champs: [
        { cle: 'label', label: 'Poste', type: 'texte', requis: true, max: NOM_LIGNE_MAX,
          exemple: trad('ex. {v}').replace('{v}', trad(proposes[0][0])),
          suggestions: [...proposes.map(([l]) => l), ...valeursConnues('posteBien')]
            .filter((l, i, t) => t.findIndex(x => x.toLowerCase() === l.toLowerCase()) === i) },
        { cle: 'amount', label: 'Montant', type: 'nombre', exemple: '0' },
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
      titre: trad('Crédit chez {e}').replace('{e}', e.nom),
      sous: trad('Il pèse en négatif sur le patrimoine net'),
      ok: 'Ajouter',
      champs: [
        { cle: 'libelle', label: 'Intitulé', type: 'texte', requis: true, max: NOM_LIGNE_MAX, exemple: 'ex. Prêt immobilier' },
        { cle: 'montant', label: trad('Capital restant dû (€)'), type: 'nombre', exemple: '0' },
        { cle: 'initial', label: trad('Capital emprunté au départ (€)'), type: 'nombre', exemple: '0',
          aide: trad('facultatif, sert à mesurer ce qui est déjà remboursé') },
        { cle: 'mensualite', label: trad('Mensualité (€)'), type: 'nombre', exemple: '0', aide: trad('facultatif') },
        { cle: 'taux', label: trad('Taux annuel (%)'), type: 'nombre', exemple: '0',
          aide: trad('facultatif, noté pour mémoire') },
        { cle: 'tauxAssurance', label: trad('Taux d’assurance (%)'), type: 'nombre', exemple: '0',
          aide: trad('facultatif, environ 0,3 % du capital emprunte : elle sort de la mensualite sans rembourser') },
        { cle: 'preteur', label: 'Prêteur', type: 'texte', exemple: 'ex. Crédit Agricole',
          suggestions: valeursConnues('preteur') },
        { cle: 'charge', label: trad('Ajouter une charge mensuelle fixe'), type: 'case', valeur: true,
          aide: trad('seulement si tu renseignes une mensualité : elle entrera dans ton ')
              + 'budget sous ce nom, et suivra le capital restant dû' },
      ],
    });
    if (!v) return;
    e.dettes = e.dettes || [];
    e.dettes.push({ id: 'd' + Date.now(),
      libelle: v.libelle, montant: num(v.montant), initial: num(v.initial) || null,
      mensualite: num(v.mensualite) || null, taux: num(v.taux) || null,
      tauxAssurance: num(v.tauxAssurance) || null,
      preteur: v.preteur || '', note: '', verifieLe: todayISO() });
    Store.save(); render();
    const posee = v.charge && creerChargeDuCredit(e.dettes[e.dettes.length - 1]);
    if (posee) { Store.save(); render(); }
    toast(posee
      ? `${trad('Crédit')} ${guill(v.libelle)} ${trad('ajouté, et sa charge de')} `
        + `${fmtEUR0(num(v.mensualite))} ${trad('/ mois')}`
      : `${trad('Crédit')} ${guill(v.libelle)} ${trad('ajouté')}`);
  },

  async 'editer-credit'(btn) {
    const e = etabById(btn.dataset.etab);
    const i = +btn.dataset.i;
    const d = e && (e.dettes || [])[i];
    if (!d) return;
    const siens = COMPTES().filter(c => c.etabId === e.id && c.statut !== 'archive');
    const autres = (e.dettes || []).length - 1;
    const lien = chargeDuCredit(d.id);
    const v = await askForm({
      titre: d.libelle || 'Crédit',
      sous: [trad('chez {e}').replace('{e}', e.nom),
        lien ? trad('remboursé par {c}, {v} par mois')
          .replace('{c}', guill(lien.charge.label || trad('charge fixe')))
          .replace('{v}', fmtEUR0(chargeMensuelle(lien.charge))) : '',
        siens.length ? `${siens.map(c => nomCompteV2(c)).join(', ')} · ${fmtEUR0(
          siens.reduce((s, c) => s + valeurCompte(c), 0))}` : trad('aucun compte rattaché'),
        autres > 0 ? trad(autres > 1 ? '{n} autres crédits ici' : '{n} autre crédit ici')
          .replace('{n}', autres) : '',
      ].filter(Boolean).join(' · '),
      ok: 'Enregistrer',
      champs: [
        { cle: 'montant', label: trad('Capital restant dû (€)'), type: 'nombre', valeur: num(d.montant),
          aide: (() => {
            const pr = projectionCredit(d);
            if (pr.projete == null || pr.ecart < 1) {
              return 'le premier champ : c’est celui qu’on vient corriger';
            }
            return trad('d’après ta mensualité, {v} après {n} mois : à recopier si tu '
              + 'n’as rien remboursé par avance')
              .replace('{v}', fmtEUR0(pr.projete)).replace('{n}', pr.moisDepuis);
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
        { cle: 'tauxAssurance', label: trad('Taux d’assurance (%)'), type: 'nombre',
          valeur: num(d.tauxAssurance) || '', aide: trad('facultatif, environ 0,3 % du capital emprunte : elle sort de la mensualite sans rembourser') },
        { cle: 'preteur', label: 'Prêteur', type: 'texte', valeur: d.preteur || '',
          exemple: 'ex. Crédit Agricole', suggestions: valeursConnues('preteur') },
        ...(lien ? [] : [{ cle: 'charge', label: trad('Ajouter une charge mensuelle fixe'),
          type: 'case', valeur: true,
          aide: trad('seulement si une mensualité est renseignée : elle entrera dans ton ')
              + 'budget sous ce nom, et suivra le capital restant dû' }]),
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
    d.verifieLe = todayISO();
    d.initial = num(v.initial) || null;
    if (v.mensualite !== undefined) d.mensualite = num(v.mensualite) || null;
    d.taux = num(v.taux) || null;
    d.tauxAssurance = num(v.tauxAssurance) || null;
    d.preteur = v.preteur || '';
    Store.save(); render();
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

  'history-year'(btn) {
    if (btn.dataset.year === String(historyYear)) return;
    historyYear = btn.dataset.year;
    relanceGraphes = true;
    render();
  },
  'proj-use-budget'() {
    const m = suggestedMonthly();
    Store.state.meta.projMonthly = m;
    Store.save(); render();
    toast(`${trad('Versement mensuel réglé sur')} ${fmtEUR0(m)}`);
  },
  'evo-range'(btn) { evoRange = btn.dataset.range; render(); },
  /* Le perimetre de la courbe. Il ne touche a rien d'autre : le grand chiffre,
     la repartition et les autres cartes lisent le patrimoine complet, et c'est
     voulu — voir `evoFinancier`.

     `evo-base` vivait ici, jumeau de `hero-base` : deux commandes pour une seule
     variable. Elle est partie avec la bascule Net / Brut du graphique. */
  'evo-perimetre'(btn) {
    const voulu = btn.dataset.perimetre === 'financier';
    if (voulu === evoFinancier) return;
    evoFinancier = voulu;
    evoTransition = true;
    render();
  },
  'alloc-base'(btn) {
    const voulu = btn.dataset.base === 'financier';
    if (voulu === allocFinancier) return;
    allocFinancier = voulu;
    allocTransition = true;
    relanceGraphes = true;
    render();
  },
  'proj-scenario'(btn) {
    /* La case « Personnalise » n'applique rien : elle ouvre le depliant, et
       c'est tout. Lui faire enregistrer `projScenario = 'perso'` aurait fige les
       taux du scenario en cours sous un autre nom, sans qu'un seul chiffre
       change a l'ecran — un etat qui ne veut rien dire, et un pave enfonce que
       l'utilisateur n'a pas choisi. Le preset reconnu reste donc allume jusqu'a
       ce qu'une hypothese bouge vraiment.

       Le depliant ne se referme jamais ici : deja ouvert, il le reste. */
    if (btn.dataset.scenario === 'perso') {
      hypoOuvert = true;
      avanceOuvert = true;
      render();
      /* `nearest` ne bouge la page que si le depliant n'est pas deja visible :
         sur ordinateur il est juste sous les paves, et faire sauter l'ecran pour
         rien serait pire que ne rien faire. */
      $('#hypoAvance')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    Store.state.meta.projScenario = btn.dataset.scenario;
    Store.save(); render();
  },
  /* Le seul commutateur Net / Brut de la page, et il la gouverne entière : le
     grand chiffre, la répartition qui le décompose, et la courbe plus bas. Son
     jumeau `evo-base` vivait sur le graphique, sur la même variable ; il est
     parti, la courbe hérite. */
  'hero-base'(btn) {
    const voulu = !!btn.dataset.net;
    if (voulu === evoNet) return;
    evoNet = voulu;
    evoTransition = true;
    relanceGraphes = true;
    render();
  },
  /* On change d'adresse, pas d'état : `hashchange` déclenche le rendu, et le
     bouton retour du navigateur ramène au sous-onglet précédent. */
  'taire-rappel'(btn) {
    const genre = btn.dataset.genre;
    const p = genre === 'depenses' ? depensesEnAttente() : currentMonthPending();
    masquerRappel(genre, p.key);
    Store.save();
    render();
    toast(`${trad('Rappel de')} ${p.label} ${trad('masqué jusqu’au mois prochain')}`);
  },

  'reporter-rappel'(btn) {
    const genre = btn.dataset.genre;
    const p = genre === 'depenses' ? depensesEnAttente() : currentMonthPending();
    const quand = reporterRappel(genre);
    Store.save();
    render();
    toast(`${trad('Rappel de')} ${p.label} ${trad('repoussé au')} ${fmtJourMois(quand)}`);
  },

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
  'toggle-revenus'() { fenetreRevenus(); },
  'revenu-estime'(el) {
    const r = B().income[+el.dataset.i];
    if (!r) return;
    r.estime = !!el.checked;
    Store.save();
    fenetreRevenus();
    render();
  },
  /* Le journal n'a plus de borne propre : elle est celle de la page, et le menu
     des annees a rejoint les crans de la plage. `sales-year` est parti avec. */
  'open-sale'(btn) { openApercu('vente', btn.dataset.i); },
  'tri-ventes'(btn) { triVentes = btn.dataset.tri; render(); },

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
      v.gross = round2(num(saisi.gross));
      v.realised = round2(num(saisi.realised));
      v.invested = round2(v.gross - v.realised);
    }
    Store.save(); render();
    toast(trad('Vente modifiée'));
  },
  async 'open-position'(btn) {
    const i = +btn.dataset.i;
    const suite = await askPosition(i);
    Store.save(); render();
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
  async 'sans-distinction'() {
    const fait = await nePlusDetaillerPartout();
    if (!fait) { render(); return; }
    render();
    toast(`${trad('Une seule case à remplir :')} ${guill(fait.garde)}`);
  },
  'reprendre-detail'() {
    const fait = remettreLeDetail();
    if (!fait.categories && !fait.mois) return;
    render();
    toast(phraseRetourDetail(fait));
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
  /* « add-expense-month » est partie avec son bouton : elle ouvrait douze lignes
     vides pour l'annee suivante, et une annee doit apparaitre quand des donnees
     existent, non parce qu'on a appuye. Les mois se creent a la demande, la ou
     l'on saisit -- « saisir-mois-courant » et « saisir-mois-en-attente » posent
     la ligne du mois vise si le calendrier ne la porte pas.
     Une action sans bouton pour l'appeler est du code mort, et le balayage de
     verification cherche justement les `data-action` qui ne menent a rien. */
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
  async 'ajouter-apport'(btn) {
    const sortie = btn?.dataset.sens === 'sortie';
    const v = await askForm({
      titre: sortie ? 'Dépense exceptionnelle' : 'Entrée exceptionnelle',
      sous: sortie
        ? 'De l’argent parti une fois : une voiture, des travaux, un voyage'
        : 'De l’argent reçu une fois : héritage, prime, vente d’un bien',
      champs: [
        { cle: 'libelle', label: trad('De quoi s’agit-il ?'), type: 'texte', requis: true,
          exemple: sortie ? 'ex. Voiture' : 'ex. Succession' },
        { cle: 'montant', label: sortie ? 'Montant dépensé (€)' : 'Montant reçu (€)',
          type: 'nombre', requis: true, exemple: '0' },
        { cle: 'date', label: 'Date', type: 'date', valeur: todayISO(),
          requis: true, mois: true,
          aide: sortie ? 'elle situe la dépense dans ton historique'
                       : 'elle situe l’entrée dans ton historique' },
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
    const etaitSortie = num(a.montant) < 0;
    const v = await askForm({
      titre: a.libelle || (etaitSortie ? 'Dépense exceptionnelle' : 'Entrée exceptionnelle'),
      sous: trad('Ces montants ne bougent aucun solde : ils disent d’où vient l’argent, ou où il est parti'),
      ok: 'Enregistrer',
      champs: [
        { cle: 'libelle', label: trad('De quoi s’agit-il ?'), type: 'texte', requis: true,
          valeur: a.libelle || '' },
        { cle: 'sens', label: 'Nature', type: 'liste',
          options: [['entree', 'Entrée, de l’argent reçu'], ['sortie', 'Dépense, de l’argent parti']],
          valeur: etaitSortie ? 'sortie' : 'entree' },
        { cle: 'montant', label: trad('Montant (€)'), type: 'nombre', requis: true,
          valeur: Math.abs(num(a.montant)) },
        { cle: 'date', label: 'Date', type: 'date', requis: true, mois: true,
          valeur: a.date || '' },
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

  async 'edit-charge'(btn) {
    const i = +btn.dataset.i;
    const c = Store.state.budget.fixedCharges[i];
    if (!c) return;
    const gens = contributors();
    const v = await askForm({
      titre: c.label || 'Charge fixe',
      sous: chargePeriode(c) === 'mois'
        ? 'Le montant se saisit tel qu’il est facturé'
        : trad('Facturée {p}, soit {v} par mois dans le budget')
            .replace('{p}', trad(CHARGE_PERIODE_LABEL[chargePeriode(c)]))
            .replace('{v}', fmtEUR(chargeMensuelle(c))),
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
      sous: trad('Le montant perçu chaque mois, avant les charges que tu déclares à part'),
      champs: [
        { cle: 'label', label: 'Source', type: 'texte', requis: true, exemple: 'ex. Salaire',
          suggestions: valeursConnues('source') },
        { cle: 'amount', label: trad('Montant mensuel (€)'), type: 'nombre', exemple: '0' },
      ],
    });
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

  async 'del-income'(btn) {
    await makeDeleter('income', 'la source de revenu', r => r.label).call(this, btn);
    rafraichirRevenus();
  },

  /* « add-supplement » et « del-supplement » sont partis avec la carte
     « Autres depenses ». Une action sans bouton pour l'appeler est du code
     mort, et le balayage de verification cherche justement des `data-action`
     qui ne mènent à rien : autant ne pas lui laisser l'inverse a trouver. */

  /* « add-month » est partie avec le calendrier : elle ouvrait douze lignes
     vides pour l'année suivante, ce qui n'a plus de sens depuis que le journal
     n'affiche que les relevés renseignés — elle n'aurait plus rien ajouté de
     visible. Rien n'en dépendait : `ensureCalendarMonths()` ouvre l'année en
     cours à chaque migration, et « Ajouter un relevé » crée la ligne du mois
     demandé, quelle que soit son année. */
  async 'resolve-row'(btn) {
    const p = Store.state.positions[+btn.dataset.i];
    if (!p) return;
    if (Quotes.isOnline() === null) await Quotes.health();
    if (Quotes.isOnline() === false) {
      toast(trad('Impossible de mettre à jour les cours pour le moment'));
      return;
    }
    if (!isinIsValid(p.isin)) { toast(`${trad('ISIN invalide pour')} ${guill(p.name)}`); return; }
    btn.disabled = true;
    try {
      const r = await Quotes.resolveIsin(p.isin.trim());
      if (r.best && r.best.symbol) {
        p.symbol = r.best.symbol;
        Store.save(); render();
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
      toast(trad('Impossible de mettre à jour les cours pour le moment'));
      return;
    }
    const chip = btn && btn.classList.contains('etat-cours');
    const label = btn && !chip ? btn.textContent : null;
    if (btn) { btn.disabled = true; }
    if (chip) majEtatCours('encours');
    else if (btn) btn.textContent = `↻ ${trad('Récupération…')}`;
    try {
      const { changes, empty } = await Quotes.refresh();
      /* Les lignes dont le cours a REELLEMENT bouge, avant le rendu qui les
         affiche. `changes` porte deja le `from` et le `to` de chaque ligne : la
         donnee existait, elle etait jetee. Un rafraichissement qui ne change
         rien n'allume donc rien — c'est ce qui separe « ce chiffre est frais »
         d'un appui sur un bouton. */
      coursFraichis = new Set(changes
        .filter(c => !c.error && Math.abs(num(c.to) - num(c.from)) > 1e-9)
        .map(c => c.symbol));
      Quotes.oublierReperes();
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
    const feuilles = [
      sheetPositions(), sheetAllocation(), sheetRebalance(), sheetRoles(),
      ...(rebalanceRoles().base ? [sheetRoleComposition()] : []),
      sheetAccounts(), sheetHistory(),
      ...((Store.state.sales || []).length ? [sheetSales()] : []),
      sheetExpenses(),
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

  'voir-releve'(btn) {
    openApercu('releveMois', btn.dataset.i);
  },

  async 'edit-month'(btn) {
    await askMonthlySnapshot(+btn.dataset.i);
  },

  async 'ajouter-releve'() {
    await askMonthlySnapshot(indexReleve(currentMonthKey()));
  },
};

const MOUNTS = {
  overview: () => sousOngletActif.overview === 'projection' ? mountObjective() : mountOverview(),
  positions: () => sousOngletActif.positions === 'cible' ? mountRebalance() : mountPositions(),
  allocation: mountAllocation,
  /* Les préférences n'ont rien à monter : leurs réglages passent tous par
     `data-path` et `data-action`, câblés une fois pour toute l'application. */
  data: () => { if (sousOngletActif.data !== 'preferences') mountData(); },
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
  const red = REDIRECTIONS[v];
  if (red) { sousOngletActif[red[1]] = red[2]; return red[0]; }
  if (SOUS_ONGLETS[v]) sousOngletActif[v] = SOUS_ONGLETS[v][0][0];
  return VIEWS[v] ? v : 'overview';
}

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
  const total = b.income.reduce((s, r) => s + revenuMensuel(r), 0);
  apercuOuvert = null;

  $('#modalTitle').textContent = trad('Revenus');
  $('#modalSub').innerHTML = escMontant(
    `${revenuEstime() ? '≈ ' : ''}${fmtEUR0(total)} ${trad('par mois sur')} ${b.income.length} ${b.income.length > 1 ? trad('sources') : trad('source')}`
    + (revenuEstime() ? trad(', dont des montants estimés') : ''));
  const biens = comptesBiens();
  $('#modalBody').innerHTML = `
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
      if (!v) { champ.focus(); toast(`${titre}${deuxPoints()} ${trad('à remplir')}`); return; }
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
      /* `mois` : sous un champ de date, le mois ecrit en lettres, tenu a jour.
         Une date au format du navigateur ne dit pas a quel mois elle appartient
         sans un calcul de tete, et c'est pourtant la question qu'on se pose en
         datant un mouvement : « ça compte dans quel mois ». Le drapeau est
         explicite, champ par champ : toutes les dates de l'application n'ont
         pas cette question. */
      return `<div class="field">
        <label for="${id}">${esc(trad(c.label))}${c.aide ? `<span class="sub">${esc(trad(c.aide))}</span>` : ''}</label>
        ${saisie}
        ${c.mois ? `<span class="hint" id="${id}_mois"></span>` : ''}
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

    for (const c of champs.filter(x => x.mois && x.type === 'date')) {
      const champ = $(`#f_${c.cle}`), miroir = $(`#f_${c.cle}_mois`);
      if (!champ || !miroir) continue;
      const maj = () => {
        miroir.textContent = champ.value
          ? `${trad('Compté dans')} ${fmtMoisAn(champ.value)}`
          : trad('Sans date, ce mouvement ne compte dans aucun mois.');
      };
      champ.addEventListener('input', maj);
      champ.addEventListener('change', maj);
      maj();
    }

    const premier = $('#modalBody').querySelector('input, select');
    focusChamp(premier);

    const fermer = v => {
      masquerModal(m);      $('#modalClose').onclick = null;
      m.onkeydown = null;
      resolve(v);
    };
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
      /* Ce qu'est un champ vide, par type. `String(0).trim()` vaut « 0 », donc
         non vide : un montant declare obligatoire passait la garde a zero, et
         la ligne s'enregistrait sans montant. Zero reste une valeur legitime
         partout ailleurs -- un versement mensuel a zero est un choix -- c'est
         `requis` qui decide, jamais le type tout seul. */
      const vide = c => {
        const v = out[c.cle];
        if (c.type === 'nombre') return !num(v);
        if (c.type === 'case') return !v;
        return !String(v ?? '').trim();
      };
      const manquant = efface ? null : champs.find(c => c.requis && vide(c));
      if (manquant) { $(`#f_${manquant.cle}`).focus(); toast(`${manquant.label}${deuxPoints()} ${trad('à remplir')}`); return; }
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
  /* `ponct()` retire l'espace avant un « ? » en anglais : la question se compose
     d'un morceau traduit et du signe, ecrit dans le gabarit, donc hors de la clef. */
  const [titre, ...suite] = ponct(String(texte)).split('\n');
  const message = suite.join('\n').trim();
  return new Promise(resolve => {
    const m = $('#confirm'), oui = $('#confirmYes'), non = $('#confirmNo');
    $('#confirmTitle').textContent = titre;
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

function askSale(indexInitial) {
  return new Promise(resolve => {
    const m = $('#modal');
    apercuOuvert = null;
    const ps = Store.state.positions;
    const sansLigne = !ps.length;

    $('#modalTitle').textContent = trad('Vendre une ligne');
    $('#modalSub').textContent = trad('La plus-value est calculée sur ton prix de revient');
    $('#modalBody').innerHTML = `
      <div class="modal-champs">
        <div class="field"><label>${trad('Ligne')}</label>
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
          <span class="hint" id="veDev"></span>
          <span class="hint" id="veVieux" hidden></span></div>
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
      const cibles = cashTargets();
      const defaut = defaultCashTarget(p.account);
      $('#veCash').innerHTML = cibles.map(c =>
        `<option value="${c.id}" ${c.id === defaut ? 'selected' : ''}>${esc(sousNom('', nomCompteV2(c), nomEtabDe(c)))}</option>`).join('')
        + `<option value="">${trad('Ne rien créditer')}</option>`;
      majApercuVente();
      avisCoursDuJour();
    };

    const majApercuVente = () => {
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
    const avisCoursDuJour = () => {
      const avis = $('#veVieux');
      if (!avis) return;
      const p = ps[+sel.value];
      const recule = !passee() && $('#veDate').value && $('#veDate').value < todayISO();
      if (!recule || !p) { avis.hidden = true; return; }
      const auJour = num(p.price);
      const saisi = num(prix.value);
      avis.hidden = false;
      avis.textContent = Math.abs(saisi - auJour) < 1e-9
        ? `${trad('C’est le cours d’aujourd’hui, pas celui de cette date. Corrige-le, ou choisis « une vente passée » : elle demande le montant encaissé, qui ne vieillit pas.')}`
        : trad('Prix saisi à la main : l’application ne le compare plus au cours du jour.');
    };
    for (const el of [qte, prix, fx, $('#vePasNom'), $('#vePasGross'), $('#vePasPnl')])
      el.oninput = () => { majApercuVente(); avisCoursDuJour(); };
    $('#veDate').oninput = avisCoursDuJour;
    chargerLigne();
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

function askPosition(index) {
  return new Promise(resolve => {
    const p = Store.state.positions[index];
    if (!p) { resolve(null); return; }
    const dev = p.currency || 'EUR';
    const m = $('#modal');
    apercuOuvert = null;

    const ligne = (label, valeur, classe) =>
      `<dt>${label}</dt><dd class="${classe || ''}">${valeur}</dd>`;

    /* `data-differe` : rien de ce qui est saisi ici n'entre dans l'etat avant
       « Enregistrer ». Voir l'ecouteur des champs, plus bas dans ce fichier. */
    $('#modalBody').dataset.differe = 'propre';

    /* Toute la fiche se repeint d'un seul geste, et aucun chiffre ne se
       rafraichit a la main.

       « Enregistrer » ne reprenait que deux noeuds, le montant en tete et le
       total investi. Corriger un prix de revient laissait donc la plus-value,
       sa part du portefeuille et l'ecart du jour sur les anciens chiffres, dans
       la meme fenetre et a quelques lignes d'ecart. La fiche se contredisait
       elle-meme, et c'est justement le chiffre corrige qu'on venait relire :
       deux nombres repeints sur cinq, c'est une liste recopiee a la main.

       L'en-tete en est aussi : le nom et le compte se modifient ici, et le titre
       comme le sous-titre les portent. `brancher()` repose les commandes du
       corps, qui partent avec l'ancien balisage ; celles du pied survivent, le
       pied n'etant pas repeint. */
    const peindre = () => {
      const jour = posDayChange(p);
      const marche = marketStatus(p);
      const compte = ACC[p.account];
      $('#modalTitle').textContent = p.name || 'Ligne sans nom';
      $('#modalSub').textContent = [compte?.label, ASSET_CLASSES[assetClassDe(p)],
                                    ROLES[roleDe(p)], dev].filter(Boolean).join(' · ');
      $('#modalBody').innerHTML = `
      <div class="modal-total">
        <b>${fmtEUR(posValue(p))}</b>
        <span>${num(p.qty)} × ${fmtCur(p.price, dev)}${dev !== 'EUR' ? ` · change ${round4(num(p.fx) || 1)}` : ''}</span>
      </div>

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
      <dl class="kv kv-texte">
        ${ligne(trad('Nature'), p.kind ? esc(TYPES[p.kind] || p.kind)
          : `<span class="muted">${trad('inconnue, le cours ne l’a pas dit')}</span>`)}
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
        ${jour && !jour.depuisAchat ? ligne(trad('Aujourd’hui'), jour.horsSeance
            ? `<span class="muted">${trad('hors séance')}</span>`
              + (num(p.quoteTime) ? ` <span class="muted">${trad('cours')} ${esc(fmtCoursQuand(p.quoteTime))}</span>` : '')
            : `<span class="${cls(jour.eur)}">${fmtSignedPct(jour.pct, 2)}</span>`
              + ` <span class="muted">${fmtSigned(jour.eur)}</span>`) : ''}
        ${ligne(`${trad('Plus / moins-value')}${jour?.depuisAchat
            ? `<span class="sub">${trad('achetée aujourd’hui : c’est aussi ton résultat du jour')}</span>` : ''}`,
            `<span class="${cls(posPerfEur(p))}">${fmtSignedPct(posPerfPct(p), 2)}</span>`
            + ` <span class="muted">${fmtSigned(posPerfEur(p))}</span>`)}
        ${jour && num(jour.prev) ? ligne(trad('Clôture de la veille'), fmtCur(jour.prev, dev)) : ''}
        ${num(p.dayLow) && num(p.dayHigh)
          ? ligne(trad('Séance'), `${fmtCur(p.dayLow, dev)} <span class="muted">${trad('à')}</span> ${fmtCur(p.dayHigh, dev)}`) : ''}
        ${num(p.volume) ? ligne(trad('Volume du jour'), num(p.volume).toLocaleString(locale()) + ' ' + trad('titres')) : ''}
        ${ligne(`${trad('Part du portefeuille')}${aide(trad('Calculé sur la valeur totale de ton portefeuille Marchés, cash à investir inclus. Le même calcul que la colonne « Poids » de la carte du jour et que le tableau des lignes.'))}`,
            fmtPct(poidsPortefeuille(posValue(p)), 2))}
      </dl>

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
        <div class="field"><label>${trad('Rôle')}</label>
          <select data-path="positions.${index}.role">
            ${OPTIONS_ROLE.map(([v, l]) => `<option value="${v}" ${v === roleDe(p) ? 'selected' : ''}>${esc(trad(l))}</option>`).join('')}
          </select></div>

        <div class="field"><label>${trad('Cours')} (${esc(dev)})</label>
          <input type="number" step="any" data-path="positions.${index}.price" value="${p.price ?? ''}"></div>
        <div class="field"><label>${trad('Valeur')}${aide(trad("Par défaut, la valeur d’une ligne est quantité × cours, et le cours se rafraîchit tout seul. « Saisie à la main » sert aux lignes qu’aucune place ne cote : une part de société, un contrat, un actif que tu valorises toi-même. Le cours cesse alors d’être interrogé."))}</label>
          <select data-path="positions.${index}.manual" data-type="bool">
            <option value="false" ${p.manual ? '' : 'selected'}>${trad('Calculée, quantité × cours')}</option>
            <option value="true" ${p.manual ? 'selected' : ''}>${trad('Saisie à la main')}</option>
          </select></div>
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
          <input data-path="positions.${index}.symbol" value="${esc(p.symbol || '')}"
                 maxlength="12" style="text-transform:uppercase"></div>
      </div>

      <div class="fiche-danger">
        <button type="button" class="btn ghost danger" id="posDelete">${trad('Supprimer cette ligne')}</button>
        <p class="hint">${trad('Elle quitte le portefeuille sans passer par une vente : rien '
          + 'n’est encaissé, et aucune plus-value n’entre au journal. Pour solder en '
          + 'encaissant, c’est « Vendre ».')}</p>
      </div>`;
      brancher();
    };
    peindre();

    $('#modalFoot').innerHTML =
      `<button class="btn ghost" id="posSell" type="button">− ${trad('Vendre')}</button>
       <button class="btn ghost" id="posBuy" type="button">+ ${trad('Acheter')}</button>
       <span class="spacer"></span>
       <button class="btn" id="posSave" type="button">${trad('Enregistrer')}</button>
       <button class="btn ghost" id="posOk" type="button">${trad('Fermer')}</button>`;
    montrerModal(m);

    /* Declaree, et non posee dans un `const` : `peindre()` tourne plus haut et
       appelle `brancher()`, qui a besoin d'elle. Une fonction declaree est
       connue de toute la portee, une constante seulement apres sa ligne. */
    function fermer(v) {
      masquerModal(m);      $('#modalClose').onclick = null;
      resolve(v);
    }
    const propre = () => ($('#modalBody')?.dataset.differe || 'propre') === 'propre';
    const enregistrer = () => {
      /* `appliquerDiffere()` : la meme fonction que les panneaux d'apercu, et la
         meme que l'ecriture a la frappe, appelee une fois pour toutes. Le corps
         de cette fiche en portait sa propre copie, a deux lignes d'ecart. */
      appliquerDiffere();
      Store.save();
      render();                     // la page derriere suit
      const y = $('#modalBody').scrollTop;
      peindre();
      $('#modalBody').scrollTop = y;
      toast(trad('Ligne enregistrée'));
    };
    $('#posSave').onclick = enregistrer;
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
    /* Les deux commandes qui vivent dans le corps de la fiche, et non dans son
       pied : elles partent a chaque peinture avec le balisage qui les portait,
       donc elles se reposent ici. Declaree pour la meme raison que `fermer`,
       `peindre()` l'appelant plus haut que sa definition. */
    function brancher() {
      $('#posDelete').onclick = async () => {
        const ok = await askConfirm(`${trad('Supprimer')} ${guill(p.name || trad('cette ligne'))} ?\n`
          + `${num(p.qty)} × ${fmtCur(p.price, dev)}, ${trad('soit')} ${fmtEUR(posValue(p))}.\n\n`
          + trad('La ligne quitte le portefeuille sans vente : ni encaissement, ni '
          + "plus-value au journal. Réversible avec Ctrl+Z, et une sauvegarde du "
          + "jour existe dans l'onglet Données."), { ok: 'Supprimer', danger: true });
        if (!ok) return;
        fermer({ supprimer: index });
      };

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
          dire(`<b>${esc(code)}</b> ${trad('correspond à')} <b>${esc(best.name || best.symbol)}</b>
                · ${esc(best.symbol)}${best.exchange ? ` · ${esc(best.exchange)}` : ''}.
                ${dejaBon || !p2.symbol ? '' : trad('Ta ligne porte le symbole {s} : si les '
                  + 'deux titres diffèrent, c’est l’un des deux qui est faux.')
                  .replace('{s}', `<b>${esc(p2.symbol)}</b>`)}`,
            dejaBon || !best ? 'up' : '');
        } catch (e) {
          dire(trad('Impossible de joindre la passerelle : {m}. La clé de contrôle, '
                + 'elle, est vérifiée.').replace('{m}', esc(e.message)), 'down');
        }
      };
    }
  });
}

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
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => insererPlus(b.previousElementSibling);
  }
}

function ecrireDepensesMois(index, saisi) {
  const r = Store.state.budget.expenses[index];
  if (!r || !saisi) return null;
  /* `v: null` veut dire « garde ce que l'etat porte » : le retour du decoupage
     vient de le reecrire, et renvoyer la saisie d'avant l'ecraserait. */
  if (saisi.v != null) r.v = saisi.v;
  r.note = saisi.note;
  Store.save();
  return r;
}

async function nePlusDetaillerPartout({ index = null, saisie = null } = {}) {
  const i = index != null ? index
    : Store.state.budget.expenses.findIndex(r => r.month === todayISO().slice(0, 7) + '-01');
  const ligne = i >= 0 ? Store.state.budget.expenses[i] : null;
  const v = saisie ? saisie.v : (ligne ? (ligne.v || {}) : {});
  const montants = Object.keys(v).filter(k => num(v[k]));
  const total = montants.reduce((s, k) => s + num(v[k]), 0);
  const question = `${trad('Ne garder qu’une case à remplir ?')}\n`
    + trad('Une seule case à remplir, ce mois-ci et les suivants.')
    + (montants.length > 1
      ? '\n' + trad('Les {n} montants de ce mois se regroupent sur cette case, soit {v}.')
          .replace('{n}', montants.length).replace('{v}', fmtEUR0(total))
      : '');
  if (!await askConfirm(question, { danger: false, ok: trad('Une seule case') })) return null;
  Store.addBackup('avant regroupement des dépenses');
  const garde = neePlusDetailler();
  /* `regrouperMois` garde le decoupage d'avant sur la ligne, avec son total :
     c'est ce qui permet a « Reprendre le detail » de rendre les montants. */
  if (ligne) regrouperMois(ligne, garde);
  Store.save();
  return { garde, total };
}

function remettreLeDetail() {
  const fait = reprendreLeDetail();
  if (fait.categories || fait.mois) Store.save();
  return fait;
}

function phraseRetourDetail(fait) {
  const cat = `${fait.categories} ${fait.categories > 1
    ? trad('catégories reviennent dans la saisie') : trad('catégorie revient dans la saisie')}`;
  if (!fait.mois) return cat;
  return `${cat}, ${trad('et les montants de')} ${fait.mois} ${fait.mois > 1
    ? trad('mois regroupés') : trad('mois regroupé')}`;
}

function askExpenseMonth(index) {
  return new Promise(resolve => {
    const r = Store.state.budget.expenses[index];
    if (!r) { resolve(null); return; }
    const cats = expenseCategories()
      .filter(c => !categorieRetiree(c) || num(r.v?.[c]));
    const repliees = sansDistinction()
      ? cats.filter(c => categorieRetiree(c) && num(r.v?.[c]))
      : [];
    const ouvertes = cats.filter(c => !repliees.includes(c));
    const cible = num(Store.state.budget.monthlyTarget);
    const m = $('#modal');
    apercuOuvert = null;

    $('#modalTitle').textContent = `${trad('Dépenses de')} ${fmtMonth(r.month)}`;
    $('#modalSub').innerHTML = cible ? `${trad('Objectif mensuel :')} ${fmtEUR0(cible)}` : '';
    $('#modalBody').innerHTML = `
      <div class="dep-total" id="depTotal"></div>
      ${(() => {
        const grille = liste => `
      <div class="dep-grille">
        ${liste.map(c => `
          <div class="field dep-champ" data-champ="${esc(c)}">
            <label class="dep-lab"><span>${esc(c)}</span></label>
            ${champSomme(`<input type="text" inputmode="decimal" data-cat="${esc(c)}"
                   value="${r.v?.[c] ?? ''}" placeholder="" autocomplete="off">`)}
          </div>`).join('')}
      </div>`;
        if (!repliees.length) return grille(ouvertes);
        const somme = repliees.reduce((s, c) => s + num(r.v?.[c]), 0);
        return grille(ouvertes) + `
      <details class="data-view" style="margin-top:12px">
        <summary>${(repliees.length > 1
            ? trad('{n} montants déjà répartis, {v}')
            : trad('{n} montant déjà réparti, {v}'))
          .replace('{n}', repliees.length).replace('{v}', fmtEUR0(somme))}</summary>
        ${grille(repliees)}
      </details>`;
      })()}
      <div class="row" style="margin-top:12px">
        ${sansDistinction() ? ''
          : `<button class="btn sm ghost" id="depNouvelleCat" type="button"
              >${trad('+ Nouvelle catégorie')}</button>`}
        ${sansDistinction()
          ? `<button class="btn sm ghost" id="depRemettreDetail" type="button"
              >${trad('Remettre toutes les catégories')}</button>`
          : `<button class="btn sm ghost" id="depSansDetail" type="button"
              >${trad('Une seule case à remplir')}</button>`}
        ${aide(trad('Plusieurs dépenses dans une catégorie : tape-les additionnées, 100+50+70. '
          + 'Le + du champ écrit le signe, que le pavé numérique n’a pas. Pour suivre deux '
          + 'choses séparément, fais deux catégories.'))}
      </div>
      <div class="field" style="margin-top:12px">
        <label>${trad('Note du mois')}</label>
        <textarea id="depNote" rows="3"
                  placeholder="${trad('Ce qui explique ce mois-là…')}">${esc(r.note || '')}</textarea>
      </div>`;
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
      c.onchange = () => {
        const s = parseSomme(c.value);
        c.value = s ? (s.total || '') : (r.v?.[c.dataset.cat] ?? '');
        majTotal();
      };
    }
    cablerSommePlus($('#modalBody'));
    majTotal();
    focusChamp(champs[0]);

    if ($('#depSansDetail')) $('#depSansDetail').onclick = regrouperCeMois;
    if ($('#depRemettreDetail')) $('#depRemettreDetail').onclick = remettreDetailIci;
    /* Le bouton n'existe pas quand les categories sont desactivees : le garder
       cable sans garde aurait leve sur un `null` au premier rendu du mode
       « une seule case ». Ses deux voisins portaient deja ce garde. */
    if ($('#depNouvelleCat')) $('#depNouvelleCat').onclick = async () => {
      /* La saisie se relève **avant** d'ouvrir la question par-dessus : les
         deux fenêtres partagent le même corps, et `saisie()` cherchait le
         champ de note dans un panneau qu'`askText` venait de remplacer. Elle
         échouait en silence, la fenêtre se fermait et rien ne revenait. */
      const etat = saisie();
      const nom = await askText('Nouvelle catégorie de dépenses',
        'Elle devient une colonne du tableau, vide sur tous les autres mois.', 'ex. Abonnements');
      if (!nom) { fermer({ ...etat, rouvrir: true }); return; }
      if (!addExpenseCategory(nom)) {
        toast(trad('Cette catégorie existe déjà'));
        fermer({ ...etat, rouvrir: true });
        return;
      }
      Store.save();
      fermer({ ...etat, rouvrir: true });
    };

    /* Le geste vit dans `nePlusDetaillerPartout()`, avec celui de la carte :
       deux portes, un seul comportement. Ici on ne fait que lui passer le mois
       ouvert et ce qui y est saisi, puis rouvrir la fenetre sur le resultat.

       Declarees, et non posees dans des constantes : le branchement des boutons
       tourne plus haut que ces lignes, et une constante n'existe pas avant sa
       declaration. Le meme piege que `peindre()` sur la fiche d'une ligne, et il
       casse tout le reste de la fenetre en silence. */
    async function regrouperCeMois() {
      const etat = saisie();
      const fait = await nePlusDetaillerPartout({ index, saisie: etat });
      if (!fait) { fermer({ ...etat, rouvrir: true }); return; }
      fermer({ v: fait.total ? { [fait.garde]: round2(fait.total) } : {},
               note: etat.note, rouvrir: true });
    }

    function remettreDetailIci() {
      const etat = saisie();
      const fait = remettreLeDetail();
      if (fait.categories || fait.mois) toast(phraseRetourDetail(fait));
      fermer({ v: null, note: etat.note, rouvrir: true });
    }

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

    const annulerOuDemander = async () => {
      if (!sale()) { fermer(null); return; }
      const garder = await askConfirm(trad('Modifications non enregistrées') + '\n'
        + trad('Les dépenses de {m} portent des changements qui ne sont pas encore dans tes données.')
            .replace('{m}', fmtMonth(r.month)),
        { ok: 'Enregistrer et fermer', refus: 'Fermer sans enregistrer', danger: false });
      fermer(garder ? saisie() : null);
    };

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

/* La ligne d'un mois, creee si elle manque, et son index dans `monthly`.

   Le calendrier ouvre les douze mois de l'annee en cours et de chaque annee
   deja presente, mais pas ceux d'une annee qu'on n'a jamais touchee : rattraper
   un mois de 2019 ou preparer janvier prochain demande donc une ligne. Un seul
   endroit la cree, et il garde la table triee — la variation d'un mois se lit
   sur son voisin de gauche, un releve insere a la fin la fausserait.

   La cle est celle des lignes du releve, le premier du mois. */
function indexReleve(cle) {
  let i = Store.state.monthly.findIndex(r => r.date === cle);
  if (i < 0) {
    Store.state.monthly.push({ date: cle, comment: '', v: {} });
    Store.state.monthly.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    Store.save();
    i = Store.state.monthly.findIndex(r => r.date === cle);
  }
  return i;
}

function appliquerReleve(index, saisi) {
  const row = Store.state.monthly[index];
  if (!row) return false;
  sauvegardeAvantEcrasement(row);
  row.v = saisi.v;
  row.comment = saisi.comment;
  row.dettes = round2(num(saisi.dettes));
  historyYear = String(row.date).slice(0, 4);
  Store.save(); render();
  return true;
}

async function viderOuSupprimerMois(index) {
  const r = Store.state.monthly[index];
  if (!r) return false;
  const calendrier = isCalendarMonth(r.date);
  if (!await askConfirm(calendrier
    ? trad('Effacer les montants de {m} ?').replace('{m}', fmtMonth(r.date)) + '\n\n'
      + trad('Ce mois quittera le journal : il ne porte plus de relevé. Le rajouter le '
           + 'remettra à sa place, dans l’ordre des dates.')
      + '\n\n' + trad('Réversible avec Ctrl+Z.')
    : trad('Supprimer la ligne du {d} ?').replace('{d}', fmtDate(r.date)) + '\n\n'
      + trad("Ce n'est pas un mois du calendrier : la ligne disparaîtra du journal.")
      + '\n\n' + trad('Réversible avec Ctrl+Z.'))) return false;
  if (calendrier) clearMonthRow(r, 'comment');
  else Store.state.monthly.splice(index, 1);
  Store.save();
  toast(calendrier ? `${fmtMonth(r.date)} ${trad('vidé')}`
                   : trad('releve.ligneSupprimee', 'Ligne supprimée'));
  return true;
}

function askMonthlySnapshot(index) {
  return new Promise(resolve => {
    const r = Store.state.monthly[index];
    if (!r) { resolve(null); return; }
    const comptes = ACCOUNTS.slice();
    const montres = new Set(comptes.map(a => a.id));
    const masque = a => a.legacy && !num(r.v?.[a.id]);
    const masques = comptes.filter(masque).length;
    const avant = Store.state.monthly.slice(0, index).filter(x => !rowIsEmpty(x)).pop();
    const precedent = avant ? rowTotal(avant) : 0;
    const photo = nowTotals().total;
    const revolu = moisRevolu(r.date);
    const anCourant = +todayISO().slice(0, 4);
    const anMin = Math.min(anCourant,
      ...Store.state.monthly.map(x => +String(x.date).slice(0, 4))) - 10;
    const listeAnnees = [];
    for (let a = anMin; a <= anCourant + 1; a++) listeAnnees.push(a);
    const choixMois = isCalendarMonth(r.date);
    const m = $('#modal');
    apercuOuvert = null;

    $('#modalTitle').textContent = `${trad('Relevé de')} ${fmtMonth(r.date)}`;
    $('#modalSub').innerHTML = escMontant((avant
      ? `${trad('Dernier relevé,')} ${fmtMonth(avant.date)}${deuxPoints()} ${fmtEUR0(precedent)}`
      : trad('Aucun relevé avant celui-ci')) + ` · ${trad('valeurs brutes, crédits à part')}`);
    $('#modalBody').innerHTML = `
      ${/* Le mois du releve, et il se change ici.

            « Ajouter un relevé » propose le mois en cours : c'est le cas
            quatre-vingt-dix-neuf fois sur cent. Le choix sert aux trois autres,
            tous nommes — rattraper un mois oublie, importer un ancien
            historique, corriger une periode passee. Il vit donc DANS la fenetre
            plutot que dans une etape avant elle : une etape de plus aurait fait
            payer un clic au cas courant pour un choix qu'il ne fait pas.

            Deux menus et non un champ de type « month » : Safari de bureau ne
            le connait pas et y rend une zone de texte libre, dans laquelle on
            peut ecrire n'importe quoi. */''}
      ${choixMois ? `
      <div class="row" style="gap:8px; margin:0 0 14px">
        <span class="hint">${trad('Mois du relevé')}</span>
        <select id="relMois" class="annee" title="${trad('Mois du relevé')}">
          ${moisCourts().map((nom, k) => `<option value="${String(k + 1).padStart(2, '0')}"${
            k + 1 === +String(r.date).slice(5, 7) ? ' selected' : ''}>${esc(nom)}</option>`).join('')}
        </select>
        <select id="relAn" class="annee" title="${trad('Année du relevé')}">
          ${listeAnnees.map(a => `<option value="${a}"${
            a === +String(r.date).slice(0, 4) ? ' selected' : ''}>${a}</option>`).join('')}
        </select>
      </div>` : ''}
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
          <div class="field"${masque(a) && !historyShowLegacy
            ? ' data-cloture="1" style="display:none"'
            : masque(a) ? ' data-cloture="1"' : ''}>
            <label title="${esc([a.label, a.broker].filter(Boolean).join(' · '))}"
              >${esc(a.label)}${a.fantome ? ` <span class="muted">(${trad('ancien modèle')})</span>`
              : a.legacy ? ` <span class="muted">(${trad('clôturé')})</span>` : ''}<span
                class="f-etab">${esc(a.broker || '')}</span></label>
            <input type="number" step="any" inputmode="decimal" data-compte="${esc(a.id)}"
                   value="${r.v?.[a.id] ?? ''}" placeholder="">
          </div>`).join('')}
      </div>
      ${masques ? `
      <label class="small row" style="gap:6px; margin-top:10px">
        <input type="checkbox" id="relCloture" ${historyShowLegacy ? 'checked' : ''} style="width:auto">
        ${trad('Afficher les comptes clôturés')} (${masques})
      </label>` : ''}
      <div class="field" style="margin-top:12px">
        <label>${trad('Crédits en cours ce mois-là (€)')}${aide(trad("Le total du capital restant dû à cette date. Il ne se soustrait pas des champs ci-dessus (ceux-ci portent la valeur brute de chaque compte), mais il fait monter la part nette de tes biens, mois après mois, à mesure que tu rembourses."))}</label>
        <input type="number" step="any" inputmode="decimal" id="relDettes"
               class="champ-large" value="${num(r.dettes) || ''}" placeholder="0">
      </div>
      <div class="field" style="margin-top:12px">
        <label>${trad('Commentaire du mois')}</label>
        <input id="relNote" value="${esc(r.comment || '')}" placeholder="${trad('Ce qui explique ce mois-là…')}">
      </div>
      <div class="fiche-danger">
        <button type="button" class="btn ghost danger" id="relVider">${
          isCalendarMonth(r.date) ? trad('Effacer ce relevé')
                                  : trad('releve.supprimerLigne', 'Supprimer cette ligne')}</button>
        <p class="hint">${isCalendarMonth(r.date)
          ? trad('Les montants partent, le mois reste dans la liste, vide : les douze mois '
            + 'de l’année s’affichent toujours.')
          : trad('Ce n’est pas un mois du calendrier : la ligne disparaît de la liste.')}</p>
      </div>`;
    $('#modalFoot').innerHTML =
      `<button class="btn" id="relOk" type="button">${trad('Enregistrer')}</button>
       <button class="btn ghost" id="relFermer" type="button">${trad('Fermer')}</button>`;
    montrerModal(m);

    const champs = $$('#modalBody [data-compte]');
    const majTotal = () => {
      const t = champs.reduce((s, c) => s + num(c.value), 0);
      const d = precedent && t ? t - precedent : 0;
      const dettes = num($('#relDettes')?.value);
      $('#relTotal').innerHTML = `
        <span class="dep-somme">${fmtEUR0(t)}</span>
        ${d ? `<span class="dep-ecart ${cls(d)}">
          ${d > 0 ? '▲' : '▼'} ${fmtSigned(d)} ${trad('depuis')} ${esc(fmtMonth(avant.date))}</span>` : ''}
        ${dettes ? `<span class="dep-ecart muted" style="flex-basis:100%">
          ${trad('net de crédits')}${deuxPoints()} <b>${fmtEUR0(t - dettes)}</b></span>` : ''}`;
    };
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

    let photoPrise = false;
    if ($('#relPhoto')) $('#relPhoto').onclick = () => {
      for (const c of champs) {
        const v = nowValue(c.dataset.compte);
        c.value = v ? round2(v) : '';
        const boite = v ? c.closest('[data-cloture]') : null;
        if (boite) boite.style.display = '';
      }
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
    const enregistrer = async () => {
      const v = {};
      for (const [k, val] of Object.entries(r.v || {})) if (!montres.has(k)) v[k] = val;
      for (const c of champs) if (num(c.value)) v[c.dataset.compte] = round2(num(c.value));

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
      const ligne = Store.state.monthly[index];
      const brut = rowTotal(ligne), net = rowNet(ligne);
      toast(`${fmtMonth(r.date)} · ${Math.abs(brut - net) > 0.005
        ? `${fmtEUR0(brut)} ${trad('brut')} · ${fmtEUR0(net)} ${trad('net')}`
        : fmtEUR0(net)} ${trad('enregistré')}`);
      return true;
    };
    $('#relOk').onclick = enregistrer;
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
    if ($('#relCloture')) $('#relCloture').onchange = () => {
      historyShowLegacy = $('#relCloture').checked;
      for (const b of $$('#modalBody [data-cloture]')) {
        b.style.display = historyShowLegacy ? '' : 'none';
      }
    };
    async function allerAuMois() {
      const cle = `${$('#relAn').value}-${$('#relMois').value}-01`;
      const remettre = () => {
        $('#relMois').value = String(r.date).slice(5, 7);
        $('#relAn').value = String(r.date).slice(0, 4);
      };
      if (cle === r.date) return;
      if (sale) {
        const garder = await askConfirm(trad('Modifications non enregistrées') + '\n'
          + trad('Ce relevé porte des montants qui ne sont pas encore dans tes données.'),
          { ok: 'Enregistrer puis changer', refus: 'Changer sans garder', danger: false });
        if (garder && !await enregistrer()) { remettre(); return; }
      }
      const j = indexReleve(cle);
      fermer(null);
      askMonthlySnapshot(j);
    }
    if ($('#relMois')) {
      $('#relMois').onchange = allerAuMois;
      $('#relAn').onchange = allerAuMois;
    }
    $('#relVider').onclick = async () => {
      if (!await viderOuSupprimerMois(index)) return;
      fermer(null);
      render();
    };
  });
}

const APERCUS = {
  classe: (classe) => {
    const p = patrimoine();
    const total = p.classes[classe] || 0;
    let lignes;
    if (classe === 'liquidites') {
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
        sousAction: groupes.length > 1
          ? `<button type="button" class="btn sm ghost" data-action="liq-plier-tout"
                     aria-expanded="true">${trad('Tout replier')}</button>`
          : '',
        html: `
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
      const netDe = b => num(b.l.valeur) - b.dettes.reduce((s, x) => s + num(x.d.montant), 0);
      const vivants = () => Object.fromEntries(biens.flatMap((b, k) => [
        [`net-${k}`, fmtEUR(netDe(b))],
        [`credit-${k}`, `−${fmtEUR(b.dettes.reduce((s, x) => s + num(x.d.montant), 0))}`],
      ]));
      return {
        titre: 'Immobilier',
        sous: (biens.length > 1 ? trad('{n} biens') : trad('{n} bien'))
            .replace('{n}', biens.length)
          + (creditTotal
            ? ` · ${trad('{v} net de crédits').replace('{v}', fmtEUR0(total - creditTotal))}`
            : ` · ${trad('sans crédit')}`),
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
                           aria-label="${esc(trad('Capital restant dû, {l}')
                             .replace('{l}', d.libelle))}">
                  </div>`).join('')}
                <dl class="kv">
                  <dt>${trad('Crédits en cours')}</dt><dd class="dette" data-live="credit-${k}">−${fmtEUR(b.credits)}</dd>
                  <dt><b>${trad('Ce que tu possèdes')}</b></dt>
                    <dd><b data-live="net-${k}">${fmtEUR(b.l.valeur - b.credits)}</b></dd>
                </dl>
              </div>` : ''}
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
          const i = l.marche ? Store.state.positions.indexOf(l.marche) : -1;
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
    const surMarche = classe === 'actions' || classe === 'obligations' || classe === 'crypto';
    return {
      titre: CLASSES_ACTIFS[classe] || classe,
      sous: `${lignes.length} placement${lignes.length > 1 ? 's' : ''}`,
      total, lignes,
      vue: surMarche ? 'positions' : 'accounts', ancre: '',
      cta: surMarche ? 'Ouvrir Marchés' : 'Ouvrir Actifs',
    };
  },

  cible: (cle) => ficheDeBarre(positionsDeCible(cle)),

  role: (role) => ficheDeBarre(positionsDeRole(role)),

  cash: (poche) => {
    const cle = AFFECTATION_LABEL[poche] ? poche : null;
    const lignes = [];
    Store.state.comptes?.forEach((c, idxCompte) => {
      if (c.statut === 'archive') return;
      (c.cash || []).forEach((e, idxCash) => {
        if (cle && e.affectation !== cle) return;
        lignes.push({ label: nomCompteV2(c),
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
        { label: trad('Objectif à fin…'), path: 'meta.objectiveYear',
          options: Array.from({ length: 31 }, (_, i) => {
            const y = anCourante + i;
            return [y, `${trad('fin')} ${y}${i ? `, ${trad('dans')} ${i} ${i > 1 ? trad('ans') : trad('an')}` : `, ${trad('cette année')}`}`];
          }) },
      ],
      vue: 'history', ancre: '', cta: trad('Voir les relevés'),
    };
  },

  horizon: () => {
    const s = projectionSettings();
    const p = capitalisation({ years: projHorizon });
    const j = p.points[p.points.length - 1];
    const aujourdhui = new Date();
    const date = new Date(aujourdhui.getFullYear() + projHorizon, aujourdhui.getMonth(), aujourdhui.getDate());
    const plat = num(p.plat);
    /* Toutes les poches qui capitalisent, rendues par `pochesProjection` :
       ecrire la somme ici a la main laissait une poche dehors des qu'une
       nouvelle arrivait, et la difference se retrouvait dans « ce que tu
       verses », qui annonçait des versements jamais faits. */
    const base = p.poches.placees;
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
        { label: trad('Ce que le rendement ajoute'),
          meta: Math.abs(j.gains - num(j.gainsMarche)) > 0.005
            ? trad('selon tes hypothèses')
            : `${fmtPct(s.rate, 1)} ${trad('par an sur tes actifs de marché')}`,
          valeur: j.gains },
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
    for (const a of accountsWhere(x => x.group === 'bourse' && !x.holdings)) {
      if (nowValue(a.id)) lignes.push({ label: a.label, meta: 'liquidités', valeur: nowValue(a.id) });
    }
    return {
      titre: trad('Bourse'), sous: `${Store.state.positions.length} ${trad('lignes de titres et liquidités')}`,
      total: nowByGroup().bourse, lignes: lignes.sort((a, b) => b.valeur - a.valeur),
      vue: 'positions', ancre: 'jour', cta: trad('Voir les marchés'),
    };
  },

  patrimoineTotal: () => ({
    titre: trad('Patrimoine total'), sous: trad('Toutes poches confondues'),
    total: nowTotals().total,
    lignes: allocationByAsset().map(l => ({ label: l.label, meta: fmtPct(l.pct, 1), valeur: l.value })),
    vue: 'accounts', ancre: '', cta: trad('Voir les avoirs'),
  }),
  baseProjection: () => {
    const t = nowTotals();
    const s = projectionSettings();
    const q = pochesProjection(t);
    const tauxM = `${fmtPct(s.rate)} ${trad('par an')}`;
    const tauxA = num(s.rateAutres) ? `${fmtPct(s.rateAutres)} ${trad('par an')}` : A_PLAT;
    const tauxG = num(s.rateGaranti) ? `${fmtPct(s.rateGaranti, 1)} ${trad('par an')}` : A_PLAT;
    return {
      titre: trad('Ce que tu as déjà'),
      sous: trad('La base de la projection') + (num(t.immo) ? trad(', ton immobilier à part') : ''),
      total: q.placees,
      totalNote: trad('chaque ligne porte le taux qui lui est appliqué'),
      /* Une ligne par poche que la projection distingue, et la liste doit les
         couvrir toutes : le total vient de `q.placees`, donc une poche oubliee
         ici se compte dans le total sans apparaitre nulle part. Le capital
         garanti a manque, et la fenetre annonçait 86 551 EUR pour quatre lignes
         qui en faisaient 76 551. La somme des parts fait le total, ou elle ne
         dit rien. */
      /* Une ligne par poche de la projection, et la liste ne se recopie pas :
         chaque valeur vient de `pochesProjection`, celle-la meme que le moteur
         lit. Six lignes nommaient des classes — cryptomonnaies, non cote — que
         la projection ne distingue plus ; elles en font une, sous le nom de la
         poche et avec le taux qu'elle recoit vraiment. */
      lignes: [
        { label: trad('Actifs de marché'), meta: tauxM, valeur: q.marche },
        { label: trad('Capital garanti'), meta: tauxG, valeur: q.garanti },
        { label: trad('Autres actifs'), meta: tauxA, valeur: q.autres },
        { label: trad('Liquidités'), meta: A_PLAT, valeur: q.liquidites },
        { label: trad('Réservé à un projet'), meta: A_PLAT, valeur: q.projet },
      ].filter(l => Math.abs(l.valeur) > 0.005),
      vue: 'accounts', ancre: '', cta: trad('Voir les avoirs'),
    };
  },

  immobilierNet: () => {
    const lignes = [];
    for (const c of (Store.state.comptes || [])) {
      if (c.statut === 'archive') continue;
      for (const l of (c.lignes || [])) {
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
  /* Les lignes viennent de `placeByAccount()` et non d'`allocationByAccount()` :
     celle-la compte les especes, ce total les exclut. Un compte de liquidites
     entier figurait donc sous un total qui ne le contient pas.

     Le sous-titre suit : `invested` retire toutes les liquidites, pas seulement
     celles du quotidien, et la carte qui ouvre ce panneau montre l'epargne de
     precaution et le cash a investir comme deux parts distinctes de « Place ». */
  capaciteEpargne: () => {
    const rec = savingsReconciliation();
    return {
      titre: trad('Capacité d’épargne'),
      sous: trad('ce que ton budget laisse disponible chaque mois'),
      total: rec.investable,
      totalNote: trad('disponibles chaque mois'),
      html: `<table><tbody>
        <tr><td class="name">${trad('Revenus fixes')}</td><td class="muted"></td>
            <td><b>${fmtEUR(rec.income)}</b></td></tr>
        <tr><td class="name">${trad('− Charges fixes')}</td><td class="muted"></td>
            <td><b>−${fmtEUR(rec.fixed)}</b></td></tr>
        <tr><td class="name">${trad('− Dépenses moyennes')}</td><td class="muted"></td>
            <td><b>−${fmtEUR(rec.spend)}</b></td></tr>
      </tbody></table>
      ${rec.capitalRembourse > 0.005 ? `<p class="hint" style="margin:12px 0 0">
        ${trad('Le capital remboursé sur tes crédits')} (${fmtEUR0(rec.capitalRembourse)}
        ${trad('par mois')}) ${trad('augmente ton patrimoine, mais il n’est pas compté ici : il est déjà parti avec la mensualité, donc il n’est pas disponible à investir.')}</p>` : ''}`,
      vue: 'budget', ancre: '', cta: trad('Voir le Budget'),
    };
  },

  /* Cette fiche s'ouvre depuis Allocation, et de nulle part ailleurs : elle
     herite donc du perimetre de cette page. Sans cet heritage, la carte
     annoncait un montant hors immobilier et la fiche en rendait un autre, murs
     compris — le meme intitule, deux montants a un clic d'ecart.

     La note du haut prend la base du perimetre, pas le patrimoine entier : un
     pourcentage calcule sur une base plus large que la liste qu'il surmonte ne
     totalise pas cent, et c'est la faute que cette base de code traque depuis le
     debut. `baseAlloc().de` porte deja la forme grammaticale des deux cas. */
  investiTotal: () => {
    const place = allocFinancier ? nowTotals().invested - horsFinancierTotal()
                                 : nowTotals().invested;
    const base = valeurBaseAlloc();
    return {
      titre: BASES.place.nom, sous: trad('Tout sauf les liquidités'),
      total: place,
      totalNote: `${fmtPct(base ? place / base * 100 : 0)} ${baseAlloc().de}`,
      lignes: placeByAccount({ financier: allocFinancier })
        .map(l => ({ label: l.label, meta: fmtPct(l.pct, 1), valeur: l.value })),
      vue: 'accounts', ancre: '', cta: trad('Voir les avoirs'),
    };
  },

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
      vue: 'positions', ancre: 'ventes', cta: trad('Rester ici'),
    };
  },

  perfLatente: () => {
    const lat = latentPnl();
    return {
      titre: trad('Plus-value latente'), sous: `${lat.winners} ${trad('lignes en gain sur')} ${lat.count}`,
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
  perfRealisee: (range) => {
    const r = range || salesRange;
    const st = salesStats(r);
    return {
      titre: trad('Plus-value encaissée'),
      sous: !st.count
        ? (r === 'all' ? trad('aucune vente encore')
                       : `${rangeLabel(r)} · ${trad('aucune vente sur la période')}`)
        : [r === 'all' ? trad('depuis le début') : rangeLabel(r),
           `${st.wins} ${st.wins > 1 ? trad('ventes gagnantes sur') : trad('vente gagnante sur')} ${st.count}`
          ].join(' · '),
      total: st.realised, totalNote: `${fmtEUR0(st.gross)} ${trad('encaissés')}`,
      lignes: st.sales.map(v => ({ label: v.name, meta: fmtDate(v.date), valeur: v.realised })),
      vue: 'positions', ancre: 'ventes', cta: trad('Voir le journal'),
    };
  },
  perfTotale: () => {
    const lat = latentPnl(), tout = salesStats('all');
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
      vue: 'positions', ancre: '', cta: trad('Rester ici'),
    };
  },

  releveMois: (arg) => {
    const i = +arg;
    const r = Store.state.monthly?.[i];
    if (!r) return null;
    const g = rowGroups(r);
    const total = rowTotal(r);
    const avant = Store.state.monthly.slice(0, i).filter(x => !rowIsEmpty(x)).pop();
    const dettes = num(r.dettes);
    const net = rowNet(r);
    const dlt = avant ? net - rowNet(avant) : 0;
    const poches = seriesUtiles([g]).filter(p => Math.abs(num(g[p.key])) > 0.005);
    const comptes = Object.entries(r.v || {})
      .map(([id, v]) => ({ id, v: num(v), a: ACC[id] }))
      .filter(x => Math.abs(x.v) > 0.005)
      .sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
    return {
      titre: `${trad('Relevé de')} ${fmtMonth(r.date)}`,
      sous: avant
        ? `${fmtSigned(dlt)} ${trad('depuis')} ${fmtMonth(avant.date)}`
        : trad('le premier relevé de la série'),
      total: net,
      totalNote: dettes
        ? `${trad('avoirs')} ${fmtEUR0(total)} ${trad('moins')} ${fmtEUR0(dettes)} ${trad('de crédits')}`
        : trad('aucun crédit ce mois-là : net et brut se confondent'),
      html: `
        ${r.comment ? `<p class="hint" style="margin:0 0 12px">${esc(r.comment)}</p>` : ''}
        <table><tbody>${poches.map(p => `<tr>
          <td class="name">${esc(p.label)}</td>
          <td class="muted">${total ? fmtPct(num(g[p.key]) / total * 100, 0) : ''}</td>
          <td><b>${fmtEUR0(num(g[p.key]))}</b></td>
        </tr>`).join('')}${dettes ? `<tr>
          <td class="name">${trad('Crédits restants')}</td>
          <td class="muted"></td>
          <td><b>${fmtEUR0(-dettes)}</b></td>
        </tr>` : ''}</tbody></table>
        ${comptes.length ? `
        <p class="hint" style="margin:14px 0 2px">${trad('Compte par compte')}</p>
        <table><tbody>${comptes.map(c => `<tr>
          <td class="name">${esc(c.a ? c.a.label : c.id)}${c.a && c.a.broker
            ? `<span class="sub">${esc(c.a.broker)}</span>` : ''}</td>
          <td class="muted"></td>
          <td><b>${fmtEUR0(c.v)}</b></td>
        </tr>`).join('')}</tbody></table>` : ''}
        <button class="btn pleine" style="margin-top:12px" type="button"
                data-action="edit-month" data-i="${i}">${trad('Modifier le relevé')}</button>`,
    };
  },

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
      lignes: rows.slice().reverse().map(r => ({
        label: r.label,
        meta: [sous ? `${fmtEUR0(cible - r.total)} ${trad('de marge')}`
                    : `${fmtEUR0(r.total - cible)} ${trad('au-dessus')}`,
               r.note || ''].filter(Boolean).join(' · '),
        valeur: r.total })),
      vue: 'budget', ancre: '', cta: trad('Voir le détail'),
    };
  },

  repere: (sym) => {
    const l = REPERES_AFFICHES.find(x => x.symbole === sym);
    if (!l) return null;
    const dec = estVix(l) ? 1 : l.prix < 10 ? 4 : 2;
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
      sous: estVix(l) ? trad('Volatilité du S&P 500') : estIndice ? 'Indice boursier' : l.symbole,
      totalTexte: `${nb(l.prix)}${unite}`,
      /* Le niveau prend la place de l'etat de seance sous le nombre : c'est ce
         qu'on vient lire.

         TEXTE NU, et c'est un contrat : `noteApercu` passe par `escMontant`,
         qui echappe tout sauf le fragment de l'oeil masque. Une pastille d'aide
         posee ici s'imprimait donc en clair, balise comprise, sous le grand
         nombre. Le slot qui accepte du balisage est `html`, plus bas, et c'est
         la que l'aide vit. */
      totalNote: estVix(l) ? (niveauVix(l.prix) || '') : (m ? m.label : ''),
      html: `<dl class="kv">
        ${estVix(l) ? `<dt>${trad('Ce qu’il mesure')}${aide(trad(AIDE_VIX))}</dt>
          <dd class="phrase">${trad('Volatilité attendue, pas une performance')}</dd>` : ''}
        <dt>${trad('Variation du jour')}</dt>
          <dd class="${l.pct == null ? 'muted' : cls(l.pct)}">${l.pct == null
            ? `${trad('hors séance')}${l.quoteTime ? ` · ${trad('cours')} ${esc(fmtCoursQuand(l.quoteTime))}` : ''}`
            : `${fmtSignedPct(l.pct, 2)} · ${delta >= 0 ? '+' : '−'}${nb(Math.abs(delta))}${unite}`}</dd>
        <dt>${trad('Clôture précédente')}</dt><dd>${nb(l.veille)}${unite}</dd>
        ${m ? `<dt>${trad('Séance')}</dt><dd>${glypheSeance(m)} ${esc(m.label)}</dd>` : ''}
        ${ponts.map(([t, v, note]) => `
          <dt>${esc(t)}<span class="sub">${esc(note)}</span></dt><dd><b>${fmtEUR(v)}</b></dd>`).join('')}
      </dl>`,
      vue: 'positions', ancre: '', cta: trad('Voir les marchés'),
    };
  },

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
      vue: 'positions', ancre: '', cta: trad('Voir tes lignes'),
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
     sur « Enregistrer » ici, c'est precisement affirmer les avoir regardes, ce qui
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
        ouvre: { action: 'editer-credit', donnees: { etab: c.etabId, i: c.index } },
        meta: [c.etabNom, c.preteur, c.taux ? `${fmtNombre(c.taux)} % ${trad('l’an')}` : '',
               c.mensualite ? `${fmtEUR0(c.mensualite)} ${trad('par mois')}` : '',
               c.fin ? `${trad('soldé')} ${fmtMoisAn(c.fin.finLe)}` : ''].filter(Boolean).join(' · '),
        champ: `etabs.${etabs.findIndex(e => e.id === c.etabId)}.dettes.${c.index}.montant`,
        valeur: c.reste,
      })),
    };
  },

  jourTitres: () => {
    const j = dayPerformance();
    return {
      titre: trad('Aujourd’hui'),
      sous: j.lignes.length
        ? [`${j.hausse} ${trad('en hausse')}`, `${j.baisse} ${trad('en baisse')}`,
           j.sansDonnee ? `${j.sansDonnee} ${trad('sans cours de veille')}` : '',
           j.horsSeance ? `${j.horsSeance} ${trad('sans cours du jour')}` : '',
           j.asOfMarche ? `${trad('cours')} ${fmtCoursQuand(j.asOfMarche)}` : ''].filter(Boolean).join(' · ')
        : trad('pas de clôture de veille en mémoire'),
      total: j.eur,
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

  cashInvestir: () => ({
    titre: BASES.cashPlacer.nom, sous: trad('Liquidités posées chez tes courtiers'),
    total: stockTotals().cashToInvest,
    totalNote: `${fmtPct(poidsPortefeuille(stockTotals().cashToInvest))} ${trad('du portefeuille')}`,
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
  pe: () => {
    const nc = latentNonCote();
    const lignes = nc.lignes.filter(l => l.classe === 'nonCote');
    const value = lignes.reduce((s, l) => s + l.value, 0);
    const invested = lignes.reduce((s, l) => s + l.invested, 0);
    const pnl = value - invested;
    const vieilles = lignes.filter(l => l.vieille).length;
    return {
      titre: trad(CLASSES_ACTIFS.nonCote),
      sous: [trad('valeurs que tu déclares, pas des cours'),
             vieilles ? `${vieilles} ${vieilles > 1 ? trad('à revoir') : trad('à revoir')}`
                      : trad('pas mobilisables à court terme')].join(' · '),
      total: nowByGroup().pe,
      totalNote: invested > 0
        ? `${fmtEUR0(invested)} ${trad('investis')} · ${trad('écart')} ${fmtSigned(pnl)} (${
            fmtSignedPct(pnl / invested * 100, 1)})`
        : trad('prix de revient non renseigné'),
      lignes: lignes.map(l => ({
        label: l.nom,
        meta: [sousNom(l.nom, nomCompteV2(l.compte), nomEtabDe(l.compte)),
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
  /* `sousAction` : une commande de lecture posee au bout du sous-titre. Elle
     n'est pas echappee — c'est du balisage que le panneau fournit, comme `html`
     juste en dessous — et le sous-titre, lui, l'est toujours. */
  $('#modalSub').innerHTML = escMontant(a.sous) + (a.sousAction || '');
  $('#modalSub').classList.toggle('avec-action', !!a.sousAction);
  $('#modalBody').innerHTML = collerAides(`
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
    </tr>`).join('')}</tbody></table>`}`);
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

function majApercu() {
  if (!apercuOuvert || $('#modal').hidden) return;
  const a = APERCUS[apercuOuvert]?.(apercuArg);
  if (!a) return;
  const total = $('#modalBody .modal-total b');
  if (total) total.innerHTML = fmtEUR(a.total);
  const note = $('#modalBody .modal-total span');
  if (note) note.innerHTML = escMontant(noteApercu(a));
  $('#modalTitle').textContent = a.titre;
  $('#modalSub').innerHTML = escMontant(a.sous || '');
  if (a.live) {
    const L = a.live();
    for (const el of $$('#modalBody [data-live]')) {
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

let pendingAnchor = null;

function focusAnchor() {
  if (!pendingAnchor) return;
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
  const cleOnglet = SOUS_ONGLETS[v.cle] && sousOngletActif[v.cle]
    ? `${v.cle}.${sousOngletActif[v.cle]}` : null;
  const propre = suffixe => {
    const k = `view.${cleOnglet}${suffixe}`;
    return cleOnglet && t(k) !== k ? t(k) : null;
  };
  const titre = viewTitle(v.cle);
  $('#viewTitle').textContent = titre;
  $('#viewSub').textContent = propre('.sub') || viewSub(v.cle);
  $('#brandView').textContent = titre;              // barre fixe, écran replié
  document.body.dataset.vue = key;
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
      retour.setAttribute('aria-label',
        trad('Retour à {v}').replace('{v}', viewTitle(parent)));
    } else if (orpheline) {
      retour.dataset.action = 'retour-arriere';
      delete retour.dataset.view;
      retour.setAttribute('aria-label', trad('Revenir à l’écran précédent'));
    }
    document.body.classList.toggle('sous-page', !retour.hidden);
  }
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === key));
  majOnglets();
  const host = $('#view');
  const scroll = window.scrollY;
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
  /* Les barres poussent de zero a l'arrivee sur une vue ET au changement de
     perimetre. Deux classes et non une : `vue-entre` fait aussi monter les
     cartes en cascade, et rejouer cette cascade a chaque clic sur une bascule
     ferait clignoter la page entiere pour un chiffre qui change. */
  if (arrivee || relanceGraphes) {
    host.classList.add('graphes-poussent');
    clearTimeout(render._finPousse);
    render._finPousse = setTimeout(() => host.classList.remove('graphes-poussent'), 750);
  } else {
    host.classList.remove('graphes-poussent');
  }
  relanceGraphes = false;
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

  host.innerHTML = collerAides(v.render());

  if (lavisAvant !== null) {
    const seg = $('.sous-onglets .segmented');
    const i = seg && [...seg.children].findIndex(b => b.classList.contains('on'));
    if (seg && i >= 0 && i !== lavisAvant) {
      seg.style.setProperty('--onglet', lavisAvant);
      requestAnimationFrame(() => requestAnimationFrame(() =>
        seg.style.removeProperty('--onglet')));
    }
  }
  if (tapeSousOnglets) {
    tapeSousOnglets = false;
    const seg = $('.sous-onglets .segmented');
    if (seg) {
      seg.classList.add('tape');
      setTimeout(() => seg.classList.remove('tape'), 400);
    }
    const host = $('#view');
    if (host) {
      host.classList.add('barre-immobile');
      setTimeout(() => host.classList.remove('barre-immobile'), 700);
    }
  }

  MOUNTS[key]?.();
  monteAides();
  renderSidebar();
  coursFraichis = new Set();
  if (pendingAnchor) focusAnchor();
  else if (retourHautDemande || changeOnglet) { retourHautDemande = false; window.scrollTo(0, 0); }
  else window.scrollTo(0, arrivee ? (positionsVues.get(signatureVue) || 0) : scroll);
}
let retourHautDemande = false;
/* La vue rendue, sous-onglet exclu — `derniereVueRendue` porte la signature
   complete. Les deux sont necessaires : c'est leur difference qui distingue un
   changement d'onglet du bas d'un changement de sous-onglet. */
let derniereCleRendue = null;
let derniereVueRendue = null;
const positionsVues = new Map();
let navsInternes = 0;
let tapeSousOnglets = false;

const ICONE_NOTIF = { action: '●', error: '⛔', warn: '⚠', info: 'ℹ' };

function rendNotifs() {
  const n = notifications();
  const panneau = $('#panneauNotifs');
  if (!panneau) return;
  panneau.innerHTML = `
    <div class="notif-tete">
      <b>${trad('À faire')}</b>
      <span>${n.length ? `${n.length} point${n.length > 1 ? 's' : ''}` : 'rien à signaler'}</span>
      <button type="button" class="btn icon xs notif-reglages"
              data-action="goto" data-view="notifications" data-anchor=""
              title="${trad('Réglages des notifications')}" aria-label="${trad('Réglages des notifications')}">
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
        <button type="button" class="btn icon xs notif-x" data-action="masquer-notif"
                data-cle="${esc(x.cle)}" title="${trad('Ne plus signaler')}"
                aria-label="Ne plus signaler : ${esc(x.title)}">✕</button>
      </div>`).join('')
    : `<p class="notif-vide">${trad('✓ Rien à signaler.')}</p>`}
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

  const dep = depensesEnAttente();
  const rel = currentMonthPending();

  const pastille = (id, actif, texte) => {
    const p = $(id);
    if (!p) return;
    p.hidden = !actif;
    p.title = actif ? texte : '';
  };
  pastille('#tabBadgeBudget', dep.missing,
    dep.missing ? `${dep.label} : ${trad('dépenses pas encore saisies')}` : '');
  pastille('#tabBadgeOverview', rel.missing,
    rel.missing ? `${rel.label} : ${trad('relevé pas encore enregistré')}` : '');

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

  const pastille = (id, p, texte) => {
    const b = $(id);
    if (!b) return;
    b.hidden = !p.missing;
    b.title = p.missing ? `${p.label}, ${texte}` : '';
  };
  const dep = depensesEnAttente();
  const rel = currentMonthPending();
  pastille('#badgeBudget', dep, trad('dépenses pas encore saisies'));
  pastille('#badgeOverview', rel, trad('relevé pas encore enregistré'));

  const netWorth = $('#sbNetWorth');
  const montant = fmtEUR0(t.total);
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
  const netTiroir = $('#navNetWorth');
  if (netTiroir) netTiroir.innerHTML = montant;
  const el = $('#sbDelta');
  const deltaHtml = d.ytd ? `${arrow(d.ytd.eur)} ${fmtSigned(d.ytd.eur)} ${trad('depuis janvier')}` : '';
  const deltaCls = 'sb-delta ' + (d.ytd ? cls(d.ytd.eur) : '');
  el.innerHTML = deltaHtml;
  el.className = deltaCls;
  const dTiroir = $('#navDelta');
  if (dTiroir) { dTiroir.innerHTML = deltaHtml; dTiroir.className = deltaCls; }

  majEtatCours();

  const on = masqueActif();
  document.body.classList.toggle('discret', on);
  for (const oeil of $$('[data-action="toggle-masque"]')) {
    oeil.setAttribute('aria-pressed', on ? 'true' : 'false');
    oeil.title = (on ? trad('Afficher les montants') : trad('Masquer les montants')) + ' ' + trad('(touche h)');
    oeil.setAttribute('aria-label', on ? trad('Afficher les montants') : trad('Masquer les montants'));
  }
  const nw = $('#sbNetWorth');
  if (nw) nw.title = (masqueActif() ? trad('Afficher les montants') : trad('Masquer les montants'))
    + ' ' + trad('(touche h)');
}

function monteGlissementFermeture(fenetre) {
  if (!fenetre) return;
  const panneau = fenetre.querySelector('.modal-panel');
  if (!panneau) return;

  let depart = null, delta = 0;
  const SEUIL = 90;          // en deçà, la fenêtre revient en place

  const fermable = () => {
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

  const ZONE_GLISSEMENT = '.modal-head';
  const corpsDefile = () => {
    const c = fenetre.querySelector('.modal-body');
    return !!c && c.scrollHeight - c.clientHeight > 2;
  };
  let corpsFige = false;

  panneau.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
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
      if (Math.abs(dy) < SEUIL_INTENTION && Math.abs(dx) < SEUIL_INTENTION) return;
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

  const SEUIL_RAFRAICHIR = 165;   // au-dela, on lache et ca part
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
    const t = Math.min(1, dy / SEUIL_RAFRAICHIR);
    const y = amorti(dy);
    jauge.style.opacity = String(t);
    jauge.style.transform = `translate(-50%, ${y}px) rotate(${t * 300}deg)`;
    jauge.classList.toggle('prete', dy >= SEUIL_RAFRAICHIR);
    hote.style.transform = `translateY(${y}px)`;
  };
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
    if (!VUES_TIRER.has(currentView())) return;
    if (enCours || e.touches.length !== 1) return;
    if (window.scrollY > 0) return;
    if (!$('#modal').hidden || !$('#confirm').hidden) return;
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
      axe = (y > 0 && Math.abs(y) > Math.abs(x)) ? 'tirer' : 'autre';
      if (axe === 'autre') { depart = null; return; }
    }
    dy = Math.max(0, y);
    e.preventDefault();
    peindre();
  }, { passive: false });

  const relacher = async () => {
    if (depart === null || axe !== 'tirer') { depart = null; axe = null; return; }
    const assez = dy >= SEUIL_RAFRAICHIR;
    depart = null; axe = null;
    if (!assez) { dy = 0; reposer(); return; }
    dy = 0;
    enCours = true;
    retourHaptique();
    jauge.classList.remove('prete');
    jauge.classList.add('tourne');
    jauge.style.opacity = '1';
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
  btn.setAttribute('aria-label', trad('Vider le champ'));
  btn.setAttribute('title', trad('Vider le champ'));
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
    let remontee = 0;
    const suivre = () => {
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
    window.addEventListener('hashchange', () => {
      dernier = 0;
      remontee = 0;
      document.body.classList.remove('haut-cache');
    });
  })();

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const fn = ACTIONS[btn.dataset.action];
    if (fn) { e.preventDefault(); fn(btn); }
  });

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
    Store.save({ differe: true });
    marquerEcrit(f);
    renderSidebar();
    majApercu();                       // les totaux de la fenêtre suivent
  });
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

  document.addEventListener('change', e => {
    const sel = e.target.closest('select.annee[data-action-change]');
    if (!sel) return;
    const fn = ACTIONS[sel.dataset.actionChange];
    if (fn) fn({ dataset: { year: sel.value, type: sel.value } });
  });

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
    if (bloc) { bloc.dataset.differe = 'sale'; return; }
    const tauxAvant = TAUX_PROJECTION.includes(f.dataset.path)
      ? projectionSettings() : null;
    applyField(f);
    if (tauxAvant) {
      const m = Store.state.meta;
      if (f.dataset.path !== 'meta.projRate') m.projRate = tauxAvant.rate;
      if (f.dataset.path !== 'meta.projRateAutres') m.projRateAutres = tauxAvant.rateAutres;
      if (f.dataset.path !== 'meta.projRateGaranti') m.projRateGaranti = tauxAvant.rateGaranti;
      m.projScenario = 'perso';
    }
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
    const m = path && path.match(/^positions\.(\d+)\.symbol$/);
    if (m) lookupSymbol(+m[1]);
  });

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

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('[role="button"][data-action]');
    if (!el) return;
    e.preventDefault();
    ACTIONS[el.dataset.action]?.(el);
  });

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
      if (location.hash !== marque.getAttribute('href')) { retourHautDemande = true; return; }
      if (window.scrollY > 0) {
        window.scrollTo({ top: 0,
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    });
  }
  backdrop.addEventListener('click', () => setNav(false));
  $('#nav').addEventListener('click', e => {
    const porte = e.target.closest('a, [data-action="goto"]');
    if (!porte) return;
    setNav(false);
    const href = porte.getAttribute?.('href');
    if (href && href !== location.hash) retourHautDemande = true;
  });
  $('#tabbar')?.addEventListener('click', e => {
    const lien = e.target.closest('a');
    if (!lien) return;
    retourHaptique();
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
        if (sens === 'lateral' || (ey > 0 && !enHaut())) { relacher(); y0 = null; return; }
      }
      const t = performance.now();
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
        nav.style.transition = 'transform .28s cubic-bezier(.16,1,.3,1)';
        nav.style.transform = '';
        setTimeout(() => { nav.style.transition = ''; nav.style.willChange = ''; }, 300);
        return;
      }
      nav.style.transition = 'transform .2s cubic-bezier(.3,0,.2,1)';
      nav.style.transform = 'translate3d(0, ' + hauteur + 'px, 0)';
      setNav(false);
      setTimeout(relacher, 210);
    };
    nav.addEventListener('touchend', fin);
    nav.addEventListener('touchcancel', fin);
  })();

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
  try { if (sessionStorage.getItem('wd:fileBannerSeen')) return; } catch (e) {}
  const el = document.createElement('div');
  el.className = 'file-banner';
  el.innerHTML = `
    <span>📄</span>
    <div><b>${trad('Mode fichier.')}</b> ${trad('Les cours de bourse ne peuvent pas être '
      + 'récupérés, et tes données sont enregistrées séparément de celles du mode serveur. '
      + 'Pour n’avoir qu’un seul jeu de données, lance plutôt')}
      <code>python serve.py</code>.</div>
    <button class="btn ghost sm" type="button">${trad('Compris')}</button>`;
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
  if (f.dataset.type === 'num') { setPath(path, Number(f.value)); return; }
  if (f.dataset.type === 'bool') { setPath(path, f.value === 'true'); return; }

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

(async function init() {
  try {
    document.documentElement.dataset.theme =
      localStorage.getItem('wealth-dashboard:theme') || 'dark';
  } catch (e) { document.documentElement.dataset.theme = 'dark'; }
  Store.load();
  Store.autoBackup();
  translateStatic();          // libellés du menu, avant le premier rendu
  bindGlobal();
  render();

  const lancement = $('#lancement');
  if (lancement) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      lancement.classList.add('parti');
      setTimeout(() => lancement.remove(), 400);
    }));
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW non enregistré', e));
  }

  if (location.protocol === 'file:') showFileModeBanner();

  CloudSync.setOnChange(() => { if (currentView() === 'data') render(); });
  CloudSync.setOnConflit(() => {
    toast(trad('Modification gardée ici : une autre version existe en ligne'));
    render();
  });
  try {
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
      window.addEventListener('online', () => CloudSync.push());
    }
  } catch (e) { console.warn('Synchro cloud indisponible', e); }

  const online = await Quotes.health();
  majEtatCours();
  if (!online) { if (currentView() === 'positions') render(); return; }

  const last = Store.state.quotes?.lastRun;
  const stale = !last || (Date.now() - new Date(last)) > 10 * 60 * 1000;
  if (Store.state.meta.autoRefresh && stale) {
    try { await Quotes.refresh(); } catch (e) { console.warn('Cours indisponibles', e); }
  }
  render();

  const ouverte = x => {
    const s = marketStatus(x);
    return !!s && (s.cle === 'open' || s.cle === 'pre' || s.cle === 'post');
  };
  const placeOuverte = () => Store.state.positions.some(ouverte);
  /* Le ruban a sa propre garde, et c'est le coeur du correctif.

     Il portait celle des positions : rien ne se redemandait tant qu'aucune
     ligne DETENUE ne cotait. Un portefeuille europeen a dix-huit heures voyait
     donc le S&P 500 fige pour la soiree, Wall Street ouverte. Le ruban ne parle
     pas de ce qu'on detient, il parle du marche : il se juge sur SES lignes.

     Elles sont deja en main — `REPERES_AFFICHES` porte celles du dernier rendu,
     avec l'etat de leur place. Aucune table d'horaires a tenir. */
  const repereOuvert = () => REPERES_AFFICHES.some(ouverte);

  async function rafraichirSiUtile() {
    if (!Store.state.meta.autoRefresh) return;
    if (document.hidden || !Quotes.isOnline()) return;
    let aBouge = false;
    const l = Store.state.quotes?.lastRun;
    const positionsFraiches = l && Date.now() - new Date(l) < 5 * 60 * 1000;
    if (!positionsFraiches && placeOuverte()) {
      try { await Quotes.refresh(); aBouge = true; }
      catch (e) { console.warn('Cours indisponibles', e); }
    }
    if (repereOuvert()) { Quotes.oublierReperes(); aBouge = true; }
    if (aBouge) render();
  }

  setInterval(rafraichirSiUtile, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rafraichirSiUtile(); });

  setInterval(() => majEtatCours(), 60 * 1000);
})();
