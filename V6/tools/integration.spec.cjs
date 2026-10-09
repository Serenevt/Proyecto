const {test,expect}=require('../FrontEnd_2/node_modules/@playwright/test');
const {PrismaClient}=require('../Backend/node_modules/@prisma/client');
const fs=require('node:fs'),path=require('node:path');
process.loadEnvFile(path.resolve(__dirname,'../Backend/.env'));
const kiosk=process.env.V6_DOCKER_TEST?'http://localhost:8081':'http://127.0.0.1:5181';
const prime=process.env.V6_DOCKER_TEST?'http://localhost:8082':'http://127.0.0.1:5180';
test('compra desde FuelFlow actualiza Primax Prime y PostgreSQL sin duplicados',async({browser})=>{
 const db=new PrismaClient(),context=await browser.newContext();
 const member=await context.newPage(),terminal=await context.newPage();const errors=[];let result;
 member.on('pageerror',e=>errors.push(e.message));terminal.on('pageerror',e=>errors.push(e.message));
 terminal.on('request',req=>{expect(req.headers()['x-kiosk-key']).toBeUndefined();});
 try {
  await member.goto(prime);await member.getByLabel('Correo',{exact:true}).fill('demo@primaxprime.pe');await member.getByLabel('Contraseña',{exact:true}).fill(process.env.DEMO_PASSWORD);await member.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(member.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();
  const before=await member.evaluate(async()=>{const {memberService}=await import('/js/services/index.js');return memberService.get().points;});
  await expect(member.locator('.member-number')).toContainText('PRIME-0001');
  await terminal.addInitScript(()=>localStorage.setItem('primax_idioma','es'));
  await terminal.goto(kiosk);await terminal.locator('#btn-voice-toggle').click();await terminal.locator('#btn-iniciar').click();
  await terminal.locator('[data-fuel="Premium"]').click();await terminal.locator('#btn-prepago').click();await terminal.locator('#prepago-panel [data-monto="100"]').click();await terminal.locator('#btn-confirmar-monto').click();await terminal.locator('#btn-boleta').click();
  await terminal.locator('#input-dni').fill('70123456');await terminal.locator('#prep-input-placa').fill('ABC-123');await terminal.locator('#btn-continuar-datos').click();await terminal.locator('[data-metodo="TARJETA"]').click();
  const submitted=terminal.waitForResponse(r=>r.url().endsWith('/api/v1/transactions')&&r.request().method()==='POST',{timeout:60000});
  await terminal.locator('#btn-nfc-tap').click();await terminal.locator('#modal-ok').click();
  const response=await submitted;expect(response.status()).toBe(201);result=await response.json();const tx=result.transaction;
  expect(tx).toMatchObject({amount:'100.00',status:'PAID',mode:'PREPAGO',receiptType:'BOLETA',gallons:'4.255',pointsEarned:100,vehicle:{plate:'ABC-123'},membership:{number:'PRIME-0001',name:'Diego'},station:{name:'Primax Sur'},fuel:{name:'Premium'},payment:{method:'TARJETA',status:'CAPTURED'}});
  expect(result.pointsEarned).toBe(100);await expect(terminal.locator('#t-estado')).toContainText('+100 puntos');
  await terminal.reload();await terminal.locator('#btn-iniciar').dblclick();await expect(terminal.locator('#t-total')).toHaveText('S/ 100.00');
  const replay=await terminal.evaluate(async()=>{const {transactionsService}=await import('/src/js/transactionsService.js');return transactionsService.submit();});expect(replay.transaction.id).toBe(tx.id);
  // Replay over HTTP too: the cached client response alone cannot prove server idempotency.
  const repeated=await terminal.evaluate(async()=>{const {transactionsService}=await import('/src/js/transactionsService.js');const {apiClient}=await import('/src/js/apiClient.js');return apiClient('/transactions',{method:'POST',body:transactionsService.current().payload});});expect(repeated.transaction.id).toBe(tx.id);
  await member.bringToFront();
  await expect.poll(()=>member.evaluate(async()=>{const {memberService}=await import('/js/services/index.js');return memberService.get().points;}),{timeout:20000}).toBe(before+100);
  await member.getByRole('navigation').getByRole('link',{name:'Consumos',exact:true}).click();
  await expect(member.locator('[data-detail="'+tx.id+'"]')).toBeVisible();
  await member.locator('[data-detail="'+tx.id+'"]').click();await expect(member.getByRole('dialog')).toContainText('100.00');await expect(member.getByRole('dialog')).toContainText('ABC-123');await member.getByRole('button',{name:'Cerrar',exact:true}).click();
  const rewards=await member.evaluate(async()=>{const {rewardsService}=await import('/js/services/rewardsService.js');return rewardsService.list();});expect(rewards.filter(r=>r.transactionId===tx.id)).toMatchObject([{points:100,kind:'EARN'}]);
  expect(await db.transaction.count({where:{operationId:tx.operationId}})).toBe(1);
  expect(await db.payment.count({where:{transactionId:tx.id,status:'CAPTURED'}})).toBe(1);
  expect(await db.rewardMovement.count({where:{transactionId:tx.id,points:100,kind:'EARN'}})).toBe(1);
  expect(errors).toEqual([]);
  const evidence={transactionId:tx.id,operationId:tx.operationId,amount:tx.amount,pointsEarned:100,pointsBefore:before,pointsAfter:before+100,historyVisible:true,paymentCount:1,rewardCount:1,transport:process.env.V6_DOCKER_TEST?'Docker Nginx':'local development proxies'};
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
