"""48 kHz stereo sonification, event-synchronized to the Manim scene timeline."""
from pathlib import Path
import json
import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve
ROOT=Path(__file__).resolve().parent
meta=json.loads((ROOT/'output/timing.json').read_text())
SR=48000; duration=meta['duration']; count=round(duration*SR)
y=np.zeros((count,2),dtype=np.float64)
rng=np.random.default_rng(42)
for ev in meta['events']:
    voice=ev['voice']; length=3 if voice=='pad' else 1.5
    t=np.arange(round(length*SR))/SR
    f=440*2**((ev['midi']-69)/12)
    partials=[1,.18,.08,.025] if voice=='bell' else [1,.3,.12,.04]
    wave=np.zeros(len(t))
    for h,a in enumerate(partials,1):
        if h*f<SR*.45: wave+=a*np.sin(2*np.pi*f*h*t)*np.exp(-t*(.7+h*.7))
    if voice=='pad':
        wave=.5*np.sin(2*np.pi*f*t)+.25*np.sin(2*np.pi*f*1.002*t)+.15*np.sin(2*np.pi*f*2*t)
        envelope=(1-np.exp(-t/.18))*np.exp(-t/1.2)
    elif voice=='pluck':envelope=(1-np.exp(-t/.003))*np.exp(-t/.24)
    else:envelope=(1-np.exp(-t/.006))*np.exp(-t/.65)
    wave*=envelope*ev['gain']*.28
    wave[-960:]*=np.linspace(1,0,960)
    start=round(ev['time']*SR); n=min(len(wave),count-start)
    p=np.clip(ev['pan'],-1,1); gains=[np.cos((p+1)*np.pi/4),np.sin((p+1)*np.pi/4)]
    for ch in range(2):y[start:start+n,ch]+=wave[:n]*gains[ch]
# Quiet tonal bed; the foreground notes remain the algorithm demonstration.
t=np.arange(count)/SR
fade=np.minimum(np.minimum(t/3,(duration-t)/3),1).clip(0,1)
for ch in range(2):
    for midi,amp in [(36,.009),(55,.004),(62,.0025)]:
        f=440*2**((midi-69)/12)*(1+ch*.0006)
        y[:,ch]+=amp*np.sin(2*np.pi*f*t)*(0.8+.2*np.sin(2*np.pi*.08*t))*fade
# Stereo early reflections and a gentle diffuse tail.
for ch in range(2):
    ir=np.zeros(round(SR*1.6))
    for delay,gain in [(.047+ch*.007,.16),(.103-ch*.011,.11),(.173+ch*.013,.075),(.291,.045)]:ir[int(delay*SR)]=gain
    noise=rng.normal(0,1,len(ir))*np.exp(-np.arange(len(ir))/(SR*.32))*.0007
    noise[:int(SR*.025)]=0
    y[:,ch]+=fftconvolve(y[:,ch],ir+noise)[:count]
y*=np.minimum((duration-t)/1.8,1).clip(0,1)[:,None]
peak=np.max(np.abs(y));y*=.8/max(peak,1e-6)
wavfile.write(ROOT/'output/soundtrack-float.wav',SR,y.astype(np.float32))
print(f'{duration:.2f} seconds, {len(meta["events"])} synchronized notes, peak {np.max(np.abs(y)):.3f}')
