
/* Types de compte. `group` pilote tous les calculs (cash de vie / bourse /
   private market) ; `label` n'est qu'un regroupement d'affichage. */
/* Aucune enveloppe francaise ici. La demonstration s'ouvre en anglais pour qui
   ne parle pas francais, et un PEA n'existe pas dans ce monde-la : le lecteur y
   voit un sigle qu'aucune traduction ne peut lui rendre. Les enveloppes de la
   table `TYPES_COMPTE` restent, elles, offertes a qui saisit son propre
   patrimoine. */
const SEED_ACCOUNT_TYPES = [
  { id: 'banque',       label: 'Banks',        group: 'cash' },
  { id: 'cto',          label: 'CTO',            group: 'bourse' },
  { id: 'crypto',       label: 'Crypto',         group: 'bourse' },
  { id: 'levier',       label: 'Leverage / debt', group: 'bourse' },
  { id: 'pe',           label: 'Private equity', group: 'pe' },
  { id: 'crowdfunding', label: 'Crowdfunding',   group: 'pe' },
];

const SEED_VERSION = 4;

const SEED_ACCOUNTS = [
  { id: 'courant',  label: 'Current account', short: 'Current', group: 'cash', broker: 'Online bank', type: 'banque' },
  { id: 'livret',   label: 'Livret A',       short: 'Livret A', group: 'cash', broker: 'Online bank', type: 'banque' },
  { id: 'especes',  label: 'Cash on hand', short: 'Cash',  group: 'cash', broker: 'Cash on hand', type: 'banque' },

  { id: 'cashPea',  label: 'Cash · Broker B', short: 'Cash B',  group: 'bourse', broker: 'Broker B', type: 'cto', role: 'cash', alloc: 'Brokerage cash' },
  { id: 'cashCto',  label: 'Cash · Broker A', short: 'Cash A',  group: 'bourse', broker: 'Broker A', type: 'cto', role: 'cash', alloc: 'Brokerage cash' },
  { id: 'pea',      label: 'Stocks · Broker B', short: 'Stocks B', group: 'bourse', broker: 'Broker B', holdings: true, type: 'cto' },
  { id: 'cto',      label: 'Stocks · Broker A', short: 'Stocks A', group: 'bourse', broker: 'Broker A', holdings: true, type: 'cto' },
  { id: 'crypto',   label: 'Crypto portfolio', short: 'Crypto', group: 'bourse', broker: 'Broker A', type: 'crypto', holdings: true, alloc: 'Crypto' },

  { id: 'fondsNonCote', label: 'Unlisted fund', short: 'Unlisted', group: 'pe', broker: 'Fund manager', type: 'pe', alloc: 'Private Equity' },

  { id: 'appart',     label: 'Flat',            short: 'Flat', group: 'pe',     broker: 'Flat', type: 'immo' },
  { id: 'pretAppart', label: 'Mortgage',        short: 'Loan',        group: 'bourse', broker: 'Flat', type: 'levier', role: 'margin', taux: 1.45, tauxAssurance: 0.34, initial: 210000 },
];

/* Lignes mensuelles : { date: 'YYYY-MM-DD', v: { accountId: montant }, comment,
   dettes: capital restant dû à cette date }.

   `dettes` porte le prêt, et non une colonne de compte : un montant négatif
   dans `v` entrerait dans le brut, alors que le net vaut le brut moins les
   dettes. Le mettre aux deux endroits l'aurait compté deux fois. */
const SEED_MONTHLY = [
  { date: '2023-09-01', comment: 'First statement: starting from what is already there', dettes: 179446,
    v: { courant:1346, livret:3650, especes:93, cashPea:360, cashCto:198, pea:6563, cto:3842, crypto:846, fondsNonCote:1000, appart:272000 } },
  { date: '2023-10-01', comment: '', dettes: 178828,
    v: { courant:1392, livret:3900, especes:96, cashPea:720, cashCto:396, pea:7326, cto:4199, crypto:935, fondsNonCote:1000, appart:272000 } },
  { date: '2023-11-01', comment: '', dettes: 178209,
    v: { courant:1438, livret:4150, especes:99, cashPea:1080, cashCto:594, pea:8089, cto:4556, crypto:1024, fondsNonCote:1000, appart:272000 } },
  { date: '2023-12-01', comment: 'Festive season: the current account takes the hit', dettes: 177589,
    v: { courant:1068, livret:4400, especes:102, cashPea:1440, cashCto:792, pea:8852, cto:4913, crypto:1113, fondsNonCote:1000, appart:272000 } },
  { date: '2024-01-01', comment: '', dettes: 176969,
    v: { courant:1114, livret:4650, especes:105, cashPea:1800, cashCto:990, pea:9615, cto:5270, crypto:1202, fondsNonCote:1000, appart:272000 } },
  { date: '2024-02-01', comment: '', dettes: 176348,
    v: { courant:1160, livret:4900, especes:108, cashPea:2160, cashCto:1188, pea:10378, cto:5627, crypto:1291, fondsNonCote:1000, appart:272000 } },
  { date: '2024-03-01', comment: '', dettes: 175726,
    v: { courant:1206, livret:4532, especes:111, cashPea:2520, cashCto:1386, pea:11141, cto:5984, crypto:1380, fondsNonCote:1000, appart:272000 } },
  { date: '2024-04-01', comment: '', dettes: 175103,
    v: { courant:1252, livret:4782, especes:114, cashPea:2880, cashCto:1584, pea:11904, cto:6341, crypto:1469, fondsNonCote:2000, appart:272000 } },
  { date: '2024-05-01', comment: 'First scheduled payment into the stocks account', dettes: 174480,
    v: { courant:1298, livret:5032, especes:117, cashPea:324, cashCto:1782, pea:12667, cto:6698, crypto:1558, fondsNonCote:2000, appart:272000 } },
  { date: '2024-06-01', comment: '', dettes: 173856,
    v: { courant:1344, livret:5282, especes:120, cashPea:684, cashCto:1980, pea:13430, cto:7055, crypto:1647, fondsNonCote:2000, appart:272000 } },
  { date: '2024-07-01', comment: '', dettes: 173231,
    v: { courant:1390, livret:5532, especes:74, cashPea:1044, cashCto:2178, pea:14193, cto:7412, crypto:1736, fondsNonCote:2000, appart:272000 } },
  { date: '2024-08-01', comment: 'Markets down across the board over the summer', dettes: 172605,
    v: { courant:1006, livret:5782, especes:77, cashPea:1404, cashCto:2376, pea:13909, cto:7225, crypto:1460, fondsNonCote:2000, appart:272000 } },
  { date: '2024-09-01', comment: '', dettes: 171979,
    v: { courant:1052, livret:6032, especes:80, cashPea:1764, cashCto:2574, pea:14672, cto:7582, crypto:1549, fondsNonCote:2000, appart:272000 } },
  { date: '2024-10-01', comment: '', dettes: 171352,
    v: { courant:1098, livret:6282, especes:83, cashPea:2124, cashCto:2772, pea:15435, cto:7939, crypto:1638, fondsNonCote:2000, appart:272000 } },
  { date: '2024-11-01', comment: '', dettes: 170724,
    v: { courant:1144, livret:6532, especes:86, cashPea:2484, cashCto:297, pea:16198, cto:8296, crypto:1727, fondsNonCote:2000, appart:272000 } },
  { date: '2024-12-01', comment: '', dettes: 170095,
    v: { courant:1190, livret:6782, especes:89, cashPea:2844, cashCto:495, pea:16961, cto:8653, crypto:1816, fondsNonCote:2000, appart:272000 } },
  { date: '2025-01-01', comment: 'Flat revalued at €150,000', dettes: 169466,
    v: { courant:1236, livret:7032, especes:92, cashPea:3204, cashCto:693, pea:17724, cto:9010, crypto:1905, fondsNonCote:2000, appart:288000 } },
  { date: '2025-02-01', comment: '', dettes: 168836,
    v: { courant:1282, livret:7282, especes:95, cashPea:3564, cashCto:891, pea:18487, cto:9367, crypto:1994, fondsNonCote:2000, appart:288000 } },
  { date: '2025-03-01', comment: '', dettes: 168205,
    v: { courant:1328, livret:7532, especes:98, cashPea:3924, cashCto:1089, pea:19250, cto:9724, crypto:2083, fondsNonCote:2000, appart:288000 } },
  { date: '2025-04-01', comment: '', dettes: 167573,
    v: { courant:1374, livret:7782, especes:101, cashPea:4284, cashCto:1287, pea:20013, cto:10081, crypto:2172, fondsNonCote:2000, appart:288000 } },
  { date: '2025-05-01', comment: '', dettes: 166941,
    v: { courant:1420, livret:8032, especes:104, cashPea:464, cashCto:1485, pea:20776, cto:10438, crypto:2261, fondsNonCote:2000, appart:288000 } },
  { date: '2025-06-01', comment: '', dettes: 166307,
    v: { courant:1466, livret:8282, especes:107, cashPea:824, cashCto:1683, pea:21539, cto:10795, crypto:2350, fondsNonCote:2000, appart:288000 } },
  { date: '2025-07-01', comment: 'Holidays: nothing invested this month', dettes: 165674,
    v: { courant:1119, livret:8532, especes:110, cashPea:1184, cashCto:1881, pea:22302, cto:11152, crypto:2439, fondsNonCote:2000, appart:288000 } },
  { date: '2025-08-01', comment: '', dettes: 165039,
    v: { courant:1165, livret:8782, especes:113, cashPea:1544, cashCto:2079, pea:23065, cto:11509, crypto:2528, fondsNonCote:2000, appart:288000 } },
  { date: '2025-09-01', comment: 'Gear replaced, saving slowed down', dettes: 164403,
    v: { courant:1211, livret:8309, especes:116, cashPea:1904, cashCto:2277, pea:23828, cto:11866, crypto:2617, fondsNonCote:2500, appart:288000 } },
  { date: '2025-10-01', comment: '', dettes: 163767,
    v: { courant:1257, livret:8559, especes:119, cashPea:2264, cashCto:248, pea:24591, cto:12223, crypto:2706, fondsNonCote:2500, appart:288000 } },
  { date: '2025-11-01', comment: 'Markets down, unlisted holdings unchanged', dettes: 163130,
    v: { courant:1303, livret:8809, especes:122, cashPea:2624, cashCto:446, pea:24086, cto:11951, crypto:2180, fondsNonCote:2500, appart:288000 } },
  { date: '2025-12-01', comment: '', dettes: 162492,
    v: { courant:1349, livret:9059, especes:187, cashPea:2984, cashCto:644, pea:24849, cto:12308, crypto:2269, fondsNonCote:2500, appart:288000 } },
  { date: '2025-12-31', comment: '2025 close', dettes: 162492,
    v: { courant:1430, livret:9059, especes:187, cashPea:2984, cashCto:644, pea:24849, cto:12308, crypto:2269, fondsNonCote:2500, appart:288000 } },
  { date: '2026-01-01', comment: '', dettes: 161853,
    v: { courant:1395, livret:9309, especes:190, cashPea:334, cashCto:842, pea:25612, cto:12665, crypto:2358, fondsNonCote:2500, appart:288000 } },
  { date: '2026-02-01', comment: '', dettes: 161214,
    v: { courant:1441, livret:9559, especes:193, cashPea:694, cashCto:104, pea:25584, cto:12631, crypto:2153, fondsNonCote:2500, appart:288000 } },
  { date: '2026-03-01', comment: 'The heaviest month of the year', dettes: 160574,
    v: { courant:981, livret:8828, especes:196, cashPea:1054, cashCto:302, pea:26347, cto:12988, crypto:2242, fondsNonCote:3000, appart:288000 } },
  { date: '2026-04-01', comment: '', dettes: 159933,
    v: { courant:1027, livret:9078, especes:199, cashPea:1414, cashCto:500, pea:27110, cto:13345, crypto:2331, fondsNonCote:3000, appart:288000 } },
  { date: '2026-05-01', comment: '', dettes: 159291,
    v: { courant:1073, livret:9328, especes:142, cashPea:1774, cashCto:698, pea:27873, cto:13702, crypto:2420, fondsNonCote:3000, appart:288000 } },
  { date: '2026-06-01', comment: '', dettes: 158649,
    v: { courant:1119, livret:9578, especes:145, cashPea:2134, cashCto:896, pea:28636, cto:14059, crypto:2509, fondsNonCote:3000, appart:288000 } },
  { date: '2026-07-01', comment: 'Bonus paid, cash back up', dettes: 158006,
    v: { courant:1398, livret:9828, especes:148, cashPea:2494, cashCto:1094, pea:29399, cto:14416, crypto:2598, fondsNonCote:3000, appart:288000 } },
  { date: '2026-08-01', comment: 'Current month: statement taken at the start of the month', dettes: 157362,
    v: { courant:1398, livret:9828, especes:148, cashPea:2494, cashCto:1097, pea:30395, cto:15194, crypto:2597, fondsNonCote:3000, appart:288000 } },
  { date: '2026-09-01', comment: '', v: {} },
  { date: '2026-10-01', comment: '', v: {} },
  { date: '2026-11-01', comment: '', v: {} },
  { date: '2026-12-01', comment: '', v: {} },
];

const SEED_NOW = {
  courant: 1398, livret: 9828, especes: 148,
  cashPea: 2494, cashCto: 1097,
  fondsNonCote: 3000,
  appart: 288000, pretAppart: -157362,
};

const SEED_POSITIONS = [
  { id:'p1', name:'MSCI World',       isin:'FR001400U5Q4', symbol:'DCAM.PA', currency:'EUR', qty:2683, buyPrice:5.42,  price:6.241,   fx:1,     fxBuy:1,     assetClass:'actions',       role:'core',      account:'pea', manual:false },
  { id:'p2', name:'S&P 500',          isin:'IE00B5BMR087', symbol:'CSPX.AS', currency:'EUR', qty:10,   buyPrice:640,   price:723.28, fx:1,     fxBuy:1,     assetClass:'actions',       role:'core',      account:'pea', manual:false },
  { id:'p3', name:'ASML',             isin:'NL0010273215', symbol:'ASML.AS', currency:'EUR', qty:3,   buyPrice:1290,   price:1499.0, fx:1,     fxBuy:1,     assetClass:'actions',       role:'satellite', account:'pea', manual:false },
  { id:'p4', name:'LVMH',             isin:'FR0000121014', symbol:'MC.PA',   currency:'EUR', qty:4,   buyPrice:610,   price:480.0, fx:1,     fxBuy:1,     assetClass:'actions',       role:'satellite', account:'pea', manual:false },
  { id:'p5', name:'Microsoft',        isin:'US5949181045', symbol:'MSFT',    currency:'USD', qty:3,   buyPrice:398,   price:499.99, fx:0.879, fxBuy:0.879, assetClass:'actions',       role:'satellite', account:'cto', manual:false },
  { id:'p6', name:'Euro government bonds', isin:'LU1650487413', symbol:'', currency:'EUR', qty:43, buyPrice:125.2, price:128.13, fx:1, fxBuy:1, assetClass:'obligations', role:'core', account:'cto', manual:false },
  { id:'p7', name:'European REITs', isin:'IE00B0M63284', symbol:'', currency:'EUR', qty:119, buyPrice:28.4, price:26.235, fx:1, fxBuy:1, assetClass:'immobilierCote', role:'satellite', account:'cto', manual:false },
  { id:'p8', name:'Fonds prudent 30/70', isin:'LU0227384020', symbol:'', currency:'EUR', qty:171, buyPrice:17.1, price:18.187, fx:1, fxBuy:1, assetClass:'diversifie', role:'core', account:'cto', manual:false },
  { id:'p9', name:'Or',               isin:'IE00B4ND3602', symbol:'',        currency:'EUR', qty:30,  buyPrice:64.2, price:84.5,  fx:1,     fxBuy:1,     assetClass:'metaux',        role:'satellite', account:'cto', manual:false },
  /* La crypto etait un montant saisi a la main sur son compte, donc invisible
     de `stockTotals()`, qui ne compte que les positions : la cible de 5 %
     s'affichait face a 0 EUR, et le plan reclamait d'acheter une classe qu'on
     detenait deja. Elle est maintenant une ligne cotee, sur son compte. */
  { id:'p10', name:'Bitcoin ETP',     isin:'DE000A27Z304', symbol:'',        currency:'EUR', qty:46,  buyPrice:31.5, price:56.45,  fx:1,     fxBuy:1,     assetClass:'crypto',        role:'satellite', account:'crypto', manual:false },
];

const SEED_SALES = [
  { id:'v11', date:'2026-07-21', name:'Fonds prudent 30/70', isin:'LU0227384020', symbol:'',
    assetClass:'diversifie', role:'core', account:'cto', cashAccount:'cashCto',
    qty:60, price:18.1, currency:'EUR', fxSell:1, buyPrice:17.1, fxBuy:1,
    gross:1086, invested:1026, realised:60, note:'' },
  { id:'v10', date:'2026-06-08', name:'Or', isin:'IE00B4ND3602', symbol:'',
    assetClass:'metaux', role:'satellite', account:'cto', cashAccount:'cashCto',
    qty:10, price:82, currency:'EUR', fxSell:1, buyPrice:64.2, fxBuy:1,
    gross:820, invested:642, realised:178, note:'trimmed after the run-up' },
  { id:'v9', date:'2026-04-30', name:'ASML', isin:'NL0010273215', symbol:'ASML.AS',
    assetClass:'actions', role:'satellite', account:'pea', cashAccount:'cashPea',
    qty:1, price:1450, currency:'EUR', fxSell:1, buyPrice:1290, fxBuy:1,
    gross:1450, invested:1290, realised:160, note:'' },
  { id:'v8', date:'2026-03-12', name:'European REITs', isin:'IE00B0M63284', symbol:'',
    assetClass:'immobilierCote', role:'satellite', account:'cto', cashAccount:'cashCto',
    qty:25, price:26.6, currency:'EUR', fxSell:1, buyPrice:28.4, fxBuy:1,
    gross:665, invested:710, realised:-45, note:'' },
  { id:'v7', date:'2026-01-27', name:'Bitcoin ETP', isin:'DE000A27Z304', symbol:'',
    assetClass:'crypto', role:'satellite', account:'crypto', cashAccount:'cashCto',
    qty:12, price:48, currency:'EUR', fxSell:1, buyPrice:31.5, fxBuy:1,
    gross:576, invested:378, realised:198, note:'back to the 5% target' },
  { id:'v6', date:'2025-11-18', name:'MSCI World', isin:'FR001400U5Q4', symbol:'DCAM.PA',
    assetClass:'actions', role:'core', account:'pea', cashAccount:'cashPea',
    qty:200, price:5.9, currency:'EUR', fxSell:1, buyPrice:5.42, fxBuy:1,
    gross:1180, invested:1084, realised:96, note:'' },
  { id:'v5', date:'2025-09-05', name:'Orange', isin:'', symbol:'',
    assetClass:'actions', role:'satellite', account:'pea', cashAccount:'cashPea',
    qty:40, price:11.5, currency:'EUR', fxSell:1, buyPrice:13.25, fxBuy:1,
    gross:460, invested:530, realised:-70, note:'closed, thesis dropped' },
  { id:'v4', date:'2025-06-10', name:'Alphabet', isin:'', symbol:'',
    assetClass:'actions', role:'satellite', account:'cto', cashAccount:'cashCto',
    qty:4, price:200, currency:'USD', fxSell:0.9, buyPrice:150, fxBuy:0.9,
    gross:720, invested:540, realised:180, note:'' },
  { id:'v3', date:'2025-04-22', name:'Nasdaq 100', isin:'', symbol:'',
    assetClass:'actions', role:'core', account:'cto', cashAccount:'cashCto',
    qty:6, price:92, currency:'EUR', fxSell:1, buyPrice:71, fxBuy:1,
    gross:552, invested:426, realised:126, note:'' },
  { id:'v2', date:'2025-02-14', name:'Air Liquide', isin:'', symbol:'',
    assetClass:'actions', role:'satellite', account:'pea', cashAccount:'cashPea',
    qty:12, price:168, currency:'EUR', fxSell:1, buyPrice:140, fxBuy:1,
    gross:2016, invested:1680, realised:336, note:'' },
  { id:'v1', date:'2024-11-15', name:'Legacy euro fund', isin:'', symbol:'',
    assetClass:'', role:'', account:'', cashAccount:'',
    qty:null, price:null, currency:'EUR', fxSell:1, buyPrice:null, fxBuy:1,
    gross:3200, invested:2900, realised:300, note:'avant l’application',
    declaree:true },
];

const SEED_ACCOUNT_INFO = {
  pea:          { opened:'2023-06-01', liquidity:'illiquid', deposit:null, withdrawal:0 },
  cto:          { opened:'2023-09-01', liquidity:'liquid',   deposit:null, withdrawal:0 },
  crypto:       { opened:'2024-02-01', liquidity:'liquid',   deposit:null, withdrawal:0 },
  fondsNonCote: { opened:'2023-09-01', liquidity:'illiquid', deposit:3000, withdrawal:0 },
  appart:       { opened:'2019-06-01', liquidity:'illiquid', deposit:255000, withdrawal:0 },
};

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

const SEED_STRATEGY = {
  rule: "Ordre d'achat sur l'ETF Core toujours à 3 % sous le cours.",
  reserveMonthly: 300,
  reserveBase: 1500,
  reservePct: 30,
  thresholds: [
    { label: 'Session −2%',     pct: 25 },
    { label: 'Drawdown −5 %', pct: 25 },
    { label: 'Drawdown −10 %',pct: 25 },
    { label: 'Drawdown −15 %',pct: 25 },
  ],
  models: [
    { name: 'Core-Satellite', note: 'Un socle large, quelques convictions autour', lines: [
      { label: 'Core ETF World',         pct: 45, vehicles: 'ETF MSCI World capitalisant' },
      { label: 'Core ETF Nasdaq',        pct: 15, vehicles: 'ETF Nasdaq-100' },
      { label: 'Satellites convictions', pct: 15, vehicles: 'three to five holdings at most' },
      { label: 'Or',                     pct: 8,  vehicles: 'ETC or physique' },
      { label: 'Private markets',        pct: 7,  vehicles: 'Fonds evergreen / ELTIF' },
      { label: 'Crypto',                 pct: 4,  vehicles: 'BTC, ETH' },
      { label: 'Tactical cash',          pct: 4,  vehicles: 'dry powder for dips' },
      { label: 'Everyday cash',            pct: 2,  vehicles: 'Current account' },
    ]},
    { name: 'All in ETFs', note: 'the easiest to keep up over time', lines: [
      { label: 'ETF World',       pct: 70, vehicles: 'Une seule ligne, versement automatique' },
      { label: 'ETF obligations', pct: 12, vehicles: "Obligations d'État zone euro" },
      { label: 'Or',              pct: 8,  vehicles: 'ETC or physique' },
      { label: 'Everyday cash',     pct: 7,  vehicles: 'Savings account' },
    ]},
  ],
};

function blankState() {
  const an = new Date().getFullYear();
  const mois = Array.from({ length: 12 }, (_, i) =>
    ({ date: `${an}-${String(i + 1).padStart(2, '0')}-01`, comment: '', v: {} }));

  return {
    version: 1,
    meta: { objective: 0, objectiveYear: an, expectedInflow: 0, modelCapital: 100000,
            autoRefresh: true, preferredExchange: 'auto',
            projScenario: 'dynamique', projInflation: 2,
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
    accounts: [],
    budget: {
      monthlyTarget: 0,
      categories: [...EXPENSE_CATEGORIES],
      income: [],
      contributors: [],
      fixedCharges: [],
      toReview: [],
      supplements: [],
      apports: [],
      expenses: mois.map(m => ({ month: m.date, note: '', v: {} })),
    },
  };
}

const SEED = {
  version: 1,
  meta: {
    objective: 150000,
    objectiveYear: 2027,
    expectedInflow: 600,    // cash attendu d'ici le mois prochain
    modelCapital: 100000,   // base des modèles d'allocation
    autoRefresh: false,
    preferredExchange: 'auto', // 'auto' = on suit la place de référence du titre
    /* Pas de `projMonthly` : la clef absente veut dire « reprends l'épargne que
       dégage le budget ». Zéro voulait dire ça avant, et zéro veut maintenant
       dire zéro — c'est une réponse, pas une absence de réponse. */
    /* Un scénario nommé plutôt que des taux posés à la main. Poser `projRate`
       ici ferait passer tout premier lancement en « personnalisé » : les trois
       pavés s'afficheraient éteints, et personne ne verrait le réglage qui
       gouverne pourtant la courbe.

       « Dynamique » et non « central » : c'est 8 % par an sur les actifs de
       marché, l'ordre de grandeur du rendement long terme d'un portefeuille
       d'actions — et cette répartition est à 60 % en actions. Un mélange
       prudent décrirait autre chose que ce qu'elle porte.

       Le non coté et les liquidités restent à zéro dans les trois scénarios :
       l'application n'affirme aucun rendement sur des parts illiquides sans
       prix de marché ni sur un compte qui ne rapporte rien. */
    projInflation: 2,    // pour traduire le résultat en euros d'aujourd'hui
    projTarget: 0,       // cible long terme, optionnelle
    projHorizon: 20,     // horizon affiche par la vue Objectif
  },
  quotes: { lastRun: null, fx: {}, changes: [] },
  sales: SEED_SALES,
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
