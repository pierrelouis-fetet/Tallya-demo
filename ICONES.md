# Icônes Tallya — d'où elles viennent, et comment les refaire

Les quatre fichiers sont **produits**, pas dessinés à la main : ils sortent du
logo source par un script, pour que la prochaine version du dessin donne les
quatre en une commande, avec les mêmes cadrages.

- **Source** : `logo tallya.png` (1254 × 1254), identité du 4 août 2026,
  direction « 01 T géométrique ». Une tuile de 880 px, coins arrondis à 204 px
  de rayon (23 %), posée sur du noir avec un halo.
- **Script** : voir la section « Comment les régénérer » ci-dessous.

| Fichier                   | Taille    | Contenu                                      |
|---------------------------|-----------|----------------------------------------------|
| `icon-512.png`            | 512 × 512 | La tuile telle quelle, recadrée sur ses bords |
| `icon-192.png`            | 192 × 192 | La même, réduite. Sert aussi de marque dans l'en-tête et sur l'écran de lancement |
| `apple-touch-icon.png`    | 180 × 180 | La même. iOS applique **son propre** arrondi   |
| `icon-maskable-512.png`   | 512 × 512 | Le T seul sur fond plein bord à bord           |

## Pourquoi une variante « maskable »

Android recadre l'icône dans la forme du lanceur, souvent un cercle. Sur une
tuile à coins arrondis et liseré, ce recadrage **coupe le cadre** et donne un
rendu sale.

La variante se prépare donc autrement : le T seul, sur un fond `#0A0A0C` plein
bord à bord, contenu dans le cercle central de 80 % (rayon 205 px sur 512). Le T
y fait 282 × 256 px, et le coin de sa barre tombe à 192 px du centre : il reste
dedans. À 55 % de hauteur il en sortait de cinq pixels.

Le T est détaché du fond **par son canal bleu**, pas par sa luminance : la tuile
porte un reflet violet dont la luminance monte à 79, au-dessus du seuil qu'on
aurait choisi, et le « T » détaché emportait alors un quart de la tuile. Le bleu
du T ne descend jamais sous 233, celui du liseré ne monte jamais au-dessus de
175 : la rampe d'opacité passe entre les deux (185 → 225), ce qui donne aussi
un bord lissé.

## Comment les régénérer

```bash
python icones.py "C:/Users/admin/Desktop/logo tallya.png"
```

`icones.py` vit à la racine, à côté de `serve.py`. Il ne demande que Pillow, et
Pillow ne sert qu'à lui : l'application, elle, n'a aucune dépendance. Le script
porte ses mesures et ses raisons en commentaires.

Ce qu'il fait, dans l'ordre :

1. Trouver les bords de la tuile en balayant les axes médians (premier pixel
   non noir) : ici `x 187..1066`, `y 171`, côté 880.
2. Recadrer la tuile, réduire en 512 / 192 / 180 (LANCZOS), écrire les trois.
3. Pour la maskable : opacité tirée du canal bleu, cadre pris sur un seuil
   franc (bleu ≥ 210) et non sur la rampe — une rangée de soixante pixels du
   liseré passe à 186, un de plus que le pied de la rampe, et le cadre montait
   alors jusqu'au bord de la tuile, le T ressortant écrasé.

**Après régénération, changer la version des balises `?v=`** dans `index.html`
et `tests.html`. Sans ça, un navigateur qui a déjà vu le site garde l'ancienne
icône, et le nouveau logo n'apparaît que sur une machine neuve.

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
- **La signature : tranchée.** L'application garde « Suivre. Arbitrer.
  **Projeter.** », trois verbes qui nomment chacun un onglet — Budget, Allocation,
  Projection. Elle s'adresse à quelqu'un qui a déjà ouvert l'application et veut
  savoir ce qu'il a devant lui.

  « Finances. Clarté. Progrès. » et son paragraphe (« Tallya est votre cockpit
  financier… ») sont pour la page publique et la fiche de la démo : ils doivent
  convaincre quelqu'un qui n'a rien installé. Trois noms, une promesse, et
  « Progrès » promet une chose que l'application ne contrôle pas — c'est bon en
  vitrine, faux en produit.

  **Un seul mot en violet, le troisième.** Suivre et arbitrer, toutes les
  applications de patrimoine le font ; la projection est ce que celle-ci promet en
  propre. L'accent tombe donc en fin de ligne, comme le « Progrès. » de la
  planche : même geste, un cran plus concret. La couleur est `var(--accent)` et
  non un violet écrit en dur, pour qu'elle suive le thème.

  Le violet ne s'applique qu'à l'écran de lancement. Le sous-titre de la barre
  latérale fait 11,5 px en gris atténué — un mot coloré y serait du bruit — et la
  description du manifeste est du texte brut, sans balisage possible.
- **Fichier mort** : `logo.png` n'est référencé nulle part. Il reste comme
  exemplaire de la marque dans le dépôt ; `logo.jfif`, doublon, est parti.
  À supprimer une fois l'identité stabilisée, avec son accord.
