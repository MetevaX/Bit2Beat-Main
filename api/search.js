/**
 * Bit2Beat · POST /api/search (Vercel serverless function).
 * Asks Gemini which NASA Earth Information Center data sets answer a question in plain words.
 * The Gemini API key lives only on the server (api/_gemini.js), never in the page or on GitHub.
 *
 * Body:   { q: "methane from swamps in the Amazon", mode: "data"|"image"|"video",
 *           collections: [{ id, title, years, about }] }   (the catalogue the page already has)
 * Answer: { picks: [{ id, why }], place: "world" | { name, lat, lon }, offTopic, model }
 */
const S = require('../src/js/core/eic-search.js');
const { guard, ask } = require('./_gemini.js');

module.exports = async function handler(req, res) {
  const g = guard(req, res, { name: 'AI search', limit: 12 });
  if (!g) return;
  const q = S.clean(g.body.q);
  const mode = ['data', 'image', 'video'].includes(g.body.mode) ? g.body.mode : 'data';
  const list = (Array.isArray(g.body.collections) ? g.body.collections : []).filter((c) => c && typeof c.id === 'string').slice(0, S.MAX_ITEMS);
  if (!q) return res.status(400).json({ error: 'Type what you are looking for.' });
  if (!list.length) return res.status(400).json({ error: 'The catalogue is empty.' });
  try {
    const { text, model, tried } = await ask(g.key, S.prompt(q, mode, list), { budget: 55000, perTry: 18000 });
    return res.status(200).json({ ...S.answer(text, list), model, tried });
  } catch (e) {
    return res.status(502).json({ error: e.message, tried: e.tried || [] });
  }
};
