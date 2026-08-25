
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
    v: { courant:1369, livret:6368, especes:117, cashPea:1299, cashCto:594, pea:17049, cto:8837, crypto:1616, fondsNonCote:1880, appart:272000 } },
  { date: '2023-10-01', comment: '', dettes: 178828,
    v: { courant:1395, livret:6508, especes:119, cashPea:1501, cashCto:704, pea:17476, cto:9037, crypto:1666, fondsNonCote:1880, appart:272000 } },
  { date: '2023-11-01', comment: '', dettes: 178209,
    v: { courant:1420, livret:6648, especes:121, cashPea:1702, cashCto:815, pea:17904, cto:9237, crypto:1716, fondsNonCote:1880, appart:272000 } },
  { date: '2023-12-01', comment: 'Festive season: the current account takes the hit', dettes: 177589,
    v: { courant:1213, livret:6788, especes:122, cashPea:1904, cashCto:926, pea:18331, cto:9437, crypto:1766, fondsNonCote:1880, appart:272000 } },
  { date: '2024-01-01', comment: '', dettes: 176969,
    v: { courant:1239, livret:6928, especes:124, cashPea:2105, cashCto:1037, pea:18758, cto:9637, crypto:1816, fondsNonCote:1880, appart:272000 } },
  { date: '2024-02-01', comment: '', dettes: 176348,
    v: { courant:1265, livret:7068, especes:126, cashPea:2307, cashCto:1148, pea:19185, cto:9836, crypto:1866, fondsNonCote:1880, appart:272000 } },
  { date: '2024-03-01', comment: '', dettes: 175726,
    v: { courant:1290, livret:6862, especes:127, cashPea:2509, cashCto:1259, pea:19613, cto:10036, crypto:1915, fondsNonCote:1880, appart:272000 } },
  { date: '2024-04-01', comment: '', dettes: 175103,
    v: { courant:1316, livret:7002, especes:129, cashPea:2710, cashCto:1370, pea:20040, cto:10236, crypto:1965, fondsNonCote:2440, appart:272000 } },
  { date: '2024-05-01', comment: 'First scheduled payment into the stocks account', dettes: 174480,
    v: { courant:1342, livret:7142, especes:131, cashPea:1279, cashCto:1481, pea:20467, cto:10436, crypto:2015, fondsNonCote:2440, appart:272000 } },
  { date: '2024-06-01', comment: '', dettes: 173856,
    v: { courant:1368, livret:7282, especes:132, cashPea:1480, cashCto:1591, pea:20895, cto:10636, crypto:2065, fondsNonCote:2440, appart:272000 } },
  { date: '2024-07-01', comment: '', dettes: 173231,
    v: { courant:1394, livret:7422, especes:107, cashPea:1682, cashCto:1702, pea:21322, cto:10836, crypto:2115, fondsNonCote:2440, appart:272000 } },
  { date: '2024-08-01', comment: 'Markets down across the board over the summer', dettes: 172605,
    v: { courant:1178, livret:7562, especes:108, cashPea:1884, cashCto:1813, pea:21163, cto:10731, crypto:1960, fondsNonCote:2440, appart:272000 } },
  { date: '2024-09-01', comment: '', dettes: 171979,
    v: { courant:1204, livret:7702, especes:110, cashPea:2085, cashCto:1924, pea:21590, cto:10931, crypto:2010, fondsNonCote:2440, appart:272000 } },
  { date: '2024-10-01', comment: '', dettes: 171352,
    v: { courant:1230, livret:7842, especes:112, cashPea:2287, cashCto:2035, pea:22017, cto:11131, crypto:2060, fondsNonCote:2440, appart:272000 } },
  { date: '2024-11-01', comment: '', dettes: 170724,
    v: { courant:1256, livret:7982, especes:113, cashPea:2488, cashCto:649, pea:22445, cto:11331, crypto:2110, fondsNonCote:2440, appart:272000 } },
  { date: '2024-12-01', comment: '', dettes: 170095,
    v: { courant:1282, livret:8122, especes:115, cashPea:2690, cashCto:760, pea:22872, cto:11531, crypto:2160, fondsNonCote:2440, appart:272000 } },
  { date: '2025-01-01', comment: 'Flat revalued at €150,000', dettes: 169466,
    v: { courant:1307, livret:8262, especes:117, cashPea:2892, cashCto:871, pea:23299, cto:11731, crypto:2209, fondsNonCote:2440, appart:288000 } },
  { date: '2025-02-01', comment: '', dettes: 168836,
    v: { courant:1333, livret:8402, especes:118, cashPea:3093, cashCto:982, pea:23727, cto:11931, crypto:2259, fondsNonCote:2440, appart:288000 } },
  { date: '2025-03-01', comment: '', dettes: 168205,
    v: { courant:1359, livret:8542, especes:120, cashPea:3295, cashCto:1093, pea:24154, cto:12131, crypto:2309, fondsNonCote:2440, appart:288000 } },
  { date: '2025-04-01', comment: '', dettes: 167573,
    v: { courant:1385, livret:8682, especes:122, cashPea:3496, cashCto:1203, pea:24581, cto:12331, crypto:2359, fondsNonCote:2440, appart:288000 } },
  { date: '2025-05-01', comment: '', dettes: 166941,
    v: { courant:1410, livret:8822, especes:123, cashPea:1357, cashCto:1314, pea:25008, cto:12531, crypto:2409, fondsNonCote:2440, appart:288000 } },
  { date: '2025-06-01', comment: '', dettes: 166307,
    v: { courant:1436, livret:8962, especes:125, cashPea:1559, cashCto:1425, pea:25436, cto:12731, crypto:2459, fondsNonCote:2440, appart:288000 } },
  { date: '2025-07-01', comment: 'Holidays: nothing invested this month', dettes: 165674,
    v: { courant:1242, livret:9102, especes:127, cashPea:1760, cashCto:1536, pea:25863, cto:12930, crypto:2509, fondsNonCote:2440, appart:288000 } },
  { date: '2025-08-01', comment: '', dettes: 165039,
    v: { courant:1268, livret:9242, especes:128, cashPea:1962, cashCto:1647, pea:26290, cto:13130, crypto:2558, fondsNonCote:2440, appart:288000 } },
  { date: '2025-09-01', comment: 'Gear replaced, saving slowed down', dettes: 164403,
    v: { courant:1293, livret:8977, especes:130, cashPea:2164, cashCto:1758, pea:26717, cto:13330, crypto:2608, fondsNonCote:2720, appart:288000 } },
  { date: '2025-10-01', comment: '', dettes: 163767,
    v: { courant:1319, livret:9117, especes:132, cashPea:2365, cashCto:622, pea:27145, cto:13530, crypto:2658, fondsNonCote:2720, appart:288000 } },
  { date: '2025-11-01', comment: 'Markets down, unlisted holdings unchanged', dettes: 163130,
    v: { courant:1345, livret:9257, especes:133, cashPea:2567, cashCto:732, pea:26862, cto:13378, crypto:2363, fondsNonCote:2720, appart:288000 } },
  { date: '2025-12-01', comment: '', dettes: 162492,
    v: { courant:1371, livret:9397, especes:170, cashPea:2768, cashCto:843, pea:27289, cto:13578, crypto:2413, fondsNonCote:2720, appart:288000 } },
  { date: '2025-12-31', comment: '2025 close', dettes: 162492,
    v: { courant:1416, livret:9397, especes:170, cashPea:2768, cashCto:843, pea:27289, cto:13578, crypto:2413, fondsNonCote:2720, appart:288000 } },
  { date: '2026-01-01', comment: '', dettes: 161853,
    v: { courant:1396, livret:9537, especes:172, cashPea:1284, cashCto:954, pea:27717, cto:13778, crypto:2463, fondsNonCote:2720, appart:288000 } },
  { date: '2026-02-01', comment: '', dettes: 161214,
    v: { courant:1422, livret:9677, especes:173, cashPea:1486, cashCto:541, pea:27701, cto:13759, crypto:2348, fondsNonCote:2720, appart:288000 } },
  { date: '2026-03-01', comment: 'The heaviest month of the year', dettes: 160574,
    v: { courant:1164, livret:9268, especes:175, cashPea:1688, cashCto:652, pea:28128, cto:13959, crypto:2398, fondsNonCote:3000, appart:288000 } },
  { date: '2026-04-01', comment: '', dettes: 159933,
    v: { courant:1190, livret:9408, especes:177, cashPea:1889, cashCto:763, pea:28555, cto:14159, crypto:2448, fondsNonCote:3000, appart:288000 } },
  { date: '2026-05-01', comment: '', dettes: 159291,
    v: { courant:1216, livret:9548, especes:145, cashPea:2091, cashCto:874, pea:28983, cto:14358, crypto:2498, fondsNonCote:3000, appart:288000 } },
  { date: '2026-06-01', comment: '', dettes: 158649,
    v: { courant:1242, livret:9688, especes:146, cashPea:2292, cashCto:984, pea:29410, cto:14558, crypto:2548, fondsNonCote:3000, appart:288000 } },
  { date: '2026-07-01', comment: 'Bonus paid, cash back up', dettes: 158006,
    v: { courant:1398, livret:9828, especes:148, cashPea:2494, cashCto:1095, pea:29837, cto:14758, crypto:2598, fondsNonCote:3000, appart:288000 } },
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
  appart:       { opened:'2019-06-01', liquidity:'illiquid', deposit:255000, withdrawal:0,
                  usage:'principale', surface:58,
                  adresse:'1420 Larkspur Street, Apt 3B, Fairview, OR 97024' },
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
    /* L'objectif se place au-dessus du net du jeu, et il s'est fait depasser
       deux fois : a 120 000 d'abord, a 150 000 ensuite. La jauge affichait une
       barre pleine et « objectif atteint », donc la carte ne montrait plus rien
       de sa mecanique — ni le reste a faire, ni le rythme necessaire.

       Ce qui a manque les deux fois n'est pas le montant mais L'ECHEANCE. Le
       reste a faire doit tenir dans ce que le jeu accumule d'ici la, sinon la
       carte annonce un rythme que rien ne rend credible ; mais avec seize mois
       devant soi et 1 333 EUR par mois, tout objectif atteignable se trouve a
       moins de dix pour cent du net, et la barre est pleine de toute facon. Les
       deux contraintes ne peuvent pas tenir sur un horizon court.

       Fin 2028 les desserre : vingt-huit mois a ce rythme font 37 000 EUR de
       marge. 240 000 laisse donc une marche visible — 82 % atteints, 43 000 a
       faire, 1 529 EUR par mois contre 1 333 constates — et les trois chiffres
       de la carte travaillent tous les trois.

       Il se relit chaque fois que les valeurs de la graine bougent : un objectif
       deja atteint ne demontre rien, et c'est le net qui decide, pas ce nombre.
       La verification tient en une ligne dans la console, `objectiveStatus()`. */
    objective: 240000,
    objectiveYear: 2028,
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

       Les autres actifs et les liquidités restent à zéro dans les trois
       scénarios : l'application n'affirme aucun rendement sur ce qu'elle ne sait
       pas projeter — crypto, métaux précieux, non coté — ni sur un compte qui ne
       rapporte rien. */
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
