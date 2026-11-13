/**
 * Bit2Beat · POST /api/voice (Vercel serverless function).
 * Voice control: Gemini listens to a short recording (or reads a phrase) and turns it into ONE of
 * Bit2Beat's own commands (core/voice-commands.js). The answer is checked against that list, so
 * the AI can only do what the buttons on the page can do. The key stays on the server.
 *
 * Body:   { audio: "<base64 16 kHz mono WAV, at most 8 s>" }  or  { said: "make it quicker" }
 * Answer: { heard, id: "faster", arg?, reply, model }   (id "none" when nothing fits)
 */
const V = require('../src/js/core/voice-commands.js');
const { guard, ask } = require('./_gemini.js');

const MAX_AUDIO = 400000; // base64 characters: about 9 s of 16 kHz 16-bit mono WAV

module.exports = async function handler(req, res) {
  const g = guard(req, res, { name: 'Voice control', limit: 40 });
  if (!g) return;
  const audio = typeof g.body.audio === 'string' ? g.body.audio.replace(/^data:[^,]*,/, '') : '';
  const said = String(g.body.said || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (audio && (audio.length > MAX_AUDIO || !/^[A-Za-z0-9+/]+=*$/.test(audio.slice(0, 2000)) || !audio.startsWith('UklGR'))) return res.status(400).json({ error: 'The recording should be a short WAV.' });
  if (!audio && !said) return res.status(400).json({ error: 'Nothing was heard.' });
  try {
    const { text, model } = await ask(g.key, V.prompt(said, audio ? { data: audio } : null), { budget: 20000 });
    return res.status(200).json({ ...V.answer(text), model });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
