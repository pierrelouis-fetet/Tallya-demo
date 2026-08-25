/* Harnais de test minimal, sans dépendance ni étape de compilation.

   Le projet n'a ni npm ni Node : il tient dans des balises <script> et se sert
   par `serve.py`. Un lanceur de tests importé du dehors aurait ajouté à lui
   seul plus de machinerie que le code qu'il vérifie. Cinquante lignes
   suffisent à ce dont on a besoin — grouper, comparer, compter.

   Les assertions lèvent une exception : le premier échec arrête le cas de test
   et le suivant démarre. Un test qui continue après un échec produit des
   cascades d'erreurs dérivées qui masquent la vraie. */
const Tests = (() => {
  const suites = [];
  let courante = null;

  /* Le corps de la suite est retenu sous forme de texte. C'est ce qui permet de
     savoir quels fichiers elle lit — `lireSource('assets/app.js')` — sans tenir
     de liste a cote, qui divergerait au premier deplacement de test. La regle
     de la maison vaut ici comme ailleurs : une liste se derive. */
  function suite(nom, fn) {
    courante = { nom, cas: [], source: String(fn) };
    suites.push(courante);
    fn();
    courante = null;
  }

  function test(nom, fn) {
    if (!courante) throw new Error(`test « ${nom} » déclaré hors de toute suite`);
    courante.cas.push({ nom, fn });
  }

  /* Les montants ne se comparent jamais au bit près : 0,1 + 0,2 vaut
     0,30000000000000004 en virgule flottante, et un patrimoine se somme sur
     des dizaines de lignes. Un demi-centime de tolérance. */
  const TOLERANCE = 0.005;

  function nombre(v) {
    return typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 6 }) : String(v);
  }

  function pres(obtenu, attendu, message = '') {
    if (typeof obtenu !== 'number' || !Number.isFinite(obtenu))
      throw new Error(`${message}\n  attendu un nombre, obtenu ${JSON.stringify(obtenu)}`);
    const ecart = Math.abs(obtenu - attendu);
    if (ecart > TOLERANCE)
      throw new Error(`${message}\n  attendu ${nombre(attendu)}\n  obtenu  ${nombre(obtenu)}\n  écart   ${nombre(ecart)}`);
  }

  function eq(obtenu, attendu, message = '') {
    if (obtenu !== attendu)
      throw new Error(`${message}\n  attendu ${JSON.stringify(attendu)}\n  obtenu  ${JSON.stringify(obtenu)}`);
  }

  function vrai(condition, message = '') {
    if (!condition) throw new Error(message || 'condition fausse');
  }

  function leve(fn, message = '') {
    let a = false;
    try { fn(); } catch (e) { a = true; }
    if (!a) throw new Error(`${message}\n  aucune exception levée`);
  }

  /* `await` sur chaque cas, et le lanceur devient asynchrone. Sans lui, un test
     asynchrone etait compte vert avant de s'executer et sa promesse rejetee
     partait dans le vide : le harnais affirmait le contraire de ce qu'il
     mesurait. Un `await` sur une valeur qui n'est pas une promesse ne coute
     rien, donc les cas synchrones ne changent pas de comportement. */
  /* Choisir un sous-ensemble de suites.

     Deux facons de designer, et la seconde est celle qui colle a cette base de
     code : par NOM, quand on sait ce qu'on cherche, et par FICHIER TOUCHE,
     quand on vient de modifier `app.js` et qu'on veut ce qui le lit. Le second
     se derive du corps des suites, il ne se tient pas a la main.

     `touche=calcul` designe le complement : les suites qui ne lisent aucune
     source, donc celles qui font tourner le modele sur des nombres. C'est la
     moitie qui compte quand un calcul change, et aucun nom de fichier ne la
     designe.

     Une selection vide est une erreur, pas un vert : un motif qui ne matche
     rien rendrait « 0 test » avec une coche, ce qui est le pire des verts. */
  function choisir({ nom = '', touche = '' } = {}) {
    let choix = suites;
    if (nom) {
      const motif = new RegExp(nom, 'i');
      choix = choix.filter(s => motif.test(s.nom));
    }
    if (touche === 'calcul') {
      choix = choix.filter(s => !s.source.includes('lireSource('));
    } else if (touche) {
      choix = choix.filter(s => s.source.includes(`lireSource('${touche}'`));
    }
    return choix;
  }

  async function run(selection = {}) {
    const partiel = !!(selection.nom || selection.touche);
    const choix = choisir(selection);
    if (partiel && !choix.length) {
      throw new Error(`aucune suite ne correspond a ${JSON.stringify(selection)}`);
    }
    const resultats = [];
    let ok = 0, ko = 0;
    for (const s of choix) {
      const cas = [];
      for (const c of s.cas) {
        try { await c.fn(); cas.push({ nom: c.nom, ok: true }); ok++; }
        catch (e) { cas.push({ nom: c.nom, ok: false, erreur: e.message || String(e) }); ko++; }
      }
      resultats.push({ nom: s.nom, cas });
    }
    /* `partiel` voyage avec le resultat : la page et le lanceur en dependent
       tous les deux pour ne pas presenter un vert partiel comme un vert. */
    return { resultats, ok, ko, total: ok + ko, partiel, suites: choix.length };
  }

  return { suite, test, pres, eq, vrai, leve, run, choisir };
})();
