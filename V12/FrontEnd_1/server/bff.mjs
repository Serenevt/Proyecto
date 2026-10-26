import { createHash } from 'node:crypto';

const API = 'https://primax-v12-api-staging.vercel.app/api/v1';
const COOKIE = '__Host-fuelflow-session';
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const SLUG = '[A-Za-z0-9-]{1,40}';
const routes = [
  ['GET', /^\/api\/v1\/(?:fuels|fuels\/inventory|stations)$/, false],
  ['GET', new RegExp(`^/api/v1/vehicles/${SLUG}$`), true],
  ['POST', /^\/api\/v1\/admin\/check-plate$/, true],
  ['POST', /^\/api\/v1\/authorizations$/, true],
  ['GET', new RegExp(`^/api/v1/authorizations/${UUID}$`), true],
  ['POST', new RegExp(`^/api/v1/authorizations/${UUID}/(?:progress|release|intervention)$`), true],
  ['POST', /^\/api\/v1\/transactions$/, true],
  ['GET', new RegExp(`^/api/v1/transactions/${UUID}$`), true],
  ['POST', /^\/api\/v1\/online-orders$/, true],
  ['GET', new RegExp(`^/api/v1/online-orders/${UUID}$`), true],
  ['POST', new RegExp(`^/api/v1/online-orders/${UUID}/(?:demo-confirm|cancel)$`), true],
];

function reply(status, data, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

function settings(env) {
  const origin = env.FUELFLOW_PUBLIC_ORIGIN;
  const ids = env.STAGING_FUELFLOW_OPERATOR_IDS?.split(',').map((id) => id.trim().toLowerCase());
  if (env.VERCEL_ENV !== 'production' || env.FUELFLOW_DEPLOYMENT !== 'staging' ||
      env.FUELFLOW_API_UPSTREAM !== API ||
      origin !== 'https://primax-v12-fuelflow-staging.vercel.app' ||
      !Array.isArray(ids) || !ids.length || ids.some((id) => !new RegExp(`^${UUID}$`).test(id)) ||
      typeof env.STAGING_FUELFLOW_PROXY_KEY !== 'string' || env.STAGING_FUELFLOW_PROXY_KEY.length < 32)
    throw new Error('FUELFLOW_STAGING_CONFIGURATION_REQUIRED');
  return { origin, operators: new Set(ids), proxyKey: env.STAGING_FUELFLOW_PROXY_KEY };
}

function cookieToken(request) {
  const matches = (request.headers.get('cookie') || '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(COOKIE.length + 1);
  return /^[A-Za-z0-9._-]+$/.test(token) && token.length < 4096 ? token : null;
}

async function jsonBody(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || ''))
    throw new Error('INVALID_CONTENT_TYPE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('EMPTY_BODY');
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('INVALID_JSON');
  return data;
}

function allowedBrowserRequest(request, origin) {
  if (request.headers.get('x-fuelflow-request') !== '1') return false;
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return request.method === 'GET' || request.headers.get('origin') === origin;
}

async function upstream(fetcher, path, { method = 'GET', token, proxyKey, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (proxyKey) headers['x-fuelflow-proxy-key'] = proxyKey;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetcher(API + path, { method, headers,
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(12000) });
  const content = await response.text();
  if (content.length > 1024 * 1024) throw new Error('UPSTREAM_RESPONSE_TOO_LARGE');
  let data;
  try { data = JSON.parse(content); } catch { throw new Error('UPSTREAM_INVALID_JSON'); }
  return { status: response.status, data };
}

async function operatorSession(fetcher, token, config) {
  const result = await upstream(fetcher, '/memberships/me', { token });
  if (result.status !== 200 || !config.operators.has(String(result.data?.userId).toLowerCase())) return null;
  return result.data.userId;
}

// A local limiter reduces accidental/login bursts. Access never relies on it: the
// allowlist, Backend password check and Backend JWT validation are authoritative.
const loginAttempts = new Map();
function loginAllowed(request, now) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const recent = (loginAttempts.get(ip) || []).filter((time) => now - time < 60000);
  recent.push(now);
  loginAttempts.set(ip, recent);
  if (loginAttempts.size > 2000) loginAttempts.clear();
  return recent.length <= 5;
}

export async function handleRequest(request, { env = process.env, fetcher = fetch, now = Date.now } = {}) {
  let config;
  try { config = settings(env); } catch { return reply(503, { message: 'FuelFlow staging no disponible' }); }
  let url;
  try { url = new URL(request.url); } catch { return reply(400, { message: 'Solicitud inválida' }); }
  let rewritten = url.searchParams.get('route');
  const captured = url.searchParams.get('path');
  // Vercel also forwards a named wildcard as `path` in the query string.
  // Accept it only when it agrees with the route we explicitly requested.
  if (captured !== null) {
    const prefix = rewritten === 'session/:path*' ? 'session'
      : rewritten === 'v1/:path*' ? 'v1' : null;
    if (url.searchParams.size !== 2 || url.searchParams.getAll('route').length !== 1 ||
        url.searchParams.getAll('path').length !== 1 ||
        !/^[A-Za-z0-9/-]+$/.test(captured) ||
        (!prefix && rewritten !== `session/${captured}` && rewritten !== `v1/${captured}`))
      return reply(404, { message: 'Ruta no disponible' });
    if (prefix) rewritten = `${prefix}/${captured}`;
  }
  if (url.origin !== config.origin ||
      (url.search && (url.searchParams.size !== (captured === null ? 1 : 2) ||
        url.searchParams.getAll('route').length !== 1 || rewritten === null)) ||
      (rewritten && !/^(?:session(?:\/[A-Za-z0-9-]+)?|v1\/[A-Za-z0-9/-]+)$/.test(rewritten)) ||
      /[%\\]/.test(url.pathname) || url.pathname.includes('//'))
    return reply(404, { message: 'Ruta no disponible' });
  const path = rewritten ? `/api/${rewritten}` : url.pathname;
  if (rewritten && url.pathname !== '/api/index' && url.pathname !== path)
    return reply(404, { message: 'Ruta no disponible' });
  if (!allowedBrowserRequest(request, config.origin)) return reply(403, { message: 'Origen no autorizado' });
  try {
    if (path === '/api/session/login' && request.method === 'POST') {
      if (!loginAllowed(request, now())) return reply(429, { message: 'Demasiados intentos' });
      const body = await jsonBody(request);
      if (typeof body.identifier !== 'string' || typeof body.password !== 'string' ||
          body.identifier.length > 120 || body.password.length > 200)
        return reply(400, { message: 'Credenciales inválidas' });
      const result = await upstream(fetcher, '/auth/login', { method: 'POST', body: {
        identifier: body.identifier, password: body.password,
      } });
      if (result.status !== 200 || !config.operators.has(String(result.data?.user?.id).toLowerCase()) ||
          typeof result.data?.accessToken !== 'string')
        return reply(403, { message: 'Acceso de operador denegado' });
      const token = result.data.accessToken;
      const sessionTag = createHash('sha256')
        .update(`fuelflow-staging:${result.data.user.id}`).digest('hex').slice(0, 20);
      return reply(200, { authenticated: true, sessionTag }, {
        'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`,
      });
    }
    if (path === '/api/session/logout' && request.method === 'POST')
      return reply(200, { authenticated: false }, {
        'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
      });
    const token = cookieToken(request);
    if (!token) return reply(401, { message: 'Se requiere sesión de operador' });
    const operatorId = await operatorSession(fetcher, token, config);
    if (!operatorId) return reply(401, { message: 'Sesión de operador inválida o revocada' }, {
      'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
    });
    if (path === '/api/session' && request.method === 'GET')
      return reply(200, { authenticated: true, sessionTag: createHash('sha256')
        .update(`fuelflow-staging:${operatorId}`).digest('hex').slice(0, 20) });
    const route = routes.find(([method, pattern]) => request.method === method && pattern.test(path));
    if (!route) return reply(404, { message: 'Ruta no disponible' });
    const body = request.method === 'POST' ? await jsonBody(request) : undefined;
    if (path === '/api/v1/authorizations' && body?.allowDebt !== undefined && body.allowDebt !== false)
      return reply(403, { message: 'Deuda deshabilitada' });
    if (path === '/api/v1/online-orders' &&
        (body?.transactionId !== undefined || body?.authorization?.allowDebt === true))
      return reply(403, { message: 'Deuda deshabilitada' });
    const result = await upstream(fetcher, path.slice(7), { method: request.method,
      token, ...(route[2] ? { proxyKey: config.proxyKey } : {}), body });
    if (result.status >= 500) return reply(502, { message: 'Backend no disponible' });
    return reply(result.status, result.data);
  } catch (error) {
    if (['INVALID_CONTENT_TYPE', 'EMPTY_BODY', 'BODY_TOO_LARGE', 'INVALID_JSON'].includes(error?.message))
      return reply(400, { message: 'Cuerpo JSON inválido' });
    return reply(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 504 : 502,
      { message: 'Backend no disponible. Conserva la operación para recuperación.' });
  }
}
