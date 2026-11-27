// Vercel serverless function: proxies the Growth Center chat to Google Gemini.
// The browser runs every tool (data query / calculation) against its live data; this
// function only relays model turns, so the API key never reaches the browser.
const DEFAULT_MODELS = ['gemini-4-hydrogen', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
const PER_CALL_MS = 25000;   // per model; leaves time for the fallback model
const TOTAL_MS = 57000;      // stay under the 60 s function limit

function thinkingFor(model) {
  if (/2\.5/.test(model)) return { thinkingBudget: /lite/.test(model) ? 0 : 512 };
  if (/2\.0/.test(model)) return null;
  return { thinkingLevel: 'minimal' }; // Gemini 3+ / "latest" aliases: fastest thinking level
}

async function callGemini({ key, model, body, timeoutMs }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
    console.log(`[chat] ${model} -> ${r.status} in ${Date.now() - t0}ms${r.ok ? '' : ' ' + ((json.error && json.error.message) || '').slice(0, 200)}`);
    return { ok: r.ok, status: r.status, json };
  } catch (e) {
    const timedOut = e.name === 'AbortError';
    console.log(`[chat] ${model} -> ${timedOut ? 'TIMEOUT' : 'NETWORK ERROR ' + e.message} after ${Date.now() - t0}ms`);
    return { ok: false, status: timedOut ? 504 : 502, json: { error: { message: timedOut ? `Gemini did not answer within ${Math.round(timeoutMs / 1000)}s` : e.message } } };
  } finally { clearTimeout(timer); }
}

async function handle(payload) {
  const started = Date.now();
  const { contents, systemInstruction, tools, userKey, model } = payload || {};
  const key = (process.env.GEMINI_API_KEY || userKey || '').trim();
  if (!key) return { status: 500, body: { error: 'No Gemini API key configured. Set GEMINI_API_KEY in the server environment (or add a key under Data & settings).' } };
  if (!Array.isArray(contents) || !contents.length) return { status: 400, body: { error: 'contents required' } };
  const models = [...new Set([model, process.env.GEMINI_MODEL, ...DEFAULT_MODELS].filter(Boolean))];
  let last;
  for (const m of models) {
    let useThinking = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      const left = TOTAL_MS - (Date.now() - started);
      if (left < 4000) break;
      const think = useThinking ? thinkingFor(m) : null;
      const body = { contents, systemInstruction, tools, toolConfig: { functionCallingConfig: { mode: 'AUTO' } }, generationConfig: { temperature: 0.2, ...(think ? { thinkingConfig: think } : {}) } };
      const res = await callGemini({ key, model: m, body, timeoutMs: Math.min(PER_CALL_MS, left - 2000) });
      if (res.ok) {
        const cand = (res.json.candidates || [])[0];
        if (!cand || !cand.content || !(cand.content.parts || []).length) {
          const reason = (cand && cand.finishReason) || (res.json.promptFeedback && res.json.promptFeedback.blockReason) || 'empty response';
          return { status: 200, body: { model: m, content: { role: 'model', parts: [{ text: `The model returned no content (${reason}). Please rephrase.` }] } } };
        }
        return { status: 200, body: { model: m, content: cand.content, usage: res.json.usageMetadata } };
      }
      last = res;
      const msg = ((res.json.error && res.json.error.message) || '').toLowerCase();
      if (res.status === 400 && useThinking && think && /think|level|budget/.test(msg)) { useThinking = false; continue; } // model rejects thinking config → retry without it
      if (res.status === 429 || res.status === 503 || res.status === 500) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
      break; // 404 / 400 / timeout for this model → try the next model
    }
    if (last && (last.status === 401 || last.status === 403)) break;
    if (TOTAL_MS - (Date.now() - started) < 4000) break;
  }
  const msg = (last && last.json && last.json.error && last.json.error.message) || 'Gemini request failed';
  return { status: last ? (last.status === 504 ? 504 : last.status) : 500, body: { error: `Gemini error (${last ? last.status : '?'}): ${msg}` } };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const out = await handle(payload);
    res.status(out.status).json(out.body);
  } catch (e) { console.error('[chat] crash', e); res.status(500).json({ error: e.message }); }
};
module.exports.config = { maxDuration: 60 };
module.exports.handle = handle;
