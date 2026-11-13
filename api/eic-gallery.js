/**
 * Bit2Beat · GET /api/eic-gallery (Vercel serverless function).
 * The NASA Earth Information Center content database (the SVS gallery the Space Apps challenge
 * points to) as a short list for search: id, title, year, description, keywords, still, video.
 * NASA's site does not let other websites read its API, so this server walks the gallery
 * (core/svs.js) and the answer is kept by Vercel's edge for a day.
 */
const svs = require('../src/js/core/svs.js');

let memo = null; // { at, list } — this server instance's own copy

async function getJson(id) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`${svs.SITE}/api/${id}`, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  try {
    if (!memo || Date.now() - memo.at > 6 * 3600e3) memo = { at: Date.now(), list: await svs.crawl(getJson) };
    if (!memo.list.length) throw new Error('the gallery came back empty');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ gallery: svs.GALLERY, fetched: new Date(memo.at).toISOString(), items: memo.list });
  } catch (e) {
    memo = null;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: `NASA's visualization gallery did not answer (${e.message}).` });
  }
};
