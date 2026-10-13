const { test, expect } = require('@playwright/test');
async function login(page) {
  await page.goto('/'); await page.getByLabel('Correo', { exact: true }).fill('demo@primaxprime.pe');
  await page.getByLabel('Contraseña', { exact: true }).fill('FixtureOnly123'); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Diego' })).toBeVisible();
}
test.beforeEach(async ({ context }) => require('./api-fixture.cjs').installApi(context));
test('perfil DNI/RUC/razón social persiste en API y se consulta tras recargar', async ({ page }) => {
  await login(page); await page.getByRole('navigation').getByRole('link', { name: 'Membresía', exact: true }).click();
  await page.getByLabel('DNI', { exact: true }).fill('12345678'); await page.getByLabel('RUC', { exact: true }).fill('20123456789');
  await page.getByLabel('Razón social', { exact: true }).fill('Empresa Demo SAC');
  const saved = page.waitForRequest(r => r.url().endsWith('/profile') && r.method() === 'PATCH');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  expect((await saved).postDataJSON()).toMatchObject({ dni: '12345678', ruc: '20123456789', businessName: 'Empresa Demo SAC' });
  await expect(page.locator('#toast')).toHaveText('Perfil guardado en tu cuenta');
  await page.reload(); await page.getByRole('navigation').getByRole('link', { name: 'Membresía', exact: true }).click();
  await expect(page.getByLabel('RUC', { exact: true })).toHaveValue('20123456789');
  const local = await page.evaluate(() => localStorage.getItem('prime:local:fixture-user'));
  expect(local).not.toContain('20123456789');
});
test('deuda e historial pendiente se actualizan después de recargar sin doble envío', async ({ page, context }) => {
  let pending = true, calls = 0;
  await context.route('**/memberships/me', route => route.fulfill({ json: { user: { name: 'Diego', email: 'demo@primaxprime.pe' }, number: 'PRIME-0001', points: 12, pendingBalance: pending ? '7.60' : '0.00', vehicles: [{ plate: 'ABC-123', label: 'Demo' }] } }));
  await context.route('**/memberships/me/transactions?*', route => route.fulfill({ json: [{ id: 'debt-tx', amount: '12.60', pointsEarned: 12, createdAt: '2026-10-12T00:00:00Z', vehicle: { plate: 'ABC-123' }, station: { name: 'Primax Sur' }, status: pending ? 'PAYMENT_PENDING' : 'PAID', debt: { amountPending: pending ? '7.60' : '0.00' } }] }));
  await context.route('**/memberships/me/recharges', async route => { calls++; await new Promise(resolve => setTimeout(resolve, 250)); pending = false; await route.fulfill({ json: { balance: '12.40', debtPaid: '7.60' } }); });
  await login(page); await expect(page.locator('.pending-balance')).toContainText('7.60');
  await page.getByRole('navigation').getByRole('link', { name: 'Consumos', exact: true }).click(); await expect(page.locator('.pending-payment')).toContainText('7.60');
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Recargar saldo' }).click(); await page.getByLabel('Monto en soles').fill('20');
  await page.locator('#recharge-form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.locator('#dialog')).not.toBeVisible(); expect(calls).toBe(1); await expect(page.locator('.pending-balance')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Consumos', exact: true }).click(); await expect(page.locator('#movements')).toContainText('Pago completado');
});
test('error Backend muestra recuperación y permite cerrar sesión', async ({ page, context }) => {
  await context.route('**/memberships/me', route => route.fulfill({ status: 503, json: { message: 'unavailable' } }));
  await page.goto('/'); await page.getByLabel('Correo', { exact: true }).fill('demo@primaxprime.pe'); await page.getByLabel('Contraseña', { exact: true }).fill('FixtureOnly123');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click(); await expect(page.getByRole('button', { name: 'Cargar nuevamente' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click(); await expect(page.getByRole('heading', { name: 'Bienvenido a Primax Prime' })).toBeVisible();
});
