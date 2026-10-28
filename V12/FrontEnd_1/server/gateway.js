import { createHmac } from 'node:crypto';
import { kioskRoute } from './policy.js';

const COOKIE = '__Host-primax-kiosk';
const sessionPath = '/api/v1/kiosk/session';
class GatewayError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new GatewayError(status, message); }
function originOnly(value) {
  let url; try { url = new URL(value); } catch { fail(503, 'Configuración de terminal pendiente'); }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) fail(503, 'Configuración de terminal pendiente');
  return value;
}
function cookieToken(value = '') {
  const cookies = value.split(';').map(v => v.trim()).filter(v => v.startsWith(COOKIE + '='));
  if (cookies.length > 1) fail(400, 'Cookie inválida');
  const token = cookies[0]?.slice(COOKIE.length + 1) || '';
  if (token && !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, 'Sesión inválida');
  return token;
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
      const publicOrigin = originOnly(env.FUELFLOW_PUBLIC_ORIGIN);
      const backend = originOnly(env.BACKEND_ORIGIN);
      if (!env.KIOSK_GATEWAY_SECRET || env.KIOSK_GATEWAY_SECRET.length < 32 || env.KIOSK_GATEWAY_SECRET.includes('REPLACE_')) fail(503, 'Configuración de terminal pendiente');
      if (req.headers['x-fuelflow-request'] !== '1' || req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') fail(403, 'Origen no autorizado');
      if (req.headers.origin && req.headers.origin !== publicOrigin || req.method !== 'GET' && req.headers.origin !== publicOrigin) fail(403, 'Origen no autorizado');
      const url = new URL(req.url, publicOrigin);
      // No client-controlled destination, headers, cookies or query forwarding.
      if (url.search || !['GET', 'POST'].includes(req.method)) fail(403, 'Operación no permitida');
      const token = cookieToken(req.headers.cookie);
      const csrf = req.headers['x-csrf-token'] || '';
      if (typeof csrf !== 'string' || csrf.length > 100) fail(403, 'CSRF inválido');
      const body = await readBody(req);
      async function call(method, path, payload = null) {
        const timestamp = String(Date.now());
        const message = JSON.stringify([method, path, timestamp, payload, token, csrf]);
        const signature = createHmac('sha256', env.KIOSK_GATEWAY_SECRET).update(message).digest('hex');
        let response;
        try {
          response = await fetcher(backend + path, { method, redirect: 'error', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', 'x-kiosk-time': timestamp, 'x-kiosk-signature': signature, 'x-kiosk-session': token, 'x-csrf-token': csrf },
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
          res.setHeader('Set-Cookie', `${COOKIE}=${replacement}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttl}`);
        }
        if (url.pathname.endsWith('/logout')) res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
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
