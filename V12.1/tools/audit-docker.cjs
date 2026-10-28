// Read-only checks. Capture sensitive Docker output; never print its values.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const docker = (...args) => execFileSync('docker', args, {cwd: root, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe','pipe','pipe']});
const compose = (...args) => docker('compose', ...args);
async function main() {
  const config = JSON.parse(compose('config', '--format', 'json'));
  const env = config.services.backend.environment;
  const redisCommand = config.services.redis.command;
  const redisPassword = Array.isArray(redisCommand) ? redisCommand[redisCommand.indexOf('--requirepass') + 1] : '';
  const secrets = [
    env.JWT_SECRET, env.KIOSK_API_KEY, env.DATABASE_URL, env.DATABASE_URL_UNPOOLED,
    env.KIOSK_REDIS_URL, env.DEMO_PASSWORD, env.DEMO_CONTROL_ADMIN_PASSWORD,
    env.DEMO_SUPERVISOR_PASSWORD, config.services.postgres.environment.POSTGRES_PASSWORD,
    redisPassword, env.SMTP_PASSWORD, env.ADMIN_PASSWORD_HASH,
  ].filter(value => typeof value === 'string' && value.length > 0);
  assert(env.JWT_SECRET && env.KIOSK_API_KEY && env.DATABASE_URL && redisPassword, 'Configure local server secrets first');
  assert.equal(new URL(env.DATABASE_URL).hostname, 'postgres');
  const dbNetworks = Object.keys(config.services.postgres.networks);
  let checks = 0;
  for (const service of ['frontend1', 'frontend2', 'frontend3']) {
    assert(!Object.keys(config.services[service].networks).some(n => dbNetworks.includes(n)), service + ' must not join the database network');
    const id = compose('ps', '-q', service).toString().trim();
    const container = JSON.parse(docker('inspect', id))[0];
    assert.equal(container.State.Health.Status, 'healthy');
    const publicFiles = compose('exec', '-T', service, 'tar', '-cf', '-', '-C', '/usr/share/nginx/html', '.');
    const names = compose('exec', '-T', service, 'find', '/usr/share/nginx/html', '-type', 'f').toString();
    assert(!/(node_modules|coverage|test-results|\.git\/|\.env|\.map$)/m.test(names), service + ' contains non-public artifacts');
    const image = JSON.parse(docker('image', 'inspect', config.name + '-' + service))[0];
    // BuildKit can change the attestation/index digest on a cache-only rebuild.
    // Compare the actual filesystem and runtime configuration, not that index.
    if (container.ImageManifestDescriptor?.digest) {
      const platform = image.Os + '/' + image.Architecture;
      const manifest = JSON.parse(docker('image', 'inspect', '--platform', platform, config.name + '-' + service))[0];
      assert.equal(container.ImageManifestDescriptor.digest, manifest.Descriptor.digest, service + ' runs an outdated platform image');
    } else {
      assert.equal(container.Image, image.Id, service + ' runs an outdated image');
    }
    const history = docker('history', '--no-trunc', image.Id);
    for (const secret of secrets) {
      assert(!publicFiles.includes(Buffer.from(secret)), service + ' exposes a secret');
      assert(!history.includes(Buffer.from(secret)), service + ' image history contains a secret');
    }
    const local = path.join(root, service === 'frontend1' ? 'FrontEnd_1/dist' : service === 'frontend2' ? 'FrontEnd_2/www' : 'FrontEnd_3/dist');
    for (const entry of fs.readdirSync(local, {recursive: true, withFileTypes: true})) {
      if (!entry.isFile()) continue;
      const bytes = fs.readFileSync(path.join(entry.parentPath || entry.path, entry.name));
      for (const secret of secrets) assert(!bytes.includes(Buffer.from(secret)), 'Local public build exposes a secret');
    }
    checks++;
  }
  const logs = compose('logs', '--no-color');
  for (const secret of secrets) assert(!logs.includes(Buffer.from(secret)), 'Container logs contain a secret');
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', '.'], {cwd: root}).toString().split('\0').filter(Boolean);
  for (const file of new Set(files)) {
    assert(!/(^|\/)(\.env$|node_modules\/|coverage\/|test-results\/|playwright-report\/)|\.(apk|aab)$/i.test(file), 'Generated/private file is versionable: ' + file);
    if (!fs.existsSync(path.join(root, file))) continue;
    const bytes = fs.readFileSync(path.join(root, file));
    for (const secret of secrets) assert(!bytes.includes(Buffer.from(secret)), 'Configured secret found in versionable file: ' + file);
  }
  const hostUrl = service => 'http://localhost:' + config.services[service].ports[0].published;
  const urls = [hostUrl('frontend1'), hostUrl('frontend2'), hostUrl('frontend3'), hostUrl('backend')+'/api/v1/health', hostUrl('backend')+'/api/docs'];
  for (const url of urls) {
    const response = await fetch(url, {signal: AbortSignal.timeout(10000)});
    assert.equal(response.status, 200, url);
    console.log('HTTP 200:', url);
  }
  console.log('PASS:', checks, 'frontend images current; isolated database network; all public builds, image histories, logs and versionable V12.1 files exclude configured server secrets.');
}
main().catch(error => {
  // Child-process errors may contain captured config. Print only safe assertion text.
  console.error(error.code === 'ERR_ASSERTION' ? error.message : 'Docker audit failed; check engine access, services and local builds.');
  process.exitCode = 1;
});
