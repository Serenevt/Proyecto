// Temporarily validate LAN bindings, then restore local-only bindings and keep data.
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const docker = (...args) => execFileSync('docker', args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }).toString();
const lan = ['compose', '-f', 'compose.yaml', '-f', 'compose.lan.yaml'];
async function main() {
  docker('compose', 'config', '--quiet');
  docker(...lan, 'config', '--quiet');
  const config = JSON.parse(docker(...lan, 'config', '--format', 'json'));
  assert.equal(config.services.postgres.ports[0].host_ip, '127.0.0.1');
  assert.equal(config.services['plate-recognition'].ports, undefined);
  try {
    docker(...lan, 'up', '-d', '--wait');
    for (const service of ['frontend1', 'frontend2', 'backend']) {
      const container = JSON.parse(docker('inspect', docker(...lan, 'ps', '-q', service).trim()))[0];
      assert.equal(container.State.Health.Status, 'healthy');
      const binding = Object.values(container.NetworkSettings.Ports).flat().find(Boolean);
      assert.equal(binding.HostIp, '0.0.0.0');
      const route = service === 'backend' ? '/api/v1/health' : '/';
      assert.equal((await fetch('http://127.0.0.1:' + binding.HostPort + route)).status, 200);
      console.log('LAN binding + HTTP OK:', service, binding.HostPort);
    }
    const db = JSON.parse(docker('inspect', docker(...lan, 'ps', '-q', 'postgres').trim()))[0];
    assert.equal(db.NetworkSettings.Ports['5432/tcp'][0].HostIp, '127.0.0.1');
    const ocr = JSON.parse(docker('inspect', docker(...lan, 'ps', '-q', 'plate-recognition').trim()))[0];
    assert(Object.values(ocr.NetworkSettings.Ports).every(value => value === null));
    console.log('PASS: PostgreSQL loopback; OCR internal. No second-device connectivity claim.');
  } finally {
    docker('compose', 'up', '-d', '--wait');
    console.log('Restored local-only Compose bindings; volumes preserved.');
  }
}
main().catch(() => { console.error('LAN validation failed; inspect Compose health and bindings.'); process.exitCode = 1; });
