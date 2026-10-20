function validateApiUrl(value, android = false) {
  if (!android && value === '/api/v1') return value;
  let url; try { url = new URL(value); } catch { throw Error('PRIME_API_BASE_URL requires an absolute HTTP(S) URL ending in /api/v1.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '/api/v1') throw Error('Invalid PRIME_API_BASE_URL: use HTTP(S), /api/v1 and no credentials/query/fragment.');
  if (android && (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || /^127\./.test(url.hostname) || ['[::1]', '0.0.0.0'].includes(url.hostname))) throw Error('Android cannot use localhost: configure your LAN host or public API.');
  return value.replace(/\/$/, '');
}
module.exports = { validateApiUrl };
