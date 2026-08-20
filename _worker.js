
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
         + '(KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const HEADERS = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function getJson(url, ttl = 45) {
  const r = await fetch(url, { headers: HEADERS, cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function getText(url, ttl = 45) {
  const r = await fetch(url, { headers: HEADERS, cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function clotureVeilleHoraire(symbol, jourDuCours) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/'
            + `${encodeURIComponent(symbol)}?interval=1h&range=5d`;
  try {
    const data = await getJson(url);
    const r = ((data.chart || {}).result || [])[0];
    if (!r) return null;
    const ts = r.timestamp || [];
    const cl = (((r.indicators || {}).quote || [])[0] || {}).close || [];
    const jour = t => new Date(t * 1000).toISOString().slice(0, 10);
    for (let i = cl.length - 1; i >= 0; i--) {
      if (cl[i] == null) continue;
      if (jour(ts[i]) < jourDuCours) return cl[i];
    }
  } catch (e) {
    return null;
  }
  return null;
}

async function yahooQuote(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/'
            + `${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const data = await getJson(url);
  const chart = data.chart || {};
  if (chart.error) throw new Error(chart.error.description || 'symbole inconnu');
  const result = (chart.result || [])[0];
  if (!result) throw new Error('symbole inconnu');

  const meta = result.meta || {};
  let price = meta.regularMarketPrice;
  if (price == null) throw new Error('pas de cours disponible');

  let currency = meta.currency || '';
  /* Yahoo expose deux « clôtures précédentes » qu'il ne faut pas confondre :
     `previousClose` est celle de la veille, `chartPreviousClose` celle qui
     précède la fenêtre demandée — soit six séances plus tôt avec range=5d.
     Prendre la seconde transformait la performance du jour en performance de
     la semaine. À défaut, on reprend l'avant-dernière clôture de la série. */
  const closes = (((result.indicators || {}).quote || [])[0] || {}).close || [];
  const horodatages = result.timestamp || [];
  const jour = t => new Date(t * 1000).toISOString().slice(0, 10);
  const jourDuCours = meta.regularMarketTime ? jour(meta.regularMarketTime) : null;
  let veilleTrouvee = false, replisAnterieurs = null;
  if (jourDuCours && horodatages.length === closes.length) {
    for (let i = closes.length - 1; i >= 0; i--) {
      if (jour(horodatages[i]) < jourDuCours) {
        veilleTrouvee = true; replisAnterieurs = closes[i]; break;
      }
    }
  }
  const reelles = closes.filter(v => v != null);
  /* La bougie d'abord, le champ de Yahoo ensuite — et non l'inverse.

     `meta.previousClose` ment. Mesure : 6,121 pour DCAM.PA quand le courtier
     disait 6,203, et 18,445 pour NATO.PA contre 19,202. L'ecart du
     jour passait de +0,60 % a +1,99 %, et de +1,25 % a +5,22 % : Tallya
     annonçait 302 EUR de mouvement pour 100 reels. Le calcul etait juste, sa
     reference etait fausse.

     La derniere cloture dont le jour precede celui du cours est une donnee de
     la serie, pas un champ calcule ailleurs : elle se verifie, et elle ne peut
     pas dater d'un autre jour que celui qu'on lui demande. */
  let prev = veilleTrouvee
    ? (replisAnterieurs ?? await clotureVeilleHoraire(symbol, jourDuCours))
    : (meta.previousClose
       ?? (reelles.length >= 2 ? reelles[reelles.length - 2] : null)
       ?? meta.chartPreviousClose ?? null);
  if (currency === 'GBp') {            // Londres cote en pence
    price = price / 100;
    if (prev) prev = prev / 100;
    currency = 'GBP';
  }

  const periodes = meta.currentTradingPeriod || {};
  return {
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || '',
    price, previousClose: prev, currency,
    exchange: meta.fullExchangeName || meta.exchangeName || '',
    time: meta.regularMarketTime || null,
    marketState: meta.marketState || null,
    longName: meta.longName || meta.shortName || '',
    kind: meta.instrumentType || '',
    low52: meta.fiftyTwoWeekLow ?? null,
    high52: meta.fiftyTwoWeekHigh ?? null,
    dayLow: meta.regularMarketDayLow ?? null,
    dayHigh: meta.regularMarketDayHigh ?? null,
    volume: meta.regularMarketVolume ?? null,
    firstTrade: meta.firstTradeDate ?? null,
    session: {
      pre: periodes.pre ? [periodes.pre.start, periodes.pre.end] : null,
      regular: periodes.regular ? [periodes.regular.start, periodes.regular.end] : null,
      post: periodes.post ? [periodes.post.start, periodes.post.end] : null,
    },
    source: 'yahoo',
  };
}

async function stooqQuote(symbol) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`;
  const lines = (await getText(url)).trim().split('\n');
  if (lines.length < 2) throw new Error('réponse vide');
  const row = lines[1].split(',');
  if (row.length < 7 || row[6] === 'N/D' || row[6] === '') throw new Error('symbole inconnu');
  return {
    symbol: row[0].toUpperCase(), name: '', price: parseFloat(row[6]),
    previousClose: null, currency: '', exchange: 'Stooq', time: null, source: 'stooq',
  };
}

async function quote(symbol) {
  const s = (symbol || '').trim();
  if (!s) return { symbol: s, error: 'symbole vide' };
  const errors = [];
  for (const fetcher of [yahooQuote, stooqQuote]) {
    try { return await fetcher(s); }
    catch (e) { errors.push(`${fetcher.name}: ${e.message}`); }
  }
  return { symbol: s, error: errors.join(' · ') };
}

async function search(query) {
  const url = 'https://query1.finance.yahoo.com/v1/finance/search?q='
            + `${encodeURIComponent(query)}&quotesCount=25&newsCount=0`;
  const data = await getJson(url, 300);
  return (data.quotes || [])
    .filter(q => q.symbol)
    .map(q => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || '',
      exchange: q.exchDisp || q.exchange || '',
      type: q.typeDisp || q.quoteType || '',
    }));
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function isinIsValid(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!ISIN_RE.test(c)) return false;
  const expanded = [...c.slice(0, 11)].map(ch => parseInt(ch, 36)).join('');
  let total = 0, double = true;
  for (let i = expanded.length - 1; i >= 0; i--) {
    let d = +expanded[i];
    if (double) { d *= 2; if (d > 9) d -= 9; }
    total += d;
    double = !double;
  }
  return (10 - total % 10) % 10 === +c[11];
}

const PREFERRED_SUFFIXES = ['.PA', '', '.AS', '.DE', '.MI', '.MC', '.BR',
                            '.L', '.SW', '.VI', '.F', '.XD', '.SG'];

const FIGI_TO_YAHOO = {
  FP: '.PA', GR: '.DE', GY: '.DE', GF: '.F', GS: '.SG', LN: '.L', IM: '.MI',
  NA: '.AS', SW: '.SW', SE: '.SW', SM: '.MC', BB: '.BR', AV: '.VI', ID: '.IR',
  PL: '.LS', SS: '.ST', DC: '.CO', NO: '.OL', FH: '.HE', CN: '.TO', JP: '.T',
  AU: '.AX', HK: '.HK',
  US: '', UN: '', UQ: '', UW: '', UA: '', UR: '', UP: '',
};

const suffixOf = sym => sym.includes('.') ? '.' + sym.split('.').pop() : '';

const isOtc = item => /\botc\b|pink sheet/i.test(item.exchange || '');

function rank(item, prefer) {
  const auto = !prefer || prefer === 'auto';
  const order = auto
    ? []
    : [prefer, ...PREFERRED_SUFFIXES.filter(s => s !== prefer)];
  let pos = auto ? 0 : order.indexOf(suffixOf(item.symbol));
  if (pos < 0) pos = order.length;
  const kind = (item.type || '').toLowerCase() === 'fund' ? 1 : 0;
  const raw = item.symbol.split('.')[0].length === 12 ? 1 : 0;
  const otc = isOtc(item) ? 1 : 0;
  return otc * 10000 + raw * 1000 + kind * 100 + pos;
}

async function figiCandidates(isin) {
  const r = await fetch('https://api.openfigi.com/v3/mapping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
  });
  if (!r.ok) throw new Error(`OpenFIGI HTTP ${r.status}`);
  const payload = await r.json();
  const rows = (payload[0] && payload[0].data) || [];
  const seen = new Set(), out = [];
  for (const row of rows) {
    const suffix = FIGI_TO_YAHOO[row.exchCode];
    if (!row.ticker || suffix === undefined) continue;
    const symbol = `${row.ticker}${suffix}`;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({
      symbol,
      name: (row.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
      exchange: row.exchCode, type: row.securityType || '',
      source: 'openfigi', unverified: true,
    });
  }
  return out;
}

async function resolveIsin(code, prefer = '') {
  const isin = String(code || '').trim().toUpperCase();
  if (!isinIsValid(isin)) {
    return { code: isin, valid: false,
             error: 'ISIN invalide (12 caractères, clé de contrôle incorrecte)' };
  }

  const candidates = await search(isin).catch(() => []);
  const seen = new Set(candidates.map(c => c.symbol));

  for (const name of new Set(candidates.map(c => c.name).filter(Boolean))) {
    try {
      for (const extra of await search(name)) {
        if (!seen.has(extra.symbol)) { seen.add(extra.symbol); candidates.push(extra); }
      }
    } catch { /* l'ISIN seul fera l'affaire */ }
  }

  const imposee = prefer && prefer !== 'auto';
  if (!candidates.length || (imposee && !candidates.some(c => suffixOf(c.symbol) === prefer))) {
    let extras = [];
    try { extras = (await figiCandidates(isin)).filter(c => !seen.has(c.symbol)); }
    catch { extras = []; }
    extras.sort((a, b) => rank(a, prefer) - rank(b, prefer));
    for (const cand of extras.slice(0, 6)) {
      const probe = await quote(cand.symbol);
      if (probe.error) continue;
      cand.unverified = false;
      cand.name = probe.name || cand.name;
      cand.exchange = probe.exchange || cand.exchange;
      candidates.push(cand);
      seen.add(cand.symbol);
      if (suffixOf(cand.symbol) === prefer) break;
    }
  }

  if (!candidates.length) {
    return { code: isin, valid: true, best: null, candidates: [],
             error: 'aucune cotation trouvée pour cet ISIN' };
  }

  candidates.sort((a, b) => rank(a, prefer) - rank(b, prefer));
  return { code: isin, valid: true, best: candidates[0], candidates };
}

const MAX_BYTES = 2 * 1024 * 1024;

const keyFor = email => `state:${email || 'default'}`;

async function handleState(request, env, email) {
  if (!env.WEALTH) return json({ error: 'stockage non configuré' }, 501);
  const key = keyFor(email);

  if (request.method === 'GET') {
    const raw = await env.WEALTH.get(key);
    if (!raw) return new Response(null, { status: 204 });
    return new Response(raw, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (request.method === 'DELETE') {
    await env.WEALTH.delete(key);
    return json({ ok: true });
  }

  const body = await request.text();
  if (body.length > MAX_BYTES) return json({ error: 'état trop volumineux' }, 413);

  let incoming;
  try { incoming = JSON.parse(body); }
  catch { return json({ error: 'JSON invalide' }, 400); }
  if (!incoming || !incoming.positions || !incoming.monthly) {
    return json({ error: 'format inattendu' }, 400);
  }

  /* Garde-fou : on n'écrase que la version qu'on a lue.
     -------------------------------------------------------------------------
     La règle précédente comparait deux horodatages : elle refusait une écriture
     dont le `savedAt` était plus ancien que celui en ligne. Elle ne pouvait pas
     tenir, et la preuve est venue des sauvegardes du détenteur — six « avant
     adoption de la version en ligne » dans une seule journée, et des montants
     saisis qui disparaissaient.

     Un onglet resté ouvert garde en mémoire l'état d'il y a six heures. Le
     rafraîchissement automatique des cours y appelle `Store.save()` toutes les
     cinq minutes, et `Store.save()` estampille `savedAt = maintenant`. Cet onglet
     envoie donc un contenu périmé avec une estampille fraîche, plus récente que
     celle du téléphone qui vient de saisir. L'ancienne règle l'acceptait — un
     horodatage récent ne dit rien de l'âge du contenu — et le téléphone, lui
     proprement synchronisé, adoptait ensuite cette version en se croyant
     simplement en retard.

     On compare donc une filiation, comme le fait `If-Match` : l'écrivain déclare
     la version qu'il a lue, et l'écriture n'est acceptée que si c'est encore
     celle en place. Un onglet qui n'a pas vu la dernière version est refusé,
     quelle que soit son horloge. C'est ici et non côté client parce que le
     `sendBeacon` de la fermeture d'onglet ne peut rien vérifier avant de partir.

     Sans `base` — un client d'avant ce correctif, dont un onglet encore ouvert —
     le refus est la bonne réponse : c'est exactement l'écrivain dont on se
     protège. Rien n'est perdu pour lui, son état reste sur son appareil, et un
     rechargement lui rend le droit d'écrire.

     `force=1` reste la porte de l'arbitrage : c'est le détenteur qui a vu les
     deux dates et choisi d'imposer la sienne. */
  const params = new URL(request.url).searchParams;
  if (params.get('force') !== '1') {
    const existing = await env.WEALTH.get(key);
    if (existing) {
      try {
        const prevAt = JSON.parse(existing)?.meta?.savedAt;
        const nextAt = incoming?.meta?.savedAt;
        const base = params.get('base');
        if (prevAt && base !== prevAt) {
          return json({ error: 'conflit', remoteSavedAt: prevAt, localSavedAt: nextAt,
                        base: base || null, raison: 'version non lue' }, 409);
        }
      } catch { /* état précédent illisible : on le remplace */ }
    }
  }

  try {
    const avant = await env.WEALTH.get(key);
    if (avant) {
      const vAvant = JSON.parse(avant)?.schemaVersion ?? 0;
      const vApres = incoming?.schemaVersion ?? 0;
      if (vApres !== vAvant) {
        const quand = new Date().toISOString().replace(/[:.]/g, '-');
        await env.WEALTH.put(`${key}:backup:v${vAvant}:${quand}`, avant,
                             { expirationTtl: 60 * 60 * 24 * 180 });
      }
    }
  } catch { /* une sauvegarde ratee ne doit pas empecher l'enregistrement */ }

  await env.WEALTH.put(key, body);
  return json({ ok: true, savedAt: incoming?.meta?.savedAt || null, bytes: body.length });
}

const DEMO_PUBLIQUE = true;

const CLEFS_TTL_MS = 60 * 60 * 1000;
let clefsCache = { url: null, a: 0, clefs: null };

async function clefsAccess(domaine) {
  const url = `https://${domaine.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/cdn-cgi/access/certs`;
  const maintenant = Date.now();
  if (clefsCache.clefs && clefsCache.url === url && maintenant - clefsCache.a < CLEFS_TTL_MS)
    return clefsCache.clefs;
  const r = await fetch(url, { cf: { cacheTtl: 3600 } });
  if (!r.ok) return null;
  const { keys } = await r.json();
  if (!Array.isArray(keys)) return null;
  clefsCache = { url, a: maintenant, clefs: keys };
  return keys;
}

const deB64url = s => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - p.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function accessEmail(request, env) {
  const jeton = request.headers.get('Cf-Access-Jwt-Assertion');
  const domaine = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if (!jeton || !domaine || !aud) return null;

  const parts = jeton.split('.');
  if (parts.length !== 3) return null;
  let entete, charge;
  try {
    entete = JSON.parse(new TextDecoder().decode(deB64url(parts[0])));
    charge = JSON.parse(new TextDecoder().decode(deB64url(parts[1])));
  } catch { return null; }
  if (entete.alg !== 'RS256') return null;          // pas de none, pas de HS256

  const clefs = await clefsAccess(domaine);
  const jwk = clefs?.find(k => k.kid === entete.kid);
  if (!jwk) return null;

  let ok = false;
  try {
    const clef = await crypto.subtle.importKey('jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clef, deB64url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch { return null; }
  if (!ok) return null;

  const auds = Array.isArray(charge.aud) ? charge.aud : [charge.aud];
  if (!auds.includes(aud)) return null;
  const attendu = `https://${domaine.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  if (charge.iss !== attendu) return null;
  const s = Math.floor(Date.now() / 1000);
  if (!charge.exp || charge.exp <= s) return null;
  if (charge.nbf && charge.nbf > s + 60) return null;

  return typeof charge.email === 'string' && charge.email ? charge.email : null;
}

const SESSION_DAYS = 30;
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

async function makeToken(secret) {
  const exp = String(Date.now() + SESSION_DAYS * 86400000);
  return `${exp}.${await hmac(secret, exp)}`;
}

async function tokenIsValid(token, secret) {
  if (!token || !token.includes('.')) return false;
  const [exp, sig] = token.split('.');
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = await hmac(secret, exp);
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function cookieValue(request, name) {
  const raw = request.headers.get('Cookie') || '';
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return hit ? hit.slice(name.length + 1) : null;
}

const LOGIN_PAGE = (error) => `<!DOCTYPE html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tallya</title>
<style>
 body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0d0d0d;color:#eceadf;
      margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
 form{width:min(22em,100%);display:flex;flex-direction:column;gap:12px}
 .mark{width:52px;height:52px;border-radius:23%;display:block;margin-bottom:6px;
       object-fit:cover}
 h1{font-size:19px;margin:0} p{color:#898781;font-size:13px;margin:0 0 8px}
 p b{color:#9a72e8;font-weight:620}
 input{font:inherit;font-size:16px;padding:11px 13px;border-radius:10px;border:1px solid #383835;
       background:#1a1a19;color:#fff}
 input:focus{outline:2px solid #3987e5;outline-offset:-1px}
 button{font:inherit;font-size:15px;font-weight:600;padding:11px;border-radius:10px;border:0;
        background:#eceadf;color:#0d0d0d;cursor:pointer}
 button:hover{opacity:.88}
 .err{color:#e66767;font-size:13px}
</style>
<form method="POST" action="/api/login">
 <img class="mark" src="/icon-192.png" alt="">
 <h1>Tallya</h1>
 <p>Suivre. Arbitrer. <b>Projeter.</b> Cet espace est privé.</p>
 <input type="password" name="password" placeholder="Mot de passe" autofocus required
        autocomplete="current-password">
 <button type="submit">Entrer</button>
 ${error ? `<span class="err">${error}</span>` : ''}
</form></html>`;

const LOCKED_PAGE = `<!DOCTYPE html><html lang="fr"><meta charset="utf-8">
<title>Dashboard verrouillé</title>
<style>
 body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0d0d0d;color:#eceadf;
      margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
 main{max-width:34em;line-height:1.65}
 h1{font-size:22px;margin:0 0 4px} p{color:#c3c2b7}
 code{background:#232322;padding:2px 6px;border-radius:5px;font-size:13px}
 ol{color:#c3c2b7} li{margin:6px 0}
 .tag{display:inline-block;background:#d03b3b;color:#fff;font-size:11px;font-weight:700;
      padding:3px 9px;border-radius:99px;letter-spacing:.05em;margin-bottom:14px}
</style>
<main>
 <span class="tag">ACCÈS FERMÉ</span>
 <h1>Ce dashboard n'est pas encore protégé</h1>
 <p>Il refuse de servir la moindre donnée tant qu'aucune protection n'est en
    place. C'est volontaire : mieux vaut un site inutilisable qu'un patrimoine
    lisible par n'importe qui.</p>
 <p><b>Le plus simple — un mot de passe :</b></p>
 <ol>
  <li>Réglages du projet Cloudflare → <b>Variables and Secrets</b></li>
  <li><b>Add variable</b>, type <b>Secret</b></li>
  <li>Nom : <code>DASHBOARD_PASSWORD</code> — Valeur : ton mot de passe</li>
  <li><b>Save and deploy</b></li>
 </ol>
 <p>Recharge : un écran de connexion apparaîtra.</p>
 <p style="font-size:13px;color:#898781">Alternative plus robuste, si tu veux une
    connexion par code email : configure <b>Cloudflare Zero Trust → Access</b> sur
    ce nom d'hôte. Les deux fonctionnent, l'un ou l'autre suffit.</p>
 <p style="font-size:13px;color:#898781">Pour publier ce site volontairement sans
    authentification, définis la variable d'environnement
    <code>ALLOW_PUBLIC=1</code> dans les réglages du projet.</p>
</main></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const pwd = env.DASHBOARD_PASSWORD;
    const htmlHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    };

    if (path === '/api/login' && request.method === 'POST') {
      if (!pwd) return json({ error: 'aucun mot de passe configuré' }, 501);
      const form = await request.formData();
      const given = String(form.get('password') || '');

      const ok = (await hmac(pwd, 'check')) === (await hmac(given, 'check'));
      if (!ok) {
        await new Promise(r => setTimeout(r, 1000));   // freine le bourrinage
        return new Response(LOGIN_PAGE('Mot de passe incorrect.'), { status: 401, headers: htmlHeaders });
      }
      const token = await makeToken(pwd);
      return new Response(null, {
        status: 303,
        headers: {
          'Location': '/',
          'Set-Cookie': `wd_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; `
                      + `Max-Age=${SESSION_DAYS * 86400}`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (path === '/api/logout') {
      return new Response(null, {
        status: 303,
        headers: { 'Location': '/', 'Set-Cookie': 'wd_session=; Path=/; Max-Age=0' },
      });
    }

    const PUBLIC = ['/icon-192.png', '/apple-touch-icon.png'];

    const email = await accessEmail(request, env);
    const authorised = PUBLIC.includes(path)
      || (DEMO_PUBLIQUE && !pwd)
      || env.ALLOW_PUBLIC === '1'
      || !!email
      || (pwd && await tokenIsValid(cookieValue(request, 'wd_session'), pwd));

    if (!authorised) {
      if (path.startsWith('/api/')) {
        return json({ error: 'non authentifié' }, 403);
      }
      return new Response(pwd ? LOGIN_PAGE('') : LOCKED_PAGE, { status: pwd ? 401 : 403, headers: htmlHeaders });
    }

    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(request);        // le site lui-même
    }

    try {
      if (path === '/api/health') {
        return json({
          ok: true,
          service: 'wealth-dashboard',
          host: 'cloudflare',
          storage: env.WEALTH ? 'kv' : 'none',
          user: email || null,
        });
      }

      if (path === '/api/quotes') {
        const raw = url.searchParams.get('symbols') || '';
        const symbols = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 40);
        if (!symbols.length) return json({ error: 'aucun symbole' }, 400);
        return json({ quotes: await Promise.all(symbols.map(quote)), at: Date.now() / 1000 });
      }

      if (path === '/api/isin') {
        const code = (url.searchParams.get('code') || '').trim();
        if (!code) return json({ error: 'code manquant' }, 400);
        return json(await resolveIsin(code, (url.searchParams.get('prefer') || '').trim()));
      }

      if (path === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (q.length < 2) return json({ results: [] });
        const prefer = (url.searchParams.get('prefer') || '').trim();
        const out = await search(q);
        out.sort((a, b) => rank(a, prefer) - rank(b, prefer));
        return json({ results: out });
      }

      if (path === '/api/state') return handleState(request, env, email);

      return json({ error: 'route inconnue' }, 404);
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  },
};
