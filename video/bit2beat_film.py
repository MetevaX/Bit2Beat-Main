"""Standalone Manim Community film. No website code is changed."""
from manim import *
import json, math
import numpy as np
from pathlib import Path
ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT/'algorithm-data.json').read_text())
BG='#071321'; INK='#EDF5FF'; MUTED='#95ABC3'; CYAN='#42DFDC'; GOLD='#FFBF58'; BLUE='#879EFF'
config.background_color=BG

def txt(s, size=28, color=INK):
    return Text(s, font='Inter', font_size=size, color=color)

def linegraph(values, x=-5.7, y=-1.7, width=11.4, height=3.4, color=CYAN):
    pts=[np.array([x+i*width/(len(values)-1), y+v*height,0]) for i,v in enumerate(values)]
    graph=VMobject().set_points_as_corners(pts).set_stroke(color,3)
    return graph,pts

class Bit2BeatFilm(Scene):
    def tone(self, midi, gain=.45, pan=0, voice='bell'):
        self.events.append(dict(time=float(self.time), midi=int(midi), gain=gain, pan=pan, voice=voice))
    def caption(self,s):
        t=txt(s,23,MUTED).move_to([0,-3.35,0])
        if t.width>12.5:t.scale_to_fit_width(12.5)
        return t
    def header(self,num,title,sub):
        self.play(FadeIn(txt(f'{num}  /  THE ALGORITHM',18,CYAN).to_edge(UP,buff=.35)),run_time=.35)
        self.play(FadeIn(txt(title,42).move_to([0,2.6,0]),shift=UP*.15),FadeIn(txt(sub,23,MUTED).move_to([0,1.95,0])),run_time=.65)
    def clear(self):
        self.play(*[FadeOut(m) for m in list(self.mobjects)],run_time=.65)
    def construct(self):
        self.events=[]
        # Opening: data points resolve into an audible waveform.
        rings=VGroup(*[Circle(radius=r,color=CYAN,stroke_opacity=.12,stroke_width=1) for r in [1.2,1.8,2.4,3]])
        wave=FunctionGraph(lambda x:.45*np.sin(3*x)*np.exp(-.07*x*x),x_range=[-6,6],color=CYAN).shift(DOWN*.7)
        logo=txt('Bit2Beat',78).move_to([0,1,0]); logo[3].set_color(GOLD)
        self.play(Create(rings),run_time=1.2)
        self.tone(48,.35,voice='pad')
        self.play(FadeIn(logo,shift=UP*.3),Create(wave),run_time=1.8)
        self.play(FadeIn(txt('HEAR THE PATTERNS OF OUR PLANET',22,GOLD).move_to([0,-1.9,0])),run_time=.7)
        self.play(ApplyWave(wave,amplitude=.2),run_time=1.5)
        self.wait(1.2);self.clear()
        # Actual GISTEMP bucket means from the app's plan.
        self.header('01','Numbers become a shape','NASA GISTEMP  •  1880–2025  •  16 bucket averages')
        norm=DATA['data']['norm']; graph,pts=linegraph(norm,y=-1.9,height=3)
        baseline=Line([-5.7,-1.9,0],[5.7,-1.9,0],color=MUTED,stroke_opacity=.3)
        dots=VGroup(*[Dot(p,radius=.055,color=GOLD) for p in pts])
        self.play(Create(baseline),Create(graph),LaggedStart(*[FadeIn(d) for d in dots],lag_ratio=.05),run_time=2)
        cap=self.caption('Preserve the pattern. Map the observed range into 0 … 1.')
        formula=txt('v = (x − minimum) / (maximum − minimum)',28,GOLD).move_to([0,-2.65,0])
        self.play(FadeIn(formula),FadeIn(cap),run_time=.7)
        for i in [0,4,8,12,15]:
            value=txt(f"{DATA['data']['values'][i]:+.2f} °C  →  {norm[i]:.2f}",30).move_to([3,1.1,0])
            self.play(Flash(pts[i],color=GOLD,flash_radius=.17),FadeIn(value),run_time=.45)
            self.wait(.55);self.play(FadeOut(value),run_time=.2)
        self.wait(.7);self.clear()
        # Scale quantization, with exact MIDI from the app.
        self.header('02','A value chooses a note','C pentatonic  •  two octaves  •  higher value = higher pitch')
        scale=DATA['scale']; n=len(scale)
        keys=VGroup(*[RoundedRectangle(width=.8,height=2.1,corner_radius=.12,stroke_color=MUTED,stroke_opacity=.3,fill_color='#12283E',fill_opacity=1).move_to([(i-(n-1)/2)*.98,-.25,0]) for i in range(n)])
        names=['C3','D3','E3','G3','A3','C4','D4','E4','G4','A4','C5']
        labels=VGroup(*[txt(names[i],19,MUTED).move_to(k.get_center()+DOWN*.65) for i,k in enumerate(keys)])
        self.play(LaggedStart(*[FadeIn(k,shift=UP*.2) for k in keys],lag_ratio=.05),FadeIn(labels),run_time=1)
        self.play(FadeIn(txt('note index = round(v × (number of notes − 1))',26,GOLD).move_to([0,-2,0])),FadeIn(self.caption('The sound you hear follows the highlighted note.')),run_time=.6)
        for i in [0,2,4,6,8,10,12,15]:
            midi=DATA['data']['midi'][i]; k=scale.index(midi)
            readout=txt(f"{norm[i]:.2f}   →   {names[k]}   →   {440*2**((midi-69)/12):.1f} Hz",29).move_to([0,1.3,0])
            self.tone(midi,.55,(i/15-.5)*1.3)
            self.play(keys[k].animate.set_fill(CYAN,.8),FadeIn(readout),run_time=.12)
            self.wait(.48)
            self.play(keys[k].animate.set_fill('#12283E',1),FadeOut(readout),run_time=.15)
        self.wait(.6);self.clear()
        # Spatial scan of actual NASA image, visual metrics only.
        self.header('03','Pictures become three voices','NASA EIC / SVS  •  GEDI forest-height visualization')
        img=ImageMobject(str(ROOT.parent/'assets/nasa/gedi.jpg')).scale_to_fit_width(6.5).move_to([-2.8,-.2,0])
        self.play(FadeIn(img),run_time=.6)
        items=VGroup(*[txt(s,27,c) for s,c in [('BRIGHTNESS  •  mean CIE L*',CYAN),('DETAIL  •  spread of lightness',GOLD),('HEIGHT  •  bright-area centre',BLUE)]]).arrange(DOWN,aligned_edge=LEFT,buff=.48).move_to([3.65,-.15,0])
        items.scale_to_fit_width(5)
        scan=Rectangle(width=.16,height=img.height,color=GOLD,fill_color=GOLD,fill_opacity=.3).move_to(img.get_left())
        self.play(FadeIn(items),FadeIn(scan),FadeIn(self.caption('Scan left to right. Measure pixels—not physical forest height.')),run_time=.7)
        for i in range(8):
            for j in range(3): self.tone(DATA['image']['midi'][j][i],.26, i/7*1.4-.7,['bell','pad','pluck'][j])
            self.play(scan.animate.move_to(img.get_left()+RIGHT*(i+1)*img.width/8),run_time=.65,rate_func=linear)
        self.wait(1.3);self.clear()
        # Temporal frame sample diagram and real measured channels.
        self.header('04','Video adds the dimension of time','48 evenly spaced frames  •  three measured channels')
        frames=Group(*[ImageMobject(str(ROOT/f'frames/gedi-{i+1:02d}.png')).scale_to_fit_width(1.7).move_to([-5+i*2, .75,0]) for i in range(6)])
        self.play(LaggedStart(*[FadeIn(m,shift=RIGHT*.2) for m in frames],lag_ratio=.1),run_time=1)
        track=Line([-5.8,-.05,0],[5.8,-.05,0],color=MUTED,stroke_opacity=.3)
        self.play(Create(track),FadeIn(txt('Δ frame = mean | L*(now) − L*(previous) |',28,GOLD).move_to([0,-2.5,0])),FadeIn(self.caption('Frame change responds to movement, lighting and cuts.')),run_time=.7)
        curves=[]
        for j,c in enumerate([CYAN,GOLD,BLUE]):
            g,_=linegraph(DATA['video']['norm'][j],y=-1.9,height=1.5,color=c);curves.append(g)
        legend=VGroup(*[txt(label,17,c).move_to([x,-.18,0]) for label,c,x in [('Brightness',CYAN,-3.7),('Detail',GOLD,0),('Frame change',BLUE,3.7)]])
        self.play(*[Create(g) for g in curves],FadeIn(legend),run_time=1.6)
        cursor=Line([-5.7,-2,0],[-5.7,-.25,0],color=INK,stroke_width=2)
        self.add(cursor)
        for i in range(12):
            k=i*4
            for j in range(3): self.tone(DATA['video']['midi'][j][k],.27,[-.65,0,.65][j],['bell','pad','pluck'][j])
            self.play(cursor.animate.set_x(-5.7+(i+1)*11.4/12),run_time=.4,rate_func=linear)
        self.wait(.8);self.clear()
        # True event positions; geography sets pitch and stereo direction.
        self.header('05','Events become a spatial instrument','USGS earthquake sample  •  west-to-east playback')
        earth=ImageMobject(str(ROOT.parent/'assets/img/world-map.jpg')).scale_to_fit_width(11)
        if earth.height>3.8: earth.scale_to_fit_height(3.8)
        earth.move_to([0,-.25,0]).set_opacity(.65)
        self.play(FadeIn(earth),FadeIn(self.caption('Latitude → pitch     •     magnitude → loudness     •     location → space')),run_time=.8)
        points=DATA['earth']['points']
        for i,p in enumerate(points):
            x=(p['lon']/180)*earth.width/2; y=-.25+(p['lat']/90)*earth.height/2
            dot=Dot([x,y,0],radius=.055,color=GOLD)
            self.add(dot)
            note=DATA['earth']['steps'][i][0]
            self.tone(note['midi'],note['gain']*.6,p['lon']/180)
            self.play(Flash(dot,color=GOLD,flash_radius=.24,line_length=.13),run_time=.35)
            self.wait(.12)
        self.wait(1);self.clear()
        # Closing pipeline with travelling pulse and last musical phrase.
        self.header('06','One plan. Every output.','The same notes drive playback, notation and audio export.')
        cards=VGroup()
        for i,(label,col) in enumerate([('SOURCE',CYAN),('MEASURE',BLUE),('MAP',GOLD),('LISTEN',CYAN)]):
            box=RoundedRectangle(width=2.6,height=1.5,corner_radius=.16,stroke_color=col,fill_color='#11283F',fill_opacity=1)
            card=VGroup(box,txt(label,25,col)).move_to([-4.8+i*3.2,0,0]);cards.add(card)
        arrows=VGroup(*[Arrow(cards[i].get_right(),cards[i+1].get_left(),buff=.12,color=MUTED) for i in range(3)])
        self.play(LaggedStart(*[FadeIn(c,shift=UP*.2) for c in cards],lag_ratio=.16),run_time=1.2)
        self.play(*[GrowArrow(a) for a in arrows],run_time=.7)
        for i,k in enumerate([60,64,67,72]):
            self.tone(k,.5,i/3-.5)
            self.play(Indicate(cards[i],color=GOLD,scale_factor=1.06),run_time=.6)
        self.play(FadeIn(self.caption('Data becomes music. Patterns become something you can hear.')),run_time=.7)
        self.wait(1.3);self.clear()
        title=txt('Listen to Earth.',64).move_to([0,.7,0])
        self.tone(48,.3,voice='pad');self.tone(60,.25);self.tone(67,.25)
        self.play(FadeIn(title,shift=UP*.15),FadeIn(txt('Bit2Beat',33,GOLD).move_to([0,-.3,0])),run_time=1)
        credits=txt('NASA SVS: Kel Elkins / GEDI • AJ Christensen, Lesley Ott / CO₂\nClimate: NASA GISS GISTEMP • Events: USGS\nAnimation: Manim Community • Music: original synthesized sonification',16,MUTED).move_to([0,-2.2,0])
        self.play(FadeIn(credits),run_time=.7);self.wait(2.8)
        (ROOT/'output/timing.json').write_text(json.dumps({'duration':float(self.time),'events':self.events},indent=2))
