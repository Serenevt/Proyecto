const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('../FrontEnd_2/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'docs/evidence-v11_3');
function financialCounts(){const sql='SELECT (SELECT count(*) FROM "Transaction"), (SELECT count(*) FROM "Payment"), (SELECT count(*) FROM "MembershipDebt");';return execFileSync('docker',['compose','-p','primax-v11-3','exec','-T','postgres','psql','-U','primax','-d','primax_v11_3','-t','-A'],{cwd:root,input:sql,encoding:'utf8',windowsHide:true}).trim()}
(async()=>{
 const baseline=path.join(folder,'restart-before.json');
 const builds=await Promise.all([23081,23082].map(async port=>{const r=await fetch('http://localhost:'+port+'/build.json');assert(r.ok);return r.json()}));
 if(process.argv.includes('--before')){fs.writeFileSync(baseline,JSON.stringify({counts:financialCounts(),builds},null,2));console.log('Restart baseline saved');return;}
 const before=JSON.parse(fs.readFileSync(baseline,'utf8'));assert.deepEqual(builds,before.builds);assert.equal(financialCounts(),before.counts);
 const browser=await chromium.launch({channel:'chrome'});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:1100}}),page=await context.newPage();let posts=0,agentRequests=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/'))posts++;if(r.url().startsWith('https://localhost:23443'))agentRequests++});
 const pending=JSON.parse(fs.readFileSync(path.join(folder,'restart-ticket.json'),'utf8'));
 await context.addInitScript(p=>{if(location.port==='23081'){localStorage.setItem('primax_idioma','es');localStorage.setItem('fuelflow:operation:v1',JSON.stringify(p));}},pending);
 await page.goto('http://localhost:23081');await page.locator('#btn-voice-toggle').click();await page.locator('#btn-iniciar').click();await page.locator('#pantalla-resumen.active').waitFor();
 assert.deepEqual(await page.locator('#pantalla-resumen button').allTextContents(),['Finalizar e imprimir','Finalizar y no imprimir']);assert.equal(await page.locator('#ticket-overlay').count(),0);
 await page.screenshot({path:path.join(folder,'ticket-after-restart.png'),fullPage:true,animations:'disabled'});await page.locator('#btn-finalizar').click();await page.locator('#pantalla-inicio.active').waitFor();assert.equal(posts,0);assert.equal(agentRequests,0);
 const fixture=JSON.parse(fs.readFileSync(path.join(folder,'restart-fixture.json'),'utf8'));
 await page.goto('http://localhost:23082');await page.locator('[name=identifier]').fill(fixture.who.email);await page.locator('[name=password]').fill(fixture.who.password);await page.locator('#login-form [type=submit]').click();await page.locator('.pending-balance').waitFor();
 assert.equal((await page.locator('.pending-balance strong').textContent()).replace(/\s/g,' '),'S/ '+fixture.expectedPending);assert.equal(await page.locator('.pending-balance button').count(),0);assert(!(await page.locator('body').textContent()).includes('PAGO PENDIENTE FUELFLOW'));
 await page.reload();await page.locator('.pending-balance').waitFor();assert.equal(await page.locator('.pending-balance p').textContent(),'Recarga tu saldo para regularizar tus consumos pendientes.');
 await page.screenshot({path:path.join(folder,'prime-after-restart.png'),fullPage:true,animations:'disabled'});
 assert.equal(financialCounts(),before.counts);
 const report={checkedAt:new Date().toISOString(),builds,financialCountsBefore:before.counts,financialCountsAfter:financialCounts(),ticketButtonsVerified:true,obsoleteModalAbsent:true,noPrintAgentRequests:agentRequests,noFinalizationFinancialPosts:0,primePending:fixture.expectedPending,reloadVerified:true,physicalPrintConfirmed:false};
 fs.writeFileSync(path.join(root,'docs/restart-v11_3.json'),JSON.stringify(report,null,2));console.log(report);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
