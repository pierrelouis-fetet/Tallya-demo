
const CloudSync = (() => {

  const WRITE_DELAY = 2500;

  const SYNCED_KEY = 'wealth-dashboard:synced-at';
  const lastSyncedAt = () => { try { return localStorage.getItem(SYNCED_KEY); } catch (e) { return null; } };
  const markSynced = at => { try { localStorage.setItem(SYNCED_KEY, at || ''); } catch (e) {} };

  let available = false;        // /api/state répond
  let user = null;              // email Cloudflare Access
  let timer = null;
  let lastPayload = null;       // évite les écritures identiques
  let status = { lastPush: null, error: null, conflict: null, pushing: false };
  let onChange = () => {};
  let onConflit = () => {};

  const setOnChange = fn => { onChange = fn; };
  const setOnConflit = fn => { onConflit = fn; };

  /* Noter la version qu'on vient de lire. Le repere sert de `base` a la
     prochaine ecriture, et il doit donc se poser aussi quand on adopte l'etat du
     cloud sans l'avoir ecrit : sinon la sauvegarde suivante declare avoir lu une
     version qui n'est plus en place, et se fait refuser sans raison. */
  const noterVersionLue = at => { markSynced(at); status.conflict = null; };

  async function probe() {
    const d = await Quotes.healthData();
    available = !!d && d.storage === 'kv';
    user = (d && d.user) || null;
    return available;
  }

  async function pull() {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (r.status === 204) return null;
    if (!r.ok) throw new Error(`lecture impossible (HTTP ${r.status})`);
    return r.json();
  }

  /* Un seul envoi en vol a la fois.

     Rien ne l'empechait, et l'envoi immediat a chaque geste rendait le defaut
     atteignable : deux clics rapproches lançaient deux `PUT` concurrents, et
     c'est le plus lent qui arrivait en dernier — donc potentiellement un etat
     plus ancien, ecrit par-dessus le plus recent. Sur un reseau mobile ou les
     latences varient d'un facteur trois, ce n'est pas une hypothese d'ecole.

     Quand un envoi est deja parti, on ne l'annule pas : on note qu'il faudra
     recommencer, et le `finally` s'en charge. Le dernier etat gagne toujours,
     puisque `push()` relit `Store.state` a chaque tour. */
  let enVol = null;
  let aRejouer = false;
  const RETRY_DELAY = 15000;
  let reessaiArme = false;

  async function push(opts = {}) {
    if (enVol) { aRejouer = true; return enVol; }
    enVol = pushMaintenant(opts);
    try { return await enVol; }
    finally {
      enVol = null;
      if (aRejouer) { aRejouer = false; push(opts); }
    }
  }

  async function pushMaintenant({ force = false } = {}) {
    if (!available) return { skipped: true };
    const payload = JSON.stringify(Store.state);
    if (!force && payload === lastPayload) return { skipped: true };

    /* L'horodatage de CE qu'on envoie, releve au moment de la serialisation.

       `markSynced(Store.state.meta.savedAt)` le lisait apres la reponse du
       reseau. Une frappe pendant l'aller-retour — et il y en a, l'application
       ecrit a chaque caractere — et l'on marquait comme synchronise un etat plus
       recent que celui reellement envoye. La modification suivante devenait donc
       invisible au conflit, et pouvait etre ecrasee sans un mot. */
    const envoyeAt = Store.state?.meta?.savedAt;

    status.pushing = true;
    try {
      /* La version qu'on a lue part avec l'ecriture : le serveur n'accepte que si
         c'est encore celle en place. Voir la note de `handleState()` dans
         `_worker.js`, le seul point d'entree que Cloudflare Pages charge.
         Sans ce parametre, un onglet ouvert depuis des heures ecrasait ce qu'un
         autre appareil venait d'enregistrer, sur la seule foi d'une estampille
         plus fraiche. */
      const vu = lastSyncedAt();
      const params = force ? '?force=1' : (vu ? `?base=${encodeURIComponent(vu)}` : '');
      const r = await fetch('/api/state' + params, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (r.status === 409) {
        const d = await r.json();
        status.conflict = d;                 // une version plus récente existe en ligne
        status.error = null;
        onConflit(d);
        return { conflict: d };
      }
      if (!r.ok) throw new Error(`écriture impossible (HTTP ${r.status})`);

      lastPayload = payload;
      markSynced(envoyeAt);
      status.lastPush = new Date().toISOString();
      status.error = null;
      status.conflict = null;
      return { ok: true };
    } catch (e) {
      status.error = e.message;
      /* Un echec reseau n'etait suivi de rien : l'erreur se notait, et la
         modification attendait la prochaine frappe ou la prochaine ouverture de
         l'application. Corriger un montant dans un train, puis ranger son
         telephone, suffisait a la laisser en arriere-plan pendant des heures.

         Un seul reessai arme, et non une boucle : si le reseau est vraiment
         coupe, c'est l'evenement `online` qui reprendra la main — insister
         toutes les quinze secondes ne ferait que vider la batterie. Le repere
         est pose avant l'attente, pour que deux echecs de suite n'arment pas
         deux minuteurs. */
      if (!reessaiArme) {
        reessaiArme = true;
        setTimeout(() => { reessaiArme = false; push(); }, RETRY_DELAY);
      }
      return { error: e.message };
    } finally {
      status.pushing = false;
      onChange();
    }
  }

  function schedulePush() {
    if (!available) return;
    clearTimeout(timer);
    timer = setTimeout(push, WRITE_DELAY);
  }

  async function init() {
    if (!(await probe())) return { available: false };
    let remote = null;
    try { remote = await pull(); }
    catch (e) { status.error = e.message; return { available: true, error: e.message }; }

    if (!remote) return { available: true, empty: true, user };

    const remoteAt = remote?.meta?.savedAt;
    const localAt = Store.state?.meta?.savedAt;

    if (remoteAt && (!localAt || remoteAt > localAt)) {
      const intact = localAt && localAt === lastSyncedAt();
      if (intact) {
        lastPayload = JSON.stringify(remote);
        markSynced(remoteAt);
        return { available: true, adopted: true, at: remoteAt, data: remote, user };
      }
      return { available: true, newer: true, at: remoteAt, data: remote, user, localAt };
    }

    /* Ici le local est au moins aussi récent que le cloud. Deux cas, et il ne
       faut surtout pas les confondre.

       `markSynced(localAt)` était appelé pour les deux, sans qu'aucune écriture
       n'ait eu lieu : le repère disait « cet état est aligné avec le cloud »
       alors qu'il n'avait jamais été envoyé. La conséquence est une perte
       silencieuse, et elle se rejoue :

         1. le téléphone modifie quelque chose, l'envoi est armé à 8 secondes ;
         2. l'app est mise en veille avant, `sendBeacon` ne passe pas ;
         3. on rouvre l'app : le local est plus récent, ce repère ment ;
         4. un autre appareil enregistre quoi que ce soit et pousse ;
         5. on rouvre : le cloud est plus récent, le repère dit « intact »,
            donc `adopted` — la version en ligne remplace la locale **sans
            question**, et la modification de l'étape 1 n'a jamais existé.

       « Ça fait plusieurs fois que je dois remettre le livret A en épargne de
       précaution » : c'est la forme exacte de ce scénario, une modification
       enregistrée qui revient à sa valeur d'avant, sans message.

       Le repère ne se pose donc que sur une égalité vraie. Et quand le local est
       en avance, on le dit à l'appelant : cet appareil porte des modifications
       jamais envoyées, il faut les envoyer maintenant plutôt que d'attendre la
       prochaine frappe. */
    lastPayload = JSON.stringify(remote);
    const aligne = !!localAt && localAt === remoteAt;
    if (aligne) markSynced(localAt);
    return { available: true, ready: true, user, aEnvoyer: !aligne && !!localAt };
  }

  /* Écrit ce qui reste en attente quand l'onglet s'en va.

     `sendBeacon` et non `fetch` : le navigateur le prend en charge et le poste
     apres la fermeture, ce qu'une requete ordinaire ne survit pas.

     Le minuteur d'envoi differe est annule au passage : sans cela, une page
     restauree depuis le cache d'arriere-plan garde un minuteur arme sur un etat
     deja envoye, et repousse le meme corps une seconde fois. Sans consequence
     sur les donnees, mais une ecriture pour rien.

     `lastPayload` est mis a jour tout de suite : le beacon part sans reponse a
     attendre, donc rien d'autre ne peut le faire. Deux passages a la suite —
     l'ecran se cache, puis la page se decharge — n'envoient ainsi qu'une fois. */
  function flushOnUnload() {
    if (!available) return;
    const payload = JSON.stringify(Store.state);
    if (payload === lastPayload) return;
    clearTimeout(timer);
    try {
      const vu = lastSyncedAt();
      navigator.sendBeacon('/api/state' + (vu ? `?base=${encodeURIComponent(vu)}` : ''),
        new Blob([payload], { type: 'application/json' }));
      lastPayload = payload;
    } catch (e) { /* rien à faire de plus au moment de la fermeture */ }
  }

  return {
    init, pull, push, schedulePush, probe, flushOnUnload, setOnChange,
    setOnConflit, noterVersionLue,
    isAvailable: () => available,
    getUser: () => user,
    status: () => ({ ...status }),
  };
})();
