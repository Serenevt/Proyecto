const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const getRoutes = [
  /^supervisor\/me\/stations$/,
  /^supervisor\/shifts\/current$/,
  new RegExp(`^supervisor/stations/${uuid}/terminals$`),
];
const postRoutes = [
  /^login$/,
  /^supervisor\/shifts$/,
  new RegExp(`^supervisor/shifts/${uuid}/(suspend|resume|close)$`),
  new RegExp(`^supervisor/terminals/${uuid}/enable$`),
];

function origin(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('configuration'); }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) throw Error('configuration');
  return value;
}

async function jsonBody(req) {
  if (req.method === 'GET') return null;
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) throw Object.assign(Error('Se requiere JSON'), { status: 415 });
  let body = req.body;
  if (body === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 300000) throw Object.assign(Error('Solicitud demasiado grande'), { status: 413 }); chunks.push(chunk); }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw Object.assign(Error('JSON inválido'), { status: 400 }); } }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw Object.assign(Error('JSON inválido'), { status: 400 });
  if (Buffer.byteLength(JSON.stringify(body)) > 300000) throw Object.assign(Error('Solicitud demasiado grande'), { status: 413 });
  return body;
}

export function createSupervisorProxy({ env = process.env, fetcher = globalThis.fetch } = {}) {
  return async function supervisorProxy(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const publicOrigin = origin(env.FUELFLOW_PUBLIC_ORIGIN);
      const backend = origin(env.BACKEND_ORIGIN);
      const url = new URL(req.url, publicOrigin);
      const publicPath = url.pathname.startsWith('/supervisor-api/') ? url.pathname.slice('/supervisor-api/'.length) : null;
      const route = publicPath ?? url.searchParams.get('route');
      const keys = [...url.searchParams.keys()];
      if (typeof route !== 'string' || !route || keys.some(key => key !== 'route' && !(publicPath !== null && key === 'path')) || url.searchParams.getAll('route').length > 1 || (publicPath !== null && url.searchParams.has('route') && url.searchParams.get('route') !== publicPath)) throw Object.assign(Error('Ruta no permitida'), { status: 403 });
      const allowed = req.method === 'GET' ? getRoutes : req.method === 'POST' ? postRoutes : [];
      if (!allowed.some(pattern => pattern.test(route))) throw Object.assign(Error('Operación no permitida'), { status: 403 });
      if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') throw Object.assign(Error('Origen no autorizado'), { status: 403 });
      if (req.headers.origin && req.headers.origin !== publicOrigin || req.method === 'POST' && req.headers.origin !== publicOrigin) throw Object.assign(Error('Origen no autorizado'), { status: 403 });
      const login = route === 'login';
      const authorization = req.headers.authorization || '';
      if (!login && (typeof authorization !== 'string' || authorization.length > 4096 || !/^Bearer [A-Za-z0-9._-]+$/.test(authorization))) throw Object.assign(Error('Supervisor requerido'), { status: 401 });
      const body = await jsonBody(req);
      let upstream;
      try {
        upstream = await fetcher(backend + (login ? '/api/v1/auth/login' : '/api/v1/' + route), {
          method: req.method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(18000),
          headers: { 'Content-Type': 'application/json', ...(!login ? { Authorization: authorization } : {}) },
          ...(req.method === 'POST' ? { body: JSON.stringify(body) } : {}),
        });
      } catch { throw Object.assign(Error('Servicio temporalmente no disponible'), { status: 503 }); }
      const contentType = upstream.headers.get('content-type') || '';
      const content = await upstream.text();
      if (req.method === 'GET' && route === 'supervisor/shifts/current' && upstream.ok && !content && !contentType) {
        res.statusCode = upstream.status;
        res.end('null');
        return;
      }
      if (!/^application\/json\b/i.test(contentType)) throw Object.assign(Error('Respuesta inválida'), { status: 502 });
      if (Buffer.byteLength(content) > 3000000) throw Object.assign(Error('Respuesta inválida'), { status: 502 });
      res.statusCode = upstream.status;
      res.end(content);
    } catch (error) {
      res.statusCode = error.status || 503;
      res.end(JSON.stringify({ statusCode: res.statusCode, message: error.status ? error.message : 'Servicio temporalmente no disponible' }));
    }
  };
}
