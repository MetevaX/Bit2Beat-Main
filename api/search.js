/**
 * Bit2Beat · POST /api/search (Vercel serverless function).
 * Asks Gemini which NASA Earth Information Center data sets answer a question in plain words.
 * The Gemini API key lives only here, in the Vercel environment variable GEMINI_API_KEY, so it
 * never reaches the browser or GitHub.
 *
 * Body:   { q: "methane from swamps in the Amazon", mode: "data"|"image"|"video",
 *           collections: [{ id, title, years, about }] }   (the catalogue the page already has)
 * Answer: { picks: [{ id, why }], place: "world" | { name, lat, lon }, model }
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
  const q = String(body?.q || '').trim().slice(0, S.MAX_QUERY);
  const mode = ['data', 'image', 'video'].includes(body?.mode) ? body.mode : 'data';
  const list = (Array.isArray(body?.collections) ? body.collections : [])
    .filter((c) => c && typeof c.id === 'string')
    .slice(0, S.MAX_ITEMS);
  if (!q) return res.status(400).json({ error: 'Type what you are looking for.' });
  if (!list.length) return res.status(400).json({ error: 'The catalogue is empty.' });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 55000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${S.MODEL}:generateContent`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(S.prompt(q, mode, list)),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: `Gemini answered ${r.status}${j?.error?.message ? ': ' + String(j.error.message).slice(0, 160) : ''}` });
    const out = S.answer(S.textOf(j), list);
    return res.status(200).json({ ...out, model: S.MODEL });
  } catch (e) {
    return res.status(504).json({ error: e?.name === 'AbortError' ? 'Gemini took too long.' : 'Could not reach Gemini.' });
  } finally {
    clearTimeout(timer);
  }
};
