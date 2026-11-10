/**
 * Bit2Beat core · geometry for Bitty's guided tour.
 * Where the speech bubble goes so it sits beside the highlighted control without leaving the
 * screen, and the four dimmed rectangles around the highlight. Pure functions, tested in Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).spotlight = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  /**
   * @param {{left,top,right,bottom,width,height}|null} rect  the highlighted area (null = centred card)
   * @param {{w,h}} size  bubble size
   * @param {{w,h,top?,bottom?}} vp  viewport, with optional free band between fixed bars
   * @returns {{x,y,placement}}
   */
  function placeBubble(rect, size, vp, { gap = 16, margin = 12, narrow = 640 } = {}) {
    const { w, h } = size;
    const top = Math.max(margin, vp.top ?? margin);
    const bottom = Math.min(vp.h - margin, vp.bottom ?? vp.h - margin);
    if (!rect) return { x: Math.round(Math.max(margin, (vp.w - w) / 2)), y: Math.round(Math.max(margin, (vp.h - h) / 2)), placement: 'center' };
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (vp.w <= narrow) {
      // phones: dock at the top or bottom, away from the highlight
      const up = cy > vp.h / 2;
      return { x: margin, y: Math.round(up ? top : Math.max(top, bottom - h)), placement: up ? 'dock-top' : 'dock-bottom' };
    }
    const at = {
      bottom: () => ({ x: clamp(cx - w / 2, margin, vp.w - w - margin), y: rect.bottom + gap }),
      top: () => ({ x: clamp(cx - w / 2, margin, vp.w - w - margin), y: rect.top - gap - h }),
      right: () => ({ x: rect.right + gap, y: clamp(cy - h / 2, top, bottom - h) }),
      left: () => ({ x: rect.left - gap - w, y: clamp(cy - h / 2, top, bottom - h) }),
    };
    const fits = (a) => a.x >= margin - 0.5 && a.y >= top - 0.5 && a.x + w <= vp.w - margin + 0.5 && a.y + h <= bottom + 0.5;
    for (const p of ['bottom', 'top', 'right', 'left']) {
      const a = at[p]();
      if (fits(a)) return { x: Math.round(a.x), y: Math.round(a.y), placement: p };
    }
    // nothing fits beside a very large area: the corner with the most room
    const x = rect.left > vp.w - rect.right ? margin : vp.w - w - margin;
    return { x: Math.round(Math.max(margin, x)), y: Math.round(Math.max(top, bottom - h)), placement: 'corner' };
  }

  /** The four dimmed rectangles [x, y, w, h] around a hole {x, y, w, h}; the hole stays clear. */
  function dimRects(hole, vp) {
    if (!hole) return { t: [0, 0, vp.w, vp.h], b: [0, 0, 0, 0], l: [0, 0, 0, 0], r: [0, 0, 0, 0] };
    const x = clamp(hole.x, 0, vp.w);
    const y = clamp(hole.y, 0, vp.h);
    const x2 = clamp(hole.x + hole.w, 0, vp.w);
    const y2 = clamp(hole.y + hole.h, 0, vp.h);
    return { t: [0, 0, vp.w, y], b: [0, y2, vp.w, vp.h - y2], l: [0, y, x, y2 - y], r: [x2, y, vp.w - x2, y2 - y] };
  }

  return { placeBubble, dimRects, clamp };
});
