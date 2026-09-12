# Icônes Longward — d'où elles viennent, et comment les refaire

Les quatre fichiers sont **produits**, pas dessinés à la main : ils sortent du
logo source par un script, pour que la prochaine version du dessin donne les
quatre en une commande, avec les mêmes cadrages.

- **Source** : `logo.png` (1254 × 1254), le **L** seul sur du noir. Ce n'est
  plus une tuile : le dessin reçu est une lettre, et c'est le script qui lui
  compose son fond.
- **Script** : `icones.py`, voir « Comment les régénérer » plus bas.

| Fichier                   | Taille    | Contenu                                      |
|---------------------------|-----------|----------------------------------------------|
| `icon-512.png`            | 512 × 512 | La lettre sur sa tuile, coins arrondis        |
| `icon-192.png`            | 192 × 192 | La même, réduite. Sert aussi de marque dans l'en-tête, sur l'écran de lancement et sur la page de connexion |
| `apple-touch-icon.png`    | 180 × 180 | La même. iOS applique **son propre** arrondi   |
| `icon-maskable-512.png`   | 512 × 512 | La lettre seule sur fond plein bord à bord     |

## La tuile se compose, elle n'est plus reçue

C'est le changement qui a rendu la version précédente du script inutilisable.

L'ancien logo arrivait déjà mis en tuile : carré à coins arrondis, dégradé,
liseré violet. Le script n'avait qu'à en trouver les bords — le premier pixel non
noir sur les axes médians — et à la réduire. Sur une **lettre nue**, cette même
recherche tombe sur la lettre elle-même et rend une icône collée aux quatre
bords.

Le fond, ses coins, son dégradé et la place de la lettre sont donc des mesures
du script, pas des propriétés du dessin :

- **dégradé vertical** de `#1D1C1F` à `#080809`, relevé sur l'icône précédente :
  c'est lui qui donne son relief à la tuile, sans ombre portée ;
- **coins arrondis à 23 %** du côté, comme avant ;
- **lettre à 55 %** de la hauteur, centrée. Sur le L, cela donne 222 × 281 px
  dans une tuile de 512.

Un logo redessiné demain n'a plus qu'à être une lettre claire centrée sur du
noir : les quatre fichiers garderont le même cadrage.

## La lettre se détache par sa luminance

L'ancienne version la séparait par son **canal bleu**, avec des seuils calés sur
les couleurs exactes du dessin d'alors. Un dégradé qui vire au violet clair en
haut — donc pauvre en bleu relatif — passe à travers ces seuils.

La luminance ne suppose aucune teinte, et le fond d'une source reste noir quel
que soit le logo qu'on y pose. La rampe va de 8 à 30 : en dessous c'est du fond,
au-dessus c'est du trait, entre les deux le bord adouci que le dessin porte
lui-même. Un seuil unique rendrait une lettre crénelée une fois réduite à 180 px.

## Pourquoi une variante « maskable »

Android recadre l'icône dans la forme du lanceur, souvent un cercle. Sur une
tuile à coins arrondis, ce recadrage **coupe le cadre** et donne un rendu sale.

La variante se prépare donc autrement : la lettre seule, sur un fond `#0A0A0C`
plein bord à bord, à 50 % de la hauteur. Le script **vérifie** que le coin le
plus éloigné du centre reste dans le cercle de 80 % que la spécification
garantit — 163 px pour une limite de 205 — et refuse d'écrire sinon. C'est un
contrôle et non un commentaire : le prochain dessin sera plus large ou plus
haut, et personne ne pensera à le mesurer.

## Comment les régénérer

```bash
python icones.py logo.png
```

`icones.py` vit à la racine, à côté de `serve.py`. Il ne demande que Pillow, et
Pillow ne sert qu'à lui : l'application, elle, n'a aucune dépendance. Le script
porte ses mesures et ses raisons en commentaires.

Ce qu'il fait, dans l'ordre :

1. Trouver la boîte du dessin sur **toute** l'image, et non sur les axes
   médians : la barre basse d'un L ne croise pas l'axe vertical du milieu.
2. Détacher la lettre de son fond par la luminance.
3. Composer la tuile, y centrer la lettre, écrire les trois tailles.
4. Composer la variante maskable, et contrôler qu'elle tient dans le cercle.

**Après régénération, deux gestes.** Changer la version des balises `?v=` dans
`index.html` et `tests.html` — sans ça, un navigateur qui a déjà vu le site garde
l'ancienne icône. Et **recopier les quatre fichiers dans l'autre dépôt** : ils
doivent être identiques octet pour octet des deux côtés.

## Ce que le CSS ne doit plus faire

`.brand-mark` (`styles.css`), `.lancement-marque img` (idem) et `.mark` (la page
de connexion, dans `_worker.js`) portaient chacun un rayon en pixels et une
bordure de 1 px. Les trois ont été alignés sur le dessin :

- **rayon en pourcentage** (23 %), parce que la même image sert à 34 px dans la
  barre latérale, 38 px dans le tiroir, 52 px sur la connexion et 72 px sur
  l'écran de lancement — un rayon fixe arrondissait chaque fois autrement.
- **plus de bordure** : la tuile porte son propre liseré violet. Le `1px solid`
  d'avant existait parce que l'ancienne icône était un carré plein bord à bord,
  qui avait besoin qu'on lui dessine un cadre.

## Reste en suspens

- **La couleur d'accent.** La palette de l'identité donne `#B98CFF`, `#9A63FF`,
  `#7E4DFF` et `#0A0A0C`. L'application est déjà violette : `--accent` vaut
  `#9a72e8` en thème sombre et `#6d3fc4` en clair, à quinze points de vert du
  violet de marque. L'écart est imperceptible sur du chrome d'interface, et la
  palette des séries a été vérifiée pour les daltonismes : on n'y touche pas
  sans décider de revalider l'ensemble.
- **La signature : tranchée.** « **Vois clair. Avance.** », et l'anglais
  « See clearly. Move forward. » Deux impératifs qui tutoient, comme toute
  l'interface : la version qui vouvoyait passait à travers le contrôle de
  vouvoiement — il cherche « vous », « vos » et « votre », et un impératif n'en
  porte aucun — mais une marque qui vouvoie au-dessus d'une interface qui tutoie
  s'entend.

  **Un seul mot en violet, le second.** Voir clair est ce que fait tout tableau
  de bord ; avancer est ce que celui-ci promet en propre. L'accent tombe donc en
  fin de ligne, et la couleur est `var(--accent)` plutôt qu'un violet écrit en
  dur, pour qu'elle suive le thème.

  Le violet ne s'applique qu'à l'écran de lancement. Le sous-titre de la barre
  latérale fait 11,5 px en gris atténué — un mot coloré y serait du bruit — et la
  description du manifeste est du texte brut, sans balisage possible.

  **Elle existe en trois exemplaires**, et deux sont des copies que rien ne peut
  dériver : le manifeste et la page de connexion du Worker ne savent appeler ni
  `trad()` ni le dictionnaire. La page de connexion a déjà dérivé une fois. Un
  test tire donc la signature du dictionnaire et vérifie les deux copies.
- **La source du logo n'est plus un fichier mort.** `logo.png` est ce que lit
  `icones.py` : c'est lui qu'on remplace quand le dessin change, et les quatre
  icônes en sortent d'une commande.
  À supprimer une fois l'identité stabilisée, avec son accord.
