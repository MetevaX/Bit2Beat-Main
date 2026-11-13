/**
 * Bit2Beat · shared by the serverless functions (files starting with "_" are not routes on Vercel).
 * The Gemini API key is read here from the Vercel environment variable GEMINI_API_KEY: it never
 * reaches the browser or GitHub.
 */
const { MODEL, FALLBACK } = require('../src/js/core/eic-search.js');

const hits = new Map(); // ip → [times]: a small per-instance limit against abuse
function tooMany(ip, limit) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

/**
 * Checks shared by every AI call: POST only, the key is set, the call comes from this site, and
 * not too many calls from one address. Returns { key, body } or null (the answer was sent).
 */
function guard(req, res, { name, limit = 12 }) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return void res.status(405).json({ error: 'Use POST.' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return void res.status(503).json({ error: `${name} is not set up yet (GEMINI_API_KEY is missing on the server).` });
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {}
    if (host !== req.headers.host) return void res.status(403).json({ error: `${name} works only on the Bit2Beat site.` });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (tooMany(name + ip, limit)) return void res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return { key, body: body || {} };
}

/** The text of a generateContent response (thoughts left out). */
const textOf = (res) => (res?.candidates?.[0]?.content?.parts || []).map((p) => (p.thought ? '' : p.text || '')).join('');

/**
 * Ask Gemini 3.8 Flash; while it is busy (429/5xx) ask once more, then the older Flash models.
 * Returns { text, model } or throws Error(message).
 */
async function ask(key, request, { budget = 55000 } = {}) {
  const deadline = Date.now() + budget;
  let last = 'Could not reach Gemini.';
  for (const [k, model] of [MODEL, MODEL, ...FALLBACK].entries()) {
    if (Date.now() > deadline - 3000) break;
    if (k === 1) await new Promise((r) => setTimeout(r, 1200));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(3000, deadline - Date.now()));
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(request),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return { text: textOf(j), model };
      last = `Gemini answered ${r.status}${j?.error?.message ? ': ' + String(j.error.message).slice(0, 160) : ''}`;
      if (![429, 500, 503, 504].includes(r.status) && !(r.status === 404 && model !== MODEL)) break; // a real error: do not retry
    } catch (e) {
      last = e?.name === 'AbortError' ? 'Gemini took too long.' : 'Could not reach Gemini.';
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(last);
}

module.exports = { guard, ask, textOf };
