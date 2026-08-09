/* =============================================================
   I18N — français par défaut, anglais en option.

   Deux principes :
   - la clé est en anglais, la valeur en français : si une clé manque en
     anglais, on retombe sur le français plutôt que d'afficher une clé nue ;
   - les libellés balisés `data-i18n` dans index.html sont traduits au
     chargement, le reste passe par t() dans les vues.

   Le chantier est progressif : chaque chaîne traduite ici disparaît du
   français en dur. Ce qui n'est pas encore dans le dictionnaire reste en
   français dans les deux langues — visible, donc facile à repérer.
   ============================================================= */

const LANGS = [['fr', 'Français'], ['en', 'English']];
const LANG_KEY = 'wealth-dashboard:lang';

function currentLang() {
  try { return localStorage.getItem(LANG_KEY) || 'fr'; } catch (e) { return 'fr'; }
}

function setLang(code) {
  try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
}

const I18N = {
  en: {
    /* --- navigation --- */
    'nav.group.tracking': 'Steering',
    'nav.group.monthly': 'Tracking',
    'nav.group.portfolio': 'Portfolio',
    'nav.group.settings': 'Settings',
    'nav.overview': 'Overview',
    'nav.performance': 'Performance',
    'nav.objective': 'Projection',
    /* La rubrique dit deja « mensuel » : le libelle du menu s'allege. Le
       titre de la vue, lui, reste complet — il s'affiche sans ce contexte. */
    'nav.history': 'Statements',
    'nav.budget': 'Budget',
    'nav.positions': 'Markets',
    'nav.allocation': 'Allocation',
    'nav.rebalance': 'Rebalancing',
    'nav.accounts': 'Assets',
    'nav.data': 'Data',
    'nav.settings': 'Preferences',
    'nav.notifications': 'Notifications',
    'nav.networth': 'Net worth',
    'nav.theme': 'Theme',

    /* --- titres et sous-titres des vues --- */
    'view.overview': 'Overview',
    'view.overview.sub': 'A snapshot of your wealth',
    'view.positions': 'Markets',
    'view.positions.sub': 'Your holdings, live',
    'view.allocation': 'Allocation',
    'view.allocation.sub': 'Where your money actually sits',
    'view.allocation.reel.sub': 'Everything you own, and how it is split',
    'view.allocation.cible.sub': 'What you aim for on the part you can steer',
    'view.overview.projection': 'Projection',
    'view.overview.projection.sub': "Where your assumptions take your wealth",
    'view.overview.aujourdhui': 'Overview',
    'view.overview.aujourdhui.sub': 'A snapshot of your wealth',
    'view.positions.performance.sub': 'Unrealised and realised gains',
    'view.budget': 'Budget',
    'view.budget.sub': 'Income, fixed costs and day-to-day spending',
    'view.budget.releves.sub': 'Month by month, account by account',
    'view.budget.cadre.sub': 'What leaves every month without you thinking about it',
    'view.accounts': 'Assets',
    'view.accounts.sub': 'What you hold, and where it sits',
    'view.data': 'Data',
    'view.data.sub': 'Export, import and reset',
    'view.settings': 'Preferences',
    'view.settings.sub': 'Language, appearance and app behaviour',
    'view.notifications': 'Notifications',
    'view.notifications.sub': 'What the bell is allowed to tell you',

    /* --- préférences --- */
    'settings.language': 'Language',
    'settings.language.label': 'Interface language',
    'settings.language.hint': 'Amounts stay in euros, only the wording changes.',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.theme.dark': 'Dark',
    'settings.theme.light': 'Light',
    'settings.behaviour': 'Behaviour',
    'settings.autorefresh': 'Refresh prices on load',
    'settings.autorefresh.on': 'Yes, fetch prices automatically',
    'settings.autorefresh.off': 'No, only when I ask',
    'settings.autorefresh.hint': 'Needs the price gateway to be reachable.',
    'settings.exchange': 'Preferred exchange',
    'settings.exchange.hint': 'Used when an ISIN is listed on several venues.',
    'settings.data': 'Your data',
    'settings.data.hint': 'Export, import, automatic backups and reset live in the Data tab.',
    'settings.data.cta': 'Open Data',

    /* --- périodes --- */
    'range.ytd': 'YTD',
    'range.1y': '1 year',
    'range.all': 'All',
    'range.other': 'Other range',
    'range.years': '{n} years',
  },
};

/* Traduit une clé. En français on renvoie le texte de repli tel quel :
   c'est la langue source, elle n'a pas de dictionnaire à maintenir. */
function t(cle, repli) {
  const lang = currentLang();
  if (lang === 'fr') return repli !== undefined ? repli : FR[cle] ?? cle;
  return I18N[lang]?.[cle] ?? (repli !== undefined ? repli : FR[cle] ?? cle);
}

/* Les libellés français des clés utilisées hors des vues (nav, préférences). */
const FR = {
  'nav.group.tracking': 'Pilotage',
  'nav.group.monthly': 'Suivi',
  'nav.group.portfolio': 'Portefeuille',
  'nav.group.settings': 'Réglages',
  'nav.overview': "Vue d'ensemble",
  'nav.performance': 'Performance',
/* « Objectif » nommait la page d'apres une seule de ses cinq cartes, et
     cette carte est aussi sur l'accueil : l'entree de menu menait donc a la
     projection pendant que son homonyme vivait ailleurs. Quatre cartes sur
     cinq sont la trajectoire longue. « Trajectoire » etait ecarte, c'est deja
     le nom d'une carte a l'interieur — le meme defaut d'un cran plus bas. */
  'nav.objective': 'Projection',
  'nav.history': 'Relevés',
  'nav.budget': 'Budget',
  'nav.positions': 'Marchés',
  'nav.allocation': 'Allocation',
  'nav.rebalance': 'Rééquilibrage',
  'nav.accounts': 'Actifs',
  'nav.data': 'Données',
  'nav.settings': 'Préférences',
  'nav.notifications': 'Notifications',
  'nav.networth': 'Patrimoine net',
  'nav.theme': 'Thème',

  'view.overview': "Vue d'ensemble",
  'view.overview.sub': 'Photo instantanée de ton patrimoine',
  'view.positions': 'Marchés',
  'view.positions.sub': 'Tes lignes de titres, en direct',
  'view.allocation': 'Allocation',
  /* Un sous-titre par onglet : « Allocation » couvre deux sujets, et le
     sous-titre unique en decrivait forcement un seul. Celui-ci reste comme
     repli, il ne s'affiche plus tant que les deux onglets existent. */
  'view.allocation.sub': 'Où est réellement placé ton argent',
  'view.allocation.reel.sub': 'Tout ce que tu possèdes, et comment c’est réparti',
  'view.allocation.cible.sub': 'Ce que tu vises sur la part que tu peux arbitrer',
  /* Projection est un onglet de la vue d'ensemble : ces deux cles portent le
     titre et le sous-titre quand cet onglet est ouvert, sans quoi la page
     s'annoncerait « Vue d'ensemble ». Meme mecanisme que les onglets
     d'Allocation. */
  'view.overview.projection': 'Projection',
  'view.overview.projection.sub': "Où tes hypothèses mènent ton patrimoine",
  'view.overview.aujourdhui': "Vue d'ensemble",
  'view.overview.aujourdhui.sub': 'Photo instantanée de ton patrimoine',
  /* Trois sous-titres qui ne se sont jamais affiches. Ils s'appelaient
     `view.performance.sub`, `view.history.sub` et `view.rebalance.sub` — des
     noms de route, herites du temps ou ces ecrans etaient des vues a part
     entiere. Le rendu, lui, cherche `view.<vue>.<onglet>.sub`, donc il ne les
     trouvait pas et servait le sous-titre du parent : l'onglet Performance
     s'annonçait « Tes lignes de titres, en direct », et Releves aussi.

     Les textes etaient justes, c'est leur nom qui ne l'etait pas. Deux d'entre
     eux avaient meme deja un double correctement nomme — la copie route est
     partie, pas le texte. */
  'view.positions.performance.sub': 'Plus-values latentes et encaissées',
  'view.budget': 'Budget',
  'view.budget.sub': 'Revenus, charges fixes et dépenses du quotidien',
  'view.budget.releves.sub': 'Mois par mois, compte par compte',
  'view.budget.cadre.sub': 'Ce qui sort chaque mois sans que tu y penses',
  'view.accounts': 'Actifs',
  'view.accounts.sub': 'Ce que tu possèdes, et où c’est tenu',
  'view.data': 'Données',
  'view.data.sub': 'Export, import et remise à zéro',
  'view.settings': 'Préférences',
  'view.settings.sub': "Langue, apparence et comportement de l'app",
  'view.notifications': 'Notifications',
  'view.notifications.sub': 'Ce que la cloche a le droit de dire',

  'settings.language': 'Langue',
  'settings.language.label': "Langue de l'interface",
  'settings.language.hint': 'Les montants restent en euros, seuls les libellés changent.',
  'settings.appearance': 'Apparence',
  'settings.theme': 'Thème',
  'settings.theme.dark': 'Sombre',
  'settings.theme.light': 'Clair',
  'settings.behaviour': 'Comportement',
  'settings.autorefresh': 'Actualiser les cours au chargement',
  'settings.autorefresh.on': 'Oui, chercher les cours automatiquement',
  'settings.autorefresh.off': 'Non, seulement quand je le demande',
  'settings.autorefresh.hint': 'Nécessite que la passerelle de cours réponde.',
  'settings.exchange': 'Place privilégiée',
  'settings.exchange.hint': 'Sert à départager un ISIN coté sur plusieurs marchés.',
  'settings.data': 'Tes données',
  'settings.data.hint': "Export, import, sauvegardes automatiques et remise à zéro se trouvent dans l'onglet Données.",
  'settings.data.cta': 'Ouvrir Données',

  'range.ytd': 'YTD',
  'range.1y': '1 an',
  'range.all': 'Tout',
  'range.other': 'Autre durée',
  'range.years': '{n} ans',
};

/* Applique les traductions aux libellés statiques d'index.html. */
function translateStatic() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  document.documentElement.lang = currentLang();
}
