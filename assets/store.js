/* =============================================================
   STORE — état, persistance locale et calculs dérivés
   ============================================================= */

/* Deux jeux de donnees cohabitent, sous deux cles distinctes : les vraies et
   celles de la demonstration. Le mode se retient d'un chargement a l'autre,
   sinon un rafraichissement en pleine demo ferait reapparaitre les vraies
   donnees sans prevenir.

   La regle a ne jamais casser : en demonstration, on n'ecrit que dans la cle
   de demonstration, et on ne synchronise pas. Sans ce garde-fou, charger la
   demo poussait des chiffres fictifs dans le KV et effacait le patrimoine en
   ligne. Les vraies donnees restent intactes sous leur propre cle. */
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

/* Rejoue la graine, en gardant la cle de stockage courante. */
function rechargerDemo() {
  Store.state = structuredClone(SEED);
  Store.migrate();
  refreshAccounts();
  Store.save();
}
const BACKUP_KEY = 'wealth-dashboard:backups';
const UNDO_LIMIT = 40;
const BACKUP_LIMIT = 8;

/* Les comptes vivent dans l'état : on peut en ajouter et en supprimer.
   Ces trois vues sont recalculées à chaque modification. */
let ACCOUNTS = SEED_ACCOUNTS;
let ACC = Object.fromEntries(ACCOUNTS.map(a => [a.id, a]));
let HOLDING_ACCOUNTS = ACCOUNTS.filter(a => a.holdings).map(a => a.id);

/* =============================================================
   MODÈLE — Banque ou courtier > Compte > (argent + placements)

   Trois niveaux, et rien d'autre :

   Établissement { id, nom, notes, dettes[] }   — pas de type : beaucoup
     sont hybrides (banque ET courtier). Seuls les comptes ont un type.
   Compte { id, etabId, type, statut, ouvertLe, numero, notes,
            cash[], lignes[] }                  — le cash est un ATTRIBUT
     du compte : plusieurs entrées d'affectations différentes, jamais un
     compte à part entière.
   Ligne  { id, classe, libelle, valeur, prixDeRevient, quantite,
            dateAcquisition }                   — les lignes cotées vivent
     dans positions[] (source des cours) et sont projetées ici.

   Les poches sont DÉRIVÉES à chaque lecture — depuis l'affectation
   déclarée du cash et la classe d'actif des lignes, jamais depuis le
   type d'établissement ni le type de compte. Rien de dérivé n'est
   persisté.
   ============================================================= */

/* Les clés internes ne s'affichent jamais : l'écran ne connaît que ces
   libellés. C'est la frontière entre le modèle et l'interface. */
const AFFECTATIONS = [
  /*    « Cash à investir » et non « À investir » : les quatre poches se lisent
   cote a cote sur trois ecrans, et un intitule sans substantif ne se
   comparait pas aux trois autres.*/
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
  /* « Patrimoine net » et non « Ton patrimoine net » : c'est deja le mot du
     bandeau lateral et des pieds de liste. Un nom qui existe se reprend, il ne
     se reinvente pas. */
  net:         { nom: trad('Patrimoine net'),     de: trad('de ton patrimoine net') },   // brut - dettes
  place:       { nom: trad('Placé'),              de: trad('de ce qui est placé') },    // nowTotals().invested
  placeBourse: { nom: trad('Placé en bourse'),    de: trad('de ce qui est placé en bourse') },
  baseCibles:  { nom: trad('Base de tes cibles'), de: trad('de la base de tes cibles') },
  liquidites:  { nom: trad('Liquidités'),         de: trad('de tes liquidités') },      // les quatre poches
  cashDispo:   { nom: AFFECTATION_LABEL.courant,    de: trad('du cash disponible') },
  precaution:  { nom: AFFECTATION_LABEL.precaution, de: trad('de l’épargne de précaution') },
  projet:      { nom: AFFECTATION_LABEL.projet,     de: trad('du cash de projet') },
  cashPlacer:  { nom: AFFECTATION_LABEL.investir,   de: trad('du cash à investir') },
};

/* La mention grise a droite d'un titre de bloc : « en % de tes avoirs ·
   36 098 EUR ». Le format vient de « Core et satellites », qui l'avait seul ;
   il est desormais celui de tous les blocs a pourcentages. */
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
  /*    « Actifs de marché » : la classe porte plus que des actions — ETF, ETC or,
   options — et le terme reste juste meme quand la crypto a sa propre tuile a
   cote.*/
  actions:     trad('Actifs de marché'),
  obligations: trad('Obligations'),
  crypto:      trad('Cryptomonnaies'),
  nonCote:     trad('Placements non cotés'),
  immobilier:  trad('Immobilier'),
  /* Une montre, une voiture, un tableau, un instrument. Ce qu'on possede et qui
     vaut, sans etre un placement financier.

     Une classe a part, et non un rangement dans « Placements non cotes » : celle-ci
     veut dire parts de societe et financement participatif, du financier avec un
     emetteur en face. Une montre n'a pas d'emetteur. Les melanger ferait dire deux
     choses a une seule classe, et c'est le defaut que ce projet corrige partout
     ailleurs. */
  /*    Au singulier, comme la classe « Immobilier » : le type de compte porte le
   meme mot, et deux orthographes du meme mot sur deux onglets se lisaient
   comme deux choses.*/
  bienValeur:  'Bien de valeur',
};

/* Quatre délais, pas trois. « Bloqué » réunissait deux situations que rien ne
   rapproche : un appartement est lent — il se vend en trois à six mois, il
   s'hypothèque, il se loue — là où un PER est juridiquement fermé jusqu'à la
   retraite. Les additionner donnait à l'autonomie financière un dernier palier
   qui comptait des euros récupérables avec d'autres qui ne le sont pas, et
   c'était le chiffre le plus rassurant de la carte. */
const MOBILISABLE_LABEL = {
  immediat: 'Disponible immédiatement',
  differe:  'Disponible sous quelques jours',
  lent:     'Disponible en quelques mois',
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
  { id: 'av',      label: 'Assurance-vie',  classes: ['liquidites', 'actions', 'obligations'], defaut: 'investir', groupe: 'bourse', titres: true, dateSensible: true },
  { id: 'per',     label: 'Plan d’épargne retraite (PER)', classes: ['liquidites', 'actions', 'obligations'], defaut: 'investir', groupe: 'bourse', titres: true, dateSensible: true },
  { id: 'crypto',  label: 'Portefeuille de cryptomonnaies', classes: ['crypto'], defaut: 'investir', groupe: 'bourse', titres: true },
  /* Deux metiers que le mot « crowdfunding » melange, et qui n'ont pas les memes
     champs. On prete, ou on prend des parts.

     « Placements non cotes » : on achete une part de societe. Plateforme A, Plateforme B
     en capital, un pacte d'associes, des parts de SAS. Pas d'echeance, pas de
     taux : on sort le jour d'un rachat, d'une introduction en bourse, ou jamais.

     « Financement participatif » : on prete a un taux, avec une date de
     remboursement. Homunity, October, la promotion immobiliere. Ce sont ces
     lignes-la qui portent une echeance, un taux annonce et un etat — en cours, en
     retard, en defaut — et c'est `prete: true` qui le dit, plutot qu'une liste de
     types ecrite dans la vue. */
  { id: 'pe',      label: 'Placements non cotés', classes: ['nonCote'], defaut: 'investir', groupe: 'pe' },
  { id: 'crowdfunding', label: 'Financement participatif', classes: ['nonCote'],
    defaut: 'investir', groupe: 'pe', prete: true },
  /* `direct` : on le detient soi-meme, le contenant EST la chose. */
  { id: 'immo',    label: 'Immobilier',     classes: ['immobilier'], defaut: 'investir',
    groupe: 'pe', direct: true },
  { id: 'scpi',    label: 'SCPI',           classes: ['immobilier'], defaut: 'investir', groupe: 'pe' },
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
     appele « Ma montre », et se demander pourquoi l'application reclame une
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

/* Les deux formulaires de compte listent la meme chose : la table moins les
   types internes, plus les types du detenteur. Une seule source, sinon le
   type cree dans une fenetre disparaissait de l'autre. */
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

/* Un bien se possede, il ne s'ouvre pas.

   La difference se lisait deja dans le parcours de creation, qui demande une
   valeur et un prix d'acquisition la ou un compte demande un solde et un usage,
   mais elle y etait ecrite en dur. La fiche, elle, annoncait « Date d'ouverture »
   pour une Rolex. Le predicat vit ici pour que la question et l'intitule ne
   puissent plus diverger. */
const estUnBien = t => !!t && !t.titres && t.groupe === 'pe';

/* Ce qu'on detient en direct : le contenant EST la chose.

   La frontiere s'est d'abord posee sur la classe, et c'etait faux : `immobilier`
   couvre a la fois un appartement et une SCPI, qui est du papier tenu par une
   societe de gestion. Deux types partagent une classe sans partager le mode de
   detention. Le drapeau `direct` vit donc sur le type, declare une fois dans
   `TYPES_COMPTE`, la ou vivent deja `sansEtab`, `prete` et `interne`. */
const estDetenuEnDirect = t => !!t && !!t.direct;
const motDateCompte = t => estUnBien(t) ? 'Date d’achat' : 'Date d’ouverture';

/* « compte » ou « bien », selon ce dont on parle.

   Le mot se derive du meme drapeau `direct` que tout le reste, pour qu'un type
   ajoute demain n'ait qu'une chose a declarer. */
const motCompte = t => estDetenuEnDirect(t) ? 'bien' : 'compte';

/* --- comment nommer le contenant ---------------------------------------
   Le niveau du dessus est un contenant, et son nom depend de ce qu'il
   contient : « banque ou courtier » ne veut rien dire pour une maison, ni
   pour une part de societe non cotee. Un seul endroit decide du mot. */
/* La question dit « rattacher », pas seulement « quel » : la liste montre ce
   qui existe déjà, et avec un seul bien enregistré « Quel bien ? » se lisait
   comme un choix de catégorie — on cherchait « appartement, maison, terrain »
   et on ne trouvait qu'une entrée. Ce n'est pas un type qu'on choisit ici,
   c'est le bien lui-même. */
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
};

/* Premiere lettre en capitale, pour un mot qui ouvre un titre ou un bouton.
   Le mot vit en minuscules dans la table, parce qu'il s'emploie surtout au
   milieu d'une phrase — « 2 biens », « plus aucun compte ». */
const majuscule = m => String(m || '').charAt(0).toUpperCase() + String(m || '').slice(1);

/* « 2 biens », « 1 compte » : le mot du contenu, accorde. Une seule fonction
   pour que le pluriel ne se recopie pas a chaque endroit qui compte. */
function motContenu(etabId, n) {
  const mot = contenantDeLEtab(etabId).contenu || 'compte';
  return `${mot}${n > 1 ? 's' : ''}`;
}

const contenantDuType = typeId =>
  (typeId === 'immo' || typeId === 'scpi') ? CONTENANTS.bien
  : (typeId === 'pe' || typeId === 'crowdfunding') ? CONTENANTS.societe
  : CONTENANTS.banque;

/* Pour une fiche : le mot suit les comptes reellement rattaches. Un
   etablissement qui n'heberge que de l'immobilier est un bien ; s'il melange,
   « banque ou courtier » redevient le terme le plus large. */
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
/* Un compte archivé garde son historique mais sort de tous les totaux. */
const comptesOuverts = () => COMPTES().filter(c => c.statut !== 'archive');

/* Le nom d'un compte, et le repli d'un bien qui n'en porte pas.

   Un bien tient dans un compte qui ne contient que lui : les deux noms sont un
   seul fait. Le parcours de creation les ecrit desormais ensemble, mais un bien
   pose avant — ou nomme depuis la fenetre de sa ligne — a un compte vide et une
   ligne nommee. La fiche affichait alors « Bien de valeur » en titre au-dessus
   d'une ligne « moto ». Le repli va donc dans les deux sens, et le libelle du
   type ne reste que si personne n'a rien nomme nulle part. */
const nomCompteV2 = c => c.libelle
  || (((c.lignes || []).length === 1 && !(c.cash || []).length
       && String(c.lignes[0].libelle || '').trim()) || '')
  || typeCompte(c.type).label;
const nomEtabDe = c => etabById(c.etabId)?.nom || '';

/* Le nom affiche d'une ligne de placement.

   Symetrique du repli ci-dessus : une ligne nommee du libelle de son type
   n'a jamais ete nommee par personne — c'est le defaut pose a la creation —
   et le nom du compte qui la porte en dit plus. « Bien de valeur » sous une
   carte « Biens de valeur » repetait le mot une troisieme fois. Un nom
   vraiment saisi n'est jamais ecrase : seul le libelle du type declenche le
   repli. Ici, et pas dans chacune des trois vues qui affichent une ligne. */
const nomLignePlacement = (l, compte) =>
  String(l.libelle || '').trim() === typeCompte(compte.type).label
    ? nomCompteV2(compte) : l.libelle;

/* L'etablissement d'un compte s'affiche partout ou son nom s'affiche, sur sa
   propre ligne, et sans condition.

   Un compte porte exactement un etabId : l'information existe toujours, il
   n'y a donc jamais a se demander si la ligne sera vide. La seule exception est
   les especes, qui n'ont pas de contenant du tout — sansEtab.

   C'est le champ « broker », deja porte par la projection des
   comptes. Pas de second champ pour le meme fait. */

/* Catégorie de marché → classe d'actif. */
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
  /* Une fonciere, un REIT, un ETF immobilier : cote, vendable en seance, mais
     dont le risque est l'immobilier et non les actions. Tout cela tombait dans
     « Actions », et 20 % de foncieres se lisaient comme 20 % d'actions de plus.
     La classe n'a rien a voir avec la ligne « Immobilier » de l'accueil, qui
     porte des biens en direct : celle-la se vend en quelques mois, celle-ci en
     une seance. Meme sous-jacent, deux liquidites. */
  immobilierCote: trad('Immobilier coté'),
  /* Une ligne qui contient plusieurs classes a la fois : un fonds patrimonial
     d'assurance-vie, un ETF 60/40, un fonds a horizon. Il fallait la classer en
     actions ou en obligations, les deux fausses. Le declarer multi-actifs est
     plus honnete que de trancher au hasard : l'application ne sait pas ce qu'il
     y a dedans, et elle ne pretend pas le savoir.

     Le libelle a d'abord ete « Fonds diversifie », et c'etait une faute du meme
     genre que « Core » tout seul : « Fonds » est une valeur du champ Nature, qui
     dit l'emballage, quand la classe dit le contenu. Un ETF monde est un fonds
     de classe actions — les deux champs repondent a deux questions, et un
     libelle ne doit pas emprunter le vocabulaire de l'autre axe. */
  diversifie:     trad('Multi-actifs'),
  metaux:         trad('Métaux précieux'),
  crypto:         'Crypto',
  monetaire:      trad('Monétaire'),
};
/* Pas de « non coté » ici, et c'est volontaire.
   `assetClass` qualifie une ligne de marché — une ligne cotée, par
   construction. Lui proposer « non coté » était une contradiction dans les
   termes, et cela dédoublait un suivi qui existe déjà ailleurs : les parts non
   cotées sont des lignes de compte, sur des comptes de private equity, et
   apparaissent dans Allocation et dans la répartition de la vue d'ensemble.
   Une ligne qui porterait encore cette valeur retombe sur « actions » par la
   lecture tolérante d'assetClassDe(). */
/* « or » était le nom retenu au départ ; « metaux » couvre aussi l'argent et
   le platine, qui se détiennent de la même façon. L'ancien nom reste accepté
   en lecture : un état à moitié converti, ou une sauvegarde restaurée, ne
   doit pas perdre ses lignes. */
const CLASSES_ALIAS = { or: 'metaux' };
const ROLES = { core: 'Core', satellite: 'Satellite' };
const ROLE_DEFAUT = 'satellite';

const SCHEMA_VERSION = 2;

/* Table de conversion de l'ancien champ. Elle sert a la migration et rien
   d'autre : une fois le JSON converti, plus personne ne la lit. */
const CATEGORIE_VERS_SCHEMA = {
  'ETF Core': { assetClass: 'actions',   role: 'core' },
  'ETF':      { assetClass: 'actions',   role: 'satellite' },
  'STOCK':    { assetClass: 'actions',   role: 'satellite' },
  'GOLD':     { assetClass: 'metaux',    role: 'satellite' },
  'CRYPTO':   { assetClass: 'crypto',    role: 'satellite' },
  'CASH':     { assetClass: 'monetaire', role: 'satellite' },
  'OPTION':   { assetClass: 'actions',   role: 'satellite' },
};

/* Lecture tolerante : une ligne sans classe declaree, ou portant une valeur
   inconnue, retombe sur « actions ». Aucun calcul ne doit dependre de la
   propriete d'une migration passee. */
const assetClassDe = p => {
  const v = CLASSES_ALIAS[p.assetClass] || p.assetClass;
  return ASSET_CLASSES[v] ? v : 'actions';
};
const roleDe       = p => ROLES[p.role] ? p.role : ROLE_DEFAUT;

/* De la classe d'actif declaree vers les poches internes du patrimoine.
   L'or reste un actif de marche : il se vend en bourse comme un titre. */
const POCHE_DE_CLASSE = {
  actions:        'actions',
  obligations:    'obligations',
  /* L'immobilier cote va dans les actifs de marche et non dans la poche
     « immobilier » : celle-la est reputee lente a vendre, et y ranger un REIT
     aurait fait mentir l'autonomie financiere de tout son montant. Un fonds
     diversifie est un actif de marche pour la meme raison. */
  immobilierCote: 'actions',
  diversifie:     'actions',
  metaux:         'actions',
  crypto:         'crypto',
  monetaire:      'liquidites',
};
const pocheDeClasse = ac => POCHE_DE_CLASSE[CLASSES_ALIAS[ac] || ac] || 'actions';

/* Le chemin inverse : une ligne manuelle porte le nom d'une poche interne
   (« nonCote », « liquidites »), pas celui d'une classe d'actif. Sans cette
   table, rapprocher une detention hors perimetre de la cible qui la vise
   echouait en silence. */
const CLASSE_DE_POCHE = {
  liquidites: 'monetaire',
  actions: 'actions',
  obligations: 'obligations',
  crypto: 'crypto',
};
const classeDePoche = poche => CLASSE_DE_POCHE[poche] || null;

/* Placements d'un compte : lignes cotées (positions, valorisées au cours)
   puis lignes manuelles (non coté, immobilier). */
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
  const manuelles = (compte.lignes || []).map((l, i) =>
    ({ ...l, ref: i, valeur: num(l.valeur), prixDeRevient: num(l.prixDeRevient),
       refMobilite: `comptes.${Store.state.comptes.indexOf(compte)}.lignes.${i}.mobilite` }));
  return [...marche, ...manuelles];
}

/* La disponibilité effective d'une ligne : la règle calculée, sauf si le
   placement porte son propre réglage. La règle ne connaît que la classe et
   le type de compte — elle ignore qu'un non coté précis se revend en
   quelques jours sur son marché secondaire. Le réglage corrige ce cas
   sans affaiblir le défaut pour tous les autres. */
function mobiliteLigne(l, compte) {
  if (l.mobilite && l.mobilite !== 'auto') return l.mobilite;
  return mobilisabilite(l.classe, compte.type, compte.ouvertLe);
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

/* Le cash « à investir » d'un compte — cible des ventes et des achats. */
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
  /* Ce qu'on reconnait comme du bricolage : de l'argent liquide dont le
     contenant, ou le compte lui-meme, ne s'appelle que « especes ». Un compte
     courant chez une vraie banque n'entre pas dans ce filet. */
  const bricole = s.comptes.find(c => {
    if (typeCompte(c.type).groupe !== 'cash') return false;
    const nomE = (etabs.find(e => e.id === c.etabId) || {}).nom || '';
    return seulEspeces.test(nomE.trim()) || seulEspeces.test(String(c.libelle || '').trim());
  });

  if (bricole) {
    const ancien = bricole.etabId;
    bricole.type = 'especes';
    bricole.etabId = null;
    /* « Real Cash » et « Espèces » etaient des noms de contournement : les
       effacer laisse le libelle du type parler. Tout autre nom est un choix,
       il reste. */
    if (/^(real )?cash$/i.test(String(bricole.libelle || '').trim())
        || seulEspeces.test(String(bricole.libelle || '').trim())) bricole.libelle = '';
    /* L'etablissement invente disparait s'il ne tient plus rien : ni compte,
       ni credit. Un groupe vide a l'ecran serait le souvenir d'un detour. */
    const vide = e => !s.comptes.some(c => c.etabId === e.id)
                   && !(e.dettes || []).some(d => num(d.montant));
    const e = etabs.find(x => x.id === ancien);
    if (e && vide(e)) s.etabs = etabs.filter(x => x !== e);
  } else {
    /* A zero : ajouter de l'argent que personne n'a declare fausserait le
       patrimoine des le premier lancement. */
    const libre = s.comptes.some(c => c.id === ID_ESPECES) ? ID_ESPECES + '_' + Date.now() : ID_ESPECES;
    s.comptes.push({
      id: libre, etabId: null, type: 'especes', statut: 'ouvert',
      ouvertLe: '', numero: '', notes: '', libelle: '', court: 'Espèces',
      cash: [{ montant: 0, affectation: 'courant' }], lignes: [],
    });
  }
}

/* Comptes pouvant accueillir une ligne de cette catégorie de marché : le
   filtre passe par la classe compatible — une ligne Bitcoin ne se propose
   que sur un portefeuille de cryptomonnaies. Le compte actuel de la ligne
   reste listé même s'il est devenu incompatible : on ne casse pas une
   donnée existante en silence. */
function comptesPourCategorie(cat, compteActuel = null) {
  const classe = pocheDeClasse(cat);
  const ok = comptesOuverts().filter(c => typeCompte(c.type).classes.includes(classe));
  const actuel = compteActuel && compteById(compteActuel);
  if (actuel && !ok.includes(actuel)) ok.push(actuel);
  return ok;
}

/* Les entrées « à investir », avec les index dont data-path a besoin. */
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

/* --- mobilisabilité ----------------------------------------------------
   f(classe, type de compte, date d'ouverture) — pas la classe seule : un
   ETF dans un PEA de moins de cinq ans est coté mais bloqué, un PER porte
   des lignes liquides mais reste fermé jusqu'à la retraite. */
function ageAnnees(iso) {
  if (!iso) return Infinity;                    // sans date : pas de blocage
  return (Date.now() - new Date(iso)) / (365.25 * 24 * 3600e3);
}
function mobilisabilite(classe, typeId, ouvertLe) {
  if (typeId === 'per') return 'bloque';
  /* Un PEA de moins de cinq ans n'est pas bloqué au sens de l'autonomie :
     en cas de coup dur on casse le plan et l'argent arrive en quelques
     jours — on y perd l'avantage fiscal, pas l'accès. Seul le PER est
     réellement fermé jusqu'à la retraite. */
  /* Lent, pas fermé : on ne vend pas un studio ni une part de société non
     cotée dans la semaine, mais on les vend. Le réglage par ligne reste là
     pour le non coté qui se revend sur un marché secondaire. */
  if (classe === 'nonCote' || classe === 'immobilier') return 'lent';
  /* Un bien de valeur est lent, pas bloque : une montre se vend, en quelques
     semaines et avec decote. Le mettre en « bloque » l'aurait sorti du compte de
     mois d'autonomie, alors qu'il est mobilisable en cas de coup dur — et c'est
     precisement ce que ce palier mesure. */
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

/* --- poches et patrimoine, dérivés à la volée -------------------------- */
function poches() {
  /* Les classes se derivent de leur table, elles ne se recopient pas ici.
     La liste etait ecrite a la main : ajouter « Biens de valeur » a
     CLASSES_ACTIFS laissait ce compteur a zero, et la classe n'existait qu'a
     moitie. */
  const p = { courant: 0, precaution: 0, projet: 0, investir: 0,
              classes: Object.fromEntries(Object.keys(CLASSES_ACTIFS).map(k => [k, 0])),
              mobilisable: { immediat: 0, differe: 0, lent: 0, bloque: 0 } };
  for (const c of comptesOuverts()) {
    for (const e of (c.cash || [])) {
      const m = num(e.montant);
      p[e.affectation] = (p[e.affectation] || 0) + m;
      p.classes.liquidites += m;
      p.mobilisable[mobilisabilite('liquidites', c.type, c.ouvertLe)] += m;
    }
    for (const l of lignesDe(c)) {
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

/* La mensualite effective d'un credit : celle de la charge qui le rembourse,
   sinon celle qu'on a notee sur le credit lui-meme. */
function mensualiteCredit(d) {
  const lien = chargeDuCredit(d.id);
  return lien ? chargeMensuelle(lien.charge) : num(d.mensualite) || 0;
}

/* La charge fixe qui rembourse un credit, creee depuis la fenetre du credit.

   La question est posee dans la fenetre du credit, par une case a cocher, et non
   par une confirmation apres l'enregistrement : « il devrait meme me demander
   dans le credit ». Une fenetre, une validation. La case est cochee d'avance,
   parce que c'est le cas normal — cet argent sort vraiment — et le libelle dit ce
   qu'elle fait, donc rien ne se decide en cachette.

   Une fois la charge creee, la mensualite notee sur le credit est effacee : c'est
   la charge qui la porte desormais, et laisser les deux les laisserait diverger. */
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
  /* Sans mensualite ni taux, il n'y a rien a projeter — mais le compteur de mois
     est rendu quand meme : c'est lui qui declenche le rappel, et un solde qu'on
     n'a pas regarde depuis six mois merite d'etre releve meme quand l'application
     ne sait pas dire a combien il en est. */
  if (!mens && !taux) return { ...rien, moisDepuis: mois };
  /* Un seul calcul pour les deux sens.
     `capital + interets - mensualite` : avec une mensualite plus grosse que les
     interets, la dette descend, c'est un pret qui s'amortit. Sans mensualite, il
     ne reste que les interets et elle monte — c'est le levier d'un courtier, qui
     ne se rembourse pas par echeances et grossit tout seul. Le meme piege que le
     rappel du releve mensuel : le chiffre le plus faux est celui qu'on croit
     stable. */
  let capital = reste;
  for (let i = 0; i < mois && capital > 0; i++) {
    capital = Math.max(0, capital + capital * taux - mens);
  }
  return { moisDepuis: mois, projete: capital, ecart: reste - capital,
           sens: capital > reste ? 'monte' : capital < reste ? 'baisse' : 'stable' };
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
        /* Par quoi il se rembourse, quand une charge fixe s'en charge : la carte
           le dit, et la fenetre du credit n'offre alors plus de champ de
           mensualite — il serait le second. */
        charge: (() => {
          const lien = chargeDuCredit(d.id);
          return lien ? { index: lien.index, label: lien.charge.label || 'Charge fixe',
                          periode: chargePeriode(lien.charge) } : null;
        })(),
        rembourse: initial > 0 ? Math.max(0, initial - reste) : null,
        part: initial > 0 ? Math.min(100, Math.max(0, (initial - reste) / initial * 100)) : null,
        /* Ce que la prochaine mensualite fait vraiment, quand le taux est connu :
           les interets partent, le capital reste. C'est la seule facon honnete de
           dire « ta mensualite fait monter ton patrimoine net » — elle ne le fait
           monter que de sa part de capital, et l'ecart n'est pas un detail : sur
           96 000 EUR a 3,4 %, 272 des 620 EUR mensuels sont des interets.

           Approximation assumee, celle du premier mois : le taux annuel divise
           par douze sur le capital restant. Un tableau d'amortissement exact
           demanderait la duree, que l'application ne stocke pas, et l'ecart sur
           un mois est de quelques centimes. */
        interets: (num(d.taux) && reste) ? reste * num(d.taux) / 100 / 12 : null,
        capital: (num(d.taux) && mensualiteCredit(d))
          ? Math.max(0, mensualiteCredit(d) - reste * num(d.taux) / 100 / 12) : null,
        verifieLe: d.verifieLe || null,
        ...projectionCredit(d),
      });
    });
  }
  lignes.sort((a, b) => b.reste - a.reste);
  return {
    lignes,
    reste: dettesTotal(),
    /* Ce que les credits prelevent chaque mois, quand la mensualite est
       renseignee. Lecture seule : ces mensualites sont deja des charges fixes
       du budget, et les additionner ici au budget les compterait deux fois. */
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

/* --- répartition par classe d'actif -------------------------------------
   Un seul axe : la classe. Chaque euro y figure une fois, la somme fait
   exactement le patrimoine brut — c'est ce qui permet d'afficher des parts
   qui totalisent 100 %. Ajouter une classe au patrimoine (immobilier,
   crypto) fait apparaître sa tuile sans toucher au composant. */
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
function repartitionClasses() {
  const p = patrimoine();
  return Object.entries(CLASSES_ACTIFS)
    .map(([classe, label]) => ({ classe, label,
      couleur: CLASSE_COULEURS[classe],
      value: p.classes[classe] || 0,
      pct: p.brut ? (p.classes[classe] || 0) / p.brut * 100 : 0 }))
    .filter(x => x.value > 0.005);
}

/* --- projection vers l'ancienne forme ----------------------------------
   L'historique mensuel, l'allocation et les exports lisent encore un
   tableau plat de comptes. On le reconstruit depuis le modèle : chaque
   compte devient une entrée, et les anciens identifiants absorbés par la
   migration restent en pierres tombales — invisibles partout, mais les
   relevés passés qui portent leurs colonnes gardent leur sens. */
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
      const gAff = t.classes.includes('immobilier') ? 'immo'
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

/* Le type porte la poche : c'est elle qui pilote tous les calculs. */
function accountTypes() { return Store.state.accountTypes; }
function accountType(id) {
  return accountTypes().find(t => t.id === id)
      || { id, label: id || 'Autre', group: 'bourse' };
}

/* --- rôle d'un compte dans les calculs --------------------------------
   Trois rôles suffisent à décrire ce qu'un compte représente :

     holdings: true   il porte des lignes de titres
     role: 'cash'     il porte du cash en attente d'investissement
     role: 'margin'   il porte une dette de levier (montant négatif)
     (aucun)          il vaut simplement le montant saisi

   Sans ces rôles, chaque calcul devait nommer les comptes un par un —
   ce qui ne pouvait fonctionner que pour un seul utilisateur. */
function accountsWhere(pred) { return ACCOUNTS.filter(a => !a.legacy && pred(a)); }
function brokerCashAccounts() { return accountsWhere(a => a.role === 'cash'); }
function marginAccounts() { return accountsWhere(a => a.role === 'margin'); }
function sumNow(comptes) { return comptes.reduce((s, a) => s + nowValue(a.id), 0); }

/* Ancien monde : le cash d'un compte titres vivait dans un pseudo-compte
   voisin, qu'il fallait recoller ici. Le modèle porte désormais le cash sur
   le compte lui-même — nowValue() l'inclut, il n'y a plus rien à recoller. */
function cashOf() { return 0; }

/* Libellé dans l'allocation par actif. Il appartient au compte : c'est lui
   qui décide comment il s'appelle, jamais son type. */
function allocLabel(a) { return a.alloc || a.label; }

/* Compte proposé par défaut pour une nouvelle ligne de titres. */
function defaultHoldingAccount() {
  return (accountsWhere(a => a.holdings)[0] || ACCOUNTS[0] || {}).id || '';
}

/* ---------- utilitaires ---------- */
const num = v => (v === '' || v === null || v === undefined || isNaN(v)) ? 0 : Number(v);
const round2 = v => Math.round(v * 100) / 100;
const round4 = v => Math.round(v * 10000) / 10000;

/* --- mode discret ---
   Un train, un open space, quelqu'un qui passe derrière l'écran : on veut
   pouvoir consulter l'app sans afficher son patrimoine. Le masque agit au
   formatage, donc il couvre tout d'un coup — cartes, tableaux, axes de
   graphiques, infobulles — sans avoir à marquer chaque montant.

   Les pourcentages restent lisibles : ils disent la performance sans rien
   révéler du capital. Les exports, eux, travaillent sur les nombres bruts
   et ne passent pas par ici : masquer l'écran ne mutile pas un fichier. */
const MASK_KEY = 'wealth-dashboard:discret';
let montantsMasques = (() => {
  try { return localStorage.getItem(MASK_KEY) === '1'; } catch (e) { return false; }
})();

function setMasque(on) {
  montantsMasques = !!on;
  try { localStorage.setItem(MASK_KEY, on ? '1' : '0'); } catch (e) {}
}
const masqueActif = () => montantsMasques;

/* Un œil barre remplace les chiffres, le symbole reste : on voit qu'il y a
   un montant, et dans quelle devise, sans le lire. C'est le dessin exact du
   bouton qui declenche le masque, dans son etat ferme — contour et barre,
   sans pupille : la trace laissee sur l'ecran est la meme forme que la
   commande qui l'a laissee. */
const SIGNES = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥' };
const symboleDevise = devise => SIGNES[devise || 'EUR']
  || String(devise ?? '').replace(/[&<>"']/g, '');
const OEIL_MASQUE = '<svg class="oeil-masque" viewBox="0 0 24 24" role="img"'
  + ' aria-label="montant masqué">'
  + '<path d="M1.9 12S5.9 5.6 12 5.6 22.1 12 22.1 12 18.1 18.4 12 18.4 1.9 12 1.9 12Z"/>'
  + '<line x1="4.5" y1="19.5" x2="19.5" y2="4.5"/></svg>';
const masque = devise => `${OEIL_MASQUE} ${symboleDevise(devise)}`;

/* Le meme masque en texte pur. Dans un <text> SVG, etiquettes d'axe,
   valeurs posees sur les barres, une balise ne s'affiche pas : elle
   s'imprimerait telle quelle. Les points y restent. */
const masqueTexte = devise => '••• ' + symboleDevise(devise);

const fmtEUR = (v, dec = 2) => montantsMasques ? masque('EUR')
  : new Intl.NumberFormat(locale(), {
      style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec,
    }).format(num(v));

const fmtEUR0 = v => fmtEUR(v, 0);

/* Un nombre de mois suit les separateurs de la langue. `toFixed(1)` ecrivait
   « 0.8 mois » au milieu d'une interface qui met des virgules partout. */
const fmtMois = v => new Intl.NumberFormat(locale(),
  { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(num(v));
const fmtEUR0Texte = v => montantsMasques ? masqueTexte('EUR') : fmtEUR0(v);

/* Un prix unitaire est libellé dans la devise de cotation, pas en euros.
   L'afficher avec un « € » revient à mentir sur le montant. */
const fmtCur = (v, devise = 'EUR', dec = 2) => montantsMasques ? masque(devise)
  : new Intl.NumberFormat(locale(), {
      style: 'currency', currency: devise || 'EUR',
      minimumFractionDigits: dec, maximumFractionDigits: dec,
    }).format(num(v));

/* Le prix dans sa devise, suivi de sa contre-valeur si ce n'est pas l'euro. */
function fmtCurEur(v, devise, taux) {
  if (!devise || devise === 'EUR') return fmtEUR(v);
  return `${fmtCur(v, devise)} <span class="muted">≈ ${fmtEUR(num(v) * (num(taux) || 1))}</span>`;
}

/* L'espace devant le signe est une regle typographique francaise. L'anglais
   le colle au nombre : « 12.50% ». */
const fmtPct = (v, dec = 2) => new Intl.NumberFormat(locale(), {
  minimumFractionDigits: dec, maximumFractionDigits: dec,
}).format(num(v)) + (enAnglais() ? '%' : ' %');

/* Un nombre sans unite, aux separateurs de la langue : « 1 250 » en francais,
   « 1,250 » en anglais, jamais « 1250 ». Les decimales ne s'affichent que si
   elles existent, une surface de 42 m2 ne s'ecrivant pas « 42,00 ». */
const fmtNombre = v => num(v).toLocaleString(locale(), { maximumFractionDigits: 2 });
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

/* Aucune date numerique en anglais : « 03/04/2026 » se lit 3 avril a Londres
   et 4 mars a New York. Le mois en lettres retire la question, et le lecteur
   n'a pas a savoir quelle variante d'anglais il regarde. */
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (enAnglais()) return `${Number(d)} ${moisCourts()[Number(m) - 1]} ${y}`;
  return `${d}/${m}/${y}`;
}
/* « 11 août » : la date d'un rappel repoussé, dite comme on la dit a voix
   haute. L'annee n'apporte rien a sept jours d'ici. */
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

/* La clé de contrôle attendue pour un ISIN, calculée sur ses onze premiers
   caractères — Luhn sur la chaîne lettres-converties. Elle était calculée ici
   pour être aussitôt jetée, alors qu'elle est la réponse à la seule question
   qu'on se pose devant un code refusé : lequel fallait-il écrire ?

   Rend null quand le corps n'a pas la forme attendue : il n'y a alors pas de
   clé à proposer, et rendre un chiffre laisserait croire à une correction. */
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

/* L'ISIN corrigé : le corps tel qu'il est, suivi de la clé qu'il réclame. Le
   douzième caractère d'un ISIN est toujours un chiffre — un « D » y est
   impossible par construction — donc une saisie fautive se répare sans rien
   deviner. Rend null s'il n'y a rien à réparer, ou rien de réparable. */
function isinCorrige(code) {
  const brut = String(code || '').trim().toUpperCase();
  const cle = cleIsin(brut);
  if (!cle) return null;
  const attendu = brut.slice(0, 11) + cle;
  return attendu === brut ? null : attendu;
}

/* Valide la clé de contrôle d'un ISIN.
   Sert à repérer une faute de frappe avant même d'interroger le réseau. */
function isinIsValid(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(c)) return false;
  return cleIsin(c) === c[11];
}

/* Convertit un ticker « place:code » (style Google Finance) en symbole Yahoo.
   Ce qui n'est pas reconnu est laissé tel quel : à corriger dans l'app. */
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

/* ---------- état ---------- */
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

    /* Le rendement des « autres actifs » vaut zero par defaut, y compris pour
       un etat qui n'a jamais connu ce champ, et la fusion avec SEED.meta suffit
       a le poser.

       J'avais d'abord fait heriter ces etats de leur ancien taux unique, pour ne
       deplacer les chiffres de personne. C'etait le mauvais arbitrage : geler
       l'immobilier au motif qu'on ne sait pas le modeliser, tout en faisant
       croitre du non cote a 5 % au motif qu'on ne sait pas non plus, applique
       deux standards a la meme ignorance.

       Ce qui tranche est l'asymetrie de l'erreur. Une projection sert a decider
       combien epargner : surestimer fait epargner moins pour un chiffre qui
       n'arrivera pas, sous-estimer fait epargner plus et reserve une bonne
       surprise. Zero n'est pas « vrai », c'est l'erreur qu'on peut se
       permettre. Et la regle qui gouverne : l'application calcule, l'utilisateur
       affirme. Un defaut a 5 % sur des parts illiquides, c'est l'application qui
       parie a sa place sur la partie la moins connaissable de son patrimoine. */
    s.meta = Object.assign(structuredClone(SEED.meta), s.meta || {});
    s.targets = Object.assign(structuredClone(SEED.targets), s.targets || {});
    s.strategy = Object.assign(structuredClone(SEED.strategy), s.strategy || {});
    s.accountInfo = Object.assign(structuredClone(SEED.accountInfo), s.accountInfo || {});
    s.now = s.now || structuredClone(SEED.now);
    s.monthly = s.monthly || structuredClone(SEED.monthly);
    s.positions = s.positions || structuredClone(SEED.positions);
    s.quotes = s.quotes || { lastRun: null, fx: {}, changes: [] };
    s.sales = s.sales || [];
    /* Une place était imposée par défaut, ce qui faisait remonter des
       cotations secondaires pour des titres cotés ailleurs. On repasse en
       automatique une fois ; un choix fait après cette bascule est conservé. */
    if (!s.meta.exchangeAutoDone) {
      s.meta.preferredExchange = 'auto';
      s.meta.exchangeAutoDone = true;
    }

    /* Trois classements incohérents, corrigés une fois :
       - le cash d'un courtier appartient à la poche bourse, comme ses jumeaux ;
       - une dette de levier n'est pas une enveloppe fiscale, elle a son type ;
       - un compte-titres plein d'ETF cotés est liquide, la contrainte d'un PEA
         est fiscale, pas une immobilisation.
       Un réglage fait après cette bascule est conservé. */
    /* « Part PK » codait un seul conjoint dans le nom du champ. Les parts
       deviennent une liste de contributeurs, montant par montant. */
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

    /* « Compléments alimentaires » devient « Autres dépenses » : chaque
       ligne porte un montant et sa periodicite, au lieu d'un cout annuel et
       de deux champs de repere libres. Les reperes migrent dans la note. */
    for (const r of (s.budget?.supplements || [])) {
      if (r.amount !== undefined || r.annual === undefined) continue;
      r.amount = num(r.annual);
      r.period = 'an';
      r.note = [r.perDay, r.perYear].filter(Boolean).join(' · ');
      delete r.annual; delete r.perDay; delete r.perYear;
    }

    s.budget = Object.assign(structuredClone(SEED.budget), s.budget || {});
    // les catégories etaient figees dans le code : on les fait entrer dans l'etat
    if (!Array.isArray(s.budget.categories) || !s.budget.categories.length) {
      s.budget.categories = [...EXPENSE_CATEGORIES];
    }
    /* Répare les calendriers : un mois supprimé autrefois revient à sa place,
       vide. Doit passer après la normalisation de s.budget. */
    ensureCalendarMonths(s.monthly, 'date', 'comment');
    ensureCalendarMonths(s.budget.expenses, 'month', 'note');
    s.accountTypes = s.accountTypes || structuredClone(SEED.accountTypes);
    s.accounts = s.accounts || structuredClone(SEED.accounts);
    s.typesPerso = s.typesPerso || [];

    /* Des types d'enveloppe pour tout ce qu'un patrimoine francais peut
       porter, meme sans compte dessus aujourd'hui : la vue Avoirs ne montre
       que les types utilises, mais le formulaire d'ajout doit tout offrir.
       Une seule fois, pour que supprimer un type reste possible. */
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
    /* Les rôles et libellés d'allocation datent d'après les premiers états
       enregistrés : on les reprend du seed, une fois, par identifiant. Les
       calculs, eux, ne nomment plus jamais un compte. */
    const parDefaut = Object.fromEntries(SEED_ACCOUNTS.map(a => [a.id, a]));
    for (const a of s.accounts) {
      if (!a.type) a.type = accountTypes().find(t => t.group === a.group)?.id || 'banque';
      if (a.role === undefined) a.role = parDefaut[a.id]?.role || '';
      if (a.alloc === undefined && parDefaut[a.id]?.alloc) a.alloc = parDefaut[a.id].alloc;
    }
    refreshAccounts();

    // ancien champ « ticker » → symbole de cotation Yahoo
    for (const p of s.positions) {
      if (p.symbol === undefined) p.symbol = guessSymbol(p.ticker);
      if (p.currency === undefined) p.currency = (num(p.fx) && num(p.fx) !== 1) ? 'USD' : 'EUR';
      if (p.isin === undefined) p.isin = '';
      /* Fige le PRU au taux d'achat — mais jamais a 1 sur une ligne en devise :
         ce 1 est la valeur par defaut de la creation, pas un taux, et il faisait
         compter des dollars comme des euros. Remis a vide, il sera figé au premier
         taux connu ; d'ici la, `tauxAchat()` prend le taux courant. Idempotent :
         rejouer la migration sur un etat deja repare ne change rien. */
      if (p.fxBuy === undefined) p.fxBuy = num(p.fx) || null;
      if ((p.currency || 'EUR') !== 'EUR' && num(p.fxBuy) === 1) p.fxBuy = null;
    }

    this.migrerModele(s);
    poserEspeces(s);
    this.migrerClassesActifs(s);
    /* Appelee a part : migrerClassesActifs() sort tout de suite quand le
       schema est deja a jour, et les cibles seraient restees a l'ancien
       format sur un etat converti par une version precedente. Elle porte sa
       propre garde. */
    this.migrerCibles(s);
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
          /* Un choix deja pose l'emporte : rejouer la migration ne doit pas
             defaire une correction faite a la main entre-temps. */
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
    /* Les ventes archivees gardent une trace de la ligne vendue : le meme
       champ y traine, et le journal l'affiche. */
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

  /* Les cibles suivaient l'ancien melange : coreEtf, satellites, gold. Deux
     etages les remplacent, parce qu'ils ne repondent pas a la meme question.

     L'allocation strategique se fixe par classe, combien d'actions, combien
     d'or. Le partage socle / satellites se fixe ensuite, a l'interieur de ce
     qui est investi. C'est ainsi que se construit un portefeuille : on ne met
     pas « Core » et « Or » en concurrence, l'un est un sous-niveau de l'autre.

     Report : les 70 % de coeur et 20 % de satellites etaient tous deux des
     actions, ils donnent 90 % d'actions. Leur rapport interne ne devient pas
     une cible : le socle est un constat, pas un objectif, voir
     rebalanceRoles(). */
  migrerCibles(s) {
    const tg = s.targets || (s.targets = {});
    /* Le menage se fait dans tous les cas, pas seulement au premier passage :
       un etat converti par une version qui sortait avant ce nettoyage garde
       sinon les trois anciennes cles indefiniment. Plus personne ne les lit,
       mais elles trainent dans l'export et egarent qui relit le JSON. */
    const purge = () => {
      delete tg.coreEtf; delete tg.satellites; delete tg.gold;
      /* Les cibles de role ont existe une version : deux series de cibles sur
         le meme argent pouvaient se contredire sans que rien ne le detecte.
         Le socle est redevenu un constat. */
      delete tg.roles;
      /* « Non coté » a figuré parmi les classes de lignes de marché : une
         ligne cotée ne peut pas être non cotée, et le suivi existe déjà en
         lignes de compte. */
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

  /* --- migration vers le modèle établissement > compte > cash[] ---------
     L'ancien modèle confondait contenant, compte et poche : le cash d'un
     courtier était un compte à part entière, d'où doublons et lignes
     fantômes. Ici, une seule passe :

     - les courtiers deviennent des établissements, dédupliqués par nom ;
     - chaque compte porteur devient un Compte ; son argent devient une
       entrée cash avec une affectation (l'ancien « cash de vie » se lit
       « dépenses courantes », les livrets réglementés « épargne de
       précaution ») ;
     - les pseudo-comptes « cash courtier » fusionnent dans le compte
       titres du même établissement et du même type, en entrée « à
       investir » ;
     - le levier devient un crédit de l'établissement ;
     - les valeurs manuelles (non coté) deviennent des lignes du compte.

     Les anciens identifiants absorbés restent dans s.accounts : les
     relevés mensuels passés portent leurs colonnes. */
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

    // 1. les comptes porteurs
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
        // valeur manuelle : une ligne, à la classe du type
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

    // 2. fusion des pseudo-comptes « cash courtier » dans leur compte titres
    for (const a of s.accounts.filter(x => x.role === 'cash')) {
      const montant = num(s.now[a.id]);
      const memeEtab = etabDe(a.broker).id;
      const cible = s.comptes.find(c => c.etabId === memeEtab && c.type === a.type && c.statut === 'ouvert');
      if (cible && montant) cible.cash.push({ montant, affectation: 'investir' });
      s.now[a.id] = 0;                          // l'argent a déménagé
    }

    // 3. le levier devient un crédit de l'établissement
    for (const a of s.accounts.filter(x => x.role === 'margin')) {
      const du = -num(s.now[a.id]);
      /* `verifieLe` des la naissance : un capital restant du est le seul champ
         qui devient faux sans que personne y touche, et la cloche le reclame au
         bout de trois mois. Sans date de depart, elle le reclamait des la
         premiere ouverture — une demonstration accueillait son visiteur par un
         reproche. Le jour de la migration EST le jour ou l'on a lu ce montant. */
      if (du > 0) etabDe(a.broker).dettes.push({ id: 'd_' + a.id, libelle: a.label,
        montant: du, note: '', verifieLe: todayISO() });
      s.now[a.id] = 0;
    }

    // 4. tout compte titres ouvert propose une entrée « à investir »,
    //    même vide : c'est là que les ventes déposent et que les achats puisent
    for (const c of s.comptes) {
      if (typeCompte(c.type).titres && c.statut === 'ouvert') cashInvestirEntree(c, true);
    }
  },

  /* --- pile d'annulation ---------------------------------------
     On empile l'état précédent, au plus une fois par seconde : une
     rafale de frappes dans un champ compte pour une seule annulation. */
  _undo: [],
  _prev: null,
  _lastPush: 0,

  save() {
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
    /* Jamais de synchronisation en demonstration : les chiffres fictifs
       ecraseraient le patrimoine reel stocke en ligne. C'est la seule ligne
       qui separe une demo inoffensive d'une perte de donnees. */
    if (typeof CloudSync !== 'undefined' && !modeDemo()) CloudSync.schedulePush();
  },

  canUndo() { return this._undo.length > 0; },

  /* Combien de gestes la pile porte. Un bouton « Annuler » qui ne dit pas s'il
     reste quelque chose a annuler laisse tenter le clic pour savoir, et cette
     pile-la vit en memoire : elle est vide au chargement de la page, donc le
     compteur est aussi le seul moyen de comprendre pourquoi le bouton dort. */
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

  /* --- sauvegardes horodatées ---------------------------------- */
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
      // quota atteint : on retente avec moins d'historique
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, 2))); return true; }
      catch (e2) { console.warn('Sauvegarde auto impossible', e2); return false; }
    }
  },

  /* Une sauvegarde par jour au premier chargement : si une saisie tourne mal,
     la version de la veille est toujours là. */
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

/* =============================================================
   CALCULS
   ============================================================= */

/* --- une position --- */
function posValue(p) {
  return p.manual ? num(p.value) : num(p.qty) * num(p.price) * num(p.fx || 1);
}
/* Le taux auquel convertir le prix de revient d'une ligne.

   Il se fige au jour de l'achat (`fxBuy`) : sans ça, le montant investi bougerait
   a chaque variation de l'EUR/USD, et la plus-value latente d'une ligne qu'on n'a
   pas touchee changerait toute seule.

   D'ou la garde : sur une ligne dont la devise n'est pas l'euro, un `fxBuy` absent
   ou egal a 1 n'est pas retenu, et c'est le taux courant qui sert. Approximation
   assumee — elle vaut la variation du change depuis l'achat, quelques pour cent,
   la ou le 1 valait quinze. La migration remet ces `fxBuy` a vide et la
   recuperation des cours les fige au premier taux connu.

   Une ligne en euros vaut 1 sans discussion : c'est sa devise qui le dit, pas un
   champ qu'il faudrait tenir a jour. */
function tauxAchat(p) {
  if ((p.currency || 'EUR') === 'EUR') return 1;
  const courant = num(p.fx) || 1;
  const fige = num(p.fxBuy);
  return (!fige || fige === 1) ? courant : fige;
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

/* --- performance du jour -----------------------------------------------
   Écart entre le cours actuel et la clôture de la veille. Le taux de change
   du jour sert aux deux bornes : on isole ainsi le mouvement du titre, sans
   y mêler celui de la devise, qu'on ne connaît pas pour hier. */
/* Le cours retenu date-t-il d'aujourd'hui ?

   `quoteTime` est l'heure de la derniere transaction reguliere, telle que la
   place la publie. Comparee au jour local, elle dit si une seance a eu lieu
   depuis minuit — ce qui est faux tous les matins avant l'ouverture, et tout le
   week-end.

   Sans cette heure, on ne peut rien affirmer : Stooq ne la donne pas. On garde
   alors l'ecart, faute de pouvoir prouver qu'il est perime. */
/* Ce cours a-t-il ete echange aujourd'hui ?

   Avec l'heure, la question est tranchee. Sans elle, il faut choisir un defaut,
   et les deux se defendent — c'est pourquoi la regle a trois branches et non
   deux.

   Repondre « non » par principe silencerait Stooq, qui ne publie jamais l'heure :
   ses lignes afficheraient un ecart nul a vie, ce qui est faux tous les jours de
   seance. Repondre « oui » par principe fait attribuer au jour l'ecart de la
   derniere seance des qu'une source muette repond un dimanche.

   On tranche donc sur ce que l'on sait par ailleurs, et seulement quand on le
   sait : une place declaree fermee suffit a dire que ce cours n'est pas
   d'aujourd'hui. Sans heure et sans etat de place, on ne sait rien, et on garde
   l'ecart plutot que d'effacer un chiffre juste. */
function coteAujourdhui(p) {
  const t = num(p.quoteTime);
  if (t) return isoLocal(new Date(t * 1000)) === todayISO();
  const etat = marketStatus(p);
  return etat ? etat.cle !== 'close' : true;
}

/* Cette ligne a-t-elle ete achetee aujourd'hui ?
   La date d'achat est declaree, jamais deduite : une ligne creee ce matin peut
   porter un titre detenu depuis trois ans, c'est le cas de toute mise en route
   de l'application. Sans date, on ne sait pas, et on s'en tient a la veille. */
function acheteAujourdhui(p) {
  return !!p?.dateAchat && p.dateAchat === todayISO() && posInvested(p) > 0;
}

function posDayChange(p) {
  const prev = num(p.prevClose);
  if (p.manual || !num(p.price)) return null;

  /*     La reference devient donc le prix paye, et l'effet du jour vaut exactement
     la plus-value latente : tout ce qui est arrive a cette ligne est arrive
     aujourd'hui. C'est le seul cas ou le taux d'achat sert de borne — ailleurs
     les deux bornes prennent le taux du jour, faute de connaitre celui d'hier,
     alors qu'ici le taux d'achat est d'aujourd'hui lui aussi. Le change compte
     donc, et les deux lignes de la fiche ne peuvent plus se contredire. */
  if (acheteAujourdhui(p)) {
    return { pct: posPerfPct(p), eur: posPerfEur(p), prev: prev || null,
             price: num(p.price), depuisAchat: true };
  }

  if (!prev) return null;
  const fx = num(p.fx) || 1, q = num(p.qty);
  /* Aucune seance depuis minuit : l'ecart du jour est nul, et ce n'est pas une
     approximation — c'est la reponse exacte a « depuis la cloture d'hier ». Le
     cours n'a pas bouge depuis, puisqu'il n'a pas ete echange.

     Sans cette borne, l'ecran affichait le mouvement de la derniere seance comme
     s'il etait celui du jour : le matin, « Aujourd'hui +409 EUR » racontait la
     veille, et l'ecart doublait quand la cloture retenue datait de l'avant-veille.
     Le meme chiffre restait affiche toute la nuit et tout le week-end. */
  if (!coteAujourdhui(p)) return { pct: 0, eur: 0, prev, price: num(p.price), horsSeance: true };
  return {
    pct: (num(p.price) / prev - 1) * 100,
    eur: (num(p.price) - prev) * q * fx,
    prev, price: num(p.price),
  };
}

/* État de la place pour une ligne. Yahoo l'annonce parfois lui-même ; sinon
   on le déduit des horaires de séance qu'il joint au cours. Sans rien de
   tout ça, on préfère se taire plutôt que d'affirmer « fermé » à tort. */
const MARKET_STATES = {
  REGULAR:    { cle: 'open',  label: 'ouvert' },
  PRE:        { cle: 'pre',   label: 'pré-ouverture' },
  PREPRE:     { cle: 'pre',   label: 'avant pré-ouverture' },
  POST:       { cle: 'post',  label: 'après clôture' },
  POSTPOST:   { cle: 'close', label: 'fermé' },
  CLOSED:     { cle: 'close', label: 'fermé' },
};

/* Au-delà de cette ancienneté, un cours n'est plus celui d'un marché qui cote.
   Trente minutes laissent passer un titre peu échangé sans le déclarer fermé,
   et écartent sans hésiter une clôture qui date de la veille. */
const COURS_FRAIS_S = 30 * 60;

function marketStatus(p) {
  const direct = MARKET_STATES[String(p.marketState || '').toUpperCase()];
  if (direct) return direct;

  const s = p.session;
  if (!s) return null;
  const t = Math.floor(Date.now() / 1000);
  const dans = b => Array.isArray(b) && b[0] != null && t >= b[0] && t < b[1];

  /* Pour ce qui cote en continu — futures, devises, cryptomonnaies — Yahoo ne
     publie pas une séance mais une journée calendaire : l'or annonçait
     « 06:00 → 05:59 », vingt-quatre heures qui englobent forcément l'instant
     présent. La fenêtre ne dit alors rien, et s'y fier affichait l'or ouvert
     un dimanche soir, alors que son dernier cours datait de quarante-six
     heures. C'est l'horodatage qui tranche : un marché qui cote imprime des
     prix, un marché fermé n'en imprime plus. */
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

/* --- fiche d'identité d'une ligne -------------------------------------
   Yahoo protège désormais l'endpoint qui porte l'émetteur et les frais
   (401). Mais le nom officiel du fonds le contient presque toujours —
   « HANetf ICAV - Future of Defence UCITS ETF », et le préfixe de l'ISIN
   donne le pays d'émission, ce qui décide de l'éligibilité au PEA. Ces deux
   informations sont donc déduites, et présentées comme telles. */
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

/* Où se situe le cours dans son année : 0 % au plus bas, 100 % au plus haut. */
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

/* Performance du jour ligne par ligne, plus le total. */
function dayPerformance() {
  const lignes = [];
  let eur = 0, base = 0, sansDonnee = 0;
  for (const p of Store.state.positions) {
    const d = posDayChange(p);
    if (!d) { sansDonnee++; continue; }
    eur += d.eur;
    base += posValue(p) - d.eur;          // valeur d'hier, au change du jour
    lignes.push({
      /* L'indice de la position, pas seulement son nom : l'ecran retrouvait la
         ligne par son nom avec .find(), et deux titres homonymes sur deux
         comptes se voyaient attribuer le poids et la fiche du premier. Le nom
         est un libelle, jamais une identite. */
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
  return {
    lignes, eur, sansDonnee, horsSeance,
    pct: base ? eur / base * 100 : 0,
    hausse: lignes.filter(l => l.eur > 0).length,
    baisse: lignes.filter(l => l.eur < 0).length,
    /* Vrai quand rien de ce qui est liste n'a cote depuis minuit : le total est
       alors nul par construction, et l'afficher comme un montant ferait croire
       a une journee sans mouvement. */
    toutHorsSeance: lignes.length > 0 && horsSeance === lignes.length,
    asOfMarche: coursAsOf(),                      // de quand datent les prix
    asOf: Store.state.quotes?.lastRun || null,    // de quand date la requete
  };
}

/* --- valeur d'un compte titres = somme de ses positions --- */
function holdingsOf(accountId) {
  return Store.state.positions.filter(p => p.account === accountId);
}
function holdingsValue(accountId) {
  return holdingsOf(accountId).reduce((s, p) => s + posValue(p), 0);
}

/* --- photo actuelle : montant par compte ---
   La valeur d'un compte du modèle = ses espèces + ses placements, cotés
   comme manuels. Les identifiants absorbés par la migration retombent sur
   l'ancien stockage, figé à zéro, ils ne comptent que dans les relevés
   passés. */
function nowValue(accountId) {
  const c = compteById(accountId);
  if (c) return valeurCompte(c);
  if (HOLDING_ACCOUNTS.includes(accountId)) return holdingsValue(accountId);
  return num(Store.state.now[accountId]);
}

/* Les poches sont dérivées de l'affectation du cash et de la classe des
   placements, jamais du type de compte.

   Elles ne portent plus les crédits. Les y soustraire marchait tant qu'une
   dette valait quelques centaines d'euros de levier ; un prêt immobilier de
   130 000 EUR rendait la poche « bourse » négative, et le graphique empilé
   s'effondrait sous son axe. Une dette n'appartient a aucune poche : elle se
   retranche du total, une seule fois, a la fin. */
/*   Une réserve à connaître : l'historique ne peut pas suivre. Un relevé porte
   la valeur totale d'un compte, et la poche vient du compte (`rowGroups` →
   `a.gAff`) — le cash qui dort dans un PEA y reste donc rangé en bourse, sans
   moyen de l'en extraire après coup. La courbe d'évolution montre par
   conséquent un décalage au dernier point, entre le dernier mois enregistré
   et « Auj. ». Il vaut le montant à investir, et le total ne bouge pas. */
function nowByGroup() {
  const p = patrimoine();
  /* Six poches d'ecran, une par cle — et le total ne se calcule PAS ici.

     C'est le meme defaut que patrimoine() corrige deja pour lui-meme : une
     addition ecrite a la main laisse la classe suivante dehors. Un test exige
     desormais que la somme de ces poches fasse patrimoine().brut — la poche
     oubliee de demain sera rouge le jour meme. */
  return {
    cash: p.courant + p.precaution + p.projet + p.investir,
    bourse: p.classes.actions + p.classes.obligations,
    crypto: p.classes.crypto,
    pe: p.classes.nonCote,
    immo: p.classes.immobilier,
    biens: p.classes.bienValeur,
  };
}

function nowTotals() {
  const p = patrimoine();
  const g = nowByGroup();
  /* Le brut se derive de patrimoine(), il ne se refait pas en sommant les
     poches : deux additions du meme fait finissent par diverger, et c'est
     arrive — voir la note de nowByGroup(). Les poches servent l'affichage,
     le brut est la verite, et le test verifie qu'ils s'accordent. */
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
           invested: brut - g.cash };
}

/* --- plus-value latente dans le temps ---------------------------------
   Un releve mensuel dit ce que valait le portefeuille, pas ce qu'il avait
   coute : le gain latent d'alors n'est donc pas reconstituable apres coup.
   Depuis que la prise de photo enregistre aussi le prix de revient (`inv`),
   la courbe se construit, un point par mois ou l'information existe.

   Les mois anterieurs a ce changement n'en ont pas, et sont ecartes plutot
   que completes avec le prix de revient d'aujourd'hui, qui inventerait des
   gains la ou il n'y avait que des versements. */
function latentSeries() {
  return Store.state.monthly
    .filter(r => num(r.inv) > 0 && rowGroups(r).bourse > 0)
    .map(r => ({
      date: r.date,
      label: fmtMonth(r.date),
      value: rowGroups(r).bourse - num(r.inv),
      invested: num(r.inv),
      market: rowGroups(r).bourse,
    }));
}

/* --- une ligne d'historique --- */
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
function rowIsEmpty(row) {
  return Object.values(row.v || {}).every(x => !num(x));
}

/* Un releve porte sur un mois qui a eu lieu.

   Le jour se passe en argument pour qu'un test n'ait pas a dependre de
   l'horloge : c'est la seule facon de verifier les deux cotes de la frontiere. */
const moisRevolu = (date, aujourdhui = todayISO()) =>
  String(date || '').slice(0, 7) <= String(aujourdhui).slice(0, 7);

/* Années présentes dans le relevé, de la plus ancienne à la plus récente */
function historyYears() {
  return [...new Set(Store.state.monthly.map(r => r.date.slice(0, 4)))].sort();
}

/* Restreint une série à une fenêtre temporelle.
   'ytd' = depuis le 1er janvier · '1y'/'3y'/'5y' = glissant · 'all' = tout */
/* L'echelle des plages : fixe, et c'est tout l'interet.

   Elle etait calculee depuis la profondeur de l'historique, dans une liste
   [2, 3, 5, 10, 15, 20] bornee a l'anciennete des relevés, et les durees
   basculaient entre pastilles et liste deroulante selon leur nombre. Deux
   consequences : on voyait « 2 ans », qui n'est un cran nulle part, et le
   contrôle changeait de forme a mesure que les donnees vieillissaient. Un
   bouton qui se deplace tout seul au bout de trois ans d'usage ne devient
   jamais un geste automatique.

   Les crans retenus suivent Yahoo (YTD, 1 an, 5 ans, Max) avec un cran a
   3 ans, utile quand on demarre : cinq boutons, 250 px des 311 disponibles a
   375 px. Pas de 10 ans : au-dela de cinq ans « Tout » repond deja, et le
   sixieme bouton ne laissait que 3 px de marge. */
const HISTORY_RANGES = [
  { id: 'ytd', label: 'YTD' },
  { id: '1y',  label: trad('1 an') },
  { id: '3y',  label: trad('3 ans') },
  { id: '5y',  label: trad('5 ans') },
  { id: 'all', label: trad('Tout') },
];

/* Libellé lisible d'une plage. Les identifiants ne vivent qu'en memoire, mais
   un « 15y » d'une session precedente ou d'un signet ne doit pas afficher
   « undefined » : on retombe sur la forme generique, puis sur « Tout ». */
function rangeLabel(id) {
  const fixe = HISTORY_RANGES.find(r => r.id === id);
  if (fixe) return fixe.label;
  if (id === 'ytd') return 'YTD';
  const m = String(id || '').match(/^(\d+)y$/);
  return m ? (m[1] === '1' ? trad('1 an') : `${m[1]} ${trad('ans')}`) : trad('Tout');
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
  // une seule donnée ne fait pas une courbe : on élargit plutôt que d'afficher un point
  return gardes.length >= 2 ? gardes : points.slice(-2);
}

/* --- série historique + point "aujourd'hui" --- */
function historySeries({ includeNow = true } = {}) {
  const pts = Store.state.monthly
    .filter(r => !rowIsEmpty(r))
    /* `dettes` : le capital restant dû du mois, tel que la photo l'a noté.
       Sans lui, la courbe nette ne pouvait déduire les crédits que du dernier
       point — le patrimoine net semblait plat pendant des années puis
       chutait d'un coup au bout. */
    .map(r => ({ label: fmtMonth(r.date), date: r.date, ...rowGroups(r),
                 total: rowTotal(r), dettes: num(r.dettes), comment: r.comment }));
  if (includeNow) {
    const t = nowTotals();
    /* `total` doit egaler la somme des trois poches, comme pour un releve
       passe : la courbe suit la valeur des avoirs, les credits se lisent
       dans le patrimoine net du bandeau. */
    pts.push({ label: "Auj.", date: todayISO(), cash: t.cash, bourse: t.bourse,
               crypto: t.crypto, pe: t.pe, immo: t.immo, biens: t.biens,
               total: t.brut, comment: 'Photo actuelle' });
  }
  return pts;
}

/* Clé du mois en cours, au format des lignes du relevé */
function currentMonthKey() {
  return todayISO().slice(0, 7) + '-01';
}

/* Le mois en cours a-t-il déjà sa photo ? Sert aux rappels. */
/* --- le calendrier des 12 mois -----------------------------------------
   Un relevé mensuel est un calendrier, pas une liste : les douze mois de
   chaque année doivent rester visibles même vides, sinon vider un mois le
   fait disparaître du tableau et laisse un trou entre juillet et septembre.
   Les lignes hors calendrier (une clôture au 31/12, par exemple) restent
   des lignes ordinaires, ajoutables et supprimables. */
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

/* Vider une ligne de calendrier plutôt que la retirer. */
function clearMonthRow(row, champTexte) {
  row.v = {};
  row[champTexte] = '';
}

/* Un rappel qu'on peut taire, pour le mois en cours seulement.
   « J'attends une rentree d'argent la semaine prochaine, ne me le demande pas
   maintenant » est une raison legitime, et une pastille qu'on ne peut pas
   eteindre finit par ne plus etre lue du tout. Le report est donc une cle de
   mois : il expire de lui-meme au mois suivant, sans qu'on ait a se souvenir
   de le lever. Aucune migration, un etat sans ce champ se comporte comme
   avant. */
/* Deux facons de faire taire un rappel, parce qu'il y a deux intentions.

   « Plus tard » veut dire « pas maintenant, mais reviens » : le releve du mois
   sera pris, seulement pas ce soir. Le rappel revient au bout de sept jours,
   sans qu'on ait a s'en souvenir.

   « Pas ce mois-ci » veut dire « n'en parle plus » : on ne prendra pas ce
   releve, ou les depenses du mois sont deja suivies ailleurs. Il se tait
   jusqu'au mois suivant, et expire de lui-meme quand la cle change.

   Les deux vivent dans le meme champ, et le report porte un prefixe. Sans lui,
   les deux formes seraient indistinguables : une cle de mois est « 2026-08-01 »,
   soit une date ISO elle aussi. Un report tombant le premier d'un mois — repousse
   le 25 juillet, sept jours plus tard on est le 1er aout — se serait alors lu
   comme un masquage du mois d'aout entier. Le rappel aurait disparu pour trente
   jours au lieu de sept, et rien ne l'aurait signale. */
const REPORT_JOURS = 7;
const PREFIXE_REPORT = 'jusquau:';

function rappelMasque(genre, key) {
  const v = String((Store.state.meta?.rappelsMasques || {})[genre] || '');
  if (!v) return false;
  if (v.startsWith(PREFIXE_REPORT)) return todayISO() < v.slice(PREFIXE_REPORT.length);
  /* Une cle de mois : le rappel dort jusqu'a ce que le mois change. Les etats
     ecrits avant le report ne portent que cette forme, ils restent valides. */
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

/* Le jour du mois où l'application réclame ses saisies.

   Un seul réglage pour les deux rappels, le relevé et les dépenses. Deux jours
   séparés se seraient contredits sans que rien ne le détecte, et personne ne
   fait ses comptes deux fois par mois.

   28 au plus : février existe. Un jour 30 ne serait jamais atteint deux mois par
   an, et le rappel se tairait sans raison lisible.

   Ce réglage déplace **quand la cloche parle**, jamais ce qu'elle compte : les
   mois restent calendaires. Un vrai mois décalé du 15 au 14 changerait toutes
   les moyennes, l'autonomie et le rythme d'accumulation ; c'est un autre
   chantier, et l'aide du champ le dit plutôt que de le laisser deviner. */
const JOUR_RAPPEL_DEFAUT = 1;
function jourRappel() {
  const j = Math.round(num(Store.state.meta?.jourRappel)) || JOUR_RAPPEL_DEFAUT;
  return Math.min(28, Math.max(1, j));
}
/* Le jour est-il venu ? Comparé au quantième d'aujourd'hui, en heure locale
   comme tout calcul de jour de ce fichier. */
function jourRappelAtteint() {
  return Number(todayISO().slice(8, 10)) >= jourRappel();
}

function currentMonthPending() {
  const key = currentMonthKey();
  const i = Store.state.monthly.findIndex(r => r.date === key);
  const row = i >= 0 ? Store.state.monthly[i] : null;
  const vide = !row || rowIsEmpty(row);
  return { key, index: i, label: fmtMonth(key), vide,
           /* `vide` reste vrai avant le jour dit : c'est un fait sur les
              donnees, et la page des releves s'en sert pour marquer la ligne.
              Seul `missing`, qui commande la cloche et les bandeaux, attend. */
           missing: vide && jourRappelAtteint() && !rappelMasque('releve', key) };
}

/*    La relance des dépenses vise le mois clos, pas le mois en cours. Elle porte
   donc sur juillet, et s'éteint dès qu'il est saisi. Le relévé de patrimoine,
   lui, reste sur le mois en cours : c'est une photo, elle se prend n'importe
   quand.*/
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
           missing: vide && jourRappelAtteint() && !rappelMasque('depenses', key) };
}

/* Les mois restés vides derrière soi, dans n'importe quelle table mensuelle.

   Ce n'est pas une saisie en retard, c'est un trou dans l'historique, et il ne
   se voit pas : chaque moyenne continue de se calculer, sur moins de points.
   Le coût de la vie, l'autonomie financière et le rythme d'accumulation sortent
   tous de ces tables.

   Deux gardes, et la seconde rend le contrôle utilisable.

   Les mois **avant le premier rempli** ne comptent pas : le calendrier ouvre
   douze mois d'avance, et sans cette garde une installation neuve annoncerait
   « onze mois vides » le jour de son premier relevé. On ne signale que les trous
   à l'intérieur de ce qu'on a commencé à tenir.

   Et le mois en cours est exclu : il a déjà son rappel, et il n'est pas en
   retard tant qu'il n'est pas fini.

   La fonction reçoit sa liste et sa façon de dire qu'une ligne est vide : les
   relevés et les dépenses vivent dans deux tables de formes différentes, et
   deux copies de ce parcours auraient fini par ne plus dire la même chose. */
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

/* --- zone et secteur ----------------------------------------------------
   Aucune source gratuite ne donne la composition d'un ETF ligne a ligne :
   savoir qu'un « MSCI World » est a 70 % americain demanderait le detail du
   fonds, que ni Yahoo ni Stooq ne publient. La zone et le secteur sont donc
   portes par la ligne elle-meme, avec une premiere valeur devinee du libelle
   — un « Nasdaq » est americain et technologique, un « MSCI World » mondial
   et diversifie. C'est un point de depart, pas une verite : chaque ligne se
   corrige depuis sa fiche, et le choix corrige l'emporte toujours. */
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
  /* Une matiere premiere n'a pas de pays : la coter a Londres ou en dollars
     n'en fait pas un actif britannique ou americain. */
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

/* Repartition des titres cotes selon une cle declaree. Le perimetre s'arrete
   aux lignes de marche : une part de non cote ou un studio n'ont ni zone
   boursiere ni secteur au sens ou on l'entend ici. */
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

/* --- allocation par actif (vue "Allocation by asset" du sheet) --- */
/* Les libelles d'allocation viennent maintenant du couple classe + role :
   « Actions · Core » et « Actions · Satellite » se distinguent sans qu'il
   faille une categorie pour chaque combinaison. */
const libelleAlloc = p => {
  const ac = assetClassDe(p);
  const cl = ASSET_CLASSES[ac];
  return ac === 'actions' ? `${cl} · ${ROLES[roleDe(p)]}` : cl;
};

function allocationByAsset() {
  /* Chaque ligne porte la couleur de sa classe. Huit barres du même bleu ne
     forment qu'un classement ; avec la teinte de la classe, on reconnaît d'un
     coup ce qui est action, métal ou liquidité — et c'est la même couleur que
     dans le camembert, la courbe et les poches. Une couleur qui ne veut dire
     qu'une chose finit par se lire sans légende. */
  const map = new Map();
  const teintes = new Map();
  const add = (label, v, couleur) => {
    map.set(label, (map.get(label) || 0) + v);
    if (couleur && !teintes.has(label)) teintes.set(label, couleur);
  };

  for (const p of Store.state.positions) {
    add(libelleAlloc(p), posValue(p), couleurClasse(assetClassDe(p)));
  }
  /* Les espèces s'agrègent par usage déclaré, le reste ligne par ligne :
     chaque placement manuel apporte son libellé, et deux lignes du même
     libellé se regroupent d'elles-mêmes. */
  /* Les quatre poches d'AFFECTATIONS, une ligne chacune, comme sur l'accueil
     et sur la carte du haut. Ce graphique agregeait courant + precaution +
     projet sous « Argent disponible » : un cinquieme montant, connu de lui
     seul, portant presque le nom d'une de ses propres parts. Le cash a une
     seule histoire, et c'est pochesLiquidites() qui la raconte.
     Bleu des liquidites pour les quatre : ici l'axe est la classe d'actif, et
     ce cash en est une. La carte du haut les peint autrement parce qu'elle
     range par disponibilite, et chaque carte porte sa propre legende. Leur
     donner l'ambre ici les ferait entrer en collision avec l'immobilier, qui
     tient deja cette teinte dans ce meme graphique. */
  for (const poche of pochesLiquidites()) {
    if (poche.value) add(poche.nom, poche.value, CLASSE_COULEURS.liquidites);
  }
  for (const c of comptesOuverts()) {
    for (const l of (c.lignes || [])) {
      add(c.alloc || l.libelle, num(l.valeur), CLASSE_COULEURS[l.classe] || CLASSE_COULEURS.nonCote);
    }
  }
  if (dettesTotal()) add('Crédits en cours', -dettesTotal(), 'var(--critical)');

  const total = nowTotals().total;
  return [...map.entries()]
    .map(([label, value]) => ({ label, value, couleur: teintes.get(label),
                                pct: total ? value / total * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/* --- allocation par compte : les placements, compte par compte ---------
   Les espèces n'y figurent pas : « investi » au dénominateur les exclut,
   les inclure au numérateur gonflait chaque part. */
function allocationByAccount() {
  const invested = nowTotals().invested;
  return comptesOuverts()
    .filter(c => typeCompte(c.type).groupe !== 'cash')
    /* La couleur suit la classe dominante du compte : un PEA d'actions se
       lit vert comme les actions ailleurs, un compte de non coté violet. Le
       compte n'est qu'un contenant, c'est ce qu'il porte qui compte. */
    .map(c => {
      const lignes = lignesDe(c);
      const parClasse = new Map();
      for (const l of lignes) parClasse.set(l.classe, (parClasse.get(l.classe) || 0) + l.valeur);
      const dominante = [...parClasse.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return { label: nomCompteV2(c), value: lignes.reduce((s, l) => s + l.valeur, 0),
               couleur: CLASSE_COULEURS[dominante] || CLASSE_COULEURS.nonCote };
    })
    .filter(r => r.value)
    .map(r => ({ ...r, pct: invested ? r.value / invested * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/* --- portefeuille boursier : total et classes d'actifs --- */
function stockTotals() {
  const somme = f => Store.state.positions.filter(f).reduce((s, p) => s + posValue(p), 0);
  const est = ac => p => assetClassDe(p) === ac;
  /* Coeur et satellites se lisent maintenant sur le role, non plus sur le
     type d'instrument : une action peut tenir le coeur d'un portefeuille, un
     ETF sectoriel n'est qu'un satellite. Les deux se limitent aux actions —
     l'or, la crypto et le non cote ont leur propre ligne de cible. */
  /* Les encours par classe ET par role, pour les cibles. « 90 % d'actions » ne
     disait pas si le prochain versement va au fonds mondial ou a une conviction,
     et c'est la seule question qui reste quand on a de l'argent a placer.

     Cette table se construit avant tout le reste, parce que tout le reste en
     descend. Les totaux etaient additionnes a la main, classe par classe :
     ajouter une classe a ASSET_CLASSES sans penser a cette ligne aurait sorti
     son encours du total sans que rien ne le dise. Ici, une classe de plus
     entre dans la somme par construction. */
  const parClasseRole = {};
  for (const cle of Object.keys(ASSET_CLASSES)) {
    parClasseRole[cle] = {
      core:      somme(p => est(cle)(p) && roleDe(p) === 'core'),
      satellite: somme(p => est(cle)(p) && roleDe(p) !== 'core'),
    };
  }
  const parClasse = Object.fromEntries(Object.entries(parClasseRole)
    .map(([cle, r]) => [cle, r.core + r.satellite]));

  /* Les alias nominatifs restent : ils nomment ce que plusieurs ecrans lisent
     deja. Ils descendent de la table, donc ils ne peuvent plus la contredire. */
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
  // le reste de la poche bourse : lignes manuelles des comptes de marche
  const autres = comptesOuverts()
    .filter(c => typeCompte(c.type).groupe === 'bourse')
    .reduce((s, c) => s + (c.lignes || []).reduce((x, l) => x + num(l.valeur), 0), 0);
  const balance    = invested + cashToInvest + autres;
  return { coreEtf, satellites, gold, cryptoPos, obligations, monetaire,
           cashToInvest, invested, balance, parClasseRole, parClasse };
}

/* Ce que le reequilibrage regarde, et ce qu'il laisse dehors.
   La base n'est pas le patrimoine : c'est ce qui vit sur un compte
   d'investissement — PEA, compte-titres, assurance-vie, PER, portefeuille de
   cryptomonnaies — avec ses lignes et sa tresorerie a investir. Le cash de
   depenses courantes, l'epargne de precaution et le non cote loge ailleurs
   n'y sont pas. La page affichait « Total portefeuille » sans le dire, et
   69 906 EUR pouvaient se lire comme un patrimoine.

   « Comptes titres » serait faux : en droit francais le compte-titres est le
   CTO, et le perimetre en contient quatre autres especes.

   La fonction sert aussi a reperer une incoherence : une classe peut recevoir
   une cible alors que ce qu'on en detient est hors perimetre. Une cible de
   non cote resterait alors introuvable, quoi qu'on achete. */
function perimetreReequilibrage() {
  const r = rebalanceRows();
  const dedans = r.base;
  const brut = patrimoine().brut;
  const dehors = [];
  for (const c of comptesOuverts()) {
    if (typeCompte(c.type).groupe === 'bourse') continue;
    for (const l of (c.lignes || [])) {
      /* L'immobilier n'a pas de classe d'actif : il ne se reequilibre pas
         contre un ETF, et il n'a donc pas a apparaitre ici. */
      const k = classeDePoche(l.classe);
      if (k && num(l.valeur)) dehors.push({ classe: k, libelle: l.libelle || nomCompteV2(c), valeur: num(l.valeur) });
    }
    for (const e of (c.cash || [])) {
      if (e.affectation !== 'investir' && num(e.montant)) {
        dehors.push({ classe: 'monetaire', libelle: nomCompteV2(c), valeur: num(e.montant) });
      }
    }
  }
  /* Les classes qui portent une cible mais dont l'encours est ailleurs :
     la cible ne pourra jamais etre atteinte dans ce perimetre. */
  const tg = Store.state.targets.classes || {};
  const horsAtteinte = [...new Set(dehors.map(d => d.classe))]
    .filter(k => cibleDeClasse(tg[k]) > 0)
    .map(k => ({ classe: k, label: ASSET_CLASSES[k] || k,
                 montant: dehors.filter(d => d.classe === k).reduce((s, d) => s + d.valeur, 0) }));
  /* Le non cote merite d'etre nomme : c'est la plus grosse part de ce qui
     reste dehors, et savoir qu'il est suivi ailleurs evite de le croire
     oublie. */
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
/* Le meme total, sous le nom qu'emploient les vues quand elles annoncent la
   cible d'une classe a l'utilisateur. */
const sommeCibleDe = cibleDeClasse;

/* La trésorerie se range dans la meme liste d'exclusions que les classes, sous
   cette cle. Elle n'est pas une classe d'actif — c'est ce qui n'est pas encore
   place — mais elle se retire du reequilibrage par le meme geste, et un seul
   endroit pour dire « hors jeu » vaut mieux que deux mecanismes paralleles. */
const CLE_TRESORERIE = 'cashToInvest';

/* Le nom d'une ligne de cible, classe ou tresorerie. Les messages qui parlaient
   d'exclusion lisaient `ASSET_CLASSES[cle]` et rendaient donc « undefined sortie
   du reequilibrage » des que la cle etait celle de la tresorerie. */
const nomDeLaCible = cle =>
  cle === CLE_TRESORERIE ? AFFECTATION_LABEL.investir : (ASSET_CLASSES[cle] || cle);

/* La somme des cibles de la page, trésorerie comprise, en un seul endroit.
   Une classe mise hors jeu ne compte pas : son encours a quitte la base, lui
   reclamer une part de 100 % n'aurait pas de sens. La tresorerie sortie non
   plus, sans quoi les cibles restantes ne pourraient jamais faire 100 %. */
function sommeCibles() {
  const tg = Store.state.targets || {};
  const horsJeu = new Set(tg.exclues || []);
  const cash = horsJeu.has(CLE_TRESORERIE) ? 0 : num(tg.cashToInvest);
  return round2(Object.entries(tg.classes || {})
    .filter(([k]) => !horsJeu.has(k))
    .reduce((s, [, v]) => s + cibleDeClasse(v), 0) + cash);
}

/* Etage 1 : l'allocation strategique, une ligne par classe d'actif.
   Une classe sans encours ni cible n'apparait pas — inutile d'afficher zero
   sur six lignes quand on n'en detient que trois. */
function rebalanceRows() {
  const t = stockTotals();
  const tg = Store.state.targets;
  /* Une classe peut etre mise hors jeu : « je ne pilote pas ma crypto par le
     reequilibrage » est une position defendable. La masquer sans plus aurait
     laisse les pourcentages ne plus totaliser 100 % sans que rien ne le dise ;
     son encours quitte donc la base, exactement comme le non cote qui vit
     ailleurs. Reversible, et annonce dans le perimetre. */
  const exclues = new Set(tg.exclues || []);
  /* Une table ecrite a la main vivait ici, une entree par classe. Elle sortait
     silencieusement du calcul toute classe ajoutee a ASSET_CLASSES et pas
     recopiee ici : son encours quittait la base, et les pourcentages ne
     totalisaient plus 100 % sans que rien ne le dise. Elle descend maintenant
     de la meme source que les lignes. */
  const encoursDe = t.parClasse;
  /* La tresorerie se retire comme une classe, par la meme liste. Quelqu'un qui
     n'en garde jamais — tout est place le jour meme — n'a pas a lire une ligne a
     zero sous un intitule de groupe. Son encours quitte la base comme celui
     d'une classe sortie, donc les pourcentages continuent de totaliser 100 %. */
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
  /* Une classe est decoupee par role si sa cible est un objet et non un nombre.
     La forme de la donnee se decrit elle-meme : aucun drapeau a maintenir a
     cote, et un etat existant, ou toutes les cibles sont des nombres, reste
     valide sans migration.

     Decoupee, la classe ne rend plus une ligne mais deux, a plat : « Core » et
     « Satellite » remplacent « Actions » dans la liste des cibles, sans ligne
     parente ni retrait. C'est la forme du tableur d'ou vient cette application,
     ou l'axe d'allocation etait deja ETF Core / Satellites / Gold. Une ligne
     parente avait ete essayee, elle chargeait la carte pour ne rien apprendre :
     la somme des cibles se lit au pied. */
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
      /* Le libelle porte la classe, pas seulement le role. « Core » seul
         promet tout le core du portefeuille alors que la ligne ne compte que
         les actions : un metal precieux passe en core resterait dans sa propre
         ligne sans jamais apparaitre ici. « Actions core » ne melange plus les
         deux axes — l'axe de la carte reste la classe, le role la subdivise. */
      const ligne = mk(`${label} ${ROLES[role].toLowerCase()}`, num(parRole[role]),
                       cibleDe(cle)?.[role], `classes.${cle}.${role}`);
      /* De quelle classe vient cette ligne : le bouton de refusion en a besoin,
         et l'infobulle nomme la classe sans son role. */
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
    /* Sortie, la tresorerie ne rend plus de ligne : la vue n'a rien a dessiner
       et l'intitule de groupe disparait avec elle. */
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
  /* Un groupe vide — un etablissement qui ne porte plus qu'une dette — n'a pas
     de classe dominante : il garde le filet neutre, ce qui est exact. */
  return dominante ? CLASSE_COULEURS[dominante] || 'var(--border-strong)'
                   : 'var(--border-strong)';
}

/* Peut-on changer un compte de type, et sinon pourquoi.

   Le type n'etait pas modifiable, et la seule issue apres une faute de frappe
   etait de supprimer puis recreer. Or les releves mensuels sont indexes par
   identifiant de compte : recreer perd tout l'historique. L'absence de ce
   reglage ne protegeait donc rien, elle poussait vers un contournement
   destructeur.

   Elle n'etait pas gratuite pour autant. Le type commande la poche, les classes
   autorisees, la regle de disponibilite, la capacite a porter des titres. Passer
   un compte-titres en livret laisserait un Livret A detenant des actions, et
   aucun ecran ne s'en plaindrait — ils compteraient simplement des actions dans
   les liquidites.

   La regle est donc : tout ce que le compte porte deja doit avoir sa place dans
   le type visé. On refuse en disant quoi deplacer, plutot que d'accepter en
   abimant — un refus qui explique vaut mieux qu'un etat incoherent. */
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

  /* Les lignes comptent celles saisies a la main comme les positions de marche :
     les deux sont rattachees a ce compte et les deux se retrouveraient sans
     classe d'accueil. */
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

/* Le partage d'une cible de classe entre ses deux roles, au prorata des encours.

   La somme des deux vaut exactement la cible d'avant le decoupage : le total des
   cibles de la page ne bouge donc pas d'un point, et il n'y a rien a re-regler
   derriere. L'arrondi va au core, parce que c'est la ligne qu'on renforce.

   L'arrondi tombait sur le palier de 5 le plus proche, du temps ou la liste
   deroulante ne proposait que ceux-la : une classe a 90 % detenue 70/30 se
   coupait en 65 et 25 au lieu des 63 et 27 que dit le prorata. La liste va de 1
   en 1 depuis, donc on arrondit a l'unite.

   Cette fonction vit ici et non dans l'action qui l'appelle, pour la raison
   habituelle : le harnais ne charge pas app.js, une regle qui y vit ne se
   verifie que comme du texte. Celle-ci merite une assertion sur son resultat. */
function partageDeCible(cible, parRole) {
  const core = num(parRole?.core), satellite = num(parRole?.satellite);
  const total = core + satellite;
  const c = num(cible);
  const sat = total ? Math.round(c * satellite / total) : 0;
  return { core: Math.max(0, c - sat), satellite: Math.min(c, sat) };
}

/* Le socle des deux fonctions suivantes : les positions qui passent un filtre,
   avec leur index — c'est lui qui ouvre la fiche — et leur enveloppe.

   Un seul filtre pour les deux barres cliquables de la page. Elles ne comptent
   pas la meme chose et c'est justement pourquoi elles partagent ce code : sur
   cette page, « Satellite » vaut 4 291 EUR dans la carte des roles et 3 543 EUR
   sur la ligne « Actions satellite », l'ecart etant l'or. Deux filtres ecrits
   separement auraient fini par se tromper l'un sur l'autre. */
function positionsFiltrees(garde) {
  return Store.state.positions
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => garde(p))
    .map(({ p, i }) => {
      const c = Store.state.comptes.find(x => x.id === p.account);
      return {
        i, nom: p.name, valeur: posValue(p),
        role: roleDe(p), classe: assetClassDe(p),
        /* Le compte, parce que la meme classe se detient souvent dans deux
           enveloppes et que l'arbitrage n'y est pas le meme : vendre dans un PEA
           de moins de cinq ans ne coute pas ce que coute vendre dans un CTO. */
        compte: c ? nomCompteV2(c) : '',
        etab: c ? nomEtabDe(c) : '',
      };
    })
    .sort((a, b) => b.valeur - a.valeur);
}

/* Le total est toujours la somme des lignes rendues, jamais un encours relu
   ailleurs : deux calculs du meme nombre finissent par diverger. */
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

/* Les positions d'un role, toutes classes confondues : ce que compte la barre
   de la carte « Core et satellites ».

   Ici « Core » tout court est le bon intitule, alors qu'il serait faux sur une
   ligne de cible. La difference n'est pas cosmetique : cette barre compte
   vraiment tout le core du portefeuille, une ligne de cible ne compte que le
   core d'une classe. C'est le meme mot pour deux ensembles, et c'est pour cela
   que la fiche dit la classe de chaque ligne. */
function positionsDeRole(role) {
  if (!ROLES[role]) return null;
  return {
    classe: null, role,
    ...ficheDePositions(ROLES[role], positionsFiltrees(p => roleDe(p) === role)),
  };
}

/* Etage 2 : le partage socle / satellites, a l'interieur de ce qui est
   investi. Un constat, pas un objectif.

   Il a porte des cibles pendant une version, et c'etait une erreur : deux
   series de cibles s'appliquaient au meme argent sans que rien ne verifie
   leur compatibilite. Avec 40 % d'actions visees et seules les actions en
   socle, une cible de socle a 78 % devient impossible a atteindre, et l'app
   affichait un ecart qu'aucun arbitrage ne pouvait combler. Le plan de
   reequilibrage n'a donc qu'une source, les classes.

   Reste ce que la lecture apporte vraiment : quelle part du portefeuille
   tient lieu de fondation, et de quoi le reste est fait. */
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
  /* La base est celle des cibles, cash a investir compris, et non la seule
     valeur des titres. Sans cela le meme core portait deux pourcentages sur la
     meme page : 9 267 EUR valaient 68,5 % ici et 60,2 % sur la carte des
     classes, l'ecart etant les 1 856 EUR pas encore places. « Je vise un core a
     70 % » n'avait alors pas de sens : 70 % faisaient 10 775 EUR d'un cote et
     9 476 EUR de l'autre.

     Le cash n'a pas de role, il forme donc sa propre ligne : les trois font
     100 % de la base, et le core se compare enfin a une cible. Bon effet de
     bord, a mesure qu'on place ce cash le core monte vers sa cible tout seul,
     la ou 68,5 % annoncait « presque bon » avec de l'argent qui dort. */
  const cash = num(stockTotals().cashToInvest);
  const base = rebalanceRows().base;
  const mk = (cle, label, valeur) => ({
    cle, label, value: valeur !== undefined ? valeur : parRole[cle],
    pct: base ? (valeur !== undefined ? valeur : parRole[cle]) / base * 100 : 0,
  });
  return {
    base,
    /* Les libelles viennent de ROLES, pas d'une liste parallele : cette
       fonction ecrivait « Socle » et « Satellites » quand le filtre de Marches
       et les fiches de lignes affichaient « Core » et « Satellite ». Un role,
       un mot. */
    roles: [mk('core', ROLES.core), mk('satellite', ROLES.satellite),
            mk('cashToInvest', AFFECTATION_LABEL.investir, cash)],
    /* Le detail poche par poche : c'est la que la question a un sens concret
       — « dans mes actions, quelle part est du socle ». */
    parClasse: [...parClasse]
      .map(([ac, v]) => ({ classe: ASSET_CLASSES[ac], ...v, total: v.core + v.satellite }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total),
    /* De quoi chaque role est fait. Deux barres empilees valent mieux que deux
       barres pleines : « satellites, 58 922 EUR » ne dit rien, « satellites,
       dont 93 % de bitcoin » dit tout. */
    /* La composition se découpe par classe **et** par nature. Elle ne
       distinguait que la classe : « Actions » au socle et « Actions » en
       satellite, sans dire que l'un est un fonds mondial et l'autre une
       société unique. C'est pourtant toute la différence entre un socle et un
       pari, et c'est la question qu'on se pose en regardant cette carte —
       elle ne doit pas être rangée sous un dépliant. */
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
      /* La tresorerie est une ligne du meme tableau, mais elle n'a pas de
         composition : ce n'est pas encore place, donc pas de classe ni de
         nature. Sans cette entree sa barre restait une piste vide sous un
         « aucune ligne » gris, qui se lit comme une panne alors que 1 856 EUR
         attendent tranquillement. Un bloc plein, de la couleur des liquidites,
         et la vue tait la legende puisqu'elle repeterait le nom de la ligne. */
      cashToInvest: num(cash) > 0.005 ? [{
        classe: AFFECTATION_LABEL.investir, nature: 'fonds',
        label: AFFECTATION_LABEL.investir,
        couleur: CLASSE_COULEURS.liquidites, value: num(cash),
      }] : [],
    }),
    /* Le même partage, vu par nature : « Actions 9 128 € » d'un côté et
       « Actions 3 400 € » de l'autre ne disaient pas que le socle est un
       fonds mondial et le satellite une société unique. */
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
/* Trois familles d'indices dans le nom d'un fonds, et aucune dans celui d'une
   action en direct.

   L'emetteur, d'abord : personne n'appelle une action « Amundi » ni
   « iShares ». C'est le signal le plus fiable, et il manquait — sept noms de
   fonds courants sur quatorze etaient pris pour des actions, dont « Lyxor
   Nasdaq-100 », « Amundi Euro Stoxx 50 » et « SPDR Gold Shares ».

   L'habillage juridique ensuite, UCITS, SICAV, FCP, ETC : il ne peut designer
   qu'un fonds. Et l'indice suivi enfin — CAC, DAX, Nasdaq, Stoxx — qu'une
   societe ne met pas dans sa raison sociale.

   Deux pieges evites. « Trust » n'y figure pas : une foncière americaine porte
   « Real Estate Investment Trust » dans son nom et reste une action. Et les
   mots isoles trop courts, comme « acc » ou « dist » des classes de parts, sont
   ecartes : « Accenture » commence par « acc ». */
const INDICES_FONDS = [
  /* emetteurs */
  /\b(amundi|ishares|lyxor|xtrackers|vanguard|spdr|invesco|vaneck|wisdomtree|blackrock)\b/i,
  /\b(bnp\s*paribas\s*easy|axa\s*im|ossiam|tabula|jpmorgan|jpm|fidelity|hsbc|schwab|ark\s*invest)\b/i,
  /* habillage juridique */
  /\b(etf|etc|etn|ucits|sicav|fcp|opcvm|fonds|fund|index\s*fund|tracker)\b/i,
  /* indices suivis */
  /\b(msci|s&p|sp500|ftse|stoxx|cac\s*40|dax|mdax|nasdaq|nikkei|russell|topix|smi|sensex)\b/i,
  /\b(all[-\s]?world|world|emerging|indice|index)\b/i,
];
const nomSentLeFonds = nom => INDICES_FONDS.some(rx => rx.test(String(nom || '')));

function natureDe(p) {
  /* Ce que l'utilisateur a declare gagne toujours : la detection reste une
     approximation, et c'est la raison pour laquelle le menu de la fiche existe.
     Meme bien nourrie, une regle sur un nom se trompera — un ETF nomme d'apres
     sa seule strategie, une societe dont la raison sociale evoque un indice. */
  if (NATURES[p?.nature]) return p.nature;
  /* La passerelle sait, quand elle a repondu : elle rend le type de
     l'instrument, ce qui vaut mieux que n'importe quelle lecture de nom. */
  const auto = KIND_VERS_NATURE[p?.kind];
  if (auto) return auto;
  return nomSentLeFonds(p?.name) ? 'fonds' : 'titre';
}

/* Une teinte stable par classe : la meme couleur doit designer les actions
   dans les deux barres, sinon on compare des motifs au lieu de montants. */
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
  /* L'immobilier cote prend la teinte de l'immobilier, volontairement : la
     couleur dit le sous-jacent, et un REIT est de l'immobilier. Deux teintes
     auraient fait croire a deux natures. Les deux lignes ne se rencontrent
     jamais sur un meme graphique — l'une est une classe de ligne cotee, l'autre
     une poche du patrimoine. */
  immobilier: 4, immobilierCote: 4,
  crypto: 5,
  metaux: 6,
  obligations: 7,
  diversifie: 8,
  /* La neuvieme, un mauve rose : elle etait en reserve, et c'est la premiere
     classe a en reclamer une. Franchement a cote du rose du non cote, avec
     lequel elle voisine dans toutes les barres de repartition. */
  bienValeur: 9,
};
/* Douze teintes existent, dont quatre en reserve. Une classe sans attribution
   tombe sur la douzieme, un gris mauve : elle se lit alors comme « pas encore
   classee » au lieu d'emprunter la couleur d'une vraie classe. Elle tombait sur
   la huitieme, qui appartient desormais aux multi-actifs. */
const TEINTES_DISPONIBLES = 12;
const TEINTE_SANS_CLASSE = 12;
const couleurClasse = ac =>
  `var(--series-${TEINTE_CLASSE[CLASSES_ALIAS[ac] || ac] || TEINTE_SANS_CLASSE})`;

/* --- répartition par type de compte --- */
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
function byAccountType() {
  const invested = nowTotals().invested;
  const parType = new Map();
  for (const c of comptesOuverts()) {
    if (c.type === 'levier') continue;
    if (typeCompte(c.type).groupe === 'cash') continue;
    const v = lignesDe(c).reduce((s, l) => s + l.valeur, 0);
    if (!v) continue;
    parType.set(c.type, (parType.get(c.type) || 0) + v);
  }
  return [...parType.entries()]
    .filter(([, value]) => Math.abs(value) > 0.005)
    .map(([type, value]) => ({
      label: typeCompte(type).label,
      value, pct: invested ? value / invested * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/* --- objectif --- */
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

/* --- variations --- */
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
    const base = num(from.total) - num(from.dettes);
    /*       On rend donc `pct: null` dans ces cas, et l'affichage se contente de
       l'euro, qui reste exact. Trois situations : base nulle, base negative, et
       changement de signe entre les deux bornes. */
    const traverse = (base > 0 && t.total < 0) || (base < 0 && t.total > 0);
    const pct = (base > 0 && !traverse) ? (t.total / base - 1) * 100 : null;
    return { eur: t.total - base, pct, label: from.label };
  };
  return { month: d(last), ytd: d(firstOfYear), all: d(first) };
}

/* =============================================================
   BUDGET & DÉPENSES
   ============================================================= */

const B = () => Store.state.budget;

/*   Le revenu vraiment irregulier — la facture de pige, la vente d'un meuble —
   n'entre PAS ici : il a deja sa place au journal des rentrees
   exceptionnelles, avec sa date. Une moyenne declaree ici est un choix de
   budget ; le journal, lui, enregistre des faits. */
const revenuMensuel = r => auMois(r.amount, r);

/* Au moins une source est declaree estimee : les ecrans qui derivent du
   revenu (taux d'epargne, reste a vivre) peuvent alors le dire, au lieu
   d'afficher quatre chiffres apres la virgule sur une hypothese. */
const revenuEstime = () => (B().income || []).some(r => !!r.estime);

function incomeTotal() {
  return B().income.reduce((s, i) => s + revenuMensuel(i), 0);
}

/* --- periodicite des charges fixes ------------------------------------
   Une assurance se paie a l'annee, un abonnement au mois. Les saisir toutes
   au mois obligeait a diviser de tete et a re-verifier a chaque changement
   de tarif. Le montant est donc garde tel qu'il est facture, et c'est le
   calcul qui ramene au mois.

   Les parts d'un contributeur suivent la periode de leur charge : sur une
   assurance annuelle, on note ce qu'il verse par an. */
/* « mensuel » plutot que « par mois » : dans la colonne etroite du tableau
   sur telephone, la preposition mangeait la place du mot qui distingue.

   Cinq periodicites, et non deux. « Mois ou an » forcait a diviser de tete un
   loyer de garage trimestriel ou une assurance semestrielle, puis a refaire le
   calcul a chaque changement de tarif — exactement ce que cette table existe
   pour eviter.

   Le facteur est le nombre de mois que couvre un versement. La semaine vaut
   52/12 mois et non 4 : douze mois de quatre semaines feraient quarante-huit
   semaines, et une charge hebdomadaire serait sous-estimee de quatre semaines
   par an, soit 8 %. */
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

/* Une periode inconnue — un etat d'avant, un export bricole — retombe sur le
   mois : c'est la valeur qui ne deforme rien, un montant mensuel etant deja son
   propre equivalent mensuel. */
const chargePeriode = c => (c && CHARGE_MOIS_COUVERTS[c.period]) ? c.period : 'mois';
const auMois = (valeur, c) => num(valeur) / CHARGE_MOIS_COUVERTS[chargePeriode(c)];
const chargeMensuelle = c => auMois(c.amount, c);

function fixedTotal() {
  return B().fixedCharges.reduce((s, c) => s + chargeMensuelle(c), 0);
}

/* --- charges partagées ------------------------------------------------
   Une charge peut être partagée avec plusieurs personnes. Ces parts sont
   informatives : le budget déduit la charge en totalité, parce que c'est bien
   toi qui la paies — ce que les autres te versent entre de leur côté dans les
   revenus. La colonne dit donc ce qui reste réellement à ta charge, sans
   toucher au calcul du reste pour vivre. */
function contributors() { return B().contributors || []; }

function shareOf(charge, id) { return num((charge.shares || {})[id]); }

function sharedOn(charge) {
  return contributors().reduce((s, p) => s + shareOf(charge, p.id), 0);
}

/* Ce qui te reste vraiment à payer sur une ligne. */
function myShare(charge) { return num(charge.amount) - sharedOn(charge); }

/* Les totaux additionnent des lignes de periodes differentes : tout est donc
   ramene au mois avant d'etre somme, sinon une assurance annuelle pesait
   douze fois son poids reel dans le budget. */
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

/* Reste pour vivre = revenus − charges fixes.
   Il se partage entre l'objectif de dépenses et l'objectif d'investissement. */
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

/* --- détail d'une catégorie -------------------------------------------
   « Voyages : 220 € » ne dit pas si c'est un billet ou trois. Le détail vit
   à côté du total, dans `d`, et jamais à sa place :

     v: { Voyages: 220 }
     d: { Voyages: [ { montant: 100, libelle: 'Train' }, { montant: 120 } ] }

   `v` reste la seule vérité pour le reste de l'application — le tableau, les
   statistiques, les graphiques, les exports, le renommage de catégorie, une
   quinzaine de lecteurs qui n'ont pas à connaître `d`. Un mois sans détail est
   exactement ce qu'il était avant : aucune migration, et seize mois
   d'historique qui ne bougent pas. */
function expenseDetail(row, cat) {
  const d = row.d?.[cat];
  return Array.isArray(d) && d.length ? d : null;
}

/* Écrit le détail et recale le total dessus. Une liste vide efface les deux :
   `d` ne doit jamais survivre en orphelin à côté d'un total saisi à la main. */
function setExpenseDetail(row, cat, lignes) {
  const propres = (lignes || []).filter(l => num(l.montant));
  if (!propres.length) {
    if (row.d) { delete row.d[cat]; if (!Object.keys(row.d).length) delete row.d; }
    return null;
  }
  row.d = row.d || {};
  row.d[cat] = propres.map(l => ({ montant: round2(num(l.montant)), libelle: String(l.libelle || '').trim() }));
  row.v[cat] = round2(propres.reduce((s, l) => s + num(l.montant), 0));
  return row.v[cat];
}

function clearExpenseDetail(row, cat) { setExpenseDetail(row, cat, []); }

/* Les libellés déjà employés dans cette catégorie, tous mois confondus. On
   retape « Train » douze fois par an sinon, et deux orthographes du même poste
   ne se regroupent jamais. Portée volontairement étroite : « Train » a du sens
   sous Voyages, aucun sous Santé. */
/* --- ce qu'on a deja tape dans un champ -------------------------------

   `libellesConnus()` fait cela depuis longtemps pour le detail d'une depense,
   et rien d'autre n'en beneficiait. Trois champs se retapent pourtant a chaque
   fois : le preteur d'un credit, l'organisme d'une charge fixe, la source d'un
   revenu. « Credit Agricole » saisi deux fois donne deux orthographes qui ne se
   regrouperont jamais, et personne ne s'en apercoit — ce sont des champs qu'on
   relit rarement.

   Les valeurs se derivent des donnees, jamais d'une table tenue a la main :
   celle-ci aurait vieilli des le premier organisme ajoute. Le champ reste libre,
   c'est une proposition et non une contrainte — un nouvel organisme se tape
   comme avant. */
const VALEURS_CONNUES = {
  /* Les preteurs deja nommes, plus les etablissements : quand la banque qui
     prete est celle qui tient le compte, son nom est deja dans l'application. */
  preteur: () => [
    ...(Store.state.etabs || []).flatMap(e => (e.dettes || []).map(d => d.preteur)),
    ...(Store.state.etabs || []).map(e => e.nom),
  ],
  organisme: () => (B().fixedCharges || []).map(c => c.provider),
  source: () => (B().income || []).map(r => r.label),
};

function valeursConnues(cle) {
  const vues = new Map();
  for (const v of (VALEURS_CONNUES[cle]?.() || [])) {
    const t = String(v || '').trim();
    /* La cle en minuscules dedoublonne « MAIF » et « Maif ». L'ecriture gardee
       est la derniere rencontree, comme dans `libellesConnus()` : peu importe
       laquelle, ce qui compte est qu'il n'y en ait qu'une et que la regle soit
       la meme partout. Deux facons de dedoublonner dans un meme fichier
       finiraient par donner deux listes differentes du meme champ. */
    if (t) vues.set(t.toLowerCase(), t);
  }
  return [...vues.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

function libellesConnus(cat) {
  const vus = new Map();
  for (const r of B().expenses) {
    for (const l of (r.d?.[cat] || [])) {
      const t = String(l.libelle || '').trim();
      if (t) vus.set(t.toLowerCase(), t);
    }
  }
  return [...vus.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

/* Ce que devient le detail d'une categorie quand son total est retape a la main
   dans le champ. C'est une regle du modele, pas de l'affichage : elle decide si
   un libelle survit, et le panneau ne fait que suivre.

   Un seul montant detaille se corrige, son libelle reste : le commentaire pose
   sur une depense unique doit survivre a la correction du chiffre, sinon
   « ajouter un commentaire » n'a aucun etat stable.

   Plusieurs lignes ne se repartissent pas toutes seules — rien ne dit laquelle
   absorbe l'ecart — donc le detail devient faux et part. Il restait affiche :
   le panneau annoncait 0 EUR en face d'un champ qui portait 20, deux chiffres
   contradictoires a dix pixels l'un de l'autre.

   Rend `null` quand le detail doit disparaitre. Sinon la somme des lignes
   rendues egale le total, toujours. */
function recalerDetail(lignes, total) {
  if (!lignes || !lignes.length) return null;
  const somme = lignes.reduce((s, l) => s + num(l.montant), 0);
  if (Math.abs(somme - num(total)) <= 0.005) return lignes;
  if (lignes.length === 1) return [{ ...lignes[0], montant: num(total) }];
  return null;
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
  /* Le séparateur est le « + » ou le « - » qui suit un chiffre : sinon un
     « -50 » d'ouverture se ferait couper en un terme vide. */
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

/* Séries mensuelles, éventuellement filtrées sur une année */
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

/* La classe CSS de l'ecart, et donc la couleur. Elle vit ici et non dans les
   vues : c'est la correspondance niveau -> couleur qui ne doit pas diverger, et
   la mettre dans app.js la rendait intestable — le harnais ne charge pas les
   vues. Le graphique peint ses barres depuis les memes trois niveaux, si bien
   qu'un mois ne peut plus etre orange sur le dessin et rouge dans le tableau
   juste en dessous. */
const CLASSE_DEPASSEMENT = { sous: 'up', leger: 'tiede', grave: 'down' };
const classeDepassement = (total, objectif) =>
  CLASSE_DEPASSEMENT[niveauDepassement(total, objectif)] || 'muted';

/* Bilan d'une année : total, moyenne, mois sous/au-dessus de l'objectif */
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

  /* Les listes elles-memes, pas seulement leurs comptes : les tuiles publient
     under/over et leurs fiches doivent lister exactement ces mois-la. Deux
     filtres paralleles, un ici et un dans la fiche, avaient deja diverge — la
     fiche comptait le mois en cours vide comme « sous l'objectif ». Une seule
     source, et l'egalite tuile = fiche tient par construction. */
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

/* --- catégories de dépenses -------------------------------------------
   Elles vivent dans l'état, pas dans le code : chacun ne dépense pas dans
   les mêmes postes, et les colonnes du tableau en découlent. */
function expenseCategories() {
  const c = Store.state.budget.categories;
  return (Array.isArray(c) && c.length) ? c : EXPENSE_CATEGORIES;
}

/*    Deplace une categorie d'un cran. L'ordre de `budget.categories` EST l'ordre
   des colonnes du detail mensuel, de la fenetre de saisie, des graphiques et
   des exports : une seule liste, donc un seul geste pour tous ces ecrans.*/
function deplacerCategorie(cat, delta) {
  /* La liste par defaut se materialise au premier deplacement : on ne peut
     pas reordonner une constante partagee. */
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

/* Ce qu'on propose de remplir ce mois-ci. Derive de la liste complete, jamais
   recopiee : une categorie ajoutee demain y entre sans qu'on y pense. */
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

function addExpenseCategory(nom) {
  const propre = String(nom || '').trim();
  if (!propre) return null;
  const liste = Store.state.budget.categories;
  if (liste.some(c => c.toLowerCase() === propre.toLowerCase())) return null;  // pas de doublon
  liste.push(propre);
  return propre;
}

/* Renommer déplace les montants déjà saisis : sans ça, ils resteraient
   attachés à une colonne qui n'existe plus. */
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
  /* Le retrait suit le nom. Sans ça, renommer une catégorie retirée la ferait
     revenir dans la saisie, et le nom d'avant resterait retiré à vie. */
  const ret = Store.state.budget.retirees;
  if (Array.isArray(ret)) {
    const j = ret.indexOf(ancien);
    if (j >= 0) ret[j] = propre;
  }
  return true;
}

/* Combien a été saisi dans une catégorie, tous mois confondus. */
function expenseCategoryTotal(cat) {
  return Store.state.budget.expenses.reduce((s, r) => s + num(r.v?.[cat]), 0);
}

function removeExpenseCategory(cat) {
  const liste = Store.state.budget.categories;
  const i = liste.indexOf(cat);
  if (i < 0) return false;
  liste.splice(i, 1);
  for (const r of Store.state.budget.expenses) if (r.v) delete r.v[cat];
  /* Et sortir le nom des retirees : sinon recreer une categorie du meme nom la
     ferait naitre deja retiree, invisible dans la saisie, sans que rien
     n'explique pourquoi. */
  reprendreCategorie(cat);
  return true;
}

/* Totaux par catégorie sur une année */
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

/* Le mois en cours dès qu'il existe au calendrier, même à zéro.
   Il fallait auparavant qu'il porte déjà une dépense : le 1er août, la carte
   « Budget du mois » affichait encore juillet et son total, et continuait
   jusqu'à la première saisie. On croyait l'application figée alors qu'elle
   répondait à une autre question.

   Zéro euro dépensé le 3 du mois est une information, pas un vide : c'est le
   budget entier qui reste devant soi. On ne retombe sur le dernier mois
   renseigné que si le mois en cours n'a aucune ligne — un calendrier jamais
   ouvert. */
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

/* Épargne : ce que le budget prévoit vs ce que le patrimoine a réellement fait */
function savingsReconciliation() {
  const f = budgetFrame();
  const stats = expenseYearStats(todayISO().slice(0, 4));
  const spend = stats.average || f.target;
  const theoretical = f.income - f.fixed - spend;

  /* Croissance réelle du patrimoine : la même mesure que le « rythme observé »
     de l'onglet Objectif, et délibérément le même nombre. Les deux cartes
     annonçaient la même chose et affichaient des valeurs différentes : celle-ci
     divisait premier-à-dernier par la durée en incluant la photo du jour,
     l'autre moyennait les écarts mensuels sans elle. Une seule source
     désormais : la moyenne des variations sur les mois clos. Le mois en cours
     reste dehors, il est incomplet et ferait bouger le chiffre chaque jour. */
  const rythme = paceRecent();
  const monthsSpan = rythme.count;
  const realPerMonth = monthsSpan ? rythme.average : null;

  return {
    income: f.income, fixed: f.fixed, spend,
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

/* --- les echeances du non cote ------------------------------------------
   Un pret participatif a une date de fin, un taux annonce, et un etat : en cours,
   en retard, en defaut, rembourse. Le retard et le defaut sont la realite de ce
   metier — un portefeuille de trente lignes en compte toujours quelques-unes — et
   l'application n'avait aucun de ces trois champs. Elle ne pouvait donc ni dire
   « 3 200 EUR arrivent a echeance en mars », ni signaler une ligne qui a depasse
   sa date sans rien verser.

   Le statut est declare, jamais deduit. Une date depassee ne veut pas dire
   « en retard » : le remboursement arrive souvent avec quelques jours de decalage,
   et une application qui peindrait la ligne en rouge le lendemain de l'echeance
   crierait au loup a chaque fois. Elle signale, c'est le detenteur qui tranche. */
const STATUTS_LIGNE = {
  encours:   'En cours',
  retard:    'En retard',
  defaut:    'En défaut',
  rembourse: 'Remboursé',
};

function statutLigne(l) {
  return STATUTS_LIGNE[l.statut] ? l.statut : 'encours';
}

/* Toutes les lignes non cotees qui portent une echeance, la plus proche d'abord.
   Une ligne remboursee sort de la liste : son echeance est derriere elle et ne
   demande plus rien. */
function echeances() {
  const out = [];
  for (const c of comptesOuverts()) {
    /* Seuls les comptes de pret portent des echeances : une part de societe non
       cotee n'a pas de date de remboursement, et lui en reclamer une serait
       inventer un calendrier qui n'existe pas. */
    if (!typeCompte(c.type).prete) continue;
    (c.lignes || []).forEach((l, i) => {
      if (!l.echeance || l.marche) return;
      const st = statutLigne(l);
      if (st === 'rembourse') return;
      out.push({
        compteId: c.id, compte: nomCompteV2(c), etab: nomEtabDe(c), index: i,
        libelle: l.libelle || 'Placement', valeur: num(l.valeur),
        taux: num(l.taux) || null, echeance: l.echeance, statut: st,
        /* Depassee, mais pas encore declaree en retard : c'est ce cas-la qui
           merite un rappel, et lui seul. */
        depassee: st === 'encours' && String(l.echeance) < todayISO(),
        jours: Math.round((new Date(String(l.echeance) + 'T12:00:00')
                         - new Date(todayISO() + 'T12:00:00')) / 86400000),
      });
    });
  }
  return out.sort((a, b) => String(a.echeance).localeCompare(String(b.echeance)));
}

/* Ce qui est immobilise dans une ligne a probleme : la somme des retards et des
   defauts. C'est le chiffre qu'on veut connaitre d'un coup d'oeil, et il ne
   figure nulle part dans les totaux — un defaut garde sa valeur declaree tant que
   le detenteur ne l'a pas baissee, et c'est a lui de le faire. */
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
   meme chiffre, et le taire serait la faute que ce projet corrige sans arret. */
function cashFlowBien(compte) {
  if (!compte) return null;
  const loyers = B().income
    .filter(i => i.bienId === compte.id)
    .reduce((s, i) => s + num(i.amount), 0);
  const charges = B().fixedCharges
    .filter(c => c.bienId === compte.id)
    .reduce((s, c) => s + chargeMensuelle(c), 0);
  /* Les credits de l'etablissement qui tient le bien : c'est la que la dette
     immobiliere vit, et un bien finance a credit a le sien. */
  const credits = (etabById(compte.etabId)?.dettes || []);
  const mensualite = credits.reduce((s, d) => s + mensualiteCredit(d), 0);
  const reste = credits.reduce((s, d) => s + num(d.montant), 0);

  const valeur = valeurCompte(compte);
  const achat = lignesDe(compte).reduce((s, l) => s + num(l.prixDeRevient), 0);
  const base = achat || valeur;
  const surAchat = achat > 0;

  const annuelBrut = loyers * 12;
  const annuelNet = (loyers - charges) * 12;
  return {
    loyers, charges, mensualite, reste, valeur, achat, base, surAchat,
    /* Le cash-flow : ce qui reste sur le compte en fin de mois, une fois le
       credit paye. Negatif est normal les premieres annees, et c'est justement
       le chiffre qu'il faut connaitre. */
    cashFlow: loyers - charges - mensualite,
    rendementBrut: base ? annuelBrut / base * 100 : 0,
    rendementNet: base ? annuelNet / base * 100 : 0,
    /* Ce que le bien rapporte rapporte a ce qu'on y a vraiment mis, credit
       deduit : c'est le rendement sur fonds propres, le seul qui reponde a
       « est-ce que ce montage vaut mieux qu'un livret ». Sans apport connu, il
       n'a pas de sens et vaut null. */
    fondsPropres: surAchat && achat > reste ? achat - reste : null,
    rendementFondsPropres: (surAchat && achat > reste)
      ? (loyers - charges - mensualite) * 12 / (achat - reste) * 100 : null,
  };
}

/* Les comptes qui portent un bien immobilier : la liste que proposent les
   fenetres de revenus et de charges pour le rattachement. Derivee des types, pas
   ecrite a la main — un type immobilier ajoute demain entre tout seul. */
function comptesBiens() {
  return comptesOuverts().filter(c => typeCompte(c.type).classes.includes('immobilier'));
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

/* Les apports, du plus recent au plus ancien. Les montants nuls restent : une
   ligne a zero est une saisie en cours, pas une erreur a masquer. */
function apportsTries() {
  return [...APPORTS()]
    .map((a, i) => ({ ...a, index: i, montant: num(a.montant) }))
    .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
}

/* Ce qui est entre et ce qui est sorti entre deux dates, bornes comprises. Sans
   bornes, tout.

   La symetrie n'est pas decorative. Une voiture payee 15 000 EUR fait plonger le
   patrimoine du mois, et sans cette ligne « Rythme d'accumulation » l'impute a
   l'epargne : mesure sur les donnees reelles, la moyenne passait de +789 EUR a
   -283 EUR par mois, et y restait, une moyenne portant sur quatorze mois. Le
   budget, lui, n'avait pas bouge d'un euro.

   Une sortie exceptionnelle ne va donc pas dans les depenses du mois : elle y
   gonflerait la moyenne annuelle, qui sert de cout de la vie a l'autonomie
   financiere et a la cible d'epargne de precaution. Mesure la aussi : la moyenne
   passait de 1 404 a 3 547 EUR, l'autonomie de 0,8 a 0,5 mois, et la cible de
   precaution de 11 545 a 17 974 EUR — pour une voiture achetee une fois. */
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

/* Le net, qui est ce que le rythme d'accumulation doit retrancher. Il se derive
   du detail plutot que de refaire la somme : deux boucles sur la meme liste
   auraient fini par diverger, et c'est le total qui se serait trompe. */
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

/* =============================================================
   ANALYSES
   ============================================================= */

/* Autonomie financière : combien de mois tu tiens si les revenus s'arrêtent,
   par paliers de liquidité. Le coût de la vie = charges fixes + dépenses. */
function runway() {
  const f = budgetFrame();
  const stats = expenseYearStats(todayISO().slice(0, 4));
  const burn = f.fixed + (stats.average || f.target);

  /* Les paliers suivent la mobilisabilité calculée ligne par ligne —
     f(classe, type de compte, date d'ouverture) — plus un réglage déclaré.
     Un ETF dans un PEA de moins de cinq ans compte donc en « bloqué »,
     les liquidités posées chez un courtier en « sous quelques jours », et les
     billets d'un portefeuille tout de suite. */
  const p = poches();
  const immediate  = p.mobilisable.immediat;
  const differe    = p.mobilisable.differe;
  const lent       = p.mobilisable.lent;
  const bloque     = p.mobilisable.bloque;

  /* Notes tenues courtes : elles s'affichent sous l'intitule, sur un ecran
     de telephone. Le detail sur le PEA a rejoint l'aide de la carte. */
  /* « Titres a vendre » laissait croire que la vente etait lente. Elle est
     instantanee en seance : ce qui prend deux a trois jours ouvres, c'est le
     reglement puis le virement vers le compte courant. Ce palier mesure de
     l'argent qu'on peut depenser, pas de l'argent qu'on peut liquider, et la
     note doit dire laquelle des deux etapes retarde. */
  /*     Conditionnel, parce qu'une note qui parle de projets a quelqu'un qui n'en a
     pas est du bruit. */
  const contenants = trad('comptes courants, livrets, espèces');
  const tiers = [
    { label: trad('Disponible tout de suite'), value: immediate,
      note: p.projet > 0.005 ? `${contenants}${trad(' ; projets compris')}` : contenants },
    { label: trad('En quelques jours'), value: differe,
      note: trad('liquidités chez un courtier ; un titre se vend en séance, le virement prend 2 à 3 jours') },
    { label: trad('En quelques mois'), value: lent, note: trad('immobilier, non coté, à vendre avec décote si pressé') },
    /* Hors cumul : un PER ne prolonge aucune autonomie. Il reste affiché,
       c'est du patrimoine, mais l'ajouter aux mois tenus serait un mensonge —
       cet argent n'arrivera pas, quoi qu'il se passe demain. */
    { label: trad('Inaccessible'), value: bloque, note: trad('bloqué jusqu’à son échéance'), horsCumul: true },
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
    // règle courante : 3 à 6 mois de dépenses en épargne de précaution
    targetLow: burn * 3, targetHigh: burn * 6,
  };
}

/* Variation du patrimoine mois par mois, pour voir le rythme réel d'accumulation */
/* Les chiffres qui resument une serie de variations. Sortis de monthlyPace()
   pour que la vue puisse les recalculer sur la plage affichee : ils lisaient
   la serie entiere pendant que les barres suivaient la plage choisie, et en
   « depuis janvier » le « meilleur mois » pouvait designer un mois absent du
   graphique. */
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
    /* La moyenne hors apports : ce que le patrimoine a gagne par les marches et
       par l'epargne, l'argent tombe du ciel mis de cote. */
    averageHorsApports: n ? (somme - apports) / n : 0,
    positive: points.filter(p => p.delta > 0).length,
    best: points.reduce((a, o) => (!a || o.delta > a.delta) ? o : a, null),
    worst: points.reduce((a, o) => (!a || o.delta < a.delta) ? o : a, null),
  };
}

function monthlyPace() {
  /* Une cloture au 31/12 est une deuxieme photo du meme mois. Laissee dans la
     serie, elle donnait deux barres pour decembre et un intervalle de trop :
     quinze ecarts pour quatorze mois, et une moyenne mensuelle diluee
     d'autant. On l'ecarte quand son mois porte deja une ligne. */
  const brut = historySeries({ includeNow: false });
  const pts = brut.filter(p => !(Number(String(p.date).slice(8, 10)) > 20
    && brut.some(q => q !== p && String(q.date).slice(0, 7) === String(p.date).slice(0, 7))));
  /* L'ecart se mesure sur le **net**, comme l'annonce l'aide de la carte.
     Il se calculait sur le brut : rembourser 400 EUR de capital fait monter le
     patrimoine net d'autant sans toucher au brut, si bien que tout le
     desendettement disparaissait du rythme d'accumulation. Sans credit les
     deux coincident, d'ou un defaut invisible jusqu'a ce qu'un jeu de donnees
     porte un pret immobilier. */
  const net = p => num(p.total) - num(p.dettes);
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    out.push({ label: pts[i].label, date: pts[i].date, note: pts[i].comment,
               /* La borne basse de l'intervalle que cet ecart mesure. Le jour
                  meme du releve precedent est exclu : ce qui est entre ce jour-la
                  etait deja dans son solde. */
               depuis: prochainJour(pts[i - 1].date),
               delta: net(pts[i]) - net(pts[i - 1]), total: pts[i].total });
  }
  return statsRythme(out);
}

/* La croissance réelle se mesure sur douze mois glissants, pas sur tout
   l'historique. Seize mois de relevés en donnaient quatorze, un nombre qui
   grandit d'un cran chaque mois : « ma moyenne mensuelle » changeait de
   période à chaque fois qu'on la relisait, et deux relevés de 2025 pesaient
   encore sur le rythme de 2026. Une fenêtre fixe se compare à elle-même.

   Même fenêtre pour l'onglet Objectif : les deux cartes annoncent le même
   chiffre et le disent dans leur aide, elles ne peuvent pas diverger. */
const PACE_WINDOW = 12;
function paceRecent() {
  return statsRythme(monthlyPace().points.slice(-PACE_WINDOW));
}

/* Trajectoire vers l'objectif annuel, au rythme observé et au rythme budgété */
/* --- ventes ------------------------------------------------------------
   Le reste de l'app est un modèle photo : il décrit ce que tu détiens
   aujourd'hui. Une vente est le seul événement qui doit laisser une trace,
   parce qu'elle fait disparaître la ligne qui portait la plus-value. Sans
   journal, vendre effacerait la performance au lieu de l'encaisser. */

/* Le compte crédité par défaut : celui qui portait la ligne vendue — son
   entrée « à investir » reçoit le produit. */
function defaultCashTarget(accountId) {
  if (compteById(accountId)) return accountId;
  return (comptesOuverts().find(c => typeCompte(c.type).titres) || {}).id || '';
}

/* Comptes proposables comme destination du produit d'une vente : tout
   compte ouvert peut recevoir des espèces. Les comptes de marché d'abord,
   puis les comptes du quotidien. */
function cashTargets() {
  const ouverts = comptesOuverts();
  return [
    ...ouverts.filter(c => typeCompte(c.type).titres),
    ...ouverts.filter(c => typeCompte(c.type).groupe === 'cash'),
  ];
}

/* Aperçu d'une vente, sans rien modifier : sert à l'afficher avant de valider. */
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

/* Applique la vente : réduit la ligne, crédite le cash, journalise. */
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

  // le produit de la vente devient des espèces : sans ça le patrimoine chuterait
  if (cashAccount) {
    const compteCash = compteById(cashAccount);
    if (compteCash) {
      const e = cashInvestirEntree(compteCash, true);
      e.montant = round2(num(e.montant) + ap.gross);
    } else if (!ACC[cashAccount]?.holdings) {
      Store.state.now[cashAccount] = num(Store.state.now[cashAccount]) + ap.gross;
    }
  }

  // le prix de revient unitaire ne bouge pas : seule la quantité diminue
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

/* --- annuler une vente -------------------------------------------------
   Une vente faite par erreur devait pouvoir se defaire, et la croix du journal
   ne le faisait pas : elle retirait la ligne sans rendre les titres ni reprendre
   les especes. Le patrimoine restait donc juste — les titres etaient partis,
   l'argent etait la — mais la trace disparaissait, et plus rien ne disait d'ou
   venait ce cash. Pire, le geste ressemblait a une annulation.

   L'enregistrement d'une vente porte tout ce qu'il faut pour la defaire : la
   quantite, le prix de revient unitaire d'alors, son change, le compte titres,
   le compte de cash et le produit encaisse. On remonte donc les trois
   mouvements dans l'ordre inverse.

   Le total du patrimoine ne revient pas forcement a l'euro d'avant la vente, et
   c'est normal : les titres rendus sont valorises au cours du jour, qui a pu
   bouger depuis. Ce qui revient exactement, c'est la quantite et le cash. */
function annulerVente(i) {
  const v = (Store.state.sales || [])[i];
  if (!v) return null;

  /* Une vente declaree n'a rien ecrit : il n'y a rien a defaire. Derouler la
     suite pousserait une ligne de titres fantome (quantite nulle, prix nul)
     et retrancherait un produit jamais credite. */
  if (v.declaree) {
    Store.state.sales.splice(i, 1);
    return v;
  }

  /* 1. les especes repartent d'ou elles etaient venues. */
  if (v.cashAccount) {
    const c = compteById(v.cashAccount);
    if (c) {
      const e = cashInvestirEntree(c, true);
      e.montant = round2(num(e.montant) - num(v.gross));
    } else if (!ACC[v.cashAccount]?.holdings) {
      Store.state.now[v.cashAccount] = round2(num(Store.state.now[v.cashAccount]) - num(v.gross));
    }
  }

  /* 2. les titres reviennent sur leur ligne. L'ISIN d'abord, le symbole
     ensuite, le nom en dernier : c'est l'ordre du plus identifiant au moins
     sur. Une vente totale avait supprime la ligne, elle renait avec ce que
     l'enregistrement a garde — le cours du jour n'etant pas connu, le prix de
     vente en tient lieu jusqu'au prochain rafraichissement. */
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

  /* 3. le journal oublie la vente. */
  Store.state.sales.splice(i, 1);
  return v;
}

/* Date de début d'une plage (YTD, 1 an, 3 ans…), ou null pour « tout ». */
function rangeStart(range) {
  if (!range || range === 'all') return null;
  const now = new Date();
  const d = range === 'ytd'
    ? new Date(now.getFullYear(), 0, 1)
    : new Date(now.getFullYear() - (parseInt(range, 10) || 1), now.getMonth(), now.getDate());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Plus-values réalisées sur une plage (YTD, 1y, 3y, 5y, all). */
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
    pct: invested ? realised / invested * 100 : 0,
    wins: ventes.filter(v => num(v.realised) > 0).length,
  };
}

/* Les ventes regroupees par periode, pour que le graphique tienne debout.

   Le pas se derive de la plage choisie et non d'un seuil sur le nombre de
   ventes. Un seuil ferait changer la nature du graphique sans qu'on ait rien
   demande — on ajoute une vente, et les barres se mettent a vouloir dire autre
   chose. La plage, elle, est un geste : « 5 ans » demande une vue de cinq ans,
   et un trimestre y est la bonne maille.

   Un mois vide n'est pas une barre a zero : c'est un mois sans vente, et le
   dessiner ferait croire a une vente nulle. Seules les periodes qui portent
   quelque chose apparaissent, dans l'ordre. */
const PAS_DES_VENTES = { ytd: 'mois', '1y': 'mois', '3y': 'trimestre', '5y': 'trimestre' };
/* Cette valeur s'affiche telle quelle — « Realisee, par ... » en tete de carte —
   donc elle porte son accent. Les identifiants du modele n'en portent pas
   d'habitude ; celui-ci en porte parce qu'il est aussi un mot, et le detour par
   une table de traduction pour trois valeurs aurait fait deux endroits ou un
   seul suffit. La premiere version l'ecrivait sans, et la carte affichait le mot
   estropie. */
const pasDesVentes = range => PAS_DES_VENTES[range] || 'année';

/* Nommer chaque vente, ou regrouper : une seule fonction le decide.

   La condition s'est d'abord ecrite deux fois, dans l'intitule de la carte et
   dans le montage du graphique. Deux copies d'une meme regle finissent par
   diverger, et celle-ci aurait fait annoncer « vente par vente » au-dessus de
   barres trimestrielles — un intitule qui dit exactement le contraire de ce
   qu'on regarde. C'est le defaut que ce projet corrige sans arret.

   Vingt-quatre : au-dela, les intitules de titres se recouvrent sur la largeur
   d'une carte, meme sur grand ecran. Le nombre ne sert qu'a cette borne haute ;
   la nature du graphique se decide sur la plage. */
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
  const seuil = rangeStart(range);
  const ventes = (Store.state.sales || [])
    .filter(v => !seuil || String(v.date) >= seuil);
  return statsDesVentes(ventes);
}


/* Cumul des plus-values réalisées, dans l'ordre chronologique. C'est la courbe
   qui répond à « est-ce que mes ventes m'ont rapporté, au total ». */
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

/* Plus-value latente : ce que valent tes lignes au-dessus de leur prix
   de revient, tant que tu ne les as pas vendues. */
function latentPnl() {
  const ps = Store.state.positions;
  const value = ps.reduce((s, p) => s + posValue(p), 0);
  const invested = ps.reduce((s, p) => s + posInvested(p), 0);
  return { value, invested, pnl: value - invested,
           pct: invested ? (value / invested - 1) * 100 : 0,
           winners: ps.filter(p => posPerfEur(p) > 0).length, count: ps.length };
}

function salesYears() {
  const ans = [...new Set((Store.state.sales || []).map(v => String(v.date).slice(0, 4)))];
  return ans.sort();
}

/* --- projection longue durée -----------------------------------------
   Capitalisation mensuelle du capital actuel plus les versements. C'est de
   l'arithmétique, pas une prévision : aucune donnée de marché n'entre ici,
   toutes les hypothèses sont celles que tu saisis. Le rendement réel d'un
   portefeuille ne suit aucune courbe lisse — cette vue montre ce que
   produisent tes hypothèses, rien d'autre. */
/* Jalons du tableau : les repères courants d'une projection. */
const PROJECTION_HORIZONS = [3, 5, 10, 15, 20];

/* Horizons proposés dans la liste déroulante, de 5 en 5 jusqu'à 80 ans —
   de quoi couvrir une vie d'épargne entière. */
const PROJECTION_CHOICES = Array.from({ length: 16 }, (_, i) => (i + 1) * 5);

function projectionSettings() {
  const m = Store.state.meta;
  return {
    // 0 = jamais réglé : on part de l'épargne que dégage le budget
    monthly: num(m.projMonthly) || suggestedMonthly(),
    rate: num(m.projRate),
    /* Le rendement des poches qui ne sont pas des actifs de marche. Zero par
       defaut, et c'est le pivot de tout le dispositif : personne ne voit ses
       chiffres bouger, l'application ne suggere aucun rendement sur du non
       cote, et le gel qu'on appliquait devient le cas particulier taux = 0.
       C'est a l'utilisateur d'affirmer un rendement, pas a nous. */
    /*    Le taux du non cote seul. Il couvrait aussi les liquidites, ce qui melait
   deux choses sans rapport, et un troisieme selecteur a ete essaye pour les
   separer. Un projet ne se finance pas au taux d'un livret, et trois
   calculateurs pour une page d'hypotheses, c'est deux de trop. Elles sont
   donc portees a plat, sans reglage — une constante n'a pas besoin d'un menu.*/
    rateAutres: num(m.projRateAutres),
    inflation: num(m.projInflation),
    target: num(m.projTarget),
  };
}

/* Versement mensuel proposé par défaut : l'épargne que ton budget dégage,
   sinon le rythme réellement observé sur tes relevés. */
function suggestedMonthly() {
  const rec = savingsReconciliation();
  const brut = rec.theoretical > 0 ? rec.theoretical
             : (rec.realPerMonth > 0 ? rec.realPerMonth : 0);
  return Math.round(brut);
}

/* `plat` : la part du patrimoine que la projection porte sans lui appliquer de
   rendement, soit l'apport immobilier, la valeur du bien moins tout le capital
   restant du.

   Avant, un seul taux s'appliquait a l'ensemble du patrimoine net. L'apport
   d'un appartement capitalisait donc a 5 % par an comme un ETF, ce qu'un bien
   ne fait pas, et ce qui rendait fausse toute etiquette parlant de rendement
   boursier. Verifie chez Finary : ils separent « actions » et « autres actifs »
   avec un rendement propre a chacun. Nous n'en avons qu'un, donc on ne le prete
   qu'a ce qu'il decrit, et le reste est porte a plat.

   A plat et non exclu : l'apport reste dans le total, parce qu'il fait partie du
   patrimoine et qu'on veut le voir. On ne lui prete simplement aucune
   performance, ce qui est prudent et lisible, plutot qu'une performance
   inventee. L'amortissement du pret n'est pas modelise non plus, la carte des
   hypotheses le dit.

   La part plate peut etre negative : un credit a la consommation sans bien en
   face, ou un bien qui vaut moins que son pret. C'est honnete, et ca evite
   surtout de faire fondre une dette au rythme des marches. */
/* Les biens de valeur y rejoignent l'immobilier : une montre ne capitalise
   pas, elle est posee — la faire fructifier au taux du non cote serait le
   mensonge que cette poche refuse a un compte courant. Et sans elle nulle
   part, la somme des poches de projection cessait de faire le patrimoine
   net, la regle que ce fichier teste. */
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
/* Les poches de la projection, et ce qui les separe : non pas leur nature, mais
   ce qu'on peut dire de leur rendement.

   Trois et non deux. Le non cote et les liquidites partageaient une poche
   « autres actifs » sous un seul taux, et c'etait un melange indefendable : un
   livret a un taux connu, affiche par la banque, quand une part de societe non
   cotee n'en a aucun. Un seul pourcentage pour les deux forcait a choisir entre
   deux mensonges — sous-estimer le livret, ou inventer un rendement au non cote.

   La part plate reste a part : c'est l'immobilier net de sa dette, gele par
   decision, voir la note d'ETAT.md sur l'amortissement. */
/* Les trois poches de la projection, et ce qui capitalise dans chacune.

   Le cash a investir etait compte dans les actifs de marche, au motif qu'il
   leur est destine. Deux choses le condamnaient.

   La premiere est une contradiction interne : sur l'accueil, ce meme cash
   compte dans « Liquidites ». La meme somme portait donc deux classements
   selon l'ecran, et c'est le defaut que ce projet corrige partout ailleurs.

   La seconde est que l'application affirmait un rendement sur de l'argent qui
   n'en produit aucun. Elle refuse de le faire pour le non cote — zero par
   defaut, « c'est a toi de l'affirmer, pas a l'application » — et elle le
   faisait ici sans le demander. Du cash chez un courtier ne rapporte rien tant
   qu'il n'est pas place, quelle que soit son intention.

   Le versement mensuel, lui, va bien au marche : c'est une hypothese assumee et
   dite sous son reglage. La difference est qu'on choisit de verser, alors que
   le cash a investir est un etat de fait. */
function pochesProjection(t = nowTotals()) {
  return {
    marche: num(t.bourse) + num(t.crypto),
    nonCote: num(t.pe),
    liquidites: num(t.cash),
    /* `autres` reste rendu, somme des deux nouvelles : plusieurs appelants la
       lisent, et un total doit continuer d'egaler la somme de ses parts. */
    get autres() { return this.nonCote + this.liquidites; },
    plat: partPlate(t),
  };
}

function capitalisation(opts = {}) {
  const s = Object.assign(projectionSettings(), opts);
  const t = nowTotals();
  const poches = pochesProjection(t);
  const plat = opts.plat != null ? num(opts.plat) : poches.plat;

  /* `start` reste la base qui capitalise, entiere, pour que les appels qui la
     forcaient continuent de marcher — la fiche « horizon » et les tests. Quand
     elle n'est pas imposee, elle se repartit entre les deux poches ; quand elle
     l'est, tout va au marche, ce qui reproduit l'ancien comportement. */
  const start = opts.start != null ? num(opts.start) : poches.marche + poches.autres;
  const departMarche = opts.start != null ? num(opts.start) : poches.marche;
  /* Le reste se partage entre non cote et liquidites, chacun a son taux. Quand
     `start` est impose — la fiche « horizon », des tests — tout va au marche et
     ces deux poches sont vides : l'ancien comportement, a l'identique. */
  const resteAutres = start - departMarche;
  const partNonCote = poches.autres ? poches.nonCote / poches.autres : 0;
  const departNonCote = resteAutres * partNonCote;
  const departLiquides = resteAutres - departNonCote;
  const departAutres = resteAutres;

  const annees = opts.years || Math.max(...PROJECTION_HORIZONS);
  const rMois = Math.pow(1 + s.rate / 100, 1 / 12) - 1;
  /* Zero par defaut, donc le non cote reste plat tant que personne n'a affirme
     un rendement pour lui. Les liquidites, elles, ne capitalisent jamais : pas
     de taux, pas de reglage, elles traversent la projection telles quelles. */
  const rMoisNonCote = Math.pow(1 + num(s.rateAutres) / 100, 1 / 12) - 1;
  const anneeDebut = new Date().getFullYear();

  /* `total` doit toujours egaler `contributed` + `gains`. La part plate compte
     comme versee : elle est la des le depart et ne produit rien. Le depart de
     la poche « autres » aussi : il est acquis, seul ce qu'il produit est un
     gain. */
  const points = [{ year: anneeDebut, label: String(anneeDebut),
                    contributed: start + plat, gains: 0,
                    total: start + plat, real: start + plat }];
  let capital = departMarche, verse = departMarche;
  let nonCote = departNonCote, liquides = departLiquides;

  for (let mois = 1; mois <= annees * 12; mois++) {
    capital = capital * (1 + rMois) + s.monthly;
    verse += s.monthly;
    /* Les versements ne vont que dans le marche : on investit son epargne, on
       ne la pose pas sur un compte courant ni dans du non cote a volonte. */
    nonCote = nonCote * (1 + rMoisNonCote);
    /* `liquides` ne bouge pas : les liquidites sont portees a plat. La variable
       reste, parce qu'elle doit continuer d'entrer dans le total et dans ce qui
       est declare acquis. */
    if (mois % 12) continue;
    const an = mois / 12;
    const autres = nonCote + liquides;
    const gainsMarche = capital - verse;
    const gainsAutres = autres - departAutres;
    points.push({
      year: anneeDebut + an, label: String(anneeDebut + an),
      contributed: verse + departAutres + plat,
      gains: gainsMarche + gainsAutres,
      gainsMarche, gainsAutres,
      /* Le detail par poche, pour que la fiche des hypotheses puisse dire ce que
         chaque taux a produit sans refaire le calcul a cote. */
      gainsNonCote: nonCote - departNonCote,
      gainsLiquidites: liquides - departLiquides,
      total: capital + autres + plat,
      // pouvoir d'achat d'aujourd'hui, une fois l'inflation retirée
      real: (capital + autres + plat) / Math.pow(1 + s.inflation / 100, an),
    });
  }

  /* Les repères courants qui tiennent dans l'horizon, plus l'horizon
     lui-même : sinon choisir 60 ans afficherait un tableau qui s'arrête
     à 20. Au-delà de 20 ans on jalonne de 10 en 10, pour ne pas produire
     une liste de seize lignes. */
  const reperes = new Set(PROJECTION_HORIZONS.filter(h => h <= annees));
  for (let h = 30; h <= annees; h += 10) reperes.add(h);
  reperes.add(annees);
  const jalons = [...reperes].sort((a, b) => a - b)
    .filter(h => points[h])
    .map(h => Object.assign({ horizon: h }, points[h]));

  return { start, plat, poches, points, jalons, settings: s,
           targetReached: targetReachedAt(points, s.target) };
}

/* Ce qu'il faudrait changer pour atteindre une cible hors de portée. Trois
   leviers, chacun calculé en laissant les deux autres tels quels : attendre
   plus longtemps, verser davantage, ou viser un rendement supérieur. */
function targetRequirements({ start, target, monthly, rate, years }) {
  const T = num(target), P = num(start), M = num(monthly);
  const N = years * 12;
  const r = Math.pow(1 + num(rate) / 100, 1 / 12) - 1;
  const out = { reachable: false, years: null, monthly: null, rate: null };
  if (T <= P) { out.reachable = true; return out; }

  /* Combien d'années au rythme actuel. Valeur future d'une annuité :
     (P + M/r)·(1+r)^n − M/r = T  →  n = ln((T + M/r)/(P + M/r)) / ln(1+r) */
  if (r > 0) {
    const base = P + M / r, cible = T + M / r;
    if (base > 0) out.years = Math.log(cible / base) / Math.log(1 + r) / 12;
  } else if (M > 0) {
    out.years = (T - P) / M / 12;
  }
  if (!isFinite(out.years) || out.years <= 0) out.years = null;

  /* Versement mensuel pour y arriver dans l'horizon affiché. */
  const facteur = Math.pow(1 + r, N);
  if (r > 0) {
    const requis = (T - P * facteur) * r / (facteur - 1);
    out.monthly = requis > 0 ? requis : 0;
  } else if (N > 0) {
    out.monthly = Math.max(0, (T - P) / N);
  }

  /* Rendement nécessaire à versement inchangé : pas de forme fermée, on
     encadre par dichotomie entre 0 et 60 % par an. */
  const valeurFinale = tauxAnnuel => {
    const rm = Math.pow(1 + tauxAnnuel / 100, 1 / 12) - 1;
    if (rm === 0) return P + M * N;
    return P * Math.pow(1 + rm, N) + M * ((Math.pow(1 + rm, N) - 1) / rm);
  };
  if (valeurFinale(60) >= T) {
    let bas = 0, haut = 60;
    for (let k = 0; k < 60; k++) {
      const milieu = (bas + haut) / 2;
      if (valeurFinale(milieu) < T) bas = milieu; else haut = milieu;
    }
    out.rate = haut;
  }
  return out;
}

/* Première année où la cible est franchie, interpolée au mois près. */
function targetReachedAt(points, cible) {
  if (!cible || cible <= points[0].total) return null;
  for (let i = 1; i < points.length; i++) {
    if (points[i].total < cible) continue;
    const avant = points[i - 1], apres = points[i];
    const part = (cible - avant.total) / (apres.total - avant.total);
    const mois = Math.round(part * 12);
    return { year: avant.year + (mois === 12 ? 1 : 0), months: mois === 12 ? 0 : mois,
             yearsFromNow: (i - 1) + part };
  }
  return null;
}

/* Mois d'épargne restants avant la fin de l'année visée. Le mois en cours ne
   compte pas : son versement est censé être déjà fait. */
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

/* Les familles disent le **sujet**, pas la gravite. La table sert au filtre comme
   au menu de reglages : deux listes a tenir d'accord finiraient par diverger.

   Concretement, avant : faire taire « Cours vieux de 12 jours » coupait tous les
   avertissements, donc aussi « Epargne de precaution : 0,8 mois », qui n'a rien a
   voir. Un interrupteur qu'on ne peut pas actionner sans perdre autre chose n'est
   pas un reglage, c'est un piege.

   La gravite n'a pas disparu : elle trie toujours le panneau et colore la ligne.
   Elle a cesse d'etre ce qu'on eteint.

   Les anciens reglages, ranges sous action / error / warn / info, deviennent des
   cles inconnues et sont donc ignores : tout se rallume une fois. C'est le bon
   defaut — une famille qu'on n'a jamais vue ne peut pas avoir ete refusee, et
   celles-ci sont neuves. */
const FAMILLES_NOTIF = [
  ['saisies',   trad('Saisies en attente'),    trad('Le relevé du mois, les dépenses du mois clos')],
  ['cours',     trad('Cours de bourse'),       trad('Prix périmés, ligne sans identifiant ou sans cours')],
  ['credits',   trad('Crédits'),               trad('Capital restant dû à vérifier, mensualité hors budget')],
  ['echeances', trad('Échéances du non coté'), trad('Remboursement attendu, retard, défaut')],
  ['budget',    'Budget',                trad('Objectif intenable, épargne de précaution')],
  ['coherence', trad('Cohérence des données'), trad('Un chiffre faux, ou impossible')],
  //['warn', 'Avertissements', 'Un chiffre qui mérite un coup d\u2019oeil'],
];

/* La cle d'une notification, pour se souvenir qu'on l'a masquee.

   Les chiffres sortent du calcul : « Epargne de precaution : 0,7 mois » devient
   « 3,1 mois » le mois suivant, et une cle qui les garderait ferait reapparaitre
   la meme alerte a chaque centieme. Ce qui reste, ce sont les mots — ils disent
   de quel controle il s'agit. */
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
  /* Tout est allume par defaut : une notification qu'on n'a jamais vue ne peut
     pas avoir ete refusee. */
  for (const [cle] of FAMILLES_NOTIF) out[cle] = r[cle] !== false;
  return out;
}

function notifsMasquees() { return Store.state.meta?.notifsMasquees || []; }

function masquerNotif(cle) {
  const l = notifsMasquees();
  if (!l.includes(cle)) Store.state.meta.notifsMasquees = l.concat(cle);
}
function rendreNotifs() { Store.state.meta.notifsMasquees = []; }

/* Ce que la cloche montre : les controles, moins les familles eteintes, moins
   ce qu'on a masque, ranges par ce qui presse. */
function notifications() {
  const actives = reglagesNotifs();
  const masquees = notifsMasquees();
  return healthChecks()
    /*    La gravite continue de trier, juste en dessous.*/
    .filter(n => actives[n.sujet] !== false && !masquees.includes(cleNotif(n)))
    .map(n => ({ ...n, cle: cleNotif(n) }))
    .sort((a, b) => RANG_NOTIF[a.level] - RANG_NOTIF[b.level]);
}

/* =============================================================
   CONTRÔLES DE COHÉRENCE
   Repère les erreurs de saisie avant qu'elles ne faussent les analyses.
   ============================================================= */
function healthChecks() {
  const out = [];
  /* Le sujet se declare par section et non a chaque appel : dix-neuf controles,
     dont dix-sept partagent celui de leur voisin. Le passer en argument aurait
     fait dix-neuf occasions de se tromper pour une information qui change six
     fois. La variable se pose une fois par bloc, juste au-dessus de lui, la ou
     on la lit en meme temps que le controle qu'elle qualifie. */
  let sujet = 'coherence';
  const add = (level, title, detail, view) => out.push({ level, sujet, title, detail, view });

  // --- positions ---
  sujet = 'cours';
  for (const p of Store.state.positions) {
    if ((p.isin || '').trim() && !isinIsValid(p.isin))
      add('error', `ISIN invalide sur « ${p.name} »`, `${p.isin}, clé de contrôle incorrecte`, 'positions');
    if (!p.manual && !(p.symbol || '').trim() && !(p.isin || '').trim())
      add('warn', `« ${p.name} » sans identifiant`, 'Ni ISIN ni symbole : le cours ne peut pas être récupéré', 'positions');
    if (!p.manual && !num(p.qty))
      add('warn', `« ${p.name} » a une quantité nulle`, 'La ligne compte pour 0 € dans le portefeuille', 'positions');
    if (!p.manual && !num(p.price))
      add('warn', `« ${p.name} » n'a pas de cours`, 'Valeur calculée à 0 €', 'positions');
  }

  /* --- cours ---
     Rien de tout cela n'a de sens sans titre cote. Quelqu'un qui n'investit qu'en
     non cote et en immobilier n'a pas de cours a rafraichir : lui reclamer une
     actualisation, ou lui annoncer que ses prix sont vieux de trois cents jours,
     c'est le harceler pour une fonction qu'il n'utilise pas. La cloche doit
     montrer ce qui est faux chez celui qui la regarde. */
  if (Store.state.positions.length) {
    const last = Store.state.quotes?.lastRun;
    if (!last) add('info', 'Cours jamais actualisés', 'Les prix viennent du sheet, pas du marché', 'positions');
    else {
      const days = (Date.now() - new Date(last)) / 86400000;
      if (days > 7) add('warn', `Cours vieux de ${Math.round(days)} jours`,
        'Valorisation et allocation sont décalées du marché', 'positions');
    }
  }

  sujet = 'credits';
  /* --- crédits orphelins ---
     Un crédit sur un établissement qui ne porte plus aucun compte : le bien
     qu'il finançait a été supprimé, le prêt est resté. Il se soustrait
     toujours du patrimoine net, et plus aucun écran ne le montre puisque la
     liste des comptes saute les établissements vides. C'est le pire genre
     d'erreur — un chiffre faux que rien ne trahit. */
  for (const e of ETABS()) {
    const du = (e.dettes || []).reduce((s, d) => s + num(d.montant), 0);
    if (!du) continue;
    if (COMPTES().some(c => c.etabId === e.id)) continue;
    add('error', `Crédit sans bien chez ${e.nom}`,
      `${fmtEUR0(du)} de capital restant dû se soustraient encore de ton patrimoine net, `
      + `alors que plus aucun compte n'est rattaché. Ouvre la fiche pour retirer le crédit.`,
      'accounts');
  }

  /* --- un capital restant dû qui a vieilli ---
     C'est le seul champ de l'application qui devient faux sans que personne y
     touche : chaque mensualité le réduit, l'écran ne bouge pas, et le patrimoine
     net dérive de quelques centaines d'euros par mois. Au bout d'un an, l'erreur
     vaut une année de remboursement.

     L'alerte ne dit pas « pensez-y » : elle porte le montant projeté depuis la
     mensualité et le taux, pour que la correction soit une lecture et non un
     calcul. Elle ne se déclenche qu'au bout de trois mois — en dessous, l'écart
     est inférieur à la marge d'un tableau d'amortissement approché. */
  sujet = 'echeances';
  /* --- les échéances du non coté ---
     Trois situations, trois niveaux. Une date dépassée sans déclaration est une
     saisie en attente : l'argent est peut-être arrivé, personne ne l'a dit. Un
     retard déclaré mérite un œil. Un défaut est une perte probable qui compte
     encore pour sa valeur pleine dans le patrimoine, et ça, c'est une erreur au
     sens de ce projet : un chiffre que rien ne trahit. */
  for (const e of echeances()) {
    if (e.depassee) {
      add('action', `« ${e.libelle} » a passé son échéance`,
        `Échéance au ${fmtDate(e.echeance)}, il y a ${Math.abs(e.jours)} jours, et la ligne `
        + `est toujours en cours pour ${fmtEUR0(e.valeur)}. Si l'argent est rentré, `
        + `passe-la en « Remboursé » et baisse son montant ; sinon marque-la en retard.`,
        'accounts');
    } else if (e.statut === 'retard') {
      add('warn', `« ${e.libelle} » en retard`,
        `${fmtEUR0(e.valeur)} chez ${e.etab}, échéance du ${fmtDate(e.echeance)}.`, 'accounts');
    } else if (e.statut === 'defaut') {
      add('error', `« ${e.libelle} » en défaut`,
        `${fmtEUR0(e.valeur)} comptent encore en entier dans ton patrimoine. Si tu `
        + `n'espères plus rien, baisse le montant : c'est la seule façon que ton `
        + `patrimoine net dise la vérité.`, 'accounts');
    }
  }

  sujet = 'coherence';
  /* --- un patrimoine net négatif ---
     Arithmétiquement possible, et parfois vrai : un prêt étudiant, un
     surendettement, les premières années d'un crédit sur un bien qui a perdu de
     la valeur. Mais neuf fois sur dix, c'est une dette saisie sans le bien
     qu'elle finance — on note le prêt, on remet à plus tard la déclaration de la
     maison, et l'application annonce un patrimoine effondré.

     Elle ne triche pas avec le chiffre : il reste ce qu'il est. Elle nomme la
     cause la plus probable, et l'écart exact à combler. */
  {
    const p = patrimoine();
    if (p.net < 0 && p.dettes > 0) {
      const cr = creditsEnCours().lignes.sort((a, b) => b.reste - a.reste)[0];
      add('error', 'Patrimoine net négatif',
        `Tes crédits (${fmtEUR0(p.dettes)}) dépassent tes avoirs (${fmtEUR0(p.brut)}) `
        + `de ${fmtEUR0(-p.net)}. Si l'un d'eux finance un bien`
        + (cr ? ` (le plus gros est « ${cr.libelle} », ${fmtEUR0(cr.reste)})` : '')
        + `, déclare ce bien : sa valeur doit figurer dans tes avoirs, sinon seule `
        + `la dette compte. Un crédit immobilier sans son logement fait plonger le net.`,
        'accounts');
    }
  }

  sujet = 'credits';
  /* Les alertes de credit menent aux Comptes, la ou vivent les credits. */
  /* --- une mensualité de crédit hors du budget ---
     Un crédit porte une mensualité, aucune charge fixe ne la rembourse : cet
     argent sort tous les mois et le budget l'ignore, donc le reste à vivre et
     l'épargne théorique sont surestimés d'autant. La fenêtre du crédit propose la
     charge au moment où on la saisit ; cette alerte rattrape les crédits déclarés
     avant, et les « non » regrettés. Elle se masque d'un geste, comme les autres :
     si la mensualité figure déjà dans les charges sous un autre nom, il n'y a
     rien à corriger et rien à répéter. */
  for (const c of creditsEnCours().lignes) {
    if (!c.mensualite || c.charge) continue;
    add('action', `Mensualité de « ${c.libelle} » hors du budget`,
      `${fmtEUR0(c.mensualite)} par mois sortent de ton compte sans figurer dans tes `
      + `charges fixes. Ouvre le crédit pour créer la ligne, ou rattache-lui la charge `
      + `existante si elle y est déjà sous un autre nom.`, 'accounts');
  }

  sujet = 'credits';
  /* --- un solde qu'on n'a pas regardé depuis trois mois ---
     Le rappel ne dépend pas d'une mensualité, et c'est le cas du levier d'un
     courtier qui l'a montré : sans échéances, il n'y avait aucun rappel — alors
     que c'est le solde qui bouge le plus, puisque les intérêts le font grossir
     tout seul et qu'un arbitrage le change du jour au lendemain.

     Trois messages selon ce que l'application sait dire. Avec des échéances, le
     montant amorti. Avec un taux seul, le montant capitalisé. Sans rien, la date
     et l'établissement où aller lire. Dans les trois cas c'est une saisie en
     attente, et elle se masque d'un geste. */
  const RAPPEL_CREDIT_MOIS = 3;
  for (const c of creditsEnCours().lignes) {
    if (!c.verifieLe) {
      add('action', `Crédit « ${c.libelle} » jamais vérifié`,
        `${fmtEUR0(c.reste)} de capital restant dû, sans date de dernière vérification. `
        + `Ouvre-le une fois : l'application saura ensuite suivre son évolution.`, 'accounts');
      continue;
    }
    if (c.moisDepuis < RAPPEL_CREDIT_MOIS) continue;
    if (c.projete == null) {
      add('action', `Crédit « ${c.libelle} » à relever`,
        `Vérifié il y a ${c.moisDepuis} mois, et rien ne permet d'en déduire le solde `
        + `d'aujourd'hui : ni échéances, ni taux. Va lire le montant chez ${c.etabNom} `
        + `et corrige-le, c'est ${fmtEUR0(c.reste)} qui pèsent sur ton patrimoine net.`,
        'accounts');
      continue;
    }
    if (Math.abs(c.ecart) < 1) continue;
    add('action', `Crédit « ${c.libelle} » à mettre à jour`,
      c.sens === 'monte'
        ? `Vérifié il y a ${c.moisDepuis} mois. Sans échéances, les intérêts le font `
          + `grossir : à ${fmtNombre(c.taux)} % l'an il devrait atteindre `
          + `${fmtEUR0(c.projete)} au lieu de ${fmtEUR0(c.reste)}. Relève le solde chez `
          + `${c.etabNom} : ton patrimoine net est surestimé de ${fmtEUR0(-c.ecart)}.`
        : `Vérifié il y a ${c.moisDepuis} mois. D'après ta mensualité, il devrait rester `
          + `${fmtEUR0(c.projete)} au lieu de ${fmtEUR0(c.reste)} : ${fmtEUR0(c.ecart)} de `
          + `patrimoine net que l'application ne compte pas encore.`, 'accounts');
  }

  sujet = 'coherence';
  // --- allocation ---
  /* Les cibles vivent dans `targets.classes` depuis que le rééquilibrage
     raisonne par classe d'actif. Ce contrôle additionnait encore `coreEtf`,
     `satellites` et `gold`, disparus à la migration : trois `undefined` font
     un NaN, et l'alerte réclamait donc 100 % en permanence à quelqu'un qui les
     avait déjà. Même définition que `rebalanceRows()` — une classe mise hors
     jeu ne compte pas, son encours a quitté la base. */
  const sum = sommeCibles();
  /* Aucune cible posée n'est pas une incohérence, c'est un réglage jamais
     fait : on ne réclame 100 % qu'à qui a commencé à en fixer. */
  if (sum > 0 && Math.abs(sum - 100) > 0.05)
    add('warn', `Cibles d'allocation à ${fmtPct(sum, 1)}`,
      'La somme devrait faire 100 % pour que les montants cibles aient un sens', 'rebalance');

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
    [trousReleves(), 'des relevés', 'history'],
    [trousDepenses(), 'des dépenses', 'budget'],
  ]) {
    if (!trous.length) continue;
    const noms = trous.map(fmtMonth);
    /* Trois au plus dans le detail : une liste de quatorze mois deborde la
       ligne de la cloche et ne se lit pas. Le compte, lui, est toujours dit. */
    const cite = noms.length > 3 ? `${noms.slice(0, 3).join(', ')}…` : noms.join(', ');
    add('warn', `Trou dans l'historique ${quoi}`,
      `${noms.length} mois sans donnée : ${cite}. Les moyennes se calculent sur ce qui reste.`,
      vue);
  }

  sujet = 'saisies';
  /* --- relevé du mois ---
     On ne signale plus l'écart entre la photo actuelle et la ligne du mois :
     le relevé est figé le 1er, donc l'écart se creuse naturellement au fil du
     mois. C'était une alerte garantie fausse. Reste le seul cas utile : le
     mois n'a pas encore été enregistré du tout. */
  /* Le releve du mois en cours, et il passe par `currentMonthPending` : un
     rappel repousse ou tu pour le mois ne doit pas ressortir ici. Ce controle
     lisait l'etat brut, donc « Plus tard » eteignait le bandeau et la pastille
     de la barre du bas, mais pas cette ligne — ni la cloche qui la reprend.
     Un seul endroit decide qu'une saisie reclame quelque chose.

     Le bouton « Snapshot du mois » n'existe plus : c'est le ⤒ de la ligne,
     allume sur le mois qui attend. Une consigne qui nomme un bouton absent est
     pire qu'une consigne vague. */
  const relEnAttente = currentMonthPending();
  if (relEnAttente.missing) {
    add('action', `${trad('Relevé de')} ${relEnAttente.label} ${trad('à enregistrer')}`,
      trad('Le bouton ⤒ de sa ligne y reprend tous les montants actuels'), 'history');
  }

  sujet = 'budget';
  // --- budget ---
  const b = Store.state.budget;
  /* Les depenses reclamees sont celles du mois clos, pas du mois en cours : le
     2 aout, personne ne sait ce qu'aout coutera. `depensesEnAttente` porte cette
     regle, et le report avec. Ce controle visait le mois courant, et allumait
     donc une alerte du 1er au 31 sur un mois qu'on ne peut pas encore saisir. */
  const depEnAttente = depensesEnAttente();
  if (depEnAttente.missing)
    add('action', `Dépenses de ${depEnAttente.label} à saisir`,
      trad('Le mois est clos, ce qu’il a coûté reste à enregistrer'), 'budget');

  const f = budgetFrame();
  if (f.available < f.target)
    add('error', 'Objectif de dépenses au-dessus du reste pour vivre',
      `${fmtEUR0(f.target)} visés pour ${fmtEUR0(f.available)} disponibles`, 'budget');

  sujet = 'budget';
  // --- épargne de précaution ---
  const rw = runway();
  if (rw.immediateMonths < 3)
    /* Le montant cité est celui qui sert au calcul — le palier « disponible
       tout de suite ». Le message affichait `nowByGroup().cash`, qui compte
       aussi le cash posé chez un courtier : il annonçait donc une somme dont
       les mois affichés ne tenaient pas compte, et l'écart s'est creusé le
       jour où ce cash a rejoint les liquidités.
       Et `toFixed(1)` écrivait « 0.7 mois », seul point décimal d'une
       application qui met des virgules partout ailleurs. */
    add('warn', `${trad('Épargne de précaution')} : ${fmtNombre(Math.round(rw.immediateMonths * 10) / 10)} ${trad('mois')}`,
      `${trad('Disponible tout de suite')} ${fmtEUR0(rw.immediate)} ${trad('pour')} ${fmtEUR0(rw.burn)} ${trad('de coût mensuel, la règle courante est 3 à 6 mois')}`, 'overview');

  return out;
}

/* --- plus/moins-values portefeuille titres --- */
/*   `perfAnnualisee()` et `perfAnnualiseePortefeuille()` vivaient ici. Elles
   étalaient la plus-value d'une ligne sur la durée depuis sa date d'achat, ce
   qui ne tient que si l'argent est arrivé d'un coup.

   Une case « alimentée régulièrement » a été envisagée puis écartée : elle
   aurait demandé du travail pour que l'application cesse de mentir, et sur un
   portefeuille où les grosses lignes sont justement celles qu'on alimente, elle
   aurait éteint le chiffre là où il portait la valeur.

   Ce qui reste dit vrai : l'écart en euros et en pourcentage, qui ne dépend pas
   de la façon dont la ligne s'est constituée. La fiche annonce la durée de
   détention comme un fait — c'était l'information qui manquait au pourcentage,
   et elle n'a pas besoin d'être transformée en taux pour la donner.

   `dateAchat` reste, et sert toujours : c'est elle qui empêche l'écart du jour
   de compter une baisse d'avant l'achat. */

/* « 2 ans et 3 mois », pas « 2,25 ans ». */
function fmtDuree(annees) {
  const mois = Math.round(annees * 12);
  const a = Math.floor(mois / 12), m = mois % 12;
  if (!a) return `${m} mois`;
  return `${a} an${a > 1 ? 's' : ''}${m ? ` et ${m} mois` : ''}`;
}

function portfolioPnl() {
  const ps = Store.state.positions;
  const value = ps.reduce((s, p) => s + posValue(p), 0);
  const invested = ps.reduce((s, p) => s + posInvested(p), 0);
  return { value, invested, pnl: value - invested, pct: invested ? (value / invested - 1) * 100 : 0 };
}
