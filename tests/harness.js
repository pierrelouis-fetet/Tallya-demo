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

  function suite(nom, fn) {
    courante = { nom, cas: [] };
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

  function run() {
    const resultats = [];
    let ok = 0, ko = 0;
    for (const s of suites) {
      const cas = [];
      for (const c of s.cas) {
        try { c.fn(); cas.push({ nom: c.nom, ok: true }); ok++; }
        catch (e) { cas.push({ nom: c.nom, ok: false, erreur: e.message || String(e) }); ko++; }
      }
      resultats.push({ nom: s.nom, cas });
    }
    return { resultats, ok, ko, total: ok + ko };
  }

  return { suite, test, pres, eq, vrai, leve, run };
})();
