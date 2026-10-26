const {test,expect}=require('../FrontEnd_2/node_modules/@playwright/test');
const {randomInt}=require('node:crypto');
const {PrismaClient}=require('./database.cjs');
require('./test-env.cjs');
const kiosk='http://localhost:'+process.env.FRONTEND1_PORT;
async function begin(page){
 await page.addInitScript(()=>localStorage.setItem('primax_idioma','es'));
 await page.goto(kiosk);await page.locator('#btn-voice-toggle').click();await page.locator('#btn-iniciar').click();await page.locator('[data-fuel="Premium"]').click();await page.locator('#btn-prepago').click();await page.locator('[data-monto="100"]').click();await page.locator('#btn-confirmar-monto').click();await page.locator('#btn-boleta').click();await page.locator('#input-dni').fill('70123456');
}
for(const useOCR of [false,true])test('guest prepayment: '+(useOCR?'OCR is not offered in prepaid; manual fallback remains':'manually typed plate without Vehicle'),async({page})=>{
 const db=new PrismaClient();const before=await Promise.all([db.user.count(),db.membership.count(),db.vehicle.count()]);
 let plate;do{plate='G'+randomInt(0,1296).toString(36).padStart(2,'0').toUpperCase()+'-'+String(randomInt(1000)).padStart(3,'0');}while(await db.vehicle.findUnique({where:{plate}}));
 await begin(page);
 if(useOCR) await expect(page.locator('#prep-btn-camara')).toBeHidden();
 await page.locator('#prep-input-placa').fill(plate);await page.locator('#btn-continuar-datos').click();await page.locator('[data-metodo="TARJETA"]').click();
 const submitted=page.waitForResponse(r=>r.url().endsWith('/transactions')&&r.request().method()==='POST',{timeout:60000});
 await page.locator('#btn-nfc-tap').click();await page.locator('#modal-ok').click();const response=await submitted;expect(response.status()).toBe(201);const tx=(await response.json()).transaction;
 expect(tx).toMatchObject({plate,vehicle:null,membership:null,pointsEarned:0,status:'PAID'});
 expect(await Promise.all([db.user.count(),db.membership.count(),db.vehicle.count()])).toEqual(before);
 const saved=await db.transaction.findUniqueOrThrow({where:{id:tx.id}});expect(saved.plate).toBe(plate);expect(saved.vehicleId).toBeNull();
 const repeated=await page.evaluate(async()=>{const {apiClient}=await import('/src/js/apiClient.js');const {transactionsService}=await import('/src/js/transactionsService.js');return apiClient('/transactions',{method:'POST',body:transactionsService.current().payload});});expect(repeated.transaction.id).toBe(tx.id);
 await expect(page.locator('#t-placa')).toContainText(plate);await db.$disconnect();
});
for(const plate of ['', 'INVALID'])test('invalid manual plate is blocked before payment: '+JSON.stringify(plate),async({page})=>{
 let payments=0;page.on('request',r=>{if(r.url().endsWith('/authorizations'))payments++;});await begin(page);await page.locator('#prep-input-placa').fill(plate);await page.locator('#btn-continuar-datos').click();await expect(page.locator('#prep-placa-error')).toBeVisible();expect(payments).toBe(0);
});
