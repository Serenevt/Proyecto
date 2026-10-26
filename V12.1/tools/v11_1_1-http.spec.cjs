const {test,expect}=require('../FrontEnd_2/node_modules/@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/v11_1_1/http-local');fs.mkdirSync(out,{recursive:true});
const kiosk=process.env.HTTP_LIVE_KIOSK_URL||'http://localhost:26381',origin=new URL(kiosk).origin;
const model={id:'browser-http-1',createdAt:'2026-10-24T17:00:00Z',station:{name:'Primax Sur'},fuel:{name:'Premium'},plate:'ABC-123',amount:'20.00',originalAmount:'22.00',discountAmount:'2.00',gallons:'1',unitPrice:'22',mode:'PREPAGO',receiptType:'BOLETA',receiptDni:'70123456',status:'PAID',payment:{status:'CAPTURED',method:'YAPE'}};
const cleanups=[];
test.afterEach(async()=>{while(cleanups.length)await cleanups.pop()();});
async function ticket(page,url=kiosk){
 let financialPosts=0;
 await page.route('**/api/**',r=>{if(r.request().method()==='POST')financialPosts++;return r.fulfill({json:r.request().url().includes('/transactions/')?model:r.request().url().endsWith('/inventory')?[]:{status:'ok'}});});
 await page.addInitScript(t=>{localStorage.setItem('primax_idioma','es');localStorage.setItem('fuelflow:operation:v1',JSON.stringify({operationId:'existing-http-op',payload:{mode:'PREPAGO'},result:{transaction:t,pointsEarned:0},snapshot:{modalidad:'PREPAGO',placa:t.plate,combustible:{nombre:'Premium',precio:22},tipoComprobante:'BOLETA',dni:t.receiptDni,metodoPago:'YAPE',galones:1,total:20}}));window.print=()=>{throw Error('Physical print forbidden')};},model);
 await page.goto(url);await page.locator('#btn-voice-toggle').click();await page.locator('#btn-iniciar').click();await expect(page.locator('#pantalla-resumen')).toHaveClass(/active/);return ()=>financialPosts;
}
function temporary(){const base=path.join(root,'PrintAgent/test-results');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'browser-http-'));cleanups.push(async()=>{if(path.dirname(dir)!==base)throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});});return dir;}
async function browserEvidence(page,browser){
 const state=await page.evaluate(async()=>{
  const permissions={};for(const name of ['local-network-access','local-network','loopback-network']){try{permissions[name]=(await navigator.permissions.query({name})).state;}catch{permissions[name]='unsupported';}}
  return {origin:location.origin,isSecureContext,permissions,userAgent:navigator.userAgent};
 });
 expect(state.isSecureContext).toBe(true);
 const cdp=await browser.newBrowserCDPSession();let args=[];try{args=(await cdp.send('Browser.getBrowserCommandLine')).arguments;}finally{await cdp.detach();}
 const unsafe=args.filter(a=>/disable-web-security|ignore-certificate-errors|unsafely-treat-insecure-origin-as-secure|ip-address-space-overrides/.test(a)||(/^--disable-features=/.test(a)&&/LocalNetwork|PrivateNetwork/.test(a)));
 expect(unsafe).toEqual([]);return {...state,browserVersion:browser.version(),securityBypassFlags:unsafe,permissionOverrides:false};
}
async function unmockedProbe(browser){
 const page=await browser.newPage();
 try{
  // No page.route / Fetch interception / permission override in this context.
  await page.goto(kiosk);const evidence=await browserEvidence(page,browser);
  const health=await page.evaluate(async()=>{const r=await fetch('http://127.0.0.1:25443/health',{mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json','X-FuelFlow-Print':'1'}});return {status:r.status,data:await r.json()};});
  expect(health.status).toBe(200);return {...evidence,health,networkInterception:false};
 }finally{await page.close();}
}
async function diagnostic(){
 const dir=temporary(),file=path.join(dir,'config.http.local.json');
 const config=JSON.parse(fs.readFileSync(path.join(root,'PrintAgent/config.http.local.json'),'utf8'));config.origins=[origin];fs.writeFileSync(file,JSON.stringify(config));
 const child=spawn(process.execPath,[path.join(root,'PrintAgent/server.mjs'),file,'--diagnostic'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 cleanups.push(async()=>{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));});
 await new Promise((resolve,reject)=>{let error='';const timer=setTimeout(()=>reject(Error('Agent timeout')),45000);child.stderr.on('data',c=>error+=c);child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',()=>{clearTimeout(timer);reject(Error(error))});child.stdout.on('data',c=>{if(c.toString().includes('http://127.0.0.1:25443')){clearTimeout(timer);resolve();}});});
}
async function fakeAgent(unknown=false,origins=[origin]){
 const {handler}=await import('../PrintAgent/routes.mjs'),{JobStore}=await import('../PrintAgent/store.mjs');
 const dir=temporary(),requests=[];let sends=0;
 const store=new JobStore(dir,async()=>{sends++;await new Promise(r=>setTimeout(r,150));return {status:'accepted'};});
 if(unknown)store.save({id:'receipt-'+model.id,hash:'fixture',status:'unknown',physicalConfirmed:false});
 const route=handler({origins},store),server=http.createServer((req,res)=>{requests.push({method:req.method,path:req.url,origin:req.headers.origin});route(req,res);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(25443,'127.0.0.1',resolve)});
 cleanups.push(()=>new Promise(r=>server.close(r)));expect(server.address().address).toBe('127.0.0.1');return {requests,sends:()=>sends};
}
test('blue action reaches real diagnostic PrintAgent over HTTP with browser security enabled',async({page,browser},info)=>{
 await diagnostic();const evidence=await unmockedProbe(browser),health=evidence.health;const charges=await ticket(page);
 expect(health.status).toBe(200);expect(health.data.diagnosticOnly).toBe(true);expect(health.data.printerName).toBe('PeriPage A6(1)');
 const response=page.waitForResponse(r=>r.url().includes('127.0.0.1:25443/jobs/'));
 await page.locator('#btn-comprobante').click();const reply=await response;expect(reply.status()).toBe(503);expect((await reply.json()).error).toContain('diagnóstico');
 await expect(page.locator('#print-error')).toContainText('diagnóstico');await expect(page.locator('#pantalla-resumen')).toHaveClass(/active/);expect(charges()).toBe(0);
 fs.writeFileSync(path.join(out,'browser-diagnostic-'+info.project.name+'.json'),JSON.stringify({...evidence,health,buttonResponse:503,physicalPrints:0,jobPosts:0,financialPosts:charges()},null,2));
 await page.screenshot({path:path.join(out,'diagnostic-'+info.project.name+'.png'),fullPage:true});
});
test('real CORS preflight and double click deliver a single job to a fake adapter',async({page,browser},info)=>{
 const agent=await fakeAgent(),evidence=await unmockedProbe(browser),charges=await ticket(page);
 await page.locator('#btn-comprobante').dblclick();await expect(page.locator('#pantalla-inicio')).toHaveClass(/active/);
 expect(agent.sends()).toBe(1);expect(agent.requests.filter(r=>r.method==='POST')).toHaveLength(1);expect(agent.requests.some(r=>r.method==='OPTIONS')).toBe(true);expect(charges()).toBe(0);
 fs.writeFileSync(path.join(out,'browser-cors-'+info.project.name+'.json'),JSON.stringify({...evidence,requests:agent.requests,fakeAdapterCalls:agent.sends(),physicalPrints:0,financialPosts:charges()},null,2));
});
test('unknown HTTP job is only queried after repeated clicks and reload',async({page})=>{
 const agent=await fakeAgent(true);await ticket(page);
 for(let i=0;i<2;i++){await page.locator('#btn-comprobante').click();await expect(page.locator('#print-error')).toContainText('No se reenviará');}
 await page.reload();await page.locator('#btn-voice-toggle').click();await page.locator('#btn-iniciar').click();await page.locator('#btn-comprobante').click();await expect(page.locator('#print-error')).toContainText('No se reenviará');
 expect(agent.sends()).toBe(0);expect(agent.requests.filter(r=>r.method==='POST')).toHaveLength(0);
});
test('browser CORS blocks an unpaired local origin without submitting a job',async({page})=>{
 const agent=await fakeAgent(false,['http://localhost:26099']);await page.goto(kiosk);
 const blocked=await page.evaluate(async()=>{try{await fetch('http://127.0.0.1:25443/health',{mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json','X-FuelFlow-Print':'1'}});return false;}catch{return true;}});
 expect(blocked).toBe(true);expect(agent.requests.some(r=>r.method==='OPTIONS')).toBe(true);expect(agent.sends()).toBe(0);expect(agent.requests.filter(r=>r.method==='POST')).toHaveLength(0);
});
