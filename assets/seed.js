/* =============================================================
   SEED — jeu de démonstration
   =============================================================
   Tout est éditable dans l'app ; ce fichier n'est utilisé qu'au premier
   lancement (ou après un « Réinitialiser »).

   AUCUNE DONNÉE RÉELLE ICI, ET IL FAUT QUE ÇA RESTE VRAI.
   Ce dépôt est public. Les montants, les comptes, les noms et les
   commentaires ci-dessous sont inventés. Un chiffre constaté recopié ici
   part en ligne au commit suivant, et un dépôt public ne se dépublie pas :
   il est déjà cloné et indexé. Les instruments cités sont des supports
   cotés publiquement, choisis pour que les cours se chargent vraiment dans
   la démonstration ; ils ne décrivent le portefeuille de personne.
   ============================================================= */

/* Types de compte. `group` pilote tous les calculs (cash de vie / bourse /
   private market) ; `label` n'est qu'un regroupement d'affichage. */
const SEED_ACCOUNT_TYPES = [
  { id: 'banque',       label: 'Banks',        group: 'cash' },
  { id: 'pea',          label: 'PEA',            group: 'bourse' },
  { id: 'cto',          label: 'CTO',            group: 'bourse' },
  { id: 'crypto',       label: 'Crypto',         group: 'bourse' },
  { id: 'levier',       label: 'Leverage / debt', group: 'bourse' },
  { id: 'pe',           label: 'Private equity', group: 'pe' },
  { id: 'crowdfunding', label: 'Crowdfunding',   group: 'pe' },
];

/* La version du jeu de demonstration.

   Ce numero se compare a celui range dans l'etat : quand il change, la
   demonstration propose de se recharger. A incrementer des qu'on touche aux
   montants de cette graine. */
const SEED_VERSION = 2;

const SEED_ACCOUNTS = [
  // --- Cash de vie -------------------------------------------------
  { id: 'courant',  label: 'Current account', short: 'Current', group: 'cash', broker: 'Online bank', type: 'banque' },
  { id: 'livret',   label: 'Livret A',       short: 'Livret A', group: 'cash', broker: 'Online bank', type: 'banque' },
  { id: 'especes',  label: 'Cash on hand', short: 'Cash',  group: 'cash', broker: 'Cash on hand', type: 'banque' },

  // --- Bourse ------------------------------------------------------
  // Les deux poches de cash d'un compte titres : de l'argent deja verse au
  // courtier mais pas encore investi. Il compte dans les liquidites, pas
  // dans les actifs de marche.
  { id: 'cashPea',  label: 'Cash PEA',       short: 'Cash PEA', group: 'bourse', broker: 'Broker', type: 'pea', role: 'cash', alloc: 'Cash PEA/CTO' },
  { id: 'cashCto',  label: 'Cash CTO',       short: 'Cash CTO', group: 'bourse', broker: 'Broker', type: 'cto', role: 'cash', alloc: 'Cash PEA/CTO' },
  { id: 'pea',      label: 'PEA',            short: 'PEA',      group: 'bourse', broker: 'Broker', holdings: true, type: 'pea' },
  { id: 'cto',      label: 'Compte titres',  short: 'CTO',      group: 'bourse', broker: 'Broker', holdings: true, type: 'cto' },
  { id: 'crypto',   label: 'Crypto portfolio', short: 'Crypto', group: 'bourse', broker: 'Broker', type: 'crypto', holdings: true, alloc: 'Crypto' },

  // --- Private market ----------------------------------------------
  { id: 'fondsNonCote', label: 'Unlisted fund', short: 'Unlisted', group: 'pe', broker: 'Fund manager', type: 'pe', alloc: 'Private Equity' },

  /* --- Immobilier, et le crédit qui va avec -------------------------
     Sans bien immobilier, la démonstration ne montrait ni la classe
     immobilier, ni un crédit, ni l'écart entre le brut et le net : la
     bascule Net / Brut de l'accueil traçait deux fois la même courbe.

     Le prêt est un compte de rôle « margin » à valeur négative, et c'est
     ainsi que le modèle exprime une dette : à la migration, il devient un
     crédit de son établissement. Il porte donc le même établissement que
     l'appartement, sans quoi la fiche du bien ne trouverait pas son prêt et
     annoncerait 150 000 € comme si tout était acquis.

     Cet établissement s'appelle « Flat » et non « Mortgage lender ». Un bien
     détenu en direct EST son contenant : le groupe porte le nom de la chose,
     et le prêt s'y range comme une dette. Nommer le contenant d'après le
     prêteur mettait l'appartement dans le crédit, alors que c'est le crédit
     qui est sur l'appartement. Le prêteur, lui, se lit sur le crédit. */
  { id: 'appart',     label: 'Flat',            short: 'Flat', group: 'pe',     broker: 'Flat', type: 'immo' },
  { id: 'pretAppart', label: 'Mortgage',        short: 'Loan',        group: 'bourse', broker: 'Flat', type: 'levier', role: 'margin' },
];

/* Lignes mensuelles : { date: 'YYYY-MM-DD', v: { accountId: montant }, comment,
   dettes: capital restant dû à cette date }.

   `dettes` porte le prêt, et non une colonne de compte : un montant négatif
   dans `v` entrerait dans le brut, alors que le net vaut le brut moins les
   dettes. Le mettre aux deux endroits l'aurait compté deux fois. */
const SEED_MONTHLY = [
  { date: '2023-09-01', comment: 'First statement: starting from what is already there', dettes: 88090,
    v: { courant:1346, livret:3650, especes:93, cashPea:360, cashCto:198, pea:6563, cto:3842, crypto:846, fondsNonCote:1000, appart:145000 } },
  { date: '2023-10-01', comment: '', dettes: 87705,
    v: { courant:1392, livret:3900, especes:96, cashPea:720, cashCto:396, pea:7326, cto:4199, crypto:935, fondsNonCote:1000, appart:145000 } },
  { date: '2023-11-01', comment: '', dettes: 87320,
    v: { courant:1438, livret:4150, especes:99, cashPea:1080, cashCto:594, pea:8089, cto:4556, crypto:1024, fondsNonCote:1000, appart:145000 } },
  { date: '2023-12-01', comment: 'Festive season: the current account takes the hit', dettes: 86935,
    v: { courant:1068, livret:4400, especes:102, cashPea:1440, cashCto:792, pea:8852, cto:4913, crypto:1113, fondsNonCote:1000, appart:145000 } },
  { date: '2024-01-01', comment: '', dettes: 86550,
    v: { courant:1114, livret:4650, especes:105, cashPea:1800, cashCto:990, pea:9615, cto:5270, crypto:1202, fondsNonCote:1000, appart:145000 } },
  { date: '2024-02-01', comment: '', dettes: 86165,
    v: { courant:1160, livret:4900, especes:108, cashPea:2160, cashCto:1188, pea:10378, cto:5627, crypto:1291, fondsNonCote:1000, appart:145000 } },
  { date: '2024-03-01', comment: '', dettes: 85780,
    v: { courant:1206, livret:4532, especes:111, cashPea:2520, cashCto:1386, pea:11141, cto:5984, crypto:1380, fondsNonCote:1000, appart:145000 } },
  { date: '2024-04-01', comment: '', dettes: 85395,
    v: { courant:1252, livret:4782, especes:114, cashPea:2880, cashCto:1584, pea:11904, cto:6341, crypto:1469, fondsNonCote:2000, appart:145000 } },
  { date: '2024-05-01', comment: 'First scheduled payment into the PEA', dettes: 85010,
    v: { courant:1298, livret:5032, especes:117, cashPea:324, cashCto:1782, pea:12667, cto:6698, crypto:1558, fondsNonCote:2000, appart:145000 } },
  { date: '2024-06-01', comment: '', dettes: 84625,
    v: { courant:1344, livret:5282, especes:120, cashPea:684, cashCto:1980, pea:13430, cto:7055, crypto:1647, fondsNonCote:2000, appart:145000 } },
  { date: '2024-07-01', comment: '', dettes: 84240,
    v: { courant:1390, livret:5532, especes:74, cashPea:1044, cashCto:2178, pea:14193, cto:7412, crypto:1736, fondsNonCote:2000, appart:145000 } },
  { date: '2024-08-01', comment: 'Markets down across the board over the summer', dettes: 83855,
    v: { courant:1006, livret:5782, especes:77, cashPea:1404, cashCto:2376, pea:13909, cto:7225, crypto:1460, fondsNonCote:2000, appart:145000 } },
  { date: '2024-09-01', comment: '', dettes: 83470,
    v: { courant:1052, livret:6032, especes:80, cashPea:1764, cashCto:2574, pea:14672, cto:7582, crypto:1549, fondsNonCote:2000, appart:145000 } },
  { date: '2024-10-01', comment: '', dettes: 83085,
    v: { courant:1098, livret:6282, especes:83, cashPea:2124, cashCto:2772, pea:15435, cto:7939, crypto:1638, fondsNonCote:2000, appart:145000 } },
  { date: '2024-11-01', comment: '', dettes: 82700,
    v: { courant:1144, livret:6532, especes:86, cashPea:2484, cashCto:297, pea:16198, cto:8296, crypto:1727, fondsNonCote:2000, appart:145000 } },
  { date: '2024-12-01', comment: '', dettes: 82315,
    v: { courant:1190, livret:6782, especes:89, cashPea:2844, cashCto:495, pea:16961, cto:8653, crypto:1816, fondsNonCote:2000, appart:145000 } },
  { date: '2025-01-01', comment: 'Flat revalued at €150,000', dettes: 81930,
    v: { courant:1236, livret:7032, especes:92, cashPea:3204, cashCto:693, pea:17724, cto:9010, crypto:1905, fondsNonCote:2000, appart:150000 } },
  { date: '2025-02-01', comment: '', dettes: 81545,
    v: { courant:1282, livret:7282, especes:95, cashPea:3564, cashCto:891, pea:18487, cto:9367, crypto:1994, fondsNonCote:2000, appart:150000 } },
  { date: '2025-03-01', comment: '', dettes: 81160,
    v: { courant:1328, livret:7532, especes:98, cashPea:3924, cashCto:1089, pea:19250, cto:9724, crypto:2083, fondsNonCote:2000, appart:150000 } },
  { date: '2025-04-01', comment: '', dettes: 80775,
    v: { courant:1374, livret:7782, especes:101, cashPea:4284, cashCto:1287, pea:20013, cto:10081, crypto:2172, fondsNonCote:2000, appart:150000 } },
  { date: '2025-05-01', comment: '', dettes: 80390,
    v: { courant:1420, livret:8032, especes:104, cashPea:464, cashCto:1485, pea:20776, cto:10438, crypto:2261, fondsNonCote:2000, appart:150000 } },
  { date: '2025-06-01', comment: '', dettes: 80005,
    v: { courant:1466, livret:8282, especes:107, cashPea:824, cashCto:1683, pea:21539, cto:10795, crypto:2350, fondsNonCote:2000, appart:150000 } },
  { date: '2025-07-01', comment: 'Holidays: nothing invested this month', dettes: 79620,
    v: { courant:1119, livret:8532, especes:110, cashPea:1184, cashCto:1881, pea:22302, cto:11152, crypto:2439, fondsNonCote:2000, appart:150000 } },
  { date: '2025-08-01', comment: '', dettes: 79235,
    v: { courant:1165, livret:8782, especes:113, cashPea:1544, cashCto:2079, pea:23065, cto:11509, crypto:2528, fondsNonCote:2000, appart:150000 } },
  { date: '2025-09-01', comment: 'Gear replaced, saving slowed down', dettes: 78850,
    v: { courant:1211, livret:8309, especes:116, cashPea:1904, cashCto:2277, pea:23828, cto:11866, crypto:2617, fondsNonCote:2500, appart:150000 } },
  { date: '2025-10-01', comment: '', dettes: 78465,
    v: { courant:1257, livret:8559, especes:119, cashPea:2264, cashCto:248, pea:24591, cto:12223, crypto:2706, fondsNonCote:2500, appart:150000 } },
  { date: '2025-11-01', comment: 'Markets down, unlisted holdings unchanged', dettes: 78080,
    v: { courant:1303, livret:8809, especes:122, cashPea:2624, cashCto:446, pea:24086, cto:11951, crypto:2180, fondsNonCote:2500, appart:150000 } },
  { date: '2025-12-01', comment: '', dettes: 77695,
    v: { courant:1349, livret:9059, especes:187, cashPea:2984, cashCto:644, pea:24849, cto:12308, crypto:2269, fondsNonCote:2500, appart:150000 } },
  { date: '2025-12-31', comment: '2025 close', dettes: 77695,
    v: { courant:1430, livret:9059, especes:187, cashPea:2984, cashCto:644, pea:24849, cto:12308, crypto:2269, fondsNonCote:2500, appart:150000 } },
  { date: '2026-01-01', comment: '', dettes: 77310,
    v: { courant:1395, livret:9309, especes:190, cashPea:334, cashCto:842, pea:25612, cto:12665, crypto:2358, fondsNonCote:2500, appart:150000 } },
  { date: '2026-02-01', comment: '', dettes: 76925,
    v: { courant:1441, livret:9559, especes:193, cashPea:694, cashCto:104, pea:25584, cto:12631, crypto:2153, fondsNonCote:2500, appart:150000 } },
  { date: '2026-03-01', comment: 'The heaviest month of the year', dettes: 76540,
    v: { courant:981, livret:8828, especes:196, cashPea:1054, cashCto:302, pea:26347, cto:12988, crypto:2242, fondsNonCote:3000, appart:150000 } },
  { date: '2026-04-01', comment: '', dettes: 76155,
    v: { courant:1027, livret:9078, especes:199, cashPea:1414, cashCto:500, pea:27110, cto:13345, crypto:2331, fondsNonCote:3000, appart:150000 } },
  { date: '2026-05-01', comment: '', dettes: 75770,
    v: { courant:1073, livret:9328, especes:142, cashPea:1774, cashCto:698, pea:27873, cto:13702, crypto:2420, fondsNonCote:3000, appart:150000 } },
  { date: '2026-06-01', comment: '', dettes: 75385,
    v: { courant:1119, livret:9578, especes:145, cashPea:2134, cashCto:896, pea:28636, cto:14059, crypto:2509, fondsNonCote:3000, appart:150000 } },
  { date: '2026-07-01', comment: 'Bonus paid, cash back up', dettes: 75000,
    v: { courant:1398, livret:9828, especes:148, cashPea:2494, cashCto:1094, pea:29399, cto:14416, crypto:2598, fondsNonCote:3000, appart:150000 } },
  /* Le mois en cours est renseigne : une demonstration ne doit pas s ouvrir
     sur deux rappels de saisie. Ses montants suivent juillet, et le total
     colle a ce que les positions valent aux cours du jour — sans quoi la
     courbe ferait une marche entre le dernier releve et « Auj. ». */
  { date: '2026-08-01', comment: 'Current month: statement taken at the start of the month', dettes: 74615,
    v: { courant:1398, livret:9828, especes:148, cashPea:2494, cashCto:1097, pea:30395, cto:15194, crypto:2597, fondsNonCote:3000, appart:150000 } },
  { date: '2026-09-01', comment: '', v: {} },
  { date: '2026-10-01', comment: '', v: {} },
  { date: '2026-11-01', comment: '', v: {} },
  { date: '2026-12-01', comment: '', v: {} },
];

/* Photo actuelle "NOW" — seuls les comptes hors titres sont stockés,
   les comptes titres (pea / cto) sont calculés depuis les positions. */
const SEED_NOW = {
  courant: 1398, livret: 9828, especes: 148,
  cashPea: 2494, cashCto: 1097,
  fondsNonCote: 3000,
  /* L'appartement et son prêt. Le prêt est négatif : la migration le lit comme
     un crédit de l'établissement, il ne reste pas un compte à valeur négative. */
  appart: 150000, pretAppart: -75000,
};

/* Positions (lignes de titres). value = qty × price × fx, sauf si manual.
   Supports cotés réels, pour que la démonstration aille chercher de vrais
   cours. Les quantités, elles, sont inventées.

   Le rôle est posé ici et non laissé au défaut. Sans lui, toute ligne tombait
   en satellite : la carte « Core et satellites » annonçait 100 % de satellites,
   le chevron de découpe n'apparaissait jamais faute d'être détenu dans les deux
   rôles, et la page Objectifs perdait ce qu'elle a de plus utile.

   Six classes sont représentées, pour que l'allocation ne montre pas trois
   barres sur douze couleurs : actions, obligations, immobilier coté, multi
   actifs, métaux précieux, et la crypto qui vit sur son propre compte. */
const SEED_POSITIONS = [
  { id:'p1', name:'MSCI World',       isin:'FR001400U5Q4', symbol:'DCAM.PA', currency:'EUR', qty:2683, buyPrice:5.42,  price:6.241,   fx:1,     fxBuy:1,     assetClass:'actions',       role:'core',      account:'pea', manual:false },
  { id:'p2', name:'S&P 500',          isin:'IE00B5BMR087', symbol:'CSPX.AS', currency:'EUR', qty:10,   buyPrice:640,   price:723.28, fx:1,     fxBuy:1,     assetClass:'actions',       role:'core',      account:'pea', manual:false },
  { id:'p3', name:'ASML',             isin:'NL0010273215', symbol:'ASML.AS', currency:'EUR', qty:3,   buyPrice:1290,   price:1499.0, fx:1,     fxBuy:1,     assetClass:'actions',       role:'satellite', account:'pea', manual:false },
  { id:'p4', name:'LVMH',             isin:'FR0000121014', symbol:'MC.PA',   currency:'EUR', qty:4,   buyPrice:610,   price:480.0, fx:1,     fxBuy:1,     assetClass:'actions',       role:'satellite', account:'pea', manual:false },
  { id:'p5', name:'Microsoft',        isin:'US5949181045', symbol:'MSFT',    currency:'USD', qty:3,   buyPrice:398,   price:499.99, fx:0.879, fxBuy:0.879, assetClass:'actions',       role:'satellite', account:'cto', manual:false },
  /* Obligations d'État de la zone euro : la classe existait dans les cibles
     sans qu'aucune ligne ne la porte, donc « 8 % d'obligations » restait un
     objectif qu'aucun écran ne pouvait montrer atteint. */
  { id:'p6', name:'Obligations d’État zone euro', isin:'LU1650487413', symbol:'', currency:'EUR', qty:43, buyPrice:125.2, price:128.13, fx:1, fxBuy:1, assetClass:'obligations', role:'core', account:'cto', manual:false },
  /* Immobilier coté : des foncières, qui se vendent en séance. Il ne se
     confond pas avec l'appartement, qui est de l'immobilier détenu — et c'est
     précisément la distinction que cette ligne permet de montrer. */
  { id:'p7', name:'Foncières européennes', isin:'IE00B0M63284', symbol:'', currency:'EUR', qty:119, buyPrice:28.4, price:26.235, fx:1, fxBuy:1, assetClass:'immobilierCote', role:'satellite', account:'cto', manual:false },
  /* Un fonds qui mêle actions et obligations dans une seule ligne : c'est ce
     que « Multi-actifs » compte, et personne ne peut le ranger ailleurs. */
  { id:'p8', name:'Fonds prudent 30/70', isin:'LU0227384020', symbol:'', currency:'EUR', qty:171, buyPrice:17.1, price:18.187, fx:1, fxBuy:1, assetClass:'diversifie', role:'core', account:'cto', manual:false },
  // iShares Physical Gold ETC : un ETC adossé à de l'or physique, pas un
  // ETF américain. Avec le bon ISIN, la ligne se cote toute seule.
  { id:'p9', name:'Or',               isin:'IE00B4ND3602', symbol:'',        currency:'EUR', qty:30,  buyPrice:64.2, price:84.5,  fx:1,     fxBuy:1,     assetClass:'metaux',        role:'satellite', account:'cto', manual:false },
  /* La crypto etait un montant saisi a la main sur son compte, donc invisible
     de `stockTotals()`, qui ne compte que les positions : la cible de 5 %
     s'affichait face a 0 EUR, et le plan reclamait d'acheter une classe qu'on
     detenait deja. Elle est maintenant une ligne cotee, sur son compte. */
  { id:'p10', name:'Bitcoin ETP',     isin:'DE000A27Z304', symbol:'',        currency:'EUR', qty:46,  buyPrice:31.5, price:56.45,  fx:1,     fxBuy:1,     assetClass:'crypto',        role:'satellite', account:'crypto', manual:false },
];

/* Fiches comptes (dates d'ouverture, dépôts / retraits) */
const SEED_ACCOUNT_INFO = {
  pea:          { opened:'2023-06-01', liquidity:'illiquid', deposit:null, withdrawal:0 },
  cto:          { opened:'2023-09-01', liquidity:'liquid',   deposit:null, withdrawal:0 },
  crypto:       { opened:'2024-02-01', liquidity:'liquid',   deposit:null, withdrawal:0 },
  fondsNonCote: { opened:'2023-09-01', liquidity:'illiquid', deposit:3000, withdrawal:0 },
  /* Acheté bien avant le premier relevé : l'historique montre un prêt déjà
     entamé, ce qui est le cas de tout le monde sauf le mois de la signature. */
  appart:       { opened:'2019-06-01', liquidity:'illiquid', deposit:150000, withdrawal:0 },
};

/* Cibles d'allocation, une par classe détenue, plus la trésorerie.

   Elles étaient à l'ancien schéma — coreEtf, satellites, gold — que la
   migration convertit. Le résultat était juste mais pauvre : trois lignes là où
   la page en propose une par classe. Les actions portent deux cibles, une par
   rôle, ce qui est le cas le plus intéressant à montrer et celui qui fait
   apparaître le chevron de refusion.

   La somme fait 100 : 46 + 14 + 8 + 6 + 6 + 5 + 5 + 10. */
const SEED_TARGETS = {
  cashToInvest: 7,
  classes: {
    actions:        { core: 46, satellite: 14 },
    obligations:    11,
    immobilierCote: 6,
    diversifie:     6,
    metaux:         5,
    crypto:         5,
  },
  exclues: [],
};

/* Stratégie. Des exemples de cadres d'allocation, pas une recommandation :
   les pourcentages illustrent la mécanique de la page, rien d'autre. */
const SEED_STRATEGY = {
  rule: "Ordre d'achat sur l'ETF Core toujours à 3 % sous le cours.",
  reserveMonthly: 300,
  reserveBase: 1500,
  reservePct: 30,
  thresholds: [
    { label: 'Séance −2 %',   pct: 25 },
    { label: 'Drawdown −5 %', pct: 25 },
    { label: 'Drawdown −10 %',pct: 25 },
    { label: 'Drawdown −15 %',pct: 25 },
  ],
  models: [
    { name: 'Core-Satellite', note: 'Un socle large, quelques convictions autour', lines: [
      { label: 'Core ETF World',         pct: 45, vehicles: 'ETF MSCI World éligible PEA' },
      { label: 'Core ETF Nasdaq',        pct: 15, vehicles: 'ETF Nasdaq-100' },
      { label: 'Satellites convictions', pct: 15, vehicles: '3 à 5 lignes maximum' },
      { label: 'Or',                     pct: 8,  vehicles: 'ETC or physique' },
      { label: 'Private markets',        pct: 7,  vehicles: 'Fonds evergreen / ELTIF' },
      { label: 'Crypto',                 pct: 4,  vehicles: 'BTC, ETH' },
      { label: 'Cash tactique',          pct: 4,  vehicles: 'Réserve pour investir en baisse' },
      { label: 'Cash de vie',            pct: 2,  vehicles: 'Compte courant' },
    ]},
    { name: 'Tout en ETF', note: 'Le plus simple à tenir dans le temps', lines: [
      { label: 'ETF World',       pct: 70, vehicles: 'Une seule ligne, versement automatique' },
      { label: 'ETF obligations', pct: 12, vehicles: "Obligations d'État zone euro" },
      { label: 'Or',              pct: 8,  vehicles: 'ETC or physique' },
      { label: 'Cash de vie',     pct: 7,  vehicles: 'Livret' },
    ]},
  ],
};

/* État vierge : même structure, aucun chiffre. Sert quand quelqu'un d'autre
   reprend l'app — il n'hérite alors d'aucune donnée personnelle. */
function blankState() {
  const an = new Date().getFullYear();
  const mois = Array.from({ length: 12 }, (_, i) =>
    ({ date: `${an}-${String(i + 1).padStart(2, '0')}-01`, comment: '', v: {} }));

  return {
    version: 1,
    meta: { objective: 0, objectiveYear: an, expectedInflow: 0, modelCapital: 100000,
            autoRefresh: true, preferredExchange: 'auto',
            projMonthly: 0, projRate: 8, projRateAutres: 0, projInflation: 2,
            projTarget: 0, projHorizon: 20 },
    quotes: { lastRun: null, fx: {}, changes: [] },
    sales: [],
    now: {},
    monthly: mois,
    positions: [],
    accountInfo: {},
    targets: { coreEtf: 70, satellites: 20, gold: 5, cashToInvest: 5 },
    strategy: structuredClone(SEED_STRATEGY),
    accountTypes: structuredClone(SEED_ACCOUNT_TYPES),
    /* Aucune ligne de donnee, et c'est tout le sujet de cet etat.

       Il posait un compte courant, un livret, un « Salaire 0 € » et un
       « Loyer 0 € » : des exemples deguises en donnees. Personne ne saisit
       « Salaire 0 € » — on saisit son salaire — et le cout se payait ailleurs.
       Ces quatre lignes vides faisaient croire a l'application qu'elle etait
       configuree : les invites de premiers pas ne s'affichaient donc jamais, les
       rappels reclamaient un releve et des depenses a quelqu'un qui n'avait
       aucun compte, et la page Actifs ouvrait sur deux comptes a zero rattaches
       a rien.

       Ce qui reste est de la structure, pas de la donnee : les douze mois du
       calendrier, les categories de depenses, les types de compte, les cibles.
       Un tableau vide se remplit ; un exemple a zero se confond avec un fait. */
    accounts: [],
    budget: {
      monthlyTarget: 0,
      categories: [...EXPENSE_CATEGORIES],
      income: [],
      contributors: [],
      fixedCharges: [],
      toReview: [],
      supplements: [],
      /* Le journal des rentrees exceptionnelles : un heritage, une prime, la
         vente d'une voiture. Vide a la premiere ouverture, et present dans la
         graine pour que la migration le pose sur les etats d'avant. */
      apports: [],
      expenses: mois.map(m => ({ month: m.date, note: '', v: {} })),
    },
  };
}

const SEED = {
  version: 1,
  meta: {
    /* L'objectif suit l'echelle du jeu : le net vaut environ 100 000 EUR une
       fois le pret retranche, viser 30 000 aurait affiche « atteint » et la
       carte n'aurait rien montre de sa mecanique. 120 000 a fin 2027 laisse une
       marche a franchir, et donc une jauge a lire. */
    objective: 120000,
    objectiveYear: 2027,
    expectedInflow: 600,    // cash attendu d'ici le mois prochain
    modelCapital: 100000,   // base des modèles d'allocation
    /* Aucune requete de cours au chargement, et c'est ce qui rend cette
       demonstration montrable.

       Elle interrogeait la passerelle a chaque visite : les valeurs de marche
       bougeaient donc entre deux visiteurs, et entre deux captures d'ecran. Les
       quatre images du README se contredisaient a 918,83 EUR pres — cash, non
       cote et immobilier identiques a l'euro, seuls actions, obligations et
       crypto differaient — et un lecteur attentif en conclut que l'application
       compte mal.

       Trois raisons, la premiere suffit : une demonstration montre la meme chose
       a tout le monde. Un README dont les chiffres vieillissent seuls devient
       faux sans que personne y touche. Et une demonstration qui depend d'une
       passerelle externe tombe avec elle.

       Le bouton d'actualisation reste : la fonctionnalite se montre toujours,
       elle ne se declenche simplement plus d'elle-meme. */
    autoRefresh: false,
    preferredExchange: 'auto', // 'auto' = on suit la place de référence du titre
    // Hypothèses de la vue Objectif. Ce sont des valeurs de départ neutres,
    // à ajuster : rien ici ne prétend décrire un rendement futur.
    /* Une démonstration doit montrer une courbe qui monte : sans versement
       mensuel ni rendement crédible, la projection s'affiche presque plate et
       la page la plus parlante de l'application ne dit rien. Le versement
       reprend l'épargne du budget (0) — celle-ci en dégage assez pour que la
       courbe décolle. */
    projMonthly: 0,      // 0 = reprend l'épargne dégagée par le budget
    /* 8 % et non 5 : c'est l'ordre de grandeur du rendement long terme d'un
       portefeuille d'actions, celui que tout le monde reconnaît. Cinq
       décrivait un mélange prudent que la répartition de cette graine ne
       porte pas — elle est à 60 % en actions. */
    projRate: 8,         // rendement annuel supposé des actifs de marché, en %
    /* Rendement des autres actifs : non coté, compte courant, précaution.
       Zéro par défaut, et ce n'est pas un oubli. L'application ne doit affirmer
       aucun rendement sur des parts illiquides sans prix de marché ni sur un
       compte qui ne rapporte rien : tant que personne n'a réglé ce champ, ces
       poches sont portées à plat. migrate() pose la clé sur les états existants
       en fusionnant SEED.meta, donc aucun chiffre ne bouge à la mise à jour. */
    projRateAutres: 0,
    projInflation: 2,    // pour traduire le résultat en euros d'aujourd'hui
    projTarget: 0,       // cible long terme, optionnelle
    projHorizon: 20,     // horizon affiche par la vue Objectif
  },
  quotes: { lastRun: null, fx: {}, changes: [] },
  sales: [],
  now: SEED_NOW,
  seedVersion: SEED_VERSION,
  monthly: SEED_MONTHLY,
  positions: SEED_POSITIONS,
  accountInfo: SEED_ACCOUNT_INFO,
  targets: SEED_TARGETS,
  strategy: SEED_STRATEGY,
  budget: SEED_BUDGET,
  accounts: SEED_ACCOUNTS,
  accountTypes: SEED_ACCOUNT_TYPES,
};
