"""One-time asset authoring. NOT part of the build; requires the six art tools."""
import json, math, subprocess, pathlib, colorsys
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets'; TMP=pathlib.Path('/tmp/facet'); TMP.mkdir(exist_ok=True)
def run(tool,*args):
    subprocess.run([tool,*map(str,args)],check=True,stdout=subprocess.DEVNULL,cwd=TMP)
def rect(a,x,y,w,h,c):
    a.append(dict(op='fill_rect',x=round(x),y=round(y),width=max(1,round(w)),height=max(1,round(h)),color=c))
def line(a,p,q,c):
    a.append(dict(op='line',x0=round(p[0]),y0=round(p[1]),x1=round(q[0]),y1=round(q[1]),color=c))
def poly(a,pts,c):
    for y in range(max(0,math.floor(min(p[1] for p in pts))),math.ceil(max(p[1] for p in pts))+1):
        xs=[]
        for p,q in zip(pts,pts[1:]+pts[:1]):
            if (p[1]<=y<q[1]) or (q[1]<=y<p[1]): xs.append(p[0]+(y-p[1])*(q[0]-p[0])/(q[1]-p[1]))
        xs.sort()
        for l,r in zip(xs[::2],xs[1::2]): rect(a,math.ceil(l),y,math.floor(r)-math.ceil(l)+1,1,c)
def render(a,path,w=64,h=64,sheet=False):
    path=OUT/path;path.parent.mkdir(parents=True,exist_ok=True)
    log=TMP/'art.json';log.write_text(json.dumps(a))
    run('draw-sheet' if sheet else 'draw','render','--actions',log,'--out',path,'--width',w,'--height',h,'--no-layers')
HUES=[.96,.055,.14,.39,.49,.61,.76]
NAMES=['ruby','amber','citrine','jade','beryl','sapphire','amethyst','prism']
SHAPES=[[(32,4),(55,20),(52,45),(32,59),(11,45),(8,20)],[(20,6),(44,6),(57,24),(49,48),(32,58),(15,48),(7,24)],[(32,3),(58,46),(32,57),(6,46)],[(18,7),(46,7),(54,16),(54,48),(46,57),(18,57),(10,48),(10,16)],[(32,3),(57,31),(32,60),(7,31)],[(19,6),(45,6),(58,32),(45,58),(19,58),(6,32)],[(32,3),(51,13),(58,35),(43,56),(21,56),(6,35),(13,13)],[(32,3),(56,17),(56,45),(32,60),(8,45),(8,17)]]
def color(i,v,s=.72):
    r,g,b=colorsys.hsv_to_rgb(HUES[i%7],s,v);return '#%02x%02x%02xff'%(int(r*255),int(g*255),int(b*255))
def gem(i,strain=0,turn=0):
    a=[];pts=SHAPES[i]
    if i==7 and turn:
        angle=turn*math.pi/24
        pts=[(32+(x-32)*math.cos(angle)-(y-32)*math.sin(angle),32+(x-32)*math.sin(angle)+(y-32)*math.cos(angle)) for x,y in pts]
    inner=[(32+(x-32)*.54,30+(y-30)*.54) for x,y in pts]
    poly(a,[(x,y+2) for x,y in pts],'#030b14ff')
    poly(a,pts,color(i,.35))
    for j in range(len(pts)):
        k=(j+1)%len(pts);v=[.97,.62,.42,.34,.65,.88,.76,.7][(j+turn)%8]
        c=color((j+turn)%7,v,.34) if i==7 else color(i,v)
        poly(a,[pts[j],pts[k],inner[k],inner[j]],c)
        line(a,pts[j],inner[j],color(i,.9,.4) if i<7 else '#c8e4f5ff')
    poly(a,inner,color(i,.72,.54) if i<7 else '#d2e9f0ff')
    for j in range(len(inner)):
        c=color(i,[.82,.76,.66,.6,.71,.8,.75,.7][j],.54) if i<7 else color((j+turn)%7,.94,.16)
        poly(a,[inner[j],inner[(j+1)%len(inner)],(30,27)],c)
    if i==3:
        line(a,(22,23),(42,23),'#c1ffd58c');line(a,(22,40),(42,40),'#124e36aa')
    if i==5:
        line(a,(22,29),(42,29),'#99c8ffbb');line(a,(22,35),(42,35),'#203c9aaa')
    for j in range(len(pts)):
        line(a,pts[j],pts[(j+1)%len(pts)], color(i,.9,.35) if j<2 else color(i,.4,.6))
    line(a,inner[0],inner[1],'#efffffff');line(a,(19,16),(23,16),'#ffffffff');rect(a,20,13,2,7,'#ffffffdd')
    if strain:
        cracks=[[(37,8),(30,23),(35,30),(26,42),(30,55)],[(10,28),(25,30),(35,30),(46,38),(54,38)],[(17,49),(22,36),(35,30),(43,19),(48,14)]]
        for cr in cracks[:strain]:
            for p,q in zip(cr,cr[1:]):
                line(a,(p[0]+1,p[1]),(q[0]+1,q[1]),'#f8e0baff' if strain==3 else '#9acdd9ff');line(a,p,q,'#14202fff')
        if strain==3:
            for x,y in [(11,23),(48,45),(30,8),(25,48)]:rect(a,x,y,3,3,'#fff2d3ff')
    return a
for i,n in enumerate(NAMES):
    for strain in range(4):render(gem(i,strain),pathlib.Path('gems')/f'{n}-{strain}.png')
    if i<7:
        # Fragments retain each stone's palette and fly radially apart.
        for f in range(6):
            a=[]
            for j in range(8):
                ang=j*math.tau/8+.2;d=8+f*5;x=32+math.cos(ang)*d;y=32+math.sin(ang)*d+f*f*.35;r=max(1,9-f)
                poly(a,[(x-r,y),(x+2,y-r),(x+r,y+2),(x,y+r)],color(i,.95-j*.065))
                line(a,(x-r,y),(x+2,y-r),'#dcf4ffcc')
            render(a,pathlib.Path('gems/break')/n/f'{f}.png',sheet=True)
for f in range(8):
    for strain in range(4):
        render(gem(7,strain,f),pathlib.Path('gems/prism-turn')/(f'{f}.png' if strain==0 else f'{strain}-{f}.png'),sheet=True)
a=[]
for j,r in enumerate([27,21,14]):
    for k in range(8):
        t=k*math.tau/8;u=(k+1)*math.tau/8
        line(a,(32+math.cos(t)*r,32+math.sin(t)*r),(32+math.cos(u)*r,32+math.sin(u)*r),['#eedab5ff','#fff6d9ff','#9baebaff'][j])
render(a,pathlib.Path('gems/brilliant.png'))
a=[]
poly(a,[(32+math.cos(k*math.pi/4)*(29 if k%2==0 else 10),32+math.sin(k*math.pi/4)*(29 if k%2==0 else 10)) for k in range(8)],'#fff3c9dd')
poly(a,[(32,12),(38,32),(32,52),(26,32)],'#fffcf0ff');render(a,pathlib.Path('gems/star.png'))
# Full native-resolution inlaid bench, including individual recessed sockets.
a=[];rect(a,0,0,608,608,'#0a1620ff')
for inset,c in [(1,'#53717aff'),(3,'#1c333fff'),(7,'#af9973ff'),(9,'#253e49ff'),(14,'#10232dff')]:
    a.append(dict(op='stroke_rect',x=inset,y=inset,width=608-2*inset,height=608-2*inset,color=c))
for r in range(8):
    for c in range(8):
        x=16+c*72;y=16+r*72;rect(a,x+1,y+1,70,70,'#10252fff' if (r+c)%2==0 else '#122a34ff')
        line(a,(x+5,y+68),(x+66,y+68),'#2b424aff');line(a,(x+68,y+5),(x+68,y+66),'#263d46ff')
for x,y in [(8,8),(600,8),(8,600),(600,600)]:
    poly(a,[(x,y-5),(x+5,y),(x,y+5),(x-5,y)],'#d5bf88ff')
render(a,pathlib.Path('gems/frame.png'),608,608)

def config(name,tool,d):
    p=TMP/f'{name}.json';d.update(actions=str(TMP/f'{name}-ops.json'),preview=str(TMP/f'{name}-preview.png'));p.write_text(json.dumps(d));run(tool,'--config',p,'init');return p
def cmd(tool,p,*args):run(tool,'--config',p,*args)
for name,count,speed,size,life in [('clear',14,65,3,400),('flawed',32,120,5,650),('cut',24,85,4,650),('aura',0,12,2,1100)]:
    dest=OUT/'fx'/name;dest.mkdir(parents=True,exist_ok=True)
    p=config('fx-'+name,'particle-2d',dict(width=128,height=128,duration_ms=1500,fps=30,system=str(dest/'system.json')))
    args=['add-emitter','--name','shards','--shape','disc','--x',0,'--y',0,'--radius',24 if name=='aura' else 3,'--lifetime',life,'--lifetime-spread',100,'--speed',speed,'--speed-spread',speed*.3,'--cone-angle',180]
    args+=['--rate',9] if name=='aura' else ['--burst',count]
    cmd('particle-2d',p,*args)
    cmd('particle-2d',p,'set-particle','--emitter','shards','--size-from',size,'--size-to',0,'--opacity-from',.95,'--opacity-to',0,'--color-gradient','#fff4cd@0,#78d9eb@0.45,#385a85@1','--rotation',120)
    cmd('particle-2d',p,'set-forces','--gravity',0 if name=='aura' else -95,'--drag',1.3,'--vortex',.5)
    if name=='aura':cmd('particle-2d',p,'set-timeline','--loop','true')
    cmd('particle-2d',p,'render','--frame',10)
AUDIO=OUT/'audio';AUDIO.mkdir(parents=True,exist_ok=True)
for name,freq,dur,wave in [('select',900,75,'triangle'),('swap',560,140,'sine'),('refuse',140,150,'triangle'),('land',95,180,'sine'),('flaw',1700,100,'noise'),('cut',1300,430,'sine'),('levelup',520,750,'triangle'),('gameover',390,800,'sine')]+[(f'chain-{k}',440*2**((k-1)*2/12),420,'sine') for k in range(1,9)]:
    p=config(name,'sfx-synth',dict(sample_rate=22050,channels='stereo',max_duration_ms=dur+200,seed=41,wav=str(AUDIO/f'{name}.wav')))
    cmd('sfx-synth',p,'add-voice','--name','body','--wave',wave,'--freq',freq,'--gain=-17','--dur',dur)
    cmd('sfx-synth',p,'set-envelope','--voice','body','--env','pluck')
    if name in ['swap','refuse','gameover','levelup']:
        cmd('sfx-synth',p,'set-pitch','--voice','body','--slide-to',freq*(2 if name=='levelup' else .45),'--over',dur)
    if name=='cut' or name.startswith('chain'):
        cmd('sfx-synth',p,'add-voice','--name','overtone','--wave','sine','--freq',freq*2.76,'--gain=-27','--dur',dur*.6)
        cmd('sfx-synth',p,'set-envelope','--voice','overtone','--env','pluck')
    cmd('sfx-synth',p,'render')
p=config('shatter','sfx-sample',dict(sample_rate=22050,channels='stereo',max_duration_ms=650,seed=31,sample_pack='combat-core',wav=str(AUDIO/'shatter.wav')))
cmd('sfx-sample',p,'add-sample','--name','debris_glass','--t',0,'--gain=-19','--fade-out',180)
cmd('sfx-sample',p,'add-sample','--name','snap_transient','--t',0,'--gain=-25')
cmd('sfx-sample',p,'render')
for name,tempo in [('title',108),('play',78)]:
    p=config('music-'+name,'music',dict(sample_rate=22050,channels='stereo',max_duration_ms=round(32*60000/tempo),seed=9,instrument_bank='gm-lite',wav=str(AUDIO/f'{name}.wav'),mid=str(AUDIO/f'{name}.mid')))
    cmd('music',p,'set-tempo','--bpm',tempo)
    for track,instrument,gain in [('melody','music_box',-22),('bed','vibraphone',-28),('bass','marimba',-23)]:
        cmd('music',p,'define-track','--name',track,'--instrument',instrument)
        cmd('music',p,'set-track-fx','--track',track,f'--gain={gain}','--reverb',.22)
    chords=[[50,57,62,65],[46,53,58,62],[53,60,65,69],[48,55,60,64]]
    hook=[74,77,81,77,76,74,69,72,74,77,76,72,69,65,69,72]
    for bar in range(8):
        chord=chords[bar%4]
        cmd('music',p,'add-note','--track','bass','--pitch',chord[0]-12,'--t',bar*4,'--dur',3.6,'--velocity',65)
        for j,n in enumerate(chord):cmd('music',p,'add-note','--track','bed','--pitch',n,'--t',bar*4+j*.5,'--dur',2,'--velocity',62)
        for j in range(4 if name=='title' else 2):
            cmd('music',p,'add-note','--track','melody','--pitch',hook[(bar*2+j)%16],'--t',bar*4+j*(1 if name=='title' else 2),'--dur',.8 if name=='title' else 1.5,'--velocity',75)
    cmd('music',p,'render')
print('Authored assets in',OUT)
