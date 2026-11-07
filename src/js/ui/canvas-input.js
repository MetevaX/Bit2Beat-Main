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
      if (src?.kind === 'image' && state.image.scan === 'pointer' && hit) {
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
      tip.textContent = B.panels.stepSummary(app, hit.i);
      const wrap = $('sourceCanvas').getBoundingClientRect();
      tip.style.left = Math.min(hit.x + 14, wrap.width - 260) + 'px';
      tip.style.top = Math.max(4, hit.y - 40) + 'px';
    }

    /** Pointer mode: sound the pixels under the pointer with the plan's mapping. */
    function probe(pt) {
      const src = app.src;
      const plan = app.plan;
      const vals = B.image.probe(src.pixels, src.canvas.width, src.canvas.height, pt.x, pt.y, state.image.analysis);
      if (!vals) return;
      const list = [];
      plan.channels.forEach((c, j) => {
        if (!c.active || vals[j] == null) return;
        let v = c.max > c.min ? Math.max(0, Math.min(1, (vals[j] - c.min) / (c.max - c.min))) : 0.5;
        if (c.invert) v = 1 - v;
        list.push({ midi: music.midi(v, state.settings.scale, state.settings.range, state.settings.key), gain: c.gain, instrument: c.instrument, value: v, pos: { x: pt.x * 2 - 1, y: 0.6, z: 1 - pt.y } });
      });
      player.auditionNotes(list).catch(() => {});
      const lead = plan.channels.findIndex((c) => c.active);
      if (lead >= 0 && list[0]) {
        $('nowNote').textContent = music.noteName(list[0].midi);
        $('nowHz').textContent = music.freq(list[0].midi).toFixed(1) + ' Hz';
        $('nowDetail').textContent = plan.channels.map((c, j) => `${c.name} ${stats.fmtNum(vals[j], c.unit)}`).join(' · ');
      }
    }

    // canvas
    const canvas = $('sourceCanvas');
    canvas.addEventListener('pointermove', onCanvasMove);
    canvas.addEventListener('pointerdown', (e) => {
      if (app.src?.kind === 'image' && state.image.scan === 'pointer') return;
      const hit = stepFromEvent(e);
      if (hit) seek(hit.i, { audition: true });
    });
    canvas.addEventListener('pointerleave', () => {
      $('hoverTip').hidden = true;
      if (state.pointer) {
        state.pointer = null;
        drawAll();
      }
    });

    return {};
  }

  B.canvasInput = { init };
})(typeof self !== 'undefined' ? self : this);
