"""Regenere les captures du README, toutes dans la meme session.

Pourquoi un script et non une capture a la main : les quatre images doivent
montrer le MEME patrimoine. Prises a des moments differents, elles se
contredisaient de 918,83 EUR — et un lecteur attentif en conclut que
l'application compte mal. Le jeu de demonstration ne rafraichit plus ses cours,
donc le total est stable ; encore faut-il que les captures soient prises d'un
seul tenant, sur le meme etat, sans clic humain entre deux.

Pourquoi CDP et non `--screenshot` : le mode capture du binaire ne fait
qu'agrandir la fenetre, sans emuler l'appareil. Les regles CSS de telephone ne
s'appliquent pas, la barre du bas se pose de travers et le rendu deborde.
`Emulation.setDeviceMetricsOverride` pose une vraie largeur de viewport avec son
facteur d'echelle, ce qui donne exactement ce qu'un telephone affiche.

Prerequis : le serveur de la demo tourne (`python serve.py --port 8766
--no-browser`), et le module `websocket-client` est installe.

    python captures.py

Les images vont dans `docs/`, aux noms que le README attend.
"""
import base64
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

BASE = "http://localhost:8766"
DOSSIER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")
PORT_CDP = 9333

# Les quatre captures du README : nom de fichier, route, et gabarit d'appareil.
# L'ordre compte peu, la session unique fait tout le travail.
VUES = [
    ("desktop-overview.png", "#/overview", 1440, 1000, 1),
    ("mobile-overview.png", "#/overview", 390, 844, 3),
    ("mobile-allocation.png", "#/allocation", 390, 844, 3),
    ("mobile-budget.png", "#/budget", 390, 844, 3),
]

CHROME = next(
    (c for c in (
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        shutil.which("chrome") or "",
        shutil.which("google-chrome") or "",
    ) if c and os.path.exists(c)),
    None,
)


class Onglet:
    """Le strict necessaire de CDP : envoyer une commande, attendre sa reponse."""

    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30)
        self.n = 0

    def envoie(self, methode, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": methode, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            # Les evenements arrivent melanges aux reponses : on ne garde que la
            # reponse a la commande qu'on vient d'envoyer.
            if m.get("id") == self.n:
                if "error" in m:
                    raise RuntimeError(f"{methode} : {m['error']}")
                return m.get("result", {})

    def js(self, code):
        r = self.envoie(
            "Runtime.evaluate",
            expression=code,
            awaitPromise=True,
            returnByValue=True,
        )
        if r.get("exceptionDetails"):
            d = r["exceptionDetails"]
            # « Uncaught » tout seul n'aide personne : le message utile est dans
            # la description de l'exception, pas dans le texte de l'evenement.
            detail = (d.get("exception") or {}).get("description") or d.get("text")
            raise RuntimeError(detail or "erreur JS")
        return r.get("result", {}).get("value")

    def ferme(self):
        try:
            self.ws.close()
        except Exception:
            pass


def serveur_repond():
    try:
        with urllib.request.urlopen(BASE + "/index.html", timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def attend_cdp():
    for _ in range(60):
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{PORT_CDP}/json/version", timeout=1
            ):
                return True
        except Exception:
            time.sleep(0.5)
    return False


def cible():
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT_CDP}/json/list", timeout=5) as r:
        for t in json.load(r):
            if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                return t["webSocketDebuggerUrl"]
    raise RuntimeError("aucun onglet CDP")


def main():
    if not CHROME:
        sys.exit("Chrome introuvable.")
    if not serveur_repond():
        sys.exit(
            f"Rien ne repond sur {BASE}.\n"
            "Lance d'abord : python serve.py --port 8766 --no-browser"
        )
    os.makedirs(DOSSIER, exist_ok=True)

    profil = tempfile.mkdtemp(prefix="tallya-captures-")
    chrome = subprocess.Popen(
        [
            CHROME,
            "--headless=new",
            f"--remote-debugging-port={PORT_CDP}",
            # Sans ce drapeau, Chrome refuse la poignee de main websocket par un
            # 403 : depuis 111 il verifie l'origine des connexions de debogage.
            "--remote-allow-origins=*",
            f"--user-data-dir={profil}",
            "--no-first-run",
            "--no-default-browser-check",
            "--hide-scrollbars",
            "--force-color-profile=srgb",
            BASE + "/index.html",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        if not attend_cdp():
            sys.exit("Chrome n'a pas ouvert son port de debogage.")
        onglet = Onglet(cible())
        onglet.envoie("Page.enable")
        onglet.envoie("Runtime.enable")

        # L'etat de la demonstration, pose une seule fois pour les quatre images,
        # en anglais comme le README. `SEED` est le jeu qu'un visiteur voit ; le
        # migrer reproduit exactement son premier chargement.
        for _ in range(40):
            if onglet.js("typeof Store !== 'undefined' && !!Store.state"):
                break
            time.sleep(0.5)
        else:
            sys.exit("L'application ne s'est pas chargee.")

        onglet.js(
            "(() => { Store.state = structuredClone(SEED); Store.migrate();"
            " refreshAccounts(); setLang('en'); Store.save(); return true; })()"
        )
        total = onglet.js("fmtEUR(patrimoine().net)")
        print(f"Patrimoine net du jeu : {total}")

        for nom, route, largeur, hauteur, echelle in VUES:
            onglet.envoie(
                "Emulation.setDeviceMetricsOverride",
                width=largeur,
                height=hauteur,
                deviceScaleFactor=echelle,
                mobile=largeur < 768,
            )
            # Le hash suffit : le routeur ecoute `hashchange` et rend lui-meme.
            # Un `render()` de plus rejouerait le montage des graphiques.
            #
            # Sans f-string : une concatenation implicite ou seule la premiere
            # ligne porte le prefixe laisse les accolades doublees de la seconde
            # telles quelles, et le JavaScript recoit un `}` de trop.
            onglet.js(
                "(() => { location.hash = " + json.dumps(route) + ";"
                " window.scrollTo(0, 0); return true; })()"
            )
            time.sleep(1.2)          # les graphiques se montent apres le rendu
            # Et on remet en haut APRES le rendu, pas avant : le changement de
            # hash declenche un rendu asynchrone, donc le `scrollTo` ci-dessus
            # s'applique a l'ecran precedent. Une capture prise a mi-hauteur
            # laisse un entete de tableau collant sous la barre du haut, et la
            # premiere preuve visuelle du produit ressemble a une capture ratee.
            # Le retour en haut se fait APRES le rendu, pas avant : le changement
            # de hash declenche un rendu asynchrone, donc un `scrollTo` place
            # plus haut s'appliquerait a l'ecran precedent. L'aller-retour d'un
            # pixel force un evenement de defilement, seul declencheur du
            # recalcul des ancrages `position: sticky`.
            #
            # Ce qui reste NON RESOLU, et il faut le dire ici plutot que de le
            # laisser croire regle : la capture d'Allocation garde un bandeau
            # « Holding / Amount / % » a peine visible sous la barre du haut.
            # L'application en direct est propre — mesure a defilement zero, les
            # trois entetes sont a 827, 2037 et 3003 px pour une fenetre de
            # 812 — donc l'artefact appartient a la capture, pas au produit.
            # Deux tentatives n'en ont pas eu raison ; la piste restante est la
            # hauteur emulee de 844 px, ou le premier entete tombe a 827.
            onglet.js(
                "(() => { window.scrollTo(0, 1); window.scrollTo(0, 0);"
                " document.scrollingElement.scrollTop = 0;"
                " return document.scrollingElement.scrollTop; })()"
            )
            time.sleep(0.6)          # le temps que le defilement et le collant se posent
            img = onglet.envoie("Page.captureScreenshot", format="png")
            chemin = os.path.join(DOSSIER, nom)
            with open(chemin, "wb") as f:
                f.write(base64.b64decode(img["data"]))
            octets = os.path.getsize(chemin)
            deborde = onglet.js(
                "document.documentElement.scrollWidth > window.innerWidth + 1"
            )
            print(f"  {nom}  {largeur}x{hauteur}  {octets // 1024} Ko"
                  f"{'  DEBORDE' if deborde else ''}")

        onglet.ferme()
        print("\nLes quatre images portent le meme patrimoine :", total)
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=10)
        except Exception:
            chrome.kill()
        shutil.rmtree(profil, ignore_errors=True)


if __name__ == "__main__":
    main()
