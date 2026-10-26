from PIL import Image, ImageDraw
import glob, os
NAVY=(13,27,46,255); GOLD=(242,182,50,255)
def draw_mark(img, cx, cy, s):
    d=ImageDraw.Draw(img)
    for i,r in enumerate([0.42,0.30,0.18]):
        R=r*s; w=max(2,int(s*0.045))
        d.arc([cx-R,cy-R,cx+R,cy+R],start=200,end=340,fill=GOLD,width=w)
        d.arc([cx-R,cy-R,cx+R,cy+R],start=20,end=160,fill=(242,182,50,140),width=w)
    rr=0.07*s; d.ellipse([cx-rr,cy-rr,cx+rr,cy+rr],fill=GOLD)
def big(size, fg_only=False, round_=False):
    S=size*4
    img=Image.new('RGBA',(S,S),(0,0,0,0))
    if not fg_only:
        m=Image.new('L',(S,S),0); md=ImageDraw.Draw(m)
        if round_: md.ellipse([0,0,S,S],fill=255)
        else: md.rounded_rectangle([0,0,S,S],radius=int(S*0.22),fill=255)
        bg=Image.new('RGBA',(S,S),NAVY); img.paste(bg,(0,0),m)
        draw_mark(img,S/2,S/2,S*0.95)
    else:
        draw_mark(img,S/2,S/2,S*0.62)
    return img.resize((size,size),Image.LANCZOS)
import re
res='android/app/src/main/res'
dens={'mdpi':1,'hdpi':1.5,'xhdpi':2,'xxhdpi':3,'xxxhdpi':4}
for k,f in dens.items():
    big(int(48*f)).save(f'{res}/mipmap-{k}/ic_launcher.png')
    big(int(48*f),round_=True).save(f'{res}/mipmap-{k}/ic_launcher_round.png')
    big(int(108*f),fg_only=True).save(f'{res}/mipmap-{k}/ic_launcher_foreground.png')
for p in glob.glob(f'{res}/drawable*/splash.png'):
    w,h=Image.open(p).size
    sp=Image.new('RGBA',(w,h),(11,22,38,255)); s=int(min(w,h)*0.35)
    ic=big(s); sp.paste(ic,((w-s)//2,(h-s)//2),ic); sp.convert('RGB').save(p)
bgx=os.path.join(res,'values','ic_launcher_background.xml')
if os.path.exists(bgx):
    t=open(bgx).read(); open(bgx,'w').write(re.sub(r'#[0-9A-Fa-f]{6}','#0D1B2E',t))
print('icones gerados')
