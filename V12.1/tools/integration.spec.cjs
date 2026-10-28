const {test,expect}=require('../FrontEnd_2/node_modules/@playwright/test');
const {PrismaClient}=require('./database.cjs');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID,randomInt}=require('node:crypto');
require('./test-env.cjs');
const kiosk=process.env.V6_DOCKER_TEST?'http://localhost:'+(process.env.FRONTEND1_PORT||8081):'http://127.0.0.1:5181';
const prime=process.env.V6_DOCKER_TEST?'http://localhost:'+(process.env.FRONTEND2_PORT||8082):'http://127.0.0.1:5180';
test('compra desde FuelFlow actualiza Primax Prime y PostgreSQL sin duplicados',async({browser,request})=>{
 const db=new PrismaClient(),context=await browser.newContext();
 // A separate synthetic account keeps the principal demo and its ledger intact.
 const email=randomUUID()+'@example.test',password='IntegrationTest123!';
 const registration=await request.post(prime+'/api/v1/auth/register',{data:{email,password,name:'Diego'}});expect(registration.status()).toBe(201);
 const headers={Authorization:'Bearer '+(await registration.json()).accessToken};
 const profile=await request.get(prime+'/api/v1/memberships/me',{headers});expect(profile.status()).toBe(200);const membership=await profile.json();
 let plate;do{plate='I'+randomInt(0,1296).toString(36).padStart(2,'0').toUpperCase()+'-'+String(randomInt(1000)).padStart(3,'0');}while(await db.vehicle.findUnique({where:{plate}}));
 expect((await request.post(prime+'/api/v1/vehicles',{headers,data:{plate,label:'Integration fixture'}})).status()).toBe(201);
 const member=await context.newPage(),terminal=await context.newPage();const errors=[];let result;
 member.on('pageerror',e=>errors.push(e.message));terminal.on('pageerror',e=>errors.push(e.message));
 terminal.on('request',req=>{expect(req.headers()['x-kiosk-key']).toBeUndefined();});
 try {
  await member.goto(prime);await member.getByLabel(/^Correo(?: o DNI)?$/,{exact:true}).fill(email);await member.getByLabel('Contraseña',{exact:true}).fill(password);await member.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(member.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();
  const before=await member.evaluate(async()=>{const {memberService}=await import('/js/services/index.js');return memberService.get().points;});
  await expect(member.locator('.member-number')).toContainText(membership.number);
  await terminal.addInitScript(()=>localStorage.setItem('primax_idioma','es'));
  await terminal.goto(kiosk);await terminal.locator('#btn-voice-toggle').click();await terminal.locator('#btn-iniciar').click();
  await terminal.locator('[data-fuel="Premium"]').click();await terminal.locator('#btn-prepago').click();await terminal.locator('#prepago-panel [data-monto="100"]').click();await terminal.locator('#btn-confirmar-monto').click();await terminal.locator('#btn-boleta').click();
  await terminal.locator('#input-dni').fill('70123456');await terminal.locator('#prep-input-placa').fill(plate);await terminal.locator('#btn-continuar-datos').click();await terminal.locator('[data-metodo="TARJETA"]').click();
  const submitted=terminal.waitForResponse(r=>r.url().endsWith('/api/v1/transactions')&&r.request().method()==='POST',{timeout:60000});
  await terminal.locator('#btn-nfc-tap').click();await terminal.locator('#modal-ok').click();
  const response=await submitted;expect(response.status()).toBe(201);result=await response.json();const tx=result.transaction;
  expect(tx).toMatchObject({amount:'90.00',status:'PAID',mode:'PREPAGO',receiptType:'BOLETA',gallons:'4.255',pointsEarned:10,vehicle:{plate:plate},membership:{number:membership.number,name:'Diego'},station:{name:'Primax Sur'},fuel:{name:'Premium'},payment:{method:'TARJETA',status:'CAPTURED'}});
  expect(result.pointsEarned).toBe(10);await expect(terminal.locator('#t-estado')).toContainText('+10 puntos');
  // Inject transport faults around a real persisted purchase; then recover against the live API.
  const authorizationRoute='**/api/v1/authorizations/*';
  for(const status of [401,403,404,503,'timeout']){
    await terminal.route(authorizationRoute,route=>status==='timeout'?undefined:route.fulfill({status,contentType:'application/json',body:JSON.stringify({message:'Injected recovery fault '+status})}));
    const check=await terminal.evaluate(async()=>{
      const {transactionsService}=await import('/src/js/transactionsService.js');
      const before=transactionsService.current();
      const recovery=await transactionsService.reconcile();
      return {before,after:transactionsService.current(),recovery};
    });
    expect(check.after).toEqual(check.before);
    expect(check.recovery.action).toBe(status===404?'discard':'blocked');
    if(status!==404)expect(check.recovery.kind).toBe(status===503?'unavailable':status==='timeout'?'timeout':'authentication');
    await terminal.unroute(authorizationRoute);
  }
  await terminal.reload();await terminal.locator('#btn-iniciar').dblclick();
  await expect(terminal.getByRole('heading',{name:'Compra recuperada',exact:true})).toBeVisible();
  await terminal.locator('#modal-ok').click();
  await expect(terminal.locator('#t-total')).toHaveText('S/ 90.00');
  const replay=await terminal.evaluate(async()=>{const {transactionsService}=await import('/src/js/transactionsService.js');return transactionsService.submit();});expect(replay.transaction.id).toBe(tx.id);
  // Replay over HTTP too: the cached client response alone cannot prove server idempotency.
  const repeated=await terminal.evaluate(async()=>{const {transactionsService}=await import('/src/js/transactionsService.js');const {apiClient}=await import('/src/js/apiClient.js');return apiClient('/transactions',{method:'POST',body:transactionsService.current().payload});});expect(repeated.transaction.id).toBe(tx.id);
  await member.bringToFront();
  await expect.poll(()=>member.evaluate(async()=>{const {memberService}=await import('/js/services/index.js');return memberService.get().points;}),{timeout:20000}).toBe(before+10);
  await member.getByRole('navigation').getByRole('link',{name:'Consumos',exact:true}).click();
  await expect(member.locator('[data-detail="'+tx.id+'"]')).toBeVisible();
  await member.locator('[data-detail="'+tx.id+'"]').click();await expect(member.getByRole('dialog')).toContainText('90.00');await expect(member.getByRole('dialog')).toContainText(plate);await member.getByRole('button',{name:'Cerrar',exact:true}).click();
  const rewards=await member.evaluate(async()=>{const {rewardsService}=await import('/js/services/rewardsService.js');return rewardsService.list();});expect(rewards.filter(r=>r.transactionId===tx.id)).toMatchObject([{points:10,kind:'EARN'}]);
  expect(await db.transaction.count({where:{operationId:tx.operationId}})).toBe(1);
  expect(await db.payment.count({where:{transactionId:tx.id,status:'CAPTURED'}})).toBe(1);
  expect(await db.rewardMovement.count({where:{transactionId:tx.id,points:10,kind:'EARN'}})).toBe(1);
  expect(errors).toEqual([]);
  const evidence={transactionId:tx.id,operationId:tx.operationId,amount:tx.amount,pointsEarned:10,pointsBefore:before,pointsAfter:before+10,historyVisible:true,paymentCount:1,rewardCount:1,transport:process.env.V6_DOCKER_TEST?'Docker Nginx':'local development proxies'};
  fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});fs.writeFileSync(path.join(__dirname,'test-results/integration.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await context.close();await db.$disconnect();}
});
test('proxies no publican credenciales ni permiten usar Prime como terminal',async({request})=>{
 const key=process.env.KIOSK_API_KEY;expect(key?.length).toBeGreaterThanOrEqual(32);
 for(const file of ['/src/js/script.js','/src/js/apiClient.js','/src/js/transactionsService.js']){const r=await request.get(kiosk+file);expect(r.status()).toBe(200);expect(await r.text()).not.toContain(key);}
 expect((await request.get(kiosk+'/.env')).status()).toBe(404);
 expect((await request.get(kiosk+'/api/v1/memberships/me')).status()).toBe(403);
 expect((await request.get(kiosk+'/api/v1/vehicles/ABC-123',{headers:{'sec-fetch-site':'cross-site'}})).status()).toBe(403);
 expect((await request.get(prime+'/api/v1/vehicles/ABC-123',{headers:{'x-kiosk-key':key}})).status()).toBe(401);
});
