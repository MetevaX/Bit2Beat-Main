/**
 * Bit2Beat ui · pointer input on the source canvas: hover read-outs, click to hear a step,
 * and "Follow pointer" sonification of pictures.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $ } = B.dom;
  const { music, stats } = B;

  function init(app) {
    const state = app.state;
    const player = app.player;
    const seek = (...a) => app.seek(...a);
    const drawAll = () => app.drawAll();

    // ------------------------------------------------------------------ canvas interaction
    function stepFromEvent(e) {
      const hitInfo = app.hitInfo;
      const plan = app.plan;
      const src = app.src;
      if (!hitInfo || !plan?.count) return null;
      const r = $('sourceCanvas').getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const R = hitInfo.rect;
      const scan = src?.science && src.science.mode !== 'sweep' ? 'line' : app.state.image.scan;
      if (src?.science && src.science.mode !== 'sweep') {
        if (y < R.y || y > R.y + R.h || x < R.x || x > R.x + R.w) return null;
        const u = (x - R.x) / R.w;
        return { i: Math.min(plan.count - 1, Math.floor(u * plan.count)), x, y, u, v: (y - R.y) / R.h };
      }
      if (hitInfo.kind === 'image' && scan === 'radar') {
        if (y < R.y || y > R.y + R.h || x < R.x || x > R.x + R.w) return null;
        // clockwise from 12 o'clock, like the scan
        const a = (Math.atan2(x - (R.x + R.w / 2), -(y - (R.y + R.h / 2))) + 2 * Math.PI) % (2 * Math.PI);
        return { i: Math.min(plan.count - 1, Math.floor((a / (2 * Math.PI)) * plan.count)), x, y, u: (x - R.x) / R.w, v: (y - R.y) / R.h };
      }
      if (hitInfo.kind === 'image' && scan === 'down') {
        if (y < R.y || y > R.y + R.h || x < R.x || x > R.x + R.w) return null;
        const v = (y - R.y) / R.h;
        return { i: Math.min(plan.count - 1, Math.floor(v * plan.count)), x, y, u: (x - R.x) / R.w, v };
      }
      if (hitInfo.kind === 'chart' || hitInfo.kind === 'image') {
        if (x < R.x || x > R.x + R.w) return null;
        const u = (x - R.x) / R.w;
        if (hitInfo.kind === 'image') return { i: Math.min(plan.count - 1, Math.floor(u * plan.count)), x, y, u, v: (y - R.y) / R.h };
        const t = u * plan.times[plan.count - 1];
        return { i: B.plan.stepAt(plan, t + plan.step / 2), x, y };
      }
      // maps: nearest point within 18 px
      let best = null;
      let bd = 18 * 18;
      (src.points || []).forEach((p, i) => {
        const { x: px, y: py } = B.draw.projectWorld(p.lat, p.lon, R);
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best == null ? null : { i: best, x, y };
    }

    let lastProbe = 0;
    function onCanvasMove(e) {
      const hit = stepFromEvent(e);
      const tip = $('hoverTip');
      const src = app.src;
      if (src?.kind === 'image' && state.image.scan === 'pointer' && hit && (!src.science || src.science.mode === 'sweep')) {
        state.pointer = { x: hit.u, y: Math.max(0, Math.min(1, hit.v)) };
        drawAll();
        if (Date.now() - lastProbe > 90) {
          lastProbe = Date.now();
          probe(state.pointer);
        }
        tip.hidden = true;
        return;
      }
      if (!hit) return void (tip.hidden = true);
      tip.hidden = false;
      tip.textContent = src?.science ? app.sci.readout(src, hit.u, Math.max(0, Math.min(1, hit.v)), state.position).text : B.panels.stepSummary(app, hit.i);
      const wrap = $('sourceCanvas').getBoundingClientRect();
      tip.style.left = Math.min(hit.x + 14, wrap.width - 260) + 'px';
      tip.style.top = Math.max(4, hit.y - 40) + 'px';
    }

    // ------------------------------------------------------------------ say what is under the pointer
    // For listeners who cannot see the picture: when the pointer rests, the data set, the measure,
    // its value and where the pointer is are announced (screen readers) and, with "Say what is
    // under the pointer" on, spoken aloud.
    const area = (u, v) => {
      const col = u < 0.34 ? 'left' : u > 0.66 ? 'right' : 'centre';
      const row = v < 0.34 ? 'top' : v > 0.66 ? 'bottom' : 'middle';
      const where = row === 'middle' && col === 'centre' ? 'centre' : row === 'middle' ? `middle ${col}` : col === 'centre' ? `${row} centre` : `${row} ${col}`;
      return `${where[0].toUpperCase() + where.slice(1)}, ${Math.round(u * 100)}% across, ${Math.round(v * 100)}% down`;
    };
    let said = '';
    let sayTimer = 0;
    let entered = true;
    function describe(pt, text) {
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => {
        const full = (entered ? `${(app.src?.name || '').replace(/^NASA (EIC|satellite) · /, '')}. ` : '') + text;
        if (text === said) return;
        said = text;
        entered = false;
        $('pointerSays').textContent = text;
        B.dom.announce(full);
        if ($('pointerSpeak').checked && B.speech?.supported) B.speech.speak(full, { label: 'Under the pointer', owner: 'pointer' });
      }, 450);
    }

    /** Pointer mode: sound the data under the pointer. Only the data channel plays (the value read
     *  through the colour key, or brightness / red), and only where the picture shows data. */
    function probe(pt) {
      const src = app.src;
      const plan = app.plan;
      const vals = src.science ? [app.sci.readout(src, pt.x, pt.y, state.position).value] : B.image.probe(src.pixels, src.canvas.width, src.canvas.height, pt.x, pt.y, state.image.analysis, src.key);
      const place = src.science ? (app.sci.readout(src, pt.x, pt.y, state.position).text.split(' · ').slice(1).join(' · ') || area(pt.x, pt.y)) : area(pt.x, pt.y);
      if (!vals || !Number.isFinite(vals[0])) {
        $('nowNote').textContent = '—';
        $('nowHz').textContent = '';
        $('nowDetail').textContent = src.science ? 'No data here: this place has no value in the file.' : 'No data here: move over the coloured part of the picture.';
        describe(pt, `No data here. ${place}.`);
        return;
      }
      const list = [];
      plan.channels.forEach((c, j) => {
        if (j > 0 || !Number.isFinite(vals[j])) return;
        let v = c.max > c.min ? Math.max(0, Math.min(1, (vals[j] - c.min) / (c.max - c.min))) : 0.5;
        if (c.invert) v = 1 - v;
        list.push({ midi: music.midi(v, state.settings.scale, state.settings.range, state.settings.key), gain: c.gain, instrument: c.instrument, value: v, pos: { x: pt.x * 2 - 1, y: 0.6, z: 1 - pt.y } });
      });
      player.auditionNotes(list).catch(() => {});
      const lead = plan.channels.findIndex((c) => c.active);
      if (lead >= 0 && list[0]) {
        $('nowNote').textContent = music.noteName(list[0].midi);
        $('nowHz').textContent = music.freq(list[0].midi).toFixed(1) + ' Hz';
        $('nowDetail').textContent = `${plan.channels[0].name} ${stats.fmtNum(vals[0], plan.channels[0].unit)}`;
        describe(pt, `${plan.channels[0].name} ${stats.fmtNum(vals[0], plan.channels[0].unit)}, note ${music.noteName(list[0].midi)}. ${place}.`);
      }
    }

    // keyboard: with Follow pointer, the arrow keys move the pointer over the picture (Shift: bigger steps)
    function movePointer(dx, dy) {
      const p = state.pointer || { x: 0.5, y: 0.5 };
      state.pointer = { x: Math.max(0, Math.min(1, p.x + dx)), y: Math.max(0, Math.min(1, p.y + dy)) };
      drawAll();
      probe(state.pointer);
    }

    // canvas
    const canvas = $('sourceCanvas');
    canvas.addEventListener('pointermove', onCanvasMove);
    // a click (or tap) on the picture moves the playhead there and plays that step;
    // in Follow pointer it puts the pointer there (touch screens have no hover)
    function press(e) {
      const sci = app.src?.science;
      if (app.src?.kind === 'image' && state.image.scan === 'pointer' && (!sci || sci.mode === 'sweep')) return onCanvasMove(e);
      const hit = stepFromEvent(e);
      if (hit && sci?.mode === 'point') return app.sci.pickSpot(hit.u, Math.max(0, Math.min(1, hit.v)));
      if (hit) seek(hit.i, { audition: true });
    }
    // a zoomed scientific map can be dragged, so it acts on click (not on press) and never after a drag
    canvas.addEventListener('pointerdown', (e) => !(app.src?.science && app.sci.zoomed()) && press(e));
    canvas.addEventListener('click', (e) => app.src?.science && app.sci.zoomed() && !app.sci.wasDragged() && press(e));
    // the choice to speak is remembered in this browser
    try {
      $('pointerSpeak').checked = localStorage.getItem('b2b-pointer-speak') !== '0';
    } catch {}
    $('pointerSpeak').onchange = (e) => {
      try {
        localStorage.setItem('b2b-pointer-speak', e.target.checked ? '1' : '0');
      } catch {}
      if (!e.target.checked && B.speech?.owner?.() === 'pointer') B.speech.stop();
    };
    const pointerMode = () => app.src?.kind === 'image' && state.image.scan === 'pointer' && (!app.src.science || app.src.science.mode === 'sweep');
    canvas.addEventListener('keydown', (e) => {
      if (!pointerMode()) return;
      const d = e.shiftKey ? 0.2 : 0.05;
      const move = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (!move) return;
      e.preventDefault();
      e.stopPropagation();
      movePointer(...move);
    });
    canvas.addEventListener('pointerenter', () => (entered = true));
    canvas.addEventListener('focus', () => {
      entered = true;
      if (pointerMode()) B.dom.announce('Follow pointer: move the mouse or your finger over the picture, or use the arrow keys, to hear the data under it.');
    });
    canvas.addEventListener('pointerleave', () => {
      $('hoverTip').hidden = true;
      if (state.pointer) {
        state.pointer = null;
        drawAll();
      }
    });

    return { movePointer, describeArea: area };
  }

  B.canvasInput = { init };
})(typeof self !== 'undefined' ? self : this);
