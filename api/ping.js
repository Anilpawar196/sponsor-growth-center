// Diagnostic: open /api/ping in the browser. Tries a tiny prompt on several Gemini models and reports status + time.
module.exports = async function handler(req, res) {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
  const models = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-4-hydrogen', 'gemini-2.5-flash'].filter(Boolean))];
  const out = { key_prefix: key.slice(0, 4) + '…', key_length: key.length, results: [] };
  try {
    const lr = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    const lj = await lr.json();
    out.available_models = (lj.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace('models/', ''));
    if (!lr.ok) out.list_error = lj.error && lj.error.message;
  } catch (e) { out.list_error = e.message; }
  await Promise.all(models.map(async (m) => {
    const t0 = Date.now(); const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: pong' }] }] }) });
      const j = await r.json();
      out.results.push({ model: m, status: r.status, ms: Date.now() - t0, reply: r.ok ? ((((j.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text).join('').slice(0, 40) : (j.error && j.error.message || '').slice(0, 160) });
    } catch (e) { out.results.push({ model: m, status: e.name === 'AbortError' ? 'TIMEOUT 20s' : 'ERROR', ms: Date.now() - t0, reply: e.message }); }
    finally { clearTimeout(timer); }
  }));
  res.status(200).json(out);
};
module.exports.config = { maxDuration: 60 };
