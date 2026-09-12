# -*- coding: utf-8 -*-
"""Les quatre icones de Longward, composees a partir du logo source.

    python icones.py "logo.png"

Pourquoi un script et non quatre exports a la main : le jour ou le dessin change,
les quatre fichiers doivent se refaire avec les memes cadrages, sinon l'icone du
telephone et celle de l'en-tete se mettent a differer de quelques pixels sans
qu'on sache lequel des deux est le bon. Les mesures et les raisons sont dans
ICONES.md ; le seul prerequis est Pillow, et il ne sert qu'ici — l'application,
elle, n'a aucune dependance.

LA SOURCE EST UNE LETTRE, PAS UNE TUILE, et c'est le changement qui a rendu
cette version necessaire. L'ancien logo arrivait deja mis en tuile : carre a
coins arrondis, degrade, liseré. Le script n'avait qu'a en trouver les bords et
la reduire. Il cherchait donc le premier pixel non noir sur les axes medians —
sur une lettre nue, cette recherche tombe sur la lettre elle-meme et rend une
icone collee aux quatre bords.

LA TUILE SE COMPOSE DONC ICI. Le fond, ses coins, son degrade et la place de la
lettre sont des mesures de ce fichier, pas des proprietes du dessin recu. Un
logo redessine demain n'a plus qu'a etre une lettre centree sur du noir, et les
quatre fichiers restent identiques de cadrage.

ET LA LETTRE SE DETACHE PAR SA LUMINANCE. L'ancienne version la separait par son
canal bleu, avec des seuils cales sur les couleurs exactes du dessin d'alors :
un degrade qui vire au violet en haut — donc pauvre en bleu — passait a travers.
La luminance ne suppose aucune teinte, et le fond d'une source reste noir quel
que soit le logo qu'on y pose.
"""
import sys
from PIL import Image, ImageDraw

DEFAUT = 'logo.png'
CIBLE = 512

# Le fond de la tuile, mesure sur l'icone precedente : un degre vertical, clair
# en haut, presque noir en bas. C'est ce qui lui donne son relief sans ombre.
FOND_HAUT = (29, 28, 31)
FOND_BAS = (8, 8, 9)
# Le noir de la palette, pour la variante maskable qui n'a pas de degrade : un
# fond plein bord a bord, donc rien qui puisse se faire couper.
FOND_PLEIN = (10, 10, 12)

RAYON = 0.23                 # du cote de la tuile, comme l'icone precedente
PART_LETTRE = 0.55           # hauteur de la lettre dans la tuile
PART_MASKABLE = 0.50         # hauteur de la lettre sur le fond plein

# Le seuil qui separe le dessin du noir. Deux valeurs, et l'ecart entre elles
# est la rampe : en dessous c'est du fond, au-dessus c'est du trait, entre les
# deux c'est le bord adouci que le dessin porte lui-meme. Un seuil unique
# rendrait une lettre aux bords crenelles une fois reduite a 180 pixels.
SEUIL_BAS, SEUIL_HAUT = 8, 30


def lettre_seule(source):
    """Le dessin, detache de son fond noir, reduit a sa boite."""
    im = Image.open(source).convert('RGB')
    gris = im.convert('L')
    # La boite se mesure sur TOUTE l'image, pas sur les axes medians : la barre
    # basse d'un L ne croise pas l'axe vertical du milieu, et un balayage en
    # croix la manquerait.
    boite = gris.point(lambda v: 255 if v > SEUIL_HAUT else 0).getbbox()
    if not boite:
        raise SystemExit('aucun dessin trouve : la source est-elle bien '
                         'une lettre claire sur du noir ?')
    alpha = gris.point(lambda v: 0 if v <= SEUIL_BAS else
                       (255 if v >= SEUIL_HAUT else
                        int((v - SEUIL_BAS) * 255 / (SEUIL_HAUT - SEUIL_BAS))))
    im.putalpha(alpha)
    return im.crop(boite)


def posee(lettre, cote, part, fond):
    """La lettre centree sur un fond, a la hauteur voulue."""
    hauteur = int(cote * part)
    echelle = hauteur / lettre.size[1]
    petite = lettre.resize((max(1, round(lettre.size[0] * echelle)), hauteur),
                           Image.LANCZOS)
    fond = fond.copy()
    fond.paste(petite, ((cote - petite.size[0]) // 2,
                        (cote - petite.size[1]) // 2), petite)
    return fond, petite.size


def tuile(cote):
    """Le carre sombre a coins arrondis, avec son degrade vertical."""
    degrade = Image.new('RGB', (1, cote))
    px = degrade.load()
    for y in range(cote):
        t = y / (cote - 1)
        px[0, y] = tuple(round(h + (b - h) * t)
                         for h, b in zip(FOND_HAUT, FOND_BAS))
    degrade = degrade.resize((cote, cote))

    # Les coins sont dessines sur du noir, et non rendus transparents : les
    # trois fichiers sont opaques, iOS et Android posant leur propre masque
    # par-dessus. Un PNG a coins transparents y donnerait un halo clair.
    masque = Image.new('L', (cote, cote), 0)
    ImageDraw.Draw(masque).rounded_rectangle(
        (0, 0, cote - 1, cote - 1), radius=int(cote * RAYON), fill=255)
    plaque = Image.new('RGB', (cote, cote), (0, 0, 0))
    plaque.paste(degrade, (0, 0), masque)
    return plaque


def main(source):
    lettre = lettre_seule(source)
    print('lettre %d x %d, decoupee de %s' % (lettre.size + (source,)))

    grande, taille = posee(lettre, CIBLE, PART_LETTRE, tuile(CIBLE))
    print('tuile %d px, lettre %d x %d dedans' % ((CIBLE,) + taille))
    for nom, cote in [('icon-512.png', 512), ('icon-192.png', 192),
                      ('apple-touch-icon.png', 180)]:
        grande.resize((cote, cote), Image.LANCZOS).save(nom, optimize=True)
        print('ecrit %s (%d px)' % (nom, cote))

    # --- la variante maskable ----------------------------------------------
    # Android recadre l'icone dans la forme du lanceur, souvent un cercle, ce
    # qui couperait les coins de la tuile et son degrade. La lettre y est donc
    # seule, sur un fond plein bord a bord, et assez petite pour tenir dans le
    # cercle central de 80 % que la specification garantit.
    plein = Image.new('RGB', (CIBLE, CIBLE), FOND_PLEIN)
    masquable, taille = posee(lettre, CIBLE, PART_MASKABLE, plein)
    masquable.save('icon-maskable-512.png', optimize=True)
    print('ecrit icon-maskable-512.png, lettre %d x %d' % taille)

    # Le coin le plus eloigne du centre doit rester dans le cercle de 80 %.
    demi = (taille[0] / 2, taille[1] / 2)
    rayon = (demi[0] ** 2 + demi[1] ** 2) ** 0.5
    limite = CIBLE * 0.40
    print('coin a %.0f px du centre, limite %.0f px : %s'
          % (rayon, limite, 'dedans' if rayon <= limite else 'DEHORS'))
    if rayon > limite:
        raise SystemExit('la lettre deborde du cercle sur : baisser '
                         'PART_MASKABLE')

    print('\nPenser a changer la version des balises ?v= dans index.html et '
          'tests.html, et a recopier les quatre fichiers dans la demonstration : '
          'sans ça, un navigateur qui a deja vu le site garde l\'ancienne icone.')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAUT)
