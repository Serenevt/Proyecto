function validateApiUrl(value, android = false) {
  if (!android && value === '/api/v1') return value;
  let url; try { url = new URL(value); } catch { throw Error('PRIME_API_BASE_URL requires an absolute HTTP(S) URL ending in /api/v1.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '/api/v1') throw Error('Invalid PRIME_API_BASE_URL: use HTTP(S), /api/v1 and no credentials/query/fragment.');
  if (android && (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || /^127\./.test(url.hostname) || ['[::1]', '0.0.0.0'].includes(url.hostname))) throw Error('Android cannot use localhost: configure your LAN host or public API.');
  if (process.env.NODE_ENV === 'production' && (url.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) || url.hostname.endsWith('.local') || url.hostname.includes(':'))) throw Error('Production requires a public HTTPS API URL.');
  return value.replace(/\/$/, '');
}
module.exports = { validateApiUrl };
