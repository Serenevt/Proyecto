const {test,expect}=require('../FrontEnd_2/node_modules/@playwright/test');
const {randomUUID,randomInt}=require('node:crypto');
require('./test-env.cjs');
const kiosk='http://localhost:'+process.env.FRONTEND1_PORT;
const api='http://localhost:'+(process.env.PORT||10000)+'/api/v1';
test('real Membership name, mismatch, admin login and persistent reviewed alert',async({page,request})=>{
  const name='Usuario '+randomUUID().slice(0,6),email=randomUUID()+'@example.test';
  const reg=await request.post(api+'/auth/register',{data:{name,email,password:'AdminFlowFixture123!'}});expect(reg.status()).toBe(201);
  const headers={Authorization:'Bearer '+(await reg.json()).accessToken};
  const member=await (await request.get(api+'/memberships/me',{headers})).json();
  const plate='A'+randomInt(1296).toString(36).padStart(2,'0').toUpperCase()+'-'+String(randomInt(1000)).padStart(3,'0');
  expect((await request.post(api+'/vehicles',{headers,data:{plate,label:'Alert fixture'}})).status()).toBe(201);
  await page.addInitScript(()=>localStorage.setItem('primax_idioma','es'));
  await page.goto(kiosk);await page.locator('#btn-voice-toggle').click();await page.locator('#btn-iniciar').click();await page.locator('[data-fuel="Premium"]').click();await page.locator('#btn-postpago').click();await page.locator('#btn-postpago-continuar').click();
  await page.locator('#post-input-placa').fill('BAD-999');await page.locator('#post-input-codigo').fill(member.number);await page.locator('#btn-verificar-post').click();await expect(page.locator('#post-codigo-error')).toBeVisible();
  await page.locator('#post-input-placa').fill(plate);await page.locator('#btn-verificar-post').click();await expect(page.locator('#monto-post-id')).toHaveText(plate+' · '+name);await expect(page.locator('#monto-post-id')).not.toContainText(member.number);
  await page.locator('#btn-admin-open').click();await expect(page.locator('#admin-demo-hint')).toContainText('Cuenta de demostración');
  const demo=await (await request.get(kiosk+'/api/v1/admin/demo-credentials')).json();
  await page.locator('#admin-user').fill(demo.username);await page.locator('#admin-pass').fill('wrong');await page.locator('#btn-admin-login').click();await expect(page.locator('#admin-error')).toBeVisible();await expect(page.locator('#admin-dash')).toBeHidden();
  await page.locator('#admin-pass').fill(demo.password);await page.locator('#btn-admin-login').click();await expect(page.locator('#admin-dash')).toBeVisible();
  const alert=page.locator('#lista-alertas li').filter({hasText:name});await expect(alert).toHaveCount(1);await expect(alert).toContainText('BAD-999');await alert.getByRole('button',{name:'Marcar como revisada'}).click();await expect(alert).toContainText('Revisada');
  await page.locator('#btn-admin-logout').click();await page.locator('#btn-admin-open').click();await expect(page.locator('#admin-login')).toBeVisible();await expect(page.locator('#admin-dash')).toBeHidden();
});
test('user login has no demo-account label and built assets contain no server secret names',async({request})=>{
  for(const path of ['/src/js/script.js','/src/js/adminService.js','/src/js/apiClient.js']){
    const response=await request.get(kiosk+path);expect(response.ok()).toBe(true);expect(await response.text()).not.toMatch(/SMTP_PASSWORD|JWT_SECRET|POSTGRES_PASSWORD|KIOSK_SECRET|LocalAdminV10!/);
  }
  const prime='http://localhost:'+process.env.FRONTEND2_PORT;
  const login=await (await request.get(prime+'/js/login.js')).text();expect(login).not.toMatch(/Cuenta.*demo|Cuenta.*demostración|Demo:/i);
  const config=await (await request.get(prime+'/js/config.js')).text();expect(config).not.toMatch(/SMTP_PASSWORD|Prime123|JWT_SECRET/);
});
