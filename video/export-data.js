// Export measurements and exact scale notes from the current Bit2Beat algorithms.
const fs=require('node:fs');
const path=require('node:path');
const p=require('../src/js/core/plan.js');
const pr=require('../src/js/data/presets.js');
const m=require('../src/js/core/music.js');
const v=require('../src/js/data/nasa-media.js');
const feeds=require('../src/js/core/feeds.js');
const plan=p.build(pr.DATA.gistemp(),[{gain:.8},{mute:true}],{length:16,cues:false});
const vp=p.build(v.gedi.source,[{instrument:'soft'},{instrument:'strings'},{instrument:'marimba'}],{cues:false});
const eq=feeds.offline.quakes(),ep=p.build(eq,[],{cues:false});
const image=require('../src/js/core/image.js');
const scan=image.scan(fs.readFileSync(path.join(__dirname,'frames/gedi-analysis.rgba')),160,90,{steps:8});
const ip=p.build({kind:'image',labels:scan.labels,channels:scan.channels},[],{cues:false});
const indices=Array.from({length:12},(_,i)=>Math.round(i*(eq.points.length-1)/11));
fs.writeFileSync(path.join(__dirname,'algorithm-data.json'),JSON.stringify({
 image:{midi:ip.channels.map(c=>c.midi),values:ip.channels.map(c=>c.raw)},
 data:{values:plan.channels[0].raw,norm:plan.channels[0].norm,midi:plan.channels[0].midi,labels:plan.labels},
 video:{values:vp.channels.map(c=>c.raw),norm:vp.channels.map(c=>c.norm),midi:vp.channels.map(c=>c.midi)},
 earth:{points:indices.map(i=>eq.points[i]),steps:indices.map(i=>ep.steps[i])},
 scale:m.scaleNotes('pent',24,0)
},null,2));
