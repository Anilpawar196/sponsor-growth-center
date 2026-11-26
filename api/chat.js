// Vercel serverless function: proxies the Growth Center chat to Google Gemini.
// The browser runs every tool (data query / calculation) against its live data; this
// function only relays model turns, so the API key never reaches the browser.
const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];

async function callGemini({ key, model, body }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, json };
}

async function handle(payload) {
  const { contents, systemInstruction, tools, userKey, model } = payload || {};
  const key = process.env.GEMINI_API_KEY || userKey;
  if (!key) return { status: 500, body: { error: 'No Gemini API key configured. Set GEMINI_API_KEY in the server environment (or add a key under Data & settings).' } };
  if (!Array.isArray(contents) || !contents.length) return { status: 400, body: { error: 'contents required' } };
  const models = [...new Set([model, process.env.GEMINI_MODEL, ...DEFAULT_MODELS].filter(Boolean))];
  const body = { contents, systemInstruction, tools, toolConfig: { functionCallingConfig: { mode: 'AUTO' } }, generationConfig: { temperature: 0.2 } };
  let last;
  for (const m of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await callGemini({ key, model: m, body });
      if (res.ok) {
        const cand = (res.json.candidates || [])[0];
        if (!cand || !cand.content) {
          const reason = (cand && cand.finishReason) || (res.json.promptFeedback && res.json.promptFeedback.blockReason) || 'empty response';
          return { status: 200, body: { model: m, content: { role: 'model', parts: [{ text: `The model returned no content (${reason}). Please rephrase.` }] } } };
        }
        return { status: 200, body: { model: m, content: cand.content, usage: res.json.usageMetadata } };
      }
      last = res;
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1200 * (attempt + 1))); continue; }
      break; // 404 / 400 for this model → try next model
    }
    if (last && (last.status === 401 || last.status === 403)) break;
  }
  const msg = (last && last.json && last.json.error && last.json.error.message) || 'Gemini request failed';
  return { status: last ? last.status : 500, body: { error: `Gemini error (${last ? last.status : '?'}): ${msg}` } };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const out = await handle(payload);
    res.status(out.status).json(out.body);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
module.exports.handle = handle;
