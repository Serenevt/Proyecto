const {test,expect}=require('../FrontEnd_2/node_modules/@playwright/test');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs');
const kiosk='http://localhost:24081',prime='http://localhost:24082',api='http://localhost:24000/api/v1';
const headers={'x-kiosk-key':'LOCAL_DEMO_V10_KIOSK_CHANGE_ME_32_CHARS'};
const evidence=path.resolve(__dirname,'../docs/evidence-v11_4');fs.mkdirSync(evidence,{recursive:true});
let sharedOwner;
test.beforeAll(async({request})=>{sharedOwner=await member(request)});
async function json(request,url,options={}){const r=await request.fetch(api+url,options);const data=await r.json();expect(r.ok(),JSON.stringify(data)).toBe(true);return data;}
async function member(request){const email=randomUUID()+'@example.test',password='V11_4_TestPassword!';const s=await json(request,'/auth/register',{method:'POST',data:{name:'Validación V11_4',email,password}});const bearer={Authorization:'Bearer '+s.accessToken};const m=await json(request,'/memberships/me',{headers:bearer});const plate=randomUUID().slice(0,3).toUpperCase()+'-321';await json(request,'/vehicles',{method:'POST',headers:bearer,data:{plate,label:'Validación'}});return {email,password,bearer,m,plate};}
async function purchase(request,mode='POSTPAGO',receiptType='BOLETA',owner){
 const fuels=await json(request,'/fuels',{headers}),stations=await json(request,'/stations',{headers});const fuel=fuels[0],station=stations.find(s=>s.code==='PRIMAX-SUR');
 const who=mode==='POSTPAGO'?(owner||sharedOwner):null;
 const body={operationId:randomUUID(),plate:who?.plate||'NEW-123',amount:'20.00',unitPrice:Number(fuel.pricePerGallon).toFixed(2),stationId:station.id,fuelId:fuel.id,mode,receiptType,...(who?{membershipCode:who.m.number,allowDebt:true}:{allowDebt:false,paymentMethod:'YAPE'})};
 if(mode==='PREPAGO'){const order=await json(request,'/online-orders',{headers,method:'POST',data:{operationId:body.operationId,method:'YAPE',authorization:body}});await json(request,'/online-orders/'+order.id+'/demo-confirm',{headers,method:'POST',data:{amount:Number(order.amount).toFixed(2),currency:'PEN'}});}
 const a=(await json(request,'/authorizations',{headers,method:'POST',data:body})).authorization;
 const gallons=(20/Number(a.unitPrice)).toFixed(3);await json(request,'/authorizations/'+a.id+'/progress',{headers,method:'POST',data:{amount:'20.00',gallons}});
 const payload={...body,allowDebt:undefined,gallons,authorizationId:a.id,paymentMethod:who?'SALDO_PRIME':'YAPE',...(receiptType==='BOLETA'?{receiptDni:'70123456'}:{receiptRuc:'20123456789',receiptBusinessName:'Validación V11_4'})};
 const result=await json(request,'/transactions',{headers,method:'POST',data:payload});
 const snapshot={modalidad:mode,placa:body.plate,combustible:{nombre:fuel.name,precio:Number(a.unitPrice)},galones:Number(gallons),total:20,montoPrepago:20,montoPostpago:20,tipoComprobante:receiptType,dni:payload.receiptDni,ruc:payload.receiptRuc,razonSocial:payload.receiptBusinessName,metodoPago:payload.paymentMethod};
 return {operationId:body.operationId,payload,result,snapshot};
}
async function recover(page,pending){
 await page.addInitScript(p=>{localStorage.setItem('primax_idioma','es');localStorage.setItem('fuelflow:operation:v1',JSON.stringify(p));window.print=()=>{throw Error('Forbidden print dialog')};window.open=()=>{throw Error('Forbidden popup')};},pending);
 let financialPosts=0,downloads=0,popups=0;
 page.on('request',r=>{if(r.method()==='POST'&&/\/api\//.test(r.url()))financialPosts++});page.on('download',()=>downloads++);page.on('popup',()=>popups++);
 await page.goto(kiosk);await page.locator('#btn-voice-toggle').click();await page.locator('#btn-iniciar').click();
 await expect(page.locator('#pantalla-resumen')).toHaveClass(/active/);
 await expect(page.locator('#pantalla-resumen button')).toHaveText(['Finalizar e imprimir','Finalizar y no imprimir']);
 await expect(page.locator('#ticket-overlay,#btn-imprimir,#ticket-close,#comprobante-text')).toHaveCount(0);
 await expect(page.locator('body')).not.toContainText('Comprobante DEMO');await expect(page.locator('body')).not.toContainText('Generar comprobante');
 const before=financialPosts;return ()=>({financialPosts:financialPosts-before,downloads,popups});
}
for(const mode of ['PREPAGO','POSTPAGO'])for(const type of ['BOLETA','FACTURA'])test(mode+' '+type+' recovered existing receipt: one click, one job and no financial POST',async({page,request})=>{
 const pending=await purchase(request,mode,type);const activity=await recover(page,pending);let posts=0,release;
 fs.writeFileSync(path.join(evidence,'restart-ticket.json'),JSON.stringify(pending,null,2));
 await page.route('https://localhost:24443/**',async r=>{if(r.request().method()==='GET')return r.fulfill({status:404,json:{}});posts++;expect(r.request().postDataJSON().id).toBe(pending.result.transaction.id);const data=r.request().postDataJSON();expect(data.schemaVersion).toBe(2);expect(data.demo).toBe(true);expect(data.documentType).toBe(type);expect(data.state).toBe(mode==='POSTPAGO'?'Pago pendiente':'Pagado');expect(type==='BOLETA'?data.ruc:data.dni).toBe('');await new Promise(r=>release=r);return r.fulfill({json:{status:'accepted',physicalConfirmed:false}})});
 await page.screenshot({path:path.join(evidence,'ticket-'+mode+'-'+type+'.png'),fullPage:true,animations:'disabled'});
 await page.locator('#btn-comprobante').dblclick();await expect.poll(()=>posts).toBe(1);await expect(page.locator('#btn-comprobante')).toBeDisabled();await expect(page.locator('#btn-finalizar')).toBeDisabled();release();await expect(page.locator('#pantalla-inicio')).toHaveClass(/active/);
 expect(activity()).toEqual({financialPosts:0,downloads:0,popups:0});expect(posts).toBe(1);
});
test('no-print finish creates no job, download, popup or financial request',async({page,request})=>{
 const activity=await recover(page,await purchase(request));let contacts=0;await page.route('https://localhost:24443/**',r=>{contacts++;return r.abort()});await page.locator('#btn-finalizar').click();await expect(page.locator('#pantalla-inicio')).toHaveClass(/active/);expect(contacts).toBe(0);expect(activity()).toEqual({financialPosts:0,downloads:0,popups:0});
});
for(const state of ['lost-response','retryable','unknown','offline'])test(state+' retains main ticket; retry consults same id and does not create financial records',async({page,request})=>{
 const pending=await purchase(request);const activity=await recover(page,pending);let posts=0,gets=0,accepted=false;
 await page.route('https://localhost:24443/**',r=>{
  const method=r.request().method();if(method==='GET')gets++;else posts++;
  if(state==='offline')return r.abort();
  if(state==='lost-response'){if(accepted)return r.fulfill({json:{status:'accepted',physicalConfirmed:false}});if(method==='GET')return r.fulfill({status:404,json:{}});accepted=true;return r.abort();}
  return r.fulfill({json:{status:state==='retryable'&&posts>1?'accepted':state,error:'Impresora desconectada',physicalConfirmed:false}});
 });
 await page.locator('#btn-comprobante').click();await expect(page.locator('#print-error')).toBeVisible();await expect(page.locator('#pantalla-resumen')).toHaveClass(/active/);await expect(page.locator('#ticket-overlay')).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('fuelflow:operation:v1'))).not.toBeNull();
 if(state==='offline')await page.screenshot({path:path.join(evidence,'ticket-error-inline.png'),fullPage:true,animations:'disabled'});
 await page.locator('#btn-comprobante').click();
 if(['lost-response','retryable'].includes(state)){await expect(page.locator('#pantalla-inicio')).toHaveClass(/active/);expect(posts).toBe(state==='lost-response'?1:2);}else{await expect(page.locator('#btn-comprobante')).toBeEnabled();expect(posts).toBe(0);await page.locator('#btn-finalizar').click();}
 expect(gets).toBe(2);expect(activity()).toEqual({financialPosts:0,downloads:0,popups:0});
 const fresh=await json(request,'/transactions/'+pending.result.transaction.id,{headers});expect(fresh.id).toBe(pending.result.transaction.id);expect(fresh.amount).toBe(pending.result.transaction.amount);
});
test('Prime debt stays one backend-synchronized card on login, reload, navigation, new debt and recharge',async({page,request})=>{
 const who=await member(request);await purchase(request,'POSTPAGO','BOLETA',who);
 await page.goto(prime);await page.locator('[name=identifier]').fill(who.email);await page.locator('[name=password]').fill(who.password);await page.locator('#login-form [type=submit]').click();
 const check=async amount=>{const card=page.locator('.pending-balance');await expect(card).toHaveCount(1);await expect(card.locator(':scope > *')).toHaveCount(3);await expect(card.locator('h2')).toHaveText('SALDO PENDIENTE');await expect(card.locator('strong')).toHaveText('S/ '+amount);await expect(card.locator('p')).toHaveText('Recarga tu saldo para regularizar tus consumos pendientes.');await expect(card.locator('button')).toHaveCount(0);await expect(page.locator('body')).not.toContainText('PAGO PENDIENTE FUELFLOW');await expect(page.locator('body')).not.toContainText('Pagar con Yape / Plin');await expect(page.locator('.member-card + .pending-balance')).toBeVisible();await expect(page.locator('[data-recharge]')).toHaveCount(1)};
 await check('20.00');await page.reload();await check('20.00');await page.locator('#navigation [href="#consumos"]').click();await page.locator('#navigation [href="#inicio"]').click();await check('20.00');
 await purchase(request,'POSTPAGO','FACTURA',who);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await check('40.00');
 await page.setViewportSize({width:1280,height:1050});await page.screenshot({path:path.join(evidence,'prime-debt-desktop.png'),fullPage:true,animations:'disabled'});await page.setViewportSize({width:390,height:950});await page.screenshot({path:path.join(evidence,'prime-debt-mobile.png'),fullPage:true,animations:'disabled'});
 await page.locator('[data-recharge]').click();await page.locator('#recharge-form [name=amount]').fill('10');await page.locator('#recharge-form button').click();await check('30.00');await page.reload();await check('30.00');
 fs.writeFileSync(path.join(evidence,'restart-fixture.json'),JSON.stringify({who,expectedPending:'30.00'},null,2));
});
test('served V11_4 builds version all modules and disable stale HTML/JS caching; no service worker',async({page,request})=>{
 for(const [base,html,js] of [[kiosk,'/src/index.html','/src/js/script.js'],[prime,'/','/js/app.js']]){const build=await (await request.get(base+'/build.json')).json();expect(build.release).toBe('V11_4');const r=await request.get(base+html);expect(r.headers()['cache-control']).toContain('no-store');expect(await r.text()).toContain(build.version);const module=await request.get(base+js);expect(module.headers()['cache-control']).toContain('no-store');expect(await module.text()).toContain('?v='+build.version);await page.goto(base);expect(await page.evaluate(async()=>navigator.serviceWorker?(await navigator.serviceWorker.getRegistrations()).length:0)).toBe(0);}
});

test('backend unavailable before print preserves ticket and contacts no agent',async({page,request})=>{
 const pending=await purchase(request);const activity=await recover(page,pending);let calls=0;
 await page.route('**/api/v1/transactions/'+pending.result.transaction.id,r=>r.fulfill({status:503,json:{message:'offline'}}));
 await page.route('https://localhost:24443/**',r=>{calls++;return r.abort()});
 await page.locator('#btn-comprobante').click();await expect(page.locator('#print-error')).toBeVisible();await expect(page.locator('#pantalla-resumen')).toHaveClass(/active/);expect(calls).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('fuelflow:operation:v1'))).not.toBeNull();await page.locator('#btn-finalizar').click();await expect(page.locator('#pantalla-inicio')).toHaveClass(/active/);expect(activity().financialPosts).toBe(0);
});
test('pending intervention blocks both finish actions before printing or clearing',async({page,request})=>{
 const activity=await recover(page,await purchase(request));let calls=0;await page.route('https://localhost:24443/**',r=>{calls++;return r.abort()});
 await page.evaluate(()=>{const key='fuelflow:operation:v1',p=JSON.parse(localStorage.getItem(key));p.intervention='revision';localStorage.setItem(key,JSON.stringify(p))});
 for(const id of ['#btn-comprobante','#btn-finalizar']){await page.locator(id).click();await expect(page.locator('#print-error')).toContainText('revisión');await expect(page.locator('#pantalla-resumen')).toHaveClass(/active/)}
 expect(calls).toBe(0);expect(activity().financialPosts).toBe(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('fuelflow:operation:v1')).intervention)).toBe('revision');
});
test('backend invoice identity wins over a stale boleta snapshot',async({page,request})=>{
 const p=await purchase(request,'POSTPAGO','FACTURA');p.snapshot.tipoComprobante='BOLETA';p.snapshot.dni='99999999';p.snapshot.ruc='99999999999';p.snapshot.razonSocial='DATOS ANTERIORES';await recover(page,p);
 await expect(page.locator('#t-doc')).toContainText('Factura');await expect(page.locator('#t-docnum')).toContainText('20123456789');await expect(page.locator('#t-docnum')).not.toContainText('999999');
 await page.route('https://localhost:24443/**',r=>{if(r.request().method()==='GET')return r.fulfill({status:404,json:{}});const x=r.request().postDataJSON();expect(x.documentType).toBe('FACTURA');expect(x.ruc).toBe('20123456789');expect(x.dni).toBe('');expect(x.businessName).toBe('Validación V11_4');return r.fulfill({json:{status:'accepted',physicalConfirmed:false}})});await page.locator('#btn-comprobante').click();await expect(page.locator('#pantalla-inicio')).toHaveClass(/active/);
});
test('100 mm overflow rejected by adapter stays inline and allows no-print finish',async({page,request})=>{
 const activity=await recover(page,await purchase(request,'POSTPAGO','BOLETA',await member(request)));let posts=0;await page.route('https://localhost:24443/**',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({json:{status:'retryable',error:'El comprobante excede el formato de 100 mm. No se imprimio ni se dividio en paginas.',physicalConfirmed:false}})});
 await page.locator('#btn-comprobante').click();await expect(page.locator('#print-error')).toContainText('excede el formato de 100 mm');await expect(page.locator('#pantalla-resumen')).toHaveClass(/active/);await expect(page.locator('#ticket-overlay')).toHaveCount(0);await page.screenshot({path:path.join(evidence,'ticket-overflow-inline.png'),fullPage:true,animations:'disabled'});await page.locator('#btn-finalizar').click();expect(posts).toBe(1);expect(activity().financialPosts).toBe(0);
});
