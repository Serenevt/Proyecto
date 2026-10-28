import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { kioskRoute } from './policy.js';

const LOCAL_COOKIE = 'primax-kiosk-local';
const COOKIE = '__Host-primax-kiosk';
const TERMINAL_COOKIE = '__Host-primax-terminal';
const TERMINAL_CSRF = '__Host-primax-terminal-csrf';
const sessionPath = '/api/v1/kiosk/session';
class GatewayError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new GatewayError(status, message); }
function originOnly(value, local = false, backend = false) {
  let url; try { url = new URL(value); } catch { fail(503, 'Configuración de terminal pendiente'); }
  const localOrigin = local && url.protocol === 'http:' && (backend ? url.hostname === 'backend' : ['127.0.0.1', 'localhost'].includes(url.hostname));
  if (url.protocol !== 'https:' && !localOrigin || url.origin !== value || url.username || url.password) fail(503, 'Configuración de terminal pendiente');
  return value;
}
function cookieToken(value = '', name = COOKIE) {
  const cookies = value.split(';').map(v => v.trim()).filter(v => v.startsWith(name + '='));
  if (cookies.length > 1) fail(400, 'Cookie inválida');
  const token = cookies[0]?.slice(name.length + 1) || '';
  if (token && !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, 'Sesión inválida');
  return token;
}
function terminalCookies(value = '', local = false) {
  const entries = value.split(';').map(v => v.trim());
  function one(name, pattern) {
    const found = entries.filter(v => v.startsWith(name + '='));
    if (found.length > 1) fail(400, 'Cookie inválida');
    const token = found[0]?.slice(name.length + 1) || '';
    if (token && !pattern.test(token)) fail(401, 'Sesión técnica inválida');
    return token;
  }
  return { technical: one(local ? 'primax-terminal-local' : TERMINAL_COOKIE, /^[a-f0-9]{64}$/), terminalCsrf: one(local ? 'primax-terminal-csrf-local' : TERMINAL_CSRF, /^[A-Za-z0-9_-]{43}$/) };
}
function equal(a, b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
async function readBody(req) {
  if (req.method === 'GET') return null;
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) fail(415, 'Se requiere JSON');
  let body = req.body;
  if (body === undefined) {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 3000000) fail(413, 'Solicitud demasiado grande'); chunks.push(chunk); }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { fail(400, 'JSON inválido'); } }
  if (!body || Array.isArray(body) || typeof body !== 'object') fail(400, 'JSON inválido');
  if (Buffer.byteLength(JSON.stringify(body)) > 3000000) fail(413, 'Solicitud demasiado grande');
  return body;
}

export function createGateway({ env = process.env, fetcher = globalThis.fetch } = {}) {
  return async function gateway(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const local = env.FUELFLOW_LOCAL_HTTP === 'true';
      const publicOrigin = originOnly(env.FUELFLOW_PUBLIC_ORIGIN, local);
      const backend = originOnly(env.BACKEND_ORIGIN, local, true);
      if (!env.KIOSK_GATEWAY_SECRET || env.KIOSK_GATEWAY_SECRET.length < 32 || env.KIOSK_GATEWAY_SECRET.includes('REPLACE_')) fail(503, 'Configuración de terminal pendiente');
      if (req.headers['x-fuelflow-request'] !== '1' || req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') fail(403, 'Origen no autorizado');
      if (req.headers.origin && req.headers.origin !== publicOrigin || req.method !== 'GET' && req.headers.origin !== publicOrigin) fail(403, 'Origen no autorizado');
      const url = new URL(req.url, publicOrigin);
      // No client-controlled destination, headers, cookies or query forwarding.
      if (url.search || !['GET', 'POST'].includes(req.method)) fail(403, 'Operación no permitida');
      const cookieName = local ? LOCAL_COOKIE : COOKIE;
      const cookieAttributes = `Path=/; HttpOnly; ${local ? '' : 'Secure; '}SameSite=Strict`;
      const token = cookieToken(req.headers.cookie, cookieName);
      const { technical, terminalCsrf } = terminalCookies(req.headers.cookie, local);
      const csrf = req.headers['x-csrf-token'] || '';
      if (typeof csrf !== 'string' || csrf.length > 100) fail(403, 'CSRF inválido');
      const body = await readBody(req);
      async function call(method, path, payload = null, { terminal = '', authorization = '' } = {}) {
        const timestamp = String(Date.now());
        const message = JSON.stringify([method, path, timestamp, payload, token, csrf, terminal, authorization]);
        const signature = createHmac('sha256', env.KIOSK_GATEWAY_SECRET).update(message).digest('hex');
        let response;
        try {
          response = await fetcher(backend + path, { method, redirect: 'error', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', 'x-kiosk-time': timestamp, 'x-kiosk-signature': signature, 'x-kiosk-session': token, 'x-csrf-token': csrf, 'x-terminal-session': terminal, authorization },
            ...(method !== 'GET' ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(18000),
          });
        } catch { fail(503, 'Servicio temporalmente no disponible'); }
        const value = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof value?.message === 'string' || Array.isArray(value?.message) ? value.message : 'Operación rechazada';
          throw new GatewayError(response.status, Array.isArray(message) ? message.join('. ') : message);
        }
        if (!value || typeof value !== 'object') fail(502, 'Respuesta inválida');
        return { value, status: response.status };
      }
      const sessions = {
        'GET /api/kiosk/session': ['GET', sessionPath],
        'POST /api/kiosk/session/login': ['POST', sessionPath + '/login'],
        'POST /api/kiosk/session/logout': ['POST', sessionPath + '/logout'],
      };
      const sessionRoute = sessions[req.method + ' ' + url.pathname];
      if (sessionRoute) {
        if (req.method === 'POST' && (!token || !csrf)) fail(403, 'Sesión y CSRF requeridos');
        if (url.pathname.endsWith('/login') && (Object.keys(body).some(k => !['username', 'password'].includes(k)) || typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 80 || Buffer.byteLength(body.password) > 72)) fail(400, 'Credenciales inválidas');
        const { value, status } = await call(...sessionRoute, body);
        const { token: replacement, ttl } = value;
        const safe = { authenticated: value.authenticated === true, csrfToken: value.csrfToken, expiresAt: value.expiresAt,
          ...(value.authenticated === true ? { stationId: value.stationId } : {}) };
        if (replacement) {
          if (!/^[A-Za-z0-9_-]{43}$/.test(replacement) || !Number.isInteger(ttl) || ttl < 1 || ttl > 1800) fail(502, 'Respuesta inválida');
          res.setHeader('Set-Cookie', `${cookieName}=${replacement}; ${cookieAttributes}; Max-Age=${ttl}`);
        }
        if (url.pathname.endsWith('/logout')) res.setHeader('Set-Cookie', `${cookieName}=; ${cookieAttributes}; Max-Age=0`);
        res.statusCode = status; res.end(JSON.stringify(safe)); return;
      }
      const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
      const pair = new RegExp(`^/api/v1/supervisor/terminals/${uuid}/(pair|rotate|revoke-session)$`);
      if (req.method === 'POST' && pair.test(url.pathname)) {
        if (!token || !csrf) fail(401, 'Sesión y CSRF requeridos');
        const authorization = req.headers.authorization || '';
        if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) fail(401, 'Supervisor requerido');
        const { value, status } = await call('POST', url.pathname, body, { authorization });
        const revoke = url.pathname.endsWith('/revoke-session');
        if (!revoke && (!/^[a-f0-9]{64}$/.test(value.token || '') || typeof value.terminalId !== 'string')) fail(502, 'Respuesta inválida');
        const csrfValue = revoke ? '' : randomBytes(32).toString('base64url');
        const maxAge = revoke ? 0 : 28800;
        const technicalName = local ? 'primax-terminal-local' : TERMINAL_COOKIE;
        const csrfName = local ? 'primax-terminal-csrf-local' : TERMINAL_CSRF;
        const secure = local ? '' : 'Secure; ';
        res.setHeader('Set-Cookie', [
          `${technicalName}=${revoke ? '' : value.token}; Path=/; HttpOnly; ${secure}SameSite=Strict; Max-Age=${maxAge}`,
          `${csrfName}=${csrfValue}; Path=/; ${secure}SameSite=Strict; Max-Age=${maxAge}`,
        ]);
        res.statusCode = status; res.end(JSON.stringify(revoke ? { revoked: value.revoked } : { paired: true, expiresAt: value.expiresAt })); return;
      }
      const terminalPath = url.pathname === '/api/v1/terminal/me' && req.method === 'GET' ||
        url.pathname === '/api/v1/terminal/operations' && req.method === 'POST' ||
        new RegExp(`^/api/v1/terminal/operations/${uuid}$`).test(url.pathname) && req.method === 'GET' ||
        new RegExp(`^/api/v1/terminal/operations/${uuid}/close$`).test(url.pathname) && req.method === 'POST';
      if (terminalPath) {
        if (!technical) fail(401, 'Sesión técnica requerida');
        if (req.method === 'POST' && (!terminalCsrf || !csrf || !equal(terminalCsrf, csrf))) fail(403, 'CSRF inválido');
        const { value, status } = await call(req.method, url.pathname, body, { terminal: technical });
        const safe = url.pathname === '/api/v1/terminal/me'
          ? { prepared: true, canStart: value.canStart === true, operationalStatus: value.operationalStatus }
          : { operationId: value.operationId, status: value.status, closedAt: value.closedAt };
        res.statusCode = status; res.end(JSON.stringify(safe)); return;
      }
      if (!kioskRoute(req.method, url.pathname)) fail(403, 'Operación de terminal no permitida');
      if (!token || !csrf) fail(401, 'Inicia sesión de operador');
      const { value: session } = await call('POST', sessionPath + '/authorize', { method: req.method, path: url.pathname, ...(body ? { body } : {}) });
      if (!session.allowed || typeof session.stationId !== 'string') fail(401, 'Inicia sesión de operador');
      // Station comes from authenticated server state, never from browser configuration.
      if (body?.stationId !== undefined && body.stationId !== session.stationId || body?.authorization?.stationId !== undefined && body.authorization.stationId !== session.stationId) fail(403, 'Estación no autorizada');
      const { value, status } = await call(req.method, url.pathname, body);
      res.statusCode = status; res.end(JSON.stringify(value));
    } catch (error) {
      res.statusCode = error instanceof GatewayError ? error.status : 503;
      res.end(JSON.stringify({ statusCode: res.statusCode, message: error instanceof GatewayError ? error.message : 'Servicio temporalmente no disponible' }));
    }
  };
}
