// Local UI contract: OCR is reviewed before use and a failed request leaves manual entry available.
const { chromium } = require('../FrontEnd_2/node_modules/@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');

const origin = 'http://127.0.0.1:' + (process.env.FRONTEND1_PORT || '26081');
const fixture = path.resolve(__dirname, '../PlateRecognition/fixtures/ABC-123.png');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(origin);
    await page.route('**/api/v1/plate-recognition', route => route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ plate: 'ABC-123', confidence: 0.91, threshold: 0.75, recognized: true, vehicle: null }),
    }));
    await page.route('**/api/v1/vehicles/ABC-123', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    await page.evaluate(async () => { (await import('/src/js/plateCamera.js')).openPlateCamera(result => { window.ocrConfirmed = result.plate; }); });
    await page.locator('[data-fixture]').setInputFiles(fixture);
    await page.locator('[data-review]').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.ocrConfirmed), undefined);
    await page.locator('[data-confirm]').click();
    assert.equal(await page.evaluate(() => window.ocrConfirmed), 'ABC-123');

    await page.unroute('**/api/v1/plate-recognition');
    await page.route('**/api/v1/plate-recognition', route => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'OCR unavailable' }),
    }));
    await page.evaluate(async () => { (await import('/src/js/plateCamera.js')).openPlateCamera(() => { window.wronglyConfirmed = true; }); });
    await page.locator('[data-fixture]').setInputFiles(fixture);
    await page.locator('.v9-dialog [role=status]').getByText(/manual/i).waitFor();
    await page.locator('[data-manual]').click();
    assert.equal(await page.locator('.v9-dialog').count(), 0);
    assert.equal(await page.evaluate(() => window.wronglyConfirmed), undefined);
    await page.evaluate(() => { document.getElementById('input-placa').value = 'ABC-123'; });
    assert.equal(await page.evaluate(() => document.getElementById('input-placa').value), 'ABC-123');
    console.log('OCR confirm and unavailable/manual UI paths passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
