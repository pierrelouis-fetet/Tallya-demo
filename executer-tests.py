"""Joue la suite dans un vrai navigateur, sans interaction, et rend un code de
sortie.

Pourquoi il fallait ca : la suite vit dans le navigateur, et son verdict etait un
titre d'onglet qu'un humain devait lire. Le README affirme que chaque chiffre
affiche est garde par un test ; cette affirmation n'etait verifiee par personne
d'autre que son auteur, sur sa machine, quand il y pensait. Une promesse de
fiabilite qui depend de la memoire de son auteur n'en est pas une.

Le titre se lit par l'endpoint HTTP de debogage, pas par une evaluation JS, et
c'est le point qui a demande deux essais. La suite lit ses fichiers source en XHR
SYNCHRONE : le fil principal du navigateur est bloque pendant ces lectures, donc
un `Runtime.evaluate` reste en file d'attente et la connexion tombe en timeout. `/json/list` rend le titre de chaque onglet sans jamais toucher au
fil de la page.

Le pilotage CDP vient de `captures.py` et n'est pas recopie : c'est le meme
besoin, la meme poignee de main, et deux clients qui divergent finiraient par ne
plus lancer le meme navigateur.

    python executer-tests.py                          tout
    python executer-tests.py --touche assets/app.js   ce qui lit ce fichier
    python executer-tests.py --touche calcul          le modele, sans lecture de source
    python executer-tests.py --suites credit          les suites dont le nom le porte

Le script demarre le serveur lui-meme s'il ne repond pas, ferme tout en sortant,
et rend TROIS codes de sortie, pas deux :

    0   vert, et complet. Le seul qui autorise un envoi.
    1   rouge.
    2   vert, mais PARTIEL — une selection etait demandee.

Le 2 n'est pas une coquetterie. La regle de la maison veut qu'un push soit garde
par `... && git push`, et `&&` ne passe que sur 0 : une execution ciblee ne peut
donc pas autoriser un envoi, meme si on oublie qu'elle etait ciblee. La regle
cesse d'etre une promesse et devient une mecanique.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import captures

# La console Windows ecrit en cp1252 et etouffe sur la coche du verdict : le
# script mourait apres avoir lu le bon resultat, ce qui est la pire facon
# d'echouer — un rouge qui ne dit rien du vert qu'il vient de mesurer.
for flux in (sys.stdout, sys.stderr):
    try:
        flux.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PORT = int(os.environ.get("PORT_TALLYA", "8766"))
BASE = f"http://localhost:{PORT}"
RACINE = os.path.dirname(os.path.abspath(__file__))

# Le titre porte le verdict, et c'est deja la convention de la page : une coche
# et un compte, ou une croix et un nombre d'echecs. Le lire est donc le meme
# geste que celui d'un humain devant l'onglet.
OK, KO = "✓", "✕"
# Le titre d'une execution ciblee porte ce mot, pose par `tests.html`.
PARTIEL = "(PARTIEL)"


def selection():
    """Les options de ciblage, rendues en morceau de requete.

    Volontairement minuscule : deux drapeaux, aucune bibliotheque, et un refus
    net de ce qui n'est pas reconnu. Un argument mal orthographie qui serait
    ignore ferait tourner TOUTE la suite en laissant croire au contraire — ou
    l'inverse, ce qui est pire.
    """
    import urllib.parse
    args, params = sys.argv[1:], {}
    while args:
        drapeau = args.pop(0)
        cle = {"--suites": "suites", "--touche": "touche"}.get(drapeau)
        if not cle:
            sys.exit(f"option inconnue : {drapeau}\n"
                     "attendu : --suites <motif> ou --touche <chemin|calcul>")
        if not args:
            sys.exit(f"{drapeau} attend une valeur")
        params[cle] = args.pop(0)
    return ("?" + urllib.parse.urlencode(params)) if params else ""


def serveur_repond():
    try:
        with urllib.request.urlopen(BASE + "/tests.html", timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def titre_de_la_page():
    """Le titre vu de l'exterieur, sans executer une ligne dans la page."""
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{captures.PORT_CDP}/json/list", timeout=5
        ) as r:
            for onglet in json.load(r):
                if onglet.get("type") == "page" and "tests.html" in onglet.get("url", ""):
                    return onglet.get("title", "")
    except Exception:
        pass
    return ""


def details_des_echecs():
    """Les lignes rouges, telles que la page les affiche. La suite est finie a ce
    moment-la, donc le fil principal est libre et une evaluation passe."""
    onglet = None
    try:
        onglet = captures.Onglet(captures.cible())
        return onglet.js(
            "(() => { const l = document.body.innerText.split('\\n'), m = [];"
            " l.forEach((x, i) => { if (x.trim() === '\\u2715')"
            "   m.push(l.slice(i, i + 3).join(' | ')); });"
            " return m.join('\\n'); })()"
        )
    except Exception as e:
        return f"(details illisibles : {e})"
    finally:
        if onglet:
            onglet.ferme()


def main():
    if not captures.CHROME:
        sys.exit("Chrome introuvable : installe-le ou mets-le dans le PATH.")

    # Les arguments se lisent AVANT de demarrer quoi que ce soit : rejeter une
    # option apres avoir leve un serveur et un navigateur fait payer trois
    # secondes a une faute de frappe.
    cible = selection()
    if cible:
        print(f"execution ciblee : {cible}")

    serveur = None
    if serveur_repond():
        print(f"serveur deja en place sur {BASE}")
    else:
        serveur = subprocess.Popen(
            [sys.executable, os.path.join(RACINE, "serve.py"),
             "--port", str(PORT), "--no-browser"],
            cwd=RACINE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(40):
            if serveur_repond():
                break
            time.sleep(0.5)
        else:
            serveur.terminate()
            sys.exit(f"Le serveur n'a pas demarre sur {BASE}.")
        print(f"serveur demarre sur {BASE}")

    profil = tempfile.mkdtemp(prefix="tallya-tests-")
    chrome = subprocess.Popen(
        [
            captures.CHROME,
            "--headless=new",
            f"--remote-debugging-port={captures.PORT_CDP}",
            # Depuis Chrome 111, la poignee de main websocket de debogage est
            # refusee par un 403 sans ce drapeau.
            "--remote-allow-origins=*",
            f"--user-data-dir={profil}",
            "--no-first-run",
            "--no-default-browser-check",
            # Sur un runner d'integration il n'y a ni bac a sable utilisable ni
            # /dev/shm de taille utile : sans ces deux drapeaux, Chrome meurt au
            # demarrage sans rien dire d'exploitable.
            "--no-sandbox",
            "--disable-dev-shm-usage",
            BASE + "/tests.html" + cible,
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

    code = 1
    try:
        if not captures.attend_cdp():
            raise RuntimeError("Chrome n'a pas ouvert son port de debogage.")

        titre = ""
        # Un cinquieme de seconde : la suite complete tient en trois secondes et
        # demie depuis que les sources se lisent une seule fois, et un sondage a
        # la seconde y ajoutait un demi-tour de roue pour rien.
        for _ in range(1500):                      # cinq minutes au plus
            titre = titre_de_la_page()
            if titre.startswith(OK) or titre.startswith(KO):
                break
            time.sleep(0.2)
        else:
            raise RuntimeError(f"la suite n'a rendu aucun verdict (titre : {titre!r})")

        print(titre)
        # Une suite qui ne compte AUCUN test n'est pas une suite qui passe.
        #
        # Le harnais n'enregistre rien quand `store.tests.js` ne se parse pas :
        # il rend zero reussite et zero echec, et le titre s'ecrit « ✓ 0 tests »
        # -- une coche verte sur un fichier casse. Ce script sortait alors en 0,
        # donc un push enchaine derriere partait sur une suite qui n'avait rien
        # verifie. C'est le vert le plus dangereux qui soit : il ne signale rien
        # a corriger. Le compte est donc lu, et zero vaut echec.
        compte = re.search(r"\d+", titre)
        if titre.startswith(OK) and compte and int(compte.group()) == 0:
            print("\nAucun test executé : le fichier de suites ne se parse "
                  "probablement pas. Ouvrir /tests.html et lire la console.",
                  file=sys.stderr)
        elif titre.startswith(OK) and PARTIEL in titre:
            # Vert, mais il ne parle que d'une partie de la suite : 2, pour que
            # le `&&` d'un push ne passe pas.
            print("\nExecution PARTIELLE : ce vert ne dit rien du reste de la "
                  "suite, et ne peut pas autoriser un envoi. Relancer sans "
                  "option avant de pousser.", file=sys.stderr)
            code = 2
        elif titre.startswith(OK):
            code = 0
        else:
            print("\n" + (details_des_echecs() or "(aucun detail)"), file=sys.stderr)
    finally:
        chrome.terminate()
        if serveur:
            serveur.terminate()
        shutil.rmtree(profil, ignore_errors=True)

    sys.exit(code)


if __name__ == "__main__":
    main()
