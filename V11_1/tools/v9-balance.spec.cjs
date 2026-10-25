const { test, expect } = require('../FrontEnd_2/node_modules/@playwright/test');
const { randomUUID } = require('node:crypto');
require('./test-env.cjs');
const kiosk = 'http://localhost:' + process.env.FRONTEND1_PORT;
const details = { available: '5.00', amount: '12.60', amountPending: '7.60', code: 'INSUFFICIENT_BALANCE', canRegisterDebt: true };

for (const scenario of ['unchanged', 'updated', 'sufficient', 'network']) test('Ya recargue: ' + scenario, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(kiosk);
  await page.evaluate(async ({ details, scenario }) => {
    window.calls = 0;
    void (await import('/src/js/plateCamera.js')).insufficientBalance(details, async allowDebt => {
      window.calls++; window.allowDebt = allowDebt;
      if (scenario === 'sufficient') return true;
      if (scenario === 'network') throw Error('Servidor no disponible');
      throw Object.assign(Error('insufficient'), { details: scenario === 'updated' ? { ...details, available: '7.00', amountPending: '5.60' } : details });
    }).then(value => { window.result = value; });
  }, { details, scenario });
  await expect(page.locator('.v9-dialog button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Ya recargu\u00e9', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (scenario === 'unchanged') await page.screenshot({ path: require('node:path').join(__dirname, 'evidence/v10-balance-mobile.png') });
  expect(await page.evaluate(() => window.calls)).toBe(0);
  await page.locator('[data-action=recharge]').click();
  expect(await page.evaluate(() => window.calls)).toBe(1);
  expect(await page.evaluate(() => window.allowDebt)).toBe(false);
  if (scenario === 'sufficient') {
    await expect(page.locator('.v9-dialog')).toHaveCount(0);
    expect(await page.evaluate(() => window.result)).toBe('authorized');
  } else {
    await expect(page.locator('[data-pending]')).toHaveText('S/ ' + (scenario === 'updated' ? '5.60' : '7.60'));
    if (scenario === 'network') await expect(page.locator('[data-message]')).toHaveText('Servidor no disponible');
    expect(await page.evaluate(() => window.result)).toBeUndefined();
  }
});

test('dialog debt double click is single flight and cannot close while pending', async ({ page }) => {
  await page.goto(kiosk);
  await page.evaluate(async details => {
    window.calls = 0;
    void (await import('/src/js/plateCamera.js')).insufficientBalance(details, async allowDebt => {
      window.calls++; window.allowDebt = allowDebt;
      await new Promise(resolve => { window.complete = resolve; });
    }).then(value => { window.result = value; });
  }, details);
  await page.locator('[data-action=debt]').evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('[data-action=recharge]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('.v9-dialog')).toBeVisible();
  expect(await page.evaluate(() => window.calls)).toBe(1);
  expect(await page.evaluate(() => window.allowDebt)).toBe(true);
  await page.evaluate(() => window.complete());
  await expect(page.locator('.v9-dialog')).toHaveCount(0);
});

test('real PostgreSQL: recheck button, updated shortfall, debt replay and recharge 20', async ({ page, request }) => {
  const api = 'http://localhost:' + (process.env.PORT || 10000) + '/api/v1';
  const registered = await request.post(api + '/auth/register', { data: { name: 'Balance Test', email: randomUUID() + '@example.test', password: 'BalanceTest123!' } });
  expect(registered.status()).toBe(201);
  const { accessToken } = await registered.json();
  const headers = { Authorization: 'Bearer ' + accessToken };
  const member = await (await request.get(api + '/memberships/me', { headers })).json();
  const plate = 'T' + randomUUID().replaceAll('-', '').slice(0, 2).toUpperCase() + '-' + String(Date.now()).slice(-3);
  expect((await request.post(api + '/vehicles', { headers, data: { plate, label: 'Balance fixture' } })).status()).toBe(201);
  const topup = async amount => {
    const res = await request.post(api + '/memberships/me/recharges', { headers, data: { amount, operationId: randomUUID() } });
    expect(res.status()).toBe(201);
  };
  await topup('5.00');
  const fuels = await (await request.get(api + '/fuels')).json();
  const stations = await (await request.get(api + '/stations')).json();
  const fuel = fuels.find(f => f.code === 'PREMIUM');
  const body = { mode: 'POSTPAGO', plate, membershipCode: member.number, fuelId: fuel.id, stationId: stations[0].id, amount: '12.60', unitPrice: fuel.pricePerGallon, allowDebt: false };
  await page.goto(kiosk);
  await page.evaluate(async body => {
    const { transactionsService: service } = await import('/src/js/transactionsService.js');
    const { insufficientBalance } = await import('/src/js/plateCamera.js');
    try { await service.authorize(body, {}); }
    catch (error) {
      void insufficientBalance(error.details, async allowDebt => { window.approved = await service.authorize({ ...body, allowDebt }, {}); }).then(result => { window.result = result; });
    }
  }, body);
  await expect(page.locator('[data-pending]')).toHaveText('S/ 7.60');
  const operationId = await page.evaluate(() => JSON.parse(localStorage.getItem('fuelflow:operation:v1')).operationId);
  await page.locator('[data-action=recharge]').click();
  await expect(page.locator('[data-action=recharge]')).toBeEnabled();
  await expect(page.locator('[data-pending]')).toHaveText('S/ 7.60');
  await page.locator('[data-action=debt]').evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('.v9-dialog')).toHaveCount(0);
  const tx = await page.evaluate(async ({ body, operationId }) => {
    const { transactionsService: service } = await import('/src/js/transactionsService.js');
    const { authorizationService } = await import('/src/js/apiClient.js');
    const authorizationId = window.approved.authorization.id;
    const gallons = (12.6 / Number(body.unitPrice)).toFixed(3);
    await authorizationService.progress(authorizationId, '12.60', gallons);
    service.prepare({ ...body, allowDebt: undefined, unitPrice: undefined, operationId, gallons, authorizationId, paymentMethod: 'SALDO_PRIME', outcome: 'AUTO' }, {});
    const [a, b] = await Promise.all([service.submit(), service.submit()]);
    if (a.transaction.id !== b.transaction.id) throw Error('duplicate');
    return a.transaction;
  }, { body, operationId });
  expect(tx).toMatchObject({ status: 'PAYMENT_PENDING', payment: { status: 'PARTIAL' } });
  expect(Number(tx.debt.amountPending)).toBe(7.60);
  await topup('20.00');
  const updated = await (await request.get(api + '/memberships/me', { headers })).json();
  expect(updated.balance).toBe('12.40');
  const settled = await (await request.get(api + '/transactions/' + tx.id, { headers })).json();
  expect(settled.status).toBe('PAID'); expect(settled.payment.status).toBe('CAPTURED');
  expect(Number(settled.debt.amountPending)).toBe(0);
});
