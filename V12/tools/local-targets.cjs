const { assertLocalDatabase } = require('../Backend/scripts/database-safety.cjs');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
function assertLocalTargets(env = process.env) {
  if (env.DATABASE_URL || env.DATABASE_URL_UNPOOLED) assertLocalDatabase(env);
  for (const key of ['API_URL', 'BACKEND_URL', 'BACKEND_UPSTREAM', 'PRIME_API_BASE_URL', 'FRONTEND1_URL', 'FRONTEND2_URL', 'BASE_URL']) {
    if (!env[key] || env[key] === '/api/v1') continue;
    let url; try { url = new URL(env[key]); } catch { throw Error(`Invalid local ${key}`); }
    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw Error(`Remote ${key} is blocked in local validation tools`);
  }
  if (env.FRONTEND === '2') {
    // A local page may otherwise silently send browser writes to a built remote API.
    const file = path.resolve(__dirname, '../FrontEnd_2', env.SERVE_BUILD === '1' ? 'www/js/config.js' : 'js/config.js');
    if (existsSync(file)) {
      const value = readFileSync(file, 'utf8').match(/export const API_BASE_URL\s*=\s*(['"])(.*?)\1/)?.[2];
      if (!value) throw Error('Cannot verify local browser API configuration');
      assertLocalTargets({ PRIME_API_BASE_URL: value });
    }
  }
}
module.exports = { assertLocalTargets };
