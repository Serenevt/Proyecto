const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 10083);
const backend = process.env.PRIMAX_CONTROL_BACKEND_URL || 'http://127.0.0.1:3000';
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/v1/')) {
    const upstream = new URL(url.pathname + url.search, backend);
    const proxy = http.request(upstream, { method: req.method, headers: { ...req.headers, host: upstream.host } }, (response) => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    proxy.on('error', () => { res.writeHead(503, { 'content-type':'application/json' }); res.end(JSON.stringify({ message:'Backend local no disponible.' })); });
    req.pipe(proxy); return;
  }
  const decoded = decodeURIComponent(url.pathname);
  const file = path.resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (!file.startsWith(root + path.sep) && file !== path.join(root,'index.html')) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, body) => { if (error) { res.writeHead(404); res.end('No encontrado'); return; } res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' }); res.end(body); });
}).listen(port, '127.0.0.1', () => process.stdout.write(`Primax Control local: http://127.0.0.1:${port}\n`));
