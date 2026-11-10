/**
 * Bit2Beat ui · Bitty, the space pup (original inline SVG artwork).
 * Four moods (happy, excited, curious, joy) share one body; the tail wags, the ears and
 * headphones move with CSS and every animation stops with Reduce motion. Also the
 * “Earth Listener” badge for finishing the story. Strings only, so it also loads in Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).bittyArt = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const INK = '#17243b';
  const EYES = {
    happy: `<g class="bt-eyes" fill="${INK}"><ellipse cx="56" cy="59" rx="4" ry="5"/><ellipse cx="98" cy="59" rx="4" ry="5"/></g>`,
    excited: `<g class="bt-eyes" fill="${INK}"><ellipse cx="56" cy="58" rx="5" ry="6.5"/><ellipse cx="98" cy="58" rx="5" ry="6.5"/><circle cx="58" cy="55.5" r="1.9" fill="#fff"/><circle cx="100" cy="55.5" r="1.9" fill="#fff"/></g>`,
    curious: `<g class="bt-eyes" fill="${INK}"><ellipse cx="56" cy="60" rx="4" ry="5"/><ellipse cx="98" cy="58" rx="5" ry="6.5"/><circle cx="100" cy="55.5" r="1.8" fill="#fff"/></g><path d="M89 47 Q98 41 107 47" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
    joy: `<g class="bt-eyes" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"><path d="M49 62 Q56 52 63 62"/><path d="M91 62 Q98 52 105 62"/></g>`,
  };
  const MOUTH = {
    happy: `<path d="M77 79 V85 M77 85 Q69 90 65 84 M77 85 Q85 90 89 84" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
    open: `<path d="M77 79 V84" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><path d="M64 84 Q77 106 90 84 Q77 89 64 84Z" fill="#7b2d3d" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/><path d="M71 94 Q77 102 83 94 Q77 90 71 94Z" fill="#e58a96"/>`,
    curious: `<path d="M77 79 V84" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="77" cy="89" rx="4.6" ry="4" fill="#7b2d3d" stroke="${INK}" stroke-width="2.2"/>`,
  };
  const MOODS = {
    happy: { eyes: EYES.happy, mouth: MOUTH.happy },
    excited: { eyes: EYES.excited, mouth: MOUTH.open },
    curious: { eyes: EYES.curious, mouth: MOUTH.curious, tilt: true },
    joy: { eyes: EYES.joy, mouth: MOUTH.open },
  };

  /** Bitty as an SVG string. `cls` adds classes (for size). */
  function dog(mood = 'happy', cls = '') {
    const key = mood in MOODS ? mood : 'happy';
    const m = MOODS[key];
    return `<svg viewBox="0 0 160 145" class="bitty mood-${key} ${cls}" aria-hidden="true" focusable="false">
<g class="bt-tail"><path d="M112 105 Q149 109 139 80" fill="none" stroke="#b87c38" stroke-width="15" stroke-linecap="round"/><path d="M139 80 Q138 74 135 71" fill="none" stroke="#f0dfbd" stroke-width="15" stroke-linecap="round"/></g>
<path d="M48 101 Q45 75 78 76 Q111 77 115 108 L113 127 H47Z" fill="#d5a866" stroke="${INK}" stroke-width="2.5"/>
<path d="M71 91 Q92 85 96 121 H67Z" fill="#f5e8cf"/>
<path d="M50 111 V133 H67 V114 M96 114 V133 H114 V111" fill="#d5a866" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
<g class="bt-head${m.tilt ? ' bt-tilt' : ''}">
<path class="bt-ear bt-ear-l" d="M46 43 Q18 27 24 65 Q28 84 44 68Z" fill="#9b6837" stroke="${INK}" stroke-width="2.5"/>
<path class="bt-ear bt-ear-r" d="M107 43 Q134 30 127 66 Q123 82 109 68Z" fill="#9b6837" stroke="${INK}" stroke-width="2.5"/>
<path d="M40 49 Q41 22 77 24 Q112 23 114 52 L114 72 Q110 96 77 97 Q42 96 39 73Z" fill="#dab376" stroke="${INK}" stroke-width="2.5"/>
<path d="M66 25 Q76 23 85 25 L90 73 H63Z" fill="#f5e8cf"/>
<ellipse cx="77" cy="77" rx="26" ry="17" fill="#f5e8cf"/>
${m.eyes}
<path d="M70 70 Q77 66 84 70 Q84 78 77 79 Q70 77 70 70Z" fill="${INK}"/>
${m.mouth}
<path d="M37 57 Q34 17 77 17 Q120 17 117 57" fill="none" stroke="#14213d" stroke-width="6.5" stroke-linecap="round"/>
<rect x="27" y="43" width="16" height="29" rx="8" fill="#e8a33d" stroke="${INK}" stroke-width="2.5"/>
<rect x="111" y="43" width="16" height="29" rx="8" fill="#e8a33d" stroke="${INK}" stroke-width="2.5"/>
<path d="M32 51v13M122 51v13" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>
</g>
<path d="M51 95 Q78 107 105 95" fill="none" stroke="#14213d" stroke-width="9"/><rect x="71" y="98" width="14" height="17" rx="3" fill="#e8a33d" stroke="${INK}" stroke-width="2"/><path d="M75 103h5m-5 4h5" stroke="${INK}" stroke-width="2"/>
</svg>`;
  }

  /** The “Earth Listener” badge; `earned` false draws it as an outline still to win. */
  function badge(earned = true) {
    return `<svg viewBox="0 0 120 120" class="bt-badge${earned ? '' : ' is-locked'}" role="img" aria-label="Earth Listener badge${earned ? '' : ' (not yet earned)'}"><circle cx="60" cy="60" r="56" fill="#14213d"/><circle cx="60" cy="60" r="50" fill="none" stroke="#e8a33d" stroke-width="2.5" stroke-dasharray="3 5"/><circle cx="60" cy="52" r="19" fill="#488477"/><path d="M47 47c6-6 12-3 15 2s9 4 11 10c-6 9-22 9-28-1-2-4 0-8 2-11Z" fill="#6595c7"/><ellipse cx="60" cy="52" rx="29" ry="7.5" fill="none" stroke="#e8a33d" stroke-width="2.5" transform="rotate(-18 60 52)"/><text x="60" y="88" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="8.5" font-weight="600" letter-spacing="1.4" fill="#f6f1e7">EARTH</text><text x="60" y="99" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="8.5" font-weight="600" letter-spacing="1.4" fill="#f6f1e7">LISTENER</text></svg>`;
  }

  return { dog, badge, MOODS: Object.keys(MOODS) };
});
