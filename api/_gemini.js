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

// ---------------------------------------------------------------- which models to ask
const API = 'https://generativelanguage.googleapis.com/v1beta';
let found = null; // the Flash models this key can use, newest first (looked up once per server instance)

/** The Flash models the key can use (from Google's own list), newest first; full Flash before Lite. */
async function flashModels(key) {
  if (found && Date.now() - found.at < 6 * 3600e3) return found.list;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { signal: ctl.signal, headers: { 'x-goog-api-key': key } });
    const j = await r.json();
    const version = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
    const list = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, ''))
      .filter((n) => /^gemini-[\d.]+-flash(-lite)?(-latest|-\d{3}|-preview(-[\w-]+)?)?$/.test(n) && !/image|tts|live|audio|thinking-exp/.test(n))
      .sort((p, q) => version(q) - version(p) || /lite/.test(p) - /lite/.test(q) || /preview/.test(p) - /preview/.test(q));
    found = { at: Date.now(), list };
    return list;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** The same request without the thinking setting (older models only know a thinking budget). */
function plain(request) {
  const { thinkingConfig, ...rest } = request.generationConfig || {};
  return { ...request, generationConfig: rest };
}
/** Later attempts think less, so they answer quickly while the first choice is busy. */
function quick(request) {
  const g = request.generationConfig || {};
  return g.thinkingConfig ? { ...request, generationConfig: { ...g, thinkingConfig: { thinkingLevel: 'low' } } } : request;
}

/**
 * Ask Gemini 3.8 Flash; if it is busy, slow or missing, the next Flash models are asked in turn
 * (FALLBACK in core/eic-search.js, then every other Flash model this key can use, newest first),
 * each for at most `perTry` ms, until `budget` ms have gone.
 * Returns { text, model, tried } or throws Error(message) with .tried = [{ model, result, ms }].
 */
async function ask(key, request, { budget = 55000, perTry = 15000 } = {}) {
  const deadline = Date.now() + budget;
  const order = [MODEL, ...FALLBACK];
  const tried = [];
  let more = false;
  let last = 'Could not reach Gemini.';
  for (let k = 0; k < order.length; k++) {
    const model = order[k];
    const left = deadline - Date.now();
    if (left < 2500) break;
    let body = k ? quick(request) : request;
    for (let again = 0; again < 2; again++) {
      const ctl = new AbortController();
      const t0 = Date.now();
      const timer = setTimeout(() => ctl.abort(), Math.min(perTry, left));
      let note = '';
      try {
        const r = await fetch(`${API}/models/${model}:generateContent`, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          tried.push({ model, result: 'ok', ms: Date.now() - t0 });
          return { text: textOf(j), model, tried };
        }
        const msg = String(j?.error?.message || '').slice(0, 160);
        note = `${r.status}`;
        last = `Gemini (${model}) answered ${r.status}${msg ? ': ' + msg : ''}`;
        if (r.status === 400 && /think/i.test(msg) && !again) {
          body = plain(body); // this model does not take the thinking setting: ask once more without it
          tried.push({ model, result: note, ms: Date.now() - t0 });
          continue;
        }
        if ([400, 401, 403].includes(r.status) && !/think/i.test(msg)) {
          tried.push({ model, result: note, ms: Date.now() - t0 });
          if (r.status !== 400) throw Object.assign(new Error(last), { tried }); // the key itself is refused
        }
      } catch (e) {
        if (e.tried) throw e;
        note = e?.name === 'AbortError' ? 'timeout' : 'network';
        last = e?.name === 'AbortError' ? `Gemini (${model}) took too long.` : 'Could not reach Gemini.';
      } finally {
        clearTimeout(timer);
      }
      if (!tried.length || tried[tried.length - 1].model !== model || tried[tried.length - 1].result !== note) tried.push({ model, result: note, ms: Date.now() - t0 });
      break;
    }
    // the usual models are busy: add every other Flash model this key can use
    if (k === order.length - 1 && !more) {
      more = true;
      for (const m of await flashModels(key)) if (!order.includes(m)) order.push(m);
      order.splice(8); // at most 8 models in one request
    }
  }
  throw Object.assign(new Error(last), { tried });
}

module.exports = { guard, ask, textOf, flashModels };
