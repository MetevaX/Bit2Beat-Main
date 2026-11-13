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

// models that failed lately (busy, slow or missing) on this server instance are asked last
const sick = new Map(); // model → when it last failed
const SICK_MS = 10 * 60e3;
const healthyFirst = (list) => {
  const now = Date.now();
  const bad = (m) => (now - (sick.get(m) || -Infinity) < SICK_MS ? 1 : 0);
  return [...list].sort((a, b) => bad(a) - bad(b)); // stable: the usual order otherwise
};

/** One request to one model. Never throws: { ok, text, model, note, last, ms, fatal }. */
async function attempt(key, model, request, ms, ctl) {
  const t0 = Date.now();
  let body = request;
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    for (let again = 0; again < 2; again++) {
      const r = await fetch(`${API}/models/${model}:generateContent`, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return { ok: true, text: textOf(j), model, note: 'ok', ms: Date.now() - t0 };
      const msg = String(j?.error?.message || '').slice(0, 160);
      const last = `Gemini (${model}) answered ${r.status}${msg ? ': ' + msg : ''}`;
      if (r.status === 400 && /think/i.test(msg) && !again) {
        body = plain(body); // this model does not take the thinking setting: ask once more without it
        continue;
      }
      return { ok: false, model, note: String(r.status), last, ms: Date.now() - t0, fatal: [401, 403].includes(r.status) };
    }
  } catch (e) {
    const slow = e?.name === 'AbortError';
    return { ok: false, model, note: slow ? 'timeout' : 'network', last: slow ? `Gemini (${model}) took too long.` : 'Could not reach Gemini.', ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
  return { ok: false, model, note: '400', last: `Gemini (${model}) did not accept the request.`, ms: Date.now() - t0 };
}

/**
 * Ask Gemini 3.8 Flash; if it is busy, slow or missing, the next Flash models are asked
 * (FALLBACK in core/eic-search.js, then every other Flash model this key can use, newest first),
 * each for at most `perTry` ms, until `budget` ms have gone. Models that failed in the last
 * minutes are asked last. With `hedge` (ms), the next model is also asked when the first has
 * not answered by then, and the first good answer wins (a spoken command must be quick).
 * Returns { text, model, tried } or throws Error(message) with .tried = [{ model, result, ms }].
 */
async function ask(key, request, { budget = 55000, perTry = 15000, hedge = 0 } = {}) {
  const deadline = Date.now() + budget;
  const order = healthyFirst([MODEL, ...FALLBACK]);
  const tried = [];
  const running = new Set(); // { promise, ctl }
  let next = 0;
  let more = false;
  let last = 'Could not reach Gemini.';
  const launch = () => {
    const k = next++;
    const ctl = new AbortController();
    const job = { ctl };
    job.promise = attempt(key, order[k], k ? quick(request) : request, Math.max(1000, Math.min(perTry, deadline - Date.now())), ctl).then((r) => ({ r, job }));
    running.add(job);
  };
  const stopAll = () => running.forEach((j) => j.ctl.abort());
  for (;;) {
    if (next >= order.length && !more) {
      more = true; // the usual models are busy: add every other Flash model this key can use
      for (const m of await flashModels(key)) if (!order.includes(m)) order.push(m);
      order.splice(8); // at most 8 models in one request
    }
    if (!running.size) {
      if (next >= order.length || deadline - Date.now() < 2500) break;
      launch();
    }
    const wait = hedge && running.size < 2 && next < order.length ? new Promise((r) => setTimeout(() => r(null), hedge)) : null;
    const done = await Promise.race([...[...running].map((j) => j.promise), ...(wait ? [wait] : [])]);
    if (!done) {
      if (deadline - Date.now() >= 2500) launch(); // still waiting: ask the next model too
      continue;
    }
    running.delete(done.job);
    const r = done.r;
    tried.push({ model: r.model, result: r.note, ms: r.ms });
    if (r.ok) {
      sick.delete(r.model);
      stopAll();
      return { text: r.text, model: r.model, tried };
    }
    last = r.last;
    if (r.fatal) {
      stopAll();
      throw Object.assign(new Error(last), { tried }); // the key itself is refused
    }
    if (r.note !== '400') sick.set(r.model, Date.now());
  }
  stopAll();
  throw Object.assign(new Error(last), { tried });
}

module.exports = { guard, ask, textOf, flashModels, _sick: sick };
