// Local dev server (no dependencies): node server.js  →  http://localhost:3000
// Set GEMINI_API_KEY in your shell first, e.g.  GEMINI_API_KEY=xxxx node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handle } = require('./api/chat.js');
const PORT = process.env.PORT || 3000;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown' };

http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/chat') && req.method === 'POST') {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', async () => {
      try { const out = await handle(JSON.parse(data || '{}')); res.writeHead(out.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out.body)); }
      catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  const p = path.join(__dirname, decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!p.startsWith(__dirname) || p.includes(`${path.sep}api${path.sep}`)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Growth Center running at http://localhost:${PORT}`));
