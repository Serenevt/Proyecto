// Run the actual Prime image without an API, then remove only our test resources.
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const {chromium, expect} = require('../FrontEnd_2/node_modules/@playwright/test');
const root = path.resolve(__dirname, '..');
const name = 'primax-v6-standalone-' + process.pid;
const docker = (...args) => execFileSync('docker', args, {cwd: root, stdio: ['pipe','pipe','pipe']}).toString().trim();
async function main() {
  let network = false, container = false, browser;
  try {
    const config = JSON.parse(docker('compose', 'config', '--format', 'json'));
    expect(config.services.frontend2.depends_on).toBeUndefined();
    docker('network', 'create', name); network = true;
    docker('run', '-d', '--rm', '--name', name, '--network', name,
      '-p', '127.0.0.1::80', config.name + '-frontend2'); container = true;
    const port = docker('port', name, '80/tcp').split(':').at(-1);
    const url = 'http://127.0.0.1:' + port;
    await expect.poll(async () => {
      try { return (await fetch(url)).status; } catch { return 0; }
    }, {timeout: 20000}).toBe(200);
    browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
    const page = await browser.newPage();
    await page.goto(url);
    await page.locator('#login-email').fill('demo@primaxprime.pe');
    await page.locator('#login-password').fill('isolated-test-password');
    await page.locator('button[type=submit]').click();
    await expect(page.locator('#login-error')).toContainText('El servicio no', {timeout: 25000});
    await expect(page.locator('#login-form')).toBeVisible();
    console.log('PASS: Prime starts without dependencies; login displays API-unavailable error; interface remains usable.');
  } finally {
    await browser?.close();
    if (container) docker('stop', name);
    if (network) docker('network', 'rm', name);
  }
}
main().catch(() => { console.error('Standalone check failed. Check Docker access, built image and Chrome installation.'); process.exitCode = 1; });
