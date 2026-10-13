const { test, expect } = require('../FrontEnd_2/node_modules/@playwright/test');
const fs = require('node:fs'), path = require('node:path');
process.loadEnvFile(path.resolve(__dirname, '../.env'));
const kiosk = 'http://localhost:' + (process.env.FRONTEND1_PORT || 8081);
const prime = 'http://localhost:' + (process.env.FRONTEND2_PORT || 8082);
test('flujo real OCR → Prime → comprobante → deuda → recarga → historial pagado', async ({ browser }) => {
  const context = await browser.newContext();
  const member = await context.newPage(), terminal = await context.newPage();
  // Keep financial evidence outside Playwright's automatically cleared output.
  const evidenceFile = path.join(__dirname, 'evidence/v9-flow.json');
  fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
  const memberApi = (route, body) => member.evaluate(async ({ route, body }) => {
    const { apiClient } = await import('/js/services/apiClient.js'); return apiClient(route, body ? { method: 'PATCH', body } : {});
  }, { route, body });
  try {
    await member.goto(prime); await member.getByLabel('Correo', { exact: true }).fill('demo@primaxprime.pe'); await member.getByLabel('Contraseña', { exact: true }).fill(process.env.DEMO_PASSWORD);
    await member.getByRole('button', { name: 'Iniciar sesión', exact: true }).click(); await expect(member.getByRole('heading', { name: 'Hola, Diego' })).toBeVisible();
    // Re-running verifies the existing evidence; it never resets demo money.
    if (fs.existsSync(evidenceFile)) {
      const previous = JSON.parse(fs.readFileSync(evidenceFile));
      const tx = await memberApi('/transactions/' + previous.transactionId);
      expect(tx.status).toBe('PAID'); expect(tx.payment.status).toBe('CAPTURED'); expect(Number(tx.debt.amountPending)).toBe(0);
      console.log('Previously completed flow remains settled:', previous.transactionId); return;
    }
    await expect(member.locator('.balance')).toContainText('5.00');
    terminal.on('request', req => expect(req.headers()['x-kiosk-key']).toBeUndefined());
    await terminal.addInitScript(() => localStorage.setItem('primax_idioma', 'es'));
    await terminal.goto(kiosk); await terminal.locator('#btn-voice-toggle').click(); await terminal.locator('#btn-iniciar').click();
    await terminal.locator('[data-fuel="Premium"]').click(); await terminal.locator('#btn-postpago').click(); await terminal.locator('#btn-postpago-continuar').click();
    await terminal.locator('#post-btn-camara').click();
    await terminal.locator('[data-fixture]').setInputFiles(path.resolve(__dirname, '../PlateRecognition/fixtures/ABC-123.png'));
    await expect(terminal.locator('.v9-dialog [role=status]')).toContainText('PRIME-0001');
    await terminal.locator('[data-manual]').click(); await expect(terminal.locator('#post-input-placa')).toHaveValue('ABC-123');
    await expect(terminal.locator('#post-input-codigo')).toHaveValue('PRIME-0001'); await terminal.locator('#btn-verificar-post').click();
    for (const digit of ['1', '2', '.', '6', '0']) await terminal.locator(`[data-keyp="${digit}"]`).click();
    await terminal.locator('#btn-confirmar-monto-post').click(); await terminal.locator('#btn-boleta').click();
    await expect(terminal.locator('#input-dni')).toHaveValue('12345678');
    await terminal.locator('#pantalla-datos [data-nav="pantalla-comprobante"]').click(); await terminal.locator('#btn-factura').click();
    await expect(terminal.locator('#input-ruc')).toHaveValue('20123456789'); await expect(terminal.locator('#input-razon')).toHaveValue('Transportes Demo Ficticios SAC');
    await terminal.locator('#btn-continuar-datos').dblclick(); await expect(terminal.locator('.v9-dialog')).toContainText('S/ 7.60');
    await terminal.screenshot({ path: path.join(__dirname, 'test-results/v9-insufficient.png'), fullPage: true });
    await terminal.locator('[data-action=debt]').click();
    const submitted = terminal.waitForResponse(r => r.url().endsWith('/transactions') && r.request().method() === 'POST');
    await terminal.locator('#modal-ok').click({ timeout: 60000 });
    const response = await submitted; expect(response.status()).toBe(201); const tx = (await response.json()).transaction;
    expect(tx).toMatchObject({ amount: '12.60', status: 'PAYMENT_PENDING', payment: { status: 'PARTIAL' }, receiptRuc: '20123456789', receiptBusinessName: 'Transportes Demo Ficticios SAC' });
    await expect(terminal.locator('#t-estado')).toContainText('Pendiente S/ 7.60');
    await expect(member.locator('.pending-balance')).toContainText('7.60', { timeout: 15000 });
    await member.screenshot({ path: path.join(__dirname, 'test-results/v9-prime-debt.png'), fullPage: true });
    await member.getByRole('button', { name: 'Recargar saldo' }).click(); await member.getByLabel('Monto en soles').fill('20'); await member.getByRole('button', { name: 'Confirmar recarga' }).click();
    await expect(member.locator('.balance')).toContainText('12.40'); await expect(member.locator('.pending-balance')).toHaveCount(0);
    await member.getByRole('navigation').getByRole('link', { name: 'Consumos', exact: true }).click(); await expect(member.locator('#movements')).toContainText('Pago completado');
    const completed = await memberApi('/transactions/' + tx.id); expect(completed.status).toBe('PAID'); expect(completed.payment.status).toBe('CAPTURED');
    await memberApi('/memberships/me/profile', { ruc: '20987654321', businessName: 'Empresa Demo Actualizada' });
    expect((await memberApi('/transactions/' + tx.id)).receiptRuc).toBe('20123456789');
    fs.writeFileSync(evidenceFile, JSON.stringify({ transactionId: tx.id, initialBalance: '5.00', amount: '12.60', debt: '7.60', recharge: '20.00', finalBalance: '12.40', finalDebt: '0.00', ocr: 'ABC-123', membership: 'PRIME-0001', receiptSnapshot: true }, null, 2));
  } finally { await context.close(); }
});
