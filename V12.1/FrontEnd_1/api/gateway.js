import { createGateway } from '../server/gateway.js';

export function createVercelGateway(options) {
const gateway = createGateway(options);
return function routeGateway(req, res) {
  const url = new URL(req.url, 'https://fuelflow.invalid');
  const route = url.pathname.startsWith('/api/v1/') ? url.pathname.slice('/api/v1/'.length) : null;
  const names = [...url.searchParams.keys()];
  if (!route || names.some(name => name !== 'route' && name !== 'path') ||
      url.searchParams.getAll('route').length !== 1 ||
      url.searchParams.get('route') !== route ||
      url.searchParams.getAll('path').length > 1) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 403;
    res.end(JSON.stringify({ statusCode: 403, message: 'Ruta no permitida' }));
    return;
  }
  req.url = url.pathname;
  return gateway(req, res);
};
}

export default createVercelGateway();
