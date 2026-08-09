# Mettre le dashboard en ligne sur Cloudflare

Objectif : consulter et modifier ton dashboard depuis n'importe où, PC éteint,
avec tes données synchronisées entre appareils — et **personne d'autre que toi**
qui puisse y accéder.

Tout tient dans le plan gratuit. Compte une trentaine de minutes la première fois.

---

## Ce qu'on met en place

| Brique | Rôle | Coût |
|---|---|---|
| **Cloudflare Pages** | héberge le site | gratuit |
| **Pages Functions** | remplace `serve.py` pour les cours de bourse | gratuit, 100 000 req/jour |
| **KV** | stocke tes données, partagées entre appareils | gratuit, 1 000 écritures/jour |
| **Cloudflare Access** | porte d'entrée : code par email | gratuit jusqu'à 50 utilisateurs |

L'adresse sera du type `wealth-dashboard.pages.dev`. Un nom de domaine à toi est
possible mais facultatif (~10 €/an ailleurs).

---

## Deux chemins possibles

| | **A — Glisser-déposer** | **B — Via GitHub** |
|---|---|---|
| Difficulté | 3 clics | ligne de commande + connexion Git |
| Mise à jour du site | reglisser le dossier | `git push`, redéploiement auto |
| Prérequis | aucun | compte GitHub |

**Commence par A.** Tu pourras toujours brancher GitHub plus tard : le dépôt est
déjà prêt en local, il ne manque que le `push`.

---

## Chemin A — Glisser-déposer (recommandé)

> **Repères de navigation.** Cloudflare a réorganisé son menu. Dans la barre de
> gauche, tout se trouve sous la section **Build** :
> | Ce qu'il te faut | Où cliquer |
> |---|---|
> | Le site | **Compute** → *Workers & Pages* |
> | Le stockage | **Storage & databases** → *KV* |
> | La protection | **Zero Trust** (section *Protect & connect*) |
>
> Ignore complètement **Domains** : l'adresse `.pages.dev` est fournie
> gratuitement, tu n'as aucun domaine à acheter.

1. [dash.cloudflare.com](https://dash.cloudflare.com) → barre de gauche →
   **Compute** → **Workers & Pages**.
2. Bouton **Create** → onglet **Pages** → **Upload assets**.
3. Nom du projet : `wealth-dashboard` → **Create project**.
4. Fais glisser le **dossier `Dashboard wealth` entier** dans la zone de dépôt,
   puis **Deploy site**.

C'est tout — `_worker.js` est détecté automatiquement et fournit l'API des cours.
Passe directement à l'**étape 3** (stockage KV).

> Pour mettre à jour plus tard : même projet → **Create new deployment** →
> reglisse le dossier.

---

## Chemin B — Étape 1 : mettre le code sur GitHub

Cloudflare déploie depuis un dépôt Git. Cette machine n'a pas Node, mais elle a
Git : aucun outil supplémentaire n'est nécessaire.

1. Crée un compte sur [github.com](https://github.com) si tu n'en as pas.
2. Crée un dépôt **privé** nommé `wealth-dashboard`.
   **Privé, impérativement** — le dépôt contiendra `assets/seed.js`, donc tes
   montants de départ.
3. Dans le dossier `Dashboard wealth`, ouvre un terminal et lance :

```bash
git init && git add . && git commit -m "Wealth Dashboard" && git branch -M main
```

Puis relie-le à ton dépôt (remplace `TON-COMPTE`) :

```bash
git remote add origin https://github.com/TON-COMPTE/wealth-dashboard.git && git push -u origin main
```

> `.gitignore` exclut déjà `.access-key` et tes exports. Vérifie quand même sur
> GitHub qu'aucun fichier `.xlsx` ou `.json` de sauvegarde n'est parti.

---

## Chemin B — Étape 2 : créer le site sur Cloudflare Pages

1. Crée un compte sur [dash.cloudflare.com](https://dash.cloudflare.com).
2. Menu **Workers & Pages** → **Create** → onglet **Pages** →
   **Connect to Git** → autorise GitHub → choisis `wealth-dashboard`.
3. Réglages de build — **laisse tout vide** :
   - Framework preset : `None`
   - Build command : *(vide)*
   - Build output directory : `/`
4. **Save and Deploy**.

Au bout d'une minute tu as une adresse `https://…pages.dev`.
**Ne l'ouvre pas encore** : elle est publique tant que l'étape 4 n'est pas faite.

---

## Étape 3 — Créer le stockage KV

1. Barre de gauche → **Storage & databases** → **KV** → **Create a namespace**
   → nomme-le `WEALTH`.
2. Retourne sur ton projet : **Compute** → **Workers & Pages** →
   `wealth-dashboard` → **Settings** → **Bindings** →
   **Add binding** → **KV namespace** :
   - Variable name : `WEALTH` ← *exactement ce nom, le code le cherche tel quel*
   - KV namespace : celui que tu viens de créer
3. Ajoute le binding pour **Production** *et* **Preview**.
4. **Deployments** → **Retry deployment** pour que le binding soit pris en compte.

Sans cette étape l'app fonctionne quand même, mais chaque appareil garde ses
données dans son coin — c'est le binding qui crée la synchronisation.

---

## Étape 4 — Ouvrir la porte (avec ta clé)

**Tu n'as rien à craindre d'un oubli ici : le site est fermé par défaut.**
Tant qu'aucune protection n'est configurée, `_worker.js` refuse de servir la
moindre donnée — y compris les fichiers statiques — et affiche une page
« Accès fermé ». Il faut donc une action de ta part pour l'ouvrir.

### Option 1 — Mot de passe (le plus simple)

1. Ton projet → **Settings** → **Variables and Secrets** → **Add variable**
2. Type : **Secret** *(pas « Text » : un secret n'est jamais réaffiché)*
3. Nom : `DASHBOARD_PASSWORD` — Valeur : un mot de passe long et unique
4. **Save and deploy**

Recharge : un écran de connexion apparaît. Une fois connecté, une session de
**30 jours** est posée dans un cookie signé. Changer le mot de passe invalide
instantanément toutes les sessions ouvertes.

### Option 2 — Cloudflare Access (connexion par code email)

Plus robuste : le filtrage se fait **avant** d'atteindre le code, donc même un
bug de l'application ne peut rien laisser fuir.

1. Barre de gauche, section *Protect & connect* → **Zero Trust** (crée
   l'organisation si demandé, choisis le plan **Free**).
2. **Access** → **Applications** → **Add an application** → **Self-hosted**.
3. Réglages :
   - Application name : `Wealth Dashboard`
   - Session duration : `1 month` (évite de se reconnecter sans cesse)
   - Domain : `wealth-dashboard.pages.dev` *(ton adresse exacte)*
4. **Add policy** :
   - Policy name : `Moi`
   - Action : `Allow`
   - Include → **Emails** → ton adresse email
5. Méthode de connexion : **One-time PIN** suffit (code envoyé par email).
6. Enregistre.

Recharge maintenant l'adresse : Cloudflare demande ton email, envoie un code,
et ne laisse passer que toi.

Les deux options fonctionnent, **l'une ou l'autre suffit**. Tu peux même les
cumuler.

> **Vérifie toujours en navigation privée.** Tu dois tomber sur un écran de
> connexion — jamais sur le dashboard. Teste aussi une adresse d'API,
> par exemple `…pages.dev/api/health` : elle doit répondre `403`.

---

## Étape 5 — Premier lancement

1. Ouvre l'adresse, connecte-toi.
2. Onglet **Données** : la carte **« Synchronisation en ligne »** doit s'afficher
   avec ton email et « ✓ active ».
3. Onglet **Positions** → **↻ Actualiser les cours** pour vérifier la passerelle.
4. Sur le téléphone : ouvre la même adresse, connecte-toi, puis
   **« Ajouter à l'écran d'accueil »**.

Tes deux appareils partagent désormais le même état.

---

## Comment les conflits sont gérés

Chaque enregistrement porte un horodatage.

- Au chargement, si la version en ligne est plus récente que la locale, l'app
  **demande** laquelle garder — elle ne tranche jamais seule.
- À l'envoi, si le serveur détient une version plus récente, il répond `409` et
  la carte affiche deux boutons : prendre la version en ligne, ou imposer la
  tienne.
- L'envoi est temporisé de 8 secondes et n'écrit que si l'état a changé — pour
  rester loin des 1 000 écritures/jour du plan gratuit.

Un conseil malgré tout : ne saisis pas au même moment sur deux appareils.

---

## Mettre à jour le site

Toute modification poussée sur GitHub redéploie automatiquement :

```bash
git add . && git commit -m "mise a jour" && git push
```

---

## Et le mode local ?

Il continue de fonctionner exactement pareil : `python serve.py` reste utile
hors connexion. Attention : le mode local et le site en ligne sont **deux
stockages distincts** (navigateurs et origines différents). Choisis-en un comme
référence, ou fais transiter le JSON par l'export/import.

---

## Ce que ça implique

🔒 Tes données financières seront hébergées **chez Cloudflare**, pas sur ton PC.
Au sens du RGPD tu en restes responsable :

- La protection ne vaut que par **Access**. Sans lui, tout est public — c'est
  pour cette raison que l'étape 4 précède la saisie.
- Garde le dépôt GitHub **privé** : `assets/seed.js` contient tes montants.
- Si tu abandonnes le projet, supprime le namespace KV, le projet Pages et le
  dépôt : les données ne doivent pas survivre à leur usage.
- Cloudflare peut techniquement accéder aux données stockées dans KV — elles n'y
  sont pas chiffrées de bout en bout. Si ce point te dérange, reste en local avec
  Tailscale.
