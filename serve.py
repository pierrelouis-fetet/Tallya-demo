#!/usr/bin/env python3
"""
Serveur local de Tallya.

Sert les fichiers de l'app ET fait passerelle vers les cours de bourse :
un navigateur ne peut pas appeler Yahoo Finance directement (CORS), mais
Python le peut. Aucune donnée patrimoniale ne sort d'ici — seuls les
symboles boursiers demandés sont envoyés à Yahoo.

Usage :  python serve.py            (puis ouvrir http://localhost:8765)
         python serve.py --port 9000 --no-browser
"""

import argparse
import json
import os
import re
import secrets
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")
TIMEOUT = 8
CACHE_TTL = 45          # secondes : évite de marteler l'API en cas de clics répétés

_cache: dict[str, tuple[float, dict]] = {}
_cache_lock = threading.Lock()


# --------------------------------------------------------------------------- #
# Récupération des cours
# --------------------------------------------------------------------------- #

def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read()


def _cloture_veille_horaire(symbol: str, jour_du_cours: int):
    """La dernière clôture connue avant le jour du cours, lue en pas horaire.

    C'est une panne de données, pas un jour sans séance.

    Refuser de publier une clôture supprimait alors l'écart du jour partout à la
    fois, ce qui est trop cher payé ; l'enjamber pour prendre l'avant-veille
    faisait compter deux séances. La série horaire porte la réponse : mesuré
    contre le courtier, sa dernière barre de la veille donne 6,202 pour une
    clôture réelle de 6,203, et 19,186 pour 19,202.

    Ce n'est pas la clôture officielle, c'est le dernier échange connu avant
    minuit. L'écart tient au fixing de clôture, quelques points de base.
    """
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(symbol)}?interval=1h&range=5d")
    try:
        data = json.loads(_get(url).decode("utf-8"))
        r = (data.get("chart") or {}).get("result") or []
        if not r:
            return None
        ts = r[0].get("timestamp") or []
        cl = (((r[0].get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
        for t, c in zip(reversed(ts), reversed(cl)):
            if c is None:
                continue
            if int(t) // 86400 < jour_du_cours:
                return c
    except Exception:
        # Une passerelle ne tombe pas parce qu'un repli n'a pas repondu : sans
        # cloture, la ligne n'a pas d'ecart du jour et l'ecran le dit.
        return None
    return None


def yahoo_quote(symbol: str) -> dict:
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(symbol)}?interval=1d&range=5d")
    data = json.loads(_get(url).decode("utf-8"))
    chart = data.get("chart") or {}
    if chart.get("error"):
        raise ValueError(chart["error"].get("description") or "symbole inconnu")
    results = chart.get("result") or []
    if not results:
        raise ValueError("symbole inconnu")

    meta = results[0].get("meta") or {}
    price = meta.get("regularMarketPrice")
    if price is None:
        raise ValueError("pas de cours disponible")

    currency = meta.get("currency") or ""
    # Yahoo expose deux « clôtures précédentes » : previousClose est celle de
    # la veille, chartPreviousClose celle qui précède la fenêtre demandée —
    # six séances plus tôt avec range=5d. Prendre la seconde transformait la
    # performance du jour en performance de la semaine.
    #
    # Et previousClose ment. Mesure contre un courtier : 6,121 annonces pour
    # 6,203 reels, 18,445 pour 19,202. L'ecart du jour passait de +0,60 % a
    # +1,99 %, et de +1,25 % a +5,22 % — trois fois le mouvement reel.
    #
    # La serie de bougies, elle, ne ment pas : on prend la derniere cloture dont
    # le jour precede celui du cours. C'est une donnee, pas un champ calcule
    # ailleurs, et elle se verifie. Le champ de Yahoo ne sert plus que de repli.
    closes = (((results[0].get("indicators") or {}).get("quote") or [{}])[0]
              .get("close") or [])
    horodatages = results[0].get("timestamp") or []
    # Le jour en UTC, comme cote worker : les deux bornes sont comparees entre
    # elles, seule leur coherence compte.
    jour = lambda t: int(t) // 86400
    jour_du_cours = jour(meta["regularMarketTime"]) if meta.get("regularMarketTime") else None
    # On prend la bougie qui precede IMMEDIATEMENT celle du cours, sans enjamber
    # celles dont la cloture manque.
    #
    # Enjamber etait le defaut. Une serie peut porter
    # un horodatage pour le 4 mais aucune cloture : Yahoo sait qu'il y a eu
    # seance, il n'en a pas le cours. En sautant ce trou on remontait au 3, et
    # l'ecart du jour comptait deux seances — +1,93 % la ou le courtier disait
    # +0,58 %.
    #
    # Quand la veille manque, on ne publie pas de cloture : la ligne n'a pas
    # d'ecart du jour et l'ecran le dit. C'est la regle deja retenue ailleurs
    # ici — mieux vaut se taire qu'annoncer un chiffre faux d'un facteur trois.
    trouvee, anterieure = False, None
    if jour_du_cours is not None and len(horodatages) == len(closes):
        for i in range(len(closes) - 1, -1, -1):
            if jour(horodatages[i]) < jour_du_cours:
                trouvee, anterieure = True, closes[i]
                break
    reelles = [c for c in closes if c is not None]
    if trouvee:
        # La veille est dans la serie. Si elle porte sa cloture, elle fait foi ;
        # sinon c'est un trou de donnees et la serie horaire la retrouve. On ne
        # remonte jamais a l'avant-veille : ce serait deux seances pour une.
        prev = anterieure if anterieure is not None else \
            _cloture_veille_horaire(symbol, jour_du_cours)
    else:
        prev = (meta.get("previousClose")
                or (reelles[-2] if len(reelles) >= 2 else None)
                or meta.get("chartPreviousClose"))

    # Londres cote certaines lignes en pence : on ramène en livres.
    if currency == "GBp":
        price = price / 100
        prev = prev / 100 if prev else prev
        currency = "GBP"

    # État de la place : donné directement quand Yahoo le veut bien, sinon
    # déductible des horaires de séance joints à la réponse.
    periodes = meta.get("currentTradingPeriod") or {}
    borne = lambda n: ([periodes[n].get("start"), periodes[n].get("end")]
                       if periodes.get(n) else None)

    return {
        "symbol": meta.get("symbol") or symbol,
        "name": meta.get("longName") or meta.get("shortName") or "",
        "price": price,
        "previousClose": prev,
        "currency": currency,
        "exchange": meta.get("fullExchangeName") or meta.get("exchangeName") or "",
        "time": meta.get("regularMarketTime"),
        "marketState": meta.get("marketState"),
        # Deja present dans la reponse : le nom officiel porte l'emetteur
        # d'un ETF, et les bornes situent le cours du jour.
        "longName": meta.get("longName") or meta.get("shortName") or "",
        "kind": meta.get("instrumentType") or "",
        "low52": meta.get("fiftyTwoWeekLow"),
        "high52": meta.get("fiftyTwoWeekHigh"),
        "dayLow": meta.get("regularMarketDayLow"),
        "dayHigh": meta.get("regularMarketDayHigh"),
        "volume": meta.get("regularMarketVolume"),
        "firstTrade": meta.get("firstTradeDate"),
        "session": {"pre": borne("pre"), "regular": borne("regular"), "post": borne("post")},
        "source": "yahoo",
    }


def stooq_quote(symbol: str) -> dict:
    """Repli quand Yahoo ne connaît pas le symbole ou refuse la requête."""
    url = ("https://stooq.com/q/l/?s="
           f"{urllib.parse.quote(symbol.lower())}&f=sd2t2ohlcv&h&e=csv")
    text = _get(url).decode("utf-8", "replace").strip().splitlines()
    if len(text) < 2:
        raise ValueError("réponse vide")
    row = text[1].split(",")
    if len(row) < 7 or row[6] in ("N/D", ""):
        raise ValueError("symbole inconnu")
    return {
        "symbol": row[0].upper(), "name": "", "price": float(row[6]),
        "previousClose": None, "currency": "", "exchange": "Stooq",
        "time": None, "source": "stooq",
    }


def quote(symbol: str) -> dict:
    symbol = symbol.strip()
    if not symbol:
        return {"symbol": symbol, "error": "symbole vide"}

    with _cache_lock:
        hit = _cache.get(symbol)
        if hit and time.time() - hit[0] < CACHE_TTL:
            return dict(hit[1], cached=True)

    errors = []
    for fetch in (yahoo_quote, stooq_quote):
        try:
            data = fetch(symbol)
            with _cache_lock:
                _cache[symbol] = (time.time(), data)
            return data
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            errors.append(f"{fetch.__name__}: réseau ({e})")
        except Exception as e:                          # noqa: BLE001
            errors.append(f"{fetch.__name__}: {e}")

    return {"symbol": symbol, "error": " · ".join(errors)}


ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")

# Places privilégiées quand un ISIN est coté à plusieurs endroits.
# "" = cotation américaine sans suffixe. Stuttgart (.SG) et Cboe (.XD) sont
# relégués : ce sont souvent des lignes de fonds peu liquides.
PREFERRED_SUFFIXES = [".PA", "", ".AS", ".DE", ".MI", ".MC", ".BR",
                      ".L", ".SW", ".VI", ".F", ".XD", ".SG"]


def isin_is_valid(code: str) -> bool:
    """Vérifie la clé de contrôle (Luhn sur l'ISIN lettres-converties)."""
    code = code.strip().upper()
    if not ISIN_RE.match(code):
        return False
    expanded = "".join(str(int(c, 36)) for c in code[:11])
    total, double = 0, True
    for ch in reversed(expanded):
        d = int(ch)
        if double:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        double = not double
    return (10 - total % 10) % 10 == int(code[11])


# Codes de place Bloomberg (renvoyés par OpenFIGI) → suffixes Yahoo
FIGI_TO_YAHOO = {
    "FP": ".PA", "GR": ".DE", "GY": ".DE", "GF": ".F", "GS": ".SG",
    "LN": ".L", "IM": ".MI", "NA": ".AS", "SW": ".SW", "SE": ".SW",
    "SM": ".MC", "BB": ".BR", "AV": ".VI", "ID": ".IR", "PL": ".LS",
    "SS": ".ST", "DC": ".CO", "NO": ".OL", "FH": ".HE", "CN": ".TO",
    "JP": ".T", "AU": ".AX", "HK": ".HK",
    "US": "", "UN": "", "UQ": "", "UW": "", "UA": "", "UR": "", "UP": "",
}


def figi_candidates(isin: str) -> list[dict]:
    """OpenFIGI : l'annuaire ISIN → ticker de Bloomberg. Ouvert, sans clé.
    Utilisé quand Yahoo ne connaît pas l'ISIN, ce qui arrive pour beaucoup d'ETC."""
    body = json.dumps([{"idType": "ID_ISIN", "idValue": isin}]).encode()
    req = urllib.request.Request(
        "https://api.openfigi.com/v3/mapping", data=body,
        headers={"Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        payload = json.loads(r.read().decode("utf-8"))

    rows = (payload[0].get("data") or []) if payload else []
    seen, out = set(), []
    for row in rows:
        ticker, exch = row.get("ticker"), row.get("exchCode")
        suffix = FIGI_TO_YAHOO.get(exch)
        if not ticker or suffix is None:
            continue
        symbol = f"{ticker}{suffix}"
        if symbol in seen:
            continue
        seen.add(symbol)
        out.append({
            "symbol": symbol,
            "name": (row.get("name") or "").title(),
            "exchange": exch,
            "type": row.get("securityType") or "",
            "source": "openfigi",
            "unverified": True,
        })
    return out


def _suffix_of(symbol: str) -> str:
    return "." + symbol.rsplit(".", 1)[1] if "." in symbol else ""


def _rank(item: dict, prefer: str) -> tuple:
    sym = item["symbol"]
    suffix = _suffix_of(sym)
    # 'auto' = aucune place imposée : on garde l'ordre de la source, qui
    # connaît mieux que nous la cotation de référence d'un titre.
    auto = not prefer or prefer == "auto"
    order = [] if auto else [prefer] + [s for s in PREFERRED_SUFFIXES if s != prefer]
    if auto:
        pos = 0
    else:
        try:
            pos = order.index(suffix)
        except ValueError:
            pos = len(order)
    # un « Fund » est presque toujours le doublon d'un ETF déjà listé
    kind = 1 if (item.get("type") or "").lower() == "fund" else 0
    # un symbole qui est l'ISIN lui-même n'est pas une vraie cotation
    raw = 1 if sym.split(".")[0].isalnum() and len(sym.split(".")[0]) == 12 else 0
    # les lignes de gré à gré portent le suffixe américain vide : sans ce
    # malus, un ETF européen se résout en OTC dès que la place demandée
    # n'a aucune cotation
    otc = 1 if re.search(r"\botc\b|pink sheet", item.get("exchange") or "", re.I) else 0
    return (otc, raw, kind, pos)


def resolve_isin(code: str, prefer: str = "") -> dict:
    code = code.strip().upper()
    if not isin_is_valid(code):
        return {"code": code, "valid": False,
                "error": "ISIN invalide (12 caractères, clé de contrôle incorrecte)"}
    candidates = search(code)
    seen = {c["symbol"] for c in candidates}

    # Yahoo ne renvoie souvent qu'une seule place pour un ISIN, pas forcément
    # la tienne. On complète avec une recherche sur le nom du fonds pour faire
    # remonter les cotations sœurs (Paris, Milan, Londres…).
    for name in {c.get("name") for c in candidates if c.get("name")}:
        try:
            for extra in search(name):
                if extra["symbol"] not in seen:
                    seen.add(extra["symbol"])
                    candidates.append(extra)
        except Exception:                               # noqa: BLE001
            pass                                        # l'ISIN seul fera l'affaire

    # Toujours rien sur la place voulue ? On interroge OpenFIGI, qui liste
    # toutes les cotations d'un ISIN, puis on vérifie que Yahoo cote bien
    # le symbole proposé — sinon on retiendrait un ticker fantôme.
    # en mode automatique on n'interroge OpenFIGI que si Yahoo n'a rien
    imposee = bool(prefer) and prefer != "auto"
    has_preferred = any(_suffix_of(c["symbol"]) == prefer for c in candidates)
    if not candidates or (imposee and not has_preferred):
        try:
            extras = [c for c in figi_candidates(code) if c["symbol"] not in seen]
        except Exception:                               # noqa: BLE001
            extras = []
        for cand in sorted(extras, key=lambda c: _rank(c, prefer))[:6]:
            probe = quote(cand["symbol"])
            if probe.get("error"):
                continue
            cand["unverified"] = False
            cand["name"] = probe.get("name") or cand["name"]
            cand["exchange"] = probe.get("exchange") or cand["exchange"]
            candidates.append(cand)
            seen.add(cand["symbol"])
            if _suffix_of(cand["symbol"]) == prefer:
                break                                   # on a la place voulue

    if not candidates:
        return {"code": code, "valid": True, "best": None, "candidates": [],
                "error": "aucune cotation trouvée pour cet ISIN"}

    ranked = sorted(candidates, key=lambda c: _rank(c, prefer))
    return {"code": code, "valid": True, "best": ranked[0], "candidates": ranked}


def search(query: str) -> list[dict]:
    url = ("https://query1.finance.yahoo.com/v1/finance/search?q="
           f"{urllib.parse.quote(query)}&quotesCount=25&newsCount=0")
    data = json.loads(_get(url).decode("utf-8"))
    out = []
    for q in data.get("quotes", []):
        if not q.get("symbol"):
            continue
        out.append({
            "symbol": q["symbol"],
            "name": q.get("longname") or q.get("shortname") or "",
            "exchange": q.get("exchDisp") or q.get("exchange") or "",
            "type": q.get("typeDisp") or q.get("quoteType") or "",
        })
    return out


# --------------------------------------------------------------------------- #
# Serveur HTTP
# --------------------------------------------------------------------------- #

ACCESS_TOKEN = None      # défini seulement en mode réseau local
KEY_FILE = os.path.join(ROOT, ".access-key")


def access_key(regenerate: bool = False) -> str:
    """Clé stable, gardée dans un fichier local : l'adresse du téléphone ne
    change plus d'un démarrage à l'autre, donc le marque-page reste valable."""
    if not regenerate and os.path.exists(KEY_FILE):
        try:
            key = open(KEY_FILE, encoding="utf-8").read().strip()
            if key:
                return key
        except OSError:
            pass
    key = secrets.token_urlsafe(6)          # ~8 caractères, tapable une fois
    try:
        with open(KEY_FILE, "w", encoding="utf-8") as f:
            f.write(key)
    except OSError as e:
        print(f"(cle non enregistree : {e})")
    return key


def deja_servi(port: int) -> bool:
    """Un serveur Tallya repond-il deja sur ce port ?

    On ne se contente pas de constater que le port est occupe : n'importe quel
    programme peut l'avoir pris, et se rattacher a lui serait pire que d'echouer.
    On demande donc la page de tests, qui n'existe que dans ce projet, et on
    verifie qu'elle parle bien de Tallya.
    """
    try:
        with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/tests.html", timeout=1.5) as r:
            if r.status != 200:
                return False
            return b"Tallya" in r.read(4096)
    except Exception:                                   # noqa: BLE001
        return False


def local_ip() -> str:
    """Adresse de cette machine sur le réseau local. Le paquet n'est jamais
    envoyé : on ouvre juste un socket UDP pour lire l'interface choisie."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:                                   # noqa: BLE001
        return socket.gethostbyname(socket.gethostname())
    finally:
        s.close()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---- contrôle d'accès (mode --lan uniquement) ----
    def _authorised(self, params) -> bool:
        if not ACCESS_TOKEN:
            return True
        if (params.get("k") or [None])[0] == ACCESS_TOKEN:
            return True
        cookie = self.headers.get("Cookie") or ""
        return f"wdk={ACCESS_TOKEN}" in cookie

    def _deny(self):
        body = ("<meta charset='utf-8'><style>body{font-family:system-ui;padding:40px;"
                "max-width:34em;margin:auto;line-height:1.6}</style>"
                "<h2>Accès refusé</h2><p>Ce tableau de bord est protégé par une clé.</p>"
                "<p>Ouvre l'adresse complète affichée dans la fenêtre du serveur, "
                "celle qui se termine par <code>?k=…</code>.</p>").encode("utf-8")
        self.send_response(403)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---- utilitaires ----
    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # autorise aussi l'app ouverte en file:// (origine « null »)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if not self._authorised(params):
            return self._deny()

        # première visite avec la bonne clé : on la mémorise en cookie de session
        if ACCESS_TOKEN and (params.get("k") or [None])[0] == ACCESS_TOKEN:
            self._set_cookie = True

        if parsed.path == "/api/health":
            return self._send_json({"ok": True, "service": "wealth-dashboard"})

        if parsed.path == "/api/quotes":
            raw = (params.get("symbols") or [""])[0]
            symbols = [s for s in (x.strip() for x in raw.split(",")) if s][:40]
            if not symbols:
                return self._send_json({"error": "aucun symbole"}, 400)
            with ThreadPoolExecutor(max_workers=min(8, len(symbols))) as pool:
                results = list(pool.map(quote, symbols))
            return self._send_json({"quotes": results, "at": time.time()})

        if parsed.path == "/api/isin":
            code = (params.get("code") or [""])[0].strip()
            prefer = (params.get("prefer") or [""])[0].strip()
            if not code:
                return self._send_json({"error": "code manquant"}, 400)
            try:
                return self._send_json(resolve_isin(code, prefer))
            except Exception as e:                      # noqa: BLE001
                return self._send_json({"code": code, "error": str(e)}, 502)

        if parsed.path == "/api/search":
            q = (params.get("q") or [""])[0].strip()
            if len(q) < 2:
                return self._send_json({"results": []})
            try:
                # la place privilégiée classe aussi les recherches par nom,
                # pas seulement la résolution d'un ISIN
                prefer = (params.get("prefer") or [""])[0].strip()
                out = sorted(search(q), key=lambda it: _rank(it, prefer))
                return self._send_json({"results": out})
            except Exception as e:                      # noqa: BLE001
                return self._send_json({"error": str(e), "results": []}, 502)

        return super().do_GET()

    def end_headers(self):
        # pas de cache sur les fichiers de l'app : on veut voir les modifs tout de suite
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        if getattr(self, "_set_cookie", False):
            self._set_cookie = False
            self.send_header("Set-Cookie", f"wdk={ACCESS_TOKEN}; Path=/; SameSite=Lax")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("  %s\n" % (fmt % args))


def main():
    # La console Windows est souvent en cp1252 : sans ça, le moindre accent
    # ou symbole dans un print fait planter le serveur au démarrage.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    ap = argparse.ArgumentParser(description="Tallya - serveur local")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--lan", action="store_true",
                    help="rend le dashboard accessible depuis le telephone (meme Wi-Fi)")
    ap.add_argument("--new-key", action="store_true",
                    help="regenere la cle d'acces (invalide les anciens marque-pages)")
    args = ap.parse_args()

    global ACCESS_TOKEN
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    if args.lan:
        ACCESS_TOKEN = access_key(regenerate=args.new_key)

    # --- deja lance ? on se rattache, on ne relance pas -------------------
    #
    # Ce test vient AVANT l'ouverture du port, et ce n'est pas de la prudence
    # decorative : sous Windows, `HTTPServer` pose SO_REUSEADDR, si bien qu'un
    # second serveur se lie au meme port sans le moindre message et rafle les
    # connexions suivantes. Deux serveurs se disputaient alors le 8765, l'un
    # servant le projet, l'autre le dossier d'ou on l'avait lance -- et
    # l'application se mettait a repondre 404 sur ses propres fichiers, une fois
    # sur deux.
    #
    # Le port n'est pas interchangeable : le localStorage est lie a l'origine,
    # donc 8766 donnerait une application vide. On ne se rabat pas sur un autre
    # port, on rend la main au serveur en place et on attend comme aurait attendu
    # celui qu'on allait ouvrir -- l'outil de developpement voit un processus
    # vivant, et le port repond. Le lanceur devient idempotent : le jouer deux
    # fois donne le meme etat, comme les migrations de ce projet.
    if deja_servi(args.port):
        url = f"http://localhost:{args.port}"
        print(f"Tallya   {url}   (deja servi, on s'y rattache)")
        print("Le serveur en place fait le travail. Ctrl+C pour rendre la main.\n")
        if not args.no_browser:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            print("\nArret.")
        return 0

    try:
        server = ThreadingHTTPServer((host, args.port), Handler)
    except OSError as e:
        print(f"Impossible d'ouvrir le port {args.port} : {e}")
        print("Un autre programme l'utilise, et ce n'est pas Tallya.")
        print("Regarde qui ecoute :  netstat -ano | findstr :%d" % args.port)
        return 1

    url = f"http://localhost:{args.port}"
    print(f"Tallya   {url}")
    print("Cours de bourse    actifs (passerelle Yahoo Finance / Stooq)")

    if args.lan:
        ip = local_ip()
        phone = f"http://{ip}:{args.port}/?k={ACCESS_TOKEN}"
        print("")
        print("=" * 68)
        print("  DEPUIS TON TELEPHONE (meme Wi-Fi) - tape cette adresse :")
        print("")
        print(f"    {phone}")
        print("")
        print("  Tape-la une fois puis mets-la en marque-page : la cle ne")
        print("  change plus. Pour la renouveler : --new-key")
        print("")
        print("  ATTENTION : tes donnees financieres sont exposees a tout le")
        print("  reseau local. A n'utiliser que sur ton Wi-Fi personnel,")
        print("  jamais sur un reseau public ou partage.")
        print("=" * 68)

    print("\nCtrl+C pour arreter.\n")
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArret.")
        server.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
