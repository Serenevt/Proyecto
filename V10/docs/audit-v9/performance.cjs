/* Controlled UI measurement. Catalog API is mocked; not a full-stack SLA test.
 * Run from V9: node docs/audit-v9/performance.cjs
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('../../FrontEnd_2/node_modules/@playwright/test');
const root = path.resolve(__dirname, '../..');
async function main() {
  const server = spawn(process.execPath, ['tools/serve.cjs'], {
    cwd: root, env: { ...process.env, FRONTEND: '1', FRONTEND_PORT: '5197' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error('Server exited: ' + code))); });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => { localStorage.setItem('primax_idioma', 'es'); });
    await page.route('**/api/v1/**', route => {
      const endpoint = new URL(route.request().url()).pathname;
      if (endpoint.endsWith('/fuels')) return route.fulfill({ json: [{ id: 'audit-fuel', name: 'Premium', pricePerGallon: '23.50', active: true }] });
      if (endpoint.endsWith('/stations')) return route.fulfill({ json: [{ id: 'audit-station', code: 'PRIMAX-SUR', active: true }] });
      return route.abort();
    });
    const samples = [];
    for (let i = 0; i < 11; i++) {
      await page.goto('http://127.0.0.1:5197');
      await page.locator('#btn-iniciar').waitFor();
      const first = await page.evaluate(async () => {
        const start = performance.now();
        document.querySelector('#btn-iniciar').click();
        while (!document.querySelector('#pantalla-combustible').classList.contains('active')) await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        return performance.now() - start;
      });
      const second = await page.evaluate(async () => {
        const start = performance.now();
        document.querySelector('[data-fuel="Premium"]').click();
        while (!document.querySelector('#pantalla-pago').classList.contains('active')) await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        return performance.now() - start;
      });
      if (i) samples.push({ startToFuelMs: +first.toFixed(2), fuelToModeMs: +second.toFixed(2) });
    }
    const summary = key => {
      const values = samples.map(x => x[key]).sort((a, b) => a - b);
      return { median: +(0.5 * (values[4] + values[5])).toFixed(2), p95: values[9], max: values[9] };
    };
    console.log(JSON.stringify({ date: new Date().toISOString(), node: process.version, browser: browser.version(), platform: process.platform, viewport: '1280x800', concurrency: 1, warmupsExcluded: 1, repetitions: 10, scope: 'Two FuelFlow transitions; mocked catalog; no backend, DB, Nginx, OCR, payment or hardware. Includes intentional 900 ms UI delay. Cannot establish RNF-02 for the full main flow.', samples, summary: { startToFuelMs: summary('startToFuelMs'), fuelToModeMs: summary('fuelToModeMs') } }, null, 2));
  } finally { await browser?.close(); server.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
