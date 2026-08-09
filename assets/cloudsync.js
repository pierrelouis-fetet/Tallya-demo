/* =============================================================
   CLOUDSYNC — synchronisation via /api/state (Cloudflare KV).
   Actif uniquement quand l'app est servie par Cloudflare Pages
   avec un espace KV lié. En local, tout ceci reste inerte.

   Le plan gratuit KV autorise 1 000 écritures par jour : on
   temporise largement et on n'écrit que si l'état a changé.
   ============================================================= */

const CloudSync = (() => {

  const WRITE_DELAY = 8000;     // on regroupe généreusement les modifications

  /* Horodatage du dernier état qu'on sait aligné avec le cloud. Il survit au
     rechargement : sans lui, on ne pourrait pas distinguer « cet appareil a
     des modifications non envoyées » de « cet appareil est simplement en
     retard », et il faudrait poser la question à chaque fois. */
  const SYNCED_KEY = 'wealth-dashboard:synced-at';
  const lastSyncedAt = () => { try { return localStorage.getItem(SYNCED_KEY); } catch (e) { return null; } };
  const markSynced = at => { try { localStorage.setItem(SYNCED_KEY, at || ''); } catch (e) {} };

  let available = false;        // /api/state répond
  let user = null;              // email Cloudflare Access
  let timer = null;
  let lastPayload = null;       // évite les écritures identiques
  let status = { lastPush: null, error: null, conflict: null, pushing: false };
  let onChange = () => {};

  const setOnChange = fn => { onChange = fn; };

  /* On réutilise la réponse déjà obtenue par Quotes : une seule requête
     /api/health par chargement de page, pas deux. */
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

  async function push({ force = false } = {}) {
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
      const r = await fetch('/api/state' + (force ? '?force=1' : ''), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (r.status === 409) {
        const d = await r.json();
        status.conflict = d;                 // une version plus récente existe en ligne
        status.error = null;
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

  /* Au démarrage. On ne demande un arbitrage que s'il y a réellement quelque
     chose à perdre : cet appareil doit porter des modifications jamais
     envoyées ET le cloud avoir bougé de son côté. Être simplement en retard
     n'est pas un conflit — c'est le cas normal quand on ouvre l'app sur un
     deuxième appareil, et poser la question à chaque fois serait pénible. */
  async function init() {
    if (!(await probe())) return { available: false };
    let remote = null;
    try { remote = await pull(); }
    catch (e) { status.error = e.message; return { available: true, error: e.message }; }

    if (!remote) return { available: true, empty: true, user };

    const remoteAt = remote?.meta?.savedAt;
    const localAt = Store.state?.meta?.savedAt;

    if (remoteAt && (!localAt || remoteAt > localAt)) {
      // Le local est-il resté tel qu'on l'avait synchronisé ?
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

  /* Écrit ce qui reste en attente quand on ferme l'onglet. */
  function flushOnUnload() {
    if (!available) return;
    const payload = JSON.stringify(Store.state);
    if (payload === lastPayload) return;
    try {
      navigator.sendBeacon('/api/state',
        new Blob([payload], { type: 'application/json' }));
    } catch (e) { /* rien à faire de plus au moment de la fermeture */ }
  }

  return {
    init, pull, push, schedulePush, probe, flushOnUnload, setOnChange,
    isAvailable: () => available,
    getUser: () => user,
    status: () => ({ ...status }),
  };
})();
