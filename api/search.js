/**
 * Bit2Beat · POST /api/search (Vercel serverless function).
 * Asks Gemini which NASA Earth Information Center data sets answer a question in plain words.
 * The Gemini API key lives only here, in the Vercel environment variable GEMINI_API_KEY, so it
 * never reaches the browser or GitHub.
 *
 * Body:   { q: "methane from swamps in the Amazon", mode: "data"|"image"|"video",
 *           collections: [{ id, title, years, about }] }   (the catalogue the page already has)
 * Answer: { picks: [{ id, why }], place: "world" | { name, lat, lon }, model }
 * Gemini 3.8 Flash answers; while it is busy (429/5xx) it is asked once more, then the older
 * Flash models (FALLBACK in core/eic-search.js) answer instead.
 */
const S = require('../src/js/core/eic-search.js');

const hits = new Map(); // ip → [times]: a small per-instance limit against abuse
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 12;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI search is not set up yet (GEMINI_API_KEY is missing on the server).' });
  // only this site may use it: a call from another web page (with another Origin) is refused
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {}
    if (host !== req.headers.host) return res.status(403).json({ error: 'AI search works only on the Bit2Beat site.' });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (tooMany(ip)) return res.status(429).json({ error: 'Too many searches. Please wait a minute.' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const q = S.clean(body?.q);
  const mode = ['data', 'image', 'video'].includes(body?.mode) ? body.mode : 'data';
  const list = (Array.isArray(body?.collections) ? body.collections : [])
    .filter((c) => c && typeof c.id === 'string')
    .slice(0, S.MAX_ITEMS);
  if (!q) return res.status(400).json({ error: 'Type what you are looking for.' });
  if (!list.length) return res.status(400).json({ error: 'The catalogue is empty.' });

  // Gemini 3.8 Flash first; when it is busy (429/500/503) try once more, then the older Flash models
  const deadline = Date.now() + 55000;
  let last = 'Could not reach Gemini.';
  for (const [k, model] of [S.MODEL, S.MODEL, ...S.FALLBACK].entries()) {
    if (Date.now() > deadline - 3000) break;
    if (k === 1) await new Promise((r) => setTimeout(r, 1500));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(3000, deadline - Date.now()));
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(S.prompt(q, mode, list)),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return res.status(200).json({ ...S.answer(S.textOf(j), list), model });
      last = `Gemini answered ${r.status}${j?.error?.message ? ': ' + String(j.error.message).slice(0, 160) : ''}`;
      if (![429, 500, 503, 504].includes(r.status) && !(r.status === 404 && model !== S.MODEL)) break; // a real error: do not retry
    } catch (e) {
      last = e?.name === 'AbortError' ? 'Gemini took too long.' : 'Could not reach Gemini.';
    } finally {
      clearTimeout(timer);
    }
  }
  return res.status(502).json({ error: last });
};
