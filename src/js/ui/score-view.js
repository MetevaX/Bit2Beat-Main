/**
 * Bit2Beat ui · score rendering with abcjs (preview, full score dialog, whole-score PNG / ABC download).
 * Notes come straight from the plan, so the score always matches the sound.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, download, slug, toast } = B.dom;
  const PREVIEW = 16; // two bars of eighth notes
  const PAGE = 32; // four bars per page

  let previewKey = '';
  let paperKey = '';
  let page = 0;

  const flatsFor = (plan) => !!B.music.SCALES[plan.settings.scale]?.flats || [1, 3, 6, 8, 10].includes(plan.settings.key);

  /** True when the channels that are on take turns (each event is one channel, like Earth events):
   *  one staff with all of them then reads better than one staff of rests per channel. */
  function takesTurns(plan, list) {
    if (list.length < 2) return false;
    let any = 0;
    let both = 0;
    for (let i = 0; i < plan.count; i++) {
      const n = list.reduce((k, v) => k + (v.c.midi[i] != null ? 1 : 0), 0);
      if (n) any++;
      if (n > 1) both++;
    }
    return any > 0 && both / any < 0.1;
  }
  /** All channels that are on, on one staff: at each step the note of the channel that sounds. */
  function merged(plan, list) {
    const midi = Array.from({ length: plan.count }, (_, i) => list.find((v) => v.c.midi[i] != null)?.c.midi[i] ?? null);
    return [{ c: { name: list.map((v) => v.c.name).join(' · '), midi }, j: -1 }];
  }

  function voices(plan, which = 'active') {
    if (which === 'merged') return merged(plan, voices(plan, 'active'));
    let list = plan.channels.map((c, j) => ({ c, j }));
    if (which === 'active') list = list.filter((v) => v.c.active);
    else if (which !== 'all') list = list.filter((v) => String(v.j) === which);
    if (!list.length) list = plan.channels.map((c, j) => ({ c, j })).slice(0, 1);
    return list;
  }

  function render(el, abc, opts) {
    if (typeof ABCJS === 'undefined') {
      el.textContent = 'Score engraving is unavailable (abcjs did not load).';
      return;
    }
    el.replaceChildren();
    ABCJS.renderAbc(el, abc, { add_classes: true, foregroundColor: getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#14213d', ...opts });
  }

  /** Mark rendered notes with their step index so the current one can be highlighted. */
  function tag(el, start, count) {
    // abcjs renders one staff per voice; number notes and rests per staff in order.
    el.querySelectorAll('svg').forEach((svg) => {
      const staffs = new Map();
      svg.querySelectorAll('g.abcjs-note, g.abcjs-rest').forEach((n) => {
        const m = [...n.classList].find((c) => /^abcjs-v\d+$/.test(c)) || 'v';
        const k = staffs.get(m) || 0;
        staffs.set(m, k + 1);
        if (k < count) n.dataset.step = String(start + k);
      });
    });
  }
  function highlight(el, pos) {
    el.querySelectorAll('[data-step]').forEach((n) => n.classList.toggle('is-now', +n.dataset.step === pos));
  }

  function preview(plan, pos) {
    const el = $('scorePreview');
    if (!plan || !plan.count) {
      el.textContent = '';
      return;
    }
    const start = Math.floor(pos / PREVIEW) * PREVIEW;
    // the channels that are on: one staff when they take turns, else up to three staves with notes here
    const on = voices(plan);
    const turns = takesTurns(plan, on);
    const here = on.filter((v) => v.c.midi.slice(start, start + PREVIEW).some((m) => m != null));
    const vs = turns ? merged(plan, on) : (here.length ? here : on).slice(0, 3);
    const key = JSON.stringify([start, plan.settings.scale, plan.settings.key, plan.settings.range, plan.settings.tempo, vs.map((v) => [v.j, v.c.midi.slice(start, start + PREVIEW)])]);
    if (key !== previewKey) {
      previewKey = key;
      const abc = B.score.tune({
        title: '',
        tempo: plan.settings.tempo,
        flats: flatsFor(plan),
        barsPerLine: 2,
        showTempo: false,
        voices: vs.map((v) => ({ name: vs.length > 1 ? v.c.name.slice(0, 12) : '', midis: v.c.midi.slice(start, start + PREVIEW) })),
      });
      render(el, abc, { staffwidth: Math.max(280, el.clientWidth - 24), paddingtop: 0, paddingbottom: 0, paddingleft: 0, paddingright: 0, scale: 1 });
      tag(el, start, PREVIEW);
      const who = turns ? `${on.length} channels on one staff` : vs.map((v) => v.c.name).join(', ');
      $('scoreLabel').textContent = `Bars ${start / 8 + 1}–${Math.min(start / 8 + 2, Math.ceil(plan.count / 8))} of ${Math.ceil(plan.count / 8)} · ${who} · each step is an eighth note`;
    }
    highlight(el, pos);
  }

  function fillVoiceSelect(plan) {
    const sel = $('scoreVoices');
    const prev = sel.value || (takesTurns(plan, voices(plan)) ? 'merged' : 'active');
    sel.replaceChildren(new Option('Channels that are on', 'active'), new Option('Channels that are on, on one staff', 'merged'), new Option('All channels', 'all'), ...plan.channels.map((c, j) => new Option(c.name, String(j))));
    sel.value = [...sel.options].some((o) => o.value === prev) ? prev : takesTurns(plan, voices(plan)) ? 'merged' : 'active';
  }

  function paper(plan, pos, follow = true) {
    const dlg = $('scoreDialog');
    if (!dlg.open || !plan) return;
    const pages = Math.max(1, Math.ceil(plan.count / PAGE));
    if (follow) page = Math.min(pages - 1, Math.floor(pos / PAGE));
    const start = page * PAGE;
    const vs = voices(plan, $('scoreVoices').value);
    const key = JSON.stringify([start, $('scoreVoices').value, plan.settings, vs.map((v) => [v.j, v.c.midi.slice(start, start + PAGE)])]);
    const el = $('scorePaper');
    if (key !== paperKey) {
      paperKey = key;
      const abc = B.score.tune({
        title: plan.source.name,
        subtitle: `${plan.labels[start] ?? ''} – ${plan.labels[Math.min(plan.count, start + PAGE) - 1] ?? ''}`,
        tempo: plan.settings.tempo,
        flats: flatsFor(plan),
        voices: vs.map((v) => ({ name: v.c.name, midis: v.c.midi.slice(start, start + PAGE) })),
      });
      render(el, abc, { staffwidth: Math.max(320, el.clientWidth - 48), paddingtop: 8, paddingbottom: 8, scale: 1, foregroundColor: '#14213d' });
      tag(el, start, PAGE);
    }
    highlight(el, pos);
    $('scorePage').textContent = `Page ${page + 1} of ${pages}`;
    $('scorePrev').disabled = page === 0;
    $('scoreNext').disabled = page >= pages - 1;
  }

  function open(plan, pos) {
    fillVoiceSelect(plan);
    paperKey = '';
    $('scoreDialog').showModal();
    paper(plan, pos, true);
  }
  function turn(plan, pos, delta) {
    const pages = Math.max(1, Math.ceil(plan.count / PAGE));
    page = Math.max(0, Math.min(pages - 1, page + delta));
    paper(plan, pos, false);
  }

  function fullAbc(plan) {
    return B.score.tune({
      title: plan.source.name,
      subtitle: `${plan.source.origin?.source || ''}`,
      tempo: plan.settings.tempo,
      flats: flatsFor(plan),
      voices: voices(plan).map((v) => ({ name: v.c.name, midis: v.c.midi })),
    });
  }

  function downloadAbc(plan) {
    download(new Blob([fullAbc(plan)], { type: 'text/plain;charset=utf-8' }), slug(plan.source.name) + '.abc');
  }

  /** The whole score as braille music (BRF for embossers and braille displays). */
  function brailleOf(plan) {
    const m = B.music;
    const mood = `${m.KEYS[plan.settings.key] || 'C'} ${m.SCALES[plan.settings.scale]?.name || plan.settings.scale}`;
    return B.braille.score({
      title: plan.source.name,
      subtitle: `Bit2Beat - ${mood} - ${plan.count} readings`,
      tempo: plan.settings.tempo,
      flats: flatsFor(plan),
      voices: voices(plan).map((v) => ({ name: `${v.c.name}${v.c.unit ? ' in ' + v.c.unit : ''}`, midis: v.c.midi })),
    });
  }
  function downloadBraille(plan) {
    const b = brailleOf(plan);
    download(new Blob([b.brf], { type: 'text/plain;charset=us-ascii' }), slug(plan.source.name) + '-braille-music.brf');
    return b;
  }

  /** One tune (some steps of the channels that are on) drawn off-screen → PNG blob (SVG blob if the browser cannot paint it). */
  function tuneBlob(plan, start, end, { scale = 2 } = {}) {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-20000px;top:0;width:1000px;background:#fff';
    document.body.append(holder);
    try {
      const last = Math.min(plan.count, end) - 1;
      const abc = B.score.tune({
        title: plan.source.name,
        subtitle: `${plan.labels[start] ?? ''} – ${plan.labels[last] ?? ''} · ${plan.settings.tempo} BPM${start > 0 || end < plan.count ? ` · bars ${start / 8 + 1}–${Math.ceil((last + 1) / 8)} of ${Math.ceil(plan.count / 8)}` : ''}`,
        tempo: plan.settings.tempo,
        flats: flatsFor(plan),
        voices: voices(plan).map((v) => ({ name: v.c.name, midis: v.c.midi.slice(start, end) })),
      });
      ABCJS.renderAbc(holder, abc, { staffwidth: 940, paddingtop: 20, paddingbottom: 20, paddingleft: 20, paddingright: 20, foregroundColor: '#14213d' });
      const svg = holder.querySelector('svg');
      if (!svg) throw new Error('Nothing to engrave.');
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const vb = svg.viewBox.baseVal;
      const W = Math.round(vb?.width || svg.clientWidth || 1000);
      const H = Math.round(vb?.height || svg.clientHeight || 400);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
      const k = Math.min(scale, 30000 / H, 8000 / W); // browsers draw canvases up to about 32k pixels a side
      return new Promise((resolve) => {
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = Math.round(W * k);
          c.height = Math.round(H * k);
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, c.width, c.height);
          g.scale(k, k);
          g.drawImage(img, 0, 0, W, H);
          URL.revokeObjectURL(url);
          c.toBlob((png) => resolve(png ? { blob: png, ext: 'png', height: H } : { blob: svgBlob, ext: 'svg', height: H }), 'image/png');
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ blob: svgBlob, ext: 'svg', height: H });
        };
        img.src = url;
      });
    } finally {
      holder.remove();
    }
  }

  /**
   * The whole piece as pictures: one tall PNG when it fits, otherwise pages of whole bars
   * (each under about 12 000 px), named …-score.png or …-score-page-01.png …
   */
  async function scorePictures(plan) {
    const base = slug(plan.source.name) + '-score';
    const one = await tuneBlob(plan, 0, plan.count);
    if (one.height <= 14000) return [{ name: `${base}.${one.ext}`, blob: one.blob }];
    const pages = Math.ceil(one.height / 12000);
    const per = Math.ceil(plan.count / pages / 32) * 32; // four bars per line, whole lines per page
    const out = [];
    for (let s = 0, k = 1; s < plan.count; s += per, k++) {
      const p = await tuneBlob(plan, s, s + per);
      out.push({ name: `${base}-page-${String(k).padStart(2, '0')}.${p.ext}`, blob: p.blob });
    }
    return out;
  }

  /** Save the whole score: one PNG, or a ZIP of PNG pages for a very long piece. */
  async function downloadPng(plan) {
    try {
      const pics = await scorePictures(plan);
      if (pics.length === 1) {
        download(pics[0].blob, pics[0].name);
        toast(`The whole score saved as ${pics[0].name.split('.').pop().toUpperCase()} (${Math.ceil(plan.count / 8)} bars).`);
      } else {
        const files = await Promise.all(pics.map(async (p) => ({ name: p.name, data: new Uint8Array(await p.blob.arrayBuffer()) })));
        download(B.bundle.zipBlob(files), slug(plan.source.name) + '-score-pages.zip');
        toast(`The whole score saved as ${pics.length} PNG pages in a ZIP.`);
      }
    } catch {
      downloadAbc(plan);
    }
  }

  const invalidate = () => {
    previewKey = '';
    paperKey = '';
  };

  B.scoreView = { preview, open, paper, turn, downloadAbc, downloadPng, scorePictures, downloadBraille, brailleOf, fullAbc, invalidate };
})(typeof self !== 'undefined' ? self : this);
