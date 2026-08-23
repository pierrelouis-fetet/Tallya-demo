
const MODE_KEY   = 'wealth-dashboard:mode';
const CLE_REELLE = 'wealth-dashboard:v1';
const CLE_DEMO   = 'wealth-dashboard:demo';

function modeDemo() {
  try { return localStorage.getItem(MODE_KEY) === 'demo'; } catch (e) { return false; }
}
function setModeDemo(on) {
  try { on ? localStorage.setItem(MODE_KEY, 'demo') : localStorage.removeItem(MODE_KEY); }
  catch (e) {}
}
const cleStockage = () => (modeDemo() ? CLE_DEMO : CLE_REELLE);

/* La demonstration a-t-elle vieilli chez ce visiteur ?

   La graine ne joue qu'au premier lancement, donc un visiteur revenu garde sa
   copie et ne voit jamais les corrections. On compare la version rangee dans
   son etat a celle du fichier.

   Ce depot EST la demonstration : la question ne se pose que pour lui, et le
   garde-fou est double. `SEED_VERSION` n'existe que dans la graine de ce
   fork, et rejouer une graine sur de vraies donnees serait une perte seche —
   d'ou le refus explicite si un mot de passe protege le site, signe qu'on
   n'est plus sur une demonstration. La proposition se fait par une banniere :
   on ne remplace jamais un etat sans le demander, la regle de la maison. */
function demoPerimee() {
  if (typeof SEED_VERSION === 'undefined') return false;
  const etat = Store.state;
  if (!etat) return false;
  return num(etat.seedVersion) < SEED_VERSION;
}

function rechargerDemo() {
  Store.state = structuredClone(SEED);
  Store.migrate();
  refreshAccounts();
  Store.save();
}
const BACKUP_KEY = 'wealth-dashboard:backups';
const UNDO_LIMIT = 40;
const BACKUP_LIMIT = 8;

let ACCOUNTS = SEED_ACCOUNTS;
let ACC = Object.fromEntries(ACCOUNTS.map(a => [a.id, a]));
let HOLDING_ACCOUNTS = ACCOUNTS.filter(a => a.holdings).map(a => a.id);

const AFFECTATIONS = [
  ['courant',    trad('Cash disponible')],
  ['precaution', trad('Épargne de précaution')],
  ['projet',     trad('Projet prévu')],
  ['investir',   trad('Cash à investir')],
];
const AFFECTATION_LABEL = Object.fromEntries(AFFECTATIONS);

/* ============================================================
   LES BASES DE CALCUL, NOMMEES UNE FOIS
   ============================================================
   Sept montants differents circulaient sous des noms flottants : « Investi »
   designait deux grandeurs (le brut moins le cash, et le prix de revient du
   portefeuille), « Total investi » et « Total investissements » designaient la
   meme, et « Total de vos avoirs » cotoyait « patrimoine brut » et
   « patrimoine net » pour deux montants distincts. Un lecteur ne pouvait pas
   savoir si deux chiffres parlaient de la meme chose.

   Un montant, un nom, partout. `de` porte la forme grammaticale des mentions
   « en % de … », que le francais ne deduit pas du nom.

   AVOIRS et NET restent deux entrees : ils ne coincident que sans credit.
   Les fondre en un seul mot est exactement la faute que ce projet a payee
   d'une demi-journee, « Patrimoine total » affichant le net.

   LE CASH N'A QU'UNE HISTOIRE, ET ELLE EST HIERARCHIQUE.
   « Liquidites » nomme le tout ; dedans, les quatre affectations, et rien
   d'autre. Aucun agregat intermediaire n'a de nom, parce qu'aucun n'a besoin
   d'exister : chaque ecran montre soit le tout, soit les poches. C'est ce qui
   garantit que trois ecrans racontent la meme chose — avant, Allocation
   agregeait courant + precaution + projet sous « Argent disponible », un
   montant que l'accueil ne connaissait pas et qui portait presque le nom
   d'une de ses propres parts.
   Les noms des poches viennent d'AFFECTATIONS : une seule source, un seul
   endroit a modifier. */
const BASES = {
  avoirs:      { nom: trad('Tes avoirs'),         de: trad('de tes avoirs') },          // brut
  net:         { nom: trad('Patrimoine net'),     de: trad('de ton patrimoine net') },   // brut - dettes
  financier:   { nom: trad('Patrimoine financier'), de: trad('de ton patrimoine financier') },
  place:       { nom: trad('Placé'),              de: trad('de ce qui est placé') },    // nowTotals().invested
  placeBourse: { nom: trad('Placé en bourse'),    de: trad('de ce qui est placé en bourse') },
  baseCibles:  { nom: trad('Base de tes cibles'), de: trad('de la base de tes cibles') },
  liquidites:  { nom: trad('Liquidités'),         de: trad('de tes liquidités') },      // les quatre poches
  cashDispo:   { nom: AFFECTATION_LABEL.courant,    de: trad('du cash disponible') },
  precaution:  { nom: AFFECTATION_LABEL.precaution, de: trad('de l’épargne de précaution') },
  projet:      { nom: AFFECTATION_LABEL.projet,     de: trad('du cash de projet') },
  cashPlacer:  { nom: AFFECTATION_LABEL.investir,   de: trad('du cash à investir') },
};

const mentionBase = (base, montant) => `${trad('en %')} ${base.de} · ${fmtEUR0(montant)}`;

/* Les quatre poches de liquidites, dans l'ordre d'AFFECTATIONS, avec leur
   montant. Une seule fonction pour les trois ecrans qui les affichent, et la
   somme fait `nowByGroup().cash` par construction — c'est teste. */
function pochesLiquidites() {
  const p = patrimoine();
  return AFFECTATIONS.map(([cle, nom]) => ({ cle, nom, value: num(p[cle]) }));
}

const CLASSES_ACTIFS = {
  liquidites:  trad('Liquidités'),
  actions:     trad('Actifs de marché'),
  obligations: trad('Obligations'),
  garanti:     trad('Capital garanti'),
  crypto:      trad('Cryptomonnaies'),
  nonCote:     trad('Non coté'),
  immobilier:  trad('Immobilier'),
  bienValeur:  trad('Bien de valeur'),
};

const MOBILISABLE_LABEL = {
  immediat: 'Disponible immédiatement',
  differe:  'Disponible sous quelques jours',
  lent:     'Disponible en quelques mois',
  habite:   'Le logement que tu habites',
  bloque:   'Inaccessible avant l’échéance',
};

/* Le type de compte déduit les classes ajoutables et pré-remplit
   l'affectation du cash — il ne contraint jamais l'utilisateur, et les
   poches ne se calculent jamais dessus. `dateSensible` : la date
   d'ouverture conditionne la mobilisabilité (PEA cinq ans, PER retraite),
   elle est donc demandée dès la création pour ces types-là. */
const TYPES_COMPTE = [
  { id: 'courant', label: 'Compte courant', classes: ['liquidites'], defaut: 'courant',    groupe: 'cash' },
  { id: 'livret',  label: 'Livret',         classes: ['liquidites'], defaut: 'precaution', groupe: 'cash' },
  { id: 'pea',     label: 'PEA',            classes: ['liquidites', 'actions'], defaut: 'investir', groupe: 'bourse', titres: true, dateSensible: true },
  { id: 'cto',     label: 'Compte-titres (CTO)', classes: ['liquidites', 'actions', 'obligations'], defaut: 'investir', groupe: 'bourse', titres: true },
  /* Une enveloppe, et non un compte-titres. Ces deux-la portent tout ce que le
     contrat propose : un ETF monde qui cote, un fonds euros qui ne cote nulle
     part, une SCPI, un fonds maison sans ISIN. D'ou deux differences avec un
     CTO.

     La liste des classes va donc jusqu'a l'immobilier et au non cote : sans
     `immobilier`, `comptesPourCategorie()` n'offrait jamais l'assurance-vie a
     qui ajoute une SCPI, et la part restait sans domicile.

     `melange` dit que `titres` n'est pas exclusif ici. Ailleurs, un compte qui
     porte des titres ne porte que des titres, et sa fiche renvoie a Marches ou
     les cours arrivent seuls. Sur un contrat, la moitie des supports n'a pas de
     cours a aller chercher : il faut les deux portes sur la meme fiche.

     `sansCash` : il n'y a pas de « cash a investir » sur un contrat. L'argent
     verse est sur un support des son arrivee, au pire le fonds euros, et
     proposer les quatre affectations y inventait une poche qui n'existe pas —
     comptee ensuite dans les liquidites de l'accueil et dans les paliers
     d'autonomie. Le drapeau ne touche pas a `classes` : « liquidites » y sert
     aussi a accepter un support monetaire, qui est un placement et non du cash.
     Deux choses sous un seul mot, d'ou deux reglages. */
  { id: 'av',      label: 'Assurance-vie',  classes: ['liquidites', 'garanti', 'actions', 'obligations', 'immobilier', 'nonCote'], defaut: 'investir', groupe: 'bourse', titres: true, melange: true, sansCash: true, dateSensible: true },
  { id: 'per',     label: 'Plan d’épargne retraite (PER)', classes: ['liquidites', 'garanti', 'actions', 'obligations', 'immobilier', 'nonCote'], defaut: 'investir', groupe: 'bourse', titres: true, melange: true, sansCash: true, dateSensible: true },
  { id: 'crypto',  label: 'Portefeuille de cryptomonnaies', classes: ['crypto'], defaut: 'investir', groupe: 'bourse', titres: true },
  /* Deux metiers que le mot « crowdfunding » melange, et qui n'ont pas les memes
     champs. On prete, ou on prend des parts.

     « Placements non cotes » : on achete une part de societe. Plateforme A, Plateforme B
     en capital, un pacte d'associes, des parts de SAS. Pas d'echeance, pas de
     taux : on sort le jour d'un rachat, d'une introduction en bourse, ou jamais.

     « Pret participatif » : on prete a un taux, avec une date de
     remboursement. Homunity, October, la promotion immobiliere. Ce sont ces
     lignes-la qui portent une echeance, un taux annonce et un etat — en cours, en
     retard, en defaut — et c'est `prete: true` qui le dit, plutot qu'une liste de
     types ecrite dans la vue.

     Le nom disait « Financement participatif », et il a induit son proprietaire
     en erreur : « pourtant mon investissement en crowdfunding j'ai bien des
     actions, c'est quand meme du financement participatif ? ». Oui, au sens
     courant. Mais le mot couvre les deux metiers, et il en nommait un seul, si
     bien que des parts achetees sur une plateforme semblaient devoir aller la —
     ou l'application aurait reclame une echeance et un taux qui n'existent pas,
     et aurait pu declarer « en retard » une ligne qui n'a rien a rembourser.

     L'anglais disait deja « Crowdlending », precis. C'est le francais qui
     flottait. « Parts » contre « pret » : la distinction se lit en un coup
     d'oeil, et l'axe du modele apparait enfin — Tallya ne separe pas par
     plateforme mais par ce qu'on detient. */
  /* « Parts de société » et non « Placements non cotés » : ce dernier est le nom
     de la CLASSE `nonCote`, et un type de compte qui le reprenait faisait porter
     le meme libelle a deux montants differents sur le meme ecran. La carte
     « Par enveloppe » lisait 11 100 EUR sous ce nom, la carte des classes
     11 600 EUR sous le meme — l'ecart etant le compte de financement
     participatif, qui est du non cote lui aussi.

     Le calcul etait juste des deux cotes. C'est le nom du contenant qui mentait,
     et c'est exactement ce que ce projet s'interdit : un libelle, un montant.

     Un type nomme donc ce qu'on ouvre, une classe ce qu'on detient. « Parts de
     societe » fait la paire avec « Pret participatif » : l'un est du capital,
     l'autre du pret, et tous deux se rangent dans le non cote. */
  { id: 'pe',      label: 'Parts de société', classes: ['nonCote'], defaut: 'investir', groupe: 'pe' },
  { id: 'crowdfunding', label: 'Prêt participatif', classes: ['nonCote'],
    defaut: 'investir', groupe: 'pe', prete: true },
  /* `direct` : on le detient soi-meme, le contenant EST la chose.

     `bienImmo` : ce type EST un bien immobilier, il ne fait pas qu'en porter.
     La distinction manquait, et « peut porter de l'immobilier » lui servait de
     tenant-lieu : le jour ou une assurance-vie accepte une SCPI, le contrat
     entier devenait un bien, avec le vocabulaire qui va avec — « Dans quel bien
     le ranger ? » pour un contrat d'assurance. Un fait qui commande trois
     ecrans se declare, il ne se devine pas d'un effet de bord. */
  /* « Bien immobilier » et non « Immobilier » : ce dernier est le nom de la
     CLASSE `immobilier`, que ce type partage avec les SCPI. Deux enveloppes pour
     une classe, et l'une portait le nom de la classe : la carte « Par enveloppe »
     aurait affiche le seul bien sous un intitule que la carte des classes
     employait pour le bien ET les SCPI. Le meme defaut que « Placements non
     cotes », trouve par le test qui interdisait le premier. */
  { id: 'immo',    label: 'Bien immobilier', classes: ['immobilier'], defaut: 'investir',
    groupe: 'pe', direct: true, bienImmo: true },
  { id: 'scpi',    label: 'SCPI',           classes: ['immobilier'], defaut: 'investir', groupe: 'pe', bienImmo: true },
  /* Les billets dans un portefeuille. C'est le seul argent que personne ne
     tient pour vous : pour le noter, il fallait inventer une banque appelee
     « Espèces », et se demander pourquoi l'application reclamait un
     etablissement pour un billet de cinquante.

     `sansEtab` dit qu'il n'a pas de contenant, `interne` qu'on ne le choisit
     pas dans une liste : il existe pour tout le monde, une fois, pose par
     `poserEspeces()`. Dernier de la liste, donc dernier groupe a l'ecran —
     c'est la plus petite ligne d'un patrimoine, elle occupait la place
     d'honneur. */
  /* Un bien de valeur ne se tient nulle part : il est chez soi.

     `sansEtab` comme les especes — il fallait sinon inventer un etablissement
     appele d'apres l'objet lui-meme, et se demander pourquoi l'application reclame une
     banque pour un objet pose sur une etagere. Mais pas `interne` : les especes
     existent une fois pour tout le monde, la ou l'on ajoute autant de biens
     qu'on en possede. Il se choisit donc dans la liste des types.

     Groupe `pe` : c'est ce qui n'est ni du cash ni de la bourse. Le groupe
     commande les regroupements d'ecran, pas les calculs. */
  { id: 'bienValeur', label: 'Bien de valeur', classes: ['bienValeur'],
    defaut: 'investir', groupe: 'pe', sansEtab: true, direct: true },
  { id: 'especes', label: 'Espèces',        classes: ['liquidites'], defaut: 'courant', groupe: 'cash',
    sansEtab: true, interne: true },
];

function typeCompte(id) {
  return TYPES_COMPTE.find(t => t.id === id)
      || typesPerso().find(t => t.id === id)
      || { id, label: id || 'Autre', classes: ['nonCote'], defaut: 'investir', groupe: 'pe' };
}

/* Un type que la table ne connait pas : cree par son detenteur, il vit dans
   l'etat et non dans TYPES_COMPTE — la table dit le modele, `typesPerso` dit
   ce qu'un patrimoine particulier a eu besoin d'ajouter. Sa forme se derive
   de la poche, parce que c'est elle qui commande calculs et regroupements ;
   le nom ne fait que nommer. */
function typesPerso() { return Store.state?.typesPerso || []; }

const FORME_POCHE = {
  cash:   { classes: ['liquidites'], defaut: 'courant' },
  bourse: { classes: ['liquidites', 'actions', 'obligations'], defaut: 'investir', titres: true },
  pe:     { classes: ['nonCote'], defaut: 'investir' },
};

function typesCompteChoix() {
  return [...TYPES_COMPTE.filter(t => !t.interne), ...typesPerso()];
}

/* Rend l'identifiant du type, existant ou cree. Un nom deja porte est repris
   au lieu d'etre dedouble : deux types « Plan épargne logement » seraient deux
   poches pour le meme fait. Le prefixe `t_` garantit qu'un identifiant cree
   ici n'entrera jamais en collision avec un type que la table ajouterait
   plus tard. Pas de Store.save() : l'ecriture appartient a l'appelant,
   comme partout — c'est aussi ce qui rend cette fonction testable. */
function creerTypePerso(label, groupe) {
  const nom = String(label || '').trim();
  if (!nom) return null;
  const poche = FORME_POCHE[groupe] ? groupe : 'pe';
  const deja = [...TYPES_COMPTE, ...typesPerso()]
    .find(t => t.label.toLowerCase() === nom.toLowerCase());
  if (deja) return deja.id;
  const slug = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
  const pris = x => TYPES_COMPTE.some(t => t.id === x) || typesPerso().some(t => t.id === x);
  let id = 't_' + slug, n = 2;
  while (pris(id)) id = 't_' + slug + '-' + (n++);
  Store.state.typesPerso = Store.state.typesPerso || [];
  Store.state.typesPerso.push({ id, label: nom, groupe: poche, ...FORME_POCHE[poche] });
  return id;
}

const estUnBien = t => !!t && !t.titres && t.groupe === 'pe';

/* Ce qu'on detient en direct : le contenant EST la chose.

   La frontiere s'est d'abord posee sur la classe, et c'etait faux : `immobilier`
   couvre a la fois un appartement et une SCPI, qui est du papier tenu par une
   societe de gestion. Deux types partagent une classe sans partager le mode de
   detention. Le drapeau `direct` vit donc sur le type, declare une fois dans
   `TYPES_COMPTE`, la ou vivent deja `sansEtab`, `prete` et `interne`. */
const estDetenuEnDirect = t => !!t && !!t.direct;
const motDateCompte = t => trad(estUnBien(t) ? 'Date d’achat' : 'Date d’ouverture');

/* « compte » ou « bien », selon ce dont on parle.

   Le mot se derive du meme drapeau `direct` que tout le reste, pour qu'un type
   ajoute demain n'ait qu'une chose a declarer. */
const motCompte = t => trad(estDetenuEnDirect(t) ? 'bien' : 'compte');

/* `contenu` : le mot pour ce que le contenant abrite.

   Il vit dans cette table et nulle part ailleurs, avec les autres mots du
   contenant : la vue les lit tous les deux au meme endroit, donc ils ne peuvent
   pas se contredire. Une plateforme de financement participatif garde
   « compte » — Plateforme A en ouvre bien un. */
const CONTENANTS = {
  bien:   { titre: 'Bien immobilier',    question: 'À quel bien le rattacher ?',
            aide: 'Un bien déjà enregistré, ou un nouveau.',
            exemple: 'ex. Studio Lyon 3e', nouveau: 'Nouveau bien',
            contenu: 'bien' },
  societe:{ titre: 'Société ou plateforme', question: 'À quelle société le rattacher ?',
            aide: 'Une société ou plateforme déjà enregistrée, ou une nouvelle.',
            exemple: 'ex. Plateforme A', nouveau: 'Nouvelle société ou plateforme',
            contenu: 'compte' },
  banque: { titre: 'Banque ou courtier', question: 'Dans quelle banque le tenir ?',
            aide: 'Une banque déjà enregistrée, ou une nouvelle.',
            exemple: 'ex. Fortuneo', nouveau: 'Nouvelle banque ou courtier',
            contenu: 'compte' },
  /* Une assurance-vie ou un PER ne se tiennent pas « dans une banque ». Le
     contrat est chez un assureur, distribue par un courtier, parfois par une
     banque qui n'en est que le guichet : le nom qu'on reconnait et qu'on saisit
     ici est l'un des trois, et « banque » n'est pas le mot qui les couvre.
     `contenu` dit « contrat » pour la meme raison : on n'ouvre pas un compte
     chez un assureur, on souscrit. */
  assureur:{ titre: 'Assureur ou courtier', question: 'Chez qui le contrat est-il tenu ?',
            aide: 'Un organisme déjà enregistré, ou un nouveau.',
            exemple: 'ex. Linxea', nouveau: 'Nouvel assureur ou courtier',
            contenu: 'contrat' },
};

const majuscule = m => String(m || '').charAt(0).toUpperCase() + String(m || '').slice(1);

function motContenu(etabId, n) {
  const mot = contenantDeLEtab(etabId).contenu || 'compte';
  return trad(`${mot}${n > 1 ? 's' : ''}`);
}

const contenantDuType = typeId => {
  const t = typeCompte(typeId);
  return t.bienImmo ? CONTENANTS.bien
    : (typeId === 'pe' || typeId === 'crowdfunding') ? CONTENANTS.societe
    : t.melange ? CONTENANTS.assureur
    : CONTENANTS.banque;
};

function contenantDeLEtab(etabId) {
  const types = [...new Set(COMPTES().filter(c => c.etabId === etabId).map(c => c.type))];
  if (!types.length) return CONTENANTS.banque;
  const mots = [...new Set(types.map(t => contenantDuType(t).titre))];
  return mots.length === 1 ? contenantDuType(types[0]) : CONTENANTS.banque;
}

function ETABS() { return Store.state.etabs || []; }
function COMPTES() { return Store.state.comptes || []; }
const etabById = id => ETABS().find(e => e.id === id);
const compteById = id => COMPTES().find(c => c.id === id);
const comptesOuverts = () => COMPTES().filter(c => c.statut !== 'archive');

const nomCompteV2 = c => c.libelle
  || (((c.lignes || []).length === 1 && !(c.cash || []).length
       && String(c.lignes[0].libelle || '').trim()) || '')
  || trad(typeCompte(c.type).label);
const nomEtabDe = c => etabById(c.etabId)?.nom || '';

const nomLignePlacement = (l, compte) =>
  String(l.libelle || '').trim() === typeCompte(compte.type).label
    ? nomCompteV2(compte) : l.libelle;

const sousNom = (nom, ...parts) => {
  const cle = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const vus = new Set([cle(nom)]);
  return parts.filter(p => {
    const k = cle(p);
    if (!k || vus.has(k)) return false;
    vus.add(k);
    return true;
  }).join(' · ');
};

/* --- classe d'actif et role -------------------------------------------
   L'ancien champ « category » melangeait trois questions : le role
   strategique (ETF Core contre satellite), la nature de l'instrument (ETF,
   action, option) et la classe d'actif (or, crypto, cash). Trier dessus
   revenait a trier sur trois choses a la fois, et une action detenue en
   coeur de portefeuille n'avait pas de case.

   Deux champs orthogonaux le remplacent : `assetClass` dit dans quoi on est
   investi, `role` dit pourquoi. On peut desormais avoir des obligations en
   coeur, une action en satellite, ou de l'or dans les deux. */
const ASSET_CLASSES = {
  actions:        trad('Actions'),
  obligations:    trad('Obligations'),
  immobilierCote: trad('Immobilier coté'),
  diversifie:     trad('Multi-actifs'),
  metaux:         trad('Métaux précieux'),
  crypto:         'Crypto',
  monetaire:      trad('Monétaire'),
};
/* Pas de « capital garanti » ici, et le test l'a rappele avant moi : cette
   table est le vocabulaire des lignes COTEES, et chacune de ses classes doit
   tomber dans une poche rapide a vendre. Un fonds euros ne cote pas et ne se
   vend pas en seance — il vit dans `CLASSES_ACTIFS`, la table des poches, ou
   les lignes saisies a la main puisent leur classe. */
/* Pas de « non coté » ici, et c'est volontaire.
   `assetClass` qualifie une ligne de marché — une ligne cotée, par
   construction. Lui proposer « non coté » était une contradiction dans les
   termes, et cela dédoublait un suivi qui existe déjà ailleurs : les parts non
   cotées sont des lignes de compte, sur des comptes de private equity, et
   apparaissent dans Allocation et dans la répartition de la vue d'ensemble.
   Une ligne qui porterait encore cette valeur retombe sur « actions » par la
   lecture tolérante d'assetClassDe(). */
const CLASSES_ALIAS = { or: 'metaux' };
const ROLES = { core: 'Core', satellite: 'Satellite' };
const ROLE_DEFAUT = 'satellite';

const SCHEMA_VERSION = 2;

const CATEGORIE_VERS_SCHEMA = {
  'ETF Core': { assetClass: 'actions',   role: 'core' },
  'ETF':      { assetClass: 'actions',   role: 'satellite' },
  'STOCK':    { assetClass: 'actions',   role: 'satellite' },
  'GOLD':     { assetClass: 'metaux',    role: 'satellite' },
  'CRYPTO':   { assetClass: 'crypto',    role: 'satellite' },
  'CASH':     { assetClass: 'monetaire', role: 'satellite' },
  'OPTION':   { assetClass: 'actions',   role: 'satellite' },
};

const assetClassDe = p => {
  const v = CLASSES_ALIAS[p.assetClass] || p.assetClass;
  return ASSET_CLASSES[v] ? v : 'actions';
};
const roleDe       = p => ROLES[p.role] ? p.role : ROLE_DEFAUT;

const POCHE_DE_CLASSE = {
  actions:        'actions',
  obligations:    'obligations',
  immobilierCote: 'actions',
  diversifie:     'actions',
  metaux:         'actions',
  crypto:         'crypto',
  monetaire:      'liquidites',
};
/* Une poche du patrimoine passee ici se rend elle-meme : `comptesPourCategorie`
   appelle cette fonction avec ce que le menu des supports lui donne, et le menu
   parle en poches. Sans ce renvoi, « capital garanti » retombait sur le defaut
   « actions » et l'application proposait un PEA pour y ranger un fonds euros. */
const pocheDeClasse = ac => {
  const cle = CLASSES_ALIAS[ac] || ac;
  return POCHE_DE_CLASSE[cle] || (cle in CLASSES_ACTIFS ? cle : 'actions');
};

const CLASSE_DE_POCHE = {
  liquidites: 'monetaire',
  actions: 'actions',
  obligations: 'obligations',
  crypto: 'crypto',
  garanti: 'garanti',
};
const classeDePoche = poche => CLASSE_DE_POCHE[poche] || null;

const partDetention = l => {
  const p = num(l?.part);
  return (p > 0 && p <= 100) ? p / 100 : 1;
};

const USAGES_BIEN = [
  ['locative',   'Mis en location'],
  ['principale', 'Résidence principale'],
  ['secondaire', 'Résidence secondaire'],
];
const USAGE_BIEN_LABEL = Object.fromEntries(USAGES_BIEN);
const usageLigne = l => USAGE_BIEN_LABEL[l?.usage] ? l.usage : '';

function usageBien(compte) {
  const dits = [...new Set((compte?.lignes || [])
    .filter(l => (l.classe || 'immobilier') === 'immobilier')
    .map(usageLigne).filter(Boolean))];
  return dits.length === 1 ? dits[0] : '';
}

function lignesDe(compte) {
  const marche = Store.state.positions
    .filter(p => p.account === compte.id)
    .map(p => ({ id: p.id, classe: pocheDeClasse(assetClassDe(p)), libelle: p.name,
                 valeur: posValue(p), prixDeRevient: posInvested(p),
                 quantite: num(p.qty), marche: p, mobilite: p.mobilite,
                 refMobilite: `positions.${Store.state.positions.indexOf(p)}.mobilite` }));
  /* `ref` : le rang de la ligne dans son compte. La vue en a besoin pour ouvrir
     la bonne fenetre d'edition, et l'index de cette liste-ci ne le donne pas —
     les lignes de marche passent devant. */
  const manuelles = (compte.lignes || []).map((l, i) => {
    const q = partDetention(l);
    return { ...l, ref: i, part: q < 1 ? num(l.part) : null,
             valeur: num(l.valeur) * q, prixDeRevient: num(l.prixDeRevient) * q,
             valeurEntiere: num(l.valeur), prixEntier: num(l.prixDeRevient),
             refMobilite: `comptes.${Store.state.comptes.indexOf(compte)}.lignes.${i}.mobilite` };
  });
  return [...marche, ...manuelles];
}

function mobiliteLigne(l, compte) {
  if (l.mobilite && l.mobilite !== 'auto') return l.mobilite;
  if (usageLigne(l) === 'principale') return 'habite';
  return mobilisabilite(l.classe, compte.type);
}

const cashCompte = c => (c.cash || []).reduce((s, e) => s + num(e.montant), 0);
const valeurCompte = c => cashCompte(c) + lignesDe(c).reduce((s, l) => s + l.valeur, 0);

/* --- les comptes groupes par enveloppe ----------------------------------
   Le regroupement « Enveloppe » de la page Comptes, ici et non dans la vue,
   pour qu'un test puisse le sommer : le harnais ne charge pas `app.js`.

   Il parcourait `TYPES_COMPTE` et gardait les comptes de chaque type. Un compte
   portant un type absent de cette liste n'apparaissait alors dans aucun groupe,
   tout en restant compte dans le total de la page : le total cessait d'egaler la
   somme de ses parts, silencieusement. Ce n'est pas theorique — un etat migre
   depuis l'ancien modele peut porter `levier`, que la liste ne connait pas, et
   `typeCompte()` prevoit deja un type inconnu en lui rendant une definition de
   secours.

   On part donc des comptes, pas de la liste : chaque compte tombe forcement dans
   le groupe de son type. La liste ne sert plus qu'a ordonner, les types qu'elle
   ne connait pas venant a la fin, dans l'ordre ou ils se presentent. */
function groupesParEnveloppe(comptes = comptesOuverts()) {
  const rang = new Map(TYPES_COMPTE.map((t, i) => [t.id, i]));
  const inconnu = TYPES_COMPTE.length;
  const parType = new Map();
  for (const c of comptes) {
    if (!parType.has(c.type)) parType.set(c.type, []);
    parType.get(c.type).push(c);
  }
  return [...parType.entries()]
    .sort((a, b) => (rang.has(a[0]) ? rang.get(a[0]) : inconnu)
                  - (rang.has(b[0]) ? rang.get(b[0]) : inconnu))
    .map(([id, siens]) => ({
      id, label: typeCompte(id).label, comptes: siens,
      total: siens.reduce((s, c) => s + valeurCompte(c), 0),
    }));
}

function cashInvestirEntree(compte, creer = false) {
  let e = (compte.cash || []).find(x => x.affectation === 'investir');
  if (!e && creer) { compte.cash = compte.cash || []; e = { montant: 0, affectation: 'investir' }; compte.cash.push(e); }
  return e || null;
}

/* --- les espèces, toujours là -------------------------------------------
   Personne ne tient les billets d'un portefeuille : les noter demandait
   d'inventer un etablissement, et celui qu'on inventait remontait en tete de
   liste. Un compte d'especes existe donc pour tout le monde, sans contenant,
   pose une fois ici.

   Deux chemins, et le meme resultat : on adopte le compte bricole s'il
   existe, sinon on en cree un a zero. Adopter et non ajouter, sinon le meme
   argent serait compte deux fois — et l'identifiant est conserve, parce que
   les releves mensuels sont indexes dessus : en changer perdrait l'historique.

   Idempotente par construction : elle sort si un compte d'especes existe
   deja, sans drapeau a poser dans `meta`. */
const ID_ESPECES = 'especes';
const compteEspeces = () => COMPTES().find(c => c.type === 'especes') || null;

function poserEspeces(s) {
  if (!Array.isArray(s.comptes)) return;
  if (s.comptes.some(c => c.type === 'especes')) return;

  const etabs = s.etabs || [];
  const seulEspeces = /^esp[eè]ces?$/i;
  const bricole = s.comptes.find(c => {
    if (typeCompte(c.type).groupe !== 'cash') return false;
    const nomE = (etabs.find(e => e.id === c.etabId) || {}).nom || '';
    return seulEspeces.test(nomE.trim()) || seulEspeces.test(String(c.libelle || '').trim());
  });

  if (bricole) {
    const ancien = bricole.etabId;
    bricole.type = 'especes';
    bricole.etabId = null;
    if (/^(real )?cash$/i.test(String(bricole.libelle || '').trim())
        || seulEspeces.test(String(bricole.libelle || '').trim())) bricole.libelle = '';
    const vide = e => !s.comptes.some(c => c.etabId === e.id)
                   && !(e.dettes || []).some(d => num(d.montant));
    const e = etabs.find(x => x.id === ancien);
    if (e && vide(e)) s.etabs = etabs.filter(x => x !== e);
  } else {
    const libre = s.comptes.some(c => c.id === ID_ESPECES) ? ID_ESPECES + '_' + Date.now() : ID_ESPECES;
    s.comptes.push({
      id: libre, etabId: null, type: 'especes', statut: 'ouvert',
      ouvertLe: '', numero: '', notes: '', libelle: '', court: 'Espèces',
      cash: [{ montant: 0, affectation: 'courant' }], lignes: [],
    });
  }
}

function comptesPourCategorie(cat, compteActuel = null) {
  const classe = pocheDeClasse(cat);
  const ok = comptesOuverts().filter(c => typeCompte(c.type).classes.includes(classe));
  const actuel = compteActuel && compteById(compteActuel);
  if (actuel && !ok.includes(actuel)) ok.push(actuel);
  return ok;
}

function entreesInvestir() {
  const out = [];
  Store.state.comptes?.forEach((c, idxCompte) => {
    if (c.statut === 'archive') return;
    (c.cash || []).forEach((e, idxCash) => {
      if (e.affectation === 'investir') out.push({ compte: c, idxCompte, idxCash, montant: num(e.montant) });
    });
  });
  return out;
}

function ageAnnees(iso) {
  if (!iso) return Infinity;                    // sans date : pas de blocage
  return (Date.now() - new Date(iso)) / (365.25 * 24 * 3600e3);
}
/* L'anciennete d'une enveloppe, et le seuil qui la rend interessante.

   Cinq ans pour un PEA, huit pour une assurance-vie : ce sont des seuils
   FISCAUX, pas des barrieres a la sortie — d'ou leur absence de
   `mobilisabilite`. Mais c'est le repere que tout detenteur d'assurance-vie
   guette, et l'application connaissait la date sans rien en faire : elle la
   reclamait a la creation en promettant qu'elle « conditionne la
   disponibilite », ce qui etait faux, et ne l'affichait nulle part.

   Le PER n'a pas de seuil d'anciennete : ce qui le libere est un evenement, le
   depart en retraite, et non une duree ecoulee. Il porte donc une echeance
   declaree plutot qu'un compte a rebours calcule. */
const SEUIL_ANCIENNETE = { pea: 5, av: 8 };

function ancienneteCompte(c) {
  const debut = c && c.ouvertLe;
  const ans = SEUIL_ANCIENNETE[c && c.type];
  if (!debut || !ans) return null;
  const d = new Date(debut + 'T00:00:00');
  if (isNaN(d)) return null;
  const now = new Date(todayISO() + 'T00:00:00');
  let mois = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) mois--;
  if (mois < 0) mois = 0;
  const seuilLe = new Date(d); seuilLe.setFullYear(d.getFullYear() + ans);
  const moisRestants = Math.max(0, ans * 12 - mois);
  /* La date se recompose a la main, jamais par `toISOString()` : celui-ci
     convertit en UTC, et minuit heure locale a l'est de Greenwich retombe la
     veille. Le seuil des huit ans d'un contrat ouvert un 1er septembre
     s'affichait au 31 aout. */
  const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
                 + `-${String(x.getDate()).padStart(2, '0')}`;
  return { mois, annees: Math.floor(mois / 12), reste: mois % 12,
           seuilAns: ans, atteint: mois >= ans * 12, moisRestants,
           seuilLe: iso(seuilLe) };
}

function mobilisabilite(classe, typeId) {
  if (typeId === 'per') return 'bloque';
  if (classe === 'nonCote' || classe === 'immobilier') return 'lent';
  if (classe === 'bienValeur') return 'lent';
  /* Les liquidites sont immediates si le compte qui les porte est un compte de
     cash, et non selon une liste de deux types ecrite ici a la main.

     Cette liste disait « courant ou livret », et les especes sont arrivees
     apres : des billets dans un portefeuille tombaient donc en « quelques
     jours », derriere un virement bancaire. C'est l'argent le plus immediat qui
     existe. Le defaut se voyait sur l'accueil, ou la jauge annonçait
     6 011 EUR de coussin quand « Disponible tout de suite » en montrait 5 361 :
     l'ecart valait exactement les especes, et rien ne le disait.

     `groupe === 'cash'` couvre courant, livret et especes, et couvrira le
     prochain type de compte de cash sans qu'on y pense. Le cash pose chez un
     courtier garde son delai : son compte est du groupe bourse. */
  if (classe === 'liquidites')
    return typeCompte(typeId).groupe === 'cash' ? 'immediat' : 'differe';
  return 'differe';
}

/* `financier` : la meme boucle, sans les murs ni les objets.
   Le filtre porte sur la LIGNE et non sur le compte, parce que les paliers de
   disponibilite se construisent ligne par ligne : une SCPI logee dans une
   assurance-vie sort, le fonds actions du meme contrat reste. C'est aussi ce
   qui fait disparaitre le palier « le logement que tu habites » tout seul, sans
   qu'une seule ligne le nomme ici. */
function poches({ financier = false } = {}) {
  const p = { courant: 0, precaution: 0, projet: 0, investir: 0,
              classes: Object.fromEntries(Object.keys(CLASSES_ACTIFS).map(k => [k, 0])),
              /* Derive de la table des paliers : en ecrire la liste ici a la
                 main laissait un palier ajoute a `undefined`, et le total
                 cessait d'egaler la somme de ses parts sans un mot. */
              mobilisable: Object.fromEntries(
                Object.keys(MOBILISABLE_LABEL).map(k => [k, 0])) };
  for (const c of comptesOuverts()) {
    for (const e of (c.cash || [])) {
      const m = num(e.montant);
      p[e.affectation] = (p[e.affectation] || 0) + m;
      p.classes.liquidites += m;
      p.mobilisable[mobilisabilite('liquidites', c.type)] += m;
    }
    for (const l of lignesDe(c)) {
      if (financier && horsFinancier(l.classe)) continue;
      p.classes[l.classe] = (p.classes[l.classe] || 0) + l.valeur;
      p.mobilisable[mobiliteLigne(l, c)] += l.valeur;
    }
  }
  return p;
}

function dettesTotal() {
  return ETABS().reduce((s, e) => s + (e.dettes || []).reduce((x, d) => x + num(d.montant), 0), 0);
}

/* --- la charge fixe qui rembourse un credit ------------------------------
   Une mensualite de pret etait saisie deux fois : en charge fixe, parce que
   c'est de l'argent qui sort tous les mois et que le budget doit le savoir, et
   sur le credit, « pour memoire », pour projeter l'amortissement. Deux endroits
   pour un seul fait, et rien qui garantisse qu'ils s'accordent — le defaut que
   ce projet corrige sans arret.

   La charge porte donc `creditId`, et c'est elle qui detient le montant : le
   budget ne change pas d'un octet, il continue de sommer ses charges. Le credit,
   lui, lit la mensualite de la charge rattachee. Un seul champ, deux lectures.

   Sens du lien choisi a dessein : une charge peut exister sans credit, un credit
   peut exister sans charge — on ne rembourse pas une marge de courtier par
   mensualites — mais une mensualite ne peut pas exister sans sortir du budget.
   C'est donc la charge qui est la source. */
function chargeDuCredit(id) {
  if (!id) return null;
  const i = B().fixedCharges.findIndex(c => c.creditId === id);
  return i < 0 ? null : { charge: B().fixedCharges[i], index: i };
}

function mensualiteCredit(d) {
  const lien = chargeDuCredit(d.id);
  return lien ? chargeMensuelle(lien.charge) : num(d.mensualite) || 0;
}

function creerChargeDuCredit(d) {
  if (!num(d.mensualite) || chargeDuCredit(d.id)) return false;
  Store.state.budget.fixedCharges.push({
    label: d.libelle, amount: num(d.mensualite), period: 'mois',
    provider: d.preteur || '', shares: {}, creditId: d.id,
  });
  d.mensualite = null;
  return true;
}

/* --- un capital restant dû se calcule, il ne se retient pas -------------
   Le seul champ d'un crédit qui vieillit tout seul. Personne n'ouvre son
   application pour corriger de 348 EUR une ligne qui n'a pas bouge a l'ecran, et
   un capital restant du fige pendant huit mois fausse le patrimoine net de
   plusieurs milliers d'euros, silencieusement — le pire genre d'erreur.

   Plutot que de compter sur la memoire, on projette. La mensualite et le taux
   sont deja connus : le tableau d'amortissement se rejoue mois par mois depuis la
   derniere verification. Le resultat n'ecrit rien — il se propose, et c'est le
   detenteur qui tranche, parce qu'un remboursement anticipe ou une renegociation
   invalide la projection sans que l'application puisse le savoir.

   `moisDepuis` compte les mois entiers ecoules, pas les jours : une mensualite
   tombe une fois par mois, et une projection au prorata d'un demi-mois donnerait
   une precision qui n'existe pas. */
function projectionCredit(d) {
  const reste = num(d.montant);
  const mens = mensualiteCredit(d);
  const taux = num(d.taux) / 100 / 12;
  const depuis = d.verifieLe || null;
  const rien = { moisDepuis: null, projete: null, ecart: null, sens: null };
  if (!reste || !depuis) return rien;
  const a = new Date(depuis + 'T12:00:00'), b = new Date(todayISO() + 'T12:00:00');
  let mois = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) mois--;               // le mois n'est pas echu
  if (!(mois > 0)) return { ...rien, moisDepuis: Math.max(0, mois) };
  if (!mens && !taux) return { ...rien, moisDepuis: mois };
  /* Un seul calcul pour les deux sens.
     `capital + interets - mensualite` : avec une mensualite plus grosse que les
     interets, la dette descend, c'est un pret qui s'amortit. Sans mensualite, il
     ne reste que les interets et elle monte — c'est le levier d'un courtier, qui
     ne se rembourse pas par echeances et grossit tout seul. Le meme piege que le
     rappel du releve mensuel : le chiffre le plus faux est celui qu'on croit
     stable. */
  const assurance = assuranceMensuelleCredit(d);
  const rembourse = Math.max(0, mens - assurance);
  let capital = reste;
  for (let i = 0; i < mois && capital > 0; i++) {
    capital = Math.max(0, capital + capital * taux - rembourse);
  }
  return { moisDepuis: mois, projete: capital, ecart: reste - capital,
           sens: capital > reste ? 'monte' : capital < reste ? 'baisse' : 'stable' };
}

function assuranceMensuelleCredit(d) {
  return num(d.tauxAssurance)
    ? (num(d.initial) || num(d.montant)) * num(d.tauxAssurance) / 100 / 12 : 0;
}

/* L'echeancier d'un credit : LA source, et la seule.

   Deux moteurs vivaient cote a cote. `finCredit` bouclait mois par mois en
   amortissant avec la mensualite ENTIERE, donc en comptant l'assurance comme du
   remboursement ; `resteAPayer` appliquait une formule fermee apres l'avoir
   retranchee. Sur un pret de 157 362 EUR a 1,45 % avec 59,50 EUR d'assurance,
   l'une amortit 894,44 par mois et l'autre 834,94 : plus d'un an d'ecart sur la
   date de fin, et les deux dates s'affichaient sur la meme fiche.

   La convention, une fois pour toutes :

     mensualite totale = capital + interets + assurance

   Ce qui rembourse est donc `mensualite - assurance - interets`. C'est ce que
   Budget comptait deja ; la fiche du bien et la carte des credits l'oubliaient,
   et annonçaient 704,29 EUR la ou Budget disait 644,79.

   Une boucle et non une formule fermee : elle traverse le taux zero sans
   logarithme, elle donne la derniere echeance reduite sans arrondi a rattraper,
   et elle est le tableau d'amortissement lui-meme -- ce qui rend la verification
   possible ligne par ligne.

   `amortissable: false` quand ce qui reste apres l'assurance ne couvre pas les
   interets du mois : la dette ne s'eteint jamais, et annoncer une date de fin
   serait mentir. La decomposition du mois reste rendue -- elle est vraie, elle. */
function echeancierCredit(d) {
  const reste = num(d.montant);
  if (!(reste > 0)) return null;
  const mens = mensualiteCredit(d);
  const assurance = assuranceMensuelleCredit(d);
  /* Un taux ABSENT n'est pas un taux nul. Sans taux on ne sait pas departager le
     capital des interets, et annoncer « zero de capital » sur une mensualite de
     620 EUR serait faux dans l'autre sens : `capitalDuMois` vaut alors `null`,
     et les lecteurs se taisent plutot que d'inventer.

     Un taux DECLARE a zero, lui, s'amortit tout droit : c'est le pret familial ou
     le differe sans interets. L'ancienne formule fermee rendait `null` des que le
     taux valait zero -- un logarithme n'aime pas ce cas -- et privait de reponse
     le pret le plus simple. La boucle le traverse sans y penser. */
  const declare = d.taux !== undefined && d.taux !== null && d.taux !== '';
  const taux = num(d.taux) / 100 / 12;
  const interetsDuMois = declare ? reste * taux : null;
  const dispo = mens - assurance;
  const mois0 = {
    assuranceDuMois: assurance, interetsDuMois,
    capitalDuMois: (declare && mens > 0) ? Math.max(0, dispo - interetsDuMois) : null,
    amortissable: false,
    mois: null, fin: null, finLe: null, interets: null,
    assurance: null, derniere: null,
  };
  if (!declare || !(mens > 0) || dispo <= interetsDuMois) return mois0;

  let capital = reste, mois = 0, interets = 0;
  while (capital > 0.005 && mois < 1200) {
    const i = capital * taux;
    interets += i;
    capital = capital + i - dispo;
    mois++;
  }
  if (capital > 0.005) return mois0;

  /* Le premier du mois avant d'ajouter les mois : `setMonth` sur un 31 janvier
     saute en mars. L'un des deux moteurs le faisait, l'autre non -- une
     troisieme facon de ne pas tomber sur la meme date. */
  const fin = new Date();
  fin.setDate(1);
  fin.setMonth(fin.getMonth() + mois);
  const cle = `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}`;
  return {
    ...mois0,
    amortissable: true,
    mois, interets,
    assurance: assurance * mois,
    /* La derniere echeance solde le reliquat : `capital` est negatif ou nul en
       sortie de boucle, donc elle est plus petite que les autres. */
    derniere: mens + capital,
    fin: cle, finLe: cle,
  };
}

/* Deux noms, un seul calcul. `finCredit` et `resteAPayer` avaient chacun le
   leur et ne tombaient pas sur la meme date ; ils delegent desormais, et leur
   contrat ne change pas -- `null` quand le credit ne s'amortit pas, pour que les
   vues qui testent `if (!f)` continuent de se taire. */
function finCredit(d) {
  const e = echeancierCredit(d);
  if (!e || !e.amortissable) return null;
  const { mois, interets, derniere, finLe } = e;
  return { mois, interets, derniere, finLe };
}

/* --- les crédits, tous ensemble ----------------------------------------
   Une dette vit sur l'etablissement qui l'a consentie, et se lisait donc un
   etablissement a la fois : la fiche du bien, celle du courtier, le groupe de la
   page Comptes. Personne ne les voyait toutes, et le patrimoine net soustrayait
   un total qui ne s'affichait nulle part en detail.

   `rembourse` et `part` n'existent que si le capital emprunte est connu : il est
   facultatif, et deduire « rien de rembourse » d'un champ vide serait faux — un
   vieux pret dont on a oublie le montant initial est presque paye.

   Le total est celui de `dettesTotal()`, pas un second calcul : c'est le meme
   nombre que le patrimoine net retranche, et il ne peut pas en diverger. */
function creditsEnCours() {
  const lignes = [];
  for (const e of ETABS()) {
    (e.dettes || []).forEach((d, index) => {
      const reste = num(d.montant);
      const initial = num(d.initial);
      lignes.push({
        /* `index` est la position dans les dettes de l'etablissement, et non dans
           cette liste-ci : elle est triee par montant, et c'est l'autre qui sert
           a ecrire. Sans lui, modifier le plus gros credit en corrigeait un
           autre des que deux etablissements en portaient. */
        etabId: e.id, etabNom: e.nom, id: d.id, index,
        libelle: d.libelle || 'Crédit', preteur: d.preteur || '',
        reste, initial: initial || null,
        mensualite: mensualiteCredit(d) || null, taux: num(d.taux) || null,
        charge: (() => {
          const lien = chargeDuCredit(d.id);
          return lien ? { index: lien.index, label: lien.charge.label || 'Charge fixe',
                          periode: chargePeriode(lien.charge) } : null;
        })(),
        rembourse: initial > 0 ? Math.max(0, initial - reste) : null,
        part: initial > 0 ? Math.min(100, Math.max(0, (initial - reste) / initial * 100)) : null,
        interets: (num(d.taux) && reste) ? echeancierCredit(d)?.interetsDuMois ?? null : null,
        capital: (num(d.taux) && mensualiteCredit(d))
          ? echeancierCredit(d)?.capitalDuMois ?? null : null,
        verifieLe: d.verifieLe || null,
        ...projectionCredit(d),
        fin: finCredit(d),
      });
    });
  }
  lignes.sort((a, b) => b.reste - a.reste);
  return {
    lignes,
    reste: dettesTotal(),
    mensuel: lignes.reduce((s, x) => s + (x.mensualite || 0), 0),
    initial: lignes.reduce((s, x) => s + (x.initial || 0), 0),
  };
}

function patrimoine() {
  const p = poches();
  /* Le brut est la somme de ses parts, litteralement.

     Les quatre poches de cash n'ont pas a figurer ici : chaque euro de cash est
     deja compte dans `classes.liquidites`, par la meme boucle. Les additionner
     separement etait un doublon qui ne se voyait pas parce que les deux termes
     etaient egaux. */
  const brut = Object.values(p.classes).reduce((s, v) => s + num(v), 0);
  const dettes = dettesTotal();
  return { ...p, brut, dettes, net: brut - dettes };
}

/* Dérivée de la même table que `couleurClasse` : deux listes écrites à la
   main finissent par diverger, et une couleur qui change de sens d'un écran à
   l'autre ne veut plus rien dire. */
const CLASSE_COULEURS = new Proxy({}, {
  /* Une clé inconnue rend `undefined` et non une couleur par défaut : le
     `|| CLASSE_COULEURS.nonCote` des appelants doit pouvoir jouer. */
  get: (_, k) => (typeof k === 'string' && (CLASSES_ALIAS[k] || k) in TEINTE_CLASSE)
    ? couleurClasse(k) : undefined,
  has: (_, k) => typeof k === 'string' && (CLASSES_ALIAS[k] || k) in TEINTE_CLASSE,
});
/* `net` : les credits se retranchent de la classe qu'ils financent, et la base
   devient le patrimoine net.

   Le commutateur Net / Brut gouvernait le grand chiffre et la courbe, pas cette
   carte. On lisait donc, sur un seul ecran, un patrimoine net annonce en tete et
   une repartition qui totalisait le brut juste dessous : les parties ne faisaient
   pas le tout, ce que ce projet s'interdit partout ailleurs.

   Les dettes vont a l'immobilier, comme dans la projection : c'est `partPlate()`
   qui pose cette regle — immobilier plus biens moins dettes — et deux calculs qui
   repondent a la meme question doivent donner le meme chiffre. Une dette sans
   bien pour la porter rend donc cette classe negative, et la carte le montre
   plutot que de la masquer : le filtre garde ce qui n'est pas nul, dans les deux
   sens.

   Allocation ne change pas : elle n'a pas de commutateur et declare une base
   unique. Deux pages, deux bases, chacune nommee — c'est le motif autorise ici,
   celui qu'un total muet violait. */
const CLASSES_HORS_FINANCIER = ['immobilier', 'bienValeur'];
const horsFinancier = classe => CLASSES_HORS_FINANCIER.includes(classe);

/* Les memes exclusions dans l'autre vocabulaire. Cette base de code en porte deux
   — les classes fines et les poches du graphique — et c'est deja le cas de
   `POCHE_DE_CLASSE`. Deriver l'une de l'autre demanderait une table de
   correspondance de plus ; les ecrire toutes deux et verifier qu'elles designent
   le meme argent coute moins et se prouve. Un test somme les deux cotes. */
const SERIES_HORS_FINANCIER = ['immo', 'biens'];
const serieHorsFinancier = cle => SERIES_HORS_FINANCIER.includes(cle);

function valeurFinanciere(compte) {
  const dehors = lignesDe(compte)
    .filter(l => horsFinancier(l.classe))
    .reduce((s, l) => s + num(l.valeur), 0);
  return valeurCompte(compte) - dehors;
}

function horsFinancierExiste() {
  const p = patrimoine();
  return CLASSES_HORS_FINANCIER.some(c => Math.abs(num(p.classes[c])) > 0.005);
}

function totalFinancier() {
  const p = patrimoine();
  return Object.keys(CLASSES_ACTIFS)
    .filter(c => !horsFinancier(c))
    .reduce((s, c) => s + num(p.classes[c]), 0);
}

/* Ce que la vue financiere retire, en un nombre. `totalFinancier()` dit ce qui
   reste ; celui-ci dit ce qui part. Les deux existent parce que « place » ne se
   filtre pas par classe : il vaut le brut moins le cash, et sa version
   financiere est donc une soustraction, pas un filtre. Un test exige que les
   deux se recomposent. */
function horsFinancierTotal() {
  const p = patrimoine();
  return CLASSES_HORS_FINANCIER.reduce((s, c) => s + num(p.classes[c]), 0);
}

function repartitionClasses({ net = false, financier = false } = {}) {
  const p = patrimoine();
  const dettes = net && !financier ? num(p.dettes) : 0;
  const base = financier ? totalFinancier() : num(p.brut) - dettes;
  const porteuse = ['immobilier', 'bienValeur'].find(c => Math.abs(num(p.classes[c])) > 0.005)
    || (dettes ? 'immobilier' : null);
  return Object.entries(CLASSES_ACTIFS)
    .map(([classe, label]) => {
      const value = (p.classes[classe] || 0) - (classe === porteuse ? dettes : 0);
      return { classe, label, couleur: CLASSE_COULEURS[classe], value,
               pct: base ? value / base * 100 : 0 };
    })
    .filter(x => Math.abs(x.value) > 0.005)
    .filter(x => !financier || !horsFinancier(x.classe));
}

function refreshAccounts() {
  const s = Store.state;
  if (s && Array.isArray(s.comptes)) {
    const ids = new Set(s.comptes.map(c => c.id));
    const projetes = s.comptes.map(c => {
      const t = typeCompte(c.type);
      /* `group` pilote les calculs, `gAff` l'affichage : l'immobilier partage
         la poche « non cote » pour les regles metier, mais merite sa propre
         bande dans le graphique — 150 000 EUR de studio noyes dans du
         crowdfunding ne se lisent pas. */
      /* `bienImmo` et non « peut porter de l'immobilier ». La nuance decide de
         la bande du graphique et de la poche de projection : une enveloppe qui
         accepte une SCPI parmi cinq classes s'affichait entierement en
         immobilier, ETF compris, et sa valeur quittait la poche « marche » pour
         celle des biens. Un contrat de 50 000 EUR d'ETF monde comptait comme de
         la pierre sur toute la page d'accueil.
         C'est le meme drapeau que `comptesBiens()` et `estBien()` : ce type EST
         de l'immobilier, il ne fait pas qu'en porter. */
      const gAff = t.bienImmo ? 'immo'
                 : t.classes.includes('crypto') ? 'crypto'
                 /* Une montre n'est pas du non cote : la ranger dans la poche
                    `pe` ferait porter au libelle « Non coté » un objet qui n'a
                    ni emetteur ni parts — le mensonge que CLASSES_ACTIFS
                    refuse deja. Sa poche d'affichage lui appartient. */
                 : t.classes.includes('bienValeur') ? 'biens'
                 : t.groupe;
      const nom = nomCompteV2(c), etab = nomEtabDe(c);
      return { id: c.id, label: nom, short: c.court || nom,
               broker: etab, type: c.type, group: t.groupe, gAff,
               holdings: !!t.titres, role: '', alloc: c.alloc,
               legacy: c.statut === 'archive', compte: c };
    });
    const tombales = (s.accounts || [])
      .filter(a => !ids.has(a.id))
      .map(a => ({ ...a, legacy: true, fantome: true }));
    ACCOUNTS = [...projetes, ...tombales];
  } else {
    ACCOUNTS = s ? s.accounts : SEED_ACCOUNTS;
  }
  ACC = Object.fromEntries(ACCOUNTS.map(a => [a.id, a]));
  HOLDING_ACCOUNTS = ACCOUNTS.filter(a => a.holdings).map(a => a.id);
}

function accountTypes() { return Store.state.accountTypes; }
function accountType(id) {
  return accountTypes().find(t => t.id === id)
      || { id, label: id || 'Autre', group: 'bourse' };
}

function accountsWhere(pred) { return ACCOUNTS.filter(a => !a.legacy && pred(a)); }
function brokerCashAccounts() { return accountsWhere(a => a.role === 'cash'); }
function marginAccounts() { return accountsWhere(a => a.role === 'margin'); }
function sumNow(comptes) { return comptes.reduce((s, a) => s + nowValue(a.id), 0); }

function cashOf() { return 0; }

function allocLabel(a) { return a.alloc || a.label; }

function defaultHoldingAccount() {
  return (accountsWhere(a => a.holdings)[0] || ACCOUNTS[0] || {}).id || '';
}

const num = v => (v === '' || v === null || v === undefined || isNaN(v)) ? 0 : Number(v);
const round2 = v => Math.round(v * 100) / 100;
const round4 = v => Math.round(v * 10000) / 10000;

const MASK_KEY = 'wealth-dashboard:discret';
let montantsMasques = (() => {
  try { return localStorage.getItem(MASK_KEY) === '1'; } catch (e) { return false; }
})();

function setMasque(on) {
  montantsMasques = !!on;
  try { localStorage.setItem(MASK_KEY, on ? '1' : '0'); } catch (e) {}
}
const masqueActif = () => montantsMasques;

const SIGNES = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥' };
const symboleDevise = devise => SIGNES[devise || 'EUR']
  || String(devise ?? '').replace(/[&<>"']/g, '');
const OEIL_MASQUE = '<svg class="oeil-masque" viewBox="0 0 24 24" role="img"'
  + ` aria-label="${trad('montant masqué')}">`
  + '<path d="M1.9 12S5.9 5.6 12 5.6 22.1 12 22.1 12 18.1 18.4 12 18.4 1.9 12 1.9 12Z"/>'
  + '<line x1="4.5" y1="19.5" x2="19.5" y2="4.5"/></svg>';
const masque = devise => `${OEIL_MASQUE} ${symboleDevise(devise)}`;

/* Le meme masque en texte pur. Deux endroits l'exigent, et pour la meme
   raison : une balise n'y est pas du balisage.

   Dans un `<text>` SVG — etiquettes d'axe, valeurs posees sur les barres —
   elle s'imprimerait telle quelle. Dans un ATTRIBUT — `title`, `aria-label` —
   c'est pire : le masque porte lui-meme un `aria-label="montant masqué"`, dont
   le guillemet ferme l'attribut hote, et la fin de la balise se deverse en
   texte visible dans la page. C'est ce qui affichait un `€">` nu a cote de
   l'objectif mensuel. Tout montant pose dans un attribut passe donc par ici. */
const masqueTexte = devise => '••• ' + symboleDevise(devise);

/* --- un seul signe moins dans toute l'application -----------------------
   `Intl` rend « -13 500,00 € » avec un trait d'union ASCII, alors que
   l'application ecrit ses negatifs a la main avec le vrai signe moins :
   « −96 000,00 € » pour une dette, « −37 610 € » pour un ecart. Le meme ecran
   portait donc les deux, le grand chiffre en tete avec le trait d'union et les
   lignes en dessous avec le signe. L'ecart se voit : le trait d'union est plus
   court, plus haut, et il ne s'aligne pas sur la barre du plus.

   Le remplacement ne s'applique qu'aux formateurs de nombres, ou aucun tiret
   n'est legitime — une date ou un identifiant passe par d'autres chemins. */
const moinsTypographique = s => String(s).replace(/-/g, '−');

const fmtEUR = (v, dec = 2) => montantsMasques ? masque('EUR')
  : moinsTypographique(new Intl.NumberFormat(locale(), {
      style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec,
    }).format(num(v)));

const fmtEUR0 = v => fmtEUR(v, 0);

/* Un nombre de mois suit les separateurs de la langue. `toFixed(1)` ecrivait
   « 0.8 mois » au milieu d'une interface qui met des virgules partout. */
const fmtMois = v => new Intl.NumberFormat(locale(),
  { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(num(v));
const fmtEUR0Texte = v => montantsMasques ? masqueTexte('EUR') : fmtEUR0(v);

const fmtCur = (v, devise = 'EUR', dec = 2) => montantsMasques ? masque(devise)
  : moinsTypographique(new Intl.NumberFormat(locale(), {
      style: 'currency', currency: devise || 'EUR',
      minimumFractionDigits: dec, maximumFractionDigits: dec,
    }).format(num(v)));

function fmtCurEur(v, devise, taux) {
  if (!devise || devise === 'EUR') return fmtEUR(v);
  return `${fmtCur(v, devise)} <span class="muted">≈ ${fmtEUR(num(v) * (num(taux) || 1))}</span>`;
}

const fmtPct = (v, dec = 2) => moinsTypographique(new Intl.NumberFormat(locale(), {
  minimumFractionDigits: dec, maximumFractionDigits: dec,
}).format(num(v))) + (enAnglais() ? '%' : ' %');

const fmtNombre = v => moinsTypographique(num(v).toLocaleString(locale(), { maximumFractionDigits: 2 }));
const fmtSigned = v => (v >= 0 ? '+' : '−') + fmtEUR(Math.abs(v), 0);
const fmtSignedPct = (v, dec = 2) => (v >= 0 ? '+' : '−') + fmtPct(Math.abs(v), dec);

const MOIS_COURTS = {
  fr: ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
};
const moisCourts = () => MOIS_COURTS[currentLang()] || MOIS_COURTS.fr;

function fmtMonth(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (d > 20) return enAnglais() ? `End ${y}` : `Fin ${y}`;   // ligne de cloture
  return `${moisCourts()[m - 1]} ${String(y).slice(2)}`;
}

function fmtMoisAn(iso) {
  if (!iso) return '';
  const [y, m] = iso.split('-').map(Number);
  return `${moisCourts()[m - 1]} ${y}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (enAnglais()) return `${Number(d)} ${moisCourts()[Number(m) - 1]} ${y}`;
  return `${d}/${m}/${y}`;
}
function fmtJourMois(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${moisCourts()[m - 1] || ''}`.trim();
}

/* Quand ce cours a-t-il ete imprime par la place ? En secondes, comme
   `quoteTime` l'arrive de la passerelle.

   Elle vit ici et non dans `app.js` parce que quatre ecrans la posent — la
   pastille du haut, la carte du jour, son apercu et la fiche d'une ligne — et
   qu'une phrase recopiee quatre fois finit par dire quatre choses. Le harnais
   de tests peut aussi l'appeler : il ne charge que `store.js`.

   Elle rend sa preposition avec elle — « de 11:05 », « d'hier a 22:00 »,
   « du 1 août a 17:30 » — parce que les trois branches n'appellent pas la
   meme, et que ses appelants ecrivent tous « cours … » ou « date … ». Sans
   ça, chacun d'eux porterait sa propre elision, et le premier oubli donnerait
   « cours de hier ». C'est ce qu'affichait la premiere version, vue a
   l'ecran. */
function fmtCoursQuand(secondes) {
  const t = num(secondes);
  if (!t) return '';
  const d = new Date(t * 1000);
  const heure = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const jour = isoLocal(d);
  if (jour === todayISO()) return enAnglais() ? `from ${heure}` : `de ${heure}`;
  /* La veille se derive de `todayISO()` et non de `new Date()` : c'est le seul
     repere que le harnais peut deplacer, et « hier » doit suivre le jour
     suppose, sans quoi un test joue a une date et lit une phrase calee sur une
     autre. Midi, pour ne pas glisser d'un jour au changement d'heure. */
  const veille = new Date(todayISO() + 'T12:00:00');
  veille.setDate(veille.getDate() - 1);
  if (jour === isoLocal(veille)) return enAnglais() ? `from yesterday at ${heure}` : `d’hier à ${heure}`;
  return enAnglais() ? `from ${fmtJourMois(jour)} at ${heure}` : `du ${fmtJourMois(jour)} à ${heure}`;
}

function cleIsin(code) {
  const corps = String(code || '').trim().toUpperCase().slice(0, 11);
  if (!/^[A-Z]{2}[A-Z0-9]{9}$/.test(corps)) return null;
  const expanded = [...corps].map(ch => parseInt(ch, 36)).join('');
  let total = 0, double = true;
  for (let i = expanded.length - 1; i >= 0; i--) {
    let d = +expanded[i];
    if (double) { d *= 2; if (d > 9) d -= 9; }
    total += d;
    double = !double;
  }
  return String((10 - total % 10) % 10);
}

function isinCorrige(code) {
  const brut = String(code || '').trim().toUpperCase();
  const cle = cleIsin(brut);
  if (!cle) return null;
  const attendu = brut.slice(0, 11) + cle;
  return attendu === brut ? null : attendu;
}

function isinIsValid(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(c)) return false;
  return cleIsin(c) === c[11];
}

const EXCHANGE_SUFFIX = {
  EPA: '.PA', EPAR: '.PA', ETR: '.DE', FRA: '.F', LON: '.L', AMS: '.AS',
  EBR: '.BR', BIT: '.MI', BME: '.MC', SWX: '.SW', VIE: '.VI',
  NASDAQ: '', NYSE: '', NYSEARCA: '', BATS: '',
};
function guessSymbol(ticker) {
  if (!ticker) return '';
  const t = String(ticker).trim();
  const m = t.match(/^([A-Za-z]+):(.+)$/);
  if (!m) return t.toUpperCase();
  const suffix = EXCHANGE_SUFFIX[m[1].toUpperCase()];
  return suffix === undefined ? m[2].toUpperCase() : m[2].toUpperCase() + suffix;
}

const Store = {
  state: null,

  load() {
    let raw = null;
    try { raw = localStorage.getItem(cleStockage()); } catch (e) { /* file:// restreint */ }
    if (raw) {
      try {
        this.state = JSON.parse(raw);
        this.migrate();
        this._prev = structuredClone(this.state);
        return this.state;
      } catch (e) { console.warn('État illisible, retour au seed.', e); }
    }
    /* La graine passe par la migration comme un etat relu, et pour la meme
       raison : elle est ecrite dans l'ancien modele, un compte par ligne de
       relevé. C'est la migration qui en tire les etablissements, les comptes,
       leurs poches de cash et leurs credits.

       Elle ne l'etait pas, et le premier lancement rendait donc un etat a
       moitie construit : `comptes` absent, et tout ce qui en descend a zero.
       Le patrimoine s'affichait a 0 EUR sur une page qui portait pourtant ses
       huit cartes. Le defaut ne se voyait qu'une fois — la sauvegarde qui
       suivait le premier geste passait l'etat par la migration — donc jamais
       pendant qu'on developpe, avec un stockage deja rempli. Il ne se voyait
       qu'a la seule visite qui compte pour une demonstration : la premiere. */
    this.state = structuredClone(SEED);
    this.migrate();
    this._prev = structuredClone(this.state);
    refreshAccounts();
    return this.state;
  },

  migrate() {
    const s = this.state;

    s.meta = Object.assign(structuredClone(SEED.meta), s.meta || {});
    s.targets = Object.assign(structuredClone(SEED.targets), s.targets || {});
    s.strategy = Object.assign(structuredClone(SEED.strategy), s.strategy || {});
    s.accountInfo = Object.assign(structuredClone(SEED.accountInfo), s.accountInfo || {});
    s.now = s.now || structuredClone(SEED.now);
    s.monthly = s.monthly || structuredClone(SEED.monthly);
    s.positions = s.positions || structuredClone(SEED.positions);
    s.quotes = s.quotes || { lastRun: null, fx: {}, changes: [] };
    s.sales = s.sales || [];
    if (!s.meta.exchangeAutoDone) {
      s.meta.preferredExchange = 'auto';
      s.meta.exchangeAutoDone = true;
    }

    if (!Array.isArray(s.budget.contributors)) {
      const partage = s.budget.fixedCharges.some(c => num(c.sharePK));
      s.budget.contributors = partage ? [{ id: 'pk', name: 'PK' }] : [];
      for (const c of s.budget.fixedCharges) {
        if (!c.shares) c.shares = {};
        if (num(c.sharePK)) c.shares.pk = num(c.sharePK);
        delete c.sharePK;
      }
    }

    if (!s.meta.classementRevu) {
      if (!s.accountTypes.some(t => t.id === 'levier')) {
        s.accountTypes.push({ id: 'levier', label: 'Levier / dette', group: 'bourse' });
      }
      for (const a of s.accounts) {
        if (a.role === 'margin') a.type = 'levier';
        if (a.holdings && s.accountInfo[a.id]?.liquidity === 'illiquid') {
          s.accountInfo[a.id].liquidity = 'liquid';
        }
      }
      s.meta.classementRevu = true;
    }

    for (const r of (s.budget?.supplements || [])) {
      if (r.amount !== undefined || r.annual === undefined) continue;
      r.amount = num(r.annual);
      r.period = 'an';
      r.note = [r.perDay, r.perYear].filter(Boolean).join(' · ');
      delete r.annual; delete r.perDay; delete r.perYear;
    }

    s.budget = Object.assign(structuredClone(SEED.budget), s.budget || {});
    if (!Array.isArray(s.budget.categories) || !s.budget.categories.length) {
      s.budget.categories = [...EXPENSE_CATEGORIES];
    }
    /* Le calendrier des DÉPENSES, et lui seul.

       Il reste parce qu'il est la seule porte vers un mois passé : le tableau du
       détail mensuel affiche ses douze lignes, et c'est en cliquant l'une d'elles
       qu'on saisit février de l'an dernier. Le retirer sans lui donner un
       remplaçant — un sélecteur de mois dans la fenêtre de saisie, comme celui du
       relevé — fermerait cette porte.

       Les RELEVÉS n'en ont plus besoin : le journal n'affiche que les mois
       renseignés, et « Ajouter un relevé » choisit son mois et son année, en
       créant la ligne à la demande (`indexReleve`). Douze lignes vides par an
       dans le stockage ne servaient plus rien, et le point 19 les refuse.

       Les lignes vides déjà créées restent : elles ne portent aucun montant,
       mais elles peuvent porter une note, et rien ici ne supprime ce que
       quelqu'un a écrit. */
    ensureCalendarMonths(s.budget.expenses, 'month', 'note');
    s.accountTypes = s.accountTypes || structuredClone(SEED.accountTypes);
    s.accounts = s.accounts || structuredClone(SEED.accounts);
    s.typesPerso = s.typesPerso || [];

    /* Le détail d'une catégorie de dépenses est retiré, et son champ avec.

       Il vivait dans `d`, à côté du total : « Restos 146, dont TR 110 et Bourso
       36 ». Deux surfaces d'édition pour une seule valeur, et tout le mal venait
       de les réconcilier — retaper le total effaçait les libellés, et le champ
       principal ne pouvait pas être à la fois un total et une porte. Quelqu'un qui
       veut suivre deux choses séparément fait deux catégories : c'est ce que les
       catégories sont.

       La purge est ici et non à l'enregistrement d'un mois : un champ que plus
       aucun écran ne lit deviendrait invisible sans disparaître, et il sortirait
       encore dans les sauvegardes. Idempotente par construction — elle supprime
       une clé absente au second passage. */
    /* Le zero qui voulait dire « automatique ».

       `projMonthly: 0` etait le sentinelle de la graine : zero etant faux en
       JavaScript, la projection retombait sur l'epargne du budget. Maintenant
       que zero veut dire zero, ces etats-la verraient leur courbe s'aplatir
       sans que personne l'ait demande. La clef s'en va donc, ce qui redonne
       exactement le comportement d'avant — et la clef absente est desormais le
       seul moyen de dire « automatique ».

       A un coup, et c'est necessaire : sans le drapeau, un utilisateur qui
       choisit vraiment 0 verrait son choix efface au chargement suivant. */
    if (!s.meta.projMonthlyZeroLu) {
      if (num(s.meta.projMonthly) === 0) delete s.meta.projMonthly;
      s.meta.projMonthlyZeroLu = true;
    }

    /* La banque d'un credit : une seule clef.

       `preteur` est la clef que la fenetre de creation ecrit et que la carte des
       credits, la fiche et l'export lisent. La fiche d'un etablissement, elle,
       editait `organisme` -- donc taper le nom de la banque depuis cet ecran
       partait dans une clef que personne ne relisait.

       La regle : `preteur` gagne quand il porte quelque chose, sinon `organisme`
       la prend. Aucune valeur inventee, aucune ecrasee. Idempotente sans
       drapeau -- la clef effacee ne peut plus se reecrire. */
    for (const e of (s.etabs || [])) {
      for (const d of (e.dettes || [])) {
        if (d.organisme === undefined) continue;
        if (!d.preteur && d.organisme) d.preteur = d.organisme;
        delete d.organisme;
      }
    }

    if (s.meta.projRateCrypto !== undefined) {
      if (!num(s.meta.projRateAutres) && num(s.meta.projRateCrypto)) {
        s.meta.projRateAutres = num(s.meta.projRateCrypto);
      }
      delete s.meta.projRateCrypto;
    }
    if (s.meta.projVersementVers === 'crypto'
        || s.meta.projVersementVers === 'nonCote') {
      s.meta.projVersementVers = 'autres';
    }

    if (!s.meta.detailRetire) {
      for (const r of (s.budget?.expenses || [])) delete r.d;
      s.meta.detailRetire = true;
    }

    for (const c of (s.comptes || [])) {
      if (!Array.isArray(c.cash) || !c.cash.length) continue;
      if (!typeCompte(c.type).sansCash) continue;
      c.cash = c.cash.filter(e => num(e.montant) || e.affectation);
    }

    if (!s.meta.typesEnrichis) {
      const nouveaux = [
        { id: 'av',      label: 'Assurance vie',       group: 'bourse' },
        { id: 'per',     label: 'PER',                 group: 'bourse' },
        { id: 'immo',    label: 'Immobilier',          group: 'pe' },
        { id: 'scpi',    label: 'SCPI',                group: 'pe' },
        { id: 'metaux',  label: 'Métaux précieux',     group: 'bourse' },
        { id: 'epargne', label: 'Épargne réglementée', group: 'cash' },
      ];
      for (const t of nouveaux) {
        if (!s.accountTypes.some(x => x.id === t.id)) s.accountTypes.push(t);
      }
      s.meta.typesEnrichis = true;
    }
    const parDefaut = Object.fromEntries(SEED_ACCOUNTS.map(a => [a.id, a]));
    for (const a of s.accounts) {
      if (!a.type) a.type = accountTypes().find(t => t.group === a.group)?.id || 'banque';
      if (a.role === undefined) a.role = parDefaut[a.id]?.role || '';
      if (a.alloc === undefined && parDefaut[a.id]?.alloc) a.alloc = parDefaut[a.id].alloc;
    }
    refreshAccounts();

    for (const p of s.positions) {
      if (p.symbol === undefined) p.symbol = guessSymbol(p.ticker);
      if (p.currency === undefined) p.currency = (num(p.fx) && num(p.fx) !== 1) ? 'USD' : 'EUR';
      if (p.isin === undefined) p.isin = '';
      /* Fige le PRU au taux d'achat — mais jamais a 1 sur une ligne en devise :
         ce 1 est la valeur par defaut de la creation, pas un taux, et il faisait
         compter des dollars comme des euros. Remis a vide, il sera figé au premier
         taux connu ; d'ici la, `tauxAchat()` prend le taux courant. Idempotent :
         rejouer la migration sur un etat deja repare ne change rien. */
      /* `fxBuy` ne sert plus a convertir : les deux jambes prennent le taux du
         jour. Le champ part des positions — il portait le taux du premier
         rafraichissement, pas celui d'un achat — mais reste sur les ventes
         enregistrees, ou il est un fait date de la transaction. */
      if (p.fxBuy !== undefined) delete p.fxBuy;
    }

    this.migrerModele(s);
    poserEspeces(s);
    this.migrerClassesActifs(s);
    this.migrerCibles(s);
    /* --- les contenants restés vides d'avant le correctif -------------------
       Supprimer le dernier compte d'un établissement emporte désormais
       l'établissement (`supprimer-compte`), parce qu'un contenant sans compte
       n'apparaît plus sur aucun écran : la liste des comptes saute les
       établissements vides. Il ne ressortait qu'à l'étape 2 d'un ajout, où la
       règle propose les vides sous n'importe quel type — d'où l'impression
       d'une mémoire résiduelle, un bien supprimé qui revient proposer de s'y
       rattacher, y compris dans la fenêtre « Assureur ou courtier ».

       Le correctif ne valait que pour les suppressions à venir. Les contenants
       déjà orphelins sont restés dans les données, invisibles et
       indéboulonnables : aucun écran ne les montre, donc aucun écran ne permet
       de les retirer. Un correctif qui ne regarde que l'avenir laisse le défaut
       en place chez ceux qui l'ont déjà subi.

       Un établissement qui porte une dette reste, lui, même sans compte : le
       contrôle de cohérence « Crédit sans bien » a besoin de le nommer, et
       cette dette se soustrait toujours du patrimoine net. La supprimer ici
       effacerait un chiffre au lieu de le signaler.

       Idempotente : au second passage il n'y a plus rien d'orphelin. */
    s.etabs = (s.etabs || []).filter(e =>
      (s.comptes || []).some(c => c.etabId === e.id)
      || (e.dettes || []).some(d => num(d.montant)));
    refreshAccounts();
  },

  
  /* --- migration du champ « category » vers classe d'actif + role -------
     Idempotente de deux facons : elle sort tout de suite si le JSON porte
     deja la bonne version de schema, et la conversion ligne par ligne ne
     s'applique qu'aux lignes qui portent encore l'ancien champ. Relancer la
     fonction sur un etat deja converti ne change rien.

     Les lignes sans ancien champ ni nouveau, une ligne creee entre deux
     versions, recoivent le defaut plutot que d'etre laissees vides : un
     calcul qui lit `assetClassDe()` ne doit jamais tomber sur `undefined`.

     La sauvegarde du JSON d'origine est prise cote serveur, au moment ou
     l'etat converti remonte : le Worker ecrit l'ancien objet sous une cle
     horodatee des qu'il voit la version de schema changer. */
  migrerClassesActifs(s) {
    const positions = Array.isArray(s.positions) ? s.positions : [];
    const dejaAJour = s.schemaVersion >= SCHEMA_VERSION;
    const restes = positions.filter(p => p.category !== undefined || p.categorie !== undefined);
    if (dejaAJour && !restes.length) return { converties: 0, deja: true };

    let converties = 0;
    for (const p of positions) {
      const ancienne = p.category ?? p.categorie;
      if (ancienne !== undefined) {
        const cible = CATEGORIE_VERS_SCHEMA[ancienne];
        if (cible) {
          if (!ASSET_CLASSES[p.assetClass]) p.assetClass = cible.assetClass;
          if (!ROLES[p.role]) p.role = cible.role;
          converties++;
        }
        delete p.category;
        delete p.categorie;
      }
      if (!ASSET_CLASSES[p.assetClass]) p.assetClass = 'actions';
      if (!ROLES[p.role]) p.role = ROLE_DEFAUT;
    }
    for (const v of (Array.isArray(s.sales) ? s.sales : [])) {
      const ancienne = v.category ?? v.categorie;
      if (ancienne === undefined) continue;
      const cible = CATEGORIE_VERS_SCHEMA[ancienne];
      if (cible && !ASSET_CLASSES[v.assetClass]) v.assetClass = cible.assetClass;
      if (cible && !ROLES[v.role]) v.role = cible.role;
      delete v.category;
      delete v.categorie;
    }
    s.schemaVersion = SCHEMA_VERSION;
    return { converties, deja: false };
  },

  migrerCibles(s) {
    const tg = s.targets || (s.targets = {});
    const purge = () => {
      delete tg.coreEtf; delete tg.satellites; delete tg.gold;
      delete tg.roles;
      if (tg.classes) delete tg.classes.private_market;
      tg.exclues = (tg.exclues || []).filter(k => k !== 'private_market');
    };
    if (tg.classes) { purge(); return; }
    const core = num(tg.coreEtf), sat = num(tg.satellites);
    const actions = core + sat;
    tg.classes = {
      actions,
      obligations: 0,
      metaux: num(tg.gold),
      crypto: 0,
      monetaire: 0,
    };
    tg.cashToInvest = num(tg.cashToInvest);
    purge();
  },

  migrerModele(s) {
    if (Array.isArray(s.comptes)) return;        // déjà migré
    s.etabs = [];
    s.comptes = [];
    const slug = nom => String(nom).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'etab';
    const etabDe = nom => {
      nom = (nom || '').trim() || 'Sans établissement';
      let e = s.etabs.find(x => x.nom === nom);
      if (!e) { e = { id: 'e_' + slug(nom), nom, notes: '', dettes: [] }; s.etabs.push(e); }
      return e;
    };
    const infos = s.accountInfo || {};

    for (const a of s.accounts) {
      if (a.role === 'cash' || a.role === 'margin') continue;   // absorbés plus bas
      const e = etabDe(a.broker);
      const i = infos[a.id] || {};
      let type = a.type;
      if (type === 'banque')  type = /livret|ldds|lep/i.test(a.label) ? 'livret' : 'courant';
      if (type === 'epargne') type = 'livret';
      if (type === 'metaux')  type = 'cto';
      const t = typeCompte(type);
      const compte = {
        id: a.id, etabId: e.id, type, statut: a.legacy ? 'archive' : 'ouvert',
        ouvertLe: i.opened || '', numero: '', notes: i.notes || '',
        libelle: a.label, court: a.short || '', alloc: a.alloc,
        cash: [], lignes: [],
      };
      const montant = num(s.now[a.id]);
      if (t.groupe === 'cash') {
        compte.cash.push({ montant, affectation: type === 'livret' ? 'precaution' : 'courant' });
      } else if (!a.holdings && (montant || num(i.deposit))) {
        compte.lignes.push({
          id: 'l_' + a.id, classe: t.classes.find(c => c !== 'liquidites') || 'nonCote',
          libelle: a.label, valeur: montant,
          prixDeRevient: (num(i.deposit) - num(i.withdrawal)) || montant,
          quantite: i.shares ?? null, dateAcquisition: i.opened || '',
        });
      }
      delete s.now[a.id];
      s.comptes.push(compte);
    }

    for (const a of s.accounts.filter(x => x.role === 'cash')) {
      const montant = num(s.now[a.id]);
      const memeEtab = etabDe(a.broker).id;
      const cible = s.comptes.find(c => c.etabId === memeEtab && c.type === a.type && c.statut === 'ouvert');
      if (cible && montant) cible.cash.push({ montant, affectation: 'investir' });
      s.now[a.id] = 0;                          // l'argent a déménagé
    }

    for (const a of s.accounts.filter(x => x.role === 'margin')) {
      const du = -num(s.now[a.id]);
      /* `verifieLe` des la naissance : un capital restant du est le seul champ
         qui devient faux sans que personne y touche, et la cloche le reclame au
         bout de trois mois. Sans date de depart, elle le reclamait des la
         premiere ouverture — une demonstration accueillait son visiteur par un
         reproche. Le jour de la migration EST le jour ou l'on a lu ce montant. */
      /* Le taux, l'assurance et le capital emprunte suivent quand le compte les
         declare. Sans eux, un pret migre n'avait aucun taux : la projection ne
         pouvait pas rejouer son amortissement, et la cloche ne pouvait pas
         proposer un capital restant du a jour — les deux mecanismes existaient
         et ne servaient a rien sur la seule dette du jeu de demonstration.

         Copies un a un et non par etalement : une dette ne doit pas heriter des
         champs d'affichage d'un compte (`group`, `short`, `broker`), qui n'ont
         aucun sens sur elle et que rien ne lirait. */
      if (du > 0) etabDe(a.broker).dettes.push({ id: 'd_' + a.id, libelle: a.label,
        montant: du, note: '', verifieLe: todayISO(),
        ...(num(a.taux) ? { taux: num(a.taux) } : {}),
        ...(num(a.tauxAssurance) ? { tauxAssurance: num(a.tauxAssurance) } : {}),
        ...(num(a.initial) ? { initial: num(a.initial) } : {}) });
      s.now[a.id] = 0;
    }

    for (const c of s.comptes) {
      if (typeCompte(c.type).titres && c.statut === 'ouvert') cashInvestirEntree(c, true);
    }
  },

  _undo: [],
  _prev: null,
  _lastPush: 0,

  /* `differe` : regrouper l'envoi au cloud au lieu de le faire tout de suite.
     Reserve a la frappe, ou cinq caracteres valent cinq appels. */
  save(opts = {}) {
    /* La projection des comptes se refait ici, et non chez l'appelant.

       Une vue ne se rafraichit pas a la main a huit endroits : la source
       change, la vue suit. Les appels qui subsistent chez les appelants sont
       desormais sans effet, sauf `undo()`, qui ne passe pas par ici. */
    refreshAccounts();
    const now = Date.now();
    if (this._prev && now - this._lastPush > 900) {
      this._undo.push(this._prev);
      if (this._undo.length > UNDO_LIMIT) this._undo.shift();
      this._lastPush = now;
    }
    this.state.meta.savedAt = new Date().toISOString();   // arbitre les conflits de synchro
    this._prev = structuredClone(this.state);
    try {
      localStorage.setItem(cleStockage(), JSON.stringify(this.state));
      flashSaved();
    } catch (e) {
      console.warn('Sauvegarde impossible', e);
    }

    /* Le cloud reçoit tout de suite, sauf pendant une frappe.

       C'était l'inverse : chaque `save()` armait un minuteur, donc un clic sur
       « Enregistrer » attendait deux secondes et demie avant de partir. Le geste
       le plus explicite de l'application — celui par lequel on dit « c'est
       bon » — était traité comme une frappe au clavier, et c'est pendant cette
       attente que l'écran se verrouillait.

       Le regroupement garde sa raison, mais elle ne vaut que pour la saisie
       caractère par caractère : taper « 12500 » produit cinq écritures, et
       Cloudflare KV n'accepte qu'une écriture par seconde sur une même clé. Les
       deux écouteurs de frappe passent donc `differe`, et eux seuls.

       Le défaut est ainsi le comportement sûr, et le regroupement devient une
       exception qu'on demande là où elle se justifie. */
    if (typeof CloudSync !== 'undefined' && !modeDemo()) {
      if (opts.differe) CloudSync.schedulePush(); else CloudSync.push();
    }
  },

  canUndo() { return this._undo.length > 0; },

  undoCount() { return this._undo.length; },

  undo() {
    const prev = this._undo.pop();
    if (!prev) return false;
    this.state = prev;
    this._prev = structuredClone(prev);
    refreshAccounts();               // sinon la liste des comptes reste celle d'avant
    try { localStorage.setItem(cleStockage(), JSON.stringify(this.state)); } catch (e) {}
    return true;
  },

  backups() {
    try { return JSON.parse(localStorage.getItem(BACKUP_KEY)) || []; }
    catch (e) { return []; }
  },

  addBackup(reason = 'auto') {
    const list = this.backups();
    list.unshift({ at: new Date().toISOString(), reason, data: this.state });
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, BACKUP_LIMIT)));
      return true;
    } catch (e) {
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, 2))); return true; }
      catch (e2) { console.warn('Sauvegarde auto impossible', e2); return false; }
    }
  },

  autoBackup() {
    const list = this.backups();
    const lastAt = list[0] && new Date(list[0].at);
    if (!lastAt || (Date.now() - lastAt) > 20 * 3600 * 1000) this.addBackup('quotidienne');
  },

  restoreBackup(index) {
    const b = this.backups()[index];
    if (!b) return false;
    this.addBackup('avant restauration');
    this.state = structuredClone(b.data);
    this.migrate();
    this.save();
    return true;
  },

  reset() {
    this.addBackup('avant réinitialisation');
    this.state = structuredClone(SEED);
    refreshAccounts();
    this.save();
  },
};

function posValue(p) {
  return p.manual ? num(p.value) : num(p.qty) * num(p.price) * num(p.fx || 1);
}
/* Le taux auquel convertir le prix de revient d'une ligne : celui du jour, pour
   les deux jambes.

   Il s'est fige au jour de l'achat pendant longtemps, par `fxBuy`, et le
   raisonnement se tenait : sans ca, le montant investi bougerait a chaque
   variation de l'EUR/USD, et la plus-value d'une ligne qu'on n'a pas touchee
   changerait toute seule.

   Ce qui le fait tomber : une ligne se construit souvent en plusieurs achats, a
   des dates et donc a des taux differents. Il n'y a pas UN taux d'achat a geler,
   et un `fxBuy` unique n'est donc pas une approximation mais un chiffre
   arbitraire presente comme une date.

   Pire, il ne se figeait meme pas a un achat : `quotes.js` le posait au PREMIER
   RAFRAICHISSEMENT des cours de la ligne. Deux titres achetes a des mois d'ecart
   portaient le meme taux, celui du jour ou l'application les a vus pour la
   premiere fois. L'ecart de change affiche mesurait le temps ecoule depuis
   l'installation de l'app, pas une detention.

   Les deux jambes au taux du jour, donc — la convention du courtier. La
   plus-value en euros devient « ce que cette ligne a gagne ou perdu, exprime en
   euros d'aujourd'hui », et elle coincide avec ce que le courtier affiche. Le patrimoine
   ne bouge pas d'un centime : il a toujours ete calcule au taux du jour.

   Ce qu'on perd est reel et assume : l'application ne dit plus combien d'euros
   sont reellement sortis du compte. Elle ne le savait pas — elle le devinait.
   Le dire vraiment demanderait un taux par achat, donc un carnet de lots, et ce
   n'est pas ce projet.

   Une ligne en euros vaut 1 sans discussion : c'est sa devise qui le dit. */
function tauxAchat(p) {
  if ((p.currency || 'EUR') === 'EUR') return 1;
  return num(p.fx) || 1;
}
function posInvested(p) {
  if (p.manual) return num(p.invested);
  return num(p.qty) * num(p.buyPrice) * tauxAchat(p);
}
/* La base est la valeur absolue du prix de revient.

   C'est la regle de la maison, deja posee dans `deltas()` : un pourcentage
   n'existe que sur une base positive. Ici la base a un sens — ce qu'on a encaisse
   — donc on la redresse au lieu de se taire, et le signe vient de l'euro.

   Rien ne change pour une position longue : `perf / inv` vaut exactement
   `value / inv - 1` quand `inv` est positif. Seul le short est corrige. */
function posPerfPct(p) {
  const inv = posInvested(p);
  return inv === 0 ? 0 : posPerfEur(p) / Math.abs(inv) * 100;
}
function posPerfEur(p) { return posValue(p) - posInvested(p); }

/* Le cours retenu date-t-il d'aujourd'hui ?

   `quoteTime` est l'heure de la derniere transaction reguliere, telle que la
   place la publie. Comparee au jour local, elle dit si une seance a eu lieu
   depuis minuit — ce qui est faux tous les matins avant l'ouverture, et tout le
   week-end.

   Sans cette heure, on ne peut rien affirmer : Stooq ne la donne pas. On garde
   alors l'ecart, faute de pouvoir prouver qu'il est perime. */
function coteAujourdhui(p) {
  const t = num(p.quoteTime);
  if (t) return isoLocal(new Date(t * 1000)) === todayISO();
  const etat = marketStatus(p);
  return etat ? etat.cle !== 'close' : true;
}

function acheteAujourdhui(p) {
  return !!p?.dateAchat && p.dateAchat === todayISO() && posInvested(p) > 0;
}

function posDayChange(p) {
  const prev = num(p.prevClose);
  if (p.manual || !num(p.price)) return null;

  if (acheteAujourdhui(p)) {
    return { pct: posPerfPct(p), eur: posPerfEur(p), prev: prev || null,
             price: num(p.price), depuisAchat: true };
  }

  if (!prev) return null;
  const fx = num(p.fx) || 1, q = num(p.qty);
  if (!coteAujourdhui(p)) return { pct: 0, eur: 0, prev, price: num(p.price), horsSeance: true };
  return {
    pct: (num(p.price) / prev - 1) * 100,
    eur: (num(p.price) - prev) * q * fx,
    prev, price: num(p.price),
  };
}

const MARKET_STATES = {
  REGULAR:    { cle: 'open',  label: trad('ouvert') },
  PRE:        { cle: 'pre',   label: trad('pré-ouverture') },
  PREPRE:     { cle: 'pre',   label: trad('avant pré-ouverture') },
  POST:       { cle: 'post',  label: trad('après clôture') },
  POSTPOST:   { cle: 'close', label: trad('fermé') },
  CLOSED:     { cle: 'close', label: trad('fermé') },
};

const COURS_FRAIS_S = 30 * 60;

function marketStatus(p) {
  const direct = MARKET_STATES[String(p.marketState || '').toUpperCase()];
  if (direct) return direct;

  const s = p.session;
  if (!s) return null;
  const t = Math.floor(Date.now() / 1000);
  const dans = b => Array.isArray(b) && b[0] != null && t >= b[0] && t < b[1];

  const fenetre = Array.isArray(s.regular) && s.regular[0] != null
    ? s.regular[1] - s.regular[0] : 0;
  if (fenetre >= 23 * 3600) {
    const age = num(p.quoteTime) ? t - num(p.quoteTime) : null;
    if (age == null) return null;
    return age <= COURS_FRAIS_S ? MARKET_STATES.REGULAR : MARKET_STATES.CLOSED;
  }

  if (dans(s.regular)) return MARKET_STATES.REGULAR;
  if (dans(s.pre)) return MARKET_STATES.PRE;
  if (dans(s.post)) return MARKET_STATES.POST;
  return MARKET_STATES.CLOSED;
}

const ISSUERS = [
  'iShares', 'Amundi', 'Xtrackers', 'Vanguard', 'Lyxor', 'BNP Paribas', 'SPDR',
  'Invesco', 'HANetf', 'VanEck', 'WisdomTree', 'Franklin', 'Fidelity', 'UBS',
  'HSBC', 'JPMorgan', 'Legal & General', 'L&G', 'First Trust', 'Global X',
  'Ossiam', 'Rize', 'Tabula', '21Shares', 'CoinShares', 'BlackRock', 'State Street',
];

function issuerOf(p) {
  const nom = p.longName || p.name || '';
  return ISSUERS.find(m => nom.toLowerCase().includes(m.toLowerCase())) || null;
}

const ISIN_PAYS = {
  FR: 'France', IE: 'Irlande', LU: 'Luxembourg', DE: 'Allemagne', NL: 'Pays-Bas',
  GB: 'Royaume-Uni', US: 'États-Unis', CH: 'Suisse', BE: 'Belgique', ES: 'Espagne',
  IT: 'Italie', AT: 'Autriche', SE: 'Suède', DK: 'Danemark', NO: 'Norvège',
  FI: 'Finlande', PT: 'Portugal', CA: 'Canada', JP: 'Japon', JE: 'Jersey',
  KY: 'Îles Caïmans', BM: 'Bermudes', AU: 'Australie',
};

function isinCountry(isin) {
  const code = String(isin || '').trim().toUpperCase().slice(0, 2);
  return code ? (ISIN_PAYS[code] || code) : null;
}

function rangePosition(p) {
  const bas = num(p.low52), haut = num(p.high52), c = num(p.price);
  if (!bas || !haut || haut <= bas) return null;
  return { bas, haut, pct: Math.max(0, Math.min(100, (c - bas) / (haut - bas) * 100)) };
}

/* L'heure du marche portee par les cours en memoire : le plus recent des
   `quoteTime`, en secondes.

   `lastRun` dit si la passerelle repond ; celle-ci dit de quand datent les
   chiffres affiches. C'est la seconde question qu'on se pose devant un ecart
   du jour, et rien ne la posait. */
function coursAsOf() {
  const heures = Store.state.positions
    .filter(p => !p.manual)
    .map(p => num(p.quoteTime))
    .filter(Boolean);
  return heures.length ? Math.max(...heures) : null;
}

function dayPerformance() {
  const lignes = [];
  let eur = 0, baseCotees = 0, sansDonnee = 0;
  for (const p of Store.state.positions) {
    const d = posDayChange(p);
    if (!d) { sansDonnee++; continue; }
    eur += d.eur;
    baseCotees += posValue(p) - d.eur;    // valeur d'hier, au change du jour
    lignes.push({
      index: Store.state.positions.indexOf(p),
      name: p.name, currency: p.currency || 'EUR', value: posValue(p),
      symbol: p.symbol || '', exchange: p.exchange || '',
      market: marketStatus(p), quoteTime: p.quoteTime || null,
      ...d,
    });
  }
  lignes.sort((a, b) => b.eur - a.eur);
  /* Deux comptes distincts, et il ne faut pas les confondre :
     `sansDonnee` = aucune cloture de reference, la ligne n'est pas dans la liste.
     `horsSeance` = on a la reference, mais notre cours ne date pas d'aujourd'hui.
     La seconde est dans la liste, avec un ecart nul — d'ou l'obligation de
     l'annoncer, faute de quoi elle se lit comme une seance atone. */
  const horsSeance = lignes.filter(l => l.horsSeance).length;
  const base = basePortefeuilleMarches() - eur;
  return {
    lignes, eur, sansDonnee, horsSeance,
    base, baseCotees,
    pct: base ? eur / base * 100 : 0,
    hausse: lignes.filter(l => l.eur > 0).length,
    baisse: lignes.filter(l => l.eur < 0).length,
    toutHorsSeance: lignes.length > 0 && horsSeance === lignes.length,
    asOfMarche: coursAsOf(),                      // de quand datent les prix
    asOf: Store.state.quotes?.lastRun || null,    // de quand date la requete
  };
}

function holdingsOf(accountId) {
  return Store.state.positions.filter(p => p.account === accountId);
}
function holdingsValue(accountId) {
  return holdingsOf(accountId).reduce((s, p) => s + posValue(p), 0);
}

function nowValue(accountId) {
  const c = compteById(accountId);
  if (c) return valeurCompte(c);
  if (HOLDING_ACCOUNTS.includes(accountId)) return holdingsValue(accountId);
  return num(Store.state.now[accountId]);
}

/*   Une réserve à connaître : l'historique ne peut pas suivre. Un relevé porte
   la valeur totale d'un compte, et la poche vient du compte (`rowGroups` →
   `a.gAff`) — le cash qui dort dans un PEA y reste donc rangé en bourse, sans
   moyen de l'en extraire après coup. La courbe d'évolution montre par
   conséquent un décalage au dernier point, entre le dernier mois enregistré
   et « Auj. ». Il vaut le montant à investir, et le total ne bouge pas. */
function nowByGroup() {
  const p = patrimoine();
  return {
    cash: p.courant + p.precaution + p.projet + p.investir,
    bourse: p.classes.actions + p.classes.obligations,
    crypto: p.classes.crypto,
    pe: p.classes.nonCote,
    immo: p.classes.immobilier,
    biens: p.classes.bienValeur,
    garanti: p.classes.garanti,
  };
}

/* Ce qui est reserve a un projet, et depuis quelle poche de projection.

   Une ligne marquee quitte la poche qui la portait pour etre portee a plat :
   il faut donc savoir de laquelle elle vient, sinon la soustraction se ferait
   au hasard et un total cesserait d'egaler la somme de ses parts.

   L'immobilier et les biens n'y entrent pas : ils sont deja portes a plat par
   `partPlate()`, et les marquer ne changerait rien qu'un double comptage. */
function reserveProjet() {
  /* Les poches sont celles de `nowByGroup`, une par une, et non la poche
     « marche » de la projection qui en fusionne deux : la fenetre de la base
     affiche une ligne pour la bourse et une pour la crypto, et chacune doit
     pouvoir retrancher ce qui lui a ete reserve. Fusionner ici obligeait a
     defusionner la-bas, et la somme des lignes cessait de faire le total. */
  const out = { total: 0, bourse: 0, crypto: 0, nonCote: 0, garanti: 0 };
  for (const c of comptesOuverts()) {
    for (const l of lignesDe(c)) {
      if (!l.projet) continue;
      const poche = l.classe === 'nonCote' ? 'nonCote'
                  : l.classe === 'garanti' ? 'garanti'
                  : l.classe === 'crypto' ? 'crypto'
                  : (l.classe === 'actions' || l.classe === 'obligations') ? 'bourse'
                  : null;
      if (!poche) continue;
      out[poche] += num(l.valeur);
      out.total += num(l.valeur);
    }
  }
  return out;
}

function nowTotals() {
  const p = patrimoine();
  const g = nowByGroup();
  const reserve = reserveProjet();
  const brut = p.brut;
  return { ...g, brut, dettes: p.dettes, net: brut - p.dettes,
           total: brut - p.dettes,          // « total » = patrimoine net, partout
           toInvest: p.investir,
           /* `g.cash` couvre désormais toutes les liquidités, cash à investir
              compris. Retrancher `p.investir` en plus le comptait deux fois :
              « Investi » perdait 1 856 € qui réapparaissaient sur deux lignes
              de la carte du haut d'Allocation, « À investir » et « Argent
              disponible ». Les trois parts faisaient quand même le brut — la
              double soustraction compensait la double addition — donc rien ne
              le signalait. */
           /* Deux formes du meme fait : le total pour l'afficher, le detail par
              poche pour que `pochesProjection` sache ou soustraire. */
           projet: reserve.total, projetParPoche: reserve,
           invested: brut - g.cash };
}

function rowGroups(row) {
  const g = { cash: 0, bourse: 0, crypto: 0, pe: 0, immo: 0, biens: 0 };
  for (const a of ACCOUNTS) g[a.gAff || a.group] += num(row.v[a.id]);
  return g;
}
function rowTotal(row) {
  /* La somme se derive des poches, quelle que soit leur liste : la version
     ecrite a la main a laisse `biens` dehors une fois deja. */
  return Object.values(rowGroups(row)).reduce((s, v) => s + v, 0);
}
function rowNet(row) {
  return rowTotal(row) - num(row.dettes);
}
/* Un releve est vide quand il ne porte NI avoir NI dette.

   Le test ne regardait que `v`, les montants par compte : un releve a 0 EUR
   d'avoirs et 20 000 EUR de dette passait donc pour vide, et disparaissait de
   tout ce qui derive de cette notion -- le journal, les annees offertes au
   selecteur, la courbe, les variations, le rythme. Son patrimoine net vaut
   -20 000 EUR, ce qui est un fait, et le taire etait le seul moyen d'afficher
   zero a la place. */
function rowIsEmpty(row) {
  return Object.values(row.v || {}).every(x => !num(x)) && !num(row.dettes);
}

const moisRevolu = (date, aujourdhui = todayISO()) =>
  String(date || '').slice(0, 7) <= String(aujourdhui).slice(0, 7);

function historyYears() {
  const ans = new Set([todayISO().slice(0, 4)]);
  for (const r of Store.state.monthly || []) {
    if (!rowIsEmpty(r)) ans.add(String(r.date).slice(0, 4));
  }
  for (const a of apportsTries()) {
    if (a.date) ans.add(String(a.date).slice(0, 4));
  }
  return [...ans].sort();
}

const HISTORY_RANGES = [
  { id: 'ytd', label: 'YTD' },
  { id: '1y',  label: trad('1 an') },
  { id: '3y',  label: trad('3 ans') },
  { id: '5y',  label: trad('5 ans') },
  { id: 'all', label: trad('Tout') },
];

const estAnnee = id => /^\d{4}$/.test(String(id || ''));

function anneesPresentes(dates) {
  return [...new Set(dates.map(d => String(d || '').slice(0, 4)).filter(a => /^\d{4}$/.test(a)))]
    .sort().reverse();
}

function rangeLabel(id) {
  if (estAnnee(id)) return String(id);
  const fixe = HISTORY_RANGES.find(r => r.id === id);
  if (fixe) return fixe.label;
  if (id === 'ytd') return 'YTD';
  const m = String(id || '').match(/^(\d+)y$/);
  return m ? (m[1] === '1' ? trad('1 an') : `${m[1]} ${trad('ans')}`) : trad('Tout');
}

function rangeBornes(range) {
  if (estAnnee(range)) return { debut: `${range}-01-01`, fin: `${range}-12-31` };
  return { debut: rangeStart(range), fin: null };
}

/* `ecarts` : la serie porte des variations et non des valeurs.
   La difference tient a un cran. Pour tracer une annee de courbe il faut
   treize points, qui donnent douze intervalles : le seuil les garde tous, et
   c'est juste. Mais la carte du rythme filtre les ecarts eux-memes, chacun
   date du mois d'arrivee : celui date d'aout 2025 mesure la variation de
   juillet a aout 2025, soit treize mois avant aujourd'hui. « 1 an » comptait
   donc treize mois.
   Seules les fenetres en annees sont concernees. « Depuis le 1er janvier »
   garde bien la variation de decembre a janvier : elle appartient a janvier,
   donc a l'annee en cours. */
function limitRange(points, range, { ecarts = false } = {}) {
  if (range === 'all' || !range) return points;
  const now = new Date();
  let depuis;
  if (range === 'ytd') {
    depuis = new Date(now.getFullYear(), 0, 1);
  } else {
    const ans = parseInt(range, 10) || 1;
    depuis = new Date(now.getFullYear() - ans, now.getMonth() + (ecarts ? 1 : 0), 1);
  }
  /* `toISOString()` convertit en UTC : a Paris, le 1er janvier local devient
     le 31 decembre a 23 h, et le seuil « depuis le debut de l'annee » laissait
     passer la cloture du 31/12 de l'annee precedente. On assemble la date a
     partir de ses composantes locales. */
  const seuil = `${depuis.getFullYear()}-${String(depuis.getMonth() + 1).padStart(2, '0')}`
              + `-${String(depuis.getDate()).padStart(2, '0')}`;
  const gardes = points.filter(p => p.date >= seuil);
  return gardes.length >= 2 ? gardes : points.slice(-2);
}

function historySeries({ includeNow = true } = {}) {
  const pts = Store.state.monthly
    .filter(r => !rowIsEmpty(r))
    /* `dettes` : le capital restant dû du mois, tel que la photo l'a noté.
       Sans lui, la courbe nette ne pouvait déduire les crédits que du dernier
       point — le patrimoine net semblait plat pendant des années puis
       chutait d'un coup au bout. */
    /* `net` est rendu a cote du brut : les deux se lisent, et aucun appelant
       n'a plus a refaire la soustraction -- c'est en la refaisant que le journal
       avait fini par ne plus la faire du tout. */
    .map(r => ({ label: fmtMonth(r.date), date: r.date, ...rowGroups(r),
                 total: rowTotal(r), dettes: num(r.dettes), net: rowNet(r),
                 comment: r.comment }));
  if (includeNow) {
    const t = nowTotals();
    /* `total` doit egaler la somme des trois poches, comme pour un releve
       passe : la courbe suit la valeur des avoirs, les credits se lisent
       dans le patrimoine net du bandeau. */
    pts.push({ label: "Auj.", date: todayISO(), cash: t.cash, bourse: t.bourse,
               garanti: t.garanti,
               crypto: t.crypto, pe: t.pe, immo: t.immo, biens: t.biens,
               total: t.brut, comment: 'Photo actuelle' });
  }
  return pts;
}

function currentMonthKey() {
  return todayISO().slice(0, 7) + '-01';
}

const isCalendarMonth = date => /^\d{4}-\d{2}-01$/.test(String(date));

function ensureCalendarMonths(rows, cle, champTexte) {
  const annees = new Set(rows.map(r => String(r[cle]).slice(0, 4)));
  annees.add(String(new Date().getFullYear()));
  const presents = new Set(rows.map(r => r[cle]));
  for (const an of annees) {
    for (let m = 1; m <= 12; m++) {
      const date = `${an}-${String(m).padStart(2, '0')}-01`;
      if (!presents.has(date)) rows.push({ [cle]: date, v: {}, [champTexte]: '' });
    }
  }
  rows.sort((a, b) => String(a[cle]).localeCompare(String(b[cle])));
  return rows;
}

function clearMonthRow(row, champTexte) {
  row.v = {};
  row[champTexte] = '';
  /* La dette part avec les montants, sans quoi le releve qu'on vient d'effacer
     resterait au journal : il porte encore un capital restant du, donc il n'est
     plus vide au sens de `rowIsEmpty`. La ligne des depenses n'a pas ce champ,
     et `delete` sur une clef absente ne fait rien. */
  delete row.dettes;
}

const REPORT_JOURS = 7;
const PREFIXE_REPORT = 'jusquau:';

function rappelMasque(genre, key) {
  const v = String((Store.state.meta?.rappelsMasques || {})[genre] || '');
  if (!v) return false;
  if (v.startsWith(PREFIXE_REPORT)) return todayISO() < v.slice(PREFIXE_REPORT.length);
  return v === key;
}
function masquerRappel(genre, key) {
  Store.state.meta.rappelsMasques = { ...(Store.state.meta.rappelsMasques || {}), [genre]: key };
}
/* Repousse de sept jours a partir d'aujourd'hui. Le calcul reste en heure
   locale d'un bout a l'autre : voir `isoLocal`. */
function reporterRappel(genre, jours = REPORT_JOURS) {
  const [y, m, j] = todayISO().split('-').map(Number);
  const quand = isoLocal(new Date(y, m - 1, j + jours));
  Store.state.meta.rappelsMasques = {
    ...(Store.state.meta.rappelsMasques || {}), [genre]: PREFIXE_REPORT + quand };
  return quand;
}

const JOUR_RAPPEL_DEFAUT = 1;
function jourRappel() {
  const j = Math.round(num(Store.state.meta?.jourRappel)) || JOUR_RAPPEL_DEFAUT;
  return Math.min(28, Math.max(1, j));
}
function jourRappelAtteint() {
  return Number(todayISO().slice(8, 10)) >= jourRappel();
}

const aUnComptePropre = () =>
  comptesOuverts().some(c => !typeCompte(c.type).interne);

const aDejaServi = () =>
  (B().expenses || []).some(r => Object.values(r.v || {}).some(v => num(v) !== 0))
  || (Store.state.monthly || []).some(r => !rowIsEmpty(r));

function currentMonthPending() {
  const key = currentMonthKey();
  const i = Store.state.monthly.findIndex(r => r.date === key);
  const row = i >= 0 ? Store.state.monthly[i] : null;
  const vide = !row || rowIsEmpty(row);
  return { key, index: i, label: fmtMonth(key), vide,
           /* `vide` reste vrai avant le jour dit : c'est un fait sur les
              donnees, et la page des releves s'en sert pour marquer la ligne.
              Seul `missing`, qui commande la cloche et les bandeaux, attend. */
           missing: vide && aUnComptePropre()
                    && jourRappelAtteint() && !rappelMasque('releve', key) };
}

function moisPrecedentKey() {
  const [a, m] = todayISO().split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
function depensesEnAttente() {
  const key = moisPrecedentKey();
  const i = Store.state.budget.expenses.findIndex(r => r.month === key);
  const row = i >= 0 ? Store.state.budget.expenses[i] : null;
  const vide = !row || !Object.values(row.v || {}).some(v => num(v) !== 0);
  return { key, index: i, label: fmtMonth(key), vide,
           missing: vide && aDejaServi()
                    && jourRappelAtteint() && !rappelMasque('depenses', key) };
}

function moisVides(lignes, estVide) {
  const encours = currentMonthKey();
  const passes = (lignes || [])
    .filter(r => r.date && isCalendarMonth(r.date) && String(r.date) < encours)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const premier = passes.findIndex(r => !estVide(r));
  if (premier < 0) return [];
  return passes.slice(premier + 1).filter(estVide).map(r => r.date);
}

const trousReleves = () => moisVides(Store.state.monthly, rowIsEmpty);
const trousDepenses = () => moisVides(
  (Store.state.budget?.expenses || []).map(r => ({ date: r.month, v: r.v })),
  r => !Object.values(r.v || {}).some(v => num(v) !== 0));

/* La date d'un `Date`, lue en heure locale.

   `toISOString()` convertit d'abord en UTC : a Paris, minuit local est la
   veille a 22 h, et « aujourd'hui plus sept jours » en rendait six. Tout
   calcul de jour dans ce fichier passe donc par ici. */
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayISO() { return isoLocal(new Date()); }

const ZONES = {
  monde:     'Monde',
  amnord:    'Amérique du Nord',
  europe:    'Europe',
  france:    'France',
  asie:      'Asie-Pacifique',
  emergents: 'Émergents',
  autre:     'Non classé',
};
const SECTEURS = {
  diversifie: 'Diversifié',
  tech:       'Technologie',
  sante:      'Santé',
  finance:    'Finance',
  energie:    'Énergie',
  industrie:  'Industrie & défense',
  conso:      'Consommation',
  immobilier: 'Immobilier',
  matieres:   'Matières premières',
  crypto:     'Cryptomonnaies',
  autre:      'Non classé',
};

function devineZone(p) {
  const s = `${p.name || ''} ${p.longName || ''} ${p.symbol || ''}`.toLowerCase();
  const ac = assetClassDe(p);
  if (ac === 'crypto' || ac === 'metaux') return 'monde';
  if (/\bgold\b|silver|uranium|copper|commodit/.test(s)) return 'monde';
  if (/emerg|emmk|eimi|emim/.test(s)) return 'emergents';
  if (/\bworld\b|acwi|global|monde|all-?country/.test(s)) return 'monde';
  if (/japan|asia|asie|china|chine|india|inde|pacific|topix|nikkei|hang seng/.test(s)) return 'asie';
  if (/\bcac\b|france|français/.test(s)) return 'france';
  if (/stoxx|europe|europ|\bdax\b|\bftse\b|\bsmi\b|\bibex\b|\bmib\b/.test(s)) return 'europe';
  if (/s&p|sp ?500|nasdaq|\busa?\b|russell|dow jones|amerique|american/.test(s)) return 'amnord';
  if (p.currency === 'USD') return 'amnord';
  if (p.currency === 'EUR') return 'europe';
  return 'autre';
}

function devineSecteur(p) {
  const s = `${p.name || ''} ${p.longName || ''} ${p.symbol || ''}`.toLowerCase();
  const ac = assetClassDe(p);
  if (ac === 'crypto') return 'crypto';
  if (ac === 'obligations') return 'finance';
  if (ac === 'metaux' || /\bgold\b|\bor\b|silver|argent métal|uranium|copper|commodit/.test(s)) return 'matieres';
  if (/defen[cs]e|aerospace|armement|nato/.test(s)) return 'industrie';
  if (/health|santé|pharma|biotech|medical/.test(s)) return 'sante';
  if (/bank|banque|financ|assur|insur/.test(s)) return 'finance';
  if (/energy|énergie|energie|oil|pétrole|petrol|renewab/.test(s)) return 'energie';
  if (/reit|immobili|real estate/.test(s)) return 'immobilier';
  if (/consum|consommation|retail|luxe|luxury/.test(s)) return 'conso';
  if (/tech|nasdaq|semi|software|logiciel|nvidia|meta|apple|microsoft|amazon|alphabet|google|tesla/.test(s)) return 'tech';
  if (/\bworld\b|acwi|global|s&p|stoxx|\bcac\b|msci|core|500|emerg/.test(s)) return 'diversifie';
  return 'autre';
}

const zoneDe    = p => ZONES[p.zone]       ? p.zone    : devineZone(p);
const secteurDe = p => SECTEURS[p.secteur] ? p.secteur : devineSecteur(p);

function allocationParCle(cle, libelles) {
  const par = new Map();
  let total = 0;
  for (const p of Store.state.positions) {
    const v = posValue(p);
    if (!v) continue;
    const k = cle(p);
    par.set(k, (par.get(k) || 0) + v);
    total += v;
  }
  return [...par]
    .map(([k, value]) => ({ cle: k, label: libelles[k] || k, value,
                            pct: total ? value / total * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}
const allocationParZone    = () => allocationParCle(zoneDe, ZONES);
const allocationParSecteur = () => allocationParCle(secteurDe, SECTEURS);

const libelleAlloc = p => {
  const ac = assetClassDe(p);
  const cl = ASSET_CLASSES[ac];
  return ac === 'actions' ? `${cl} · ${ROLES[roleDe(p)]}` : cl;
};

/* `credits` : la ligne negative du capital restant du, et avec elle la base.

   Avec, la liste se totalise au patrimoine net — c'est ce que veulent l'accueil,
   l'export et la fiche. Sans, elle se totalise aux avoirs, et c'est ce que veut
   la carte de repartition, dont le camembert compte deja en brut : deux
   granularites d'un meme axe sous une seule base, plutot que deux cartes qui
   affichent le meme montant sous deux noms tant qu'aucun credit n'existe.
   La base suit le drapeau au lieu d'etre choisie par l'appelant : c'est le seul
   moyen que la somme des parts fasse toujours le total annonce. */
function allocationByAsset({ credits = true, financier = false } = {}) {
  const map = new Map();
  const teintes = new Map();
  const poches = new Map();
  const lignes = new Map();
  const add = (label, v, couleur, poche) => {
    map.set(label, (map.get(label) || 0) + v);
    if (couleur && !teintes.has(label)) teintes.set(label, couleur);
    lignes.set(label, (lignes.get(label) || 0) + 1);
    if (poche) {
      const vue = poches.get(label);
      poches.set(label, vue === undefined || vue === poche ? poche : null);
    }
  };

  for (const p of Store.state.positions) {
    const ac = assetClassDe(p);
    add(libelleAlloc(p), posValue(p), couleurClasse(ac), pocheDeClasse(ac));
  }
  for (const poche of pochesLiquidites()) {
    if (poche.value) add(poche.nom, poche.value, CLASSE_COULEURS.liquidites, 'liquidites');
  }
  for (const c of comptesOuverts()) {
    for (const l of (c.lignes || [])) {
      add(c.alloc || l.libelle, num(l.valeur),
          CLASSE_COULEURS[l.classe] || CLASSE_COULEURS.nonCote,
          pocheDeClasse(l.classe || 'nonCote'));
    }
  }
  if (credits && dettesTotal()) add(trad('Crédits en cours'), -dettesTotal(), 'var(--critical)');

  const total = financier ? totalFinancier()
    : credits ? nowTotals().total : nowTotals().brut;
  const sousTitre = label => {
    const poche = poches.get(label);
    const n = lignes.get(label) || 0;
    const bouts = [];
    if (poche && CLASSES_ACTIFS[poche]) bouts.push(CLASSES_ACTIFS[poche]);
    else if (poche === null) bouts.push(trad('plusieurs classes'));
    if (n > 1) bouts.push(`${n} ${trad('lignes')}`);
    return bouts.join(' · ');
  };
  return [...map.entries()]
    .filter(([label]) => !financier || !horsFinancier(poches.get(label)))
    .map(([label, value]) => ({ label, value, couleur: teintes.get(label),
                                sous: sousTitre(label),
                                pct: total ? value / total * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/* Le liquide entre dans cette repartition, et la base devient les avoirs.

   Elle l'excluait deux fois : les comptes du groupe `cash` etaient ecartes, et
   `lignesDe()` ne voit pas le cash pose sur un compte-titres. Une page qui
   s'appelle « Allocation » et qui cache quinze mille euros de liquidites ne
   montre pas une allocation, elle montre un portefeuille — et le cash est une
   classe d'actif, celle qu'on choisit quand on ne choisit pas.

   La base suit : `invested` valait le brut moins le cash, donc y ajouter le cash
   aurait fait des parts qui depassent cent pour cent. C'est `valeurCompte()` qui
   somme desormais, cash compris, et le total est le brut. */
function allocationByAccount({ financier = false } = {}) {
  const base = financier ? totalFinancier() : nowTotals().brut;
  return comptesOuverts()
    .map(c => {
      const lignes = lignesDe(c);
      const parClasse = new Map([['liquidites', cashCompte(c)]]);
      for (const l of lignes) parClasse.set(l.classe, (parClasse.get(l.classe) || 0) + l.valeur);
      const dominante = [...parClasse.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return { id: c.id, label: nomCompteV2(c),
               value: financier ? valeurFinanciere(c) : valeurCompte(c),
               etab: nomEtabDe(c), type: trad(typeCompte(c.type).label),
               couleur: CLASSE_COULEURS[dominante] || CLASSE_COULEURS.nonCote };
    })
    .filter(r => r.value)
    .map(r => ({ ...r, pct: base ? r.value / base * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/* Le meme decoupage par compte, mais sur ce qui est place : la valeur du compte
   moins ses especes.

   `allocationByAccount()` ne peut pas servir ici. Sa base est le brut, especes
   comprises, et c'est voulu depuis qu'Allocation montre le liquide. Le panneau
   « Place » a pour total `invested`, qui vaut le brut moins tout le cash : il
   listait donc des comptes de liquidites entiers sous un total qui les exclut,
   et ses lignes sommaient le brut. Mesure faite, l'ecart valait a l'euro les
   liquidites du detenteur.

   La soustraction est la meme des deux cotes — `invested` retire `g.cash`, cette
   liste retire `cashCompte()` compte par compte — donc la somme des lignes fait
   le total, et un controle l'exige. */
function placeByAccount() {
  const base = nowTotals().invested;
  return allocationByAccount()
    .map(r => ({ ...r, value: r.value - cashCompte(compteById(r.id)) }))
    .filter(r => Math.abs(r.value) > 0.005)
    .map(r => ({ ...r, pct: base ? r.value / base * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/* Le troisieme axe de la meme somme : apres « ce que c'est » et « ou c'est
   pose », en combien de temps ça sort.

   Le calcul existait deja, `poches().mobilisable`, mais il ne se lisait que par
   l'autonomie financiere, qui en tire un nombre de mois. Un nombre de mois
   repond a une autre question et ecrase la composition : savoir qu'un tiers du
   patrimoine met des mois a se vendre ne se disait nulle part.

   Deux precautions, et la seconde a failli manquer.

   L'ordre est celui de la table, du plus liquide au moins, et non le
   decroissant des deux autres cartes : ici le rang porte du sens, et trier par
   montant melangerait un palier de trois jours avec un palier de trois mois
   selon les hasards du patrimoine.

   Et les cinq paliers y sont, `habite` et `bloque` compris. L'autonomie les
   exclut de son cumul, a dessein — l'un n'arrive pas avant son terme, l'autre
   demande un demenagement — mais cette regle appartient a l'autonomie. Ici ils
   font partie des avoirs : les retirer donnerait une carte dont le total ne
   vaut pas la base annoncee par ses voisines. */
function allocationParDisponibilite({ financier = false } = {}) {
  const base = financier ? totalFinancier() : patrimoine().brut;
  const m = poches({ financier }).mobilisable;
  return Object.entries(MOBILISABLE_LABEL)
    .map(([cle, label]) => ({ cle, label: trad(label), value: num(m[cle]) }))
    .filter(x => Math.abs(x.value) > 0.005)
    .map(x => ({ ...x, pct: base ? x.value / base * 100 : 0 }));
}

/* Ce que le classement par poids montre sans jamais le dire.

   La carte range les lignes de la plus grosse a la plus petite, et s'arrete la.
   Le fait qui en decoule — une seule ligne pese un tiers de tout — demande de
   lire l'axe, de retenir un pourcentage et de le rapporter au total. Il se dit
   en une phrase.

   C'est un fait, jamais un avis : aucun seuil, aucune couleur, aucune alerte.
   Un rappel qui se declenche a chaque ouverture cesse d'etre lu, et « trop
   concentre » depend d'un projet que l'application ne connait pas.

   La liste est celle que la carte affiche, `allocationByAsset`, et non une
   somme refaite ici : une seconde addition du meme fait finit par diverger de
   la premiere.

   Deux gardes. Une seule ligne fait 100 % par construction, l'annoncer
   n'apprend rien. Et les trois premieres ne se disent qu'a partir de quatre :
   a trois, elles sont le patrimoine entier. */
function concentration({ financier = false } = {}) {
  const base = financier ? totalFinancier() : nowTotals().brut;
  if (!(base > 0.005)) return null;
  const lignes = allocationByAsset({ credits: false, financier })
    .filter(l => l.value > 0.005);
  if (lignes.length < 2) return null;
  const tete = lignes[0];
  const trois = lignes.slice(0, 3).reduce((s, l) => s + l.value, 0);
  return {
    n: lignes.length,
    premiere: { label: tete.label, value: tete.value, pct: tete.value / base * 100 },
    top3: lignes.length > 3
      ? { value: trois, pct: trois / base * 100 }
      : null,
  };
}

function stockTotals() {
  const somme = f => Store.state.positions.filter(f).reduce((s, p) => s + posValue(p), 0);
  const est = ac => p => assetClassDe(p) === ac;
  const parClasseRole = {};
  for (const cle of Object.keys(ASSET_CLASSES)) {
    parClasseRole[cle] = {
      core:      somme(p => est(cle)(p) && roleDe(p) === 'core'),
      satellite: somme(p => est(cle)(p) && roleDe(p) !== 'core'),
    };
  }
  const parClasse = Object.fromEntries(Object.entries(parClasseRole)
    .map(([cle, r]) => [cle, r.core + r.satellite]));

  const coreEtf     = parClasseRole.actions.core;
  const satellites  = parClasseRole.actions.satellite;
  const gold        = parClasse.metaux;
  const cryptoPos   = parClasse.crypto;
  const obligations = parClasse.obligations;
  const monetaire   = parClasse.monetaire;
  const cashToInvest = poches().investir;
  /* `assetClassDe()` ramene toute valeur inconnue sur « actions » : chaque
     position tombe donc dans une classe et une seule, et cette somme vaut
     exactement la somme de toutes les positions. */
  const invested   = Object.values(parClasse).reduce((s, v) => s + v, 0);
  const autres = comptesOuverts()
    .filter(c => typeCompte(c.type).groupe === 'bourse')
    .reduce((s, c) => s + (c.lignes || []).reduce((x, l) => x + num(l.valeur), 0), 0);
  const balance    = invested + cashToInvest + autres;
  return { coreEtf, satellites, gold, cryptoPos, obligations, monetaire,
           cashToInvest, invested, balance, parClasseRole, parClasse };
}

/* La base des poids du portefeuille Marchés, et le poids lui-même.

   Il y en avait deux, et la fiche d'une ligne le disait en toutes lettres :
   « d'où deux pourcentages différents pour une même ligne, et tous les deux
   justes ». Chacun se défendait — l'un pour savoir si une variation du jour
   pèse, l'autre pour situer la ligne dans ce qu'on pilote — mais la même
   position s'affichait à 66,8 % dans le tableau du jour et à 53,89 % sur sa
   fiche, à un clic d'écart. Deux nombres justes qui se contredisent à l'écran
   ne renseignent pas : ils font douter des deux.

   Une seule convention, donc, celle qui répond à la question qu'on se pose
   devant un portefeuille : quelle part de l'argent que j'ai ici. Le
   dénominateur est `balance` — les titres, la trésorerie qui attend d'être
   placée, et les lignes manuelles des comptes de marché. La somme des poids
   des positions fait alors la part des titres, et le cash à investir complète
   à 100 %.

   Une fonction et non un calcul recopié : il l'était à cinq endroits, et c'est
   le quatrième qui a divergé. `base` se passe en argument quand l'appelant en
   affiche plusieurs, pour ne pas rappeler `stockTotals()` par ligne. */
const basePortefeuilleMarches = () => stockTotals().balance;

function poidsPortefeuille(valeur, base = basePortefeuilleMarches()) {
  const b = num(base);
  return b ? num(valeur) / b * 100 : 0;
}

function perimetreReequilibrage() {
  const r = rebalanceRows();
  const dedans = r.base;
  const brut = patrimoine().brut;
  const dehors = [];
  for (const c of comptesOuverts()) {
    if (typeCompte(c.type).groupe === 'bourse') continue;
    for (const l of (c.lignes || [])) {
      const k = classeDePoche(l.classe);
      if (k && num(l.valeur)) dehors.push({ classe: k, libelle: l.libelle || nomCompteV2(c), valeur: num(l.valeur) });
    }
    for (const e of (c.cash || [])) {
      if (e.affectation !== 'investir' && num(e.montant)) {
        dehors.push({ classe: 'monetaire', libelle: nomCompteV2(c), valeur: num(e.montant) });
      }
    }
  }
  const tg = Store.state.targets.classes || {};
  const horsAtteinte = [...new Set(dehors.map(d => d.classe))]
    .filter(k => cibleDeClasse(tg[k]) > 0)
    .map(k => ({ classe: k, label: ASSET_CLASSES[k] || k,
                 montant: dehors.filter(d => d.classe === k).reduce((s, d) => s + d.valeur, 0) }));
  const nonCote = comptesOuverts()
    .filter(c => typeCompte(c.type).groupe !== 'bourse')
    .reduce((s, c) => s + (c.lignes || [])
      .filter(l => l.classe === 'nonCote')
      .reduce((x, l) => x + num(l.valeur), 0), 0);
  return { dedans, brut, dehors, montantDehors: brut - dedans, horsAtteinte,
           exclues: r.exclues, nonCote };
}

/* La cible d'une classe, qu'elle soit decoupee par role ou non. Une classe
   decoupee porte un objet a deux entrees : `num({core:70, satellite:25})` vaut
   zero. Quatre endroits sommaient les cibles avec `num()`, et le bandeau
   annoncait « tes cibles totalisent 10 % » a qui en avait pose 105. */
function cibleDeClasse(v) {
  return (v !== null && typeof v === 'object')
    ? Object.values(v).reduce((s, x) => s + num(x), 0) : num(v);
}
const sommeCibleDe = cibleDeClasse;

const CLE_TRESORERIE = 'cashToInvest';

/* Le nom d'une ligne de cible, classe ou tresorerie. Les messages qui parlaient
   d'exclusion lisaient `ASSET_CLASSES[cle]` et rendaient donc « undefined sortie
   du reequilibrage » des que la cle etait celle de la tresorerie. */
const nomDeLaCible = cle =>
  cle === CLE_TRESORERIE ? AFFECTATION_LABEL.investir : (ASSET_CLASSES[cle] || cle);

function sommeCibles() {
  const tg = Store.state.targets || {};
  const horsJeu = new Set(tg.exclues || []);
  const cash = horsJeu.has(CLE_TRESORERIE) ? 0 : num(tg.cashToInvest);
  return round2(Object.entries(tg.classes || {})
    .filter(([k]) => !horsJeu.has(k))
    .reduce((s, [, v]) => s + cibleDeClasse(v), 0) + cash);
}

function rebalanceRows() {
  const t = stockTotals();
  const tg = Store.state.targets;
  const exclues = new Set(tg.exclues || []);
  const encoursDe = t.parClasse;
  const cashSorti = exclues.has(CLE_TRESORERIE);
  const horsBase = [...exclues].reduce((s, k) =>
    s + (k === CLE_TRESORERIE ? num(t.cashToInvest) : (encoursDe[k] || 0)), 0);
  const base = t.balance - horsBase;
  const mk = (label, value, targetPct, cle) => {
    const p = num(targetPct);
    const targetVal = base * p / 100;
    return { label, cle, value, pct: base ? value / base * 100 : 0,
             targetPct: p, targetVal, delta: targetVal - value };
  };
  const cibleDe = cle => tg.classes?.[cle];
  const estDecoupee = cle => cibleDe(cle) !== null && typeof cibleDe(cle) === 'object';

  const classes = [];
  for (const [cle, label] of Object.entries(ASSET_CLASSES)) {
    if (exclues.has(cle)) continue;
    if (!estDecoupee(cle)) {
      const ligne = mk(label, encoursDe[cle] || 0, cibleDe(cle), `classes.${cle}`);
      if (ligne.value || ligne.targetPct) classes.push(ligne);
      continue;
    }
    const parRole = t.parClasseRole?.[cle] || { core: 0, satellite: 0 };
    for (const role of ['core', 'satellite']) {
      const ligne = mk(`${label} ${ROLES[role].toLowerCase()}`, num(parRole[role]),
                       cibleDe(cle)?.[role], `classes.${cle}.${role}`);
      ligne.classeParente = cle;
      ligne.labelClasse = label;
      ligne.role = role;
      classes.push(ligne);
    }
  }
  return {
    base, classes, cashSorti,
    exclues: [...exclues].map(cle => ({
      cle,
      label: cle === CLE_TRESORERIE ? AFFECTATION_LABEL.investir
                                    : (ASSET_CLASSES[cle] || cle),
      value: cle === CLE_TRESORERIE ? num(t.cashToInvest) : (encoursDe[cle] || 0),
    })),
    invested: mk(BASES.placeBourse.nom, t.invested - horsBase,
      Object.entries(tg.classes || {}).filter(([k]) => !exclues.has(k))
        .reduce((s, [, v]) => s + cibleDeClasse(v), 0)),
    cash: cashSorti ? null
      : mk(AFFECTATION_LABEL.investir, t.cashToInvest, tg.cashToInvest, CLE_TRESORERIE),
  };
}

/* Les placements derriere une ligne de cible.

   « Actions core, 44,8 % » ne disait pas de quoi ce core etait fait. La
   question se pose exactement au moment ou l'on regle la cible — renforcer le
   core, oui, mais quelle ligne — et la reponse vivait deux ecrans plus loin,
   dans Marches, ou il fallait lire le role ligne par ligne.

   La cle est celle que `rebalanceRows()` pose sur la ligne : `classes.actions`
   pour une classe entiere, `classes.actions.core` pour une moitie de role. Une
   cle de tresorerie ou inconnue rend `null` : la tresorerie n'est pas faite de
   positions, elle a sa propre fiche.

   Le total descend des memes positions que les lignes, il en est donc la somme
   par construction. Relire `parClasse` aurait ete un second calcul, et deux
   calculs du meme nombre finissent toujours par diverger. Ce qui garantit
   l'egalite avec la ligne affichee, c'est que `stockTotals()` filtre sur les
   deux memes predicats, `assetClassDe` et `roleDe` — le test le verifie. */
/* La classe qui pese le plus dans un lot de comptes, et sa couleur.

   Un groupe d'etablissement ou d'enveloppe n'a pas de couleur intrinseque, mais
   il a un contenu, et ce contenu en a une. Un courtier majoritairement en
   titres se lit vert comme les actifs de marche partout ailleurs ; un livret se
   lit bleu comme les liquidites. La couleur dit donc quelque chose de vrai, et
   d'utile au premier regard : quelle banque porte les actions, laquelle garde le
   cash.

   Elle etait un hachage du nom du groupe, qui collisionnait et piochait au hasard
   dans le vocabulaire des classes — un etablissement de banque heritait du vert
   des actifs de marche sans rien detenir de tel. Puis une teinte neutre unique, exacte mais
   morte. Le contenu tranche mieux que les deux.

   Le precedent est dans `allocationByAccount`, qui colore deja un compte par sa
   classe dominante pour la meme raison : « le compte n'est qu'un contenant, c'est
   ce qu'il porte qui compte ». */
function teinteDominante(comptes) {
  const parClasse = new Map();
  for (const c of comptes || []) {
    for (const e of (c.cash || [])) {
      parClasse.set('liquidites', (parClasse.get('liquidites') || 0) + num(e.montant));
    }
    for (const l of lignesDe(c)) {
      parClasse.set(l.classe, (parClasse.get(l.classe) || 0) + num(l.valeur));
    }
  }
  const dominante = [...parClasse.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  return dominante ? CLASSE_COULEURS[dominante] || 'var(--border-strong)'
                   : 'var(--border-strong)';
}

function changementDeTypePossible(compte, cibleId) {
  const cible = TYPES_COMPTE.find(t => t.id === cibleId);
  if (!cible) return { ok: false, raison: 'Ce type de compte n’existe pas.' };
  if (!compte) return { ok: false, raison: 'Ce compte n’existe plus.' };
  if (compte.type === cibleId) return { ok: true, sansChangement: true };

  const permises = new Set(cible.classes);
  const cash = (compte.cash || []).filter(e => num(e.montant) !== 0).length;
  if (cash && !permises.has('liquidites')) {
    return { ok: false, raison: `${cible.label} ne peut pas porter d’espèces. `
      + `Ce compte en déclare ${cash > 1 ? `${cash} parts` : 'une part'} : `
      + `remets-la à zéro, ou choisis un type qui accepte des liquidités.` };
  }

  const bloquantes = lignesDe(compte).filter(l => !permises.has(l.classe));
  if (bloquantes.length) {
    const noms = bloquantes.slice(0, 3).map(l => l.libelle).join(', ');
    return { ok: false, raison: `${cible.label} ne peut pas porter `
      + `${bloquantes.length > 1 ? 'ces placements' : 'ce placement'} : ${noms}`
      + `${bloquantes.length > 3 ? `, et ${bloquantes.length - 3} de plus` : ''}. `
      + `Déplace-${bloquantes.length > 1 ? 'les' : 'le'} d’abord, ou choisis un `
      + `type qui ${bloquantes.length > 1 ? 'les' : 'l’'}accepte.` };
  }
  return { ok: true };
}

/* Ce qu'on peut encore verser sur un livret plafonne.

   Un Livret A s'arrete a 22 950 EUR, un LDDS a 12 000, un LEP a 10 000. Le
   modele ne connait que le type « livret » et non le produit : le plafond est
   donc saisi, pas deduit. Une constante par produit aurait demande une liste a
   tenir a jour a chaque revalorisation reglementaire, pour une information que
   le detenteur a sous les yeux.

   Rend `null` quand aucun plafond n'est pose, ce qui est le cas par defaut et
   celui de tous les autres types de compte : l'ecran n'a alors rien a dire.
   Jamais de reste negatif — un livret peut depasser son plafond par le seul jeu
   des interets, c'est legal, et annoncer « il reste −40 EUR a verser » serait
   une facon absurde de dire qu'il est plein. */
function resteAVerser(compte) {
  const plafond = num(compte?.plafond);
  if (!plafond) return null;
  const verse = (compte.cash || []).reduce((s, e) => s + num(e.montant), 0);
  return {
    plafond, verse,
    reste: Math.max(0, round2(plafond - verse)),
    part: plafond ? Math.min(100, verse / plafond * 100) : 0,
    plein: verse >= plafond - 0.005,
  };
}

function partageDeCible(cible, parRole) {
  const core = num(parRole?.core), satellite = num(parRole?.satellite);
  const total = core + satellite;
  const c = num(cible);
  const sat = total ? Math.round(c * satellite / total) : 0;
  return { core: Math.max(0, c - sat), satellite: Math.min(c, sat) };
}

function positionsFiltrees(garde) {
  return Store.state.positions
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => garde(p))
    .map(({ p, i }) => {
      const c = Store.state.comptes.find(x => x.id === p.account);
      return {
        i, nom: p.name, valeur: posValue(p),
        role: roleDe(p), classe: assetClassDe(p),
        compte: c ? nomCompteV2(c) : '',
        etab: c ? nomEtabDe(c) : '',
      };
    })
    .sort((a, b) => b.valeur - a.valeur);
}

const ficheDePositions = (label, lignes) => ({
  label, lignes, total: round2(lignes.reduce((s, l) => s + l.valeur, 0)),
});

function positionsDeCible(cle) {
  const [, classe, role] = String(cle || '').split('.');
  if (!classe || !ASSET_CLASSES[classe]) return null;
  if (role && !ROLES[role]) return null;
  return {
    classe, role: role || null,
    ...ficheDePositions(
      role ? `${ASSET_CLASSES[classe]} ${ROLES[role].toLowerCase()}`
           : ASSET_CLASSES[classe],
      positionsFiltrees(p => assetClassDe(p) === classe
                          && (!role || roleDe(p) === role))),
  };
}

function positionsDeRole(role) {
  if (!ROLES[role]) return null;
  return {
    classe: null, role,
    ...ficheDePositions(ROLES[role], positionsFiltrees(p => roleDe(p) === role)),
  };
}

function rebalanceRoles() {
  const parRole = { core: 0, satellite: 0 };
  const parClasse = new Map();
  for (const p of Store.state.positions) {
    const v = posValue(p);
    if (!v) continue;
    const r = roleDe(p), ac = assetClassDe(p);
    parRole[r] += v;
    if (!parClasse.has(ac)) parClasse.set(ac, { core: 0, satellite: 0 });
    parClasse.get(ac)[r] += v;
  }
  const cash = num(stockTotals().cashToInvest);
  const base = rebalanceRows().base;
  const mk = (cle, label, valeur) => ({
    cle, label, value: valeur !== undefined ? valeur : parRole[cle],
    pct: base ? (valeur !== undefined ? valeur : parRole[cle]) / base * 100 : 0,
  });
  return {
    base,
    roles: [mk('core', ROLES.core), mk('satellite', ROLES.satellite),
            mk('cashToInvest', AFFECTATION_LABEL.investir, cash)],
    parClasse: [...parClasse]
      .map(([ac, v]) => ({ classe: ASSET_CLASSES[ac], ...v, total: v.core + v.satellite }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total),
    composition: ['core', 'satellite'].reduce((acc, r) => {
      const m = new Map();
      for (const p of Store.state.positions) {
        const v = posValue(p);
        if (!v || roleDe(p) !== r) continue;
        const ac = assetClassDe(p), nat = natureDe(p);
        const cle = `${ac}|${nat}`;
        if (!m.has(cle)) m.set(cle, {
          classe: ASSET_CLASSES[ac], nature: nat,
          label: `${ASSET_CLASSES[ac]} · ${nat === 'fonds' ? 'fonds' : 'en direct'}`,
          couleur: couleurClasse(ac), value: 0,
        });
        m.get(cle).value += v;
      }
      acc[r] = [...m.values()].filter(x => x.value > 0).sort((a, b) => b.value - a.value);
      return acc;
    }, {
      cashToInvest: num(cash) > 0.005 ? [{
        classe: AFFECTATION_LABEL.investir, nature: 'fonds',
        label: AFFECTATION_LABEL.investir,
        couleur: CLASSE_COULEURS.liquidites, value: num(cash),
      }] : [],
    }),
    parNature: (() => {
      const m = new Map();
      for (const p of Store.state.positions) {
        const v = posValue(p);
        if (!v) continue;
        const cle = `${assetClassDe(p)}|${natureDe(p)}`;
        if (!m.has(cle)) m.set(cle, { classe: ASSET_CLASSES[assetClassDe(p)],
                                      nature: NATURES[natureDe(p)],
                                      couleur: couleurClasse(assetClassDe(p)),
                                      core: 0, satellite: 0, lignes: 0 });
        const e = m.get(cle);
        e[roleDe(p)] += v;
        e.lignes++;
      }
      return [...m.values()]
        .map(e => ({ ...e, total: e.core + e.satellite }))
        .sort((a, b) => b.total - a.total);
    })(),
  };
}

/* --- fonds ou titre en direct -----------------------------------------
   « Actions » couvre un MSCI World et une ligne Meta, qui ne portent pas le
   même risque : l'un est mille sociétés, l'autre une seule. La distinction
   manquait à la lecture socle / satellite, où les deux se fondaient dans un
   même total.

   Ce n'est pas une classe d'actif pour autant. Un ETF est une enveloppe : un
   MSCI World *est* des actions, un ETF obligataire *est* de l'obligation, un
   ETC or *est* du métal. En faire une classe la mettrait en concurrence avec
   « Actions » pour le même argent et fausserait des cibles qui portent sur du
   risque, pas sur un emballage.

   C'est donc un second axe, orthogonal, et l'application le connaît déjà :
   Yahoo renvoie la nature de l'instrument dans `kind`. Un réglage manuel
   prend le pas quand la passerelle n'a rien pu dire. */
const NATURES = { fonds: 'Fonds', titre: 'Titre en direct' };
const KIND_VERS_NATURE = {
  ETF: 'fonds', MUTUALFUND: 'fonds', FUND: 'fonds',
  EQUITY: 'titre', CRYPTOCURRENCY: 'titre', CURRENCY: 'titre', INDEX: 'fonds',
};
const INDICES_FONDS = [
  /\b(amundi|ishares|lyxor|xtrackers|vanguard|spdr|invesco|vaneck|wisdomtree|blackrock)\b/i,
  /\b(bnp\s*paribas\s*easy|axa\s*im|ossiam|tabula|jpmorgan|jpm|fidelity|hsbc|schwab|ark\s*invest)\b/i,
  /\b(etf|etc|etn|ucits|sicav|fcp|opcvm|fonds|fund|index\s*fund|tracker)\b/i,
  /\b(msci|s&p|sp500|ftse|stoxx|cac\s*40|dax|mdax|nasdaq|nikkei|russell|topix|smi|sensex)\b/i,
  /\b(all[-\s]?world|world|emerging|indice|index)\b/i,
];
const nomSentLeFonds = nom => INDICES_FONDS.some(rx => rx.test(String(nom || '')));

function natureDe(p) {
  if (NATURES[p?.nature]) return p.nature;
  const auto = KIND_VERS_NATURE[p?.kind];
  if (auto) return auto;
  return nomSentLeFonds(p?.name) ? 'fonds' : 'titre';
}

/* Une seule table pour toutes les classes, poches comprises.
   Il y en avait deux — l'une pour les classes de marché, l'autre pour les
   poches de patrimoine — avec des valeurs qui divergeaient : les obligations
   étaient `series-6` d'un côté et `series-7` de l'autre, et surtout les
   métaux précieux partageaient `series-4` avec l'immobilier. Dans
   « Allocation par actif », où les deux apparaissent, un studio et un ETC or
   se peignaient de la même couleur. Sept clés, sept teintes, une table. */
const TEINTE_CLASSE = {
  liquidites: 1, monetaire: 1,
  actions: 2,
  nonCote: 3,
  immobilier: 4, immobilierCote: 4,
  crypto: 5,
  metaux: 6,
  obligations: 7,
  diversifie: 8,
  /* La teinte de « multi-actifs », et c'est une paire volontaire de plus.

     Aucune couleur neuve n'etait possible : mesure contre les neuf series et
     les cinq couleurs de sens, en balayant teinte, saturation et clarte, le
     meilleur ecart atteignable sur tout le cercle vaut 17,6 degres en theme
     clair et 19,1 en sombre, quand la regle en exige vingt. Le cercle est
     plein.

     La paire suit exactement le motif d'immobilier et immobilier cote : l'une
     est une poche du patrimoine, l'autre une classe de ligne cotee, et les deux
     vocabulaires ne se rencontrent sur aucun graphique — `repartitionClasses()`
     dessine les poches, les cibles et les listes de lignes dessinent les
     classes fines. Un controle le verifie desormais, pour que l'hypothese cesse
     d'en etre une. */
  garanti: 8,
  bienValeur: 9,
};
const TEINTES_DISPONIBLES = 12;
const TEINTE_SANS_CLASSE = 12;
const couleurClasse = ac =>
  `var(--series-${TEINTE_CLASSE[CLASSES_ALIAS[ac] || ac] || TEINTE_SANS_CLASSE})`;

/* Ce qui est place, groupe par type d'enveloppe.

   Meme argent que `allocationByAccount()`, meme perimetre, meme base : les deux
   cartes de la page Patrimoine sont deux granularites d'un seul total, le type
   puis le compte. Leurs sommes sont donc egales, et un test le verifie.

   Deux exclusions, et chacune a sa raison.

   Le cash, parce que les liquidites posees sur un PEA en attente d'un achat
   gonflaient la part de l'enveloppe sans qu'un euro soit place. Elles ont leur
   propre lecture, dans les poches de patrimoine et dans Comptes. Un type qui ne
   porte que du cash sort donc de la repartition.

   Le levier, parce que c'est une dette et non une enveloppe. Attention : le
   type `levier` ne figure pas dans `TYPES_COMPTE`, il vient de l'ancien modele,
   donc `typeCompte('levier').groupe` ne vaut rien et le filtre sur le groupe ne
   l'ecarte pas. Il faut le nommer. Une premiere version de cette fonction l'a
   oublie, et le test l'a rattrapee. */
/* Meme base et meme perimetre que `allocationByAccount()`, un cran au-dessus :
   les deux graphiques de la carte sont deux granularites d'un seul total, et
   deux bases differentes en auraient fait deux cartes qui se contredisent. */
function byAccountType({ financier = false } = {}) {
  const base = financier ? totalFinancier() : nowTotals().brut;
  const parType = new Map();
  for (const c of comptesOuverts()) {
    if (c.type === 'levier') continue;
    const v = financier ? valeurFinanciere(c) : valeurCompte(c);
    if (!v) continue;
    parType.set(c.type, (parType.get(c.type) || 0) + v);
  }
  return [...parType.entries()]
    .filter(([, value]) => Math.abs(value) > 0.005)
    .map(([type, value]) => ({
      label: trad(typeCompte(type).label),
      value, pct: base ? value / base * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function objectiveStatus() {
  const { total } = nowTotals();
  const obj = num(Store.state.meta.objective);
  return { total, obj, pct: obj ? total / obj * 100 : 0, remaining: total - obj };
}

/*   Ce qu'elle faisait, pour memoire : le patrimoine du jour plus un nombre saisi
   a la main. Ni marches, ni epargne, ni charges — donc pas une projection, mais
   une addition. La vraie vit dans l'onglet Projection, avec ses hypotheses.

   `meta.expectedInflow` reste dans l'etat sans lecteur, comme `budget
   .supplements` : un export d'avant doit continuer de se relire. */

function deltas() {
  const pts = historySeries({ includeNow: false });
  const t = nowTotals();
  const last = pts[pts.length - 1];
  const firstOfYear = pts.find(p => p.date.startsWith(String(new Date().getFullYear()))) || pts[0];
  const first = pts[0];
  /* Comparer ce qui se compare. `t.total` est le patrimoine **net**, alors
     que `rowTotal()` rend le **brut** du mois : sans retrancher le capital
     restant du de ce mois-la, la variation valait la dette entiere. Avec un
     pret immobilier de 236 400 EUR, « depuis le 1er janvier » annoncait
     -235 055 EUR quand le patrimoine avait en realite monte de 6 945 EUR.
     Invisible sans credit, ou brut et net coincident : c'est un jeu de
     donnees de demonstration, portant un pret, qui l'a fait apparaitre. */
  const d = (from) => {
    if (!from) return null;
    const base = num(from.net);
    /*       On rend donc `pct: null` dans ces cas, et l'affichage se contente de
       l'euro, qui reste exact. Trois situations : base nulle, base negative, et
       changement de signe entre les deux bornes. */
    const traverse = (base > 0 && t.total < 0) || (base < 0 && t.total > 0);
    const pct = (base > 0 && !traverse) ? (t.total / base - 1) * 100 : null;
    return { eur: t.total - base, pct, label: from.label };
  };
  return { month: d(last), ytd: d(firstOfYear), all: d(first) };
}

const B = () => Store.state.budget;

const revenuMensuel = r => auMois(r.amount, r);

const revenuEstime = () => (B().income || []).some(r => !!r.estime);

function incomeTotal() {
  return B().income.reduce((s, i) => s + revenuMensuel(i), 0);
}

const CHARGE_PERIODES = [
  ['semaine',  'hebdo',       12 / 52],
  ['mois',     'mensuel',     1],
  ['trimestre', 'trimestriel', 3],
  ['semestre', 'semestriel',  6],
  ['an',       'annuel',      12],
];
const CHARGE_MOIS_COUVERTS = Object.fromEntries(
  CHARGE_PERIODES.map(([cle, , mois]) => [cle, mois]));
const CHARGE_PERIODE_LABEL = Object.fromEntries(
  CHARGE_PERIODES.map(([cle, label]) => [cle, label]));

const chargePeriode = c => (c && CHARGE_MOIS_COUVERTS[c.period]) ? c.period : 'mois';
const auMois = (valeur, c) => num(valeur) / CHARGE_MOIS_COUVERTS[chargePeriode(c)];
const chargeMensuelle = c => auMois(c.amount, c);

function fixedTotal() {
  return B().fixedCharges.reduce((s, c) => s + chargeMensuelle(c), 0);
}

function contributors() { return B().contributors || []; }

function shareOf(charge, id) { return num((charge.shares || {})[id]); }

function sharedOn(charge) {
  return contributors().reduce((s, p) => s + shareOf(charge, p.id), 0);
}

function myShare(charge) { return num(charge.amount) - sharedOn(charge); }

const shareMensuelle = (charge, id) => auMois(shareOf(charge, id), charge);
const myShareMensuelle = charge => chargeMensuelle(charge) - auMois(sharedOn(charge), charge);

function sharedTotals() {
  const lignes = B().fixedCharges;
  const parPersonne = contributors().map(p => ({
    ...p, total: lignes.reduce((s, c) => s + shareMensuelle(c, p.id), 0),
  }));
  const partage = parPersonne.reduce((s, p) => s + p.total, 0);
  const total = fixedTotal();
  return { parPersonne, partage, mine: total - partage, total };
}

function fixedSharePK() { return sharedTotals().partage; }

function budgetFrame() {
  const income = incomeTotal();
  const fixed = fixedTotal();
  const available = income - fixed;
  const target = num(B().monthlyTarget);
  return {
    income, fixed, available, target,
    fixedPct: income ? fixed / income * 100 : 0,
    availablePct: income ? available / income * 100 : 0,
    targetPct: income ? target / income * 100 : 0,
    investTarget: available - target,
    investTargetPct: income ? (available - target) / income * 100 : 0,
  };
}

function expenseRowTotal(row) {
  return expenseCategories().reduce((s, c) => s + num(row.v[c]), 0);
}

const VALEURS_CONNUES = {
  preteur: () => [
    ...(Store.state.etabs || []).flatMap(e => (e.dettes || []).map(d => d.preteur)),
    ...(Store.state.etabs || []).map(e => e.nom),
  ],
  organisme: () => (B().fixedCharges || []).map(c => c.provider),
  source: () => (B().income || []).map(r => r.label),
  posteBien: () => (B().fixedCharges || []).filter(c => c.bienId).map(c => c.label),
};

function valeursConnues(cle) {
  const vues = new Map();
  for (const v of (VALEURS_CONNUES[cle]?.() || [])) {
    const t = String(v || '').trim();
    if (t) vues.set(t.toLowerCase(), t);
  }
  return [...vues.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

/* « 100+50+70 », « 12,50 + 8 » : la somme se tape dans le champ, ce qui evite
   d'ouvrir un panneau pour trois montants. Analyseur strict — pas d'`eval` sur
   une saisie — qui rend les termes autant que le total, puisque ce sont eux
   qu'on affichera ensuite en détail. Une saisie invalide ne rend rien, et le
   champ garde ce qu'il avait. */
function parseSomme(texte) {
  const brut = String(texte ?? '').trim();
  if (!brut) return { total: 0, termes: [] };
  if (!/^[\d\s+.,-]+$/.test(brut)) return null;
  const morceaux = brut.replace(/(\d)\s*([+-])/g, '$1\u0000$2').split('\u0000');
  const termes = [];
  for (const mc of morceaux) {
    const t = mc.replace(/\s+/g, '').replace(',', '.');
    if (!t) return null;
    const v = Number(t);
    if (!Number.isFinite(v)) return null;
    termes.push(round2(v));
  }
  return { total: round2(termes.reduce((s, v) => s + v, 0)), termes };
}

function expenseRowIsEmpty(row) {
  return expenseRowTotal(row) === 0;
}

function expenseSeries(year) {
  const all = !year || year === 'all';
  return B().expenses
    .filter(r => all || r.month.startsWith(String(year)))
    .map(r => ({
      month: r.month, label: fmtMonth(r.month), note: r.note,
      total: expenseRowTotal(r), v: r.v,
    }));
}

function expenseYears() {
  return [...new Set(B().expenses.map(r => r.month.slice(0, 4)))].sort();
}

/* De combien un mois depasse son objectif, en trois niveaux.

   Le graphique peignait en rouge tout mois au-dessus de l'objectif, sans
   graduation : sur huit mois, sept etaient rouges, et le rouge ne disait donc
   plus rien. Une couleur d'alerte qui s'allume presque toujours est une couleur
   decorative.

   Un tiers d'ecart est le seuil : en dessous, un mois se rattrape sur le
   suivant, c'est du bruit de la vie courante. Au-dela, il faut une decision.
   `SEUIL_DEPASSEMENT_GRAVE` le nomme pour que le graphique, le tableau et la
   liste ne puissent pas en avoir trois lectures.

   Rend 'sous', 'leger' ou 'grave'. Un mois vide n'a pas de niveau : rendre
   'sous' l'aurait compte comme une reussite alors que rien n'est saisi. */
const SEUIL_DEPASSEMENT_GRAVE = 0.5;
function niveauDepassement(total, objectif) {
  const t = num(total), o = num(objectif);
  if (!t) return null;
  if (!o || t <= o) return 'sous';
  return (t - o) / o >= SEUIL_DEPASSEMENT_GRAVE ? 'grave' : 'leger';
}

const CLASSE_DEPASSEMENT = { sous: 'up', leger: 'tiede', grave: 'down' };
const classeDepassement = (total, objectif) =>
  CLASSE_DEPASSEMENT[niveauDepassement(total, objectif)] || 'muted';

function expenseYearStats(year) {
  const rows = expenseSeries(year).filter(r => r.total > 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const target = num(B().monthlyTarget);

  /* Le mois en cours n'est pas fini : le compter dans la moyenne la fait
     plonger le 2 du mois, puis remonter jusqu'au 31. Au 3 août, huit mois dont
     un a 250 EUR donnaient 1 339 EUR de moyenne contre 1 464 EUR la veille,
     sans qu'aucune depense n'ait disparu.

     Il quitte donc tout ce qui compare des mois entre eux : la moyenne, le
     compte des mois sous et au-dessus de l'objectif, le meilleur et le pire.
     Il reste dans le `total` de l'annee, qui additionne ce qui a ete depense
     et n'a pas a mentir, et dans `months`, qui dit combien de mois portent
     une saisie. Si le mois courant est le seul renseigne, on le garde faute
     de mieux : une moyenne approximative vaut mieux que zero. */
  const enCours = currentMonthKey();
  const clos = rows.filter(r => r.month !== enCours);
  const base = clos.length ? clos : rows;

  const sousObjectif = base.filter(r => r.total <= target);
  const surObjectif = base.filter(r => r.total > target);

  return {
    year, months: rows.length, total,
    moisRetenus: base.length,
    moisEnCoursExclu: clos.length < rows.length && clos.length > 0,
    average: base.length ? base.reduce((s, r) => s + r.total, 0) / base.length : 0,
    sousObjectif, surObjectif,
    under: sousObjectif.length,
    over: surObjectif.length,
    best: base.reduce((a, r) => (!a || r.total < a.total) ? r : a, null),
    worst: base.reduce((a, r) => (!a || r.total > a.total) ? r : a, null),
  };
}

function expenseCategories() {
  const c = Store.state.budget.categories;
  return (Array.isArray(c) && c.length) ? c : EXPENSE_CATEGORIES;
}

/*    Deplace une categorie d'un cran. L'ordre de `budget.categories` EST l'ordre
   des colonnes du detail mensuel, de la fenetre de saisie, des graphiques et
   des exports : une seule liste, donc un seul geste pour tous ces ecrans.*/
function deplacerCategorie(cat, delta) {
  if (!Array.isArray(Store.state.budget.categories) || !Store.state.budget.categories.length) {
    Store.state.budget.categories = [...expenseCategories()];
  }
  const arr = Store.state.budget.categories;
  const i = arr.indexOf(cat), j = i + (delta < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}

/* --- retirer une categorie, sans toucher au passe ----------------------

   Supprimer une categorie efface ses montants sur tous les mois :
   `removeExpenseCategory` le fait, et la confirmation le dit. C'est ce qu'il
   faut pour une colonne creee par erreur, et c'est exactement ce qu'il ne faut
   pas quand on a simplement cesse de depenser dans ce poste.

   Retirer est l'autre geste : la categorie quitte la saisie du mois, et ne
   quitte rien d'autre. Elle garde ses montants, ses colonnes dans le tableau,
   sa part dans les statistiques et dans les exports.

   Le point qui decide de tout : `expenseCategories()` n'est PAS filtree. Treize
   endroits la parcourent, dont le total d'un mois — `expenseRowTotal` somme
   `row.v[c]` pour chaque `c` de cette liste. En retirer une categorie qui porte
   encore de l'argent ferait baisser des totaux passes sans que rien ne le dise,
   et un total cesserait d'egaler la somme de ses parts. La liste des montants
   reste donc entiere, et c'est la saisie qui se restreint. */
const categorieRetiree = cat => (Store.state.budget.retirees || []).includes(cat);

function categoriesSaisie() {
  return expenseCategories().filter(c => !categorieRetiree(c));
}

function retirerCategorie(cat) {
  if (!expenseCategories().includes(cat) || categorieRetiree(cat)) return false;
  const b = Store.state.budget;
  b.retirees = b.retirees || [];
  b.retirees.push(cat);
  return true;
}

function reprendreCategorie(cat) {
  const b = Store.state.budget;
  if (!Array.isArray(b.retirees)) return false;
  const i = b.retirees.indexOf(cat);
  if (i < 0) return false;
  b.retirees.splice(i, 1);
  return true;
}

/* Ne pas detailler ses depenses, pour qui ne veut pas de neuf cases par mois.

   Aucun mecanisme nouveau, et c'est le point : `retirees` fait deja exactement
   ça, une categorie a la fois. Il manquait le geste d'un coup, et le nom qui dit
   ce qu'on fait. Un « total du mois » pose a cote de `v` aurait ete un second
   champ pour la meme valeur — treize endroits lisent `v`, dont `expenseRowTotal`,
   et le total aurait cesse d'egaler la somme de ses parts chez ceux-la.

   L'etat se derive, il ne se declare pas : ne rien detailler, c'est n'avoir plus
   qu'une case a remplir. Un drapeau `sansDistinction` aurait pu mentir des la
   premiere categorie reprise a la main.

   Le fourre-tout n'est pas « Autres ». Les deux mots se ressemblent et ne disent
   pas la meme chose : « Autres » est le reste, ce qui n'entrait pas ailleurs, et
   il porte deja des montants chez qui detaille. Le confondre avec « tout » ferait
   une serie qui change de sens au milieu de son historique.

   C'est une categorie ordinaire, sans garde ni statut : elle se renomme, elle se
   supprime, et quelqu'un qui prefere « Vie courante » a le droit. Un nom reserve
   aurait demande des exceptions dans le renommage et la suppression, pour un
   gain nul. */
const CATEGORIE_TOUT = 'Tout confondu';

/* Le nom de la categorie est une donnee : il part dans les cles de `v`, dans le
   tableau, dans les exports. Il ne se traduit donc jamais APRES coup -- traduire
   a l'affichage renommerait une colonne au changement de langue et le mois
   precedent porterait l'autre nom.
   Mais c'est l'application qui le cree, pas le detenteur : elle l'ecrit dans la
   langue en vigueur au moment du clic. Un anglophone recevait « Tout confondu ».
   La reconnaissance accepte les deux graphies, sinon changer de langue puis
   recliquer creerait une seconde case a cote de la premiere. */
const NOMS_TOUT = () => [CATEGORIE_TOUT, trad(CATEGORIE_TOUT)];

/* Les catégories sont-elles désactivées ? Deux états, pas trois.

   C'est LA source de vérité de Budget, et la seule : ou l'on répartit ses
   dépenses entre des catégories, ou l'on ne remplit qu'une case. Le choix se
   fait dans la saisie du mois, là où il a un sens, et l'affichage le suit.

   Une préférence d'affichage a été essayée à côté, `meta.budgetDetail`, avec
   deux crans en tête de page. C'était un second système pour une question déjà
   tranchée : rien ne garantissait que les deux s'accordent, et l'écran pouvait
   proposer de détailler ce que la saisie ne détaillait plus. Deux portes sur un
   même champ sont saines, deux champs pour la même valeur ne le sont pas.

   Ce que cet état ne touche pas : les montants. `retirerCategorie` n'efface
   rien, les mois passés gardent leur découpage, et l'export le porte toujours.
   L'affichage suit le choix courant, le stockage garde l'histoire. */
function sansDistinction() {
  return categoriesSaisie().length === 1;
}

/* Les mois d'une année qu'il y a lieu de montrer.

   Un mois à venir n'est pas un mois à zéro euro : il n'a pas eu lieu. Le
   calendrier ouvre les douze mois dès le premier lancement, donc le graphique
   annonçait « déc. 0 € » au mois d'août, et quatre barres plates se lisaient
   comme quatre mois sans dépenses.

   Une année passée garde ses douze mois : un mois vide y est un vrai zéro, et
   c'est une information. Une année à venir ne montre que ce qui est déjà saisi —
   quelqu'un peut préparer janvier en décembre, et cacher une saisie serait pire
   que montrer un vide.

   Les statistiques, elles, n'ont jamais eu besoin de cette fonction :
   `expenseYearStats` écarte déjà tout mois à zéro, et le mois en cours de ses
   comparaisons. */
function expenseSeriesVisible(year) {
  const s = expenseSeries(year);
  if (!year || year === 'all') return s;
  const encours = currentMonthKey();
  const an = String(year), anCourant = encours.slice(0, 4);
  if (an < anCourant) return s;
  if (an > anCourant) return s.filter(r => r.total);
  return s.filter(r => r.month <= encours || r.total);
}

/* Garde une seule case et retire les autres. Rend le nom de celle qui reste.

   Rien n'est efface : `retirerCategorie` ne touche a aucun montant, les mois
   passes gardent leur decoupage, et le tableau comme les exports continuent de
   le montrer. C'est la saisie du mois prochain qui se simplifie, pas l'histoire.

   Si une seule categorie est deja proposee, c'est elle qu'on garde : creer un
   fourre-tout a cote ferait deux cases la ou l'on en demandait une. */
function neePlusDetailler() {
  const proposees = categoriesSaisie();
  if (proposees.length === 1) return proposees[0];
  const nom = trad(CATEGORIE_TOUT);
  const garde = expenseCategories().find(c => NOMS_TOUT().includes(c))
    || addExpenseCategory(nom) || nom;
  reprendreCategorie(garde);
  for (const c of expenseCategories()) if (c !== garde) retirerCategorie(c);
  return garde;
}

function regrouperMois(ligne, garde) {
  const avant = { ...(ligne.v || {}) };
  const remplis = Object.keys(avant).filter(k => num(avant[k]));
  const total = round2(remplis.reduce((s, k) => s + num(avant[k]), 0));
  ligne.v = total ? { [garde]: total } : {};
  if (remplis.length > 1) ligne.avantRegroupement = { v: avant, total };
  else delete ligne.avantRegroupement;
  return total;
}

/* Rendre le decoupage garde, si et seulement si le total n'a pas bouge.

   Rend `true` quand il a ete rendu. Dans le cas contraire la memoire s'efface :
   elle ne decrit plus ce mois, et la garder ferait esperer un retour qui ne
   viendra pas. */
function defaireRegroupement(ligne) {
  const memoire = ligne && ligne.avantRegroupement;
  if (!memoire) return false;
  const total = Object.values(ligne.v || {}).reduce((s, x) => s + num(x), 0);
  delete ligne.avantRegroupement;
  if (Math.abs(total - num(memoire.total)) > 0.005) return false;
  ligne.v = memoire.v;
  return true;
}

function reprendreLeDetail() {
  const retirees = [...(Store.state.budget.retirees || [])];
  retirees.forEach(reprendreCategorie);
  let mois = 0;
  for (const ligne of (Store.state.budget.expenses || [])) {
    if (defaireRegroupement(ligne)) mois++;
  }
  return { categories: retirees.length, mois };
}

function addExpenseCategory(nom) {
  const propre = String(nom || '').trim();
  if (!propre) return null;
  const liste = Store.state.budget.categories;
  if (liste.some(c => c.toLowerCase() === propre.toLowerCase())) return null;  // pas de doublon
  liste.push(propre);
  return propre;
}

function renameExpenseCategory(ancien, nouveau) {
  const propre = String(nouveau || '').trim();
  const liste = Store.state.budget.categories;
  const i = liste.indexOf(ancien);
  if (i < 0 || !propre || propre === ancien) return false;
  if (liste.some(c => c.toLowerCase() === propre.toLowerCase())) return false;
  liste[i] = propre;
  for (const r of Store.state.budget.expenses) {
    if (r.v && r.v[ancien] !== undefined) { r.v[propre] = r.v[ancien]; delete r.v[ancien]; }
  }
  const ret = Store.state.budget.retirees;
  if (Array.isArray(ret)) {
    const j = ret.indexOf(ancien);
    if (j >= 0) ret[j] = propre;
  }
  return true;
}

function expenseCategoryTotal(cat) {
  return Store.state.budget.expenses.reduce((s, r) => s + num(r.v?.[cat]), 0);
}

function removeExpenseCategory(cat) {
  const liste = Store.state.budget.categories;
  const i = liste.indexOf(cat);
  if (i < 0) return false;
  liste.splice(i, 1);
  for (const r of Store.state.budget.expenses) if (r.v) delete r.v[cat];
  reprendreCategorie(cat);
  return true;
}

function expenseByCategory(year) {
  const rows = expenseSeries(year).filter(r => r.total > 0);
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return expenseCategories()
    .map(c => {
      const value = rows.reduce((s, r) => s + num(r.v[c]), 0);
      return { label: c, value, pct: grand ? value / grand * 100 : 0,
               average: rows.length ? value / rows.length : 0 };
    })
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value);
}

function currentExpenseMonth() {
  const key = todayISO().slice(0, 7) + '-01';
  const exact = B().expenses.find(r => r.month === key);
  if (exact) {
    return { month: key, label: fmtMonth(key), total: expenseRowTotal(exact),
             note: exact.note, isCurrent: true };
  }
  const filled = expenseSeries().filter(r => r.total > 0);
  const last = filled[filled.length - 1];
  return last ? { ...last, isCurrent: false } : null;
}

function capitalRembourseParMois() {
  return ETABS().reduce((total, e) => total + (e.dettes || []).reduce((s, d) => {
    /* Le taux doit etre connu : sans lui on ne sait pas departager le capital
       des interets, et compter la mensualite entiere comme du remboursement
       gonflerait l'accumulation. L'echeancier, lui, rend `capitalDuMois: 0`
       quand la mensualite ne couvre pas les interets -- jamais de negatif. */
    const e2 = echeancierCredit(d);
    return s + (e2 && e2.capitalDuMois != null ? e2.capitalDuMois : 0);
  }, 0), 0);
}

/* Ce qu'il reste a payer, deduit et jamais saisi.

   Un tableau d'amortissement de banque tient en quatre grandeurs : capital
   emprunte, taux, nombre d'echeances, mensualite. Trois suffisent, la quatrieme
   s'en deduit. L'application declare le capital restant du, le taux et la
   mensualite — la duree se deduisait donc deja, sans etre affichee nulle part.
   Le commentaire de la fiche l'annoncait pourtant : « le taux sert a lire le
   contrat : date de fin, interets restants, part de capital ».

   Quatre champs saisissables pour trois faits seraient une faute : le jour ou ils
   se contredisent, aucun n'a raison. La duree se lit donc, elle ne s'ecrit pas.

   Rend `null` quand la mensualite ne couvre pas les interets : la dette ne
   s'eteint jamais, et annoncer une date de fin serait mentir. C'est le cas d'un
   levier de courtier, qui grossit tout seul. */
function resteAPayer(d) {
  const e = echeancierCredit(d);
  if (!e || !e.amortissable) return null;
  const { mois, fin, interets, assurance,
          capitalDuMois, interetsDuMois, assuranceDuMois } = e;
  return { mois, fin, interets, assurance,
           capitalDuMois, interetsDuMois, assuranceDuMois };
}

/* Deux grandeurs que rien ne separait, et elles ne veulent pas dire la meme
   chose.

   `investable` est le cash qui reste sur le compte : revenus moins charges
   fixes moins depenses. C'est lui, et lui seul, qu'on peut virer vers un
   compte-titres.

   `theoretical` y ajoute le capital rembourse sur les credits. Cette part
   augmente bien le patrimoine net — le bien ne bouge pas, la dette baisse — mais
   elle n'arrive sur aucun compte : elle est deja partie avec la mensualite. La
   confondre avec de l'epargne investissable faisait capitaliser a 6 % l'an un
   argent qui n'existe nulle part. Sur la demonstration, 645 EUR par mois.

   Les deux restent rendues : la croissance du patrimoine se lit avec le capital
   rembourse, le versement d'une projection sans lui. */
function savingsReconciliation() {
  const f = budgetFrame();
  const stats = expenseYearStats(todayISO().slice(0, 4));
  const spend = stats.average || f.target;
  const capital = capitalRembourseParMois();
  const investable = f.income - f.fixed - spend;
  const theoretical = investable + capital;

  const rythme = paceRecent();
  const monthsSpan = rythme.count;
  const realPerMonth = monthsSpan ? rythme.average : null;

  return {
    income: f.income, fixed: f.fixed, spend,
    capitalRembourse: capital,
    investable,
    theoretical,
    theoreticalRate: f.income ? theoretical / f.income * 100 : 0,
    targetSaving: f.investTarget,
    realPerMonth, monthsSpan,
    gap: realPerMonth == null ? null : realPerMonth - theoretical,
  };
}

/* Le lendemain d'une date ISO, en local. Sert a borner un intervalle ouvert a
   gauche sans manipuler de fuseau : `new Date(iso)` puis +1 jour repasserait par
   UTC, et un 31 mars a Paris y devient un 30. */
function prochainJour(iso) {
  const d = new Date(String(iso) + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return isoLocal(d);
}

const STATUTS_LIGNE = {
  encours:   'En cours',
  retard:    'En retard',
  defaut:    'En défaut',
  rembourse: 'Remboursé',
};

function statutLigne(l) {
  return STATUTS_LIGNE[l.statut] ? l.statut : 'encours';
}

function echeances() {
  const out = [];
  for (const c of comptesOuverts()) {
    if (!typeCompte(c.type).prete) continue;
    (c.lignes || []).forEach((l, i) => {
      if (!l.echeance || l.marche) return;
      const st = statutLigne(l);
      if (st === 'rembourse') return;
      out.push({
        compteId: c.id, compte: nomCompteV2(c), etab: nomEtabDe(c), index: i,
        libelle: l.libelle || 'Placement', valeur: num(l.valeur),
        taux: num(l.taux) || null, echeance: l.echeance, statut: st,
        depassee: st === 'encours' && String(l.echeance) < todayISO(),
        jours: Math.round((new Date(String(l.echeance) + 'T12:00:00')
                         - new Date(todayISO() + 'T12:00:00')) / 86400000),
      });
    });
  }
  return out.sort((a, b) => String(a.echeance).localeCompare(String(b.echeance)));
}

function encoursAProbleme() {
  const l = echeances();
  return {
    retard: l.filter(x => x.statut === 'retard').reduce((s, x) => s + x.valeur, 0),
    defaut: l.filter(x => x.statut === 'defaut').reduce((s, x) => s + x.valeur, 0),
    depassees: l.filter(x => x.depassee),
  };
}

/* --- ce qu'un bien rapporte ---------------------------------------------
   L'application savait qu'un studio vaut 120 000 EUR et qu'il reste 96 000 EUR a
   rembourser. Elle ne savait pas ce qu'il rapporte — or un proprietaire ne vit pas
   sur la valeur de son bien, il vit sur le loyer moins la mensualite moins les
   charges. Un appartement a 150 000 EUR qui sort 120 EUR par mois et un autre qui
   en rentre 180 n'ont rien a voir, et l'ecran les affichait pareil.

   Les pieces existaient deja, mais separees : le loyer se declare en source de
   revenus, la taxe fonciere en charge fixe, la mensualite en credit. Rien ne les
   reliait au bien. C'est le meme chainon manquant que la charge fixe et le credit,
   resolu de la meme facon : un `bienId` sur une source de revenus et sur une
   charge, et le compte du bien devient le point de rassemblement.

   Le lien pointe le **compte** et non la ligne : un compte immobilier porte un
   bien dans le cas normal, la mensualite est deja rattachee a son etablissement,
   et c'est la fiche du compte qu'on ouvre pour regarder son bien.

   Le rendement se calcule sur le prix d'acquisition quand on le connait — c'est
   la convention, et c'est ce que la fiche annonce. A defaut, sur la valeur
   actuelle, en le disant : un rendement sur une estimation du jour n'est pas le
   meme chiffre, et le taire serait la faute que ce projet corrige sans arret.

   Trois manques rendaient tous les rendements trop beaux, et tous du meme cote :
   douze mois de loyer supposes pleins, aucun impot, et la periode du loyer
   ignoree. Un outil imprecis se trompe des deux cotes ; celui-la se trompait
   toujours du cote flatteur.

   La vacance et l'impot se **declarent**. L'application n'applique aucune regle
   fiscale : micro-foncier, reel, meuble, les regimes changent et le droit avec,
   et une application qui les devinerait mentirait un jour sans le savoir. Elle
   applique le taux que son detenteur annonce, sur une base qu'elle nomme. */
function cashFlowBien(compte) {
  if (!compte) return null;
  /* `revenuMensuel` et non le montant brut : la source porte sa periode, et un
     loyer saisi a l'annee valait douze fois trop ici pendant que le budget
     affichait le bon chiffre. Le meme libelle doit donner le meme montant sur
     tous les ecrans. */
  const sourcesLoyer = B().income
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.bienId === compte.id)
    .map(({ r, i }) => ({ i, label: r.label || trad('Loyer'), mensuel: revenuMensuel(r),
                          periode: chargePeriode(r), montant: num(r.amount), estime: !!r.estime }));
  const loyersPleins = sourcesLoyer.reduce((s, x) => s + x.mensuel, 0);
  const credits = (etabById(compte.etabId)?.dettes || []);
  const rembourses = new Set(credits.map(d => d.id));
  const postesCharge = B().fixedCharges
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.bienId === compte.id && !rembourses.has(c.creditId))
    .map(({ c, i }) => ({ i, label: c.label || trad('Charge fixe'), mensuel: chargeMensuelle(c),
                          periode: chargePeriode(c), montant: num(c.amount) }));
  const charges = postesCharge.reduce((s, x) => s + x.mensuel, 0);
  const idxEtab = ETABS().findIndex(e => e.id === compte.etabId);
  const creditsListe = credits.map((d, index) => {
    const lien = chargeDuCredit(d.id);
    return { etabId: compte.etabId, idxEtab, index, id: d.id,
             libelle: d.libelle || trad('Crédit'), mensualite: mensualiteCredit(d),
             reste: num(d.montant), chargeIndex: lien ? lien.index : null };
  });
  const mensualite = credits.reduce((s, d) => s + mensualiteCredit(d), 0);
  const reste = credits.reduce((s, d) => s + num(d.montant), 0);
  /* `null` et non zero quand aucun taux n'est connu : sans taux on ne sait pas
     departager le capital des interets, et annoncer « zero de capital » sur une
     mensualite de 620 EUR serait faux dans l'autre sens. */
  /* `capitalDuMois != null` plutot que `num(d.taux)` : un pret declare a 0 %
     rembourse bien du capital, et le filtre par le taux l'ecartait. L'echeancier
     porte la regle -- sans taux DECLARE, il rend `null`. */
  const amortis = credits.filter(d => echeancierCredit(d)?.capitalDuMois != null);
  const capitalMois = amortis.length ? amortis.reduce((s, d) =>
    s + (echeancierCredit(d)?.capitalDuMois || 0), 0) : null;

  const valeur = valeurCompte(compte);
  const achat = lignesDe(compte).reduce((s, l) => s + num(l.prixDeRevient), 0);
  const base = achat || valeur;
  const surAchat = achat > 0;

  const moisLoues = Math.min(12, Math.max(0, num(compte.moisLoues) || 12));
  const loyers = loyersPleins * moisLoues / 12;
  const vacance = moisLoues < 12;

  const tauxImpot = Math.min(100, Math.max(0, num(compte.tauxImpot)));
  const impot = tauxImpot ? Math.max(0, loyers - charges) * tauxImpot / 100 : 0;

  const cashFlow = loyers - charges - mensualite - impot;
  const apport = num(compte.apport) || null;
  return {
    loyers, loyersPleins, moisLoues, vacance, charges, mensualite, impot, tauxImpot,
    reste, valeur, achat, base, surAchat, capitalMois,
    sourcesLoyer, postesCharge, creditsListe,
    vacanceEuros: loyersPleins - loyers,
    cashFlow,
    rendementBrut: base ? loyers * 12 / base * 100 : 0,
    rendementNet: base ? (loyers - charges) * 12 / base * 100 : 0,
    rendementNetNet: (base && tauxImpot) ? (loyers - charges - impot) * 12 / base * 100 : null,
    apport,
    cashOnCash: apport ? cashFlow * 12 / apport * 100 : null,
  };
}

const PREMIERS_PAS = [
  { cle: 'comptes',
    quoi: 'Ajoute un compte pour commencer : une banque, un livret, un compte de '
        + 'courtage ou un bien. C’est d’eux que viennent ton patrimoine, ta '
        + 'répartition et ton autonomie.',
    /* `aUnComptePropre` et non le simple compte des comptes : celui des especes
       est pose par le modele pour tout le monde, et un compte que personne n'a
       cree ne peut pas tenir lieu de premier pas. */
    bouton: 'Entrer tes comptes', action: 'ajouter-compte',
    fait: () => aUnComptePropre() },
  { cle: 'revenus',
    quoi: 'Sans revenu déclaré, cette carte n’a pas de total à partager.',
    bouton: 'Entrer ton salaire', action: 'toggle-revenus',
    fait: () => (B().income || []).length > 0 },
  { cle: 'releves',
    quoi: 'Enregistre ton premier relevé mensuel : c’est la photo de tes comptes à '
        + 'une date. Il en faut deux pour que la courbe et le rythme d’accumulation '
        + 'aient une pente à montrer.',
    bouton: 'Enregistrer un relevé', action: 'ajouter-releve',
    fait: () => !aUnComptePropre() || aDejaServi() },
  { cle: 'depenses',
    quoi: 'Ajoute tes loyers, assurances et abonnements : ce sont eux qui décident '
        + 'de ce qu’il te reste à vivre chaque mois.',
    bouton: 'Entrer tes dépenses', action: 'add-charge',
    fait: () => (B().fixedCharges || []).length > 0
      || (B().expenses || []).some(r => Object.values(r.v || {}).some(v => num(v) !== 0)) },
];
const PAS_PAR_CLE = Object.fromEntries(PREMIERS_PAS.map(p => [p.cle, p]));

const pasAFaire = cle => !!PAS_PAR_CLE[cle] && !PAS_PAR_CLE[cle].fait();

/* --- ce qu'un bien coute, poste par poste --------------------------------
   La taxe fonciere est due par tout proprietaire, la copropriete par qui detient
   un lot, et la provision pour travaux est celle que tout le monde oublie — or
   c'est elle qui decide du vrai rendement. Les proposer evite la page blanche
   d'un champ « Poste » vide, sans rien imposer : un `datalist` suggere, il ne
   ferme pas la liste.

   Une liste par usage, parce que l'assurance ne porte pas le meme nom selon
   qu'on habite ou qu'on loue : proposer « proprietaire non occupant » a qui vit
   dans son logement serait du bruit. Ce qui vaut pour tous vient d'abord, dans
   l'ordre ou on y pense.

   La periode accompagne le poste : une taxe fonciere se paie a l'annee, des
   frais de gestion au mois. Le premier poste donne la periode par defaut de la
   fenetre, et c'est pour ca que la taxe fonciere ouvre la liste. */
const CHARGES_BIEN = {
  '':           [['Taxe foncière', 'an'], ['Charges de copropriété', 'trimestre'],
                 ['Provision pour travaux', 'an']],
  locative:     [['Assurance propriétaire non occupant', 'an'],
                 ['Frais de gestion locative', 'mois']],
  principale:   [['Assurance habitation', 'an']],
  secondaire:   [['Assurance habitation', 'an'], ['Taxe d’habitation', 'an']],
};

function chargesProposees(compte) {
  const propres = CHARGES_BIEN[usageBien(compte)] || [];
  return [...CHARGES_BIEN[''], ...propres];
}

function comptesBiens() {
  return comptesOuverts().filter(c => typeCompte(c.type).bienImmo);
}

/* --- les rentrees exceptionnelles ---------------------------------------
   Un heritage, une prime, la vente d'une voiture : de l'argent qui entre une
   fois. Il n'avait aucun endroit, et les trois qu'on pouvait croire bons etaient
   faux. Les sources de revenus sont mensuelles — 10 000 EUR y auraient valu
   10 000 EUR par mois, a vie. « Rentree exceptionnelle », dans « Mois a venir »,
   est une prevision : un seul nombre, ecrase a chaque saisie, sans date. Et
   monter le solde d'un compte marche pour le patrimoine mais ne dit pas d'ou
   vient l'argent, si bien que « Rythme d'accumulation » compte l'heritage comme
   de l'epargne.

   Ce dernier point est le vrai sujet : un apport n'est pas de l'epargne. Sans la
   distinction, la moyenne mensuelle bondit et la projection promet un rythme que
   le budget ne peut pas tenir. Le journal existe donc d'abord pour que le rythme
   puisse dire « dont tant d'apports exterieurs ».

   `budget.supplements` n'est pas recycle, bien qu'il traine vide dans l'etat : un
   champ qui a deja voulu dire autre chose — des « complements alimentaires »,
   puis des « autres depenses » — est un piege pour la migration. */
const APPORTS = () => (B().apports = B().apports || []);

function apportsTries() {
  return [...APPORTS()]
    .map((a, i) => ({ ...a, index: i, montant: num(a.montant) }))
    .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
}

function apportsDetail(debut = null, fin = null) {
  let entrees = 0, sorties = 0;
  for (const a of APPORTS()) {
    const d = String(a.date || '');
    if (debut && d < debut) continue;
    if (fin && d > fin) continue;
    const m = num(a.montant);
    if (m < 0) sorties += m; else entrees += m;
  }
  return { entrees, sorties, net: entrees + sorties };
}

function apportsTotal(debut = null, fin = null) {
  return apportsDetail(debut, fin).net;
}

/* --- autres depenses : retire -------------------------------------------
   AUTRES_PERIODES, autreMensuelle() et supplementsTotal() vivaient ici pour
   une carte « Autres depenses » qui ne comptait ni dans les charges fixes ni
   dans le budget. Un memo chiffre a tenir a jour pour ne rien calculer : la
   carte est partie, et ces trois-la avec elle.

   Le champ `budget.supplements` reste dans l'etat, et la migration qui
   normalise ses anciennes lignes reste en place plus haut : retirer un ecran
   ne doit pas emporter ce que quelqu'un y avait saisi, et un export d'avant
   doit continuer de se relire. Ce qui s'y trouvait se saisit desormais dans
   les depenses du mois, ou ces euros comptent pour de vrai. */

function runway() {
  const f = budgetFrame();
  const stats = expenseYearStats(todayISO().slice(0, 4));
  const burn = f.fixed + (stats.average || f.target);

  const p = poches();
  const immediate  = p.mobilisable.immediat;
  const differe    = p.mobilisable.differe;
  const lent       = p.mobilisable.lent;
  const habite     = p.mobilisable.habite;
  const bloque     = p.mobilisable.bloque;

  const contenants = trad('comptes courants, livrets, espèces');
  /* Les libelles viennent de `MOBILISABLE_LABEL`, ils ne se reecrivent pas ici.

     Cette carte et « Par disponibilite » decoupent le meme argent selon les
     memes cinq paliers, et chacune avait sa propre liste de mots : « En
     quelques jours » d'un cote, « Disponible sous quelques jours » de l'autre,
     pour la meme poche. Deux ecrans qu'on ne regarde pas en meme temps, donc
     personne ne pouvait le voir. Une liste se derive, elle ne se recopie pas.

     Les notes, elles, appartiennent a cette carte : elles disent ce que le
     palier contient chez celui qui lit, ce que l'autre carte n'a pas a faire. */
  const tiers = [
    { label: trad(MOBILISABLE_LABEL.immediat), value: immediate,
      note: p.projet > 0.005 ? `${contenants}${trad(' ; projets compris')}` : contenants },
    { label: trad(MOBILISABLE_LABEL.differe), value: differe,
      note: trad('liquidités chez un courtier ; un titre se vend en séance, le virement prend 2 à 3 jours') },
    { label: trad(MOBILISABLE_LABEL.lent), value: lent, note: trad('immobilier, non coté, à vendre avec décote si pressé') },
    ...(habite > 0.005 ? [{ label: trad(MOBILISABLE_LABEL.habite), value: habite,
        note: trad('le vendre veut dire te reloger'), horsCumul: true }] : []),
    { label: trad(MOBILISABLE_LABEL.bloque), value: bloque, note: trad('bloqué jusqu’à son échéance'), horsCumul: true },
  ];
  let cum = 0;
  for (const t of tiers) {
    if (t.horsCumul) { t.cumulative = null; t.months = null; continue; }
    cum += t.value; t.cumulative = cum; t.months = burn ? cum / burn : 0;
  }

  return {
    burn, tiers, immediate,
    immediateMonths: burn ? immediate / burn : 0,
    liquidMonths: burn ? (immediate + differe) / burn : 0,
    targetLow: burn * 3, targetHigh: burn * 6,
  };
}

function statsRythme(points) {
  const n = points.length;
  const somme = points.reduce((s, p) => s + p.delta, 0);
  /* Ce qui est entre du dehors sur la periode affichee. Un heritage fait monter
     le patrimoine sans que personne ait mis de cote : la moyenne mensuelle le
     compte, et elle doit pouvoir le dire.

     Un point porte l'ecart entre deux releves, et sa date est celle du second :
     l'intervalle qu'il couvre commence donc au releve d'avant. Borner la fenetre
     a la date du premier point laissait dehors tout ce qui etait entre pendant
     son propre intervalle — une succession du 15 mars ne comptait pas dans le
     point du 30 avril, et le rythme continuait de la prendre pour de l'epargne.
     C'est `depuis` que chaque point porte pour cela. */
  const debut = n ? String(points[0].depuis || points[0].date) : null;
  const fin = n ? String(points[n - 1].date) : null;
  const apports = n ? apportsTotal(debut, fin) : 0;
  return {
    points, count: n,
    average: n ? somme / n : 0,
    apports,
    averageHorsApports: n ? (somme - apports) / n : 0,
    positive: points.filter(p => p.delta > 0).length,
    best: points.reduce((a, o) => (!a || o.delta > a.delta) ? o : a, null),
    worst: points.reduce((a, o) => (!a || o.delta < a.delta) ? o : a, null),
  };
}

function monthlyPace() {
  const brut = historySeries({ includeNow: false });
  const pts = brut.filter(p => !(Number(String(p.date).slice(8, 10)) > 20
    && brut.some(q => q !== p && String(q.date).slice(0, 7) === String(p.date).slice(0, 7))));
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    out.push({ label: pts[i].label, date: pts[i].date, note: pts[i].comment,
               depuis: prochainJour(pts[i - 1].date),
               delta: num(pts[i].net) - num(pts[i - 1].net), total: pts[i].total });
  }
  return statsRythme(out);
}

const PACE_WINDOW = 12;
function paceRecent() {
  return statsRythme(monthlyPace().points.slice(-PACE_WINDOW));
}

function defaultCashTarget(accountId) {
  if (compteById(accountId)) return accountId;
  return (comptesOuverts().find(c => typeCompte(c.type).titres) || {}).id || '';
}

function cashTargets() {
  const ouverts = comptesOuverts();
  return [
    ...ouverts.filter(c => typeCompte(c.type).titres),
    ...ouverts.filter(c => typeCompte(c.type).groupe === 'cash'),
  ];
}

function salePreview(p, qty, price, fxSell) {
  const q = num(qty), pu = num(price), fx = num(fxSell) || 1;
  const brut = q * pu * fx;
  /* Le meme taux que la plus-value latente, et par la meme fonction : une vente
     calculee sur un `fxBuy` de 1 aurait realise une perte de change inexistante. */
  const pruUnitaire = num(p.buyPrice) * tauxAchat(p);
  const investi = q * pruUnitaire;
  return {
    qty: q, gross: brut, invested: investi,
    realised: brut - investi,
    pct: investi ? (brut / investi - 1) * 100 : 0,
    remaining: num(p.qty) - q,
    full: q >= num(p.qty),
  };
}

function sellPosition({ index, qty, price, fxSell, cashAccount, date, note }) {
  const p = Store.state.positions[index];
  if (!p) return null;
  const ap = salePreview(p, qty, price, fxSell);
  if (ap.qty <= 0 || ap.qty > num(p.qty)) return null;

  Store.state.sales = Store.state.sales || [];
  Store.state.sales.unshift({
    id: 's' + Date.now(),
    date: date || todayISO(),
    name: p.name, isin: p.isin || '', symbol: p.symbol || '',
    assetClass: assetClassDe(p), role: roleDe(p), account: p.account, cashAccount: cashAccount || '',
    qty: ap.qty, price: num(price), currency: p.currency || 'EUR',
    fxSell: num(fxSell) || 1, buyPrice: num(p.buyPrice), fxBuy: tauxAchat(p),
    gross: ap.gross, invested: ap.invested, realised: ap.realised,
    note: note || '',
  });

  if (cashAccount) {
    const compteCash = compteById(cashAccount);
    if (compteCash) {
      const e = cashInvestirEntree(compteCash, true);
      e.montant = round2(num(e.montant) + ap.gross);
    } else if (!ACC[cashAccount]?.holdings) {
      Store.state.now[cashAccount] = num(Store.state.now[cashAccount]) + ap.gross;
    }
  }

  if (ap.full) Store.state.positions.splice(index, 1);
  else p.qty = round2(num(p.qty) - ap.qty);

  return ap;
}

/*   C'est la reponse au chantier note dans ETAT.md : noter une vente sur un
   PEA cloture demandait de recreer le compte, la ligne, de vendre, puis
   d'archiver — quatre gestes pour fabriquer un fait passe. Ici la vente
   entre au journal telle qu'on s'en souvient, et n'ecrit RIEN d'autre :
   pas de position reduite (on ne la detient plus), pas de cash credite
   (il est arrive sur le compte il y a des annees), pas un euro de
   patrimoine — un test le verifie.

   Elle porte `declaree: true` : l'ecran la marque, et l'annulation sait
   qu'elle n'a rien a rendre. Deux montants saisis — l'encaisse et le
   resultat — et le prix de revient s'en derive : c'est ce qu'on sait
   encore d'une vente d'il y a trois ans. */
function declarerVente({ date, name, gross, realised, note }) {
  Store.state.sales = Store.state.sales || [];
  const g = num(gross), r = num(realised);
  Store.state.sales.unshift({
    id: 's' + Date.now(),
    date: date || todayISO(),
    name: String(name || '').trim(), isin: '', symbol: '',
    assetClass: '', role: '', account: '', cashAccount: '',
    qty: null, price: null, currency: 'EUR',
    fxSell: 1, buyPrice: null, fxBuy: 1,
    gross: g, invested: round2(g - r), realised: r,
    note: note || '',
    declaree: true,
  });
  return Store.state.sales[0];
}

function annulerVente(i) {
  const v = (Store.state.sales || [])[i];
  if (!v) return null;

  if (v.declaree) {
    Store.state.sales.splice(i, 1);
    return v;
  }

  if (v.cashAccount) {
    const c = compteById(v.cashAccount);
    if (c) {
      const e = cashInvestirEntree(c, true);
      e.montant = round2(num(e.montant) - num(v.gross));
    } else if (!ACC[v.cashAccount]?.holdings) {
      Store.state.now[v.cashAccount] = round2(num(Store.state.now[v.cashAccount]) - num(v.gross));
    }
  }

  const memeLigne = q => q.account === v.account
    && ((v.isin && q.isin === v.isin)
        || (!v.isin && v.symbol && q.symbol === v.symbol)
        || (!v.isin && !v.symbol && q.name === v.name));
  const p = Store.state.positions.find(memeLigne);
  if (p) {
    p.qty = round2(num(p.qty) + num(v.qty));
  } else {
    Store.state.positions.push({
      id: 'p' + Date.now(), name: v.name, isin: v.isin || '', symbol: v.symbol || '',
      currency: v.currency || 'EUR', qty: num(v.qty),
      buyPrice: num(v.buyPrice), price: num(v.price),
      fx: num(v.fxSell) || 1, fxBuy: num(v.fxBuy) || 1,
      account: v.account, manual: false,
      assetClass: v.assetClass || '', role: v.role || '',
    });
  }

  Store.state.sales.splice(i, 1);
  return v;
}

function rangeStart(range) {
  if (!range || range === 'all') return null;
  /* Une annee vaut son 1er janvier. La garde est ici et pas seulement chez
     l'appelant : sans elle, `parseInt('2025')` faisait remonter de deux mille ans
     et la plage rendait tout, sans erreur nulle part. */
  if (estAnnee(range)) return `${range}-01-01`;
  const now = new Date();
  const d = range === 'ytd'
    ? new Date(now.getFullYear(), 0, 1)
    : new Date(now.getFullYear() - (parseInt(range, 10) || 1), now.getMonth(), now.getDate());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Les totaux d'une liste de ventes, quelle qu'elle soit.

   Extrait de `salesStats`, qui commençait par choisir ses ventes sur une plage
   glissante. Le journal les choisit désormais par année, et refaire ces cinq
   sommes à côté aurait donné deux façons de compter la même chose — celle qu'on
   oublie de corriger finit par contredire l'autre. Le filtre reste à l'appelant,
   le calcul est ici. */
function statsDesVentes(ventes) {
  const realised = ventes.reduce((s, v) => s + num(v.realised), 0);
  const invested = ventes.reduce((s, v) => s + num(v.invested), 0);
  return {
    sales: ventes, count: ventes.length,
    realised, invested,
    gross: ventes.reduce((s, v) => s + num(v.gross), 0),
    /* `null` et non 0 : sans vente, ou sans prix de revient sur celles qui
       existent, il n'y a pas de base. Le zero s'affichait « +0,00 % » sur une
       plage vide, ce qui affirme une performance nulle la ou il n'y a rien eu.
       La regle de la maison, deja tenue par `deltas()` : un pourcentage
       n'existe que sur une base positive, et l'ecran se contente de l'euro. */
    pct: invested > 0 ? realised / invested * 100 : null,
    wins: ventes.filter(v => num(v.realised) > 0).length,
  };
}

const PAS_DES_VENTES = { ytd: 'mois', '1y': 'mois', '3y': 'trimestre', '5y': 'trimestre' };
const pasDesVentes = range => estAnnee(range) ? 'mois' : (PAS_DES_VENTES[range] || 'année');

const VENTES_NOMMEES_MAX = 24;
const ventesSeNomment = (range, count) =>
  pasDesVentes(range) === 'mois' && count <= VENTES_NOMMEES_MAX;

function ventesParPeriode(ventes, pas) {
  const cle = date => {
    const an = String(date).slice(0, 4), mois = Number(String(date).slice(5, 7));
    /*    Le mot accentue, le meme que celui de `pasDesVentes()`. La premiere version
   comparait a « annee » sans accent pendant que la table rendait « annee »
   avec : la branche ne s'executait jamais, le regroupement annuel retombait
   sur le mois, et huit cents ventes donnaient cent vingt barres au lieu de
   onze.*/
    if (pas === 'année') return { id: an, label: an };
    if (pas === 'trimestre') {
      const t = Math.floor((mois - 1) / 3) + 1;
      return { id: `${an}-T${t}`, label: `T${t} ${an.slice(2)}` };
    }
    return { id: `${an}-${String(mois).padStart(2, '0')}`,
             label: `${moisCourts()[mois - 1] || ''} ${an.slice(2)}` };
  };
  const paquets = new Map();
  for (const v of ventes) {
    if (!v.date) continue;
    const k = cle(v.date);
    const p = paquets.get(k.id) || { id: k.id, label: k.label, value: 0, count: 0 };
    p.value += num(v.realised); p.count++;
    paquets.set(k.id, p);
  }
  return [...paquets.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function salesStats(range) {
  const { debut, fin } = rangeBornes(range);
  const ventes = (Store.state.sales || []).filter(v => {
    const d = String(v.date || '');
    return (!debut || d >= debut) && (!fin || d <= fin);
  });
  return statsDesVentes(ventes);
}

const anneesDesVentes = () => anneesPresentes((Store.state.sales || []).map(v => v.date));

function salesCumulative(range) {
  const ventes = salesStats(range).sales
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let cum = 0;
  return ventes.map(v => {
    cum += num(v.realised);
    return { label: fmtDate(v.date), date: v.date, name: v.name,
             realised: num(v.realised), cumulative: cum };
  });
}

function latentPnl() {
  const ps = Store.state.positions;
  const value = ps.reduce((s, p) => s + posValue(p), 0);
  const invested = ps.reduce((s, p) => s + posInvested(p), 0);
  return { value, invested, pnl: value - invested,
           pct: invested > 0 ? (value / invested - 1) * 100 : null,
           winners: ps.filter(p => posPerfEur(p) > 0).length, count: ps.length };
}

/* --- l'ecart du non cote, tenu a part -----------------------------------
   `latentPnl()` ne lit que `positions` : le non cote, l'immobilier et les biens
   n'apparaissaient donc nulle part dans la page Performance, alors qu'ils
   portent souvent la moitie d'un patrimoine et qu'un prix de revient y est
   saisi.

   Une carte a part, et jamais un total commun avec les titres cotes. La raison
   n'est pas la prudence, c'est la nature du chiffre : une plus-value cotee est
   **constatee** — un cours l'a fixee, un tiers la publie — tandis qu'une
   plus-value non cotee est **declaree**, c'est le detenteur qui a ecrit la valeur
   du jour. Les additionner produirait une performance dont une part est une
   opinion, sans que rien ne le signale, et le jour ou une valorisation bouge de
   5 000 EUR le total sauterait comme si un marche avait bouge.

   D'ou `estimeLe` remonte ici : l'age de la valeur fait partie du chiffre. Une
   plus-value declaree il y a trois ans ne vaut pas celle d'hier, et c'est la
   seule difference que la carte peut montrer honnetement. */
function latentNonCote() {
  const lignes = [];
  for (const c of comptesOuverts()) {
    for (const l of lignesDe(c)) {
      /* Les lignes de marche ont leur propre carte : `marche` les designe, et non
         une liste de classes ecrite ici — un ETF immobilier est cote. */
      if (l.marche) continue;
      const invested = num(l.prixDeRevient);
      if (!(invested > 0)) continue;          // sans prix paye, aucun ecart a dire
      lignes.push({
        nom: nomLignePlacement(l, c), compte: c, compteId: c.id, classe: l.classe,
        value: num(l.valeur), invested,
        pnl: num(l.valeur) - invested,
        pct: (num(l.valeur) / invested - 1) * 100,
        estimeLe: l.estimeLe || null,
        vieille: l.estimeLe ? ageAnnees(l.estimeLe) >= 1 : true,
      });
    }
  }
  lignes.sort((a, b) => b.value - a.value);
  const value = lignes.reduce((s, x) => s + x.value, 0);
  const invested = lignes.reduce((s, x) => s + x.invested, 0);
  return {
    lignes, value, invested, pnl: value - invested,
    pct: invested > 0 ? (value / invested - 1) * 100 : null,
    aRevoir: lignes.filter(x => x.vieille).length,
  };
}

function salesYears() {
  const ans = [...new Set((Store.state.sales || []).map(v => String(v.date).slice(0, 4)))];
  return ans.sort();
}

const PROJECTION_HORIZONS = [3, 5, 10, 15, 20];

/* Horizons proposés dans la liste déroulante : les repères du tableau, puis des
   paliers de cinq ans jusqu'à 80 — de quoi couvrir une vie d'épargne entière.

   Les cinq repères en étaient exclus, au motif qu'ils figuraient déjà dans le
   tableau. Le raisonnement se tenait sur la redondance et ratait l'essentiel :
   choisir un horizon ne désigne pas une ligne, il change toute la page — le
   total en tête, la courbe, et la ligne mise en avant, qui suit `projHorizon`.
   Le menu commençait donc à vingt-cinq ans, et tout le monde n'a pas
   vingt-cinq ans devant soi.

   La liste se dérive des repères, elle ne les recopie pas : deux listes écrites
   à la main pour une seule vérité finissent par se contredire, et c'est celle
   qu'on oublie de changer qui ment. */
const PROJECTION_CHOICES = [...new Set([
  ...PROJECTION_HORIZONS,
  ...Array.from({ length: 16 }, (_, i) => (i + 1) * 5),
])].sort((a, b) => a - b);

/* Trois jeux d'hypotheses nommes, et un quatrieme qui n'en est pas un.

   Personne ne sait quel rendement la bourse fera. Demander « quel rendement
   annuel pour les actifs de marche ? » a quelqu'un qui ouvre l'application, c'est
   lui demander de deviner a notre place : il repondra au hasard, et lira ensuite
   sa reponse comme une prevision. Un scenario nomme dit exactement ce que c'est
   — une hypothese de travail, prudente, centrale ou dynamique — et deplace la
   question de « combien ? » a « plutot prudent ou plutot optimiste ? », a
   laquelle tout le monde peut repondre.

   Les valeurs sont NOMINALES et annuelles. L'inflation se retire ensuite, une
   fois, sur le total : c'est le champ `real` de chaque point.

   Le non cote reste a zero dans les trois. Une participation dans une societe ne
   progresse pas de 8 % par an parce que la bourse le fait ; sa valeur ne bouge
   qu'au prochain tour de table ou a la revente, dates qu'aucun calcul ne connait.
   Zero ne veut pas dire « ça ne vaudra rien de plus », mais « l'application ne
   suppose rien ». C'est le seul cote ou se tromper est sans consequence.

   Les liquidites aussi : un livret non declare remunere ne rapporte rien, et le
   supposer gonflerait un patrimoine sans qu'on l'ait demande.

   Le capital garanti, lui, rapporte quelque chose de connu d'avance a un ordre
   de grandeur pres — un fonds euros, un livret regemente. Il suit donc le
   scenario, plus prudemment que le marche.

   Ces valeurs se modifient ici, et nulle part ailleurs. */
const SCENARIOS_PROJECTION = [
  ['prudent',   'Prudent',   { marche: 4, autres: 0, garanti: 2,   liquidites: 0 }],
  ['central',   'Central',   { marche: 6, autres: 0, garanti: 2.5, liquidites: 0 }],
  ['dynamique', 'Dynamique', { marche: 8, autres: 0, garanti: 3,   liquidites: 0 }],
];
const TAUX_SCENARIO = Object.fromEntries(SCENARIOS_PROJECTION.map(([c, , r]) => [c, r]));
const SCENARIO_DEFAUT = 'central';

/* Les hypotheses qu'un scenario gouverne, derivees de la table elle-meme.

   L'inflation n'en fait pas partie, et ce n'est pas un oubli : aucune entree de
   SCENARIOS_PROJECTION ne la porte, elle vit dans `meta.projInflation` et se
   regle seule. La regler ne doit donc pas faire basculer en personnalise --
   sinon quelqu'un qui passe l'inflation a 3 % quitterait « Central » sans avoir
   touche a un seul rendement.

   Ecrire la liste a la main aurait suffi aujourd'hui, et aurait menti le jour ou
   une poche s'ajoute : c'est le defaut que ce fichier traque partout. */
const POCHES_SCENARIO = Object.keys(SCENARIOS_PROJECTION[0][2]);

function detecteScenario(taux) {
  const trouve = SCENARIOS_PROJECTION.find(([, , preset]) =>
    POCHES_SCENARIO.every(k => Math.abs(num(taux[k]) - num(preset[k])) < 1e-9));
  return trouve ? trouve[0] : 'perso';
}

const TAUX_PROJECTION = ['meta.projRate', 'meta.projRateAutres',
                         'meta.projRateGaranti'];

const nomScenario = cle => (Object.fromEntries(
  SCENARIOS_PROJECTION.map(([c, l]) => [c, l]))[cle] || 'Personnalisé');

const PHRASE_SCENARIO = {
  prudent: 'Hypothèses volontairement prudentes.',
  central: 'Hypothèses équilibrées pour une projection long terme.',
  dynamique: 'Hypothèses plus favorables, mais encore plausibles.',
  perso: 'Tes propres taux, posés plus bas.',
};

/* D'OU viennent les taux, et non a quoi ils ressemblent. Les deux questions ont
   vecu sous un seul nom, et c'est ce qui rendait le retour impossible : remettre
   6 % sur le marche laissait « personnalise » enfonce alors que les quatre
   valeurs etaient exactement celles de Central. `detecteScenario()` repond a la
   seconde question, celle que l'ecran pose.

   Celle-ci decide du calcul : la table d'un scenario nomme, ou l'etat. Et la
   migration silencieuse qu'il ne faut pas faire -- un etat qui porte deja des
   taux saisis a la main precede les scenarios. Lui appliquer « central »
   changerait sa courbe sans qu'il ait rien demande, et c'est exactement ce
   qu'une projection ne doit jamais faire. Ces etats-la lisent donc leurs propres
   chiffres, intacts. Les autres partent sur le scenario central. */
function sourceDesTaux() {
  const m = Store.state.meta;
  if (m.projScenario) return m.projScenario;
  const aDesTaux = [m.projRate, m.projRateGaranti, m.projRateAutres]
    .some(v => v !== undefined && v !== null && v !== '');
  return aDesTaux ? 'perso' : SCENARIO_DEFAUT;
}

function projectionSettings() {
  const m = Store.state.meta;
  const preset = TAUX_SCENARIO[sourceDesTaux()];
  const taux = (champ, cle) => (preset ? preset[cle] : num(m[champ]));
  const poches = Object.fromEntries(POCHES_SCENARIO.map(k => [k, 0]));
  poches.marche = taux('projRate', 'marche');
  poches.autres = taux('projRateAutres', 'autres');
  poches.garanti = taux('projRateGaranti', 'garanti');
  /* Zero veut dire zero.

     `num(m.projMonthly) || suggestedMonthly()` traitait 0 comme une absence :
     en JavaScript zero est faux. Le menu offre pourtant « 0 € / mois », et le
     choisir affichait la suggestion du budget a la place — un reglage qui
     refuse la valeur qu'il propose. « Que devient mon patrimoine si je
     n'investis plus rien ? » est une question legitime, et c'est meme la plus
     utile de cette page.

     La distinction porte donc sur la presence de la clef, pas sur sa valeur.
     Une migration a un coup a retire les zeros deja enregistres, qui voulaient
     dire « automatique » sous l'ancienne regle. */
  const regle = m.projMonthly !== undefined && m.projMonthly !== null
             && m.projMonthly !== '';
  return {
    scenario: detecteScenario(poches),
    monthly: regle ? num(m.projMonthly) : suggestedMonthly(),
    monthlyAuto: !regle,
    rate: poches.marche,
    /* Le rendement des « autres actifs » : crypto, metaux precieux, non cote.
       Zero par defaut, et c'est le pivot de tout le dispositif — personne ne
       voit ses chiffres bouger, l'application ne suggere aucun rendement sur ce
       qu'elle ne sait pas projeter, et le gel qu'on appliquait devient le cas
       particulier taux = 0. C'est a l'utilisateur de l'affirmer, pas a nous.

       Un seul champ pour les trois, et la clef ne change pas : `projRateAutres`
       porte ce nom depuis toujours et n'a jamais rien promis de plus fin. Un
       etat enregistre le retrouve donc tel quel. */
    rateAutres: poches.autres,
    rateGaranti: poches.garanti,
    versementVers: m.projVersementVers || 'marche',
    inflation: num(m.projInflation),
    target: num(m.projTarget),
  };
}

const VERSEMENT_VERS = [
  ['marche',     'Actifs de marché'],
  ['autres',     'Autres actifs'],
  ['garanti',    'Capital garanti'],
  ['liquidites', 'Liquidités'],
];

function repartitionVersement(s = projectionSettings()) {
  const nul = Object.fromEntries(VERSEMENT_VERS.map(([c]) => [c, 0]));
  const connue = VERSEMENT_VERS.some(([c]) => c === s.versementVers);
  return { ...nul, [connue ? s.versementVers : 'marche']: 1 };
}

/* Versement mensuel proposé par défaut : le cash que ton budget laisse
   vraiment, sinon le rythme réellement observé sur tes relevés.

   `investable` et non `theoretical` : le capital rembourse sur un credit
   augmente le patrimoine net, mais il n'est pas disponible pour investir. Le
   proposer comme versement mensuel le faisait capitaliser au taux des actifs de
   marche, alors qu'il est deja parti avec la mensualite. Le patrimoine en tenait
   compte deux fois : une fois par la dette qui baisse, une fois par un
   placement imaginaire.

   Le repli sur le rythme observe, lui, garde sa nature : c'est une variation de
   patrimoine, pas un flux de budget, mais c'est tout ce qu'on a quand aucun
   revenu n'est declare. */
function suggestedMonthly() {
  const rec = savingsReconciliation();
  const brut = rec.investable > 0 ? rec.investable
             : (rec.realPerMonth > 0 ? rec.realPerMonth : 0);
  return Math.round(brut);
}

/* `plat` : la part du patrimoine que la projection porte sans lui appliquer de
   rendement, soit l'apport immobilier, la valeur du bien moins tout le capital
   restant du.

   Avant, un seul taux s'appliquait a l'ensemble du patrimoine net. L'apport
   d'un appartement capitalisait donc a 5 % par an comme un ETF, ce qu'un bien
   ne fait pas, et ce qui rendait fausse toute etiquette parlant de rendement
   boursier. Chaque poche a donc son taux -- actifs de marche, autres actifs,
   capital garanti, liquidites -- et un bien n'entre dans aucune : on ne prete un
   rendement qu'a ce qu'il decrit, et le reste est porte a plat.

   A plat et non exclu : l'apport reste dans le total, parce qu'il fait partie du
   patrimoine et qu'on veut le voir. On ne lui prete simplement aucune
   performance, ce qui est prudent et lisible, plutot qu'une performance
   inventee.

   L'amortissement du pret, lui, EST modelise : `moteurProjection` rembourse mois
   par mois et ajoute le capital rendu a cette part plate, qui monte donc toute
   seule. Ce commentaire disait le contraire, et un commentaire qui contredit le
   calcul fait douter du chiffre juste.

   La part plate peut etre negative : un credit a la consommation sans bien en
   face, ou un bien qui vaut moins que son pret. C'est honnete, et ca evite
   surtout de faire fondre une dette au rythme des marches. */
function partPlate(t = nowTotals()) {
  return num(t.immo) + num(t.biens) - num(t.dettes);
}

/* Les trois poches de la projection, chacune avec son sort.

   Un seul taux s'appliquait a tout, et il ne decrivait qu'une partie de ce
   qu'il touchait : chez un patrimoine ou le non cote pese 38 % de la base,
   « rendement annuel attendu » faisait capitaliser au taux des actions des
   parts illiquides sans prix de marche, et un compte courant qui ne rapporte
   rien. Trois poches, et chacune dit ce qu'elle est.

   - `marche` : ce qui se cote. Les actifs de marche, la crypto, et le cash
     « a investir » — celui-la n'est pas encore place mais il va l'etre, c'est
     sa definition. Les versements mensuels le rejoignent, pour la meme raison.
   - `autres` : ce qui est pose sans se coter. Le non cote, le compte courant,
     l'epargne de precaution. Un taux propre, zero par defaut.
   - `plat` : l'immobilier net, gele. Voir partPlate().

   La propriete qui gouverne tout : la somme des trois fait le patrimoine net.
   Elle est testee, parce que c'est elle qui garantit qu'aucun euro ne se perd
   ni ne se dedouble en changeant de poche. */
/* La valeur des metaux precieux cotes, calculee a part et seulement pour ici.

   `POCHE_DE_CLASSE` fait `metaux -> actions`, donc `nowByGroup().bourse` les
   compte avec les actions. C'est juste partout ailleurs — un ETC or se vend en
   seance comme un ETF, et Allocation, l'autonomie financiere et l'historique en
   dependent — et faux dans la projection, ou cela revenait a supposer 6 % l'an
   sur de l'or parce qu'il se negocie sur un marche.

   Rien ne bouge dans les autres ecrans : cette fonction lit la classe fine, et
   Projection seule s'en sert pour deplacer la frontiere de ses poches.

   Les metaux n'existent qu'en position de marche : `CLASSES_ACTIFS`, la table
   des lignes saisies a la main, n'a pas cette classe. Le drapeau `projet` est
   teste quand meme — une position n'en porte pas aujourd'hui, et le jour ou elle
   en portera, `projetParPoche.bourse` retirerait ces euros une seconde fois. */
function valeurMetaux() {
  const ouverts = new Set(comptesOuverts().map(c => c.id));
  let v = 0;
  for (const pos of (Store.state.positions || [])) {
    if (!ouverts.has(pos.account) || pos.projet) continue;
    if (assetClassDe(pos) === 'metaux') v += posValue(pos);
  }
  return v;
}

function pochesProjection(t = nowTotals()) {
  const metaux = valeurMetaux();
  return {
    /* Chaque poche est amputee de ce qu'elle a de reserve : sans cela le total
       compterait ces euros deux fois, ici et dans `projet`. La regle de la
       maison, litteralement — un total egale la somme de ses parts. */
    marche: num(t.bourse) - num(t.projetParPoche?.bourse) - metaux,
    autres: num(t.crypto) - num(t.projetParPoche?.crypto)
          + num(t.pe) - num(t.projetParPoche?.nonCote)
          + metaux,
    liquidites: num(t.cash),
    garanti: num(t.garanti) - num(t.projetParPoche?.garanti),
    projet: num(t.projet),
    get placees() {
      return this.marche + this.autres + this.garanti + this.liquidites + this.projet;
    },
    plat: partPlate(t),
  };
}

/* --- le moteur, et lui seul ---------------------------------------------

   Trois fonctions calculaient la meme courbe de trois facons. `capitalisation()`
   capitalisait poche par poche, mois par mois. `targetRequirements()` portait sa
   propre formule fermee d'annuite, qui faisait progresser TOUT le patrimoine
   financier au taux des actifs de marche : 10 000 EUR de non cote a 0 % et
   15 000 EUR de liquidites y rapportaient 6 % l'an. Elle annoncait donc un
   versement plus faible que celui qu'il faut vraiment, et la phrase « il
   faudrait verser X » contredisait la courbe affichee juste au-dessus.
   `targetReachedAt()` interpolait entre deux points annuels.

   Un seul noyau desormais, et les trois questions passent par lui. Une methode
   numerique coute quelques milliers d'operations flottantes — le prix d'un seul
   rendu — et supprime la seule chose qu'une formule fermee ne peut pas garantir
   ici : dire la meme chose que la courbe. */

function configProjection(opts = {}) {
  const s = Object.assign(projectionSettings(), opts);
  const t = nowTotals();
  const poches = pochesProjection(t);
  const plat = opts.plat != null ? num(opts.plat) : poches.plat;

  /* `start` est la base qui capitalise, entiere. Imposee, tout va au marche :
     c'est l'ancien comportement, et les appelants qui la forcent doivent
     continuer de le trouver. Sinon chaque poche part de sa propre valeur.

     Un prorata distribuait ce depart entre les poches quand `start` etait
     impose. Il n'est plus la : les poches sont connues une par une, et une
     repartition au prorata d'une somme qu'on possede deja n'apportait qu'un
     arrondi a rattraper. */
  const impose = opts.start != null;
  const start = impose ? num(opts.start) : poches.placees;
  const departMarche = impose ? start : poches.marche;
  const departAutres = impose ? 0 : poches.autres;
  const departGaranti = impose ? 0 : poches.garanti;
  const departLiquides = impose ? 0 : poches.liquidites + poches.projet;

  return {
    settings: s, start, plat, poches,
    marche: departMarche, autres: departAutres,
    garanti: departGaranti, liquidites: departLiquides,
    rate: s.rate, rateAutres: s.rateAutres, rateGaranti: s.rateGaranti,
    monthly: s.monthly, inflation: s.inflation, target: s.target,
    /* Quand `plat` ou `start` est impose, aucune dette n'est amortie : le
       patrimoine plat est alors une donnee d'entree, pas le solde d'un bien et
       d'un emprunt. */
    dettes: (impose || opts.plat != null) ? [] : dettesAmortissables(),
    fractions: impose
      ? { marche: 1, autres: 0, garanti: 0, liquidites: 0 }
      : repartitionVersement(s),
    mois: Math.round((opts.years || Math.max(...PROJECTION_HORIZONS)) * 12),
  };
}

/* Les dettes que la projection sait amortir, et leur echeancier mensuel.

   Le capital rembourse chaque mois augmente le patrimoine net : le bien ne
   bouge pas, la dette baisse. Ce n'est pas un versement financier — cet argent
   n'arrive sur aucun compte — donc il ne capitalise a aucun taux. Il entre dans
   `contributed`, comme un euro mis de cote, et jamais dans les gains.

   Une dette sans taux ou sans mensualite reste constante : sans taux on ne sait
   pas separer capital et interets, et on ne devine pas. Meme regle que
   `capitalRembourseParMois()`, dont ceci est la version mois par mois. */
function dettesAmortissables() {
  const out = [];
  for (const e of ETABS()) {
    for (const d of (e.dettes || [])) {
      const reste = num(d.montant);
      const taux = num(d.taux) / 100 / 12;
      const mens = mensualiteCredit(d);
      if (!reste || !taux || !mens) continue;
      const assurance = assuranceMensuelleCredit(d);
      if (mens - assurance <= reste * taux) continue;
      out.push({ reste, taux, mens: mens - assurance });
    }
  }
  return out;
}

function moteurProjection(c) {
  const parMois = taux => Math.pow(1 + num(taux) / 100, 1 / 12) - 1;
  const rMarche = parMois(c.rate);
  const rAutres = parMois(c.rateAutres);
  const rGaranti = parMois(c.rateGaranti);
  const f = c.fractions;
  const vm = c.monthly * f.marche, va = c.monthly * num(f.autres);
  const vg = c.monthly * f.garanti, vl = c.monthly * f.liquidites;

  let marche = c.marche, autres = num(c.autres);
  let garanti = c.garanti, liquidites = c.liquidites;
  const dettes = c.dettes.map(d => ({ ...d }));
  let capitalRendu = 0;

  const aujourdhui = new Date();
  const anneeDebut = aujourdhui.getFullYear();
  const moisDebut = aujourdhui.getMonth();
  const total0 = c.marche + num(c.autres) + c.garanti + c.liquidites + c.plat;
  const points = [{ year: anneeDebut, label: String(anneeDebut),
                    contributed: total0, gains: 0, total: total0, real: total0 }];
  let atteinte = c.target > 0 && total0 >= c.target
    ? { dejaAtteinte: true, monthsFromNow: 0, yearsFromNow: 0,
        year: anneeDebut, month: moisDebut + 1 }
    : null;

  for (let mois = 1; mois <= c.mois; mois++) {
    marche = marche * (1 + rMarche) + vm;
    autres = autres * (1 + rAutres) + va;
    garanti = garanti * (1 + rGaranti) + vg;
    liquidites += vl;
    for (const d of dettes) {
      if (d.reste <= 0) continue;
      const capital = Math.min(d.reste, d.mens - d.reste * d.taux);
      d.reste -= capital;
      capitalRendu += capital;
    }

    const plat = c.plat + capitalRendu;
    const total = marche + autres + garanti + liquidites + plat;
    if (!atteinte && c.target > 0 && total >= c.target) {
      const date = new Date(anneeDebut, moisDebut + mois, 1);
      atteinte = { dejaAtteinte: false, monthsFromNow: mois,
                   yearsFromNow: mois / 12,
                   year: date.getFullYear(), month: date.getMonth() + 1 };
    }
    if (mois % 12 === 0) points.push(pointDe(mois));
  }

  /* Le point de sortie, toujours construit, meme quand l'horizon ne tombe pas
     sur une annee pleine : `points[points.length - 1]` rendait alors le point de
     DEPART, en silence, et `targetRequirements()` cherchait un versement contre
     un total qui n'avait pas bouge. Treize mois suffisaient a le declencher. */
  const final = c.mois > 0 && c.mois % 12 === 0
    ? points[points.length - 1] : pointDe(c.mois);

  return { points, atteinte, capitalRendu, final };

  function pointDe(mois) {
    const an = mois / 12;
    const plat = c.plat + capitalRendu;
    const total = marche + autres + garanti + liquidites + plat;
    const cumul = mois * c.monthly;
    const misMarche = c.marche + cumul * f.marche;
    const misAutres = num(c.autres) + cumul * num(f.autres);
    const misGaranti = c.garanti + cumul * f.garanti;
    const misLiquides = c.liquidites + cumul * f.liquidites;
    return {
      year: anneeDebut + Math.round(an), label: String(anneeDebut + Math.round(an)),
      mois,
      contributed: misMarche + misAutres + misGaranti + misLiquides + plat,
      gains: (marche - misMarche) + (autres - misAutres)
           + (garanti - misGaranti) + (liquidites - misLiquides),
      /* Un gain par poche, chacun sous le nom de sa poche. `gainsAutres`
         designait le non cote PLUS le garanti PLUS les liquidites, et la vue
         l'affichait sous l'intitule « Rendement du non cote » : le rendement
         d'un fonds euros se lisait donc comme celui de parts non cotees. Quatre
         noms exacts valent mieux qu'un raccourci qui se trompe. */
      gainsMarche: marche - misMarche,
      gainsAutres: autres - misAutres,
      gainsGaranti: garanti - misGaranti,
      gainsLiquidites: liquidites - misLiquides,
      poches: { marche, autres, garanti, liquidites, plat },
      capitalRendu, plat, total,
      real: total / Math.pow(1 + num(c.inflation) / 100, mois / 12),
    };
  }
}

function capitalisation(opts = {}) {
  const c = configProjection(opts);
  const r = moteurProjection(c);
  return { start: c.start, plat: c.plat, poches: c.poches,
           points: r.points, settings: c.settings,
           targetReached: r.atteinte,
           jalons: jalonsProjection(r.points, c.mois / 12) };
}

function jalonsProjection(points, annees) {
  const reperes = new Set(PROJECTION_HORIZONS.filter(h => h <= annees));
  for (let h = 30; h <= annees; h += 10) reperes.add(h);
  reperes.add(annees);
  return [...reperes].sort((a, b) => a - b)
    .filter(h => points[h])
    .map(h => Object.assign({ horizon: h }, points[h]));
}

const RECHERCHE_PAS = 40;          // 40 bissections : l'intervalle est divise par 2^40
const RECHERCHE_ANNEES_MAX = 60;   // au-dela, « attendre » n'est plus une reponse
const RECHERCHE_TAUX_MAX = 60;     // en % par an
const RECHERCHE_VERSEMENT_MAX = 1e7;

function targetRequirements({ target, years, opts = {} } = {}) {
  const base = configProjection(Object.assign({ years }, opts));
  const T = num(target != null ? target : base.target);
  const out = { reachable: false, years: null, monthly: null, rate: null };
  if (!(T > 0)) return out;

  const joue = modif => moteurProjection(Object.assign({}, base, modif));
  const atteint = modif => {
    const r = joue(modif);
    return r.final.total >= T;
  };

  /* Les poches de depart, nommees une par une : la somme du moteur, pas une
     seconde definition. Une poche renommee sans cette ligne rendait `undefined`,
     donc NaN, donc « cible non atteignable » sur un patrimoine qui la depasse
     deja — et rien a l'ecran pour le dire. */
  if (base.marche + base.autres + base.garanti + base.liquidites + base.plat >= T) {
    out.reachable = true;
    return out;
  }

  const long = joue({ mois: RECHERCHE_ANNEES_MAX * 12, target: T });
  if (long.atteinte) out.years = long.atteinte.monthsFromNow / 12;

  if (!atteint({ monthly: 0 })) {
    if (atteint({ monthly: RECHERCHE_VERSEMENT_MAX })) {
      let bas = 0, haut = RECHERCHE_VERSEMENT_MAX;
      for (let k = 0; k < RECHERCHE_PAS && haut - bas > 0.5; k++) {
        const milieu = (bas + haut) / 2;
        if (atteint({ monthly: milieu })) haut = milieu; else bas = milieu;
      }
      out.monthly = haut;
    }
  } else {
    out.monthly = 0;
  }

  if (base.marche > 0 || base.fractions.marche > 0) {
    if (atteint({ rate: RECHERCHE_TAUX_MAX })) {
      let bas = 0, haut = RECHERCHE_TAUX_MAX;
      for (let k = 0; k < RECHERCHE_PAS && haut - bas > 0.05; k++) {
        const milieu = (bas + haut) / 2;
        if (atteint({ rate: milieu })) haut = milieu; else bas = milieu;
      }
      out.rate = haut;
    }
  }
  return out;
}

function monthsToObjective() {
  const now = new Date();
  const y = num(Store.state.meta.objectiveYear) || now.getFullYear();
  return Math.max(0, (y - now.getFullYear()) * 12 + (11 - now.getMonth()));
}

function objectiveProjection() {
  const g = objectiveStatus();
  const pace = paceRecent();          // même fenêtre que la brique Épargne
  const rec = savingsReconciliation();
  const monthsLeft = monthsToObjective();

  const atPace = g.total + pace.average * monthsLeft;
  const atBudget = g.total + rec.theoretical * monthsLeft;
  const needed = monthsLeft ? (g.obj - g.total) / monthsLeft : 0;

  return {
    monthsLeft, needed,
    atPace, atBudget,
    paceRate: pace.average, paceMonths: pace.count, budgetRate: rec.theoretical,
    onTrackPace: atPace >= g.obj,
    onTrackBudget: atBudget >= g.obj,
    gapAtPace: atPace - g.obj,
  };
}

/* --- ce que la cloche annonce -------------------------------------------
   Les contrôles de cohérence, rangés par ce qui presse. Ils vivaient enterrés
   au bas de la page Données, là où personne ne les cherchait.

   Une seule source, et c'est le point : j'ai d'abord ajouté ici les deux
   saisies en attente, avant de voir que `healthChecks` les portait déjà — deux
   listes du même fait, dont une seule respectait « Plus tard ». Les deux
   contrôles passent maintenant par `currentMonthPending` et
   `depensesEnAttente`, qui décident seuls qu'une saisie réclame quelque chose.

   `action` d'abord : ce sur quoi on peut agir tout de suite, avant les chiffres
   qu'il faut comprendre pour corriger. */
const RANG_NOTIF = { action: 0, error: 1, warn: 2, info: 3 };

const FAMILLES_NOTIF = [
  ['saisies',   trad('Saisies en attente'),    trad('Le relevé du mois, les dépenses du mois clos')],
  ['cours',     trad('Cours de bourse'),       trad('Prix périmés, ligne sans identifiant ou sans cours')],
  ['credits',   trad('Crédits'),               trad('Capital restant dû à vérifier, mensualité hors budget')],
  ['echeances', trad('Échéances du non coté'), trad('Remboursement attendu, retard, défaut')],
  ['budget',    'Budget',                trad('Objectif intenable, épargne de précaution')],
  ['coherence', trad('Cohérence des données'), trad('Un chiffre faux, ou impossible')],
  ['synchro',   trad('Synchronisation'),      trad('Une modification qui n’est pas partie')],
];

function cleNotif(n) {
  return String(n.level) + ':' + String(n.title)
    .toLowerCase()
    .replace(/[0-9][0-9\s.,%]*/g, ' ')
    .replace(/[^a-z\u00e0-\u00ff]+/g, '-')
    .replace(/^-|-$/g, '');
}

function reglagesNotifs() {
  const r = Store.state.meta?.notifsReglages || {};
  const out = {};
  for (const [cle] of FAMILLES_NOTIF) out[cle] = r[cle] !== false;
  return out;
}

function notifsMasquees() { return Store.state.meta?.notifsMasquees || []; }

function masquerNotif(cle) {
  const l = notifsMasquees();
  if (!l.includes(cle)) Store.state.meta.notifsMasquees = l.concat(cle);
}
function rendreNotifs() { Store.state.meta.notifsMasquees = []; }

function notifications() {
  const actives = reglagesNotifs();
  const masquees = notifsMasquees();
  return healthChecks()
    .filter(n => actives[n.sujet] !== false && !masquees.includes(cleNotif(n)))
    .map(n => ({ ...n, cle: cleNotif(n) }))
    .sort((a, b) => RANG_NOTIF[a.level] - RANG_NOTIF[b.level]);
}

function healthChecks() {
  const out = [];
  let sujet = 'coherence';
  const add = (level, title, detail, view) => out.push({ level, sujet, title, detail, view });

  sujet = 'cours';
  for (const p of Store.state.positions) {
    if ((p.isin || '').trim() && !isinIsValid(p.isin))
      add('error', trad('ISIN invalide sur {n}').replace('{n}', guill(p.name)),
        trad('{v}, clé de contrôle incorrecte').replace('{v}', p.isin), 'positions');
    if (!p.manual && !(p.symbol || '').trim() && !(p.isin || '').trim())
      add('warn', trad('{n} sans identifiant').replace('{n}', guill(p.name)),
        trad('Ni ISIN ni symbole : le cours ne peut pas être récupéré'), 'positions');
    if (!p.manual && !num(p.qty))
      add('warn', trad('{n} a une quantité nulle').replace('{n}', guill(p.name)),
        trad('La ligne compte pour 0 € dans le portefeuille'), 'positions');
    if (!p.manual && !num(p.price))
      add('warn', trad('{n} n’a pas de cours').replace('{n}', guill(p.name)),
        trad('Valeur calculée à 0 €'), 'positions');
  }

  if (Store.state.positions.length) {
    const last = Store.state.quotes?.lastRun;
    if (!last) add('info', trad('Cours jamais actualisés'),
      trad('Les prix viennent du sheet, pas du marché'), 'positions');
    else {
      const days = (Date.now() - new Date(last)) / 86400000;
      if (days > 7) add('warn',
        trad('Cours vieux de {n} jours').replace('{n}', Math.round(days)),
        trad('Valorisation et allocation sont décalées du marché'), 'positions');
    }
  }

  /* --- une ecriture refusee par le cloud ---
     Le serveur n'accepte une ecriture que de l'appareil qui a lu la version en
     place. Un refus veut donc dire : ce que tu viens d'enregistrer est ici, et
     nulle part ailleurs. C'est la seule situation ou fermer l'application fait
     perdre quelque chose, et elle ne se disait que sur la page Donnees.

     `typeof` et non un simple test : `store.js` se charge avant `cloudsync.js`,
     et un controle qui leve une exception emporterait toute la cloche. */
  sujet = 'synchro';
  if (typeof CloudSync !== 'undefined' && CloudSync.isAvailable()) {
    const c = CloudSync.status().conflict;
    if (c) add('error', trad('Ta dernière modification n’est pas partie'),
      trad('Une autre version existe en ligne. Choisis laquelle garder.'), 'data');
  }

  sujet = 'credits';
  for (const e of ETABS()) {
    const du = (e.dettes || []).reduce((s, d) => s + num(d.montant), 0);
    if (!du) continue;
    if (COMPTES().some(c => c.etabId === e.id)) continue;
    add('error', trad('Crédit sans bien chez {e}').replace('{e}', e.nom),
      trad('{v} de capital restant dû se soustraient encore de ton patrimoine net, '
        + 'alors que plus aucun compte n’est rattaché. Ouvre la fiche pour retirer le crédit.')
        .replace('{v}', fmtEUR0(du)),
      'accounts');
  }

  sujet = 'echeances';
  for (const e of echeances()) {
    if (e.depassee) {
      add('action', trad('{l} a passé son échéance').replace('{l}', guill(e.libelle)),
        trad('Échéance au {d}, il y a {n} jours, et la ligne est toujours en cours pour '
          + '{v}. Si l’argent est rentré, passe-la en « Remboursé » et baisse son '
          + 'montant ; sinon marque-la en retard.')
          .replace('{d}', fmtDate(e.echeance)).replace('{n}', Math.abs(e.jours))
          .replace('{v}', fmtEUR0(e.valeur)),
        'accounts');
    } else if (e.statut === 'retard') {
      add('warn', trad('{l} en retard').replace('{l}', guill(e.libelle)),
        trad('{v} chez {e}, échéance du {d}.')
          .replace('{v}', fmtEUR0(e.valeur)).replace('{e}', e.etab)
          .replace('{d}', fmtDate(e.echeance)), 'accounts');
    } else if (e.statut === 'defaut') {
      add('error', trad('{l} en défaut').replace('{l}', guill(e.libelle)),
        trad('{v} comptent encore en entier dans ton patrimoine. Si tu n’espères plus '
          + 'rien, baisse le montant : c’est la seule façon que ton patrimoine net '
          + 'dise la vérité.').replace('{v}', fmtEUR0(e.valeur)), 'accounts');
    }
  }

  sujet = 'coherence';
  {
    const p = patrimoine();
    if (p.net < 0 && p.dettes > 0) {
      const lignes = creditsEnCours().lignes.slice().sort((a, b) => b.reste - a.reste);
      const adosse = cr => comptesBiens().some(c => c.etabId === cr.etabId);
      const orphelins = lignes.filter(cr => !adosse(cr));
      if (orphelins.length) {
        const cr = orphelins[0];
        add('error', trad('Patrimoine net négatif'),
          trad('Tes crédits ({d}) dépassent tes avoirs ({b}) de {e}. Si l’un d’eux '
            + 'finance un bien (le plus gros sans bien en face est {l}, {r}), déclare '
            + 'ce bien : sa valeur doit figurer dans tes avoirs, sinon seule la dette '
            + 'compte. Un crédit immobilier sans son logement fait plonger le net.')
            .replace('{d}', fmtEUR0(p.dettes)).replace('{b}', fmtEUR0(p.brut))
            .replace('{e}', fmtEUR0(-p.net)).replace('{l}', guill(cr.libelle))
            .replace('{r}', fmtEUR0(cr.reste)),
          'accounts');
      } else {
        /* Somme des parts de capital des prochaines echeances : ce que le mois
           ajoute vraiment au net. `capital` vaut null sans taux connu, et le
           message le dit alors autrement plutot que de compter zero. */
        const capital = lignes.reduce((s, cr) => s + (cr.capital || 0), 0);
        add('info', trad('Patrimoine net négatif, et c’est normal après un achat'),
          trad('Tes biens valent {b} et il te reste {d} à rembourser : l’écart fait '
            + '{e}. C’est l’état ordinaire des premières années d’un achat à crédit, '
            + 'surtout quand le prêt a financé les frais de notaire, qui ne se '
            + 'revendent pas.')
            .replace('{b}', fmtEUR0(p.brut)).replace('{d}', fmtEUR0(p.dettes))
            .replace('{e}', fmtEUR0(-p.net))
          + ' ' + (capital > 0.005
            ? trad('Chaque mensualité rembourse {c} de capital, et ton patrimoine net '
              + 'remonte d’autant.').replace('{c}', fmtEUR0(capital))
            : trad('Renseigne le taux de tes crédits pour voir ce que chaque mensualité '
              + 'rembourse en capital : c’est ce montant qui fait remonter ton net.')),
          'accounts');
      }
    }
  }

  sujet = 'credits';
  for (const c of creditsEnCours().lignes) {
    if (!c.mensualite || c.charge) continue;
    add('action', trad('Mensualité de {l} hors du budget').replace('{l}', guill(c.libelle)),
      trad('{v} par mois sortent de ton compte sans figurer dans tes charges fixes. '
        + 'Ouvre le crédit pour créer la ligne, ou rattache-lui la charge existante '
        + 'si elle y est déjà sous un autre nom.')
        .replace('{v}', fmtEUR0(c.mensualite)), 'accounts');
  }

  sujet = 'credits';
  const RAPPEL_CREDIT_MOIS = 3;
  for (const c of creditsEnCours().lignes) {
    if (!c.verifieLe) {
      add('action', trad('Crédit {l} jamais vérifié').replace('{l}', guill(c.libelle)),
        trad('{v} de capital restant dû, sans date de dernière vérification. Ouvre-le '
          + 'une fois : l’application saura ensuite suivre son évolution.')
          .replace('{v}', fmtEUR0(c.reste)), 'accounts');
      continue;
    }
    if (c.moisDepuis < RAPPEL_CREDIT_MOIS) continue;
    if (c.projete == null) {
      add('action', trad('Crédit {l} à relever').replace('{l}', guill(c.libelle)),
        trad('Vérifié il y a {n} mois, et rien ne permet d’en déduire le solde '
          + 'd’aujourd’hui : ni échéances, ni taux. Va lire le montant chez {e} et '
          + 'corrige-le, c’est {v} qui pèsent sur ton patrimoine net.')
          .replace('{n}', c.moisDepuis).replace('{e}', c.etabNom)
          .replace('{v}', fmtEUR0(c.reste)),
        'accounts');
      continue;
    }
    if (Math.abs(c.ecart) < 1) continue;
    add('action', trad('Crédit {l} à mettre à jour').replace('{l}', guill(c.libelle)),
      c.sens === 'monte'
        ? trad('Vérifié il y a {n} mois. Sans échéances, les intérêts le font grossir : '
            + 'à {t} % l’an il devrait atteindre {p} au lieu de {r}. Relève le solde '
            + 'chez {e} : ton patrimoine net est surestimé de {x}.')
            .replace('{n}', c.moisDepuis).replace('{t}', fmtNombre(c.taux))
            .replace('{p}', fmtEUR0(c.projete)).replace('{r}', fmtEUR0(c.reste))
            .replace('{e}', c.etabNom).replace('{x}', fmtEUR0(-c.ecart))
        : trad('Vérifié il y a {n} mois. D’après ta mensualité, il devrait rester {p} '
            + 'au lieu de {r} : {x} de patrimoine net que l’application ne compte pas '
            + 'encore.')
            .replace('{n}', c.moisDepuis).replace('{p}', fmtEUR0(c.projete))
            .replace('{r}', fmtEUR0(c.reste)).replace('{x}', fmtEUR0(c.ecart)),
      'accounts');
  }

  sujet = 'coherence';
  /* Les cibles vivent dans `targets.classes` depuis que le rééquilibrage
     raisonne par classe d'actif. Ce contrôle additionnait encore `coreEtf`,
     `satellites` et `gold`, disparus à la migration : trois `undefined` font
     un NaN, et l'alerte réclamait donc 100 % en permanence à quelqu'un qui les
     avait déjà. Même définition que `rebalanceRows()` — une classe mise hors
     jeu ne compte pas, son encours a quitté la base. */
  const sum = sommeCibles();
  if (sum > 0 && Math.abs(sum - 100) > 0.05 && patrimoine().brut > 0.005)
    add('warn', trad('Cibles d’allocation à {v}').replace('{v}', fmtPct(sum, 1)),
      trad('La somme devrait faire 100 % pour que les montants cibles aient un sens'),
      'rebalance');

  sujet = 'coherence';
  /* --- trous dans les deux historiques ---

     Ce contrôle ne cherchait que les trous **encadrés** par deux mois remplis :
     il parcourait les index des lignes non vides et signalait les écarts. Sauter
     juillet et août alors qu'on est en septembre n'en produit aucun — rien ne
     suit — donc le cas le plus courant passait au travers. `moisVides()` part de
     l'autre bout : tous les mois passés vides depuis le premier rempli.

     Les dépenses ont désormais le leur. Elles n'en avaient pas, alors que la
     moyenne des dépenses sert de coût de la vie à l'autonomie financière et à la
     cible d'épargne de précaution : un mois manquant y pèse deux fois. */
  for (const [trous, quoi, vue] of [
    [trousReleves(), 'Trou dans l’historique des relevés', 'history'],
    [trousDepenses(), 'Trou dans l’historique des dépenses', 'budget'],
  ]) {
    if (!trous.length) continue;
    const noms = trous.map(fmtMonth);
    const cite = noms.length > 3 ? `${noms.slice(0, 3).join(', ')}…` : noms.join(', ');
    add('warn', trad(quoi),
      trad('{n} mois sans donnée : {c}. Les moyennes se calculent sur ce qui reste.')
        .replace('{n}', noms.length).replace('{c}', cite),
      vue);
  }

  sujet = 'saisies';
  /* Le releve du mois en cours, et il passe par `currentMonthPending` : un
     rappel repousse ou tu pour le mois ne doit pas ressortir ici. Ce controle
     lisait l'etat brut, donc « Plus tard » eteignait le bandeau et la pastille
     de la barre du bas, mais pas cette ligne — ni la cloche qui la reprend.
     Un seul endroit decide qu'une saisie reclame quelque chose.

     Le bouton « Snapshot du mois » n'existe plus : c'est le ⤒ de la ligne,
     allume sur le mois qui attend. Une consigne qui nomme un bouton absent est
     pire qu'une consigne vague. */
  /* La garde vit dans `currentMonthPending()`, avec les bandeaux de l'accueil :
     la poser ici aussi l'aurait laissee diverger de l'autre. */
  const relEnAttente = currentMonthPending();
  if (relEnAttente.missing) {
    add('action', `${trad('Relevé de')} ${relEnAttente.label} ${trad('à enregistrer')}`,
      trad('Le bouton ⤒ de sa ligne y reprend tous les montants actuels'), 'history');
  }

  sujet = 'budget';
  const b = Store.state.budget;
  /* Les depenses reclamees sont celles du mois clos, pas du mois en cours : le
     2 aout, personne ne sait ce qu'aout coutera. `depensesEnAttente` porte cette
     regle, et le report avec. Ce controle visait le mois courant, et allumait
     donc une alerte du 1er au 31 sur un mois qu'on ne peut pas encore saisir. */
  /* Meme raison : la garde est dans `depensesEnAttente()`, partagee avec le
     bandeau de l'accueil et la pastille du menu. */
  const depEnAttente = depensesEnAttente();
  if (depEnAttente.missing)
    add('action', trad('Dépenses de {m} à saisir').replace('{m}', depEnAttente.label),
      trad('Le mois est clos, ce qu’il a coûté reste à enregistrer'), 'budget');

  const f = budgetFrame();
  if (f.income > 0 && f.available < f.target)
    add('error', trad('Objectif de dépenses au-dessus du reste pour vivre'),
      trad('{t} visés pour {a} disponibles')
        .replace('{t}', fmtEUR0(f.target)).replace('{a}', fmtEUR0(f.available)), 'budget');

  sujet = 'budget';
  /* « 0 mois d'autonomie, 0 € pour 0 € de coût mensuel » etait la caricature de
     la regle que ce projet s'est donnee : la cloche ne parle que de ce qui existe
     chez celui qui la regarde.

     La garde ne porte pas sur `burn` : celui-ci retombe sur l'objectif de
     depenses, pose par defaut, et vaut donc 1 000 EUR chez quelqu'un qui n'a
     rien saisi. Elle porte sur le revenu declare, comme le rappel des depenses
     et pour la meme raison — c'est lui qui donne un cadre aux mois. */
  const rw = runway();
  if (!pasAFaire('revenus') && rw.burn > 0.005 && rw.immediateMonths < 3)
    /* Le montant cité est celui qui sert au calcul — le palier « disponible
       tout de suite ». Le message affichait `nowByGroup().cash`, qui compte
       aussi le cash posé chez un courtier : il annonçait donc une somme dont
       les mois affichés ne tenaient pas compte, et l'écart s'est creusé le
       jour où ce cash a rejoint les liquidités.
       Et `toFixed(1)` écrivait « 0.7 mois », seul point décimal d'une
       application qui met des virgules partout ailleurs. */
    add('warn', `${trad('Épargne de précaution')}${deuxPoints()} ${fmtNombre(Math.round(rw.immediateMonths * 10) / 10)} ${trad('mois')}`,
      `${trad('Disponible tout de suite')} ${fmtEUR0(rw.immediate)} ${trad('pour')} ${fmtEUR0(rw.burn)} ${trad('de coût mensuel, la règle courante est 3 à 6 mois')}`, 'overview');

  return out;
}

/*   `perfAnnualisee()` et `perfAnnualiseePortefeuille()` vivaient ici. Elles
   étalaient la plus-value d'une ligne sur la durée depuis sa date d'achat, ce
   qui ne tient que si l'argent est arrivé d'un coup.

   Une case « alimentée régulièrement » a été envisagée puis écartée : elle
   aurait demandé du travail pour que l'application cesse de mentir, et sur un
   portefeuille où les grosses lignes sont justement celles qu'on alimente, elle
   aurait éteint le chiffre là où il portait la valeur.

   Ce qui reste dit vrai : l'écart en euros et en pourcentage, qui ne dépend pas
   de la façon dont la ligne s'est constituée. Une durée de détention l'a
   remplacé sur la fiche, comme un fait plutôt que comme un taux, puis elle est
   partie aussi : elle n'apportait pas de quoi payer sa place.

   `dateAchat` reste, et sert toujours : c'est elle qui empêche l'écart du jour
   de compter une baisse d'avant l'achat. Un champ qui pilote un calcul n'a pas
   besoin de s'afficher. */

function fmtDureeMois(mois) {
  const n = Math.max(0, Math.round(mois));
  const a = Math.floor(n / 12), m = n % 12;
  const lesMois = `${m} ${trad('mois')}`;
  if (!a) return lesMois;
  const lesAns = `${a} ${a > 1 ? trad('ans') : trad('an')}`;
  return m ? `${lesAns} ${trad('et')} ${lesMois}` : lesAns;
}

/* Le meme calcul que `latentPnl()`, au mot pres : valeur des positions, prix de
   revient, ecart, pourcentage. Deux exemplaires d'une meme somme finissent par
   dire deux choses — celui-ci rendait encore 0 % sur une base nulle quand
   l'autre se taisait, et le meme ecran pouvait porter les deux. Le nom reste,
   huit appelants le connaissent, mais il n'y a plus qu'un calcul.

   Declaration de fonction et non `const` : une liaison lexicale ne se hisse pas
   et ne se pose pas sur `window`, deux pieges que ce depot connait deja. */
function portfolioPnl() { return latentPnl(); }
