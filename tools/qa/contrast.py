import json, sys, glob, os
from PIL import Image
def lin(c): c/=255; return c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
def L(rgb): r,g,b=rgb; return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)
def ratio(a,b): la,lb=L(a),L(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
def parse(c):
    n=[float(x) for x in c[c.index('(')+1:c.index(')')].replace('/',' ').replace(',',' ').split()]
    return n[:3], (n[3] if len(n)>3 else 1)
bad=0
for jf in sorted(glob.glob('audit/*.json')):
    name=os.path.basename(jf)[:-5]; im=Image.open(f'audit/{name}.png').convert('RGB'); sc=im.width/390
    seen=[]
    for it in json.load(open(jf)):
        if any(ord(ch)>0x2000 for ch in it['t']) or it['color'].startswith('rgba(0, 0, 0, 0)'): continue   # emoji / gradient-clipped headings are not measurable this way
        rgb,a=parse(it['color']); a*=it['op']
        x0,y0=int(it['x']*sc),int(it['y']*sc); x1,y1=int((it['x']+it['w'])*sc),int((it['y']+it['h'])*sc)
        x1=min(x1,im.width-1); y1=min(y1,im.height-1)
        if x1<=x0 or y1<=y0: continue
        crop=im.crop((x0,y0,x1+1,y1+1)); px=list(crop.getdata())
        # worst case: the background pixel with the lowest contrast against the text colour
        bgs=sorted(px,key=lambda p:ratio([a*c+(1-a)*q for c,q in zip(rgb,p)],p))
        worst=bgs[0]; fg=[a*c+(1-a)*q for c,q in zip(rgb,worst)]
        r=ratio(fg,worst); large=it['size']>=24 or (it['size']>=18.66 and it['weight']>=700)
        need=3.0 if large else 4.5
        if r<need: seen.append((round(r,2),need,it['t'],int(it['size']),it['color']))
    seen.sort()
    print(f'== {name}: {len(seen)} failing text runs')
    for s in seen[:14]: print('  ',s)
    bad+=len(seen)
print('TOTAL failing:',bad)
