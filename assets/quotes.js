/* =============================================================
   QUOTES — récupération des cours via la passerelle locale.
   Le navigateur ne peut pas appeler Yahoo directement (CORS) :
   serve.py fait l'intermédiaire. Sans lui, l'app fonctionne
   normalement, seuls les cours restent en saisie manuelle.
   ============================================================= */

const Quotes = (() => {

  // en file:// on vise le serveur local s'il tourne ; sinon même origine
  const BASE = location.protocol === 'file:' ? 'http://127.0.0.1:8765' : '';

  let online = null;          // null = pas encore testé
  let healthPromise = null;   // mutualisé : un seul appel réseau au démarrage

  /* CloudSync a besoin de la même réponse : on la partage plutôt que de
     sonder deux fois le serveur à chaque chargement de page. */
  function healthData() {
    if (!healthPromise) {
      healthPromise = fetch(BASE + '/api/health', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);
    }
    return healthPromise;
  }

  async function health() {
    online = (await healthData()) !== null;
    return online;
  }

  const isOnline = () => online;

  /* --- ce qu'il faut demander : symboles des lignes + paires de change --- */
  function plan() {
    const symbols = [], currencies = new Set();
    for (const p of Store.state.positions) {
      const sym = (p.symbol || '').trim();
      if (p.manual || !sym) continue;
      if (!symbols.includes(sym)) symbols.push(sym);
      if (p.currency && p.currency !== 'EUR') currencies.add(p.currency);
    }
    const fxPairs = [...currencies].map(c => `EUR${c}=X`);
    return { symbols, fxPairs, currencies: [...currencies], all: [...symbols, ...fxPairs] };
  }

  /* --- résout un ISIN en symbole de cotation --- */
  async function resolveIsin(code, prefer) {
    const pref = prefer ?? Store.state.meta.preferredExchange ?? '';
    const r = await fetch(`${BASE}/api/isin?code=${encodeURIComponent(code)}&prefer=${encodeURIComponent(pref)}`,
      { cache: 'no-store' });
    if (!r.ok && r.status !== 502) throw new Error(`passerelle indisponible (HTTP ${r.status})`);
    return r.json();
  }

  /* --- remplit les symboles manquants à partir des ISIN --- */
  async function resolveMissing() {
    const todo = Store.state.positions.filter(
      p => !(p.symbol || '').trim() && (p.isin || '').trim() && !p.manual);
    const done = [];
    for (const p of todo) {
      try {
        const r = await resolveIsin(p.isin.trim());
        if (r.best && r.best.symbol) {
          p.symbol = r.best.symbol;
          done.push({ name: p.name, isin: p.isin, symbol: r.best.symbol,
                      exchange: r.best.exchange, alternatives: (r.candidates || []).length - 1 });
        } else {
          done.push({ name: p.name, isin: p.isin, error: r.error || 'aucune cotation trouvée' });
        }
      } catch (e) {
        done.push({ name: p.name, isin: p.isin, error: e.message });
      }
    }
    if (done.some(d => d.symbol)) Store.save();
    return done;
  }

  /* --- rafraîchit les cours et met à jour les positions --- */
  async function refresh() {
    const resolved = await resolveMissing();     // un ISIN suffit, le symbole suivra
    const p = plan();
    if (!p.all.length) return { changes: [], resolved, empty: true };

    const r = await fetch(BASE + '/api/quotes?symbols=' + encodeURIComponent(p.all.join(',')),
      { cache: 'no-store' });
    if (!r.ok) throw new Error(`passerelle indisponible (HTTP ${r.status})`);
    const data = await r.json();

    // les résultats reviennent dans l'ordre demandé
    const bySym = {};
    p.all.forEach((s, i) => { bySym[s.toUpperCase()] = data.quotes[i]; });

    // taux de change : EURUSD=X donne des USD par euro, on veut l'inverse
    const fx = {};
    for (const c of p.currencies) {
      const q = bySym[`EUR${c}=X`];
      if (q && !q.error && q.price) fx[c] = 1 / q.price;
    }

    const changes = [];
    for (const pos of Store.state.positions) {
      const sym = (pos.symbol || '').trim();
      if (pos.manual || !sym) continue;
      const q = bySym[sym.toUpperCase()];

      if (!q || q.error || !q.price) {
        changes.push({ name: pos.name, symbol: sym, error: (q && q.error) || 'aucune réponse' });
        continue;
      }

      const before = { price: num(pos.price), value: posValue(pos) };
      pos.price = q.price;
      /* La clôture de la veille sert à la performance du jour, et elle est
         remplacée à chaque rafraîchissement, y compris par rien.

         Elle n'était écrite que si la réponse en portait une : celle qu'on
         gardait vieillissait donc d'un jour à chaque passage où la passerelle
         n'en donnait pas — Stooq n'en donne jamais. Le cours montait au jour, la
         référence restait à trois séances en arrière, et « Aujourd'hui »
         annonçait +2,14 % là où le courtier disait +0,65 %.

         Sans référence, la ligne n'a pas d'écart du jour et le dit : c'est
         préférable à un écart calculé sur une clôture d'un autre jour. */
      pos.prevClose = num(q.previousClose) || null;
      // état de la place et horaires de séance, pour dire si le cours affiché
      // est celui d'un marché ouvert ou la dernière clôture connue
      pos.marketState = q.marketState || null;
      pos.session = q.session || null;
      pos.quoteTime = q.time || null;
      pos.exchange = q.exchange || pos.exchange || '';
      // fiche d'identité du titre, telle que la place la publie
      if (q.longName) pos.longName = q.longName;
      if (q.kind) pos.kind = q.kind;
      pos.low52 = q.low52 ?? null;
      pos.high52 = q.high52 ?? null;
      pos.dayLow = q.dayLow ?? null;
      pos.dayHigh = q.dayHigh ?? null;
      pos.volume = q.volume ?? null;
      if (q.firstTrade) pos.firstTrade = q.firstTrade;
      if (q.currency) pos.currency = q.currency;
      pos.fx = (pos.currency && pos.currency !== 'EUR')
        ? (fx[pos.currency] ?? num(pos.fx) ?? 1)
        : 1;
      /* Le taux d'achat se fige ici, au premier taux connu, et jamais ensuite.
         Une ligne creee avant que sa devise soit choisie n'a pas de taux d'achat :
         `tauxAchat()` lui prete alors le taux courant, ce qui ferait bouger son
         prix de revient a chaque variation de l'euro. Ce n'est vrai qu'une fois. */
      if (pos.currency && pos.currency !== 'EUR' && !num(pos.fxBuy)) pos.fxBuy = pos.fx;

      changes.push({
        name: pos.name, symbol: q.symbol || sym, quoteName: q.name || '',
        from: before.price, to: q.price, currency: pos.currency,
        exchange: q.exchange || '', source: q.source, cached: !!q.cached,
        dayPct: q.previousClose ? (q.price / q.previousClose - 1) * 100 : null,
        valueDelta: posValue(pos) - before.value,
      });
    }

    Store.state.quotes = { lastRun: new Date().toISOString(), fx, changes, resolved };
    Store.save();
    return { changes, fx, resolved };
  }

  /* --- recherche de symbole --- */
  async function search(query) {
    const prefer = Store.state.meta.preferredExchange ?? '';
    const r = await fetch(`${BASE}/api/search?q=${encodeURIComponent(query)}`
      + `&prefer=${encodeURIComponent(prefer)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`recherche indisponible (HTTP ${r.status})`);
    return (await r.json()).results || [];
  }

  /* --- reperes de marche -------------------------------------------------
     Sept lignes qui situent la journee : deux indices americains, deux
     europeens, la parite qui pese sur toutes les lignes en dollars, l'or et
     le bitcoin. Ce ne sont pas des avoirs : rien ici ne depend de ce qu'on
     detient, et ces chiffres restent donc lisibles en mode discret.
     Le resultat est garde cinq minutes : la barre se redessine a chaque
     rendu de la vue, et un aller-retour par rendu serait absurde. */
  /* Quatre familles, une seule affichee a la fois.

     Sept reperes sur une seule ligne melangeaient tout : deux indices
     americains, deux europeens, une parite, l'or et le bitcoin. Les familles
     les separent, et permettent d'en offrir davantage sans allonger la
     bande.

     Des onglets plutot qu'une liste deroulante — le motif de CNBC et non celui
     de Yahoo. La liste cache le catalogue derriere un clic ; les onglets le
     montrent d'un coup d'oeil, et le ruban reste court, ce qui compte a 375 px
     ou vingt tuiles feraient un marathon de pouce.

     Une seule famille chargee a la fois, et une famille pese ce que pesait la
     barre entiere : le cout par visite ne bouge pas.

     Tous ces symboles ont ete verifies contre la passerelle avant d'etre
     inscrits ici : une tuile morte est pire que pas de tuile. */
  const FAMILLES_REPERES = [
    ['indices', trad('Indices'), [
      ['^GSPC',     'S&P 500'],
      ['^IXIC',     'Nasdaq'],
      ['^FCHI',     'CAC 40'],
      ['^STOXX50E', 'Stoxx 50'],
      ['^N225',     'Nikkei'],
    ]],
    ['metaux', trad('Métaux'), [
      ['GC=F', trad('Or')],
      ['SI=F', trad('Argent')],
      ['PL=F', trad('Platine')],
      ['PA=F', 'Palladium'],
      ['HG=F', trad('Cuivre')],
    ]],
    ['crypto', 'Crypto', [
      ['BTC-USD', 'Bitcoin'],
      ['ETH-USD', 'Ethereum'],
      ['SOL-USD', 'Solana'],
      ['XRP-USD', 'XRP'],
    ]],
    ['devises', trad('Devises'), [
      ['EURUSD=X',  'EUR/USD'],
      ['EURGBP=X',  'EUR/GBP'],
      ['EURCHF=X',  'EUR/CHF'],
      ['EURJPY=X',  'EUR/JPY'],
      ['DX-Y.NYB',  'Dollar index'],
    ]],
  ];
  const FAMILLE_PAR_DEFAUT = FAMILLES_REPERES[0][0];
  const listeFamille = cle =>
    (FAMILLES_REPERES.find(f => f[0] === cle) || FAMILLES_REPERES[0])[2];

  /* Un cache par famille, et non un seul : passer d'un onglet a l'autre et
     revenir ne doit rien redemander. */
  const cacheReperes = new Map();

  async function reperes(famille = FAMILLE_PAR_DEFAUT, { force = false } = {}) {
    const cle = FAMILLES_REPERES.some(f => f[0] === famille) ? famille : FAMILLE_PAR_DEFAUT;
    const garde = cacheReperes.get(cle);
    if (garde && !force && (Date.now() - garde.at) / 1000 < 300) return garde.lignes;
    const liste = listeFamille(cle);
    const syms = liste.map(r => r[0]).join(',');
    const r = await fetch(`${BASE}/api/quotes?symbols=${encodeURIComponent(syms)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`marches indisponibles (HTTP ${r.status})`);
    const par = new Map(((await r.json()).quotes || []).map(x => [x.symbol, x]));
    const lignes = liste.map(([sym, nom]) => {
      const x = par.get(sym) || {};
      const prix = Number(x.price), veille = Number(x.previousClose);
      const utilisable = Number.isFinite(prix) && Number.isFinite(veille) && veille !== 0;
      /* La meme garde que sur une ligne de titres, et pour la meme raison : un
         cours qui date d'avant minuit ne fait pas la « variation du jour ».
         Sans elle, le ruban a deja affiche le S&P 500 a −0,17 % sous un
         soleil : c'etait le mouvement de la veille, et rien ne le disait. La
         regle avait ete ecrite pour les positions seulement, alors qu'elle
         vaut pour tout ce qui compare un prix a une cloture.
         `coteAujourdhui()` lit `quoteTime`, `marketState` et `session` : le
         repere porte deja les trois, ils etaient simplement inutilises ici. */
      const horsSeance = utilisable && !coteAujourdhui({
        quoteTime: x.time || null, marketState: x.marketState || null, session: x.session || null,
      });
      return { symbole: sym, nom, prix, veille, devise: x.currency || '',
               pct: utilisable && !horsSeance ? (prix - veille) / veille * 100 : null,
               horsSeance,
               /* L'etat de la place et les horaires de seance arrivaient dans
                  la reponse et etaient jetes ici. `marketStatus()` sait deja
                  les lire — c'est ce qui allume le soleil ou la lune sur la
                  tuile. Bitcoin et l'EUR/USD n'ont pas besoin d'un cas
                  particulier : Yahoo les annonce ouverts, ils le sont. */
               marketState: x.marketState || null,
               session: x.session || null,
               quoteTime: x.time || null,
               ok: utilisable };
    });
    cacheReperes.set(cle, { lignes, at: Date.now() });
    return lignes;
  }

  return { health, healthData, isOnline, refresh, search, plan, resolveIsin, resolveMissing,
           reperes, famillesReperes: () => FAMILLES_REPERES.map(([cle, nom]) => [cle, nom]),
           familleParDefaut: FAMILLE_PAR_DEFAUT, BASE };
})();
