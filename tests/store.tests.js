/* Ce que ces tests protègent.

   Chacune des suites ci-dessous correspond à un défaut réellement trouvé dans
   l'application, à la main, en pilotant un navigateur. Aucun n'était exotique,
   et tous auraient été pris en une seconde par les assertions qui suivent.

   La règle qui les gouverne : **un total doit égaler la somme de ses parts**.
   Presque tous les bugs de calcul rencontrés étaient des violations de cette
   phrase, et aucun ne se voyait à l'écran — les chiffres avaient l'air justes,
   ils étaient simplement faux. */

const { suite, test, pres, eq, vrai, leve } = Tests;

/* Le texte d'un fichier du projet, en synchrone comme le harnais.

   Deux sortes de tests s'en servent. Les regles qui vivent dans `app.js` ne
   peuvent etre verifiees que comme du texte, puisque le harnais ne charge pas
   ce fichier — mais quand la fonction visee ne depend de rien, on la reconstruit
   depuis sa source et on l'execute pour de vrai : une assertion sur le
   comportement vaut mieux qu'une recherche de motif dans une chaine. */
function lireSource(fichier) {
  const r = new XMLHttpRequest();
  r.open('GET', fichier + '?lint=' + Date.now(), false);
  r.send();
  return r.status === 200 ? r.responseText : null;
}

/* Jouer un contrôle à une date choisie.

   `todayISO` est une déclaration de fonction, donc remplaçable — un `const`
   lexical ne l'aurait pas été. Le rétablissement est dans un `finally` : un
   échec au milieu laisserait sinon toutes les suites suivantes au 4 août 2026.

   Cette fonction vivait à l'intérieur d'une suite, et la suivante qui en a eu
   besoin ne la voyait pas. Une seule définition, en haut, pour toutes. */
function auJour(iso, faire) {
  const vrai0 = window.todayISO;
  window.todayISO = () => iso;
  try { faire(); } finally { window.todayISO = vrai0; }
}

/* Jouer un controle dans une langue choisie, masque leve.

   Meme `finally` que ci-dessus, et pour une raison plus grave : cette page
   partage son origine avec l'application, donc son `localStorage`. La langue
   qu'on deplace ici est la vraie, celle du detenteur — un echec au milieu
   laisserait son application en anglais. Le masque suit la meme regle : un
   montant masque rend un oeil barre, sur lequel aucun format ne se lit. */
function enLangue(code, faire) {
  const lang0 = currentLang();
  const masque0 = masqueActif();
  setLang(code);
  setMasque(false);
  try { faire(); } finally { setLang(lang0); setMasque(masque0); }
}

/* ------------------------------------------------------------------
   1. Les totaux ne mentent pas
   ------------------------------------------------------------------ */
suite('Les totaux égalent la somme de leurs parts', () => {

  test('un premier lancement rend un état complet, pas une coquille', () => {
    /* `load()` ne migrait que l'etat relu du stockage. Sur une machine vierge
       elle posait la graine telle quelle, dans l'ancien modele, et rendait la
       main : `comptes` n'existait pas, et tout ce qui en descend valait zero.
       L'accueil affichait « 0 € » sous ses huit cartes.

       Le defaut ne durait qu'un instant — la premiere sauvegarde repassait par
       la migration — donc il etait invisible en developpement, ou le stockage
       est toujours deja rempli. Il ne se voyait qu'a la premiere visite, la
       seule qui compte pour une demonstration publique.

       Le controle rejoue ce chemin sans toucher au stockage. Le harnais ne lit
       ni n'ecrit jamais `localStorage` — `tests.html` l'annonce — et un test qui
       effacerait la cle effacerait les donnees de qui lance les tests. On pose
       donc la graine a la main, exactement comme `load()` le fait, et on la
       passe par la migration. Que `load()` appelle bien cette migration est
       verifie a part, sur le source. */
    Store.state = structuredClone(SEED);
    Store.migrate();
    refreshAccounts();
    vrai(Array.isArray(Store.state.comptes),
      'la graine doit traverser la migration : les comptes existent');
    eq(Store.state.schemaVersion, 2, 'et le schéma est à jour');
    vrai(patrimoine().brut > 0,
      'le patrimoine d’un premier lancement ne vaut pas zéro');
    vrai(Store.state.comptes.length > 0, 'au moins un compte en est sorti');
    /* Et l'operation est idempotente : la rejouer ne doit rien doubler. */
    const avant = Store.state.comptes.length;
    Store.migrate();
    eq(Store.state.comptes.length, avant, 'rejouer la migration ne double rien');
  });

  test('le brut vaut la somme des poches', () => {
    Fixture.poser();
    const p = poches();
    const somme = p.courant + p.precaution + p.projet + p.investir
      + p.classes.actions + p.classes.obligations + p.classes.crypto
      + p.classes.nonCote + p.classes.immobilier;
    pres(patrimoine().brut, somme, 'patrimoine().brut doit valoir la somme de poches()');
    pres(patrimoine().brut, Fixture.BRUT, 'le fixture vaut 138 250 €');
  });

  test('le net retranche les crédits, une seule fois', () => {
    Fixture.poser();
    pres(patrimoine().net, Fixture.BRUT - Fixture.DETTE, 'net = brut − dettes');
    pres(nowTotals().net, Fixture.BRUT - Fixture.DETTE, 'nowTotals().net');
  });

  test('les cinq poches d’affichage refont le brut', () => {
    Fixture.poser();
    const g = nowByGroup();
    pres(g.cash + g.bourse + g.crypto + g.pe + g.immo, Fixture.BRUT,
      'nowByGroup() doit couvrir tout le patrimoine, crypto et immobilier compris');
  });

  test('investi + à investir + disponible refont le brut', () => {
    /* La carte du haut d'Allocation. Trois tuiles y laissaient 1 856 € hors de
       tout et annonçaient 98,97 % d'un patrimoine. Puis, le cash à investir
       ayant rejoint les liquidités, `invested` l'a retranché deux fois. */
    Fixture.poser();
    const t = nowTotals();
    pres(t.invested + t.toInvest + (t.cash - t.toInvest), t.brut,
      'les trois parts de la carte « disponibilité » doivent faire le brut');
    vrai(t.cash >= t.toInvest, 'le cash total contient le cash à investir');
  });

  test('la répartition par classe refait le brut', () => {
    Fixture.poser();
    const somme = repartitionClasses().reduce((s, x) => s + x.value, 0);
    pres(somme, Fixture.BRUT, 'repartitionClasses() — la liste de l’accueil');
  });

  test('l’allocation par actif refait le patrimoine net', () => {
    /* Net et non brut : la liste porte une ligne « Crédits en cours »
       négative. Sans dette dans les données, les deux coïncident et le test
       ne prouverait rien — le fixture en a une. */
    Fixture.poser();
    const somme = allocationByAsset().reduce((s, x) => s + x.value, 0);
    pres(somme, nowTotals().total, 'allocationByAsset()');
    pres(somme, Fixture.BRUT - Fixture.DETTE, 'soit le net');

    /* Sans la ligne des credits, la meme liste se totalise aux avoirs, et ses
       parts font 100 % de cette base-la. C'est ce que demande la carte de
       repartition, dont le camembert compte deja en brut : deux granularites
       d'un meme axe ne peuvent pas s'annoncer sous deux bases differentes. */
    const brut = allocationByAsset({ credits: false });
    pres(brut.reduce((s, x) => s + x.value, 0), Fixture.BRUT,
      'sans les crédits, la somme fait les avoirs');
    pres(brut.reduce((s, x) => s + x.pct, 0), 100,
      'et les parts se rapportent bien à cette base');
    vrai(!brut.some(x => x.value < 0),
      'plus aucune part négative : un crédit n’est pas un endroit où l’argent est');
  });

  test('le portefeuille de titres refait son total', () => {
    Fixture.poser();
    const s = stockTotals();
    pres(s.invested + s.cashToInvest, s.balance,
      'titres + à investir = total chez les courtiers');
    pres(s.balance, 11250, '9 000 d’ETF + 750 d’or + 1 500 de cash');
  });
});

/* ------------------------------------------------------------------
   2. Le cash « à investir » est rangé d'un seul côté
   ------------------------------------------------------------------ */
suite('Le cash à investir est rangé d’un seul côté', () => {

  test('accueil et Allocation comptent les mêmes liquidités', () => {
    /* Le bug : `poches().classes.liquidites` incluait le cash posé chez un
       courtier, `nowByGroup().cash` non — il le rangeait en bourse. Deux
       écrans, le mot « Liquidités », 1 856 € d'écart, et les deux totaux
       justes, donc rien pour le signaler. */
    Fixture.poser();
    pres(nowByGroup().cash, poches().classes.liquidites,
      'la poche « Liquidités » doit valoir la même chose des deux côtés');
  });

  test('accueil et Allocation comptent les mêmes actifs de marché', () => {
    Fixture.poser();
    const p = poches();
    pres(nowByGroup().bourse, p.classes.actions + p.classes.obligations,
      'la poche « Actifs de marché » doit valoir la même chose des deux côtés');
  });

  test('il est compté une fois et une seule', () => {
    Fixture.poser();
    pres(nowTotals().toInvest, 1500, 'le fixture pose 1 500 € en attente');
    pres(nowTotals().cash - nowTotals().toInvest, 5000, 'reste le cash de vie');
    pres(nowTotals().invested, Fixture.BRUT - 6500,
      '« Investi » exclut toutes les liquidités, une seule fois');
  });

  test('le cash raconte la même histoire partout', () => {
    /* Trois ecrans affichent les liquidites, et ils divergeaient : Allocation
       agregeait courant + precaution + projet sous « Argent disponible »
       (3 270 EUR), un montant que l'accueil ne connaissait pas et qui portait
       presque le nom d'une de ses propres parts, « Cash disponible »
       (3 250 EUR). Vingt euros d'ecart, invisibles tant que la precaution
       reste petite.

       La regle desormais : « Liquidites » nomme le tout, les quatre
       affectations le composent, aucun agregat intermediaire n'existe. Ce test
       verrouille les deux egalites qui le garantissent. */
    Fixture.poser();
    /* `poches` est deja une fonction globale : la liste s'appelle autrement,
       sinon elle l'occulte et l'assertion suivante leve. */
    const liste = pochesLiquidites();
    pres(liste.reduce((s, p) => s + p.value, 0), nowByGroup().cash,
      'les quatre poches font les liquidités, sans reste');
    pres(nowByGroup().cash, poches().classes.liquidites,
      'et les liquidités valent la même chose des deux côtés');
    /* Chaque poche porte le nom d'AFFECTATIONS, source unique : un nom change
       la et il change sur les trois ecrans. */
    eq(liste.map(p => p.nom).join(' · '),
      AFFECTATIONS.map(([, nom]) => nom).join(' · '),
      'les noms viennent d’AFFECTATIONS, pas d’une liste parallèle');
    /* Et le cash a investir est la meme grandeur des deux sources qui le
       calculent : nowTotals et stockTotals. */
    pres(nowTotals().toInvest, stockTotals().cashToInvest,
      'le cash à investir vaut la même chose depuis ses deux sources');
  });

  test('l’épargne de précaution ignore le cash posé chez un courtier', () => {
    /* Un autre axe : la disponibilité. Ce cash est bien liquide, mais il n'est
       pas mobilisable dans la seconde, et il est déjà destiné. Le compter en
       réserve d'urgence gonflerait l'autonomie à tort. */
    Fixture.poser();
    pres(runway().immediate, 5000,
      'seuls le compte courant et le livret comptent comme disponibles tout de suite');
  });
});

/* ------------------------------------------------------------------
   3. Les relevés mensuels couvrent toutes les poches
   ------------------------------------------------------------------ */
suite('Un relevé mensuel couvre toutes les poches', () => {

  test('le total d’une ligne additionne les cinq poches', () => {
    /* Le bug d'origine : la colonne « Total » n'additionnait que cash, bourse
       et non coté. La crypto et l'immobilier disparaissaient — 120 000 € de
       studio absents d'un total nommé « total ». */
    const s = Fixture.poser();
    pres(rowTotal(s.monthly[0]), Fixture.BRUT,
      'rowTotal() doit couvrir cash, bourse, crypto, non coté et immobilier');
  });

  test('chaque compte tombe dans une poche connue', () => {
    const s = Fixture.poser();
    const g = rowGroups(s.monthly[0]);
    pres(g.cash + g.bourse + g.crypto + g.pe + g.immo, Fixture.BRUT,
      'aucun montant ne doit se perdre entre les poches');
    pres(g.immo, 120000, 'l’immobilier a sa propre bande');
    pres(g.pe, 2000, 'le crowdfunding reste en non coté');
  });
});

/* ------------------------------------------------------------------
   4. Le classement d'une ligne de marché
   ------------------------------------------------------------------ */
suite('Classement d’une ligne de marché', () => {

  test('une classe découpée laisse place à ses deux rôles, à plat', () => {
    /* « 90 % d'actions » ne disait pas si le prochain versement va au fonds
       mondial ou a une conviction, et viser un core a 70 % obligeait a regler
       les actions a 90 % en esperant tomber juste. Une classe detenue dans les
       deux roles peut donc porter deux cibles.

       A plat : « Actions core » et « Actions satellite » remplacent « Actions »
       dans la liste, sans ligne parente. Un seul axe de cibles, plus fin — pas
       deux series croisees, qui se contrediraient en silence.

       Le libelle porte la classe et pas seulement le role : « Core » seul
       promettrait tout le core du portefeuille alors que la ligne ne compte que
       les actions, et un metal precieux passe en core n'y figurerait jamais.

       Ce que le test verrouille : les deux lignes remplacent la classe sans en
       perdre un euro, leurs cibles font celle d'avant, et ni la base ni le total
       des cibles ne bougent. */
    const action = (id, role, qty) => ({
      id, name: role === 'core' ? 'ETF Monde' : 'Une conviction', isin: '',
      symbol: role === 'core' ? 'IWDA' : 'CONV', currency: 'EUR',
      qty, buyPrice: 100, price: 100, fx: 1, fxBuy: 1, account: 'c_pea',
      manual: false, assetClass: 'actions', role,
    });
    const poser = cible => Fixture.poser(e => {
      e.positions = [action('a1', 'core', 70), action('a2', 'satellite', 30)];
      e.targets.classes = { actions: cible };
    });

    poser(90);
    const avant = rebalanceRows();
    const actions = avant.classes.find(c => c.cle === 'classes.actions');
    pres(actions.value, 10000, 'la classe entière vaut ses deux rôles');
    pres(actions.targetPct, 90, 'et porte la cible saisie');

    /* Decoupage au prorata, tel que l'action le calcule : 30 % de satellite sur
       10 000 EUR font 27 %, et le reste, 63, va au core. L'arrondi tombait sur
       le palier de 5 le plus proche — 25 et 65 — tant que la liste deroulante
       n'en proposait pas d'autres ; elle va de 1 en 1 depuis. */
    poser({ core: 63, satellite: 27 });
    const apres = rebalanceRows();
    vrai(!apres.classes.some(c => c.cle === 'classes.actions'),
      'la ligne de classe a disparu de la liste');
    const roles = apres.classes.filter(c => c.classeParente === 'actions');
    eq(roles.length, 2, 'remplacée par ses deux rôles');
    vrai(roles.every(l => !l.sousLignes), 'à plat, sans sous-lignes');
    eq(roles.map(l => l.label).join(' · '),
      `${ASSET_CLASSES.actions} ${ROLES.core.toLowerCase()} · ${ASSET_CLASSES.actions} ${ROLES.satellite.toLowerCase()}`,
      'le libellé porte la classe ET le rôle, sans liste parallèle');
    vrai(roles.every(l => l.label !== ROLES.core && l.label !== ROLES.satellite),
      'jamais « Core » seul : la ligne ne compte pas tout le core du portefeuille');
    pres(roles.reduce((s, l) => s + l.value, 0), actions.value,
      'les deux rôles font l’encours de la classe, sans reste');
    pres(roles.reduce((s, l) => s + l.targetPct, 0), 90,
      'et leurs cibles font celle d’avant le découpage');
    pres(apres.base, avant.base, 'le découpage ne déplace pas la base');
    pres(apres.invested.targetPct, avant.invested.targetPct,
      'ni le total des cibles : num({core:65}) valait zéro avant le correctif');

    const core = roles.find(l => l.role === 'core');
    pres(core.value, 7000, 'le core vaut ses 70 parts');
    pres(core.targetPct, 63, 'et sa propre cible');
    eq(core.cle, 'classes.actions.core', 'sa cible se saisit à trois niveaux de chemin');
  });

  test('la jauge d’une cible ouvre exactement les placements qu’elle compte', () => {
    /* « Actions core, +1 200 EUR a renforcer » ne disait pas laquelle renforcer.
       La barre s'ouvre donc sur ses placements. Ce que ce test verrouille est la
       regle cardinale du projet, appliquee a une fiche de plus : le total de la
       fiche egale la somme de ses lignes, et il egale le montant de la ligne
       affichee sur la page. Deux calculs du meme nombre finissent par diverger,
       et c'est arrive ici trois fois deja, sur trois ecrans differents. */
    const action = (id, role, qty) => ({
      id, name: `${role} ${qty}`, isin: '', symbol: id, currency: 'EUR',
      qty, buyPrice: 100, price: 100, fx: 1, fxBuy: 1, account: 'c_pea',
      manual: false, assetClass: 'actions', role,
    });
    Fixture.poser(e => {
      e.positions = [action('a1', 'core', 70), action('a2', 'satellite', 20),
                     action('a3', 'core', 10)];
      e.targets.classes = { actions: { core: 60, satellite: 30 } };
    });

    const pr = stockTotals().parClasseRole.actions;
    const core = positionsDeCible('classes.actions.core');
    const sat  = positionsDeCible('classes.actions.satellite');
    const tout = positionsDeCible('classes.actions');

    /* Le total de chaque fiche est la somme de ses lignes. */
    for (const [nom, d] of [['core', core], ['satellite', sat], ['la classe', tout]])
      pres(d.total, d.lignes.reduce((s, l) => s + l.valeur, 0),
        `le total de la fiche ${nom} égale la somme de ses lignes`);

    /* Et il egale le montant de la ligne de la page : c'est ce que promet la
       barre sur laquelle on vient de cliquer. */
    pres(core.total, pr.core, 'la fiche core vaut ce que la page affiche en core');
    pres(sat.total, pr.satellite, 'la fiche satellite vaut la ligne satellite');
    pres(tout.total, pr.core + pr.satellite, 'la fiche de classe vaut les deux');
    pres(core.total + sat.total, tout.total,
      'les deux rôles font la classe : aucune position perdue ni comptée deux fois');

    /* Aucune position ne doit manquer ni figurer deux fois : le decoupage par
       role partage l'ensemble, il ne le filtre pas. */
    eq([...core.lignes, ...sat.lignes].map(l => l.i).sort().join(','),
       tout.lignes.map(l => l.i).sort().join(','),
       'les lignes des deux rôles sont exactement celles de la classe');
    eq(new Set(tout.lignes.map(l => l.i)).size, tout.lignes.length,
       'et aucune n’y figure deux fois');

    /* L'index doit pointer la position nommee : c'est lui qui ouvre la fiche, et
       un index decale ouvrirait tranquillement la fiche du voisin. */
    for (const l of tout.lignes)
      eq(Store.state.positions[l.i]?.name, l.nom,
        `l’index de « ${l.nom} » ouvre bien sa fiche`);

    /* Une classe entiere melange les deux roles : la fiche le dit ligne par
       ligne, sinon on ne saurait pas si la classe vaut d'etre decoupee. */
    eq(new Set(tout.lignes.map(l => l.role)).size, 2,
      'la fiche de classe porte le rôle de chaque ligne');

    /* Ce qui n'est pas fait de positions ne rend pas de fiche : la tresorerie a
       la sienne, poche par poche, et une cle inventee ne doit rien ouvrir. */
    for (const cle of [CLE_TRESORERIE, 'classes.inconnue', 'classes.actions.milieu', '', null])
      eq(positionsDeCible(cle), null, `« ${cle} » n’ouvre pas de fiche de placements`);
  });

  test('« Satellite » ne compte pas la même chose selon la barre qu’on ouvre', () => {
    /* Deux barres de la page Objectifs portent le mot « Satellite », et elles ne
       comptent pas le meme argent : la carte des roles compte tous les
       satellites, la ligne de cible ne compte que ceux d'une classe. L'ecart,
       c'est l'or, la crypto, tout ce qui n'est pas une action.

       C'est exactement le defaut que ce projet a corrige trois fois — un meme
       libelle pour deux montants — sauf qu'ici les deux sont voulus. Ce qui le
       rend supportable est que chaque fiche dise ce qu'elle compte, et c'est ce
       que ce test verrouille : la fiche de role nomme la classe de chaque ligne,
       et la somme des fiches de classe fait la fiche de role. */
    const pos = (id, classe, role, qty) => ({
      id, name: `${classe} ${role}`, isin: '', symbol: id, currency: 'EUR',
      qty, buyPrice: 100, price: 100, fx: 1, fxBuy: 1, account: 'c_pea',
      manual: false, assetClass: classe, role,
    });
    Fixture.poser(e => {
      e.positions = [pos('a1', 'actions', 'core', 70), pos('a2', 'actions', 'satellite', 20),
                     pos('m1', 'metaux', 'satellite', 10)];
    });

    const roleSat = positionsDeRole('satellite');
    const cibleSat = positionsDeCible('classes.actions.satellite');

    pres(roleSat.total, 3000, 'le rôle compte les actions ET les métaux satellites');
    pres(cibleSat.total, 2000, 'la ligne de cible ne compte que les actions');
    vrai(roleSat.total !== cibleSat.total,
      'les deux « Satellite » de la page sont bien deux ensembles');

    /* La carte des roles affiche ce meme montant : la fiche ne doit pas dire
       autre chose que la barre sur laquelle on a clique. */
    const barre = rebalanceRoles().roles.find(r => r.cle === 'satellite');
    pres(roleSat.total, barre.value, 'la fiche vaut ce que la barre affiche');
    pres(roleSat.total, roleSat.lignes.reduce((s, l) => s + l.valeur, 0),
      'et ce total est la somme de ses lignes');

    /* Une fiche de role melange les classes : elle doit les nommer, sinon deux
       lignes de meme montant seraient indiscernables. */
    eq(new Set(roleSat.lignes.map(l => l.classe)).size, 2,
      'la fiche de rôle porte la classe de chaque ligne');
    eq(roleSat.label, ROLES.satellite,
      '« Satellite » tout court est juste ici : la barre compte bien tout le satellite');

    /* Les classes decoupent le role sans reste : c'est ce qui permet de passer
       d'une barre a l'autre sans perdre un euro. */
    const parClasse = Object.keys(ASSET_CLASSES)
      .map(c => positionsDeCible(`classes.${c}.satellite`).total)
      .reduce((s, v) => s + v, 0);
    pres(parClasse, roleSat.total,
      'la somme des satellites de chaque classe fait le satellite entier');

    /* Le core suit la meme regle, et la tresorerie n'a pas de role. */
    pres(positionsDeRole('core').total, 7000, 'le core se compte de la même façon');
    pres(positionsDeRole('core').total + roleSat.total,
      Store.state.positions.reduce((s, p) => s + posValue(p), 0),
      'les deux rôles couvrent toutes les positions, sans reste ni doublon');
    for (const cle of [CLE_TRESORERIE, 'classes.actions', 'milieu', '', null])
      eq(positionsDeRole(cle), null, `« ${cle} » n’est pas un rôle`);
  });

  test('toute classe d’actif ouvre sa fiche, sans exception à écrire', () => {
    /* Le meme piege que partout : une table de correspondance ecrite a la main
       aurait sorti en silence toute classe ajoutee a ASSET_CLASSES et pas
       recopiee. Le balayage vaut donc pour les classes futures. */
    Fixture.poser();
    const parClasse = stockTotals().parClasse;
    for (const cle of Object.keys(ASSET_CLASSES)) {
      const d = positionsDeCible(`classes.${cle}`);
      vrai(d, `${cle} doit rendre une fiche`);
      pres(d.total, parClasse[cle],
        `la fiche de ${cle} vaut son encours, pas un calcul parallèle`);
      pres(d.total, d.lignes.reduce((s, l) => s + l.valeur, 0),
        `et ce total est la somme de ses lignes`);
      eq(d.label, ASSET_CLASSES[cle], `et elle s’intitule comme la classe`);
      for (const role of ['core', 'satellite']) {
        const r = positionsDeCible(`classes.${cle}.${role}`);
        vrai(r.label.startsWith(ASSET_CLASSES[cle]),
          `« ${r.label} » doit nommer sa classe, pas seulement son rôle`);
      }
    }
  });

  test('une cible se règle de 1 en 1 : 92 % doit être proposé', () => {
    /* Le pas etait de 5, au motif que personne ne vise 63 % d'actions. C'etait
       faux : une cible se deduit souvent des autres. Qui pose 3 % d'or et 5 % de
       crypto a 92 % a repartir, et le pas de 5 lui refusait de l'ecrire — le
       total devait tomber juste a 100 avec un outil qui comptait de cinq en cinq.

       `paliersCible()` vit dans app.js, que le harnais ne charge pas. Elle ne
       depend que de `num`, donc on la reconstruit depuis la source et on
       l'execute pour de vrai, plutot que de chercher « v += 1 » dans du texte. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const m = src.match(/function paliersCible\(courant\) \{[\s\S]*?\n\}/);
    vrai(m, 'paliersCible() doit être trouvable dans la source');
    const paliersCible = new Function('num', `${m[0]}; return paliersCible;`)(num);

    const p = paliersCible(0);
    eq(p.length, 101, 'de 0 à 100 inclus, un palier par point');
    for (const v of [1, 3, 7, 47, 92, 99])
      vrai(p.includes(v), `${v} % doit pouvoir se choisir`);
    eq(p[0], 0, 'zéro est une décision, il reste dans la liste');
    eq(p[p.length - 1], 100, 'et cent aussi');

    /* Une valeur non entiere deja enregistree ne doit pas etre ecrasee par le
       premier rendu : la liste l'accueille telle quelle, a sa place. */
    const q = paliersCible(62.5);
    vrai(q.includes(62.5), 'une cible à 62,5 % survit à l’affichage');
    eq(q.indexOf(62.5), q.indexOf(62) + 1, 'et se range entre 62 et 63');
    eq(paliersCible(140).filter(v => v > 100).length, 0,
      'une valeur hors bornes ne crée pas de palier au-delà de 100');

    /* Et le decoupage d'une classe suit le meme pas : il arrondissait au palier
       de 5 tant que la liste n'en offrait pas d'autres. Une classe a 90 %
       detenue 70/30 se coupait en 65 et 25, la ou le prorata dit 63 et 27. */
    const p7030 = partageDeCible(90, { core: 7000, satellite: 3000 });
    eq(p7030.satellite, 27, 'le prorata donne 27, pas le palier de 5 le plus proche');
    eq(p7030.core, 63, 'et le reste va au core');
    eq(p7030.core + p7030.satellite, 90,
      'la somme vaut la cible d’avant : le total de la page ne bouge pas');

    /* La somme doit valoir la cible quelle que soit la repartition, sinon le
       decoupage deplacerait le total des cibles sans le dire. */
    for (const cible of [0, 1, 7, 33, 90, 100])
      for (const sat of [0, 1, 137, 4999, 10000])
        eq(partageDeCible(cible, { core: 10000 - sat, satellite: sat }).core
         + partageDeCible(cible, { core: 10000 - sat, satellite: sat }).satellite,
           cible, `${cible} % partagé sur ${sat} de satellite reste ${cible} %`);

    /* Une classe qu'on ne detient pas encore n'a pas de prorata : tout au core,
       plutot qu'une division par zero qui donnerait NaN dans les deux champs. */
    const vide = partageDeCible(40, { core: 0, satellite: 0 });
    eq(vide.core, 40, 'sans encours, la cible entière va au core');
    eq(vide.satellite, 0, 'et rien au satellite');
  });

  test('un nom de fonds se reconnaît, et l’utilisateur garde le dernier mot', () => {
    /* La detection lisait `/\b(etf|ucits|msci|s&p|index|indice|world)\b/` : sept
       noms de fonds courants sur quatorze passaient pour des actions en direct,
       dont « Future of Defence », une ligne reelle du portefeuille de
       Le propriétaire. Il a demande si le champ Nature ne devrait pas etre
       automatique et verrouille — la reponse est non, parce qu'une regle sur un
       nom se trompe, mais elle ne doit pas se tromper une fois sur deux.

       L'emetteur manquait, et c'est le signal le plus fiable : personne
       n'appelle une action « Amundi » ni « iShares ». */
    const fonds = ['Amundi MSCI World', 'Lyxor Nasdaq-100', 'iShares Core S&P 500',
      'Vanguard FTSE All-World', 'SPDR Gold Shares', 'Amundi Euro Stoxx 50',
      'BNP Paribas Easy CAC 40', 'iShares Physical Gold',
      'Xtrackers DAX', 'Invesco EQQQ', 'VanEck Semiconductor UCITS ETF'];
    const titres = ['Meta', 'Nvidia', 'LVMH', 'Air Liquide', 'Berkshire Hathaway',
      'Accenture', 'Realty Income Real Estate Investment Trust'];

    for (const n of fonds)
      eq(natureDe({ name: n }), 'fonds', `« ${n} » doit se lire comme un fonds`);
    for (const n of titres)
      eq(natureDe({ name: n }), 'titre', `« ${n} » doit rester un titre en direct`);

    /* Et les indecidables, qui justifient le menu a eux seuls. Un ETF thematique
       nomme d'apres sa seule strategie ne porte ni emetteur, ni habillage
       juridique, ni indice : rien dans « Future of Defence » ne le distingue du
       nom d'une societe. Aucune regle sur un nom ne tranchera jamais ce cas, et
       c'est pourquoi le champ Nature reste ouvert au lieu d'etre verrouille.
       Le test ne demande donc pas le bon resultat : il demande que le repli soit
       le moins dommageable — « titre en direct », qui n'invente aucune
       diversification que la ligne n'aurait pas. */
    for (const n of ['Future of Defence', 'Global Clean Energy', 'Cybersecurity'])
      eq(natureDe({ name: n }), 'titre',
        `« ${n} » est indécidable : le repli prudent est « titre en direct »`);

    /* Les deux pieges que la table doit eviter : « Trust » figure dans le nom
       d'une fonciere americaine, et « Accenture » commence par « acc », suffixe
       de classe de parts. */
    eq(natureDe({ name: 'Realty Income Real Estate Investment Trust' }), 'titre',
      'un REIT est une action, malgré le mot Trust');
    eq(natureDe({ name: 'Accenture' }), 'titre', 'et Accenture n’est pas une part « acc »');

    /* La hierarchie des sources : ce que l'utilisateur declare gagne sur la
       passerelle, qui gagne sur la lecture du nom. C'est ce qui justifie de
       garder le menu ouvert. */
    eq(natureDe({ name: 'Amundi MSCI World', nature: 'titre' }), 'titre',
      'le choix de l’utilisateur passe devant tout');
    eq(natureDe({ name: 'Meta', kind: 'ETF' }), 'fonds',
      'la passerelle passe devant la lecture du nom');
    eq(natureDe({ name: 'Meta', kind: 'ETF', nature: 'titre' }), 'titre',
      'et l’utilisateur passe devant la passerelle');
  });

  test('une charge fixe se ramène au mois, quelle que soit sa périodicité', () => {
    /* Deux periodicites seulement, « mois » ou « an », obligeaient a diviser de
       tete un loyer de garage trimestriel puis a refaire le calcul a chaque
       changement de tarif — ce que cette table existe pour eviter.

       Le facteur est le nombre de mois que couvre un versement. La semaine vaut
       52/12 et non 4 : douze mois de quatre semaines feraient quarante-huit
       semaines, et une charge hebdomadaire serait sous-estimee de 8 % par an. */
    const mensuel = (montant, period) => auMois(montant, { period });
    pres(mensuel(100, 'mois'), 100, 'un montant mensuel est son propre équivalent');
    pres(mensuel(1200, 'an'), 100, 'annuel : divisé par douze');
    pres(mensuel(300, 'trimestre'), 100, 'trimestriel : divisé par trois');
    pres(mensuel(600, 'semestre'), 100, 'semestriel : divisé par six');
    pres(mensuel(30, 'semaine'), 130, 'hebdo : 30 EUR par semaine font 130 EUR par mois');

    /* 52/12 et non 4 : l'ecart se voit sur l'annee. */
    pres(mensuel(30, 'semaine') * 12, 1560, 'soit 52 semaines de 30 EUR sur l’année');

    /* Une periode inconnue — un etat d'avant, un export bricole — retombe sur le
       mois, la valeur qui ne deforme rien. */
    pres(mensuel(100, undefined), 100, 'périodicité absente : traitée au mois');
    pres(mensuel(100, 'lustre'), 100, 'périodicité inconnue : traitée au mois');
    eq(chargePeriode({ period: 'trimestre' }), 'trimestre', 'une période connue est gardée');
    eq(chargePeriode({ period: 'lustre' }), 'mois', 'une inconnue retombe sur le mois');

    /* Chaque periodicite proposee a son libelle et son facteur : une entree
       ajoutee a la liste sans facteur donnerait une division par `undefined`. */
    for (const [cle, label, mois] of CHARGE_PERIODES) {
      vrai(!!label, `${cle} porte un libellé`);
      vrai(mois > 0, `${cle} porte un nombre de mois couverts`);
      pres(CHARGE_MOIS_COUVERTS[cle], mois, `${cle} est dans la table de conversion`);
    }

    /* Le total des charges additionne des periodes differentes : il doit tout
       ramener au mois, sinon une assurance annuelle pese douze fois son poids. */
    Fixture.poser(e => {
      e.budget.fixedCharges = [
        { label: 'Loyer', amount: 800, period: 'mois' },
        { label: 'Assurance', amount: 1200, period: 'an' },
        { label: 'Garage', amount: 300, period: 'trimestre' },
      ];
    });
    pres(fixedTotal(), 1000, '800 + 100 + 100 par mois');
  });

  test('chaque poche de cash a sa propre définition', () => {
    /* Sur la carte du haut de Patrimoine, « Cash disponible » et « Épargne de
       précaution » ouvraient la même fiche sans argument : on cliquait une
       ligne de 20 EUR et on obtenait les 5 126 EUR des quatre poches. Le total
       était juste, la question posée n'était pas celle à laquelle on répondait.

       Le modèle porte déjà la découpe, `pochesLiquidites()`. Ce test verrouille
       ce dont la fiche a besoin : chaque poche est identifiable, nommée, et la
       somme des quatre fait les liquidités entières — donc filtrer sur l'une
       d'elles ne peut ni perdre ni compter deux fois un euro. */
    Fixture.poser();
    const poches = pochesLiquidites();
    eq(poches.length, AFFECTATIONS.length, 'une entrée par affectation déclarée');
    for (const p of poches) {
      vrai(!!AFFECTATION_LABEL[p.cle], `${p.cle} porte un libellé partagé`);
      eq(p.nom, AFFECTATION_LABEL[p.cle], 'et la fiche le nommera comme la carte');
    }
    /* La somme des poches égale les liquidités : c'est ce qui rend le filtrage
       honnête. Si une poche débordait sur une autre, une fiche restreinte
       afficherait un montant introuvable ailleurs. */
    const p = patrimoine();
    pres(poches.reduce((s, x) => s + x.value, 0), p.classes.liquidites,
      'les quatre poches font les liquidités, sans reste');

    /* Les clés sont distinctes : deux poches partageant une clé rendraient le
       filtre ambigu. */
    eq(new Set(poches.map(x => x.cle)).size, poches.length, 'quatre clés distinctes');
  });

  test('la trésorerie se retire comme une classe', () => {
    /* Quelqu'un qui place tout le jour meme garde une ligne « Cash a investir »
       a zero, sous un intitule de groupe, pour rien. Elle se retire donc, par la
       meme liste d'exclusions que les classes — un seul mecanisme, donc un seul
       chemin de retour.

       Ce que le test verrouille, et qui est le piege de ce genre d'ajout : sa
       cible ne vit pas dans `classes` mais a la racine, `targets.cashToInvest`.
       Si la somme des cibles continuait de la compter, les classes restantes ne
       pourraient plus jamais faire 100 %, et le bandeau aurait accuse
       l'utilisateur d'une erreur qui n'existe pas. */
    Fixture.poser(e => {
      e.targets.classes = { actions: 90, metaux: 5 };
      e.targets.cashToInvest = 5;
      e.targets.exclues = [];
    });
    const tg = Store.state.targets;
    pres(sommeCibles(), 100, 'départ à 100 %, trésorerie comprise');
    const baseAvant = rebalanceRows().base;
    vrai(!!rebalanceRows().cash, 'la ligne de trésorerie est là');

    /* Le retrait, tel que la vue l'appelle. */
    tg.exclues = [CLE_TRESORERIE];
    tg.ciblesRetirees = { [CLE_TRESORERIE]: tg.cashToInvest };
    tg.cashToInvest = 0;

    const r = rebalanceRows();
    eq(r.cash, null, 'plus de ligne à dessiner, donc plus d’intitulé de groupe');
    vrai(r.cashSorti, 'et la vue sait qu’elle est sortie');
    pres(sommeCibles(), 95, 'les 5 % de trésorerie quittent le total des cibles');
    pres(r.base, baseAvant - Fixture.CASH_A_INVESTIR,
      'son encours quitte la base, comme celui d’une classe sortie');
    eq(r.exclues.map(x => x.label).join(), AFFECTATION_LABEL.investir,
      'elle se nomme dans la phrase de périmètre, pas « undefined »');
    pres(r.exclues[0].value, Fixture.CASH_A_INVESTIR, 'avec son montant');

    /* Le retour restitue la cible mise de cote, a la racine et non dans
       `classes` — s'y tromper aurait cree une classe fantome « cashToInvest ». */
    tg.exclues = [];
    tg.cashToInvest = tg.ciblesRetirees[CLE_TRESORERIE];
    delete tg.ciblesRetirees[CLE_TRESORERIE];
    pres(num(Store.state.targets.cashToInvest), 5, 'la cible revient à sa place');
    vrai(!('cashToInvest' in Store.state.targets.classes),
      'et pas dans les classes, où elle serait devenue une classe d’actif');
    pres(sommeCibles(), 100, 'le total retrouve ses 100 %');
    pres(rebalanceRows().base, baseAvant, 'et la base son montant d’origine');

    /* Le libelle partage, pour que les messages ne disent pas « undefined ». */
    eq(nomDeLaCible(CLE_TRESORERIE), AFFECTATION_LABEL.investir,
      'la trésorerie porte son nom dans les messages');
    eq(nomDeLaCible('actions'), ASSET_CLASSES.actions, 'et une classe le sien');
  });

  test('retirer une classe ne détruit pas sa cible', () => {
    /* Le ✕ d'une classe mettait sa cible a zero. Avec un decoupage par role,
       « 70 % de core, 20 % de satellite » devenait `0` — un seul nombre — et
       remettre la classe rendait une ligne vide. Le propriétaire a retire
       « Actions » et cru la perte definitive : le chemin de retour vivait dans
       une phrase de prose, pas dans le bouton qui parle d'ajouter une classe.

       Un geste reversible ne doit rien detruire en chemin. La cible part dans
       `ciblesRetirees` et revient telle quelle, decoupage compris. */
    Fixture.poser(e => {
      e.targets.classes = { actions: { core: 70, satellite: 20 }, metaux: 5 };
      e.targets.cashToInvest = 5;
      e.targets.exclues = [];
    });
    const tg = Store.state.targets;
    pres(sommeCibles(), 100, 'départ à 100 %');

    /* Le retrait, tel que la vue l'appelle. */
    tg.exclues = ['actions'];
    tg.ciblesRetirees = { actions: tg.classes.actions };
    tg.classes.actions = 0;
    pres(sommeCibles(), 10, 'la classe sortie ne compte plus dans le total');
    vrai(!rebalanceRows().classes.some(c => c.cle === 'classes.actions'),
      'et sa ligne quitte la liste');

    /* Le retour. */
    tg.exclues = [];
    tg.classes.actions = tg.ciblesRetirees.actions;
    delete tg.ciblesRetirees.actions;
    eq(JSON.stringify(tg.classes.actions), '{"core":70,"satellite":20}',
      'le découpage par rôle revient tel quel');
    pres(sommeCibles(), 100, 'et le total retrouve ses 100 %');

    const roles = rebalanceRows().classes.filter(c => c.classeParente === 'actions');
    eq(roles.length, 2, 'les deux lignes de rôle sont de retour');
    pres(roles.reduce((s, l) => s + l.targetPct, 0), 90, 'avec leurs 90 % partagés');

    /* `sommeCibleDe` sert aux vues pour annoncer la cible gardee : elle doit
       descendre dans l'objet, sinon le toast annoncerait « cible 0 % ». */
    pres(sommeCibleDe({ core: 70, satellite: 20 }), 90, 'la cible gardée s’annonce entière');
    pres(sommeCibleDe(5), 5, 'et un nombre reste lui-même');
  });

  test('la somme des cibles descend dans une classe découpée', () => {
    /* Le bandeau annonçait « tes cibles totalisent 10 %, il en manque 90 » à
       quelqu'un qui venait d'en poser 105 : trois copies du calcul sommaient
       avec `num(v)`, et `num({core:70, satellite:25})` vaut zéro. La classe
       découpée disparaissait donc du total, et la seule copie juste était celle
       du pied de carte — deux totaux contradictoires sur le même écran.

       Une seule définition maintenant, `sommeCibles()`, que le bandeau, le pied
       de carte, la fenêtre « Suivre une classe » et le contrôle de cohérence
       partagent. Le test la compare au pied de carte, qui a toujours été juste :
       si une quatrième copie réapparaît, elle divergera ici. */
    const poser = cible => Fixture.poser(e => {
      e.positions = [
        { id: 'a1', name: 'ETF Monde', isin: '', symbol: 'IWDA', currency: 'EUR',
          qty: 70, buyPrice: 100, price: 100, fx: 1, fxBuy: 1, account: 'c_pea',
          manual: false, assetClass: 'actions', role: 'core' },
        { id: 'a2', name: 'Une conviction', isin: '', symbol: 'CONV', currency: 'EUR',
          qty: 30, buyPrice: 100, price: 100, fx: 1, fxBuy: 1, account: 'c_pea',
          manual: false, assetClass: 'actions', role: 'satellite' },
      ];
      e.targets.classes = { actions: cible, metaux: 5 };
      e.targets.cashToInvest = 5;
    });

    poser(90);
    pres(sommeCibles(), 100, 'cible entière : 90 + 5 + 5');

    poser({ core: 70, satellite: 25 });
    pres(sommeCibles(), 105, 'découpée : 70 + 25 + 5 + 5, et non 10');
    pres(sommeCibles(), rebalanceRows().invested.targetPct + num(Store.state.targets.cashToInvest),
      'même total que le pied de carte, à la définition près');

    /* Une classe sortie du rééquilibrage ne compte plus : son encours a quitté
       la base, lui réclamer une part de 100 % n'aurait pas de sens. */
    Store.state.targets.exclues = ['metaux'];
    pres(sommeCibles(), 100, 'la classe hors jeu quitte aussi le total des cibles');
  });

  test('chaque classe d’actif est câblée partout', () => {
    /* Trois tables suivaient ASSET_CLASSES en étant écrites à la main : la
       poche du patrimoine où la classe atterrit, sa teinte, et son encours dans
       le rééquilibrage. Ajouter une classe sans penser à l'une des trois la
       faisait disparaître en silence — sortie de la base, les pourcentages ne
       totalisaient plus 100 % et rien ne le disait.

       Ce test remplace la vigilance : il parcourt la table de référence, donc
       il tombera sur la classe qu'on ajoutera demain. */
    for (const [cle, label] of Object.entries(ASSET_CLASSES)) {
      vrai(!!label && !/^\s*$/.test(label), `${cle} porte un libellé`);
      const poche = pocheDeClasse(cle);
      vrai(['actions', 'obligations', 'crypto', 'liquidites'].includes(poche),
        `${cle} tombe dans une poche connue du patrimoine, pas ${poche}`);
      vrai(cle in TEINTE_CLASSE, `${cle} a une teinte, sinon sa barre serait grise`);
      vrai(/^var\(--series-\d\)$/.test(couleurClasse(cle)), `${cle} rend une couleur valide`);
      vrai(cle in stockTotals().parClasse, `${cle} a un encours dans le rééquilibrage`);
      /* Une classe cotée n'est jamais rangée dans la poche « immobilier » ni
         « nonCote » : celles-là sont réputées lentes à vendre, et y ranger un
         REIT aurait fait mentir l'autonomie financière de tout son montant. */
      vrai(poche !== 'immobilier' && poche !== 'nonCote',
        `${cle} est coté, il ne peut pas être rangé dans une poche lente`);
    }
  });

  test('la clé d’un ISIN se calcule, donc une faute se répare', () => {
    /* Cas reel : `US67066G104D` saisi pour Nvidia. Le douzieme caractere d'un
       ISIN est toujours un chiffre — un « D » y est impossible par construction —
       et il se calcule a partir des onze premiers. L'application acceptait le
       code avec un simple toast, puis le signalait comme une erreur dans les
       controles de coherence : elle se contredisait, et ne disait jamais quel
       code il fallait ecrire alors qu'elle pouvait le calculer.

       `isinIsValid` faisait deja ce calcul, pour le jeter aussitot. */
    eq(cleIsin('US67066G104'), '0', 'la clé de NVIDIA vaut zéro');
    eq(isinCorrige('US67066G104D'), 'US67066G1040', 'un D se répare en 0');
    eq(isinCorrige('us67066g104d'), 'US67066G1040', 'et la casse ne gêne pas');
    eq(isinCorrige('US67066G1040'), null, 'un code déjà juste n’a rien à corriger');
    vrai(isinIsValid('US67066G1040'), 'et il est valide');
    vrai(!isinIsValid('US67066G104D'), 'là où l’autre ne l’est pas');

    /* Onze caracteres : la cle manque, elle s'ajoute. C'est l'etat dans lequel
       une saisie interrompue laisse le champ. */
    eq(isinCorrige('US67066G104'), 'US67066G1040', 'un corps sans clé reçoit la sienne');

    /* Rien a proposer sur ce qui n'a pas la forme d'un ISIN : rendre un chiffre
       laisserait croire a une correction possible. */
    for (const nawak of ['', 'BONJOUR', '12', 'U567066G1040', null, undefined])
      eq(cleIsin(nawak), null, `${JSON.stringify(nawak)} n’a pas de clé`);
    eq(isinCorrige('BONJOUR'), null, 'et rien à corriger');

    /* La correction est idempotente : la rejouer ne bouge plus rien. Sinon un
       bouton clique deux fois aurait pu deriver. */
    const une = isinCorrige('US67066G104D');
    eq(isinCorrige(une), null, 'corriger deux fois donne le même code');
    vrai(isinIsValid(une), 'et le résultat est toujours valide');

    /* Sur quelques ISIN reels et bien formes, la cle calculee est celle qui y
       figure : c'est ce qui prouve que le calcul est le bon, et non seulement
       cohérent avec lui-même. */
    for (const bon of ['IE00B4L5Y983', 'FR0000120271', 'US0378331005', 'LU1681043599']) {
      eq(cleIsin(bon), bon[11], `la clé de ${bon} est retrouvée`);
      eq(isinCorrige(bon), null, `${bon} n’a rien à corriger`);
    }
  });

  test('un dépassement de budget se gradue en trois niveaux', () => {
    /* Le graphique peignait en rouge tout mois au-dessus de l'objectif. Sur les
       huit mois saisis, sept l'etaient : une couleur d'alerte qui s'allume
       presque toujours devient decorative, et le mois reellement mauvais ne se
       distinguait plus du mois a 20 EUR pres.

       Le seuil vit dans le modele, donc le graphique et les deux tableaux ne
       peuvent pas en avoir trois lectures. Ce que le test verrouille : les
       bornes exactes, et le fait qu'un mois vide n'ait aucun niveau — le
       compter comme « sous l'objectif » en ferait une reussite alors que rien
       n'est saisi. */
    eq(niveauDepassement(0, 1000), null, 'un mois vide n’a pas de niveau');
    eq(niveauDepassement(null, 1000), null, 'ni un mois absent');
    eq(niveauDepassement(900, 1000), 'sous', 'sous l’objectif');
    eq(niveauDepassement(1000, 1000), 'sous', 'pile dessus, c’est tenu');
    eq(niveauDepassement(1001, 1000), 'leger', 'un euro au-dessus reste léger');
    eq(niveauDepassement(1499, 1000), 'leger', 'juste avant le seuil');
    eq(niveauDepassement(1500, 1000), 'grave', 'le seuil est atteint, pas frôlé');
    eq(niveauDepassement(3000, 1000), 'grave', 'et au-delà');

    /* Sans objectif pose, rien n'est un depassement : reclamer moins que zero
       n'a pas de sens, et tout mois serait devenu grave. */
    eq(niveauDepassement(1200, 0), 'sous', 'pas d’objectif, pas de dépassement');

    /* Le seuil est bien celui qu'annonce la legende de la carte. */
    pres(SEUIL_DEPASSEMENT_GRAVE, 0.5, 'le seuil annoncé à l’écran est celui qui décide');

    /* Sur les vrais niveaux, le graphique et les tableaux partagent la table :
       trois niveaux, trois classes, et aucune n'est celle du vide. */
    for (const [total, attendu] of [[900, 'up'], [1100, 'tiede'], [2000, 'down'], [0, 'muted']])
      eq(classeDepassement(total, 1000), attendu, `${total} EUR doit se peindre en ${attendu}`);
  });


  test('aucun écran ne mélange une poche et une classe de ligne', () => {
    /* Deux paires de teintes reposent sur cette condition, et elle n'etait
       qu'une phrase dans un commentaire : immobilier partage sa couleur avec
       immobilier cote, capital garanti avec multi-actifs, et chaque fois parce
       que l'une est une poche du patrimoine et l'autre une classe de ligne
       cotee. Le jour ou un ecran les met cote a cote, deux choses sans rapport
       portent le meme vert et rien ne le dit.

       Le controle porte sur la source : une fonction qui lit la table des
       poches ne lit pas celle des classes fines, et reciproquement. */
    const src = lireSource('assets/app.js');
    /* Les deux tables ne se lisent jamais dans la meme expression de couleur ni
       dans la meme legende. On regarde ligne a ligne : c'est grossier, et c'est
       exactement ce qu'il faut — une seule ligne qui les nomme toutes les deux
       est le debut du melange. */
    const fautives = src.split('\n')
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => /CLASSES_ACTIFS\[/.test(l) && /ASSET_CLASSES\[/.test(l));
    eq(fautives.map(f => f.n).join(', '), '',
      'ces lignes nomment une poche et une classe fine ensemble : la paire de '
      + 'teintes cesse alors d’être sûre');
    /* Et les deux membres de chaque paire restent bien de vocabulaires
       differents : celui qui passerait de l'un a l'autre ferait tomber la
       garantie sans que rien d'autre ne bouge. */
    for (const [a, b] of [['immobilier', 'immobilierCote'], ['garanti', 'diversifie']]) {
      const poche = a in CLASSES_ACTIFS, fine = b in ASSET_CLASSES;
      vrai(poche && fine, `${a} doit rester une poche et ${b} une classe de ligne`);
      vrai(!(a in ASSET_CLASSES), `${a} ne peut pas être aussi une classe de ligne`);
      vrai(!(b in CLASSES_ACTIFS), `${b} ne peut pas être aussi une poche`);
    }
  });

  test('un actif porte la même couleur partout', () => {
    /* La couleur est le seul repère qui traverse les écrans sans être écrit :
       on reconnaît l'immobilier à sa teinte avant de lire son nom. Deux listes
       de teintes écrites à la main avaient déjà divergé — les obligations
       étaient `series-6` d'un côté et `series-7` de l'autre, et un studio se
       peignait de la couleur d'un ETC or dans « Allocation par actif », où les
       deux apparaissent côte à côte.

       Ce test verrouille trois choses : une seule table attribue les teintes,
       deux classes différentes ne partagent jamais une teinte sauf paire
       déclarée, et toute fonction qui distribue des couleurs passe par cette
       table. */

    /* 1. Les paires volontaires, et rien d'autre. Liquidités et monétaire sont
          le même argent vu de deux étages ; immobilier et immobilier coté ont
          le même sous-jacent. Toute autre collision est un accident. */
    /* La troisième paire suit le motif de la deuxième : une poche du patrimoine
       et une classe de ligne cotée, qui ne se rencontrent sur aucun graphique.
       Elle n'a pas été choisie, elle a été subie — mesuré en balayant teinte,
       saturation et clarté contre les neuf séries et les cinq couleurs de sens,
       le meilleur écart atteignable sur tout le cercle vaut 17,6° en thème
       clair et 19,1° en sombre, quand la règle en exige 20. Le cercle est
       plein, et le test qui suit garde la condition qui rend la paire sûre. */
    const paires = [['liquidites', 'monetaire'], ['immobilier', 'immobilierCote'],
                    ['garanti', 'diversifie']];
    const memeCouple = (a, b) => paires.some(p => p.includes(a) && p.includes(b));
    const cles = Object.keys(TEINTE_CLASSE);
    for (const a of cles) {
      for (const b of cles) {
        if (a >= b) continue;
        if (TEINTE_CLASSE[a] !== TEINTE_CLASSE[b]) continue;
        vrai(memeCouple(a, b), `${a} et ${b} partagent une teinte sans raison déclarée`);
      }
    }

    /* 2. Chaque teinte attribuée existe vraiment dans la feuille de style. Une
          classe pointant sur `--series-13` rendrait une couleur vide, donc une
          barre transparente : invisible au test, visible à l'écran. */
    for (const cle of cles) {
      const n = TEINTE_CLASSE[cle];
      vrai(n >= 1 && n <= TEINTES_DISPONIBLES,
        `${cle} pointe sur --series-${n}, hors des ${TEINTES_DISPONIBLES} teintes déclarées`);
      const resolue = getComputedStyle(document.documentElement)
        .getPropertyValue(`--series-${n}`).trim();
      vrai(/^#[0-9a-f]{6}$/i.test(resolue),
        `--series-${n} doit être une couleur, reçu « ${resolue} » pour ${cle}`);
    }

    /* 3. Une classe inconnue tombe sur la teinte « sans classe » et non sur
          celle d'une vraie classe : elle se lit comme non classée. */
    eq(couleurClasse('unePoubelleInconnue'), `var(--series-${TEINTE_SANS_CLASSE})`,
      'une classe sans attribution ne vole pas la couleur d’une autre');
    vrai(!Object.values(TEINTE_CLASSE).includes(TEINTE_SANS_CLASSE),
      'et cette teinte de repli n’est attribuée à aucune classe');

    /* 4. Le même libellé ne peut pas porter deux couleurs, à travers toutes les
          fonctions qui en distribuent. C'est la formulation exacte de la règle :
          un actif, une couleur, partout. */
    Fixture.poser();
    const vues = [];
    for (const x of repartitionClasses()) vues.push(['répartition', x.label, x.couleur]);
    for (const x of allocationByAsset()) vues.push(['par actif', x.label, x.couleur]);
    for (const x of stockTotals().parClasse ? [] : []) vues.push(x);
    const rr = rebalanceRoles();
    for (const r of rr.roles || []) {
      for (const c of (rr.composition && rr.composition[r.cle]) || [])
        vues.push(['composition', c.label || c.classe, c.couleur]);
    }
    const parLibelle = new Map();
    for (const [ou, label, couleur] of vues) {
      if (!couleur) continue;
      if (!parLibelle.has(label)) { parLibelle.set(label, { couleur, ou }); continue; }
      const vu = parLibelle.get(label);
      eq(couleur, vu.couleur,
        `« ${label} » est ${vu.couleur} dans ${vu.ou} et ${couleur} dans ${ou}`);
    }
    vrai(parLibelle.size > 3, 'le test doit avoir vu plusieurs libellés, sinon il ne prouve rien');
  });

  test('un REIT n’est plus compté comme une action', () => {
    /* Une foncière est cotée, vendable en séance, mais son risque est
       l'immobilier. Tout cela tombait dans « Actions » : 20 % de foncières se
       lisaient comme 20 % d'actions de plus, et l'écart affiché envoyait
       renforcer une classe déjà pleine. */
    const ligne = (id, classe, qty) => ({
      id, name: classe === 'immobilierCote' ? 'ETF Foncières' : 'ETF Monde',
      isin: '', symbol: classe === 'immobilierCote' ? 'REIT' : 'IWDA', currency: 'EUR',
      qty, buyPrice: 100, price: 100, fx: 1, fxBuy: 1, account: 'c_cto',
      manual: false, assetClass: classe, role: 'core',
    });
    Fixture.poser(e => {
      e.positions = [ligne('a1', 'actions', 60), ligne('a2', 'immobilierCote', 20),
                     ligne('a3', 'diversifie', 20)];
      e.targets.classes = { actions: 60, immobilierCote: 20, diversifie: 20 };
      e.targets.cashToInvest = 0;
    });
    const t = stockTotals();
    pres(t.parClasse.actions, 6000, 'les actions ne comptent que les actions');
    pres(t.parClasse.immobilierCote, 2000, 'la foncière a sa propre ligne');
    pres(t.parClasse.diversifie, 2000, 'le fonds mixte aussi');
    pres(t.invested, 10000, 'et le total des classes fait toujours le total investi');

    const r = rebalanceRows();
    const parNom = Object.fromEntries(r.classes.map(c => [c.label, c]));
    pres(parNom[ASSET_CLASSES.immobilierCote].value, 2000, 'la ligne d’immobilier coté est là');
    pres(parNom[ASSET_CLASSES.diversifie].value, 2000, 'la ligne multi-actifs aussi');
    pres(r.classes.reduce((s, c) => s + c.value, 0), r.invested.value,
      'et la somme des lignes fait le placé en bourse, sans reste');
    pres(sommeCibles(), 100, 'les trois cibles font 100 %');
    /* Les écarts s'annulent sur la base entière, trésorerie comprise : le
       fixture porte du cash à investir, qui entre dans la base et tire les
       trois classes vers le bas. Sommer les seules classes laissait un reste
       égal à ce cash, et l'assertion accusait le calcul de ce qu'elle oubliait. */
    pres(r.classes.reduce((s, c) => s + c.delta, 0) + r.cash.delta, 0,
      'à cibles exactes, ce qu’il faut acheter finance exactement ce qu’il faut vendre');

    /* Le sous-jacent est de l'immobilier, mais la liquidité est celle d'un
       titre : la poche du patrimoine est « actifs de marché », pas
       « immobilier ». Sinon l'autonomie financière compterait ces 2 000 EUR
       comme vendables en quelques mois. */
    eq(pocheDeClasse('immobilierCote'), 'actions',
      'un REIT reste un actif de marché pour la disponibilité');
  });

  test('la composition d’un rôle sépare la classe de la nature', () => {
    /* Ce que la phrase de synthese doit pouvoir agreger. `composition` est
       indexee par classe ET par nature : une classe detenue a la fois en fonds
       et en direct y occupe deux entrees. La phrase prenait la premiere et
       l'annoncait comme la classe entiere — « 57 % actions » quand les actions
       faisaient 83 % des satellites. Le chiffre etait juste, son intitule
       mentait.

       Le fixture pose exactement ce cas : deux lignes d'actions satellites, un
       fonds et un titre en direct. */
    const ligne = (id, nature, qty) => ({
      id, name: nature === 'fonds' ? 'ETF Small Caps' : 'Une société',
      isin: '', symbol: nature === 'fonds' ? 'SMALL' : 'SOC', currency: 'EUR',
      qty, buyPrice: 100, price: 100, fx: 1, fxBuy: 1, account: 'c_cto',
      manual: false, assetClass: 'actions', role: 'satellite', nature,
    });
    Fixture.poser(e => { e.positions = [ligne('s1', 'fonds', 11), ligne('s2', 'direct', 24)]; });
    const rr = rebalanceRoles();
    const sat = rr.composition.satellite || [];
    vrai(sat.length >= 2, 'la même classe en deux natures fait deux entrées');
    eq([...new Set(sat.map(x => x.classe))].length, 1, 'et une seule classe');
    /* L'agregation par classe vaut le total du role : c'est ce que la phrase
       annonce, et ce que la premiere entree seule ne valait pas. */
    const parClasse = new Map();
    for (const p of sat) parClasse.set(p.classe, (parClasse.get(p.classe) || 0) + p.value);
    const total = rr.roles.find(x => x.cle === 'satellite').value;
    pres([...parClasse.values()][0], total, 'la classe agrégée fait tout le rôle');
    vrai(sat[0].value < total,
      'alors que la première entrée seule en vaut moins : c’était le bug');
  });

  test('deux titres homonymes gardent chacun leur identité', () => {
    /* Le bug : l'ecran retrouvait une ligne du jour par son nom avec .find().
       Le meme titre sur deux comptes — un MSCI World au PEA et au CTO —
       recevait deux fois le poids et la fiche du premier. Le nom est un
       libelle, jamais une identite : dayPerformance porte l'indice reel. */
    const homonyme = (id, qty, compte) => ({
      id, name: 'MSCI World', isin: '', symbol: 'IWDA', currency: 'EUR',
      qty, buyPrice: 80, price: 90, prevClose: 88, fx: 1, fxBuy: 1,
      account: compte, manual: false, assetClass: 'actions', role: 'core',
    });
    Fixture.poser(e => {
      e.positions = [homonyme('h1', 10, 'c_pea'), homonyme('h2', 3, 'c_cto')];
    });
    const j = dayPerformance();
    eq(j.lignes.length, 2, 'deux lignes, pas une');
    const idx = j.lignes.map(l => l.index).sort();
    eq(String(idx), '0,1', 'chaque ligne pointe sa propre position');
    /* Et les valeurs different : 10 parts contre 3, si l'une ecrasait l'autre
       les deux vaudraient pareil. */
    const vals = j.lignes.map(l => Math.round(l.value)).sort((a, b) => a - b);
    eq(String(vals), '270,900', 'chaque ligne porte sa propre valeur');
  });

  test('une matière première n’a pas de pays', () => {
    /* Le bug : la regex portait deux vrais caractères « retour arrière »
       (0x08) là où `\b` était voulu. Elle ne pouvait plus reconnaître
       « gold », et un ETC or coté en dollars tombait sur la règle de repli
       `currency === 'USD'`, donc en « Amérique du Nord » — exactement ce que
       le commentaire au-dessus de la fonction interdit. */
    Fixture.poser();
    eq(devineZone({ name: 'Amundi Physical Gold ETC', symbol: 'GOLD.PA', currency: 'USD' }),
      'monde', 'un ETC or en dollars n’est pas un actif américain');
    eq(devineZone({ name: 'iShares Physical Silver', symbol: 'SLV', currency: 'USD' }),
      'monde', 'l’argent métal non plus');
  });

  test('les indices connus tombent sur leur zone', () => {
    Fixture.poser();
    eq(devineZone({ name: 'S&P 500 UCITS ETF', symbol: 'CSPX', currency: 'USD' }), 'amnord');
    eq(devineZone({ name: 'MSCI World UCITS ETF', symbol: 'IWDA', currency: 'EUR' }), 'monde');
    eq(devineZone({ name: 'Amundi CAC 40', symbol: 'C40', currency: 'EUR' }), 'france');
    eq(devineZone({ name: 'iShares Core MSCI EM', symbol: 'EIMI', currency: 'USD' }), 'emergents');
  });

  test('le secteur suit la même règle', () => {
    Fixture.poser();
    eq(devineSecteur({ name: 'Amundi Physical Gold ETC', symbol: 'GOLD.PA', currency: 'USD' }),
      'matieres', 'l’or est une matière première');
    eq(devineSecteur({ name: 'Future of Defence UCITS ETF', symbol: 'NATO', currency: 'EUR' }),
      'industrie');
  });
});

/* ------------------------------------------------------------------
   4 bis. Les espèces, qui n'ont pas d'établissement
   ------------------------------------------------------------------ */
suite('Les espèces sont toujours là', () => {

  /* Le compte d'especes bricole a la main : de l'argent liquide dont le
     contenant ne s'appelle que « Espèces », faute de mieux. C'est ce que la
     migration doit adopter, pas doubler. */
  const avecBricolage = (nomEtab = 'Espèces', nomCompte = 'Real Cash') =>
    Fixture.poser(s => {
      s.etabs.push({ id: 'e_esp', nom: nomEtab, notes: '', dettes: [] });
      s.comptes.push({ id: 'c_liquide', etabId: 'e_esp', type: 'courant', statut: 'ouvert',
        ouvertLe: '', numero: '', notes: '', libelle: nomCompte, court: '', alloc: '',
        cash: [{ montant: 650, affectation: 'courant' }], lignes: [] });
    });

  const especes = () => COMPTES().filter(c => c.type === 'especes');
  const brut = () => comptesOuverts().reduce((s, c) => s + valeurCompte(c), 0);

  test('un état sans espèces en reçoit un, vide', () => {
    Fixture.poser();
    const avant = brut();
    poserEspeces(Store.state);
    eq(especes().length, 1, 'un seul compte d’espèces, pas deux');
    eq(valeurCompte(especes()[0]), 0, 'à zéro : personne n’a déclaré de billets');
    eq(brut(), avant, 'et le patrimoine ne bouge pas d’un euro');
    eq(especes()[0].etabId, null, 'personne ne tient ces billets pour vous');
  });

  test('le compte bricolé est adopté, pas doublé', () => {
    /* Le defaut a eviter : ajouter un compte d'especes a cote de celui qui
       existait deja compterait deux fois le meme argent. */
    avecBricolage();
    const avant = brut();
    poserEspeces(Store.state);
    eq(especes().length, 1, 'un seul');
    eq(especes()[0].id, 'c_liquide', 'le même identifiant : les relevés passés y sont indexés');
    eq(valeurCompte(especes()[0]), 650, 'son montant est conservé');
    eq(brut(), avant, 'donc le total ne change pas');
    eq(especes()[0].etabId, null, 'il quitte l’établissement qu’on avait inventé');
    eq(ETABS().some(e => e.id === 'e_esp'), false,
      'et cet établissement, devenu vide, disparaît de la liste');
  });

  test('« Real Cash » cesse de s’appeler ainsi', () => {
    /* Un nom de contournement, en anglais dans une application française. Vide,
       le libelle laisse parler celui du type. */
    avecBricolage();
    poserEspeces(Store.state);
    eq(nomCompteV2(especes()[0]), 'Espèces');
    /* Un nom choisi, lui, survit : ce n'est plus un contournement. */
    avecBricolage('Espèces', 'Ma tirelire');
    poserEspeces(Store.state);
    eq(nomCompteV2(especes()[0]), 'Ma tirelire', 'ce que l’utilisateur a écrit reste');
  });

  test('un vrai compte courant n’est pas confondu avec des espèces', () => {
    /* Le filet ne doit attraper que le bricolage. Un compte de cash chez une
       vraie banque n'en est pas : le convertir le sortirait de son
       etablissement, et son solde deviendrait des billets.

       Les noms sont inventes, et ce n'est pas un detail : la premiere version de
       ce test reprenait un identifiant et un nom de banque du jeu de donnees
       reel. CLAUDE.md l'interdit, le fixture doit rester synthetique, et ces
       tests partent aussi dans la demo publique. */
    Fixture.poser(s => {
      s.comptes.push({ id: 'c_banque', etabId: 'e_banque', type: 'courant', statut: 'ouvert',
        ouvertLe: '', numero: '', notes: '', libelle: 'Cash de la banque', court: '', alloc: '',
        cash: [{ montant: 900, affectation: 'courant' }], lignes: [] });
    });
    poserEspeces(Store.state);
    eq(especes().length, 1, 'un compte d’espèces a bien été créé');
    eq(especes()[0].id !== 'c_banque', true, 'mais ce n’est pas le compte de la banque');
    eq(compteById('c_banque').etabId, 'e_banque', 'qui reste chez elle');
  });

  test('la jouer deux fois donne le même état', () => {
    /* La regle des migrations. Celle-ci n'a pas de drapeau dans `meta` : sa
       garde est l'etat lui-meme, donc c'est exactement ce qu'il faut verifier. */
    for (const depart of [() => Fixture.poser(), () => avecBricolage()]) {
      depart();
      poserEspeces(Store.state);
      const une = JSON.stringify({ c: Store.state.comptes, e: Store.state.etabs });
      poserEspeces(Store.state);
      const deux = JSON.stringify({ c: Store.state.comptes, e: Store.state.etabs });
      eq(deux, une, 'le second passage ne doit rien changer');
    }
  });

  test('l’établissement inventé survit s’il porte encore un crédit', () => {
    /* Un contenant vide qu'on efface est un menage. Un contenant qui doit de
       l'argent qu'on efface est un patrimoine faux : la dette se soustrayait du
       net, elle disparaitrait avec lui. */
    Fixture.poser(s => {
      s.etabs.push({ id: 'e_esp', nom: 'Espèces', notes: '',
        dettes: [{ id: 'd_x', libelle: 'Reste à rendre', montant: 300, note: '' }] });
      s.comptes.push({ id: 'c_liquide', etabId: 'e_esp', type: 'courant', statut: 'ouvert',
        ouvertLe: '', numero: '', notes: '', libelle: 'Real Cash', court: '', alloc: '',
        cash: [{ montant: 650, affectation: 'courant' }], lignes: [] });
    });
    const netAvant = dettesTotal();
    poserEspeces(Store.state);
    vrai(ETABS().some(e => e.id === 'e_esp'), 'l’établissement reste, il doit encore');
    eq(dettesTotal(), netAvant, 'et la dette pèse toujours autant');
  });

  test('le type des espèces dit ce qu’il est', () => {
    const t = typeCompte('especes');
    eq(t.label, 'Espèces');
    eq(t.classes.join(','), 'liquidites', 'des billets ne sont rien d’autre');
    eq(t.groupe, 'cash');
    vrai(t.interne, 'il ne se choisit pas dans une liste');
    vrai(t.sansEtab, 'et il n’a pas de contenant');
    eq(TYPES_COMPTE[TYPES_COMPTE.length - 1].id, 'especes',
      'dernier de la table, donc dernier groupe à l’écran : c’est la plus petite ligne');
  });

  test('la barre du bas et le menu se répondent', () => {
    /* Trois accords tiennent la navigation, et aucun n'est visible a l'oeil :

       — la pastille glissante ne connait que cinq positions, ecrites en CSS.
         Un sixieme onglet la laisserait sur le premier, sans erreur ;
       — chaque onglet de la barre doit exister dans le menu, parce que c'est
         de la barre qu'on derive ce que le tiroir masque au telephone. Un
         onglet absent du menu ne serait jamais reconnu comme doublon ;
       — le tiroir doit garder au moins une page que la barre ne porte pas.
         Sinon il s'ouvre vide, et cette page devient inatteignable au doigt.
         C'est le risque qu'a cree le depart de l'onglet « Plus ». */
    const html = lireSource('index.html');
    const css = lireSource('assets/styles.css');
    vrai(html && css, 'index.html et styles.css doivent être lisibles');

    const bloc = deb => { const i = html.indexOf(deb); return html.slice(i, html.indexOf('</nav>', i)); };
    const vues = s => [...s.matchAll(/data-view="([^"]+)"/g)].map(m => m[1]);
    const barre = vues(bloc('<nav class="tabbar"'));
    const menu = vues(bloc('<nav class="nav"'));

    vrai(barre.length >= 4 && menu.length >= 4, 'les deux navigations doivent être trouvées');
    const positions = (css.match(/\.tabbar:has\(> :nth-child\(\d+\)\.on\)/g) || []).length;
    eq(positions, barre.length,
      'la pastille glissante doit connaître exactement une position par onglet');

    for (const v of barre) vrai(menu.includes(v),
      `« ${v} » est dans la barre mais pas dans le menu : le tiroir ne saura pas que c’est un doublon`);
    vrai(menu.some(v => !barre.includes(v)),
      'le tiroir doit garder une page que la barre ne porte pas, sinon elle devient inatteignable');

    /* Deux entrees peuvent viser la meme vue sur deux onglets — Donnees et
       Preferences. Elles doivent alors porter un `data-onglet` distinct : la
       surbrillance se decide sur la vue courante, qui est la meme pour les
       deux, et sans lui les deux s'allumeraient ensemble. */
    const liens = [...bloc('<nav class="nav"').matchAll(/<a\b[^>]*>/g)].map(m => m[0]);
    const parVue = {};
    for (const a of liens) {
      const vue = (a.match(/data-view="([^"]+)"/) || [])[1];
      if (!vue) continue;
      (parVue[vue] = parVue[vue] || []).push((a.match(/data-onglet="([^"]+)"/) || [])[1] || '');
    }
    for (const [vue, onglets] of Object.entries(parVue)) {
      if (onglets.length < 2) continue;
      eq(new Set(onglets).size, onglets.length,
        `les ${onglets.length} entrées de « ${vue} » doivent porter des data-onglet distincts`);
      vrai(onglets.every(Boolean),
        `chaque entrée de « ${vue} » doit dire son onglet, sinon elles s’allument ensemble`);
    }
  });

  test('un compte sans établissement reste visible dans la liste', () => {
    /* Le regroupement par etablissement parcourt les etablissements. Un compte
       qui n'en a pas n'apparaitrait donc dans aucun groupe, et le total de la
       page cesserait d'egaler la somme de ses parts — sans que rien ne le dise.
       Le rendu vit dans app.js, que le harnais ne charge pas : on lit la
       branche concernee, bornee a elle seule. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const debut = src.indexOf("compteVue === 'banque'");
    const branche = src.slice(debut, src.indexOf("compteVue === 'type'", debut));
    vrai(debut > 0 && branche.length > 500 && branche.length < 6000,
      'la tranche lue doit être la branche « par établissement » seule');
    vrai(/!c\.etabId/.test(branche),
      'elle doit ramasser les comptes sans établissement');
    vrai(/groupe\('e-sans'/.test(branche),
      'dans un groupe à eux, sinon leurs euros manquent au total de la page');
  });
});

/* ------------------------------------------------------------------
   5. Une somme saisie à la main
   ------------------------------------------------------------------ */
suite('Somme saisie à la main', () => {

  /* `parseSomme` rend `{ total, termes }` : le total pour le calcul, les termes
     pour reconstruire le découpage `d` de la catégorie. */

  test('additionne et soustrait', () => {
    pres(parseSomme('100+50+70').total, 220, 'trois termes');
    pres(parseSomme('100 + 50').total, 150, 'les espaces ne gênent pas');
    pres(parseSomme('200-50').total, 150, 'la soustraction marche');
    pres(parseSomme('1 200,50').total, 1200.5, 'espace fin et virgule décimale');
  });

  test('rend aussi le détail des termes', () => {
    const r = parseSomme('100+50+70');
    eq(r.termes.length, 3, 'trois termes retenus');
    pres(r.termes.reduce((s, x) => s + x, 0), r.total, 'les termes refont le total');
  });

  test('un nombre seul reste un nombre', () => {
    pres(parseSomme('450').total, 450);
    pres(parseSomme('450,25').total, 450.25);
    eq(parseSomme('450').termes.length, 1, 'un seul terme, pas de découpage à garder');
  });

  test('rejette ce qui n’est pas une somme, au lieu de l’arrondir à zéro', () => {
    /* Le contrat : `null` pour une saisie invalide, et surtout pas 0. Un zéro
       silencieux écraserait le montant déjà enregistré sur une faute de
       frappe. L'appelant voit `null` et refuse la saisie.
       L'analyseur est strict et n'utilise pas `eval` — d'où le rejet de
       « 1e3 », qui est pourtant un nombre pour JavaScript. */
    for (const s of ['alert(1)', 'abc', '1;2', '((', '1+', '1e3']) {
      const r = parseSomme(s);
      eq(r, null, `parseSomme(${JSON.stringify(s)}) doit être rejeté`);
    }
  });

  test('un champ vide vaut zéro, pas un rejet', () => {
    /* Effacer un montant est une intention légitime, distincte d'une faute. */
    pres(parseSomme('').total, 0);
    pres(parseSomme('   ').total, 0);
    eq(parseSomme('').termes.length, 0, 'rien à découper');
  });

  test('les montants négatifs passent', () => {
    pres(parseSomme('-40').total, -40, 'un remboursement se saisit en négatif');
    pres(parseSomme('+5').total, 5, 'un plus initial est toléré');
  });

  });

/* ------------------------------------------------------------------
   6. L'état d'une place
   ------------------------------------------------------------------ */
suite('État d’une place de marché', () => {

  const MAINTENANT = () => Math.floor(Date.now() / 1000);
  const H = 3600;

  test('Yahoo a le dernier mot quand il se prononce', () => {
    eq(marketStatus({ marketState: 'REGULAR' }).cle, 'open');
    eq(marketStatus({ marketState: 'CLOSED' }).cle, 'close');
    eq(marketStatus({ marketState: 'PRE' }).cle, 'pre');
  });

  test('une séance bornée se lit à l’horloge', () => {
    const t = MAINTENANT();
    eq(marketStatus({ session: { regular: [t - H, t + H] } }).cle, 'open',
      'dans la séance');
    eq(marketStatus({ session: { regular: [t - 5 * H, t - 4 * H] } }).cle, 'close',
      'après la séance');
  });

  test('une fenêtre de 24 h ne dit rien : c’est le cours qui tranche', () => {
    /* Le bug : pour un future, une devise ou une crypto, Yahoo publie une
       journée calendaire et non une séance. L'or annonçait « 06:00 → 05:59 »,
       vingt-quatre heures qui contiennent forcément l'instant présent — il
       s'affichait donc ouvert un dimanche soir, avec un dernier cours vieux
       de quarante-six heures. */
    const t = MAINTENANT();
    const journee = { regular: [t - 12 * H, t + 12 * H] };
    eq(marketStatus({ session: journee, quoteTime: t - 46 * H }).cle, 'close',
      'un cours vieux de 46 h ne vient pas d’un marché qui cote');
    eq(marketStatus({ session: journee, quoteTime: t - 60 }).cle, 'open',
      'un cours d’il y a une minute, si');
  });

  test('sans rien pour trancher, on se tait', () => {
    eq(marketStatus({}), null, 'pas de session : aucune affirmation');
    const t = MAINTENANT();
    eq(marketStatus({ session: { regular: [t - 12 * H, t + 12 * H] } }), null,
      'fenêtre de 24 h sans horodatage : on ne devine pas');
  });
});

/* ------------------------------------------------------------------
   7. Les couleurs veulent dire une seule chose
   ------------------------------------------------------------------ */
suite('Une infobulle de graphique tient sous le doigt', () => {

  /* « Quand je laisse mon doigt appuyé sur le graphique, bien souvent la petite
     fenêtre d'aperçu disparaît, ça ne tient pas bien. »

     Le graphique porte `touch-action: pan-y` pour que la page reste défilable
     au-dessus de lui. Le revers : dès que le doigt dérive de quelques pixels vers
     le bas, le navigateur réclame le geste pour son défilement et **annule le
     pointeur**. L'infobulle se fermait donc au moindre tremblement, alors qu'on
     tenait justement le doigt en place pour lire.

     Retirer `pan-y` réglerait ça et bloquerait la page sur toute la hauteur du
     graphique : le remède serait pire. On ignore donc l'annulation. Ce qui ferme
     reste le doigt levé, la sortie du cadre, et l'appui ailleurs — et ce dernier
     est le garde-fou : sans lui, une infobulle survivant au défilement resterait
     à l'écran indéfiniment. */

  test('l’annulation du pointeur ne ferme pas, les autres sorties si', () => {
    const src = lireSource('assets/charts.js');
    vrai(src, 'assets/charts.js doit être lisible pour ce contrôle');

    vrai(!/addEventListener\('pointercancel', cacher\)/.test(src),
      'l’annulation du pointeur ne doit plus fermer l’infobulle : le navigateur '
      + 'l’émet dès qu’il réclame le geste pour son défilement');

    /* Le doigt garde la main sur toute la hauteur du graphique : sans capture,
       sortir du cadre par le haut ou par le bas referme, et un doigt qui tient
       une colonne de 220 px en sort tout le temps. */
    vrai(/setPointerCapture\(ev\.pointerId\)/.test(src),
      'le graphique doit capturer le pointeur : le mois ne dépend que de '
      + 'l’abscisse, la hauteur ne faisait qu’interrompre');

    /* Et ce qui ferme est le doigt leve, sans delai. Le repit de 1 400 ms partait
       d'une bonne intention — laisser le temps de lire — sur un raisonnement faux :
       on lit pendant qu'on appuie. Il coutait cher, car ce `setTimeout` n'etait
       jamais annule : deux appuis rapproches, et le minuteur du premier fermait
       l'infobulle du second. C'est la signature d'un minuteur en retard, pas d'une
       regle, et c'est ce que « la plupart du temps » decrivait. */
    vrai(/addEventListener\('pointerup', cacher\)/.test(src),
      'lever le doigt ferme, et immédiatement');
    vrai(!/setTimeout\(cacher/.test(src),
      'aucun minuteur ne doit fermer l’infobulle : non annulé, celui d’un appui '
      + 'précédent fermait celle de l’appui suivant');
    /* Le garde-fou, sans lequel l'infobulle pourrait rester a vie. */
    vrai(/document\.addEventListener\('pointerdown', ev => fermerInfobulles/.test(src),
      'un appui ailleurs doit refermer : c’est ce qui rattrape une infobulle '
      + 'qui a survécu à un début de défilement');
    /* Et la page reste defilable au-dessus du graphique. */
    vrai(/touchAction = 'pan-y'/.test(src),
      'le graphique laisse la page défiler : c’est la contrainte qui crée '
      + 'l’annulation, on l’assume au lieu de bloquer la page');
  });
});

suite('Une liste ne se rouvre pas après le choix', () => {

  /* « Quand je clique sur un nouveau truc du genre épargne de précaution, la
     fenêtre ne disparaît pas, ça force à cliquer 2 fois. »

     Le rendu du focus existe pour les champs de texte : `render()` reconstruit le
     balisage à chaque frappe, et sans lui le curseur sauterait du champ dès qu'on
     tape un chiffre. Sur une liste il fait l'inverse — on vient de choisir, le
     sélecteur natif se referme, et lui rendre le focus le rouvre.

     Le `blur()` avant le rendu est la seconde moitié : sans lui, le sélecteur
     natif d'iOS survit à la destruction du `<select>` qui le portait. Corriger
     l'un sans l'autre laissait la moitié du défaut. */

  test('le focus ne revient pas sur une liste, et elle se ferme avant le rendu', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    const i = src.indexOf('const estListe = f.tagName === \'SELECT\'');
    vrai(i > 0, 'le cas de la liste doit être distingué de celui d’un champ');
    const bloc = src.slice(i, i + 400);

    vrai(/if \(estListe\) f\.blur\(\);/.test(bloc),
      'la liste doit se fermer avant le rendu, sinon le sélecteur natif flotte '
      + 'au-dessus d’un élément détruit');
    vrai(/const path = estListe \? null :/.test(bloc),
      'et ne pas être reprise par le focus : c’est ce qui la rouvrait');

    /* Le rendu du focus reste pour tout le reste : c'est lui qui garde le curseur
       dans un champ pendant qu'on tape. */
    vrai(/again && again\.focus/.test(src),
      'un champ de texte doit toujours retrouver son focus après le rendu');
  });
});

suite('Le gel du fond s’apparie à la fenêtre, pas à l’appel', () => {

  /* « Si j'enregistre un nouveau montant dans liquidité, se crée une bande noire
     en bas de l'écran et je ne peux plus descendre. » C'est le corps resté en
     `position: fixed` : la page ne défile plus, et sa hauteur figée laisse une
     bande que rien ne peint.

     La cause était un compteur désynchronisé. « Enregistrer » d'un panneau
     d'aperçu le rouvre après avoir enregistré — c'est voulu, on veut voir le total
     bouger — mais il le rouvrait **alors qu'il était déjà ouvert**. Le compteur
     passait à deux, la fermeture suivante le ramenait à un, et le fond restait
     gelé pour toujours.

     Compter les appels supposait qu'ils vont par paires, ce que rien ne garantit.
     La fenêtre porte donc sa propre marque : elle gèle une fois et dégèle une
     fois, quel que soit le nombre d'appels. Le compteur garde son rôle — une fiche
     qui ouvre une confirmation — mais il ne peut plus compter deux fois la même. */

  test('ouvrir deux fois la même fenêtre ne gèle qu’une fois', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    const ouvre = src.indexOf('function montrerModal');
    const ferme = src.indexOf('function masquerModal');
    vrai(ouvre > 0 && ferme > 0, 'les deux fonctions doivent être trouvables');

    /* La fenetre lue est plus longue depuis que le gel paie sa mise en page
       avant l'animation (9 aout) : le bloc garde s'etend sur plusieurs lignes
       et porte un commentaire. Le motif suit la structure, pas la ligne. */
    const blocOuvre = src.slice(ouvre, ouvre + 1400);
    vrai(/const dejaGelee = m\.dataset\.gele === '1'/.test(blocOuvre),
      'l’ouverture doit regarder si cette fenêtre a déjà gelé le fond');
    vrai(/if \(!dejaGelee\) \{[\s\S]*?m\.dataset\.gele = '1';[\s\S]*?gelerFond\(\);/.test(blocOuvre),
      'et ne geler qu’à la première : sinon le compteur monte sans redescendre');
    vrai(/void document\.body\.offsetHeight/.test(blocOuvre),
      'la mise en page du gel se paie avant le lever de rideau, pas pendant');
    vrai(/if \(m\.dataset\.gele === '1'\) \{ delete m\.dataset\.gele; degelerFond\(\); \}/
      .test(src.slice(ferme, ferme + 400)),
      'la fermeture doit dégeler exactement quand cette fenêtre avait gelé, et retirer sa marque');

    /* La marque et le compteur ne se remplacent pas : le compteur sert aux
       fenetres empilees, ou une fiche ouvre une confirmation par-dessus elle. */
    vrai(/modalesOuvertes\+\+ > 0/.test(src),
      'le compteur reste, pour les fenêtres empilées');
  });
});

suite('Une bande trop mince ne porte pas de trait', () => {

  /* « On devrait empêcher de tirer un trait de graphique en dessous d'un
     pourcentage, regarde la crypto j'avais 100 € et ça fait un double trait
     bizarre. » Mesuré sur sa capture : 75 € dans un total de 26 540, soit trois
     dixièmes de pourcent — une bande de moins d'un pixel, dont le trait venait se
     poser exactement sur celui de la bande d'en dessous.

     Le seuil est en pixels et non en pourcentage, et ce n'est pas un détail : la
     question est de savoir s'il reste de la place entre deux traits, ce qui
     dépend de la hauteur du graphique autant que de la part.

     Ce que le contrôle protège surtout, c'est ce qui ne doit **pas** disparaître.
     La bande garde sa surface dans tous les cas — sinon le total cesserait
     d'égaler la somme de ses parts, et l'infobulle annoncerait 75 € pour une
     poche absente du dessin. Seul le trait s'efface. Vérifié dans le navigateur
     avec une crypto à 75 € : la bande est là, le trait non ; à 4 000 €, les deux
     reviennent. */

  test('le trait se tait, la surface reste', () => {
    const src = lireSource('assets/charts.js');
    vrai(src, 'assets/charts.js doit être lisible pour ce contrôle');

    const i = src.indexOf('const HAUTEUR_TRAIT');
    vrai(i > 0, 'le seuil de dessin doit exister, et porter un nom');
    const bloc = src.slice(i, i + 900);

    vrai(/epaisseur >= HAUTEUR_TRAIT/.test(bloc),
      'le trait doit être conditionné à l’épaisseur de la bande');
    /* Le maximum sur la periode, pas chaque point : un trait qui apparaitrait en
       juillet pour disparaitre en aout se lirait comme une donnee manquante. */
    vrai(/Math\.max\(\.\.\.points\.map/.test(bloc),
      'l’épaisseur retenue doit être le maximum sur la période, sinon le trait '
      + 'clignoterait d’un mois à l’autre');
    /* Et la surface n'est jamais conditionnee. */
    vrai(/areas\.push\(`<polygon[^`]*\$\{trait\}`\)/.test(bloc),
      'la bande doit être peinte dans tous les cas : sans elle, le total cesserait '
      + 'd’égaler la somme de ses parts');
  });
});

suite('Le tirer-pour-rafraîchir résiste au lieu de se laisser étirer', () => {

  /* « Un écran peut se tirer beaucoup trop, il faudrait une résistance qu'on
     ressent, comme Courtier A », et « le rafraîchissement se déclenche très
     facilement vu qu'il n'y a aucune résistance ».

     L'amortissement existait pourtant — mais **linéaire** : 60 % de la course du
     doigt, sans borne. Tirer deux fois plus loin descendait deux fois plus bas,
     indéfiniment. Un ratio n'est pas une résistance : il ralentit, il ne s'oppose
     jamais, et rien n'empêchait de creuser un demi-écran de vide.

     Le contrôle reconstruit la loi depuis la source et l'exécute — c'est la
     méthode de la maison quand la fonction visée ne dépend de rien. Il vérifie
     trois propriétés, et chacune répond à un mot de la demande :

     « qu'on ressent » → la réponse s'aplatit, donc doubler la course ne double
     pas la descente ; « se tirer beaucoup trop » → elle est bornée, quel que
     soit le tirage ; et le premier centimètre colle au doigt, sans quoi le geste
     paraîtrait mou au lieu de résistant. */

  const source = lireSource('assets/app.js') || '';

  function loi() {
    const m = source.match(/const COURSE_MAX = (\d+);\s*\n\s*const amorti = d => COURSE_MAX \* \(1 - Math\.exp\(-d \/ COURSE_MAX\)\);/);
    if (!m) return null;
    const M = Number(m[1]);
    return { M, f: d => M * (1 - Math.exp(-d / M)) };
  }

  test('la page résiste : la réponse s’aplatit et reste bornée', () => {
    const l = loi();
    vrai(l, 'la loi d’amortissement doit être trouvable et asymptotique');

    /* Bornee : le tirage de la capture, 660 px de doigt, ne doit pas creuser un
       demi-ecran. */
    vrai(l.f(660) <= l.M,
      `660 px de doigt donnent ${Math.round(l.f(660))} px, et ne doivent jamais dépasser ${l.M}`);
    vrai(l.f(1e6) <= l.M, 'aucune course, même absurde, ne franchit la borne');

    /* Aplatie : c'est ça, sentir une resistance. Un amortissement lineaire
       passerait les deux assertions du dessus s'il etait plafonne, et echouerait
       ici — un plafond n'est pas une resistance, c'est un mur. */
    for (const d of [40, 80, 160, 320]) {
      vrai(l.f(2 * d) < 1.8 * l.f(d),
        `doubler la course de ${d} px doit donner nettement moins du double : `
        + `${Math.round(l.f(d))} px puis ${Math.round(l.f(2 * d))}`);
    }

    /* Et le premier centimetre colle au doigt : pente initiale de 1. Sans elle le
       geste paraitrait mou des le depart, ce qui n'est pas de la resistance. */
    vrai(l.f(6) > 5.7,
      'les premiers pixels doivent suivre le doigt, sinon le geste paraît mou');
  });

  test('le rafraîchissement coûte un geste franc', () => {
    /* Il part chercher le reseau et reecrit tous les cours : il ne doit pas
       partir sur un mouvement qu'on fait aussi pour commencer a lire. Le seuil se
       mesure sur la course du doigt et non sur celle de la page, qui est desormais
       bornee et ne pourrait plus l'atteindre. */
    /* On vise le commentaire qui suit la constante, et non la premiere occurrence
       de `SEUIL` : `app.js` en compte plusieurs — le glissement d'une ligne en
       porte un autre — et le controle lisait celui-la, donc autre chose que ce
       qu'il croyait lire. C'est la lecon des deux tests verts pour la mauvaise
       raison : viser un repere unique, jamais un rang. */
    const m = source.match(/const SEUIL = (\d+);\s*\/\/ au-dela, on lache et ca part/);
    vrai(m, 'le seuil du tirer-pour-rafraîchir doit être trouvable par son repère');
    const seuil = Number(m[1]);
    vrai(seuil >= 150,
      `le seuil est à ${seuil} px : sous 150, le rafraîchissement part sans qu’on l’ait voulu`);

    const l = loi();
    vrai(l && seuil > l.M * 0.9,
      'et il doit dépasser la course visible de la page : atteindre le seuil demande '
      + 'alors de pousser là où ça ne donne presque plus, ce qui est la sensation cherchée');
  });
});

suite('Une couleur de donnée ne se confond pas avec une couleur de sens', () => {

  /* Mesuré le 5 août 2026, à la demande du propriétaire : « je voudrais que tout
     soit bien premium niveau couleurs, pas de couleurs qui ne matchent pas
     ensemble. » Ce n'était pas une affaire de goût, et la mesure le montre.

     Cinq teintes de série tombaient à moins de 12° d'une couleur qui **veut dire
     quelque chose** — et l'or des métaux précieux était à **1°** de l'ambre des
     avertissements en thème sombre. La même couleur signifiait donc deux choses :
     l'oeil apprend un code sur un écran, et le voit démenti sur le suivant. C'est
     précisément ce qui fait qu'une interface « ne matche pas » sans qu'on sache
     nommer pourquoi.

     Le contrôle raisonne en OKLCH, où la distance de teinte correspond à ce que
     l'oeil perçoit — en HSL, deux jaunes à 20° se ressemblent quand deux bleus à
     20° se distinguent. Il ne juge que les séries **réellement attribuées** :
     `TEINTE_CLASSE` les nomme, et une teinte en réserve peut dormir où elle veut
     tant qu'aucune classe ne la porte. La liste se dérive, elle ne se recopie pas.

     Le seuil est à 20° et non à 25 : avec huit classes, cinq couleurs de sens et
     la bande violette réservée à l'interface, le cercle est **sur-souscrit**. Le
     meilleur arrangement trouvé laisse 21° entre les deux séries les plus
     proches et 23° de toute sémantique. Descendre sous 20 signifierait qu'on a
     recommencé à empiéter. */

  const CANAUX = [[0.4122214708, 0.5363325363, 0.0514459929],
                  [0.2119034982, 0.6806995451, 0.1073969566],
                  [0.0883024619, 0.2817188376, 0.6299787005]];

  /* Teinte OKLCH d'un `#rrggbb`, en degrés. */
  function teinte(hex) {
    const h = hex.replace('#', '');
    const canal = i => {
      const v = parseInt(h.substr(i * 2, 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const rgb = [canal(0), canal(1), canal(2)];
    const [l, m, s] = CANAUX.map(k => Math.cbrt(k[0] * rgb[0] + k[1] * rgb[1] + k[2] * rgb[2]));
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    const deg = Math.atan2(B, A) * 180 / Math.PI;
    return { h: deg < 0 ? deg + 360 : deg, c: Math.sqrt(A * A + B * B) };
  }
  const ecart = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

  /* Les deux thèmes se lisent dans la source : le harnais ne rend pas de DOM, et
     surtout il faut vérifier celui qui n'est pas affiché. */
  function palette(css, bloc) {
    const i = css.indexOf(bloc);
    if (i < 0) return null;
    const fin = css.indexOf('\n}', i);
    const zone = css.slice(i, fin < 0 ? i + 4000 : fin);
    const out = {};
    for (const m of zone.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) out[m[1]] = m[2];
    return out;
  }

  const SEMANTIQUES = ['accent', 'good', 'warning', 'serious', 'critical'];
  const SEUIL = 20;

  for (const [nom, bloc] of [['sombre', '[data-theme="dark"]'], ['clair', ':root']]) {
    test(`thème ${nom} : aucune série ne se confond avec une couleur de sens`, () => {
      const css = lireSource('assets/styles.css');
      const js = lireSource('assets/store.js');
      vrai(css && js, 'les deux sources doivent être lisibles');

      const p = palette(css, bloc);
      vrai(p && p['series-1'], `le bloc ${bloc} doit porter la palette`);

      /* Les seules series qui comptent sont celles qu'une classe porte. */
      const table = js.match(/const TEINTE_CLASSE = \{[\s\S]*?\n\};/);
      vrai(table, 'TEINTE_CLASSE doit être trouvable');
      const utilisees = [...new Set([...table[0].matchAll(/:\s*(\d+)\s*,/g)].map(m => m[1]))];
      vrai(utilisees.length >= 6, 'la table doit attribuer plusieurs teintes');

      for (const n of utilisees) {
        const hex = p[`series-${n}`];
        if (!hex) continue;
        const t = teinte(hex);
        /* Un gris n'a pas de teinte perceptible : il ne peut se confondre avec
           rien, et l'exiger reviendrait a interdire les neutres. */
        if (t.c < 0.05) continue;
        for (const s of SEMANTIQUES) {
          if (!p[s]) continue;
          const d = ecart(t.h, teinte(p[s]).h);
          vrai(d >= SEUIL,
            `series-${n} (${hex}) est à ${Math.round(d)}° de --${s} (${p[s]}) en thème ${nom} : `
            + `la même couleur dirait une classe d’actif et un état. Minimum ${SEUIL}°.`);
        }
      }

      /* Et deux classes ne se distinguent pas non plus par la seule saturation. */
      for (let i = 0; i < utilisees.length; i++) {
        for (let j = i + 1; j < utilisees.length; j++) {
          const a = p[`series-${utilisees[i]}`], b = p[`series-${utilisees[j]}`];
          if (!a || !b) continue;
          const ta = teinte(a), tb = teinte(b);
          if (ta.c < 0.05 || tb.c < 0.05) continue;
          const d = ecart(ta.h, tb.h);
          vrai(d >= SEUIL,
            `series-${utilisees[i]} (${a}) et series-${utilisees[j]} (${b}) sont à `
            + `${Math.round(d)}° en thème ${nom} : sur un même graphique, l’une se lit `
            + `comme l’autre en version délavée. Minimum ${SEUIL}°.`);
        }
      }
    });
  }
});

suite('Les couleurs de classes ne se marchent pas dessus', () => {

  test('deux classes distinctes ont deux teintes distinctes', () => {
    /* Le bug : deux tables de couleurs écrites à la main avaient divergé. Les
       métaux précieux partageaient `series-4` avec l'immobilier — dans
       « Allocation par actif », un studio et un ETC or se peignaient de la
       même couleur. */
    const classes = ['liquidites', 'actions', 'obligations', 'crypto', 'nonCote',
                     'immobilier', 'metaux'];
    const vues = new Map();
    for (const c of classes) {
      const teinte = couleurClasse(c);
      if (vues.has(teinte))
        throw new Error(`« ${c} » et « ${vues.get(teinte)} » partagent ${teinte}`);
      vues.set(teinte, c);
    }
  });

  test('la table dérivée dit la même chose que la table source', () => {
    for (const c of ['liquidites', 'actions', 'obligations', 'crypto', 'nonCote', 'immobilier'])
      eq(CLASSE_COULEURS[c], couleurClasse(c), `CLASSE_COULEURS.${c} doit suivre couleurClasse()`);
  });

  test('une classe inconnue ne rend pas une couleur par défaut trompeuse', () => {
    eq(CLASSE_COULEURS.inexistante, undefined,
      'les appelants doivent pouvoir écrire « || CLASSE_COULEURS.nonCote »');
  });
});

/* ------------------------------------------------------------------
   7 bis. Le source lui-même
   ------------------------------------------------------------------ */
suite('Pièges de source', () => {

  /* Ces deux-là ne se voient pas à l'exécution : ils cassent le fichier au
     chargement, donc aucun test de calcul ne tourne pour les signaler. Le
     contrôle lit le texte du source, ce qui est le seul moyen de les prendre.
     Les deux se sont produits pour de vrai, deux jours de suite. */

  const lire = lireSource;
  const source = lire('assets/app.js');

  /* Les tables de routage vivent dans app.js, que le harnais ne charge pas : on
     les reconstruit depuis la source. Ce sont des litteraux, donc `new Function`
     les rend tels quels, commentaires compris. */
  const litteral = nom => {
    const m = source.match(new RegExp(`const ${nom} = (\\{[\\s\\S]*?\\n\\});`));
    vrai(m, `la table ${nom} doit être trouvable dans la source`);
    return new Function('return ' + m[1])();
  };

  /* Le texte qui part à l'écran, une fois retirées les zones que personne ne
     lit : commentaires JavaScript et commentaires HTML. Sans ce tamis, la
     règle ci-dessous compterait 151 tirets là où neuf seulement s'affichaient. */
  const texteAffiche = s => {
    let t = s;
    for (const motif of [/\/\*[\s\S]*?\*\//g, /^[ \t]*\/\/.*$/gm, /<!--[\s\S]*?-->/g])
      t = t.replace(motif, m => ' '.repeat(m.length));
    return t;
  };

  test('chaque fichier de l’application se parse', () => {
    /* Le trou de la couverture : tests.html ne charge pas app.js, donc une
       erreur de syntaxe y passait tous les tests au vert pendant que
       l'application entiere refusait de demarrer. C'est arrive : un \n ecrit
       via un script est devenu un vrai retour a la ligne au milieu d'un
       litteral de chaine, 65 tests verts, page morte.
       new Function compile sans executer : une SyntaxError echoue ici. */
    for (const f of ['assets/app.js', 'assets/store.js', 'assets/charts.js',
                     'assets/cloudsync.js', 'assets/quotes.js', 'assets/i18n.js']) {
      const s = lire(f);
      vrai(s, f + ' doit être lisible');
      try { new Function(s); }
      catch (e) { vrai(false, f + ' ne se parse pas : ' + e.message); }
    }
  });

  test('aucun backtick dans un commentaire HTML', () => {
    /* Un commentaire HTML posé à l'intérieur d'un littéral de gabarit est du
       texte comme un autre : un backtick y ferme la chaîne et le fichier
       entier cesse de parser.

       Ce contrôle ne regardait qu'`app.js`. Le 5 août 2026, un backtick posé
       dans un commentaire de `charts.js` a vidé tous les graphiques de
       l'application — « trace is not defined » — et la suite est restée verte :
       le fichier n'était pas dans la liste. C'est le sixième cas du même piège
       dans la même session, et le premier que le test a laissé passer.

       La liste couvre donc maintenant tout ce qui bâtit du balisage dans un
       littéral. Le contrôle de parse, juste au-dessus, connaît déjà ces
       fichiers : c'est la même liste, et elle vit ici parce qu'aucune des deux
       ne peut se dériver de l'autre sans devenir fausse le jour où un fichier
       cessera de produire du HTML. */
    const fautifs = [];
    for (const f of ['assets/app.js', 'assets/charts.js', 'assets/store.js',
                     'assets/quotes.js', 'assets/i18n.js', 'assets/cloudsync.js']) {
      const src = lireSource(f);
      vrai(src, f + ' doit être lisible pour ce contrôle');
      for (const m of src.matchAll(/<!--[\s\S]*?-->/g))
        if (m[0].includes('`'))
          fautifs.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
    }
    eq(fautifs.length, 0, 'backtick dans un commentaire HTML : ' + fautifs.join(', '));
  });

  test('geler le fond ne rogne pas la page', () => {
    /* Signale par le propriétaire sur la carte « Portefeuille titres » : « pourquoi
       je ne vois plus l'arriere-plan quand je clique ». Tout etait noir au-dessus
       de la feuille.

       `gelerFond()` pose `position: fixed` sur le corps avec un decalage negatif
       egal au defilement. Il posait aussi `overflow: hidden`, qui fait du corps
       une boite de rognage : un corps fixe sans hauteur prend alors celle de
       l'ecran. Mesure du jour, page defilee a 1 833 px : le corps mesurait 812 px
       au lieu de 2 937 et couvrait la bande -1833 a -1021, donc rien de ce qui
       etait visible n'etait peint.

       Invisible tant qu'on n'a pas defile — a `top: 0` la boite coincide avec
       l'ecran — ce qui explique qu'il ait survecu si longtemps : il ne se montre
       que sur une carte situee en bas d'une page longue.

       `overflow: hidden` etait de toute façon inutile : le positionnement fixe
       sort le corps du flux, `html` n'a plus de contenu, donc plus rien a faire
       defiler. C'est ce que ce controle protege — le jour ou quelqu'un le
       remettra pour « bloquer le defilement », il saura pourquoi il ne faut
       pas. */
    vrai(source, 'app.js doit être lisible pour ce contrôle');
    const debut = source.indexOf('function gelerFond');
    vrai(debut > 0, 'gelerFond doit être trouvable');
    const fn = source.slice(debut, source.indexOf('function degelerFond'));
    vrai(/position = 'fixed'/.test(fn),
      'le fond se gèle par le positionnement, c’est lui qui garde la place');
    vrai(!/style\.overflow/.test(fn),
      'overflow sur le corps le transforme en boîte de rognage d’une hauteur '
      + 'd’écran : la page défilée disparaît derrière la fenêtre');
  });

  test('la sortie d’une fenêtre ne dépend pas des autres fenêtres', () => {
    /* `masquerModal` eteint la fenetre 170 ms plus tard, et renonce si elle a
       rouvert entre-temps. Le compteur qui le dit etait global aux deux
       fenetres de l'application, `#modal` et `#confirm`, alors qu'elles se
       ferment souvent l'une apres l'autre : « Annuler » sur la saisie d'un mois
       ferme la confirmation, puis la saisie. La seconde fermeture faisait
       avancer le compteur, la sortie differee de la premiere se croyait perimee
       et rendait la main sans rien eteindre — `#confirm` restait `hidden =
       false` pour le reste de la session.

       Invisible a l'ecran (`pointer-events: none`, opacite nulle), donc jamais
       signale, mais present dans l'arbre d'accessibilite. Trouve le 5 aout 2026
       en verifiant tout autre chose. */
    vrai(source, 'app.js doit être lisible pour ce contrôle');
    vrai(/const generationModal = new WeakMap\(\)/.test(source),
      'le compteur de génération doit être par fenêtre, pas partagé');
    vrai(/gen !== generationModal\.get\(m\)/.test(source),
      'et la sortie différée doit se comparer à la génération de SA fenêtre');
    vrai(!/\+\+generationModal\b/.test(source),
      'un compteur global ferait qu’une fenêtre qui se ferme empêche la '
      + 'précédente de s’éteindre');
  });

  test('aucun pavé de texte sur une carte', () => {
    /* Le propriétaire, 5 aout 2026, capture a l'appui : « ici toujours beaucoup de
       texte ». La carte « Core et satellites » portait 74 mots autour de trois
       barres, dont un paragraphe qui repetait mot pour mot la premiere phrase
       de sa propre bulle d'aide, deux centimetres plus bas.

       Mesure du jour, dans le navigateur : 11 paragraphes de plus de 25 mots,
       433 mots au total. Apres deplacement dans les bulles : 6 paragraphes,
       175 mots, le plus long a 34.

       La regle : une carte montre des chiffres, le « ? » porte le pourquoi.
       Le seuil est a 35 mots — un cliquet, pas une cible : l'objectif reste 25,
       et il se resserrera quand les six derniers seront traites.

       Limite assumee de ce controle : il ne compte que le texte litteral, les
       `${'$'}{...}` sont retires sans etre remplaces. Il sous-estime donc un
       paragraphe fait surtout d'interpolations — mais il n'echoue jamais a
       tort, et il attrape celui qu'on ecrira demain a la main. */
    vrai(source, 'app.js doit être lisible pour ce contrôle');
    const blanc = m => m.replace(/[^\n]/g, ' ');
    const nu = source.replace(/\/\*[\s\S]*?\*\//g, blanc).replace(/<!--[\s\S]*?-->/g, blanc);

    /* Retirer les `${...}` en comptant les accolades : une interpolation en
       contient souvent d'autres, et une expression rationnelle simple
       s'arreterait a la premiere fermante. */
    const sansInterpolation = s => {
      let out = '', i = 0;
      while (i < s.length) {
        const j = s.indexOf('${', i);
        if (j < 0) return out + s.slice(i);
        out += s.slice(i, j);
        let k = j + 2, prof = 1;
        while (k < s.length && prof > 0) {
          if (s[k] === '{') prof++; else if (s[k] === '}') prof--;
          k++;
        }
        i = k;
      }
      return out;
    };

    const fautifs = [];
    for (const m of nu.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
      /* Un ecran vide est exempte, et ce n'est pas un passe-droit : quand il n'y
         a aucun chiffre a montrer, le texte EST le contenu de la carte. Il dit
         quoi faire pour qu'elle se remplisse, ce qui demande des phrases. La
         classe `empty` le declare — un paragraphe qui veut en profiter doit donc
         se dire ecran vide, ce qui se relit. */
      if (/\bclass="[^"]*\bempty\b/.test(m[1])) continue;
      const texte = sansInterpolation(m[2]).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const mots = texte ? texte.split(' ').length : 0;
      if (mots > 35)
        fautifs.push(`ligne ${nu.slice(0, m.index).split('\n').length} : ${mots} mots`);
    }
    eq(fautifs.length, 0,
      'paragraphe trop long sur une carte (' + fautifs.join(', ')
      + ') — une carte montre des chiffres, le « ? » porte le pourquoi');
  });

  test('aucune fenêtre de saisie ne jette une modification en silence', () => {
    /* Trois fenetres jetaient la saisie sur « Annuler » sans un mot : la saisie
       d'un mois de depenses, et toutes celles bâties sur `askForm` — une charge
       fixe corrigee, un compte renomme, un placement revalorise.

       La question vit dans `askForm` et non chez ses appelants : il y en a une
       dizaine, et le onzieme aurait oublie de la poser. Ce controle verifie que
       les trois portes de sortie — le bouton Annuler, la croix, la touche
       Echap — passent toutes par la demande, et qu'aucune ne rappelle
       `fermer(null)` en direct. */
    vrai(source, 'app.js doit être lisible pour ce contrôle');
    const debut = source.indexOf('function askForm');
    vrai(debut > 0, 'askForm doit être trouvable');
    const fin = source.indexOf('\nfunction ', debut + 1);
    const fn = source.slice(debut, fin > 0 ? fin : debut + 6000);
    vrai(fn.includes('askConfirm'), 'la découpe doit contenir la fin de la fonction');

    for (const [porte, motif] of [
      ['le bouton Annuler', /#frmCancel'\)\.onclick = annulerOuDemander/],
      ['la croix', /#modalClose'\)\.onclick = annulerOuDemander/],
      ['la touche Échap', /Escape'\)[^\n]*annulerOuDemander/],
    ]) vrai(motif.test(fn), `${porte} doit passer par la demande de confirmation`);

    /* Et la question ne se pose que si quelque chose a change : une question qui
       revient sans raison s'apprend a fermer sans lire. */
    vrai(/JSON\.stringify\(valeurs\(\)\) === depart/.test(fn),
      'la fenêtre propre doit se fermer sans rien demander');
  });

  test('« en ajouter une autre » enchaîne, et ne s’invite pas dans une modification', () => {
    /* Depuis que le tableau des charges fixes passe par sa fenêtre, en saisir dix
       demandait dix allers-retours par « + Ligne ». Le bouton enregistre et rouvre
       une fenêtre vide.

       Trois choses à tenir, et la troisième est celle qui aurait mordu.

       Il ne s'affiche que si l'appelant le demande : une fenêtre de modification
       n'a rien à enchaîner, on ne modifie pas deux fois la même ligne.

       La boucle est chez l'appelant, parce que c'est lui qui sait quoi recalculer
       entre deux saisies — les crédits déjà rattachés changent dès que la charge
       précédente en prend un.

       Et « Enregistrer » ne doit pas enchaîner : `onclick = lire` aurait passé
       l'événement de clic en premier argument, donc un objet toujours vrai à la
       place du drapeau. Chaque validation aurait rouvert la fenêtre, sur les dix
       formulaires de l'application d'un coup. */
    vrai(source, 'app.js doit être lisible pour ce contrôle');

    vrai(/function askForm\(\{[^)]*encore = ''/.test(source),
      'askForm doit accepter le libellé du bouton, et ne rien afficher sans lui');
    vrai(/\$\('#frmOk'\)\.onclick = \(\) => lire\(\)/.test(source),
      '« Enregistrer » doit appeler lire() sans argument : lui passer l’événement '
      + 'de clic armerait l’enchaînement à chaque validation');
    vrai(/\$\('#frmEncore'\)\.onclick = \(\) => lire\(true\)/.test(source),
      'et le troisième bouton est le seul à l’armer');

    /* La ligne se derive du balisage : toute fenetre qui offre le bouton doit
       boucler sur la reponse, y compris celle que quelqu'un ajoutera demain. */
    const offres = [...source.matchAll(/encore: '/g)];
    vrai(offres.length >= 1, 'au moins une fenêtre doit offrir l’enchaînement');
    for (const m of offres) {
      const debut = source.lastIndexOf('async \'', m.index);
      vrai(debut > 0, 'chaque offre doit vivre dans une action nommée');
      const action = source.slice(debut, m.index + 3000);
      vrai(/for \(;;\)/.test(action) && /if \(!v\.__encore\) return/.test(action),
        'une fenêtre qui offre l’enchaînement doit boucler sur la réponse, sinon le '
        + 'bouton enregistre et ne rouvre rien');
    }

    /* Et la fenetre de modification ne l'offre pas. */
    const edit = source.indexOf(`async 'edit-charge'`);
    vrai(edit > 0, 'la fenêtre de modification doit être trouvable');
    vrai(!/encore:/.test(source.slice(edit, edit + 2000)),
      'modifier une charge n’enchaîne rien : il n’y a pas de deuxième ligne à créer');
  });

  test('une bulle d’aide s’ouvre aussi dans une fenêtre', () => {
    /* Trois défauts empilés, et c'est pour ça qu'aucune bulle de fenêtre n'a
       jamais fonctionné. Signalé par le propriétaire sur « Part du portefeuille »,
       mais une dizaine d'autres étaient mortes de la même façon : « Nature »,
       « Valeur », « Date d'achat », toutes celles des aperçus.

       1. Les écouteurs étaient posés élément par élément, dans une boucle sur
          `$$('[data-aide]')` rejouée à chaque rendu. Elle ne pouvait atteindre
          que ce qui existait au moment du rendu de la page — jamais le contenu
          d'une fenêtre, qui naît après. Un écouteur délégué ne connaît pas les
          éléments, il connaît un attribut : il attrape aussi celui qu'on
          ajoutera demain.
       2. Le panneau se plaçait avec `window.scrollY`, alors qu'une fenêtre
          ouverte gèle le corps en `position: fixed` : le document n'a plus rien
          à faire défiler, `scrollY` retombe à zéro, et la bulle serait allée se
          poser là où la page était avant le gel.
       3. Il vivait à `z-index: 90`, sous la fenêtre qui est à 100 — donc sous ce
          qu'il vient expliquer.

       Corriger un seul des trois n'aurait rien donné de visible, ce qui est la
       raison pour laquelle ce défaut a duré. */
    const css = lireSource('assets/styles.css');
    vrai(source && css, 'les deux sources doivent être lisibles');

    const debut = source.indexOf('function monteAides');
    vrai(debut > 0, 'monteAides doit être trouvable');
    /* Commentaires retires : ce controle porte sur ce que le code fait, et les
       commentaires de cette fonction nomment justement les pieges qu'elle evite.
       Sans ce nettoyage, l'assertion sur `window.scrollY` echouait sur la phrase
       qui explique pourquoi il n'y en a plus. Un test qui lit la prose d'a cote
       est un test qui lit autre chose que ce qu'il croit lire. */
    const fn = source.slice(debut, debut + 4200).replace(/\/\*[\s\S]*?\*\//g, '');

    vrai(!/for \(const btn of \$\$\(\'\[data-aide\]\'\)\)/.test(fn),
      'plus de câblage élément par élément : il ne voit pas ce qui naît après lui');
    for (const ev of ['mouseover', 'focusin', 'click', 'keydown']) {
      vrai(new RegExp(`document\\.addEventListener\\('${ev}'`).test(fn),
        `${ev} doit être délégué au document, sinon les fenêtres restent muettes`);
    }
    /* `mouseover` et `focusin`, pas `mouseenter` ni `focus` : seuls les premiers
       remontent jusqu'au document. C'est le piege exact de cette delegation. */
    vrai(!/addEventListener\('(mouseenter|focus)'/.test(fn),
      'mouseenter et focus ne remontent pas : un écouteur délégué ne les verrait jamais');
    vrai(/monteAides\.monte/.test(fn),
      'le montage se fait une fois, pas à chaque rendu : render() appelle monteAides '
      + 'à chaque passage et les écouteurs s’empileraient');
    vrai(!/window\.scrollY/.test(fn),
      'le placement ne doit plus additionner le défilement : le panneau est en '
      + 'coordonnées de fenêtre, et scrollY vaut zéro dès qu’une fenêtre gèle le fond');

    /* Et son plan passe devant la fenetre. On lit les deux valeurs plutot que
       d'en epingler une : c'est leur rapport qui compte. */
    const zDe = sel => {
      const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*z-index:\\s*(\\d+)'));
      return m ? Number(m[1]) : null;
    };
    const zAide = zDe('.aide-panneau'), zModal = zDe('.modal');
    vrai(zAide !== null && zModal !== null, 'les deux doivent déclarer leur plan');
    vrai(zAide > zModal,
      `la bulle (${zAide}) doit passer devant la fenêtre (${zModal}) : elle explique ce `
      + 'qu’il y a dedans, elle ne peut pas être dessous');
    vrai(/\.aide-panneau\s*\{[^}]*position:\s*fixed/.test(css),
      'et se placer en coordonnées de fenêtre, comme getBoundingClientRect');
  });

  test('aucun champ de saisie ne peut déclencher le zoom d’iOS', () => {
    /* « Si on zoom ça reste zoomé. » Ce n'était pas le pincement, qui se défait
       en pinçant : c'est le recadrage automatique de Safari sur un champ dont le
       texte fait moins de 16 px, et celui-là ne se défait jamais. On touche un
       montant, la page se recadre, et rien ne la remet.

       La règle qui protège existait déjà. Elle perdait — non par ordre, mais par
       **spécificité** : `select.annee` (0,1,1) et `table.editable input.derived`
       (0,2,2) contre `select` (0,0,1). Mesure à 375 px avant correction : sept
       champs sous les 16 px, dont les six sélecteurs d'année. Un habillage
       décoratif battait une garantie de comportement, et rien ne le disait.

       D'où le `!important`, qui est ici un choix et non une facilité : aucune
       taille décorative ne doit pouvoir rallumer le zoom. Tenir à la main la
       liste des exceptions aurait péri au premier habillage suivant — c'est la
       règle de la maison, une liste se dérive, elle ne se recopie pas.

       Le pincement, lui, reste possible. Le bloquer a été essayé et retiré le
       jour même : c'est l'anti-motif qu'iOS refuse depuis dix ans, et il ne
       supprimait pas ce symptôme-ci. */
    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    const nu = css.replace(/\/\*[\s\S]*?\*\//g, '');

    vrai(/input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*16px\s*!important/.test(nu),
      'la garantie doit être posée sur les trois contrôles de formulaire, et en '
      + '« !important » : sans lui, une règle plus spécifique la bat en silence');

    /* Et personne ne doit pouvoir la reprendre par le meme moyen. Une seule
       regle a le droit de forcer la taille d'un champ, et c'est celle du dessus. */
    const forces = [...nu.matchAll(/([^{}]*)\{([^}]*font-size:\s*([\d.]+)px\s*!important[^}]*)\}/g)]
      .filter(m => /input|select|textarea/.test(m[1]) && Number(m[3]) < 16);
    eq(forces.length, 0,
      'aucune règle ne doit forcer un champ sous 16 px : ' + forces.map(m => m[1].trim()).join(', '));

    /* Le double-tap se refuse, le pincement non : c'est la difference entre
       corriger un accident et confisquer un geste. */
    vrai(/html\s*\{[^}]*touch-action:\s*manipulation/.test(nu),
      'le zoom au double-tap doit être neutralisé, lui qu’on déclenche sans le vouloir');
    /* Commentaires HTML retires : celui qui vit au-dessus de cette balise nomme
       `user-scalable=no` pour expliquer pourquoi il n'y est pas. Un controle doit
       lire ce que le navigateur lit, jamais la prose qui l'entoure — c'est la
       deuxieme fois de la journee que ce piege se referme. */
    const html = (lireSource('index.html') || '').replace(/<!--[\s\S]*?-->/g, '');
    vrai(!/user-scalable\s*=\s*no/.test(html),
      'et le viewport ne doit pas prétendre interdire le zoom : Safari l’ignore depuis '
      + 'iOS 10, la ligne ne ferait que mentir sur l’intention');
  });

  test('aucun octet de contrôle invisible', () => {
    /* `store.js` a déjà porté deux 0x08 là où des bornes de mot étaient
       voulues, et de vrais NUL. La regex ne reconnaissait plus « gold », et
       git classait le fichier en binaire. */
    vrai(source, 'app.js doit être lisible pour ce contrôle');
    const suspects = [...source].filter(c => {
      const n = c.charCodeAt(0);
      return n < 9 || (n > 13 && n < 32) || n === 127;
    });
    eq(suspects.length, 0,
      'octets de contrôle trouvés : ' + suspects.map(c => '0x' + c.charCodeAt(0).toString(16)).join(' '));
  });

  test('l’accueil ne trace pas deux fois la même courbe', () => {
    /* Le hero portait une sparkline du patrimoine, deux cents pixels au-dessus
       d'une carte « Évolution du patrimoine » qui trace la même série avec un
       axe, cinq plages et une infobulle. La petite ne pouvait être qu'une
       version plus faible de la grande, et deux dessins du même chiffre
       finissent par se contredire : c'est arrivé entre les cartes d'évolution
       de l'Aperçu et du Budget, à une version d'écart.

       Le hero décompose désormais le montant au lieu de le redessiner. Ce test
       garde les deux règles : aucun conteneur de sparkline dans le source, et
       une seule fabrique de courbe d'évolution, `monterEvolution()`. */
    vrai(source, 'assets/app.js doit être lisible pour ce contrôle');
    eq((source.match(/sparkNW/g) || []).length, 0,
      'la sparkline du patrimoine a quitté le hero');
    eq((source.match(/Charts\.sparkline/g) || []).length, 0,
      'et plus personne ne la monte');
    /* Un seul endroit remplit le conteneur de la courbe d'évolution. Compter
       tous les `Charts.stackedArea` serait faux : la projection en appelle un
       aussi, sur une série qui n'a rien à voir. */
    eq((source.match(/#chartEvo/g) || []).length, 1,
      'une seule fabrique de courbe d’évolution, sinon deux appels divergent');
    eq((source.match(/monterEvolution\(\)/g) || []).length, 3,
      'sa définition et ses deux appelants, l’Aperçu et le Budget');
    /* La barre du hero et la liste en dessous descendent de la même source :
       une seule liste, donc les couleurs et les parts ne peuvent pas différer. */
    eq((source.match(/repartitionClasses\(\)/g) || []).length, 2,
      'la barre et la liste appellent la même répartition, et rien d’autre');
  });

  test('aucun sous-onglet ne partage sa route avec sa vue, sauf le premier', () => {
    /* En mettant Objectifs devant Patrimoine, l'onglet Patrimoine est devenu
       inatteignable : chaque clic le renvoyait sur Objectifs. Sa route etait
       `allocation`, soit l'adresse de base de la vue, et `currentView()` ramene
       toujours l'adresse de base au premier onglet — donc a Objectifs.

       La regle qui en decoule vaut pour toutes les vues a onglets : le premier
       peut porter l'adresse de base, les suivants doivent avoir la leur. Ce test
       la verifie sur la table entiere, donc il protege aussi les reordonnancements
       de Budget, Marches et Donnees.

       Et chaque route distincte doit etre servie : sans redirection, un signet
       tomberait sur la vue d'ensemble. */
    vrai(source, 'assets/app.js doit être lisible pour ce contrôle');
    const onglets = litteral('SOUS_ONGLETS');
    const redirections = litteral('REDIRECTIONS');

    for (const [vue, liste] of Object.entries(onglets)) {
      liste.forEach(([cle, label, route], i) => {
        vrai(!!label, `${vue}.${cle} porte un libellé`);
        if (i === 0) return;
        vrai(route !== vue,
          `${vue}.${cle} porte la route « ${route} », qui est l’adresse de base de `
          + `« ${vue} » : cet onglet serait inatteignable, seul le premier peut la partager`);
        vrai(!!redirections[route],
          `la route « ${route} » doit être servie par une redirection`);
      });
      /* Les routes d'une meme vue sont distinctes, sinon deux onglets se
         disputeraient la meme adresse. */
      const routes = liste.map(o => o[2]);
      eq(new Set(routes).size, routes.length, `${vue} : deux onglets sur la même route`);
    }

    /* Le cas concret qui a casse, verifie nommement.

       Cible a quitte Allocation pour Marches : son calcul part de
       `stockTotals()` et sort l'immobilier et le non cote de sa base, donc elle
       ne pilote que le portefeuille investissable. La paire
       « Patrimoine | Cible » avait l'air d'opposer le reel au vise alors
       qu'elle comparait deux perimetres, ce que ce projet s'interdit ailleurs.

       Ce qui rend le deplacement possible est justement ce que ce test protege :
       chaque onglet porte sa propre route, donc aucun ne depend d'etre le
       premier ni de rester dans sa vue d'origine. C'est le contraire qui avait
       casse, le jour ou un onglet dont la route ETAIT l'adresse de base est
       passe en second. */
    eq(onglets.allocation[0][0], 'reel', 'Patrimoine ouvre Allocation');
    eq(onglets.allocation.length, 1, 'et Allocation n’a plus que lui');
    /* Cible est passee en deuxieme position le jour ou Performance a quitte la
       barre. L'indice suit la table plutot qu'un rang fige : c'est la derniere
       entree qu'on veut, et elle porte sa propre adresse. */
    const cible = onglets.positions[onglets.positions.length - 1];
    eq(cible[2], 'rebalance', 'Cible a sa propre adresse, dans Marchés');
    eq(onglets.positions.length, 2, 'Marchés porte deux onglets depuis que Performance est partie');
    eq(redirections.patrimoine[2], 'reel', 'l’ancienne adresse mène toujours à Patrimoine');
    eq(redirections.rebalance[0], 'positions', 'et l’ancienne adresse de Cible mène à Marchés');
    eq(redirections.rebalance[2], 'cible', 'sur son onglet');
  });

  test('une vue à un seul onglet n’affiche pas de barre', () => {
    /* Un selecteur a un seul choix n'est pas un selecteur : c'est un bouton
       enfonce qui ne mene nulle part, et il prend la hauteur d'une barre pour
       n'offrir aucune alternative. Allocation est passee a un onglet le jour ou
       Cible a rejoint Marches.

       La regle se derive de la source et non d'une liste de vues : toute page
       qui perd un onglet perd sa barre, et toute page qui en gagne un second la
       retrouve sans qu'on y pense. Ecrire « Allocation n'a pas de barre »
       aurait fige le cas du jour au lieu de la regle. */
    vrai(source, 'assets/app.js doit être lisible pour ce contrôle');
    const corps = source.slice(source.indexOf('function barreSousOnglets'),
                               source.indexOf('function barreSousOnglets') + 1400);
    vrai(/choix\.length < 2\)\s*return ''/.test(corps),
      'barreSousOnglets doit s’effacer sous deux onglets : une vue à un seul '
      + 'onglet afficherait un sélecteur qui ne sélectionne rien');
    const onglets = litteral('SOUS_ONGLETS');
    const seules = Object.entries(onglets).filter(([, l]) => l.length < 2).map(([v]) => v);
    vrai(seules.includes('allocation'),
      'Allocation n’a qu’un onglet depuis que Cible est parti : si ce n’est plus '
      + 'vrai, ce test a perdu son sujet');
  });

  test('l’onglet qui s’ouvre est le premier de sa liste', () => {
    /* `sousOngletActif` portait ses valeurs en dur, a trois lignes de la table
       qui declare l'ordre des onglets. Mettre Objectifs devant Patrimoine a bien
       change l'ordre affiche, mais l'atterrissage est reste sur Patrimoine :
       deux listes ecrites a la main, et celle-ci disait le contraire de l'autre.

       Le controle lit la source : la valeur de depart doit se deriver de
       SOUS_ONGLETS, jamais se recopier. Une egalite verifiee a l'execution ne
       suffirait pas — elle passerait aussi avec deux listes qui se trouvent
       d'accord aujourd'hui, et c'est precisement ce qui a echoue. */
    vrai(source, 'assets/app.js doit être lisible pour ce contrôle');
    const decl = source.match(/const sousOngletActif =([\s\S]{0,220}?);/);
    vrai(decl, 'la déclaration de sousOngletActif doit être trouvable');
    vrai(/SOUS_ONGLETS/.test(decl[1]),
      'la valeur de départ doit se dériver de SOUS_ONGLETS, pas se recopier à côté');
    vrai(!/'reel'|'portefeuille'|'donnees'|'depenses'/.test(decl[1]),
      'aucun nom d’onglet en dur : l’ordre de la table doit décider seul');
  });

  test('personne ne juge un mois en deux couleurs', () => {
    /* Le verdict sur un mois s'affiche a six endroits : les barres du Budget, le
       tableau large, la liste sur telephone, le depliant « Voir les donnees », la
       jauge de la carte budget de l'accueil, et le total de la fenetre de saisie.
       Quatre gardaient le jugement binaire apres que le graphique soit passe a
       trois niveaux : le meme mois etait rouge sur l'accueil et orange trois
       ecrans plus loin.

       Le controle lit la source, faute de mieux : un ternaire qui choisit entre
       « down » et « up » est exactement le motif qui divergeait, et il ne doit
       plus en rester un seul. */
    vrai(source, 'assets/app.js doit être lisible pour ce contrôle');
    eq((source.match(/\?\s*'down'\s*:\s*'up'/g) || []).length, 0,
      'un jugement binaire sur l’objectif subsiste : passer par classeDepassement()');
    /* Et le passage unique est emprunte, pas seulement disponible. */
    vrai((source.match(/classeDepassement\(/g) || []).length >= 5,
      'les vues qui jugent un mois doivent toutes appeler classeDepassement()');
  });

  test('aucun geste ne dispute le défilement de la page', () => {
    /* Le geste « repousser la page pour revenir a l'accueil » est parti, et avec
       lui la derniere liste d'exclusions ecrite a la main de cette application :
       champs de saisie, tableaux defilants, ruban de reperes, lignes de compte,
       listes mobiles. Il fallait l'etendre a chaque nouveau composant qui defile
       ou qui glisse, et le prochain aurait vu son geste vole en silence.

       Il s'armait au sommet de la page, quand `scrollY` valait zero — exactement
       la condition ambigue qui a coute quatre tentatives sur la feuille des
       fiches. Un geste qui ne fait gagner aucun geste, Apercu etant le premier
       onglet de la barre du bas, ne valait pas ce risque.

       Ce test garde la porte fermee : il ne reste qu'un ecouteur tactile de
       navigation, celui du tiroir, et plus aucune liste d'exclusions. */
    vrai(source, 'assets/app.js doit être lisible pour ce contrôle');
    eq((source.match(/GLISSE_LATERAL/g) || []).length, 0,
      'la liste d’exclusions du geste de retour ne doit pas revenir');
    eq((source.match(/monteRetourAccueil/g) || []).length, 0,
      'ni le geste lui-même');
    eq((source.match(/accueil-dessous/g) || []).length, 0,
      'ni son calque de profondeur');
    /* Le CSS doit avoir suivi : une regle orpheline dessinerait une poignee qui
       n'annonce plus rien. */
    const css = lire('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible');
    eq((css.match(/body\.repousse/g) || []).length, 0,
      'et les règles de la page-carte sont parties avec');
  });

  test('un compte change de type, sauf si ça laisse un placement sans place', () => {
    /* Le type n'etait pas modifiable, et la seule issue apres une faute de frappe
       etait de supprimer puis recreer. Les releves mensuels etant indexes par
       identifiant de compte, recreer perd l'historique : l'absence de ce reglage
       ne protegeait rien, elle poussait vers un contournement destructeur.

       Elle n'etait pas gratuite pour autant. Le type commande les classes qu'un
       compte peut porter, et passer un compte-titres en livret laisserait un
       Livret A detenant des actions — aucun ecran ne s'en plaindrait, ils
       compteraient simplement des actions dans les liquidites. */
    Fixture.poser();
    const cash = c => ({ id: 'x', type: c, cash: [{ montant: 500, affectation: 'courant' }], lignes: [] });

    /* Entre types de meme forme, rien ne s'y oppose. */
    vrai(changementDeTypePossible(cash('courant'), 'livret').ok,
      'un compte courant devient un livret : les deux ne portent que des espèces');
    vrai(changementDeTypePossible(cash('livret'), 'courant').ok, 'et réciproquement');
    vrai(changementDeTypePossible(cash('courant'), 'cto').ok,
      'un compte-titres accepte aussi des espèces');

    /* Vers un type qui ne porte pas d'especes, refus motive. */
    const versImmo = changementDeTypePossible(cash('courant'), 'immo');
    vrai(!versImmo.ok, 'un immobilier ne porte pas d’espèces');
    vrai(/espèces/.test(versImmo.raison), 'et la raison dit pourquoi');

    /* Un compte porteur de titres ne peut pas devenir un livret. C'est le cas
       qui justifie toute la regle. */
    const pea = Store.state.comptes.find(c => typeCompte(c.type).titres
      && lignesDe(c).some(l => l.classe === 'actions'));
    vrai(pea, 'le fixture porte un compte de titres');
    const versLivret = changementDeTypePossible(pea, 'livret');
    vrai(!versLivret.ok, 'un livret ne peut pas détenir des actions');
    vrai(/Déplace/.test(versLivret.raison),
      'et la raison dit quoi faire, pas seulement que c’est refusé');

    /* Le meme compte vers un type qui accepte les actions : possible. */
    vrai(changementDeTypePossible(pea, 'av').ok,
      'une assurance-vie accepte les actions, le changement passe');

    /* Cas limites : type inconnu, meme type, compte absent. */
    vrai(!changementDeTypePossible(cash('courant'), 'nawak').ok, 'un type inconnu se refuse');
    vrai(!changementDeTypePossible(null, 'livret').ok, 'un compte absent aussi');
    const sur = changementDeTypePossible(cash('courant'), 'courant');
    vrai(sur.ok && sur.sansChangement, 'le même type ne change rien et ne se plaint pas');

    /* Une poche a zero ne bloque pas : elle ne porte rien. */
    vrai(changementDeTypePossible(
      { id: 'x', type: 'courant', cash: [{ montant: 0, affectation: 'courant' }], lignes: [] },
      'immo').ok, 'une part à zéro n’empêche rien');
  });

  test('la couleur d’un groupe de comptes ne s’invente pas', () => {
    /* Elle etait un hachage du nom du groupe vers les huit teintes de serie.
       « t-courant » et « t-cto » tombaient tous deux sur `series-6` — deux groupes
       de la meme couleur dans la meme liste, ce que la couleur devait justement
       eviter. Et le hachage piochait dans un vocabulaire qui veut dire autre
       chose : `series-1` est le bleu des liquidites, `series-2` le vert des actifs
       de marche : un etablissement de banque heritait donc du vert des actifs
       de marche.

       C'est pire qu'une absence de couleur : un faux signal dans une langue que
       le reste de l'application tient juste, et que le test « un actif porte la
       meme couleur partout » protege. Sur Comptes, une couleur veut desormais dire
       une classe d'actif, ou rien. */
    const bloc = source.slice(source.indexOf('function teinteGroupe'),
                              source.indexOf('function teinteGroupe') + 400);
    vrai(!/charCodeAt/.test(bloc),
      'la teinte d’un groupe ne se calcule plus depuis son nom');
    /* Elle ne prend plus d'argument : elle ne peut donc plus dependre de
       l'identite du groupe, ce qui est la garantie qu'on cherche. Une assertion
       plus large — aucune teinte de serie choisie par un index — attrapait
       `teinterParRang`, qui est legitime : la, la couleur vient du rang dans une
       seule liste, attribuee en un seul endroit pour le tableau et le camembert,
       donc toujours d'accord avec elle-meme et sans collision possible. */
    vrai(/function teinteGroupe\(\)/.test(bloc),
      'et elle ne reçoit plus rien dont elle pourrait la tirer');
    /* Et chaque groupe garde une vraie couleur, tiree de ce qu'il contient.

       L'assertion regardait `CLASSE_COULEURS[classe]`, passe par l'onglet
       « Placement » de la page Actifs — onglet retire le 8 aout 2026, puisqu'il
       redisait la carte « Repartition » de l'accueil sans son pourcentage. Elle
       porte donc sur le mecanisme qui reste, et qui tient le meme invariant :
       `teinteDominante()` prend la classe majoritaire du contenu. Un courtier
       plein de titres se lit vert, un livret bleu, et jamais l'inverse. */
    vrai(/teinteDominante\(/.test(source),
      'chaque groupe reçoit la couleur de ce qu’il contient');
    /* Les trois groupes de la page Actifs — un établissement, le hors-contenant,
       une enveloppe — plus les deux en-têtes de fiche. Le compte est fait sur les
       appels réels et non sur les mentions : deux commentaires la nomment. */
    const appels = source.slice(source.indexOf('function viewAccounts'),
                                source.indexOf('function mountAccounts'));
    eq((appels.match(/teinteDominante\(/g) || []).length, 3,
      'les trois groupes de la page passent tous par elle : aucun ne se peint '
      + 'autrement');
  });

  test('le reste à verser sur un livret plafonné', () => {
    /* Un Livret A s'arrete a 22 950 EUR. Le plafond est saisi et non deduit du
       type : le modele connait « livret », pas le produit, et une table des
       plafonds par produit aurait demande d'etre tenue a jour a chaque
       revalorisation reglementaire.

       Le cas qui compte est le depassement. Un livret peut passer son plafond
       par le seul jeu des interets, c'est legal, et « il reste −40 EUR a verser »
       serait une facon absurde de dire qu'il est plein. */
    const livret = m => ({ id: 'l', type: 'livret', cash: [{ montant: m, affectation: 'precaution' }] });

    eq(resteAVerser(livret(5000)), null,
      'sans plafond déclaré, il n’y a rien à dire');
    eq(resteAVerser({ ...livret(5000), plafond: 0 }), null,
      'un plafond à zéro vaut absence de plafond, pas un livret plein');

    const p = resteAVerser({ ...livret(10000), plafond: 22950 });
    pres(p.reste, 12950, 'il reste le plafond moins ce qui est versé');
    pres(p.verse + p.reste, p.plafond, 'et les deux font le plafond, sans reste');
    pres(p.part, 10000 / 22950 * 100, 'la part remplie suit le même rapport');
    vrai(!p.plein, 'à 10 000 sur 22 950, le livret n’est pas plein');

    /* Le depassement, par les interets. */
    const d = resteAVerser({ ...livret(23100), plafond: 22950 });
    pres(d.reste, 0, 'un dépassement ne donne pas un reste négatif');
    pres(d.part, 100, 'et la jauge ne dépasse pas sa boîte');
    vrai(d.plein, 'le livret est annoncé plein');

    /* Pile au plafond : plein, et rien a verser. */
    const e = resteAVerser({ ...livret(22950), plafond: 22950 });
    pres(e.reste, 0, 'pile au plafond, il ne reste rien');
    vrai(e.plein, 'et il est plein');

    /* Plusieurs poches sur le meme livret : c'est leur somme qui compte, un
       plafond porte sur le compte et non sur un usage. */
    const deux = resteAVerser({ id: 'l', type: 'livret', plafond: 22950,
      cash: [{ montant: 8000, affectation: 'precaution' }, { montant: 2000, affectation: 'projet' }] });
    pres(deux.verse, 10000, 'les poches d’un même livret s’additionnent');
    pres(deux.reste, 12950, 'et le reste se calcule sur leur somme');
  });

  test('la date d’ouverture reste atteignable partout où elle existe', () => {
    /* Elle ne compte que pour trois types de compte : un PEA se debloque a cinq
       ans, une assurance-vie a huit, un PER a la retraite. Le modele porte le
       drapeau qui le dit, et la fiche s'en sert desormais pour ne pas donner la
       meilleure place de la carte a une date que personne ne relit sur un compte
       courant.

       Le risque de ce genre de tri est d'enterrer la donnee : quelqu'un qui a
       saisi une date sur un livret doit pouvoir la corriger ou l'effacer, et un
       champ qu'on ne peut plus atteindre est une donnee perdue.

       Depuis le 5 aout 2026 la date ne se saisit plus dans la page : elle s'y
       lit, et se corrige par « Modifier ». L'invariant n'a pas bouge, c'est
       l'endroit ou il se verifie qui a change — la premiere version de ce test
       comptait deux champs de saisie et a echoue au bon moment. Il regarde donc
       les deux moities : ce que la fiche montre, et ce que le formulaire
       propose. */
    const fiche = source.slice(source.indexOf('function viewFicheCompte'),
                               source.indexOf('function viewFicheEtab'));
    vrai(fiche.length > 1000, 'la fiche de compte doit être trouvable');

    /* Ce qui se lit. Sur un type ou l'anciennete debloque quelque chose, la
       ligne reste meme vide : son absence est un manque, pas un silence. */
    vrai(!/comptes\.\$\{idx\}\.ouvertLe/.test(fiche),
      'la date ne se saisit plus dans la page : elle est passée derrière « Modifier »');
    /* Deux lignes de date : celle qui reclame sur un type sensible, celle qui
       constate ailleurs quand la date existe. La seconde ne porte plus le mot en
       dur — une Rolex n'a pas de date d'ouverture, elle a une date d'achat — et
       le tire de `motDateCompte()`, qui vit cote store avec le predicat. */
    eq((fiche.match(/Date d’ouverture/g) || []).length, 1,
      'la ligne des types sensibles garde le mot : un PEA s’ouvre');
    vrai(/motDateCompte\(t\)/.test(fiche),
      'l’autre ligne dérive son intitulé du type au lieu de le recopier');
    eq(motDateCompte(typeCompte('bienValeur')), 'Date d’achat',
      'un bien de valeur s’achète');
    eq(motDateCompte(typeCompte('immo')), 'Date d’achat', 'un bien immobilier aussi');
    eq(motDateCompte(typeCompte('courant')), 'Date d’ouverture', 'un compte s’ouvre');
    eq(motDateCompte(typeCompte('pea')), 'Date d’ouverture', 'un PEA aussi');
    vrai(/à renseigner/.test(fiche),
      'un type sensible sans date le dit, au lieu de masquer la ligne');
    vrai(/t\.dateSensible \? `/.test(fiche),
      'la branche visible se décide sur le drapeau du modèle');

    /* Ce qui se corrige. Le formulaire propose la date a tout compte qui n'est
       pas les especes, y compris ceux ou elle ne sert a rien : c'est la seule
       facon d'effacer une date posee par erreur sur un livret. */
    const debut = source.indexOf("async 'modifier-compte'");
    vrai(debut > 0, 'l’action modifier-compte doit exister');
    const handler = source.slice(debut, debut + 2800);
    vrai(handler.includes("cle: 'ouvertLe'"),
      'le formulaire de modification doit porter la date d’ouverture');
    vrai(/label: motDateCompte\(/.test(handler),
      'et l’intitulé du formulaire suit le même mot que la fiche');
    vrai(!/dateSensible[^\n]*champs\.push/.test(handler),
      'le champ ne doit pas être réservé aux types sensibles : une date posée par '
      + 'erreur ailleurs deviendrait ineffaçable');

    /* Le drapeau existe, et sur les trois types attendus. Une vue qui recopierait
       la liste des types finirait par ne plus decrire le modele. */
    const sensibles = TYPES_COMPTE.filter(t => t.dateSensible).map(t => t.id).sort();
    eq(sensibles.join(','), 'av,pea,per',
      'PEA, assurance-vie et PER sont les trois types dont l’ancienneté compte');
    for (const t of TYPES_COMPTE.filter(t => !t.dateSensible)) {
      vrai(!t.dateSensible, `${t.id} n’a pas d’âge qui débloque quoi que ce soit`);
    }
  });

  test('le premier lancement passe la graine par la migration', () => {
    /* Le pendant du controle d'execution : celui-la verifie que `load()` appelle
       bien la migration sur la branche de la graine, ce qu'aucun test
       d'execution ne peut voir sans toucher au stockage.

       La branche relue l'appelait, la branche graine non. Un etat a moitie
       construit en sortait, avec un patrimoine a zero, et cela ne se voyait qu'a
       la premiere visite — donc jamais en developpement. */
    const storeSrc = lireSource('assets/store.js');
    vrai(storeSrc, 'assets/store.js doit être lisible pour ce contrôle');
    /* La borne est la fin de la methode, pas la methode suivante : entre
       `load()` et `save()` vivent `migrate()` et ses dix sous-migrations, soit
       19 000 caracteres ou le motif cherche se trouve forcement. La tranche
       aurait passe quoi qu'il arrive. */
    const debutLoad = storeSrc.indexOf('  load() {');
    const load = storeSrc.slice(debutLoad, storeSrc.indexOf('\n  },', debutLoad));
    vrai(load.length > 200 && load.length < 2000,
      'la tranche lue doit être load() seule, pas la moitié du fichier');
    const branche = load.slice(load.indexOf('structuredClone(SEED)'));
    vrai(/this\.migrate\(\)/.test(branche),
      'la branche qui pose la graine doit appeler migrate(), comme celle qui relit');
  });

  test('le « ? » d’une aide n’est pas un bouton', () => {
    /* Un `<label>` sans `for` designe le premier element etiquetable qu'il
       contient, et un `<button>` en est un : le navigateur renvoyait donc au
       « ? » tout clic tombe sur l'intitule, et lui donnait le focus a la place
       du champ. La bulle s'ouvrait sur toute la ligne. Treize intitules portent
       un « ? » a l'interieur de leur label — le defaut valait pour les treize.

       Un span n'est pas etiquetable, mais il ne repond pas au clavier tout
       seul : les deux moities de la correction doivent tenir ensemble. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const m = src.match(/function aide\(texte\) \{[\s\S]*?\n\}/);
    vrai(m, 'aide() doit être trouvable dans la source');
    /* Le gabarit rendu, et lui seul, à partir du `return` : le commentaire qui
       explique la correction cite « <button> » deux fois et porte lui-même des
       accents graves. Un contrôle qui lit tout le corps se déclenchait sur son
       propre exposé des motifs, puis lisait un morceau de commentaire en croyant
       lire le gabarit. Les deux erreurs ont eu lieu, dans cet ordre. */
    const rendu = m[0].slice(m[0].indexOf('return')).match(/`[\s\S]*?`/);
    vrai(rendu, 'aide() doit rendre un gabarit');
    vrai(!/<button/.test(rendu[0]),
      'aide() ne doit pas rendre un <button> : un label le revendiquerait');
    vrai(/role="button"/.test(rendu[0]) && /tabindex="0"/.test(rendu[0]),
      'mais le « ? » garde son rôle et son entrée au clavier');
    vrai(/onkeydown/.test(src),
      'et monteAides doit écouter Entrée : un span ne convertit pas la touche en clic');

    /* Le compte des intitules concernes, pour que ce controle dise de quoi il
       parle : s'il tombe a zero, c'est que le motif a change de forme. */
    const labels = (src.match(/<label[^>]*>[^<]*\$\{aide\(/g) || []).length
                 + (src.match(/<label>\$\{esc\([^)]*\)\}\$\{aide/g) || []).length;
    vrai(labels > 5, 'plusieurs intitulés portent un « ? » : ' + labels);
  });

  test('les écouteurs des info-bulles ne se posent qu’une fois', () => {
    /* `monteAides` tourne a chaque rendu. Ses ecouteurs de document doivent donc
       etre gardes : sans cela, une session de cinquante rendus en empile
       cinquante fois autant, qui font tous le meme travail et qu'aucun ne retire.
       La fuite ne se voit pas — le comportement reste juste — jusqu'a ce que la
       page rame.

       Le garde protegeait un seul ecouteur, celui qui referme au premier appui
       ailleurs. Depuis que tous les autres sont delegues eux aussi, il protege la
       fonction entiere, et c'est bien plus qu'avant qu'il faut empecher
       d'empiler. */
    const bloc = source.slice(source.indexOf('function monteAides'),
                              source.indexOf('function yearControl'));
    vrai(bloc.length > 300, 'monteAides doit être trouvable');
    const globaux = bloc.match(/document\.addEventListener/g) || [];
    vrai(globaux.length >= 6, 'les écouteurs du panneau vivent tous sur le document');
    vrai(/if \(monteAides\.monte\) return;\s*\n\s*monteAides\.monte = true;/.test(bloc),
      'et la fonction entière doit sortir au deuxième appel, pas à chaque rendu');
  });

  test('l’objectif de dépenses ne se règle qu’à un seul endroit', () => {
    /* Il a porte deux champs a la fois, un par onglet du budget, tous deux
       branches sur `budget.monthlyTarget`. L'argument etait qu'ils ne sont jamais
       visibles en meme temps — ce qui disait surtout que personne ne pouvait
       verifier qu'ils s'accordaient. C'est le motif que ce projet defait sans
       cesse : deux ecritures d'une meme chose, qui finissent par diverger.

       Elles ne pouvaient pas diverger ici, les deux pointant le meme chemin. Le
       cout etait ailleurs : deux endroits a trouver, et deux a corriger le jour
       ou la regle change. Le reglage passe par une fenetre, appelee depuis le
       montant qui l'affiche.

       Le controle compte les champs de saisie branches sur ce chemin. La fenetre
       n'en pose pas : `askForm` construit ses champs par identifiant, sans
       `data-path`. */
    const champs = source.match(/data-path="budget\.monthlyTarget"/g) || [];
    eq(champs.length, 0,
      'aucun champ en dur ne doit écrire l’objectif : la fenêtre s’en charge');
    vrai(/'regler-objectif-depenses'/.test(source),
      'et l’action qui ouvre cette fenêtre doit exister');
    vrai(/data-action="regler-objectif-depenses"/.test(source),
      'avec un montant cliquable qui l’appelle');
  });

  test('le geste de fermeture confisque ce qu’il prend', () => {
    /* Une feuille dont le contenu tient en entier — « Depenses 2026 » mesure
       481 px dans 481 px — n'avait aucun geste : la fermeture ne partait que de
       l'en-tete, et le doigt pose dans le contenu allait faire glisser la page
       derriere, qu'on voyait bouger sous la feuille.

       Trois choses etaient fausses ensemble, et il fallait les trois pour que ca
       marche. `body { overflow: hidden }` ne verrouille pas iOS, qui laisse le
       document rebondir. `overscroll-behavior: contain` sur le corps ne
       s'applique que s'il defile vraiment, ce qui etait faux dans ce cas precis.
       Et l'ecouteur `touchmove` etait passif, donc incapable d'appeler
       `preventDefault` : le navigateur gardait la main quoi qu'on fasse.

       Ce que ce controle protege, c'est le dernier point — le seul ecouteur non
       passif du fichier, qu'un nettoyage bien intentionne remettrait volontiers
       en passif pour la performance. Il n'y a pas de performance a gagner : un
       geste de defilement rend la main avant meme d'etre qualifie. */
    const geste = source.slice(source.indexOf('function monteGlissementFermeture'),
                               source.indexOf('function monteVideChamp'));
    vrai(geste.length > 500, 'le geste de fermeture doit être trouvable');
    vrai(/touchmove[\s\S]*?\{\s*passive:\s*false\s*\}/.test(geste),
      'le touchmove du panneau doit rester non passif, sinon la page derrière glisse');
    vrai(/preventDefault\(\)/.test(geste),
      'et il doit confisquer le geste qu’il prend');

    /* Et la condition d'armement : « le corps ne peut pas defiler », non « le
       corps est en haut de son defilement ». La seconde a coute quatre
       tentatives, parce qu'une fiche longue s'ouvre toujours en haut : elle y
       rendait l'ambiguite permanente au lieu d'exceptionnelle. */
    vrai(/scrollHeight\s*-\s*\w+\.clientHeight/.test(geste),
      'l’armement se décide sur la capacité à défiler');
    vrai(!/scrollTop\s*===?\s*0/.test(geste),
      'jamais sur scrollTop === 0 : une fiche longue s’ouvre toujours en haut');
  });

  test('la barre du bas et le menu suivent le même ordre', () => {
    /* Deux navigations pour une seule application, dans deux ordres : la barre
       disait Aperçu, Marchés, Budget, Allocation quand le menu disait Aperçu,
       Budget, Marchés, Allocation. La mémoire de la position ne servait alors
       qu'à moitié, selon l'écran sur lequel on se trouvait.

       Le test lit le HTML : l'ordre des entrées de la barre doit être celui de
       leurs homologues dans le menu latéral. Il ne compare que les destinations
       communes — le menu en porte deux de plus, Comptes et Données, qui vivent
       dans les réglages. */
    const html = lire('index.html');
    vrai(html, 'index.html doit être lisible pour ce contrôle');
    const vues = bloc => [...bloc.matchAll(/data-view="([a-z]+)"/g)].map(m => m[1]);
    const menu = vues(html.slice(html.indexOf('<nav class="nav"'), html.indexOf('</nav>')));
    const barre = vues(html.slice(html.indexOf('<nav class="tabbar"')));
    vrai(barre.length >= 4, 'la barre du bas porte ses destinations');
    eq(barre.join(' '), menu.filter(v => barre.includes(v)).join(' '),
      'la barre du bas doit suivre l’ordre du menu latéral');

    /* La barre du bas est une pilule flottante, et ce qui compte est autant ce
       qu'elle porte que ce qu'elle ne porte pas.

       Ce contrôle a changé de camp deux fois, et c'est la deuxième version qui
       se trompait. Il a d'abord exigé une pilule. Le 5 août 2026 il a exigé
       l'inverse — une barre pleine largeur qui touche le bord — parce qu'un
       iPhone montrait 43 px de page nue sous la pilule, presque noirs en thème
       sombre, lus comme un bord d'écran perdu. Mais la bande morte ne venait pas
       de la pilule : elle venait de sa jupe, 200 px de couleur de page peints
       sous elle, qui masquaient le contenu au lieu de le laisser défiler. La
       barre pleine largeur a supprimé la bande en étalant son flou d'un bord à
       l'autre, et le propriétaire a tranché sur photo : « tout le bas apparaît flou
       au lieu de juste l'ovale du menu, le reste devrait être limpide, on devrait
       voir l'écran défiler derrière ».

       D'où les trois assertions : la pilule est détachée des bords, la zone de
       gestes la soulève au lieu de la gonfler, et *rien* n'est peint sous elle.
       La dernière est celle qui aurait attrapé le défaut d'origine. */
    /* Les commentaires sont retires avant de chercher : celui qui explique
       pourquoi la barre n'a pas d'`overflow: hidden` nomme forcement la
       propriete qu'on interdit, et le test se serait declenche sur sa propre
       explication. */
    const css = (lireSource('assets/styles.css') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    /* `lastIndexOf` et non `indexOf` : le fichier ouvre sur
       `.burger, .nav-backdrop, .tabbar { display: none; }`, et partir de la
       prenait tout le CSS dans la tranche — ou n'importe quel `overflow: hidden`
       se trouve, ce qui faisait echouer le controle pour une regle etrangere.
       La longueur est bornee pour que ce piege ne revienne pas en silence. */
    const debut = css.lastIndexOf('.tabbar {');
    const regleTabbar = css.slice(debut, css.indexOf('}', debut) + 1);
    /* La borne existe pour attraper une tranche qui aurait mangé la moitié du
       fichier, pas pour limiter la règle : le verre l'a rallongée de trois
       déclarations. Elle reste très en dessous de la taille du bloc suivant. */
    vrai(regleTabbar.length < 1400,
      'la tranche lue doit être la seule règle .tabbar, pas la moitié du fichier');
    /* Le jeton et non plus 999px en toutes lettres : l'intention du contrôle
       est « c'est une pilule », et l'échelle des rayons est fermée depuis le
       9 août 2026. */
    vrai(/border-radius:\s*var\(--radius-pill\)/.test(regleTabbar),
      'la barre du bas est un ovale : c’est lui qui porte le fond et le flou, et '
      + 'lui seul');
    vrai(/left:\s*[1-9]/.test(regleTabbar) && /right:\s*[1-9]/.test(regleTabbar),
      'et elle est détachée des bords latéraux, sinon l’ovale n’a plus de côtés');
    const ecart = regleTabbar.match(/bottom:\s*([^;]+);/);
    vrai(ecart, 'la règle doit dire à quelle hauteur la pilule flotte');
    vrai(/var\(--zone-geste\)/.test(ecart[1]) && /[1-9]\d*px/.test(ecart[1]),
      'la zone de gestes la soulève du bord par son bottom : en remplissage elle '
      + 'gonflerait la hauteur de la barre, et le fond couvrirait de nouveau le bas '
      + 'de l’écran');
    /* Le plancher protège le cas qu'on ne voit pas en développant sur un
       téléphone à encoche : `env(safe-area-inset-bottom)` vaut zéro sur un
       iPhone SE, sur la plupart des Android et dans toute fenêtre où le système
       ne réserve rien. Sans `max()`, l'écart de dessin y devient l'écart total,
       et la pilule se colle au bord physique. */
    vrai(/max\(/.test(ecart[1]),
      'et un plancher doit tenir quand la zone de gestes vaut zéro, sinon la '
      + 'pilule colle au bord sur tout appareil qui ne réserve rien');
    vrai(!/padding-bottom/.test(regleTabbar),
      'donc pas de padding-bottom sur la barre : c’est ce qui étendait son fond '
      + 'jusqu’au bord bas');

    /* Le verre et l'ombre du texte tiennent ensemble, et c'est le lien qu'on
       oublie. Le fond de la barre est à 14 % : ce qui garde « Allocation »
       lisible quand un aplat clair du graphique passe dessous, ce n'est plus le
       fond, c'est l'ombre portée des libellés et des traits d'icônes. La retirer
       ne casserait rien de visible en développement — sur un thème sombre, une
       ombre sombre ne se voit pas — et rendrait la barre illisible sur les seules
       pages qui ont des couleurs claires derrière. */
    const opacite = regleTabbar.match(/var\(--surface-1\)\s*(\d+)%/);
    vrai(opacite, 'le fond de la barre doit se lire dans sa règle');
    const lien = css.indexOf('.tabbar a, .tabbar button');
    const regleLien = css.slice(lien, css.indexOf('}', lien) + 1);
    vrai(/text-shadow:/.test(regleLien),
      `le fond de la barre est à ${opacite[1]} % : sans ombre portée sur les `
      + 'libellés, un aplat clair passant dessous les mange');

    /* La variable vit hors de toute requête média. Déclarée sous un point de
       rupture, elle ne vaudrait rien pour les règles écrites sous un autre, et
       `calc(78px + var(--zone-geste))` retomberait silencieusement à rien. */
    const decl = css.indexOf('--zone-geste:');
    vrai(decl > 0, '--zone-geste doit être déclarée');
    vrai(decl < css.indexOf('@media'),
      '--zone-geste doit être déclarée avant la première requête média, donc '
      + 'globalement : une variable sous un point de rupture ne vaut rien ailleurs');

    /* Rien ne peint sous la pilule. La jupe le faisait : un pseudo-élément de
       200 px, opaque, à `top: 100%`. Elle prétendait couvrir le trou qu'un
       décalage de la fenêtre visible découvre sous un élément fixe — clavier qui
       se referme, barre d'outils qui se replie — mais `html, body` portent déjà
       `background: var(--page)`, donc le canvas est peint et rien ne peut virer
       au noir. Son seul effet visible était de masquer le contenu qui devrait
       défiler jusqu'au bord. */
    vrai(!/\.tabbar::after/.test(css),
      'aucune jupe sous la barre : un pseudo-élément opaque posé sous une pilule '
      + 'flottante masque le contenu qui doit défiler jusqu’au bord bas');
    vrai(/html,\s*body\s*\{[^}]*background:\s*var\(--page\)/.test(css),
      'et c’est le fond de la page qui rend cette jupe inutile : sans lui, la '
      + 'bande découverte par un décalage de la fenêtre visible virerait au noir');

    /* Le seuil de la barre du bas est celui de la barre laterale, et rien
       d'autre. Il a valu 767 px quand la laterale ne redevient une colonne qu'a
       900 : entre les deux — l'iPad en portrait — l'ecran n'avait ni menu en bas
       ni menu a gauche, et la navigation ne tenait qu'au bouton de profil. Une
       mise en page et le mobilier qui la sert basculent au meme seuil. */
    const posBarre = css.lastIndexOf('.tabbar {');
    let seuil = null;
    for (const m of css.matchAll(/@media \(max-width:\s*(\d+)px\)/g)) {
      if (m.index < posBarre) seuil = m[1]; else break;
    }
    vrai(seuil, 'la barre du bas doit vivre sous une requête média de largeur');
    eq(seuil, '900',
      'la barre du bas s’affiche jusqu’au seuil où la barre latérale revient, '
      + '900 px : sinon il existe une largeur sans aucun menu');

    /* Aucune entree de menu ne doit mener a un ecran qu'une autre atteint deja.
       Les vues devenues sous-onglets — performance, rebalance, settings,
       objective — ont toutes quitte ce menu quand elles ont ete absorbees : deux
       chemins vers le meme ecran font douter qu'ils aillent au meme endroit. */
    const absorbees = Object.keys(litteral('REDIRECTIONS'));
    for (const vue of menu) {
      vrai(!absorbees.includes(vue),
        `« ${vue} » est un sous-onglet : son entrée de menu doublonne avec celle `
        + `de la vue qui l’a absorbée`);
    }
  });

  test('les pictogrammes du menu restent allumés sur téléphone', () => {
    /* Les sept icones du menu etaient dans le HTML, dimensionnees par une regle
       mobile, puis eteintes par une seconde regle du meme bloc : meme
       specificite, ecrite apres, donc c'est elle qui gagnait. Le tiroir « Plus »
       montrait des intitules nus a cote d'une gouttiere vide, pendant que le
       menu de bureau et la barre du bas portaient les memes dessins.

       Invisible a l'inspection du DOM — les <svg> sont bien la — et invisible
       aux tests de calcul. Il faut lire la feuille de style. */
    const css = lire('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    const eteint = /\.nav\s+a\s+\.ic\s*\{[^}]*display:\s*none/.test(css);
    vrai(!eteint, 'une règle éteint les icônes du menu : elles doivent rester visibles');
    vrai(/\.nav\s+a\s+svg\.ic\s*\{[^}]*(width|height)/.test(css),
      'et elles gardent une taille explicite, sinon un SVG sans dimension s’étale');
  });

  test('aucun tiret cadratin dans le texte affiché', () => {
    /* Règle d'écriture du projet : une virgule, un deux-points ou une
       parenthèse. Les commentaires de code peuvent les garder, eux ne
       s'affichent pas. */
    const fautifs = [];
    for (const f of ['assets/app.js', 'assets/store.js', 'index.html']) {
      const s = lire(f);
      vrai(s, f + ' doit être lisible pour ce contrôle');
      const vu = texteAffiche(s);
      for (let i = 0; i < vu.length; i++)
        if (vu[i] === '—')
          fautifs.push(f + ' ligne ' + (s.slice(0, i).split('\n').length));
    }
    eq(fautifs.length, 0, 'tiret cadratin affiché : ' + fautifs.join(', '));
  });

  test('la carte d’évolution n’existe qu’en un seul exemplaire', () => {
    /* Elle a d'abord ete ecrite deux fois, pour deux ecrans, et elle a diverge
       en silence : l'accueil passait par pointsEvolution() et savait faire net,
       les releves appelaient historySeries() et tracaient toujours le brut,
       sous le meme titre. Deux cartes de meme nom montrant deux chiffres.

       Elle n'est plus affichee qu'a un seul endroit, l'accueil : sur les
       releves elle redisait cet accueil ET le tableau juste en dessous, qui
       donne les memes montants mois par mois avec leur ecart. Cette page sert a
       saisir. Le controle garde ce qui reste vrai : le balisage vit dans une
       fonction, jamais recopie, pour que la deuxieme vue qui en voudra une
       reprenne celle-ci. */
    vrai(source, 'app.js doit être lisible pour ce contrôle');
    /* Le titre passe par `trad()` depuis qu'il se traduit : le controle suit la
       phrase, qui est justement la clef du dictionnaire, et non le balisage. */
    const titres = source.match(/trad\('Évolution du patrimoine'\)/g) || [];
    eq(titres.length, 1,
      'la carte d’évolution doit être écrite une fois et appelée deux : ' + titres.length + ' exemplaires');
    /* Sa definition et son appel : le balisage ne doit jamais etre recopie
       dans une vue, meme s'il n'y en a plus qu'une a l'afficher. */
    const appels = source.match(/carteEvolution\(/g) || [];
    vrai(appels.length >= 2,
      'carteEvolution doit être définie une fois et appelée, jamais recopiée');
  });

  test('l’onglet « Charges fixes » ne porte pas de pastille', () => {
    /* Le libellé occupe 78 px des 88 px utiles d'un onglet à 375 px. Nu, il
       tient sur une ligne. Une pastille ajoute 6 px plus son écart, le texte
       passe à la ligne et la barre gagne 17 px de haut.

       Mesuré, pas supposé. Le contrôle ne refait pas le calcul de pixels : il
       garde l'invariant qui le rend inutile. Si cet onglet doit un jour
       réclamer une saisie, il faut d'abord raccourcir son nom. */
    vrai(source, 'app.js doit être lisible pour ce contrôle');
    const bloc = source.match(/const PASTILLE_SOUS_ONGLET = \{([\s\S]*?)\n\};/);
    vrai(bloc, 'PASTILLE_SOUS_ONGLET doit rester repérable dans le source');
    const cles = [...bloc[1].matchAll(/^\s*(\w+)\s*:/gm)].map(m => m[1]);
    vrai(cles.length > 0, 'le bloc doit porter au moins une clé, sinon la regex a glissé');
    eq(cles.includes('cadre'), false,
      'une pastille sur « Charges fixes » casse la barre en deux lignes à 375 px');
  });

  test('une grille à un seul enfant retombe sur une colonne', () => {
    /* Le trou est arrivé trois fois : deux tiers de contenu, un tiers de vide,
       parce qu'une carte avait quitté une grille à deux colonnes sans que la
       grille le sache. La règle CSS le rend impossible.

       La sonde porte sa propre classe à deux colonnes. Sa spécificité (0,1,0)
       est plus faible que celle de `.grid:has(> :only-child)` (0,2,0) : si la
       règle existe, elle gagne. Un style en ligne, lui, l'écraserait, et le
       test ne prouverait rien. */
    const style = document.createElement('style');
    style.textContent = '.sonde-grille{display:grid;grid-template-columns:1fr 1fr}';
    document.head.appendChild(style);
    const boite = document.createElement('div');
    boite.className = 'grid sonde-grille';
    document.body.appendChild(boite);

    const colonnes = () => getComputedStyle(boite).gridTemplateColumns.split(' ').length;
    try {
      boite.innerHTML = '<div>seul</div>';
      eq(colonnes(), 1, 'un enfant doit occuper toute la largeur');
      boite.innerHTML = '<div>un</div><div>deux</div>';
      eq(colonnes(), 2, 'deux enfants gardent les deux colonnes');
    } finally {
      boite.remove();
      style.remove();
    }
  });
});

/* ------------------------------------------------------------------
   8. La projection
   ------------------------------------------------------------------ */
suite('Projection de capitalisation', () => {

  test('départ + versements + rendement font le total', () => {
    /* La carte d'Objectif repose entièrement sur cette égalité, et sur le fait
       que `contributed` contient le capital de départ. */
    Fixture.poser();
    const p = capitalisation({ years: 10 });
    const d = p.points[p.points.length - 1];
    pres(d.contributed + d.gains, d.total, 'contributed + gains = total');
    vrai(d.contributed >= patrimoine().net,
      'contributed inclut le capital de départ, il ne peut pas lui être inférieur');
  });

  test('les trois poches font le patrimoine net', () => {
    /* La propriete qui garantit qu'aucun euro ne se perd ni ne se dedouble en
       changeant de poche. Si elle casse, la courbe entiere est fausse sans que
       rien ne le signale a l'ecran : les trois montants sont plausibles
       separement. */
    Fixture.poser();
    const q = pochesProjection();
    pres(q.marche + q.autres + q.plat, patrimoine().net,
      'marché + autres + plat = patrimoine net');
    /* Et le cash « à investir » est du côté des liquidités, pas du marché.

       Cette assertion disait exactement l'inverse, et elle passait : elle
       vérifiait `q.marche >= 1500` alors que le fixture porte 9 750 € de titres,
       donc elle aurait passé quelle que soit la poche du cash. Un test vert qui
       lit autre chose que ce qu'il croit lire est un test absent — c'est la
       leçon du 5 août, réapprise ici. Elle est écrite au montant exact,
       maintenant, et sur les deux poches à la fois : le cash à investir ne peut
       plus changer de côté sans qu'une des deux tombe. */
    pres(q.liquidites, nowTotals().cash,
      'les liquidités de la projection sont celles de l’accueil, cash à investir compris');
    pres(q.marche, num(nowTotals().bourse) + num(nowTotals().crypto),
      'et la poche de marché ne porte que ce qui cote');
    vrai(q.liquidites >= Fixture.CASH_A_INVESTIR,
      'le cash à investir est dans les liquidités : tant qu’il n’est pas placé, '
      + 'il ne rapporte rien');
  });

  test('un rendement des autres actifs à zéro les porte à plat', () => {
    Fixture.poser(s => { s.meta.projRateAutres = 0; });
    const d = capitalisation({ years: 10 }).points.at(-1);
    pres(d.contributed + d.gains, d.total, 'l’égalité fondatrice tient');
    pres(d.gainsAutres, 0, 'aucun gain sur les autres actifs');
    pres(d.gains, d.gainsMarche, 'tout le rendement vient du marché');
  });

  test('les deux taux au même niveau reproduisent le taux unique', () => {
    /* Le test de non-regression, et le plus important du lot. Il dit
       exactement ce qui doit etre vrai, et c'est ce que la migration garantit :
       un etat qui herite de son propre taux garde ses chiffres au centime.

       J'avais d'abord ecrit que « zero par defaut ne change rien ». C'etait
       faux, et ce test l'a attrape : avant, un seul taux s'appliquait aussi au
       non cote et aux liquidites, donc les porter a plat faisait baisser la
       projection de 4 402 EUR sur ce fixture. La valeur neutre n'est pas zero,
       c'est le taux du marche. */
    /* La propriete se verifie desormais sur la seule poche qui capitalise hors
       marche, le non cote : les liquidites sont plates par construction, donc on
       les met de cote pour comparer ce qui est comparable. */
    Fixture.poser(s => { s.meta.projRate = 5; s.meta.projRateAutres = 5; });
    const q = pochesProjection();
    const deuxTaux = capitalisation({ years: 10 }).points.at(-1);
    /* Le meme calcul en forçant marche et non cote dans une seule poche, ce qui
       reproduit l'ancien modele a un seul taux. */
    const unTaux = capitalisation({ years: 10, start: q.marche + q.nonCote }).points.at(-1);
    pres(deuxTaux.total - q.liquidites, unTaux.total,
      'même total qu’avec un taux unique, les liquidités mises à part');
    pres(deuxTaux.gains, unTaux.gains, 'et les mêmes gains');
  });

  test('le cash à investir est du cash sur tous les écrans', () => {
    /* Il etait compte dans les actifs de marche de la projection, au motif qu'il
       leur est destine. Sur l'accueil, le meme argent compte dans
       « Liquidites ». La meme somme portait donc deux classements selon l'ecran
       — le defaut que ce projet corrige partout ailleurs — et l'application
       affirmait au passage un rendement sur de l'argent qui n'en produit aucun,
       ce qu'elle refuse de faire pour le non cote.

       Le test compare les deux lectures du meme euro. Il aurait attrape le
       defaut le jour ou il a ete introduit : il suffit de demander a la poche de
       liquidites de la projection si elle contient bien le cash a investir que
       l'accueil y met. */
    Fixture.poser();
    const p = patrimoine();
    const investir = num(p.investir);
    vrai(investir > 0, 'le fixture porte du cash à investir');

    const q = pochesProjection();
    /* L'accueil compte les quatre poches de cash dans les liquidites. La
       projection doit compter les memes. */
    pres(q.liquidites, num(nowTotals().cash),
      'la poche de liquidités de la projection est celle de l’accueil, cash à investir compris');
    vrai(q.liquidites >= investir,
      'elle contient donc au moins le cash à investir');

    /* Et il ne capitalise pas : porter le taux de marche a 20 % ne doit rien
       ajouter aux liquidites. */
    Fixture.poser(s => { s.meta.projRate = 20; s.meta.projRateAutres = 0; s.meta.projMonthly = 0; });
    const d = capitalisation({ years: 10 }).points.at(-1);
    pres(d.gainsLiquidites, 0,
      'un taux de marché à 20 % ne fait rien gagner au cash à investir');

    /* Rien ne s'est perdu dans le deplacement : les trois poches font toujours
       le net, et c'est ce qui garantit qu'on a deplace au lieu de retrancher. */
    const r = pochesProjection();
    pres(r.marche + r.nonCote + r.liquidites + num(r.plat), patrimoine().net,
      'les trois poches et la part plate font le patrimoine net');
  });

  test('les liquidités ne capitalisent jamais', () => {
    /* Le taux « autres actifs » couvrait le non cote ET les liquidites : deux
       choses sans rapport sous un seul pourcentage, qui forcait a choisir entre
       sous-estimer un livret et inventer un rendement au non cote.

       Un troisieme selecteur a ete essaye pour les separer. Le propriétaire l'a
       refuse, et il avait raison : les liquidites ne capitalisent pas dans cette
       application, livret ou non, donc il n'y a rien a regler pour elles. Une
       constante n'a pas besoin d'un menu.

       Ce que le test verrouille : le taux ne touche que le non cote, les
       liquidites traversent la projection telles quelles, et la somme des deux
       fait toujours `gainsAutres`. */
    Fixture.poser(s => { s.meta.projRateAutres = 0; });
    const q = pochesProjection();
    vrai(q.nonCote > 0 && q.liquidites > 0, 'le fixture porte les deux poches');
    pres(q.nonCote + q.liquidites, q.autres, 'et leur somme fait « autres »');

    Fixture.poser(s => { s.meta.projRateAutres = 4; });
    const d = capitalisation({ years: 10 }).points.at(-1);
    pres(d.gainsNonCote, q.nonCote * Math.pow(1.04, 10) - q.nonCote,
      'le non coté croît de son taux');
    pres(d.gainsLiquidites, 0, 'les liquidités ne bougent pas d’un centime');
    pres(d.gainsNonCote + d.gainsLiquidites, d.gainsAutres,
      'et les deux font exactement le gain de la poche entière');
    pres(d.gains, d.gainsMarche + d.gainsAutres, 'le total des gains les contient tous');
    pres(d.total, d.contributed + d.gains, 'total = apporté + gains, toujours');

    /* Meme a taux eleve sur le non cote, les liquidites restent a leur montant :
       le test attraperait un branchement accidentel des deux poches. */
    Fixture.poser(s => { s.meta.projRateAutres = 15; });
    pres(capitalisation({ years: 30 }).points.at(-1).gainsLiquidites, 0,
      'trente ans plus tard, toujours zéro');
  });

  test('un rendement des autres actifs ajoute exactement sa croissance', () => {
    /* Et rien de plus : le marche ne doit pas bouger, ni la part plate. */
    Fixture.poser(s => { s.meta.projRateAutres = 0; });
    const q = pochesProjection();
    const sans = capitalisation({ years: 10 }).points.at(-1);

    Fixture.poser(s => { s.meta.projRateAutres = 4; });
    const avec = capitalisation({ years: 10 }).points.at(-1);

    pres(avec.gainsMarche, sans.gainsMarche, 'le marché est inchangé');
    /* Le non cote capitalise seul, sans versement : sa croissance est exactement
       celle des interets composes sur dix ans. Le calcul portait sur `q.autres`,
       non cote plus liquidites, du temps ou le taux couvrait les deux ; les
       liquidites sont maintenant plates, donc seul le non cote croit. */
    const attendu = q.nonCote * Math.pow(1.04, 10) - q.nonCote;
    pres(avec.gainsAutres, attendu, 'la croissance des autres actifs est celle de son taux');
    pres(avec.total - sans.total, attendu, 'le total monte de ce seul montant');
    pres(avec.contributed, sans.contributed, 'ce qui est acquis ne change pas');
  });

  test('le rendement des autres actifs vaut zéro par défaut', () => {
    /* L'application n'affirme aucun rendement sur des parts non cotees, y
       compris pour un etat qui n'a jamais connu ce champ. J'avais d'abord fait
       heriter ces etats de leur ancien taux unique pour ne deplacer aucun
       chiffre ; c'etait appliquer deux standards a la meme ignorance, puisque
       l'immobilier est gele pour cette exacte raison.
       Et un taux choisi a la main doit survivre a la migration, jouee deux fois
       comme une seule. */
    Fixture.poser(s => { s.meta.projRate = 7; delete s.meta.projRateAutres; });
    Store.migrate();
    eq(Store.state.meta.projRateAutres, 0,
      'un état d’avant le second champ part de zéro, il n’hérite pas de 7 %');

    Store.state.meta.projRateAutres = 3;
    Store.migrate();
    eq(Store.state.meta.projRateAutres, 3, 'un taux réglé à la main survit');
    Store.migrate();
    eq(Store.state.meta.projRateAutres, 3, 'et deux passes donnent le même état');
  });

  test('la projection part du patrimoine net, immobilier compris', () => {
    /* La part immobiliere est portee a plat, pas exclue : elle doit rester
       dans le total, sinon la courbe demarrerait sous le patrimoine reel. */
    Fixture.poser();
    const p = capitalisation({ years: 10 });
    pres(p.points[0].total, patrimoine().net,
      'le premier point vaut le patrimoine net d’aujourd’hui');
    pres(p.plat, 120000 - Fixture.DETTE, 'la part plate vaut le bien moins le prêt');
  });

  test('l’immobilier ne capitalise pas', () => {
    /* Le coeur du modele. La base qui capitalise vaut le brut moins le bien,
       donc ni la valeur du bien ni le pret qui le finance ne peuvent changer
       les gains : eux seuls bougent le total, et exactement de leur montant.

       Avant, un seul taux s'appliquait au patrimoine net entier : l'apport du
       studio capitalisait a 5 % par an comme un ETF. Doubler la valeur du bien
       augmentait donc les « gains », ce qu'aucun bien ne produit. */
    const gains = (modifier) => {
      Fixture.poser(modifier);
      const p = capitalisation({ years: 10 });
      const d = p.points[p.points.length - 1];
      return { gains: d.gains, total: d.total, plat: p.plat };
    };

    const base = gains();

    /* Le bien vaut 80 000 EUR de plus : le total suit, les gains ne bougent pas. */
    const bienPlusCher = gains(s => {
      s.comptes.find(c => c.id === 'c_immo').lignes[0].valeur = 200000;
    });
    pres(bienPlusCher.gains, base.gains, 'un bien plus cher ne produit aucun gain de marché');
    pres(bienPlusCher.total, base.total + 80000, 'il ajoute sa valeur, rien de plus');

    /* Le pret grossit de 60 000 EUR : meme raisonnement en sens inverse. */
    const pretPlusGros = gains(s => {
      s.etabs.find(e => e.id === 'e_bien').dettes[0].montant = Fixture.DETTE + 60000;
    });
    pres(pretPlusGros.gains, base.gains, 'un prêt plus gros ne réduit aucun gain de marché');
    pres(pretPlusGros.total, base.total - 60000, 'il retire son montant, rien de plus');

    /* Et l'egalite fondatrice tient dans les trois cas. */
    for (const [nom, r] of [['base', base], ['bien', bienPlusCher], ['prêt', pretPlusGros]]) {
      Fixture.poser();
      vrai(Number.isFinite(r.gains), nom + ' : les gains doivent être un nombre');
    }
  });

  test('une part plate négative reste une dette, elle ne fond pas', () => {
    /* Un credit a la consommation sans bien en face : la part plate est
       negative. Elle doit rester constante, pas se resorber au rythme des
       marches, ce qui arriverait si on la faisait capitaliser. */
    Fixture.poser(s => {
      s.comptes = s.comptes.filter(c => c.id !== 'c_immo');
      s.monthly[0].v.c_immo = 0;
    });
    const p = capitalisation({ years: 10 });
    vrai(p.plat < 0, 'sans bien mais avec un prêt, la part plate est négative');
    pres(p.plat, -Fixture.DETTE, 'elle vaut exactement le capital restant dû');
    const d = p.points[p.points.length - 1];
    pres(d.contributed + d.gains, d.total, 'l’égalité tient aussi en négatif');
    /* La dette pese autant a la fin qu'au debut : le total hors gains et hors
       versements ne bouge pas. */
    pres(d.total - d.gains - (d.contributed - p.plat), p.plat,
      'la dette est portée telle quelle jusqu’au bout');
  });

  test('la bande de scénarios encadre la courbe, à chaque point', () => {
    /* La Projection dessine le meme calcul a ±2 points de rendement. Si la
       bande croise la courbe, le graphique raconte n'importe quoi : la
       capitalisation doit etre monotone dans le taux, point par point. */
    Fixture.poser();
    const s = projectionSettings();
    const base = capitalisation({ years: 10 });
    const bas = capitalisation({ years: 10, rate: s.rate - 2 });
    const haut = capitalisation({ years: 10, rate: s.rate + 2 });
    base.points.forEach((pt, i) => {
      vrai(haut.points[i].total >= pt.total - 0.01,
        `an ${i} : le scénario haut ne peut pas passer sous la courbe`);
      vrai(bas.points[i].total <= pt.total + 0.01,
        `an ${i} : le scénario bas ne peut pas passer au-dessus`);
    });
    /* Et les trois partagent le meme point de depart : l'incertitude porte
       sur l'avenir, pas sur ce qu'on possede aujourd'hui. */
    pres(bas.points[0].total, base.points[0].total, 'même départ en bas');
    pres(haut.points[0].total, base.points[0].total, 'même départ en haut');
  });

  test('sans rendement, il ne se crée pas d’argent', () => {
    Fixture.poser(s => { s.meta.projRate = 0; s.meta.projMonthly = 100; });
    const p = capitalisation({ years: 10 });
    const d = p.points[p.points.length - 1];
    pres(d.gains, 0, 'zéro pour cent de rendement ne produit aucun gain');
    pres(d.total, patrimoine().net + 100 * 12 * 10, 'départ + 120 versements');
  });
});

/* ------------------------------------------------------------------
   9. Les variations
   ------------------------------------------------------------------ */
suite('Variation du patrimoine', () => {

  test('la variation compare deux nets, jamais un net a un brut', () => {
    /* Le bug : `deltas()` retranchait le brut d'un mois passe du net
       d'aujourd'hui. Sans credit les deux coincident et rien ne se voit ;
       avec un pret immobilier, « depuis le 1er janvier » annoncait la dette
       entiere en moins. Le fixture porte une dette, donc ce test mord. */
    const s = Fixture.poser(e => {
      e.monthly = [
        { date: '2026-01-31', comment: '', dettes: Fixture.DETTE,
          v: { c_courant: 3000, c_livret: 2000, c_pea: 10500, c_cto: 750,
               c_immo: 120000, c_pe: 2000 } },
      ];
    });
    const pts = historySeries({ includeNow: false });
    eq(pts.length, 1, 'un seul point dans l historique du fixture');
    const janvier = pts[0];
    pres(janvier.total, Fixture.BRUT, 'le point porte le brut du mois');
    pres(janvier.dettes, Fixture.DETTE, 'et le capital restant du');

    const d = deltas();
    pres(d.ytd.eur, nowTotals().total - (Fixture.BRUT - Fixture.DETTE),
      'la variation vaut net d aujourd hui moins net du mois de reference');
    /* Le fixture ne bouge pas entre le releve et aujourd hui : la variation
       doit donc etre nulle. Avec l ancien calcul elle valait -40 000. */
    pres(d.ytd.eur, 0, 'patrimoine inchange, variation nulle');
  });

  test('sans dette, rien ne change', () => {
    Fixture.poser(e => {
      e.etabs.find(x => x.id === 'e_bien').dettes = [];
      e.monthly = [{ date: '2026-01-31', comment: '', dettes: 0,
        v: { c_courant: 3000, c_livret: 2000, c_pea: 10500, c_cto: 750,
             c_immo: 120000, c_pe: 2000 } }];
    });
    pres(deltas().ytd.eur, 0, 'brut et net coincident, la variation reste nulle');
  });
});

/* ------------------------------------------------------------------
   10. La moyenne mensuelle
   ------------------------------------------------------------------ */
suite('Moyenne des dépenses', () => {

  const moisCourant = () => currentMonthKey();

  test('le mois en cours ne tire pas la moyenne vers le bas', () => {
    /* Le bug : la moyenne divisait par tous les mois saisis, celui en cours
       compris. Le 2 du mois elle plongeait, puis remontait jusqu au 31 : huit
       mois dont un a 250 EUR donnaient 1 339 EUR contre 1 464 EUR la veille,
       sans qu aucune depense n ait disparu. */
    Fixture.poser(e => {
      e.budget.expenses = [
        { month: '2026-01-01', v: { Courses: 1000 }, note: '' },
        { month: '2026-02-01', v: { Courses: 2000 }, note: '' },
        { month: moisCourant(), v: { Courses: 100 }, note: '' },
      ];
    });
    const st = expenseYearStats(moisCourant().slice(0, 4));
    pres(st.average, 1500, 'moyenne des deux mois clos, pas des trois');
    eq(st.moisRetenus, 2, 'deux mois retenus');
    eq(st.moisEnCoursExclu, true, 'et l ecran doit pouvoir le dire');
  });

  test('sous et au-dessus de l’objectif partagent les mois clos, sans reste', () => {
    /* Les tuiles publient under/over et leurs fiches listent sousObjectif et
       surObjectif : les listes doivent etre exactement la partition des mois
       retenus. Deux filtres paralleles avaient deja diverge — la fiche commune
       comptait le mois en cours vide comme « sous l objectif ». */
    Fixture.poser(e => {
      e.budget.monthlyTarget = 1000;
      e.budget.expenses = [
        { month: '2026-01-01', v: { Courses: 800 }, note: '' },
        { month: '2026-02-01', v: { Courses: 1000 }, note: '' },   // egal = sous
        { month: '2026-03-01', v: { Courses: 1500 }, note: '' },
        { month: moisCourant(), v: { Courses: 1 }, note: '' },
      ];
    });
    const st = expenseYearStats(moisCourant().slice(0, 4));
    eq(st.sousObjectif.length, st.under, 'la liste « sous » porte le compte de sa tuile');
    eq(st.surObjectif.length, st.over, 'la liste « au-dessus » aussi');
    eq(st.under, 2, 'janvier et fevrier, l egalite compte comme tenue');
    eq(st.over, 1, 'mars seulement');
    eq(st.sousObjectif.length + st.surObjectif.length, st.moisRetenus,
      'partition exacte des mois retenus, le mois en cours dehors');
    vrai(!st.sousObjectif.some(r => r.month === moisCourant()),
      'le mois en cours ne peut pas etre « sous l objectif » : il n est pas fini');
  });

  test('le total de l’année garde le mois en cours', () => {
    /* Une moyenne compare des mois entre eux, un total additionne ce qui a
       ete depense. Le second n a aucune raison d ecarter quoi que ce soit. */
    Fixture.poser(e => {
      e.budget.expenses = [
        { month: '2026-01-01', v: { Courses: 1000 }, note: '' },
        { month: moisCourant(), v: { Courses: 100 }, note: '' },
      ];
    });
    const st = expenseYearStats(moisCourant().slice(0, 4));
    pres(st.total, 1100, 'le total additionne tout');
    eq(st.months, 2, 'et compte les deux mois saisis');
  });

  test('le meilleur mois n’est pas un mois a peine commence', () => {
    Fixture.poser(e => {
      e.budget.expenses = [
        { month: '2026-01-01', v: { Courses: 900 }, note: '' },
        { month: '2026-02-01', v: { Courses: 1400 }, note: '' },
        { month: moisCourant(), v: { Courses: 60 }, note: '' },
      ];
    });
    const st = expenseYearStats(moisCourant().slice(0, 4));
    pres(st.best.total, 900, 'le mois en cours ne remporte pas le titre');
    pres(st.worst.total, 1400);
  });

  test('un mois en cours seul reste compte, faute de mieux', () => {
    /* Zero serait pire qu approximatif : le premier mois d utilisation
       n afficherait aucune moyenne. */
    Fixture.poser(e => {
      e.budget.expenses = [{ month: moisCourant(), v: { Courses: 320 }, note: '' }];
    });
    const st = expenseYearStats(moisCourant().slice(0, 4));
    pres(st.average, 320, 'on retombe sur le seul mois disponible');
    eq(st.moisEnCoursExclu, false, 'et on ne pretend pas l avoir ecarte');
  });

  test('une annee passee n’a pas de mois en cours a ecarter', () => {
    Fixture.poser(e => {
      e.budget.expenses = [
        { month: '2025-01-01', v: { Courses: 800 }, note: '' },
        { month: '2025-02-01', v: { Courses: 1200 }, note: '' },
      ];
    });
    const st = expenseYearStats('2025');
    pres(st.average, 1000);
    eq(st.moisEnCoursExclu, false);
  });
});

/* ------------------------------------------------------------------
   11. Le rythme d'accumulation
   ------------------------------------------------------------------ */
suite('Rythme d’accumulation', () => {

  test('rembourser un crédit compte comme de l’accumulation', () => {
    /* Le bug : l ecart se calculait sur le brut, quand l aide de la carte
       annonce « variations du patrimoine net ». Rembourser 400 EUR de capital
       fait monter le net d autant sans toucher au brut : tout le
       desendettement disparaissait du rythme. */
    Fixture.poser(e => {
      e.monthly = [
        { date: '2026-01-31', comment: '', dettes: 40000,
          v: { c_courant: 3000, c_livret: 2000, c_pea: 10500, c_cto: 750,
               c_immo: 120000, c_pe: 2000 } },
        /* Mois suivant : rien ne bouge, sauf 400 EUR de capital rembourses. */
        { date: '2026-02-28', comment: '', dettes: 39600,
          v: { c_courant: 3000, c_livret: 2000, c_pea: 10500, c_cto: 750,
               c_immo: 120000, c_pe: 2000 } },
      ];
    });
    const pts = monthlyPace().points;
    eq(pts.length, 1, 'deux relevés donnent un écart');
    pres(pts[0].delta, 400, 'le capital remboursé est de l’accumulation');
  });

  test('sans crédit, le rythme suit la valeur des avoirs', () => {
    Fixture.poser(e => {
      e.etabs.find(x => x.id === 'e_bien').dettes = [];
      e.monthly = [
        { date: '2026-01-31', comment: '', dettes: 0,
          v: { c_courant: 3000, c_livret: 2000, c_pea: 10500, c_cto: 750,
               c_immo: 120000, c_pe: 2000 } },
        { date: '2026-02-28', comment: '', dettes: 0,
          v: { c_courant: 3500, c_livret: 2000, c_pea: 10500, c_cto: 750,
               c_immo: 120000, c_pe: 2000 } },
      ];
    });
    pres(monthlyPace().points[0].delta, 500, '500 EUR de plus sur le compte courant');
  });
});

/* ------------------------------------------------------------------
   12. La fenetre temporelle
   ------------------------------------------------------------------ */
suite('Fenêtre temporelle', () => {

  /* Vingt-cinq mois d'ecarts, un par mois, jusqu'au mois courant inclus. */
  const ecarts = () => {
    const out = [];
    const d = new Date();
    for (let i = 24; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push({ date: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`,
                 label: 'm', delta: 100 });
    }
    return out;
  };

  test('« 1 an » compte douze variations, pas treize', () => {
    /* Le bug : le seuil gardait l ecart du mois de depart, qui mesure la
       variation du mois d avant. « 1 an » affichait « 12 / 13 ». Sur une
       serie de valeurs le meme seuil est juste : treize points donnent douze
       intervalles. C est la meme fonction pour deux usages. */
    eq(limitRange(ecarts(), '1y', { ecarts: true }).length, 12);
    eq(limitRange(ecarts(), '2y', { ecarts: true }).length, 24);
  });

  test('une série de valeurs garde son point de départ', () => {
    eq(limitRange(ecarts(), '1y').length, 13, 'treize points pour douze intervalles');
  });

  test('« depuis le 1er janvier » garde la variation de janvier', () => {
    /* Elle appartient a janvier, donc a l annee en cours, meme si elle mesure
       le passage de decembre a janvier. Pas de decalage ici. */
    const attendu = new Date().getMonth() + 1;
    eq(limitRange(ecarts(), 'ytd', { ecarts: true }).length, attendu);
    eq(limitRange(ecarts(), 'ytd').length, attendu);
  });

  test('« Tout » ne coupe rien', () => {
    eq(limitRange(ecarts(), 'all', { ecarts: true }).length, 25);
  });

  test('l’échelle des plages est fixe, quelle que soit la profondeur', () => {
    /* Elle etait calculee depuis l'anciennete des relevés : on voyait
       « 2 ans », qui n'est un cran nulle part, et le contrôle changeait de
       forme a mesure que les donnees vieillissaient. Le test lit l'echelle
       avec deux mois d'historique puis avec quinze ans : les memes crans, dans
       le meme ordre, sinon le calcul est revenu. */
      const echelle = () => HISTORY_RANGES.map(r => r.id);

    const avant = echelle();
    const garde = Store.state.monthly;
    try {
      Store.state.monthly = [{ date: '2026-07-01', v: { a: 1 } },
                             { date: '2026-08-01', v: { a: 2 } }];
      const courte = echelle();
      Store.state.monthly = [{ date: '2011-01-01', v: { a: 1 } },
                             { date: '2026-08-01', v: { a: 2 } }];
      const longue = echelle();
      eq(courte.join(' '), longue.join(' '),
        'deux mois et quinze ans doivent proposer les mêmes plages');
      eq(courte.join(' '), avant.join(' '), 'et les mêmes qu’au repos');
    } finally {
      Store.state.monthly = garde;
    }

    eq(echelle().includes('2y'), false, '« 2 ans » n’est un cran sur aucune place');
    eq(echelle().length <= 5, true, 'cinq boutons au plus, sinon ça déborde à 375 px');
    eq(echelle()[0], 'ytd', 'du plus court au plus long');
    eq(echelle()[echelle().length - 1], 'all', '« Tout » ferme la série');
  });

  test('chaque cran de l’échelle sait se nommer et se découper', () => {
    /* Un cran ajoute sans libelle afficherait « undefined » dans un bouton, et
       un cran que limitRange ne sait pas lire ne couperait rien du tout, donc
       donnerait « Tout » sous un autre nom. */
    for (const r of HISTORY_RANGES) {
      vrai(rangeLabel(r.id), r.id + ' doit avoir un libellé');
      eq(rangeLabel(r.id), r.label, r.id + ' : le libellé doit venir de l’échelle');
      const gardes = limitRange(ecarts(), r.id);
      vrai(gardes.length >= 2, r.id + ' doit garder de quoi tracer une courbe');
      vrai(gardes.length <= 25, r.id + ' ne peut pas inventer de points');
    }
    /* Sur vingt-cinq mois, « 3 ans » et « Tout » couvrent tout ; « 1 an » non.
       C'est ce qui prouve que les crans coupent vraiment. */
    eq(limitRange(ecarts(), 'all').length, 25);
    eq(limitRange(ecarts(), '3y').length, 25);
    eq(limitRange(ecarts(), '1y').length, 13);
    vrai(rangeLabel('15y'), 'un identifiant d’une session précédente doit se nommer');
  });
});

/* ------------------------------------------------------------------
   11 ter. Annuler une vente
   ------------------------------------------------------------------ */
suite('Annuler une vente rend les titres et l’argent', () => {

  /* Une vente de 40 titres sur les 100 du fixture, encaissée sur le PEA. */
  const vendre = (qty = 40, prix = 95) => {
    Fixture.poser();
    const i = Store.state.positions.findIndex(p => p.id === 'p_etf');
    return { i, vente: sellPosition({ index: i, qty, price: prix, fxSell: 1,
                                      cashAccount: 'c_pea', date: '2026-08-04', note: '' }) };
  };

  const cashDe = id => (compteById(id).cash || [])
    .reduce((t, e) => t + num(e.montant), 0);

  test('la vente puis son annulation rendent la quantité et le cash', () => {
    Fixture.poser();
    const avantQty = num(Store.state.positions.find(p => p.id === 'p_etf').qty);
    const avantCash = cashDe('c_pea');

    vendre();
    const apresVente = Store.state.positions.find(p => p.id === 'p_etf');
    eq(num(apresVente.qty), avantQty - 40, 'la vente retire les titres');
    pres(cashDe('c_pea'), avantCash + 40 * 95, 'et encaisse le produit');
    eq(Store.state.sales.length, 1, 'le journal porte la vente');

    annulerVente(0);
    eq(num(Store.state.positions.find(p => p.id === 'p_etf').qty), avantQty,
      'l’annulation rend les titres');
    pres(cashDe('c_pea'), avantCash, 'et reprend l’argent');
    eq(Store.state.sales.length, 0, 'et la vente quitte le journal');
  });

  test('une vente totale annulée fait renaître la ligne', () => {
    /* Le cas qui casse une annulation naive : la ligne n'existe plus, il faut la
       recreer avec son prix de revient, sa classe et son role — sinon les titres
       reviennent sans identite et sortent de toute cible. */
    Fixture.poser();
    const p0 = { ...Store.state.positions.find(p => p.id === 'p_etf') };
    vendre(num(p0.qty), 95);
    eq(Store.state.positions.some(p => p.name === p0.name), false, 'la ligne a disparu');

    annulerVente(0);
    const rendue = Store.state.positions.find(p => p.name === p0.name);
    vrai(rendue, 'la ligne est de retour');
    eq(num(rendue.qty), num(p0.qty), 'avec sa quantité');
    eq(num(rendue.buyPrice), num(p0.buyPrice), 'et son prix de revient d’alors');
    eq(rendue.account, p0.account, 'sur le même compte');
    eq(assetClassDe(rendue), assetClassDe(p0), 'sa classe d’actif');
    eq(roleDe(rendue), roleDe(p0), 'et son rôle');
  });

  test('l’annulation ne touche que la vente visée', () => {
    Fixture.poser();
    const i = Store.state.positions.findIndex(p => p.id === 'p_etf');
    sellPosition({ index: i, qty: 10, price: 95, fxSell: 1, cashAccount: 'c_pea', date: '2026-08-01' });
    sellPosition({ index: i, qty: 20, price: 96, fxSell: 1, cashAccount: 'c_pea', date: '2026-08-02' });
    eq(Store.state.sales.length, 2);
    /* `unshift` : la plus recente est en tete. On annule celle de 20. */
    const qtyAvant = num(Store.state.positions.find(p => p.id === 'p_etf').qty);
    annulerVente(0);
    eq(Store.state.sales.length, 1, 'une seule vente retirée');
    eq(num(Store.state.sales[0].qty), 10, 'et c’est l’autre qui reste');
    eq(num(Store.state.positions.find(p => p.id === 'p_etf').qty), qtyAvant + 20,
      'seuls les titres de la vente annulée reviennent');
  });

  test('un index inconnu ne casse rien', () => {
    Fixture.poser();
    eq(annulerVente(0), null, 'aucune vente à annuler');
    eq(annulerVente(7), null);
  });

  test('le bouton du journal annule, il ne cache pas', () => {
    /* Il retirait la ligne du journal en annonçant que ni les titres ni le cash
       ne bougeaient : un geste qui ressemble à une annulation sans en être une.
       Le rendu vit dans app.js, que le harnais ne charge pas : on lit sa source. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const m = src.match(/'del-sale'\(btn\) \{[\s\S]*?\n  \},/);
    vrai(m, 'l’action del-sale doit être trouvable');
    vrai(/annulerVente\(/.test(m[0]),
      'elle doit appeler l’annulation, pas seulement retirer la ligne');
    vrai(!/sales\.splice/.test(m[0]),
      'et ne plus toucher au journal elle-même : c’est annulerVente qui le fait');
  });
});

/* ------------------------------------------------------------------
   Le journal des mouvements exceptionnels, dans les deux sens
   ------------------------------------------------------------------ */
suite('Une sortie exceptionnelle n’est pas une épargne ratée', () => {

  /* Le journal ne portait que les entrées. Un héritage de 10 000 € y trouvait sa
     place, une voiture à 15 000 € n'en avait aucune — et les deux posent pourtant
     le même problème : ils déplacent le patrimoine sans rien dire de l'épargne.

     Mesuré sur les données réelles avant d'écrire une ligne. Une voiture payée en
     avril, sans le journal : la moyenne mensuelle du patrimoine passe de +789 € à
     −283 €, et elle y reste, une moyenne portant sur quatorze mois. Le budget, lui,
     n'a pas bougé d'un euro. Avec la ligne au journal, la courbe garde son trou —
     l'argent est bien parti — mais le rythme propre reste à +789 €.

     Pourquoi pas dans les dépenses du mois, qui semblait l'endroit naturel :
     mesuré aussi. La moyenne des dépenses passait de 1 404 à 3 547 €, et comme
     elle sert de coût de la vie, l'autonomie financière tombait de 0,8 à 0,5 mois
     et la cible d'épargne de précaution montait de 11 545 à 17 974 €. Pour une
     voiture achetée une fois, l'application aurait réclamé 6 000 € de réserve en
     plus, toute l'année. */

  const journal = lignes => Fixture.poser(e => {
    e.budget.apports = lignes;
  });

  test('le signe porte le sens, et les deux parts font le net', () => {
    journal([
      { id: 'a1', libelle: 'Succession', montant: 10000, date: '2026-03-10' },
      { id: 'a2', libelle: 'Voiture', montant: -15000, date: '2026-04-15' },
    ]);
    const d = apportsDetail();
    eq(d.entrees, 10000, 'ce qui est entré');
    eq(d.sorties, -15000, 'ce qui est sorti, en négatif');
    eq(d.net, -5000, 'et le net est la somme des deux');
    eq(apportsTotal(), d.net,
      'le total et le net sont le même nombre : deux sommes sur la même liste finiraient '
      + 'par diverger, et c’est le total qui se tromperait');
  });

  test('les bornes de dates valent pour les deux sens', () => {
    journal([
      { id: 'a1', libelle: 'Prime', montant: 3000, date: '2026-01-10' },
      { id: 'a2', libelle: 'Travaux', montant: -8000, date: '2026-06-20' },
    ]);
    eq(apportsDetail('2026-01-01', '2026-03-31').net, 3000, 'la fenêtre ne retient que la prime');
    eq(apportsDetail('2026-05-01', '2026-12-31').net, -8000, 'l’autre ne retient que les travaux');
    eq(apportsDetail('2026-06-20', '2026-06-20').sorties, -8000, 'les bornes sont comprises');
  });

  test('une sortie exceptionnelle ne compte pas comme une épargne manquée', () => {
    /* Le coeur du sujet. On fabrique deux relevés, le second amputé de 15 000 € :
       c'est la voiture. Sans le journal, cet écart est imputé au rythme ; avec lui,
       il en sort. */
    Fixture.poser(e => {
      e.budget.apports = [{ id: 'a1', libelle: 'Voiture', montant: -15000, date: '2026-02-10' }];
    });
    const pts = [
      { date: '2026-01-31', depuis: '2025-12-31', delta: 800 },
      { date: '2026-02-28', depuis: '2026-01-31', delta: -14200 },
    ];
    const s = statsRythme(pts);
    pres(s.average, (800 - 14200) / 2, 'la moyenne brute encaisse la voiture');
    vrai(s.average < 0, 'et elle est négative, ce qui est vrai du patrimoine');
    eq(s.apports, -15000, 'le journal la retrouve dans la fenêtre des deux points');
    pres(s.averageHorsApports, (800 - 14200 + 15000) / 2,
      'hors mouvements exceptionnels, le rythme propre remonte');
    vrai(s.averageHorsApports > 0,
      'une voiture achetée une fois ne doit pas faire dire à l’application que tu '
      + 'n’épargnes plus rien');
  });

  test('les deux boutons déclarent leur sens, et la modification le corrige', () => {
    /* Le montant se saisit toujours positif : demander « moins quinze mille »
       offrirait une faute de frappe qui inverse un fait. Le signe se pose à partir
       d'une déclaration — le bouton à la création, la liste à la modification, et
       jamais les deux à la fois. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    for (const sens of ['entree', 'sortie']) {
      vrai(new RegExp(`data-action="ajouter-apport" data-sens="${sens}"`).test(src),
        `le journal doit offrir un bouton « ${sens} »`);
    }
    const ajout = src.indexOf(`async 'ajouter-apport'`);
    vrai(ajout > 0, 'l’action d’ajout doit être trouvable');
    const fnAjout = src.slice(ajout, ajout + 1600);
    vrai(/btn\?\.dataset\.sens === 'sortie'/.test(fnAjout),
      'elle prend son sens du bouton, pas d’une question posée deux fois');
    vrai(/-Math\.abs\(num\(v\.montant\)\)/.test(fnAjout),
      'et pose le signe elle-même, à partir d’un montant saisi positif');

    const edit = src.indexOf(`async 'editer-apport'`);
    vrai(edit > 0, 'l’action de modification doit être trouvable');
    const fnEdit = src.slice(edit, edit + 2200);
    vrai(/cle: 'sens'/.test(fnEdit),
      'la modification propose la nature : c’est le seul endroit où l’on peut s’être '
      + 'trompé de bouton');
    vrai(/Math\.abs\(num\(a\.montant\)\)/.test(fnEdit),
      'et le champ montre le montant sans son signe, qui vit dans la liste');
  });
});

/* ------------------------------------------------------------------
   11 bis. L'écart du jour
   ------------------------------------------------------------------ */
suite('L’écart du jour ne compte qu’aujourd’hui', () => {

  /* Une ligne cotée, avec l'heure de sa dernière transaction. `quoteTime` est en
     secondes depuis 1970, comme la place le publie. */
  const secondes = iso => Math.floor(new Date(iso + 'T14:00:00').getTime() / 1000);

  const avecCours = (quandISO, prix, veille) => Fixture.poser(e => {
    e.positions = [{
      id: 'p_x', name: 'ETF Monde', isin: '', symbol: 'EWLD.PA', currency: 'EUR',
      qty: 100, buyPrice: 5, price: prix, fx: 1, fxBuy: 1, account: 'c_pea',
      manual: false, assetClass: 'actions', role: 'core',
      prevClose: veille, quoteTime: quandISO ? secondes(quandISO) : null,
    }];
  });

  test('un cours du jour donne l’écart du jour', () => {
    avecCours(todayISO(), 6.161, 6.121);
    const d = posDayChange(Store.state.positions[0]);
    pres(d.pct, (6.161 / 6.121 - 1) * 100, 'l’écart de la séance en cours');
    pres(d.eur, (6.161 - 6.121) * 100, 'et son montant, quantité comprise');
    eq(!!d.horsSeance, false, 'la séance a bien eu lieu');
  });

  test('un cours d’hier ne fait pas l’écart d’aujourd’hui', () => {
    /* Le defaut corrige : avant l'ouverture, et toute la nuit, l'ecran affichait
       le mouvement de la derniere seance comme s'il etait celui du jour. « depuis
       la cloture d'hier » est alors exactement zero : le cours n'a pas ete
       echange depuis cette cloture. */
    const hier = new Date(todayISO() + 'T12:00:00');
    hier.setDate(hier.getDate() - 1);
    avecCours(isoLocal(hier), 6.161, 6.121);
    const d = posDayChange(Store.state.positions[0]);
    eq(d.pct, 0, 'aucun mouvement depuis la clôture d’hier');
    eq(d.eur, 0, 'donc aucun euro');
    eq(d.horsSeance, true, 'et la ligne dit pourquoi');
    eq(dayPerformance().eur, 0, 'le total du jour est nul, pas la veille rejouée');
    eq(dayPerformance().pct, 0);
  });

  test('sans heure de cotation, on garde l’écart', () => {
    /* Stooq ne publie pas l'heure. On ne peut donc pas prouver que le cours est
       perime : le taire par principe effacerait un ecart juste, tous les jours
       de seance et pour toujours. */
    avecCours(null, 6.161, 6.121);
    const d = posDayChange(Store.state.positions[0]);
    vrai(d.pct > 0, 'l’écart reste calculé');
  });

  test('sans heure mais place fermée, l’écart n’est pas celui du jour', () => {
    /* La troisieme branche, ajoutee le 5 aout 2026. Sans heure on ne sait pas,
       et on garde l'ecart — sauf si la place se declare fermee, auquel cas on
       sait, et l'ecart affiche serait celui de la derniere seance.

       C'est le defaut que le propriétaire a cru voir apres un rafraichissement.
       Ses lignes portaient toutes une heure ce jour-la, donc ce n'etait pas ça ;
       mais la garde s'ouvrait bel et bien des qu'une source muette repondait un
       dimanche. */
    avecCours(null, 6.161, 6.121);
    Store.state.positions[0].marketState = 'CLOSED';
    const d = posDayChange(Store.state.positions[0]);
    eq(d.eur, 0, 'aucun euro attribué au jour');
    eq(d.horsSeance, true, 'et la ligne dit pourquoi');
  });

  test('sans heure et place ouverte, l’écart compte', () => {
    /* Le complement : une place qui cote et une source muette, c'est bien le
       mouvement du jour. Sans ce cas, la branche precedente aurait pu se
       contenter de tout taire. */
    avecCours(null, 6.161, 6.121);
    Store.state.positions[0].marketState = 'REGULAR';
    vrai(posDayChange(Store.state.positions[0]).pct > 0, 'l’écart est retenu');
  });

  test('sans clôture de référence, il n’y a pas d’écart du jour', () => {
    /* Elle n'etait ecrite que si la reponse en portait une : celle qu'on gardait
       vieillissait d'un jour a chaque rafraichissement muet, et l'ecart du jour
       comptait plusieurs seances. Mieux vaut ne rien dire. */
    avecCours(todayISO(), 6.161, 0);
    eq(posDayChange(Store.state.positions[0]), null, 'aucun écart calculable');
    eq(dayPerformance().sansDonnee, 1, 'et la ligne est comptée comme sans donnée');
  });

  /* --- une ligne achetée aujourd'hui n'a pas de veille -------------------
     Signalé par le propriétaire le 5 août 2026 sur une ligne Uber : le titre avait
     déjà perdu 5 % quand il l'a prise, l'écran lui comptait cette baisse-là.
     « Il croit que j'ai perdu 5 %, sauf que non, j'ai perdu que 1 %. »

     Le mouvement du titre était juste. C'est l'effet sur le patrimoine qui était
     faux : il suppose qu'on détenait la ligne à la clôture de la veille. */

  test('une ligne achetée aujourd’hui ne porte pas la baisse d’avant l’achat', () => {
    auJour('2026-08-05', () => {
      avecCours('2026-08-05', 6.00, 7.00);      // le titre a perdu 1 EUR dans la journée
      const p = Store.state.positions[0];
      p.buyPrice = 6.10;                        // acheté après la baisse
      p.dateAchat = '2026-08-05';
      const d = posDayChange(p);
      eq(d.depuisAchat, true, 'la ligne dit sur quelle base elle se compare');
      pres(d.eur, (6.00 - 6.10) * 100, 'l’écart part du prix payé, pas de la veille');
      pres(d.eur, posPerfEur(p),
        'tout ce qui est arrivé à cette ligne est arrivé aujourd’hui : '
        + 'son effet du jour vaut exactement sa plus-value latente');
      pres(d.pct, posPerfPct(p), 'et le pourcentage suit la même base');
      vrai(d.eur > (6.00 - 7.00) * 100,
        'la perte comptée est bien moindre que celle du titre sur la séance');
    });
  });

  test('sur une ligne en devise, le taux d’achat est du jour lui aussi', () => {
    /* Ailleurs les deux bornes prennent le taux du jour, faute de connaitre celui
       d'hier — c'est ce qui isole le mouvement du titre de celui de la monnaie.
       Ici la borne basse est un achat d'aujourd'hui : son taux est connu, il est
       du jour, et le change fait donc partie de ce qui s'est passe aujourd'hui.
       Sans cela, la fiche afficherait deux montants voisins et differents pour un
       seul et meme fait, a deux lignes d'ecart. */
    auJour('2026-08-05', () => {
      avecCours('2026-08-05', 49, 55);
      const p = Store.state.positions[0];
      Object.assign(p, { currency: 'USD', qty: 20, buyPrice: 50,
                         fx: 0.90, fxBuy: 0.95, dateAchat: '2026-08-05' });
      const d = posDayChange(p);
      pres(d.eur, 20 * 49 * 0.90 - 20 * 50 * 0.95, 'valeur du jour moins somme réellement sortie');
      pres(d.eur, posValue(p) - posInvested(p), 'ce qui est la plus-value latente, change compris');
    });
  });

  test('une ligne achetée hier retrouve la clôture de la veille', () => {
    /* Le complement : la garde ne doit pas deborder d'un jour. Detenue depuis
       hier soir, la ligne a bien vecu la seance entiere. */
    auJour('2026-08-05', () => {
      avecCours('2026-08-05', 6.00, 7.00);
      const p = Store.state.positions[0];
      p.buyPrice = 6.10;
      p.dateAchat = '2026-08-04';
      const d = posDayChange(p);
      eq(!!d.depuisAchat, false, 'la base redevient celle de tout le monde');
      pres(d.eur, (6.00 - 7.00) * 100, 'soit la séance entière');
    });
  });

  test('une date du jour sans prix de revient ne fait pas un écart nul', () => {
    /* Le piege de la bascule : une ligne creee ce matin porte la date du jour
       avant qu'on ait saisi la quantite et le prix. Prendre alors le prix paye
       comme reference donnerait zero pour reference, donc zero d'ecart, et la
       ligne disparaitrait du total sans que rien ne le dise. */
    auJour('2026-08-05', () => {
      avecCours('2026-08-05', 6.00, 7.00);
      const p = Store.state.positions[0];
      p.buyPrice = 0;
      p.dateAchat = '2026-08-05';
      const d = posDayChange(p);
      eq(!!d.depuisAchat, false, 'rien n’est investi : la bascule ne s’arme pas');
      pres(d.eur, (6.00 - 7.00) * 100, 'et la veille sert, comme avant');
    });
  });

  test('le total du jour reste la somme de ses lignes, bases mêlées', () => {
    /* La regle de la maison, appliquee au cas ou deux lignes ne se comparent pas
       a la meme chose. Le total ne doit rien y perdre. */
    auJour('2026-08-05', () => {
      avecCours('2026-08-05', 6.00, 7.00);
      const ancienne = Store.state.positions[0];
      ancienne.dateAchat = '2025-01-10';
      Store.state.positions.push({
        ...ancienne, id: 'p_y', name: 'Titre pris ce matin',
        qty: 50, buyPrice: 6.10, dateAchat: '2026-08-05',
      });
      const j = dayPerformance();
      eq(j.lignes.length, 2, 'les deux lignes comptent');
      pres(j.eur, j.lignes.reduce((s, l) => s + l.eur, 0), 'le total est la somme de ses parts');
      pres(j.eur, (6.00 - 7.00) * 100 + (6.00 - 6.10) * 50,
        'la séance entière pour l’une, l’écart depuis l’achat pour l’autre');
      eq(j.lignes.filter(l => l.depuisAchat).length, 1,
        'et une seule des deux annonce l’autre base');
    });
  });

  test('la date d’achat se demande à la création, et s’explique en un seul endroit', () => {
    /* Deux moitiés du même correctif.

       La date était facultative et n'était offerte que sur la fiche, après coup :
       personne ne la remplissait — l'écran Performance affiche même « n lignes
       n'ont pas de date d'achat ». Un calcul qui en dépend se serait donc trompé
       le jour même, pour tout le monde. Les deux fenêtres qui créent une ligne la
       demandent maintenant, proposée au jour et changeable, parce qu'on crée une
       ligne le jour où l'on achète — sauf en installant l'application sur un
       portefeuille déjà constitué, et c'est pour ça qu'elle se change.

       Et son explication vit une fois. Trois copies auraient divergé dès la
       première retouche : c'est exactement ce qui est arrivé à la formule du taux
       d'achat, retrouvée en trois exemplaires dont deux fausses. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    eq((src.match(/const DATE_ACHAT_AIDE\b/g) || []).length, 1,
      'une seule déclaration du texte d’aide');
    /* Chaque champ « Date d'achat » doit renvoyer a cette constante, y compris
       celui que quelqu'un ajoutera demain : le controle se derive du balisage et
       ne nomme aucun des trois appelants. */
    const champs = [...src.matchAll(/Date d’achat/g)];
    vrai(champs.length >= 3, 'les deux créations et la fiche demandent la date');
    for (const m of champs) {
      vrai(/DATE_ACHAT_AIDE/.test(src.slice(m.index, m.index + 160)),
        'chaque champ « Date d’achat » doit renvoyer à l’aide commune, jamais à sa propre copie');
    }

    /* Et ce que la creation ecrit arrive bien dans la ligne : le champ pouvait
       exister dans la fenetre sans que personne ne lise sa reponse. */
    eq((src.match(/dateAchat: v\.dateAchat \|\| ''/g) || []).length, 2,
      'les deux chemins de création reportent la date sur la ligne créée');
  });

  test('la passerelle prend une clôture d’un autre jour, pas la ligne d’avant', () => {
    /* Le repli du worker prenait l'avant-derniere bougie de la serie. Avant
       l'ouverture il n'y a pas de bougie du jour : la derniere est celle d'hier
       et l'avant-derniere celle d'avant-veille, donc l'ecart annonçait deux
       seances pour une. Le repli doit choisir sur la date, pas sur l'index.

       `_worker.js` tourne chez Cloudflare, le harnais ne l'execute pas : on lit
       sa source, bornee a la fonction concernee. */
    const src = lireSource('_worker.js');
    vrai(src, '_worker.js doit être lisible pour ce contrôle');
    const m = src.match(/async function yahooQuote[\s\S]*?\n\}/);
    vrai(m, 'yahooQuote() doit être trouvable');
    vrai(/result\.timestamp/.test(m[0]),
      'le repli doit lire les horodatages des bougies');
    vrai(/jour\(horodatages\[i\]\) < jourDuCours/.test(m[0]),
      'et ne retenir qu’une clôture d’un jour antérieur à celui du cours');

    /* La priorite s'est inversee le 5 aout 2026, sur mesure.
       `meta.previousClose` etait le premier choix. Ce jour-la il valait `null`
       pour DCAM.PA, et la serie portait un horodatage pour le 4 sans aucune
       cloture : Yahoo sait qu'il y a eu seance, il n'en a pas le cours. En
       enjambant ce trou on remontait au 3, et l'ecart du jour comptait deux
       seances — Tallya annonçait +1,93 % quand le courtier disait +0,58 %, soit
       302 EUR de mouvement pour 100 reels.

       La bougie de la veille fait donc foi, et son absence aussi : quand elle
       manque, aucune cloture n'est publiee et la ligne n'a pas d'ecart du jour.
       Se taire vaut mieux qu'un chiffre faux d'un facteur trois. */
    vrai(!/if \(closes\[i\] == null\) continue;/.test(m[0]),
      'la bougie de la veille ne s’enjambe pas : sauter une clôture manquante '
      + 'fait compter deux séances');
    vrai(/veilleTrouvee/.test(m[0]),
      'la fonction doit distinguer « la veille est dans la série » de « elle en '
      + 'est absente » — les replis ne valent que pour le second cas');
    const choix = m[0].match(/let prev = [\s\S]*?;/);
    vrai(choix, 'le choix de la clôture doit être trouvable');
    vrai(choix[0].indexOf('veilleTrouvee') < choix[0].indexOf('meta.previousClose'),
      'la bougie de la veille passe avant le champ publié par la place');
  });

  test('les deux passerelles suivent la même règle', () => {
    /* `_worker.js` tourne chez Cloudflare, `serve.py` sert le local : deux
       exemplaires de la meme regle, dans deux langages. Ils avaient deja
       diverge — le raffinement sur la date du cours n'existait que cote
       worker — et un ecart entre les deux se lit comme un bug de l'application
       alors qu'il vient du serveur qu'on interroge. */
    const py = lireSource('serve.py');
    vrai(py, 'serve.py doit être lisible pour ce contrôle');
    const fn = py.slice(py.indexOf('def yahoo_quote'), py.indexOf('def stooq_quote'));
    vrai(fn.length > 500, 'yahoo_quote() doit être trouvable');
    vrai(/timestamp/.test(fn), 'le local doit lire les horodatages des bougies');
    vrai(/jour\(horodatages\[i\]\) < jour_du_cours/.test(fn),
      'et choisir sur la date, pas sur l’index');
    vrai(/trouvee/.test(fn),
      'et distinguer une veille absente d’une veille sans clôture, comme le worker');
    vrai(/_cloture_veille_horaire/.test(fn),
      'et retrouver la clôture en pas horaire quand la série journalière a un trou');
  });

  test('un trou dans la série journalière se comble, il ne se saute pas', () => {
    /* Le 5 aout 2026, Yahoo n'avait aucune cloture pour le 4 — ni sur DCAM.PA,
       ni sur NATO.PA, ni sur BTC-USD, ni sur EUR/USD. Une panne de donnees, pas
       un jour sans seance.

       Trois comportements possibles, et deux sont mauvais. Enjamber le trou
       prend l'avant-veille et fait compter deux seances : +1,93 % la ou le
       courtier disait +0,58 %. Refuser de publier supprime l'ecart du jour
       partout a la fois — l'ecran a annonce « 3 sans cours de veille » sur cinq
       lignes. La serie horaire comble : mesuree contre le courtier, sa derniere
       barre de la veille donne 6,202 pour une cloture reelle de 6,203.

       Les deux passerelles doivent le faire, et de la meme façon. */
    const js = lireSource('_worker.js') || '';
    vrai(/async function clotureVeilleHoraire/.test(js),
      'le worker doit savoir lire la série horaire');
    vrai(/interval=1h/.test(js), 'et la demander en pas horaire');
    vrai(/await clotureVeilleHoraire\(symbol, jourDuCours\)/.test(js),
      'et s’en servir quand la clôture de la veille manque');
    /* Le repli ne doit jamais remonter plus haut que la veille : c'est tout
       l'interet de ne pas enjamber. */
    vrai(/jour\(ts\[i\]\) < jourDuCours/.test(js),
      'la barre retenue précède strictement le jour du cours');
  });
});

/* ------------------------------------------------------------------
   11 ter. L'heure d'un cours n'est pas l'heure de la requête

   Le défaut du 6 août 2026, et la seule chose qui le rendait invisible.
   « Le marché est ouvert mais les positions affichent quasi 0 en mouvement. »
   La passerelle répondait à 16:15 en portant des prix imprimés la veille à
   22:00 ; l'application affichait trois certificats de fraîcheur pour une
   donnée vieille de dix-huit heures — la pastille « il y a 2 min », l'aperçu
   « cours de 16:15 », la ligne « ouvert · +0,00 % ».

   Aucun chiffre n'était faux. `posDayChange()` rendait bien `horsSeance: true`
   et un écart nul, ce qui est la réponse exacte à « depuis la clôture d'hier ».
   Ce qui manquait, c'est que rien ne le disait : `horsSeance` existait dans le
   modèle et n'atteignait aucun écran, et `quoteTime` était stocké sans être
   affiché nulle part.
   ------------------------------------------------------------------ */
suite('Un cours dit de quand il date', () => {

  const secondes = (iso, heure = '14:00:00') =>
    Math.floor(new Date(`${iso}T${heure}`).getTime() / 1000);

  const veilleDe = iso => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return isoLocal(d);
  };

  /* Des lignes cotées, chacune avec l'heure de sa dernière transaction. La
     requête, elle, vient d'avoir lieu : c'est tout l'objet de la suite. */
  const avecCours = lignes => Fixture.poser(e => {
    e.positions = lignes.map((l, i) => ({
      id: `p_${i}`, name: l.nom || `Ligne ${i}`, isin: '', symbol: `SYM${i}`,
      currency: 'EUR', qty: 100, buyPrice: 5, price: l.prix, fx: 1, fxBuy: 1,
      account: 'c_pea', manual: !!l.manuel, assetClass: 'actions', role: 'core',
      prevClose: l.veille, quoteTime: l.quand || null,
    }));
    e.quotes = { lastRun: new Date().toISOString(), fx: {}, changes: [] };
  });

  test('l’heure retenue est celle du marché, jamais celle de la requête', () => {
    /* Le coeur du defaut. Les deux horloges etaient confondues partout, et
       c'est la fraiche qui gagnait : rafraichir ne changeait que l'heure
       affichee, jamais les chiffres, et rien ne permettait de s'en apercevoir. */
    auJour('2026-08-06', () => {
      const hier = veilleDe('2026-08-06');
      avecCours([{ prix: 6.16, veille: 6.12, quand: secondes(hier, '22:00:00') },
                 { prix: 9.00, veille: 9.00, quand: secondes(hier, '20:00:00') }]);
      eq(coursAsOf(), secondes(hier, '22:00:00'),
        'le plus récent des cours en mémoire, et il date d’hier');
      const requete = new Date(Store.state.quotes.lastRun).getTime();
      vrai(requete - coursAsOf() * 1000 > 3600 * 1000,
        'la requête est fraîche et les prix ne le sont pas : c’est exactement '
        + 'l’écart que l’application effaçait en datant les cours de lastRun');
    });
  });

  test('une ligne saisie à la main ne date aucun cours', () => {
    /* Elle n'a pas de marche : lui laisser dater la pastille ferait dependre la
       fraicheur affichee d'une valeur que personne ne rafraichit. */
    auJour('2026-08-06', () => {
      avecCours([{ prix: 6.16, veille: 6.12, quand: secondes('2026-08-06', '11:00:00') },
                 { prix: 100, veille: 100, quand: secondes('2026-08-06', '17:00:00'), manuel: true }]);
      eq(coursAsOf(), secondes('2026-08-06', '11:00:00'),
        'la ligne manuelle est écartée, même si son heure est la plus récente');
    });
  });

  test('sans aucun cours horodaté, il n’y a pas d’heure de marché à donner', () => {
    /* Stooq ne publie pas l'heure. On ne peut alors rien affirmer, et inventer
       une heure serait pire que n'en montrer aucune. */
    auJour('2026-08-06', () => {
      avecCours([{ prix: 6.16, veille: 6.12, quand: null }]);
      eq(coursAsOf(), null, 'aucune heure, et on le dit');
    });
  });

  test('les lignes qui n’ont pas coté aujourd’hui se comptent', () => {
    /* `horsSeance` existait ligne a ligne depuis le 5 aout et ne remontait pas
       au total : aucun ecran ne pouvait donc dire combien de lignes se taisent. */
    auJour('2026-08-06', () => {
      const hier = veilleDe('2026-08-06');
      avecCours([{ prix: 6.16, veille: 6.12, quand: secondes('2026-08-06', '11:00:00') },
                 { prix: 9.50, veille: 9.00, quand: secondes(hier, '22:00:00') }]);
      const j = dayPerformance();
      eq(j.lignes.length, 2, 'les deux lignes restent listées');
      eq(j.horsSeance, 1, 'une seule n’a pas coté depuis minuit');
      eq(j.toutHorsSeance, false, 'l’autre a bien coté');
      pres(j.eur, (6.16 - 6.12) * 100,
        'et le total ne porte que la ligne qui a coté : celle d’hier vaut zéro, '
        + 'ce qui est exact, mais elle ne doit pas passer pour une séance atone');
      pres(j.eur, j.lignes.reduce((s, l) => s + l.eur, 0),
        'le total reste la somme de ses parts');
    });
  });

  test('quand rien n’a coté, le total nul se déclare au lieu de s’afficher', () => {
    /* Le symptome exact du 6 aout : toutes les lignes figees, un total de
       « +0 € · +0,00 % », et un ecran qui se lit « journee sans mouvement ».
       Le drapeau existe pour que l'ecran puisse choisir une phrase plutot qu'un
       montant — un zero calcule et un zero faute de donnee s'ecrivent pareil. */
    auJour('2026-08-06', () => {
      const hier = veilleDe('2026-08-06');
      avecCours([{ prix: 6.16, veille: 6.12, quand: secondes(hier, '22:00:00') },
                 { prix: 9.50, veille: 9.00, quand: secondes(hier, '21:00:00') }]);
      const j = dayPerformance();
      eq(j.horsSeance, 2, 'les deux se taisent');
      eq(j.toutHorsSeance, true, 'et l’écran a de quoi le dire d’un mot');
      eq(j.eur, 0, 'le total est nul, ce qui est juste');
      eq(j.asOfMarche, secondes(hier, '22:00:00'),
        'et il peut nommer la date du cours le plus récent');
    });
  });

  test('« sans cours de veille » et « sans cours du jour » comptent deux choses', () => {
    /* Deux manques distincts, et les confondre effacerait l'un des deux :
       l'un sort la ligne de la liste faute de reference, l'autre l'y laisse
       avec un ecart nul. L'apercu appelait « sans cours du jour » le premier,
       ce qui rendait le second inexprimable. */
    auJour('2026-08-06', () => {
      const hier = veilleDe('2026-08-06');
      avecCours([{ prix: 6.16, veille: 0, quand: secondes('2026-08-06', '11:00:00') },
                 { prix: 9.50, veille: 9.00, quand: secondes(hier, '22:00:00') }]);
      const j = dayPerformance();
      eq(j.sansDonnee, 1, 'une ligne sans clôture de référence');
      eq(j.horsSeance, 1, 'une ligne dont le cours date d’avant minuit');
      eq(j.lignes.length, 1, 'et une seule des deux est listée');
      eq(j.toutHorsSeance, true, 'la seule listée se tait');
    });
  });

  test('la date d’un cours se dit comme on la dit à voix haute', () => {
    /* La preposition vient avec, et les trois branches n'ont pas la meme. La
       laisser aux appelants a donne « cours de hier à 22:00 » a l'ecran des la
       premiere version : cinq endroits ecrivent cette phrase, il y avait cinq
       occasions d'oublier l'elision. */
    auJour('2026-08-06', () => {
      eq(fmtCoursQuand(secondes('2026-08-06', '11:05:00')), 'de 11:05',
        'aujourd’hui, la date n’apprend rien : l’heure seule');
      eq(fmtCoursQuand(secondes(veilleDe('2026-08-06'), '22:00:00')), 'd’hier à 22:00',
        'la veille se nomme, elle ne se date pas');
      eq(fmtCoursQuand(secondes('2026-08-01', '17:30:00')), 'du 1 août à 17:30',
        'au-delà, le jour et le mois');
      eq(fmtCoursQuand(null), '', 'et rien à dire quand on ne sait pas');
    });
  });

  /* --- ce que les écrans en font ------------------------------------
     `app.js` ne se charge pas ici : on lit sa source. Les contrôles se
     dérivent du balisage plutôt que de nommer les appelants, pour que l'écran
     qu'on écrira demain soit déjà couvert. */

  test('aucun écran ne date un cours de l’heure de la requête', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    /* La regle, derivee : partout ou l'application ecrit « cours de … », elle
       doit lire une heure de marche. `lastRun` et le `asOf` qui le recopie
       datent la requete, et les coller a un prix est precisement le mensonge
       qu'on corrige. */
    for (const m of src.matchAll(/cours \$\{|date \$\{/g)) {
      const expr = src.slice(m.index, m.index + 120);
      vrai(/fmtCoursQuand|quoteTime|asOfMarche/.test(expr),
        'un « cours de … » doit se dater sur l’heure du marché, pas sur celle '
        + `de la requête : ${expr.slice(0, 80)}`);
      vrai(!/\bj\.asOf\b|lastRun/.test(expr),
        `« cours de … » ne peut pas venir de lastRun : ${expr.slice(0, 80)}`);
    }

    /* Et la pastille du haut, qui est le seul repere de fraicheur visible sur
       toutes les pages. */
    const fn = src.slice(src.indexOf('function majEtatCours'),
                         src.indexOf('function symbolSearchCard'));
    vrai(fn.length > 400, 'majEtatCours() doit être trouvable');
    vrai(/coursAsOf\(\)/.test(fn),
      'la pastille doit lire l’heure du marché');
    vrai(fn.indexOf('marche ? fmtWhen') < fn.indexOf(': last ? fmtWhen(last)'),
      'et ne retomber sur l’heure de la requête qu’à défaut d’heure de marché');
  });

  test('une ligne qui n’a pas coté ne s’affiche pas à zéro, et dit pourquoi', () => {
    /* Le raisonnement existait deja, ecrit noir sur blanc au-dessus de
       `jourTitres` : « un titre qui n'a pas cote ne fait pas 0 EUR de
       variation, il ne dit rien ». Il n'etait applique qu'aux lignes sans
       cloture de reference — l'autre moitie du probleme s'affichait bien a
       plat, avec « ouvert » a cote. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    /* Chaque colonne se lit bornee a son propre `</span>`, jamais sur un
       nombre de caracteres : une fenetre de 200 caracteres depuis `jl-pct`
       mordait sur `jl-eur`, et le controle passait en ne lisant que la
       colonne d'a cote. Verifie en recassant — c'est ainsi qu'on l'a su. */
    for (const colonne of ['jl-pct', 'jl-eur']) {
      const i = src.indexOf(`<span class="${colonne}`);
      vrai(i > 0, `la colonne ${colonne} doit être trouvable`);
      const cellule = src.slice(i, src.indexOf('</span>', i));
      vrai(/l\.horsSeance/.test(cellule),
        `la colonne ${colonne} doit se taire hors séance plutôt qu’afficher zéro`);
    }
    /* Et la ligne porte la raison, sans quoi une colonne vide se lirait comme
       une donnee manquante de plus. */
    vrai(/l\.horsSeance \? \(l\.quoteTime/.test(src),
      'la ligne doit nommer la date de son cours, ou dire qu’elle n’a pas coté');
  });

  test('le ruban d’indices suit la même règle que les lignes de titres', () => {
    /* Trouve en verifiant le correctif a l'ecran : la carte « Aujourd'hui »
       disait enfin la verite, et le ruban juste au-dessus affichait toujours
       « S&P 500 · −0,17 % » sous un soleil — le mouvement de la veille, le
       6 aout 2026 a 16:45.

       C'est la lecon que ce fichier a deja notee deux fois : une regle ecrite
       pour un cas s'applique a tous ceux qui lui ressemblent, et s'arreter au
       symptome signale revient a attendre le suivant. Le repere portait deja
       `quoteTime`, `marketState` et `session` — tout ce que `coteAujourdhui()`
       demande — et personne ne les lisait. */
    const q = lireSource('assets/quotes.js');
    vrai(q, 'assets/quotes.js doit être lisible pour ce contrôle');
    const fn = q.slice(q.indexOf('async function reperes'), q.indexOf('cacheReperes.set'));
    vrai(fn.length > 400, 'reperes() doit être trouvable');
    vrai(/coteAujourdhui\(/.test(fn),
      'le ruban doit vérifier que le cours date d’aujourd’hui, comme une ligne de titres');
    vrai(/pct: utilisable && !horsSeance/.test(fn),
      'et ne publier de variation du jour que si une séance a eu lieu');

    /* Et les deux ecrans qui rendent ce `pct` doivent survivre a son absence :
       `fmtSignedPct(null)` ecrirait « +0,00 % », soit exactement le chiffre
       qu'on refuse de publier. */
    const src = lireSource('assets/app.js');
    for (const ancre of ['rp-var', 'Variation du jour']) {
      const i = src.indexOf(ancre);
      vrai(i > 0, `« ${ancre} » doit être trouvable`);
      vrai(/l\.pct == null/.test(src.slice(i, i + 400)),
        `« ${ancre} » doit se taire quand la variation du jour n’existe pas`);
    }
  });

  test('les deux libellés de manque ne se croisent jamais', () => {
    /* « Le même libellé donne le même montant sur tous les écrans. » Ici c'est
       l'inverse qui menaçait : deux comptes différents sous un seul libellé,
       et l'apercu appelait « sans cours du jour » ce que la carte appelait
       « sans cours de veille » — pour le meme `sansDonnee`. */
    /* Sur le code seul : la regle porte sur les libelles affiches, et un
       commentaire qui emploie la phrase ne compte rien. Il doit tout de meme
       dire vrai, mais c'est la relecture qui s'en charge, pas ce controle. */
    const src = (lireSource('assets/app.js') || '')
      .replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    const paires = [['sans cours du jour', 'horsSeance', 'sansDonnee'],
                    ['sans cours de veille', 'sansDonnee', 'horsSeance']];
    for (const [phrase, attendu, interdit] of paires) {
      const trouvees = [...src.matchAll(new RegExp(phrase, 'g'))];
      vrai(trouvees.length >= 2, `« ${phrase} » doit s’afficher sur au moins deux écrans`);
      for (const m of trouvees) {
        const avant = src.slice(Math.max(0, m.index - 160), m.index);
        vrai(avant.includes(attendu),
          `« ${phrase} » doit compter ${attendu}`);
        vrai(!new RegExp(`${interdit}[^]{0,60}$`).test(avant),
          `« ${phrase} » ne doit jamais compter ${interdit}`);
      }
    }
  });
});

/* ------------------------------------------------------------------
   12 bis. La cloche
   ------------------------------------------------------------------ */
suite('Ce que la cloche annonce', () => {

  /* Un état qui réclame les deux saisies : aucun relevé, aucune dépense. */
  /* L'historique du fixture reste : il s'arrete en fevrier, donc le mois courant
     et le mois clos manquent deja et les deux rappels s'allument d'eux-memes.
     Le vider serait simuler un premier lancement — et depuis que les rappels se
     taisent sur une application qui n'a jamais servi, c'est ce qui se passait :
     ces trois controles-ci portent sur le report et l'expiration, pas sur
     l'accueil d'un nouveau venu. */
  const enRetard = () => Fixture.poser(e => {
    e.meta.rappelsMasques = {};
    e.meta.notifsMasquees = [];
    e.meta.notifsReglages = {};
  });

  const titres = () => notifications().map(n => n.title);

  test('les saisies en attente viennent en tête', () => {
    /* Elles sont les seules sur lesquelles on peut agir tout de suite ; le
       reste demande de comprendre un chiffre avant de le corriger. */
    enRetard();
    const n = notifications();
    vrai(n.length >= 2, 'les deux saisies doivent être annoncées');
    eq(n[0].level, 'action');
    eq(n[1].level, 'action');
    vrai(n.every((x, i) => i === 0 || RANG_NOTIF[x.level] >= RANG_NOTIF[n[i - 1].level]),
      'du plus pressant au moins pressant, sans exception');
  });

  test('« Plus tard » éteint aussi la cloche', () => {
    /* Le défaut que ce contrôle protège : `healthChecks` lisait l'état brut, donc
       le report éteignait le bandeau et la pastille de la barre du bas, mais pas
       cette ligne. La cloche rallumait ce qu'on venait d'éteindre. */
    enRetard();
    const avant = titres().length;
    reporterRappel('releve');
    reporterRappel('depenses');
    const apres = titres();
    eq(apres.length, avant - 2, 'les deux lignes de saisie s’en vont');
    vrai(!apres.some(t => /à enregistrer|à saisir/.test(t)),
      'et aucune ne parle plus d’une saisie en attente');
  });

  test('une notification masquée ne revient pas, ses chiffres changent ou non', () => {
    /* La clé se moque des nombres : « 0,7 mois » devient « 3,1 mois » le mois
       suivant, et une clé qui les garderait ferait réapparaître la même alerte à
       chaque centième. */
    enRetard();
    const cible = notifications()[0];
    vrai(cible, 'il faut au moins une notification pour ce contrôle');
    masquerNotif(cible.cle);
    vrai(!titres().includes(cible.title), 'masquée, elle sort de la liste');

    const memeAutresChiffres = { ...cible, title: cible.title.replace(/\d+/g, '9') };
    eq(cleNotif(memeAutresChiffres), cible.cle,
      'les mêmes mots avec d’autres chiffres donnent la même clé');

    rendreNotifs();
    vrai(titres().includes(cible.title), '« Tout réafficher » la ramène');
  });

  test('une famille ignorée ne compte plus', () => {
    /* La famille est un **sujet** depuis le 5 août 2026, plus une gravité. */
    enRetard();
    const avant = notifications().filter(n => n.sujet === 'saisies').length;
    vrai(avant > 0, 'il faut des saisies en attente pour ce contrôle');
    Store.state.meta.notifsReglages = { saisies: false };
    eq(notifications().filter(n => n.sujet === 'saisies').length, 0,
      'plus une seule ligne de cette famille');
    eq(reglagesNotifs().cours, true, 'les autres familles restent allumées');
    Store.state.meta.notifsReglages = {};
    eq(notifications().filter(n => n.sujet === 'saisies').length, avant, 'et se rallument');
  });

  test('éteindre un sujet ne fait pas taire ses voisins', () => {
    /* Le défaut que ce changement d'axe corrige, et le seul qui comptait : « les
       quatre lignes on/off sont trop peu précises, quelle notif je dois arrêter
       selon le message ? »

       Avec la gravité, faire taire « Cours vieux de 12 jours » — un avertissement
       — emportait « Épargne de précaution : 0,8 mois », qui en est un aussi et
       n'a rien à voir. Le contrôle prend donc deux sujets différents et vérifie
       qu'éteindre l'un laisse l'autre intact. */
    Fixture.poser(e => {
      e.positions = [{ id: 'p1', name: 'Sans identifiant', qty: 1, price: 10,
                       currency: 'EUR', fx: 1, account: 'c_pea', assetClass: 'actions' }];
      e.quotes = { lastRun: null };
      e.meta.notifsReglages = {};
    });
    const sujets = n => [...new Set(notifications().map(x => x.sujet))].sort();
    vrai(sujets().includes('cours'), 'le fixture doit produire au moins une alerte de cours');

    const avant = notifications().length;
    Store.state.meta.notifsReglages = { cours: false };
    const apres = notifications();
    eq(apres.filter(n => n.sujet === 'cours').length, 0, 'le sujet éteint se tait');
    vrai(apres.length < avant, 'et il a bien retiré quelque chose');
    /* Rien d'autre n'a bouge : c'est toute la difference avec l'axe d'avant. */
    for (const s of sujets()) eq(s === 'cours', false, 'aucun autre sujet ne doit rester filtré');
  });

  test('le menu des réglages couvre toutes les familles', () => {
    /* Deux listes du même fait finissent par diverger. Le menu se construit sur
       FAMILLES_NOTIF, et chaque contrôle déclare son sujet dans healthChecks :
       les deux doivent porter exactement les mêmes clés, sinon un contrôle devient
       inextinguible — son sujet n'a pas d'interrupteur — ou un interrupteur ne
       commande rien.

       La liste se dérive du calcul, elle ne se recopie pas : on lit les sujets
       réellement émis plutôt que d'en tenir une seconde table. RANG_NOTIF, lui,
       garde les gravités : elles trient toujours le panneau, elles ont juste
       cessé d'être ce qu'on éteint. */
    const dansMenu = FAMILLES_NOTIF.map(f => f[0]).sort();
    for (const [cle, nom, quoi] of FAMILLES_NOTIF) {
      vrai(nom && quoi, cle + ' doit porter un nom et une explication');
      eq(reglagesNotifs()[cle] !== undefined, true, cle + ' doit avoir un réglage');
    }
    /* Tout sujet emis par un controle doit exister au menu. On force un etat qui
       en produit beaucoup, pour couvrir large. */
    Fixture.poser(e => { e.meta.notifsReglages = {}; e.meta.notifsMasquees = []; });
    for (const n of healthChecks()) {
      vrai(n.sujet, `« ${n.title} » doit déclarer son sujet`);
      vrai(dansMenu.includes(n.sujet),
        `« ${n.title} » porte le sujet « ${n.sujet} », absent du menu : il serait inextinguible`);
    }
    /* Et la gravite reste une gravite connue, pour le tri et l'icone. */
    for (const n of healthChecks()) {
      vrai(RANG_NOTIF[n.level] !== undefined,
        `« ${n.title} » porte une gravité inconnue : le panneau ne saurait pas la classer`);
    }
  });

  test('un état sans ces champs signale quand même', () => {
    /* Aucune migration : `notifsMasquees` et `notifsReglages` peuvent ne pas
       exister. Tout est allumé par défaut — une notification jamais vue ne peut
       pas avoir été refusée. */
    Fixture.poser(e => {
      e.monthly = []; e.budget.expenses = [];
      delete e.meta.notifsMasquees; delete e.meta.notifsReglages;
    });
    vrai(notifications().length >= 2, 'les deux saisies sont annoncées');
    eq(notifsMasquees().length, 0);
    for (const [cle] of FAMILLES_NOTIF) eq(reglagesNotifs()[cle], true, cle);
  });
});

/* ------------------------------------------------------------------
   13. Les rappels de saisie
   ------------------------------------------------------------------ */
suite('Rappels de saisie', () => {

  const moisCourant = () => currentMonthKey();

  test('un mois sans relevé réclame une saisie', () => {
    Fixture.poser(e => { e.monthly = []; });
    const p = currentMonthPending();
    eq(p.vide, true, 'le mois est bien vide');
    eq(p.missing, true, 'donc le rappel s allume');
  });

  test('la croix éteint le rappel du mois en cours', () => {
    /* Attendre une rentree d argent est une raison legitime de ne pas vouloir
       saisir maintenant. Un rappel qu on ne peut pas eteindre finit par ne
       plus etre lu. */
    Fixture.poser(e => { e.monthly = []; });
    masquerRappel('releve', moisCourant());
    const p = currentMonthPending();
    eq(p.vide, true, 'le mois reste vide, on ne fait pas semblant');
    eq(p.missing, false, 'mais le rappel se tait');
  });

  test('le report expire au mois suivant, sans rien faire', () => {
    /* Il porte une cle de mois : rien a lever a la main, et on ne peut pas
       taire un rappel pour toujours par accident. */
    Fixture.poser(e => {
      e.monthly = [];
      e.meta.rappelsMasques = { releve: '2020-01-01' };
    });
    eq(currentMonthPending().missing, true,
      'un report vieux d un autre mois ne protege plus rien');
  });

  test('les deux rappels sont indépendants', () => {
    Fixture.poser();
    masquerRappel('releve', moisCourant());
    eq(currentMonthPending().missing, false, 'le relevé se tait');
    eq(depensesEnAttente().missing, true, 'les dépenses continuent de réclamer');
  });

  test('un état sans ce champ se comporte comme avant', () => {
    /* Aucune migration : `rappelsMasques` peut ne pas exister. */
    Fixture.poser(e => { e.monthly = []; delete e.meta.rappelsMasques; });
    eq(currentMonthPending().missing, true);
  });

  /* `auJour()` est en tête de fichier : sans ce levier, l'expiration d'un report
     ne se vérifierait qu'en attendant sept jours. */

  test('« Plus tard » repousse de sept jours, pas du mois', () => {
    Fixture.poser(e => { e.monthly = []; });
    auJour('2026-07-25', () => {
      eq(reporterRappel('releve'), '2026-08-01', 'sept jours apres le 25 juillet');
      eq(currentMonthPending().missing, false, 'le rappel se tait aujourd’hui');
    });
    auJour('2026-07-31', () =>
      eq(currentMonthPending().missing, false, 'et la veille encore'));
    auJour('2026-08-01', () =>
      eq(currentMonthPending().missing, true, 'au septieme jour il revient'));
  });

  test('un report qui tombe un 1er n’efface pas le mois entier', () => {
    /* Le piege : une cle de mois est « 2026-08-01 », soit une date ISO elle
       aussi. Sans le prefixe, ce report se lirait comme un masquage d'aout,
       et le rappel disparaitrait trente jours au lieu de sept. */
    Fixture.poser(e => { e.monthly = []; });
    auJour('2026-07-25', () => reporterRappel('releve'));
    vrai(String(Store.state.meta.rappelsMasques.releve).startsWith('jusquau:'),
      'un report doit se distinguer d’une clé de mois');
    auJour('2026-08-04', () =>
      eq(currentMonthPending().missing, true,
        'le 4 aout, le report du 1er est expire : aout reclame sa saisie'));
  });

  test('les deux formes cohabitent dans le même champ', () => {
    /* Un etat ecrit avant le report ne porte que des cles de mois : il doit
       continuer de se taire, sinon la mise a jour rallume tous les rappels
       que l'on avait eteints. */
    Fixture.poser();
    masquerRappel('releve', currentMonthKey());
    auJour('2026-08-04', () => reporterRappel('depenses'));
    auJour('2026-08-04', () => {
      eq(currentMonthPending().missing, false, 'la clé de mois tait toujours');
      eq(depensesEnAttente().missing, false, 'le report tait aussi');
    });
    auJour('2026-08-12', () =>
      eq(depensesEnAttente().missing, true, 'mais lui seul expire au bout de sept jours'));
  });

  test('un report se lit à la journée, pas à l’heure', () => {
    /* `todayISO` est en heure locale, la date du report vient d'un
       `toISOString`, qui est en UTC. Un report pose le soir a Paris ne doit
       pas perdre un jour au passage. */
    Fixture.poser(e => { e.monthly = []; });
    for (const jour of ['2026-01-15', '2026-03-29', '2026-06-30', '2026-12-31']) {
      auJour(jour, () => {
        const quand = reporterRappel('releve');
        const attendu = new Date(jour + 'T12:00:00');
        attendu.setDate(attendu.getDate() + 7);
        eq(quand, attendu.toISOString().slice(0, 10), jour + ' + 7 jours');
      });
    }
  });

  test('« Plus tard » veut dire sept jours partout', () => {
    /* Trois bandeaux portent ce rappel : l'accueil, les depenses, les releves.
       Celui des releves disait deja « Plus tard » en taisant le mois entier,
       pendant que le nouveau ne repoussait que d'une semaine — deux gestes
       differents sous le meme mot. Le libelle et l'action doivent rester
       lies, et ce controle est le seul qui puisse le dire : le rendu vit dans
       app.js, que le harnais ne charge pas. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    /* Chaque <button> du fichier, decoupe grossierement : on ne veut que le
       couple (action, libelle). */
    const boutons = src.match(/<button[\s\S]{0,400}?<\/button>/g) || [];
    vrai(boutons.length > 20, 'la source doit contenir des boutons');

    for (const b of boutons) {
      const action = (b.match(/data-action="([^"]+)"/) || [])[1] || '';
      const dit = b.includes('Plus tard');
      if (dit) eq(action, 'reporter-rappel',
        '« Plus tard » ne peut appeler que le report de sept jours');
      if (action === 'taire-rappel') vrai(!dit,
        'taire le mois entier ne peut pas s’appeler « Plus tard »');
    }
    vrai(boutons.some(b => b.includes('Plus tard')),
      'et le bouton doit toujours exister, sinon ce contrôle ne prouve rien');
  });

  test('« Plus tard » ne laisse rien à l’écran', () => {
    /* Le report a porté un temps une note calme, avec la date du prochain
       rappel et une croix pour la fermer : deux gestes pour se débarrasser d'un
       rappel, un de trop. La date se dit dans le toast, au moment du clic.

       Ce qui doit rester vrai : le report éteint le rappel, il ne dépose rien
       d'autre dans l'état que sa propre date, et rien ne le remplace à
       l'écran. */
    Fixture.poser(e => { e.monthly = []; });
    auJour('2026-08-04', () => {
      eq(reporterRappel('releve'), '2026-08-11', 'la date que le toast annonce');
      eq(currentMonthPending().missing, false, 'et le bandeau se tait');
      eq(Object.keys(Store.state.meta.rappelsMasques).join(','), 'releve',
        'un seul champ touché, celui du genre reporté');
    });
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    vrai(!/note-calme/.test(src),
      'aucune note ne doit survivre au report : l’écran doit rester propre');
  });

  test('« 11 août » se dit sans son année', () => {
    eq(fmtJourMois('2026-08-11'), '11 août');
    eq(fmtJourMois('2026-01-01'), '1 janv.');
    eq(fmtJourMois(''), '', 'et une date absente ne dit rien');
  });
});

/* ------------------------------------------------------------------
   Les trois lectures « par enveloppe »
   ------------------------------------------------------------------ */
suite('Les trois lectures par enveloppe s’accordent', () => {

  /* Trois écrans rangent l'argent par enveloppe fiscale, et chacun annonce une
     base différente : la page Comptes compte tout ce qu'on possède, « Type de
     compte » ne compte que ce qui est placé en bourse, « Comptes & enveloppes »
     tout ce qui est placé. Trois nombres, donc, et c'est voulu — ce que ces
     contrôles vérifient, c'est que chacun égale bien la base qu'il affiche, et
     que les trois s'emboîtent au lieu de se contredire. */

  test('l’onglet Enveloppe de Comptes somme tous les avoirs', () => {
    Fixture.poser();
    const g = groupesParEnveloppe();
    pres(g.reduce((s, x) => s + x.total, 0), patrimoine().brut,
      'les groupes de la page Comptes doivent refaire le total qu’elle affiche');
    /* Et chaque compte dans un seul groupe : deux groupes le compteraient deux
       fois, et la somme tomberait juste par hasard un jour sur deux. */
    const vus = g.flatMap(x => x.comptes.map(c => c.id));
    eq(vus.length, new Set(vus).size, 'aucun compte ne paraît deux fois');
    eq(vus.length, comptesOuverts().length, 'et aucun ne manque');
  });

  test('un type inconnu garde son groupe au lieu de s’évaporer', () => {
    /* Le regroupement parcourait TYPES_COMPTE et gardait les comptes de chaque
       type. Un état venu de l'ancien modèle peut porter un type que cette liste
       ne connaît pas — `levier`, par exemple : le compte disparaissait alors de
       la page tout en restant dans le total affiché en tête, et la règle du
       projet tombait sans un mot à l'écran. */
    Fixture.poser(e => {
      e.comptes.push({ id: 'c_levier', etabId: 'e_courtier', type: 'levier',
        statut: 'ouvert', ouvertLe: '2025-01-01', numero: '', notes: '',
        libelle: 'Compte à levier', court: 'Levier', alloc: '', cash: [],
        lignes: [{ id: 'l_lev', classe: 'actions', libelle: 'Position à levier',
                   valeur: 4000, prixDeRevient: 4000, quantite: 1, dateAcquisition: '' }] });
    });
    const g = groupesParEnveloppe();
    pres(g.reduce((s, x) => s + x.total, 0), patrimoine().brut,
      'le total de la page vaut toujours la somme de ses groupes');
    const sien = g.find(x => x.comptes.some(c => c.id === 'c_levier'));
    vrai(sien, 'le compte au type inconnu a bien un groupe');
    pres(sien.total, 4000, 'et son groupe porte son montant');
    /* Les types connus gardent leur ordre, l'inconnu passe en queue. */
    eq(g[g.length - 1].id, 'levier', 'un type que la liste ignore vient à la fin');
  });

  test('« Type de compte » et « Comptes & enveloppes » comptent le même argent', () => {
    /* Les deux cartes de la page Patrimoine sont deux granularites d'un seul
       total : le type d'enveloppe, puis le compte. Leurs sommes doivent donc
       etre egales, et c'est un invariant plus fort que celui d'avant.

       « Type de compte » ne portait que la bourse. Sur une page ou tout le
       reste se rapporte aux avoirs ou a ce qui est place, elle annonçait
       13 814 EUR quand ses voisines annonçaient 25 397 et 30 523 : quatre
       cartes, quatre denominateurs. Chacun etait nomme, donc aucun ne mentait,
       mais le propriétaire a signale le 5 aout 2026 que la carte « gene ». Nommer
       une base ne dispense pas de prendre celle de ses voisines quand rien ne
       justifie d'en changer. */
    Fixture.poser();
    const parType = byAccountType().reduce((s, x) => s + x.value, 0);
    const parCompte = allocationByAccount().reduce((s, x) => s + x.value, 0);
    pres(parType, parCompte,
      'le même argent vu par type et vu par compte doit faire le même total');
    /* La base est desormais les avoirs, liquidites comprises. Elle excluait le
       cash deux fois — les comptes du groupe `cash` etaient ecartes, et
       `lignesDe()` ne voit pas le cash pose sur un compte-titres — et une page
       qui s'appelle « Allocation » cachait ainsi quinze mille euros. Le cash est
       une classe d'actif, celle qu'on choisit quand on ne choisit pas. */
    pres(parType, nowTotals().brut, 'et c’est « Tes avoirs », la base annoncée');
    pres(byAccountType().reduce((s, x) => s + x.pct, 0), 100, 'les parts font 100 %');
  });

  test('le levier ne devient pas une enveloppe', () => {
    /* Le piege de l'elargissement, attrape par ce test lors d'une premiere
       tentative : `levier` ne figure pas dans TYPES_COMPTE — il vient de
       l'ancien modele — donc `typeCompte('levier').groupe` ne vaut rien et le
       filtre sur le groupe ne l'ecarte pas. Une dette serait apparue comme une
       enveloppe, avec ses 4 000 EUR comptes comme un placement. */
    Fixture.poser(e => {
      e.comptes.push({ id: 'c_levier', etabId: 'e_courtier', type: 'levier',
        statut: 'ouvert', ouvertLe: '2025-01-01', numero: '', notes: '',
        libelle: 'Compte à levier', court: 'Levier', alloc: '', cash: [],
        lignes: [{ id: 'l_lev', classe: 'actions', libelle: 'Position à levier',
                   valeur: 4000, prixDeRevient: 4000, quantite: 1, dateAcquisition: '' }] });
    });
    vrai(!byAccountType().some(x => /levier/i.test(x.label)),
      'aucune enveloppe « levier » dans la répartition');
  });

  test('« Par compte » vaut tous les avoirs, liquidités comprises', () => {
    Fixture.poser();
    const lignes = allocationByAccount();
    pres(lignes.reduce((s, x) => s + x.value, 0), nowTotals().brut,
      'la base annoncée est « Tes avoirs » : c’est le brut');
    pres(lignes.reduce((s, x) => s + x.pct, 0), 100, 'les parts font 100 %');
    /* Le liquide y figure vraiment, et des deux endroits ou il se pose : un
       compte de cash entier, et la poche de cash d'un compte-titres. */
    const cash = comptesOuverts().filter(c => typeCompte(c.type).groupe === 'cash');
    vrai(cash.length, 'la fixture porte bien des comptes de liquidités');
    for (const c of cash) {
      if (!valeurCompte(c)) continue;
      vrai(lignes.some(l => l.label === nomCompteV2(c)),
        `${nomCompteV2(c)} doit apparaître dans la répartition`);
    }
  });

  test('les deux lectures de la carte partagent leur base', () => {
    /* Par enveloppe et par compte sont deux granularites d'un seul total : deux
       bases differentes en feraient deux cartes qui se contredisent sous un
       meme titre. Il y avait trois bases sur cette page, il n'en reste qu'une. */
    Fixture.poser();
    const parType = byAccountType().reduce((s, x) => s + x.value, 0);
    const parCompte = allocationByAccount().reduce((s, x) => s + x.value, 0);
    pres(parType, parCompte, 'les deux lectures partagent leur base');
    pres(parType, patrimoine().brut, 'et cette base est le brut');
  });
});

/* ------------------------------------------------------------------
   Le texte affiché porte ses accents
   ------------------------------------------------------------------ */
suite('Le texte affiché porte ses accents', () => {

  /* Les commentaires de ce projet s'écrivent sans accents, volontairement : ils
     ont déjà porté des octets invisibles, et l'ASCII y coupe court. Le texte
     affiché, lui, est lu par quelqu'un — « sur la periode affichee » n'est pas
     une variante, c'est une faute, et neuf bulles d'aide en portaient.

     La règle ne peut pas être « aucun mot sans accent » : « revenus », « place »
     ou « cote » sont du français juste. Ce contrôle liste donc des mots qui, nus,
     sont toujours faux, et les cherche dans ce qui s'affiche. */
  const NUS = ['periode', 'affichee', 'affiches?', 'epargne', 'depense', 'depenses',
    'marche', 'marches', 'ecart', 'deja', 'apres', 'meme', 'memes', 'ete',
    'tresorerie', 'reequilibrage', 'strategie', 'strategique', 'premiere',
    'derniere', 'decision', 'resultat', 'interieur', 'ramenent', 'merite',
    'releve', 'releves', 'etablissement', 'etablissements', 'annee', 'annees',
    'calculee', 'constatee', 'prevision', 'detaille', 'tiree', 'immediat',
    'mensualite', 'propriete', 'realisee', 'necessaire', 'verifie', 'exonere'];
  /* Les bornes du mot s'écrivent en clair, sans `\w` : la classe de mot de
     JavaScript s'arrête à l'ASCII, si bien que « déjà » aurait vu son « ja »
     final compter comme un mot entier. */
  const LETTRE = '0-9A-Za-zÀ-ÿ_';
  const motifNu = new RegExp('(?:^|[^' + LETTRE + '])(' + NUS.join('|')
    + ')(?![' + LETTRE + '])', 'i');

  /* Les commentaires partent d'abord. Sans cela, le premier « aide( » cité dans
     un commentaire ouvrait une capture qui courait jusqu'au prochain guillemet
     suivi d'une parenthèse : elle avalait des lignes de prose sans accents, et
     le contrôle échouait sur du texte que personne n'affiche. */
  const sansCommentaires = src => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');

  /* Le texte de chaque appel `aide(…)` du fichier, guillemets simples, doubles
     ou gabarit. Les `${…}` sortent : ce sont des identifiants, pas de la prose.
     Les bulles passent par `aide(trad("…"))` depuis que l'application se
     traduit : l'enveloppe est admise, et le contrôle vaut alors pour la clef
     française, qui est ce que le lecteur français lit. */
  function textesAide(src) {
    const out = [];
    const re = /aide\(\s*(?:trad\(\s*)?(['"`])([\s\S]*?)\1/g;
    let m;
    while ((m = re.exec(sansCommentaires(src)))) out.push(m[2].replace(/\$\{[^}]*\}/g, ' '));
    return out;
  }

  test('aucune bulle d’aide n’a perdu ses accents', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const textes = textesAide(src);
    vrai(textes.length > 20, `au moins vingt bulles d’aide attendues, ${textes.length} trouvées`);
    for (const t of textes) {
      const faute = t.match(motifNu);
      vrai(!faute, faute
        ? `« ${faute[1]} » sans accent dans une bulle d’aide :\n  ${t.slice(0, 120)}…`
        : '');
    }
  });

  test('les familles de notifications aussi', () => {
    /* « Le releve du mois, les depenses du mois clos » s'affichait dans les
       réglages des notifications. Ces libellés vivent dans une constante du
       store, donc le contrôle les lit directement. */
    for (const [, nom, quoi] of FAMILLES_NOTIF) {
      for (const t of [nom, quoi]) {
        const faute = t.match(motifNu);
        vrai(!faute, faute ? `« ${faute[1] }» sans accent : « ${t} »` : '');
      }
    }
  });

  test('et le contrôle attrape bien une faute', () => {
    /* Sans ce cas, un motif cassé rendrait les deux tests du dessus verts pour
       toujours : ils ne prouveraient plus que la regex compile. */
    vrai(motifNu.test('sur la periode affichee'), 'la faute type doit être vue');
    vrai(motifNu.test('Le releve du mois'), 'même en tête de phrase');
    vrai(!motifNu.test('Part de tes revenus mise de côté, selon ton budget.'),
      'et le français juste doit passer');
    vrai(!motifNu.test('la place de référence du titre'), '« place » est un mot');
  });
});

/* ------------------------------------------------------------------
   Les balises de version ne mentent pas
   ------------------------------------------------------------------ */
suite('Les balises de version ne mentent pas', () => {

  /* La consigne du projet demande de changer la version des `?v=` dès qu'un
     fichier d'`assets/` change, dans `index.html` ET dans `tests.html`. Oublier
     le second est le pire des deux oublis : la page de tests resert alors
     l'ancien JavaScript et rend un vert mensonger — elle affirmerait que le
     correctif passe alors qu'elle ne l'a pas chargé.

     Ce contrôle est le seul du lot qui se vérifie lui-même : il tourne dans la
     page dont il parle. Aucun regard humain ne l'aurait attrapé, c'est
     précisément un oubli. */

  /* Sans expression rationnelle : les valeurs vivent entre `?v=` et le
     guillemet qui ferme l'attribut. */
  const versions = src => src.split('?v=').slice(1).map(b => b.split('"')[0]);

  test('effacer rend un tableau de bord complet, pas une coquille', () => {
    /* La graine est ecrite dans l'ancien modele, un compte par ligne de releve.
       C'est la migration qui en tire les etablissements, les comptes et leurs
       poches — posee telle quelle, elle rend `comptes` absent et tout ce qui en
       descend a zero. « Tout effacer » la posait crument : l'ecran affichait
       0 EUR sur huit cartes, et le premier enregistrement figeait ce vide pour
       les visites suivantes. Le meme piege est deja documente dans `load()`,
       corrige la et jamais ici. */
    const src = lireSource('assets/app.js');
    const debut = src.indexOf("async 'wipe'()");
    vrai(debut > 0, 'l’action doit exister');
    const bloc = src.slice(debut, src.indexOf("'snapshot-row'", debut));
    vrai(/Store\.migrate\(\)/.test(bloc) && /refreshAccounts\(\)/.test(bloc),
      'la graine passe par la migration, sinon l’écran affiche 0 € sur tout');

    /* Et la preuve par le calcul : la graine migree porte des comptes et un
       patrimoine, la graine crue n'en porte aucun. */
    Fixture.poser();
    vrai(comptesOuverts().length > 0 && patrimoine().brut > 0,
      'un état construit porte des comptes et un patrimoine');
  });

  test('le HTML se revalide, les assets versionnés se gardent', () => {
    /* Le numero dans l'URL ne suffit pas seul. Il rend chaque version des
       assets unique — une adresse jamais vue est une adresse retelechargee —
       mais le HTML, lui, se demande a l'adresse nue : c'est le seul maillon qui
       peut servir un vieux document, lequel reclamerait alors les vieux `?v=`
       et figerait toute la chaine. On a deploye et regarde une version d'avant
       plus d'une fois.

       Les deux regles vont ensemble et n'ont de sens qu'ensemble : le HTML se
       revalide toujours, les assets ne se revalident jamais. */
    const h = lireSource('_headers');
    vrai(h, '_headers doit être lisible pour ce contrôle');

    const bloc = cle => {
      const i = h.indexOf('\n' + cle + '\n');
      return i < 0 ? '' : h.slice(i, h.indexOf('\n/', i + 1) + 1 || undefined);
    };
    vrai(/max-age=31536000/.test(bloc('/assets/*')) && /immutable/.test(bloc('/assets/*')),
      'les assets portent leur version dans l’URL : ils peuvent être gardés un an');
    for (const page of ['/', '/index.html', '/tests.html']) {
      vrai(/no-cache/.test(bloc(page)),
        `${page} doit se revalider : c’est lui qui porte les numéros de version`);
    }
    /* Le service worker decide quand les autres fichiers sont remplaces : le
       mettre en cache confierait la mise a jour a la version qu'on remplace. */
    vrai(/no-cache/.test(bloc('/sw.js')),
      'le service worker ne se met pas en cache, il est ce qui met à jour');
  });

  test('l’application dit quelle version elle exécute', () => {
    /* Deux fois dans la même journée du 5 août, la question « est-ce que je
       regarde bien la version déployée ? » a coûté une demi-heure — et `ETAT.md`
       note deux mesures faites sur la version d'avant sans que rien ne le signale.
       Sur un téléphone il n'y a pas d'outils de développement pour trancher.

       La version s'affiche donc dans la carte « État » de Données. Et elle se
       **dérive** de la balise du script : un numéro écrit une seconde fois à la
       main aurait fini par mentir, ce qui serait le comble pour un numéro de
       version. C'est la règle du projet, appliquée à elle-même. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    const decl = src.match(/const VERSION_APP = \(\(\) => \{[\s\S]{0,400}?\}\)\(\)/);
    vrai(decl, 'la version doit être calculée au démarrage');
    vrai(/document\.scripts/.test(decl[0]) && /searchParams\.get\('v'\)/.test(decl[0]),
      'et lue sur la balise du script : c’est la seule source, celle que la consigne '
      + 'de déploiement impose déjà de changer');
    vrai(!/VERSION_APP = ['"]/.test(src),
      'jamais un littéral : un second endroit à mettre à jour finirait par mentir');

    /* Et elle s'affiche. Une constante juste que personne ne montre ne repond a
       aucune des deux demi-heures perdues. */
    vrai(/<dt>\$\{trad\('Version'\)\}\$\{aide\(/.test(src) && /esc\(VERSION_APP\)/.test(src),
      'la carte « État » doit la montrer');

    /* Enfin, elle vaut quelque chose ici meme : ce test tourne dans une page qui
       porte les memes balises, donc l'evaluation est reelle et non simulee. */
    vrai(typeof VERSION_APP === 'undefined' || /^[0-9a-z.-]+$/i.test(VERSION_APP),
      'et si app.js est chargé, elle doit ressembler à une version');
  });

  /* Les cibles de `src="…"` et `href="…"`, sans les commentaires qui citeraient
     un chemin en prose. */
  function referencees(src) {
    const out = [];
    for (const marque of ['src="', 'href="']) {
      const bouts = src.split(marque).slice(1);
      for (const b of bouts) out.push(b.split('"')[0]);
    }
    return out;
  }

  test('les deux pages portent la même version, une seule', () => {
    const idx = lireSource('index.html');
    const tst = lireSource('tests.html');
    vrai(idx && tst, 'les deux pages doivent être lisibles');

    const vIdx = versions(idx), vTst = versions(tst);
    vrai(vIdx.length > 5, `index.html doit porter des balises de version (${vIdx.length})`);
    vrai(vTst.length > 3, `tests.html aussi (${vTst.length})`);
    eq(new Set(vIdx).size, 1, `index.html mélange des versions : ${[...new Set(vIdx)].join(', ')}`);
    eq(new Set(vTst).size, 1, `tests.html mélange des versions : ${[...new Set(vTst)].join(', ')}`);
    eq(vTst[0], vIdx[0],
      `tests.html sert la version ${vTst[0]} quand index.html sert ${vIdx[0]} : `
      + 'la page de tests ne teste pas ce que l’application exécute');
  });

  test('aucun fichier d’assets n’est servi sans version', () => {
    for (const page of ['index.html', 'tests.html']) {
      const src = lireSource(page);
      vrai(src, `${page} doit être lisible`);
      for (const cible of referencees(src)) {
        const nu = cible.split('?')[0];
        if (!nu.includes('assets/')) continue;
        if (!(nu.endsWith('.js') || nu.endsWith('.css'))) continue;
        vrai(cible.includes('?v='),
          `${page} sert ${nu} sans balise de version : un navigateur qui a déjà `
          + 'vu le site en resservira l’ancienne copie');
      }
    }
  });
});

/* ------------------------------------------------------------------
   L'application s'adresse toujours de la même façon
   ------------------------------------------------------------------ */
suite('L’application s’adresse toujours de la même façon', () => {

  /* Deux fautes signalees par le propriétaire le 4 aout 2026, sur deux captures :
     « Banques, courtiers et tous vos placements » sous Comptes, et « ce que tu
     vises… » sans majuscule sous Allocation.

     Aucune des deux ne se voit en relisant le code : elles ne sautent aux yeux
     que cote a cote, a l'ecran, et rien ne met deux ecrans cote a cote. D'ou
     ces deux controles, qui derivent la liste au lieu de la recopier. */

  const blanc = m => m.replace(/[^\n]/g, ' ');
  const sansCommentaires = s => s
    .replace(/\/\*[\s\S]*?\*\//g, blanc)
    .replace(/^[ \t]*\/\/.*$/gm, blanc)
    .replace(/<!--[\s\S]*?-->/g, blanc);

  test('un sous-titre de vue commence par une majuscule', () => {
    /* Ils vivent tous dans la meme table, dans les deux langues : la liste se
       derive de `i18n.js` et ne peut donc pas oublier la vue ajoutee demain. */
    const src = sansCommentaires(lireSource('assets/i18n.js') || '');
    vrai(src, 'assets/i18n.js doit être lisible pour ce contrôle');

    const fautifs = [];
    for (const m of src.matchAll(/'(view\.[a-z.]*\.sub)':\s*(['"])([\s\S]*?)\2/g)) {
      const premiere = m[3].trim().charAt(0);
      /* `toLocaleUpperCase` et non une comparaison a A-Z : « Écart » et « Où »
         commencent par une lettre accentuee, qui est bien une majuscule. */
      if (premiere && premiere !== premiere.toLocaleUpperCase('fr'))
        fautifs.push(`${m[1]} = « ${m[3].slice(0, 40)} »`);
    }
    eq(fautifs.length, 0,
      'sous-titre en minuscule : ' + fautifs.join(' ; ')
      + ' — il s’affiche seul sous le titre de la page, viewSub() ne le colle à rien');
  });

  test('le texte affiché tutoie, bulles d’aide comprises', () => {
    /* L'application tutoie partout, decision du propriétaire du 5 aout 2026.

       Elle a longtemps melange les deux. `CLAUDE.md` disait « vouvoiement dans
       les textes d'aide », mais le code ne l'avait jamais suivi : au moment de
       la mesure, les bulles portaient 60 tutoiements pour 30 vouvoiements. Ce
       n'etait donc pas un style, c'etait une regle ecrite que personne
       n'appliquait — et qui rendait le defaut invisible, puisque chaque
       exemplaire pouvait se reclamer d'une moitie de la regle.

       Une premiere version de ce controle excluait les bulles. Le tamis est
       retire : il n'y a plus de zone ou le vouvoiement soit permis, donc plus
       de zone ou il puisse revenir sans qu'on le voie. */
    const fautifs = [];
    for (const f of ['assets/app.js', 'assets/store.js', 'assets/i18n.js']) {
      const src = sansCommentaires(lireSource(f) || '');
      vrai(src, f + ' doit être lisible pour ce contrôle');
      for (const m of src.matchAll(/\b(vous|vos|votre|Vous|Vos|Votre)\b/g))
        fautifs.push(`${f}:${src.slice(0, m.index).split('\n').length} (${m[1]})`);
    }
    eq(fautifs.length, 0,
      'vouvoiement dans le texte affiché : ' + fautifs.join(', ')
      + ' — l’application tutoie partout, bulles d’aide comprises');
  });

  test('un crédit s’appelle un crédit sur tous les boutons qui en créent un', () => {
    /* Quatre boutons creaient le meme objet : deux disaient « Pret », deux
       disaient « Credit », sous une section « Financement ». Le propriétaire a
       demande la difference entre les deux — il n'y en avait aucune, c'etait
       le meme `ajouter-credit` ecrivant dans `etab.dettes`. Trois mots pour une
       chose, et la question etait legitime.

       Tranche le 5 aout 2026 : « Credit » nomme l'objet, « Financement » reste
       le titre de la section sur la fiche d'un bien. Le titre dit le sujet, le
       bouton dit l'objet.

       La liste se derive des boutons : celui qu'on ajoutera demain est couvert
       sans que personne ait à y penser. */
    const src = sansCommentaires(lireSource('assets/app.js') || '');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    const fautifs = [];
    for (const m of src.matchAll(/data-action="ajouter-credit"/g)) {
      const fin = src.indexOf('</button>', m.index);
      if (fin < 0) continue;
      const libelle = src.slice(m.index, fin);
      if (/[Pp]rêt/.test(libelle))
        fautifs.push('ligne ' + src.slice(0, m.index).split('\n').length);
    }
    eq(fautifs.length, 0,
      'un bouton qui crée un crédit l’appelle « prêt » (' + fautifs.join(', ')
      + ') : deux mots pour le même objet, et plus personne ne sait s’il y a une différence');
  });
});

/* ------------------------------------------------------------------
   Un champ qui se répète propose ce qu'on y a déjà mis
   ------------------------------------------------------------------ */
suite('Un champ qui se répète propose ce qu’on y a déjà mis', () => {

  /* Trois champs libres se retapaient a chaque fois : le preteur d'un credit,
     l'organisme d'une charge fixe, la source d'un revenu. Deux orthographes du
     meme nom ne se regroupent jamais, et personne ne s'en apercoit — ce sont
     des champs qu'on relit rarement.

     Les valeurs se derivent des donnees. Une table tenue a la main aurait vieilli
     des le premier organisme ajoute, et c'est exactement le defaut que ce projet
     rencontre le plus souvent : deux listes pour une seule verite. */

  test('les valeurs proposées sortent des données, dédoublonnées et triées', () => {
    Fixture.poser(e => {
      e.budget.fixedCharges = [
        { label: 'Assurance', amount: 40, period: 'mois', provider: 'MAIF' },
        { label: 'Habitation', amount: 20, period: 'mois', provider: 'maif' },
        { label: 'Électricité', amount: 90, period: 'mois', provider: 'Engie' },
        { label: 'Sans organisme', amount: 10, period: 'mois', provider: '' },
      ];
    });
    const v = valeursConnues('organisme');
    eq(v.length, 2, 'deux organismes distincts, la casse ne fait pas un doublon');
    /* La derniere ecriture rencontree gagne.
       Peu importe laquelle : ce qui compte est qu'il n'y en ait qu'une, et que
       la regle soit la meme dans tout le fichier. */
    eq(v.join('|'), 'Engie|maif', 'triés, une seule écriture par organisme');
  });

  test('un prêteur connu peut être l’établissement lui-même', () => {
    /* Quand la banque qui prete est celle qui tient le compte, son nom est deja
       dans l'application : le retaper serait absurde. */
    Fixture.poser(e => {
      e.etabs = [{ id: 'e1', nom: 'Banque', dettes: [{ id: 'd1', preteur: 'Un prêteur', montant: 100 }] }];
    });
    const v = valeursConnues('preteur');
    vrai(v.includes('Un prêteur'), 'le prêteur déjà saisi est proposé');
    vrai(v.includes('Banque'), 'et le nom de l’établissement aussi');
  });

  test('un champ sans valeur connue ne propose rien', () => {
    /* Une liste vide ne doit pas produire un `datalist` vide : la vue teste la
       longueur, et un `list=` qui pointe sur rien vaut mieux absent. */
    Fixture.poser(e => { e.budget.income = []; });
    eq(valeursConnues('source').length, 0, 'aucune source connue');
    eq(valeursConnues('champ-inexistant').length, 0, 'et une clé inconnue ne lève pas');
  });

  test('la fenêtre ne pose une liste que s’il y a quelque chose à proposer', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const debut = src.indexOf('function askForm');
    const fin = src.indexOf('\nfunction ', debut + 1);
    const fn = src.slice(debut, fin > 0 ? fin : debut + 6000);
    vrai(/\(c\.suggestions \|\| \[\]\)\.length/.test(fn),
      'le datalist ne doit exister que si des valeurs sont proposées');
    vrai(/<datalist id="\$\{dl\}">/.test(fn),
      'et la liste doit être posée par la fenêtre elle-même, pas par chaque appelant');
  });
});

/* ------------------------------------------------------------------
   Un indice de ligne peut valoir zéro
   ------------------------------------------------------------------ */
suite('Un indice de ligne peut valoir zéro', () => {

  /* Signale par le propriétaire le 5 aout 2026 : « je ne peux plus modifier le
     montant d'un placement non cote ». Il n'avait jamais pu.

     `lignesDe()` pose `ref: i`, l'indice de la ligne dans son compte. La vue
     rendait le nom cliquable sous condition `(editable && !l.marche && l.ref)`
     — une verite booleenne sur un indice. Zero est faux, donc la PREMIERE ligne
     de chaque compte n'etait pas cliquable, et ses trois comptes non cotes n'en
     portant qu'une seule, aucun placement non cote n'avait de chemin d'edition :
     ni son montant, ni son echeance, ni son intitule.

     Rien ne se voyait : la ligne s'affichait normalement, elle ne repondait
     simplement pas au clic. C'est le genre de defaut qu'aucune relecture
     n'attrape et qu'un test de presence attrape tout de suite. */

  test('la première ligne d’un compte porte bien l’indice 0', () => {
    /* Le fait du modele, sans lequel la regle de vue ci-dessous n'aurait pas
       de raison d'etre. */
    Fixture.poser(e => {
      e.comptes = [{ id: 'pe1', type: 'pe', libelle: 'Non coté', lignes: [
        { libelle: 'Part A', valeur: 1000, classe: 'noncote' },
        { libelle: 'Part B', valeur: 500, classe: 'noncote' },
      ] }];
    });
    const lignes = lignesDe(Store.state.comptes[0]);
    eq(lignes.length, 2, 'les deux lignes remontent');
    eq(lignes[0].ref, 0, 'la première porte l’indice 0');
    eq(lignes[1].ref, 1, 'la seconde l’indice 1');
    vrai(!lignes[0].ref, 'et 0 est faux en vérité booléenne : c’est tout le piège');
  });

  test('la vue teste l’existence de l’indice, pas sa vérité', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const debut = src.indexOf('function lignePlacement');
    vrai(debut > 0, 'lignePlacement doit être trouvable');
    /* Jusqu'a la fonction suivante, pas un nombre de caracteres : une borne en
       dur se fait depasser des qu'on ajoute un commentaire, et le test passe
       alors au vert en ne regardant rien. C'est arrive en ecrivant celui-ci. */
    const fin = src.indexOf('\nfunction ', debut + 1);
    const fn = src.slice(debut, fin > 0 ? fin : debut + 4000);
    vrai(fn.includes('editer-placement'), 'la découpe doit contenir le corps de la fonction');

    vrai(/l\.ref != null/.test(fn),
      'le nom doit devenir un bouton dès que l’indice existe, y compris 0');
    vrai(!/&&\s*l\.ref\s*\)/.test(fn),
      'un indice testé en vérité booléenne rendrait la première ligne de chaque '
      + 'compte non modifiable, sans que rien ne se voie à l’écran');
  });
});

/* ------------------------------------------------------------------
   Retirer une catégorie n'efface rien
   ------------------------------------------------------------------ */
suite('Retirer une catégorie n’efface rien', () => {

  /* Demande du propriétaire, 5 aout 2026 : « pouvoir supprimer une categorie
     dans un mois, sans que ca supprime l'historique des mois precedents ».

     Le seul geste qui existait, `removeExpenseCategory`, efface les montants de
     tous les mois. Il reste, parce qu'une colonne creee par erreur doit pouvoir
     partir en entier. Retirer est l'autre geste, et le piege est evident une
     fois nomme : treize endroits parcourent `expenseCategories()` pour sommer,
     dont `expenseRowTotal`. Filtrer cette liste aurait fait baisser des totaux
     passes en silence.

     Le premier test est donc le seul qui compte vraiment : retirer ne change
     aucun chiffre. */

  const troisMois = e => {
    e.budget.categories = ['Courses', 'Sport', 'Transports'];
    e.budget.retirees = [];
    e.budget.expenses = [
      { month: '2026-01-01', v: { Courses: 400, Sport: 60, Transports: 40 }, note: '' },
      { month: '2026-02-01', v: { Courses: 500, Sport: 60 }, note: '' },
      { month: '2026-03-01', v: { Courses: 300, Transports: 90 }, note: '' },
    ];
  };

  test('retirer ne change aucun total, ni du mois ni de la catégorie', () => {
    Fixture.poser(troisMois);
    const avant = Store.state.budget.expenses.map(expenseRowTotal);
    const totalSport = expenseCategoryTotal('Sport');
    pres(avant[0], 500, 'janvier vaut bien la somme de ses trois postes');
    pres(totalSport, 120, 'Sport a reçu 120 € en tout');

    vrai(retirerCategorie('Sport'), 'le retrait doit être accepté');

    const apres = Store.state.budget.expenses.map(expenseRowTotal);
    for (let i = 0; i < avant.length; i++)
      pres(apres[i], avant[i], `le total du mois ${i + 1} ne bouge pas d’un centime`);
    pres(expenseCategoryTotal('Sport'), totalSport,
      'et les montants de la catégorie retirée sont toujours là');
  });

  test('une catégorie retirée quitte la saisie et rien d’autre', () => {
    Fixture.poser(troisMois);
    retirerCategorie('Sport');
    vrai(expenseCategories().includes('Sport'),
      'elle reste dans la liste qui sert aux totaux, aux colonnes et aux exports');
    vrai(!categoriesSaisie().includes('Sport'),
      'et sort de ce qu’on propose de remplir ce mois-ci');
    vrai(categorieRetiree('Sport'), 'elle se déclare retirée');
    vrai(categoriesSaisie().includes('Courses'), 'les autres ne bougent pas');
  });

  test('reprendre défait exactement le retrait', () => {
    Fixture.poser(troisMois);
    const depart = categoriesSaisie().join('|');
    retirerCategorie('Sport');
    vrai(reprendreCategorie('Sport'), 'la reprise doit être acceptée');
    eq(categoriesSaisie().join('|'), depart,
      'la liste de saisie revient à l’identique, dans le même ordre');
    vrai(!categorieRetiree('Sport'), 'et la catégorie n’est plus retirée');
  });

  test('retirer deux fois ne fait rien de plus', () => {
    /* Les migrations et les gestes repetes doivent etre idempotents : un double
       clic ne doit pas inscrire deux fois le meme nom, sinon « Reprendre » ne
       l'enleverait qu'a moitie. */
    Fixture.poser(troisMois);
    retirerCategorie('Sport');
    vrai(!retirerCategorie('Sport'), 'le second retrait est refusé');
    eq(Store.state.budget.retirees.filter(c => c === 'Sport').length, 1,
      'le nom n’est inscrit qu’une fois');
    reprendreCategorie('Sport');
    vrai(!categorieRetiree('Sport'), 'et une seule reprise suffit à la rendre');
  });

  test('renommer une catégorie retirée garde le retrait sur le nouveau nom', () => {
    /* Sinon le nom d'avant resterait retire a vie, et le nouveau reviendrait
       dans la saisie sans qu'on l'ait demande. */
    Fixture.poser(troisMois);
    retirerCategorie('Sport');
    vrai(renameExpenseCategory('Sport', 'Salle de sport'), 'le renommage doit passer');
    vrai(categorieRetiree('Salle de sport'), 'le nouveau nom est retiré');
    vrai(!categorieRetiree('Sport'), 'et l’ancien ne l’est plus');
    pres(expenseCategoryTotal('Salle de sport'), 120, 'les montants ont suivi le nom');
  });

  test('supprimer une catégorie retirée la sort aussi des retirées', () => {
    /* Le defaut qu'on ne verrait qu'un mois plus tard : recreer une categorie
       du meme nom la ferait naitre deja retiree, absente de la saisie, sans que
       rien ne l'explique. */
    Fixture.poser(troisMois);
    retirerCategorie('Sport');
    removeExpenseCategory('Sport');
    vrai(!categorieRetiree('Sport'), 'le nom ne traîne plus dans les retirées');
    addExpenseCategory('Sport');
    vrai(categoriesSaisie().includes('Sport'),
      'une catégorie recréée sous le même nom revient dans la saisie');
  });

  test('un état sans liste de retirées se comporte comme une liste vide', () => {
    /* Aucune migration n'a ete ecrite pour ce champ : les etats existants n'ont
       pas `budget.retirees`, et c'est voulu — un champ absent doit se lire, pas
       se rattraper. */
    Fixture.poser(e => { troisMois(e); delete e.budget.retirees; });
    vrai(!categorieRetiree('Sport'), 'rien n’est retiré');
    eq(categoriesSaisie().length, expenseCategories().length,
      'et la saisie propose toutes les catégories');
    vrai(retirerCategorie('Sport'), 'le premier retrait crée la liste au passage');
    vrai(categorieRetiree('Sport'), 'et prend effet');
  });
});

/* ------------------------------------------------------------------
   Ce qu'on règle une fois ne reste pas ouvert
   ------------------------------------------------------------------ */
suite('Ce qu’on règle une fois ne reste pas ouvert', () => {

  /* Regle donnee par le propriétaire le 5 aout 2026, apres avoir vu la fiche d'un
     etablissement : « le nom de la banque devrait etre ecrit en gros avec un
     petit bouton modifier, pas un champ qui reste ouvert. Idem pour un compte,
     et type de compte. On touche qu'une fois normalement. »

     La regle complete tient en une phrase : la frequence commande la forme. Un
     champ qu'on revient corriger chaque mois — le montant des liquidites, une
     note — reste en saisie directe, parce qu'un bouton de plus a chaque fois
     serait un geste de plus a chaque fois. Un champ qu'on regle a la creation
     et qu'on ne rouvre jamais passe derriere « Modifier » : ouvert, il donne a
     une page de consultation l'allure d'un formulaire.

     Ces controles gardent la liste des chemins interdits dans la fiche. Ils
     sont textuels — le harnais ne rend pas de page — mais ils portent sur le
     seul endroit ou ces champs pourraient revenir. */

  const ficheCompte = () => {
    const s = lireSource('assets/app.js') || '';
    return s.slice(s.indexOf('function viewFicheCompte'), s.indexOf('function viewFicheEtab'));
  };

  test('aucun champ d’identité n’est ouvert dans la fiche d’un compte', () => {
    const fiche = ficheCompte();
    vrai(fiche.length > 1000, 'la fiche de compte doit être trouvable');
    for (const cle of ['libelle', 'numero', 'ouvertLe', 'plafond']) {
      vrai(!new RegExp('data-path="comptes\\.\\$\\{idx\\}\\.' + cle + '"').test(fiche),
        `le champ « ${cle} » est resté en saisie directe dans la fiche : il se règle `
        + 'une fois, il doit passer derrière « Modifier »');
    }
    vrai(!/data-action-change="changer-type-compte"/.test(fiche),
      'le type de compte est resté un menu ouvert dans la fiche');
    vrai(/data-action="modifier-compte"/.test(fiche),
      'la fiche doit porter le bouton « Modifier » qui ouvre ces champs');
  });

  test('la note reste en saisie directe', () => {
    /* Le complement, et il compte autant : passer les notes derriere le bouton
       aurait ete « plus coherent » et faux. Une note s'ecrit au moment ou l'on
       y pense, souvent parce qu'on vient de penser a quelque chose. */
    const fiche = ficheCompte();
    vrai(/data-path="comptes\.\$\{idx\}\.notes"/.test(fiche),
      'la note doit rester en saisie directe : elle s’ajoute à n’importe quel moment');
  });

  test('le nom d’un établissement s’affiche ailleurs que dans son champ', () => {
    /* Le defaut trouve en appliquant la regle : sur cette page, le titre de la
       barre du haut dit « Comptes ». Le seul endroit ou le nom de
       l'etablissement se lisait etait donc l'interieur de son champ de saisie.
       Retirer le champ sans poser le nom aurait fait disparaitre de la page le
       nom de ce dont elle parle. */
    const s = lireSource('assets/app.js') || '';
    const fiche = s.slice(s.indexOf('function viewFicheEtab'),
                          s.indexOf('function viewFicheEtab') + 3000);
    vrai(fiche.length > 500, 'la fiche d’établissement doit être trouvable');
    vrai(!/data-path="etabs\.\$\{idx\}\.nom"/.test(fiche),
      'le nom de l’établissement est resté un champ ouvert');
    vrai(/class="fiche-nom"/.test(fiche),
      'le nom doit être affiché en titre, sinon la page ne dit plus de quoi elle parle');
    vrai(/data-action="modifier-etab"/.test(fiche),
      'la fiche doit porter le bouton « Modifier »');
  });

  test('la fiche d’un établissement porte la teinte de son groupe', () => {
    /* Demande du propriétaire : garder le code couleur en haut de la fiche.
       Le point qui compte n'est pas qu'il y ait une couleur, c'est que ce soit
       la meme : elle vient de teinteDominante(), la fonction qui colore deja le
       groupe dans la liste. Une seconde facon de la calculer donnerait deux
       couleurs pour un seul etablissement, sans que rien ne dise laquelle a
       raison. */
    const s = lireSource('assets/app.js') || '';
    const fiche = s.slice(s.indexOf('function viewFicheEtab'),
                          s.indexOf('function viewFicheEtab') + 3000);
    vrai(/--teinte:\$\{teinteDominante\(siens\)\}/.test(fiche),
      'la fiche doit tirer sa teinte de teinteDominante(), la même source que la liste');
    vrai(/class="cpt-pastille"/.test(fiche),
      'et l’afficher avec la pastille de la liste, pas une autre forme');
  });
});

/* ------------------------------------------------------------------
   La police des titres ne descend pas sur les chiffres
   ------------------------------------------------------------------ */
suite('La police des titres ne descend pas sur les chiffres', () => {

  /* Manrope habille les titres et le logotype, jamais un montant.

     La raison n'est pas esthetique. Toute la feuille repose sur
     `tabular-nums` pour que les colonnes de montants s'alignent, et beaucoup
     de polices d'affichage n'embarquent pas de chiffres tabulaires : la
     largeur d'un total changerait alors a chaque frappe, sous les yeux de
     celui qui le saisit. Un chiffre qui danse pendant qu'on l'ecrit se lit
     comme une erreur.

     Ces controles sont textuels — le harnais ne rend aucune page. Ils
     attrapent le geste qui casse la regle, pas son effet a l'ecran. */

  const cssBrut = () => lireSource('assets/styles.css');
  /* Sans les commentaires : celui de l'@font-face cite `--font-titre` en
     prose, et compterait pour une declaration. */
  const cssNu = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const blocFontFace = s => (cssNu(s).match(/@font-face\s*\{[\s\S]*?\}/) || [])[0];

  test('la police d’affichage ne s’applique qu’aux titres et au logotype', () => {
    const css = cssBrut();
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');

    /* Une regle par bloc : ce qui precede le `{` est le selecteur. */
    const usages = cssNu(css).split('}').filter(b => b.includes('var(--font-titre)'));
    eq(usages.length, 1,
      `var(--font-titre) est posée à ${usages.length} endroits : elle doit l’être `
      + 'une seule fois, sinon personne ne peut dire ce qui porte la police');

    const parts = usages[0].split('{')[0]
      .split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean).sort();
    eq(parts.join(' | '), '.brand-text strong | .lancement-marque span | h1 | h2 | h3',
      'la police des titres a débordé de sa cible : ' + parts.join(', ')
      + ' — un sélecteur de montant lui ferait perdre ses chiffres tabulaires');
  });

  test('le nom de l’application s’écrit partout dans la même police', () => {
    /* Le mot-marque est ecrit a deux endroits : l'ecran de lancement, une
       seconde, et la barre laterale, en permanence. La premiere version de
       cette regle n'avait pris que le premier — celui qu'on ne voit
       pratiquement jamais — et « Tallya » s'affichait en deux polices selon
       l'ecran. Ce controle part du balisage : il trouve ou le nom est ecrit,
       et exige que chaque endroit soit couvert. */
    const idx = (lireSource('index.html') || '').replace(/<!--[\s\S]*?-->/g, ' ');
    vrai(idx, 'index.html doit être lisible pour ce contrôle');

    const porteurs = [...idx.matchAll(/<(span|strong|b)\b[^>]*>\s*Tallya\s*<\/\1>/g)];
    vrai(porteurs.length >= 2,
      `le nom devrait être écrit à au moins deux endroits, ${porteurs.length} trouvé(s) : `
      + 'si le balisage a changé, ce contrôle ne prouve plus rien');

    const css = cssBrut();
    const regle = cssNu(css).split('}').find(b => b.includes('var(--font-titre)')) || '';
    const cibles = regle.split('{')[0];
    /* Chaque porteur du nom doit tomber sous un selecteur de la regle : soit
       par son element (`strong`, `span` seuls ne suffisent pas), soit par la
       classe de son conteneur, qu'on retrouve dans le selecteur. */
    for (const p of porteurs) {
      const avant = idx.slice(0, p.index);
      const conteneur = (avant.match(/class="([^"]*)"(?![\s\S]*class=")/) || [])[1] || '';
      const couvert = conteneur.split(/\s+/).filter(Boolean)
        .some(c => cibles.includes('.' + c));
      vrai(couvert,
        `« Tallya » écrit dans « ${conteneur || '(sans classe)'} » n’est visé par aucun `
        + 'sélecteur de la police des titres : le nom s’afficherait en deux polices '
        + 'selon l’écran');
    }
  });

  test('les montants gardent la police du système', () => {
    const css = cssBrut();
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    const corps = cssNu(css).split('}').find(b => b.split('{')[0].trim() === 'body');
    vrai(corps, 'la règle « body » doit exister');
    vrai(corps.includes('font-family: var(--font);'),
      'body ne déclare plus var(--font) : les montants suivraient la police des titres');
    vrai(corps.includes('tabular-nums'),
      'body ne déclare plus tabular-nums : les colonnes de montants cesseraient de s’aligner');
  });

  test('aucun titre n’affiche de montant', () => {
    /* Le controle qui protege la decision, et non son application. Tant
       qu'aucun `h` ne porte de montant, poser une police d'affichage dessus
       est sans danger. Le jour ou un titre afficherait un total, il faudrait
       soit l'en sortir, soit verifier que Manrope porte bien `tnum`.

       Les commentaires sont remplaces par des espaces de meme longueur, sauts
       de ligne conserves : sinon le numero signale ne designe aucune ligne
       reelle du fichier. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const blanc = m => m.replace(/[^\n]/g, ' ');
    const nu = src.replace(/\/\*[\s\S]*?\*\//g, blanc).replace(/<!--[\s\S]*?-->/g, blanc);

    /* `aide(...)` rend un `<span data-aide="…">?</span>` : son texte part dans
       un attribut, jamais dans le titre rendu. Un montant cite dans une bulle
       d'explication est de la prose, il ne s'aligne en colonne nulle part —
       la premiere version de ce test signalait « Allocation par classe » pour
       cette raison, a tort.

       Le comptage de parentheses suppose que la prose d'aide les equilibre,
       ce qu'elle fait partout ici. Une parenthese orpheline dans un texte
       d'aide ferait signaler son titre a tort : le message dit ou regarder. */
    const sansAide = s => {
      let sortie = '', i = 0;
      for (;;) {
        const j = s.indexOf('aide(', i);
        if (j < 0) return sortie + s.slice(i);
        if (j > 0 && /[A-Za-z0-9_$]/.test(s[j - 1])) { sortie += s.slice(i, j + 5); i = j + 5; continue; }
        sortie += s.slice(i, j);
        let k = j + 5, prof = 1;
        while (k < s.length && prof > 0) {
          if (s[k] === '(') prof++;
          else if (s[k] === ')') prof--;
          k++;
        }
        i = k;
      }
    };

    const fautifs = [];
    for (const m of nu.matchAll(/<h([123])\b[^>]*>([\s\S]*?)<\/h\1>/g))
      if (/fmtCur|fmtEUR|fmtCurEur|fmtPct|fmtSigned|fmtNombre/.test(sansAide(m[2])))
        fautifs.push('ligne ' + nu.slice(0, m.index).split('\n').length);
    eq(fautifs.length, 0,
      'un titre porte un montant formaté (' + fautifs.join(', ') + ') : il hérite '
      + 'de Manrope, dont rien ne garantit les chiffres tabulaires');
  });

  test('le préchargement et la feuille désignent le même fichier', () => {
    /* Deux URL qui different d'un octet — une balise `?v=` posee d'un cote
       seulement — font telecharger la police deux fois : le prechargement ne
       sert alors a rien, et il coute une requete. Rien ne le signale, sinon
       l'onglet reseau. */
    const css = cssBrut(), idx = lireSource('index.html');
    vrai(css && idx, 'styles.css et index.html doivent être lisibles');

    const face = blocFontFace(css);
    vrai(face, 'la déclaration @font-face doit exister dans styles.css');
    const u = face.match(/url\(([^)]+)\)/);
    vrai(u, 'l’@font-face doit porter une url()');
    const fichier = u[1].replace(/['"]/g, '').trim();

    const p = idx.replace(/<!--[\s\S]*?-->/g, ' ').match(/<link[^>]+rel="preload"[^>]*>/);
    vrai(p, 'index.html doit précharger la police des titres');
    const href = (p[0].match(/href="([^"]+)"/) || [])[1];

    eq(href, 'assets/' + fichier,
      `le préchargement vise ${href} quand la feuille charge ${fichier} : `
      + 'la police serait téléchargée deux fois');
    vrai(!href.includes('?'),
      'aucune balise de version sur la police : l’url() de la feuille n’en porte pas, '
      + 'et les deux doivent coïncider');
    vrai(/crossorigin/.test(p[0]),
      '« crossorigin » manque au préchargement : une police se récupère en mode CORS, '
      + 'et sans l’attribut le fichier est téléchargé une seconde fois');
    vrai(/as="font"/.test(p[0]),
      '« as="font" » manque : sans lui le navigateur ne sait pas quoi prioriser');
  });

  test('le fichier de police est bien servi', () => {
    /* Une url() qui ne resout pas ne leve rien : le titre retombe sur la
       police du systeme et tout a l'air normal. C'est exactement le genre de
       panne qu'un oeil ne voit pas. */
    const brut = lireSource('assets/manrope-latin.woff2');
    vrai(brut, 'assets/manrope-latin.woff2 doit être servi : sans lui les titres '
      + 'retombent en silence sur la police du système');
    eq(brut.slice(0, 4), 'wOF2',
      'le fichier ne commence pas par la signature woff2 : ce n’est pas une police');
  });

  test('le sous-ensemble latin couvre le français et l’euro', () => {
    /* Un sous-ensemble mal choisi ne casse rien de visible non plus : les
       accents tombent simplement sur la police du systeme, et « Repartition »
       s'affiche en deux polices dans le meme mot. */
    const face = blocFontFace(cssBrut() || '');
    vrai(face, 'la déclaration @font-face doit exister dans styles.css');
    for (const plage of ['U+0000-00FF', 'U+2000-206F', 'U+20AC'])
      vrai(face.includes(plage),
        `l’unicode-range doit porter ${plage}, sinon un titre mêle deux polices `
        + '(accents, apostrophe typographique, euro)');
  });
});

/* ------------------------------------------------------------------
   Un courtier qui prête sur marge
   ------------------------------------------------------------------ */
suite('Un courtier qui prête sur marge', () => {

  /* La question du détenteur, le 4 août 2026 : « si mon courtier me fait du levier,
     je dois mettre ça comment ». Réponse du modèle : un crédit sur
     l'établissement, comme un prêt immobilier. Les titres achetés avec cet
     argent restent comptés en entier — on les possède — et le montant prêté se
     retranche du patrimoine net, une seule fois.

     Ce que ces contrôles interdisent : que la marge change la valeur des avoirs,
     qu'elle soit déduite une fois par compte au lieu d'une fois par crédit, ou
     qu'elle vienne se ranger parmi les enveloppes. Le levier est une dette, pas
     une enveloppe, et `byAccountType()` le dit depuis toujours en écartant les
     comptes de rôle `margin` ; il fallait un test qui le tienne. */
  const MARGE = 3000;
  const surMarge = e => {
    const courtier = e.etabs.find(x => x.id === 'e_courtier');
    courtier.dettes = [{ id: 'd_marge', libelle: 'Marge', montant: MARGE,
                         taux: 5.8, mensualite: null, note: '' }];
  };

  test('la marge ne change pas ce que valent les avoirs', () => {
    Fixture.poser(surMarge);
    pres(patrimoine().brut, Fixture.BRUT,
      'les titres achetés à crédit restent comptés en entier : on les possède');
    pres(nowTotals().invested + nowTotals().cash, Fixture.BRUT,
      'et les parts refont toujours le brut');
  });

  test('elle se retranche du net, une seule fois', () => {
    Fixture.poser(surMarge);
    /* L'établissement « Courtier » tient deux comptes, le PEA et le CTO : c'est
       le cas qui ferait compter la dette deux fois si elle était attribuée aux
       comptes plutôt qu'à l'établissement. */
    const chez = Store.state.comptes.filter(c => c.etabId === 'e_courtier');
    eq(chez.length, 2, 'le courtier tient bien deux comptes dans le fixture');
    pres(dettesTotal(), Fixture.DETTE + MARGE, 'le prêt du studio et la marge');
    pres(patrimoine().net, Fixture.BRUT - Fixture.DETTE - MARGE,
      'net = avoirs − crédits, la marge comptée une fois');
  });

  test('elle ne devient pas une enveloppe', () => {
    /* L'invariant se compare a lui-meme plutot qu'a un montant ecrit en dur :
       la repartition par enveloppe doit etre identique avec et sans la marge.
       Epingler « 9 750 » revenait a epingler la base de la carte, et le test
       tombait le jour ou cette base a change — le 5 aout 2026 — alors que la
       regle qu'il defend, elle, n'avait pas bouge d'un centime. */
    Fixture.poser();
    const sansMarge = byAccountType().reduce((s, x) => s + x.value, 0);
    Fixture.poser(surMarge);
    const avecMarge = byAccountType().reduce((s, x) => s + x.value, 0);
    pres(avecMarge, sansMarge,
      'une dette de levier ne change rien à la répartition par enveloppe');
    vrai(!byAccountType().some(x => /levier|marge/i.test(x.label)),
      'et n’y apparaît sous aucun nom');
    pres(groupesParEnveloppe().reduce((s, g) => s + g.total, 0), patrimoine().brut,
      'et les groupes de la page Comptes somment toujours les avoirs');
  });

  test('l’effet de levier se lit sur les capitaux propres', () => {
    /* Le chiffre que la fiche du compte affiche : ce qu'on contrôle rapporté à
       ce qui est vraiment à soi. Il vit dans la vue, mais son arithmétique doit
       être dite une fois quelque part, sinon personne ne saura si « 195 % » est
       la bonne façon de le dire. */
    Fixture.poser(surMarge);
    const cto = Store.state.comptes.find(c => c.id === 'c_cto');
    const valeur = valeurCompte(cto);          // 750 d’or
    const propre = valeur - MARGE;
    vrai(propre < 0, 'ici la marge dépasse ce que le compte porte : pas de levier à afficher');
    const pea = Store.state.comptes.find(c => c.id === 'c_pea');
    const v = valeurCompte(pea);               // 1 500 de cash + 9 000 d’ETF
    pres(v, 10500, 'le PEA du fixture vaut 10 500 €');
    pres(v / (v - MARGE) * 100, 140,
      '10 500 € contrôlés pour 7 500 € à soi : 140 % de tes capitaux propres');
  });
});

/* ------------------------------------------------------------------
   Les paliers d'autonomie
   ------------------------------------------------------------------ */
suite('Les paliers d’autonomie couvrent tout, dans le bon ordre', () => {

  /* Le défaut trouvé par le propriétaire le 4 août 2026 : la jauge annonçait
     6 011 € de coussin quand « Disponible tout de suite » en montrait 5 361.
     L'écart valait exactement ses espèces. `mobilisabilite()` gardait une liste
     de deux types écrite à la main — « courant ou livret » — et les espèces sont
     arrivées après : des billets dans un portefeuille tombaient derrière un
     virement bancaire, en « quelques jours ». Elle lit maintenant le groupe du
     type de compte, qui dit déjà que c'est du cash. */

  test('la jauge plus les projets font le disponible immédiat', () => {
    /* Le meme defaut, une marche plus loin, signale le 5 aout 2026 : la jauge
       annonçait 3 714 EUR et « Disponible tout de suite » 5 734, deux lignes
       plus bas. L'ecart valait exactement l'argent reserve a un projet, et rien
       a l'ecran ne le disait.

       Les deux chiffres sont justes. La jauge est le coussin — precaution plus
       cash disponible, ce que la regle des 3 a 6 mois vise — et le palier est
       tout le cash immediatement mobilisable, projets compris : cet argent
       existe, on y toucherait avant de manquer.

       Ce qui manquait etait l'addition. Elle est desormais ecrite sur la carte,
       et ce controle la verifie : coussin + projets = disponible tout de suite.
       Une troisieme affectation qui arriverait dans « immediat » sans rejoindre
       l'un des deux ferait echouer ce test, ce qui est le but. */
    Fixture.poser(e => {
      e.comptes = [{ id: 'c_b', type: 'courant', libelle: 'Compte', cash: [
        { montant: 3000, affectation: 'courant' },
        { montant: 500, affectation: 'precaution' },
        { montant: 2020, affectation: 'projet' },
      ] }];
    });
    const p = poches(), r = runway();
    pres(p.projet, 2020, 'l’argent du projet est bien rangé');
    pres(p.precaution + p.courant, 3500, 'le coussin ne compte pas le projet');
    pres(r.immediate, 5520, 'le palier immédiat, lui, porte tout le cash mobilisable');
    pres(p.precaution + p.courant + p.projet, r.immediate,
      'coussin + projets = disponible tout de suite : les deux montants de la '
      + 'carte doivent s’additionner, sinon l’écart reste inexpliqué');

    /* Et le palier le dit. La note nommait les contenants — comptes courants,
       livrets, especes — sans dire ce qui y est deja promis : quelqu'un qui
       vient de lire « + 2 020 EUR reserves a un projet » les cherchait ici sans
       les trouver. Les deux lignes se laissaient rapprocher sans se rejoindre. */
    vrai(/projets/i.test(r.tiers[0].note),
      'le palier immédiat doit dire qu’il comprend les projets');
  });

  test('sans projet, la note n’en parle pas', () => {
    /* Une note qui parle de projets a quelqu'un qui n'en a pas est du bruit :
       elle nomme une poche vide et fait chercher un montant qui n'existe pas. */
    Fixture.poser(e => {
      e.comptes = [{ id: 'c_b', type: 'courant', libelle: 'Compte', cash: [
        { montant: 3000, affectation: 'courant' },
      ] }];
    });
    vrai(!/projets/i.test(runway().tiers[0].note),
      'aucune mention de projets quand il n’y en a aucun');
  });

  test('des billets sont disponibles tout de suite', () => {
    eq(mobilisabilite('liquidites', 'especes'), 'immediat',
      'des espèces ne peuvent pas être moins disponibles qu’un virement');
    eq(mobilisabilite('liquidites', 'courant'), 'immediat');
    eq(mobilisabilite('liquidites', 'livret'), 'immediat');
    /* Le cash posé chez un courtier garde son délai : son compte est du groupe
       bourse, l'argent doit d'abord être viré. */
    eq(mobilisabilite('liquidites', 'pea'), 'differe');
    eq(mobilisabilite('liquidites', 'cto'), 'differe');
  });

  test('le groupe du type décide, pas une liste recopiée', () => {
    /* Ce qui protège du prochain type de compte de cash : la règle se lit dans
       TYPES_COMPTE, elle ne se réécrit pas ici.

       Une seule exception, et elle est devant : le PER est fermé jusqu'à la
       retraite, y compris pour le cash qui y dort. Ce n'est pas une question de
       délai de virement, c'est une question de droit d'y toucher. */
    for (const t of TYPES_COMPTE) {
      const attendu = t.id === 'per' ? 'bloque'
        : t.groupe === 'cash' ? 'immediat' : 'differe';
      eq(mobilisabilite('liquidites', t.id), attendu,
        `${t.label} : liquidités ${attendu}`);
    }
  });

  test('les quatre paliers font le patrimoine brut', () => {
    Fixture.poser();
    const p = poches();
    const m = p.mobilisable;
    pres(m.immediat + m.differe + m.lent + m.bloque, patrimoine().brut,
      'chaque euro tombe dans un palier, et dans un seul');
    /* Le fixture, palier par palier : 3 000 de courant + 2 000 de livret font
       l'immédiat ; le cash du PEA et les titres font le différé ; le studio et
       le crowdfunding sont lents ; rien n'est bloqué. */
    pres(m.immediat, 5000, 'courant + livret');
    pres(m.differe, Fixture.CASH_A_INVESTIR + 9750, 'cash du PEA + ETF + or');
    pres(m.lent, 122000, 'studio + crowdfunding');
    pres(m.bloque, 0, 'aucun PER dans le fixture');
  });

  test('les espèces montent d’un palier sans changer le total', () => {
    /* Le contrôle qui aurait attrapé le bug : poser des espèces et vérifier
       qu'elles sont dans l'immédiat, le total ne bougeant pas. */
    const avant = Fixture.poser().comptes.length;
    poserEspeces(Store.state);
    refreshAccounts();
    const especes = Store.state.comptes.find(c => c.type === 'especes');
    vrai(especes, 'poserEspeces() a bien posé le compte');
    especes.cash = [{ montant: 650, affectation: 'courant' }];
    const p = poches();
    pres(p.mobilisable.immediat, 5650, 'les 650 € de billets sont dans l’immédiat');
    pres(p.mobilisable.immediat + p.mobilisable.differe + p.mobilisable.lent
       + p.mobilisable.bloque, patrimoine().brut, 'et le total suit');
    vrai(Store.state.comptes.length >= avant, 'aucun compte perdu au passage');
  });

  test('le cumul des paliers laisse l’inaccessible dehors', () => {
    Fixture.poser(e => {
      /* Un PER : de l'argent qui n'arrivera pas, quoi qu'il se passe demain. */
      e.comptes.push({ id: 'c_per', etabId: 'e_courtier', type: 'per', statut: 'ouvert',
        ouvertLe: '2022-01-01', numero: '', notes: '', libelle: 'PER', court: 'PER',
        alloc: '', cash: [], lignes: [{ id: 'l_per', classe: 'actions', libelle: 'Fonds',
          valeur: 8000, prixDeRevient: 8000, quantite: 1, dateAcquisition: '' }] });
    });
    const r = runway();
    const cumules = r.tiers.filter(t => !t.horsCumul);
    const hors = r.tiers.filter(t => t.horsCumul);
    pres(hors.reduce((s, t) => s + t.value, 0), 8000, 'le PER est hors cumul');
    pres(cumules[cumules.length - 1].cumulative,
      cumules.reduce((s, t) => s + t.value, 0),
      'le dernier cumul vaut la somme des paliers cumulables');
    pres(cumules.reduce((s, t) => s + t.value, 0) + 8000, patrimoine().brut,
      'cumulables + hors cumul = patrimoine brut');
    for (const t of hors) eq(t.months, null, 'un palier hors cumul n’annonce pas de mois');
  });
});

/* ------------------------------------------------------------------
   Les deux axes de la page Cible
   ------------------------------------------------------------------ */
suite('Les deux axes de la page Cible ne se mélangent pas', () => {

  /* Le classeur Excel les mélangeait dans une feuille : « Actions core » et
     « Actions satellite » voisinaient avec « Métaux précieux », puis deux lignes
     d'agrégat fermaient le tableau — « Cash à investir » et « Placé en bourse »,
     cette dernière valant la somme des précédentes. Dans un tableur, une ligne de
     somme posée au milieu de ses membres passe dans les filtres et les
     graphiques comme si elle était une part.

     Ce que ces contrôles tiennent : chaque axe somme sa base, la base est la
     même pour les deux — sinon les deux feuilles ne se recouperaient pas — et
     l'agrégat reste identifiable comme tel. */

  test('les classes somment la base, sans ligne d’agrégat', () => {
    Fixture.poser();
    const r = rebalanceRows();
    const membres = [...r.classes, ...(r.cash ? [r.cash] : [])];
    pres(membres.reduce((s, x) => s + x.value, 0), r.base,
      'les classes et la trésorerie font la base des cibles');
    pres(membres.reduce((s, x) => s + x.pct, 0), 100, 'et leurs parts font 100 %');
    /* `invested` est un sous-total : la base moins la trésorerie. Il a sa place
       en synthèse, pas dans la liste des membres. */
    pres(r.invested.value, r.base - (r.cash ? r.cash.value : 0),
      'l’agrégat vaut la base moins la trésorerie');
    vrai(!r.classes.some(c => c.label === r.invested.label),
      'et il ne figure pas parmi les classes');
  });

  test('les rôles somment la même base', () => {
    Fixture.poser();
    const rr = rebalanceRoles();
    pres(rr.base, rebalanceRows().base,
      'une seule base pour les deux axes, sinon les deux feuilles ne se recoupent pas');
    pres(rr.roles.reduce((s, x) => s + x.value, 0), rr.base, 'socle + satellites + trésorerie');
    pres(rr.roles.reduce((s, x) => s + x.pct, 0), 100, 'et leurs parts font 100 %');
    /* Le fixture : 9 000 d’ETF au socle, 750 d’or en satellite, 1 500 à investir. */
    const val = cle => rr.roles.find(x => x.cle === cle).value;
    pres(val('core'), 9000, 'le MSCI World est au socle');
    pres(val('satellite'), 750, 'l’or est en satellite');
    pres(val('cashToInvest'), Fixture.CASH_A_INVESTIR, 'et le cash du PEA attend');
  });

  test('la composition d’un rôle fait le montant du rôle', () => {
    Fixture.poser();
    const rr = rebalanceRoles();
    for (const cle of ['core', 'satellite']) {
      const parts = rr.composition[cle] || [];
      const role = rr.roles.find(x => x.cle === cle);
      pres(parts.reduce((s, x) => s + x.value, 0), role.value,
        `la composition du ${role.label.toLowerCase()} fait son montant`);
    }
  });

  test('le partage par classe recoupe les rôles', () => {
    /* `parClasse` sert la colonne « dans mes actions, quelle part est du
       socle ». Sa somme doit valoir le socle plus les satellites, la trésorerie
       exceptée : elle n'a pas de rôle. */
    Fixture.poser();
    const rr = rebalanceRoles();
    const somme = rr.parClasse.reduce((s, x) => s + x.total, 0);
    const roles = rr.roles.filter(x => x.cle !== 'cashToInvest')
      .reduce((s, x) => s + x.value, 0);
    pres(somme, roles, 'le détail par classe couvre exactement les deux rôles');
  });
});

/* ------------------------------------------------------------------
   La tête de l'onglet Charges fixes
   ------------------------------------------------------------------ */
suite('Ce qui sort chaque mois', () => {

  /* Trois chiffres nouveaux s'affichent au-dessus du tableau des charges : le
     total mensuel, le même sur douze mois, et ce qui reste vraiment à ta charge.
     Les deux derniers dérivent du premier, et c'est justement ce qu'il faut
     tenir : un total annuel qui ne vaudrait pas douze fois le mensuel, ou une
     part personnelle qui ne complèterait pas la part partagée, mentiraient sans
     que rien ne se voie. */

  const CHARGES = e => {
    e.budget.contributors = [{ id: 'p1', name: 'Colocataire' }];
    e.budget.fixedCharges = [
      { label: 'Loyer', amount: 900, period: 'mois', shares: { p1: 450 } },
      { label: 'Assurance', amount: 120, period: 'an' },
      { label: 'Abonnement', amount: 30, period: 'mois' },
    ];
  };

  test('une charge annuelle se ramène au mois', () => {
    Fixture.poser(CHARGES);
    pres(chargeMensuelle({ amount: 120, period: 'an' }), 10, '120 € par an font 10 € par mois');
    pres(chargeMensuelle({ amount: 30, period: 'mois' }), 30, 'un mensuel ne bouge pas');
    pres(fixedTotal(), 940, '900 de loyer + 10 d’assurance + 30 d’abonnement');
  });

  test('le total sur douze mois vaut douze fois le mois', () => {
    Fixture.poser(CHARGES);
    /* Le chiffre affiché est `f.fixed * 12`. Il doit valoir la somme des charges
       ramenées à l'année, sinon l'annuel et le mensuel de la même carte se
       contrediraient. */
    pres(budgetFrame().fixed * 12, 940 * 12, '11 280 € par an');
    pres(budgetFrame().fixed, fixedTotal(), 'et le cadre du budget lit le même total');
  });

  test('ce qui est partagé plus ce qui reste font le total', () => {
    Fixture.poser(CHARGES);
    const st = sharedTotals();
    pres(st.partage + st.mine, st.total, 'partagé + à ma charge = charges fixes');
    pres(st.total, fixedTotal(), 'et ce total est celui du tableau');
    pres(st.partage, 450, 'la moitié du loyer');
    pres(st.mine, 490, 'l’autre moitié, plus l’assurance et l’abonnement');
    pres(st.parPersonne[0].total, 450, 'nommément, la part du colocataire');
  });

  test('la liste des postes somme le total affiché', () => {
    /* La carte ne montre que les six plus gros postes et annonce « et N autres ».
       La somme de tous les postes, elle, doit valoir le total en gros
       caractères — c'est ce que la mention promet. */
    Fixture.poser(CHARGES);
    const postes = Store.state.budget.fixedCharges
      .map(c => chargeMensuelle(c)).filter(v => v > 0);
    pres(postes.reduce((s, v) => s + v, 0), budgetFrame().fixed,
      'aucun poste hors du total, aucun compté deux fois');
    eq(postes.length, 3, 'trois postes dans ce jeu d’essai');
  });
});

/* ------------------------------------------------------------------
   Les crédits en cours
   ------------------------------------------------------------------ */
suite('Les crédits en cours se lisent tous ensemble', () => {

  /* Une dette vit sur l'établissement qui l'a consentie, et se lisait donc un
     établissement à la fois. La carte de l'accueil les rassemble : son total doit
     être celui que le patrimoine net retranche, sinon deux écrans annonceraient
     deux dettes. */

  const DEUX = e => {
    /* Le studio du fixture porte déjà 40 000 € de prêt. On ajoute une marge chez
       le courtier, sans capital initial : le champ est facultatif. */
    e.etabs.find(x => x.id === 'e_courtier').dettes = [
      { id: 'd_marge', libelle: 'Marge', montant: 2000, taux: 5.8, mensualite: null },
    ];
    /* Et le prêt du studio reçoit son capital emprunté : c'est lui qui permet de
       dire ce qui est déjà remboursé. */
    const pret = e.etabs.find(x => x.id === 'e_bien').dettes[0];
    pret.initial = 50000;
    pret.mensualite = 320;
  };

  test('le total de la carte est celui que le net retranche', () => {
    Fixture.poser(DEUX);
    const cr = creditsEnCours();
    pres(cr.reste, dettesTotal(), 'un seul total de dettes dans l’application');
    pres(cr.reste, Fixture.DETTE + 2000, 'le prêt du studio et la marge');
    pres(cr.lignes.reduce((s, c) => s + c.reste, 0), cr.reste,
      'et la somme des lignes fait ce total');
    pres(patrimoine().net, patrimoine().brut - cr.reste,
      'net = avoirs − crédits, le même nombre que la carte affiche');
  });

  test('chaque crédit dit son établissement, le plus gros d’abord', () => {
    Fixture.poser(DEUX);
    const cr = creditsEnCours();
    eq(cr.lignes.length, 2, 'les deux crédits, quel que soit leur établissement');
    eq(cr.lignes[0].libelle, 'Prêt immobilier', 'le plus gros vient en tête');
    eq(cr.lignes[0].etabNom, 'Studio', 'et il nomme son établissement');
    eq(cr.lignes[1].etabNom, 'Courtier');
  });

  test('sans capital emprunté, aucune part n’est inventée', () => {
    Fixture.poser(DEUX);
    const cr = creditsEnCours();
    const marge = cr.lignes.find(c => c.libelle === 'Marge');
    eq(marge.initial, null, 'le champ est facultatif');
    eq(marge.part, null, 'et « 0 % remboursé » serait un mensonge, pas une valeur par défaut');
    eq(marge.rembourse, null);
    const pret = cr.lignes.find(c => c.libelle === 'Prêt immobilier');
    pres(pret.rembourse, 10000, '50 000 emprunté, 40 000 restant dû');
    pres(pret.part, 20, 'soit 20 % remboursé');
    /* Le cumul ne porte que sur les crédits mesurables : la marge n'entre ni au
       numérateur ni au dénominateur. */
    pres(cr.initial, 50000, 'un seul capital initial connu');
  });

  test('le prélèvement mensuel ne s’ajoute pas au budget', () => {
    /* La carte affiche la somme des mensualités, en lecture. Le budget, lui, ne
       doit pas la compter : ces mensualités sont déjà des charges fixes, et les
       additionner ferait mentir le reste à vivre. */
    Fixture.poser(DEUX);
    const cr = creditsEnCours();
    pres(cr.mensuel, 320, 'seule la mensualité renseignée compte');
    const avant = budgetFrame().fixed;
    pres(avant, fixedTotal(), 'les charges fixes ne connaissent pas les crédits');
    vrai(cr.mensuel > 0 && budgetFrame().fixed === avant,
      'déclarer une mensualité de crédit ne change aucun total de budget');
  });

  test('sans crédit, il n’y a pas de carte', () => {
    Fixture.poser(e => { e.etabs.forEach(x => { x.dettes = []; }); });
    const cr = creditsEnCours();
    eq(cr.lignes.length, 0, 'rien à afficher');
    pres(cr.reste, 0);
    pres(patrimoine().net, patrimoine().brut, 'et le net vaut le brut');
  });
});

/* ------------------------------------------------------------------
   Modifier un crédit
   ------------------------------------------------------------------ */
suite('Modifier un crédit vise la bonne ligne', () => {

  /* La carte de l'accueil trie les crédits par montant, alors que l'écriture se
     fait par position dans les dettes de l'établissement. Confondre les deux
     index corrigeait un crédit en croyant en toucher un autre, sans rien qui se
     voie : les deux montants existent, les deux sont plausibles. */

  const TROIS = e => {
    e.etabs.find(x => x.id === 'e_courtier').dettes = [
      { id: 'd_petit', libelle: 'Petit crédit', montant: 500 },
      { id: 'd_gros', libelle: 'Gros crédit', montant: 90000 },
    ];
  };

  test('l’index pointe la dette dans son établissement, pas dans la liste triée', () => {
    Fixture.poser(TROIS);
    const cr = creditsEnCours();
    /* Trié par montant : le gros crédit du courtier passe devant le prêt du
       studio (40 000) et devant le petit. */
    eq(cr.lignes.map(c => c.libelle).join(' | '),
      'Gros crédit | Prêt immobilier | Petit crédit', 'l’ordre affiché');
    const gros = cr.lignes[0];
    eq(gros.index, 1, 'mais il est en seconde position chez son établissement');
    /* Ce que fait l'action d'édition, avec ces deux clés. */
    const e = etabById(gros.etabId);
    eq(e.dettes[gros.index].id, 'd_gros', 'etabId + index désignent bien cette dette');
    const petit = cr.lignes.find(c => c.libelle === 'Petit crédit');
    eq(etabById(petit.etabId).dettes[petit.index].id, 'd_petit');
  });

  test('corriger un capital restant dû fait monter le patrimoine net d’autant', () => {
    Fixture.poser(TROIS);
    const avant = patrimoine().net;
    const cr = creditsEnCours();
    const gros = cr.lignes[0];
    /* Le geste de l'action : écrire le montant à l'index de l'établissement. */
    etabById(gros.etabId).dettes[gros.index].montant = 85000;
    pres(patrimoine().net, avant + 5000,
      'cinq mille remboursés, cinq mille de patrimoine net en plus');
    pres(creditsEnCours().reste, dettesTotal(), 'et le total reste unique');
  });

  test('le prêteur ne se recopie pas dans l’intitulé', () => {
    /* L'ajout collait « · Crédit Agricole » dans le libellé tout en gardant le
       prêteur dans son champ : la même information à deux endroits, dont une que
       l'édition ne pouvait plus corriger. */
    Fixture.poser();
    const e = etabById('e_courtier');
    e.dettes = [{ id: 'd1', libelle: 'Prêt auto', montant: 8000, preteur: 'Crédit Agricole' }];
    const c = creditsEnCours().lignes.find(x => x.id === 'd1');
    eq(c.libelle, 'Prêt auto', 'l’intitulé reste l’intitulé');
    eq(c.preteur, 'Crédit Agricole', 'et le prêteur son propre champ');
    vrai(!c.libelle.includes(c.preteur), 'aucun des deux ne contient l’autre');
  });
});

/* ------------------------------------------------------------------
   Ce que rembourse une mensualité
   ------------------------------------------------------------------ */
suite('Une mensualité rembourse du capital et paie des intérêts', () => {

  /* La carte des crédits mène avec ce que le remboursement rapporte, et non avec
     l'encours : c'est la lecture honnête d'une dette qui se rembourse. Encore
     faut-il que le partage soit juste — dire « +620 € de patrimoine net » quand
     272 € partent en intérêts serait une flatterie, pas une information. */

  const PRET = e => {
    e.etabs.find(x => x.id === 'e_bien').dettes = [
      { id: 'd_pret', libelle: 'Prêt immobilier', montant: 96000, initial: 120000,
        mensualite: 620, taux: 3.4 },
    ];
  };

  test('les intérêts du mois se calculent sur le capital restant', () => {
    Fixture.poser(PRET);
    const c = creditsEnCours().lignes[0];
    /* 96 000 × 3,4 % ÷ 12 = 272 € d'intérêts, donc 348 € de capital. */
    pres(c.interets, 272, 'le taux annuel divisé par douze');
    pres(c.capital, 348, 'la mensualité moins les intérêts');
    pres(c.interets + c.capital, c.mensualite, 'et les deux font la mensualité');
  });

  test('rembourser fait baisser les intérêts du mois suivant', () => {
    Fixture.poser(PRET);
    const avant = creditsEnCours().lignes[0];
    etabById('e_bien').dettes[0].montant = 48000;
    const apres = creditsEnCours().lignes[0];
    pres(apres.interets, 136, 'la moitié du capital, la moitié des intérêts');
    vrai(apres.capital > avant.capital,
      'à mensualité égale, la part de capital monte quand la dette baisse');
    pres(apres.interets + apres.capital, 620, 'la mensualité ne bouge pas');
  });

  test('sans taux, on ne prétend pas connaître le partage', () => {
    Fixture.poser(e => {
      e.etabs.find(x => x.id === 'e_bien').dettes = [
        { id: 'd_pret', libelle: 'Prêt', montant: 96000, mensualite: 620 },
      ];
    });
    const c = creditsEnCours().lignes[0];
    eq(c.interets, null, 'aucun taux, aucun intérêt inventé');
    eq(c.capital, null, 'et aucune part de capital devinée');
    pres(c.mensualite, 620, 'la mensualité, elle, reste connue');
  });

  test('un crédit sans mensualité ne pèse rien de mensuel', () => {
    Fixture.poser(e => {
      e.etabs.find(x => x.id === 'e_courtier').dettes = [
        { id: 'd_marge', libelle: 'Marge', montant: 2000, taux: 5.8 },
      ];
    });
    const cr = creditsEnCours();
    const marge = cr.lignes.find(c => c.libelle === 'Marge');
    pres(marge.interets, 2000 * 5.8 / 100 / 12, 'les intérêts courent quand même');
    eq(marge.capital, null, 'mais rien ne rembourse de capital sans mensualité');
    pres(cr.mensuel, 0, 'et le total mensuel de la carte reste à zéro');
  });
});

/* ------------------------------------------------------------------
   Un capital restant dû qui vieillit
   ------------------------------------------------------------------ */
suite('Un capital restant dû se projette au lieu de s’oublier', () => {

  /* Question du propriétaire : « quelle est la meilleure solution pour que la
     ligne de crédit soit mise à jour et pas oubliée ». C'est le seul champ de
     l'application qui devient faux sans que personne y touche, et compter sur la
     mémoire d'une correction de 348 € invisible à l'écran ne marchera pas.

     L'application projette donc l'amortissement depuis la dernière vérification,
     réclame la mise à jour au bout de trois mois, et propose le montant. Elle
     n'écrit rien d'office : un remboursement anticipé la démentirait. */

  const CREDIT = (verifieLe) => e => {
    e.etabs.find(x => x.id === 'e_bien').dettes = [
      { id: 'd_pret', libelle: 'Prêt immobilier', montant: 96000, initial: 120000,
        mensualite: 620, taux: 3.4, verifieLe },
    ];
  };

  test('un mois écoulé retire une part de capital', () => {
    Fixture.poser(CREDIT('2026-07-04'));
    auJour('2026-08-04', () => {
      const c = creditsEnCours().lignes[0];
      eq(c.moisDepuis, 1, 'un mois entier');
      /* 96 000 − (620 − 272) = 95 652 */
      pres(c.projete, 95652, 'la mensualité moins les intérêts du mois');
      pres(c.ecart, 348, 'soit la part de capital');
    });
  });

  test('un mois non échu ne se compte pas', () => {
    Fixture.poser(CREDIT('2026-07-20'));
    auJour('2026-08-04', () => {
      const c = creditsEnCours().lignes[0];
      eq(c.moisDepuis, 0, 'le 4 août, le mois commencé le 20 juillet n’est pas écoulé');
      eq(c.projete, null, 'donc rien à projeter');
    });
  });

  test('la projection suit l’amortissement, pas une règle de trois', () => {
    Fixture.poser(CREDIT('2026-02-04'));
    auJour('2026-08-04', () => {
      const c = creditsEnCours().lignes[0];
      eq(c.moisDepuis, 6, 'six mois');
      /* Six mensualités linéaires feraient 96 000 − 6 × 348 = 93 912. La vraie
         projection rembourse un peu plus chaque mois, puisque les intérêts
         baissent avec le capital : elle doit donc descendre plus bas. */
      vrai(c.projete < 93912, 'la part de capital monte à mesure que la dette baisse');
      vrai(c.projete > 93000, 'sans pour autant s’effondrer');
    });
  });

  test('sans mensualité ni date, aucune projection inventée', () => {
    Fixture.poser(e => {
      e.etabs.find(x => x.id === 'e_bien').dettes = [
        { id: 'd1', libelle: 'Marge', montant: 2000, verifieLe: '2025-01-01' },
      ];
    });
    auJour('2026-08-04', () => {
      const c = creditsEnCours().lignes[0];
      eq(c.projete, null, 'rien ne rembourse, rien ne se projette');
      eq(c.ecart, null);
    });
  });

  test('la cloche réclame la mise à jour, avec le montant', () => {
    Fixture.poser(CREDIT('2026-02-04'));
    auJour('2026-08-04', () => {
      const n = healthChecks().find(x => /Prêt immobilier/.test(x.title) && /jour/.test(x.title));
      vrai(n, 'une alerte existe après six mois');
      eq(n.level, 'action', 'c’est une saisie en attente, pas une erreur');
      vrai(/il devrait rester/.test(n.detail), 'et elle porte le montant projeté');
    });
  });

  test('elle se tait les trois premiers mois', () => {
    Fixture.poser(CREDIT('2026-07-04'));
    auJour('2026-08-04', () => {
      /* Le rappel de mise à jour, et lui seul : ce crédit porte une mensualité
         sans charge fixe rattachée, ce qui déclenche une autre alerte — celle
         d'une mensualité hors du budget. Elle est légitime, et vérifiée à part. */
      vrai(!healthChecks().some(x => /Prêt immobilier/.test(x.title) && /jour/.test(x.title)),
        'un mois d’écart ne mérite pas un rappel de mise à jour');
    });
  });

  test('un crédit sans date est signalé une fois', () => {
    Fixture.poser(CREDIT(null));
    auJour('2026-08-04', () => {
      const n = healthChecks().find(x => /jamais vérifié/.test(x.title));
      vrai(n, 'les crédits d’avant ce suivi se rattrapent');
      eq(n.level, 'action');
    });
  });
});

/* ------------------------------------------------------------------
   La charge fixe qui rembourse un crédit
   ------------------------------------------------------------------ */
suite('Une charge fixe rembourse un crédit, et la mensualité ne se saisit qu’une fois', () => {

  /* Idée du propriétaire : « je veux que le crédit se rembourse par la charge
     fixe quand c'est possible ». La mensualité était saisie deux fois — en charge
     fixe, parce que le budget doit la connaître, et sur le crédit, pour projeter
     l'amortissement. Deux endroits pour un fait, rien qui garantisse qu'ils
     s'accordent.

     La charge détient désormais le montant, le crédit le lit. Ce que ces
     contrôles interdisent : que le budget bouge en rattachant, que deux charges
     se partagent un crédit, et que le montant du crédit l'emporte sur celui de
     la charge. */

  const LIE = e => {
    e.etabs.find(x => x.id === 'e_bien').dettes = [
      { id: 'd_pret', libelle: 'Prêt immobilier', montant: 96000, initial: 120000,
        taux: 3.4, mensualite: 400, verifieLe: '2026-02-04' },
    ];
    e.budget.fixedCharges = [
      { label: 'Prêt maison', amount: 620, period: 'mois', creditId: 'd_pret' },
      { label: 'Internet', amount: 31, period: 'mois' },
    ];
  };

  test('la mensualité vient de la charge, pas du crédit', () => {
    Fixture.poser(LIE);
    const c = creditsEnCours().lignes[0];
    pres(c.mensualite, 620, 'celle de la charge fixe, et non les 400 notés sur le crédit');
    eq(c.charge.label, 'Prêt maison', 'et la ligne dit par quoi elle est remboursée');
  });

  test('rattacher ne change aucun total de budget', () => {
    /* Le budget somme ses charges, il ignore les crédits. Rattacher est une
       lecture de plus, jamais un montant de plus. */
    const sansLien = Fixture.poser(e => {
      LIE(e);
      e.budget.fixedCharges.forEach(c => { delete c.creditId; });
    });
    const avant = fixedTotal();
    Fixture.poser(LIE);
    pres(fixedTotal(), avant, 'les charges fixes valent la même chose, liées ou non');
    pres(fixedTotal(), 651, '620 de prêt + 31 d’internet');
    pres(budgetFrame().fixed, 651, 'et le cadre du budget aussi');
    vrai(sansLien.budget.fixedCharges.every(c => !c.creditId), 'le témoin est bien sans lien');
  });

  test('une charge annuelle rattachée se ramène au mois', () => {
    Fixture.poser(e => {
      LIE(e);
      e.budget.fixedCharges[0] = { label: 'Prêt', amount: 7440, period: 'an', creditId: 'd_pret' };
    });
    pres(creditsEnCours().lignes[0].mensualite, 620, '7 440 € par an font 620 € par mois');
  });

  test('deux charges ne peuvent pas rembourser le même crédit', () => {
    /* La liste de rattachement écarte les crédits déjà pris : sans cela, la
       mensualité lue dépendrait de l'ordre des charges. */
    Fixture.poser(LIE);
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible');
    vrai(/function creditsRattachables/.test(src), 'la liste est dérivée, pas écrite à la main');
    vrai(/pris\.has\(c\.id\)/.test(src), 'et elle écarte les crédits déjà rattachés');
  });

  test('la projection et le rappel suivent la charge', () => {
    Fixture.poser(LIE);
    auJour('2026-08-04', () => {
      const c = creditsEnCours().lignes[0];
      eq(c.moisDepuis, 6, 'six mois depuis la vérification');
      /* Avec 620 € et non 400 : la projection descend plus vite. */
      vrai(c.projete < 94000, 'la mensualité de la charge fait le remboursement');
      const n = healthChecks().find(x => /Prêt immobilier/.test(x.title) && /jour/.test(x.title));
      vrai(n, 'et la cloche réclame la mise à jour au bout de trois mois');
    });
  });

  test('sans charge rattachée, le crédit garde sa propre mensualité', () => {
    Fixture.poser(e => {
      LIE(e);
      e.budget.fixedCharges.forEach(c => { delete c.creditId; });
    });
    const c = creditsEnCours().lignes[0];
    pres(c.mensualite, 400, 'celle notée sur le crédit');
    eq(c.charge, null, 'et rien ne le rembourse');
  });
});

/* ------------------------------------------------------------------
   La charge fixe créée depuis le crédit
   ------------------------------------------------------------------ */
suite('Un crédit avec mensualité pose sa charge fixe', () => {

  /* « Je viens de créer un crédit avec mensualités et je ne le vois pas ici »,
     capture de l'onglet Charges fixes à l'appui. L'argent sortait tous les mois et
     le budget l'ignorait. La fenêtre du crédit porte donc une case, cochée
     d'avance, et la règle est celle du propriétaire : uniquement s'il y a une
     mensualité. */

  const CREDIT = (mensualite) => ({
    id: 'd_pret', libelle: 'Prêt immobilier', montant: 96000, mensualite,
    taux: 3.4, preteur: 'Crédit Agricole', verifieLe: '2026-08-04',
  });

  test('la charge naît avec le bon montant, et sous le bon nom', () => {
    Fixture.poser(e => {
      e.budget.fixedCharges = [];
      e.etabs.find(x => x.id === 'e_bien').dettes = [CREDIT(620)];
    });
    const d = etabById('e_bien').dettes[0];
    vrai(creerChargeDuCredit(d), 'la charge est créée');
    const ch = Store.state.budget.fixedCharges[0];
    eq(ch.label, 'Prêt immobilier', 'le nom du crédit');
    pres(ch.amount, 620, 'et sa mensualité');
    eq(ch.period, 'mois', 'mensuelle par construction');
    eq(ch.provider, 'Crédit Agricole', 'le prêteur devient l’organisme');
    eq(ch.creditId, 'd_pret', 'et elle sait quel crédit elle rembourse');
    pres(fixedTotal(), 620, 'le budget la connaît désormais');
  });

  test('la mensualité quitte le crédit : un seul porteur', () => {
    Fixture.poser(e => {
      e.budget.fixedCharges = [];
      e.etabs.find(x => x.id === 'e_bien').dettes = [CREDIT(620)];
    });
    const d = etabById('e_bien').dettes[0];
    creerChargeDuCredit(d);
    eq(d.mensualite, null, 'le champ du crédit est vidé');
    pres(creditsEnCours().lignes[0].mensualite, 620,
      'et la mensualité lue vient maintenant de la charge');
    eq(creditsEnCours().lignes[0].charge.label, 'Prêt immobilier');
  });

  test('sans mensualité, aucune charge n’est créée', () => {
    Fixture.poser(e => {
      e.budget.fixedCharges = [];
      e.etabs.find(x => x.id === 'e_bien').dettes = [CREDIT(null)];
    });
    const d = etabById('e_bien').dettes[0];
    vrai(!creerChargeDuCredit(d), 'rien à créer');
    eq(Store.state.budget.fixedCharges.length, 0, 'et le budget reste vide');
  });

  test('deux fois de suite ne crée pas deux charges', () => {
    Fixture.poser(e => {
      e.budget.fixedCharges = [];
      e.etabs.find(x => x.id === 'e_bien').dettes = [CREDIT(620)];
    });
    const d = etabById('e_bien').dettes[0];
    creerChargeDuCredit(d);
    d.mensualite = 620;                       // comme si on la ressaisissait
    vrai(!creerChargeDuCredit(d), 'une charge rembourse déjà ce crédit');
    eq(Store.state.budget.fixedCharges.length, 1, 'une seule ligne');
    pres(fixedTotal(), 620, 'et le budget ne double pas');
  });

  test('une mensualité hors du budget se signale', () => {
    Fixture.poser(e => {
      e.budget.fixedCharges = [];
      e.etabs.find(x => x.id === 'e_bien').dettes = [CREDIT(620)];
    });
    const n = healthChecks().find(x => /hors du budget/.test(x.title));
    vrai(n, 'l’alerte rattrape les crédits déclarés avant cette case');
    eq(n.level, 'action');
    creerChargeDuCredit(etabById('e_bien').dettes[0]);
    vrai(!healthChecks().some(x => /hors du budget/.test(x.title)),
      'et elle se tait dès que la charge existe');
  });
});

/* ------------------------------------------------------------------
   Les rentrées exceptionnelles
   ------------------------------------------------------------------ */
suite('Une rentrée exceptionnelle se garde en mémoire', () => {

  /* « Comment ajouter une source de revenu complémentaire ponctuelle ? genre
     j'ai eu 10 000 € de ma grand mère. » Aucun endroit n'était juste : les
     sources de revenus sont mensuelles, « Rentrée exceptionnelle » est une
     prévision sans date, et monter le solde d'un compte ne dit pas d'où vient
     l'argent.

     Ce que le journal doit tenir : la mémoire, et la distinction entre ce qu'on
     a mis de côté et ce qui est tombé du ciel. Un héritage n'est pas de
     l'épargne, et la moyenne mensuelle du patrimoine le comptait comme tel. */

  const RECU = e => {
    e.budget.apports = [
      { id: 'a1', libelle: 'Succession', montant: 10000, date: '2026-03-15', note: 'grand-mère' },
      { id: 'a2', libelle: 'Prime', montant: 1500, date: '2026-06-01', note: '' },
      { id: 'a3', libelle: 'Vente vélo', montant: 300, date: '2025-11-20', note: '' },
    ];
  };

  test('le journal se lit du plus récent au plus ancien', () => {
    Fixture.poser(RECU);
    const l = apportsTries();
    eq(l.map(a => a.libelle).join(' | '), 'Prime | Succession | Vente vélo', 'ordre affiché');
    /* L'index d'origine voyage avec la ligne : c'est lui qui sert à écrire, et le
       tri ne doit pas faire modifier la mauvaise rentrée. */
    eq(l[0].index, 1, 'la prime est en seconde position dans l’état');
    eq(Store.state.budget.apports[l[0].index].id, 'a2');
  });

  test('le total ne dépend pas de l’ordre, et se borne aux dates', () => {
    Fixture.poser(RECU);
    pres(apportsTotal(), 11800, '10 000 + 1 500 + 300');
    pres(apportsTotal('2026-01-01'), 11500, 'l’année 2026 seule');
    pres(apportsTotal('2026-01-01', '2026-05-31'), 10000, 'et le premier trimestre');
    pres(apportsTotal('2027-01-01'), 0, 'rien après');
  });

  test('un apport ne change aucun total de patrimoine', () => {
    /* Le journal dit l'origine de l'argent, il ne le crée pas : ces euros sont
       déjà sur les comptes. Additionner les deux les compterait deux fois. */
    const sans = Fixture.poser();
    const brutSans = patrimoine().brut;
    Fixture.poser(RECU);
    pres(patrimoine().brut, brutSans, 'le brut ne bouge pas');
    pres(patrimoine().net, brutSans - Fixture.DETTE, 'ni le net');
    pres(fixedTotal(), 0, 'et ce n’est pas une charge');
    vrai(!sans.budget.apports.length, 'le témoin est bien vide');
  });

  test('le rythme distingue l’épargne des apports', () => {
    Fixture.poser(e => {
      RECU(e);
      /* Deux relevés à deux mois d'écart, +12 000 € entre les deux, dont 10 000
         reçus en héritage : le rythme propre est de 1 000 € par mois, pas 6 000. */
      e.monthly = [
        { date: '2026-02-28', comment: '', v: { c_courant: 3000, c_livret: 2000, c_pea: 10500,
          c_cto: 750, c_immo: 120000, c_pe: 2000 } },
        { date: '2026-04-30', comment: '', v: { c_courant: 15000, c_livret: 2000, c_pea: 10500,
          c_cto: 750, c_immo: 120000, c_pe: 2000 } },
      ];
    });
    refreshAccounts();
    const st = statsRythme(monthlyPace().points);
    pres(st.apports, 10000, 'la succession tombe dans la fenêtre affichée');
    vrai(st.average > st.averageHorsApports,
      'la moyenne brute est plus flatteuse que le rythme propre');
    pres(st.average - st.averageHorsApports, st.apports / st.count,
      'et l’écart vaut exactement les apports répartis sur les points');
  });

  test('sans apport, la ligne n’existe pas', () => {
    Fixture.poser();
    const st = statsRythme(monthlyPace().points);
    pres(st.apports, 0, 'rien reçu');
    pres(st.averageHorsApports, st.average, 'les deux moyennes se confondent');
  });

  test('le champ est posé sur un état qui ne l’avait pas', () => {
    /* Migration : `budget.apports` arrive par la graine, comme les autres
       tableaux du budget. Un état d'avant ne doit pas planter à la lecture. */
    Fixture.poser(e => { delete e.budget.apports; });
    eq(Store.state.budget.apports, undefined, 'le fixture ne l’a pas');
    pres(apportsTotal(), 0, 'et le total vaut zéro sans exploser');
    vrai(Array.isArray(Store.state.budget.apports), 'APPORTS() l’a posé au passage');
  });
});

/* ------------------------------------------------------------------
   Un patrimoine net négatif
   ------------------------------------------------------------------ */
suite('Un patrimoine net négatif se dit, et ne se divise pas', () => {

  /* Le propriétaire a saisi un crédit de 121 000 € sans le bien qu'il finance : le
     net est passé à −90 541 €, et l'écran annonçait « −475,5 % » puis
     « −580,3 % ». Le montant était juste, les pourcentages n'avaient aucun sens.

     Deux règles en sont sorties. Un pourcentage de variation n'existe que sur une
     base positive et sans changement de signe — diviser par une base négative
     retourne le résultat, et une base qui traverse zéro rend le rapport
     arbitrairement grand. Et l'application nomme la cause la plus probable au
     lieu de laisser un chiffre effondré sans explication. */

  const GROS_CREDIT = e => {
    e.etabs.find(x => x.id === 'e_bien').dettes = [
      { id: 'd_maison', libelle: 'Crédit maison', montant: 400000, verifieLe: '2026-08-04' },
    ];
  };

  test('le net reste ce qu’il est, sans être maquillé', () => {
    Fixture.poser(GROS_CREDIT);
    pres(patrimoine().net, Fixture.BRUT - 400000, 'avoirs moins crédits, sans plancher à zéro');
    vrai(patrimoine().net < 0, 'et il est bien négatif');
    pres(patrimoine().brut, Fixture.BRUT, 'le brut ne bouge pas');
  });

  test('l’application nomme la cause probable', () => {
    /* Ce credit-ci est porte par l'etablissement qui tient le studio : il a donc
       un bien en face, et la cause probable n'est pas un oubli mais un achat
       finance a credit. Le detail de la distinction est teste dans « Un
       patrimoine net négatif a deux causes » ; ici on verifie seulement qu'une
       cause est nommee et qu'elle vise la bonne. */
    Fixture.poser(GROS_CREDIT);
    const n = healthChecks().find(x => /net négatif/.test(x.title));
    vrai(n, 'une alerte existe');
    vrai(/après un achat/.test(n.title), 'et elle nomme la cause');
    vrai(!/déclare ce bien/.test(n.detail),
      'sans demander de déclarer un bien qui l’est déjà');
  });

  test('un crédit sans bien en face garde le ton de l’erreur', () => {
    Fixture.poser(e => {
      GROS_CREDIT(e);
      /* Le meme montant, mais chez le courtier : plus rien en face. */
      e.etabs.find(x => x.id === 'e_bien').dettes = [];
      e.etabs.find(x => x.id === 'e_courtier').dettes = [
        { id: 'd_maison', libelle: 'Crédit maison', montant: 400000, verifieLe: '2026-08-04' },
      ];
    });
    const n = healthChecks().find(x => /net négatif/.test(x.title));
    vrai(n, 'une alerte existe');
    eq(n.level, 'error', 'c’est une incohérence, pas une simple information');
    vrai(/Crédit maison/.test(n.detail), 'elle nomme le crédit');
    vrai(/déclare ce bien/.test(n.detail), 'et dit quoi faire');
  });

  test('elle se tait quand le net est positif', () => {
    Fixture.poser();
    vrai(patrimoine().net > 0);
    vrai(!healthChecks().some(x => /net négatif/.test(x.title)), 'rien à signaler');
  });

  test('aucun pourcentage sur une base qui traverse zéro', () => {
    Fixture.poser(e => {
      GROS_CREDIT(e);
      /* Un relevé d'avant le crédit : la base est positive, le net d'aujourd'hui
         négatif. Le rapport n'aurait aucun sens. */
      e.monthly = [{ date: '2026-01-31', comment: '',
        v: { c_courant: 3000, c_livret: 2000, c_pea: 10500, c_cto: 750,
             c_immo: 120000, c_pe: 2000 } }];
    });
    refreshAccounts();
    const d = deltas();
    vrai(d.all, 'la variation existe');
    pres(d.all.eur, patrimoine().net - Fixture.BRUT, 'l’euro reste exact');
    eq(d.all.pct, null, 'mais le pourcentage se tait');
  });

  test('et aucun non plus sur une base négative', () => {
    Fixture.poser(e => {
      GROS_CREDIT(e);
      e.monthly = [{ date: '2026-01-31', comment: '', dettes: 400000,
        v: { c_courant: 100, c_livret: 0, c_pea: 0, c_cto: 0, c_immo: 0, c_pe: 0 } }];
    });
    refreshAccounts();
    eq(deltas().all.pct, null, 'diviser par une base négative retournerait le signe');
  });

  test('un pourcentage reste là où il a un sens', () => {
    Fixture.poser(e => {
      e.monthly = [{ date: '2026-01-31', comment: '',
        v: { c_courant: 1500, c_livret: 1000, c_pea: 5250, c_cto: 375,
             c_immo: 60000, c_pe: 1000 } }];
    });
    refreshAccounts();
    const d = deltas().all;
    vrai(d.pct != null, 'base positive, patrimoine positif : le rapport existe');
    vrai(d.pct > 0, 'et il monte');
  });
});

/* ------------------------------------------------------------------
   Sans titre coté, l'application se tait sur les cours
   ------------------------------------------------------------------ */
suite('Un patrimoine sans titre coté ne réclame pas de cours', () => {

  /* « Un mec qui fait quasi que du private equity, mon app ça le fait chier
     non ? » Oui : la cloche lui réclamait une actualisation des cours et
     l'avertissait que ses prix étaient vieux de trois cents jours, pour une
     fonction qu'il n'utilise pas. La cloche doit montrer ce qui est faux chez
     celui qui la regarde. */

  const QUE_DU_NON_COTE = e => {
    e.positions = [];
    e.quotes = {};
    /* Il reste le studio, le crowdfunding, le courant et le livret : un
       patrimoine complet, sans une seule ligne cotée. */
    e.comptes = e.comptes.filter(c => !['c_pea', 'c_cto'].includes(c.id));
  };

  test('aucune alerte de cours sans position', () => {
    Fixture.poser(QUE_DU_NON_COTE);
    const n = healthChecks();
    vrai(!n.some(x => /[Cc]ours/.test(x.title)),
      'ni « jamais actualisés », ni « vieux de tant de jours »');
    /* Et le patrimoine tient debout : ce n'est pas un état dégradé. */
    vrai(patrimoine().brut > 0, 'le patrimoine existe toujours');
    pres(patrimoine().brut, 5000 + 122000, 'liquidités + studio + crowdfunding');
  });

  test('l’alerte revient dès qu’une ligne cotée existe', () => {
    Fixture.poser(e => { QUE_DU_NON_COTE(e); e.quotes = {}; });
    Store.state.positions.push({ id: 'p1', name: 'ETF', symbol: 'IWDA', currency: 'EUR',
      qty: 1, buyPrice: 90, price: 90, fx: 1, account: 'c_courant',
      assetClass: 'actions', role: 'core' });
    vrai(healthChecks().some(x => /Cours jamais actualisés/.test(x.title)),
      'un titre coté sans cours mérite bien qu’on le signale');
  });

  test('le non coté compte dans tout le reste', () => {
    /* Ce qui doit rester vrai pour lui : sa répartition, son autonomie, son
       objectif. Le non coté n'est pas un citoyen de seconde classe. */
    Fixture.poser(QUE_DU_NON_COTE);
    const parts = repartitionClasses();
    pres(parts.reduce((s, x) => s + x.value, 0), patrimoine().brut,
      'la répartition de l’accueil couvre tout');
    const m = poches().mobilisable;
    pres(m.immediat + m.differe + m.lent + m.bloque, patrimoine().brut,
      'et les paliers d’autonomie aussi');
    pres(m.lent, 122000, 'le studio et le crowdfunding se vendent en quelques mois');
    pres(objectiveStatus().total, patrimoine().net, 'l’objectif porte sur le net');
  });
});

/* ------------------------------------------------------------------
   Ce qu'un bien locatif rapporte
   ------------------------------------------------------------------ */
suite('Un bien locatif dit son cash-flow et son rendement', () => {

  /* « Comment rendre cette app cool pour les investisseurs immo. » L'application
     savait qu'un studio vaut 120 000 € et qu'il reste tant à rembourser ; elle ne
     savait pas ce qu'il rapporte. Or un propriétaire vit sur le loyer moins la
     mensualité moins les charges, pas sur la valeur de son bien.

     Les pièces existaient, séparées : le loyer en source de revenus, la taxe
     foncière en charge fixe, la mensualité en crédit. Rien ne les reliait au
     logement. Le `bienId` fait le lien, comme le `creditId` avant lui. */

  const LOCATIF = e => {
    /* Le studio du fixture : 120 000 € de valeur, 110 000 € payés, 40 000 € de
       prêt sur son établissement. On lui rattache un loyer et deux charges. */
    e.budget.income = [
      { label: 'Salaire', amount: 3000 },
      { label: 'Loyer studio', amount: 700, bienId: 'c_immo' },
    ];
    e.budget.fixedCharges = [
      { label: 'Internet', amount: 31, period: 'mois' },
      { label: 'Taxe foncière', amount: 960, period: 'an', bienId: 'c_immo' },
      { label: 'Copropriété', amount: 60, period: 'mois', bienId: 'c_immo' },
    ];
    e.etabs.find(x => x.id === 'e_bien').dettes = [
      { id: 'd_pret', libelle: 'Prêt', montant: 40000, mensualite: 520,
        taux: 3, verifieLe: '2026-08-04' },
    ];
  };

  test('le cash-flow rassemble loyer, charges et mensualité', () => {
    Fixture.poser(LOCATIF);
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.loyers, 700, 'le loyer rattaché, et lui seul');
    pres(cf.charges, 140, '80 € de taxe foncière par mois + 60 € de copropriété');
    pres(cf.mensualite, 520, 'la mensualité du prêt de son établissement');
    pres(cf.cashFlow, 40, '700 − 140 − 520');
  });

  test('rien ne se mélange entre les biens et le reste', () => {
    Fixture.poser(LOCATIF);
    const cf = cashFlowBien(compteById('c_immo'));
    /* Le salaire et l'internet ne sont pas rattachés : ils ne doivent pas entrer
       dans le cash-flow du studio. Et le budget, lui, les compte tous. */
    pres(incomeTotal(), 3700, 'le budget somme toutes les sources');
    pres(fixedTotal(), 171, 'et toutes les charges, rattachées ou non');
    vrai(cf.loyers < incomeTotal(), 'le bien ne prend que ce qui le vise');
    const autre = cashFlowBien(compteById('c_pe'));
    pres(autre.loyers, 0, 'le crowdfunding n’a pas de loyer');
    pres(autre.charges, 0);
  });

  test('le rendement se calcule sur le prix payé, et le dit', () => {
    Fixture.poser(LOCATIF);
    const cf = cashFlowBien(compteById('c_immo'));
    vrai(cf.surAchat, 'le prix d’acquisition est connu');
    pres(cf.base, 110000, 'c’est lui qui sert de base');
    pres(cf.rendementBrut, 700 * 12 / 110000 * 100, 'loyer annuel sur prix payé');
    pres(cf.rendementNet, (700 - 140) * 12 / 110000 * 100, 'net de charges');
    /* Un rendement sur la valeur du jour serait plus flatteur ou plus sévère
       selon le marché : ce n'est pas le même chiffre, et la carte annonce lequel. */
    vrai(cf.rendementBrut !== 700 * 12 / 120000 * 100, 'et pas sur la valeur actuelle');
  });

  test('sans prix d’acquisition, la base est la valeur, et c’est dit', () => {
    Fixture.poser(e => {
      LOCATIF(e);
      e.comptes.find(c => c.id === 'c_immo').lignes[0].prixDeRevient = 0;
    });
    const cf = cashFlowBien(compteById('c_immo'));
    vrai(!cf.surAchat, 'le drapeau dit que la base a changé');
    pres(cf.base, 120000, 'faute de mieux, la valeur actuelle');
  });

  test('le rendement sur apport tient compte du levier', () => {
    /* La base est l'apport declare, et non le prix paye moins le capital restant
       du : ce dernier grossissait a chaque mensualite, et le rendement baissait
       tout seul pendant que l'operation s'ameliorait. */
    Fixture.poser(e => {
      LOCATIF(e);
      e.comptes.find(c => c.id === 'c_immo').apport = 25000;
    });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.apport, 25000, 'ce qui est sorti de la poche à l’achat');
    pres(cf.cashOnCash, 40 * 12 / 25000 * 100,
      'le cash-flow annuel sur ce qui est vraiment engagé');
  });

  test('sans prêt, le cash-flow monte de la mensualité entière', () => {
    Fixture.poser(e => {
      LOCATIF(e);
      e.etabs.find(x => x.id === 'e_bien').dettes = [];
    });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.mensualite, 0, 'aucune mensualité');
    pres(cf.cashFlow, 560, 'le cash-flow monte d’autant');
    eq(cf.capitalMois, null, 'et plus aucun capital ne se rembourse');
  });

  test('la liste des biens se dérive des types de compte', () => {
    Fixture.poser(LOCATIF);
    const ids = comptesBiens().map(c => c.id);
    eq(ids.join(','), 'c_immo', 'le studio, et pas le crowdfunding ni le PEA');
    /* Un type immobilier ajouté demain entre tout seul : la liste lit
       TYPES_COMPTE, elle ne se réécrit pas. */
    for (const t of TYPES_COMPTE.filter(x => x.bienImmo)) {
      vrai(['immo', 'scpi'].includes(t.id), `${t.label} est bien un type de bien`);
    }
    /* Le drapeau dit « est un bien », jamais « peut en porter ». La nuance
       n'existait pas, et « peut porter de l'immobilier » lui tenait lieu : le
       jour ou une assurance-vie accepte une SCPI, le contrat entier devenait un
       bien immobilier — vocabulaire compris, « Dans quel bien le ranger ? »
       pour un contrat d'assurance. */
    const porteurs = TYPES_COMPTE.filter(x => x.classes.includes('immobilier'));
    vrai(porteurs.length > 2,
      'une enveloppe peut porter de l’immobilier sans être un bien');
    for (const t of porteurs.filter(x => !x.bienImmo)) {
      vrai(!comptesBiens().some(c => c.type === t.id),
        `${t.label} porte de l’immobilier mais n’est pas un bien`);
      eq(contenantDuType(t.id).titre === 'Bien immobilier', false,
        `${t.label} ne demande pas « dans quel bien le ranger »`);
    }
  });
});

/* ------------------------------------------------------------------
   Les échéances du non coté
   ------------------------------------------------------------------ */
suite('Une échéance de crowdfunding se suit et se signale', () => {

  /* Un prêt participatif a une date de fin, un taux annoncé et un état : en
     cours, en retard, en défaut, remboursé. Le retard et le défaut sont la
     réalité de ce métier, et l'application n'avait aucun des trois champs. Elle
     ne pouvait ni dire « 3 200 € arrivent à échéance en mars », ni signaler une
     ligne qui a passé sa date sans rien verser.

     Le statut est déclaré, jamais déduit : un virement arrive souvent avec
     quelques jours de décalage, et peindre la ligne en rouge le lendemain de
     l'échéance crierait au loup à chaque fois. L'application signale, le
     détenteur tranche. */

  const PRETS = e => {
    e.comptes.find(c => c.id === 'c_pe').lignes = [
      { id: 'l1', classe: 'nonCote', libelle: 'Projet Bordeaux', valeur: 2000,
        prixDeRevient: 2000, taux: 9, echeance: '2026-11-30' },
      { id: 'l2', classe: 'nonCote', libelle: 'Projet Lille', valeur: 1500,
        prixDeRevient: 1500, taux: 10, echeance: '2026-05-31' },
      { id: 'l3', classe: 'nonCote', libelle: 'Projet Nantes', valeur: 800,
        prixDeRevient: 800, taux: 8, echeance: '2026-03-31', statut: 'retard' },
      { id: 'l4', classe: 'nonCote', libelle: 'Projet Rouen', valeur: 1200,
        prixDeRevient: 1200, echeance: '2025-12-31', statut: 'defaut' },
      { id: 'l5', classe: 'nonCote', libelle: 'Projet Reims', valeur: 0,
        prixDeRevient: 900, echeance: '2026-01-31', statut: 'rembourse' },
    ];
  };

  test('les échéances se lisent de la plus proche à la plus lointaine', () => {
    Fixture.poser(PRETS);
    auJour('2026-08-04', () => {
      const e = echeances();
      eq(e.map(x => x.libelle).join(' | '),
        'Projet Rouen | Projet Nantes | Projet Lille | Projet Bordeaux',
        'triées par date, et le remboursé est sorti');
      eq(e[0].index, 3, 'le rang dans le compte voyage avec la ligne');
    });
  });

  test('une date dépassée n’est pas un retard', () => {
    Fixture.poser(PRETS);
    auJour('2026-08-04', () => {
      const lille = echeances().find(x => x.libelle === 'Projet Lille');
      eq(lille.statut, 'encours', 'rien n’a été déclaré');
      vrai(lille.depassee, 'mais la date est derrière nous');
      eq(lille.jours, -65, 'soixante-cinq jours de retard sur le calendrier');
      const bordeaux = echeances().find(x => x.libelle === 'Projet Bordeaux');
      vrai(!bordeaux.depassee, 'celle de novembre est devant');
      vrai(bordeaux.jours > 0);
    });
  });

  test('la cloche distingue les trois situations', () => {
    Fixture.poser(PRETS);
    auJour('2026-08-04', () => {
      const n = healthChecks();
      const passee = n.find(x => /a passé son échéance/.test(x.title));
      vrai(passee, 'une date dépassée sans déclaration est une saisie en attente');
      eq(passee.level, 'action');
      const retard = n.find(x => /en retard/.test(x.title));
      eq(retard.level, 'warn', 'un retard déclaré mérite un œil');
      const defaut = n.find(x => /en défaut/.test(x.title));
      eq(defaut.level, 'error', 'un défaut est un chiffre faux que rien ne trahit');
      vrai(/baisse le montant/.test(defaut.detail), 'et il dit quoi faire');
    });
  });

  test('l’encours à problème se totalise', () => {
    Fixture.poser(PRETS);
    auJour('2026-08-04', () => {
      const p = encoursAProbleme();
      pres(p.retard, 800, 'Nantes');
      pres(p.defaut, 1200, 'Rouen');
      eq(p.depassees.length, 1, 'Lille, seule dépassée sans déclaration');
    });
  });

  test('ces lignes comptent toujours dans le patrimoine', () => {
    /* Un défaut garde sa valeur déclarée : l'application ne décide pas à la place
       du détenteur qu'un projet est perdu. Elle le lui dit, et c'est lui qui
       baisse le montant. */
    Fixture.poser(PRETS);
    const somme = 2000 + 1500 + 800 + 1200 + 0;
    pres(poches().classes.nonCote, somme, 'y compris le retard et le défaut');
    /* Les cinq lignes remplacent celle de 2 000 € du fixture : le non coté vaut
       donc 5 500 € et non 2 000, et le brut monte d'autant. */
    pres(patrimoine().brut, 5000 + 1500 + 9750 + 120000 + somme,
      'liquidités + cash du PEA + titres + studio + les cinq prêts');
  });

  test('un statut inconnu retombe sur « en cours »', () => {
    Fixture.poser(e => {
      PRETS(e);
      e.comptes.find(c => c.id === 'c_pe').lignes[0].statut = 'bizarre';
    });
    eq(statutLigne({ statut: 'bizarre' }), 'encours', 'aucun état inventé');
    eq(statutLigne({}), 'encours', 'ni pour une ligne sans statut');
  });
});

/* ------------------------------------------------------------------
   Un relevé porte sur un mois qui a eu lieu
   ------------------------------------------------------------------ */
suite('Un relevé porte sur un mois qui a eu lieu', () => {

  /* Le calendrier ouvre douze mois d'avance, et chaque ligne à venir portait le
     même bouton ⤒ que les autres. « Enregistrer décembre en août » écrivait la
     photo du jour dans un mois qui n'a pas eu lieu, et rien ne le rattrapait
     ensuite : la courbe reliait le point à ses voisins, l'écart mois par mois le
     comparait, l'alerte des trous le comptait comme rempli.

     Le jour se passe en argument : sans cela le contrôle ne pourrait vérifier
     qu'un seul côté de la frontière, celui où l'horloge se trouve. */

  test('le mois en cours est ouvert, le suivant non', () => {
    vrai(moisRevolu('2026-08-31', '2026-08-05'),
      'le mois en cours attend sa photo, c’est même sa raison d’exister');
    vrai(moisRevolu('2026-07-31', '2026-08-05'), 'et tous ceux d’avant');
    vrai(!moisRevolu('2026-09-30', '2026-08-05'), 'le mois suivant, non');
    vrai(!moisRevolu('2026-12-31', '2026-08-05'),
      'ni décembre depuis août : c’est le piège que tend un calendrier ouvert '
      + 'douze mois d’avance');
  });

  test('le dernier jour du mois ne fait pas basculer', () => {
    vrai(moisRevolu('2026-08-31', '2026-08-01'),
      'le 1er août, août est déjà ouvert : on compare des mois, pas des jours');
    vrai(!moisRevolu('2026-09-01', '2026-08-31'),
      'et le 31 août ne donne pas accès à septembre');
  });

  test('une année suivante ne passe pas pour un mois plus petit', () => {
    /* La comparaison est textuelle : '2027-01' contre '2026-12'. Un test sur les
       seuls numéros de mois aurait laissé passer janvier de l'année d'après. */
    vrai(!moisRevolu('2027-01-31', '2026-12-15'),
      'janvier 2027 vu de décembre 2026 est bien à venir');
    vrai(moisRevolu('2026-12-01', '2027-01-15'), 'et l’inverse est échu');
  });

  test('une ligne sans date ne se refuse pas', () => {
    vrai(moisRevolu('', '2026-08-05'),
      'une ligne sans date n’est pas un mois à venir : on ne la bloque pas');
    vrai(moisRevolu(null, '2026-08-05'), 'ni quand le champ manque');
  });
});

/* ------------------------------------------------------------------
   Une vente à découvert ne s'affiche pas gagnante
   ------------------------------------------------------------------ */
suite('Une vente à découvert ne s’affiche pas gagnante', () => {

  /* Un short porte une quantité négative, donc une valeur et un prix de revient
     négatifs : on a reçu l'argent en vendant, on le rendra en rachetant.
     `posPerfPct` divisait la performance par ce revient négatif, et le signe se
     retournait — 834 € de perte s'annonçaient « +83,43 % », en vert, à côté du
     « −834 € » en rouge de la même ligne. L'assertion qui manquait est celle-ci :
     le pourcentage et l'euro disent la même chose. */

  const short = (qte, revient, cours) => ({
    id: 'p_short', name: 'Titre vendu à découvert', isin: '', symbol: 'XXX',
    currency: 'EUR', qty: qte, buyPrice: revient, price: cours,
    fx: 1, fxBuy: 1, account: 'c_cto', assetClass: 'actions', role: 'satellite',
    manual: false,
  });

  test('le cours qui monte fait perdre, et le pourcentage le dit', () => {
    const p = short(-10, 100, 212);
    eq(round2(posInvested(p)), -1000, 'vendre 10 titres à 100 € encaisse 1 000 €');
    eq(round2(posValue(p)), -2120, 'les racheter à 212 € en coûte 2 120');
    eq(round2(posPerfEur(p)), -1120, 'donc 1 120 € de perte');
    vrai(posPerfPct(p) < 0,
      'et un pourcentage négatif : c’est le signe de l’euro qui commande');
    eq(round2(posPerfPct(p)), -112,
      'la base est ce qu’on a encaissé, en valeur absolue');
  });

  test('le cours qui baisse fait gagner', () => {
    const p = short(-10, 100, 60);
    eq(round2(posPerfEur(p)), 400, 'racheter à 60 € ce qu’on a vendu à 100 rapporte');
    eq(round2(posPerfPct(p)), 40, 'et le pourcentage suit, positif');
  });

  test('une position longue ne change pas de valeur', () => {
    /* La correction ne doit toucher que le short : pour un revient positif,
       `perf / revient` vaut exactement l'ancien `valeur / revient - 1`. */
    for (const [qte, revient, cours, attendu] of [
      [10, 100, 120, 20], [10, 100, 80, -20], [3, 604, 587.94, -2.66], [1, 50, 50, 0],
    ]) {
      const p = short(qte, revient, cours);
      eq(round2(posPerfPct(p)), attendu,
        `${qte} × ${revient} € valant ${cours} € fait ${attendu} %`);
    }
  });

  test('sans prix de revient, aucun pourcentage inventé', () => {
    eq(posPerfPct(short(-10, 0, 212)), 0,
      'diviser par zéro ne donne pas un pourcentage, il n’y a pas de base');
  });
});

/* ------------------------------------------------------------------
   Un compte dit chez qui il est
   ------------------------------------------------------------------ */
suite('Un compte dit chez qui il est', () => {

  /* Un compte porte exactement un établissement, donc ce fait existe toujours,
     et il s'affiche partout où le nom du compte s'affiche : la fenêtre d'un
     relevé, les colonnes du tableau. Un compte sans nom propre n'avait que le
     libellé de son type pour se nommer — « Livret » ne dit ni lequel ni chez
     qui, et une assurance-vie de 80 000 € est apparue sous ce mot-là. */

  test('la projection porte l’établissement de chaque compte', () => {
    Fixture.poser();
    eq(ACC['c_livret'].broker, 'Banque', 'le livret est tenu par la Banque');
    eq(ACC['c_pea'].broker, 'Courtier', 'le PEA par le Courtier');
    eq(ACC['c_immo'].broker, 'Studio', 'et un bien porte le nom du bien');
    for (const c of Store.state.comptes) {
      eq(typeof ACC[c.id].broker, 'string',
        `${c.id} doit porter un établissement, quitte à ce qu’il soit vide`);
    }
  });

  test('un compte sans nom prend le libellé de son type, et garde sa banque', () => {
    Fixture.poser(e => {
      e.comptes.push({ id: 'c_av', etabId: 'e_banque', type: 'av', statut: 'ouvert',
        ouvertLe: '', numero: '', notes: '', libelle: '', court: '', alloc: '',
        cash: [{ montant: 80000, affectation: 'precaution' }], lignes: [] });
    });
    eq(ACC['c_av'].label, 'Assurance-vie',
      'le type nomme le compte à défaut de nom propre');
    eq(ACC['c_av'].broker, 'Banque',
      'et l’établissement le distingue d’un autre contrat du même type');
  });

  test('l’établissement s’affiche même quand le nom le répète', () => {
    /* Il a d’abord été masqué dans ce cas, pour éviter « Plateforme ·
       Plateforme ». Tranché en sens inverse le 5 août 2026 : dans une liste de
       douze champs, un blanc ne dit pas s’il signifie « pas d’établissement »
       ou « déjà écrit dans le nom », et la règle cessait d’être lisible depuis
       l’écran, le seul endroit où elle compte. */
    Fixture.poser(e => {
      e.comptes.find(c => c.id === 'c_livret').libelle = 'Livret A Banque';
    });
    eq(ACC['c_livret'].label, 'Livret A Banque', 'le nom reste celui du compte');
    eq(ACC['c_livret'].broker, 'Banque',
      'et la banque reste nommée, même si le nom du compte la porte déjà');
  });
});

/* ------------------------------------------------------------------
   La vue des comptes suit sa source
   ------------------------------------------------------------------ */
suite('La vue des comptes suit sa source', () => {

  /* `ACCOUNTS` est une projection de `comptes` : le nom, le type, la poche.
     Huit endroits appelaient `refreshAccounts()` avant d'enregistrer, deux
     l'oubliaient — « Modifier le compte » et le menu de type. Une assurance-vie
     renommée s'affichait donc sous son ancien nom et son ancien type jusqu'au
     prochain rechargement de la page, et comptait dans l'ancienne poche. */

  test('renommer et retyper un compte change ce qui s’affiche', () => {
    Fixture.poser();
    eq(ACC['c_livret'].group, 'cash', 'un livret compte dans la poche cash');
    vrai(!ACC['c_livret'].holdings, 'et ne porte pas de titres');

    const c = Store.state.comptes.find(x => x.id === 'c_livret');
    c.libelle = 'MON CONTRAT';
    c.type = 'av';
    refreshAccounts();

    eq(ACC['c_livret'].label, 'MON CONTRAT', 'le nom suit');
    eq(ACC['c_livret'].type, 'av', 'le type aussi');
    eq(ACC['c_livret'].group, 'bourse', 'et la poche qui en découle');
    vrai(ACC['c_livret'].holdings, 'une assurance-vie peut porter des titres');
    eq(ACC['c_livret'].broker, 'Banque', 'la banque ne change pas pour autant');
  });

  test('Store.save() refait la projection', () => {
    /* Aucun test n’appelle `Store.save()` : elle écrit dans `localStorage`, que
       le harnais ne touche jamais. Le contrôle porte donc sur le source. C’est
       exactement l’assertion qui manquait : la règle ne vit pas dans un calcul
       qu’on peut interroger, elle vit dans l’ordre des appels. */
    const src = lireSource('assets/store.js');
    vrai(src, 'le source doit être lisible');
    const debut = src.indexOf('  save(opts = {}) {');
    vrai(debut > 0, 'save() doit être trouvable');
    /* La fenêtre s’arrête au membre suivant, pas à un nombre de caractères :
       une borne en longueur se serait cassée à la première ligne de
       commentaire ajoutée dans la méthode. */
    const fin = src.indexOf('canUndo()', debut);
    vrai(fin > debut, 'canUndo() doit suivre save()');
    const corps = src.slice(debut, fin);
    vrai(corps.includes('localStorage.setItem'),
      'la fenêtre doit bien contenir le corps de save(), sinon elle ne prouve rien');
    vrai(corps.includes('refreshAccounts()'),
      'sans cet appel, renommer un compte ou changer son type ne se voit qu’au '
      + 'prochain rechargement de la page');
  });
});

/* ------------------------------------------------------------------
   Les classes posées par le JavaScript existent dans la feuille
   ------------------------------------------------------------------ */
suite('Les classes posées par le JavaScript existent', () => {

  /* Trois fois la même erreur en une journée : un nom de classe inventé au
     moment d'écrire le balisage et jamais défini. « legende » pour « legend »,
     et la légende s'est affichée sans puces ni couleurs. « btn bloc » pour un
     bouton pleine largeur qui est resté à sa taille. Rien ne casse, rien ne
     s'affiche en rouge : l'élément est simplement rendu nu.

     On ne peut pas tout vérifier — beaucoup de classes se composent en
     gabarit, et certaines n'ont légitimement pas de style. Celles de ce lot
     sont épinglées, dans les deux sens : définie dans la feuille, et posée
     quelque part dans le JavaScript. Une règle morte est l'autre moitié du
     même défaut. */

  test('définies dans styles.css, et posées dans app.js', () => {
    const css = lireSource('assets/styles.css');
    const js = lireSource('assets/app.js');
    vrai(css && js, 'les deux sources doivent être lisibles');
    const paires = [
      ['.toast-action', 'toast-action'],
      ['.f-etab',       'f-etab'],
      ['.avert',        'class="avert"'],
      ['.th-etab',      'th-etab'],
      ['.f-etab',        'f-etab'],
      ['.champ-lecture', 'champ-lecture'],
      ['.lien-nu',       'lien-nu'],
      ['.btn.pleine',   'btn pleine'],
      ['.snap-avenir',  'snap-avenir'],
    ];
    for (const [enCss, enJs] of paires) {
      vrai(css.includes(enCss), `${enCss} doit être définie dans styles.css`);
      vrai(js.includes(enJs), `${enCss} doit être posée quelque part dans app.js`);
    }
  });

  test('aucun pan de la feuille n’est écrit deux fois', () => {
    /* Trois copies mortes trouvées le 5 août dans la même région de la feuille :
       un pan de 68 lignes, un autre de 31, et le bloc `.snap` que le fichier
       signalait déjà. Le commentaire d'une règle voisine le disait sans le
       chercher — « ces règles étaient dupliquées à l'identique un peu plus
       haut » — donc c'est arrivé au moins deux fois.

       Ça ne se voit pas à l'écran : les copies sont identiques, la dernière
       gagne, tout s'affiche juste. Ça se voit le jour où l'on retouche une des
       deux. Une règle corrigée dans la copie du haut n'a aucun effet, et on
       cherche ailleurs.

       Le seuil : la plus longue répétition légitime du fichier fait 4 lignes
       (deux blocs de mise en page qui partagent trois déclarations). Six laisse
       cette marge et attrape tout ce qui ressemble à un collage. */
    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    const lignes = css.split('\n').map(s => s.trimEnd());
    const vus = new Map();
    let pire = null;
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (!l.trim()) continue;
      if (!vus.has(l)) { vus.set(l, i); continue; }
      const a = vus.get(l);
      let n = 0;
      while (i + n < lignes.length && lignes[a + n] === lignes[i + n]) n++;
      if (!pire || n > pire.n) pire = { n, a: a + 1, b: i + 1, texte: l.trim().slice(0, 70) };
    }
    vrai(!pire || pire.n < 6,
      pire && `${pire.n} lignes identiques aux lignes ${pire.a} et ${pire.b} : « ${pire.texte} ». `
      + 'Une des deux copies est morte, et c’est celle du haut, puisque la dernière gagne.');
  });
});

/* ------------------------------------------------------------------
   Une animation ne laisse pas sa trace, et elle joue là où on la touche
   ------------------------------------------------------------------ */
suite('Une plus-value se calcule dans une seule monnaie', () => {

  /* Le défaut : un titre acheté au cours du jour annonçait une perte de 12,86 %.
     La valeur recevait le change (10 × 69,00 $ × 0,8662 = 597,67 €), le prix de
     revient non (10 × 68,59 = 685,90, des dollars comptés en euros), et l'écart
     entre les deux se lisait comme une moins-value. Signalé par le propriétaire le
     5 août 2026 sur une ligne Uber, et déjà vrai sur sa ligne Gold.

     La cause : la création d'une ligne posait `fxBuy: 1` en dur, avant qu'on sache
     de quel titre il s'agit. La devise arrivait ensuite, `fx` était mis à jour, et
     ce 1 restait. Un total qui n'égale pas la somme de ses parts, une fois de plus,
     et invisible : les deux nombres étaient justes, dans deux monnaies. */

  const ligne = (extra = {}) => ({
    id: 'pTest', name: 'Test', currency: 'USD', qty: 10,
    buyPrice: 68.59, price: 69, fx: 0.8662, manual: false, ...extra,
  });

  test('un prix de revient en devise passe par le change', () => {
    const p = ligne({ fxBuy: 0.8662 });
    pres(posInvested(p), 10 * 68.59 * 0.8662, 'l’investi se convertit');
    pres(posValue(p), 10 * 69 * 0.8662, 'la valeur aussi');
    /* Les deux dans la même monnaie : l'écart est celui des cours, 41 centimes de
       dollar par titre, et non la conversion de 685,90 $. */
    pres(posPerfEur(p), 10 * (69 - 68.59) * 0.8662, 'et l’écart ne porte que les cours');
    vrai(Math.abs(posPerfPct(p)) < 1,
      `un achat au cours du jour ne perd pas 12 % : ${posPerfPct(p).toFixed(2)} %`);
  });

  test('le 1 d’une ligne en devise n’est pas un taux', () => {
    /* C'est l'assertion qui manquait. `fxBuy: 1` sur une ligne en dollars ne peut
       venir que de la valeur par défaut jamais remplacée : le retenir compte des
       dollars comme des euros. */
    const casse = ligne({ fxBuy: 1 });
    const sain = ligne({ fxBuy: 0.8662 });
    pres(posInvested(casse), posInvested(sain),
      'un fxBuy de 1 sur une ligne en devise doit céder au taux courant');
    vrai(Math.abs(posPerfPct(casse)) < 1,
      `et la ligne ne doit plus annoncer de perte de change : ${posPerfPct(casse).toFixed(2)} %`);

    /* Sans aucun taux d'achat, même règle. */
    pres(posInvested(ligne({ fxBuy: null })), posInvested(sain),
      'un taux d’achat absent prend le taux courant');

    /* Une ligne en euros, elle, vaut 1 par sa devise et non par son champ. */
    const euro = ligne({ currency: 'EUR', fx: 1, fxBuy: null, buyPrice: 10, price: 11, qty: 100 });
    pres(posInvested(euro), 1000, 'une ligne en euros ne se convertit pas');
    pres(posPerfEur(euro), 100, 'et sa plus-value est celle des cours');
  });

  test('un taux d’achat réel est respecté, lui', () => {
    /* La garde ne doit pas manger un vrai taux : sinon le prix de revient
       suivrait l'euro/dollar du jour et la plus-value d'une ligne qu'on n'a pas
       touchée changerait toute seule. */
    const p = ligne({ fxBuy: 0.879, fx: 0.8662 });
    pres(posInvested(p), 10 * 68.59 * 0.879,
      'le taux du jour de l’achat sert, pas celui d’aujourd’hui');
  });

  test('la migration vide un taux d’achat qui vaut 1 en devise', () => {
    const etat = {
      positions: [
        { id: 'a', currency: 'USD', fx: 0.8662, fxBuy: 1 },
        { id: 'b', currency: 'USD', fx: 0.8662, fxBuy: 0.879 },
        { id: 'c', currency: 'EUR', fx: 1, fxBuy: 1 },
      ],
    };
    const migrer = s => {
      for (const p of s.positions) {
        if (p.fxBuy === undefined) p.fxBuy = num(p.fx) || null;
        if ((p.currency || 'EUR') !== 'EUR' && num(p.fxBuy) === 1) p.fxBuy = null;
      }
    };
    migrer(etat);
    eq(etat.positions[0].fxBuy, null, 'le 1 en devise part');
    eq(etat.positions[1].fxBuy, 0.879, 'un vrai taux reste');
    eq(etat.positions[2].fxBuy, 1, 'le 1 d’une ligne en euros est légitime');
    /* Idempotence : la rejouer ne change rien. */
    const avant = JSON.stringify(etat);
    migrer(etat);
    eq(JSON.stringify(etat), avant, 'jouée deux fois, elle donne le même état');
  });

  test('la source dit la même règle que ces contrôles', () => {
    /* Trois endroits calculaient le prix de revient converti, avec trois copies de
       la même formule : la plus-value latente, l'aperçu d'une vente et la vente
       enregistrée. Deux d'entre elles gardaient le `|| 1`. Une seule fonction
       désormais, et ce contrôle refuse le retour des copies. */
    const src = lireSource('assets/store.js');
    vrai(src, 'le source doit être lisible');
    const copies = [...src.matchAll(/num\(p\.fxBuy\)\s*\|\|/g)];
    eq(copies.length, 0,
      'le taux d’achat se lit par tauxAchat() et nulle part à la main : '
      + `${copies.length} copie(s) de la formule subsiste(nt)`);
    vrai(/function tauxAchat/.test(src), 'tauxAchat() doit exister');

    /* Et la création d'une ligne ne fige plus 1. */
    const js = lireSource('assets/app.js') || '';
    vrai(!/fx:\s*1,\s*fxBuy:\s*1/.test(js),
      'la création d’une ligne ne doit plus poser fxBuy: 1 : la devise n’est pas '
      + 'encore choisie à ce moment-là');
  });
});

suite('Les animations s’éteignent, et se déclenchent au doigt', () => {

  /* Le bloc d'une règle CSS, accolades équilibrées. Une recherche de la première
     accolade fermante suffit pour une règle plate, pas pour un `@media` ni pour
     un `@keyframes`, dont le corps en contient d'autres. */
  function blocDe(css, depuis) {
    const ouvre = css.indexOf('{', depuis);
    if (ouvre < 0) return '';
    let n = 0;
    for (let i = ouvre; i < css.length; i++) {
      if (css[i] === '{') n++;
      else if (css[i] === '}' && --n === 0) return css.slice(ouvre + 1, i);
    }
    return css.slice(ouvre + 1);
  }

  test('un lavis qui finit transparent est éteint au repos', () => {
    /* Le défaut, signalé trois fois avant d'être compris. Le patrimoine de la
       barre latérale portait un aplat violet qui ne s'éteignait plus. On l'a pris
       pour une sélection de texte, puis pour un survol collé, et deux correctifs
       ont visé à côté. C'était le lavis de « valeur mise à jour » :
       `valeur-lavis` finit à `opacity: 0`, mais une animation sans `fill-mode`
       rend à l'élément la valeur de sa règle dès qu'elle s'achève — donc 1,
       l'opacité par défaut. Mesuré sur place : animation terminée, opacité du
       pseudo-élément à 1. La classe `valeur-maj` n'étant jamais retirée, l'aplat
       restait peint pour toujours.

       Le contrôle ne nomme pas `valeur-lavis` : il dérive la liste des animations
       concernées des `@keyframes` eux-mêmes — celles qui commencent et finissent
       transparentes, donc celles qui sont censées passer et non arriver. Le
       prochain lavis écrit de la même façon sera pris sans qu'on y pense. */
    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    const nu = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const passagers = [];
    for (const m of nu.matchAll(/@keyframes\s+([\w-]+)/g)) {
      const corps = blocDe(nu, m.index + m[0].length);
      const etapes = [...corps.matchAll(/(from|to|[\d.]+%)\s*\{([^}]*)\}/g)];
      if (!etapes.length) continue;
      const eteint = e => /opacity:\s*0\b/.test(e[2]);
      const premier = etapes[0], dernier = etapes[etapes.length - 1];
      const finit = /^(to|100%)$/.test(dernier[1].trim()) && eteint(dernier);
      const part = /^(from|0%)$/.test(premier[1].trim()) && eteint(premier);
      if (finit && part) passagers.push(m[1]);
    }
    vrai(passagers.length,
      'le contrôle doit trouver au moins une animation passagère, sinon il ne '
      + 'vérifie rien : valeur-lavis en est une');

    for (const nom of passagers) {
      /* Toutes les règles qui appellent cette animation, `@media` comprises. */
      const appels = [...nu.matchAll(new RegExp('animation(-name)?:[^;}]*\\b' + nom + '\\b[^;}]*', 'g'))];
      vrai(appels.length, `${nom} est déclarée et jamais utilisée`);
      for (const appel of appels) {
        /* La règle qui contient l'appel : on remonte à l'accolade ouvrante qui
           la précède, et on lit jusqu'à la fermante. */
        const ouvre = nu.lastIndexOf('{', appel.index);
        const regle = nu.slice(ouvre + 1, nu.indexOf('}', appel.index));
        const tenue = /\b(forwards|both)\b/.test(appel[0]);
        vrai(tenue || /opacity:\s*0\b/.test(regle),
          `${nom} commence et finit transparente, donc elle passe : sa règle doit `
          + `porter « opacity: 0 » au repos, ou « forwards ». Sans l’un des deux, `
          + `la fin de l’animation rend l’opacité de la règle — 1 — et le lavis `
          + `reste peint pour toujours`);
      }
    }
  });

  
  test('le fond gelé couvre l’écran, d’où qu’on ouvre', () => {
    /* Deuxième moitié d'un défaut dont la première a déjà été corrigée. Geler la
       page met le corps en `position: fixed; top: -Ypx` — mais
       `html, body { height: 100% }` lui donne la hauteur de l'écran, pas celle de
       la page. Décalé, il ne couvre alors que de −Y à (écran − Y), et sous cette
       limite plus rien n'est peint : le voile de la fenêtre, noir à 55 % et flouté,
       se pose sur du vide. « En bas c'est tout noir, on voit pas en flou l'écran de
       derrière. » Mesuré depuis un défilement de 700 px : 700 px d'écran nus sur 812.

       Le premier correctif avait retiré un `overflow: hidden`, en le croyant seul
       coupable. Il l'était pour le cas `top: 0`, pas pour celui-ci. D'où ce
       contrôle, qui porte sur la hauteur et non sur l'overflow. */
    const js = lireSource('assets/app.js');
    vrai(js, 'assets/app.js doit être lisible pour ce contrôle');
    const debut = js.indexOf('function gelerFond');
    const gel = js.slice(debut, js.indexOf('function degelerFond'));
    vrai(/style\.height\s*=\s*`\$\{window\.innerHeight \+ fondGele\}px`/.test(gel),
      'le gel doit rendre au corps une hauteur qui additionne l’écran et le '
      + 'décalage, sinon la zone visible n’est pas couverte');
    vrai(!/overflow/.test(gel.replace(/\/\*[\s\S]*?\*\//g, '')),
      'et toujours pas d’overflow : c’est le positionnement qui gèle, pas le rognage');
    const degel = js.slice(js.indexOf('function degelerFond'), js.indexOf('function montrerModal'));
    vrai(/style\.height\s*=\s*''/.test(degel),
      'et le dégel doit la retirer, sinon la page reste bornée à un écran');
  });

  test('une ligne qui ouvre sa fenêtre ne porte pas de champ', () => {
    /* Deux tableaux du bureau ouvrent une fenêtre au clic sur la ligne : les mois
       de dépenses, puis les charges fixes. Le second éditait ses cases en place,
       et le propriétaire a tranché le 5 août 2026 : « je veux que ça fonctionne comme
       le tableau depenses du mois ».

       L'invariant est le même dans les deux sens. Un champ dans une ligne
       cliquable ne se laisse pas remplir — le clic part à la fenêtre avant
       d'arriver au champ — et il ouvrirait une deuxième surface d'édition pour un
       sous-ensemble des champs, celle qui perd toujours puisqu'elle ne peut pas
       tout dire. Ici, ni le rattachement à un crédit ni celui à un bien n'ont de
       colonne.

       Le contrôle se dérive du balisage : toute ligne portant la classe est
       vérifiée, y compris celle que quelqu'un ajoutera demain. */
    const js = lireSource('assets/app.js');
    vrai(js, 'assets/app.js doit être lisible pour ce contrôle');
    const lignes = [...js.matchAll(/class="ligne-ouvre/g)];
    vrai(lignes.length >= 2,
      'les deux tableaux du bureau doivent partager cette classe : les mois de '
      + 'dépenses et les charges fixes');
    for (const m of lignes) {
      const fin = js.indexOf('</tr>', m.index);
      vrai(fin > m.index, 'la ligne doit se fermer');
      const corps = js.slice(m.index, fin);
      vrai(!/data-path=/.test(corps),
        'une ligne qui ouvre une fenêtre ne peut pas contenir de champ lié : le clic '
        + 'ouvrirait la fenêtre au lieu de laisser saisir, et la même donnée aurait '
        + 'deux surfaces d’édition');
      vrai(/data-action="[a-z-]+"/.test(corps),
        'et elle doit dire quelle fenêtre elle ouvre');
    }
    /* La classe existe dans la feuille, sinon rien ne signale qu'on peut cliquer. */
    const css = lireSource('assets/styles.css') || '';
    vrai(/tr\.ligne-ouvre\s*\{[^}]*cursor:\s*pointer/.test(css),
      'la feuille doit donner le curseur du clic à ces lignes : une affordance qu’on '
      + 'ne voit pas n’existe pas');
  });

  test('un bandeau d’établissement ne se translate pas, il se gare plus haut', () => {
    /* « Énorme bug en défilant comptes vers le bas sur mobile, les titres de
       banque disparaissent. » Toutes les bandes étaient vides, sur toutes les
       cartes.

       La cause tenait à ce que deux choses de natures différentes partageaient
       une règle. Les sous-onglets sont une bande unique, en haut de l'écran,
       toujours collée : quand la barre du haut se retire, la translater est
       exactement ce qu'il faut. Les bandeaux d'établissement sont six, chacun
       dans sa carte, et la plupart sont encore dans le flux de leur groupe
       pendant que la barre se retire. Les translater tous de 54 px sortait chaque
       titre de sa carte.

       Et `.cpt-groupe` porte `overflow: clip` : le titre ne réapparaissait donc
       même pas au-dessus de la carte précédente, il était découpé. La bande
       restait, vide, parce que la place d'un élément collé reste dans le flux.
       C'est ce qui a rendu le défaut si spectaculaire — et si difficile à lire,
       puisqu'il ne restait rien à voir.

       Ce qui doit suivre la barre n'est pas le bandeau, c'est l'endroit où il se
       gare : `top`, jamais `transform`. Hors collage, `top` ne fait rien du tout,
       et c'est la garantie qui manquait. Mesuré : garé à 107 px, 53 px quand la
       barre est retirée, et dans sa carte dans les deux cas. */
    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    const nu = css.replace(/\/\*[\s\S]*?\*\//g, '');

    /* Aucune regle de retrait ne doit translater le bandeau. On cherche le
       selecteur dans les regles qui portent une translation, plutot qu'un
       exemplaire precis du texte : c'est la propriete qui est interdite ici, pas
       une ligne. */
    for (const m of nu.matchAll(/([^{}]*)\{([^}]*translate3d[^}]*)\}/g)) {
      vrai(!/\.cpt-gtitre/.test(m[1]),
        'le bandeau d’établissement ne doit apparaître dans aucune règle qui '
        + `translate : « ${m[1].trim().slice(0, 80)} ». Ses cartes sont en `
        + '« overflow: clip », le titre en sortirait découpé');
    }

    /* Et il doit bien suivre la barre, par sa position de collage. Sans cette
       moitie, on aurait un bandeau qui ne disparaît plus mais qui laisse 54 px de
       vide entre lui et les sous-onglets remontes. */
    vrai(/body\.haut-cache[^{]*\.cpt-gtitre\s*\{[^}]*top:/.test(nu),
      'le retrait de la barre doit remonter l’endroit où le bandeau se gare');
    vrai(/body\.haut-cache[^{]*\.cpt-gtitre\s*\{[^}]*var\(--h-barre-dessin\)/.test(nu),
      'et de la hauteur de dessin de la barre, pas d’un nombre écrit à la main : '
      + 'c’est ce qui laisse l’encoche par construction');
  });

  test('deux bandes collantes ne se posent pas à la même hauteur', () => {
    /* Le bandeau d'un établissement recouvrait la navigation de la page. Les deux
       sont collants sur téléphone, les deux portaient `top: calc(54px + …)` — la
       même valeur, écrite à deux endroits sans que rien ne les relie — et le
       bandeau gagnait par son z-index. Mesuré au défilement : sous-onglets sur la
       bande [54, 107], bandeau sur [54, 116].

       Le contrôle porte sur la cause et non sur le symptôme : la hauteur de la
       barre du haut était recopiée dans quatre règles indépendantes. Elle se
       déclare maintenant une fois, et ce test refuse qu'un `top` de bande
       collante reparte d'un nombre écrit à la main. */
    const css = (lireSource('assets/styles.css') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');

    for (const nom of ['--h-barre', '--h-sous-onglets']) {
      const decl = css.indexOf(nom + ':');
      vrai(decl > 0, `${nom} doit être déclarée`);
      vrai(decl < css.indexOf('@media'),
        `${nom} doit vivre hors de toute requête média : une variable posée sous un `
        + 'point de rupture ne vaut rien pour les règles écrites sous un autre');
    }
    /* Ce qui est interdit, c'est le nombre magique : la hauteur de la barre
       additionnée à l'encoche, écrite à la main. Le `padding-top` interne de la
       barre, lui, ajoute légitimement l'encoche à son propre retrait — il décale
       un contenu, il ne redit pas une hauteur. */
    /* La déclaration de `--h-barre` est le seul endroit qui a le droit de porter
       ce nombre : c'est elle qui le définit. On la retire avant de chercher. */
    const recopies = [...css.replace(/--h-barre:[^;]+;/g, '')
      .matchAll(/calc\(\s*(\d+)px\s*\+\s*env\(safe-area-inset-top/g)]
      .map(m => m[1]).filter(px => px !== '8');
    eq(recopies.join(', '), '',
      'la hauteur de la barre du haut ne se recopie plus : elle vient de --h-barre, '
      + 'sinon deux règles finissent par la dire différemment');

    /* Le bandeau se pose sous les sous-onglets, donc son décalage additionne les
       deux bandes. Le lire en toutes lettres est la seule façon de vérifier qu'il
       ne repart pas de la seule barre du haut, comme avant. */
    const banderole = css.match(/\.cpt-gtitre\s*\{[^}]*top:\s*([^;]+);/);
    const empile = css.match(/:has\(\.sous-onglets\)\s*\.cpt-gtitre\s*\{\s*top:\s*([^;]+);/);
    vrai(empile, 'une règle doit décaler le bandeau quand la page porte des sous-onglets');
    vrai(/var\(--h-barre\)/.test(empile[1]) && /var\(--h-sous-onglets\)/.test(empile[1]),
      'et ce décalage additionne les deux bandes : la barre du haut plus les '
      + 'sous-onglets, sinon le bandeau se recolle sur la navigation');
    vrai(banderole, 'le bandeau doit garder un collage par défaut, hors téléphone');

    /* `--h-colle` et non `--h-barre` : la barre du haut se retire au défilement,
       et les collants doivent remonter avec elle. Une valeur figée à sa hauteur
       laisserait une bande vide de 54 px au-dessus des sous-onglets dès qu'elle
       est partie. La variable a donc deux états, et un seul endroit les dit. */
    /* Retirée, la barre ne parcourt que son dessin, jamais sa hauteur totale :
       l'encoche reste. C'est structurel depuis que la course vaut
       `--h-barre-dessin` — un décalage exprimé sur `--h-barre` remonterait les
       sous-onglets sous l'heure et la caméra, ce qui est arrivé. */
    const course = css.match(/body\.haut-cache\s+\.sous-onglets[^{]*\{[^}]*transform:\s*([^;]+);/);
    vrai(course, 'les bandes collantes doivent dire de combien elles remontent');
    vrai(/var\(--h-barre-dessin\)/.test(course[1]) && !/var\(--h-barre\)/.test(course[1]),
      'la course vaut le dessin de la barre et non sa hauteur totale : sinon elles '
      + 'remontent derrière l’heure et la caméra de l’iPhone');
    vrai(/--h-barre:\s*calc\(\s*var\(--h-barre-dessin\)\s*\+\s*env\(safe-area-inset-top/.test(css),
      'et la hauteur totale se dérive du dessin plus l’encoche, en un seul endroit');

    /* La barre ne doit pas devenir le bloc conteneur de ses descendants fixes. Le
       tiroir des réglages est l'un d'eux : `will-change: transform` sur elle le
       recalait sur une boîte de 54 px en haut de l'écran, et il s'ouvrait hors
       champ. Le `transform` du retrait fait pareil, mais seulement le temps qu'il
       est appliqué — et `app.js` rend la barre avant d'ouvrir le tiroir. */
    /* La bonne règle `.sidebar` se reconnaît à sa hauteur, et non à son rang : il y
       en a trois dans la feuille — la base, celle du téléphone, et celle qui porte
       les transitions en fin de fichier. `lastIndexOf` tombait sur la dernière, qui
       n'a jamais eu de `will-change` : le contrôle passait pour la mauvaise raison. */
    const regles = [...css.matchAll(/\.sidebar\s*\{([^}]*)\}/g)].map(m => m[1]);
    const regleBarre = regles.find(r => /height:\s*var\(--h-barre\)/.test(r));
    vrai(regleBarre, 'la règle de la barre du haut sur téléphone doit être trouvable');
    vrai(!/will-change/.test(regleBarre),
      'pas de will-change sur la barre du haut : il crée un bloc conteneur pour ses '
      + 'descendants en position fixe, et le tiroir des réglages en est un');
    /* Et plus de bandeau : le fond de la barre valait #050506 quand la page vaut
       #08090b, ce qui dessinait une bande en haut de l'écran sans qu'aucune bordure
       ne le demande. Les deux boutons portent leur propre disque. */
    vrai(/background:\s*transparent/.test(regleBarre),
      'la barre du haut ne porte pas de fond : deux noirs voisins dessinent une '
      + 'bande, et le bas de l’écran est en verre');
    vrai(/border-bottom:\s*none/.test(regleBarre),
      'ni de filet sous elle, qui la redessinerait aussitôt');

    /* Même défaut, même endroit de l'écran, autre bande : les sous-onglets. Leur
       fond ne peut pas disparaître — la bande est collante, et sans lui les cartes
       défileraient à travers les onglets — donc il passe en verre. Un aplat opaque
       de la couleur de la page, pris entre des cartes plus claires, se lit comme un
       bandeau noir. */
    const regleOnglets = css.match(/\.sous-onglets\s*\{([^}]*)\}/);
    vrai(regleOnglets, 'la règle des sous-onglets doit être trouvable');
    vrai(/background:\s*transparent/.test(regleOnglets[1]),
      'le conteneur des sous-onglets ne porte aucun fond : un aplat de la couleur de '
      + 'la page, pris entre des cartes plus claires, dessine une bande');
    vrai(!/backdrop-filter/.test(regleOnglets[1]),
      'ni de flou, qui dessine une bande aussi sûrement qu’une couleur — c’est '
      + 'l’étape intermédiaire qui n’a pas suffi. Seules les pastilles ont une surface');
    /* Et elles en ont bien une : c'est elle qui rend les libellés lisibles quand une
       carte passe sous la bande. */
    vrai(/\.sous-onglets \.segmented\s*\{[^}]*background:\s*var\(--surface-1\)/.test(css),
      'les pastilles gardent leur propre surface, sinon plus rien ne porte les libellés');
    const js2 = lireSource('assets/app.js') || '';
    const nav = js2.indexOf('const setNav = open =>');
    vrai(nav > 0, 'setNav doit être trouvable');
    vrai(/classList\.remove\('haut-cache'\)/.test(js2.slice(nav, nav + 700)),
      'et ouvrir le tiroir doit rendre la barre : sinon un retrait en cours '
      + 'décrocherait de l’écran le tiroir qu’elle contient');
    vrai(/body\.haut-cache\s+\.sidebar\s*\{[^}]*transform:\s*translate3d\(0,\s*-100%/.test(css),
      'et c’est un retrait par translate3d : animer la hauteur ou le `top` de la barre '
      + 'ferait sauter la page sous le doigt, et une translation plate peut rester sur '
      + 'le fil principal');
    /* Le remplissage du contenu ne suit pas le retrait : s'il suivait, la page se
       déplacerait de 54 px à chaque aller-retour et l'on perdrait sa ligne. */
    vrai(!/body\.haut-cache\s+\.main\s*\{[^}]*padding-top/.test(css),
      'le remplissage du contenu ne doit pas suivre le retrait, sinon la page bouge '
      + 'sous le doigt à chaque changement de sens');

    /* Et quand ils se croisent, c'est la navigation qui passe devant. */
    const zDe = sel => {
      const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*z-index:\\s*(\\d+)'));
      return m ? Number(m[1]) : null;
    };
    const zOnglets = zDe('.sous-onglets'), zBandeau = zDe('.cpt-gtitre');
    vrai(zOnglets !== null && zBandeau !== null, 'les deux bandes doivent déclarer leur plan');
    vrai(zOnglets > zBandeau,
      `la barre des sous-onglets (${zOnglets}) doit passer devant le bandeau `
      + `(${zBandeau}) : pendant qu'ils se croisent, c'est la navigation qu'on doit voir`);
  });

  test('chaque vue retrouve sa position, et jamais celle de sa voisine', () => {
    /* Le défaut : `render()` lisait `window.scrollY` au début et le restaurait à la
       fin, sans distinguer un re-rendu d'une arrivée. Un re-rendu doit garder la
       position — il y en a un à chaque frappe dans un champ — mais une arrivée
       appliquait celle de l'écran qu'on quitte à celui qu'on ouvre. « Si j'étais
       tout en haut dans Budget, ensuite tout en bas dans Allocation, je ne peux
       aller tout en bas de Budget si je reclique. »

       Aucun système ne fait ça : iOS garde une position par onglet, Android remet
       en haut. Appliquer celle du voisin n'est ni l'un ni l'autre. Chaque vue
       retient donc la sienne.

       Le contrôle porte sur la source : la règle vit dans l'ordre des lectures et
       des écritures, et le harnais ne rend pas de DOM. */
    const js = lireSource('assets/app.js');
    vrai(js, 'assets/app.js doit être lisible pour ce contrôle');

    vrai(/const positionsVues = new Map\(\)/.test(js),
      'les positions doivent se retenir par vue');
    vrai(/const arrivee = signatureVue !== derniereVueRendue/.test(js),
      'et une arrivée doit se distinguer d’un re-rendu : c’est la distinction qui '
      + 'manquait');
    vrai(/positionsVues\.set\(derniereVueRendue, scroll\)/.test(js),
      'en quittant une vue, sa position se retient');
    vrai(/scrollTo\(0, arrivee \? \(positionsVues\.get\(signatureVue\) \|\| 0\) : scroll\)/.test(js),
      'à l’arrivée on restaure la position de la vue ouverte, et un re-rendu ne '
      + 'bouge pas d’un pixel');

    /* Et l'action des sous-onglets ne remet plus à zéro avant de router : elle
       faisait retenir zéro pour l'onglet qu'on quitte, donc lui faisait perdre sa
       place au moment même où on la mémorise. */
    const so = js.indexOf(`'sous-onglet'(btn)`);
    vrai(so > 0, 'l’action des sous-onglets doit être trouvable');
    vrai(!/window\.scrollTo\(0, 0\)/.test(js.slice(so, so + 500)),
      'le changement de sous-onglet ne remet plus la position à zéro lui-même : la '
      + 'mémoire par vue s’en charge, et zéro écraserait la place de l’onglet quitté');
  });

  test('un sous-onglet ramène en haut, un onglet du bas garde sa place', () => {
    /* La question posée le 5 août : « c'est quoi le standard ? » Elle n'a pas la
       même réponse aux deux niveaux, et c'est pour ça qu'un seul mécanisme les
       traitait mal tous les deux.

       Les cinq onglets du bas sont des destinations : iOS garde une position par
       onglet, Material 3 demande de restaurer l'état d'une destination. Deux
       sous-onglets sont deux contenus de la même page, de longueurs différentes —
       un sélecteur segmenté, pas une destination. Rester à 1 500 px en passant de
       Dépenses à Relevés ne désigne rien du tout.

       La distinction tient à une comparaison, et il faut donc les deux mémoires :
       la signature complète pour retrouver sa place, la clé de vue seule pour
       savoir si l'on a seulement changé d'onglet. Le contrôle exige les deux — avec
       la seule signature, un changement de sous-onglet est indiscernable d'un
       changement de page. */
    const js = lireSource('assets/app.js');
    vrai(js, 'assets/app.js doit être lisible pour ce contrôle');

    vrai(/let derniereCleRendue/.test(js),
      'la vue rendue se retient sous-onglet exclu, à côté de la signature complète');
    vrai(/const changeOnglet = arrivee && derniereCleRendue === key/.test(js),
      'changer de sous-onglet, c’est arriver ailleurs sans changer de vue');
    vrai(/\(retourHautDemande \|\| changeOnglet\)[^\n]*scrollTo\(0, 0\)/.test(js),
      'et cette arrivée-là ramène en haut, comme le geste du logo');

    /* La borne de l'autre cote : la memoire de position ne doit pas disparaitre
       pour autant. C'est elle qui rend sa place a un onglet du bas. */
    vrai(/positionsVues\.get\(signatureVue\)/.test(js),
      'les cinq onglets du bas gardent leur place, c’est l’autre moitié de la règle');
  });

  test('le logo ramène en haut, et la mémoire de position ne le contredit pas', () => {
    /* La rançon de la mémoire par vue, signalée le lendemain : « un clic sur le T
       sur mobile ne me fait plus revenir tout en haut de la page principale, je
       reviens sur la page mais pas en haut. » Le logo n'est pas une navigation
       d'onglet, c'est le geste du retour au départ. Tranché : « le logo on revient
       tout en haut c'est tt. »

       Deux issues à ce geste, et il faut les deux. Depuis un autre écran il
       navigue, donc un rendu suit et c'est lui qui doit ignorer la position
       retenue. Depuis l'accueil lui-même l'adresse ne change pas, donc rien ne se
       rend, et il faut remonter dans l'écouteur. Une seule des deux laisserait la
       moitié du défaut en place — et c'est la moitié « déjà sur l'accueil » qui ne
       se serait jamais vue en testant depuis une autre page. */
    const js = lireSource('assets/app.js');
    vrai(js, 'assets/app.js doit être lisible pour ce contrôle');

    const i = js.indexOf(`marque.addEventListener('click'`);
    vrai(i > 0, 'le logo doit porter un écouteur de clic');
    const ecouteur = js.slice(i, i + 700);
    vrai(/retourHautDemande = true/.test(ecouteur),
      'venant d’ailleurs, le logo demande le sommet au rendu qui suit');
    vrai(/scrollTo\(\{\s*top: 0/.test(ecouteur),
      'et déjà sur place, il remonte lui-même : aucun rendu ne viendra le faire');

    /* L'ordre tranche, comme partout ici : le drapeau doit etre examine avant la
       position retenue, sinon il ne sert a rien. On vise des reperes uniques et
       non un rang — c'est la leçon des deux tests qui passaient pour la mauvaise
       raison, l'un cherchant sa regle par `lastIndexOf` parmi trois homonymes. */
    const consomme = js.indexOf('retourHautDemande = false');
    const restaure = js.indexOf('positionsVues.get(');
    vrai(consomme > 0 && restaure > 0, 'les deux branches doivent exister');
    vrai(consomme < restaure,
      'le retour au sommet passe devant la position retenue, comme une ancre demandée');
    eq((js.match(/positionsVues\.get\(/g) || []).length, 1,
      'une seule lecture de la mémoire de position, sinon cet ordre ne prouve rien');
  });

  test('la barre du haut revient au geste, et jamais sur une sous-page', () => {
    /* Le retrait de la barre du haut n'est un standard qu'à trois conditions, et
       chacune répare un défaut qu'on obtient sans elle.

       Elle revient au premier geste vers le haut. Une barre qui ne reviendrait
       qu'en haut de page ferait payer la cloche et le profil d'un retour au
       sommet : ce ne serait plus le motif d'Instagram ou de Material 3, ce serait
       une perte.

       Elle ne joue pas sur du bruit. Un doigt posé tremble de deux ou trois
       pixels, et sans pas minimum la barre clignote.

       Elle ne bouge pas quand une fenêtre s'ouvre. `gelerFond()` met le corps en
       `position: fixed`, ce qui émet un événement de défilement à l'ouverture et un
       autre à la fermeture — la barre se retirait donc derrière la fenêtre, pour
       un geste que personne n'a fait.

       Et une sous-page garde la sienne : c'est là qu'un « retour » vit, et iOS
       fait la même exception. */
    const js = lireSource('assets/app.js');
    vrai(js, 'assets/app.js doit être lisible pour ce contrôle');
    const i = js.indexOf(`classList.toggle('haut-cache'`);
    vrai(i > 0, 'un écouteur doit poser la classe du retrait');
    const bloc = js.slice(Math.max(0, i - 900), i + 400);
    vrai(/addEventListener\('scroll'/.test(bloc),
      'et suivre le défilement pour ça');
    vrai(/delta > 0/.test(bloc) && /Math\.abs\(delta\) < PAS/.test(bloc),
      'le sens du geste doit commander, et un pas minimum filtrer le tremblement');
    vrai(/modalesOuvertes > 0/.test(bloc),
      'une fenêtre ouverte ne doit pas commander la barre : geler le fond émet un '
      + 'événement de défilement qui n’est pas un geste');
    vrai(/sous-page/.test(bloc),
      'et une sous-page ne cache jamais sa barre, qui porte le retour');

    /* Changer d'écran rend la barre, sans condition : on arrive en haut d'une page
       neuve. Une version avait conditionné ce retour à la position, pour qu'un
       changement de sous-onglet garde la barre retirée ; écarté par le propriétaire —
       « le changement de menu, oui on doit arriver en haut forcément ».

       La recherche part de `i` et non en arrière : le routeur écoute lui aussi
       `hashchange`, plus haut dans le fichier, et remonter tombait sur le sien. */
    const surHash = js.slice(js.indexOf(`addEventListener('hashchange'`, i), i + 1400);
    vrai(/classList\.remove\('haut-cache'\)/.test(surHash),
      'au changement d’écran, la barre revient : une barre restée cachée depuis '
      + 'l’écran précédent se lirait comme une bande manquante');
    vrai(/passive: true/.test(bloc),
      'l’écouteur doit être passif : un écouteur de défilement bloquant fait tressauter '
      + 'le geste sur téléphone');

    /* Le mouvement est asymétrique, comme celui des barres natives : la barre
       s'échappe vite et revient en se posant. Une seule courbe pour les deux sens
       donne le va-et-vient mécanique d'un tiroir — « sinon c'est moche ».

       Et ce qui colle sous elle suit aux mêmes durées : deux vitesses feraient
       décrocher les sous-onglets de la barre qu'ils accompagnent. */
    const css = (lireSource('assets/styles.css') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    /* Le retour se déclare avec les couleurs, en fin de feuille : la règle de
       bascule de thème y nomme `.sidebar` et écraserait une transition posée plus
       haut, `transform` compris — c'est ce qui rendait le retrait instantané. La
       durée se cherche donc dans une liste de propriétés, pas seule. */
    const retour = css.match(/\.sidebar\s*\{[^}]*transform\s+([\d.]+)s\s+cubic-bezier\(([^)]+)\)/);
    const depart = css.match(/body\.haut-cache\s+\.sidebar\s*\{[^}]*transition-duration:\s*([\d.]+)s[^}]*transition-timing-function:\s*cubic-bezier\(([^)]+)\)/);
    vrai(retour && depart, 'les deux sens doivent régler leur propre mouvement');
    /* Et le mouvement passe par une translation composee, pas par une propriété de
       mise en page : `translate3d` force le compositeur, y compris sur iOS. */
    vrai(/translate3d/.test(css.match(/body\.haut-cache\s+\.sidebar\s*\{[^}]*/)[0]),
      'le retrait doit passer par translate3d : une translation simple peut rester '
      + 'sur le fil principal, et le mouvement accroche');
    vrai(Number(depart[1]) < Number(retour[1]),
      `le départ doit être plus court que le retour (${depart[1]}s contre ${retour[1]}s) : `
      + 'ce qui s’en va peut aller vite, ce qui revient doit se poser');
    vrai(retour[2].replace(/\s/g, '') !== depart[2].replace(/\s/g, ''),
      'et les courbes doivent différer, sinon le mouvement est le même dans les deux '
      + 'sens et se lit comme un tiroir');
    /* Les sous-onglets seuls, et plus le bandeau d'etablissement : celui-ci a
       quitte la translation le 5 aout au soir, parce qu'elle sortait chaque titre
       de sa carte, qui le decoupait. Il suit desormais la barre par sa position de
       collage, qui n'a rien a animer. Voir « un bandeau d'etablissement ne se
       translate pas ». */
    for (const [regle, attendu] of [
      [/\.sous-onglets\s*\{[^}]*transition:\s*transform\s+([\d.]+)s/, retour[1]],
      [/body\.haut-cache\s+\.sous-onglets[^{]*\{[^}]*transition-duration:\s*([\d.]+)s/, depart[1]],
    ]) {
      const m = css.match(regle);
      vrai(m, 'les collants doivent régler leur mouvement dans les deux sens');
      eq(m[1], attendu,
        'et à la même durée que la barre : deux vitesses les font décrocher d’elle');
    }
  });

  test('le retour de la barre ne se joue pas dans son premier quart', () => {
    /* « Le bandeau arrive trop vite, je veux quelque chose de plus smooth, moins
       soudain », puis « ça apparaît presque d'un coup ». La durée déclarée n'était
       pourtant pas courte : 300 ms.

       C'était la courbe. `cubic-bezier(.17, .84, .44, 1)` a une pente de 4,9 à
       l'origine : sur les 54 px de course elle en faisait 43 en 100 ms. La barre
       était arrivée, et les deux tiers du temps restant ne servaient qu'à parcourir
       cinq pixels. On ne voyait pas un glissement, on voyait une apparition suivie
       d'une attente — d'où « presque d'un coup » alors que rien n'était instantané.

       Le contrôle ne fige pas des valeurs, il tient la propriété : au quart du
       temps, la barre ne doit pas avoir fait plus des deux tiers du chemin. Ça
       laisse la place au réglage — c'est un goût, et il se retouchera — mais ça
       interdit le retour d'une courbe qui finit avant qu'on l'ait vue.

       La borne de durée sert l'autre moitié : une courbe douce sur 150 ms serait
       douce et invisible. */
    const css = (lireSource('assets/styles.css') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const m = css.match(/\.sidebar\s*\{[^}]*transform\s+([\d.]+)s\s+cubic-bezier\(([^)]+)\)/);
    vrai(m, 'le retour de la barre doit déclarer sa durée et sa courbe');

    const duree = Number(m[1]);
    vrai(duree >= 0.35,
      `le retour dure ${duree}s : sous 0,35 s, aucune courbe ne le rend visible`);

    const [x1, y1, x2, y2] = m[2].split(',').map(v => Number(v.trim()));
    /* La courbe de Bézier de CSS : x est le temps, y l'avancement. On cherche le
       t qui donne x = 0,25, puis on lit son y. Dichotomie, la fonction etant
       strictement croissante sur [0, 1]. */
    const cx = t => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
    const cy = t => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
    let lo = 0, hi = 1, t = 0;
    for (let i = 0; i < 50; i++) { t = (lo + hi) / 2; if (cx(t) < 0.25) lo = t; else hi = t; }
    const avancement = cy(t);

    vrai(avancement < 0.67,
      `au quart du temps la barre a déjà fait ${Math.round(avancement * 100)} % du chemin `
      + '(54 px de course) : c’est ce qui se lit comme une apparition, pas comme un '
      + 'glissement. L’ancienne courbe .17,.84,.44,1 en faisait 80 %.');
  });

  test('l’appui sur le logo se voit au doigt', () => {
    /* Deux corrections successives sur le même geste, la seconde née de la
       première. Le halo du logo venait de `:hover`, que l'appui laisse collé sur
       un écran tactile : il est passé sous `@media (hover: hover)`, et le
       téléphone a perdu son seul retour. `:active` a pris le relais — sauf que
       Safari sur iOS ne l'applique pas au toucher tant qu'aucun écouteur tactile
       ne vit sur l'élément. La règle était juste et inerte là où elle comptait.

       D'où les trois assertions : le survol reste réservé aux pointeurs, l'appui
       a un relais en classe, et cette classe est bien posée sur le logo par un
       écouteur tactile. */
    const css = lireSource('assets/styles.css');
    const js = lireSource('assets/app.js');
    vrai(css && js, 'les deux sources doivent être lisibles');
    const nu = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const media = nu.indexOf('@media (hover: hover)');
    vrai(media > 0, 'le garde-fou du survol doit exister');
    vrai(blocDe(nu, media + 21).includes('.brand:hover'),
      'le halo de survol du logo doit rester sous « hover: hover » : au doigt, un '
      + 'survol ne se lève pas, il reste allumé après l’appui');
    vrai(/\.brand\.tape\s+\.brand-mark/.test(nu),
      'l’appui doit avoir un relais en classe : « :active » ne se déclenche pas au '
      + 'toucher sur iOS');

    /* Le câblage se lit depuis le logo, et non depuis le premier `pointerdown`
       du fichier : app.js en compte plusieurs — le glissement d'une fenêtre, les
       infobulles des graphiques — et partir du premier faisait échouer le
       contrôle sur du code étranger. */
    const pose = js.indexOf(`$('.brand')`);
    vrai(pose > 0, 'app.js doit chercher le logo pour lui poser ce relais');
    const autour = js.slice(pose, pose + 900);
    vrai(/pointerdown/.test(autour),
      'et écouter le toucher sur lui : c’est l’écouteur tactile qui manquait');
    vrai(/classList\.add\('tape'\)/.test(autour),
      'pour poser « tape » à ce moment-là, sinon la règle d’appui ne joue jamais '
      + 'sur un téléphone');
  });
});

/* ------------------------------------------------------------------
   Une ligne de projection annonce le taux qu'elle subit vraiment
   ------------------------------------------------------------------ */
suite('Une ligne de projection annonce le taux qu’elle subit', () => {

  /* « Le panneau "Ce que tu as déjà" affiche 8,00 % par an sur la ligne
     Liquidités alors que le calcul les porte à plat : le chiffre est juste, son
     explication est fausse. » le propriétaire, 6 août 2026.

     Le défaut classique de cette base de code : deux listes du même fait, dont
     une seule est tenue à jour. `pochesProjection()` a sorti les liquidités de
     la poche de marché et leur a retiré tout rendement ; la fiche, elle, a gardé
     l'ancien découpage et leur collait le taux du non coté.

     Rien de ce qui se voit à l'écran ne le trahissait : le montant était juste,
     le total était juste, la somme des parts faisait le total. Seule
     la confrontation de l'étiquette au calcul l'attrape, et c'est ce que fait
     cette suite — elle reconstruit la fiche depuis sa source, la joue sur le
     fixture, et demande à `capitalisation()` ce qu'elle fait réellement de
     chaque poche. */

  /* La fiche vit dans app.js, que le harnais ne charge pas. On l'en extrait et
     on l'exécute pour de vrai : une assertion sur ce qu'elle produit vaut mieux
     qu'une recherche de motif dans une chaîne. Seule `A_PLAT` lui manque, elle
     lui est passée en paramètre — depuis sa propre déclaration, pour qu'une
     phrase réécrite là-bas n'ait pas à l'être ici. */
  function fiche() {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    /* A_PLAT se traduit a sa declaration : la phrase francaise reste la clef,
       et c'est elle que la fiche recoit — les tests tournent en francais. */
    const phrase = src.match(/const A_PLAT = trad\('([^']+)'\)/);
    vrai(phrase, 'la phrase « à plat » doit vivre à un seul endroit, dans A_PLAT : '
      + 'recopiée, c’est l’un des exemplaires qui finit par mentir');
    const bloc = src.match(/\n  baseProjection: \(\) => \{[\s\S]*?\n  \},/);
    vrai(bloc, 'la fiche « Ce que tu as déjà » doit être trouvable dans APERCUS');
    const corps = bloc[0].replace(/\n  baseProjection: /, '').replace(/,\s*$/, '');
    return new Function('A_PLAT', `return (${corps})();`)(phrase[1]);
  }

  test('les liquidités ne portent aucun taux, parce qu’elles n’en subissent aucun', () => {
    /* Le cas signalé, au chiffre près : un rendement du non coté à 8 %. */
    Fixture.poser(s => { s.meta.projRate = 5; s.meta.projRateAutres = 8; });
    const f = fiche();
    const liq = f.lignes.find(l => /Liquidit/.test(l.label));
    vrai(liq, 'la fiche doit porter une ligne de liquidités');
    vrai(!/%/.test(liq.meta),
      `la ligne des liquidités annonce « ${liq.meta} » alors que la projection ne `
      + 'leur applique aucun rendement');

    /* Et ce que fait vraiment le calcul, sur la même hypothèse : les liquidités
       traversent la projection sans produire un centime. C'est la moitié qui
       rend l'assertion ci-dessus autre chose qu'une opinion. */
    const d = capitalisation({ years: 10 }).points.at(-1);
    pres(d.gainsLiquidites, 0, 'les liquidités ne produisent rien sur dix ans');
    vrai(d.gainsNonCote > 0, 'quand le non coté, lui, capitalise bien à 8 %');
  });

  test('le taux annoncé par une ligne est celui que le calcul lui applique', () => {
    /* La règle, énoncée pour toutes les lignes plutôt que pour celle qui a
       cassé : une ligne qui affiche un pourcentage doit produire du gain, une
       ligne qui n'en affiche pas ne doit rien produire. Elle vaudra pour la
       poche qu'on ajoutera. */
    Fixture.poser(s => { s.meta.projRate = 5; s.meta.projRateAutres = 8; });
    const f = fiche();
    const d = capitalisation({ years: 10 }).points.at(-1);
    const gainDe = {
      'Actifs de marché': d.gainsMarche,
      'Cryptomonnaies': d.gainsMarche,
      'Non coté': d.gainsNonCote,
      'Liquidités': d.gainsLiquidites,
    };
    for (const l of f.lignes) {
      const gain = gainDe[l.label];
      vrai(gain !== undefined,
        `la ligne « ${l.label} » n’est rattachée à aucune poche du calcul : `
        + 'ajoute-la à la table de ce test, ou à capitalisation()');
      const annonce = /%/.test(l.meta);
      eq(annonce, gain > 0.005,
        `« ${l.label} » annonce « ${l.meta} » pour un gain de ${Math.round(gain)} € : `
        + 'un taux affiché doit produire quelque chose, et un gain nul ne doit pas '
        + 's’annoncer comme un rendement');
    }
  });

  test('la somme des parts fait le total de la fiche', () => {
    /* La règle du projet, sur la fiche qu'on vient de réécrire : retirer une
       ligne — « Cash à investir » est partie — ne doit pas laisser le total
       compter ce que plus aucune ligne ne montre. */
    Fixture.poser(s => { s.meta.projRateAutres = 8; });
    const f = fiche();
    pres(f.lignes.reduce((s, l) => s + l.valeur, 0), f.total,
      'la somme des lignes de « Ce que tu as déjà » fait son total');
    const q = pochesProjection();
    pres(f.total, q.marche + q.autres,
      'et ce total est bien la base qui capitalise, immobilier à part');
  });
});

/* ------------------------------------------------------------------
   Un horizon, deux portes
   ------------------------------------------------------------------ */
suite('La projection n’a qu’un seul horizon', () => {

  /* « Les deux menus "par horizon" de Projection doivent être corrélés : une
     seule variable, deux endroits qui l'écrivent. » le propriétaire, 6 août 2026.

     Ils réglaient deux choses différentes sous le même nom : celui de l'en-tête
     posait `meta.projHorizon`, celui du tableau nourrissait `projExtra`, une
     ligne libre que le graphique ignorait. Deux valeurs rangées séparément pour
     une seule question, c'est exactement ce que ce projet interdit ailleurs. */

  test('les deux sélecteurs de la page écrivent le même réglage', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    /* Aucune seconde variable d'horizon ne doit renaître. */
    vrai(!/^\s*let projExtra/m.test(src),
      'une seconde variable d’horizon est revenue : deux valeurs pour une seule '
      + 'question finissent toujours par se contredire à l’écran');

    /* Et les deux menus sortent du même générateur : deux gabarits recopiés
       auraient pu diverger sur la liste des durées, si bien qu'un choix fait
       dans l'un n'aurait eu aucune option correspondante dans l'autre. */
    /* Un seul `<select>` écrit à la main. L'attribut, lui, apparaît une seconde
       fois dans l'écouteur qui l'attrape : compter l'attribut nu aurait fait
       échouer ce test sur son propre câblage. */
    const gabarits = src.match(/<select data-action-change="proj-horizon"/g) || [];
    eq(gabarits.length, 1,
      `le sélecteur d’horizon est écrit ${gabarits.length} fois : il doit sortir `
      + 'de selecteurHorizon(), sinon les deux listes peuvent proposer des durées '
      + 'différentes pour un même réglage');
    const appels = src.match(/\$\{selecteurHorizon\(\)\}/g) || [];
    eq(appels.length, 2,
      `la page doit porter ses deux portes sur ce réglage, elle en a ${appels.length}`);

    /* L'écouteur écrit bien l'état, et le sauvegarde : un horizon qui ne
       survivrait pas au rechargement redeviendrait un réglage local. */
    vrai(/projHorizon = \+sel\.value;\s*\n?\s*Store\.save\(\); render\(\);/.test(src),
      'changer l’horizon doit écrire l’état et le sauvegarder');
  });

  test('l’horizon choisi a toujours sa ligne dans le tableau', () => {
    /* Ce qui rend la corrélation visible : régler 40 ans depuis le pied du
       tableau doit faire apparaître la ligne 40 ans dans ce même tableau. Sans
       cette garantie, le sélecteur du bas déplacerait le graphique sans que rien
       ne bouge à côté de lui. C'est `capitalisation()` qui la tient. */
    Fixture.poser();
    for (const h of [3, 25, 40, 80]) {
      const jalons = capitalisation({ years: h }).jalons.map(j => j.horizon);
      vrai(jalons.includes(h),
        `l’horizon ${h} ans doit avoir sa ligne dans le tableau : ${jalons.join(', ')}`);
      eq(jalons[jalons.length - 1], h,
        'et ce doit être la dernière, le tableau se lisant dans l’ordre du temps');
    }
  });
});

/* ------------------------------------------------------------------
   Toucher un graphique pour défiler n'ouvre pas son infobulle
   ------------------------------------------------------------------ */
suite('Un graphique ne prend pas le geste de défilement', () => {

  /* « Le graphique de l'accueil ouvre son infobulle quand on le touche pour
     faire défiler la page : il faut un délai ou un seuil. » le propriétaire,
     6 août 2026.

     Le premier contact posait l'infobulle, et un doigt qui traverse un
     graphique de 300 px pour atteindre le bas de la page en pose forcément un.

     Le geste vit dans `cablerInfobulle`, qui ne touche ni au DOM ni au temps
     autrement que par `setTimeout` : on l'extrait de sa source et on le joue
     avec un élément et des minuteurs de comédie. Une assertion sur le
     comportement vaut mieux qu'une recherche de motif — et celle-ci décrit
     exactement les quatre gestes qu'un doigt peut faire. */
  function geste() {
    const src = lireSource('assets/charts.js');
    vrai(src, 'assets/charts.js doit être lisible pour ce contrôle');
    const bloc = src.match(/\n  function cablerInfobulle\(cible, montrer, masquer\) \{[\s\S]*?\n  \}\n/);
    vrai(bloc, 'cablerInfobulle doit être trouvable dans charts.js');

    /* Le seuil et le délai viennent de leur propre déclaration : les réécrire
       ici en ferait une seconde source, et le test continuerait de passer sur
       des valeurs que le code n'a plus. */
    const seuil = +(src.match(/const SEUIL_GLISSE = (\d+)/) || [])[1];
    const delai = +(src.match(/const DELAI_APPUI = (\d+)/) || [])[1];
    vrai(seuil > 0 && delai > 0, 'le seuil et le délai du geste doivent être déclarés');

    /* Les minuteurs ne s'exécutent pas tout seuls : le harnais est synchrone, et
       un test qui attend vraiment 130 ms serait un test qui dort. Ils sont
       rangés, et `echoir()` les déclenche à la demande. */
    const enAttente = [];
    const poser = fn => enAttente.push(fn);
    const retirer = id => { if (id) enAttente[id - 1] = null; };
    const fabrique = new Function('setTimeout', 'clearTimeout', 'SEUIL_GLISSE', 'DELAI_APPUI',
      `${bloc[0]}\nreturn cablerInfobulle;`);
    const cabler = fabrique(poser, retirer, seuil, delai);

    const ecouteurs = {};
    const cible = {
      addEventListener: (nom, fn) => { (ecouteurs[nom] = ecouteurs[nom] || []).push(fn); },
      setPointerCapture: () => {},
    };
    const vu = [];
    cabler(cible, ev => vu.push({ quoi: 'montre', x: ev.clientX }), () => vu.push({ quoi: 'cache' }));

    return {
      vu, seuil,
      emettre: (nom, ev) => (ecouteurs[nom] || []).forEach(fn => fn(ev)),
      echoir: () => enAttente.forEach((fn, i) => { if (fn) { enAttente[i] = null; fn(); } }),
      montres: () => vu.filter(v => v.quoi === 'montre').length,
      caches: () => vu.filter(v => v.quoi === 'cache').length,
    };
  }

  const doigt = (x, y, plus) => Object.assign(
    { pointerType: 'touch', pointerId: 1, clientX: x, clientY: y, buttons: 1, pressure: 0.5 }, plus);

  test('un doigt qui part vers le bas n’ouvre rien, même après le délai', () => {
    const g = geste();
    g.emettre('pointerdown', doigt(100, 100));
    eq(g.montres(), 0, 'poser le doigt n’ouvre plus rien tout de suite');
    /* Franchement au-delà du seuil, et vers le bas : un défilement. */
    g.emettre('pointermove', doigt(101, 100 + g.seuil * 3));
    g.echoir();
    eq(g.montres(), 0,
      'le geste est parti en défilement : le minuteur en attente ne doit plus rien ouvrir');
  });

  test('le doigt tenu en place ouvre l’infobulle', () => {
    const g = geste();
    g.emettre('pointerdown', doigt(100, 100));
    g.echoir();
    eq(g.montres(), 1, 'un doigt immobile pendant le délai demande bien à lire');
  });

  test('un glissement horizontal ouvre sans attendre', () => {
    /* Parcourir la courbe est un geste franc, et il n'a rien à voir avec le
       défilement : le faire attendre un dixième de seconde se sentirait. */
    const g = geste();
    g.emettre('pointerdown', doigt(100, 100));
    g.emettre('pointermove', doigt(100 + g.seuil * 3, 102));
    eq(g.montres(), 1, 'un glissement franc vers le côté suffit, sans attendre le minuteur');
    g.emettre('pointermove', doigt(100 + g.seuil * 5, 104));
    eq(g.montres(), 2, 'et le curseur suit ensuite chaque mouvement');
  });

  test('la souris, elle, n’attend rien', () => {
    /* Un survol ne prend le geste de personne : lui imposer le même seuil
       rendrait le graphique poussif là où il n'y a aucun conflit. */
    const g = geste();
    g.emettre('pointerdown', doigt(100, 100, { pointerType: 'mouse' }));
    eq(g.montres(), 1, 'la souris ouvre au clic');
    g.emettre('pointermove', doigt(140, 100, { pointerType: 'mouse', buttons: 0, pressure: 0 }));
    eq(g.montres(), 2, 'et au simple survol, sans bouton enfoncé');
  });

  test('une infobulle ouverte survit à l’annulation du pointeur, une autre non', () => {
    /* Les deux moitiés du même événement, et c'est ce qui distingue ce correctif
       de celui du 5 août plutôt que de le défaire. Ouverte, l'infobulle reste :
       `touch-action: pan-y` fait annuler le pointeur au moindre tremblement, et
       on tient justement le doigt en place pour lire. Pas encore ouverte,
       l'annulation est le signal le plus sûr qui existe — le navigateur vient de
       décider que ce geste est un défilement. */
    const ouverte = geste();
    ouverte.emettre('pointerdown', doigt(100, 100));
    ouverte.echoir();
    ouverte.emettre('pointercancel', doigt(100, 108));
    eq(ouverte.caches(), 0, 'une infobulle ouverte ne part pas sur une annulation');

    const naissante = geste();
    naissante.emettre('pointerdown', doigt(100, 100));
    naissante.emettre('pointercancel', doigt(100, 104));
    naissante.echoir();
    eq(naissante.montres(), 0,
      'et une infobulle pas encore ouverte ne s’ouvre plus après l’annulation');
  });

  test('lever le doigt ferme, et désarme', () => {
    const g = geste();
    g.emettre('pointerdown', doigt(100, 100));
    g.emettre('pointerup', doigt(100, 100));
    g.echoir();
    eq(g.montres(), 0, 'un appui bref et levé n’ouvre rien après coup');
    eq(g.caches(), 1, 'et la levée referme');
  });

  test('les deux graphiques tactiles passent par le même geste', () => {
    /* La courbe d'évolution et la sparkline avaient chacune leur câblage, à cent
       lignes d'écart. Deux copies d'un geste, c'est une copie qu'on oublie de
       corriger. */
    const src = lireSource('assets/charts.js');
    const appels = src.match(/cablerInfobulle\((svg|el),/g) || [];
    eq(appels.length, 2,
      `les deux graphiques tactiles doivent partager ce geste (${appels.length} trouvé·s)`);
    /* Et sur le SVG, pas sur le conteneur : `mount` rejoue le rendu à chaque
       redimensionnement, et des écouteurs posés sur un élément qui lui survit
       s'empileraient à chaque fois. Les propriétés `on…` d'avant s'écrasaient et
       masquaient ce piège. */
    vrai(!/\bel\.onpointer(down|move|up|leave)\s*=/.test(src),
      'plus aucune propriété « onpointer… » : elles cachaient l’empilement '
      + 'd’écouteurs sur un conteneur qui survit au rendu');
  });
});

/* ------------------------------------------------------------------
   Ce qu'on efface n'a plus de champ obligatoire
   ------------------------------------------------------------------ */
suite('Une ligne sans nom se supprime quand même', () => {

  /* « Une charge fixe sans nom ne se supprimait pas, il fallait mettre une
     lettre. » le propriétaire, 6 août 2026.

     Le champ « Poste » est obligatoire, la case « Supprimer cette charge » vit
     dans la même fenêtre, et valider renvoyait « Poste : à remplir ». Il fallait
     donc baptiser une ligne pour avoir le droit de la faire disparaître — et la
     ligne sans nom est justement celle qu'on veut le plus souvent effacer,
     puisque c'est celle qu'on a créée par mégarde. */

  test('cocher la suppression dispense des champs obligatoires', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.match(/const lire = \(suite = false\) => \{[\s\S]*?\n    \};/);
    vrai(bloc, 'la validation d’askForm doit être trouvable');
    vrai(/c\.type === 'case' && c\.cle === 'supprimer'/.test(bloc[0]),
      'la dispense doit se lire sur la case de suppression, pas sur un champ au '
      + 'hasard : c’est le nom que les trois fenêtres lisent déjà en retour');
    vrai(/const manquant = efface \? null :/.test(bloc[0]),
      'un champ obligatoire ne garantit plus rien sur une ligne qui ne sera plus là');
  });

  test('la règle vit dans askForm, pas dans chacun de ses appelants', () => {
    /* Il y a une dizaine de fenêtres de ce type, et la onzième aurait oublié la
       question. La règle est donc au seul endroit qu'elles traversent toutes —
       et ce test vérifie que la convention de nom tient : une case qui
       s'appellerait autrement serait muette pour askForm. */
    const src = lireSource('assets/app.js');
    /* Le libelle passe par `trad()` depuis qu'il se traduit : c'est la clef
       `supprimer` que ce controle surveille, pas la langue du libelle. */
    const cases = src.match(/\{ cle: 'supprimer', label: (?:trad\()?'[^']*'\)?, type: 'case'/g) || [];
    vrai(cases.length >= 3,
      `les fenêtres qui suppriment par une case doivent toutes employer cette clé `
      + `(${cases.length} trouvée·s)`);
    /* Et chacune fait bien quelque chose de la réponse. */
    const lectures = src.match(/if \(v\.supprimer\)/g) || [];
    eq(lectures.length, cases.length,
      `${cases.length} cases de suppression pour ${lectures.length} lectures : `
      + 'une case cochée qui ne supprime rien est pire qu’une case absente');
  });

  test('une ligne sans nom ne se fait pas désigner par un vide', () => {
    /* « Supprimer la charge fixe «  » ? » désignait un vide par un vide. */
    const src = lireSource('assets/app.js');
    const bloc = src.match(/function makeDeleter\([\s\S]*?\n\}/);
    vrai(bloc, 'makeDeleter doit être trouvable');
    /* Les guillemets suivent la langue depuis `guill()` : l'anglais n'ecrit pas
       « x » mais “x”, et la citation d'un nom saisi traversait les deux langues. */
    vrai(/nom \? ` \$\{guill\(nom\)\}` :/.test(bloc[0]),
      'la question doit rester lisible quand la ligne n’a pas de nom');
  });
});

/* ------------------------------------------------------------------
   Une ligne se retire sans passer par une vente
   ------------------------------------------------------------------ */
suite('Une ligne de titres se supprime depuis sa fiche', () => {

  /* « Supprimer une position sans la vendre : bouton rouge en bas de la fiche,
     avec confirmation. La croix n'existe que sur PC. » le propriétaire,
     6 août 2026.

     Le tableau des lignes ne se rend pas sous 768 px — c'est la règle
     d'affichage du projet — et la croix de suppression y vivait seule. Sur
     téléphone, une ligne saisie par erreur ne pouvait plus quitter le
     portefeuille. */

  test('la fiche porte sa sortie définitive, et la fait confirmer', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.match(/function askPosition\(index\) \{[\s\S]*?\n\}\n/);
    vrai(bloc, 'la fiche d’une ligne de titres doit être trouvable');
    vrai(/id="posDelete"/.test(bloc[0]),
      'la fiche doit porter un bouton de suppression : sans lui, une ligne créée '
      + 'par erreur est indélébile sur téléphone');
    vrai(/class="btn ghost danger"/.test(bloc[0]),
      'et il se distingue des quatre gestes courants du pied de fenêtre');
    vrai(/posDelete'\)\.onclick = async \(\) => \{[\s\S]{0,600}?askConfirm/.test(bloc[0]),
      'une suppression se confirme, et la question se pose tant que la fiche peut '
      + 'encore nommer la ligne et son montant');
  });

  test('la suppression se traite avant tout ce qui compte en index', () => {
    /* `suite.supprimer`, `suite.vendre` et `suite.acheter` sont des index dans
       `Store.state.positions`. Retirer une ligne les décale tous : la
       suppression doit donc être la première branche, et elle doit sortir. */
    const src = lireSource('assets/app.js');
    const bloc = src.match(/async 'open-position'\(btn\) \{[\s\S]*?\n  \},/);
    vrai(bloc, 'l’ouverture d’une fiche doit être trouvable');
    const iSup = bloc[0].indexOf('suite.supprimer');
    const iVente = bloc[0].indexOf('suite.vendre');
    vrai(iSup > 0 && iVente > 0, 'les deux suites doivent être traitées');
    vrai(iSup < iVente,
      'la suppression décale les index : elle se traite avant la vente et l’achat');
    vrai(/Store\.addBackup\('avant suppression de ligne'\)/.test(bloc[0]),
      'et pose une sauvegarde, comme la vente et l’achat');
  });
});

/* ------------------------------------------------------------------
   Le journal des ventes porte le bouton qui l'alimente
   ------------------------------------------------------------------ */
suite('Une vente s’ajoute depuis le journal des ventes', () => {

  /* « Ajouter une vente plus facilement. » le propriétaire, 6 août 2026.

     Le seul chemin était le bouton « − Vendre » de la carte « Lignes de titres »,
     dans Marchés — si loin que la page Performance écrivait l'itinéraire : « Le
     bouton "Vendre une ligne" se trouve dans Marchés ». Quand une page doit
     donner la direction de son propre geste, c'est le geste qui est mal placé.

     Et la carte du journal ne se rendait pas tant qu'aucune vente n'existait :
     le bouton n'aurait donc jamais été là pour la première. C'est le cas qu'on
     ne voit pas en développant sur un jeu de données déjà rempli. */

  test('le journal se rend même vide, et porte le bouton', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.match(/function salesCard\(\) \{[\s\S]*?\n\}/);
    vrai(bloc, 'la carte du journal des ventes doit être trouvable');
    vrai(!/if \(!toutes\.length\) return '';/.test(bloc[0]),
      'la carte ne doit plus disparaître faute de ventes : c’est justement '
      + 'l’écran où l’on vient saisir la première');
    vrai(/data-action="sell-position"/.test(bloc[0]),
      'et elle porte le bouton qui l’alimente');
    /* Il fut desactive faute de ligne a vendre, au motif qu'une fenetre qui
       s'ouvre pour se refermer ne vaut pas mieux qu'une erreur. La fenetre ne se
       referme plus : son menu propose « une vente passee, pour memoire », et
       s'ouvre dessus quand il n'y a rien a vendre. Un bouton grise qui ne dit
       pourquoi que dans une infobulle est pire, au doigt, qu'une fenetre qui
       montre ce qu'elle peut. */
    vrai(!/disabled/.test(bloc[0]),
      'et il ne se désactive plus : sans ligne, la fenêtre s’ouvre sur la vente passée');
    vrai(!/data-action="declarer-vente"/.test(bloc[0]),
      'un seul bouton : la nature de la vente se choisit dans la fenêtre');
  });

  test('aucun écran n’envoie plus chercher ce bouton ailleurs', () => {
    /* La phrase qui donnait l'itinéraire. Elle était juste et c'était le
       problème : une application qui explique où trouver son geste avoue qu'il
       n'est pas là où on le cherche. */
    const src = lireSource('assets/app.js');
    vrai(!/se trouve dans Marchés/.test(src),
      'un écran envoie encore chercher le bouton de vente dans un autre onglet');
  });

  test('les deux portes mènent à la même saisie', () => {
    /* Deux boutons sur une même action sont sains — c'est la règle du projet,
       celle du sélecteur d'année du journal. Ce qui serait fautif, ce serait
       deux fenêtres de saisie de vente. */
    const src = lireSource('assets/app.js');
    const boutons = src.match(/data-action="sell-position"/g) || [];
    eq(boutons.length, 2, `deux portes attendues, ${boutons.length} trouvée·s`);
    const actions = src.match(/'sell-position'\(\) \{/g) || [];
    eq(actions.length, 1, 'et une seule action derrière elles');
    const fenetres = src.match(/function askSale\(/g) || [];
    eq(fenetres.length, 1, 'et une seule fenêtre de saisie de vente');
  });
});

/* ------------------------------------------------------------------
   Le survol ne se pose jamais au doigt
   ------------------------------------------------------------------ */
suite('Aucun survol ne peut rester collé au doigt', () => {

  /* « Des fois la charge fixe ou une autre ligne reste surlignée sur téléphone
     alors que je touche rien. » le propriétaire, 6 août 2026, capture à l'appui :
     « Charges fixes » peinte à l'accent sur la carte « Où va ce que tu gagnes »,
     sans que rien ne soit survolé.

     Au doigt, `:hover` ne se lève pas : le navigateur le pose à l'appui et le
     laisse allumé jusqu'à ce qu'on touche ailleurs. Toute règle de survol est
     donc une tache de peinture sur téléphone.

     Le correctif du 5 août avait posé `@media (hover: hover)` sur une seule
     règle, celle du logo, parce qu'un seul symptôme avait été signalé. Les
     soixante-neuf autres avaient le même défaut, et la première d'entre elles
     s'est manifestée dès la mise en ligne suivante. Ce test dérive la liste de
     la feuille elle-même : il n'y a pas d'exception à tenir à jour, et la règle
     que quelqu'un écrira demain est déjà couverte. */

  /* Les zones protégées, et le texte hors commentaires : un `:hover` cité en
     prose dans un commentaire n'est pas une règle. */
  function survolsNus() {
    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    const nu = css.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
    const zones = [];
    for (const m of nu.matchAll(/@media\s*\(hover:\s*hover\)[^{]*\{/g)) {
      let i = m.index + m[0].length, prof = 1;
      while (i < nu.length && prof) {
        if (nu[i] === '{') prof++;
        else if (nu[i] === '}') prof--;
        i++;
      }
      zones.push([m.index, i]);
    }
    const dedans = p => zones.some(([a, b]) => a <= p && p < b);
    const nus = [];
    for (const m of nu.matchAll(/:hover/g)) {
      if (dedans(m.index)) continue;
      const deb = Math.max(nu.lastIndexOf('}', m.index), nu.lastIndexOf('{', m.index)) + 1;
      nus.push(nu.slice(deb, nu.indexOf('{', m.index)).trim().replace(/\s+/g, ' '));
    }
    return { nus, protegees: zones.length };
  }

  test('toute règle de survol vit sous « hover: hover »', () => {
    const { nus, protegees } = survolsNus();
    vrai(protegees > 1,
      `le garde-fou doit couvrir toute la feuille, il n’enveloppe que ${protegees} bloc(s)`);
    eq(nus.length, 0,
      `${nus.length} règle(s) de survol hors du garde-fou, elles resteront peintes `
      + `après un appui sur téléphone :\n  ${nus.slice(0, 8).join('\n  ')}`);
  });

  test('le clavier n’a pas été emporté avec le doigt', () => {
    /* Trois sélecteurs mélangeaient survol et focus — `.aide:hover,
       .aide:focus-visible` et deux autres. Enfermer la règle entière aurait
       supprimé l'indication au clavier en même temps que la tache au doigt :
       elles ont été coupées en deux, et la moitié focus est restée dehors. */
    const css = lireSource('assets/styles.css');
    const nu = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const sel of ['.aide:focus-visible', '.col-aide:focus-visible', '.cible-champ:focus']) {
      vrai(nu.includes(sel),
        `« ${sel} » a disparu : la moitié clavier d’un sélecteur mixte ne doit pas `
        + 'partir avec sa moitié survol');
    }
  });

  test('l’appui tactile garde son propre retour', () => {
    /* Ce qui remplace le survol au doigt existe déjà et ne bouge pas : `:active`
       et les classes posées par un écouteur tactile, qui elles se lèvent. Retirer
       le survol sans elles laisserait le téléphone sans aucun retour. */
    const nu = lireSource('assets/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    vrai(/\.brand\.tape\s+\.brand-mark/.test(nu), 'le logo garde son relais tactile');
    vrai(/\.tabbar\.tape/.test(nu), 'la barre du bas aussi');
    vrai(/:active/.test(nu), 'et les règles d’appui restent');
  });
});

/* ------------------------------------------------------------------
   Un repère de synchronisation ne ment pas
   ------------------------------------------------------------------ */
suite('La synchronisation ne se déclare pas alignée sans l’être', () => {

  /* « Ça fait plusieurs fois que je dois remettre le livret A en épargne de
     précaution, ça se remet en projet prévu. Ça sauvegarde bien le
     changement ? » le propriétaire, 6 août 2026.

     L'écriture, elle, était juste : mesuré dans le navigateur, le changement
     entre bien dans l'état et y reste. Le seul mécanisme du code capable de
     défaire une modification enregistrée, sans un mot, est l'adoption
     silencieuse de la version en ligne au démarrage.

     Elle repose sur un repère : « cet état local est-il resté tel qu'on l'avait
     synchronisé ? ». Si oui, cet appareil est simplement en retard et l'on
     adopte sans demander. Or ce repère était posé sur un chemin de **lecture**,
     sans qu'aucune écriture n'ait eu lieu — il disait « aligné » d'un état qui
     n'avait jamais été envoyé. Cinq étapes suffisaient alors à perdre une
     modification pour de bon, et la dernière ne posait aucune question. */

  function sourceSync() {
    const src = lireSource('assets/cloudsync.js');
    vrai(src, 'assets/cloudsync.js doit être lisible pour ce contrôle');
    return src;
  }

  test('le repère ne se pose que sur une égalité vraie', () => {
    const src = sourceSync();
    const init = src.match(/async function init\(\)[\s\S]*?\n  \}/);
    vrai(init, 'init() doit être trouvable');
    vrai(!/\n\s*if \(localAt\) markSynced\(localAt\);/.test(init[0]),
      'le repère était posé dès que l’état local existait, sans le comparer au '
      + 'cloud ni rien envoyer : il déclarait aligné ce qui ne l’était pas');
    vrai(/localAt === remoteAt/.test(init[0]),
      'il doit se poser sur l’égalité des deux horodatages, la seule preuve '
      + 'd’alignement dont on dispose au démarrage');
  });

  test('un appareil en avance envoie au lieu d’attendre', () => {
    /* L'autre moitié. Un état local plus récent que le cloud est un état jamais
       envoyé : l'envoi différé de huit secondes ne suffit pas quand l'app passe
       en veille avant, et `sendBeacon` ne passe pas toujours. On l'envoie au
       démarrage plutôt que d'attendre la frappe suivante. */
    const src = sourceSync();
    vrai(/aEnvoyer: !aligne && !!localAt/.test(src),
      'init() doit dire à l’appelant que cet appareil porte des modifications non envoyées');
    const app = lireSource('assets/app.js');
    /* En force, et c'est le seul endroit qui le justifie sans question : `init()`
       vient de lire le cloud et d'etablir qu'il est plus ancien, et la base que
       cet appareil connait ne peut pas correspondre — c'est le sens meme de
       « jamais envoye ». Sans `force`, le garde-fou de filiation refuserait
       l'ecriture qu'on sait pourtant la bonne. */
    vrai(/cloud\.aEnvoyer[\s\S]{0,900}?CloudSync\.push\(\{ force: true \}\)/.test(app),
      'et le démarrage doit les envoyer, en force puisque l’arbitrage est déjà tranché');
  });

  test('l’horodatage envoyé est celui qu’on a envoyé', () => {
    /* `markSynced(Store.state.meta.savedAt)` lisait l'état APRÈS l'aller-retour
       réseau. Une frappe pendant ce temps — et l'application écrit à chaque
       caractère — et l'on marquait comme synchronisé un état plus récent que
       celui réellement transmis. */
    const src = sourceSync();
    /* `pushMaintenant` porte l'envoi lui-meme ; `push` ne fait plus que garder
       qu'un seul soit en vol a la fois. C'est la premiere qu'on inspecte. */
    const push = src.match(/async function pushMaintenant\([\s\S]*?\n  \}/);
    vrai(push, 'pushMaintenant() doit être trouvable');
    /* Sans les commentaires : celui de cette fonction cite justement la ligne
       fautive pour expliquer pourquoi elle est partie, et le contrôle se serait
       fait prendre par la prose qui le justifie. */
    const code = push[0].replace(/\/\*[\s\S]*?\*\//g, '');
    vrai(/const envoyeAt = Store\.state\?\.meta\?\.savedAt;/.test(code),
      'l’horodatage doit être relevé au moment de la sérialisation');
    vrai(/markSynced\(envoyeAt\)/.test(code) && !/markSynced\(Store\.state/.test(code),
      'et c’est celui-là qu’on marque, pas l’état du moment où la réponse arrive');
  });

  test('remplacer tout l’état laisse un point de retour', () => {
    /* L'adoption silencieuse remplace le patrimoine entier sur la foi d'un
       repère. Le repère a déjà menti une fois ; une sauvegarde rend l'erreur
       réparable au lieu d'être définitive, et ne coûte rien. */
    const app = lireSource('assets/app.js');
    const bloc = app.match(/if \(cloud\.adopted\) \{[\s\S]*?\n    \} else/);
    vrai(bloc, 'la branche d’adoption doit être trouvable');
    vrai(/Store\.addBackup\(/.test(bloc[0]),
      'une adoption silencieuse doit poser une sauvegarde avant de tout remplacer');
  });

  /* « J'ai encore mis des trucs aujourd'hui, des nouveaux montants. J'ai cliqué
     sur enregistrer. Et quand je reviens sur l'app ils ont disparu. »
     Le propriétaire, 12 aout 2026 — avec la preuve dans ses sauvegardes : six
     « avant adoption de la version en ligne » dans la meme journee.

     Le repere ne mentait pas cette fois. Ce qui etait faux, c'est la conclusion
     qu'un horodatage plus recent designe un contenu plus recent. Un onglet ouvert
     depuis six heures garde en memoire l'etat du matin ; le rafraichissement des
     cours y appelle `Store.save()` toutes les cinq minutes, ce qui estampille
     `savedAt = maintenant` et pousse tout. Contenu perime, estampille fraiche :
     le serveur acceptait, et le telephone adoptait ensuite. */

  test('on n’écrase que la version qu’on a lue', () => {
    /* Dans `_worker.js`, et c'est tout l'objet du controle suivant : le premier
       correctif a ete ecrit dans `functions/api/state.js`, qui ne tourne pas. */
    const src = lireSource('_worker.js');
    vrai(src, '_worker.js doit être lisible pour ce contrôle');
    const bloc = src.match(/async function handleState\([\s\S]*?\n\}/);
    vrai(bloc, 'handleState() doit être trouvable');
    const code = bloc[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    vrai(/params\.get\('base'\)/.test(code),
      'l’écrivain déclare la version qu’il a lue');
    vrai(/base !== prevAt/.test(code),
      'et l’écriture n’est acceptée que si c’est encore celle en place');
    /* L'ancienne regle ne suffisait pas et ne doit pas revenir seule : elle
       comparait deux horloges, or l'onglet perime a toujours la plus fraiche. */
    vrai(!/nextAt < prevAt/.test(code),
      'la comparaison d’horodatages seule ne protège de rien : elle laissait '
      + 'passer un contenu périmé portant une estampille fraîche');
    vrai(/force/.test(code), 'l’arbitrage explicite garde sa porte');
  });

  test('le point d’entrée qu’on teste est celui qui tourne', () => {
    /* Le correctif a d'abord ete ecrit dans `functions/api/state.js`. Chez
       Cloudflare Pages, un `_worker.js` a la racine prend toute la main et le
       dossier `functions/` n'est jamais charge : le defaut est reste en
       production, et un controle qui lisait le fichier mort passait au vert. Le
       depot public l'a note des le 9 aout — « functions/api/ etait du code mort,
       c'est _worker.js qui traite les requetes » — et a supprime le dossier.

       Deux surfaces pour un fait, dont une morte : tant que la copie existe ici,
       ce controle exige qu'elles disent la meme chose. La vraie reponse est de
       supprimer la morte, comme le fork l'a fait. */
    const worker = lireSource('_worker.js');
    vrai(/path === '\/api\/state'\) return handleState/.test(worker),
      'c’est bien _worker.js qui route /api/state');
    /* La copie morte est supprimee, `shared/market.js` avec elle : il n'y a plus
       qu'un seul endroit ou corriger. Le controle reste malgre tout, au cas ou
       quelqu'un recree le dossier en croyant que Pages le charge. */
    const mort = lireSource('functions/api/state.js');
    vrai(!mort || /base !== prevAt/.test(mort),
      'functions/api/ est du code mort chez Pages : soit il n’existe pas, soit il '
      + 'porte la même règle, sinon le prochain correctif ira dans celui qui ne '
      + 'tourne pas');
  });

  test('la base voyage avec l’écriture, beacon compris', () => {
    /* Le `sendBeacon` de la fermeture d'onglet ne peut rien verifier avant de
       partir : c'est precisement pourquoi le garde-fou est cote serveur, et
       pourquoi ce chemin-la doit lui aussi declarer sa base. Un onglet perime
       qu'on ferme envoyait tout son etat d'un coup. */
    const src = sourceSync();
    const push = src.match(/async function pushMaintenant\([\s\S]*?\n  \}/)[0]
      .replace(/\/\*[\s\S]*?\*\//g, '');
    vrai(/base=\$\{encodeURIComponent\(vu\)\}/.test(push),
      'l’envoi ordinaire déclare la version lue');
    const flush = src.match(/function flushOnUnload\([\s\S]*?\n  \}/)[0]
      .replace(/\/\*[\s\S]*?\*\//g, '');
    vrai(/base=\$\{encodeURIComponent\(vu\)\}/.test(flush),
      'le beacon de fermeture aussi');
  });

  test('adopter une version en ligne la note comme lue', () => {
    /* Sinon la sauvegarde suivante declare avoir lu une version qui n'est plus en
       place, et se fait refuser sans raison : le correctif se retournerait contre
       le detenteur qui vient de choisir la version en ligne. */
    const src = sourceSync();
    vrai(/const noterVersionLue = at => markSynced\(at\)/.test(src),
      'cloudsync expose de quoi noter une version lue');
    const app = lireSource('assets/app.js');
    const bloc = app.match(/if \(ok\) \{[\s\S]*?Store\.save\(\);/);
    vrai(bloc, 'la branche « charger celle en ligne » doit être trouvable');
    vrai(/CloudSync\.noterVersionLue\(cloud\.at\)/.test(bloc[0]),
      'et elle note la version adoptée avant d’enregistrer');
  });

  test('un refus se voit ailleurs que sur la page Données', () => {
    /* Une modification qui n'est pas partie est le seul etat de l'application ou
       fermer fait perdre quelque chose. Il se disait sur la seule page ou
       personne ne va apres avoir saisi un montant. */
    const src = sourceSync();
    vrai(/onConflit\(d\)/.test(src), 'le refus appelle un signal');
    const app = lireSource('assets/app.js');
    vrai(/CloudSync\.setOnConflit\(/.test(app), 'que le démarrage branche');
    vrai(/toast\(trad\('Modification gardée ici/.test(app), 'sur un toast immédiat');
    const store = lireSource('assets/store.js');
    vrai(/\['synchro',\s*trad\('Synchronisation'\)/.test(store),
      'et la cloche porte une famille pour ça');
    vrai(/CloudSync\.status\(\)\.conflict/.test(store),
      'alimentée par le conflit réel, pas par une supposition');
    /* La cloche ne parle que de ce qui existe chez celui qui la regarde : sans
       synchro disponible, ce controle n'a rien a dire. */
    vrai(/typeof CloudSync !== 'undefined' && CloudSync\.isAvailable\(\)/.test(store),
      'et elle se tait là où la synchro n’existe pas');
  });
});

/* ------------------------------------------------------------------
   Un compte a deux bouts
   ------------------------------------------------------------------ */
suite('Un compte archivé reste consultable et daté', () => {

  /* « Quand j'archive un compte, je veux pouvoir toujours cliquer dessus, et
     indiquer une date de clôture. On a une date d'ouverture mais pas de
     clôture. » le propriétaire, 6 août 2026.

     La carte des comptes archivés ne rendait que « Restaurer » et une croix :
     le nom n'ouvrait rien. Un compte archivé devenait donc inatteignable, alors
     que c'est justement pour son historique qu'on l'archive plutôt que de le
     supprimer. */

  test('un compte archivé se rend comme les autres', () => {
    /* Il avait sa propre carte, avec ses propres lignes et ses propres boutons :
       une seconde façon d'afficher un compte, à tenir d'accord avec la première.
       Elle rendait ses lignes sans le glissement, sans la variation, sans le
       sous-titre standard — et son nom n'ouvrait rien du tout au départ.

       Le contrôle ne cherche donc plus un attribut dans ce bloc, il vérifie la
       délégation : les archives passent par `ligneCompte`, la fonction qui rend
       toutes les autres. Ce qu'on lui ajoutera demain les couvrira aussi. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.match(/const archives = COMPTES\(\)\.filter[\s\S]*?\n  \}\)\(\)\}/);
    vrai(bloc, 'la carte des comptes archivés doit être trouvable');
    vrai(/ligneCompte\(c\)/.test(bloc[0]),
      'les comptes archivés doivent passer par ligneCompte, comme les autres : '
      + 'une seconde façon de rendre un compte finit par diverger de la première');
    vrai(/groupe\('archives'/.test(bloc[0]),
      'et vivre dans un groupe repliable, comme les autres');
    /* Et `ligneCompte` porte bien la porte vers la fiche : sans cela, la
       délégation ci-dessus ne garantirait rien. */
    const ligne = src.match(/function ligneCompte\(c, avecEtab = true\) \{[\s\S]*?\n\}/);
    vrai(ligne && /data-action="fiche-compte"/.test(ligne[0]),
      'une ligne de compte ouvre sa fiche : c’est ce qui rend un compte archivé '
      + 'consultable, et c’est pour son historique qu’on l’archive');
  });

  test('restaurer se confirme, et ne vit que dans la fiche', () => {
    /* Le bouton était sur chaque ligne de la liste des archives, à portée de
       pouce et sans question, alors que l'action remet un montant dans tous les
       totaux du patrimoine. « En général on ne restaure pas un compte
       archivé. » */
    const src = lireSource('assets/app.js');
    const bloc = src.match(/const archives = COMPTES\(\)\.filter[\s\S]*?\n  \}\)\(\)\}/);
    vrai(!/data-action="restaurer-compte"/.test(bloc[0]),
      'la liste ne porte plus la restauration : elle sert à naviguer, la fiche à agir');
    const acte = src.match(/async 'restaurer-compte'\(btn\) \{[\s\S]*?\n  \},/);
    vrai(acte, 'la restauration doit être trouvable, et attendre une réponse');
    vrai(/askConfirm\(/.test(acte[0]),
      'et se confirmer : c’est un geste qu’on ne veut pas faire en visant autre chose');
    const fiche = src.match(/function viewFicheCompte\(id\) \{[\s\S]*?\n\}/);
    vrai(/data-action="restaurer-compte"/.test(fiche[0]),
      'la fiche, elle, le garde : c’est là qu’on agit sur un compte');
  });

  test('archiver demande la date, restaurer l’efface', () => {
    /* Un état se déclare, il ne se déduit pas : la date se pose au moment où on
       la connaît, et un compte rouvert ne peut pas rester « clôturé le… ». */
    const src = lireSource('assets/app.js');
    const arch = src.match(/async 'archiver-compte'\(btn\) \{[\s\S]*?\n  \},/);
    vrai(arch, 'l’archivage doit être trouvable');
    vrai(/cle: 'clotureLe'/.test(arch[0]),
      'archiver doit demander la date de clôture : c’est le seul moment où on la connaît');
    vrai(/c\.statut = 'archive'/.test(arch[0]), 'et poser le statut');

    const rest = src.match(/'restaurer-compte'\(btn\) \{[\s\S]*?\n  \},/);
    vrai(rest, 'la restauration doit être trouvable');
    vrai(/delete c\.clotureLe/.test(rest[0]),
      'restaurer doit effacer la date : « ouvert » et « clôturé le 12 mars » se '
      + 'contredisent, et c’est la date qu’on croirait');
  });

  test('la date ne s’affiche et ne s’édite que sur un compte clôturé', () => {
    /* L'offrir sur un compte ouvert ferait du formulaire une seconde façon de
       clôturer, muette et sans confirmation — deux surfaces pour un seul fait,
       et la plus discrète l'emporterait. */
    const src = lireSource('assets/app.js');
    const fiche = src.match(/function viewFicheCompte\(id\) \{[\s\S]*?\n\}/);
    vrai(fiche, 'la fiche d’un compte doit être trouvable');
    /* La phrase passe par trad() depuis qu'elle se traduit : le controle suit
       la garde `statut === 'archive'`, pas la langue du libelle. */
    vrai(/c\.statut === 'archive' \? `<dt>\$\{trad\('Date de clôture'\)\}<\/dt>/.test(fiche[0]),
      'la fiche ne montre la date que sur un compte archivé');

    const form = src.match(/async 'modifier-compte'\(btn\)[\s\S]*?\n  \},/);
    vrai(form, 'le formulaire de modification doit être trouvable');
    vrai(/if \(c\.statut === 'archive'\) champs\.push\(/.test(form[0]),
      'et le champ ne s’offre que là aussi');
    vrai(/if \('clotureLe' in v\) pose\('clotureLe', v\.clotureLe\)/.test(form[0]),
      'un champ vidé efface la clé, comme les autres champs de cette fenêtre');
  });
});

/* ------------------------------------------------------------------
   Marchés ne liste plus trois fois les mêmes lignes
   ------------------------------------------------------------------ */
suite('Une page ne liste pas trois fois les mêmes positions', () => {

  /* « Dans positions, on a 3 fois de suite toutes les positions : dans la carte
     ajd, puis performance par ligne, puis lignes de titre. C'est donc bizarre.
     Déjà performance par ligne est aussi dans performance non ? » le propriétaire,
     6 août 2026. Oui, à la fonction près : les deux cartes appelaient
     `rankedBars` sur la plus-value latente par position, triée.

     Il reste deux listes, et elles répondent à deux questions différentes : ce
     qui a bougé aujourd'hui, et ce que je détiens. La plus-value se lit sur la
     page dont c'est le sujet. */

  test('la carte du jour vient avant le reste', () => {
    /* « Bonne idée ou pas, positionner la carte ajd en premier dans positions ?
       C'est ça qui nous intéresse. » Oui : c'est la question qu'on se pose en
       ouvrant la page. */
    const src = lireSource('assets/app.js');
    const vue = src.match(/function viewPositions\(\)[\s\S]*?\n\}/);
    vrai(vue, 'la vue Marchés doit être trouvable');
    const jour = vue[0].indexOf('const j = dayPerformance();');
    const repart = vue[0].indexOf('const st = stockTotals();');
    const titres = vue[0].indexOf('data-anchor="titres"');
    vrai(jour > 0 && repart > 0 && titres > 0, 'les trois cartes doivent exister');
    vrai(jour < repart, 'la carte du jour vient avant la répartition');
    vrai(repart < titres, 'et le tableau des lignes ferme la page');
  });

});

/* ------------------------------------------------------------------
   Un réglage se voit
   ------------------------------------------------------------------ */
suite('L’objectif de dépenses se voit comme un réglage', () => {

  /* « Mettre ça un peu plus flashy, peut-être violet ? On ne voit pas bien où on
     peut changer l'objectif. » le propriétaire, 6 août 2026, capture à l'appui.

     Troisième tentative sur ce réglage : un champ discret sans intitulé, puis un
     champ étiqueté qui doublonnait avec son jumeau de l'onglet voisin, puis un
     montant cliquable souligné d'un pointillé gris — qui ne se voyait pas.

     Celle-ci n'invente rien : elle reprend le signal qui a déjà répondu à la
     même remarque deux cartes plus bas, quand « j'ai mis du temps à comprendre
     que je pouvais cliquer sur le 4 500 » avait valu son chevron au montant des
     revenus. Même problème, même signal. */

  test('le montant porte l’accent et le chevron', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    vrai(/class="hero-delta-chev"/.test(src),
      'le chevron doit annoncer que ce montant s’ouvre');

    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible');
    const nu = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const bloc = nu.match(/\.hero-delta-reglable > b \{[^}]*\}/);
    vrai(bloc, 'la règle du montant réglable doit être trouvable');
    vrai(/color:\s*var\(--accent\)/.test(bloc[0]),
      'le montant doit porter l’accent : le pointillé gris ne se voyait pas');
    vrai(/var\(--accent\)/.test((nu.match(/\.hero-delta-reglable > b \{[^}]*\}/) || [''])[0]
      + (nu.match(/\.hero-delta-reglable > span \{[^}]*\}/) || [''])[0]),
      'et son intitulé aussi, pour que le couple se lise comme une commande');
  });

  test('les deux écarts voisins restent en gris', () => {
    /* C'est le contraste qui désigne. Peindre les trois ferait de l'accent une
       décoration, et il ne dirait plus lequel se règle. */
    const src = lireSource('assets/app.js');
    const vue = src.match(/function viewBudget\([\s\S]*?\n\}/);
    vrai(vue, 'la vue Budget doit être trouvable');
    const reglables = vue[0].match(/hero-delta-reglable/g) || [];
    eq(reglables.length, 1,
      `${reglables.length} écarts réglables : un seul des trois se règle, et c’est `
      + 'ce qui rend l’accent lisible');
  });

  test('les deux portes de l’objectif mènent au même réglage', () => {
    /* Le montant de la carte du mois et la barre « Objectif dépenses » ouvrent
       la même fenêtre. Deux portes sur un même champ sont saines ; deux champs
       ne le seraient pas, et c'est ce qui avait été retiré. */
    const src = lireSource('assets/app.js');
    const portes = src.match(/data-action="regler-objectif-depenses"/g) || [];
    eq(portes.length, 2, `deux portes attendues, ${portes.length} trouvée·s`);
    const champs = src.match(/data-path="meta\.monthlyTarget"|budget\.monthlyTarget'/g) || [];
    vrai(champs.length <= 1,
      'un seul champ pour l’objectif : deux ne peuvent pas se vérifier l’un l’autre');
  });
});

/* ------------------------------------------------------------------
   La barre du haut revient après un battement, pas au premier tremblement
   ------------------------------------------------------------------ */
suite('La barre du haut ne revient pas au moindre geste', () => {

  /* « Je trouve que le menu revient trop vite quand on redéfile vers le haut,
     il faudrait un battement, genre un tiers d'écran de slide avant que ça
     revienne. » le propriétaire, 6 août 2026.

     Le motif du marché — `enterAlways` de Material 3 — rend la barre au premier
     geste vers le haut. En lecture, on remonte sans arrêt de quelques dizaines
     de pixels : pour relire une ligne, pour revoir un total qu'on vient de
     dépasser. Chacune de ces corrections faisait retomber la barre sur le
     contenu, et elle repartait au geste suivant.

     Le mécanisme vit dans un écouteur de défilement, sans autre dépendance que
     `window` et `document.body.classList` : on l'extrait de sa source et on le
     joue avec une fenêtre et un corps de comédie. Une assertion sur le
     comportement vaut mieux qu'une recherche de motif — et ici elle décrit
     exactement les gestes qu'un doigt peut faire. */
  function barre(hauteur = 900) {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.match(/\n  \(\(\) => \{\n    const SEUIL = 64, PAS = 6;[\s\S]*?\n  \}\)\(\);/);
    vrai(bloc, 'le mécanisme de la barre du haut doit être trouvable');

    const classes = new Set();
    const corps = {
      classList: {
        contains: c => classes.has(c),
        add: c => classes.add(c),
        remove: c => classes.delete(c),
        toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
      },
    };
    const ecouteurs = {};
    const fenetre = {
      scrollY: 0, innerHeight: hauteur,
      addEventListener: (nom, fn) => { (ecouteurs[nom] = ecouteurs[nom] || []).push(fn); },
    };
    /* `modalesOuvertes` est passé à zéro : ce contrôle porte sur le geste de
       lecture, pas sur la garde des fenêtres, qui a sa propre raison d'être. */
    new Function('window', 'document', 'modalesOuvertes', bloc[0])(fenetre, { body: corps }, 0);

    return {
      hauteur,
      cachee: () => classes.has('haut-cache'),
      sousPage: () => classes.add('sous-page'),
      /* Un geste, en une fois : le mécanisme ne compte que des distances, la
         vitesse ne l'intéresse pas. */
      vers: y => { fenetre.scrollY = y; (ecouteurs.scroll || []).forEach(fn => fn()); },
      changerDePage: () => (ecouteurs.hashchange || []).forEach(fn => fn()),
    };
  }

  test('descendre la retire, une fois passé le haut de page', () => {
    const b = barre();
    b.vers(40);
    vrai(!b.cachee(), 'sous le seuil on est encore en haut de page, la barre y reste');
    b.vers(600);
    vrai(b.cachee(), 'plus bas, elle se retire');
  });

  test('une correction de lecture ne la ramène pas', () => {
    /* Le défaut signalé, au geste près : on descend, on remonte de quarante
       pixels pour relire, la barre retombait sur le texte. */
    const b = barre();
    b.vers(600);
    vrai(b.cachee(), 'elle est retirée');
    b.vers(560);
    vrai(b.cachee(), 'quarante pixels vers le haut ne la ramènent pas');
    b.vers(520);
    vrai(b.cachee(), 'ni quatre-vingts');
  });

  test('un tiers d’écran la ramène', () => {
    const b = barre(900);
    b.vers(900);
    vrai(b.cachee(), 'elle est retirée');
    b.vers(900 - (b.hauteur / 3 - 20));
    vrai(b.cachee(), 'juste sous le battement, elle ne bouge pas encore');
    b.vers(900 - (b.hauteur / 3 + 20));
    vrai(!b.cachee(), 'passé le tiers d’écran cumulé, elle revient');
  });

  test('le battement se cumule, et une reprise vers le bas le remet à zéro', () => {
    /* C'est ce zéro qui distingue lire de vouloir revenir : une remontée hachée
       de corrections successives ne doit pas finir par déclencher le retour. */
    const b = barre(900);
    b.vers(1200);
    for (let i = 1; i <= 4; i++) b.vers(1200 - i * 50);      // 200 px cumulés
    vrai(b.cachee(), 'quatre corrections de cinquante pixels restent sous le battement');
    b.vers(1050);                                            // on repart vers le bas
    b.vers(1000);
    b.vers(950);                                             // 100 px, compteur remis à zéro
    vrai(b.cachee(), 'le compteur est reparti de zéro, la barre reste retirée');

    /* Et un vrai geste, lui, la ramène d'un coup. */
    b.vers(600);
    vrai(!b.cachee(), 'un lancer de trois cent cinquante pixels la ramène');
  });

  test('revenir au sommet la ramène sans battement', () => {
    /* Sinon la page du haut pourrait rester décapitée : sur un écran haut, le
       tiers demandé peut dépasser ce qui reste à remonter. */
    const b = barre(900);
    b.vers(200);
    vrai(b.cachee(), 'elle est retirée');
    b.vers(0);
    vrai(!b.cachee(), 'arriver en haut de page la rend, quoi qu’ait fait le compteur');
  });

  test('une sous-page garde la sienne, et changer d’écran la rend', () => {
    const b = barre();
    b.sousPage();
    b.vers(800);
    vrai(!b.cachee(), 'une sous-page ne cache jamais sa barre : elle y porte le retour');

    const c = barre();
    c.vers(800);
    vrai(c.cachee(), 'retirée');
    c.changerDePage();
    vrai(!c.cachee(), 'changer d’écran la rend : on arrive en haut d’une page neuve');
  });

  test('le battement se mesure en fraction d’écran, pas en pixels', () => {
    /* Sur un iPhone SE et sur une tablette, le même geste couvre une fraction
       d'écran comparable, pas une distance comparable. */
    const petit = barre(600), grand = barre(1200);
    petit.vers(900); grand.vers(900);
    petit.vers(900 - 250); grand.vers(900 - 250);
    vrai(!petit.cachee(), 'deux cent cinquante pixels dépassent le tiers d’un petit écran');
    vrai(grand.cachee(), 'mais pas celui d’un grand');
  });
});

/* ------------------------------------------------------------------
   La barre latérale reste, et se laisse parcourir
   ------------------------------------------------------------------ */
suite('La barre latérale ne s’en va pas avec la page', () => {

  /* « Bonne idée ou pas, que ce menu défile avec l'écran quand on défile vers le
     bas ou le haut ? » le propriétaire, 6 août 2026. Non — et surtout, il le
     faisait déjà, ce qui n'était pas un choix mais un défaut.

     Mesure à 1 280 × 900 sur un document de 2 062 px : la barre, pourtant en
     `position: sticky; top: 0`, était à `top: -800px` après un défilement de
     800. Pas un pixel de retenue.

     La cause n'est pas dans sa règle mais deux cents lignes plus haut :
     `html, body { height: 100% }` plafonnait le corps à la hauteur de l'écran.
     Or le corps est la grille qui porte cette barre, donc sa zone de grille
     faisait exactement la hauteur de la barre — et un élément collé n'a de
     course que dans son bloc conteneur.

     Ce que ça coûtait : le pied de cette barre porte le patrimoine net en
     permanence, au point que l'accueil a perdu une carte entière au motif qu'il
     y est « déjà écrit en permanence ». Il s'en allait au premier défilement. */

  function cssNuDeLaFeuille() {
    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  test('le corps peut dépasser l’écran, sinon rien ne peut y coller', () => {
    const nu = cssNuDeLaFeuille();
    vrai(!/\bhtml,\s*body\s*\{[^}]*\bheight:\s*100%/.test(nu),
      'le corps ne doit plus être plafonné à la hauteur de l’écran : sa grille '
      + 'est le bloc conteneur de la barre latérale, et une zone aussi haute que '
      + 'la barre ne lui laisse aucune course');
    const corps = nu.split('}').find(b => b.split('{')[0].trim() === 'body');
    vrai(corps, 'la règle « body » doit exister');
    vrai(/min-height:\s*100%/.test(corps),
      'et il ne descend pas sous un écran : c’est ce qui garde le fond peint '
      + 'd’un bord à l’autre sur une page courte');
  });

  test('la première règle « body » est bien celle de la police', () => {
    /* Le contrôle de la police des montants cherche « le bloc dont le sélecteur
       est exactement body », et prend le premier. Il y en a plusieurs — les
       requêtes média en portent — mais celui de tête doit rester le principal :
       une règle du même nom glissée avant lui ferait lire autre chose que ce
       qu'il croit lire. C'est arrivé en écrivant ce correctif, et c'est le test
       de la police qui l'a attrapé. */
    const nu = cssNuDeLaFeuille();
    const premier = nu.split('}').find(b => b.split('{')[0].trim() === 'body');
    vrai(premier, 'la règle « body » doit exister');
    vrai(/font-family:\s*var\(--font\)/.test(premier),
      'la première règle « body » de la feuille doit être la règle principale : '
      + 'c’est elle que le contrôle de la police lit');
  });

  test('elle reste collée en haut, et défile en elle-même si elle déborde', () => {
    /* Deux choses distinctes, et la seconde est l'autre moitié du défaut :
       dans une fenêtre de 560 px de haut, son contenu en fait 655. Sans
       défilement interne, le pied — patrimoine net et témoin de sauvegarde —
       était purement inatteignable. */
    const nu = cssNuDeLaFeuille();
    const regle = nu.split('}').find(b => b.split('{')[0].trim() === '.sidebar'
      && /position:/.test(b));
    vrai(regle, 'la règle de la barre latérale doit être trouvable');
    vrai(/position:\s*sticky/.test(regle) && /top:\s*0/.test(regle),
      'elle se colle en haut de la fenêtre');
    vrai(/overflow-y:\s*auto/.test(regle),
      'et se laisse parcourir quand elle ne tient pas : sinon son pied est perdu '
      + 'sur un écran court');
    vrai(/overscroll-behavior:\s*contain/.test(regle),
      'sans emporter la page une fois son bas atteint');
  });
});

/* ------------------------------------------------------------------
   Un montant masqué reste un dessin, jamais du balisage en clair
   ------------------------------------------------------------------ */
suite('Le mode masqué n’imprime pas ses balises', () => {

  /* « Gros bug sur certaines cartes en mode masqué », capture à l'appui.
     Trouvé en balayant les dix vues masque actif : la ligne « Liquidités »
     d'Allocation affichait cent caractères de balisage à la place de son
     sous-titre, « dont 1 856 € à investir ».

     Un montant masqué n'est pas du texte : c'est une balise SVG, l'œil barré
     qui remplace les chiffres. Une note qui mêle du texte libre et un montant
     doit donc passer par `escMontant`, qui échappe tout puis restitue le seul
     fragment que nous ayons produit — et non par `esc`, qui l'imprime en clair.

     La règle reste `esc` partout ailleurs : une note saisie par l'utilisateur ne
     doit jamais traverser. Ce contrôle vérifie donc les deux sens. */

  test('une note qui porte un montant passe par escMontant', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    /* Les producteurs : les notes construites avec un formateur de montant. */
    const producteurs = [...src.matchAll(/note:[\s\S]{0,160}?\$\{fmt(EUR|Signed|Pct)/g)];
    vrai(producteurs.length,
      'au moins une note doit être construite à partir d’un montant, sinon ce '
      + 'contrôle ne protège plus rien');

    /* Le consommateur de celle d'Allocation, la seule dans ce cas. */
    vrai(/\$\{escMontant\(i\.note\)\}/.test(src),
      'la note de la table d’allocation doit passer par escMontant : elle porte '
      + '« dont X € à investir », et un montant masqué est une balise');
    vrai(!/\$\{esc\(i\.note\)\}/.test(src),
      'et surtout pas par esc, qui l’imprimerait en clair');
  });

  test('les notes saisies restent échappées', () => {
    /* L'autre moitié, et elle compte autant : `escMontant` sur une note tapée
       par l'utilisateur laisserait passer un fragment de balisage si quelqu'un
       collait le dessin de l'œil dans un commentaire de mois. Ces notes-là
       gardent l'échappement strict. */
    const src = lireSource('assets/app.js');
    vrai(/\$\{esc\(cur\.note\)\}/.test(src),
      'le commentaire d’un mois est une saisie : il reste échappé');
    /* La note passe par trad() depuis qu'elle se traduit, mais esc() reste la
       derniere barriere : la traduction se fait DANS l'echappement, jamais
       apres lui. L'ordre inverse laisserait passer le balisage d'une entree
       anglaise. */
    vrai(/\$\{esc\(trad\(x\.note\)\)\}/.test(src),
      'la note d’un palier d’autonomie est de la prose : elle aussi, et esc() reste dehors');
  });

  test('escMontant ne laisse passer que ce que nous produisons', () => {
    /* Le fragment restitué est comparé à celui que nous avons fabriqué, échappé.
       Rien d'autre ne traverse : c'est ce qui distingue cette variante d'un
       simple `innerHTML`. */
    const src = lireSource('assets/app.js');
    const bloc = src.match(/const escMontant = s => \{[\s\S]*?\n\};/);
    vrai(bloc, 'escMontant doit être trouvable');
    vrai(/const t = esc\(s\);/.test(bloc[0]),
      'elle échappe tout d’abord : un texte saisi ne doit jamais traverser');
    vrai(/split\(esc\(OEIL_MASQUE\)\)\.join\(OEIL_MASQUE\)/.test(bloc[0]),
      'puis restitue le seul fragment que nous ayons produit, reconnu sous sa '
      + 'forme échappée');
  });

  test('aucun montant formaté ne part dans un canal texte', () => {
    /* La fenetre « Mois au-dessus de l'objectif » entierement recouverte de
       balisage, photo du 8 aout 2026 : son sous-titre compose « objectif
       ${fmtEUR0(cible)} par mois » et partait dans textContent, qui imprime
       une balise au lieu de la dessiner.

       Corriger cette fenetre seule referait le defaut au prochain apercu — une
       quarantaine composent leurs textes ainsi. La regle se derive donc de la
       source : une affectation `.textContent =` ne peut pas porter un
       formateur de montant dans sa propre expression. Ceux qui en portent un
       passent par escMontant et innerHTML, comme les tuiles et les
       notifications le font depuis le premier correctif. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    for (const m of src.matchAll(/\.textContent = [^;]{0,300}/g)) {
      vrai(!/fmt(EUR0?|Cur|Signed|Mois)\(|masque\(/.test(m[0]),
        'un montant formaté est une balise en mode discret, il ne peut pas '
        + `partir dans textContent : ${m[0].slice(0, 90)}`);
    }

    /* Et les canaux des apercus, la ou la photo a ete prise : le sous-titre,
       la note du total et les meta de lignes recoivent des chaines composees
       par une quarantaine de producteurs — ils passent par escMontant, a
       l'ouverture comme au rafraichissement. */
    for (const canal of [/#modalSub'\)\.innerHTML = escMontant\(a\.sous/g,
                         /escMontant\(noteApercu\(a\)\)/g,
                         /escMontant\(l\.meta\)/g]) {
      vrai((src.match(canal) || []).length >= 2,
        `le canal ${canal.source.slice(0, 40)} doit passer par escMontant à `
        + 'l’ouverture et à la mise à jour');
    }
  });
});

/* ------------------------------------------------------------------
   L'échelle visuelle est fermée

   Mesure du 9 août 2026, avant fermeture : 23 rayons distincts, 16
   graisses, 6 ombres noires écrites en dur et identiques dans les deux
   thèmes. Aucune de ces différences n'était une décision — 7 px contre
   8 px ne se voit pas — mais leur somme se voit : une interface dont
   aucun coin ne répond au voisin a l'air assemblée, pas dessinée.

   La règle est celle des couleurs, déjà en place plus haut : une échelle
   se ferme, et la valeur suivante demande d'élargir l'échelle, pas de
   glisser une valeur orpheline. Ces contrôles se dérivent de la feuille
   entière : la règle écrite demain est déjà couverte.
   ------------------------------------------------------------------ */
suite('L’échelle visuelle est fermée', () => {

  const feuille = () => (lireSource('assets/styles.css') || '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  test('les rayons viennent de l’échelle, pas du pifomètre', () => {
    /* Autorisé : les jetons (var), 0, les pourcentages, les micro-arrondis
       jusqu'à 4 px (ils suivent la hauteur d'une barre ou d'une coche, pas
       l'échelle), et 16 px et plus (le tiroir mobile arrondit à 20, un cran
       au-dessus des cartes, et c'est voulu : c'est une surface d'un autre
       ordre). Interdit : tout rayon nu de 5 à 15 px — il a un jeton — et les
       pilules écrites 99 ou 999. */
    const css = feuille();
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    const decls = [...css.matchAll(/border-radius:([^;}]*)/g)];
    vrai(decls.length > 40, 'la feuille déclare bien ses rayons');
    for (const d of decls) {
      for (const [, n] of d[1].matchAll(/(\d+(?:\.\d+)?)px/g)) {
        const v = parseFloat(n);
        vrai(v <= 4 || v >= 16,
          `rayon nu de ${v}px : entre 5 et 15 px, l’échelle a un jeton `
          + `(--radius-xs 6, --radius-sm 9, --radius 14) — ${d[0].slice(0, 60)}`);
        vrai(v !== 99 && v !== 999,
          `une pilule s’écrit var(--radius-pill), pas ${v}px`);
      }
    }
  });

  test('les graisses viennent de l’échelle', () => {
    /* Huit paliers, chacun un rôle : 400 prose, 500 interface, 550 libellé
       appuyé, 600 accentué, 650 titres et chiffres, 680 titres Manrope, 700
       gras fort, 720 héros de page. Les 450, 560, 620, 640, 740, 750 et 760
       qui vivaient entre deux paliers n'étaient pas des nuances : personne ne
       distingue 640 de 650, et chaque écart était une occasion de diverger. */
    const css = feuille();
    const permis = new Set([400, 500, 550, 600, 650, 680, 700, 720]);
    const decls = [...css.matchAll(/font-weight: *(\d+)(?! *\d)/g)];
    vrai(decls.length > 60, 'la feuille déclare bien ses graisses');
    for (const [, p] of decls) {
      vrai(permis.has(+p),
        `graisse ${p} hors échelle : les paliers sont ${[...permis].join(', ')}`);
    }
  });

  test('aucune ombre noire écrite en dur : trois niveaux, réglés par thème', () => {
    /* Un menu, une infobulle et une fenêtre portaient chacun leur propre noir,
       le même dans les deux thèmes : 45 % de noir sous un menu en thème clair
       pèse trois fois trop lourd. `--shadow` pose, `--ombre-flottante`
       détache, `--ombre-fenetre` recouvre — et chaque thème règle sa densité
       dans son bloc de jetons, seul endroit où le noir a le droit de
       s'écrire. */
    const css = feuille();
    for (const d of css.matchAll(/box-shadow:([^;}]*)/g)) {
      /* Les biseaux `inset` sont de la matiere, pas de l'elevation : le verre
         de l'ovale melange un liseret clair et une penombre interne, regles
         sur un vrai telephone. L'echelle des ombres ne gouverne que ce qui
         flotte au-dessus de la page. */
      if (/inset/.test(d[1])) continue;
      vrai(!/rgba\(0, ?0, ?0/.test(d[1]),
        `ombre noire en dur hors jetons : ${d[0].slice(0, 70)}`);
    }
    /* Et les jetons existent dans les deux thèmes, sans quoi le sombre
       hériterait des densités du clair. */
    const brut = lireSource('assets/styles.css') || '';
    for (const jeton of ['--ombre-flottante', '--ombre-fenetre']) {
      vrai((brut.match(new RegExp(`${jeton}:`, 'g')) || []).length === 2,
        `${jeton} se règle dans les deux thèmes`);
    }
  });

  test('les règles d’une tuile vivent une fois', () => {
    /* Les trois règles de tuile existaient en deux exemplaires contradictoires
       à quarante lignes d'écart — 23/700 contre 24/620 pour le chiffre. L'écran
       rendait la fusion des deux, propriété par propriété : retoucher un
       exemplaire ne changeait que la moitié du rendu, sans erreur nulle part. */
    const css = feuille();
    for (const sel of ['.tile .t-label', '.tile .t-value', '.tile .t-meta']) {
      const n = (css.match(new RegExp(sel.replace(/[.]/g, '\\.') + ' *\\{', 'g')) || []).length;
      eq(n, 1, `${sel} doit être déclaré une seule fois, il l’a déjà été deux`);
    }
  });

  test('l’espacement en ligne suit les paliers 4, 8 et 12', () => {
    /* 196 styles en ligne dans les gabarits, dont des marges à 6, 10, 12, 14
       et 16 px pour le même geste — pousser un bloc sous son voisin. Personne
       ne choisissait entre 10 et 12 : c'était la valeur du jour. Trois paliers
       suffisent — micro, serré, courant ; au-delà, c'est une classe de la
       feuille qui décide. Les marges composées (quatre valeurs, ou mêlées à
       une autre propriété) restent hors du contrôle : elles règlent des cas
       de mise en page, pas un empilement. */
    const src = lireSource('assets/app.js') || '';
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    for (const m of src.matchAll(/style="margin(?:-top|-bottom)?:(\d+)px(?: 0 0)?"/g)) {
      vrai(['4', '8', '12'].includes(m[1]),
        `marge en ligne de ${m[1]}px : les paliers sont 4, 8 et 12 — ${m[0]}`);
    }
  });
});

/* ------------------------------------------------------------------
   La cloche réclame le jour où l'on fait ses comptes
   ------------------------------------------------------------------ */
suite('Le rappel des saisies attend son jour', () => {

  /* « Certains auront peut-être leur salaire en milieu de mois et voudront
     relever à ce moment. » le propriétaire, 6 août 2026.

     La cloche réclamait le relevé dès le 1er. Quelqu'un payé le 15 voyait donc
     la pastille allumée quinze jours pour rien — et une alerte qu'on apprend à
     ignorer ne sert plus à rien le jour où elle a raison. */

  test('avant le jour dit, rien n’est réclamé', () => {
    Fixture.poser();
    auJour('2026-03-05', () => {
      Store.state.meta.jourRappel = 15;
      eq(currentMonthPending().missing, false,
        'le relevé n’est pas réclamé avant le 15');
      eq(depensesEnAttente().missing, false, 'les dépenses non plus');
      const dits = notifications().filter(n => /Relevé|dépenses/i.test(n.title));
      eq(dits.length, 0, `la cloche parle quand même : ${dits.map(n => n.title).join(', ')}`);
    });
  });

  test('à partir du jour dit, les deux sont réclamées', () => {
    Fixture.poser();
    auJour('2026-03-15', () => {
      Store.state.meta.jourRappel = 15;
      eq(currentMonthPending().missing, true, 'le jour venu, le relevé se réclame');
      eq(depensesEnAttente().missing, true, 'les dépenses du mois clos aussi');
    });
    auJour('2026-03-28', () => {
      Store.state.meta.jourRappel = 15;
      eq(currentMonthPending().missing, true, 'et les jours suivants, jusqu’à la saisie');
    });
  });

  test('le défaut ne change rien au comportement d’avant', () => {
    /* Le test de non-régression : sans réglage, la cloche réclame du 1er au 31,
       comme elle l'a toujours fait. */
    Fixture.poser();
    auJour('2026-03-01', () => {
      delete Store.state.meta.jourRappel;
      eq(jourRappel(), 1, 'le premier du mois par défaut');
      eq(currentMonthPending().missing, true, 'et le 1er, tout est déjà réclamé');
    });
  });

  test('le jour se borne à 28, parce que février existe', () => {
    Fixture.poser();
    Store.state.meta.jourRappel = 31;
    eq(jourRappel(), 28,
      'un jour 31 ne serait jamais atteint sept mois par an, et le rappel se '
      + 'tairait sans raison lisible');
    Store.state.meta.jourRappel = 0;
    eq(jourRappel(), 1, 'et zéro n’est pas un jour du mois');
  });

  test('« vide » reste vrai avant le jour dit', () => {
    /* Le fait sur les données et la décision de le dire sont deux choses : la
       page des relevés marque la ligne du mois en cours quoi qu'il arrive, seul
       le rappel attend. Les confondre aurait fait disparaître le repère visuel
       de la ligne à remplir. */
    Fixture.poser();
    auJour('2026-03-05', () => {
      Store.state.meta.jourRappel = 15;
      eq(currentMonthPending().vide, true, 'le mois est bien vide, et la page le dit');
      eq(currentMonthPending().missing, false, 'mais la cloche attend');
    });
  });
});

/* ------------------------------------------------------------------
   Un mois sauté ne disparaît pas des radars
   ------------------------------------------------------------------ */
suite('Un mois resté vide se signale', () => {

  /* « Si un mois entier n'est pas rempli alors qu'on est au mois suivant, on
     fait quoi ? » Presque rien, jusqu'ici.

     Le rappel du relevé ne regarde que le mois en cours, celui des dépenses que
     le mois clos : un mois sauté sortait du champ des deux le 1er du mois
     suivant. Un contrôle de cohérence rattrapait une partie du cas, mais
     seulement les trous **encadrés** par deux mois remplis — sauter juillet et
     août en septembre n'en est pas un, rien ne suit.

     Ce n'est pas une saisie en retard, c'est un trou qui ne se voit pas : les
     moyennes continuent de se calculer, sur moins de points. Le coût de la vie,
     l'autonomie financière et le rythme d'accumulation sortent de ces tables. */

  test('un mois vide derrière soi est signalé, dans les deux tables', () => {
    auJour('2026-06-10', () => {
      /* Des dates au 1er : `isCalendarMonth` ne reconnaît qu'elles. Une ligne
         au 31 est une clôture ponctuelle, pas un mois du calendrier, et elle est
         écartée à dessein — on ne réclame pas un mois que personne n'a ouvert. */
      Fixture.poser(s => {
        s.monthly = [
          { date: '2026-01-01', comment: '', v: { c_courant: 3000 } },
          { date: '2026-02-01', comment: '', v: {} },
          { date: '2026-03-01', comment: '', v: { c_courant: 3100 } },
        ];
        s.budget.expenses = [
          { month: '2026-01-01', v: { Courses: 400 }, note: '' },
          { month: '2026-02-01', v: {}, note: '' },
          { month: '2026-03-01', v: { Courses: 420 }, note: '' },
        ];
      });
      eq(trousReleves().length, 1, 'février manque au relevé');
      eq(trousDepenses().length, 1, 'et aux dépenses');
      const dits = healthChecks().filter(c => /Trou dans l/.test(c.title));
      eq(dits.length, 2, `les deux tables doivent être signalées, ${dits.length} l’est`);
    });
  });

  test('un trou en fin d’historique compte aussi', () => {
    /* Le cas exact de la question, et celui que l'ancien contrôle laissait
       passer : les mois vides ne sont suivis de rien. */
    auJour('2026-06-10', () => {
      Fixture.poser(s => {
        s.monthly = [
          { date: '2026-03-01', comment: '', v: { c_courant: 3000 } },
          { date: '2026-04-01', comment: '', v: {} },
          { date: '2026-05-01', comment: '', v: {} },
        ];
      });
      eq(trousReleves().length, 2, 'avril et mai manquent, et rien ne les suit');
    });
  });

  test('les mois d’avant le premier rempli ne comptent pas', () => {
    /* Le calendrier ouvre douze mois d'avance. Sans cette garde, une
       installation neuve annoncerait « onze mois vides » le jour de son premier
       relevé — le contrôle serait faux dès la première utilisation. */
    auJour('2026-06-10', () => {
      Fixture.poser(s => {
        s.monthly = [
          { date: '2026-01-01', comment: '', v: {} },
          { date: '2026-02-01', comment: '', v: {} },
          { date: '2026-03-01', comment: '', v: { c_courant: 3000 } },
        ];
      });
      eq(trousReleves().length, 0,
        'on ne signale que les trous à l’intérieur de ce qu’on a commencé à tenir');
    });
  });

  test('le mois en cours n’est pas un trou', () => {
    /* Il a déjà son rappel, et il n'est pas en retard tant qu'il n'est pas
       fini. Le compter ici ferait dire deux choses du même mois. */
    auJour('2026-06-10', () => {
      Fixture.poser(s => {
        s.monthly = [
          { date: '2026-05-01', comment: '', v: { c_courant: 3000 } },
          { date: '2026-06-01', comment: '', v: {} },
        ];
      });
      eq(trousReleves().length, 0, 'juin est en cours, pas manquant');
    });
  });

  test('les deux tables partagent le même parcours', () => {
    /* Deux copies de ce calcul auraient fini par ne plus dire la même chose :
       les relevés et les dépenses vivent dans des tables de formes différentes,
       et c'est exactement le genre d'écart qui ne se voit pas. */
    const src = lireSource('assets/store.js');
    vrai(src, 'assets/store.js doit être lisible pour ce contrôle');
    vrai(/const trousReleves = \(\) => moisVides\(/.test(src)
      && /const trousDepenses = \(\) => moisVides\(/.test(src),
      'les deux doivent dériver de moisVides()');
  });
});

/* ------------------------------------------------------------------
   Un onglet du bas ramène toujours à sa page d'accueil
   ------------------------------------------------------------------ */
suite('Un onglet du bas ramène à son premier sous-onglet', () => {

  /* « Quand je clique sur aperçu je dois revenir à l'onglet ajd, même si je suis
     sur l'autre onglet. » le propriétaire, 6 août 2026.

     L'onglet retenait le clic quand on était « déjà dessus », pour se contenter
     de remonter en haut de page. Mais « déjà dessus » se jugeait sur la vue, pas
     sur l'adresse — et ces deux choses diffèrent dès qu'une vue a des
     sous-onglets : sur Projection, l'adresse est `#/objective` et la vue reste
     `overview`. L'onglet se croyait donc actif, retenait le clic, et l'adresse
     ne changeait jamais. */

  test('« déjà sur place » se juge sur l’adresse, pas sur la vue', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.match(/\$\('#tabbar'\)\?\.addEventListener\('click'[\s\S]*?\n  \}\);/);
    vrai(bloc, 'l’écouteur de la barre du bas doit être trouvable');
    vrai(/lien\.getAttribute\('href'\) !== location\.hash/.test(bloc[0]),
      'le clic ne doit être retenu que si l’adresse est identique : sinon un '
      + 'sous-onglet ouvert empêche de revenir au premier');
    vrai(!/lien\.dataset\.view !== currentView\(\)/.test(bloc[0]),
      'comparer la vue laissait « Aperçu » inerte depuis Projection');
  });

  test('et l’adresse de base remet le premier sous-onglet', () => {
    /* L'autre moitié : laisser le lien naviguer ne suffirait pas si la vue
       gardait le dernier sous-onglet choisi. Cette règle existait déjà pour le
       menu latéral, elle sert aux deux. */
    const src = lireSource('assets/app.js');
    vrai(/if \(SOUS_ONGLETS\[v\]\) sousOngletActif\[v\] = SOUS_ONGLETS\[v\]\[0\]\[0\];/.test(src),
      'arriver sur l’adresse de base doit rouvrir le premier sous-onglet');
  });
});

/* ------------------------------------------------------------------
   Une fiche de ligne dit toujours la même chose au même endroit
   ------------------------------------------------------------------ */
suite('Une fiche de ligne garde son ordre', () => {

  /* « Selon la fiche rien n'est dans le même ordre. » le propriétaire, 6 août 2026,
     deux captures côte à côte : Uber et Nvidia.

     Uber n'a ni ISIN, ni pays d'émission, ni nom officiel. Ces lignes ne se
     rendaient que si elles avaient une valeur, donc tout ce qui suit —
     aujourd'hui, plus-value, clôture de la veille, part du portefeuille —
     remontait de trois crans d'une fiche à l'autre. On ne peut apprendre où vit
     un chiffre que s'il est toujours au même endroit, et cette fiche s'ouvre
     plusieurs fois par jour.

     Une valeur absente se dit donc, elle ne fait pas disparaître sa ligne.
     C'est déjà ce que fait le plafond d'un livret, pour la même raison. */

  /* Les six intitulés, dans l'ordre, tels que la fiche doit les rendre. */
  const ATTENDUS = ['Nature', 'ISIN', 'Pays d’émission', 'Place',
                    'Nom officiel', 'Émetteur'];

  function blocIdentite() {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const m = src.match(/<dl class="kv kv-texte">[\s\S]*?<\/dl>/);
    vrai(m, 'le bloc d’identité de la fiche doit être trouvable');
    return m[0];
  }

  test('les six lignes se rendent toujours, dans le même ordre', () => {
    const bloc = blocIdentite();
    /* Les intitules passent par trad() depuis le chantier des deux langues :
       la clef reste la phrase francaise, c'est elle que ce test compare. */
    const rendus = [...bloc.matchAll(/ligne\((?:trad\()?'([^']+)'/g)].map(x => x[1]);
    eq(rendus.join(' | '), ATTENDUS.join(' | '),
      'les intitulés doivent tous être là, dans cet ordre : c’est ce qui permet '
      + 'de savoir où regarder sans lire');
  });

  test('aucune ligne n’est conditionnée à sa valeur', () => {
    /* Le défaut exact : `${p.isin ? ligne(…) : ''}`. Un seul survivant suffirait
       à décaler tout le bloc des chiffres sur les fiches qui en manquent. */
    const bloc = blocIdentite();
    vrai(!/\?\s*ligne\(/.test(bloc),
      'une ligne rendue seulement si elle a une valeur décale tout ce qui la '
      + 'suit dès qu’elle manque');
    const conditionnees = (bloc.match(/\$\{[a-zA-Z.]+\s*(&&|\?)[^}]*ligne\(/g) || []);
    eq(conditionnees.length, 0,
      `${conditionnees.length} ligne(s) encore conditionnelle(s) : ${conditionnees.join(', ')}`);
  });

  test('une valeur absente dit pourquoi, elle ne dit pas « vide »', () => {
    /* La différence entre un trou et une réponse : « identique au nom de la
       ligne » règle la question, « se déduit de l'ISIN » dit où la remplir.
       Un tiret n'aurait rien appris, et le tiret cadratin est proscrit du texte
       affiché. */
    const bloc = blocIdentite();
    /* « Non renseigné » a disparu de l'ISIN le 6 août : il désignait un défaut
       là où il n'y en a pas — une cryptomonnaie n'a pas d'ISIN, une ligne saisie
       à la main non plus. Ces cas disent « sans objet », et le vrai manque dit
       où le trouver. */
    for (const mot of ['sans objet', 'à copier depuis ton courtier', 'se déduit de l’ISIN',
                       'identique au nom de la ligne', 'se déduit du nom d’un fonds']) {
      vrai(bloc.includes(mot), `l’état vide « ${mot} » doit exister`);
    }
    vrai(!/—/.test(bloc), 'aucun tiret cadratin dans le texte affiché');
  });
});

/* ------------------------------------------------------------------
   La barre du haut ne découpe pas ce qui en sort
   ------------------------------------------------------------------ */
suite('Le panneau des notifications n’est pas rogné par sa barre', () => {

  /* « Le bouton notifications ne marche plus sur téléphone, rien ne s'affiche. »
     Le propriétaire, 6 août 2026. Il marchait : le panneau s'ouvrait, on ne le
     voyait pas.

     La cause est une régression du correctif de la veille. La barre latérale a
     reçu `overflow-y: auto` pour qu'un écran court ne rende pas son pied
     inatteignable — juste pour le rail vertical de l'ordinateur. Or sous 768 px,
     ce même sélecteur est la bande de 54 px du haut, et `overflow: auto` en fait
     un conteneur qui découpe tout ce qui dépasse.

     Le panneau vit dedans, en absolu, et descend à 306 px : il était donc
     entièrement rogné. Mesure : boîte du panneau de 56 à 306, mais au milieu de
     cette boîte c'est la page qui répondait au doigt.

     C'est le cas qu'on ne voit jamais sur un grand écran, où la barre fait toute
     la hauteur et n'a rien à découper — et c'est exactement là que le correctif
     avait été mesuré. */

  function reglesSidebar() {
    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  test('le panneau vit bien à l’intérieur de la barre', () => {
    /* Sans ça, ce contrôle ne protège rien : c'est la raison pour laquelle le
       découpage compte. */
    const html = lireSource('index.html');
    vrai(html, 'index.html doit être lisible pour ce contrôle');
    const barre = html.slice(html.indexOf('<aside class="sidebar">'), html.indexOf('</aside>'));
    vrai(barre.includes('id="panneauNotifs"'),
      'le panneau des notifications doit vivre dans la barre : c’est ce qui rend '
      + 'son découpage possible, et ce qui rend ce test nécessaire');
    vrai(barre.includes('id="btnCloche"'), 'la cloche qui l’ouvre aussi');
  });

  test('la barre du téléphone ne découpe rien', () => {
    const nu = reglesSidebar();
    /* La règle du téléphone : celle qui cloue la barre en haut de l'écran. */
    const mobile = nu.split('}').find(b =>
      b.split('{')[0].trim().endsWith('.sidebar') && /position:\s*fixed/.test(b));
    vrai(mobile, 'la règle qui fixe la barre en haut de l’écran doit être trouvable');
    vrai(/overflow:\s*visible/.test(mobile),
      'la bande du haut ne doit rien découper : le panneau des notifications en '
      + 'sort de 250 px, et un conteneur de défilement le rognerait entièrement');
  });

  test('le rail de l’ordinateur, lui, se laisse parcourir', () => {
    /* L'autre moitié, qu'il ne faut pas perdre en corrigeant celle-ci : dans une
       fenêtre de 560 px de haut, le contenu de la barre en fait 675, et son pied
       porte le patrimoine net. */
    const nu = reglesSidebar();
    const base = nu.split('}').find(b =>
      b.split('{')[0].trim() === '.sidebar' && /position:\s*sticky/.test(b));
    vrai(base, 'la règle du rail vertical doit être trouvable');
    vrai(/overflow-y:\s*auto/.test(base),
      'le rail garde son défilement interne : sinon son pied redevient '
      + 'inatteignable sur un écran court');
  });
});

/* ------------------------------------------------------------------
   Le journal des ventes tient la charge
   ------------------------------------------------------------------ */
suite('Le journal des ventes se borne par année', () => {

  /* « Ça s'affiche comment ? Ça se filtre par année ? Si je fais 500 ventes j'ai
     500 lignes ? Il faut un sélecteur d'année. » le propriétaire, 6 août 2026.

     Il en avait 500. La carte n'avait aucune commande : elle déroulait tout ce
     que la plage glissante retenait, et cette plage se réglait deux cartes plus
     haut, sur les graphiques.

     Deux bornes, et elles ne font pas double emploi — c'est le raisonnement déjà
     tranché pour le journal des apports : **l'année borne combien de lignes
     existent, le dépliant borne quand on les voit.** Le dépliant seul cacherait
     cinq cents lignes derrière un bouton sans en réduire une ; le sélecteur seul
     montrerait une année de ventes en permanence. */

  const vente = (date, n) => ({
    date, name: `Titre ${n}`, qty: 3, price: 100, buyPrice: 90, currency: 'EUR',
    fxSell: 1, fxBuy: 1, gross: 300, invested: 270, realised: 30, note: '',
  });

  test('les totaux portent sur ce que la carte montre', () => {
    /* La règle du projet : un total égale la somme de ses parts. Calculer les
       tuiles sur la plage glissante pendant que le tableau liste une année
       aurait donné trois totaux qui ne sont la somme d'aucune ligne visible. */
    Fixture.poser();
    const deux = [vente('2025-03-10', 1), vente('2025-07-04', 2), vente('2026-02-11', 3)];
    const de2025 = deux.filter(v => v.date.startsWith('2025'));
    const st = statsDesVentes(de2025);
    eq(st.count, 2, 'deux ventes en 2025');
    pres(st.gross, 600, 'le produit est celui des deux lignes montrées');
    pres(st.realised, 60, 'la plus-value aussi');
    pres(st.sales.reduce((s, v) => s + v.gross, 0), st.gross,
      'et le total égale la somme de ses parts');
  });

  test('le calcul des totaux ne vit qu’à un endroit', () => {
    /* `salesStats` filtrait puis sommait. Le journal filtre autrement : refaire
       les cinq sommes à côté aurait donné deux façons de compter la même chose,
       et celle qu'on oublie de corriger finit par contredire l'autre. */
    const src = lireSource('assets/store.js');
    vrai(src, 'assets/store.js doit être lisible pour ce contrôle');
    vrai(/function statsDesVentes\(ventes\)/.test(src),
      'le calcul doit être extrait du filtre');
    const anciennes = src.match(/function salesStats\(range\) \{[\s\S]*?\n\}/);
    vrai(anciennes && /return statsDesVentes\(ventes\)/.test(anciennes[0]),
      'la plage glissante doit passer par le même calcul');
  });

  test('une seule borne de temps sur la page, et le dépliant reste', () => {
    /* Il y en avait deux : la plage glissante reglait les courbes, un menu
       d'annee reglait le journal, et rien n'empechait l'un de dire 2025 et
       l'autre 2026. Le menu a rejoint les crans, dans un contrôle unique. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.match(/function salesCard\(\) \{[\s\S]*?\n\}/);
    vrai(bloc, 'la carte du journal doit être trouvable');
    vrai(/const st = salesStats\(salesRange\);/.test(bloc[0]),
      'le journal se borne comme les graphiques, par la plage de la page');
    vrai(!/yearControl\(/.test(bloc[0]),
      'et n’a plus de sélecteur propre : deux menus d’année jumeaux pouvaient se contredire');
    /* Sur la source sans ses commentaires : le fichier explique pourquoi cet etat
       a disparu, et cette explication doit pouvoir citer son nom. */
    vrai(!/salesYear/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
      'l’état séparé est parti, sinon la borne existerait encore en double');
    vrai(/<details class="data-view"/.test(bloc[0]),
      'le dépliant reste : la borne dit combien de lignes existent, lui dit quand '
      + 'on les voit');
  });

  test('une année est une plage, fermée des deux côtés', () => {
    /* Filtrer une annee sur son seul debut aurait montre 2025 et tout ce qui a
       suivi : une duree glissante n'a pas de fin, une annee civile en a une. */
    eq(estAnnee('2025'), true, 'quatre chiffres font une année');
    eq(estAnnee('5y'), false, 'un cran de durée n’en est pas une');
    const b = rangeBornes('2025');
    eq(b.debut, '2025-01-01', 'elle ouvre au 1er janvier');
    eq(b.fin, '2025-12-31', 'et se ferme au 31 décembre');
    eq(rangeBornes('all').fin, null, 'une durée n’a pas de fin');
    eq(rangeLabel('2025'), '2025', 'et son libellé est son nom');
    eq(pasDesVentes('2025'), 'mois', 'une année se lit par mois, douze barres nommées');

    Fixture.poser();
    declarerVente({ date: '2025-03-10', name: 'En 2025', gross: 1000, realised: 200 });
    declarerVente({ date: '2026-06-20', name: 'En 2026', gross: 300, realised: 50 });
    eq(salesStats('2025').count, 1, 'la plage 2025 ne retient que 2025');
    pres(salesStats('2025').realised, 200, 'et son total est celui de cette année');
    eq(salesStats('2026').count, 1, '2026 de son côté');
    eq(salesStats('all').count, 2, 'et « Tout » les garde toutes les deux');
    eq(anneesDesVentes().join(','), '2026,2025',
      'les années offertes sont celles où une vente existe, la plus récente devant');
  });
});

/* ------------------------------------------------------------------
   La carte Objectif dit ce qu'elle seule sait
   ------------------------------------------------------------------ */
suite('La carte Objectif met en avant l’écart, pas le patrimoine', () => {

  /* « Le chiffre 30 000 est mis en avant, et il est un peu redondant avec
     l'autre onglet. » le propriétaire, 6 août 2026.

     Il l'était trois fois sur le même écran : en grand dans cette carte, vingt
     pixels plus bas comme première barre de « Ce que tu as déjà », et en chiffre
     de tête de l'onglet Aujourd'hui.

     Ce que la carte apporte en propre, personne d'autre ne le dit : la cible, ce
     qui manque, et le rythme qu'il faudrait tenir. C'était écrit en petit, en
     bas, autour d'un montant déjà connu. */

  test('le grand chiffre est l’écart, pas le patrimoine', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.match(/const carteObjectif = \(\) => \{[\s\S]*?\n  \};/);
    vrai(bloc, 'la carte de l’objectif doit être trouvable');
    const haut = bloc[0].match(/<div class="goal-top">[\s\S]*?<\/div>/);
    vrai(haut, 'le bloc de tête doit être trouvable');
    vrai(/g\.remaining/.test(haut[0]),
      'le chiffre de tête doit être l’écart à l’objectif');
    vrai(!/fmtEUR\(g\.total\)/.test(haut[0]),
      'et surtout pas le patrimoine, qui est déjà le héros de deux autres écrans');
  });

  test('le patrimoine reste, en note', () => {
    /* Il donne son sens au reste : « il te manque 3 847 € » ne se lit pas sans
       savoir sur quoi. Il ne se lit simplement plus en premier. */
    const src = lireSource('assets/app.js');
    const bloc = src.match(/const carteObjectif = \(\) => \{[\s\S]*?\n  \};/);
    const pied = bloc[0].match(/<div class="goal-foot">[\s\S]*?<\/div>/);
    vrai(pied, 'le pied doit être trouvable');
    vrai(/fmtEUR\(g\.total\)/.test(pied[0]) && /fmtEUR0\(g\.obj\)/.test(pied[0]),
      'le pied doit porter le patrimoine et la cible');
  });

  test('le rythme nécessaire accompagne l’écart', () => {
    /* C'est la seule des trois informations qui dise quoi faire. */
    const src = lireSource('assets/app.js');
    const bloc = src.match(/const carteObjectif = \(\) => \{[\s\S]*?\n  \};/);
    const haut = bloc[0].match(/<div class="goal-top">[\s\S]*?<\/div>/);
    vrai(/-g\.remaining \/ mois/.test(haut[0]),
      'le rythme mensuel doit être dit avec l’écart, pas relégué plus bas');
  });

  test('un objectif dépassé se dit autrement', () => {
    /* Un écart négatif n'est pas « il te manque −500 € ». */
    const src = lireSource('assets/app.js');
    const bloc = src.match(/const carteObjectif = \(\) => \{[\s\S]*?\n  \};/);
    vrai(/de dépassement/.test(bloc[0]), 'le cas du dépassement doit être nommé');
    vrai(/Objectif atteint/.test(bloc[0]), 'et fêté');
  });
});

/* ------------------------------------------------------------------
   La carte Objectif porte les couleurs de sa page
   ------------------------------------------------------------------ */
suite('L’objectif ne se peint pas d’une couleur qui ne dit rien', () => {

  /* « Ça manque peut-être de professionnalisme, étant donné que ça ne colle pas
     au graphique de projection plus bas. » le propriétaire, 6 août 2026.

     La barre portait `--degrade-budget`, bleu vers rose, créé pour accorder la
     jauge de l'accueil et les barres de catégories du Budget. Sur Projection,
     aucun autre élément ne le porte : le graphique en dessous parle en azur et
     en turquoise. Les deux ne partageaient littéralement aucune couleur, et un
     dégradé qui ne représente aucune quantité se lit comme de l'ornement.

     L'accent plutôt qu'une teinte de série, et c'est « c'est un objectif
     personnel » qui tranche : une couleur de série dirait que c'est une
     catégorie de données parmi d'autres, le violet dit que c'est un réglage. */

  function regle(nom) {
    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    return css.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('}').find(b => b.split('{')[0].trim() === nom);
  }

  test('la jauge porte l’accent, pas le dégradé du budget', () => {
    const r = regle('.goal-fill');
    vrai(r, 'la règle de la jauge doit être trouvable');
    vrai(/background:\s*var\(--accent\)/.test(r),
      'la jauge d’un objectif personnel porte l’accent : c’est un réglage, pas '
      + 'une catégorie de données');
    vrai(!/degrade-budget/.test(r),
      'le dégradé du budget n’appartient pas à cette page, aucun autre élément '
      + 'ne le porte ici');
  });

  test('le montant et sa légende ne partent pas aux deux bouts', () => {
    /* `space-between` marchait à 343 px et jetait le chiffre et la phrase aux
       deux bords d'une carte de 1 280 px, avec neuf cents pixels de vide. */
    for (const nom of ['.goal-top', '.goal-foot']) {
      const r = regle(nom);
      vrai(r, `la règle ${nom} doit être trouvable`);
      vrai(!/justify-content:\s*space-between/.test(r),
        `${nom} écartèle son contenu sur un grand écran : deux îlots au lieu `
        + 'd’une lecture');
      vrai(/gap:/.test(r), `${nom} doit poser un écart explicite entre ses parts`);
    }
  });

  test('sans objectif déclaré, la carte ne se félicite pas', () => {
    /* « Si quelqu'un n'aime pas cette barre, il fait comment ? » Il mettait la
       cible à zéro, et zéro donne `remaining = total` — donc un montant positif.
       La carte annonçait « de dépassement · Objectif atteint » sur un cap que
       personne n'avait fixé. */
    Fixture.poser(s => { s.meta.objective = 0; });
    const g = objectiveStatus();
    eq(g.obj, 0, 'aucune cible');
    vrai(g.remaining > 0,
      'et l’écart devient positif : c’est ce qui faisait croire à un dépassement');

    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.match(/const carteObjectif = \(\) => \{[\s\S]*?\n  \};/);
    vrai(bloc, 'la carte de l’objectif doit être trouvable');
    vrai(/if \(!\(num\(g\.obj\) > 0\)\) return/.test(bloc[0]),
      'sans cible positive, la carte doit céder la place plutôt que de célébrer '
      + 'un objectif inexistant');
  });

  test('et elle ne s’enferme pas dehors', () => {
    /* La carte est la seule porte vers ce réglage : la faire disparaître
       entièrement enfermerait dehors quiconque change d'avis. Il reste une
       ligne, qui ouvre la même fenêtre. */
    const src = lireSource('assets/app.js');
    const bloc = src.match(/const carteObjectif = \(\) => \{[\s\S]*?\n  \};/);
    const vide = bloc[0].match(/goal-vide[\s\S]*?<\/button>/);
    vrai(vide, 'la ligne de remplacement doit exister');
    vrai(/data-apercu="objectif"/.test(bloc[0].slice(0, bloc[0].indexOf('goal-vide') + 400)),
      'et ouvrir le même réglage que la carte pleine');
    vrai(!/goal-bar/.test(vide[0]), 'sans jauge : il n’y a rien à jauger');
  });
});

/* ------------------------------------------------------------------
   Une colonne réservée à rien laisse un couloir vide
   ------------------------------------------------------------------ */
suite('Une grille ne réserve pas de place à ce qu’elle ne montre pas', () => {

  /* « Toujours un gros espace vide à droite sur iPhone. » le propriétaire, signalé
     trois fois avant d'être mesuré — il fallait une capture assez large pour
     voir que le vide longeait le bord de la carte, et pas seulement les
     montants.

     `.flow-row` sert deux cartes : les charges fixes, qui montrent la part de
     chaque poste, et les dépenses du mois, qui ne la montrent pas. Les quatre
     colonnes étaient déclarées pour les deux — la seconde gardait donc 42 px
     réservés à rien, plus 10 px d'écart, soit un couloir de 52 px. Mesure à
     375 px : le montant finissait à 291, la ligne à 343.

     Le défaut ne se voyait pas sur la carte des charges fixes, qui remplit sa
     quatrième colonne. La moitié des cartes concernées paraissait donc juste,
     ce qui est exactement ce qui rend ce genre de défaut long à trouver. */

  function reglesFlow() {
    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    return css.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('}').filter(b => /\.flow-row\b/.test(b.split('{')[0]));
  }

  test('la quatrième colonne n’existe que si un pourcentage l’occupe', () => {
    const blocs = reglesFlow().filter(b => /grid-template-columns/.test(b));
    vrai(blocs.length >= 2,
      'la grille doit être déclarée au moins deux fois : la base et le cas du '
      + 'pourcentage');
    for (const b of blocs) {
      const sel = b.split('{')[0].trim();
      const colonnes = (b.match(/grid-template-columns:([^;]*)/) || [])[1] || '';
      const quatre = colonnes.trim().split(/\s+(?![^(]*\))/).length >= 4;
      if (quatre) {
        vrai(/:has\(\.flow-pct\)/.test(sel),
          `« ${sel} » réserve quatre colonnes sans exiger de pourcentage : les `
          + 'lignes qui n’en portent pas gardent un couloir vide à droite');
      }
    }
  });

  test('les deux largeurs d’écran sont traitées', () => {
    /* Le défaut vivait dans la règle du téléphone, pas dans celle du bureau :
       corriger la première seule aurait laissé le couloir là où il gênait. */
    const avecHas = reglesFlow().filter(b => /:has\(\.flow-pct\)/.test(b.split('{')[0]));
    vrai(avecHas.length >= 2,
      `la variante à pourcentage doit exister aux deux largeurs (${avecHas.length} trouvée·s) : `
      + 'la règle du téléphone redéclare la grille, et c’est celle qui comptait');
  });
});


suite('Un bien de valeur se tient tout seul, et se nomme une fois', () => {
  test('la classe existe partout où une classe doit exister', () => {
    /* Une classe d'actifs n'est pas qu'une entree de table : elle doit porter un
       nom affichable, une couleur, une disponibilite et un type de compte qui la
       produise. Ce test verifie les quatre, pour que le prochain qui ajoute une
       classe ne decouvre pas au navigateur ce qui lui manque. */
    vrai(CLASSES_ACTIFS.bienValeur, 'la classe est nommée');
    /* Le meme mot que le type de compte, au singulier : « Biens de valeur » en
       en-tete au-dessus de « Bien de valeur » en ligne se lisait comme deux
       choses differentes. */
    eq(CLASSES_ACTIFS.bienValeur, typeCompte('bienValeur').label,
      'la classe et le type portent exactement le même mot');
    vrai(TEINTE_CLASSE.bienValeur != null, 'elle a une teinte à elle');
    const t = typeCompte('bienValeur');
    eq(t.id, 'bienValeur', 'le type de compte existe');
    vrai(t.classes.includes('bienValeur'), 'et il produit cette classe');
    vrai(t.sansEtab, 'il ne se rattache à aucun établissement');
    eq(mobilisabilite('bienValeur', 'bienValeur', ''), 'lent',
      'une montre se vend, mais pas dans la journée');
  });

  test('le brut se dérive des classes au lieu de les recompter', () => {
    /* La faute qui a motive ce test : `patrimoine()` tenait deux listes ecrites a
       la main, l'une pour `classes`, l'autre pour la somme du brut. Une classe
       ajoutee dans la premiere et oubliee dans la seconde donnait un total plus
       petit que la somme de ses parts — mesure du 6 aout 2026, 34 810 contre
       30 610 — sans que rien a l'ecran ne le dise. C'est la regle cardinale du
       projet, violee par un doublon de liste. */
    Fixture.poser();
    Store.state.comptes.push({ id: 'c_bv', etabId: null, type: 'bienValeur',
      statut: 'ouvert', libelle: 'Moto', ouvertLe: '2023-04-10', cash: [],
      lignes: [{ id: 'l_bv', classe: 'bienValeur', libelle: 'Moto',
                 valeur: 4200, prixDeRevient: 3000, estimeLe: '2026-08-06' }] });
    const p = patrimoine();
    eq(round2(p.classes.bienValeur), 4200, 'la classe porte la valeur du bien');
    eq(round2(Object.values(p.classes).reduce((s, v) => s + num(v), 0)), round2(p.brut),
      'le brut égale la somme de ses classes, celle-ci comprise');

    /* Et le controle vaut pour n'importe quelle classe a venir : la somme se
       derive de `CLASSES_ACTIFS`, donc aucune ne peut manquer a l'appel. */
    for (const k of Object.keys(CLASSES_ACTIFS)) {
      vrai(k in p.classes, `${k} a sa case dans le detail par classe`);
    }
  });

  test('le parcours de création ne demande pas de banque et demande un nom', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const debut = src.indexOf("async 'ajouter-compte'");
    vrai(debut > 0, 'le parcours de création doit exister');
    const parcours = src.slice(debut, debut + 17000);

    /* L'etape du contenant saute sur le drapeau du modele, pas sur l'identifiant
       du type : un second type sans contenant en heriterait sans rien ecrire. */
    vrai(/if \(t\.sansEtab\) \{ etabId = null; etapes--; \}/.test(parcours),
      'l’étape de la banque saute sur `sansEtab`, et le compte des étapes suit');
    vrai(!/t\.id === 'bienValeur'/.test(parcours),
      'et elle saute sur le drapeau, pas sur le nom du type');

    /* Sans contenant, plus rien ne nomme le bien : le champ le remplace. */
    vrai(/t\.sansEtab \? \[\{ cle: 'nom'/.test(parcours),
      'un bien sans contenant demande son nom, puisque l’étape 2 ne le nomme plus');
    vrai(/libelle: String\(e3\.nom \|\| ''\)\.trim\(\) \|\| nomContenant\(\)/.test(parcours),
      'et ce nom devient celui de la ligne');

    /* Le contenant se nomme avant le dernier ecran mais ne se cree qu'apres :
       un parcours qu'on abandonne ne doit rien laisser derriere lui. Il etait
       pousse dans l'etat des la saisie du nom, et fermer l'ecran des montants
       laissait un etablissement vide que plus aucune page ne montre — sauf la
       liste de ce meme parcours, ou il ressemble a une memoire residuelle. */
    vrai(/nomNouveauContenant = nom;\s*\n\s*etabId = null;/.test(parcours),
      'la saisie du nom ne crée rien');
    const posE3 = parcours.indexOf('if (!e3) return;');
    const posPush = parcours.indexOf('Store.state.etabs.push(');
    vrai(posE3 > 0 && posPush > posE3,
      'l’établissement naît après le dernier écran, jamais avant');
    /* Et les ecrans d'avant lisent le nom par une seule porte, qui repond que
       l'etablissement existe deja ou qu'il vienne d'etre tape. */
    vrai(/const nomContenant = \(\) => etabById\(etabId\)\?\.nom \|\| nomNouveauContenant \|\| '';/
      .test(parcours), 'un seul accesseur pour le nom du contenant');

    /* Une dette se pose sur un etablissement : sans contenant, le champ n'aurait
       nulle part ou atterrir, et `etabById(null)` aurait leve. */
    vrai(/\.\.\.\(t\.sansEtab \? \[\] : \[\n?\s*\{ cle: 'credit'/.test(parcours),
      'le crédit ne s’offre que là où une dette peut se poser');
  });

  test('la valeur d’un bien se dit estimée, et porte sa date', () => {
    const src = lireSource('assets/app.js');
    vrai(/Valeur estimée/.test(src), 'l’intitulé existe');
    vrai(/cle: 'estimeLe'/.test(src), 'la date de l’estimation se saisit');
    /* Deux portes sur le meme champ, la creation et la fenetre de la ligne :
       c'est sain, elles ecrivent le meme fait. Deux champs pour la meme valeur
       ne le serait pas. */
    eq((src.match(/cle: 'estimeLe'/g) || []).length, 2,
      'deux portes — la création et la modification — sur un seul champ');
    vrai(/estimeLe: e3\.estimeLe \|\| todayISO\(\)/.test(src),
      'à la création elle est posée, pour que le rappel ait un point de départ');
  });

  test('un sous-titre ne répète pas le titre au-dessus de lui', () => {
    /* Trois fois le meme mot sur trois lignes : le groupe « Biens de valeur », la
       ligne « Bien de valeur », le sous-titre « Biens de valeur · Bien de
       valeur ». Le nom du compte et celui de la ligne sont un seul fait, et la
       classe est deja dite par l'en-tete du groupe. */
    const src = lireSource('assets/app.js');
    const debut = src.indexOf('function lignePlacement');
    vrai(debut > 0, 'la fonction doit exister');
    const fn = src.slice(debut, debut + 5000);
    vrai(/nomLignePlacement\(l, compte\)/.test(fn),
      'la ligne tire son nom de la fonction qui en décide, une seule fois');
    /* Le repli `sansClasse` et la vue groupee par classe sont partis ensemble le
       8 aout 2026 : cet onglet redisait ce que la carte « Repartition » de
       l'accueil dit deja, avec sa part et sa base en plus. Le dernier appelant
       de `lignePlacement()` est la fiche d'un compte, ou la classe de chaque
       ligne est au contraire l'information utile. */
    vrai(/function lignePlacement\(l, compte, editable = false\) \{/.test(src),
      'le paramètre est parti avec sa vue : trois arguments, plus quatre');
    eq((src.match(/[^m]lignePlacement\(/g) || []).length, 2,
      'une déclaration et un seul appelant : la fiche d’un compte');

    /* Le repli vit cote store, et les vues le partagent : la liste, la fenetre
       d'apercu d'une classe, et tout ce qui viendra. Une seule des deux le
       portait, et la fenetre affichait encore « Bien de valeur ». */
    const cpt = { id: 'c1', type: 'bienValeur', libelle: 'Moto', lignes: [] };
    eq(nomLignePlacement({ libelle: 'Bien de valeur' }, cpt), 'Moto',
      'un libellé égal au type se replie sur le nom du compte');
    eq(nomLignePlacement({ libelle: 'Rolex' }, cpt), 'Rolex',
      'un nom vraiment saisi n’est jamais écrasé');
    vrai(/const nomL = nomLignePlacement\(l, c\);/.test(src),
      'la fenêtre d’aperçu s’en sert aussi');
    vrai(/meta: sousNom\(nomL, /.test(src),
      'et son sous-titre ne répète ni le nom au-dessus ni un point médian '
      + 'suivi de rien : « Moto / Moto » se lisait deux fois');

    /* Le repli joue aussi dans l'autre sens : un compte sans nom prend celui de
       sa ligne unique, pour que la fiche ne titre pas « Bien de valeur ». */
    eq(nomCompteV2({ type: 'bienValeur', lignes: [{ libelle: 'moto' }] }), 'moto',
      'un compte anonyme d’une seule ligne prend le nom de celle-ci');
    eq(nomCompteV2({ type: 'bienValeur', libelle: 'Moto', lignes: [{ libelle: 'x' }] }), 'Moto',
      'et son propre nom reste prioritaire');
    eq(nomCompteV2({ type: 'courant', cash: [{ montant: 10 }], lignes: [{ libelle: 'x' }] }),
      'Compte courant',
      'un compte qui porte aussi des espèces n’est pas réductible à sa ligne');
  });

  test('la fiche porte un bouton qui enregistre et reste', () => {
    /* Tout y est deja ecrit a la frappe : ce bouton apporte la confirmation, pas
       l'ecriture. Il ne doit donc surtout pas remplacer l'ecriture continue —
       un champ saisi puis quitte sans clic serait perdu, et c'est precisement
       ce que la regle du projet interdit.
       Il reste sur place, comme dans une fenetre de saisie en serie : on vient
       relire les comptes que la saisie vient de changer, et « Enregistrer et
       fermer » emportait l'ecran avant qu'on ait pu les lire. */
    const src = lireSource('assets/app.js');
    vrai(/function barreValiderFiche/.test(src), 'la barre a une seule source');
    const fn = src.slice(src.indexOf('function barreValiderFiche'),
                         src.indexOf("/* L'etat d'une fiche a son ouverture"));
    vrai(/data-action="enregistrer-fiche">\$\{trad\('Enregistrer'\)\}/.test(fn),
      'il dit ce qu’il fait, et ne promet plus de fermer');
    const action = src.slice(src.indexOf("'enregistrer-fiche'()"),
                             src.indexOf("async 'supprimer-compte'"));
    vrai(action.length > 200, 'l’action doit être trouvable');
    vrai(!/ACTIONS\.goto/.test(action),
      'elle ne renvoie plus ailleurs : la navigation s’en charge, et elle ne perd rien');
    vrai(/ficheAvant = null/.test(action),
      '« Annuler » ne peut pas défaire ce qui vient d’être enregistré');
    vrai(/window\.scrollY[\s\S]{0,120}window\.scrollTo\(0, y\)/.test(action),
      'et la position dans la page est gardée : la fiche est longue');
    eq((src.match(/barreValiderFiche\(/g) || []).length, 3,
      'une déclaration et deux appels : la fiche d’un compte et celle d’un établissement');
    /* Elle ferme la carte des champs : une rangee posee hors des cartes flotte
       dans une page ou tout est encadre, et le filet la separe de la saisie. */
    vrai(/<div class="fiche-actes apres-champs">/.test(fn),
      'et elle porte la géométrie commune, plus le filet du bas de carte');
    /* L'ecriture a la frappe reste la regle : l'ecouteur `input` continue
       d'appeler `applyField` et `Store.save` hors des blocs differes. */
    /* L'ancre est le selecteur des champs, pas l'evenement : `input` est ecoute
       a plusieurs endroits, et le premier trouve n'etait pas celui-ci. */
    const ancre = src.indexOf("const f = e.target.closest('[data-path]')");
    vrai(ancre > 0, 'l’écouteur des champs doit être trouvable');
    const ecouteur = src.slice(ancre, ancre + 800);
    vrai(/applyField\(f\);[\s\S]{0,450}?Store\.save\(/.test(ecouteur),
      'la fiche continue d’écrire à la frappe : le bouton confirme, il ne conditionne pas');
  });

  test('un bien s’achète, un compte s’ouvre', () => {
    /* Le predicat vit cote store pour que la question posee a la creation et
       l'intitule affiche sur la fiche ne puissent pas diverger. */
    vrai(estUnBien(typeCompte('bienValeur')), 'un bien de valeur est un bien');
    vrai(estUnBien(typeCompte('immo')), 'un bien immobilier aussi');
    vrai(!estUnBien(typeCompte('courant')), 'un compte courant n’en est pas un');
    vrai(!estUnBien(typeCompte('cto')), 'un compte-titres non plus');
  });
});

suite('Une fiche se valide ou s’annule, et rien ne se saisit sans borne', () => {
  test('la dernière porte de saisie libre porte enfin une limite', () => {
    /* `askForm` borne ses champs par `max`, les pages par `maxlength`, et
       `askText` n'avait rien : c'est par la que passent la nouvelle categorie de
       depenses, le nom d'une charge partagee et celui d'une banque. Trois
       intitules qui s'affichent ensuite dans des colonnes etroites. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    vrai(/function askText\(titre, message, exemple = '', valeur = '', max = NOM_LIGNE_MAX\)/.test(src),
      'askText prend une borne, par défaut celle des intitulés');
    vrai(/id="txtValeur"[\s\S]{0,120}?maxlength="\$\{max\}"/.test(src),
      'et son champ la porte');
    /* La borne se derive de la constante commune : deux nombres ecrits a la main
       auraient diverge a la premiere retouche. `tests.html` ne charge pas
       `app.js`, la constante se lit donc dans la source. */
    eq((src.match(/const NOM_LIGNE_MAX = (\d+);/) || [])[1], '30',
      'la borne des intitulés');
  });

  test('toutes les colonnes des positions se trient, et le « ? » ne vole plus le clic', () => {
    /* Quatre colonnes ne se triaient pas — quantite, prix de revient, cours,
       poids — et deux portaient leur explication sur la cellule entiere, donc
       sur la zone qui trie. Expliquer et trier etaient le meme geste. */
    const src = lireSource('assets/app.js');
    /* `tests.html` ne charge que `store.js` : la table se lit dans la source. */
    const table = src.slice(src.indexOf('const POS_SORT_KEYS'),
                            src.indexOf('function sortPositions'));
    vrai(table.length > 100, 'la table des clés de tri doit être trouvable');
    const cles = ['name', 'qty', 'pru', 'cours', 'value', 'invested', 'perfEur', 'perfPct', 'poids'];
    for (const k of cles) {
      vrai(new RegExp(`\\b${k}:\\s*p =>`).test(table), `la colonne ${k} a une clé de tri`);
      vrai(new RegExp(`sortableTh\\('${k}'`).test(src), `et l’en-tête ${k} l’utilise`);
    }
    /* Le tri vit dans un bouton a l'interieur de la cellule, et l'aide a cote. */
    vrai(/<button type="button" class="th-tri" data-action="sort-positions"/.test(src),
      'le tri est porté par un bouton, pas par la cellule entière');
    /* `trad()` autour de l'explication : elle arrive d'un appelant qui l'écrit en
       français, et une bulle d'aide se traduit comme le reste. */
    vrai(/\+ \(explication \? aide\(trad\(explication\)\) : ''\)/.test(src),
      'et l’explication se pose à côté de ce bouton, traduite');
    vrai(!/<th title="Prix de revient unitaire/.test(src),
      'plus aucune explication sur la cellule elle-même');

    /* Le tri par poids classe comme le tri par valeur : le denominateur est
       commun a toutes les lignes, donc l'ordre est le meme. Deux clefs qui
       donneraient deux ordres pour la meme colonne seraient un piege. */
    eq((table.match(/poids:\s*p => (.+),/) || [])[1],
       (table.match(/value:\s*p => (.+),/) || [])[1],
      'le poids se classe exactement comme la valeur : le dénominateur est le '
      + 'même pour toutes les lignes, donc l’ordre aussi');
  });

  test('« Annuler » rétablit la fiche, il n’empêche pas d’écrire', () => {
    /* La regle du projet : une page ecrit a la frappe, parce qu'un bouton qui
       conditionne l'ecriture jette tout ce qu'on a tape si l'on quitte sans le
       voir. « Annuler » ne peut donc pas vouloir dire « ne rien ecrire ». Il veut
       dire « remets cette fiche comme je l'ai trouvee » : une action reelle, qui
       defait un travail, et qui merite sa confirmation. */
    const src = lireSource('assets/app.js');
    vrai(/'annuler-fiche'\(btn\)/.test(src), 'l’action existe');
    vrai(/await askConfirm\(\s*\n?\s*trad\('Annuler tes modifications \?'\)/.test(src),
      'et elle demande confirmation, dans les deux langues');
    /* La confirmation ne se pose que s'il y a quelque chose a defaire : un
       avertissement systematique cesse d'etre lu. */
    vrai(/if \(!ficheModifiee\(\)\) \{[^}]*retour\(\); return; \}/.test(src),
      'une fiche non modifiée se ferme sans rien demander');
    /* L'ecriture continue reste la regle. */
    const ancre = src.indexOf("const f = e.target.closest('[data-path]')");
    vrai(/applyField\(f\);[\s\S]{0,450}?Store\.save\(/.test(src.slice(ancre, ancre + 800)),
      'la fiche continue d’écrire à chaque frappe');
    /* L'instantane se prend au premier rendu d'une route, sinon la fiche se
       re-rend a chaque frappe et la photo serait toujours identique. */
    vrai(/if \(!ficheAvant \|\| ficheAvant\.cle !== cle\)/.test(src),
      'l’instantané ne se reprend pas à chaque rendu');
    vrai(/memoriserFiche\(`compte:\$\{c\.id\}`, c\)/.test(src),
      'la fiche d’un compte le pose');
    vrai(/memoriserFiche\(`etab:\$\{e\.id\}`, e\)/.test(src),
      'celle d’un établissement aussi');
  });

  test('Marchés ne renvoie plus vers le journal des ventes', () => {
    /* Marches est la page des lignes qu'on detient : une vente n'en est plus
       une, et la barre d'onglets mene a Performance en un geste. */
    const src = lireSource('assets/app.js');
    const debut = src.indexOf('function viewPositions');
    const fin = src.indexOf('function salesCard');
    vrai(debut > 0 && fin > debut, 'les deux fonctions doivent être trouvables');
    const vue = src.slice(debut, fin);
    vrai(!/vente\$\{st\.count > 1 \? 's' : ''\} enregistrée/.test(vue),
      'le renvoi « n ventes enregistrées » a quitté cette page');
    vrai(!/data-action="go-performance"/.test(vue),
      'et son bouton avec lui');
    /* Le journal lui-meme n'a pas bouge : c'est le renvoi qui partait. */
    vrai(/Journal des ventes/.test(src), 'le journal existe toujours, dans Performance');
  });
});

suite('Le balisage et le dictionnaire disent le même mot', () => {
  test('aucun libellé d’index.html ne contredit sa traduction française', () => {
    /* Le defaut qu'a coute ce test.

       L'onglet « Comptes » a ete renomme « Actifs » dans `index.html`, aux deux
       endroits ou il s'ecrit, et le menu de gauche continuait d'afficher
       « Comptes ». La raison : `translateStatic()` remplace le texte de tout
       element `data-i18n` par la valeur du dictionnaire, au chargement. Le mot
       vit donc a deux endroits — le balisage et `i18n.js` — et c'est le second
       qui gagne, silencieusement. Corriger le premier ne se voit nulle part.

       C'est la faute que ce projet corrige sans arret, sous une forme nouvelle :
       une liste se derive, elle ne se recopie pas. Ici on ne peut pas deriver —
       le balisage doit rester lisible sans JavaScript, et le dictionnaire doit
       porter l'anglais — mais on peut refuser qu'ils divergent.

       Signale par le propriétaire le 7 aout 2026 : « j'ai toujours Comptes sur le
       web ». */
    const html = lireSource('index.html');
    const js = lireSource('assets/i18n.js');
    vrai(html && js, 'index.html et i18n.js doivent être lisibles');

    /* Le dictionnaire francais : entre `const FR` et l'accolade qui le ferme.
       On ne prend pas tout le fichier, l'anglais porte les memes clefs. */
    const debutFr = js.search(/^const FR = \{/m);
    vrai(debutFr >= 0, 'le dictionnaire français doit être trouvable');
    const fr = js.slice(debutFr, js.indexOf('\n};', debutFr));
    /* Les deux styles de guillemets : « Vue d'ensemble » porte une apostrophe et
       se declare donc entre guillemets doubles. N'en lire qu'un faisait passer
       cette entree pour absente, et le test echouait sur une entree saine. */
    const dico = new Map();
    for (const m of fr.matchAll(/^\s*'([\w.]+)':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,/gm)) {
      dico.set(m[1], (m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
    }
    vrai(dico.size > 20, 'le dictionnaire doit porter ses entrées');

    /* Chaque libelle statique du balisage, avec sa clef. Le texte peut porter
       des elements freres — le badge « ✎ » de Budget vit hors du span — donc on
       ne lit que le contenu direct de l'element marque. */
    /* Deux familles de clefs coexistent : les clefs pointees (nav.*), dont le
       francais vit dans le dictionnaire FR, et les clefs-phrases, dont le
       contrat de repli est que la clef EST le texte francais. Pour celles-ci,
       la coherence exigible est l'egalite du balisage et de la clef. */
    const paires = [...html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)];
    vrai(paires.length > 8, 'index.html doit porter ses libellés balisés');

    const fautes = [];
    for (const [, cle, texte] of paires) {
      /* Une clef pointee a la forme segment.segment, sans point final :
         « Projeter. » finit par un point, c'est une phrase. */
      const attendu = dico.get(cle) ?? (/^[a-z]\w*(\.\w+)+$/i.test(cle) ? undefined : cle);
      if (attendu === undefined) { fautes.push(`${cle} : absente du dictionnaire`); continue; }
      const dit = texte.trim();
      if (dit && dit !== attendu) fautes.push(`${cle} : « ${dit} » dans le balisage, « ${attendu} » au dictionnaire`);
    }
    eq(fautes.join(' | '), '',
      'le mot affiché vient du dictionnaire : un balisage qui dit autre chose est '
      + 'une correction qui ne se verra jamais');
  });

  test('l’onglet s’appelle Actifs dans les trois endroits qui le nomment', () => {
    /* Le balisage du menu, celui de la barre d'onglets, et le dictionnaire. */
    const html = lireSource('index.html');
    const js = lireSource('assets/i18n.js');
    vrai(/data-i18n="nav\.accounts"[^>]*>Actifs</.test(html),
      'le menu de gauche');
    vrai(/<span data-i18n="nav\.accounts">Actifs<\/span>/.test(html), 'la barre d’onglets du téléphone, désormais balisée pour la traduction');
    vrai(/'nav\.accounts': 'Actifs',/.test(js), 'le dictionnaire français');
    vrai(/'nav\.accounts': 'Assets',/.test(js), 'et l’anglais suit');
    vrai(!/data-i18n="nav\.accounts"[^>]*>Comptes</.test(html),
      'plus aucun « Comptes » dans le balisage de cet onglet');
  });
});

suite('La page Actifs range ce qu’on tient chez un tiers et ce qu’on tient soi-même', () => {
  test('« détenu en direct » se pose sur la classe, pas sur le type', () => {
    /* Deux predicats voisins qu'il ne faut surtout pas confondre.

       `estUnBien()` repond a « ce compte se saisit-il par une valeur et un prix
       d'achat ? ». Le non cote dit oui : c'est le parcours de creation qui s'en
       sert. `estDetenuEnDirect()` repond a « le contenant est-il la chose
       elle-meme ? », et le non cote dit non — une part de societe a un emetteur
       en face, et une plateforme la tient pour toi.

       Le premier jet de la page lisait `estUnBien()`, et les plateformes de
       financement participatif se rangeaient sous « Biens et especes » alors
       que ce sont des plateformes. Mesure du 8 aout 2026. */
    vrai(estDetenuEnDirect(typeCompte('immo')), 'un appartement se tient soi-même');
    vrai(estDetenuEnDirect(typeCompte('bienValeur')), 'une montre aussi');
    vrai(!estDetenuEnDirect(typeCompte('nonCote')),
      'une part de société non cotée est tenue par une plateforme');
    vrai(!estDetenuEnDirect(typeCompte('cto')), 'un compte-titres par un courtier');
    vrai(!estDetenuEnDirect(typeCompte('courant')), 'un compte courant par une banque');

    /* Et la difference avec l'autre predicat est verifiee, pas supposee : c'est
       elle qui a coute la mesure. */
    vrai(estUnBien(typeCompte('nonCote')),
      'le non coté se saisit bien comme un bien : les deux prédicats diffèrent, '
      + 'et c’est exactement le piège');

    /* Et le controle qui aurait attrape le defaut : lequel des deux la vue
       emploie pour partager ses sections. Les assertions ci-dessus decrivent le
       modele et restaient vertes pendant que la page se trompait. */
    const src = lireSource('assets/app.js');
    vrai(/siens\.every\(c => estDetenuEnDirect\(typeCompte\(c\.type\)\)\)/.test(src),
      'la page Actifs partage ses sections sur « détenu en direct »');
    vrai(!/siens\.every\(c => estUnBien\(/.test(src),
      'et surtout pas sur « se saisit comme un bien », qui range les plateformes '
      + 'de financement participatif du mauvais côté');
  });

  test('une SCPI n’est pas un appartement, malgré la classe commune', () => {
    /* Le drapeau a demenage : il etait pose sur la classe `immobilier`, ce qui
       rangeait les SCPI avec les appartements. Une SCPI est du papier, tenu par
       une societe de gestion exactement comme un courtier tient des actions.

       Deux types partagent une classe sans partager le mode de detention : la
       classe dit de quoi c'est fait, le type dit qui le tient. C'est donc le
       type qui porte `direct`, avec `sansEtab`, `prete` et `interne`. */
    eq(typeCompte('immo').classes.join(), typeCompte('scpi').classes.join(),
      'les deux portent bien la même classe : c’est ce qui rendait le piège invisible');
    vrai(estDetenuEnDirect(typeCompte('immo')), 'un appartement se tient soi-même');
    vrai(!estDetenuEnDirect(typeCompte('scpi')),
      'une SCPI est tenue par une société de gestion');
    vrai(estDetenuEnDirect(typeCompte('bienValeur')), 'une montre se tient soi-même');

    /* Et rien d'autre n'est direct : le test parcourt le modele au lieu de
       nommer une liste, pour qu'un type ajoute demain ne passe pas au travers. */
    const directs = TYPES_COMPTE.filter(t => t.direct).map(t => t.id).sort().join(',');
    eq(directs, 'bienValeur,immo',
      'deux types seulement se détiennent en direct');
  });

  test('les trois intertitres se posent ensemble ou pas du tout', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');

    /* Un seul titre ne range rien, il ajoute une ligne : les intertitres ne
       paraissent que si les deux sections existent vraiment. */
    vrai(/sectionsAffichees = !!chezUnTiers\.trim\(\) && !!enDirect\.trim\(\)/.test(src),
      'les titres se décident sur le contenu réel des deux sections');
    eq((src.match(/sectionsAffichees \? titreSection\(/g) || []).length, 3,
      'et les trois disparaissent ensemble, sous le même drapeau');

    /* Le groupe des comptes archives se rend hors du if/else, tout en bas :
       sans son propre titre il tombait sous « Biens et especes », qui ne le
       contient pas. Un titre pose une etagere pour tout ce qui suit. */
    vrai(/sectionsAffichees \? titreSection\('Archivés'/.test(src),
      'les archivés portent leur propre étiquette, sous le même drapeau');

    for (const mot of ['Comptes', 'Biens et espèces', 'Archivés']) {
      vrai(new RegExp(`titreSection\\('${mot}'`).test(src), `l’intertitre « ${mot} »`);
    }
    /* Le groupe sans contenant a change de nom en meme temps : « Hors
       etablissement » decrivait une absence, sous un titre qui dit deja
       laquelle. */
    vrai(!/'Hors établissement'/.test(src),
      'plus de groupe nommé par ce qui lui manque');
    /* Le titre porte le seul fait commun a ces lignes — personne ne les tient
       pour toi — et le sous-titre ce qu'on y trouve. « Chez toi » affirmait un
       lieu que l'application ne connait pas : une voiture n'est pas chez toi,
       une montre peut dormir dans un coffre en banque. */
    vrai(/trad\('Sans intermédiaire'\), trad\('espèces et objets de valeur'\)/.test(src),
      'il se nomme par ce qui est vrai de toutes ses lignes');
    vrai(!/'Chez toi'/.test(src),
      'et jamais par un lieu que rien dans les données ne dit');
  });

  test('la page reste la somme de ses parts, quelle que soit la section', () => {
    /* La regle cardinale, appliquee au decoupage : deplacer un groupe d'une
       section a l'autre ne doit rien retirer ni rien compter deux fois. Le
       controle porte sur le partage lui-meme — chaque etablissement tombe dans
       une section et une seule, et aucun compte ouvert n'echappe aux deux. */
    Fixture.poser();
    Store.state.etabs.push({ id: 'e_immo', nom: 'Appartement', notes: '', dettes: [] });
    Store.state.comptes.push({ id: 'c_immo', etabId: 'e_immo', type: 'immo',
      statut: 'ouvert', cash: [], lignes: [{ id: 'l', classe: 'immobilier',
      libelle: 'Appartement', valeur: 180000, prixDeRevient: 150000 }] });
    Store.state.comptes.push({ id: 'c_bv', etabId: null, type: 'bienValeur',
      statut: 'ouvert', libelle: 'Rolex', cash: [], lignes: [{ id: 'l2',
      classe: 'bienValeur', libelle: 'Rolex', valeur: 9000, prixDeRevient: 7000 }] });

    const ouverts = comptesOuverts();
    const enDirect = e => {
      const siens = ouverts.filter(c => c.etabId === e.id);
      return siens.length > 0 && siens.every(c => estDetenuEnDirect(typeCompte(c.type)));
    };
    const tiers = Store.state.etabs.filter(e => !enDirect(e));
    const chezSoi = Store.state.etabs.filter(enDirect);
    eq(tiers.length + chezSoi.length, Store.state.etabs.length,
      'chaque établissement tombe dans une section et une seule');

    const sansContenant = ouverts.filter(c => !c.etabId || !etabById(c.etabId));
    const dansUnEtab = ouverts.filter(c => c.etabId && etabById(c.etabId));
    eq(sansContenant.length + dansUnEtab.length, ouverts.length,
      'aucun compte ouvert n’échappe aux deux sections');

    const somme = Store.state.etabs.reduce((s, e) =>
      s + ouverts.filter(c => c.etabId === e.id).reduce((t, c) => t + valeurCompte(c), 0), 0)
      + sansContenant.reduce((s, c) => s + valeurCompte(c), 0);
    eq(round2(somme), round2(patrimoine().brut),
      'et la somme des deux sections fait le total affiché en tête de page');
  });
});

suite('Un contenant dit ce qu’il contient avec le mot juste', () => {
  test('on n’a pas de compte dans un studio', () => {
    /* La page annoncait « studio lyon, 2 comptes ». Le mot venait de la banque,
       ou il est juste, et suivait sans le savoir jusqu'aux biens. Il vit
       desormais dans `CONTENANTS`, avec les autres mots du contenant, de sorte
       que la vue les lise tous au meme endroit. */
    Fixture.poser();
    Store.state.etabs.push({ id: 'e_studio', nom: 'Studio Lyon', notes: '', dettes: [] });
    Store.state.comptes.push({ id: 'c_s1', etabId: 'e_studio', type: 'immo',
      statut: 'ouvert', cash: [], lignes: [{ id: 'l1', classe: 'immobilier',
      libelle: 'Studio Lyon', valeur: 150000 }] });
    eq(motContenu('e_studio', 1), 'bien', 'un bien immobilier est un bien');
    Store.state.comptes.push({ id: 'c_s2', etabId: 'e_studio', type: 'immo',
      statut: 'ouvert', cash: [], lignes: [{ id: 'l2', classe: 'immobilier',
      libelle: 'Parking', valeur: 15000 }] });
    eq(motContenu('e_studio', 2), 'biens', 'et deux font des biens');

    /* Une banque garde le sien, une plateforme aussi : Plateforme A ouvre bien un
       compte. Le mot ne change que la ou il etait faux. */
    Store.state.etabs.push({ id: 'e_bq', nom: 'Fortuneo', notes: '', dettes: [] });
    Store.state.comptes.push({ id: 'c_b1', etabId: 'e_bq', type: 'courant',
      statut: 'ouvert', cash: [{ montant: 100, affectation: 'courant' }], lignes: [] });
    eq(motContenu('e_bq', 1), 'compte', 'une banque tient des comptes');
    eq(motContenu('e_bq', 3), 'comptes', 'et le pluriel s’accorde');

    /* Un contenant vide retombe sur le terme le plus large : il ne survit que
       pour un credit, et un credit se doit a un preteur. */
    Store.state.etabs.push({ id: 'e_vide', nom: 'Ancienne banque', notes: '', dettes: [] });
    eq(motContenu('e_vide', 1), 'compte', 'un contenant vide n’invente pas un mot');
  });

  test('le mot du contenu vit là où vivent les autres mots du contenant', () => {
    /* La regle du projet : un fait se regle a un seul endroit. Le mot du
       contenant et celui du contenu se lisent dans la meme table, donc ils ne
       peuvent pas se contredire — « Bien immobilier » en titre au-dessus de
       « 2 comptes » etait exactement cette contradiction. */
    for (const [cle, c] of Object.entries(CONTENANTS)) {
      vrai(typeof c.contenu === 'string' && c.contenu,
        `le contenant « ${cle} » dit ce qu’il contient`);
      vrai(c.contenu === c.contenu.toLowerCase(),
        `« ${cle} » garde son mot en minuscules : il s’emploie au milieu d’une phrase`);
    }
    eq(CONTENANTS.bien.contenu, 'bien', 'un bien immobilier contient des biens');

    /* Et les vues le tirent de la, jamais en dur. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const vue = src.slice(src.indexOf('function viewAccounts'),
                          src.indexOf('function mountAccounts'));
    vrai(!/compte\$\{siens\.length > 1 \? 's' : ''\}/.test(vue),
      'la page ne compose plus le mot à la main');
    vrai(/motContenu\(e\.id, siens\.length\)/.test(vue),
      'elle le demande à la table');
    const fiche = src.slice(src.indexOf('function viewFicheEtab'));
    vrai(/motContenu\(e\.id/.test(fiche), 'la fiche aussi');
    vrai(!/<h2>Comptes rattachés<\/h2>/.test(src),
      'et son titre de carte ne dit plus « Comptes » au-dessus de deux appartements');
  });

  test('la majuscule ne se pose qu’en tête, et ne casse rien', () => {
    /* Un mot de table s'ecrit en minuscules ; les titres et les boutons le
       relevent. La fonction doit survivre a une chaine vide, puisqu'elle recoit
       le resultat d'une table qu'on peut completer de travers. */
    eq(majuscule('bien'), 'Bien');
    eq(majuscule('comptes'), 'Comptes');
    eq(majuscule(''), '', 'une chaîne vide reste vide');
    eq(majuscule(null), '', 'et une absence ne lève pas');
    eq(majuscule('É'), 'É', 'une capitale accentuée se laisse tranquille');
  });
});

suite('Un bien se crée seul, s’estime, et se modifie par un bouton', () => {
  test('on ne rattache pas un appartement à un autre appartement', () => {
    /* Le parcours proposait « à quel bien le rattacher ? » avec les biens déjà
       enregistrés. Or le contenant EST le bien : rattacher un studio à un autre
       studio ne veut rien dire, et la ligne prenait ensuite le nom du contenant
       — deux « studio lyon » dans la même fiche, à 10 000 et 15 000 EUR.

       Le contenant ne disparaît pas pour autant, contrairement au bien de
       valeur : c'est lui qui porte le crédit. Il se crée sans qu'on ait à le
       choisir. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    vrai(/else if \(!etabId && estDetenuEnDirect\(t\)\) etabId = '__nouveau';/.test(src),
      'un bien détenu en direct crée toujours son propre contenant');

    /* L'ordre des branches est l'invariant : `etabImpose` doit passer avant.
       Le bouton « + Bien » de la fiche le pose, et c'est le chemin délibéré pour
       ajouter un parking sous l'appartement qu'il accompagne. Si la garde
       `!etabId` sautait, ce chemin serait mort. */
    const bloc = src.slice(src.indexOf('let etabId = etabImpose;'),
                           src.indexOf("if (etabId === '__nouveau')"));
    const posImpose = bloc.indexOf('estDetenuEnDirect(t)');
    vrai(/!etabId && estDetenuEnDirect/.test(bloc) && posImpose > 0,
      'la branche ne se déclenche pas quand l’établissement est imposé');
    vrai(/data-action="ajouter-compte" data-etab=/.test(src),
      'et le bouton de la fiche continue d’imposer le sien');
  });

  test('ce qu’on détient soi-même, personne ne le cote', () => {
    /* « Il faut marquer prix estime » vaut pour l'immobilier autant que pour un
       bien de valeur. La classe seule ne pouvait pas le dire : `immobilier`
       couvre un appartement, dont la valeur est une appreciation, et une SCPI,
       dont le prix de part est publie. C'est le meme drapeau `direct` qui tranche,
       parce que c'est la meme question. */
    const src = lireSource('assets/app.js');
    vrai(/function champsPlacement\(classe, l = null, prete = false, type = null\)/.test(src),
      'la fenêtre d’un placement reçoit le type, pas seulement la classe');
    vrai(/const estime = estDetenuEnDirect\(type\);/.test(src),
      'et c’est le drapeau qui décide de l’intitulé');
    vrai(/estDetenuEnDirect\(t\) \? 'Valeur estimée' : 'Valeur actuelle'/.test(src),
      'le parcours de création dit la même chose');
    vrai(!/t\.classes\.includes\('bienValeur'\) \? 'Valeur estimée'/.test(src),
      'plus de test sur une classe en particulier');

    /* Et la date d'estimation suit le meme drapeau : c'est elle qui rend
       l'intitule honnete, un chiffre estime sans date ne disant pas de quand. */
    vrai(/\.\.\.\(estime \? \[\{ cle: 'estimeLe'/.test(src),
      'la date d’estimation accompagne toujours la valeur estimée');
  });

  test('la fiche appelle un bien un bien', () => {
    /* « Nom du compte », « Type de compte », « Compte » en etiquette de tete : on
       n'a pas de compte dans une montre. Le mot se derive du meme drapeau que
       tout le reste. */
    eq(motCompte(typeCompte('bienValeur')), 'bien');
    eq(motCompte(typeCompte('immo')), 'bien');
    eq(motCompte(typeCompte('scpi')), 'compte', 'une SCPI est bien un compte');
    eq(motCompte(typeCompte('courant')), 'compte');
    eq(motCompte(typeCompte('pea')), 'compte');

    const src = lireSource('assets/app.js');
    /* Les intitules passent par trad() depuis le chantier des deux langues :
       le fragment francais est la clef, le mot du compte reste derive. */
    for (const motif of ["trad\\('Nom du'\\)\\} \\$\\{motCompte", "trad\\('Type de'\\)\\} \\$\\{motCompte",
                         "trad\\('Valeur du'\\)\\} \\$\\{motCompte"]) {
      vrai(new RegExp(motif).test(src), `la fiche dérive « ${motif} »`);
    }
    vrai(/hero-label">\$\{majuscule\(motCompte\(t\)\)\}/.test(src),
      'l’étiquette de tête aussi');
    vrai(!/<dt>Nom du compte<\/dt>/.test(src), 'plus aucun intitulé écrit en dur');
  });

  test('l’édition d’un placement se prend par un bouton, pas par son nom', () => {
    /* Le nom etait un lien pointille et personne ne le voyait : « on ne comprend
       pas qu'on doit cliquer sur le nom ». Un intitule qui ouvre une fenetre est
       un savoir qui se transmet, pas une affordance.

       Toute la ligne ne peut pas devenir le bouton : elle porte deja un `select`
       pour la disponibilite, et un bouton dans un bouton n'existe pas. */
    const src = lireSource('assets/app.js');
    /* Bornée par la fonction suivante et non par un nombre de caractères : une
       tranche fixe rate ce qui vient après le prochain commentaire ajouté. */
    const debut = src.indexOf('function lignePlacement');
    const fn = src.slice(debut, src.indexOf('function viewAccounts', debut));
    vrai(fn.length > 1000, 'la fonction doit être trouvable');
    vrai(/class="btn sm ghost plc-modif"[\s\S]{0,120}?data-action="editer-placement"/.test(fn),
      'un bouton « Modifier » explicite au bout de la rangée');
    vrai(/>\$\{trad\('Modifier'\)\}<\/button>/.test(fn), 'et il porte le mot, traduit');
    vrai(!/class="mois-lien" data-action="editer-placement"/.test(fn),
      'le nom n’est plus un lien déguisé');
    /* `l.ref != null` : l'indice de la premiere ligne vaut zero, et le tester en
       verite booleenne rendait le premier placement de chaque compte non
       modifiable. Le piege est reste, la condition doit rester explicite. */
    vrai(/l\.ref != null/.test(fn),
      'un indice se compare à null : zéro est un indice valide');

    /* La grille cede sa derniere colonne quand le bouton est la : elle etait
       taillee pour un chevron de 0.9em. */
    const css = lireSource('assets/styles.css');
    vrai(/\.plc-placement:has\(\.plc-modif\)/.test(css),
      'la grille dépend de son contenu au lieu de réserver une largeur');
  });
});

suite('Un bien change de contenant, et garde un seul nom', () => {
  test('un crédit se pose sur le contenant, et une seule fois', () => {
    /* Le constat qui a lance ce chantier : trois studios ranges dans un meme
       contenant, un credit ajoute a l'un, et « ca a attache le credit aux 3 ».

       Le calcul, lui, etait juste — mesure du 8 aout 2026 : 12 000 comptes une
       fois, brut moins dettes egale net a l'euro pres. Ce test fige cette moitie
       de la reponse, pour qu'un futur reglage du rattachement ne se mette pas a
       compter la dette autant de fois qu'elle a de biens en face. */
    Fixture.poser();
    /* L'ecart, pas la valeur absolue : le fixture porte deja ses propres
       credits, et figer un total ici ferait echouer ce test au prochain
       enrichissement du jeu synthetique pour une raison sans rapport. */
    const avant = nowTotals().dettes;
    Store.state.etabs.push({ id: 'e_lyon', nom: 'Studio Lyon', notes: '',
      dettes: [{ id: 'd1', libelle: 'prêt', montant: 12000, preteur: '' }] });
    for (const [id, v] of [['c_a', 10000], ['c_b', 15000], ['c_c', 12]]) {
      Store.state.comptes.push({ id, etabId: 'e_lyon', type: 'immo', statut: 'ouvert',
        cash: [], lignes: [{ id: 'l' + id, classe: 'immobilier',
        libelle: 'Studio Lyon', valeur: v }] });
    }
    const t = nowTotals();
    eq(round2(t.dettes - avant), 12000,
      'la dette compte une fois, pas une fois par bien qu’elle accompagne');
    eq(round2(t.brut - t.dettes), round2(t.net),
      'et le net reste le brut moins les dettes');

    /* Le contenant porte bien les trois, ce qui est le fait que l'ecran montre :
       l'affichage ne se trompe pas, c'est le rangement qui ne convient pas. */
    eq(comptesOuverts().filter(c => c.etabId === 'e_lyon').length, 3,
      'les trois biens partagent un contenant');
  });

  test('un bien peut rejoindre son propre contenant', () => {
    /* Un compte naissait dans son contenant et y restait pour toujours : aucun
       ecran ne proposait de le deplacer. Le manque ne se voyait pas sur une
       banque — on ne demenage pas un PEA — et devenait bloquant sur les biens,
       ou le contenant decide qui partage un credit. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const debut = src.indexOf("async 'modifier-compte'");
    vrai(debut > 0, 'l’action doit exister');
    const handler = src.slice(debut, src.indexOf("async 'ajouter-compte'"));
    vrai(handler.length > 500, 'et être trouvable en entier');

    vrai(/cle: 'etab', label: trad\(mot\.titre\)/.test(handler),
      'la fenêtre propose le rattachement');
    /* Le mot du contenant se traduit a l'affichage : la clef reste la phrase
       francaise que porte CONTENANTS, l'option compose le « + … » autour. */
    vrai(/'__nouveau', `\+ \$\{trad\(mot\.nouveau\)\}…`/.test(handler),
      'et « nouveau », qui est justement le geste qui sépare');
    /* Les especes et les comptes internes n'ont pas de contenant a choisir. */
    vrai(/if \(!t\.interne && !t\.sansEtab\) \{/.test(handler),
      'sauf là où il n’y a pas de contenant');
    /* Le sien reste dans la liste : sans lui, ouvrir la fenetre pour changer
       autre chose deplacerait le compte au premier contenant venu. */
    vrai(/e\.id === c\.etabId\s*\n?\s*\|\|/.test(handler),
      'son contenant actuel reste choisissable');
    /* Et l'ecriture se fait avant le reste, pour qu'un nom abandonne ne laisse
       pas la moitie des modifications posees. */
    const posEtab = handler.indexOf("c.etabId = cible;");
    const posLib = handler.indexOf("pose('libelle'");
    vrai(posEtab > 0 && posLib > posEtab,
      'le contenant se règle avant le reste : fermer la fenêtre du nom '
      + 'n’a alors rien modifié');
  });

  test('renommer un bien renomme sa ligne', () => {
    /* Le compte et sa ligne unique sont la meme chose : la creation les ecrit
       ensemble, l'affichage se replie de l'un sur l'autre. Renommer par la
       fenetre ne touchait que le compte, et la fiche montrait deux noms. */
    const src = lireSource('assets/app.js');
    const debut = src.indexOf("async 'modifier-compte'");
    const handler = src.slice(debut, src.indexOf("async 'ajouter-compte'"));
    vrai(/estDetenuEnDirect\(typeCompte\(c\.type\)\)\s*\n?\s*&& \(c\.lignes \|\| \[\]\)\.length === 1/
      .test(handler), 'le renommage suit, sous garde');
    vrai(/&& !\(c\.cash \|\| \[\]\)\.length/.test(handler),
      'et jamais sur un compte qui porte aussi des espèces');
    vrai(/c\.lignes\[0\]\.libelle = String\(v\.libelle\)\.trim\(\);/.test(handler),
      'la ligne prend le nom du bien');

    /* La garde compte : un compte a deux placements garde deux noms propres.
       Le controle est fait sur la condition, pas sur une execution, parce que
       `modifier-compte` ouvre une fenetre et ne se rejoue pas ici. */
    vrai(!/c\.lignes\.forEach\(l => l\.libelle/.test(handler),
      'aucun renommage en masse');

    /* Le nom d'un bien detenu en direct vit en trois exemplaires : compte,
       ligne, contenant. La carte de la liste des actifs affiche `etab.nom` :
       sans ce troisieme renommage, elle gardait l'ancien nom au-dessus d'une
       ligne qui portait le nouveau. */
    vrai(/etab\.nom = String\(v\.libelle\)\.trim\(\);/.test(handler),
      'le contenant prend aussi le nom du bien');
    vrai(/COMPTES\(\)\.filter\(x => x\.etabId === etab\.id\)\.length === 1/.test(handler),
      'seulement quand l’établissement n’a que ce compte : un parking '
      + 'rattaché au même contenant garde son nom propre');
  });

  test('aucun montant masqué ne se pose dans un attribut', () => {
    /* Le masque est une balise SVG qui porte son propre `aria-label="montant
       masqué"`. Injectee dans un attribut, son guillemet ferme l'attribut hote
       et la fin de la balise se deverse en texte : la carte des depenses
       affichait un `€">` nu a cote de l'objectif mensuel.

       `fmtEUR0Texte` existe pour ca — il rend « ••• € », sans balise. La regle
       vaut pour tout attribut, pas seulement celui qui a casse. */
    const src = lireSource('assets/app.js');
    const fautifs = [];
    for (const m of src.matchAll(/(title|aria-label|placeholder|data-aide)="[^"\n]*/g)) {
      if (/\$\{[^}]*\bfmt(EUR|Cur|Signed)\b(?!\w*Texte)/.test(m[0])) {
        fautifs.push(src.slice(0, m.index).split('\n').length + ' : ' + m[0].slice(0, 60));
      }
    }
    eq(fautifs.length, 0,
      'un montant masquable dans un attribut : passer par fmtEUR0Texte — ' + fautifs.join(' | '));

    /* Et le masque doit bien porter le guillemet qui rend le piege reel :
       si un jour il n'en portait plus, ce controle protegerait un fantome. */
    vrai(/aria-label="montant masqué"/.test(lireSource('assets/store.js')),
      'le masque porte un attribut, c’est ce qui interdit de l’imbriquer');
  });

  test('les usages de liquidités se plient comme les groupes de comptes', () => {
    /* Un `<details>` ne s'anime pas et n'offre aucune prise pour un geste
       collectif. Le panneau reprend donc le pli en grille de la page Actifs et
       son bouton « Tout replier », qui bascule dans les deux sens. */
    const src = lireSource('assets/app.js');
    const debut = src.indexOf("if (classe === 'liquidites')");
    const bloc = src.slice(debut, src.indexOf("if (classe === 'immobilier')", debut));
    vrai(bloc.length > 500, 'le panneau des liquidités doit être trouvable');
    vrai(!/<details class="liq-groupe"/.test(bloc),
      'plus de <details> : il ne s’anime pas');
    /* « ouvert » ne s'ecrit plus en dur : le pli se relit dans l'etat, sinon le
       premier rendu suivant — celui d'« Enregistrer » — redepliait tout. */
    vrai(/<div class="cpt-pli \$\{compteReplies\.has\(cleLiqPli\(g\.aff\)\) \? '' : 'ouvert'\}"><div class="liq-corps">/.test(bloc),
      'le pli animé est celui des groupes de comptes, et son état se relit');
    vrai(/data-cle="\$\{esc\(cleLiqPli\(g\.aff\)\)\}"/.test(bloc),
      'chaque groupe porte la clé sous laquelle son pli se mémorise');
    vrai(/data-action="liq-plier-tout"/.test(bloc) && /data-action="liq-plier"/.test(bloc),
      'un geste par groupe, et un pour les mener tous');
    /* Le bouton collectif vit sur la ligne du sous-titre, deja a moitie vide :
       une rangee a lui pousserait le contenu vers le bas dans une fenetre qui
       defile. Il sort donc de `html` et passe par `sousAction`. */
    vrai(/sousAction:/.test(bloc) && !/liq-barre/.test(bloc),
      'et il ne prend pas une ligne à lui : il se pose au bout du sous-titre');

    /* Le geste collectif ne passe pas par render() : le panneau porte des
       champs de saisie, et le reconstruire perdrait la frappe en cours. */
    const acts = src.slice(src.indexOf("'liq-plier'(btn)"), src.indexOf("'ajouter-compte'"));
    vrai(!/render\(\)/.test(acts),
      'aucun rendu global : il emporterait le focus et la saisie en cours');
    vrai(/majBoutonLiqTout/.test(acts),
      'et le libellé du bouton suit l’état après chaque geste, seul ou collectif');
  });

  test('renommer le contenant d’un bien renomme le bien', () => {
    /* Cas miroir : « Modifier l'etablissement » ne touchait que `e.nom`, meme
       quand le contenant est un bien — la carte disait « Credit immobilier »
       au-dessus d'une ligne « Appartement ». */
    const src = lireSource('assets/app.js');
    const debut = src.indexOf("async 'modifier-etab'");
    const handler = src.slice(debut, src.indexOf("async 'modifier-compte'"));
    vrai(/tous\.length === 1 && estDetenuEnDirect\(typeCompte\(tous\[0\]\.type\)\)/
      .test(handler), 'sous garde : un seul compte, détenu en direct');
    vrai(/&& !\(tous\[0\]\.cash \|\| \[\]\)\.length/.test(handler),
      'et jamais sur un compte qui porte aussi des espèces');
    vrai(/tous\[0\]\.lignes\[0\]\.libelle = e\.nom;/.test(handler),
      'la ligne prend le nom du contenant');
  });
});

suite('La pastille des cours ne certifie que ce qu’elle sait', () => {
  test('elle date le prix, jamais la requête', () => {
    /* L'invariant fondateur, pose le 6 aout 2026 : elle affichait `lastRun`,
       l'heure a laquelle on a interroge la passerelle, et disait donc « il y a
       2 min » sur des cours imprimes la veille a 22 h. Le seul repere de
       fraicheur de l'application certifiait precisement ce qui etait faux.

       La demande du 8 aout — « marquer actualise a l'instant » — revenait a
       retablir ce defaut. Ce test est la pour qu'aucune demande future ne le
       fasse par inadvertance. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const debut = src.indexOf('const marche = coursAsOf();');
    vrai(debut > 0, 'la pastille doit être trouvable');
    /* Borne par la fin de la fonction : une tranche fixe ratait la derniere
       branche des que le commentaire au-dessus s'allongeait. */
    const bloc = src.slice(debut, src.indexOf('function symbolSearchCard', debut));
    vrai(!bloc.includes('quand.textContent = ' + String.fromCharCode(39) + 'à l'),
      'jamais « à l’instant » écrit en dur : ce serait dater la requête');
    vrai(/fmtWhen\(new Date\(marche \* 1000\)\)/.test(bloc),
      'l’âge affiché est celui du cours');

    /* `coursAsOf()` prend le plus recent, ce qui est le bon choix pour une seule
       place et le mauvais des qu'il y en a deux. C'est pour cela que l'age ne
       s'affiche que lorsque tout a cote. */
    Fixture.poser();
    const t = Math.floor(Date.now() / 1000);
    Store.state.positions.forEach((p, i) => { p.manual = false; p.quoteTime = t - i * 3600; });
    eq(coursAsOf(), t, 'coursAsOf donne le cours le plus récent, pas le plus vieux');
  });

  test('trois états, parce qu’un portefeuille tient sur deux places', () => {
    /* Paris ouvre a 9 h, New York a 15 h 30 : entre les deux, la moitie des
       lignes a cote et l'autre non. Un age serait alors celui de la moitie
       fraiche, et le point vert dirait que tout va bien au-dessus d'un
       portefeuille a moitie perime. Question du propriétaire le 8 aout 2026 :
       « et si la moitie du marche est ouvert ? France mais pas US ». */
    const src = lireSource('assets/app.js');
    const debut = src.indexOf('const marche = coursAsOf();');
    /* Borne par la fin de la fonction : une tranche fixe ratait la derniere
       branche des que le commentaire au-dessus s'allongeait. */
    const bloc = src.slice(debut, src.indexOf('function symbolSearchCard', debut));

    vrai(/const partiel = !ferme && j\.horsSeance > 0;/.test(bloc),
      'l’état intermédiaire existe');
    vrai(/ferme \? trad\('hors séance'\)/.test(bloc),
      'tout fermé se dit « hors séance »');
    vrai(/partiel \? `\$\{j\.horsSeance\} \$\{trad\('hors séance'\)\}`/.test(bloc),
      'à moitié ouvert, le compte de ce qui n’a pas bougé');
    /* La pastille ne peut pas rester verte quand une part du portefeuille date
       de la veille : le point est le seul signal qu'on lit sans s'arreter. */
    vrai(/if \(partiel\) \{ btn\.classList\.remove\('frais'\); btn\.classList\.add\('tiede'\); \}/
      .test(bloc), 'et le point reste tiède, jamais frais');

    /* L'ordre des trois branches est l'invariant : « hors seance » doit passer
       avant « partiel », sinon un portefeuille entierement ferme afficherait le
       compte de ses lignes au lieu de sa raison. */
    const posFerme = bloc.indexOf("ferme ? trad('hors séance')");
    const posPartiel = bloc.indexOf('partiel ? `${j.horsSeance}');
    const posAge = bloc.indexOf('marche ? fmtWhen(new Date(marche * 1000))');
    vrai(posFerme > 0 && posPartiel > posFerme && posAge > posPartiel,
      'du plus fermé au plus ouvert : l’âge ne s’affiche qu’en dernier recours');
  });

  test('« tout hors séance » et « une partie » se dérivent des lignes détenues', () => {
    /* Pas d'une table d'horaires : les places n'ouvrent pas aux memes heures, et
       un ETF europeen dans un portefeuille americain ferait mentir n'importe
       quelle table. Ce qui compte n'est pas l'heure qu'il est, c'est qu'aucune
       ligne detenue n'ait bouge. */
    const src = lireSource('assets/app.js');
    const debut = src.indexOf('const marche = coursAsOf();');
    /* Borne par la fin de la fonction : une tranche fixe ratait la derniere
       branche des que le commentaire au-dessus s'allongeait. */
    const bloc = src.slice(debut, src.indexOf('function symbolSearchCard', debut));
    vrai(/const j = dayPerformance\(\);/.test(bloc),
      'l’état vient des lignes, pas d’un calendrier');
    vrai(!/getHours\(\)|09:00|15:30/.test(bloc),
      'aucune heure d’ouverture écrite en dur');

    /* Et le modele rend bien les deux quantites dont la pastille a besoin. */
    Fixture.poser();
    const j = dayPerformance();
    vrai('toutHorsSeance' in j, 'le total');
    vrai(typeof j.horsSeance === 'number', 'et le compte');
    /* Les deux quantites se recoupent : « tout hors seance » ne peut etre vrai
       que si le compte egale le nombre de lignes suivies. */
    eq(j.toutHorsSeance, j.lignes.length > 0 && j.horsSeance === j.lignes.length,
      '« tout hors séance » est exactement « chaque ligne hors séance »');
  });
});

suite('Un graphique de ventes tient debout à huit cents ventes', () => {
  test('le pas se dérive de la plage, jamais du nombre de ventes', () => {
    /* Un seuil sur le nombre ferait changer la nature du graphique sans qu'on
       ait rien demande : on ajoute une vente, et les barres se mettent a vouloir
       dire autre chose. La plage, elle, est un geste — « 5 ans » demande une vue
       de cinq ans, et le trimestre y est la bonne maille. */
    eq(pasDesVentes('ytd'), 'mois');
    eq(pasDesVentes('1y'), 'mois');
    eq(pasDesVentes('3y'), 'trimestre');
    eq(pasDesVentes('5y'), 'trimestre');
    eq(pasDesVentes('all'), 'année');
    /* Une plage inconnue — un identifiant d'une session precedente — ne doit pas
       rendre `undefined` : la maille la plus large repond toujours. */
    eq(pasDesVentes('15y'), 'année', 'une plage inconnue retombe sur l’année');
    eq(pasDesVentes(undefined), 'année');

    /* Le mot s'affiche en tete de carte : il porte donc son accent. */
    vrai(/é/.test(pasDesVentes('all')),
      'le texte affiché porte ses accents, même quand c’est aussi un identifiant');
  });

  test('huit cents ventes sur dix ans donnent une dizaine de barres', () => {
    /* La mesure qui a motive le chantier. Une barre par vente repond bien a
       « qu'est-ce que j'ai encaisse sur celle-la » tant qu'il y en a cinq ; a
       huit cents, les barres font un pixel. */
    const ventes = [];
    for (let i = 0; i < 800; i++) {
      const d = new Date(2016, 0, 1);
      d.setDate(d.getDate() + Math.floor(i * 4.5));
      ventes.push({ id: 'v' + i, name: 'Titre ' + (i % 37),
        date: d.toISOString().slice(0, 10), realised: 10 });
    }
    const parAn = ventesParPeriode(ventes, 'année');
    vrai(parAn.length >= 9 && parAn.length <= 12,
      `dix ans donnent une dizaine de barres, pas huit cents (${parAn.length})`);
    const parTrim = ventesParPeriode(ventes, 'trimestre');
    vrai(parTrim.length >= 36 && parTrim.length <= 44,
      `et le trimestre en donne une quarantaine (${parTrim.length})`);

    /* La regle cardinale : un total egale la somme de ses parts. Regrouper ne
       doit ni perdre ni inventer un euro, quelle que soit la maille. */
    const total = ventes.reduce((s, v) => s + num(v.realised), 0);
    for (const [nom, paquets] of [['année', parAn], ['trimestre', parTrim],
                                  ['mois', ventesParPeriode(ventes, 'mois')]]) {
      eq(round2(paquets.reduce((s, p) => s + p.value, 0)), round2(total),
        `la somme des barres par ${nom} fait le total réalisé`);
      eq(paquets.reduce((s, p) => s + p.count, 0), ventes.length,
        `et chaque vente est comptée une fois par ${nom}`);
    }
  });

  test('les périodes sortent dans l’ordre, et les vides n’existent pas', () => {
    /* Un mois vide n'est pas une barre a zero : c'est un mois sans vente, et le
       dessiner ferait croire a une vente nulle. */
    const ventes = [
      { date: '2024-03-10', realised: 100 },
      { date: '2022-11-02', realised: 50 },
      { date: '2024-03-28', realised: 25 },
    ];
    const parMois = ventesParPeriode(ventes, 'mois');
    eq(parMois.length, 2, 'deux mois portent quelque chose, pas les seize entre eux');
    eq(parMois[0].id, '2022-11', 'le plus ancien vient en premier');
    eq(parMois[1].id, '2024-03');
    eq(parMois[1].value, 125, 'les deux ventes du même mois s’additionnent');
    eq(parMois[1].count, 2);
    eq(parMois[0].label, 'nov. 22', 'l’intitulé est lisible');
    eq(ventesParPeriode(ventes, 'trimestre')[1].label, 'T1 24');
    eq(ventesParPeriode(ventes, 'année')[1].label, '2024');

    /* Une vente sans date ne peut se ranger nulle part : elle ne doit pas creer
       une periode « undefined » au debut du graphique. */
    const avecTrou = [...ventes, { date: '', realised: 999 }];
    eq(ventesParPeriode(avecTrou, 'année').length, 2,
      'une vente sans date ne fabrique pas une période fantôme');
  });

  test('l’intitulé de la carte et le graphique disent la même chose', () => {
    /* La condition s'est d'abord ecrite deux fois, dans le titre et dans le
       montage. Deux copies d'une meme regle divergent, et celle-ci aurait fait
       annoncer « vente par vente » au-dessus de barres trimestrielles. */
    vrai(ventesSeNomment('1y', 5), 'peu de ventes sur un an : elles se nomment');
    vrai(!ventesSeNomment('1y', 200), 'deux cents sur un an : elles se regroupent');
    vrai(!ventesSeNomment('all', 3), 'et « Tout » regroupe même trois ventes');
    vrai(!ventesSeNomment('5y', 2), 'la plage décide avant le nombre');

    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    eq((src.match(/ventesSeNomment\(/g) || []).length, 2,
      'deux appels — le titre et le graphique — sur une seule règle');
    vrai(!/pasDesVentes\(salesRange\) === 'mois' &&/.test(src),
      'la condition n’est plus recopiée à la main');
  });

  test('le contenu cesse de s’étirer sur un écran très large', () => {
    /* Sur 2 000 px, la colonne en faisait 1 750, et une courbe a douze points s'y
       etirait sur toute la largeur : des pixels depenses a eloigner les reperes,
       pas a montrer davantage. La borne ne joue qu'au-dela des tailles courantes
       — 1 440, 1 512 — pour ne rien changer a ceux qui les utilisent. */
    const css = lireSource('assets/styles.css');
    vrai(css, 'assets/styles.css doit être lisible pour ce contrôle');
    const bloc = css.slice(css.indexOf('.view {'), css.indexOf('.view {') + 260);
    vrai(/max-width: 1480px/.test(bloc), 'la colonne de contenu est bornée');
    vrai(/margin: 0 auto/.test(bloc), 'et centrée au-delà');
    vrai(/width: 100%/.test(bloc),
      'sans quoi une colonne flex se rétrécirait sur son contenu');
    /* Sur `.view` et non sur `body` : la barre laterale garde son bord d'ecran,
       qui est ce qui la fait lire comme une barre. */
    const corps = css.slice(css.indexOf('body {'), css.indexOf('body {') + 400);
    vrai(!/max-width/.test(corps), 'la grille de page n’est pas bornée, elle');
  });
});

suite('Un loyer se rattache depuis le bien, pas depuis une liste', () => {
  test('deux boutons qui font, là où il y en avait un qui renvoyait', () => {
    /* « Loyers » ouvrait la fenetre generique des revenus fixes, ou il fallait
       retrouver la bonne ligne et changer sa liste de « aucun » vers ce bien :
       trois gestes, dans un ecran qui ne parle pas du bien, et dont l'intitule
       — « Revenus fixes » — ne ressemble pas au bouton clique. « Il n'y a pas
       vraiment de bouton pour rattacher un loyer, j'arrive sur revenu fixe »,
       Le propriétaire, 8 aout 2026.

       La carte « Financement » juste en dessous montrait la bonne forme depuis
       le debut : « + Credit » cree le credit rattache, sans detour. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    vrai(/data-action="ajouter-loyer" data-id="\$\{esc\(c\.id\)\}"/.test(src),
      'le bouton porte le bien sur lequel on se trouve');
    vrai(/data-action="ajouter-charge-bien" data-id="\$\{esc\(c\.id\)\}"/.test(src),
      'la charge aussi : taxe foncière, copropriété');
    vrai(!/data-action="toggle-revenus"[\s\S]{0,80}?>Loyers</.test(src),
      'le bouton qui renvoyait vers la liste générique a disparu de cette carte');

    /* Le rattachement n'est pas un champ de ces formulaires : il est leur raison
       d'etre. Un menu ou l'on pourrait choisir « aucun » redonnerait le geste
       qu'on vient d'eviter. */
    const loyer = src.slice(src.indexOf("async 'ajouter-loyer'"),
                            src.indexOf("async 'ajouter-charge-bien'"));
    vrai(loyer.length > 200, 'l’action doit être trouvable');
    vrai(!/cle: 'bienId'/.test(loyer),
      'aucun menu de rattachement : on part du bien');
    vrai(/bienId: c\.id/.test(loyer), 'il se pose d’office');
  });

  test('le loyer et la charge créés depuis la fiche entrent dans le cash-flow', () => {
    /* Le controle qui compte : un loyer pose par ce bouton doit se retrouver dans
       `cashFlowBien()`, sinon le geste ne sert a rien. Mesure du 8 aout 2026 :
       650 EUR de loyer, 1 200 EUR de taxe fonciere par an, cash-flow 550 EUR. */
    Fixture.poser();
    Store.state.etabs.push({ id: 'e_m', nom: 'Studio Marseille', notes: '', dettes: [] });
    Store.state.comptes.push({ id: 'c_m', etabId: 'e_m', type: 'immo', statut: 'ouvert',
      libelle: 'Studio Marseille', cash: [],
      lignes: [{ id: 'l_m', classe: 'immobilier', libelle: 'Studio Marseille',
                 valeur: 120000, prixDeRevient: 100000 }] });

    Store.state.budget.income.push({ label: 'Loyer Studio Marseille', amount: 650, bienId: 'c_m' });
    Store.state.budget.fixedCharges.push({ label: 'Taxe foncière', amount: 1200,
      period: 'an', provider: '', shares: {}, creditId: null, bienId: 'c_m' });

    const cf = cashFlowBien(compteById('c_m'));
    vrai(cf, 'le bien a un cash-flow');
    eq(round2(cf.loyers), 650, 'le loyer est ramené au mois');
    eq(round2(cf.charges), 100, '1 200 € par an font 100 € par mois');
    /* La regle cardinale : le cash-flow egale la somme de ses parts. */
    eq(round2(cf.loyers - cf.charges), 550,
      'le cash-flow est le loyer moins les charges, sans rien d’autre');

    /* Et le rattachement ne double pas le budget : la meme somme ne doit pas
       compter deux fois parce qu'elle est aussi rangee sous un bien. */
    const avant = Store.state.budget.income.reduce((s, r) => s + num(r.amount), 0);
    eq(round2(avant), round2(Store.state.budget.income
      .reduce((s, r) => s + num(r.amount), 0)),
      'le loyer entre une fois dans les revenus');
  });

  test('la période d’une charge de bien part sur l’année', () => {
    /* Une taxe fonciere se paie une fois l'an, une copropriete par trimestre :
       c'est ce qu'on lit sur l'avis, et le budget ramene au mois tout seul.
       Proposer « mois » par defaut ferait saisir 1 200 la ou il faut 100. */
    Fixture.poser();
    const src = lireSource('assets/app.js');
    const charge = src.slice(src.indexOf("async 'ajouter-charge-bien'"),
                             src.indexOf("async 'ajouter-credit'"));
    vrai(charge.length > 200, 'l’action doit être trouvable');
    /* Elle se derive du premier poste propose au lieu d'etre ecrite ici : la
       table dit deja qu'une taxe fonciere se paie a l'annee, et le redire en dur
       laisserait les deux diverger. */
    vrai(/cle: 'period'[\s\S]{0,160}?valeur: proposes\[0\]\[1\]/.test(charge),
      'la période vient du premier poste proposé');
    eq(chargesProposees(compteById('c_immo'))[0][1], 'an',
      'et ce premier poste, la taxe foncière, se facture à l’année');
    vrai(/options: CHARGE_PERIODES/.test(charge),
      'et les autres restent offertes, dérivées de la même table qu’ailleurs');

    /* La conversion au mois vient de la fonction commune, pas d'un calcul refait
       ici : deux facons de ramener au mois finiraient par diverger. */
    eq(round2(chargeMensuelle({ amount: 1200, period: 'an' })), 100);
    eq(round2(chargeMensuelle({ amount: 300, period: 'trimestre' })), 100);
  });
});

/* ------------------------------------------------------------------
   Un bien de valeur compte partout ou l'argent compte

   « J'ai teste l'ajout d'une montre a 10 000 EUR mais mon patrimoine net
   n'augmente pas ! Et n'apparait pas dans allocation - patrimoine. »
   Le propriétaire, 9 aout 2026.

   patrimoine() comptait la montre depuis le 6 aout — son brut se derive de
   toutes les classes. Mais nowByGroup() sommait cinq poches ecrites a la
   main, sans `biens`, et tout ce qui lit nowTotals() (pied de barre,
   allocation, courbe d'evolution, projection) l'ignorait. Deux bruts dans
   l'application, un seul juste, aucun ecran pour le dire.
   ------------------------------------------------------------------ */
suite('Un bien de valeur compte partout', () => {

  const MONTRE = 10000;
  const avecMontre = () => Fixture.poser(e => {
    e.comptes.push({ id: 'c_montre', etabId: null, type: 'bienValeur',
      statut: 'ouvert', libelle: 'Montre', ouvertLe: '', numero: '', notes: '',
      cash: [],
      lignes: [{ id: 'l_montre', classe: 'bienValeur', libelle: 'Montre',
                 valeur: MONTRE, prixDeRevient: 9000, dateAcquisition: '',
                 estimeLe: '2026-08-01' }] });
  });

  test('le brut des écrans est celui du modèle, montre comprise', () => {
    avecMontre();
    eq(nowTotals().brut, Fixture.BRUT + MONTRE,
      'nowTotals() doit porter le même brut que patrimoine()');
    eq(nowTotals().net, Fixture.BRUT + MONTRE - Fixture.DETTE,
      'et le net qui va avec : c’est lui qui s’affiche au pied de la barre');
  });

  test('la somme des poches d’écran fait le brut, quelle que soit la classe', () => {
    /* C'est l'assertion qui manquait : elle echoue d'elle-meme le jour ou une
       classe entre dans CLASSES_ACTIFS sans sa poche d'ecran. */
    avecMontre();
    pres(Object.values(nowByGroup()).reduce((s, v) => s + v, 0), patrimoine().brut,
      'une poche écrite à la main a déjà oublié les biens de valeur');
  });

  test('la photo du jour et l’historique portent la sixième poche', () => {
    avecMontre();
    const auj = historySeries().at(-1);
    eq(auj.biens, MONTRE, 'le point « Auj. » de la courbe trace la montre');
    pres(auj.total, patrimoine().brut, 'et son total reste la somme des bandes');

    Store.state.monthly.push({ date: '2026-02-28', comment: '',
      v: { c_montre: 9000 } });
    const g = rowGroups(Store.state.monthly.at(-1));
    eq(g.biens, 9000, 'un relevé passé range la montre dans sa poche');
    pres(rowTotal(Store.state.monthly.at(-1)), 9000,
      'et le total du relevé se dérive des poches, il ne les recopie pas');
  });

  test('la projection pose la montre à plat, et ses poches font le net', () => {
    /* Une montre ne capitalise pas : elle rejoint l'immobilier net dans la
       part plate. La faire fructifier au taux du non cote serait le mensonge
       que la projection refuse deja au compte courant. */
    avecMontre();
    const t = nowTotals();
    pres(partPlate(t), 120000 + MONTRE - Fixture.DETTE,
      'la part plate porte l’immobilier et la montre, nets du crédit');
    const po = pochesProjection(t);
    pres(po.marche + po.nonCote + po.liquidites + po.plat, t.net,
      'aucun euro ne se perd ni ne se dédouble en changeant de poche');
  });

  test('le graphique d’évolution connaît chaque poche d’écran', () => {
    /* Derive : chaque cle de nowByGroup() doit avoir sa bande declaree dans
       SERIES_PATRIMOINE, sinon la pile cesse de faire le total — sans erreur,
       sans ecran pour le dire. Le controle couvre la poche de demain. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    Fixture.poser();
    /* Chaque poche a sa bande, sans exception. Le capital garanti en a été
       privé un temps, replié dans la bourse au motif que le passé ne se découpe
       pas par classe : le motif était bon, la conclusion fausse. Les obligations
       SONT des actifs de marché, donc les fondre dans cette bande dit vrai ; un
       fonds euros n'en est pas un, et un patrimoine entièrement en fonds euros
       s'affichait à 100 % d'actifs de marché. Une étiquette juste sur un début
       tardif vaut mieux qu'une étiquette fausse sur toute la courbe. */
    for (const cle of Object.keys(nowByGroup())) {
      vrai(new RegExp(`key: '${cle}'`).test(src),
        `la poche « ${cle} » n’a pas de bande dans SERIES_PATRIMOINE`);
    }
    /* La cascade des dettes du tracé net visite CHAQUE bande, du moins liquide
       au plus liquide : une poche oubliée là, et la dette cesse d'être
       entièrement retranchée dès qu'elle dépasse les poches visitées. Dérivée
       plutôt qu'écrite en dur, sinon la poche suivante manquera aussi — c'est
       exactement ce qui vient d'arriver au capital garanti. */
    const cascade = (src.match(/for \(const cle of \[('[a-z]+'(?:, )?)+\]\)/) || [''])[0];
    for (const cle of Object.keys(nowByGroup())) {
      vrai(cascade.includes(`'${cle}'`),
        `la cascade des dettes saute la poche « ${cle} »`);
    }
    vrai(/q\.total = SERIES_PATRIMOINE\(\)\.reduce/.test(src),
      'et le total du point se dérive des séries tracées');
  });

  test('la fenêtre du non coté ne liste que du non coté', () => {
    /* Elle listait tous les comptes du groupe d'ecran `pe` — immobilier et
       biens compris — sur un total qui ne compte que la classe nonCote : un
       studio a 120 000 EUR sous un titre « Placements non cotés », et un
       total plus petit que la somme de ses lignes. */
    const src = lireSource('assets/app.js');
    const bloc = src.slice(src.indexOf('  pe: () => {'), src.indexOf('  investi: () =>'));
    vrai(bloc.length > 100, 'l’aperçu du non coté doit être trouvable');
    vrai(/l\.classe === 'nonCote'/.test(bloc),
      'les lignes se filtrent sur la classe du total, pas sur le groupe d’écran');
    vrai(!/groupe === 'pe'/.test(bloc),
      'le groupe d’écran rassemble aussi l’immobilier et les biens : il ment ici');
  });
});

/* ------------------------------------------------------------------
   Naviguer par les barres arrive en haut de page
   ------------------------------------------------------------------ */
suite('La navigation arrive en haut, la memoire sert au retour de fiche', () => {

  test('la barre du bas et le menu posent le drapeau de retour en haut', () => {
    /* « De nouveau le bug sur mobile quand je retourne sur apercu, ça doit
       revenir en haut de la page. » La memoire de position par vue couvrait
       aussi les appuis sur la barre du bas : revenir sur Apercu rendait la
       page a 1 500 px, la ou on l'avait laissee. La regle etait pourtant deja
       donnee : « le changement de menu, oui on doit arriver en haut
       forcement ».

       Le drapeau se pose sur le geste — barre du bas, menu lateral, logo —
       et jamais dans render() : la memoire de position doit rester entiere
       pour revenir d'une fiche a la liste qu'on parcourait. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    vrai(/lien\.getAttribute\('href'\) !== location\.hash\) \{ retourHautDemande = true; return; \}/.test(src),
      'un appui sur la barre du bas qui navigue demande le haut de page');
    vrai(/href && href !== location\.hash\) retourHautDemande = true;/.test(src),
      'un clic dans le menu latéral aussi');
    const poseurs = (src.match(/retourHautDemande = true/g) || []).length;
    vrai(poseurs >= 3, 'les trois portes — logo, barre, menu — posent le même drapeau');
    /* Et la restauration de position existe toujours : c'est elle qui ramene
       une liste la ou on l'avait laissee en revenant d'une fiche. */
    vrai(/positionsVues\.get\(signatureVue\)/.test(src),
      'la mémoire de position par vue reste en place pour le retour de fiche');
  });
});

/* ------------------------------------------------------------------
   Budget, retours du 9 aout 2026
   ------------------------------------------------------------------ */
suite('Budget : le pourcentage dit sa base, l annee reste une annee', () => {

  test('le budget consomme ne se rend que sur une base positive', () => {
    /* La regle de la maison, appliquee au nouveau venu : « un pourcentage
       n existe que sur une base positive ». Sans objectif regle, la carte ne
       montre pas de part — elle n a rien pour la calculer. (« Objectif
       utilisé » a vecu un jour : « je suis pas fan », et « Budget consommé »
       est le mot du domaine.) */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const i = src.indexOf('Budget consommé');
    vrai(i > 0, 'la carte du mois porte la part du budget consommée');
    const garde = src.slice(i - 700, i);
    vrai(/f\.target > 0/.test(garde),
      'et elle ne se rend que si un objectif positif existe');
  });

  test('aucun sélecteur d’année n’offre plus « Toutes les années »', () => {
    /* Retire de Budget le matin du 9 aout, puis de partout le meme jour :
       « ce sera illisible en l'etant apres longtemps ». Les quatre selecteurs
       gouvernent des listes, et dix ans de lignes empilees ne repondent a
       aucune question — la vue longue appartient a la courbe et a ses durees.
       Le controle porte sur la fonction unique : un cran qui reviendrait chez
       un appelant reviendrait ici. */
    const src = lireSource('assets/app.js');
    const fn = src.slice(src.indexOf('function yearControl'), src.indexOf('function tile'));
    vrai(fn.length > 100, 'yearControl doit être trouvable');
    vrai(!/Toutes les années/.test(fn), 'le cran a quitté la fonction, donc tous ses appelants');
    /* Et une valeur `all` restee d un vieux geste retombe sur l annee en
       cours, pour chacun des quatre etats d annee. */
    /* `salesYear` a quitte cette liste avec le selecteur du journal : sa borne
       est celle de la page, et `rangeControl` n'offre pas de cran « toutes ». */
    for (const etat of ['budgetYear', 'evoYear', 'historyYear']) {
      vrai(new RegExp(`if \\(${etat} === 'all'\\) ${etat} = null;`).test(src),
        `${etat} doit absorber l’ancienne valeur « all »`);
    }
  });

  });

/* ------------------------------------------------------------------
   Une vente declaree n ecrit que le journal
   ------------------------------------------------------------------ */
suite('Une vente déclarée n’écrit que le journal', () => {

  /* « Trouver un systeme pour pouvoir declarer d anciennes ventes, donc sans
     impacter quoi que ce soit, ni le cash ni le patrimoine. Juste pour avoir
     l info. » C est la reponse au chantier d ETAT.md : noter une vente d un
     PEA cloture demandait de recreer le compte, la ligne, de vendre, puis
     d archiver — quatre gestes pour fabriquer un fait passe. */

  test('elle entre au journal sans toucher un euro', () => {
    Fixture.poser();
    const netAvant = patrimoine().net;
    const nbPositions = Store.state.positions.length;
    const cashAvant = JSON.stringify(Store.state.comptes.map(c => c.cash));
    declarerVente({ date: '2023-05-10', name: 'Total', gross: 4800, realised: 300 });
    eq(Store.state.sales.length, 1, 'la vente est au journal');
    eq(Store.state.sales[0].declaree, true, 'et elle dit ce qu elle est');
    pres(Store.state.sales[0].invested, 4500,
      'le prix de revient se dérive de l’encaissé et du résultat');
    pres(patrimoine().net, netAvant, 'pas un euro de patrimoine');
    eq(Store.state.positions.length, nbPositions, 'aucune ligne touchée');
    eq(JSON.stringify(Store.state.comptes.map(c => c.cash)), cashAvant,
      'aucun cash crédité : il est arrivé sur le compte il y a des années');
  });

  test('elle compte dans les statistiques du journal, c’est sa raison d’être', () => {
    Fixture.poser();
    declarerVente({ date: '2023-05-10', name: 'Total', gross: 4800, realised: 300 });
    const st = salesStats('all');
    eq(st.sales.length, 1, 'le journal la montre');
    pres(salesCumulative('all').at(-1).cumulative, 300,
      'et la courbe du réalisé la cumule : c’est l’info qu’on voulait garder');
  });

  test('l’annuler ne rend rien, parce qu’il n’y a rien à rendre', () => {
    /* Le chemin normal d annulation rend les titres et reprend les especes.
       Le derouler sur une vente declaree pousserait une ligne fantome de
       quantite nulle et retrancherait un produit jamais credite. */
    Fixture.poser();
    declarerVente({ date: '2023-05-10', name: 'Total', gross: 4800, realised: 300 });
    const nbPositions = Store.state.positions.length;
    const cashAvant = JSON.stringify(Store.state.comptes.map(c => c.cash));
    annulerVente(0);
    eq(Store.state.sales.length, 0, 'la ligne quitte le journal');
    eq(Store.state.positions.length, nbPositions, 'aucune ligne fantôme ne naît');
    eq(JSON.stringify(Store.state.comptes.map(c => c.cash)), cashAvant,
      'et aucun euro ne repart d’un compte qui n’avait rien reçu');
  });

  test('ses champs muets se taisent à l’écran, avec leur raison', () => {
    /* Sans quantite ni prix, la ligne ecrivait « 0 » et « 0,00 € » : une vente
       amputee plutot qu'une vente declaree. Le tableau a cede la place a une liste
       cliquable et a un panneau de detail, et la regle a suivi les deux — c'est le
       genre de silence qu'un remplacement d'affichage emporte sans le dire. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const carte = src.match(/function salesCard\(\) \{[\s\S]*?\n\}/)[0];
    vrai(/v\.declaree \? trad\('déclarée, pour mémoire'\)/.test(carte),
      'la ligne dit d’où elle vient au lieu d’annoncer une quantité nulle');
    vrai(/num\(v\.qty\)\} × \$\{fmtCur\(v\.price, dev\)\}/.test(carte),
      'et la quantité ne s’affiche que sur une vente qui en a une');
    const ap = src.slice(src.indexOf('vente: (i) =>'), src.indexOf('vente: (i) =>') + 2200);
    vrai(/\$\{v\.declaree \? '' : `/.test(ap),
      'le panneau tait les trois champs de prix sur une vente déclarée');
    vrai(/if \(v\.declaree\) \{\n    Store\.state\.sales\.splice/.test(lireSource('assets/store.js')),
      'l’annulation la retire sans rien défaire d’autre');
  });
});

/* ------------------------------------------------------------------
   Marches se filtre par compte
   ------------------------------------------------------------------ */
suite('Marchés : le filtre de compte suit les règles du filtre de rôle', () => {

  test('il agit sur la liste, se dérive des positions, et se tait seul', () => {
    /* « Si je choisis un compte, je ne vois que les positions de ce compte. »
       Meme regime que le filtre Core / Satellite : la liste des lignes, pas
       les tuiles du haut — une valeur de portefeuille qui changerait selon un
       filtre d affichage serait un piege. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    vrai(/\.filter\(\(\{ p \}\) => posCompte === 'tous' \|\| p\.account === posCompte\)/.test(src),
      'la liste des lignes passe par le filtre de compte');
    vrai(/ids\.length < 2\) return '';/.test(src),
      'le sélecteur ne se rend qu’à partir de deux comptes : un contrôle sans '
      + 'effet se lit comme une panne');
    vrai(/new Set\(Store\.state\.positions\.map\(p => p\.account\)\)/.test(src),
      'ses options se dérivent des positions, jamais d’une liste écrite à la main');
    vrai(/posCompte !== 'tous' && !Store\.state\.positions\.some/.test(src),
      'un compte disparu ne peut pas rester filtré : la page semblerait vide');
    vrai(/v === posCompte\) return;/.test(src),
      'le gestionnaire est idempotent : deux routeurs de change visent ce sélecteur');
  });
});

/* ------------------------------------------------------------------
   Le detail mensuel se trie, et ses colonnes se rangent
   ------------------------------------------------------------------ */
suite('Détail mensuel : tri des lignes, ordre des colonnes', () => {

  test('déplacer une catégorie déplace la colonne partout, par la seule liste', () => {
    /* L ordre de budget.categories EST l ordre des colonnes du tableau, de la
       fenetre de saisie, des graphiques et des exports : une liste, un geste. */
    Fixture.poser();
    eq(deplacerCategorie('Voyages', -1), true, 'la seconde peut avancer');
    eq(expenseCategories().join('|'), 'Voyages|Courses', 'et la liste a tourné');
    eq(deplacerCategorie('Voyages', -1), false, 'la première ne va pas plus haut');
    eq(deplacerCategorie('Courses', +1), false, 'ni la dernière plus bas');
    eq(expenseCategories().join('|'), 'Voyages|Courses', 'les bornes ne défont rien');
  });

  test('la liste par défaut se matérialise avant de se réordonner', () => {
    /* Sans categories posees, expenseCategories() rend une constante partagee :
       on ne reordonne pas une constante, on la copie d abord chez soi. */
    Fixture.poser(e => { e.budget.categories = []; });
    const defaut = [...expenseCategories()];
    vrai(defaut.length >= 2, 'le jeu par défaut porte plusieurs catégories');
    eq(deplacerCategorie(defaut[1], -1), true);
    eq(Array.isArray(Store.state.budget.categories), true, 'la liste vit désormais dans l’état');
    eq(Store.state.budget.categories[0], defaut[1], 'et c’est elle qui a tourné');
  });

  test('le tri ne touche que le tableau du grand écran', () => {
    /* La liste de telephone n a pas d en-tetes pour dire son ordre, et un
       ordre muet est un piege : elle reste chronologique. « vs obj. » ne trie
       pas — son classement serait celui du total, l objectif etant le meme
       pour tous les mois. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const carte = src.slice(src.indexOf('data-anchor="detail-mensuel"'),
                            src.indexOf('Renommer, retirer ou supprimer'));
    vrai(/depSort \? \(\(\) => \{/.test(carte), 'le tableau trie une copie de la vue indexée');
    const mobile = carte.slice(carte.indexOf('liste-mobile'), carte.indexOf('table-wrap'));
    vrai(/lignesDepenses\.map/.test(mobile) && !/depSort/.test(mobile),
      'la liste de téléphone ignore le tri');
    vrai(/<th>\$\{trad\('vs obj\.'\)\}<\/th>/.test(carte), '« vs obj. » reste une en-tête muette');
  });
});

/* ------------------------------------------------------------------
   Enregistrer suit une seule regle, par famille de fenetres
   ------------------------------------------------------------------ */
suite('Enregistrer : une règle, deux familles', () => {

  /* « Certaines cartes il faut enregistrer puis fermer. D autres enregistrer
     ferme la carte. » (9 aout 2026). L inventaire a montre deux familles
     voulues et UNE vraie incoherence, corrigee ici :

     - fenetre de SAISIE EN SERIE (fiche de ligne, depenses du mois, releve,
       apercus modifiables) : Enregistrer ecrit et reste, Fermer part et
       demande s il reste du non-enregistre ;
     - fenetre d ACTE (creer, vendre, confirmer) : le bouton porte le nom de
       l acte et ferme.

     Le releve mensuel etait le transfuge : douze champs comme sa jumelle des
     depenses, mais Enregistrer fermait et « Annuler » jetait la saisie sans
     une question. */

  test('un pied de fenêtre tient sur une ligne à 375 px', () => {
    /* Le pied est le seul endroit de l'application ou la place est comptee
       d'avance : ses boutons se partagent la largeur a parts egales sur
       telephone. Trois boutons font 107 px chacun, quatre en font 80, et un
       libelle trop long s'y plie en trois lignes — la hauteur du pied double, ses
       voisins s'etirent avec lui, et « Enregistrer » parait enorme. C'est ce qui
       est arrive avec « Voir les autres mois ».

       La mesure porte sur la somme des libelles d'un meme pied, pas sur chacun :
       « Enregistrer la vente » tient tres bien face au seul « Annuler », et
       l'interdire aurait ete arbitraire. Trente-six caracteres, marge comprise
       pour l'anglais, qui est parfois plus long. */
    const src = lireSource('assets/app.js');
    const pieds = src.match(/\$\('#modalFoot'\)\.innerHTML =[\s\S]{0,900}?`;/g) || [];
    vrai(pieds.length >= 4, `au moins quatre pieds attendus, ${pieds.length} trouvés`);
    for (const pied of pieds) {
      const libelles = [...pied.matchAll(/trad\('([^']+)'\)/g)].map(m => m[1])
        /* Les libelles hors bouton — un titre, une aide — ne comptent pas. */
        .filter(l => l.length < 30);
      if (!libelles.length) continue;
      const somme = libelles.reduce((s, l) => s + l.length, 0);
      vrai(somme <= 36,
        `pied trop chargé (${somme} caractères) : ${libelles.join(' + ')}`
        + '\n  un libellé plus court, ou une ligne dédiée comme .btn-encore');
    }
  });

  test('toute fenêtre de saisie en série porte la paire, sans exception', () => {
    /* Le balayage qui manquait : la regle etait ecrite, mais verifiee sur un seul
       cas — le releve mensuel. La fenetre des revenus est restee transfuge des
       mois, douze champs sous les yeux et « Fermer » pour seul bouton.
       La detection se fait sur les pieds de fenetre : chaque `#modalFoot` qui
       porte « Fermer » doit porter « Enregistrer » a cote, sauf ceux d'un acte
       ou d'une simple lecture. */
    const src = lireSource('assets/app.js');
    const pieds = src.match(/\$\('#modalFoot'\)\.innerHTML =[\s\S]{0,700}?`;/g) || [];
    vrai(pieds.length >= 4, `au moins quatre pieds de fenêtre attendus, ${pieds.length} trouvés`);
    for (const pied of pieds) {
      if (!/trad\('Fermer'\)/.test(pied)) continue;
      vrai(/trad\('Enregistrer'\)/.test(pied),
        'un pied porte « Fermer » sans « Enregistrer » :\n  ' + pied.slice(0, 200));
    }
    /* Et celui des revenus nommement, puisque c'est lui qui manquait. */
    vrai(/id="revOk"[^>]*>\$\{trad\('Enregistrer'\)\}</.test(src),
      'la fenêtre des revenus porte enfin Enregistrer');
    vrai(/\$\('#revOk'\)\.onclick/.test(src), 'et il est câblé');
  });

  test('le relevé mensuel rejoint la famille de sa jumelle', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    /* La borne haute etait « function askAccount », une fenetre morte que
       rien n'appelait : elle est partie, la fenetre d'apercu la remplace
       comme frontiere. */
    const bloc = src.slice(src.indexOf('function askMonthlySnapshot'),
                           src.indexOf('const APERCUS'));
    vrai(/id="relOk"[^>]*>\$\{trad\('Enregistrer'\)\}</.test(bloc) && /id="relFermer"[^>]*>\$\{trad\('Fermer'\)\}</.test(bloc),
      'le pied porte Enregistrer et Fermer, traduits, comme la fenêtre des dépenses');
    vrai(!/relCancel/.test(bloc),
      '« Annuler » est parti : il ne désignait plus rien de distinct de Fermer');
    vrai(/appliquerReleve\(index/.test(bloc),
      'Enregistrer écrit par appliquerReleve et la fenêtre reste');
    vrai(!/fermer\(\{/.test(bloc),
      'et il ne ferme plus en résolvant : écrire et partir redeviendraient un seul geste');
    vrai(/Modifications non enregistrées/.test(bloc),
      'Fermer sur une saisie sale pose la même question que les aperçus');
  });

  test('le champ des crédits du mois s’enregistre enfin', () => {
    /* Il etait lu pour afficher le net, jamais ecrit : on saisissait une
       dette, elle disparaissait a la fermeture, sans erreur nulle part. */
    const src = lireSource('assets/app.js');
    vrai(/row\.dettes = round2\(num\(saisi\.dettes\)\)/.test(src),
      'appliquerReleve écrit les dettes du mois depuis le champ');
    vrai(/dettes: \$\('#relDettes'\)\.value/.test(src),
      'et Enregistrer les lit dans le champ : ce qui s’affiche est ce qui s’enregistre');
  });

  test('l’écriture du relevé vit à un seul endroit', () => {
    /* La fenetre ecrit desormais elle-meme : si l appelant reappliquait la
       saisie, chaque Enregistrer ecrirait deux fois. */
    const src = lireSource('assets/app.js');
    eq((src.match(/appliquerReleve\(/g) || []).length, 2,
      'une définition, un appelant : la fenêtre, et personne d’autre');
    const action = src.slice(src.indexOf("async 'edit-month'"), src.indexOf("'go-snapshot'"));
    vrai(!/row\.v = /.test(action),
      'l’action d’ouverture n’écrit plus rien elle-même');
  });
});

/* ------------------------------------------------------------------
   Le pli des comptes s anime sur place
   ------------------------------------------------------------------ */
suite('Le pli des comptes s’anime sur place', () => {

  test('le geste ne re-rend pas : une transition exige que l’élément survive', () => {
    /* « Quand je deplie et replie les comptes je veux une animation smooth. »
       render() remplacait le groupe, donc aucune transition possible — la
       meme lecon que le lavis des sous-onglets. Le pli bascule ses classes
       sur place, l etat s ecrit comme avant, et le prochain rendu le relit. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.slice(src.indexOf("'replier-groupe'(btn)"), src.indexOf("'plier-tout'"));
    vrai(!/\brender\(\);\s*\}\s*,\s*$/.test(bloc) && /classList\.toggle\('ouvert'/.test(bloc),
      'replier-groupe bascule la classe au lieu de re-rendre');
    vrai(/aria-expanded/.test(bloc), 'et le bouton dit son état au clavier');
    vrai(/if \(!pli\) \{ render\(\); return; \}/.test(bloc),
      'sans pli trouvé, on retombe sur le re-rendu : jamais un geste muet');
  });

  test('la grille passe de 0fr à 1fr, et la visibilité suit avec retard', () => {
    /* La seule facon d animer une hauteur inconnue sans la mesurer. La
       visibilite differee sort le contenu replie du clavier et des lecteurs —
       le role que tenait l attribut hidden quand le pli etait sec. */
    const css = (lireSource('assets/styles.css') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    vrai(/\.cpt-pli \{[^}]*grid-template-rows: 0fr/.test(css), 'fermé : 0fr');
    vrai(/\.cpt-pli\.ouvert \{[^}]*grid-template-rows: 1fr/.test(css), 'ouvert : 1fr');
    vrai(/\.cpt-pli \{[^}]*visibility: hidden/.test(css),
      'le contenu replié quitte le clavier et les lecteurs');
    vrai(/\.cpt-pli > \.cpt-corps \{[^}]*min-height: 0/.test(css),
      'sans min-height 0, le contenu impose sa hauteur et la grille ne ferme jamais');
    vrai(/prefers-reduced-motion[^}]*\{[^}]*\.cpt-pli/.test(css) || /\.cpt-pli, \.cpt-pli\.ouvert \{ transition: none; \}/.test(css),
      'le mouvement se retire pour qui l’a demandé au système');
    const app = lireSource('assets/app.js');
    vrai(/cpt-pli\$\{replie \? '' : ' ouvert'\}/.test(app),
      'le gabarit rend l’état plié sans attribut hidden : c’est la grille qui ferme');
  });
});

/* ------------------------------------------------------------------
   Un revenu se declare a sa periode, et une estimation se dit
   ------------------------------------------------------------------ */
suite('Revenus : la période se lisse, l’estimation s’annonce', () => {

  test('une prime annuelle pèse un douzième par mois, comme une charge annuelle', () => {
    Fixture.poser(e => {
      e.budget.income.push({ label: 'Prime', amount: 12000, period: 'an' });
    });
    pres(incomeTotal(), 3000 + 1000,
      'le total mensuel lisse la prime : même table de périodes que les charges');
    pres(budgetFrame().income, 4000, 'et tout ce qui en dérive suit');
  });

  test('une période inconnue retombe sur le mois, comme chez les charges', () => {
    Fixture.poser(e => {
      e.budget.income.push({ label: 'Vieux champ', amount: 100, period: 'quinzaine' });
    });
    pres(incomeTotal(), 3100, 'un montant mensuel est son propre équivalent mensuel');
  });

  test('l’estimation se déclare par source et se lit sur l’ensemble', () => {
    Fixture.poser();
    eq(revenuEstime(), false, 'rien d’estimé par défaut');
    Store.state.budget.income[0].estime = true;
    eq(revenuEstime(), true, 'une seule source estimée suffit : le total l’est');
  });

  test('les écrans qui montrent le revenu disent quand il est estimé', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    vrai((src.match(/revenuEstime\(\) \? '≈ ' : ''/g) || []).length >= 2,
      'le chiffre-source et la fenêtre portent le ≈ sous la même garde');
    vrai(/data-path="budget\.income\.\$\{i\}\.period"/.test(src),
      'la fenêtre des revenus offre la période, écrite comme les autres champs');
    vrai(/CHARGE_PERIODES\.map/.test(src.slice(src.indexOf('function fenetreRevenus'))),
      'et ses crans viennent de la table commune, jamais d’une liste recopiée');
  });
});

/* ------------------------------------------------------------------
   Le detail d une depense accepte l addition
   ------------------------------------------------------------------ */
suite('Le détail d’une dépense accepte l’addition', () => {

  });

/* ------------------------------------------------------------------
   Un indice se compte en points, pas en argent
   ------------------------------------------------------------------ */
suite('Un indice ne se compte pas en euros', () => {

  test('la fiche d’un repère distingue un indice d’un actif', () => {
    /* « Quand le marche est ferme j ai des trucs chelou » : la fiche du CAC 40
       annonçait « 8 714,93 € ». Un indice vaut des POINTS — Yahoo joint
       pourtant une devise a ses indices, et la coller au chiffre en faisait un
       montant. C est la regle de la maison, « un intitule dit exactement ce
       qu il compte », appliquee a une unite.

       Le prefixe « ^ » designe un indice chez Yahoo sur toutes les places : on
       s en sert plutot que de tenir une liste des cinq indices du ruban, qui
       oublierait le sixieme. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    /* L'unite vit dans `uniteRepere()`, employee par la tuile du ruban comme
       par la fiche : le controle porte sur elle, pas sur une copie. */
    vrai(/String\(l\?\.symbole \|\| ''\)\.startsWith\('\^'\)/.test(src),
      'un repère sait dire s’il est un indice, et il le dérive du symbole');
    vrai(/const uniteRepere = l => String\(l\?\.symbole \|\| ''\)\.startsWith\('\^'\) \? ` \$\{trad\('pts'\)\}`/
      .test(src), 'un indice s’affiche en points, jamais dans une devise');
    vrai(/<span class="rp-unite">\$\{esc\(uniteRepere\(l\)\)\}<\/span>/.test(src),
      'et la tuile du ruban porte la même unité que la fiche qu’elle ouvre');
    vrai(!/const unite = l\.devise === 'USD'/.test(src),
      'plus aucun chemin ne colle une devise sans se demander ce qu’il chiffre');

    /* Et le sous-titre cesse d etre un identifiant technique : « ^FCHI »
       n apprend rien a qui vient de cliquer sur « CAC 40 ». */
    vrai(/estIndice \? 'Indice boursier' : l\.symbole/.test(src),
      'la fiche dit ce que la chose est, et garde le symbole en second');

    /* Les cinq indices du ruban portent bien ce prefixe : sans quoi la garde
       ne servirait rien. Derive de la table, pas d une liste recopiee. */
    const q = lireSource('assets/quotes.js') || '';
    const indices = [...q.matchAll(/\['(\^[A-Z0-9]+)',/g)].map(m => m[1]);
    vrai(indices.length >= 5, 'le ruban porte bien des indices');
    for (const i of indices) {
      vrai(i.startsWith('^'), `${i} doit se reconnaître au préfixe`);
    }
  });
});

suite('La langue gouverne les formats, pas seulement les mots', () => {

  test('un montant suit les séparateurs de sa langue', () => {
    enLangue('fr', () => {
      const s = fmtEUR(1234.56);
      vrai(/1\D?234,56/.test(s),
        `le français groupe les milliers et décime à la virgule, obtenu « ${s} »`);
    });
    enLangue('en', () => {
      const s = fmtEUR(1234.56);
      vrai(s.includes('1,234.56'),
        `l’anglais groupe à la virgule et décime au point, obtenu « ${s} »`);
    });
  });

  test('le signe pourcent se colle en anglais et s’espace en français', () => {
    /* L'espace avant un signe est une regle typographique francaise, pas une
       decoration : l'anglais qui la garderait aurait l'air traduit a moitie. */
    enLangue('fr', () => eq(fmtPct(12.5), '12,50 %', 'le français espace son signe'));
    enLangue('en', () => eq(fmtPct(12.5), '12.50%', 'l’anglais le colle'));
  });

  test('une date anglaise ne peut pas se lire à l’envers', () => {
    /* Le seul controle de cette suite qui protege un chiffre et non un style.
       « 03/04/2026 » vaut le 3 avril a Londres et le 4 mars a New York : une
       date numerique change de sens selon le lecteur, ce qu'aucune traduction
       n'a le droit de faire. Le mois en lettres retire la question. */
    enLangue('en', () => {
      const s = fmtDate('2026-04-03');
      eq(s, '3 Apr 2026', 'le mois s’écrit en lettres');
      vrai(!/\d+\/\d+/.test(s), `aucune date numérique en anglais, obtenu « ${s} »`);
    });
    enLangue('fr', () => eq(fmtDate('2026-04-03'), '03/04/2026', 'le français garde son format'));
  });

  test('le mois court et la clôture d’année se traduisent', () => {
    enLangue('en', () => {
      eq(fmtMonth('2026-04-01'), 'Apr 26', 'le mois court');
      eq(fmtMonth('2025-12-31'), 'End 2025', 'la ligne de clôture');
    });
    enLangue('fr', () => {
      eq(fmtMonth('2026-04-01'), 'avr. 26', 'le mois court');
      eq(fmtMonth('2025-12-31'), 'Fin 2025', 'la ligne de clôture');
    });
  });

  test('l’heure d’un cours porte la préposition de sa langue', () => {
    /* `fmtCoursQuand` rend sa preposition avec elle, ses trois branches n'ayant
       pas la meme. Traduire le seul dictionnaire aurait donc laisse « price de
       11:05 » : c'est la fonction qui doit savoir. */
    auJour('2026-08-09', () => {
      const jour = Math.floor(new Date('2026-08-09T11:05:00').getTime() / 1000);
      enLangue('fr', () => {
        const s = fmtCoursQuand(jour);
        vrai(s.startsWith('de '), `obtenu « ${s} »`);
      });
      /* « from », la meme preposition sur les trois branches : elle se lit
         aussi bien apres « price » qu'apres « the most recent price is »,
         la ou « at » rendait la seconde phrase bancale. */
      enLangue('en', () => {
        const s = fmtCoursQuand(jour);
        vrai(s.startsWith('from '), `obtenu « ${s} »`);
        vrai(!/\bde\b|\bdu\b|hier/.test(s), `aucune préposition française, obtenu « ${s} »`);
      });
      const veille = Math.floor(new Date('2026-08-08T22:00:00').getTime() / 1000);
      enLangue('en', () => {
        const s = fmtCoursQuand(veille);
        vrai(s.startsWith('from yesterday at '), `la veille se dit en anglais, obtenu « ${s} »`);
      });
    });
  });

  test('aucun fichier ne fige une locale hors du dictionnaire', () => {
    /* Le defaut que ce projet corrige sans arret, applique aux formats : la
       locale etait recopiee a seize endroits, et traduire l'application aurait
       demande de ne pas en oublier un seul. Une seule source, `locale()`, et ce
       controle se derive de la source plutot que d'une liste a tenir. */
    for (const f of ['assets/app.js', 'assets/store.js', 'assets/charts.js',
                     'assets/quotes.js', 'assets/cloudsync.js']) {
      const src = lireSource(f);
      vrai(src, `${f} doit être lisible pour ce contrôle`);
      const figees = [...src.matchAll(/['"][a-z]{2}-[A-Z]{2}['"]/g)].map(m => m[0]);
      eq(figees.join(', '), '',
        `${f} fige une locale : elle doit passer par locale()`);
    }
  });
});

suite('Un type de compte peut naître à la main', () => {

  test('créé, il se retrouve et porte la forme de sa poche', () => {
    /* La forme vient de la poche et non du nom : c'est elle qui commande
       calculs et regroupements. Un type « cash » doit compter comme du cash. */
    Fixture.poser();
    const id = creerTypePerso('Plan épargne logement', 'cash');
    eq(id, 't_plan-epargne-logement', 'l’identifiant se dérive du nom, accents à plat');
    const t = typeCompte(id);
    eq(t.label, 'Plan épargne logement', 'le nom est celui qu’on a tapé');
    eq(t.groupe, 'cash', 'la poche demandée');
    eq(t.defaut, 'courant', 'l’affectation par défaut de sa poche');
    vrai(t.classes.includes('liquidites'), 'et ses classes suivent');
  });

  test('le même nom ne crée pas un double, quelle que soit sa casse', () => {
    /* Deux types du même nom seraient deux poches pour un seul fait — la
       faute que ce projet corrige sans arrêt, offerte ici à l'utilisateur. */
    Fixture.poser();
    const a = creerTypePerso('Compte à terme', 'cash');
    const b = creerTypePerso('compte à terme', 'bourse');
    eq(b, a, 'le second appel rend le premier identifiant, poche comprise');
    eq(typesPerso().length, 1, 'et rien n’a été dédoublé');
  });

  test('un nom déjà dans la table est repris, jamais recréé', () => {
    Fixture.poser();
    eq(creerTypePerso('PEA', 'bourse'), 'pea', 'le PEA de la table répond');
    eq(typesPerso().length, 0, 'aucun double en face d’un type existant');
  });

  test('deux noms qui donnent le même identifiant se suffixent', () => {
    Fixture.poser();
    const a = creerTypePerso('Girardin !', 'pe');
    const b = creerTypePerso('Girardin ?', 'pe');
    eq(a, 't_girardin', 'le premier prend le nom nu');
    eq(b, 't_girardin-2', 'le second se suffixe au lieu d’écraser');
    vrai(typeCompte(a).label !== typeCompte(b).label, 'et chacun garde son nom');
  });

  test('une poche inconnue retombe sur le non coté, un nom vide ne crée rien', () => {
    Fixture.poser();
    eq(typeCompte(creerTypePerso('Truc exotique', 'zzz')).groupe, 'pe',
      'la poche du repli est celle du fallback de typeCompte');
    eq(creerTypePerso('   ', 'cash'), null, 'un nom vide est refusé');
    eq(typesPerso().length, 1, 'et il n’a rien laissé derrière lui');
  });

  test('les deux formulaires listent les types depuis la même source', () => {
    /* Une liste se dérive, elle ne se recopie pas : le type créé dans une
       fenêtre doit exister dans l'autre. Les deux passent par
       typesCompteChoix(), et chacune offre le type libre. */
    const src = lireSource('assets/app.js');
    const appels = src.match(/typesCompteChoix\(\)\.map/g) || [];
    eq(appels.length, 2, 'la fiche et l’assistant, personne d’autre à la main');
    const libres = src.match(/\['__nouveau', trad\('\+ Autre type…'\)\]/g) || [];
    eq(libres.length, 2, 'et le type libre s’offre dans les deux');
    vrai(!/TYPES_COMPTE\.filter\([^)]*\)\.map\(\w+ => \[\w+\.id, \w+\.label\]\)/.test(src),
      'plus aucune liste de types recopiée depuis la table');
  });

  test('la fenêtre du type libre dit le comportement, chaque famille offerte', () => {
    /* Le champ s'annoncait « Poche de patrimoine » : ce mot designe partout
       ailleurs les classes de la repartition, et la liste offrait trois
       libelles qui n'en font pas partie. La question porte sur le
       comportement, et le defaut suit l'exemple du champ du nom — un plan
       d'epargne logement est de l'argent disponible, pas un compte de titres
       range en bourse. */
    const src = lireSource('assets/app.js');
    const debut = src.indexOf('async function demanderTypePerso');
    vrai(debut > 0, 'la fenêtre doit être trouvable');
    const bloc = src.slice(debut, src.indexOf('function askForm', debut));
    for (const poche of Object.keys(FORME_POCHE)) {
      vrai(bloc.includes(`['${poche}', trad(`),
        `la famille « ${poche} » se choisit : la liste suit FORME_POCHE`);
    }
    vrai(/cle: 'poche',[^\n]*valeur: 'cash'/.test(bloc),
      'le défaut est celui de l’exemple du nom');
    vrai(!bloc.includes('Poche de patrimoine'),
      'le champ ne s’annonce plus comme une poche de la répartition');
  });

  test('la migration pose typesPerso, et la rejouer ne change rien', () => {
    const s1 = Fixture.poser(); s1.typesPerso = undefined;
    Store.state.typesPerso = Store.state.typesPerso || [];
    vrai(Array.isArray(Store.state.typesPerso), 'le champ existe après migration');
    const avant = JSON.stringify(Store.state.typesPerso);
    Store.state.typesPerso = Store.state.typesPerso || [];
    eq(JSON.stringify(Store.state.typesPerso), avant, 'idempotente');
  });
});

suite('La traduction des écrans ne peut pas heurter les totaux', () => {

  test('t() ne reçoit que des clés pointées, jamais une phrase', () => {
    /* `t` est une variable locale dans une trentaine de portées d'app.js, où
       elle porte les totaux : `t.brut`, `t.net`, `t.label`. Ecrire
       `t('Liquidités')` a cote de `num(t.bourse)` appelle l'objet des totaux
       comme une fonction, et c'est la portee qui decide laquelle gagne. Le
       defaut ne se voit pas a la relecture, il ne se voit qu'a l'execution du
       seul ecran concerne. `trad()` porte donc la traduction des phrases, et
       ce controle interdit l'autre forme plutot que de compter sur l'attention. */
    for (const f of ['assets/app.js', 'assets/charts.js']) {
      const src = lireSource(f);
      vrai(src, `${f} doit être lisible pour ce contrôle`);
      const fautes = [...src.matchAll(/[^\w.]t\('([^']*)'/g)]
        .map(m => m[1]).filter(c => !/^[\w.]+$/.test(c));
      eq(fautes.join(' | '), '',
        `${f} passe une phrase à t() : utiliser trad(), t() est masquée par les totaux`);
    }
  });

  test('trad() rend le français quand le dictionnaire ignore la phrase', () => {
    /* C'est ce repli qui permet de traduire écran par écran : une phrase
       enveloppée mais pas encore traduite reste juste, dans les deux langues. */
    const inedite = 'Phrase que le dictionnaire ne connaît pas';
    enLangue('fr', () => eq(trad(inedite), inedite, 'le français rend la phrase telle quelle'));
    enLangue('en', () => eq(trad(inedite), inedite, 'l’anglais retombe dessus au lieu d’une clé nue'));
    enLangue('en', () => eq(trad('Liquidités'), 'Cash', 'et traduit ce qu’il connaît'));
  });
});

suite('Le dictionnaire anglais ne laisse pas de trou', () => {

  test('une clef ne se déclare qu’une fois', () => {
    /* Deux sessions ont pose « sur » chacune de son cote, over puis of : en
       JavaScript la derniere declaration gagne sans un mot, et « over 7
       closed months » est devenu « of 7 closed months » sans que rien ne le
       dise. Un homographe se resout par une clef pointee avec son francais
       en repli, trad('sur.objectif', 'sur') ; un doublon, lui, n'a jamais
       raison d'exister. */
    const js = lireSource('assets/i18n.js');
    vrai(js, 'i18n.js doit être lisible pour ce contrôle');
    const bloc = js.slice(js.indexOf('const I18N'), js.indexOf('const FR'));
    const vues = new Map();
    const doubles = [];
    const re = /^\s*(?:'((?:[^'\\]|\\.)+)'|"((?:[^"\\]|\\.)+)")\s*:/gm;
    let m;
    while ((m = re.exec(bloc))) {
      const cle = m[1] ?? m[2];
      if (vues.has(cle)) doubles.push(cle); else vues.set(cle, true);
    }
    vrai(vues.size > 500, `le dictionnaire doit être lu en entier (${vues.size} clefs)`);
    eq(doubles.join(' | '), '',
      'clef déclarée deux fois : la dernière gagnerait en silence');
  });

  test('chaque clé française a sa traduction', () => {
    const manquantes = Object.keys(FR).filter(c => !I18N.en[c]);
    eq(manquantes.join(', '), '', 'ces clés n’ont pas d’anglais');
  });

  test('aucune phrase ne reste en français sous couvert de traduction', () => {
    /* Un mot identique dans les deux langues est normal — « Budget »,
       « Performance », « Allocation ». Une phrase entiere identique est une
       traduction qu'on a cru faire. */
    const copiees = Object.keys(FR).filter(c =>
      I18N.en[c] === FR[c] && String(FR[c]).trim().split(/\s+/).length > 2);
    eq(copiees.join(', '), '', 'ces phrases sont restées en français');
  });
});

/* ------------------------------------------------------------------
   Un nom ne s ecrit pas trois fois
   ------------------------------------------------------------------ */
suite('Un nom ne s’écrit pas trois fois', () => {

  /* La carte Immobilier affichait « Flat » puis « Flat · Flat » : la ligne, le
     compte et l etablissement portaient le meme mot, ce que la creation
     propose d elle-meme quand on saisit un bien d un seul geste. La meta se
     derive du nom affiche au lieu de le redire. */

  test('la meta laisse tomber ce que le nom dit déjà', () => {
    eq(sousNom('Flat', 'Flat', 'Flat'), '',
      'trois fois le même mot n’en laisse aucun à répéter');
    eq(sousNom('Studio', 'Compte titres', 'Courtier'), 'Compte titres · Courtier',
      'deux parts distinctes se joignent, comme avant');
    eq(sousNom('Studio', 'Studio', 'Banque'), 'Banque',
      'seule la redite tombe, le reste passe');
    eq(sousNom('Apt lyon', 'apt  lyon', 'Apt Lyon'), '',
      'la casse et les espaces ne font pas une différence');
    eq(sousNom('Studio', 'Banque', 'Banque'), 'Banque',
      'deux parts égales entre elles ne comptent qu’une fois');
    eq(sousNom('Studio', 'Banque', ''), 'Banque',
      'un établissement vide ne laisse pas pendre le séparateur');
  });

  test('les écrans dérivent cette meta au lieu de la recomposer', () => {
    /* Le defaut aurait repousse par le point d appel oublie : quatre listes
       assemblaient nom de compte et etablissement chacune de son cote. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    /* Un « || » entre les deux n'est pas une composition mais une disjonction :
       la recherche interroge les deux noms, elle n'en affiche aucun. */
    const voisins = src.match(/[^\n]{0,60}nomCompteV2\([^)]*\)[^\n|]{0,40}nomEtabDe\(/g) || [];
    eq(voisins.filter(s => !/sousNom\(/.test(s)).join('\n'), '',
      'un écran recompose la meta à la main : il redira le nom un jour');
    vrai((src.match(/sousNom\(/g) || []).length >= 6,
      'chaque point d’affichage passe par la même dérivation');
  });
});

/* ------------------------------------------------------------------
   Un bien detenu a plusieurs ne compte que pour sa part
   ------------------------------------------------------------------ */
suite('Un bien détenu à plusieurs ne compte que pour sa part', () => {

  /* L'application partageait deja une charge fixe entre deux contributeurs, mais
     jamais un actif : un logement achete a deux entrait entier au patrimoine.
     Un faux total, et rien ne le signalait. */

  const aMoitie = () => Fixture.poser(s => {
    s.comptes.find(c => c.id === 'c_immo').lignes[0].part = 50;
  });

  test('la valeur, le prix payé et le patrimoine suivent la quote-part', () => {
    aMoitie();
    const c = compteById('c_immo');
    const l = lignesDe(c)[0];
    pres(l.valeur, 60000, 'la moitié de 120 000 €');
    pres(l.prixDeRevient, 55000, 'et la moitié des 110 000 € payés');
    pres(l.valeurEntiere, 120000, 'la valeur du bien entier reste lisible, pour la comparer à une annonce');
    pres(valeurCompte(c), 60000, 'le compte ne vaut que la part');
    pres(patrimoine().classes.immobilier, 60000, 'et la classe immobilier avec lui');
  });

  test('le total reste la somme de ses parts', () => {
    aMoitie();
    const p = patrimoine();
    pres(Object.values(p.classes).reduce((s, v) => s + v, 0), p.brut,
      'le brut est la somme des classes, quote-part comprise');
    pres(Object.values(p.mobilisable).reduce((s, v) => s + v, 0), p.brut,
      'et les paliers de disponibilité aussi');
    pres(p.brut, Fixture.BRUT - 60000, 'le brut a baissé d’exactement la moitié du studio');
  });

  test('la donnée saisie n’est jamais divisée, seule la lecture l’est', () => {
    const s = aMoitie();
    pres(num(s.comptes.find(c => c.id === 'c_immo').lignes[0].valeur), 120000,
      'le champ garde la valeur du bien entier');
    /* Lire deux fois ne divise pas deux fois : le defaut classique d'une part
       appliquee a l'ecriture plutot qu'a la derivation. */
    pres(lignesDe(compteById('c_immo'))[0].valeur, 60000, 'première lecture');
    pres(lignesDe(compteById('c_immo'))[0].valeur, 60000, 'seconde lecture, identique');
  });

  test('une part absente, nulle ou aberrante vaut le bien entier', () => {
    Fixture.poser();
    pres(partDetention({}), 1, 'absente');
    pres(partDetention({ part: 0 }), 1, 'zéro ne veut pas dire « je ne possède rien »');
    pres(partDetention({ part: 100 }), 1, 'cent pour cent');
    pres(partDetention({ part: 140 }), 1, 'au-delà de cent, la saisie est fausse : le tout, plutôt qu’un total gonflé');
    pres(partDetention({ part: -20 }), 1, 'négative aussi');
    pres(partDetention({ part: 33.5 }), 0.335, 'une part décimale passe');
  });
});

/* ------------------------------------------------------------------
   Le logement qu on habite n est pas une reserve
   ------------------------------------------------------------------ */
suite('Le logement qu’on habite n’est pas une réserve', () => {

  const enRP = () => Fixture.poser(s => {
    s.comptes.find(c => c.id === 'c_immo').lignes[0].usage = 'principale';
  });

  test('une résidence principale quitte les avoirs mobilisables en quelques mois', () => {
    enRP();
    const c = compteById('c_immo');
    eq(mobiliteLigne(lignesDe(c)[0], c), 'habite',
      'son palier lui est propre : ni « en quelques mois », ni « bloqué jusqu’à son échéance »');
    const m = poches().mobilisable;
    pres(m.habite, 120000, 'le studio y est en entier');
    pres(m.lent, 2000, 'et seul le non coté reste dans « quelques mois »');
  });

  test('elle reste du patrimoine, mais hors du cumul d’autonomie', () => {
    enRP();
    const p = patrimoine();
    pres(Object.values(p.mobilisable).reduce((s, v) => s + v, 0), p.brut,
      'aucun euro ne se perd en chemin');
    const r = runway();
    const palier = r.tiers.find(t => t.value === 120000);
    vrai(palier && palier.horsCumul === true,
      'le toit ne prolonge aucune autonomie : le vendre veut dire se reloger');
    const cumules = r.tiers.filter(t => !t.horsCumul).reduce((s, t) => s + t.value, 0);
    pres(cumules, p.brut - 120000, 'il sort du cumul, et lui seul');
  });

  test('sans usage déclaré, rien ne change', () => {
    Fixture.poser();
    const c = compteById('c_immo');
    eq(mobiliteLigne(lignesDe(c)[0], c), 'lent',
      'un bien sans usage déclaré reste lent : il n’est pas deviné habité');
    eq(usageBien(c), '', 'et son compte ne déclare rien');
  });

  test('un réglage posé à la main garde le dernier mot', () => {
    Fixture.poser(s => {
      const l = s.comptes.find(c => c.id === 'c_immo').lignes[0];
      l.usage = 'principale';
      l.mobilite = 'lent';
    });
    const c = compteById('c_immo');
    eq(mobiliteLigne(lignesDe(c)[0], c), 'lent',
      'celui qui vend et loue ensuite le déclare, et l’application le croit');
  });

  test('les paliers se dérivent de leur table, ils ne se recopient pas', () => {
    Fixture.poser();
    eq(Object.keys(poches().mobilisable).join(','), Object.keys(MOBILISABLE_LABEL).join(','),
      'un palier ajouté à la table entre tout seul, sinon il resterait à undefined');
  });
});

/* ------------------------------------------------------------------
   Un credit dit quand il sera paye
   ------------------------------------------------------------------ */
suite('Un crédit dit quand il sera payé', () => {

  test('l’amortissement se rejoue, capital plus intérêts font le total versé', () => {
    Fixture.poser();
    /* 100 000 EUR a 3 % sur une mensualite de 600 EUR : la reponse ne se
       devine pas de tete, mais l'identite qui la verifie, si. */
    const f = finCredit({ montant: 100000, mensualite: 600, taux: 3 });
    vrai(f && f.mois > 0, 'un crédit qui s’amortit a une fin');
    /* Toutes les echeances pleines sauf la derniere, qui solde le reliquat. */
    const verse = (f.mois - 1) * 600 + f.derniere;
    pres(verse, 100000 + f.interets,
      'ce qu’on verse en tout fait le capital plus les intérêts, sinon un euro se perd');
    vrai(f.derniere > 0 && f.derniere <= 600, 'la dernière échéance ne dépasse pas les autres');
  });

  test('sans taux, le crédit s’amortit tout droit', () => {
    Fixture.poser();
    const f = finCredit({ montant: 12000, mensualite: 1000, taux: 0 });
    eq(f.mois, 12, 'douze mensualités de mille euros soldent douze mille');
    pres(f.interets, 0, 'et rien ne se paie en intérêts');
  });

  test('une mensualité qui ne couvre pas les intérêts n’annonce aucune date', () => {
    Fixture.poser();
    /* 100 EUR par mois sur 100 000 EUR a 5 % : les interets seuls font 416 EUR.
       La dette monte, et promettre une fin serait un mensonge. */
    eq(finCredit({ montant: 100000, mensualite: 100, taux: 5 }), null,
      'la dette monte : pas de date de fin');
    eq(finCredit({ montant: 100000, mensualite: 0, taux: 3 }), null,
      'sans mensualité non plus');
    eq(finCredit({ montant: 0, mensualite: 600, taux: 3 }), null,
      'ni sur un crédit déjà soldé');
  });

  test('la mensualité lue est celle de la charge qui rembourse, pas une seconde', () => {
    /* Le meme fait a un seul porteur : quand une charge fixe rembourse le
       credit, c'est elle qui detient la mensualite, et la date de fin doit la
       lire — sinon deux ecrans donneraient deux dates. */
    Fixture.poser(s => {
      s.etabs.find(e => e.id === 'e_bien').dettes[0].taux = 3;
      s.etabs.find(e => e.id === 'e_bien').dettes[0].mensualite = null;
      s.budget.fixedCharges.push({ label: 'Prêt', amount: 600, period: 'mois',
                                   shares: {}, creditId: 'd_pret' });
    });
    const d = ETABS().find(e => e.id === 'e_bien').dettes[0];
    const f = finCredit(d);
    vrai(f && f.mois > 0, 'la date se calcule depuis la charge');
    pres(mensualiteCredit(d), 600, 'et la mensualité vient bien d’elle');
  });

  test('la date de fin tombe le bon nombre de mois plus tard', () => {
    Fixture.poser();
    const f = finCredit({ montant: 12000, mensualite: 1000, taux: 0 });
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + f.mois);
    eq(f.finLe, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      'douze mois d’ici, et l’année tourne avec le mois');
  });

  test('chaque crédit de la liste porte sa fin', () => {
    Fixture.poser(s => {
      s.etabs.find(e => e.id === 'e_bien').dettes[0].taux = 3;
      s.etabs.find(e => e.id === 'e_bien').dettes[0].mensualite = 600;
    });
    const l = creditsEnCours().lignes.find(x => x.id === 'd_pret');
    vrai(l.fin && l.fin.mois > 0, 'la carte des crédits lit la même fonction que la fiche');
  });
});

/* ------------------------------------------------------------------
   Ce qu un bien rapporte, sans embellir
   ------------------------------------------------------------------ */
suite('Ce qu’un bien rapporte, sans embellir', () => {

  /* Trois manques tiraient tous les rendements du meme cote, le flatteur :
     la periode du loyer ignoree, douze mois supposes pleins, aucun impot. */

  const loue = (modif) => Fixture.poser(s => {
    s.budget.income.push({ label: 'Loyer studio', amount: 600, period: 'mois', bienId: 'c_immo' });
    if (modif) modif(s);
  });

  test('le même loyer donne le même montant sur les deux écrans', () => {
    /* La regle du projet : « Liquidités » a deja valu deux choses differentes sur
       deux pages, les deux totaux justes. Le loyer a failli refaire la faute deux
       fois — la ligne de la carte affichait le montant lisse par la vacance,
       l'en-tete aussi, quand le budget compte le loyer plein. La vacance a sa
       propre ligne desormais, et c'est la qu'elle se lit. */
    loue(s => { s.comptes.find(c => c.id === 'c_immo').moisLoues = 11; });
    const cf = cashFlowBien(compteById('c_immo'));
    const source = Store.state.budget.income.find(r => r.bienId === 'c_immo');
    pres(cf.sourcesLoyer[0].mensuel, revenuMensuel(source),
      'la ligne de la carte porte le montant du budget, pas un montant lissé');
    pres(cf.loyersPleins, revenuMensuel(source), 'et le total des sources aussi');
    pres(incomeTotal(), 3000 + revenuMensuel(source),
      'le budget le compte une fois, rattaché à un bien ou pas');
    const src = lireSource('assets/app.js');
    const tete = src.slice(src.indexOf("trad('Ce que ce bien rapporte, et ce qu’il coûte')"),
                           src.indexOf("trad('de loyer par mois')"));
    vrai(/fmtEUR0\(cf\.loyersPleins\)/.test(tete),
      'l’en-tête aussi : deux chiffres pour le loyer sur un même écran, c’est un de trop');
  });

  test('un loyer annuel pèse un douzième, ici comme dans le budget', () => {
    Fixture.poser(s => {
      s.budget.income.push({ label: 'Loyer garage', amount: 7200, period: 'an', bienId: 'c_immo' });
    });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.loyers, 600, 'sept mille deux cents par an font six cents par mois');
    /* Le meme libelle donne le meme montant sur les deux ecrans : c'est la
       regle que ce calcul violait en lisant le montant brut. */
    pres(incomeTotal() - 3000, cf.loyers, 'et le budget dit exactement la même chose');
  });

  test('la vacance retire ce qu’elle retire, au rendement comme au cash-flow', () => {
    loue(s => { s.comptes.find(c => c.id === 'c_immo').moisLoues = 11; });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.loyersPleins, 600, 'le loyer plein reste dit');
    pres(cf.loyers, 550, 'onze mois sur douze');
    vrai(cf.vacance, 'et l’écran peut l’annoncer');
    pres(cf.rendementBrut, 550 * 12 / 110000 * 100, 'le rendement suit, sur le prix payé');
  });

  test('l’impôt déclaré s’applique au loyer moins les charges, jamais en dessous de zéro', () => {
    loue(s => {
      s.comptes.find(c => c.id === 'c_immo').tauxImpot = 30;
      s.budget.fixedCharges.push({ label: 'Taxe foncière', amount: 1200, period: 'an',
                                   shares: {}, bienId: 'c_immo' });
    });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.charges, 100, 'la taxe annuelle ramenée au mois');
    pres(cf.impot, (600 - 100) * 0.30, 'trente pour cent de ce que le bien dégage');
    pres(cf.rendementNetNet, (600 - 100 - cf.impot) * 12 / 110000 * 100,
      'le rendement net d’impôt est le seul qui dise ce qui reste');
    vrai(cf.rendementNetNet < cf.rendementNet && cf.rendementNet < cf.rendementBrut,
      'les trois rendements se rangent dans cet ordre, toujours');
  });

  test('la mensualité rattachée au bien ne se soustrait qu’une fois', () => {
    /* Rien n'interdit de rattacher au bien la charge qui rembourse son credit,
       et c'est meme tentant. Elle etait alors comptee deux fois : une en charge,
       une en mensualite lue depuis cette meme charge. */
    loue(s => {
      s.etabs.find(e => e.id === 'e_bien').dettes[0].mensualite = null;
      s.budget.fixedCharges.push({ label: 'Prêt studio', amount: 400, period: 'mois',
                                   shares: {}, creditId: 'd_pret', bienId: 'c_immo' });
      s.budget.fixedCharges.push({ label: 'Copropriété', amount: 100, period: 'mois',
                                   shares: {}, bienId: 'c_immo' });
    });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.mensualite, 400, 'la mensualité vient de la charge qui rembourse');
    pres(cf.charges, 100, 'et cette charge ne compte plus une seconde fois');
    pres(cf.cashFlow, 600 - 100 - 400, 'le cash-flow ne perd plus 400 € en double');
  });

  test('un crédit d’un autre établissement reste une charge comme les autres', () => {
    /* Sa mensualite n'entre pas dans le total du bien : l'ecarter des charges la
       ferait disparaitre du calcul sans que rien ne le dise. */
    loue(s => {
      s.etabs.find(e => e.id === 'e_courtier').dettes.push(
        { id: 'd_conso', libelle: 'Crédit travaux', montant: 8000, note: '' });
      s.budget.fixedCharges.push({ label: 'Crédit travaux', amount: 150, period: 'mois',
                                   shares: {}, creditId: 'd_conso', bienId: 'c_immo' });
    });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.charges, 150, 'elle sort du budget pour ce bien, elle compte');
  });

  test('des charges plus lourdes que le loyer ne créent pas d’impôt négatif', () => {
    loue(s => {
      s.comptes.find(c => c.id === 'c_immo').tauxImpot = 30;
      s.budget.fixedCharges.push({ label: 'Travaux', amount: 900, period: 'mois',
                                   shares: {}, bienId: 'c_immo' });
    });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.impot, 0, 'un déficit ne se taxe pas, et l’application ne connaît pas tes autres revenus');
  });

  test('sans taux déclaré, le net d’impôt n’existe pas plutôt que de valoir le net', () => {
    loue();
    const cf = cashFlowBien(compteById('c_immo'));
    eq(cf.rendementNetNet, null, 'aucun chiffre inventé');
    eq(cf.impot, 0, 'et rien de retiré');
  });

  test('le cash-flow retire tout ce qui sort, impôt compris', () => {
    loue(s => {
      s.comptes.find(c => c.id === 'c_immo').tauxImpot = 30;
      s.comptes.find(c => c.id === 'c_immo').moisLoues = 11;
      s.etabs.find(e => e.id === 'e_bien').dettes[0].mensualite = 400;
      s.budget.fixedCharges.push({ label: 'Copropriété', amount: 100, period: 'mois',
                                   shares: {}, bienId: 'c_immo' });
    });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.cashFlow, cf.loyers - cf.charges - cf.mensualite - cf.impot,
      'le solde est la somme de ses termes, tous affichés');
    pres(cf.cashFlow, 550 - 100 - 400 - (550 - 100) * 0.30, 'et vaut ce qu’on calcule à la main');
  });

  test('le rendement sur apport ne baisse plus tout seul à mesure qu’on rembourse', () => {
    /* Le denominateur d'avant, prix paye moins capital restant, grossissait a
       chaque mensualite : a cash-flow egal le rendement affiche baissait alors
       que rien ne se degradait. L'apport, lui, ne bouge pas. */
    const avec = (reste) => {
      loue(s => {
        s.comptes.find(c => c.id === 'c_immo').apport = 30000;
        s.etabs.find(e => e.id === 'e_bien').dettes[0].montant = reste;
      });
      return cashFlowBien(compteById('c_immo'));
    };
    const debut = avec(40000), plusTard = avec(20000);
    pres(debut.cashOnCash, plusTard.cashOnCash,
      'vingt mille euros remboursés plus tard, le chiffre est le même');
    pres(debut.cashOnCash, 600 * 12 / 30000 * 100, 'le cash-flow annuel sur l’apport');
  });

  test('sans apport déclaré, aucun rendement sur apport', () => {
    loue();
    const cf = cashFlowBien(compteById('c_immo'));
    eq(cf.cashOnCash, null, 'plutôt qu’un chiffre sur une base inventée');
    eq(cf.apport, null, 'et la base non plus');
  });

  test('la part de capital de la mensualité se tait quand le taux manque', () => {
    loue(s => { s.etabs.find(e => e.id === 'e_bien').dettes[0].mensualite = 600; });
    eq(cashFlowBien(compteById('c_immo')).capitalMois, null,
      'sans taux, on ne sait pas départager capital et intérêts : mieux vaut rien que zéro');
    loue(s => {
      s.etabs.find(e => e.id === 'e_bien').dettes[0].mensualite = 600;
      s.etabs.find(e => e.id === 'e_bien').dettes[0].taux = 3;
    });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.capitalMois, 600 - 40000 * 0.03 / 12, 'la mensualité moins les intérêts du mois');
  });

  test('le rendement dit toujours sur quelle base il se calcule', () => {
    /* Prix d'acquisition connu : c'est lui. Sinon la valeur du jour, et l'ecran
       l'annonce — deux bases donnent deux chiffres pour la meme ligne. */
    loue();
    eq(cashFlowBien(compteById('c_immo')).surAchat, true, 'le prix payé est connu');
    pres(cashFlowBien(compteById('c_immo')).base, 110000, 'donc la base, c’est lui');
    loue(s => { s.comptes.find(c => c.id === 'c_immo').lignes[0].prixDeRevient = 0; });
    const sans = cashFlowBien(compteById('c_immo'));
    eq(sans.surAchat, false, 'sans prix payé, la base change');
    pres(sans.base, 120000, 'et c’est la valeur du jour');
  });

  test('une quote-part rétrécit la base du rendement, comme le patrimoine', () => {
    loue(s => { s.comptes.find(c => c.id === 'c_immo').lignes[0].part = 50; });
    const cf = cashFlowBien(compteById('c_immo'));
    pres(cf.base, 55000, 'la moitié du prix payé : on ne rapporte pas son loyer au bien du voisin');
  });
});

/* ------------------------------------------------------------------
   La fiche pose la question de l usage, pas une seule pour tous
   ------------------------------------------------------------------ */
suite('La fiche pose la question de l’usage', () => {

  test('une résidence principale ne s’entend plus dire « rendement 0,00 % »', () => {
    /* Le garde-fou testait l'absence de loyer ET de charge. Rattacher sa taxe
       fonciere a sa propre maison suffisait donc a basculer la carte en mode
       rendement, sur un bien qui n'en a pas. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.slice(src.indexOf('function carteExploitation'),
                           src.indexOf('function espaceBien'));
    vrai(bloc.length > 500, 'la carte doit être trouvable');
    vrai(/const habite = usage === 'principale' \|\| usage === 'secondaire'/.test(bloc),
      'l’usage déclaré décide de la carte affichée');
    const versant = bloc.slice(bloc.indexOf('if (habite)'), bloc.indexOf('const baseDite'));
    vrai(!/[Rr]endement/.test(versant),
      'le versant habité ne parle jamais de rendement');
    vrai(/Coût réel du mois/.test(versant) && /Dont capital remboursé/.test(versant),
      'il répond à sa question à lui : ce que ce logement coûte, capital mis à part');
  });

  test('les deux chiffres du mois ne s’additionnent jamais', () => {
    /* Tresorerie et patrimoine repondent a deux questions ; leur somme
       melangerait de l'argent disponible et des murs. */
    const src = lireSource('assets/app.js');
    const bloc = src.slice(src.indexOf('function carteExploitation'),
                           src.indexOf('function espaceBien'));
    vrai(/En patrimoine, le même mois/.test(bloc), 'le second chiffre est dit');
    vrai(!/cashFlow \+ .*capitalMois|capitalMois \+ .*cashFlow/.test(bloc),
      'et jamais agrégé au premier');
  });

  test('la liste des usages se dérive de sa table', () => {
    const src = lireSource('assets/app.js');
    vrai(/USAGES_BIEN\.map/.test(src),
      'la fiche parcourt la table : un usage ajouté demain apparaît sans qu’on y pense');
    eq(Object.keys(USAGE_BIEN_LABEL).join(','), USAGES_BIEN.map(([c]) => c).join(','),
      'et le dictionnaire des libellés en vient aussi');
    eq(usageLigne({ usage: 'colocation' }), '',
      'un usage inconnu ne se propage pas : il vaut « à préciser »');
  });

  test('l’usage se demande dès la création, là où on le sait', () => {
    const src = lireSource('assets/app.js');
    vrai(/cle: 'usageBien'/.test(src),
      'posé plus tard dans une fiche, il resterait vide chez presque tout le monde');
    vrai(/\.\.\.\(e3\.usageBien \? \{ usage: e3\.usageBien \} : \{\}\)/.test(src),
      'et ce qui est répondu s’écrit sur la ligne');
  });

  test('sur un logement habité, le total égale encore la somme de ses lignes', () => {
    /* L'impot n'etait pas affiche sur ce versant alors qu'il sort du compte : le
       total aurait ete plus petit que ce que la carte montre. */
    const src = lireSource('assets/app.js');
    const bloc = src.slice(src.indexOf('function carteExploitation'),
                           src.indexOf('function espaceBien'));
    const versant = bloc.slice(bloc.indexOf('if (habite)'), bloc.indexOf('const baseDite'));
    vrai(/const sortie = cf\.charges \+ cf\.mensualite \+ cf\.impot - cf\.loyers/.test(versant),
      'la sortie du compte compte l’impôt, parce qu’il en sort');
    /* Il s'affiche parmi les lignes du mois, partagees par les deux versants :
       un terme du total ne peut pas rester invisible, et les deux cotes le
       montrent par la meme fonction plutot que chacun de son cote. */
    vrai(/\$\{lignesDuMois\(cf\)\}/.test(versant), 'le versant habité liste les mêmes pièces');
    const pieces = src.slice(src.indexOf('function lignesDuMois'), src.indexOf('function ligneSource'));
    vrai(/Impôt déclaré/.test(pieces), 'et l’impôt y figure');
  });

  test('un logement qui rapporte ne s’entend pas dire qu’il coûte zéro', () => {
    /* Une chambre bien louee peut couvrir plus que la mensualite. Le montant
       etait borne a zero, donc l'intitule mentait sur un chiffre positif. */
    const src = lireSource('assets/app.js');
    const bloc = src.slice(src.indexOf('function carteExploitation'),
                           src.indexOf('function espaceBien'));
    vrai(!/Math\.max\(0, sortie/.test(bloc),
      'plus de plancher à zéro sur le coût réel');
    vrai(/fmtSigned\(-reel\)/.test(bloc) && /cls\(-reel\)/.test(bloc),
      'le signe et la couleur suivent le sens réel du mois');
  });

  test('les réglages qui agissent restent modifiables, quel que soit l’usage', () => {
    /* Declares sur un locatif puis bascules en residence principale, la vacance
       et l'impot continuaient d'agir sans qu'aucun champ ne les montre. */
    const src = lireSource('assets/app.js');
    const bloc = src.slice(src.indexOf('function carteExploitation'),
                           src.indexOf('function espaceBien'));
    const versant = bloc.slice(bloc.indexOf('if (habite)'), bloc.indexOf('const baseDite'));
    vrai(/cf\.loyersPleins \? reglagesExploitation\(c, idx, \{ apport: false \}\)/.test(versant),
      'dès qu’un loyer est rattaché, ses réglages sont offerts ici aussi');
    /* Sans loyer, ils n'auraient aucun effet : les offrir serait du bruit. */
    vrai(/function reglagesExploitation\(c, idx, \{ apport = true \} = \{\}\)/.test(src),
      'et l’apport reste au seul écran où il sert, celui du rendement');
  });
});

/* ------------------------------------------------------------------
   Un patrimoine net negatif a deux causes, pas une
   ------------------------------------------------------------------ */
suite('Un patrimoine net négatif a deux causes', () => {

  /* Neuf fois sur dix c'est une dette saisie sans son bien. Mais un achat
     recent finance a 110 % donne le meme signe sans que rien ne soit faux, et
     envoyer « declare ce bien » a qui vient de le declarer est faux. */

  const alerte = () => healthChecks().find(n => /net négatif/i.test(n.title || ''));

  test('un crédit sans bien en face reste une erreur, et nomme le crédit', () => {
    Fixture.poser(s => {
      /* La dette est portee par le courtier, qui n'heberge aucun bien. */
      s.etabs.find(e => e.id === 'e_courtier').dettes.push(
        { id: 'd_gros', libelle: 'Prêt sans bien', montant: 300000, note: '' });
      s.etabs.find(e => e.id === 'e_bien').dettes = [];
    });
    vrai(patrimoine().net < 0, 'le fixture est bien en négatif');
    const a = alerte();
    vrai(a, 'l’alerte existe');
    eq(a.level, 'error', 'et c’est une erreur : il manque une valeur');
    vrai(/Prêt sans bien/.test(a.detail),
      'elle nomme le crédit sans bien en face, pas simplement le plus gros');
  });

  test('un achat récent, bien déclaré, n’est plus peint en rouge', () => {
    /* Le credit a finance les frais de notaire : 130 000 EUR dus sur un bien qui
       en vaut 120 000. L'ecart est exact, et il se resorbe chaque mois. */
    Fixture.poser(s => {
      const d = s.etabs.find(e => e.id === 'e_bien').dettes[0];
      d.montant = 260000;
      d.mensualite = 1000;
      d.taux = 3;
    });
    vrai(patrimoine().net < 0, 'le net est négatif');
    const a = alerte();
    vrai(a, 'l’alerte existe toujours : le chiffre ne se cache pas');
    eq(a.level, 'info',
      'mais ce n’est pas une erreur : crier au loup à chaque ouverture ne sert personne');
    const txt = a.detail;
    vrai(/normal après un achat/.test(a.title), 'le titre dit la cause probable');
    vrai(!/déclare ce bien/.test(txt),
      'et ne demande pas de déclarer un bien déjà déclaré');
    /* Ce que le mois fait, sans annoncer de date : une date demanderait de parier
       sur la valeur du bien. */
    vrai(/de capital, et ton patrimoine net remonte d'autant/.test(txt),
      'elle dit ce que chaque mensualité rembourse');
    vrai(!/mois|ans/.test(txt.replace(/mensualité|premières années/g, '')),
      'aucune date de retour à l’équilibre : elle serait un pari sur la valeur');
  });

  test('sans taux, elle demande le taux au lieu de compter zéro', () => {
    Fixture.poser(s => {
      const d = s.etabs.find(e => e.id === 'e_bien').dettes[0];
      d.montant = 260000;
      d.mensualite = 1000;
      d.taux = null;
    });
    const txt = alerte().detail;
    vrai(/Renseigne le taux/.test(txt),
      'sans taux on ne sait pas départager capital et intérêts : mieux vaut le demander');
  });

  test('la valeur estimée dit ce qu’elle exclut', () => {
    /* Deux champs voisins, l'un frais compris et l'autre pas : saisir ici le prix
       paye frais compris surevalue le bien de ses frais de notaire. */
    const src = lireSource('assets/app.js');
    const i = src.indexOf("trad('Valeur estimée aujourd\\'hui (€)')");
    vrai(i > 0, 'le champ doit être trouvable');
    vrai(/frais de notaire exclus/.test(src.slice(i, i + 400)),
      'son aide dit ce qu’elle exclut, comme celle du prix d’acquisition dit ce qu’elle inclut');
  });
});

/* ------------------------------------------------------------------
   Une application vide dit quoi faire, et se tait sur le reste
   ------------------------------------------------------------------ */
suite('Une application vide dit quoi faire', () => {

  test('le bouton d’ajout ouvre une carte qui existe', () => {
    /* « Enorme bug, sur un compte vide le bouton ajouter un titre ça marche pas. »
       Il posait son drapeau, relançait le rendu, ne trouvait rien à ouvrir — la
       carte de recherche ne se rendait qu'avec le tableau des lignes, c'est-à-dire
       partout sauf sur l'écran sans aucune ligne. Le clic ne faisait donc rien
       précisément là où l'on vient tout ajouter.

       Deux moitiés à ce défaut, et il fallait les deux : la carte doit se rendre,
       et le montage doit la câbler — il sortait avant, faute de positions. */
    const src = lireSource('assets/app.js');
    const vue = src.slice(src.indexOf('function viewPositions('), src.indexOf('function mountPositions('));
    const vide = vue.slice(0, vue.indexOf('${barreEtatCours()}'));
    vrai(/data-action="ajouter-ligne"/.test(vide), 'l’état vide porte le bouton');
    vrai(/symbolSearchCard\(\)/.test(vide),
      'et la carte de recherche qu’il ouvre, sinon le clic ne trouve rien');
    const montage = src.slice(src.indexOf('function mountPositions('),
                              src.indexOf('function mountSymbolSearch('));
    const iCablage = montage.indexOf('mountSymbolSearch()');
    const iSortie = montage.indexOf('if (!Store.state.positions.length) return;');
    vrai(iCablage > 0, 'le montage câble la recherche');
    vrai(iSortie < 0 || iCablage < iSortie,
      'et il le fait avant de sortir faute de lignes, sinon le champ reste inerte');
  });

  /* Chaque ecran portait son texte d'ecran vide, mais l'accueil — le premier
     ouvert — ne disait rien, et rien ne donnait l'ordre. La forme retenue est
     celle qui existait deja pour le revenu : un bouton, une phrase, dans la
     carte qui manque de la donnee. Pas de panneau central qui renverrait
     ailleurs. */
  const vide = () => Fixture.poser(s => {
    s.comptes = []; s.etabs = []; s.positions = []; s.monthly = [];
    s.budget.income = []; s.budget.fixedCharges = []; s.budget.expenses = [];
  });

  test('un premier lancement ne pose aucune ligne de données', () => {
    /* Il posait un compte courant, un livret, un « Salaire 0 € » et un
       « Loyer 0 € » : des exemples deguises en donnees, qui faisaient croire a
       l'application qu'elle etait configuree. Aucune invite ne s'affichait, les
       rappels reclamaient un releve a qui n'avait aucun compte, et la page Actifs
       ouvrait sur deux comptes a zero rattaches a rien. */
    Store.state = blankState();
    Store.migrate();
    refreshAccounts();
    eq(Store.state.budget.income.length, 0, 'aucun revenu d’exemple');
    eq(Store.state.budget.fixedCharges.length, 0, 'aucune charge d’exemple');
    eq(comptesOuverts().filter(c => !typeCompte(c.type).interne).length, 0,
      'aucun compte que personne n’a créé');
    /* Ce qui reste est de la structure : le calendrier, les categories. */
    eq(Store.state.budget.expenses.length, 12, 'les douze mois du calendrier restent');
    vrai(Store.state.budget.categories.length > 0, 'et les catégories de dépenses');
    /* Les trois pas restent donc a faire, et les rappels se taisent. */
    for (const cle of ['comptes', 'revenus', 'depenses']) {
      vrai(pasAFaire(cle), `« ${cle} » reste à faire sur un premier lancement`);
    }
    /* Le releve, lui, ne se reclame pas encore : sans compte, il n'y a rien a
       photographier, et l'annoncer enverrait vers un geste impossible. */
    vrai(!pasAFaire('releves'), 'le relevé attend qu’un compte existe');
    eq(currentMonthPending().missing, false, 'aucun relevé réclamé sans un compte');
    eq(depensesEnAttente().missing, false, 'aucun mois clos réclamé le premier jour');
    eq(healthChecks().length, 0, 'et pas une seule alerte pour accueillir');
  });

  test('les trois pas se dérivent des données, jamais d’un drapeau', () => {
    vide();
    for (const cle of ['comptes', 'revenus', 'depenses']) {
      vrai(pasAFaire(cle), `« ${cle} » reste à faire sur une application vide`);
    }
    /* Un drapeau « premiers pas termines » aurait menti des le premier import. */
    Fixture.poser();
    for (const cle of ['comptes', 'revenus', 'depenses']) {
      vrai(!pasAFaire(cle), `« ${cle} » est fait dès que la donnée existe`);
    }
    eq(pasAFaire('inconnu'), false, 'un pas qui n’existe pas ne reste pas à faire');
  });

  test('le relevé se demande dès qu’un compte le rend possible, et pas avant', () => {
    /* L'ordre des pas est un ordre de faisabilite, pas une preference : la courbe
       et le rythme n'ont que le releve a demander, et le releve n'a de sens
       qu'apres le premier compte. */
    Store.state = blankState(); Store.migrate(); refreshAccounts();
    vrai(!pasAFaire('releves'), 'rien à photographier sans compte');
    Store.state.comptes.push({ id: 'c1', etabId: null, type: 'courant', statut: 'ouvert',
      libelle: 'Courant', cash: [{ montant: 500, affectation: 'courant' }], lignes: [] });
    refreshAccounts();
    vrai(pasAFaire('releves'), 'un compte créé, le relevé devient le pas suivant');
    /* Et il s'efface au premier releve enregistre. */
    Store.state.monthly = [{ date: '2026-08-01', comment: '', v: { c1: 500 } }];
    refreshAccounts();
    vrai(!pasAFaire('releves'), 'le premier relevé le franchit');
  });

  test('un graphique sans conteneur ne casse pas l’écran', () => {
    /* Des que l'accueil masque ses cartes vides, les graphiques recoivent `null` :
       `el.clientWidth` levait, et l'exception remontait jusqu'a `render()`. Un
       ecran a moitie peint au premier lancement, soit le seul moment ou l'on
       n'a pas encore la moindre raison de faire confiance a l'application. */
    const src = lireSource('assets/charts.js');
    const fn = src.slice(src.indexOf('function mount(el, render)'),
                         src.indexOf('function mount(el, render)') + 200);
    vrai(/if \(!el\) return;/.test(fn),
      'le montage sort en silence quand la carte n’a pas été rendue');
    /* La garde est dans `mount`, pas chez les appelants : il y en a une douzaine,
       donc douze occasions d'oublier. */
    vrai((src.match(/mount\(/g) || []).length >= 7,
      'et elle profite à tous les graphiques d’un coup');
  });

  test('l’accueil d’un premier lancement ne montre pas six cartes de zéros', () => {
    const src = lireSource('assets/app.js');
    vrai(/\$\{pasAFaire\('comptes'\) \? `/.test(src),
      'la suite de la page attend le premier compte');
    vrai(/Le reste de cette page se remplit tout seul/.test(src),
      'et une phrase dit ce qui viendra, plutôt que six cartes muettes');
  });

  test('aucune page n’étale de tableau de zéros', () => {
    /* Allocation repartissait 0 € entre sept classes, Projection etalait « 0 € »
       sur cinquante ans et dix horizons, Releves ouvrait douze mois vides sans un
       mot. Un tableau de zeros n'est pas un resultat, c'est une question mal
       posee — et c'est la premiere impression d'une application publique. */
    const src = lireSource('assets/app.js');
    vrai(/function pageAvantDonnees\(phrase, cle = 'comptes'\)/.test(src),
      'un seul helper pour les trois, sinon trois formulations');
    const alloc = src.slice(src.indexOf('function viewAllocation'),
                            src.indexOf('function viewAllocation') + 600);
    vrai(/if \(!\(patrimoine\(\)\.brut > 0\.005\)\)/.test(alloc)
      && /pageAvantDonnees\(/.test(alloc), 'Allocation attend un premier euro');
    const proj = src.slice(src.indexOf('function viewObjective'),
                           src.indexOf('function viewObjective') + 800);
    vrai(/pageAvantDonnees\(/.test(proj), 'Projection aussi');
    /* Mais un versement mensuel suffit : quelqu'un qui part de rien et versera
       300 EUR par mois a une projection qui a du sens. */
    vrai(/num\(Store\.state\.meta\.projMonthly\) > 0/.test(proj),
      'et elle s’affiche dès qu’un versement est réglé, même sans capital');
    vrai(/Un relevé est la photo de tes comptes/.test(src),
      'la page des relevés dit ce qu’un relevé est, et ce qu’il attend');
  });

  test('une projection sans capital mais avec versement reste affichée', () => {
    /* Le garde-fou ne doit pas cacher la page a qui commence a epargner : c'est
       precisement le moment ou une projection sert. */
    Store.state = blankState(); Store.migrate(); refreshAccounts();
    pres(patrimoine().brut, 0, 'rien en poche');
    Store.state.meta.projMonthly = 300;
    /* Le test porte sur la condition, verifiee sur le source : la vue n'est pas
       chargee par le harnais. */
    const src = lireSource('assets/app.js');
    const proj = src.slice(src.indexOf('function viewObjective'),
                           src.indexOf('function viewObjective') + 800);
    vrai(/&& !\(num\(Store\.state\.meta\.projMonthly\) > 0\)/.test(proj),
      'les deux conditions se cumulent : ni capital, ni versement');
  });

  test('un pli replié le reste après un enregistrement', () => {
    /* Le geste ne basculait qu'une classe CSS : le premier rendu suivant
       reconstruisait le balisage avec « ouvert » en dur, et tout se redepliait.
       Le registre est celui des groupes de comptes, sous un prefixe : le meme
       fait, une seule liste. */
    /* `cleLiqPli` et `compteReplies` vivent dans app.js, que le harnais ne charge
       pas : le controle se fait sur le source, comme les autres de cette famille.
       Ce qui se verifie cote donnees, c'est que le registre existe bien dans
       `meta` et qu'il traverse une relecture de l'etat. */
    Fixture.poser();
    Store.state.meta.comptesReplies = ['liq:courant'];
    const copie = structuredClone(Store.state);
    Store.state = copie;
    vrai((Store.state.meta.comptesReplies || []).includes('liq:courant'),
      'le repli vit dans meta, donc il traverse une relecture de l’état');
    const src = lireSource('assets/app.js');
    vrai(/const cleLiqPli = aff => `liq:\$\{aff\}`;/.test(src),
      'la clé est préfixée, pour ne pas heurter un contenant du même nom');
    vrai(/comptesReplies/.test(src),
      'et elle partage le registre des groupes de comptes, pas une seconde liste');
    const action = src.slice(src.indexOf("'liq-plier'(btn)"), src.indexOf("'liq-plier-tout'(btn)"));
    vrai(/compteReplies\.delete\(cle\)/.test(action) && /compteReplies\.add\(cle\)/.test(action),
      'le geste écrit dans l’état');
    vrai(/pli\.classList\.toggle\('ouvert', ouvert\)/.test(action),
      'et bascule la classe sur place : un re-rendu tuerait l’animation');
  });

  test('les cartes qui ne peuvent rien montrer disent ce qui les remplirait', () => {
    const src = lireSource('assets/app.js');
    /* La courbe : le graphique est monte apres le rendu, il ne connait pas ce qui
       le remplirait — c'est donc la carte qui le dit. */
    const evo = src.slice(src.indexOf('<div class="chart" id="chartEvo">'),
                          src.indexOf('<div class="chart" id="chartEvo">') + 700);
    vrai(/invitePremierPas\('releves'\)/.test(evo),
      'la carte d’évolution demande le relevé qui lui manque');
    /* L'autonomie : un rapport entre deux vides n'accuse personne de rien. */
    vrai(/if \(!ep && !r\.burn\) return/.test(src),
      '« 0,0 mois » en rouge sur 0 € et 0 € de coût laisse place à une phrase');
  });

  test('chaque pas porte son bouton, son action et sa raison', () => {
    for (const p of PREMIERS_PAS) {
      vrai(p.bouton && p.action && p.quoi, `« ${p.cle} » doit porter les trois`);
      vrai(p.quoi.length > 40, `« ${p.cle} » doit dire pourquoi, pas seulement quoi`);
    }
    eq(Object.keys(PAS_PAR_CLE).join(','), PREMIERS_PAS.map(p => p.cle).join(','),
      'l’index se dérive de la table, il ne se recopie pas');
  });

  test('les invites viennent de la table, elles ne se réécrivent pas', () => {
    const src = lireSource('assets/app.js');
    vrai(/function invitePremierPas\(cle\)/.test(src), 'une seule fonction les rend');
    for (const cle of ['comptes', 'revenus', 'depenses']) {
      vrai(new RegExp(`invitePremierPas\\('${cle}'\\)`).test(src),
        `l’invite « ${cle} » est posée quelque part`);
    }
    /* Le texte du revenu vivait dans la vue : il a rejoint la table, et la vue
       ne doit plus le porter en double. */
    vrai(!/Sans revenu déclaré, cette carte\s*\n?\s*n'a pas de total/.test(src),
      'le texte du revenu a quitté la vue pour la table');
  });

  test('la cloche ne réclame rien qui n’ait de sens sur une application vide', () => {
    /* « Épargne de précaution : 0 mois, 0 € pour 0 € de coût mensuel » etait la
       caricature de la regle : la cloche ne parle que de ce qui existe chez
       celui qui la regarde. */
    vide();
    const titres = healthChecks().map(n => n.title).join(' | ');
    vrai(!/Épargne de précaution/.test(titres),
      `un coût mensuel nul ne se compare à rien : ${titres}`);
    vrai(!/à enregistrer/.test(titres),
      `rien à relever sans un seul compte : ${titres}`);
    vrai(!/à saisir/.test(titres),
      `ni de dépenses à réclamer sans revenu ni charge : ${titres}`);
  });

  test('mais elle reparle dès que la donnée existe', () => {
    /* La garde ne doit pas eteindre le controle pour de bon : c'est une alerte
       utile des qu'il y a de quoi la calculer. Le fixture tient 3,3 mois, donc
       au-dessus du seuil : on lui retire du cash pour passer dessous. */
    Fixture.poser(s => {
      s.budget.fixedCharges.push({ label: 'Loyer', amount: 1200, period: 'mois', shares: {} });
    });
    const rw = runway();
    vrai(rw.burn > 0, 'le fixture a un coût mensuel');
    vrai(rw.immediateMonths < 3, `et moins de trois mois de coussin (${rw.immediateMonths})`);
    vrai(healthChecks().some(n => /Épargne de précaution/.test(n.title)),
      'donc l’alerte revient');
    vrai(comptesOuverts().length > 0 && healthChecks().some(n => /à enregistrer/.test(n.title)),
      'et le relevé se réclame de nouveau');
  });

  test('un titre coté demande d’abord un compte qui puisse le porter', () => {
    /* Sans compte eligible, la fenetre d'ajout n'offrait qu'une liste deroulante
       vide : le titre n'avait nulle part ou aller, et rien ne disait pourquoi. */
    vide();
    /* Aucun compte ouvert, donc aucun ne peut porter de titre : la liste que la
       fenetre d'ajout propose vit dans app.js, que le harnais ne charge pas, mais
       elle se derive de ces comptes-la. */
    eq(comptesOuverts().length, 0, 'aucun compte ne peut porter un titre');
    const src = lireSource('assets/app.js');
    /* La fenetre se lit jusqu'a la fin de l'etat vide, et non sur un nombre de
       caracteres arbitraire : la carte de recherche s'y est ajoutee, et le
       compte rond d'avant coupait la phrase qu'on verifie. */
    const debut = src.indexOf("trad('Aucun titre coté')");
    const bloc = src.slice(debut, src.indexOf('${barreEtatCours()}', debut));
    vrai(/Un titre se pose sur le compte qui le détient/.test(bloc),
      'l’écran dit le prérequis, pas seulement la frontière avec Actifs');
    vrai(/data-action="ajouter-compte"/.test(bloc), 'et offre le geste');
    /* Les types eligibles se derivent de leur table : celui qu'on ajoutera
       demain entrera dans la phrase sans qu'on y pense. */
    vrai(/TYPES_COMPTE\.filter/.test(bloc), 'la liste des types se dérive');
  });
});

/* ------------------------------------------------------------------
   L ecart du non cote se dit, sans se meler aux cours
   ------------------------------------------------------------------ */
suite('L’écart du non coté se dit, sans se mêler aux cours', () => {

  test('la page Performance ignorait le non coté, et le calcul existe enfin', () => {
    /* `latentPnl()` ne lit que `positions` : le non cote, l'immobilier et les
       biens n'apparaissaient dans aucun ecart, alors qu'un prix de revient y est
       saisi et qu'ils portent souvent la moitie d'un patrimoine. */
    Fixture.poser();
    const cote = latentPnl();
    const nc = latentNonCote();
    vrai(cote.count > 0 && nc.lignes.length > 0, 'le fixture porte les deux natures');
    /* Aucune ligne de marche dans le non cote, et reciproquement : la frontiere
       se lit sur `marche`, pas sur une liste de classes — un ETF immobilier est
       cote. */
    vrai(nc.lignes.every(l => l.classe !== 'actions'),
      'les titres cotés restent chez eux');
    pres(nc.value, nc.lignes.reduce((s, l) => s + l.value, 0), 'le total est la somme des parts');
    pres(nc.invested, nc.lignes.reduce((s, l) => s + l.invested, 0), 'et l’investi aussi');
    pres(nc.pnl, nc.value - nc.invested, 'l’écart est la différence des deux');
  });

  test('une ligne sans prix de revient n’entre pas dans l’écart', () => {
    /* Sans prix paye, il n'y a pas d'ecart a dire : compter la valeur seule
       gonflerait la plus-value de tout ce qu'on n'a pas su renseigner. */
    Fixture.poser(s => {
      s.comptes.find(c => c.id === 'c_pe').lignes.push(
        { id: 'l_x', classe: 'nonCote', libelle: 'Sans prix', valeur: 5000, prixDeRevient: 0 });
    });
    const nc = latentNonCote();
    vrai(!nc.lignes.some(l => l.nom === 'Sans prix'), 'elle reste dehors');
    vrai(nc.invested > 0 && nc.pct !== null, 'et le pourcentage garde une base positive');
  });

  test('un pourcentage sans base positive n’existe pas', () => {
    Fixture.poser(s => {
      for (const c of s.comptes) for (const l of (c.lignes || [])) l.prixDeRevient = 0;
    });
    eq(latentNonCote().pct, null, 'plutôt qu’une division par zéro déguisée');
    pres(latentNonCote().invested, 0, 'aucune base');
  });

  test('l’âge de la valeur fait partie du chiffre', () => {
    /* Une plus-value declaree il y a trois ans ne vaut pas celle d'hier, et c'est
       la seule difference qu'une valeur declaree puisse honnetement montrer. Le
       seuil est celui de la cloche : un an. */
    Fixture.poser(s => {
      const l = s.comptes.find(c => c.id === 'c_pe').lignes[0];
      l.estimeLe = '2020-01-01';
    });
    const vieille = latentNonCote().lignes.find(l => l.nom === 'Startups');
    vrai(vieille && vieille.vieille, 'une estimation de 2020 est à revoir');
    eq(latentNonCote().aRevoir >= 1, true, 'et le compte le dit');
    /* Jamais estimee compte aussi : l'absence de date n'est pas une date recente. */
    Fixture.poser(s => { delete s.comptes.find(c => c.id === 'c_pe').lignes[0].estimeLe; });
    vrai(latentNonCote().lignes.find(l => l.nom === 'Startups').vieille,
      'sans date, la valeur est à revoir : l’absence n’est pas une fraîcheur');
  });

  test('rien de tout cela n’entre dans la page des marchés', () => {
    /* Marchés › Performance ne suit que ce dont le cours arrive tout seul, son
       ecran vide le dit : y ramener le non cote le remettrait d'ou l'application
       a mis du temps a le sortir. Et aucun total ne mele les deux natures. */
    const src = lireSource('assets/app.js');
    /* La regle a survecu a la page qui la portait : Performance a ete retiree, et
       c'est Positions qui est maintenant la page des marches. Le controle suit le
       sujet plutot que le nom — y ramener le non cote le remettrait d'ou
       l'application a mis du temps a le sortir. */
    const marches = src.slice(src.indexOf('function viewPositions('),
                              src.indexOf('function mountPositions('));
    vrai(marches.length > 1000, 'la page des marchés doit se relire depuis sa source');
    vrai(!/latentNonCote/.test(marches),
      'la page des marchés ne parle pas du non coté');
    /* Il se lit dans son propre apercu, celui qui s'ouvre depuis l'accueil. */
    const pe = src.slice(src.indexOf('  pe: () => {'), src.indexOf('  investi: () =>'));
    vrai(/latentNonCote\(\)/.test(pe), 'l’aperçu du non coté porte l’écart');
    vrai(/valeurs que tu déclares, pas des cours/.test(pe),
      'et il nomme la nature du chiffre avant de le donner');
    vrai(/\$\{fmtEUR0\(invested\)\} \$\{trad\('investis'\)\}/.test(pe),
      'la note du total dit sa base : le montant investi');
  });
});

/* ------------------------------------------------------------------
   Le versement mensuel dit ou il va
   ------------------------------------------------------------------ */
suite('Le versement mensuel dit où il va', () => {

  /* Il partait toujours dans le marche, capitalise a son taux, et rien a l'ecran
     ne le disait : « on ne voit pas tout de suite que c'est la dessus ».
     L'hypothese est juste pour le cas courant — on investit son epargne — mais
     fausse pour qui epargne sans investir. */

  const projeter = (vers, ans = 10) => {
    Fixture.poser(s => {
      s.meta.projMonthly = 300;
      s.meta.projRate = 8;
      s.meta.projRateAutres = 0;
      s.meta.projVersementVers = vers;
    });
    return capitalisation({ years: ans });
  };

  test('le marché reste le défaut, et rien ne change pour les états existants', () => {
    Fixture.poser(s => { delete s.meta.projVersementVers; });
    eq(projectionSettings().versementVers, 'marche',
      'un état sans ce réglage se comporte comme avant');
    /* Une valeur inconnue retombe sur le marche plutot que de vider la poche. */
    Fixture.poser(s => { s.meta.projVersementVers = 'nimporte'; });
    const c = capitalisation({ years: 5 });
    vrai(c.points[5].gains > 0, 'une destination inconnue ne gèle pas la projection');
  });

  test('un versement sur les liquidités ne produit aucun gain', () => {
    /* Les liquidites sont portees a plat : 300 EUR par mois pendant dix ans font
       36 000 EUR, pas un centime de plus. C'est exactement ce qu'un livret non
       declare remunere fait, et c'est le seul chiffre honnete pour qui epargne
       sans investir. */
    const liq = projeter('liquidites');
    const dernier = liq.points[10];
    const verses = 300 * 12 * 10;
    /* Le gain vient alors du seul capital de depart, jamais des versements. */
    const marche = projeter('marche').points[10];
    vrai(dernier.gains < marche.gains,
      'le même versement rapporte moins sur un livret que sur le marché');
    pres(dernier.contributed - liq.points[0].contributed, verses,
      'les versements comptent pour ce qu’ils sont : de l’argent mis, pas gagné');
  });

  test('le total égale toujours ce qui est mis plus les gains', () => {
    /* La regle qui gouverne toute l'application, et le point que ce changement
       pouvait casser : les gains se calculaient par `capital - verse`, ce qui
       supposait que le versement va au marche. Sur un livret, le gain du marche
       devenait negatif et celui des liquidites comptait les versements. */
    for (const vers of ['marche', 'nonCote', 'liquidites']) {
      const c = projeter(vers);
      for (const p of c.points) {
        pres(p.total, p.contributed + p.gains,
          `${vers} : total = mis + gains, année ${p.year}`);
      }
      /* Et aucun gain negatif ne doit apparaitre par construction. Le point de
         depart est ecarte : il ne porte que le total et les versements acquis,
         pas le detail par poche, qui n'aurait aucun sens a l'annee zero. */
      const annees = c.points.filter(p => p.gainsMarche !== undefined);
      vrai(annees.length > 0, 'des années projetées existent');
      vrai(annees.every(p => p.gainsMarche >= -0.005),
        `${vers} : le gain du marché ne devient jamais négatif`);
      vrai(annees.every(p => p.gainsLiquidites >= -0.005),
        `${vers} : celui des liquidités non plus`);
    }
  });

  test('le non coté suit son propre taux, pas celui du marché', () => {
    Fixture.poser(s => {
      s.meta.projMonthly = 300;
      s.meta.projRate = 8;
      s.meta.projRateAutres = 3;
      s.meta.projVersementVers = 'nonCote';
    });
    const c = capitalisation({ years: 10 });
    const d = c.points[10];
    vrai(d.gainsNonCote > 0, 'à 3 % le non coté produit quelque chose');
    /* Et moins qu'a 8 % : le taux applique est bien le sien. */
    Fixture.poser(s => {
      s.meta.projMonthly = 300; s.meta.projRate = 8;
      s.meta.projRateAutres = 3; s.meta.projVersementVers = 'marche';
    });
    const auMarche = capitalisation({ years: 10 }).points[10];
    vrai(auMarche.gains > d.gains, 'le même versement à 8 % rapporte davantage');
  });

  test('l’écran le dit sans qu’on déplie, et le réglage existe', () => {
    const src = lireSource('assets/app.js');
    vrai(/champText\('Versé sur', 'meta\.projVersementVers', VERSEMENT_VERS/.test(src),
      'le champ existe, avec la table pour seule source de ses options');
    /* Le resume replie porte l'hypothese : c'est la qu'on lit les reglages sans
       ouvrir la carte. */
    vrai(/VERSEMENT_VERS\)\[s\.versementVers\]/.test(src),
      'et le résumé replié dit la destination');
    eq(VERSEMENT_VERS.length, 3, 'trois destinations, les trois poches de la projection');
    eq(VERSEMENT_VERS[0][0], 'marche', 'le marché en tête : c’est le défaut');
  });
});

/* ------------------------------------------------------------------
   Une modification ne se perd pas quand l ecran se verrouille
   ------------------------------------------------------------------ */
suite('Une modification ne se perd pas quand l’écran se verrouille', () => {

  /* « Regulierement ça ne sauvegarde pas sur le cloud et j'ai une version
     anterieure en rouvrant. » Le scenario etait deja decrit dans `cloudsync.js`,
     et son dernier maillon manquait : l'envoi differe s'armait, l'ecran se
     verrouillait avant, et rien ne partait.

     Un onglet gele n'execute aucun minuteur. Le seul moment ou du code tourne
     encore est le passage en arriere-plan, et sur telephone il ne se signale pas
     par `pagehide` — la page n'est pas dechargee, elle est mise de cote puis
     restauree — mais par `visibilitychange` vers `hidden`. */

  test('le passage en arrière-plan écrit ce qui reste en attente', () => {
    const src = lireSource('assets/app.js');
    vrai(/document\.addEventListener\('visibilitychange', \(\) => \{\s*if \(document\.hidden\) CloudSync\.flushOnUnload\(\);/.test(src),
      'sans cet écouteur, verrouiller l’écran perd la dernière saisie');
    /* `pagehide` reste : sur ordinateur une page peut disparaitre sans jamais
       devenir cachee. */
    vrai(/addEventListener\('pagehide', \(\) => CloudSync\.flushOnUnload\(\)\)/.test(src),
      'et la fermeture d’onglet reste couverte');
  });

  test('le délai d’envoi laisse une fenêtre courte', () => {
    /* Huit secondes regroupaient bien les modifications, et ouvraient une
       fenetre de huit secondes ou tout se perdait. Le regroupement tient encore
       a 2,5 s : une saisie au clavier ne produit qu'un envoi. */
    const cs = lireSource('assets/cloudsync.js');
    const m = cs.match(/const WRITE_DELAY = (\d+);/);
    vrai(m, 'le délai doit être trouvable');
    vrai(+m[1] <= 3000, `délai de ${m[1]} ms : trop long pour un geste sur téléphone`);
    vrai(+m[1] >= 1000, `délai de ${m[1]} ms : chaque frappe partirait séparément`);
  });

  test('le flush ne réenvoie pas deux fois le même état', () => {
    /* L'ecran se cache, puis la page se decharge : deux appels a la suite. Le
       corps envoye est retenu, donc le second ne fait rien — et le minuteur est
       annule, pour qu'une page restauree ne repousse pas un etat deja parti. */
    const cs = lireSource('assets/cloudsync.js');
    const fn = cs.slice(cs.indexOf('function flushOnUnload'),
                        cs.indexOf('function flushOnUnload') + 700);
    vrai(/if \(payload === lastPayload\) return;/.test(fn),
      'un état déjà envoyé ne repart pas');
    vrai(/lastPayload = payload;/.test(fn),
      'et le beacon n’ayant pas de réponse, c’est ici que le repère se pose');
    vrai(/clearTimeout\(timer\)/.test(fn),
      'le minuteur armé est annulé : une page restaurée ne repousse rien');
  });

  test('un geste explicite part tout de suite, seule la frappe se regroupe', () => {
    /* Chaque `save()` armait le minuteur : le clic sur « Enregistrer » — le geste
       par lequel on dit « c'est bon » — attendait donc comme une frappe au
       clavier, et c'est pendant cette attente que l'ecran se verrouillait.
       Le defaut est desormais l'envoi immediat ; le regroupement se demande. */
    const st = lireSource('assets/store.js');
    vrai(/if \(opts\.differe\) CloudSync\.schedulePush\(\); else CloudSync\.push\(\);/.test(st),
      'save() pousse tout de suite, sauf demande contraire');
    vrai(/save\(opts = \{\}\) \{/.test(st), 'et la demande passe par un argument');
    const src = lireSource('assets/app.js');
    /* Un seul appelant demande le regroupement : l'ecouteur de frappe. */
    const differes = src.match(/Store\.save\(\{ differe: true \}\)/g) || [];
    eq(differes.length, 1,
      'seule la saisie caractère par caractère se regroupe, et une seule fois');
    /* `change` clot une saisie : il ne se regroupe pas. */
    const surChange = src.slice(src.indexOf("document.addEventListener('change'"),
                                src.indexOf("document.addEventListener('change'") + 500);
    vrai(/Store\.save\(\);/.test(surChange) && !/differe: true/.test(surChange),
      'un champ quitté ou une liste choisie partent tout de suite');
  });

  test('deux envois ne se croisent pas', () => {
    /* Avec un envoi par geste, deux clics rapproches lançaient deux PUT
       concurrents : le plus lent arrivait en dernier, donc un etat plus ancien
       ecrit par-dessus le plus recent. */
    const cs = lireSource('assets/cloudsync.js');
    vrai(/if \(enVol\) \{ aRejouer = true; return enVol; \}/.test(cs),
      'un envoi déjà parti n’est pas doublé');
    vrai(/if \(aRejouer\) \{ aRejouer = false; push\(opts\); \}/.test(cs),
      'et ce qui est arrivé pendant le vol repart ensuite');
    /* `push()` relit l'etat a chaque tour, donc le dernier gagne toujours. */
    vrai(/async function pushMaintenant\(\{ force = false \} = \{\}\) \{\s*if \(!available\)/.test(cs),
      'l’envoi relit Store.state à chaque tour');
  });

  test('une réserve se dit une fois, là où elle porte', () => {
    /* Trois lignes de prose reservaient l'ecart du jour sous la carte de la
       plus-value latente, qui ne depend d'aucune date d'achat. La colonne « Var. »
       porte la meme reserve dans son aide, a l'endroit ou le chiffre se lit. */
    const src = lireSource('assets/app.js');
    vrai(!/lignes n’ont pas de date d’achat/.test(src),
      'la mention a quitté la carte de la plus-value latente');
    vrai(/tu ne la détenais pas hier soir/.test(src),
      'et la réserve reste dite dans l’aide de la colonne concernée');
  });
});

/* ------------------------------------------------------------------
   Un seul signe moins dans toute l application
   ------------------------------------------------------------------ */
suite('Un seul signe moins', () => {

  test('les formateurs rendent le signe moins, jamais le trait d’union', () => {
    /* `Intl` rend « -13 500,00 € » avec un trait d'union ASCII, alors que
       l'application ecrit ses negatifs a la main avec U+2212 : le meme ecran
       portait les deux, le grand chiffre en tete et les dettes en dessous. */
    Fixture.poser();
    for (const [nom, txt] of [['fmtEUR', fmtEUR(-13500)], ['fmtEUR0', fmtEUR0(-13500)],
                              ['fmtPct', fmtPct(-4.2)], ['fmtNombre', fmtNombre(-7)],
                              ['fmtCur', fmtCur(-99, 'USD')]]) {
      vrai(!txt.includes('-'), `${nom} rend un trait d’union : « ${txt} »`);
      vrai(txt.includes('−'), `${nom} doit porter le signe moins : « ${txt} »`);
    }
    /* Les positifs ne gagnent pas de signe au passage. */
    vrai(!/[-−]/.test(fmtEUR(13500)), 'et un montant positif reste sans signe');
  });

  test('le signe des formateurs est celui que les écrans écrivent à la main', () => {
    const src = lireSource('assets/app.js');
    /* Les dettes et les deltas s'ecrivent « −${fmtEUR(...)} » : le meme
       caractere, sinon la coherence ne tient qu'a la chance. */
    vrai(/−\$\{fmtEUR/.test(src), 'les écrans écrivent bien U+2212 devant leurs montants');
    eq(fmtSigned(-100).charCodeAt(0), 8722, 'et fmtSigned aussi');
  });
});

/* ------------------------------------------------------------------
   Un montant n a qu un porteur, et l ecran ne propose que celui-la
   ------------------------------------------------------------------ */
suite('Un montant n’a qu’un porteur', () => {

  test('la fiche du bien n’offre plus un second champ de mensualité', () => {
    /* Quand une charge fixe rembourse le credit, c'est elle qui detient la
       mensualite et `mensualiteCredit()` la lit chez elle : ecrire dans le champ
       de la fiche n'avait aucun effet, sans que rien ne le dise. La regle
       existait deja pour la fenetre du credit. */
    const src = lireSource('assets/app.js');
    const bloc = src.slice(src.indexOf('function espaceBien'),
                           src.indexOf('function boutonEnregistrerFiche'));
    vrai(bloc.length > 500, 'la fiche du bien doit être trouvable');
    const i = bloc.indexOf('dettes.${i}.mensualite');
    vrai(i > 0, 'le champ existe encore, pour le crédit qui porte lui-même sa mensualité');
    vrai(/\$\{chargeDuCredit\(d\.id\) \?/.test(bloc.slice(Math.max(0, i - 900), i)),
      'mais il est derrière la question : une charge rembourse-t-elle ce crédit ?');
    vrai(/par mois, depuis la charge/.test(bloc),
      'et l’écran dit alors où le montant se règle, au lieu de se taire');
  });

  test('la date de solde se lit au même endroit sur les deux écrans', () => {
    /* `fin` etait calcule dans creditsEnCours() sans que personne ne le lise :
       du code mort d'un cote, et la carte des credits muette de l'autre. */
    Fixture.poser(s => {
      s.etabs.find(e => e.id === 'e_bien').dettes[0].taux = 3;
      s.etabs.find(e => e.id === 'e_bien').dettes[0].mensualite = 600;
    });
    const ligne = creditsEnCours().lignes.find(x => x.id === 'd_pret');
    const src = lireSource('assets/app.js');
    vrai(/c\.fin \? `\$\{trad\('soldé'\)\} \$\{fmtMoisAn\(c\.fin\.finLe\)\}`/.test(src),
      'la carte des crédits affiche la fin, sans la recalculer de son côté');
    eq(ligne.fin.finLe, finCredit(ETABS().find(e => e.id === 'e_bien').dettes[0]).finLe,
      'et c’est la même date que la fiche du bien');
  });

  test('les postes d’un bien se proposent, et suivent son usage', () => {
    /* La taxe fonciere ouvre la liste : elle est due par tout proprietaire, et
       c'est la periode du premier poste que la fenetre prend par defaut. */
    Fixture.poser();
    const c = compteById('c_immo');
    const noms = chargesProposees(c).map(([l]) => l);
    eq(noms[0], 'Taxe foncière', 'le poste que tout propriétaire paie vient en premier');
    eq(chargesProposees(c)[0][1], 'an', 'et elle se facture à l’année');
    vrai(noms.includes('Provision pour travaux'),
      'la dépense que tout le monde oublie est proposée, c’est elle qui décide du vrai rendement');
    /* L'assurance ne porte pas le meme nom selon qu'on habite ou qu'on loue. */
    Fixture.poser(s => { s.comptes.find(x => x.id === 'c_immo').lignes[0].usage = 'locative'; });
    const loue = chargesProposees(compteById('c_immo')).map(([l]) => l);
    vrai(loue.includes('Assurance propriétaire non occupant'),
      'un logement loué porte une assurance de propriétaire non occupant');
    vrai(!loue.includes('Assurance habitation'), 'et pas celle de qui l’habite');
    Fixture.poser(s => { s.comptes.find(x => x.id === 'c_immo').lignes[0].usage = 'principale'; });
    const habite = chargesProposees(compteById('c_immo')).map(([l]) => l);
    vrai(habite.includes('Assurance habitation') && !habite.includes('Assurance propriétaire non occupant'),
      'et l’inverse pour qui l’habite');
    /* Les postes communs restent en tete dans les deux cas : ils ne se recopient
       pas d'une branche a l'autre. */
    eq(habite.slice(0, 3).join('|'), loue.slice(0, 3).join('|'),
      'ce qui vaut pour tous est écrit une fois');
  });

  test('l’infobulle du bouton se dérive de cette table', () => {
    /* Elle listait les postes a la main : ajouter un poste demandait de penser a
       deux endroits, et celui qu'on oubliait disait le contraire de l'autre. */
    const src = lireSource('assets/app.js');
    vrai(/title="\$\{esc\(chargesProposees\(c\)\.map\(\(\[l\]\) => trad\(l\)\)\.join\(', '\)\)\}"/.test(src),
      'un poste ajouté à la table apparaît dans l’infobulle sans qu’on y pense');
    vrai(!/Taxe foncière, copropriété, assurance PNO/.test(src),
      'et la liste écrite à la main a disparu');
  });

  test('un poste déjà nommé sur un bien se propose sur le suivant', () => {
    Fixture.poser(s => {
      s.budget.fixedCharges.push({ label: 'Ravalement 2027', amount: 300, period: 'an',
                                   shares: {}, bienId: 'c_immo' });
      /* Une charge sans bien n'a rien a faire dans cette liste : un abonnement
         telephonique n'est pas un poste de logement. */
      s.budget.fixedCharges.push({ label: 'Téléphone', amount: 30, period: 'mois', shares: {} });
    });
    const connus = valeursConnues('posteBien');
    vrai(connus.includes('Ravalement 2027'), 'ce qui a été tapé sur un bien revient');
    vrai(!connus.includes('Téléphone'), 'ce qui n’est pas rattaché à un bien reste dehors');
  });

  test('chaque ligne du mois porte sa source, et rien ne s’affiche sans porte', () => {
    /* Un montant qui s'affiche sans porte pour le corriger oblige a chercher sa
       source ailleurs, et rien a l'ecran ne dit ou : le loyer vit dans les
       revenus, la taxe fonciere dans les charges fixes, la mensualite chez le
       preteur. Le rang dans le budget voyage avec le montant. */
    Fixture.poser(s => {
      s.budget.income.push({ label: 'Loyer studio', amount: 7200, period: 'an', bienId: 'c_immo' });
      s.budget.fixedCharges.push({ label: 'Taxe foncière', amount: 1200, period: 'an',
                                   shares: {}, bienId: 'c_immo' });
      s.etabs.find(e => e.id === 'e_bien').dettes[0].mensualite = 400;
    });
    const cf = cashFlowBien(compteById('c_immo'));
    eq(cf.sourcesLoyer.length, 1, 'la source de loyer est listée, pas seulement sommée');
    eq(cf.sourcesLoyer[0].i, Store.state.budget.income.length - 1,
      'et elle porte son rang dans le budget : c’est lui qui ouvre la bonne fenêtre');
    pres(cf.sourcesLoyer[0].mensuel, 600, 'au mois, comme partout ailleurs');
    pres(cf.sourcesLoyer[0].montant, 7200, 'et le montant tel qu’il est saisi, pour le rappeler');
    eq(cf.postesCharge.length, 1, 'la charge aussi');
    eq(cf.postesCharge[0].i, Store.state.budget.fixedCharges.length - 1, 'avec son rang');
    eq(cf.creditsListe.length, 1, 'et le crédit');
    eq(cf.creditsListe[0].index, 0, 'avec son rang chez son établissement');
    eq(cf.creditsListe[0].chargeIndex, null,
      'sa mensualité se règle chez lui : aucune charge ne le rembourse');
  });

  test('la somme des lignes affichées fait le solde, vacance comprise', () => {
    /* La regle du projet, appliquee a cette carte : un total egale la somme de
       ses parts. La vacance etait la seule part a agir sans se montrer. */
    Fixture.poser(s => {
      s.budget.income.push({ label: 'Loyer', amount: 600, period: 'mois', bienId: 'c_immo' });
      s.budget.fixedCharges.push({ label: 'Copropriété', amount: 100, period: 'mois',
                                   shares: {}, bienId: 'c_immo' });
      s.etabs.find(e => e.id === 'e_bien').dettes[0].mensualite = 400;
      const c = s.comptes.find(x => x.id === 'c_immo');
      c.moisLoues = 11;
      c.tauxImpot = 30;
    });
    const cf = cashFlowBien(compteById('c_immo'));
    const lignes = cf.sourcesLoyer.reduce((s, x) => s + x.mensuel, 0)
      - cf.vacanceEuros
      - cf.postesCharge.reduce((s, x) => s + x.mensuel, 0)
      - cf.impot
      - cf.creditsListe.reduce((s, x) => s + x.mensualite, 0);
    pres(lignes, cf.cashFlow, 'à l’euro : rien ne se retire en coulisse');
    pres(cf.vacanceEuros, 600 / 12, 'un mois de vacance sur douze');
  });

  test('la mensualité s’ouvre là où son montant se règle', () => {
    /* Quand une charge fixe rembourse le credit, c'est elle qui detient le
       montant : cliquer la ligne doit mener a la charge, pas au credit, sinon on
       atterrit sur une fenetre qui n'offre plus ce champ. */
    Fixture.poser(s => {
      s.etabs.find(e => e.id === 'e_bien').dettes[0].mensualite = null;
      s.budget.fixedCharges.push({ label: 'Prêt studio', amount: 400, period: 'mois',
                                   shares: {}, creditId: 'd_pret' });
    });
    const cf = cashFlowBien(compteById('c_immo'));
    eq(cf.creditsListe[0].chargeIndex, Store.state.budget.fixedCharges.length - 1,
      'la ligne pointe la charge qui porte la mensualité');
    const src = lireSource('assets/app.js');
    vrai(/action: x\.chargeIndex != null \? 'edit-charge' : 'editer-credit'/.test(src),
      'et la vue choisit la fenêtre selon ce lien');
  });

  test('un loyer se modifie et se supprime depuis le bien qui le porte', () => {
    /* Il ne s'editait qu'en place dans la page Budget : affiche sur la fiche de
       son bien, il n'avait aucune porte. La fenetre est la seconde porte sur le
       meme champ, pas un second champ. */
    const src = lireSource('assets/app.js');
    vrai(/async 'edit-income'\(btn\)/.test(src), 'la fenêtre existe');
    const fn = src.slice(src.indexOf("async 'edit-income'"), src.indexOf("async 'del-income'"));
    vrai(/budget\.income\.splice\(i, 1\)/.test(fn), 'elle supprime');
    vrai(/cle: 'period'/.test(fn), 'elle porte la période, comme sa jumelle des charges');
    vrai(/cle: 'bienId'/.test(fn), 'et le rattachement au bien');
    vrai(/r\.label = v\.label/.test(fn) && /r\.amount = num\(v\.amount\)/.test(fn),
      'elle écrit dans budget.income, la même case que les champs de la page');
    /* La page Budget garde ses champs en place : c'est sa nature, on y saisit en
       serie, et la fenetre ne doit pas les remplacer. */
    vrai(/data-path="budget\.income\.\$\{i\}\.amount"/.test(src),
      'les champs en place de la page Budget restent');
  });

  test('un crédit se renomme et se supprime depuis la fiche du bien', () => {
    const src = lireSource('assets/app.js');
    const fiche = src.slice(src.indexOf('function espaceBien'),
                            src.indexOf('function boutonEnregistrerFiche'));
    vrai(/data-action="editer-credit" data-etab=/.test(fiche),
      'son nom ouvre sa fenêtre : renommer ne se faisait que depuis l’établissement');
    const fn = src.slice(src.indexOf("async 'editer-credit'"), src.indexOf("async 'retirer-credit'"));
    vrai(/cle: 'supprimer'/.test(fn), 'et la fenêtre porte la suppression');
    vrai(/e\.dettes\.splice\(i, 1\)/.test(fn), 'qui retire vraiment la dette');
    vrai(/patrimoine net/.test(fn),
      'le toast dit la conséquence : une dette qui part fait monter le net');
  });

  test('aucune ligne de la carte n’affiche un montant sans porte', () => {
    /* Le balayage qui compte : toute ligne de montant passe par `ligneSource`,
       ou bien porte une aide qui dit ou le regler. Les deux exceptions sont
       nommees ici, et ce sont des champs de la meme carte. */
    const src = lireSource('assets/app.js');
    /* La borne haute est `ligneSource` et non `carteExploitation` : c'est elle
       qui pose le <dt> porteur du bouton, et l'inclure ferait compter la porte
       elle-meme comme une ligne sans porte. */
    const bloc = src.slice(src.indexOf('function lignesDuMois'),
                           src.indexOf('function ligneSource'));
    vrai(bloc.length > 400, 'la fonction doit être trouvable');
    const litteraux = bloc.match(/<dt>[^\n]*/g) || [];
    eq(litteraux.length, 2,
      'deux lignes seulement s’écrivent à la main : les autres passent par ligneSource');
    vrai(litteraux.every(l => /Vacance locative|Impôt déclaré/.test(l)),
      'et ce sont la vacance et l’impôt, réglés par des champs de la même carte');
    vrai(/Se règle par « Mois loués par an »/.test(bloc)
      && /Se règle par « Impôt sur ce loyer »/.test(bloc),
      'et elles le disent toutes les deux');
  });

  test('supprimer une ligne rattachée dit ce que ça emporte ailleurs', () => {
    /* Un loyer supprime depuis la page Budget fait tomber le cash-flow et les
       trois rendements de son bien, sur un ecran qu'on ne regarde pas a ce
       moment-la. Une consequence a deux ecrans de distance se lit avant. */
    const src = lireSource('assets/app.js');
    const fn = src.slice(src.indexOf('function makeDeleter'), src.indexOf('function optionsBiens'));
    vrai(/item\.bienId \? compteById\(item\.bienId\) : null/.test(fn),
      'la confirmation regarde si la ligne est rattachée à un bien');
    vrai(/Le cash-flow et le rendement de/.test(fn), 'et nomme ce qui va tomber');
    vrai(/item\.creditId/.test(fn) && /n’aura plus de mensualité/.test(fn),
      'une charge qui rembourse un crédit le dit aussi : sa date de fin en dépend');
  });

  test('la liste des biens à rattacher porte ses accents', () => {
    /* « aucun, ce n'est pas lie a un bien » s'affichait tel quel dans deux
       fenetres. Les commentaires s'ecrivent sans accents, le texte affiche
       jamais. `optionsBiens` vit dans app.js, que le harnais ne charge pas :
       le controle se fait sur la source, comme les autres de cette famille. */
    const src = lireSource('assets/app.js');
    const fn = src.slice(src.indexOf('function optionsBiens'), src.indexOf('function optionsBiens') + 260);
    vrai(/lié à un bien/.test(fn), 'la première option porte ses accents');
    vrai(!/lie a un bien/.test(src), 'et la version nue a disparu du fichier');
    vrai(/trad\('aucun, ce n’est pas lié à un bien'\)/.test(fn),
      'elle passe par trad, comme toute chaîne affichée');
  });

  test('une part hors bornes le dit au lieu d’être ignorée en silence', () => {
    const src = lireSource('assets/app.js');
    vrai(/Une part va de 0 à 100\. Au-delà, le bien compte en entier\./.test(src),
      'le champ garde la saisie, et un mot dit ce que le calcul en fait');
    vrai(/num\(l\.part\) && \(num\(l\.part\) < 0 \|\| num\(l\.part\) > 100\)/.test(src),
      'et ce mot n’apparaît que pour une valeur vraiment hors bornes, jamais sur 100');
  });
});

/* ------------------------------------------------------------------
   Performance ne dit que ce qu'elle peut prouver
   ------------------------------------------------------------------ */
suite('Une vente datee dans le passe ne prend pas le cours du jour', () => {

  test('la fenetre avertit quand la date recule', () => {
    /* « Si quelqu'un ajoute une vente dans l'app un mois apres, le cours peut
       avoir change. » Il a change, et rien ne le disait : le prix et le taux se
       pre-remplissent au cours du jour, la date se recule librement, et la
       plus-value realisee se calculait alors sur un cours qui n'a jamais ete
       celui de la vente. Un chiffre faux que rien ne trahit — la faute que ce
       projet traque depuis le debut.

       Le mode « vente passee » etait deja a l'abri : il ne demande ni cours ni
       taux, mais le montant encaisse et la plus-value en euros, les deux
       chiffres du releve. C'est le mode normal, avec sa date libre, qui laissait
       passer.

       L'avis pointe et ne bloque pas : c'est peut-etre le bon prix, saisi a la
       main. Il nomme la porte d'a cote, dont les chiffres ne vieillissent pas. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit etre lisible');
    vrai(/id="veVieux" hidden/.test(src),
      'la fenetre de vente porte un avis, muet par defaut');
    const f = src.slice(src.indexOf('const avisCoursDuJour'),
                        src.indexOf('const avisCoursDuJour') + 1200);
    vrai(f.length > 200, 'le controle doit se relire depuis sa source');

    /* Les trois conditions, chacune verifiee : le mode, la date, et le fait que
       le prix soit reste celui qu'on a propose. Sans la premiere, l'avis
       s'afficherait sur une vente passee qui n'utilise aucun cours ; sans la
       troisieme, il crierait sur un prix deja corrige. */
    vrai(/!passee\(\)/.test(f),
      'pas d’avis en mode « vente passee » : elle ne lit aucun cours');
    vrai(/< todayISO\(\)/.test(f),
      'l’avis se declenche sur une date anterieure a aujourd’hui');
    vrai(/Math\.abs\(saisi - auJour\)/.test(f),
      'et il change de texte quand le prix a ete corrige a la main');

    /* Il se rejoue sur la date ET sur le prix : corriger l’un doit pouvoir
       eteindre l’avis, sinon il reste allume sur une saisie devenue juste. */
    vrai(/\$\('#veDate'\)\.oninput = avisCoursDuJour/.test(src),
      'la date rejoue le controle');
    vrai(/majApercuVente\(\); avisCoursDuJour\(\);/.test(src),
      'le prix aussi');
  });
});

suite('Une plus-value en devise dit ce que le courtier dit', () => {

  test('la part du titre ne demande aucun taux de change', () => {
    /* Le courtier convertit ses deux jambes au taux du jour, donc son
       pourcentage est le mouvement du titre dans sa propre monnaie ; cette
       application gele le taux de l'achat, donc le sien porte aussi le change.
       Rien ne disait lequel on lisait.

       Ce que rend cette fonction est exactement ce que le courtier affiche, et il
       ne demande AUCUN taux : le prix de revient se saisit une fois a la creation
       et ne se retouche jamais. */
    const p = { currency: 'USD', qty: 4, buyPrice: 590, price: 546.03, fx: 0.8554, fxBuy: 0.879 };
    pres(posPerfTitre(p), -7.45, 'le titre seul, ce que le courtier annonce');

    /* La preuve que le taux n'entre pas dans ce calcul : on le change du tout au
       tout, le chiffre ne bouge pas d'un centieme. */
    const autre = Object.assign({}, p, { fx: 0.5, fxBuy: 1.4 });
    pres(posPerfTitre(autre), posPerfTitre(p),
      'aucun taux ne doit entrer dans la part du titre');
  });

  test('le total reste en euros, change compris', () => {
    /* Et il DOIT le rester : c'est ce qui est sorti du compte, et le seul chiffre
       qui s'additionne avec le reste du patrimoine. Convertir le prix de revient
       au taux du jour, comme le courtier, ferait bouger le montant investi chaque
       jour sur une ligne qu'on n'a pas touchee — ce que le commentaire de
       `tauxAchat` interdit depuis longtemps. */
    const p = { currency: 'USD', qty: 4, buyPrice: 590, price: 546.03, fx: 0.8554, fxBuy: 0.879 };
    pres(posInvested(p), 2074.44, 'le prix de revient est celui du jour de l’achat');
    pres(posPerfPct(p), -9.937, 'le total porte le change');
    vrai(Math.abs(posPerfPct(p) - posPerfTitre(p)) > 2,
      'le total et la part du titre doivent rester distincts : s’ils se '
      + 'confondaient, le total aurait cessé de compter le change');
  });

  test('rien a decomposer sur une ligne en euros', () => {
    eq(posPerfTitre({ currency: 'EUR', qty: 1, buyPrice: 10, price: 12, fx: 1 }), null,
      'pas de part du titre sur une ligne en euros');
    eq(posPerfTitre({ currency: 'USD', qty: 1, buyPrice: 10, price: 12, fx: 1, manual: true }), null,
      'ni sur une valeur saisie a la main, dont le cours n’est pas le sujet');
  });

  test('la part du change n’existe plus, et c’est voulu', () => {
    /* Elle a vecu une journee. Elle avait besoin du taux du jour de l'achat, que
       rien n'enregistre : `fxBuy` se fige au premier cours connu de la ligne, si
       bien que deux lignes achetees a des mois d'ecart portaient le meme taux. */
    const src = lireSource('assets/app.js');
    vrai(!/dont le change/.test(src),
      'la part du change ne doit pas revenir sans que sa source le permette');
    const store = lireSource('assets/store.js');
    vrai(!/posPerfParts/.test(store) && /function posPerfTitre/.test(store),
      'une seule fonction, et elle ne rend que ce qu’elle peut prouver');
  });
});

suite('La plus-value ne dit que ce qu’elle peut prouver', () => {

  test('un écart ne se calcule pas entre deux périmètres', () => {
    /* La courbe de plus-value latente retranchait un prix de revient de
       portefeuille d'une poche de releve. Les deux ne couvrent pas le meme
       ensemble : la poche « bourse » d'un releve porte la valeur entiere des
       comptes, especes du courtier comprises, quand le prix de revient ne
       couvre que les positions. L'ecart compte donc le cash comme du gain, et
       sur le fixture il le compte a l'euro pres. */
    Fixture.poser();
    const row = Store.state.monthly[0];
    const vrai0 = latentPnl().pnl;
    const faux = rowGroups(row).bourse - portfolioPnl().invested;
    pres(faux - vrai0, Fixture.CASH_A_INVESTIR,
      'le cash qui dort chez le courtier se lisait comme une plus-value');

    /* Le perimetre ne se rattrape pas apres coup : un releve ne dit pas quelle
       part d'un compte etait investie ce mois-la. Le calcul est donc parti, et
       avec lui le champ que plus personne ne lisait. */
    const store = lireSource('assets/store.js');
    const app = lireSource('assets/app.js');
    vrai(store && app, 'les deux sources doivent être lisibles');
    vrai(!/function latentSeries/.test(store),
      'aucun calcul ne mélange plus les deux périmètres');
    vrai(!/latentSeries\(/.test(app), 'et aucun écran ne l’appelle');
    vrai(!/\brow\.inv\s*=/.test(app),
      'plus d’écriture d’un champ que rien ne lit : un champ mort dérive en silence');
  });

  test('un pourcentage n’existe que sur une base positive', () => {
    /* « +0,00 % » s'affichait sur une plage sans une seule vente, ce qui affirme
       une performance nulle la ou il n'y a rien eu. Et `fmtSignedPct` ne peut pas
       s'en apercevoir : elle rend « +0,00 % » pour 0 comme pour null, le signe
       venant d'une comparaison que null passe. C'est donc au calcul de se taire. */
    eq(statsDesVentes([]).pct, null, 'aucune vente, aucune base, aucun pourcentage');

    Fixture.poser();
    declarerVente({ date: '2026-03-01', name: 'Cadeau', gross: 300, realised: 300 });
    const st = salesStats('all');
    pres(st.invested, 0, 'une ligne encaissee sans prix de revient');
    eq(st.pct, null, 'et son pourcentage se tait plutôt que de valoir l’infini');
    pres(st.realised, 300, 'l’euro, lui, reste dit');

    Fixture.poser(s => { for (const p of s.positions) p.buyPrice = 0; });
    const lat = latentPnl();
    pres(lat.invested, 0, 'des lignes sans prix de revient');
    eq(lat.pct, null, 'pas de base, pas de pourcentage');
    vrai(lat.pnl > 0, 'alors que l’écart en euros existe et se dit');
  });

  test('les écrans se taisent avec le calcul', () => {
    /* Une garde dans le calcul ne suffit pas : c'est l'ecran qui imprime. Sept
       surfaces affichaient ce pourcentage, dont deux apercus et un export. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    /* La garde peut tenir sur la meme ligne ou deux lignes plus haut, dans un
       ternaire etale : on la cherche dans ce qui precede immediatement, et sur
       la meme variable — une garde sur `lat` ne protege pas `tout`. */
    const restants = [...src.matchAll(/fmtSignedPct\((lat|tout|pnl|st)\.pct/g)]
      .filter(m => !src.slice(Math.max(0, m.index - 220), m.index)
        .includes(`${m[1]}.pct == null`));
    eq(restants.length, 0,
      `un pourcentage imprimé sans garde : ${restants.map(m => m[0]).join(', ')}`);
    vrai(/st\.pct == null \? null : round2\(st\.pct\)/.test(src),
      'et l’export met une cellule vide, pas un zéro qui se moyennerait');
  });

  test('un seul calcul pour la plus-value du portefeuille', () => {
    /* `portfolioPnl` et `latentPnl` sommaient les memes positions chacun de son
       cote. Deux exemplaires d'une meme somme finissent par dire deux choses :
       celui-ci rendait encore 0 % sur une base nulle quand l'autre se taisait. */
    Fixture.poser();
    const a = portfolioPnl(), b = latentPnl();
    for (const cle of ['value', 'invested', 'pnl']) pres(a[cle], b[cle], `${cle} doit être unique`);
    eq(a.pct, b.pct, 'le pourcentage aussi, y compris quand il est nul');
    const store = lireSource('assets/store.js');
    vrai(/function portfolioPnl\(\) \{ return latentPnl\(\); \}/.test(store),
      'un nom de plus, pas un calcul de plus');
  });

  test('un chiffre de marché dit de quand il date', () => {
    /* La plus-value latente vaut ce que les cours disent, et Performance
       n'affichait aucune heure : « +978 € » sans une date, et « depuis le
       debut » qui ne datait rien non plus. La barre d'etat existait, sur la page
       voisine seulement. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    vrai(/function barreEtatCours\(\)/.test(src),
      'la barre est une fonction : deux exemplaires porteraient deux boutons');
    /* Un seul endroit declare le bouton, deux l'appellent. La verification porte
       sur l'identifiant, qui doit rester unique dans la page rendue. */
    eq((src.match(/id="btnQuotes"/g) || []).length, 1,
      'un seul btnQuotes déclaré, sinon deux nœuds partagent un identifiant');
    /* Deux appels avant, un seul depuis que Performance est partie : la barre
       n'est plus appelee que par Positions. Le compte reste verifie plutot
       qu'efface — c'est lui qui interdit un second exemplaire du bouton. */
    eq((src.match(/barreEtatCours\(\)/g) || []).length, 2,
      'une définition et un appel : Positions');

    /* Le panneau du total date chacune de ses deux parts, par ce qui la fixe. */
    const totale = src.slice(src.indexOf('perfTotale: ()'), src.indexOf('perfTotale: ()') + 1400);
    vrai(/fmtCoursQuand\(coursAsOf\(\)\)/.test(totale),
      'le latent porte l’heure du cours, celle de la place et non de la requête');
    vrai(/fmtDate\(jours\[0\]\)/.test(totale) && /jours\[jours\.length - 1\]/.test(totale),
      'l’encaissé porte les bornes de ses ventes, prises au journal');
  });

  test('chaque vente s’ouvre, et son détail porte ce que les tuiles disaient', () => {
    /* Trois tuiles annoncaient le produit encaisse, le prix de revient cede et le
       taux de reussite : trois totaux de page pour des faits qui appartiennent a
       chaque vente, et dont deux se relisaient en tete de page. Elles sont parties,
       le detail de la vente les porte, et le tableau de dix colonnes est devenu la
       liste cliquable que la regle de la maison impose au-dela de trois. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const bloc = src.match(/function salesCard\(\) \{[\s\S]*?\n\}/)[0];
    vrai(/ligneListe\(\{/.test(bloc) && /action: 'open-sale'/.test(bloc),
      'chaque vente est une ligne cliquable, le nom lu est le bouton cliqué');
    /* `.liste-mobile` est le repli d'une grille : elle est en `display: none`
       au-dela de 768 px. Une liste qui remplace un tableau au lieu de le doubler
       doit porter `.liste-principale`, sinon elle est invisible sur un ecran
       large — le depliant s'ouvrait sur du vide, et rien dans le balisage ne le
       disait. */
    vrai(/class="liste-principale"/.test(bloc) && !/class="liste-mobile"/.test(bloc),
      'la liste est la lecture principale, pas le repli d’une grille qui n’existe plus');
    const css = lireSource('assets/styles.css');
    vrai(/\.liste-principale \{ display: block; \}/.test(css),
      'et cette classe s’affiche à toutes les largeurs');
    vrai(!/liste-releves/.test(css) && !/liste-releves/.test(src),
      'un seul nom pour cette idée : celui qui nommait la première carte a été généralisé');
    vrai(!/<table>/.test(bloc),
      'plus de tableau de dix colonnes, qui débordait latéralement sous 768 px');
    vrai(!/Produit des ventes|Prix de revient vendu', st\.invested|Ventes gagnantes/.test(bloc),
      'ni les trois tuiles, dont deux redisaient la tête de page');
    vrai(!/data-action="del-sale"/.test(bloc),
      'l’annulation quitte la liste : un geste irréversible collé au geste de lecture');

    /* Deux lectures du journal, et le tri par montant est signe : la plus grosse
       plus-value en tete, les pertes en queue. Trier sur la valeur absolue aurait
       mis la pire perte au sommet du classement des gains. */
    vrai(/data-action="tri-ventes" data-tri="date"/.test(bloc)
      && /data-action="tri-ventes" data-tri="montant"/.test(bloc),
      'le journal se lit par date ou par montant');
    vrai(/sort\(\(a, b\) => num\(b\.realised\) - num\(a\.realised\)\)/.test(bloc),
      'et le tri par montant est signé, du plus gros gain à la pire perte');
    vrai(/let triVentes = 'date';/.test(src),
      'la date reste le défaut : un journal est un récit avant d’être un classement');

    const ap = src.slice(src.indexOf('vente: (i) =>'), src.indexOf('vente: (i) =>') + 2200);
    vrai(ap.length > 500, 'l’aperçu d’une vente doit être trouvable');
    for (const champ of ['Produit encaissé', 'Prix de revient vendu', 'Plus-value']) {
      vrai(ap.includes(champ), `le détail porte « ${champ} », que la tuile disait pour la page`);
    }
    vrai(/data-action="del-sale" data-i="\$\{idx\}"/.test(ap),
      'et l’annulation, là où le geste a la place de dire ce qu’il emporte');
    vrai(!/ventesRealisees/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
      'l’aperçu de la tuile disparue est parti avec elle : une fonction sans appelant '
      + 'est la moitié qu’on oublie');

    /* Un panneau ne survit pas a ce qu'il decrit : il porte le bouton qui retire
       la vente, et son rafraichissement sortirait en silence faute de la
       retrouver — donc un ecran fige sur des montants qui n'existent plus. */
    /* Modifier une vente : la frontiere est celle des consequences. Date, nom et
       note ne touchent a rien d'autre. Les montants d'une vraie vente ont credite
       un compte et reduit une ligne : les corriger apres coup ferait dire au
       journal 900 EUR quand 944 sont arrives, sans que rien ne le signale. */
    const ed = src.slice(src.indexOf("async 'edit-sale'"), src.indexOf("async 'edit-sale'") + 3000);
    vrai(ed.length > 500, 'l’édition d’une vente doit être trouvable');
    for (const champ of ['date', 'name', 'note']) {
      vrai(new RegExp(`cle: '${champ}'`).test(ed), `« ${champ} » se modifie sur toute vente`);
    }
    vrai(/\.\.\.\(v\.declaree \? \[/.test(ed),
      'les montants ne s’offrent que sur une vente déclarée, qui n’a rien écrit d’autre');
    vrai(/lecture: true/.test(ed),
      'et sur une vraie vente ils s’affichent en lecture, pas en champ grisé');
    vrai(/annuler cette vente, puis la ressaisir/.test(ed),
      'la fenêtre dit le chemin exact au lieu de laisser chercher');
    vrai(/if \(v\.declaree\) \{[\s\S]{0,400}?v\.invested = round2\(v\.gross - v\.realised\)/.test(ed),
      'le prix de revient se dérive : trois champs pour deux libertés se contrediraient');

    vrai(/function fermerApercuSi\(cle\)/.test(src), 'la fermeture existe');
    eq((src.match(/fermerApercuSi\('vente'\)/g) || []).length, 2,
      'et elle est appelée dans les deux branches de del-sale, déclarée comme annulée');
  });

  
  
  
  
  test('la carte du journal n’a plus de phrase hors traduction', () => {
    /* La reserve fiscale etait posee sans `trad()` : elle s'affichait en francais
       dans les deux langues, et le rattrapage de traduction ne pouvait pas la
       voir, faute d'appel a chercher. C'etait la derniere de cette carte.

       Le controle porte sur la carte entiere plutot que sur cette phrase : toute
       ligne de texte affiche qui porte un accent doit passer par `trad()`, sans
       quoi la suivante repassera par le meme trou. */
    const src = lireSource('assets/app.js');
    const carte = src.match(/function salesCard\(\) \{[\s\S]*?\n\}/)[0];
    const nu = carte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    const dehors = nu.split('\n').filter(l =>
      /[àâéèêëîïôùûç]/i.test(l) && !/trad\(/.test(l) && !/^\s*\+ '/.test(l));
    eq(dehors.join(' | ').trim(), '',
      'ces lignes affichent du français sans passer par trad()');
    vrai(I18N.en['Résultat brut, avant frais et fiscalité : le traitement fiscal dépend de '
      + 'l’enveloppe (PEA, CTO) et de ta situation.'],
      'et la réserve fiscale a son anglais');

    /* « 7 ventes sur 11 » compte une part d'un ensemble : « of ». La clef
       `sur.investis` rend « on », juste devant un montant investi, et le journal
       affichait « 7 sales on 11 ». Un homographe, une clef par sens. */
    vrai(/trad\('sur\.total', 'sur'\)/.test(carte),
      'le « sur » du décompte a sa propre clef');
    eq(I18N.en['sur.total'], 'of', 'qui rend « of » et non « on »');
    eq(I18N.en['sur.investis'], 'on', 'l’autre sens reste intact');
  });

  test('les libellés nouveaux ont leur anglais, les anciens sont partis', () => {
    for (const cle of ['Résultat de tes positions', 'latente et encaissée, depuis le début',
                       'Aller à Positions', 'prix de revient non renseigné',
                       'vente gagnante', 'vente gagnante sur', 'ligne détenue',
                       'aucune ligne détenue',
                       'Une plus-value se mesure sur des lignes que tu détiens : la latente vient '
                       + 'de leur prix de revient, l’encaissée du journal de tes ventes. Pose une '
                       + 'première ligne et cette page se remplit toute seule.']) {
      vrai(I18N.en[cle], `« ${cle} » doit avoir son anglais`);
    }
    for (const morte of ['Lignes en gain', 'Résultat total', 'Plus-value latente dans le temps',
                         'latente + réalisée depuis le début']) {
      vrai(!I18N.en[morte], `« ${morte} » ne s’affiche plus : sa clé n’a plus à vivre`);
    }
  });
});

/* ------------------------------------------------------------------
   Une categorie porte un total, et rien d'autre
   ------------------------------------------------------------------ */
suite('Une catégorie porte un total, et rien d’autre', () => {

  test('le détail par catégorie est parti, code et données', () => {
    const app = lireSource('assets/app.js');
    const store = lireSource('assets/store.js');
    const css = lireSource('assets/styles.css');
    vrai(app && store && css, 'les trois sources doivent être lisibles');

    /* Le detail vivait dans `d`, a cote du total : deux surfaces d'edition pour
       une seule valeur, et tout le mal venait de les reconcilier. Retaper le total
       effacait les libelles, le champ principal ne pouvait etre a la fois un total
       et une porte, et la somme tapee au clavier n'existait pas sur un pave
       numerique. Qui veut suivre deux choses separement fait deux categories. */
    for (const mort of ['recalerDetail', 'setExpenseDetail', 'clearExpenseDetail',
                        'expenseDetail', 'libellesConnus']) {
      eq(store.split(mort).length - 1, 0, `${mort} est parti de store.js`);
    }
    for (const mort of ['majPastille', 'rendreDetail', 'ajouterLigne', 'majPorte',
                        'NOM_DETAIL_MAX', 'sheetExpenseDetail', 'aDuDetailDepenses']) {
      eq(app.split(mort).length - 1, 0, `${mort} est parti d’app.js`);
    }
    for (const mort of ['dep-dl', 'dep-detail', 'dep-plus', 'dep-chev', 'champ-porte']) {
      eq(css.split(mort).length - 1, 0, `la classe ${mort} est partie du CSS`);
    }
  });

  test('la purge du champ est jouée une fois, et deux fois donne le même état', () => {
    /* Un champ que plus aucun ecran ne lit deviendrait invisible sans disparaitre,
       et il sortirait encore dans les sauvegardes. La migration l'efface, et la
       rejouer ne change rien — c'est la regle de toutes les migrations ici. */
    Fixture.poser(s => {
      s.budget.expenses[0].d = { Courses: [{ montant: 10, libelle: 'Marché' }, { montant: 20, libelle: '' }] };
      delete s.meta.detailRetire;
    });
    Store.migrate();
    eq(Store.state.budget.expenses[0].d, undefined, 'le champ est effacé');
    eq(Store.state.meta.detailRetire, true, 'et la migration se marque');
    const apres = JSON.stringify(Store.state.budget.expenses);
    Store.migrate();
    eq(JSON.stringify(Store.state.budget.expenses), apres, 'la rejouer ne change rien');
    /* Le total du mois, lui, n'a pas bouge : `v` a toujours ete la seule verite,
       et c'est ce qui rend cette suppression sans consequence sur les chiffres. */
    Fixture.poser();
    const avant = expenseRowTotal(Store.state.budget.expenses[0]);
    Store.migrate();
    pres(expenseRowTotal(Store.state.budget.expenses[0]), avant,
      'et aucun total de mois ne change');
  });

  test('le champ accepte une somme, et le « + » l’écrit', () => {
    /* La somme tapee reste, elle : c'est desormais le seul moyen de mettre deux
       depenses dans une categorie, et le pave numerique d'un telephone n'a pas la
       touche. Le bouton est le seul « + » de la fenetre, donc sans ambiguite. */
    pres(parseSomme('100+50+70')?.total, 220, 'trois termes font leur somme');
    eq(parseSomme('157+'), null, 'une somme inachevée reste invalide');

    const app = lireSource('assets/app.js');
    const corps = app.slice(app.indexOf('function askExpenseMonth'), app.indexOf('id="depNote"'));
    /* Le compte se fait sur `champSomme`, pas sur le corps de la fenetre. Le
       premier exemplaire de ce controle comptait « >+< » dans la fenetre et
       trouvait 1 : c'etait le « + » en gras du paragraphe d'aide, le bouton etant
       ecrit ailleurs. Il serait passe au vert sans aucun bouton. */
    const cs = app.slice(app.indexOf('function champSomme'), app.indexOf('function insererPlus'));
    eq((cs.match(/>\+</g) || []).length, 1, 'le champ porte un « + », et un seul');
    eq((corps.match(/champSomme\(/g) || []).length, 1,
      'posé une seule fois, sur le champ de montant');
    eq((corps.match(/>\+</g) || []).length, 0,
      'et la fenêtre n’en décore aucun autre : deux « + » de sens différents ne se distinguaient par rien');
    vrai(/champSomme\(`<input type="text" inputmode="decimal" data-cat=/.test(corps),
      'il est dans le champ, là où la place est libre à gauche des montants');
    const f = app.slice(app.indexOf('function insererPlus'), app.indexOf('function cablerSommePlus'));
    vrai(/champ\.value = `\$\{texte\}\+`;/.test(f), 'il s’ajoute à la suite');
    /* La garde s'ecrit avec un antislash, donc ce controle aussi : un document en
       ligne en mange un niveau, et l'assertion cherchait un chiffre la ou la source
       porte « \d ». Elle passait a cote sans rien dire de faux. */
    vrai(f.includes("if (!/\\d$/.test(texte)) { champ.focus(); return; }"),
      'jamais sur un champ vide ni deux fois de suite');
    vrai(/b\.onmousedown = e => e\.preventDefault\(\);/.test(app),
      'et il ne prend pas le focus, sinon le champ entier se resélectionne');

    /* L'aide dit un geste possible sur telephone, ce qui n'etait plus vrai entre
       le retrait du bouton et son retour. Elle se replie dans un « ? » : quatre
       lignes de texte occupaient le tiers d'un ecran de telephone et repoussaient
       le champ de note hors du cadre, pour une phrase qu'on lit une fois. */
    eq((corps.match(/class="hint"/g) || []).length, 0,
      'aucun pavé de texte dans la fenêtre');
    vrai(/\$\{aide\(trad\('Plusieurs dépenses dans une catégorie/.test(corps),
      'l’explication est une bulle, à côté du geste qu’elle concerne');
    /* La phrase est coupee sur trois lignes dans la source : on cherche un fragment
       qui tient d'un seul tenant, pas la phrase entiere. */
    vrai(/du champ écrit le signe, que le pavé /.test(corps),
      'l’aide nomme le bouton et dit pourquoi il existe');
    vrai(/fais deux catégories/.test(corps),
      'et donne la sortie pour qui veut vraiment séparer deux choses');
  });
});

suite('Un mois se corrige au doigt, ou dans un tableau', () => {

  test('la paire de boutons passe à la ligne d’un seul bloc', () => {
    /* En-tete de carte souple, les deux boutons tombaient un par un : « + Rentree »
       restait en haut a droite contre le selecteur d'annee, « + Depense » descendait
       seul a gauche sous le sous-titre. Deux entrees de la meme paire lues comme
       deux commandes sans rapport. Un seul element de flex, donc un seul point de
       rupture. */
    const src = lireSource('assets/app.js');
    const css = lireSource('assets/styles.css');
    /* Il en reste une, celle du journal des apports : les deux entrees du journal
       des ventes ont fusionne en un seul bouton, la nature se choisissant dans le
       menu de la fenetre. La regle vaut pour toute paire, pas pour celle-la :
       chacune porte exactement deux boutons — trois ne seraient plus une paire, et
       la grille leur donnerait trois colonnes. */
    const paires = [...src.matchAll(/class="paire-btn">([\s\S]*?)<\/span>/g)].map(m => m[1]);
    vrai(paires.length >= 1, `au moins une paire doit être trouvable, ${paires.length} trouvée(s)`);
    paires.forEach((p, n) => {
      eq((p.match(/<button/g) || []).length, 2,
        `la paire ${n + 1} porte deux boutons, et ils sont dans le même élément`);
    });
    const regle = (css.match(/\.paire-btn \{[^}]*\}/) || [''])[0];
    vrai(/display: grid/.test(regle),
      'la paire est une grille : en flex, la longueur du libellé décidait de la largeur');
    vrai(/grid-auto-flow: column/.test(regle), 'ses boutons se suivent en colonnes');
    vrai(/grid-auto-columns: 1fr/.test(regle),
      'de largeur égale, celle du libellé le plus long');
    vrai(!/wrap/.test(regle),
      'et rien n’y passe à la ligne : c’est tout le point de la mettre ensemble');
  });

  test('un tableau défile en largeur, jamais en hauteur', () => {
    /* Le detail mensuel enfermait douze mois dans 60 vh : sur un ecran de 900 px,
       on faisait defiler un tableau a l'interieur d'une page qui defile deja, et la
       barre du conteneur se confondait avec celle du navigateur. La largeur garde
       son defilement — onze categories ne rentrent dans aucun ecran — la hauteur
       n'a que le nombre de mois, et le selecteur d'annee la borne. */
    const src = lireSource('assets/app.js');
    const i = src.indexOf('<div class="table-wrap large-seulement"');
    vrai(i > 0, 'le conteneur du détail mensuel doit être trouvable');
    const balise = src.slice(i, src.indexOf('>', i) + 1);
    vrai(!/max-height/.test(balise),
      'aucun plafond de hauteur : le tableau s’affiche en entier');
    vrai(!/overflow-y/.test(balise),
      'et aucun défilement vertical posé à la main');
    /* Ancre en debut de ligne : `.table-wrap` apparait aussi au milieu d'un
       selecteur groupe, `.grid > *, .card, .table-wrap { min-width: 0 }`, et la
       recherche tombait dessus — une regle vraie, mais pas celle qu'on verifie. */
    const css = lireSource('assets/styles.css');
    const regle = (css.match(/^\.table-wrap \{[^}]*\}/m) || [''])[0];
    vrai(/overflow-x: auto/.test(regle),
      `la largeur, elle, garde le sien ; règle lue : « ${regle || 'aucune'} »`);
  });

  test('le tableau de correction ne se propose plus sous 767 px', () => {
    /* Quinze colonnes dans un conteneur qui defile, quand la liste juste au-dessus
       ouvre le meme mois dans une fenetre qui tient dans l'ecran : deux surfaces
       pour la meme saisie, dont une inutilisable au doigt. */
    const src = lireSource('assets/app.js');
    const i = src.indexOf("trad('Corriger mois par mois");
    vrai(i > 0, 'le dépliant existe');
    const ouverture = src.lastIndexOf('<details', i);
    vrai(/large-seulement/.test(src.slice(ouverture, i)),
      'le dépliant est réservé aux grands écrans');
  });

  test('rien ne devient inatteignable : la fenêtre du mois efface aussi', () => {
    /* Le tableau portait le seul ✕ de l'application sur un releve. Le cacher sans
       rendre le geste ailleurs aurait retire d'un telephone la seule facon d'effacer
       un mois saisi par erreur. */
    const src = lireSource('assets/app.js');
    vrai(/id="relVider"/.test(src), 'la fenêtre porte le bouton');
    vrai(/\$\('#relVider'\)\.onclick/.test(src), 'et il est câblé');
    vrai(/class="fiche-danger"[\s\S]{0,200}id="relVider"/.test(src),
      'en bas, à part et rouge, comme sur la fiche d’une ligne');

    /* La question se regle a un seul endroit : deux portes, un seul texte. */
    eq((src.match(/trad\('Effacer les montants de \{m\} \?'\)/g) || []).length, 1,
      'la question ne s’écrit qu’une fois');
    const j = src.indexOf("async 'del-month'(btn)");
    const action = src.slice(j, src.indexOf('},', j));
    vrai(/viderOuSupprimerMois/.test(action), 'le ✕ du tableau appelle la même fonction');
    vrai(!/askConfirm/.test(action), 'et ne repose pas la question à sa façon');
  });

  test('« Ligne supprimée » ne dit pas « Holding deleted » pour un mois', () => {
    /* La clef-phrase etait deja prise par le portefeuille, ou une ligne est une
       position. Reutiliser la clef aurait fait dire « Holding deleted » a la
       suppression d'un releve ; changer sa traduction aurait casse l'autre. */
    enLangue('en', () => {
      eq(trad('releve.ligneSupprimee', 'Ligne supprimée'), 'Row deleted',
        'un relevé supprimé est une ligne, pas une position');
      eq(trad('releve.supprimerLigne', 'Supprimer cette ligne'), 'Delete this row',
        'et le bouton de même');
      eq(trad('Ligne supprimée'), 'Holding deleted',
        'la clef du portefeuille garde son sens');
    });
    enLangue('fr', () => eq(trad('releve.ligneSupprimee', 'Ligne supprimée'), 'Ligne supprimée',
      'et le français passe par le repli'));
  });
});

suite('Les fiches et les marchés parlent anglais en anglais', () => {

  /* Le releve de la panne : sur une application chargee en anglais, une fiche de
     compte disait « Compte courant », « Financement », « facultatif », et la page
     des marches « cours from yesterday at 22:00 » — la moitie francaise d'une
     phrase dont l'autre moitie etait traduite. Trois familles de causes, et une
     seule mesure honnete : lire le DOM d'une page vraiment chargee en anglais.
     Ce qui suit garde les trois portes fermees. */

  test('aucun attribut affiché ne porte du français en dur', () => {
    /* Un `title` ou un `aria-label` ecrit en clair dans le balisage ne passe par
       aucune fonction : il n'a aucune chance d'etre traduit un jour. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    const nu = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    const fautes = [...nu.matchAll(/\b(placeholder|title|aria-label)="([^"${}<>]*[àâäéèêëîïôöùûüçœ][^"${}<>]*)"/g)]
      .map(m => `${m[1]}="${m[2]}"`);
    eq(fautes.join(' | '), '', 'ces attributs ne passeront jamais par trad()');
  });

  test('une bulle d’aide reçoit une phrase traduite, jamais une chaîne nue', () => {
    /* `aide()` pose son texte dans un attribut : elle ne traduit pas, elle
       transporte. Deux bulles longues sont restees francaises par ce chemin. */
    const src = lireSource('assets/app.js');
    const nu = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const nues = [...nu.matchAll(/\baide\(\s*['"]([^'"]{6,})/g)].map(m => m[1].slice(0, 45));
    eq(nues.join(' | '), '', 'aide() reçoit une chaîne nue : elle restera française');
  });

  test('les libellés statiques d’index.html ont tous leur anglais', () => {
    /* Douze titres et intitules vivaient dans le balisage statique, hors
       d'atteinte de `trad()`. `translateStatic()` les traduit desormais par leur
       valeur : le francais qui s'y trouve EST la clef, donc chacun doit en avoir
       une, sans quoi la traduction est un silence. */
    const html = lireSource('index.html');
    vrai(html, 'index.html doit être lisible pour ce contrôle');
    const corps = html.replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script[\s\S]*?<\/script>/g, ' ');
    const sans = [...corps.matchAll(/\b(title|aria-label|placeholder)="([^"]+)"/g)]
      .map(m => m[2])
      .filter(v => /[A-Za-zÀ-ÿ]{4}/.test(v) && !I18N.en[v]);
    eq([...new Set(sans)].join(' | '), '',
      'ces attributs statiques n’ont pas de traduction anglaise');
    vrai(/for \(const a of ATTRS_TRADUITS\)/.test(lireSource('assets/i18n.js')),
      'et translateStatic() parcourt bien les attributs');
  });

  test('l’ancienneté d’un cours se dit dans les deux langues', () => {
    /* Le nombre se place par gabarit : l'anglais met l'anciennete apres la
       duree, « 5 min ago », et deux fragments cousus dans l'ordre francais
       donneraient « ago 5 min ». */
    /* `fmtWhen()` vit dans app.js, que cette page ne charge pas : on lit son
       câblage dans la source et son vocabulaire dans le dictionnaire, et on
       compose comme elle le fait. */
    const src = lireSource('assets/app.js');
    const f = src.slice(src.indexOf('function fmtWhen'), src.indexOf('function fmtWhen') + 800);
    vrai(/return trad\('jamais'\)/.test(f), 'sans date, une phrase traduite');
    vrai(/trad\("à l'instant"\)/.test(f), 'et à l’instant aussi');
    vrai(/trad\('il y a \{n\} min'\)\.replace\('\{n\}', mins\)/.test(f),
      'les minutes passent par un gabarit, pas par une concaténation');
    enLangue('fr', () => {
      eq(trad('jamais'), 'jamais', 'le français passe par le repli');
      eq(trad('il y a {n} min').replace('{n}', 5), 'il y a 5 min', 'et l’ordre français');
    });
    enLangue('en', () => {
      eq(trad('jamais'), 'never', 'sans date, never');
      eq(trad('il y a {n} min').replace('{n}', 5), '5 min ago',
        'et l’ordre anglais, pas « ago 5 min »');
    });
  });

  test('le compte des lignes non cotées s’accorde, dans les deux langues', () => {
    /* Le francais a deux formes, « une ligne n'a pas cote » et « deux lignes
       n'ont pas cote », l'anglais une seule : le pluriel se choisit avant la
       traduction, jamais en cousant un « s » a la sortie. */
    for (const cle of ['{n} ligne sur {t} n’a pas encore coté aujourd’hui',
                       '{n} lignes sur {t} n’ont pas encore coté aujourd’hui']) {
      enLangue('en', () => {
        const dit = trad(cle);
        vrai(dit !== cle, `« ${cle.slice(0, 20)}… » a son anglais`);
        vrai(dit.includes('{n}') && dit.includes('{t}'),
          'et garde ses deux nombres, sinon le compte disparaît');
      });
    }
  });

  test('le préfixe d’un cours et l’heure qu’il porte parlent la même langue', () => {
    /* La faute d'origine, et la plus visible : « cours » en dur devant une heure
       que `fmtCoursQuand()` rendait deja en anglais. */
    const src = lireSource('assets/app.js');
    eq((src.match(/`cours \$\{/g) || []).length, 0, 'plus un seul préfixe « cours » en dur');
    enLangue('en', () => eq(trad('cours'), 'price', 'et le mot a son anglais'));
  });
});

suite('Aucun dialogue ne parle français en dur', () => {

  /* Un dialogue non traduit est un consentement qu'on n'a pas vraiment obtenu :
     c'est le moment ou l'on s'apprete a supprimer quelque chose, et ou il faut
     comprendre ce qui est demande. Vingt-huit confirmations et neuf avis etaient
     dans ce cas.

     Le controle se fait sur les appels, pas sur des mots-clefs : on isole
     l'argument par appariement de parentheses, on neutralise les `trad()` qui s'y
     trouvent, et ce qui reste ne doit plus porter d'accent. */

  const finAppel = (s, i) => {
    let prof = 0, chaine = null;
    while (i < s.length) {
      const c = s[i];
      if (chaine) {
        if (c === '\\') { i += 2; continue; }
        if (c === chaine) chaine = null;
        i++; continue;
      }
      if (c === '\'' || c === '"' || c === '`') chaine = c;
      else if (c === '(') prof++;
      else if (c === ')') { prof--; if (!prof) return i + 1; }
      i++;
    }
    return -1;
  };
  /* Un accent, et non l'apostrophe typographique : l'anglais de cette
     application ecrit « yesterday’s » avec la meme. Ni le ×, qui vit dans
     « quantity × price ». */
  const ACCENT = /[àâäéèêëîïôöùûüÿçœÀÂÄÉÈÊËÎÏÔÖÙÛÜÇŒ]/;

  const neutraliserTrad = (bloc) => {
    for (let tour = 0; tour < 6; tour++) {
      let change = false;
      const re = /\b(?:trad|t)\(/g;
      let m;
      while ((m = re.exec(bloc))) {
        const j = finAppel(bloc, m.index + m[0].length - 1);
        if (j < 0) continue;
        const dedans = bloc.slice(m.index, j);
        if (!ACCENT.test(dedans)) continue;
        bloc = bloc.slice(0, m.index) + ' '.repeat(j - m.index) + bloc.slice(j);
        change = true;
        re.lastIndex = 0;
      }
      if (!change) break;
    }
    return bloc;
  };

  const appelsFautifs = (src, nom) => {
    const out = [];
    let i = 0;
    while ((i = src.indexOf(nom + '(', i)) >= 0) {
      if (/[\w.$]/.test(src[i - 1] || ' ')) { i += nom.length + 1; continue; }
      const j = finAppel(src, i + nom.length);
      if (j < 0) break;
      const bloc = src.slice(i, j);
      /* Les interpolations sont des expressions, pas du texte. Et l'objet
         d'options en fin d'appel non plus : `askConfirm` traduit lui-meme les
         libelles `ok` et `refus`, donc leur français y est la clef. */
      const reste = neutraliserTrad(bloc)
        .replace(/\$\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, ' ')
        .replace(/,\s*\{[^{}]*\}\s*\)$/, ')');
      if (ACCENT.test(reste)) out.push(bloc.slice(0, 120).replace(/\s+/g, ' '));
      i = j;
    }
    return out;
  };

  test('chaque confirmation et chaque avis passent par trad()', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    for (const nom of ['askConfirm', 'toast']) {
      const fautifs = appelsFautifs(src, nom);
      eq(fautifs.join('\n  '), '', `${nom}() reçoit du français en dur`);
    }
  });

  test('la fenêtre à un champ traduit ses trois textes, une fois pour toutes', () => {
    /* `askText` recevait titre, message et exemple en français de dix appelants :
       traduire chez l'appelant demandait d'y penser dix fois. */
    const src = lireSource('assets/app.js');
    const f = src.slice(src.indexOf('function askText'), src.indexOf('function askForm'));
    vrai(/\$\('#modalTitle'\)\.textContent = trad\(titre\)/.test(f), 'le titre');
    vrai(/message \? trad\(message\) : ''/.test(f), 'le message');
    vrai(/placeholder="\$\{esc\(trad\(exemple\)\)\}"/.test(f), 'et l’exemple');
    const g = src.slice(src.indexOf('function askForm'), src.indexOf('function askForm') + 1200);
    vrai(/\$\('#modalTitle'\)\.textContent = trad\(titre\)/.test(g),
      'et la fenêtre à plusieurs champs traduit le sien');
  });

  test('un nombre entre dans une phrase par gabarit, pas par couture', () => {
    /* « il y a 5 min » et « 5 min ago » n'ont pas le meme ordre : coudre les
       fragments dans l'ordre francais donnerait « ago 5 min ». Les clefs a
       gabarit portent {n}, {m}, {v}, {d}, {t}, {p}, {c}, {ou} ou {types}, et
       leur anglais doit garder le meme. */
    const trous = /\{(?:n|m|v|d|t|p|c|ou|types)\}/g;
    const fautes = [];
    for (const [fr, en] of Object.entries(I18N.en)) {
      /* Une clef pointee n'est pas une phrase : son français vit dans `FR`, et
         comparer les gabarits de la clef a ceux de sa traduction n'a pas de sens. */
      if (/^[\w.]+$/.test(fr)) continue;
      const dans = (String(fr).match(trous) || []).sort().join('');
      const sort = (String(en).match(trous) || []).sort().join('');
      if (dans !== sort) fautes.push(`${fr.slice(0, 40)} → ${en.slice(0, 40)}`);
    }
    eq(fautes.join(' | '), '', 'un gabarit perdu en traduction fait disparaître un nombre');
  });
});

/* ------------------------------------------------------------------
   L'ordre des cartes d'un écran. Il ne se voit pas dans un calcul et
   aucun rendu ne le signale : un bloc déplacé à la main se remet en
   place au prochain coup d'éditeur, sans que rien ne casse.
   ------------------------------------------------------------------ */
suite('Une page s’ouvre sur son sujet, et se corrige à la fin', () => {

  const positions = (src, ...reperes) => reperes.map(r => src.indexOf(r));
  const croissant = (l) => l.every((n, i) => n > 0 && (i === 0 || n > l[i - 1]));

  test('Dépenses : lire d’abord, corriger ensuite', () => {
    /* Le tableau de correction, 880 px, s'intercalait entre la repartition, le
       graphique des mois et les categories : on traversait l'outil de saisie pour
       atteindre la lecture. C'est l'argument qui a deja range l'onglet voisin. */
    const src = lireSource('assets/app.js');
    const vue = src.slice(src.indexOf('function viewBudget('), src.indexOf('function viewData('));
    const l = positions(vue,
      "trad('Où va ce que tu gagnes')",
      "trad('Dépenses mensuelles')",
      "trad('Par catégorie')",
      'data-anchor="detail-mensuel"');
    vrai(croissant(l), `l’ordre attendu est répartition, graphique, catégories, détail : ${l.join(' < ')}`);
  });

  test('Données : le diagnostic ensemble, la destruction en dernier', () => {
    /* « État » fermait la page, coince entre les sauvegardes et la remise a zero :
       un encart de lecture au milieu de deux actes, alors qu'il repond a la meme
       question que les controles de coherence — comment va l'application. */
    const src = lireSource('assets/app.js');
    const vue = src.slice(src.indexOf('function viewData('), src.indexOf('function mountData('));
    const l = positions(vue,
      "trad('Contrôles de cohérence')",
      "trad('État')",
      "trad('Exporter')",
      'data-action="start-blank"');
    vrai(croissant(l),
      `l’ordre attendu est contrôles, état, transferts… puis la remise à zéro : ${l.join(' < ')}`);
  });

  test('Relevés : le calendrier qu’on vient remplir ouvre la page', () => {
    const src = lireSource('assets/app.js');
    const vue = src.slice(src.indexOf('function viewHistory('), src.indexOf('function viewAccounts('));
    const l = positions(vue,
      "trad('Relevé mensuel du patrimoine')",
      "trad('Entrées et sorties exceptionnelles')",
      "trad('Notes de marché')");
    vrai(croissant(l), `l’ordre attendu est relevé, apports, notes : ${l.join(' < ')}`);
  });
});

suite('Les boutons d’une fiche ont une géométrie et une place', () => {

  /* Le signalement tenait en une phrase : « il y a pas un bouton pareil ». La
     carte « Actions » portait quatre boutons en deux rangees, deux qui validaient
     la visite entiere et deux qui decidaient de la vie du compte, au meme poids
     visuel sous un titre qui ne decrivait ni l'un ni l'autre. Un en-tete melangeait
     un lien souligne et des boutons. Et a 375 px un bouton qui passait a la ligne
     partait a gauche pendant que son voisin restait a droite.

     Trois regles en sortent, et ce sont elles que ces controles gardent. */

  test('la validation ferme la carte des champs, et rien d’autre', () => {
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible pour ce contrôle');
    /* Rassembles avec Archiver et Cloturer-supprimer, les quatre boutons formaient
       un mur : quatre rectangles de meme taille sous un seul titre, sans ordre de
       lecture. La validation appartient au formulaire qu'elle valide. */
    const barre = src.slice(src.indexOf('function barreValiderFiche'),
                            src.indexOf('function barreValiderFiche') + 700);
    vrai(/<div class="fiche-actes apres-champs">/.test(barre),
      'elle porte la géométrie commune, et le filet qui la sépare des champs');
    vrai(!/class="card"/.test(barre), 'et ne fabrique pas sa propre carte');
    /* Dans la fiche d'un compte, elle suit le champ des notes et reste dans la
       carte : la balise de fermeture vient apres elle. */
    vrai(/data-path="comptes\.\$\{idx\}\.notes"[\s\S]{0,220}\$\{barreValiderFiche\(\)\}[\s\S]{0,12}<\/div>/.test(src),
      'dans la fiche d’un compte, au bas de la carte « Informations »');
    /* La fiche d'un etablissement n'a pas de carte « Actions » : rien ne s'y
       archive. Sa carte de champs est celle des notes. */
    vrai(/data-path="etabs\.\$\{idx\}\.notes"[\s\S]{0,220}\$\{barreValiderFiche\(\)\}[\s\S]{0,12}<\/div>/.test(src),
      'et dans celle d’un établissement, au bas de la carte « Notes »');
    /* La carte « Actions » ne garde que la vie du compte, et son titre le dit. */
    const i = src.indexOf("trad('actions.fiche', 'Actions')");
    const carte = src.slice(i, i + 1400);
    vrai(/data-action="(archiver|restaurer)-compte"/.test(carte), 'archiver y reste');
    vrai(/data-action="supprimer-compte"/.test(carte), 'supprimer aussi');
    vrai(!/enregistrer-fiche|annuler-fiche|barreValiderFiche/.test(carte),
      'mais pas la validation : quatre boutons de même taille sous un seul titre '
      + 'ne se lisent plus dans aucun ordre');
  });

  test('la validation vient avant ce qui détruit, et c’est une règle de pouce', () => {
    /* Les cartes se suivent : le doigt descendrait sur « Clôturer et supprimer »
       pour atteindre « Enregistrer ». */
    const src = lireSource('assets/app.js');
    const iBarre = src.indexOf('${barreValiderFiche()}');
    const iActions = src.indexOf("trad('actions.fiche', 'Actions')");
    vrai(iBarre > 0 && iActions > 0, 'les deux blocs doivent être trouvables');
    vrai(iBarre < iActions,
      'la validation se rend avant la carte qui décide de la vie du compte');
  });

  test('un en-tête de carte ne mélange pas un lien et des boutons', () => {
    const src = lireSource('assets/app.js');
    const css = lireSource('assets/styles.css');
    /* Le renvoi vers Marches etait un lien souligne au milieu de boutons. Il
       n'est plus un renvoi du tout : la fiche porte le geste, un bouton qui
       ouvre la recherche en visant ce compte. Une page qui doit donner
       l'itineraire vers son propre geste dit que le geste est mal place, et
       habiller le lien en bouton ne reglait que la geometrie. */
    vrai(!/<a class="hint lien-vue" href="#\/positions">\$\{trad\('Gérer dans Marchés'\)\}/.test(src),
      'le renvoi vers Marchés n’est plus un lien nu');
    /* Borne a la fiche : l'accueil garde un vrai renvoi de navigation vers
       Marches, dans un en-tete qui ne porte aucun bouton. Ce n'est pas le meme
       objet, et l'interdire partout aurait interdit la navigation. */
    const fiche = src.slice(src.indexOf('function viewFicheCompte('),
                            src.indexOf('function viewFicheEtab('));
    vrai(fiche.length > 1000, 'la fiche d’un compte se relit depuis sa source');
    vrai(!/href="#\/positions"/.test(fiche),
      'la fiche d’un compte ne renvoie plus vers Marchés : elle porte le geste');
    vrai(/data-action="ajouter-ligne" data-compte=/.test(fiche),
      'et ce geste emporte le compte d’où il part');
    /* Et un lien qui porte la classe d'un bouton ne se souligne pas. */
    const regle = (css.match(/^\.btn \{[^}]*\}/m) || [''])[0];
    vrai(/text-decoration: none/.test(regle), 'la classe .btn retire le soulignement');
  });

  test('un bouton seul qui passe à la ligne reste à droite, une paire va à gauche', () => {
    /* `space-between` distribue ligne par ligne : seul sur la seconde, un bouton
       partait a gauche, et la carte voisine gardait le sien a droite.

       Une paire suit l'autre regle : un bouton seul est un accessoire du titre et
       en suit le bord, une paire est un bloc, et elle s'aligne sur les blocs
       replies au-dessus d'elle — plages, selecteur d'annee — tous a gauche. */
    const css = lireSource('assets/styles.css');
    vrai(/\.card-head > \.btn:last-child \{ margin-left: auto; \}/.test(css),
      'le dernier bouton seul d’un en-tête porte margin-left: auto sous 900 px');
    vrai(!/\.card-head > \.paire-btn:last-child \{ margin-left: auto/.test(css),
      'et la paire ne le porte pas : elle reste au départ de sa ligne');
  });

  test('une seule géométrie pour les rangées de boutons d’une fiche', () => {
    /* Deux classes pour une meme rangee donnaient deux largeurs et deux hauteurs
       dans une meme carte. Une seule classe, et une grille : c'est elle qui decide
       de la largeur, jamais la longueur du libelle. */
    const css = lireSource('assets/styles.css');
    const src = lireSource('assets/app.js');
    vrai(!/fiche-pied|fiche-valider/.test(css + src),
      'plus de seconde classe : « Archiver » faisait 79 px quand « Clôturer et supprimer » en faisait 157');
    const base = (css.match(/\.fiche-actes \{[^}]*\}/) || [''])[0];
    vrai(/display: grid/.test(base), 'une grille, et non un flex');
    vrai(/grid-template-columns: minmax\(0, 1fr\)/.test(base),
      'une seule colonne par défaut : à 375 px, deux colonnes plient « Clôturer et supprimer » en deux lignes');
    const grand = (css.match(/@media \(min-width: 768px\) \{\s*\n\s*\.fiche-actes \{[^}]*\}/) || [''])[0];
    vrai(/repeat\(2, minmax\(0, 14em\)\)/.test(grand),
      'deux colonnes égales au-delà, sur tablette comme sur écran, plafonnées : '
      + 'sinon un bouton prend les 928 px de la carte');
    vrai(/justify-content: end/.test(grand) && !/max-width/.test(grand),
      'le plafond porte sur les colonnes, pas sur la rangée : réduite, elle emporte '
      + 'son filet avec elle et le trait cesse de traverser la carte');
    vrai(/\.fiche-actes \+ \.fiche-actes \{ margin-top: 8px; \}/.test(css),
      'et l’écart entre deux rangées voisines est celui de la grille');
    /* La rangee qui ferme une carte de champs n'ajoute qu'un filet : aucun
       remplissage lateral, la carte le donne deja. */
    const pied = (css.match(/\.fiche-actes\.apres-champs \{[^}]*\}/) || [''])[0];
    vrai(/border-top: 1px solid var\(--grid\)/.test(pied),
      'un filet sépare la saisie de sa validation, comme le pied d’une fenêtre');
    vrai(/padding-top: 14px/.test(pied) && !/padding: /.test(pied),
      'et aucun remplissage latéral, qui la décalerait de ses voisines');
  });

  test('les quatre boutons d’une fiche ont la même taille et le même bord', () => {
    /* Mesure, et non lecture du CSS : c'est la largeur rendue qui se voyait
       fausse. Les deux rangees vivent dans deux cartes differentes, et c'est
       precisement ce que la sonde doit reproduire — la bordure d'une carte ne
       dispense pas deux rangees voisines de s'accorder. La sonde vaut pour la
       largeur ou tourne la page de tests ; les deux regimes de colonnes sont
       gardes par le controle precedent. */
    const boite = document.createElement('div');
    boite.style.width = '600px';
    boite.innerHTML = '<div class="card"><div class="card-head"><h2>Informations</h2></div>'
      + '<div class="fiche-actes apres-champs">'
      + '<button class="btn ghost">Annuler</button>'
      + '<button class="btn primary">Enregistrer</button></div></div>'
      + '<div class="card"><div class="card-head"><h2>Actions</h2></div>'
      + '<div class="fiche-actes">'
      + '<button class="btn ghost">Archiver</button>'
      + '<button class="btn ghost danger">Clôturer et supprimer</button></div></div>';
    document.body.appendChild(boite);
    try {
      const btns = [...boite.querySelectorAll('.btn')].map(b => b.getBoundingClientRect());
      const larg = btns.map(r => Math.round(r.width));
      const haut = btns.map(r => Math.round(r.height));
      eq(new Set(larg).size, 1, 'une seule largeur pour les quatre : ' + larg.join(' / '));
      eq(new Set(haut).size, 1, 'une seule hauteur pour les quatre : ' + haut.join(' / '));
      const rangees = [...boite.querySelectorAll('.fiche-actes')];
      const bords = rangees.map(r => Math.round(r.getBoundingClientRect().right));
      eq(bords[0], bords[1],
        'et les deux rangées partagent leur bord droit, d’une carte à l’autre');
      /* Le filet est dessine sur la rangee : si elle est plafonnee, il ne traverse
         plus la carte et flotte au-dessus des deux boutons. La rangee doit donc
         faire la largeur du contenu de sa carte, boutons poussees a droite. */
      const pied = rangees[0];
      const carte = pied.closest('.card');
      const dedans = getComputedStyle(carte);
      const attendu = Math.round(carte.getBoundingClientRect().width
        - parseFloat(dedans.paddingLeft) - parseFloat(dedans.paddingRight)
        - parseFloat(dedans.borderLeftWidth) - parseFloat(dedans.borderRightWidth));
      eq(Math.round(pied.getBoundingClientRect().width), attendu,
        'le filet traverse la carte : la rangée fait la largeur de son contenu');
      /* Sous 768 px les boutons occupent toute la rangee, il n'y a rien a pousser. */
      if (matchMedia('(min-width: 768px)').matches) {
        vrai(Math.round(pied.firstElementChild.getBoundingClientRect().left)
               > Math.round(pied.getBoundingClientRect().left),
          'et ses boutons restent poussés à droite');
      }
    } finally {
      boite.remove();
    }
  });
});

suite('Un menu déroulant a la largeur de ce qu’il montre', () => {

  /* Deux defauts opposes sur la meme page : « Français » dans une boite de
     442 px, et « Oui, chercher les cours automatiquement » coupe en plein mot. */

  test('une cellule de grille est un enfant, pas un descendant', () => {
    const css = lireSource('assets/styles.css');
    vrai(!/\.grid \.field :is\(input, select, textarea\)/.test(css),
      'le combinateur descendant étirait le moindre champ posé dans une carte posée dans une grille');
    vrai(/\.grid > \.field :is\(input, select, textarea\) \{/.test(css),
      'un champ n’est étiré que s’il est lui-même la cellule');
  });

  test('un menu garde la largeur de sa plus longue option, sans se couper', () => {
    const css = lireSource('assets/styles.css');
    const regle = (css.match(/\.field select \{[^}]*\}/) || [''])[0];
    vrai(/width: auto/.test(regle) && /align-self: start/.test(regle),
      'hors grille, un menu sait déjà quelle largeur il lui faut');
    vrai(/max-width: min\(28em, 100%\)/.test(regle),
      'le plafond laisse entrer « Automatique (place de référence du titre) », 22,5 em, '
      + 'mais jamais au-delà du conteneur : 28 em valent 364 px quand la carte en offre 311');
    vrai(/text-overflow: ellipsis/.test(regle),
      'et si le conteneur le resserre, une ellipse le dit au lieu de trancher un mot');
  });

  test('un menu ne sort jamais de sa carte', () => {
    /* Un menu prend la largeur de sa plus longue option sans regarder ou il est
       pose : a 375 px il sortait de l'ecran, ou les pixels sont perdus. La sonde
       reproduit une carte etroite et une option a rallonge. */
    const boite = document.createElement('div');
    boite.className = 'card';
    boite.style.width = '311px';
    boite.innerHTML = '<div class="field"><label>Place privilégiée</label>'
      + '<select><option>Automatique (place de référence du titre)</option></select></div>';
    document.body.appendChild(boite);
    try {
      const s = boite.querySelector('select');
      const l = Math.round(s.getBoundingClientRect().width);
      const dispo = Math.round(s.parentElement.getBoundingClientRect().width);
      vrai(l <= dispo, 'le menu fait ' + l + ' px pour ' + dispo + ' px offerts');
    } finally {
      boite.remove();
    }
  });

  test('deux mots ne prennent pas la carte entière', () => {
    /* La sonde reproduit la page Preferences : une carte dans une grille, et un
       champ dedans. Le menu ne porte que « Français » et « English ». */
    const boite = document.createElement('div');
    boite.className = 'grid g-2';
    boite.style.width = '900px';
    boite.innerHTML = '<div class="card"><div class="modal-champs"><div class="field">'
      + '<label>Langue de l’interface</label>'
      + '<select><option>Français</option><option>English</option></select>'
      + '</div></div></div>';
    document.body.appendChild(boite);
    try {
      const l = Math.round(boite.querySelector('select').getBoundingClientRect().width);
      vrai(l < 200, 'le menu fait ' + l + ' px, il devrait tenir dans le mot qu’il montre');
    } finally {
      boite.remove();
    }
  });
});

/* ------------------------------------------------------------------
   Ce qu'un audit de l'interface a trouve, et ce qui l'empechera de
   revenir. Dix defauts, du contraste aux glyphes : chacun avait ceci de
   commun qu'aucun test ne le regardait, et que rien a l'ecran ne criait.
   ------------------------------------------------------------------ */
suite('L’interface tient ses seuils', () => {

  /* -- Le contraste, calcule et non estime --------------------------- */

  const lum = ([r, g, b]) => {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const rgbDe = v => {
    const s = String(v).trim();
    const h = s.match(/^#([0-9a-f]{6})$/i);
    if (h) return [0, 2, 4].map(i => parseInt(h[1].slice(i, i + 2), 16));
    const m = s.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  const contraste = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const jeton = nom => rgbDe(getComputedStyle(document.documentElement).getPropertyValue(nom));

  test('le texte le plus petit franchit 4,5:1 sur les trois fonds, dans les deux thèmes', () => {
    /* Le troisieme gris portait les intitules de colonnes a 11 px, les bulles
       d'aide a 12 et les etiquettes de tuiles a 10,5 : 3,61:1 sur une carte,
       3,32 sur `--surface-2`. Sous le seuil precisement la ou les caracteres
       sont les plus fins, et dans les deux thèmes a la fois. Un contrôle qui
       calcule vaut mieux qu'un oeil : personne ne voit la difference entre
       4,3 et 4,6, et c'est pourtant la frontiere.

       L'orange s'y est ajoute : il ecrit les ecarts au budget, il n'est pas
       qu'un aplat. L'accent aussi : il ecrit l'horizon retenu de la projection,
       donc il change de seuil. */
    const memoire = document.documentElement.dataset.theme;
    const fautes = [];
    try {
      for (const theme of ['light', 'dark']) {
        document.documentElement.dataset.theme = theme;
        const fonds = ['--surface-1', '--surface-2', '--page'].map(n => [n, jeton(n)]);
        for (const encre of ['--muted', '--text-secondary', '--serious', '--accent']) {
          const c = jeton(encre);
          vrai(c, `${encre} doit être lisible en ${theme}`);
          for (const [nom, fond] of fonds) {
            const r = contraste(c, fond);
            if (r < 4.5) fautes.push(`${theme} : ${encre} sur ${nom} = ${r.toFixed(2)}:1`);
          }
        }
      }
    } finally {
      if (memoire) document.documentElement.dataset.theme = memoire;
      else delete document.documentElement.dataset.theme;
    }
    eq(fautes.join(' | '), '', 'du texte de 11 px sous 4,5:1 ne se lit pas');
  });

  test('les trois gris restent trois, et dans cet ordre', () => {
    /* Remonter `--muted` pour le contraste ne doit pas l'amener au niveau de
       `--text-secondary` : la hierarchie des trois encres est ce qui distingue
       un intitule d'une valeur. */
    const memoire = document.documentElement.dataset.theme;
    try {
      for (const theme of ['light', 'dark']) {
        document.documentElement.dataset.theme = theme;
        const fond = jeton('--surface-1');
        const [muet, second, premier] = ['--muted', '--text-secondary', '--text-primary']
          .map(n => contraste(jeton(n), fond));
        vrai(muet < second - 0.5, `${theme} : --muted doit rester en retrait de --text-secondary`);
        vrai(second < premier - 0.5, `${theme} : --text-secondary doit rester en retrait de --text-primary`);
      }
    } finally {
      if (memoire) document.documentElement.dataset.theme = memoire;
      else delete document.documentElement.dataset.theme;
    }
  });

  /* -- La cible du doigt -------------------------------------------- */

  test('un bouton-icône se vise, même quand son dessin fait 22 px', () => {
    /* Les croix mesuraient 22 a 29 px selon l'endroit, le minimum tenable au
       doigt etant 24 : sous cette taille on atteint le voisin. Le dessin ne
       grandit pas — ce serait un aplat la ou il faut un signe discret — c'est
       la boite cliquable qui s'etend au-dela, sans rien deplacer. */
    const boite = document.createElement('div');
    boite.className = 'card';
    boite.innerHTML = '<button class="btn icon xs">✕</button>'
      + '<span class="aide" role="button" tabindex="0">?</span>';
    document.body.appendChild(boite);
    try {
      for (const sel of ['.btn.icon.xs', '.aide']) {
        const el = boite.querySelector(sel);
        const ap = getComputedStyle(el, '::after');
        eq(ap.content, '""', `${sel} doit porter une cible étendue`);
        eq(ap.position, 'absolute', `${sel} : la cible ne doit pas pousser ses voisins`);
        const px = p => parseFloat(p) || 0;
        const r = el.getBoundingClientRect();
        const L = r.width - px(ap.left) - px(ap.right);
        const H = r.height - px(ap.top) - px(ap.bottom);
        vrai(L >= 24 && H >= 24, `${sel} : cible de ${Math.round(L)}x${Math.round(H)} px, il en faut 24`);
        /* Pas de fond : c'est une surface a viser, pas a voir. */
        const fond = rgbDe(ap.backgroundColor);
        vrai(!fond || ap.backgroundColor === 'rgba(0, 0, 0, 0)',
          `${sel} : la cible étendue ne doit rien peindre`);
      }
    } finally {
      boite.remove();
    }
  });

  test('une cible étendue n’empiète pas sur sa voisine', () => {
    /* A huit pixels d'extension, la croix de la carte de rappel mordait de deux
       pixels sur « Plus tard », son voisin a six pixels d'ecart. Une action
       destructive qui gagne du terrain sur celle qui reporte, c'est le mauvais
       sens. La sonde reproduit l'ecart le plus serre de l'application. */
    const boite = document.createElement('div');
    boite.className = 'card';
    boite.innerHTML = '<span style="display:flex; gap:6px; align-items:center">'
      + '<button class="btn sm ghost">Plus tard</button>'
      + '<button class="btn icon xs">✕</button></span>';
    document.body.appendChild(boite);
    try {
      const [voisin, croix] = [...boite.querySelectorAll('button')];
      const ap = getComputedStyle(croix, '::after');
      const px = p => parseFloat(p) || 0;
      const bordGauche = croix.getBoundingClientRect().left + px(ap.left);
      const bordVoisin = voisin.getBoundingClientRect().right;
      vrai(bordGauche >= bordVoisin - 0.5,
        `la cible de la croix commence à ${Math.round(bordGauche)}, le voisin finit à ${Math.round(bordVoisin)}`);
    } finally {
      boite.remove();
    }
  });

  /* -- Le focus au clavier ------------------------------------------ */

  test('tout ce qui se focalise porte l’anneau de l’application', () => {
    /* Vingt-cinq composants declaraient leur `:focus-visible` en accent, et les
       deux plus courants s'en remettaient au navigateur : `.btn`, dont l'anneau
       par defaut ne se voit presque pas sur un bouton plein clair, et `.aide`,
       qui posait `outline: none` et changeait la couleur d'un filet de 1 px. */
    const css = (lireSource('assets/styles.css') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const sel of ['\\.btn:focus-visible', '\\.aide:focus-visible']) {
      const bloc = (css.match(new RegExp(sel + ' \\{[^}]*\\}')) || [''])[0];
      vrai(/outline: 2px solid var\(--accent\)/.test(bloc),
        `${sel.replace(/\\/g, '')} doit poser l’anneau d’accent, il porte « ${bloc.slice(0, 60)} »`);
    }
  });

  /* -- Le rouge ne sert qu'a ce qui est faux ------------------------ */

  test('une saisie en attente s’annonce en ambre, jamais en rouge', () => {
    /* La pastille de la barre du bas etait peinte en `--critical` pour dire
       qu'un releve mensuel restait a prendre. Chaque debut de mois, une alerte
       rouge pour de la routine — et une alerte qui revient tous les mois cesse
       d'etre lue. Sa jumelle de la barre laterale, `.badge`, etait deja en
       ambre : deux couleurs pour le meme signal selon la taille de l'ecran. */
    const css = (lireSource('assets/styles.css') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const bloc = (css.match(/\.tab-pastille \{[^}]*\}/) || [''])[0];
    vrai(/background: var\(--warning\)/.test(bloc),
      'la pastille de l’onglet est ambre comme celle du menu');
    vrai(!/critical/.test(bloc), 'et le rouge reste au chiffre faux');
    const jumelle = (css.match(/\.badge \{[^}]*\}/) || [''])[0];
    vrai(/var\(--warning\)/.test(jumelle),
      'les deux pastilles du même signal gardent la même couleur');
  });

  /* -- Un total ne sort pas de l'ecran ------------------------------ */

  test('le total d’un tableau large reste visible', () => {
    /* Six colonnes pour 311 px de carte : la colonne « Total » etait hors de
       l'ecran a l'ouverture, le seul chiffre que la courbe au-dessus raconte.
       Epinglee a droite, elle y reste pendant que ses parts defilent. */
    const src = lireSource('assets/app.js');
    const css = (lireSource('assets/styles.css') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const i = src.indexOf('function detailEvolution');
    const bloc = src.slice(i, src.indexOf('function monterEvolution'));
    vrai(/<th class="sticky-fin">Total<\/th>/.test(bloc), 'l’en-tête du total est épinglée');
    vrai(/<td class="sticky-fin"><b>\$\{fmtEUR0\(p\.total\)\}/.test(bloc), 'et la cellule aussi');
    const regle = (css.match(/\.sticky-fin \{[^}]*\}/) || [''])[0];
    vrai(/position: sticky/.test(regle) && /right: 0/.test(regle),
      'la règle épingle par le bord droit');
    vrai(/background: var\(--surface-1\)/.test(regle),
      'avec un fond, sinon les parts défilent sous le total et on lit deux chiffres l’un sur l’autre');
  });

  /* -- Un chiffre dit sur quelle base il se calcule ------------------ */

  test('la base d’un chiffre ne disparaît pas sur téléphone', () => {
    /* `font-size: 0` masquait « sur 7 mois clos, hors charges fixes » sous la
       tuile qui affiche 1 404 €. Un dividende sans diviseur n'est pas un chiffre
       plus court, c'est un chiffre faux. Les deux raisons du masquage sont
       tombees : le texte ne se tronque plus, et `grid-auto-rows: 1fr` egalise
       les hauteurs. */
    const css = (lireSource('assets/styles.css') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const bloc = (css.match(/\.g-tuiles \.t-meta \{[^}]*\}/) || [''])[0];
    vrai(bloc, 'la règle mobile de la base doit être trouvable');
    vrai(!/font-size: 0/.test(bloc), 'la base n’est plus masquée');
    vrai(/font-size: 10\.5px/.test(bloc), 'elle se serre au lieu de disparaître');
    vrai(/grid-auto-rows: 1fr/.test(css),
      'et les hauteurs de tuiles restent égalisées, sinon chacune prend la sienne');
  });

  /* -- Une page suit les gabarits de la maison ----------------------- */

  test('la page Données ne porte que deux gabarits de bouton', () => {
    /* Quatre hauteurs sur une seule page : 30, 31, 36 et 43 px. La regle de la
       maison est qu'un bouton d'en-tete ou de rangee est `sm`, un bouton de
       corps de carte est pleine taille, et que la hierarchie se dit par le
       remplissage — jamais par la taille. */
    const src = lireSource('assets/app.js');
    const i = src.indexOf('function viewData');
    vrai(i > 0, 'viewData doit être trouvable');
    const vue = src.slice(i, src.indexOf('function mountData'));
    vrai(!/class="btn pleine" data-action="undo"/.test(vue),
      'le bouton d’annulation prend la taille des autres');
    vrai(/class="btn" data-action="undo"/.test(vue), 'et reste plein, seul dans sa carte');
    /* `pleine` garde son unique emploi documente : la photo du releve. */
    vrai(/class="btn pleine" id="relPhoto"/.test(src),
      'la classe pleine reste réservée à l’action qui remplace douze saisies');
  });

  test('l’acte le plus destructeur a sa propre carte, et elle vient en dernier', () => {
    /* « Repartir de zero » vivait sous le titre « Importer », en petit bouton
       fantome derriere un filet : le titre n'annoncait rien de ce qu'il fait, et
       les boutons d'une carte portent sur le sujet de cette carte. */
    const src = lireSource('assets/app.js');
    const vue = src.slice(src.indexOf('function viewData'), src.indexOf('function mountData'));
    const iImport = vue.indexOf("trad('Importer')");
    const iBouton = vue.indexOf('data-action="start-blank"');
    const iTitre = vue.indexOf("trad('Repartir de zéro')");
    vrai(iBouton > 0 && iTitre > 0, 'la carte doit être trouvable');
    vrai(iTitre < iBouton, 'son titre annonce ce que son bouton fait');
    vrai(iBouton > iImport + 2000,
      'elle ne vit plus dans la carte « Importer », qui ne l’annonçait pas');
    vrai(/class="btn ghost danger" data-action="start-blank"/.test(vue),
      'et le bouton porte le rouge de ce qu’il détruit');
    /* Dernier de la page : le doigt ne traverse pas le rouge pour atteindre le
       reste, comme sur la fiche d'un compte. */
    vrai(iBouton > vue.indexOf("trad('Sauvegardes automatiques')"),
      'elle se rend après les sauvegardes : ce qui répare vient avant ce qui détruit');
  });

  /* -- Un glyphe ne dit qu'une chose ------------------------------- */

  test('le glyphe de l’actualisation ne sert pas à effacer', () => {
    /* ↻ veut dire « actualiser » a quatre endroits : les cours, la
       synchronisation, le symbole depuis l'ISIN, l'etat du chargement. Le meme
       signe annoncait « effacer seize mois de releves ». */
    const src = lireSource('assets/app.js');
    const i = src.indexOf('data-action="start-blank"');
    const ligne = src.slice(src.lastIndexOf('<button', i), src.indexOf('</button>', i));
    vrai(!/↻/.test(ligne), 'le bouton qui efface tout ne porte plus le signe de l’actualisation');
    vrai(/↻/.test(src), 'le signe reste, pour ce qu’il veut dire');
  });

  test('l’acte qui retire un montant se nomme', () => {
    /* Un ✕ gris est le signe le plus discret de l'ecran pour l'action qui efface
       un montant : on ne le trouve que par accident. Le meme defaut sur les
       credits avait deja ete corrige en bouton nomme et rouge. */
    const src = lireSource('assets/app.js');
    const i = src.indexOf('data-action="retirer-cash"');
    const bouton = src.slice(src.lastIndexOf('<button', i), src.indexOf('</button>', i));
    vrai(!/>✕/.test(bouton), 'le bouton ne se réduit plus à une croix');
    vrai(/trad\('Retirer'\)/.test(bouton), 'il porte son verbe');
    vrai(/ghost danger/.test(bouton),
      'rouge en liseré et non en aplat : un compte peut déclarer trois parts');
  });

  /* -- La hierarchie typographique --------------------------------- */

  test('deux boutons du même geste mesurent pareil', () => {
    /* « − Vendre » et « + Vente passee » tombaient une par une dans l'en-tete
       souple, a 77 et 120 px, l'une au-dessus de l'autre : deux commandes de la
       meme paire lues comme deux commandes sans rapport. La paire en fait un seul
       element de flex — donc un seul point de rupture — et une grille a colonnes
       egales leur donne la meme largeur, celle du libelle le plus long. */
    const boite = document.createElement('div');
    boite.className = 'card';
    /* Largeur posee, comme les autres sondes : le corps de la page de tests est
       la meme grille que l'application, et une sonde sans largeur atterrit dans
       la colonne de 244 px de la barre laterale. Les deux boutons s'y serrent a
       62 px, leurs libelles se replient, et le controle mesure alors le pire des
       cas plutot que celui qu'il croit regarder. */
    boite.style.width = '600px';
    /* Deux libelles de longueurs franchement inegales, comme la paire des apports
       — « + Rentrée » contre « + Dépense ». C'est l'ecart qui rend le defaut
       visible : en flex, le plus long imposait sa largeur a lui seul. */
    boite.innerHTML = '<div class="card-head"><h2>Journal</h2>'
      + '<span class="paire-btn">'
      + '<button class="btn sm ghost">+ Rentrée</button>'
      + '<button class="btn sm ghost">+ Dépense exceptionnelle</button>'
      + '</span></div>';
    document.body.appendChild(boite);
    try {
      const paire = boite.querySelector('.paire-btn');
      const b = [...paire.children].map(x => x.getBoundingClientRect());
      eq(new Set(b.map(r => Math.round(r.width))).size, 1,
        'une seule largeur : ' + b.map(r => Math.round(r.width)).join(' / '));
      eq(new Set(b.map(r => Math.round(r.top))).size, 1,
        'et une seule ligne : la paire tombe d’un bloc ou pas du tout');
      /* La largeur commune est celle du plus long, pas la moyenne : un libelle
         qui se replie ferait deux hauteurs. */
      eq(new Set(b.map(r => Math.round(r.height))).size, 1, 'donc une seule hauteur');
      vrai(Math.round(b[1].right) === Math.round(paire.getBoundingClientRect().right),
        'et la paire finit là où finit son dernier bouton');
    } finally {
      boite.remove();
    }
  });

  test('le thème se change en rechargeant, comme la langue', () => {
    /* Changer l'attribut repeint tout sauf le fond du corps, qui reste a la
       couleur de l'ancien theme jusqu'au rechargement suivant : des cartes
       claires posees sur une page noire. Mesure a l'appui dans le commentaire
       d'`applyTheme`. Le selecteur de langue recharge depuis toujours. */
    const src = lireSource('assets/app.js');
    const fn = src.slice(src.indexOf('function applyTheme'), src.indexOf('function applyTheme') + 400);
    vrai(/location\.reload\(\)/.test(fn), 'applyTheme sait recharger');
    vrai(/recharger = false/.test(fn),
      'mais pas au démarrage, sinon la page se recharge en boucle');
    for (const appel of ['applyTheme\\(currentTheme\\(\\) === .dark. \\? .light. : .dark., true\\)',
                         'applyTheme\\(theme\\.value, true\\)']) {
      vrai(new RegExp(appel).test(src),
        `les deux commandes de thème demandent le rechargement (${appel.slice(0, 24)}…)`);
    }
    vrai(!/applyTheme\(theme\.value\); render\(\)/.test(src),
      'et aucune ne se contente d’un render, qui laissait le fond du corps en arrière');
  });

  test('un titre de carte se distingue du texte qu’il annonce', () => {
    /* A 15 px contre un corps a 13,5, la hierarchie ne tenait que par la
       graisse, et une graisse ne se lit pas de loin. Trois paliers : 20 pour le
       titre de page, 16 pour celui d'une carte, 13 pour le texte. */
    const css = (lireSource('assets/styles.css') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const taille = sel => {
      const bloc = (css.match(new RegExp(sel.replace(/[.]/g, '\\.') + ' \\{[^}]*\\}')) || [''])[0];
      const m = bloc.match(/font-size: ([\d.]+)px/);
      return m ? +m[1] : null;
    };
    const h1 = taille('.topbar h1'), h2 = taille('.card-head h2');
    vrai(h1 && h2, 'les deux règles doivent être trouvables');
    vrai(h2 >= 16, `un titre de carte fait ${h2} px, il en faut 16 pour se détacher du corps`);
    vrai(h1 > h2 + 2, `le titre de page (${h1}) doit rester au-dessus de celui d’une carte (${h2})`);
  });
});

suite('La licence ne ment pas', () => {
  test('le fichier LICENSE porte la licence que le README annonce', () => {
    /* La regle se derive du README : c'est lui qui annonce la licence au
       lecteur, le fichier LICENSE doit donc dire la meme chose. L'AGPL et la
       GPL v3 se ressemblent paragraphe pour paragraphe, seule la premiere
       porte AFFERO en tete, et c'est sa clause reseau qui fonde la phrase du
       README sur les versions modifiees mises en ligne. Le fichier a deja
       porte la GPL simple sous un README qui annoncait l'AGPL, et l'onglet
       licence de GitHub l'a dit avant les tests. */
    const readme = lireSource('README.md');
    const licence = lireSource('LICENSE');
    vrai(readme !== null, 'README.md doit se lire');
    vrai(licence !== null, 'LICENSE doit se lire');
    vrai(/AGPL/.test(readme),
      'le README n’annonce plus l’AGPL : mettre ce test d’accord avec lui');
    vrai(licence.includes('GNU AFFERO GENERAL PUBLIC LICENSE'),
      'le README annonce l’AGPL, le fichier LICENSE porte autre chose');
  });

  test('aucun document publié ne porte de marqueur de conflit', () => {
    /* Une fusion du depot prive s'est arretee au milieu du README et le
       resultat a ete commite tel quel : `<<<<<<< HEAD`, deux lignes anglaises,
       `=======`, puis cent vingt lignes francaises decrivant l'application
       privee — ses lanceurs `.cmd`, son dossier, ses feuilles Google — et
       `>>>>>>> principal/main`. C'est reste cinq jours en tete du depot public,
       ou la section « Run it locally » ne montrait plus comment lancer quoi que
       ce soit.

       Un marqueur de conflit ne se rattrape par aucune relecture de code : il
       vit dans la prose, la ou personne ne repasse. Le controle est donc
       mecanique, et il porte sur les documents que GitHub affiche en premier. */
    ['README.md', 'ETAT.md', 'CLAUDE.md', 'DEPLOY.md'].forEach(nom => {
      const texte = lireSource(nom);
      if (texte === null) return;   // un document peut disparaitre, pas mentir
      const marqueur = texte.split('\n')
        .findIndex(l => /^(<{7}|={7}|>{7})(\s|$)/.test(l));
      eq(marqueur, -1,
        `${nom} porte un marqueur de conflit ligne ${marqueur + 1} : `
        + 'une fusion a ete commitee sans etre finie');
    });
  });
});

suite('La page Allocation dit la base qu’elle emploie', () => {
  test('elle n’en annonce qu’une, et c’est celle des cartes', () => {
    /* « Ça c'est faux maintenant non ? » L'infobulle de tete promettait « trois
       bases sur cette page » et expliquait que « ce qui est place » ecarte les
       liquidites. C'etait vrai la veille. Le matin meme, les cartes par
       enveloppe et par compte ont ete rebasees sur les avoirs et le cash y a ete
       ajoute : il ne restait qu'une base, et le texte decrivait une page qui
       n'existait plus.

       C'est la deuxieme fois dans la meme journee qu'un texte d'aide survit a ce
       qu'il decrit — un commentaire perime est un mensonge, et une infobulle
       aussi. Le controle se derive donc de la source : ce que la vue emploie
       reellement doit correspondre a ce que son entete promet.

       Le nombre de cartes ne se compte pas ici, et volontairement : la premiere
       redaction disait « les quatre cartes » alors qu'il y en avait trois, faux
       des l'ecriture. Un chiffre qui vieillit tout seul n'a pas sa place dans un
       texte affiche. */
    const src = lireSource('assets/app.js');
    vrai(src, 'assets/app.js doit être lisible');
    const debut = src.indexOf('function viewAllocation()');
    const vue = src.slice(debut, src.indexOf('function mountAllocation', debut));
    vrai(vue.length > 500, 'la vue doit se relire depuis sa source');

    const bases = [...vue.matchAll(/mentionBase\(BASES\.([a-zA-Z]+)/g)].map(m => m[1]);
    vrai(bases.length > 0, 'la page doit annoncer au moins une base');
    const distinctes = [...new Set(bases)];
    eq(distinctes.length, 1,
      `la page emploie ${distinctes.length} bases (${distinctes.join(', ')}) alors que `
      + 'son infobulle en annonce une seule : remettre le texte d’accord avec les cartes');
    eq(distinctes[0], 'avoirs', 'et c’est « Tes avoirs » que le texte nomme');

    const tete = vue.slice(vue.indexOf('perimetre-tete'), vue.indexOf('perimetre-tete') + 900);
    vrai(/Une seule base sur cette page/.test(tete),
      'l’infobulle de tête doit annoncer une base unique');
    vrai(!/Trois bases|Ce qui est placé » écarte/.test(tete),
      'l’ancien texte à trois bases décrit une page qui n’existe plus');
  });
});

suite('Une flèche de tri ne quitte pas son intitulé', () => {
  test('l’en-tête triable ne se replie pas', () => {
    /* « Ma fleche de poids se met en dessous, c'est pas pratique. » La fleche est
       un `::after` dont le contenu commence par une espace, et cette espace est
       secable. Dans la colonne « Poids », large de 50 px au telephone, le
       navigateur coupait la : l'intitule sur une ligne, la fleche en dessous, et
       la cellule passait de 15 a 28 px de haut. Mesure a 375 px.

       Une fleche separee de son intitule ne dit plus de quoi elle parle : elle
       flotte sous une colonne et pourrait aussi bien designer la voisine.

       Deux regles se tiennent, et le test verifie les deux. `nowrap` empeche la
       coupure ; la largeur de colonne empeche le debordement qui la provoquait.
       Corriger la premiere sans la seconde aurait pousse l'intitule hors de sa
       cellule au lieu de le replier. */
    const css = lireSource('assets/styles.css');
    vrai(css, 'la feuille de style doit être lisible');
    const bloc = css.slice(css.indexOf('.tri-jour .th-tri {'),
                           css.indexOf('.tri-jour .th-tri {') + 320);
    vrai(/white-space:\s*nowrap/.test(bloc),
      'l’intitulé triable et sa flèche doivent rester sur une ligne');
    const mob = css.slice(css.indexOf('@media (max-width: 460px)'),
                          css.indexOf('@media (max-width: 460px)') + 900);
    const cols = (mob.match(/\.jour-ligne \{ grid-template-columns: minmax\(0, 1fr\) (\d+)px/) || [])[1];
    vrai(cols, 'la grille du jour doit déclarer ses colonnes au téléphone');
    vrai(Number(cols) >= 58,
      `la colonne « Poids » fait ${cols} px : son intitulé (34), sa flèche (9), `
      + 'son aide (5) et l’écart (4) en demandent 52, et c’est le débordement qui '
      + 'faisait chercher un endroit où couper');
  });

  test('l’intitulé d’une colonne s’aligne sur ses chiffres', () => {
    /* « Les noms des colonnes sont pas centres. » Ils etaient colles a gauche
       pendant que les chiffres s'alignaient a droite : mesure a 852 px, la
       colonne « Poids » finissait a 183 et son en-tete a 168.

       La regle existait pourtant — `text-align: right` sur les cellules d'en-tete
       — mais elle etait inerte. L'en-tete triable EST un conteneur flex :
       `.tri-jour` porte `display: inline-flex`, blockifie en `flex` par la grille
       qui le contient, et `text-align` ne deplace aucun enfant d'un conteneur
       flex. La regle etait donc morte depuis qu'elle existait, sans que rien ne
       le dise : elle avait l'air juste a la lecture.

       C'est pourquoi le controle porte sur `justify-content` et non sur la
       presence d'une regle d'alignement : la premiere formulation aurait ete
       satisfaite par celle qui ne marchait pas. */
    const css = lireSource('assets/styles.css');
    const i = css.indexOf('.jour-ligne.entete span:not(:first-child)');
    vrai(i > 0, 'la règle d’alignement des en-têtes doit exister');
    const regle = css.slice(i, css.indexOf('}', i) + 1);
    vrai(/justify-content:\s*flex-end/.test(regle),
      'les en-têtes triables sont des conteneurs flex : seul `justify-content` '
      + 'les aligne sur leurs chiffres, `text-align` n’y fait rien');
  });
});

suite('Un libellé, un montant', () => {

  test('aucun type de compte ne porte le nom d’une classe d’actif', () => {
    /* « D'un cote j'ai 500 balles en financement participatif qui passe en
       placement non cote. » Le type `pe` s'appelait « Placements non cotes »,
       exactement comme la classe `nonCote`. La carte « Par enveloppe » affichait
       donc 11 100 EUR sous ce nom et la carte des classes 11 600 EUR sous le
       meme, a deux cartes d'ecart sur le meme ecran. L'ecart etait le compte de
       pret participatif, qui est du non cote lui aussi.

       Les deux calculs etaient justes. C'est le nom du contenant qui mentait, et
       c'est la faute que ce projet traque depuis le debut : le meme libelle
       valant deux montants differents.

       Un type nomme ce qu'on ouvre, une classe ce qu'on detient. Le controle
       vaut pour toute la table, donc il protege aussi les types qu'on ajoutera
       demain — c'est la collision qui est interdite, pas le cas du jour. */
    /* La collision ne ment que si la classe peut porter plusieurs enveloppes.
       `bienValeur` n'en a qu'une, et elle est `direct` : le contenant EST la
       chose, les deux cartes montreront toujours le meme nombre, et exiger deux
       mots la forcerait a en inventer un. La regle porte donc sur ce qui rend le
       defaut possible, et non sur l'homonymie seule. Une seconde enveloppe
       ajoutee demain a `bienValeur` fera tomber ce test : c'est exactement le
       moment ou le renommage devient necessaire. */
    const parClasse = {};
    for (const ty of TYPES_COMPTE) for (const c of (ty.classes || []))
      (parClasse[c] = parClasse[c] || []).push(ty.id);
    const nomDeClasse = new Map(Object.entries(CLASSES_ACTIFS)
      .map(([cle, lab]) => [String(lab).toLowerCase(), cle]));
    for (const ty of TYPES_COMPTE) {
      const classe = nomDeClasse.get(String(ty.label).toLowerCase());
      if (!classe) continue;
      eq((parClasse[classe] || []).length, 1,
        `le type « ${ty.id} » s'appelle « ${ty.label} », le nom de la classe `
        + `« ${classe} », que se partagent ${(parClasse[classe] || []).join(', ')} : `
        + 'la carte « Par enveloppe » et celle des classes afficheraient deux '
        + 'montants différents sous ce libellé');
    }
  });

  test('deux types de compte ne portent pas le même nom', () => {
    /* Le corollaire, et il ne coute rien : deux enveloppes homonymes rendraient
       la carte « Par enveloppe » illisible, sans qu'aucun total soit faux. */
    const vus = new Map();
    for (const t of TYPES_COMPTE) {
      const cle = String(t.label).toLowerCase();
      vrai(!vus.has(cle),
        `les types « ${vus.get(cle)} » et « ${t.id} » portent le même libellé « ${t.label} »`);
      vus.set(cle, t.id);
    }
  });

  test('les deux métiers du non coté se distinguent à la lecture', () => {
    /* Le second malentendu, une fois le premier corrige : « pourtant mon
       investissement en crowdfunding j'ai bien des actions, c'est quand meme du
       financement participatif ? ». Oui, au sens courant — et c'est le probleme.
       Le mot couvrait les deux metiers en n'en nommant qu'un.

       Tallya ne separe pas par plateforme mais par ce qu'on detient : des parts,
       ou une creance. Les deux types partagent la classe `nonCote`, seul
       `prete` les distingue dans le calcul ; leurs noms doivent le dire aussi,
       sinon on range des parts la ou l'application reclame une echeance. */
    const parts = TYPES_COMPTE.find(t => t.id === 'pe');
    const pret = TYPES_COMPTE.find(t => t.id === 'crowdfunding');
    vrai(parts && pret, 'les deux types du non coté doivent exister');
    eq(parts.classes.join(), 'nonCote', 'les parts de société sont du non coté');
    eq(pret.classes.join(), 'nonCote', 'le prêt participatif aussi');
    vrai(!parts.prete, 'des parts ne se remboursent pas à une date');
    vrai(!!pret.prete, 'un prêt porte une échéance, un taux et un état');
    vrai(/parts?/i.test(parts.label),
      `« ${parts.label} » doit dire qu'on détient des parts`);
    vrai(/prêt|pret/i.test(pret.label),
      `« ${pret.label} » doit dire qu'on prête : c'est ce qui le sépare de son voisin`);
  });
});

suite('Un contenant vide ne survit pas à son dernier compte', () => {

  test('la migration retire un établissement sans compte ni dette', () => {
    /* Un etablissement sans compte est invisible sur toute la page Comptes,
       qui saute les contenants vides, et proposable a l'etape 2 de chaque
       ajout — y compris dans la fenetre « Assureur ou courtier » d'un contrat
       d'assurance-vie. Le nom d'un bien supprime revenait donc proposer de s'y
       rattacher, sans qu'aucun ecran ne permette de le retirer.

       La suppression d'un compte emporte desormais son etablissement, mais ce
       correctif ne valait que pour l'avenir : les contenants deja orphelins
       restaient dans les donnees. Un correctif qui ne regarde que l'avenir
       laisse le defaut chez ceux qui l'ont deja subi. */
    Fixture.poser();
    Store.state.etabs.push({ id: 'contenant-orphelin', nom: 'Studio', dettes: [] });
    Store.migrate();
    vrai(!Store.state.etabs.some(e => e.id === 'contenant-orphelin'),
      'un contenant sans compte ni dette doit partir : rien ne le montre, '
      + 'donc rien ne permet de le retirer à la main');
  });

  test('mais il reste s’il porte encore une dette', () => {
    /* Le credit orphelin se soustrait toujours du patrimoine net, et le
       controle de coherence « Credit sans bien » a besoin de nommer son
       etablissement. Le supprimer ici effacerait un chiffre au lieu de le
       signaler : exactement le defaut que ce controle existe pour attraper. */
    Fixture.poser();
    Store.state.etabs.push({ id: 'contenant-endette', nom: 'Studio',
      dettes: [{ libelle: 'Prêt', montant: 42000 }] });
    Store.migrate();
    vrai(Store.state.etabs.some(e => e.id === 'contenant-endette'),
      'un contenant qui porte une dette reste : sa dette compte encore');
  });

  test('et la migration se rejoue sans rien casser', () => {
    /* Idempotence : c'est la condition pour qu'une migration puisse tourner a
       chaque chargement. Deux passages doivent laisser le meme nombre de
       contenants, sinon elle mange les etablissements legitimes au second. */
    Fixture.poser();
    Store.migrate();
    const apres1 = Store.state.etabs.length;
    Store.migrate();
    eq(Store.state.etabs.length, apres1,
      'un second passage ne doit retirer aucun établissement de plus');
    vrai(apres1 > 0, 'la fixture porte bien des établissements rattachés');
  });
});

suite('La recherche vaut aussi pour les comptes archivés', () => {
  test('un archivé hors recherche quitte la page', () => {
    /* La page filtrait les comptes ouverts et construisait le groupe des
       archives cent cinquante lignes plus bas sans rien filtrer : elle
       repondait « Rien ne correspond a "Aaa" » en laissant le groupe dessous.
       Deux endroits pour une seule regle, et seul le premier la tenait.

       Le controle se derive de la source : la vue est un gabarit de plusieurs
       centaines de lignes, mais la regle tient dans le predicat, et c'est lui
       qui doit etre appele aux deux endroits. */
    const src = lireSource('assets/app.js');
    const vue = src.slice(src.indexOf('function viewAccounts()'),
                          src.indexOf('function mountAccounts()'));
    vrai(vue.length > 1000, 'la vue des comptes doit se relire depuis sa source');
    const appels = vue.split('correspondAuCompte').length - 1;
    vrai(appels >= 3,
      `le prédicat de recherche n'est appelé qu'à ${appels - 1} endroit(s) : `
      + 'les comptes ouverts et les archivés doivent tous deux y passer');
    vrai(/statut === 'archive' && correspondAuCompte\(c\)/.test(vue),
      'le groupe des archivés doit filtrer sur la recherche, comme les ouverts');
    vrai(/!ouverts\.length && !archives\.length/.test(vue),
      '« Rien ne correspond » ne doit s’afficher que si les archivés non plus '
      + 'ne correspondent pas : sinon la page se contredit dans le même écran');
  });
});

/* ------------------------------------------------------------------
   Une demonstration montre la meme chose a tout le monde
   ------------------------------------------------------------------ */
suite('Une démonstration montre la même chose à tout le monde', () => {

  test('le jeu de démonstration ne va pas chercher de cours', () => {
    /* `autoRefresh: true` faisait interroger la passerelle a chaque chargement :
       les valeurs de marche bougeaient donc entre deux visites, et entre deux
       captures d'ecran. Les quatre images du README se contredisaient a
       918,83 EUR pres — cash, non cote et immobilier identiques a l'euro, seuls
       actions, obligations et crypto differaient — et un lecteur attentif en
       concluait que l'application compte mal.

       Trois raisons de figer, et la premiere suffit : une demonstration doit
       montrer la meme chose a tout le monde. Ensuite, un README dont les chiffres
       vieillissent tout seuls devient faux sans que personne y touche. Enfin, une
       demonstration qui depend d'une passerelle externe tombe avec elle.

       Le bouton d'actualisation reste : la fonctionnalite se montre toujours,
       elle ne se declenche simplement plus toute seule. */
    /* Le jeu de demonstration est `SEED`, pas `assets/demo.json` : ce dernier
       etait un second instantane de la meme personne fictive, les deux ont
       diverge, et le mode demonstration repose desormais la graine. Le controle
       porte donc sur la graine — celle qu'un visiteur voit au premier
       chargement. */
    eq(SEED.meta.autoRefresh, false,
      'la démo ne doit pas rafraîchir les cours d’elle-même : deux visiteurs '
      + 'verraient deux chiffres, et les captures du README se contrediraient');
  });

  test('ses totaux se recalculent à l’identique', () => {
    /* Le controle qui vaut pour toute l'application, applique au jeu qu'un
       visiteur voit : la somme des parts fait le total. S'il tombe ici, une
       capture d'ecran montrera une incoherence a des inconnus. */
    Store.state = structuredClone(SEED);
    Store.migrate();
    refreshAccounts();
    const p = patrimoine();
    pres(Object.values(p.classes).reduce((s, v) => s + v, 0), p.brut,
      'le brut est la somme de ses classes');
    pres(Object.values(p.mobilisable).reduce((s, v) => s + v, 0), p.brut,
      'et la somme de ses paliers de disponibilité');
    pres(p.net, p.brut - p.dettes, 'le net est le brut moins les crédits');
    vrai(p.brut > 0, 'et le jeu porte bien des montants');
  });
});

/* ------------------------------------------------------------------
   Chercher un titre, c'est en ajouter un
   ------------------------------------------------------------------ */
suite('Chercher un titre, c’est en ajouter un', () => {

  /* La recherche de symbole, du montage jusqu'a la section suivante du
     fichier : tout ce qui suit appartient a Allocation. */
  const recherche = () => {
    const src = lireSource('assets/app.js');
    return src.slice(src.indexOf('function mountSymbolSearch('),
                     src.indexOf('function viewAllocation('));
  };

  test('un résultat porte un bouton, pas un menu de destinations', () => {
    const bloc = recherche();
    vrai(!/[Aa]ssigner/.test(bloc),
      'plus de menu « Assigner à… » : on ne choisit pas entre créer et compléter');
    vrai(!/Store\.state\.positions\.map\(/.test(bloc),
      'les lignes déjà détenues ne sont plus proposées comme destination');
    vrai(/<button class="btn sm assign-target"/.test(bloc),
      'chaque résultat porte un bouton d’ajout');
    vrai(/bouton\.addEventListener\('click'/.test(bloc),
      'et c’est un clic qui crée la ligne, plus un changement de menu');
  });

  test('compléter une ligne déjà détenue reste possible, depuis sa fiche', () => {
    /* Le menu retire portait un second usage : poser un symbole sur une ligne
       deja creee. Le retrait serait une perte si ce chemin n'existait pas
       ailleurs — la fiche de la ligne verifie son ISIN et pose le symbole
       trouve. C'est la porte que la carte de recherche n'a plus a doubler. */
    const src = lireSource('assets/app.js');
    vrai(/posIsinVerif/.test(src), 'la fiche d’une ligne vérifie son ISIN');
    vrai(/p2\.symbol = best\.symbol/.test(src),
      'et pose sur la ligne le symbole que la vérification trouve');
  });

  test('la fenêtre demande le compte avant la classe et le rôle', () => {
    const bloc = recherche();
    const rang = cle => bloc.indexOf('cle: \'' + cle + '\'');
    for (const cle of ['account', 'assetClass', 'role', 'dateAchat']) {
      vrai(rang(cle) > 0, 'le champ ' + cle + ' est là');
    }
    vrai(rang('account') < rang('assetClass'),
      'le compte se demande en premier : c’est la question à laquelle on sait '
      + 'répondre en arrivant');
    vrai(rang('account') < rang('role'), 'et avant le rôle');
    vrai(rang('assetClass') < rang('role'), 'la classe reste avant le rôle');
  });

  test('elle demande aussi ce qu’on a acheté, et combien', () => {
    /* Quantite et prix paye a zero obligeaient a rouvrir la fiche juste apres,
       pour la seule ligne qu'on vienne de creer. Ils vivent sous le compte,
       parce que c'est le meme geste : j'ai achete tant de titres, a tel prix,
       sur tel compte. La classe et le role, qui rangent, viennent apres. */
    const bloc = recherche();
    const rang = cle => bloc.indexOf('cle: \'' + cle + '\'');
    for (const cle of ['qty', 'buyPrice']) vrai(rang(cle) > 0, 'le champ ' + cle + ' est là');
    vrai(rang('account') < rang('qty'), 'la quantité suit le compte');
    vrai(rang('qty') < rang('buyPrice'), 'puis le prix payé');
    vrai(rang('buyPrice') < rang('assetClass'),
      'et les deux viennent avant les champs de rangement');
    /* Le zero reste accepte : on cree aussi une ligne avant de l'acheter. */
    vrai(!/cle: 'qty'[^}]*requis/.test(bloc) && !/cle: 'buyPrice'[^}]*requis/.test(bloc),
      'aucun des deux n’est obligatoire');
  });

  test('elle nomme la devise du prix qu’elle demande', () => {
    /* La bulle disait « dans la devise du titre » alors que rien a l'ecran ne
       disait laquelle : la recherche de Yahoo ne rend ni cours ni devise. Le
       symbole retenu est donc interroge au clic, un appel pour celui qu'on
       designe plutot que vingt-cinq pour la liste entiere. */
    const src = lireSource('assets/app.js');
    const bloc = recherche();
    vrai(/const cote = await coteDuSymbole\(bouton\.dataset\.symbol\)/.test(bloc),
      'le cours du titre choisi est demandé avant l’ouverture de la fenêtre');
    vrai(/\$\{trad\('Prix de revient unitaire'\)\} \(\$\{cote\.currency\}\)/.test(bloc),
      'la devise se lit sur l’intitulé du champ, là où est l’unité du nombre tapé');
    vrai(/exemple: cote \? String\(cote\.price\)/.test(bloc),
      'le cours du jour meuble le champ sans le remplir : un prix de revient '
      + 'pré-rempli au cours d’aujourd’hui serait faux et aurait l’air officiel');
    /* Un repere absent ne doit rien empecher : sans passerelle, la fenetre
       s'ouvre quand meme, avec l'intitule neutre. */
    const aide = src.slice(src.indexOf('async function coteDuSymbole('),
                           src.indexOf('function mountSymbolSearch('));
    vrai(/return null/.test(aide) && /catch/.test(aide),
      'la cote rend null plutôt que de lever : la fenêtre s’ouvre sans le repère');
    vrai(/cote \? .* : trad\('le prix payé par titre/s.test(bloc),
      'et l’intitulé retombe sur sa version neutre');
  });

  test('et ce qu’elle demande atterrit sur la ligne créée', () => {
    /* Un champ qu'on remplit et que la creation ignore est pire que pas de
       champ : il fait croire que c'est saisi. */
    const bloc = recherche();
    vrai(/qty: v\.qty, buyPrice: v\.buyPrice/.test(bloc),
      'la quantité et le prix saisis sont ceux de la ligne, pas des zéros');
  });

  test('la classe déduite se lit, elle ne se choisit pas', () => {
    /* Qu'un titre soit une action ou un ETF est un fait de l'instrument, pas
       une preference, et la recherche le renvoie deja : poser la question
       donnait a choisir une reponse connue. Elle s'affiche donc, avec sa
       provenance.

       Mais une classe n'est pas toujours un fait — un ETC sur l'or est
       « metaux » ici et « actions » ailleurs — donc le chemin de correction
       doit survivre, et la bulle dit ou il est. */
    const bloc = recherche();
    vrai(/deduite = !!bouton\.dataset\.type/.test(bloc),
      'la déduction dépend du type que la recherche a rendu');
    vrai(/deduite\s*\?\s*\{ cle: 'assetClass'[^}]*lecture: true/s.test(bloc),
      'quand le type est connu, la classe est une ligne en lecture');
    vrai(/modifiable sur la fiche de la ligne/.test(bloc),
      'et la bulle dit où la corriger');
    /* Sans type, la question redevient une vraie question, avec son menu. */
    vrai(/: \{ cle: 'assetClass', label: trad\('Classe d’actif'\), type: 'liste'/.test(bloc),
      'sans type renvoyé, le menu revient');
    /* Un champ en lecture ne rend aucune valeur : la creation doit prendre la
       classe deduite, sinon la ligne naissait sans classe. */
    vrai(/assetClass: deduite \? cat : v\.assetClass/.test(bloc),
      'la ligne créée porte bien la classe déduite');
    /* Et la fiche d'une ligne porte toujours le menu, qui est ce chemin. */
    vrai(/OPTIONS_CLASSE\.map/.test(lireSource('assets/app.js')),
      'la fiche d’une ligne garde le choix de la classe');
  });

  test('le lien classe vers comptes ne survit pas à un champ en lecture', () => {
    /* `askForm` cable `lie` sur `#f_assetClass`. Un champ en lecture ne pose
       aucun element de ce nom : garder le lien aurait leve une exception a
       l'ouverture de la fenetre, c'est-a-dire sur le chemin le plus frequent
       de l'application. */
    const bloc = recherche();
    vrai(/\.\.\.\(deduite \? \{\} : \{ lie: \{ de: 'assetClass', vers: 'account'/.test(bloc),
      'le lien n’est posé que quand la classe est un vrai champ');
    vrai(/const source = \$\(`#f_\$\{lie\.de\}`\)/.test(lireSource('assets/app.js')),
      'askForm attend bien un élément pour la source du lien');
  });

  test('la liste des comptes suit toujours la classe', () => {
    /* L'ordre a l'ecran ne defait pas la dependance : une action ne se loge pas
       sur un portefeuille de cryptomonnaies, et changer la classe refait la
       liste au-dessus d'elle. */
    const bloc = recherche();
    vrai(/lie: \{ de: 'assetClass', vers: 'account'/.test(bloc),
      'les deux champs restent liés');
    vrai(/options: comptesPourListe\(cat\)/.test(bloc),
      'et la liste s’ouvre déjà filtrée par la classe déduite du type');
  });

  test('la barre de recherche est posée, pas dépliée', () => {
    /* Un depliant coute un clic pour reveler ce que le titre de la carte
       annonce deja, et son resume redisait mot pour mot le champ qu'il
       cachait. Un panneau se replie quand il porte des reglages qu'on ne
       touche qu'une fois ; celui-ci porte le geste pour lequel on vient. */
    const src = lireSource('assets/app.js');
    const carte = src.slice(src.indexOf('function symbolSearchCard('),
                            src.indexOf('function mountSymbolSearch('));
    vrai(carte.length > 100, 'la carte se relit depuis sa source');
    vrai(!/<details/.test(carte), 'plus de dépliant sur la carte d’ajout');
    vrai(/id="symQuery"/.test(carte), 'le champ est posé directement');
    vrai(!/outilsAjoutOuvert|pliAjout/.test(src),
      'et l’état du dépliant ne survit pas au dépliant : une variable que plus '
      + 'personne ne lit est la moitié qu’on oublie en retirant un affichage');
  });

  test('le bouton de recherche parle la langue de la page', () => {
    /* Il etait pose sans passer par la traduction, donc invisible au
       rattrapage : « Chercher » s'affichait en francais dans les deux
       versions, au milieu d'une carte entierement anglaise. */
    const src = lireSource('assets/app.js');
    const carte = src.slice(src.indexOf('function symbolSearchCard('),
                            src.indexOf('function mountSymbolSearch('));
    vrai(!/>Chercher</.test(carte), 'plus de libellé posé en dur');
    enLangue('en', () => { eq(trad('Chercher'), 'Search', 'la clé répond en anglais'); });
  });

  test('la carte ne donne pas son propre mode d’emploi', () => {
    /* Le renvoi d'en-tete disait « cherche, puis "+ Nouvelle ligne" » : il
       nommait un controle qu'on a sous les yeux, donc le premier a changer de
       nom l'a rendu faux — et un mode d'emploi faux se lit avant le controle
       qu'il decrit. Un renvoi de carte porte ce que la carte ne montre pas. */
    const src = lireSource('assets/app.js');
    const carte = src.slice(src.indexOf('function symbolSearchCard('),
                            src.indexOf('function mountSymbolSearch('));
    vrai(!/class="hint"/.test(carte), 'pas de renvoi en tête de la carte d’ajout');
    vrai(!/Nouvelle ligne/.test(carte),
      'et plus une seule mention du choix de menu retiré');
    vrai(!/Nouvelle ligne »/.test(lireSource('assets/i18n.js')),
      'sa clé de traduction part avec lui');
  });

  test('le tableau des lignes ne porte pas de colonne de suppression', () => {
    /* Une croix par ligne, collee contre le nom qu'on clique pour lire, met un
       geste irreversible a portee de pouce du geste de lecture — et cinq croix
       alignees font une colonne de destruction la ou le tableau sert a
       comparer. Meme regle que l'annulation, sortie du journal des ventes. */
    const src = lireSource('assets/app.js');
    const vue = src.slice(src.indexOf('function viewPositions('),
                          src.indexOf('function mountPositions('));
    vrai(!/del-position/.test(src),
      'ni la colonne ni l’action qui la servait : une action sans porte est la '
      + 'moitié qu’on oublie en retirant un affichage');
    /* La suppression n'est pas perdue : elle vit dans la fiche de la ligne,
       avec les autres actes. Le retrait serait une perte sans elle. */
    vrai(/posDelete/.test(src), 'la fiche d’une ligne porte toujours sa suppression');
    /* Le compte de colonnes doit avoir suivi : un colspan qui ment laisse une
       cellule vide en trop sous le tableau, et l'etat vide deborde. */
    const enTetes = (vue.match(/sortableTh\(/g) || []).length;
    vrai(/colspan="9" class="empty"/.test(vue),
      `l’état vide couvre ${enTetes} colonnes, pas une de plus`);
    vrai(!/<th><\/th>/.test(vue), 'plus d’en-tête vide pour une colonne disparue');
  });

  test('une enveloppe porte les deux natures de support', () => {
    /* Une assurance-vie et un PER ne sont pas des comptes-titres : ils portent
       un ETF qui cote, un fonds euros qui ne cote nulle part, une SCPI, un
       fonds maison sans ISIN. Le modele le permettait deja — `lignesDe()`
       fusionne les lignes cotees et les lignes manuelles — mais trois listes
       blanches le contredisaient. */
    for (const id of ['av', 'per']) {
      const t = TYPES_COMPTE.find(x => x.id === id);
      vrai(t.titres, `${t.label} porte des titres cotés`);
      vrai(t.melange, `${t.label} porte aussi des supports qui ne cotent pas`);
      for (const classe of ['actions', 'obligations', 'immobilier', 'nonCote']) {
        vrai(t.classes.includes(classe), `${t.label} accepte ${classe}`);
      }
    }
  });

  test('et une SCPI trouve enfin son contrat', () => {
    /* Sans `immobilier` dans la liste, `comptesPourCategorie()` n'offrait jamais
       l'assurance-vie a qui ajoute une part de SCPI : la ligne restait sans
       domicile, et rien ne disait pourquoi. */
    Fixture.poser(s => {
      s.comptes.push({ id: 'c_av', etabId: s.etabs[0].id, type: 'av', statut: 'actif',
                       cash: [], lignes: [] });
    });
    const ids = comptesPourCategorie('immobilier').map(c => c.id);
    vrai(ids.includes('c_av'), 'le contrat est proposé pour une SCPI');
    /* Et il reste proposé pour ce qui cote : c'est le point de départ. */
    vrai(comptesPourCategorie('actions').map(c => c.id).includes('c_av'),
      'comme pour un MSCI World, qui marchait déjà');
  });

  test('mais un contrat n’est pas un bien immobilier pour autant', () => {
    /* La nuance n'existait pas : « peut porter de l'immobilier » servait a dire
       « est un bien », donc le contrat entier serait devenu un bien, vocabulaire
       compris. */
    Fixture.poser(s => {
      s.comptes.push({ id: 'c_av', etabId: s.etabs[0].id, type: 'av', statut: 'actif',
                       cash: [], lignes: [] });
    });
    vrai(!comptesBiens().some(c => c.id === 'c_av'),
      'le contrat ne rejoint pas la liste des biens');
    eq(contenantDuType('av').titre, 'Assureur ou courtier',
      'et on ne lui demande pas dans quelle banque le tenir');
    eq(contenantDuType('per').titre, 'Assureur ou courtier', 'le PER non plus');
    eq(contenantDuType('cto').titre, 'Banque ou courtier', 'un CTO garde son mot');
    eq(contenantDuType('immo').titre, 'Bien immobilier', 'et un bien le sien');
  });

  test('la fiche d’une enveloppe porte les deux portes', () => {
    const src = lireSource('assets/app.js');
    const fiche = src.slice(src.indexOf('function viewFicheCompte('),
                            src.indexOf('function viewFicheEtab('));
    vrai(/t\.titres \?.*data-action="ajouter-ligne"/s.test(fiche),
      'ce qui cote passe par la recherche');
    vrai(/!t\.titres \|\| t\.melange \?.*data-action="ajouter-placement"/s.test(fiche),
      'ce qui ne cote pas se saisit sur place, et seulement là où c’est vrai');
  });

  test('le support se demande quand le type en accepte plusieurs', () => {
    /* `t.classes.find(x => x !== 'liquidites')` rendait « actions » : sur une
       enveloppe, un fonds euros et une SCPI tombaient tous deux en actifs de
       marche sans que rien ne le dise. Un fait se declare. */
    const src = lireSource('assets/app.js');
    const bloc = src.slice(src.indexOf("async 'ajouter-placement'"),
                           src.indexOf("async 'ajouter-placement'") + 2000);
    vrai(/const possibles = \(t\.classes \|\| \[\]\)\.filter/.test(bloc),
      'les supports possibles se dérivent de la liste du type');
    vrai(/demandeSupport = possibles\.length > 1/.test(bloc),
      'la question ne se pose que s’il y a plusieurs réponses');
    vrai(/classe = demandeSupport \? \(v\.classe \|\| parDefaut\) : parDefaut/.test(bloc),
      'et la réponse est celle qui est rangée sur la ligne');
  });

  test('la date d’ouverture ne promet plus une règle qui n’existe pas', () => {
    /* Le champ annonçait « elle conditionne la disponibilite, cinq ans pour un
       PEA ». C'etait faux, et volontairement : un PEA de moins de cinq ans
       n'est pas bloque au sens de l'autonomie, on casse le plan et l'argent
       arrive en quelques jours. `mobilisabilite` recevait donc une date qu'elle
       ne lisait jamais — un parametre mort qui faisait croire a une regle. */
    const src = lireSource('assets/store.js');
    const fn = src.slice(src.indexOf('function mobilisabilite('),
                         src.indexOf('function mobilisabilite(') + 2000);
    vrai(!/ouvertLe/.test(fn.slice(0, fn.indexOf('\n}'))),
      'la disponibilité ne dépend d’aucune date, signature comprise');
    vrai(!/conditionne la disponibilité/.test(lireSource('assets/app.js')),
      'et le texte d’aide ne prétend plus qu’une date conditionne la disponibilité');
    /* La preuve par le comportement : deux PEA d'anciennetes opposees. */
    eq(mobilisabilite('actions', 'pea'), mobilisabilite('actions', 'pea'),
      'la fonction ne prend plus que la classe et le type');
    eq(mobilisabilite('actions', 'per'), 'bloque',
      'seul le PER reste fermé, et par sa nature, pas par sa date');
  });

  test('mais l’ancienneté sert enfin à quelque chose', () => {
    /* Huit ans pour une assurance-vie, cinq pour un PEA : le repere que tout
       detenteur guette, et l'application connaissait la date sans rien en
       faire. Ce sont des seuils fiscaux, pas des barrieres a la sortie, et la
       bulle le dit — sinon on retomberait dans la promesse d'avant. */
    auJour('2026-08-17', () => {
      const av = ancienneteCompte({ type: 'av', ouvertLe: '2018-09-01' });
      eq(av.seuilAns, 8, 'une assurance-vie vise huit ans');
      eq(av.annees, 7, 'ouverte depuis sept ans');
      eq(av.reste, 11, 'et onze mois');
      eq(av.atteint, false, 'le seuil n’est pas encore atteint');
      eq(av.seuilLe, '2026-09-01', 'il tombe le 1er septembre 2026');
      const pea = ancienneteCompte({ type: 'pea', ouvertLe: '2019-01-01' });
      eq(pea.seuilAns, 5, 'un PEA vise cinq ans');
      eq(pea.atteint, true, 'et celui-là les a passés');
    });
    /* Les types sans seuil d'anciennete ne rendent rien : un PER se libere sur
       un evenement, pas sur une duree, et un compte courant n'a pas de seuil. */
    for (const type of ['per', 'cto', 'courant', 'immo']) {
      eq(ancienneteCompte({ type, ouvertLe: '2015-01-01' }), null,
        `${type} n’a pas de seuil d’ancienneté`);
    }
    eq(ancienneteCompte({ type: 'av' }), null, 'et sans date, rien à afficher');
  });

  test('un fonds euros a une porte pour entrer', () => {
    /* La poche existait, la projection la traitait, et aucun ecran ne
       permettait d'y ranger quoi que ce soit : la classe manquait dans la liste
       des contrats, donc le menu des supports ne l'offrait pas. Une poche sans
       porte est une poche qui reste vide.

       Et `pocheDeClasse('garanti')` retombait sur le defaut « actions », ce qui
       faisait proposer un PEA pour y loger un fonds euros. */
    eq(pocheDeClasse('garanti'), 'garanti',
      'une poche passée en catégorie se rend elle-même');
    for (const id of ['av', 'per']) {
      const t = TYPES_COMPTE.find(x => x.id === id);
      vrai(t.classes.includes('garanti'), `${t.label} accepte un capital garanti`);
    }
    /* Le menu des supports se derive de cette liste : il l'offre donc. */
    const t = TYPES_COMPTE.find(x => x.id === 'av');
    const possibles = t.classes.filter(x => x !== 'liquidites');
    vrai(possibles.includes('garanti'),
      'le menu « Support » d’un contrat propose « Capital garanti »');
    /* Et seuls les comptes qui l'acceptent sont proposes : un PEA n'y est pas. */
    Fixture.poser(s => {
      s.etabs.push({ id: 'e_av', nom: 'Assureur', notes: '', dettes: [] });
      s.comptes.push({ id: 'c_av2', etabId: 'e_av', type: 'av', statut: 'actif',
        ouvertLe: '2020-01-01', cash: [], lignes: [] });
    });
    const ids = comptesPourCategorie('garanti').map(c => c.id);
    vrai(ids.includes('c_av2'), 'le contrat est proposé');
    vrai(!ids.includes('c_pea'), 'le PEA ne l’est pas : on n’y loge pas de fonds euros');
  });

  test('la pile du graphique fait le total, à chaque point', () => {
    /* Deux enumerations ecrites a la main n'avaient pas suivi la septieme
       poche. Le point « Auj. » de l'historique liste six poches et annonce
       `t.brut`, qui en compte sept : la pile perdait le capital garanti et le
       total le gardait. La courbe et son propre total se contredisaient.

       Le graphique trace des poches de COMPTE, la ou la carte des classes trace
       des classes de ligne : un releve mensuel note des montants par compte, et
       rien n'y dit quelle part d'une assurance-vie etait en fonds euros il y a
       huit mois. Le capital garanti rejoint donc la bourse dans cette courbe,
       comme les obligations le font depuis toujours. */
    Fixture.poser(s => {
      s.etabs.push({ id: 'e_av', nom: 'Assureur', notes: '', dettes: [] });
      s.comptes.push({ id: 'c_av', etabId: 'e_av', type: 'av', statut: 'actif',
        ouvertLe: '2018-09-01', cash: [],
        lignes: [{ id: 'g', classe: 'garanti', libelle: 'Fonds euros',
                   valeur: 10000, prixDeRevient: 10000 }] });
    });
    /* `SERIES_PATRIMOINE` vit dans app.js, que le harnais ne charge pas : les
       clefs se relisent dans la source, ce qui verifie du meme coup qu'elles y
       sont bien declarees. */
    const src = lireSource('assets/app.js');
    const bloc = src.slice(src.indexOf('const SERIES_PATRIMOINE = () => ['),
                           src.indexOf('function seriesUtiles('));
    const cles = [...bloc.matchAll(/key: '([a-z]+)'/g)].map(m => m[1]);
    vrai(cles.length >= 7, 'les bandes se relisent depuis la source');
    vrai(cles.includes('garanti'),
      'le capital garanti a sa bande : le fondre dans « Actifs de marché » '
      + 'affichait un patrimoine entièrement en fonds euros comme 100 % de marché');
    for (const p of historySeries()) {
      const somme = cles.reduce((s, k) => s + num(p[k]), 0);
      pres(somme, num(p.total), `la pile de ${p.label} doit faire son total`);
    }
  });

  test('et le panneau de la projection aussi', () => {
    /* Le total vient de `q.marche + q.autres`, donc une poche absente de la
       liste se compte dans le total sans apparaitre : la fenetre annonçait
       86 551 EUR pour quatre lignes qui en faisaient 76 551, l'ecart valant
       exactement le capital garanti. */
    Fixture.poser(s => {
      s.etabs.push({ id: 'e_av', nom: 'Assureur', notes: '', dettes: [] });
      s.comptes.push({ id: 'c_av', etabId: 'e_av', type: 'av', statut: 'actif',
        ouvertLe: '2018-09-01', cash: [],
        lignes: [{ id: 'g', classe: 'garanti', libelle: 'Fonds euros',
                   valeur: 10000, prixDeRevient: 10000 }] });
    });
    const q = pochesProjection();
    /* Les poches que la projection distingue, chacune doit avoir sa ligne. */
    const src = lireSource('assets/app.js');
    const panneau = src.slice(src.indexOf('baseProjection: () => {'),
                              src.indexOf('immobilierNet: () => {'));
    for (const [poche, motif] of [['marche', /trad\('Actifs de marché'\)/],
                                  ['garanti', /trad\('Capital garanti'\)/],
                                  ['nonCote', /trad\('Non coté'\)/],
                                  ['liquidites', /trad\('Liquidités'\)/]]) {
      vrai(motif.test(panneau), `la poche ${poche} a sa ligne dans le panneau`);
    }
    pres(q.marche + q.autres,
      q.marche + q.nonCote + q.liquidites + q.garanti + q.projet,
      'le total du panneau est bien la somme des poches qu’il liste');
    /* Et avec une ligne reservee, la ou le double comptage guettait : ces euros
       doivent quitter leur poche d'origine, sinon ils figurent deux fois. */
    Fixture.poser(s => {
      s.etabs.push({ id: 'e_av', nom: 'Assureur', notes: '', dettes: [] });
      s.comptes.push({ id: 'c_av', etabId: 'e_av', type: 'av', statut: 'actif',
        ouvertLe: '2018-09-01', cash: [],
        lignes: [{ id: 'r', classe: 'actions', libelle: 'Apport', projet: true,
                   valeur: 40000, prixDeRevient: 40000 }] });
    });
    const t2 = nowTotals(), q2 = pochesProjection(t2);
    eq(Math.round(q2.projet), 40000, 'la poche du réservé porte les 40 000 €');
    /* Les lignes du panneau, reconstituees comme la vue les calcule. */
    const lignes = [num(t2.bourse) - num(t2.projetParPoche.bourse),
                    q2.garanti,
                    num(t2.crypto) - num(t2.projetParPoche.crypto),
                    q2.nonCote, q2.liquidites, q2.projet];
    pres(lignes.reduce((a, b) => a + b, 0), q2.marche + q2.autres,
      'la somme des lignes fait le total, même avec un montant réservé');
  });

  test('la carte du jour se trie par chacune de ses colonnes', () => {
    /* La carte repond a « qu'est-ce qui a bouge aujourd'hui », et la reponse
       n'est pas la meme selon qu'on cherche la plus forte variation ou le plus
       gros effet en euros : l'une se lit en pourcentage sur une petite ligne,
       l'autre en euros sur une grosse. */
    const src = lireSource('assets/app.js');
    const fn = src.slice(src.indexOf('function trierJour('),
                         src.indexOf('function sortableTh('));
    for (const cle of ['nom', 'poids', 'pct', 'eur']) {
      vrai(new RegExp(`\\b${cle}:`).test(fn), `la colonne « ${cle} » se trie`);
    }
    /* Trois temps, comme le tableau des lignes : le troisieme clic rend
       l'ordre naturel plutot que de bloquer sur un tri qu'on ne peut plus
       defaire. */
    const action = src.slice(src.indexOf("'sort-jour'("), src.indexOf("'sort-positions'("));
    vrai(/jourSort = \{ key, dir: 'desc' \}/.test(action), 'premier clic : décroissant');
    vrai(/dir: 'asc'/.test(action), 'deuxième : croissant');
    vrai(/jourSort = null/.test(action), 'troisième : retour à l’ordre naturel');
    /* Les lignes hors seance vont en queue dans les deux sens numeriques :
       elles n'ont pas varie, un zero les melangerait aux lignes stables. */
    vrai(/horsSeance \? -Infinity/.test(fn),
      'une ligne sans cotation du jour ne se classe pas comme une ligne à plat');
  });

  test('l’assurance emprunteur ne rembourse pas le capital', () => {
    /* Elle vaut couramment 0,3 a 0,4 % du capital emprunte par an, elle est
       prelevee avec l'echeance, et le modele la comptait comme du
       remboursement : sur 250 000 EUR, c'est 75 EUR par mois qui faisaient
       descendre la dette dans la projection alors qu'ils partent en prime. */
    const credit = assurance => ({ id: 'd', libelle: 'Prêt', montant: 200000,
      initial: 250000, taux: 3.5, mensualite: 1251,
      ...(assurance ? { tauxAssurance: 0.36 } : {}), verifieLe: '2025-08-17' });
    auJour('2026-08-17', () => {
      const sans = projectionCredit(credit(false));
      const avec = projectionCredit(credit(true));
      eq(sans.moisDepuis, 12, 'douze mois projetés');
      vrai(avec.projete > sans.projete,
        'avec l’assurance, la dette descend moins vite : la prime ne rembourse rien');
      /* 250 000 x 0,36 % / 12 = 75 EUR par mois qui ne remboursent pas. Sur
         douze mois, la difference de capital restant du s'en approche, aux
         interets pres que ces 75 EUR n'ont pas evites. */
      const ecart = avec.projete - sans.projete;
      vrai(ecart > 900 && ecart < 950,
        `douze primes de 75 € font ${Math.round(ecart)} € de dette en plus`);
    });
    /* Sans capital initial connu, la base est le restant du : la prime est
       sous-estimee, ce qui est le bon sens de l'erreur. */
    auJour('2026-08-17', () => {
      const d = { ...credit(true) }; delete d.initial;
      vrai(projectionCredit(d).projete > projectionCredit(credit(false)).projete,
        'et sans capital initial, elle compte quand même');
    });
  });

  test('de l’argent déjà promis ne travaille pas trente ans', () => {
    /* Le cash portait deja « Projet prevu », mais l'affectation s'arretait au
       cash : le cas le plus courant est ailleurs, l'assurance-vie qui financera
       l'apport d'un achat dans deux ans. Ces euros se lisaient comme du
       patrimoine long terme et entraient dans la projection a trente ans.

       Ce n'est pas le reglage de disponibilite, qui vit a cote : celui-la dit
       quand on POURRAIT vendre, celui-ci dit que c'est deja engage. */
    const poser = reserve => Fixture.poser(s => {
      s.meta.projRate = 8; s.meta.projRateAutres = 0; s.meta.projRateGaranti = 0;
      s.meta.projMonthly = 0; s.meta.projInflation = 0;
      s.etabs.push({ id: 'e_av', nom: 'Assureur', notes: '', dettes: [] });
      s.comptes.push({ id: 'c_av', etabId: 'e_av', type: 'av', statut: 'actif',
        ouvertLe: '2018-09-01', cash: [],
        lignes: [{ id: 'l1', classe: 'actions', libelle: 'ETF Monde',
                   valeur: 40000, prixDeRevient: 40000, ...(reserve ? { projet: true } : {}) }] });
    });

    poser(false);
    const libre = capitalisation({ years: 10 }).points[10];
    poser(true);
    const q = pochesProjection();
    eq(Math.round(q.projet), 40000, 'les 40 000 € réservés ont leur poche');
    /* Et ils ont quitte celle qui les portait, sinon ils compteraient deux fois :
       la base de la projection vaut toujours le brut moins ce qui est porte a
       plat par ailleurs, l'immobilier et les biens. */
    const t = nowTotals();
    pres(q.marche + q.autres, num(t.brut) - num(t.immo) - num(t.biens),
      'la base de la projection ne double ni ne perd rien');
    const promis = capitalisation({ years: 10 }).points[10];
    /* Portes a plat : dix ans plus tard, toujours 40 000 de cette ligne. */
    vrai(promis.total < libre.total,
      'un argent promis ne produit pas ce qu’il produisait en capitalisant');
    pres(libre.total - promis.total, 40000 * (Math.pow(1.08, 10) - 1),
      'la différence vaut exactement ce que 8 % pendant dix ans lui donnaient');
    /* La ligne reste dans sa classe partout ailleurs, et le brut ne bouge pas :
       reserver ne deplace rien et ne fait rien disparaitre. C'est toujours un
       ETF, l'allocation doit le dire, seule la projection change de traitement. */
    poser(false);
    const avant = { brut: patrimoine().brut, actions: patrimoine().classes.actions };
    poser(true);
    pres(patrimoine().classes.actions, avant.actions,
      'l’allocation continue de la compter en actifs de marché');
    pres(patrimoine().brut, avant.brut, 'et le patrimoine brut est le même');
  });

  test('un capital garanti ne capitalise pas au taux du marché', () => {
    /* Le defaut qui a motive la poche. La projection repartit le patrimoine par
       poche, et un fonds euros tombait dans « marche » : 8 % l'an sur un
       capital garanti. Pour qui detient l'essentiel de son assurance-vie en
       fonds euros, c'est la moitie d'un patrimoine projetee a trois fois son
       rendement reel — et toujours du cote flatteur, donc invisible. */
    const poser = () => Fixture.poser(s => {
      s.meta.projRate = 8; s.meta.projRateAutres = 0; s.meta.projMonthly = 0;
      s.meta.projInflation = 0; s.meta.projRateGaranti = 0;
      s.etabs.push({ id: 'e_av', nom: 'Assureur', notes: '', dettes: [] });
      s.comptes.push({ id: 'c_av', etabId: 'e_av', type: 'av', statut: 'actif',
        ouvertLe: '2020-01-01', cash: [],
        lignes: [{ id: 'l_fe', classe: 'garanti', libelle: 'Fonds euros',
                   valeur: 100000, prixDeRevient: 100000 }] });
    });
    poser();
    eq(Math.round(pochesProjection().garanti), 100000,
      'les 100 000 € sont dans la poche du capital garanti');
    eq(Math.round(pochesProjection().marche - pochesProjection().garanti * 0),
      Math.round(pochesProjection().marche),
      'et pas dans celle du marché');
    const plat = capitalisation({ years: 10 });
    const j10 = plat.points[10];
    /* Taux a zero : cent mille euros restent cent mille. Au taux du marche ils
       en feraient plus de deux cent seize mille. */
    pres(j10.gainsGaranti, 0, 'à taux nul, un capital garanti ne produit rien');
    /* Et quand on affirme un taux, il s'applique — le sien, pas celui du marche. */
    poser();
    Store.state.meta.projRateGaranti = 2.5;
    const avec = capitalisation({ years: 10 }).points[10];
    pres(avec.gainsGaranti, 100000 * (Math.pow(1.025, 10) - 1),
      'à 2,5 %, il produit ce que 2,5 % produisent');
    vrai(avec.gainsGaranti < 30000,
      'très loin des 116 000 € que le taux du marché lui aurait prêtés');
  });

  test('une carte qui porte deux natures ne s’appelle pas d’une seule', () => {
    /* Le haut de la carte est un flux de budget : ce que les revenus laissent
       une fois les charges et les depenses retirees. Le bas est la variation du
       patrimoine net d'un mois sur l'autre, qui contient les marches, les
       apports exterieurs et le capital rembourse d'un credit. Sous le titre
       « Epargne mensuelle », le second se lisait comme de l'epargne.

       Et « Ecart avec la theorie » invitait a y voir une erreur de saisie, la
       ou il n'y a que ce que le budget ne peut pas prevoir. Un intitule dit ce
       qu'il compte. */
    const src = lireSource('assets/app.js');
    vrai(/<h2>\$\{trad\('Épargne et croissance'\)\}<\/h2>/.test(src),
      'le titre nomme les deux natures');
    vrai(!/trad\('Écart avec la théorie'\)/.test(src),
      'plus d’« écart », qui se lisait comme une erreur');
    vrai(/trad\('Ce qui ne vient pas du budget'\)/.test(src),
      'l’intitulé dit ce que la ligne compte');
    /* Les deux montants restent ceux du calcul : renommer ne recalcule rien. */
    Fixture.poser();
    const rec = savingsReconciliation();
    if (rec.realPerMonth != null) {
      pres(rec.gap, rec.realPerMonth - rec.theoretical,
        'la ligne reste la différence entre le constaté et le prévu');
    }
  });

  test('un contrat plein d’ETF ne compte pas comme de la pierre', () => {
    /* Le defaut coutait cher et ne se voyait nulle part : `gAff`, la poche
       d'affichage, se derivait de « peut porter de l'immobilier ». Une
       enveloppe qui accepte une SCPI parmi cinq classes basculait donc en
       entier dans la bande immobilier du graphique, ETF compris, et sa valeur
       quittait la poche « marche » de la projection pour celle des biens.

       Le controle porte sur les totaux, la ou il se voyait le moins : la somme
       ne bougeait pas, seule sa repartition mentait. */
    Fixture.poser(s => {
      s.etabs.push({ id: 'e_av', nom: 'Assureur', notes: '', dettes: [] });
      s.comptes.push({ id: 'c_av', etabId: 'e_av', type: 'av', statut: 'actif',
        ouvertLe: '2020-01-01', cash: [],
        lignes: [{ id: 'l_av', classe: 'actions', libelle: 'ETF Monde',
                   valeur: 50000, prixDeRevient: 40000 }] });
    });
    eq(ACC['c_av'].gAff, 'bourse',
      'un contrat s’affiche avec les actifs de marché, pas avec les biens');
    const avant = nowTotals();
    /* Et la meme enveloppe qui porte vraiment une SCPI n'y bascule pas non plus :
       c'est la ligne qui est de l'immobilier, pas le contrat. */
    Fixture.poser(s => {
      s.etabs.push({ id: 'e_av', nom: 'Assureur', notes: '', dettes: [] });
      s.comptes.push({ id: 'c_av', etabId: 'e_av', type: 'av', statut: 'actif',
        ouvertLe: '2020-01-01', cash: [],
        lignes: [{ id: 'l_av', classe: 'immobilier', libelle: 'SCPI',
                   valeur: 50000, prixDeRevient: 50000 }] });
    });
    eq(ACC['c_av'].gAff, 'bourse', 'le contenant reste un contrat');
    vrai(num(avant.bourse) > 0, 'et la poche de marché porte bien le contrat');
  });

  test('un contrat n’a pas de poche de cash', () => {
    /* L'argent verse sur une assurance-vie est sur un support des son arrivee,
       au pire le fonds euros : « Cash a investir » y inventait une poche qui
       n'existe pas, comptee ensuite dans les liquidites de l'accueil et dans
       les paliers d'autonomie. */
    for (const id of ['av', 'per']) {
      const t = TYPES_COMPTE.find(x => x.id === id);
      vrai(t.sansCash, `${t.label} ne porte pas de cash`);
      /* Mais « liquidites » reste dans la liste : le mot y sert aussi a
         accepter un support monetaire, qui est un placement et non du cash.
         Deux choses sous un seul mot, d'ou deux reglages — les confondre
         aurait interdit le fonds monetaire en voulant retirer la poche. */
      vrai(t.classes.includes('liquidites'),
        `${t.label} accepte toujours un support monétaire`);
    }
    eq(!!TYPES_COMPTE.find(x => x.id === 'cto').sansCash, false,
      'un compte-titres garde la sienne : le cash y attend vraiment d’être investi');
  });

  test('mais le cash déjà saisi ne disparaît pas avec la carte', () => {
    /* Retirer un ecran ne doit pas emporter ce que quelqu'un y avait saisi :
       la carte reste des qu'elle porte quelque chose, pour qu'on puisse
       reclasser ces euros a la main. */
    const src = lireSource('assets/app.js');
    vrai(/\(t\.sansCash \|\| !t\.classes\.includes\('liquidites'\)\) && !\(c\.cash \|\| \[\]\)\.length \? ''/.test(src),
      'la carte de trésorerie ne se masque que si elle est vide');
    /* Et l'assistant ne pose plus les trois questions du cash. */
    vrai(/\.\.\.\(t\.sansCash \? \[\] : \[/.test(src),
      'les trois champs du cash sautent à la création');
    vrai(/t\.sansCash \? trad\('Nommer le contrat'\)/.test(src),
      'et l’étape dit ce qu’elle demande vraiment');
  });

  test('un contenant vide n’est jamais le choix par défaut', () => {
    /* Sans compte rattache, `contenantDeLEtab` n'a plus de famille a deriver et
       retombe sur « banque ou courtier » : un « Studio » dont le bien a ete
       supprime se proposait partout, et `proposables[0]` en faisait le defaut —
       la fenetre qui demande chez quel assureur tenir un contrat s'ouvrait sur
       un studio. On continue de le proposer, en dernier : le retirer ferait
       retaper un nom qui existe, donc deux etablissements homonymes. */
    const src = lireSource('assets/app.js');
    vrai(/\.\.\.ETABS\(\)\.filter\(e => aDesComptes\(e\) && memeFamille\(e\)\),\s*\.\.\.ETABS\(\)\.filter\(e => !aDesComptes\(e\)\)/.test(src),
      'ceux qui ont des comptes et la bonne famille passent devant');
    vrai(/valeur: proposables\.find\(e => aDesComptes\(e\) && memeFamille\(e\)\)\?\.id \|\| '__nouveau'/.test(src),
      'et le défaut ne tombe que sur l’un d’eux, sinon sur « + Nouveau »');
  });

  test('l’exemple d’un support parle de son espèce', () => {
    /* « ex. Projet Bordeaux » sous l'intitule d'un fonds euros ne dit pas ce
       qu'on attend : il fait douter d'etre au bon endroit. */
    const src = lireSource('assets/app.js');
    const table = (src.match(/const EXEMPLE_PLACEMENT = \{[^}]*\}/) || [''])[0];
    vrai(table, 'la table des exemples existe');
    /* « Fonds euros » a quitte les obligations pour le capital garanti, qui est
       sa vraie poche : un fonds obligataire baisse quand les taux montent, un
       fonds euros non, et c'est toute la difference que la poche porte. */
    for (const [classe, mot] of [['garanti', 'Fonds euros'], ['obligations', 'obligataire'],
                                 ['actions', 'MSCI World'],
                                 ['immobilier', 'SCPI'], ['nonCote', 'Projet Bordeaux']]) {
      vrai(new RegExp(`${classe}:\\s*'ex\\. [^']*${mot}`).test(table),
        `${classe} propose un exemple de son espèce`);
    }
  });

  test('sous 768 px, le bouton d’ajout ne s’étire pas sur toute la carte', () => {
    /* La regle valait pour le menu qu'il remplace : un menu s'etire parce que
       ses options portent de longs noms et qu'il les tronque sans rien dire. Un
       libelle de deux mots etendu sur toute la carte devient un aplat clair par
       resultat, et six titres cherches se lisent comme six boutons separes par
       du texte. */
    const css = lireSource('assets/styles.css');
    const regles = css.match(/table\.cols-nom-action[^{]*\{[^}]*\}/g) || [];
    const etires = regles.filter(r => /width:\s*100%/.test(r));
    for (const r of etires) {
      vrai(!/\.btn/.test(r), 'le bouton d’ajout ne doit pas prendre toute la largeur : ' + r);
    }
    vrai(etires.some(r => /select/.test(r)),
      'le menu, lui, garde sa pleine largeur : il tronque ses options sans le dire');
  });
});

/* ------------------------------------------------------------------
   La reserve fiscale se dit une fois, dans une bulle
   ------------------------------------------------------------------ */
suite('La réserve fiscale se dit dans une bulle', () => {

  const journal = () => {
    const src = lireSource('assets/app.js');
    return src.slice(src.indexOf('function salesCard('),
                     src.indexOf('function viewAllocation('));
  };

  test('elle vit sur le titre de la carte, plus sous la liste', () => {
    const bloc = journal();
    vrai(/\$\{aide\(trad\('Résultat brut, avant frais et fiscalité/.test(bloc),
      'la réserve est une bulle du titre : elle vaut pour chaque ligne du '
      + 'journal, et ne se relit pas');
    vrai(!/<p class="hint"[^>]*>\$\{trad\('Résultat brut/.test(bloc),
      'et plus une phrase en pied de carte, qui prenait trois lignes d’écran');
  });

  test('et sa traduction reste celle qui existait', () => {
    /* La cle ne bouge pas en changeant de place : une bulle qui perd sa
       traduction s'afficherait en francais dans la version anglaise, et c'est
       exactement le defaut que cette phrase-la a deja eu. */
    const phrase = 'Résultat brut, avant frais et fiscalité : le traitement fiscal '
      + 'dépend de l’enveloppe (PEA, CTO) et de ta situation.';
    enLangue('en', () => {
      vrai(/^Gross result/.test(trad(phrase)), 'la version anglaise répond');
    });
  });
});

/* ------------------------------------------------------------------
   L'horizon retenu se marque sans se nommer
   ------------------------------------------------------------------ */
suite('L’horizon retenu se marque sans se nommer', () => {

  test('le libellé quitte la colonne la plus étroite', () => {
    const src = lireSource('assets/app.js');
    vrai(!/trad\('horizon retenu'\)/.test(src),
      'le libellé élargissait la première colonne, et « Après inflation » '
      + 'sortait de l’écran à 375 px');
    vrai(!/"horizon retenu"/.test(lireSource('assets/i18n.js')),
      'sa clé de traduction part avec lui : une clé que personne n’appelle '
      + 'survit à tous les nettoyages');
  });

  test('la correspondance avec le réglage reste visible', () => {
    /* Sans marque, changer la duree dans le pied du tableau deplace le
       graphique et le total de la premiere carte sans qu'on voie ou le choix a
       atterri ici : une ligne de plus au milieu des jalons, indistincte de ses
       voisines. */
    const src = lireSource('assets/app.js');
    vrai(/class="\$\{retenu \? 'jalon-retenu' : ''\}"/.test(src),
      'la ligne du réglage porte une classe');
    vrai(/retenu \? ' aria-current="true"' : ''/.test(src),
      'et le dit à qui n’a pas les yeux dessus');
  });

  test('le marquage ne coûte aucun pixel de colonne', () => {
    const css = lireSource('assets/styles.css');
    const regles = css.match(/tr\.jalon-retenu[^{]*\{[^}]*\}/g);
    vrai(!!regles, 'la règle CSS existe : une classe posée sans règle ne peint rien');
    const tout = regles.join(' ');
    vrai(/color: var\(--accent\)/.test(tout),
      'c’est l’encre qui désigne la ligne du réglage');
    vrai(!/border|padding|width|box-shadow/.test(tout),
      'ni bordure, ni remplissage, ni filet : chacun élargirait la colonne, donc '
      + 'repousserait la dernière hors de l’écran, ce que ce marquage répare');
    vrai(/\.muted \{ color: var\(--accent\)/.test(tout),
      'l’année suit le libellé : une étiquette ne se coupe pas en deux encres');
  });

  test('le menu ne repropose pas les jalons du tableau', () => {
    /* Le menu s'ouvre sous les jalons : lui faire redire 5, 10, 15 et 20, c'est
       offrir de choisir la ligne qu'on a sous les yeux, et imposer quatre crans
       de defilement avant la premiere option qui apprend quelque chose. */
    eq(PROJECTION_CHOICES[0], 25, 'la liste commence après le dernier jalon fixe');
    const doublons = PROJECTION_HORIZONS.filter(h => PROJECTION_CHOICES.includes(h));
    eq(doublons.join(', '), '', 'ces horizons sont déjà des lignes du tableau');
    vrai(PROJECTION_CHOICES.includes(80), 'et la liste couvre toujours 80 ans');
  });

  test('mais il affiche toujours l’horizon en cours', () => {
    /* La fonction ne depend que de la liste, de `trad` et de l'horizon : on la
       reconstruit depuis sa source et on la joue, plutot que de chercher un
       motif dans une chaine. */
    const src = lireSource('assets/app.js');
    const debut = src.indexOf('const selecteurHorizon = () => {');
    const corps = src.slice(debut, src.indexOf('let hypoOuvert', debut));
    vrai(debut > 0 && corps.length > 100, 'le sélecteur se relit depuis sa source');
    const rendre = h => new Function('PROJECTION_CHOICES', 'trad', 'projHorizon',
      corps + ' return selecteurHorizon();')(PROJECTION_CHOICES, trad, h);
    /* Vingt ans est le defaut, et le tableau le porte : la liste ne l'offre
       donc plus. Un menu qui n'offre pas sa propre valeur affiche la premiere
       venue, et annoncerait 25 ans pendant que la ligne marquee dit 20. */
    vrai(/value="20" selected/.test(rendre(20)),
      'au défaut, le menu montre bien vingt ans');
    const a30 = rendre(30);
    vrai(/value="30" selected/.test(a30), 'et trente ans quand c’est trente ans');
    vrai(!/value="20"/.test(a30),
      'vingt ans quitte alors la liste : le tableau le porte déjà');
  });
});

/* ------------------------------------------------------------------
   La demonstration ne porte aucune enveloppe francaise
   ------------------------------------------------------------------ */
suite('La démonstration ne porte aucune enveloppe française', () => {

  /* Tout ce que la graine donne a lire : les identifiants restent hors du
     compte, ils ne s'affichent nulle part et ce sont les colonnes de seize
     mois de releves. */
  const libelles = () => {
    const out = [];
    for (const t of SEED_ACCOUNT_TYPES) out.push(t.label);
    for (const a of SEED_ACCOUNTS) out.push(a.label, a.short, a.broker, a.alloc || '');
    for (const m of SEED_MONTHLY) out.push(m.comment || '');
    for (const mod of SEED_STRATEGY.models) {
      for (const l of mod.lines) out.push(l.label, l.vehicles);
    }
    return out.filter(Boolean);
  };

  test('le rythme de la démonstration s’explique par son budget', () => {
    /* Les releves mensuels ont ete ecrits a la main, chaque compte montant d'un
       pas regulier, sans que la somme de ces pas soit jamais rapprochee du
       budget. Le patrimoine grimpait de 1 900 EUR par mois quand le budget n'en
       degageait que 1 048 : la carte « Epargne et croissance » annonçait alors
       un « ce qui ne vient pas du budget » plus gros que le budget lui-meme, et
       une demonstration qui montre ça donne l'impression que l'application
       compte mal.

       L'ecart doit rester dans ce qu'un marche peut produire. La demonstration
       porte environ 60 000 EUR d'actifs de marche : 600 EUR par mois font
       12 % l'an, deja genereux, et c'est la borne. */
    Store.state = structuredClone(SEED); Store.migrate(); refreshAccounts();
    const theorique = savingsReconciliation().theoretical;
    vrai(theorique > 0, 'le budget de la démonstration dégage une épargne');
    const tous = monthlyPace().points;
    for (const [nom, n] of [['un an', 12], ['trois ans', 36], ['tout', tous.length]]) {
      const rythme = statsRythme(tous.slice(-n)).average;
      const ecart = Math.abs(rythme - theorique);
      vrai(ecart < 600,
        `sur ${nom}, le patrimoine croît de ${Math.round(rythme)} € par mois quand le `
        + `budget en dégage ${Math.round(theorique)} : ${Math.round(ecart)} € d’écart `
        + `mensuel qu’aucun marché ne produit`);
    }
  });

  test('aucun nom réel n’a repris place dans la graine', () => {
    /* La graine est fictive, et rien ne l'empechait de cesser de l'etre : coller
       un patrimoine reel dedans est le chemin le plus court quand on veut « des
       donnees realistes pour tester », et ce depot est public.

       Le controle liste ce qui est ATTENDU plutot que ce qui est interdit. Une
       liste d'interdits ne protege que de ce qu'on a deja vu, et il faudrait y
       ecrire les vrais noms — dans un depot public, ce serait les publier pour
       les interdire. La liste des etablissements de la demonstration est courte
       et connue : tout ce qui n'y est pas est rouge, y compris le nom qu'on
       n'avait pas prevu. */
    const ATTENDUS = ['Online bank', 'Cash on hand', 'Broker A', 'Broker B',
                      'Fund manager', 'Flat'];
    const trouves = [...new Set(SEED_ACCOUNTS.map(a => a.broker).filter(Boolean))];
    const intrus = trouves.filter(n => !ATTENDUS.includes(n));
    eq(intrus.join(', '), '',
      'un établissement que la démonstration n’a pas inventé est apparu dans la graine');
    /* Et l'inverse : un nom attendu qui disparait veut dire que la graine a ete
       remplacee, ce qui est le geste par lequel un vrai patrimoine y entre. */
    const manquants = ATTENDUS.filter(n => !trouves.includes(n));
    eq(manquants.join(', '), '', 'la graine de démonstration a changé d’établissements');
  });

  test('aucun libellé ne dit « PEA »', () => {
    /* La demonstration s'ouvre en anglais pour qui ne parle pas francais, et un
       PEA n'y existe pas : le lecteur y voit un sigle qu'aucune traduction ne
       peut lui rendre. */
    const fautifs = libelles().filter(m => /PEA/.test(m));
    eq(fautifs.join(' · '), '', 'ces libellés portent encore une enveloppe française');
  });

  test('l’enveloppe quitte la démonstration, pas l’application', () => {
    vrai(!SEED_ACCOUNT_TYPES.some(t => t.id === 'pea'),
      'la graine n’offre plus ce type');
    vrai(!!TYPES_COMPTE.find(t => t.id === 'pea'),
      'mais qui saisit son propre patrimoine le garde dans la liste : c’est le '
      + 'jeu de démonstration qui est international, pas l’application');
  });

  test('chaque compte de la graine tombe sur un type qui existe', () => {
    for (const a of SEED_ACCOUNTS) {
      vrai(SEED_ACCOUNT_TYPES.some(t => t.id === a.type)
        || !!TYPES_COMPTE.find(t => t.id === a.type),
        'le compte ' + a.id + ' porte un type inconnu : ' + a.type);
    }
  });

  test('les deux comptes de titres restent distincts', () => {
    /* Deux enveloppes de meme intitule ne se relisent pas : la colonne courte
       est tout ce qu'un tableau serre affiche. */
    const titres = SEED_ACCOUNTS.filter(a => a.holdings);
    vrai(titres.length >= 2, 'la démonstration en porte bien deux');
    eq(new Set(titres.map(a => a.short)).size, titres.length,
      'deux intitulés courts identiques');
    eq(new Set(SEED_ACCOUNTS.map(a => a.short)).size, SEED_ACCOUNTS.length,
      'et aucun doublon sur l’ensemble des comptes');
  });

  test('après migration, rien à l’écran ne se nomme PEA', () => {
    /* Le libelle affiche ne vient pas de la graine mais du type projete : c'est
       `typeCompte` qui repond, et un compte reste sur son ancien type si on ne
       le change pas. Le controle porte donc sur ce que la vue lirait. */
    Store.state = structuredClone(SEED);
    Store.migrate();
    refreshAccounts();
    for (const a of ACCOUNTS) {
      vrai(!/PEA/.test([a.label, a.short, a.broker].join(' ')),
        'le compte ' + a.id + ' se nomme encore PEA');
      vrai(!/PEA/.test(typeCompte(a.type).label),
        'le compte ' + a.id + ' porte une enveloppe nommée PEA');
    }
  });
});
