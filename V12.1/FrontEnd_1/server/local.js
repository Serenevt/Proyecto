import { createServer } from 'node:http';
import { createGateway } from './gateway.js';

const gateway = createGateway();
createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('ok\n');
    return;
  }
  void gateway(req, res);
}).listen(3001, '0.0.0.0');
