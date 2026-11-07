/**
 * Bit2Beat ui · channel list (level, mute, solo, instrument, pitch direction).
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, el } = B.dom;
  const { stats } = B;

  function render(app) {
    const box = $('channels');
    const p = app.plan;
    box.replaceChildren();
    p.channels.forEach((c, j) => {
      const m = app.state.mix[j];
      const range = c.max > c.min ? `${stats.fmtNum(c.min, c.unit)} – ${stats.fmtNum(c.max, c.unit)}` : 'one note per event';
      const inst = el('select', { 'aria-label': `${c.name} instrument` }, new Option('Main instrument', 'inherit'), ...Object.entries(B.audio.instruments).map(([k, v]) => new Option(v.name, k)));
      inst.value = m.instrument || 'inherit';
      inst.onchange = () => {
        m.instrument = inst.value;
        app.rebuild();
      };
      const level = el('input', { type: 'range', min: 0, max: 100, value: Math.round(m.gain * 100), 'aria-label': `${c.name} level` });
      level.oninput = () => (m.gain = +level.value / 100);
      level.onchange = () => app.rebuild();
      const toggle = (key, label, title) => {
        const b = el('button', { type: 'button', class: 'mini', 'aria-pressed': String(!!m[key]), title, 'aria-label': `${title} ${c.name}` }, label);
        b.onclick = () => {
          m[key] = !m[key];
          app.rebuild();
        };
        return b;
      };
      const flip = el('button', { type: 'button', class: 'mini', 'aria-pressed': String(c.invert), title: 'Flip pitch direction', 'aria-label': `Flip pitch direction for ${c.name}` }, '⇅');
      flip.onclick = () => {
        m.invert = !c.invert;
        app.rebuild();
      };
      const row = el(
        'div',
        { class: 'channel' + (c.active ? '' : ' is-off') },
        el('span', { class: 'swatch', style: `background:${B.draw.chColor(app.plan, j)}`, 'aria-hidden': 'true' }),
        el('div', { class: 'channel-name' }, el('b', { text: c.name }), el('small', { text: range + (c.shared ? ' · shared scale' : '') + (c.log ? ' · log' : ''), title: c.hint || '' })),
        el('div', { class: 'channel-ctrl' }, level, el('span', { class: 'channel-btns' }, toggle('mute', 'M', 'Mute'), toggle('solo', 'S', 'Solo'), flip)),
        el('label', { class: 'channel-inst' }, el('span', { class: 'sr-only', text: 'Instrument' }), inst),
      );
      box.append(row);
    });
  }

  function init(app) {
    $('mixReset').onclick = () => {
      app.state.mix.forEach((m, j) => Object.assign(m, { gain: j === 0 ? 0.8 : 0.6, mute: !!app.src.channels[j].mute, solo: false, invert: undefined, instrument: app.src.channels[j].instrument || 'inherit' }));
      app.rebuild();
    };
  }

  B.mixer = { init, render };
})(typeof self !== 'undefined' ? self : this);
