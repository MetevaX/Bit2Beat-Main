/**
 * Bit2Beat · POST /api/voice (Vercel serverless function).
 * Voice control: when the page does not understand a spoken phrase, Gemini turns it into ONE of
 * Bit2Beat's own commands (core/voice-commands.js). The answer is checked against that list, so
 * the AI can only do what the buttons on the page can do. The key stays on the server.
 *
 * Body:   { said: "could you make it a bit quicker" }
 * Answer: { id: "faster", arg?, reply, model }   (id "none" when nothing fits)
 */
const V = require('../src/js/core/voice-commands.js');
const { guard, ask } = require('./_gemini.js');

module.exports = async function handler(req, res) {
  const g = guard(req, res, { name: 'Voice control', limit: 30 });
  if (!g) return;
  const said = String(g.body.said || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!said) return res.status(400).json({ error: 'Nothing was heard.' });
  try {
    const { text, model } = await ask(g.key, V.prompt(said), { budget: 20000 });
    return res.status(200).json({ ...V.answer(text), model });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
