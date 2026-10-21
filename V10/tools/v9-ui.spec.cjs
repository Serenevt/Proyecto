const { test, expect } = require('../FrontEnd_2/node_modules/@playwright/test');
const path = require('node:path');
require('./test-env.cjs');
const kiosk = 'http://localhost:' + (process.env.FRONTEND1_PORT || 8081);
const fixture = name => path.resolve(__dirname, '../PlateRecognition/fixtures/', name + '.png');
test.beforeEach(async ({ page }) => { await page.goto(kiosk); });

test('OCR real fixture ABC-123 identifica Vehicle, PRIME-0001 y Diego', async ({ page }) => {
  await page.evaluate(async () => { const { openPlateCamera } = await import('/src/js/plateCamera.js'); openPlateCamera(result => { window.recognized = result; }); });
  await page.locator('[data-fixture]').setInputFiles(fixture('ABC-123'));
  await expect(page.locator('.v9-dialog [role=status]')).toContainText('PRIME-0001');
  expect(await page.evaluate(() => window.recognized.vehicle.membership.name)).toBe('Diego');
  await page.locator('[data-manual]').click(); await expect(page.locator('.v9-dialog')).toHaveCount(0);
});
test('cámara abre, captura y libera tracks al cancelar', async ({ page }) => {
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 300;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1000, 300); ctx.fillStyle = 'black'; ctx.font = 'bold 140px sans-serif'; ctx.fillText('ABC-123', 170, 200);
    const stream = canvas.captureStream(10); window.testStream = stream;
    navigator.mediaDevices.getUserMedia = async () => stream;
  });
  await page.evaluate(async () => { (await import('/src/js/plateCamera.js')).openPlateCamera(result => { window.recognized = result; }); });
  await expect(page.locator('[data-capture]')).toBeEnabled();
  await page.locator('[data-capture]').click();
  await expect(page.locator('.v9-dialog [role=status]')).toContainText('Vehículo reconocido');
  await page.locator('[data-cancel]').click();
  expect(await page.evaluate(() => window.testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
});
test('baja confianza, reintento e ingreso manual', async ({ page }) => {
  await page.route('**/api/v1/plate-recognition', route => route.fulfill({ json: { plate: 'ABC-123', confidence: .4, threshold: .75, recognized: false, vehicle: null } }));
  await page.evaluate(async () => { (await import('/src/js/plateCamera.js')).openPlateCamera(() => { window.wronglyRecognized = true; }); });
  await page.locator('[data-fixture]').setInputFiles(fixture('unreadable'));
  await expect(page.locator('.v9-dialog [role=status]')).toContainText('suficiente confianza');
  expect(await page.evaluate(() => window.wronglyRecognized)).toBeUndefined();
  await page.locator('[data-manual]').click(); await expect(page.locator('.v9-dialog')).toHaveCount(0);
});
test('OCR loading y error permiten cancelar', async ({ page }) => {
  let respond;
  await page.route('**/api/v1/plate-recognition', async route => { await new Promise(resolve => { respond = resolve; }); await route.fulfill({ status: 503, json: { message: 'OCR unavailable' } }); });
  await page.evaluate(async () => { (await import('/src/js/plateCamera.js')).openPlateCamera(() => {}); });
  await page.locator('[data-fixture]').setInputFiles(fixture('ABC-123'));
  await expect(page.locator('.v9-dialog [role=status]')).toHaveText('Reconociendo placa…');
  await expect.poll(() => Boolean(respond)).toBe(true); respond();
  await expect(page.locator('.v9-dialog [role=status]')).toContainText('No pudimos');
  await page.locator('[data-cancel]').click();
});
for (const action of ['debt', 'other', 'recharge']) test('saldo insuficiente: opción ' + action, async ({ page }) => {
  await page.evaluate(async () => { void (await import('/src/js/plateCamera.js')).insufficientBalance({ available: '5.00', amount: '12.60', amountPending: '7.60', code: 'INSUFFICIENT_BALANCE', canRegisterDebt: true }).then(value => { window.action = value; }); });
  await expect(page.locator('.v9-dialog')).toContainText('S/ 7.60');
  await page.locator(`[data-action=${action}]`).click(); expect(await page.evaluate(() => window.action)).toBe(action);
  if (action === 'recharge') {
    const response = await page.request.get(kiosk + '/prime', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('http://localhost:' + (process.env.FRONTEND2_PORT || 8082) + '/');
  }
});
test('límite excedido oculta registrar deuda', async ({ page }) => {
  await page.evaluate(async () => { void (await import('/src/js/plateCamera.js')).insufficientBalance({ available: '0.00', amount: '201.00', amountPending: '201.00', code: 'DEBT_LIMIT', canRegisterDebt: false }); });
  await expect(page.locator('.v9-dialog')).toContainText('Has alcanzado el límite'); await expect(page.locator('[data-action=debt]')).toHaveCount(0);
});
