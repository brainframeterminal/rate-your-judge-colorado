// For tools/build-seo.mjs: repo code from the local server, public read API from live (GET only), so build-seo renders today's code on real data.
// The local preview DB holds no appeals, so a plain local build writes empty crawler copies (10-27).
//   node tools/seo-proxy.mjs & RYG_BASE=http://127.0.0.1:8752/ node tools/build-seo.mjs; kill %1
import http from 'node:http';
const LOCAL = 'http://127.0.0.1:8750', LIVE = 'https://rateyourjudgecolorado.com';
http.createServer(async (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  const base = req.url.startsWith('/api/') ? LIVE : LOCAL;
  try {
    const r = await fetch(base + req.url, { headers: { 'user-agent': 'ryg-build-seo' } });
    const body = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/octet-stream' });
    res.end(body);
    if (req.url.startsWith('/api/')) console.log(r.status, req.url);
  } catch (e) { res.writeHead(502); res.end(String(e)); console.log('ERR', req.url, e.message); }
}).listen(8752, '127.0.0.1');
