
const Quotes = (() => {

  const BASE = location.protocol === 'file:' ? 'http://127.0.0.1:8765' : '';

  let online = null;          // null = pas encore testé
  let healthPromise = null;   // mutualisé : un seul appel réseau au démarrage

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

  async function resolveIsin(code, prefer) {
    const pref = prefer ?? Store.state.meta.preferredExchange ?? '';
    const r = await fetch(`${BASE}/api/isin?code=${encodeURIComponent(code)}&prefer=${encodeURIComponent(pref)}`,
      { cache: 'no-store' });
    if (!r.ok && r.status !== 502) throw new Error(`passerelle indisponible (HTTP ${r.status})`);
    return r.json();
  }

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

  async function refresh() {
    const resolved = await resolveMissing();     // un ISIN suffit, le symbole suivra
    const p = plan();
    if (!p.all.length) return { changes: [], resolved, empty: true };

    const r = await fetch(BASE + '/api/quotes?symbols=' + encodeURIComponent(p.all.join(',')),
      { cache: 'no-store' });
    if (!r.ok) throw new Error(`passerelle indisponible (HTTP ${r.status})`);
    const data = await r.json();

    const bySym = {};
    p.all.forEach((s, i) => { bySym[s.toUpperCase()] = data.quotes[i]; });

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
      pos.prevClose = num(q.previousClose) || null;
      pos.marketState = q.marketState || null;
      pos.session = q.session || null;
      pos.quoteTime = q.time || null;
      pos.exchange = q.exchange || pos.exchange || '';
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

  async function search(query) {
    const prefer = Store.state.meta.preferredExchange ?? '';
    const r = await fetch(`${BASE}/api/search?q=${encodeURIComponent(query)}`
      + `&prefer=${encodeURIComponent(prefer)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`recherche indisponible (HTTP ${r.status})`);
    return (await r.json()).results || [];
  }

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
