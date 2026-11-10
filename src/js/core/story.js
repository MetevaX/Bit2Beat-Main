/**
 * Bit2Beat core · Bitty's Earth story.
 *
 * Eight short chapters that each play one real data set from the studio, told by Bitty, the
 * space pup. Every chapter has a "scene" (which tab and source to load, and the few settings that
 * make it easier to hear), a narration, a hint of what to listen for, and facts that are worked
 * out from the very numbers you hear, so they stay true when a live feed replaces the snapshot.
 * Pure data and functions, no DOM: tested in Node.
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports ? { stats: require('./stats.js') } : root.Bit2Beat;
  const mod = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).story = mod;
})(typeof self !== 'undefined' ? self : this, function (deps) {
  'use strict';
  const { stats } = deps;

  // ------------------------------------------------------------------ helpers
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const signed = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const n1 = (v) => v.toFixed(1).replace('-', '−');
  const plural = (n, one, many = one + 's') => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
  const channel = (src, re) => (src?.channels || []).find((c) => re.test(c.name));
  /** Index of the largest (or smallest) finite value, or -1. */
  function argBest(values, dir = 1) {
    let best = -1;
    (values || []).forEach((v, i) => {
      if (finite(v) && (best < 0 || dir * (v - values[best]) > 0)) best = i;
    });
    return best;
  }
  const mean = (a) => {
    const f = a.filter(finite);
    return f.length ? f.reduce((s, v) => s + v, 0) / f.length : NaN;
  };
  /** "5 March" from "2025-03-05". */
  function day(label) {
    const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(label));
    if (!m) return String(label);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${+m[3]} ${months[+m[2] - 1]}`;
  }

  // ------------------------------------------------------------------ facts from the data
  /** Facts read from the source that is playing (each returns plain sentences). */
  const FACTS = {
    shape(src) {
      const c = src.channels[0];
      return [`${plural(c.values.length, 'value')} from ${c.values[0]} to ${c.values[c.values.length - 1]}, one eighth note each.`, 'Bigger value = higher note. Smaller value = lower note.'];
    },

    warming(src) {
      const c = src.channels[0];
      const years = src.labels.map(Number);
      const out = [];
      const top = argBest(c.values, 1);
      if (top >= 0) out.push(`Warmest year in the record: ${years[top]}, ${signed(c.values[top])} °C compared with the 1951–1980 average.`);
      const ranked = c.values.map((v, i) => [v, years[i]]).filter((p) => finite(p[0])).sort((a, b) => b[0] - a[0]);
      if (ranked.length >= 20) {
        const since = Math.min(...ranked.slice(0, 10).map((p) => p[1]));
        out.push(`All ten warmest years came in ${since} or later.`);
      }
      if (c.values.length >= 40) {
        const early = mean(c.values.slice(0, 30));
        const late = mean(c.values.slice(-10));
        out.push(`${years[0]}–${years[29]} averaged ${signed(early)} °C; the last ten years averaged ${signed(late)} °C. That is about ${(late - early).toFixed(1)} °C warmer.`);
      }
      return out;
    },

    /** `global` is the GISTEMP source, used to compare the trend over the same years. */
    arctic(src, { global } = {}) {
      const c = src.channels[0];
      const years = src.labels.map(Number);
      const out = [];
      const t = stats.linearTrend(c.values, years);
      if (t.n >= 10) out.push(`Svalbard warmed by about ${(t.slope * 10).toFixed(2)} °C per decade from ${years[0]} to ${years[years.length - 1]}.`);
      if (global && t.n >= 10) {
        const gy = global.labels.map(Number);
        const gv = global.channels[0].values.filter((_, i) => gy[i] >= years[0] && gy[i] <= years[years.length - 1]);
        const g = stats.linearTrend(gv, gy.filter((y) => y >= years[0] && y <= years[years.length - 1]));
        if (g.slope > 0) out.push(`The whole planet warmed by ${(g.slope * 10).toFixed(2)} °C per decade over the same years, so this Arctic place warmed about ${(t.slope / g.slope).toFixed(1)} times faster.`);
      }
      const hi = argBest(c.values, 1);
      const lo = argBest(c.values, -1);
      if (hi >= 0 && lo >= 0) out.push(`Coldest year ${years[lo]} (${n1(c.values[lo])} °C), warmest year ${years[hi]} (${n1(c.values[hi])} °C).`);
      return out;
    },

    polar(src) {
      const out = [];
      const sun = channel(src, /sun/i);
      const temp = channel(src, /^mean/i) || src.channels[0];
      if (sun) {
        const dark = sun.values.filter((v) => v === 0).length;
        if (dark) out.push(`${plural(dark, 'day')} of the year had no measurable sunlight at the ground: the polar night and its dark twilight.`);
        const top = argBest(sun.values, 1);
        if (top >= 0) out.push(`Brightest day: ${day(src.labels[top])}, ${sun.values[top].toFixed(1)} ${sun.unit}.`);
      }
      const lo = argBest(temp.values, -1);
      const hi = argBest(temp.values, 1);
      if (lo >= 0 && hi >= 0) out.push(`Coldest day ${day(src.labels[lo])} (${n1(temp.values[lo])} °C), warmest day ${day(src.labels[hi])} (${n1(temp.values[hi])} °C).`);
      return out;
    },

    quakes(src) {
      const c = src.channels[0];
      const out = [`${plural(c.values.length, 'earthquake')} in “${src.name}”, played from west to east.`];
      const mags = c.loudBy || [];
      const top = argBest(mags, 1);
      if (top >= 0) out.push(`Strongest: ${String(src.details?.[top] || 'M' + mags[top]).split(' · ').slice(0, 2).join(', ')}.`);
      const depths = (src.points || []).map((p) => p.depth);
      const deep = argBest(depths, 1);
      if (deep >= 0) out.push(`Deepest: ${Math.round(depths[deep])} km below the surface (${String(src.details?.[deep] || '').split(' · ')[1] || src.labels[deep]}). Deep quakes sit lower in 3D sound.`);
      return out;
    },

    events(src) {
      const counts = src.channels
        .map((c) => [c.name, c.values.filter(finite).length])
        .filter((p) => p[1] > 0)
        .sort((a, b) => b[1] - a[1]);
      const total = counts.reduce((s, p) => s + p[1], 0);
      const out = [`${plural(total, 'natural event')} in ${plural(counts.length, 'kind')}: ${counts.map(([n, k]) => `${k} ${n.toLowerCase()}`).join(', ')}.`];
      if (counts.length) out.push(`The busiest voice is ${counts[0][0].toLowerCase()}. Solo it (S) in Channels to hear only that kind.`);
      return out;
    },

    forests(src) {
      const out = [];
      const h = channel(src, /height/i);
      const land = channel(src, /land/i);
      if (h) {
        const top = argBest(h.values, 1);
        if (top >= 0) out.push(`The forest height shown peaks at about ${h.values[top].toFixed(1)} m (averaged over the land in view), ${src.labels[top]} into the video.`);
      }
      if (land) {
        const top = argBest(land.values, 1);
        if (top >= 0) out.push(`At most ${Math.round(land.values[top])}% of the picture showed land with forest data.`);
      }
      out.push('Heights are what the visualisation shows through its colour bar (0–50 m), not new measurements.');
      return out;
    },

    breath(src) {
      const out = [];
      const co2 = channel(src, /co/i);
      const area = channel(src, /area/i);
      if (co2) {
        const lo = argBest(co2.values, -1);
        const hi = argBest(co2.values, 1);
        if (lo >= 0 && hi >= 0) out.push(`CO₂ shown ranged from ${co2.values[lo].toFixed(0)} to ${co2.values[hi].toFixed(0)} ppm; the peak came at ${src.labels[hi]}.`);
      }
      if (area) {
        const hi = argBest(area.values, 1);
        if (hi >= 0) out.push(`At most ${Math.round(area.values[hi])}% of the globe in view was above ~420 ppm.`);
      }
      out.push('Values are from a NASA model shown through its colour bar, not new measurements.');
      return out;
    },
  };

  // ------------------------------------------------------------------ the chapters
  /**
   * scene: { mode, src, settings?, unmute? } — what the studio loads for this chapter.
   * mood: Bitty's face. listen: what to listen for. facts: a key of FACTS.
   */
  const CHAPTERS = [
    {
      id: 'listen',
      kicker: 'Prologue',
      title: 'A silent planet',
      mood: 'excited',
      scene: { mode: 'data', src: 'rising', settings: { length: 0, drone: 'off' } },
      text: 'Woof! I’m Bitty, a space pup with very good ears. From orbit I can see everything Earth’s satellites measure, but numbers make no sound. Bit2Beat gives every number a note: the bigger the number, the higher the note. Let’s warm up with a line that only goes up.',
      listen: 'The melody climbs step by step from the first note to the last, just like the line.',
      facts: 'shape',
    },
    {
      id: 'warming',
      kicker: 'Chapter 1 · Climate',
      title: 'A warming century',
      mood: 'curious',
      scene: { mode: 'data', src: 'gistemp', settings: { length: 0, drone: 'baseline' } },
      text: 'Since 1880, NASA scientists have worked out how warm each year was compared with a “normal” from 1951 to 1980. I switched on a quiet reference tone at that normal. Notes below it were cooler years, notes above it were warmer ones. Listen to how the second half of the song stops coming back down.',
      listen: 'For decades the melody wanders around the reference tone. Then it climbs above it and stays there.',
      facts: 'warming',
    },
    {
      id: 'arctic',
      kicker: 'Chapter 2 · The Arctic',
      title: 'The Arctic runs a fever',
      mood: 'curious',
      scene: { mode: 'data', src: 'arcticAnnual', settings: { length: 0, drone: 'mean' } },
      text: 'This is Svalbard, a group of islands far north of Norway, closer to the North Pole than to Oslo. NASA POWER gives one average temperature for each year. Snow and ice reflect sunlight back to space; when they melt, darker land and sea soak up more heat. That is one reason the Arctic warms faster than the rest of the planet.',
      listen: 'The reference tone is the average of all these years. Early years sit below it, recent years jump above it.',
      facts: 'arctic',
    },
    {
      id: 'polar',
      kicker: 'Chapter 3 · The Arctic',
      title: 'Polar night, midnight sun',
      mood: 'happy',
      scene: { mode: 'data', src: 'arcticDaily', settings: { length: 120, drone: 'off' }, unmute: ['Sunlight'] },
      text: 'Now every day of 2025 in Svalbard, squeezed into 120 steps. Two voices sing together: the temperature, and the sunlight reaching the ground. In winter the Sun never rises there. In summer it never sets.',
      listen: 'The sunlight voice stays on its lowest note for weeks at the start and the end, then rises into a long, high summer.',
      facts: 'polar',
    },
    {
      id: 'quakes',
      kicker: 'Chapter 4 · Earthquakes',
      title: 'The restless ring',
      mood: 'excited',
      scene: { mode: 'earth', src: 'quakes', settings: { spacing: 'time' } },
      text: 'Earth’s outer shell is cracked into giant plates that slowly grind past each other. When they slip, the ground shakes. I sweep across the world map from west to east, like reading a page. Each quake is one note: further north sounds higher, stronger quakes play louder. “Map distance” keeps the real gaps, so busy places sound busy and empty oceans go quiet.',
      listen: 'Bursts of notes at both ends of the sweep and along the Americas: the rim of the Pacific Ocean, called the Ring of Fire.',
      facts: 'quakes',
    },
    {
      id: 'events',
      kicker: 'Chapter 5 · Natural events',
      title: 'Fire, flood and ice',
      mood: 'curious',
      scene: { mode: 'earth', src: 'eonet', settings: { spacing: 'even' } },
      text: 'NASA’s Earth Observatory keeps a list of natural events seen from space: wildfires, storms, floods, icebergs and volcanoes. Every kind of event has its own instrument, so you can follow them with your eyes closed. Louder notes are bigger events: larger fires, stronger winds, bigger icebergs.',
      listen: 'Follow one instrument at a time. Each kind of event keeps the same sound all the way across the map.',
      facts: 'events',
    },
    {
      id: 'forests',
      kicker: 'Chapter 6 · Forests',
      title: 'Forests measured by laser',
      mood: 'happy',
      scene: { mode: 'video', src: 'gedi' },
      text: 'GEDI is a laser instrument on the International Space Station. It times how long its light takes to bounce back from the treetops and from the ground, and that tells it how tall the forest is. Bit2Beat reads this NASA animation through its own colour bar, so the notes follow forest height, not just colour. Watch the globe turn while you listen.',
      listen: 'The melody rises as the rainforests of the Amazon, the Congo and South-East Asia turn into view.',
      facts: 'forests',
    },
    {
      id: 'breath',
      kicker: 'Chapter 7 · Air',
      title: 'The planet breathes',
      mood: 'curious',
      scene: { mode: 'video', src: 'co2' },
      text: 'Carbon dioxide is invisible, but this NASA computer model shows it, from January to March 2020. Plumes rise from cities, industry and fires and the wind carries them around the world. Carbon dioxide traps heat, which brings us back to the warming you heard in Chapter 1.',
      listen: 'The tone rises and the second voice grows louder as thick plumes over East Asia and fire regions swing into view.',
      facts: 'breath',
    },
  ];

  const FINALE = {
    id: 'finale',
    kicker: 'Epilogue',
    title: 'Your turn',
    mood: 'joy',
    text: 'You heard a warming century, a fevered Arctic, a restless crust, a planet that burns, floods and freezes, its forests and its breath. Now it is your turn: open the studio and listen to anything with numbers, from a school weather station to a river gauge, or a picture of your own.',
  };

  const byId = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));

  /** Facts for a chapter, read from the source that is (or will be) playing. Never throws. */
  function factsFor(id, src, extra) {
    const ch = byId[id];
    if (!ch || !src || !src.channels?.length) return [];
    try {
      return FACTS[ch.facts](src, extra || {}).filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Which chapter is the studio showing now (mode + source id), if any. */
  function chapterFor(mode, srcId) {
    return CHAPTERS.find((c) => c.scene.mode === mode && c.scene.src === srcId) || null;
  }

  /** Progress text for the badge: how many chapters have been heard. */
  function progress(heard) {
    const n = CHAPTERS.filter((c) => heard && heard[c.id]).length;
    return { n, total: CHAPTERS.length, done: n === CHAPTERS.length };
  }

  return { CHAPTERS, FINALE, FACTS, factsFor, chapterFor, progress, day };
});
