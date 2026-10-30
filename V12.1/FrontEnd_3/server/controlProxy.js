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
    for await (const chunk of req) { size += chunk.length; if (size > 3000000) throw Object.assign(Error('Solicitud demasiado grande'), { status: 413 }); chunks.push(chunk); }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (body == null || body === '') return null;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw Object.assign(Error('JSON inválido'), { status: 400 }); } }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw Object.assign(Error('JSON inválido'), { status: 400 });
  if (Buffer.byteLength(JSON.stringify(body)) > 3000000) throw Object.assign(Error('Solicitud demasiado grande'), { status: 413 });
  return body;
}

function controlCookie(value = '') {
  const found = value.split(';').map(part => part.trim()).filter(part => part.startsWith('primax_control='));
  if (found.length > 1) throw Object.assign(Error('Cookie inválida'), { status: 400 });
  const token = found[0]?.slice('primax_control='.length) || '';
  if (token && (token.length > 4000 || !/^[A-Za-z0-9._-]+$/.test(token))) throw Object.assign(Error('Sesión inválida'), { status: 401 });
  return token ? `primax_control=${token}` : '';
}

function routingMetadata(key) {
  return /^(?:\.\.\.)?(?:path|route)$/i.test(key);
}

export function createControlAdapter(options) {
  const proxy = createControlProxy(options);
  return function controlHandler(req, res) {
    const url = new URL(req.url, 'https://localhost');
    for (const key of [...url.searchParams.keys()]) {
      if (routingMetadata(key)) url.searchParams.delete(key);
    }
    req.url = url.pathname + url.search;
    if (req.query) req.query = Object.fromEntries(Object.entries(req.query).filter(([key]) => !routingMetadata(key)));
    return proxy(req, res);
  };
}

function functionalSearch(searchParams) {
  const filtered = new URLSearchParams();
  for (const [key, value] of searchParams) {
    if (routingMetadata(key)) continue;
    filtered.append(key, value);
  }
  const query = filtered.toString();
  return query ? `?${query}` : '';
}

export function createControlProxy({ env = process.env, fetcher = globalThis.fetch } = {}) {
  return async function controlProxy(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const publicOrigin = origin(env.PRIMAX_CONTROL_PUBLIC_URL);
      const backend = origin(env.BACKEND_ORIGIN);
      if (!['GET', 'POST'].includes(req.method)) throw Object.assign(Error('Método no permitido'), { status: 405 });
      if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') throw Object.assign(Error('Origen no autorizado'), { status: 403 });
      if (req.headers.origin && req.headers.origin !== publicOrigin || req.method === 'POST' && req.headers.origin !== publicOrigin) throw Object.assign(Error('Origen no autorizado'), { status: 403 });
      const url = new URL(req.url, publicOrigin);
      if (!/^\/api\/v1\/control(?:\/[A-Za-z0-9_-]+)*$/.test(url.pathname) || url.search.length > 2000) throw Object.assign(Error('Ruta no permitida'), { status: 403 });
      const body = await jsonBody(req);
      const cookie = controlCookie(req.headers.cookie);
      let upstream;
      try {
        upstream = await fetcher(backend + url.pathname + functionalSearch(url.searchParams), {
          method: req.method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(22000),
          headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
          ...(req.method === 'POST' && body !== null ? { body: JSON.stringify(body) } : {}),
        });
      } catch { throw Object.assign(Error('Servicio temporalmente no disponible'), { status: 503 }); }
      const contentType = upstream.headers.get('content-type') || '';
      if (!/^application\/json\b/i.test(contentType)) throw Object.assign(Error('Respuesta inválida'), { status: 502 });
      const content = await upstream.text();
      if (Buffer.byteLength(content) > 4000000) throw Object.assign(Error('Respuesta inválida'), { status: 502 });
      const cookies = upstream.headers.getSetCookie?.() || [];
      const controlCookies = cookies.filter(item => item.startsWith('primax_control='));
      if (controlCookies.some(item => !/;\s*HttpOnly(?:;|$)/i.test(item) || !/;\s*Secure(?:;|$)/i.test(item) || !/;\s*SameSite=Strict(?:;|$)/i.test(item) || !/;\s*Path=\/api\/v1\/control(?:;|$)/i.test(item) || /;\s*Domain=/i.test(item))) throw Object.assign(Error('Cookie de sesión inválida'), { status: 502 });
      if (controlCookies.length) res.setHeader('Set-Cookie', controlCookies);
      res.statusCode = upstream.status;
      res.end(content);
    } catch (error) {
      res.statusCode = error.status || 503;
      res.end(JSON.stringify({ statusCode: res.statusCode, message: error.status ? error.message : 'Servicio temporalmente no disponible' }));
    }
  };
}
