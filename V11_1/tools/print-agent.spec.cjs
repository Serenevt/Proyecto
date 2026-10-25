const {test,expect}=require('../FrontEnd_2/node_modules/@playwright/test');
const transaction={id:'browser-tx-1',createdAt:'2026-10-24T17:00:00Z',station:{name:'Primax Sur'},fuel:{name:'Premium'},plate:'ABC-123',amount:'20.00',originalAmount:'22.00',discountAmount:'2.00',gallons:'1',unitPrice:'22',mode:'PREPAGO',receiptType:'BOLETA',receiptDni:'70123456',status:'PAID',payment:{status:'CAPTURED',method:'YAPE'}};
async function ticket(page) {
  let financialPosts=0;
  await page.route('**/api/**',route=>{
    if(route.request().method()==='POST')financialPosts++;
    return route.fulfill({json:route.request().url().includes('/transactions/')?transaction:route.request().url().endsWith('/inventory')?[]:{status:'ok'}});
  });
  await page.addInitScript(t=>{
    localStorage.setItem('primax_idioma','es');
    localStorage.setItem('fuelflow:operation:v1',JSON.stringify({operationId:'existing-op',payload:{mode:'PREPAGO'},result:{transaction:t,pointsEarned:0},snapshot:{modalidad:'PREPAGO',placa:t.plate,combustible:{nombre:'Premium',precio:22},tipoComprobante:'BOLETA',dni:t.receiptDni,metodoPago:'YAPE',galones:1,total:20}}));
    window.open=()=>{throw Error('Forbidden popup')};window.print=()=>{throw Error('Forbidden dialog')};
  },transaction);
  await page.goto('http://localhost:24381');await page.locator('#btn-voice-toggle').click();await page.locator('#btn-iniciar').click();
  await expect(page.locator('#pantalla-resumen')).toHaveClass(/active/);
  await expect(page.locator('#btn-comprobante')).toHaveText('Finalizar e imprimir');
  await expect(page.locator('#btn-finalizar')).toHaveText('Finalizar y no imprimir');
  return ()=>financialPosts;
}
test('accepted job finishes, disables actions during send and sends only one receipt',async({page})=>{
  const charges=await ticket(page);let posts=0,release;
  await page.route('https://localhost:24443/**',async route=>{
    if(route.request().method()==='GET')return route.fulfill({status:404,json:{}});
    posts++;expect(route.request().postDataJSON().id).toBe(transaction.id);
    await new Promise(r=>release=r);return route.fulfill({json:{status:'accepted',physicalConfirmed:false}});
  });
  await page.locator('#btn-comprobante').click();await expect(page.locator('#btn-comprobante')).toBeDisabled();await expect(page.locator('#btn-finalizar')).toBeDisabled();
  await expect.poll(()=>posts).toBe(1);release();await expect(page.locator('#pantalla-inicio')).toHaveClass(/active/);
  expect(charges()).toBe(0);expect(posts).toBe(1);expect(await page.evaluate(()=>localStorage.getItem('fuelflow:operation:v1'))).toBeNull();
});
test('finish without print contacts neither agent nor financial API',async({page})=>{
  const charges=await ticket(page);let requests=0;await page.route('https://localhost:24443/**',r=>{requests++;return r.abort()});
  await page.locator('#btn-finalizar').click();await expect(page.locator('#pantalla-inicio')).toHaveClass(/active/);expect(requests).toBe(0);expect(charges()).toBe(0);
});
for(const status of ['offline','retryable','unknown'])test(status+' preserves receipt and permits no-print finish without charge',async({page})=>{
  const charges=await ticket(page);let posts=0;
  await page.route('https://localhost:24443/**',r=>{
    if(r.request().method()==='POST')posts++;
    return status==='offline'?r.abort():r.fulfill({json:{status,error:'Impresora desconectada'}});
  });
  await page.locator('#btn-comprobante').click();await expect(page.locator('#ticket-overlay')).toHaveCount(0);await expect(page.locator('#print-error')).toBeVisible();await expect(page.locator('.ticket')).toContainText('Sin validez fiscal');
  const original=await page.locator('.ticket').textContent();await page.locator('#btn-comprobante').click();await expect(page.locator('#btn-comprobante')).toBeEnabled();await expect(page.locator('.ticket')).toHaveText(original);
  if(status!=='retryable')expect(posts).toBe(0);
  expect(await page.evaluate(()=>localStorage.getItem('fuelflow:operation:v1'))).not.toBeNull();await page.locator('#btn-finalizar').click();await expect(page.locator('#pantalla-inicio')).toHaveClass(/active/);expect(charges()).toBe(0);
});
