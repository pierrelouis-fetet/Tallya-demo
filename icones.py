# -*- coding: utf-8 -*-
"""Les quatre icones de Tallya, tirees du logo source.

    python icones.py "C:/Users/admin/Desktop/logo tallya.png"

Pourquoi un script et non quatre exports a la main : le jour ou le dessin change,
les quatre fichiers doivent se refaire avec les memes cadrages, sinon l'icone du
telephone et celle de l'en-tete se mettent a differer de quelques pixels sans
qu'on sache lequel des deux est le bon. Les mesures et les raisons sont dans
ICONES.md ; le seul prerequis est Pillow, et il ne sert qu'ici — l'application,
elle, n'a aucune dependance.

Trois fichiers sont la tuile telle quelle, reduite : c'est le dessin de l'auteur,
coins arrondis compris, et iOS applique son propre arrondi par-dessus.

Le quatrieme, « maskable », suit ce que dit ICONES.md : Android recadre l'icone
dans la forme du lanceur, souvent un cercle, ce qui couperait le cadre de la
tuile. Le T y est donc seul, sur un fond plein bord a bord.
"""
import sys
from PIL import Image

DEFAUT = 'C:/Users/admin/Desktop/logo tallya.png'
FOND = (10, 10, 12)          # #0A0A0C, le noir de la palette
CIBLE = 512


def bords_de_la_tuile(im):
    """Les bords de la tuile, balayes sur les axes medians du fichier.

    Le logo arrive centre sur du noir, avec un halo : on cherche donc le premier
    pixel non noir, et non le premier pixel de la tuile — le halo est en dessous
    du seuil, le liseré au-dessus."""
    W, H = im.size
    px = im.load()
    gauche = next(x for x in range(W) if sum(px[x, H // 2]) > 12)
    droite = next(x for x in range(W - 1, -1, -1) if sum(px[x, H // 2]) > 12)
    haut = next(y for y in range(H) if sum(px[W // 2, y]) > 12)
    return gauche, haut, droite - gauche + 1


def main(source):
    im = Image.open(source).convert('RGB')
    gauche, haut, cote = bords_de_la_tuile(im)
    tuile = im.crop((gauche, haut, gauche + cote, haut + cote))
    print('tuile %d x %d en (%d, %d)' % (cote, cote, gauche, haut))

    for nom, taille in [('icon-512.png', 512), ('icon-192.png', 192),
                        ('apple-touch-icon.png', 180)]:
        tuile.resize((taille, taille), Image.LANCZOS).save(nom, optimize=True)
        print('ecrit %s (%d px)' % (nom, taille))

    # --- le T seul, pour la variante maskable ------------------------------
    # C'est le canal bleu qui separe, pas la luminance : la tuile porte un reflet
    # violet dont la luminance monte a 79, au-dessus du seuil qu'on aurait
    # choisi, si bien que le « T » detache emportait un quart de la tuile. Le
    # bleu du T ne descend jamais sous 233, celui du liseré ne monte jamais
    # au-dessus de 175 : la rampe passe entre les deux.
    bleu = tuile.getchannel('B')
    alpha = bleu.point(
        lambda v: 0 if v <= 185 else (255 if v >= 225 else int((v - 185) * 255 / 40)))
    # Le cadre se mesure sur un seuil franc, et non sur la rampe : une rangee de
    # soixante pixels du liseré passe a 186, un de plus que le pied de la rampe,
    # et le cadre montait alors jusqu'au bord haut de la tuile — le T ressortait
    # ecrase.
    franc = bleu.point(lambda v: 255 if v >= 210 else 0).getbbox()
    bbox = (max(0, franc[0] - 3), max(0, franc[1] - 3),
            min(cote, franc[2] + 3), min(cote, franc[3] + 3))
    t = tuile.copy()
    t.putalpha(alpha)
    t = t.crop(bbox)

    # Le T doit tenir dans le cercle central de 80 %, soit un rayon de 205 px. A
    # 50 % de haut il fait 282 x 256, et le coin de sa barre tombe a 192 px du
    # centre : il reste dedans. A 55 %, il en sortait de cinq pixels.
    hauteur = int(CIBLE * 0.50)
    echelle = hauteur / t.size[1]
    t = t.resize((max(1, int(t.size[0] * echelle)), hauteur), Image.LANCZOS)
    fond = Image.new('RGB', (CIBLE, CIBLE), FOND)
    fond.paste(t, ((CIBLE - t.size[0]) // 2, (CIBLE - t.size[1]) // 2), t)
    fond.save('icon-maskable-512.png', optimize=True)
    print('ecrit icon-maskable-512.png, T de %d x %d' % t.size)
    print('\nPenser a changer la version des balises ?v= dans index.html et '
          'tests.html : sans ça, un navigateur qui a deja vu le site garde '
          'l\'ancienne icone.')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAUT)
