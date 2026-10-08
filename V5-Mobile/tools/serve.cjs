const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const server = http.createServer((request, response) => {
  let filename;
  try { filename = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch { response.writeHead(400).end(); return; }
  if (filename === root) filename = path.join(root, 'index.html');
  if (!filename.startsWith(root + path.sep) || /(?:^|[\\/])(?:node_modules|docs|tests|\.git)(?:[\\/]|$)/.test(filename)) {
    response.writeHead(403).end(); return;
  }
  fs.readFile(filename, (error, content) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': (types[path.extname(filename)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(content);
  });
});
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log('FuelFlow: http://127.0.0.1:' + server.address().port));
