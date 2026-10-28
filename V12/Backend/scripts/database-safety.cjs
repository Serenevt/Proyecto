// No remote database is permitted by local tests, migrations, seeds or demos.
const { URL } = require('node:url');
function assertLocalDatabase(env = process.env) {
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw Error('A local test DATABASE_URL is required (value withheld).');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const docker = url.hostname === 'postgres' && env.APP_MODE === 'local';
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !(loopback || docker)
  )
    throw Error('Remote database access is blocked for local tools and tests.');
  if (env.DATABASE_URL_UNPOOLED) {
    const direct = {
      ...env,
      DATABASE_URL: env.DATABASE_URL_UNPOOLED,
      DATABASE_URL_UNPOOLED: '',
    };
    assertLocalDatabase(direct);
  }
}
module.exports = { assertLocalDatabase };
