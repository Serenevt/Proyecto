const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function ready(page, options = {}) {
  await page.addInitScript(({ denied }) => {
    if (denied) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Denied storage'); } });
  }, { denied: options.denied || false });
  await page.goto(options.file ? pathToFileURL(path.resolve(__dirname, '../index.html')).href : '/');
  await expect(page.locator('#lang-overlay')).toBeVisible();
  await page.locator('[data-lang="es"]').click();
  await page.locator('#btn-voice-toggle').click();
}
async function layout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dock = await page.locator('.assistant-dock').boundingBox();
  const controls = page.locator('.screen.active > .nav-row button:visible, .screen.active .ticket-actions button:visible');
  for (let i = 0; i < await controls.count(); i++) {
    const box = await controls.nth(i).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.y + box.height).toBeLessThanOrEqual(dock.y + 1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  }
}
async function fuel(page, name = 'Regular') {
  await page.locator('#btn-iniciar').click();
  await page.locator(`[data-fuel="${name}"]`).click();
  await expect(page.locator('#pantalla-pago')).toBeVisible();
}
async function prepay(page, { invoice = false, member = false, amount = 50, fuelName = 'Regular' } = {}) {
  await fuel(page, fuelName);
  await page.locator('#btn-prepago').click();
  await page.locator(`[data-monto="${amount}"]`).click();
  await layout(page);
  await page.locator('#btn-confirmar-monto').click();
  await page.locator(invoice ? '#btn-factura' : '#btn-boleta').click();
  if (invoice) {
    await page.locator('#input-ruc').fill('20509876543');
    await page.locator('#input-razon').fill('Transportes del Sur y Servicios Integrales de Combustibles SAC');
  } else await page.locator('#input-dni').fill('70123456');
  await page.locator('#prep-input-placa').fill('ABC-123');
  if (member) { await page.locator('#prep-check-membresia').check(); await page.locator('#prep-input-codigo').fill('PX-004821'); }
  await page.locator('#btn-continuar-datos').click();
  await expect(page.locator('#pantalla-metodo')).toBeVisible();
  await layout(page);
}
async function authorize(page) {
  await expect(page.locator('#modal-overlay')).toBeVisible();
  await page.locator('#modal-ok').click();
}
async function finishPrepay(page) {
  await authorize(page);
  await expect(page.locator('#pantalla-resumen')).toBeVisible();
  await expect(page.locator('#btn-pagar-ahora')).toBeHidden();
  await layout(page);
  expect(await page.evaluate(async () => (await FuelFlow.transactionService.list()).filter(tx => !tx.demo).length)).toBe(1);
}
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
});
for (const [method, options] of [
  ['YAPE', {}], ['PLIN', { invoice: true, member: true, fuelName: 'Premium' }],
  ['TARJETA', { amount: 100, fuelName: 'Diésel' }], ['EFECTIVO', { member: true }],
]) {
  test(`prepay ${method}: complete flow and receipt`, async ({ page }) => {
    await ready(page); await prepay(page, options);
    await page.locator(`[data-metodo="${method}"]`).click();
    if (method === 'YAPE' || method === 'PLIN') await page.locator('#btn-qr-pagado').dblclick();
    if (method === 'TARJETA') await page.locator('#btn-nfc-tap').click();
    if (method === 'EFECTIVO') {
      await expect(page.locator('#btn-ef-confirmar')).toBeDisabled();
      await page.locator('#ef-billetes [data-valor="20"]').click();
      await page.locator('#btn-ef-retirar').click();
      await expect(page.locator('#ef-total')).toHaveText('S/ 0.00');
      await page.locator('#ef-billetes [data-valor="100"]').click();
      await page.locator('#btn-ef-confirmar').click();
    }
    await finishPrepay(page);
    await page.locator('#btn-comprobante').click();
    await expect(page.locator('#comprobante-text')).toContainText('ABC-123');
    await expect(page.locator('#comprobante-text')).toContainText(method);
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#btn-descargar-txt').click();
    expect((await downloadEvent).suggestedFilename()).toMatch(/^primax_ABC-123_.*\.txt$/);
    await page.locator('#ticket-close').click(); await page.locator('#btn-finalizar').click();
    await expect(page.locator('#pantalla-inicio')).toBeVisible();
  });
}
test('postpay remains paid after switching all languages and reloads in admin', async ({ page }) => {
  await ready(page); await fuel(page, 'Diésel');
  await page.locator('#btn-postpago').click(); await page.locator('#btn-postpago-continuar').click();
  await expect(page.locator('#progress-label')).toHaveText('Paso 3 de 3');
  await page.locator('#btn-simular-camara').click();
  await expect(page.locator('#input-placa')).toHaveValue(/^[A-Z]{3}-\d{3}$/);
  await page.locator('#btn-continuar-ident').click(); await authorize(page);
  await expect(page.locator('#btn-admin-open')).toBeDisabled();
  await expect(page.locator('#litros-count')).not.toHaveText('0.00 L');
  await layout(page); await page.locator('#btn-detener').click();
  await expect(page.locator('#t-estado')).toContainText('Pendiente de pago');
  await page.locator('#btn-pagar-ahora').click();
  await expect(page.locator('#modal-overlay')).toBeVisible(); await page.locator('#modal-ok').click();
  for (const lang of ['en','qu','es']) {
    await page.locator('#btn-lang').click(); await page.locator(`[data-lang="${lang}"]`).click();
    await expect(page.locator('#btn-pagar-ahora')).toBeHidden();
    expect(await page.evaluate(() => FuelFlow.state.transaction.estado)).toBe('Pagado');
  }
  await page.reload(); await page.locator('#btn-admin-open').click();
  await page.locator('#admin-user').fill('admin'); await page.locator('#admin-pass').fill('primax123');
  await page.locator('#btn-admin-login').click();
  await expect(page.locator('#tabla-trans tbody tr')).toHaveCount(6); await layout(page);
});
test('validation, back navigation, NFC cancellation and admin return preserve the purchase', async ({ page }) => {
  await ready(page); await fuel(page); await page.locator('#btn-prepago').click();
  await page.locator('#btn-confirmar-monto').click(); await expect(page.locator('#monto-error')).toBeVisible();
  await page.locator('[data-monto="20"]').click(); await page.locator('#btn-confirmar-monto').click();
  await page.locator('#btn-boleta').click(); await page.locator('#btn-continuar-datos').click();
  await expect(page.locator('#input-dni')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#input-dni').fill('70123456'); await page.locator('#prep-input-placa').fill('ABC-123');
  await page.locator('#prep-check-membresia').check(); await page.locator('#btn-continuar-datos').click();
  await expect(page.locator('#prep-codigo-error')).toBeVisible();
  await page.locator('#prep-input-codigo').fill('PX-1');
  await page.locator('#btn-admin-open').click();
  await page.locator('#pantalla-admin > .nav-row button').click();
  await expect(page.locator('#input-dni')).toHaveValue('70123456');
  await page.locator('#btn-continuar-datos').click();
  await page.locator('[data-metodo="TARJETA"]').click(); await page.locator('#btn-nfc-tap').click();
  await page.locator('#panel-nfc .btn-metodo-volver').click();
  await page.waitForTimeout(1200); await expect(page.locator('#pantalla-metodo')).toBeVisible();
  await page.locator('[data-metodo="YAPE"]').click(); await page.locator('#btn-qr-pagado').click(); await finishPrepay(page);
});
test('assistance cancellation, arrival and focus management do not reset forms', async ({ page }) => {
  await ready(page); await prepay(page);
  await page.locator('#btn-ayuda').click(); await expect(page.locator('#help-overlay')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#help-overlay')).toBeHidden();
  await expect(page.locator('#btn-ayuda')).toBeFocused();
  await page.locator('#btn-ayuda').click();
  await expect(page.locator('#help-btn-cerrar')).toBeVisible({ timeout: 8000 });
  await page.locator('#btn-lang').evaluate(button => button.click());
  await page.locator('[data-lang="en"]').click();
  await expect(page.locator('#help-btn-cerrar')).toBeVisible();
  await expect(page.locator('#help-title')).toContainText('arrived');
  await page.locator('#help-btn-cerrar').click(); await expect(page.locator('#pantalla-metodo')).toBeVisible();
});
test('prepay pauses in background and a repeated early stop creates one transaction', async ({ page }) => {
  await ready(page); await prepay(page, { amount: 100 });
  await page.locator('[data-metodo="YAPE"]').click(); await page.locator('#btn-qr-pagado').click();
  await authorize(page);
  await expect(page.locator('#litros-count')).not.toHaveText('0.00 L');
  const paused = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return FuelFlow.state.litros;
  });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => FuelFlow.state.litros)).toBe(paused);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => FuelFlow.state.litros)).toBeGreaterThan(paused);
  await page.locator('#btn-detener').click();
  await page.evaluate(() => FuelFlow.detenerDespacho(false));
  await expect(page.locator('#pantalla-resumen')).toBeVisible();
  expect(await page.evaluate(() => FuelFlow.state.transaction.monto)).toBeLessThan(100);
  expect(await page.evaluate(async () => (await FuelFlow.transactionService.list()).filter(tx => !tx.demo).length)).toBe(1);
});
test('missing speech synthesis leaves text, mascot control and flows usable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'speechSynthesis', { value: undefined }));
  await ready(page); await page.locator('#btn-voice-toggle').click();
  await prepay(page);
  await page.locator('.mascota-frame').click();
  await expect(page.locator('#voice-status-text')).not.toBeEmpty();
  await layout(page);
});
test('blocked storage still completes a session and warns the user', async ({ page }) => {
  await ready(page, { denied: true }); await expect(page.locator('#storage-notice')).toBeVisible();
  await prepay(page); await page.locator('[data-metodo="YAPE"]').click(); await page.locator('#btn-qr-pagado').click();
  await finishPrepay(page);
});
test('direct file opening works without a build or server', async ({ page }) => {
  await ready(page, { file: true }); await prepay(page); await layout(page);
});
test('small screens, desktop and long translated text do not overflow', async ({ page }) => {
  await ready(page);
  for (const width of [320,768,1024]) {
    await page.setViewportSize({ width, height: 915 }); await layout(page);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('#btn-lang').click(); await page.locator('[data-lang="qu"]').click();
  await layout(page);
});
