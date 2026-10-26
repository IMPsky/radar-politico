from PIL import Image, ImageDraw
import glob, os, re

GREEN = (0, 156, 59, 255); YELLOW = (255, 223, 0, 255); BLUE = (0, 39, 118, 255); WHITE = (255, 255, 255, 255)
DARK = (5, 23, 15, 255)


def emblem(img, cx, cy, w, h):
    """Losango amarelo + círculo azul com a faixa branca e estrelas (bandeira do Brasil)."""
    d = ImageDraw.Draw(img)
    d.polygon([(cx - w / 2, cy), (cx, cy - h / 2), (cx + w / 2, cy), (cx, cy + h / 2)], fill=YELLOW)
    r = h * 0.30
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BLUE)
    S = img.size[0]
    band = Image.new('L', img.size, 0)
    bd = ImageDraw.Draw(band)
    R = r * 2.6
    acx, acy = cx - r * 0.55, cy + R * 0.93
    bw = max(2, int(r * 0.17))
    bd.ellipse([acx - R, acy - R, acx + R, acy + R], outline=255, width=bw)
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    band = Image.composite(band, Image.new('L', img.size, 0), mask)
    img.paste(Image.new('RGBA', img.size, WHITE), (0, 0), band)
    s = max(1, r * 0.055)
    for fx, fy in [(-.45, .25), (-.2, .45), (.05, .3), (.3, .5), (.5, .2), (.15, .62), (-.05, .1), (.35, .05), (-.55, -.1)]:
        x, y = cx + fx * r, cy + fy * r
        d.ellipse([x - s, y - s, x + s, y + s], fill=WHITE)


def icon(size, kind='square'):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if kind == 'fg':
        # ícone adaptativo: só o emblema dentro da área segura
        emblem(img, S / 2, S / 2, S * 0.60, S * 0.44)
    else:
        m = Image.new('L', (S, S), 0)
        md = ImageDraw.Draw(m)
        if kind == 'round':
            md.ellipse([0, 0, S, S], fill=255)
        else:
            md.rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=255)
        layer = Image.new('RGBA', (S, S), GREEN)
        emblem(layer, S / 2, S / 2, S * 0.86, S * 0.62)
        img.paste(layer, (0, 0), m)
    return img.resize((size, size), Image.LANCZOS)


res = 'android/app/src/main/res'
dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
if os.path.isdir(res):
    for k, f in dens.items():
        icon(int(48 * f)).save(f'{res}/mipmap-{k}/ic_launcher.png')
        icon(int(48 * f), 'round').save(f'{res}/mipmap-{k}/ic_launcher_round.png')
        icon(int(108 * f), 'fg').save(f'{res}/mipmap-{k}/ic_launcher_foreground.png')
    for p in glob.glob(f'{res}/drawable*/splash.png'):
        w, h = Image.open(p).size
        sp = Image.new('RGBA', (w, h), DARK)
        s = int(min(w, h) * 0.35)
        ic = icon(s)
        sp.paste(ic, ((w - s) // 2, (h - s) // 2), ic)
        sp.convert('RGB').save(p)
    bgx = os.path.join(res, 'values', 'ic_launcher_background.xml')
    if os.path.exists(bgx):
        t = open(bgx).read()
        open(bgx, 'w').write(re.sub(r'#[0-9A-Fa-f]{6}', '#009C3B', t))
    print('icones gerados')
else:
    icon(512).save('icon-preview.png')
    icon(512, 'round').save('icon-preview-round.png')
    print('previa gerada')
