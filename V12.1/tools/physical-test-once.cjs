// Explicitly authorized physical test. A durable exclusive marker prevents a second POST.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomBytes,createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {chromium}=require('../FrontEnd_2/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..'),baseOut=path.join(root,'docs/v11_1_1/final-physical');
const second=process.argv.includes('--second-authorized-test');
const out=second?path.join(baseOut,'second-test'):baseOut;fs.mkdirSync(out,{recursive:true});
const fixturePath=path.join(out,'fixture.json'),markerPath=path.join(out,'ONE-PHYSICAL-POST-CONSUMED.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));
const origin='http://localhost:26081',base='http://127.0.0.1:25443';
function get(url){return new Promise((resolve,reject)=>{const q=http.request(base+url,{headers:{Origin:origin,'X-FuelFlow-Print':'1'},agent:false},r=>{let text='';r.on('data',c=>text+=c);r.on('end',()=>resolve({status:r.statusCode,data:text?JSON.parse(text):null}));});q.on('error',reject);q.setTimeout(5000,()=>q.destroy(Error('HTTP timeout')));q.end();});}
function queueSnapshot(){
 const code="$ErrorActionPreference='Stop'; $p=Get-Printer -Name 'PeriPage A6(1)'; $j=@(Get-PrintJob -PrinterName $p.Name); $d=@(Get-CimInstance Win32_Printer | Where-Object Default | Select-Object -ExpandProperty Name); @{timestamp=[DateTime]::UtcNow.ToString('o');printer=@{name=$p.Name;driver=$p.DriverName;port=$p.PortName;status=[string]$p.PrinterStatus};jobs=@($j | Select-Object ID,DocumentName,JobStatus,SubmittedTime);defaultPrinter=$d} | ConvertTo-Json -Depth 6 -Compress";
 return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true,timeout:30000}).replace(/^\uFEFF/,''));
}
async function main(){
 if(second){const authorization=read(path.join(baseOut,'second-authorization.json'));if(authorization.additionalPhysicalPrintsAllowed!==1)throw Error('Falta la segunda autorización específica.');}
 const {validateReceipt}=await import('../PrintAgent/contract.mjs');
 const {thermalReceipt}=await import('../FrontEnd_1/src/js/thermalReceipt.js');
 if(process.argv.includes('--prepare')){
  if(fs.existsSync(markerPath))throw Error('La autorización ya fue consumida. No se preparó otra impresión.');
  const suite=read(path.join(root,'docs/v11_1_1/http-local/validation-suite.json'));
  const live=read(path.join(root,'docs/v11_1_1/http-local/browser-live-results.json'));
  if(!suite.suites.every(s=>s.passed)||live.stats.unexpected||live.stats.expected!==8)throw Error('Primero deben pasar las pruebas automáticas y de navegador.');
  if(!fs.existsSync(fixturePath)){
   const transaction={id:'physical-test-'+randomBytes(6).toString('hex'),createdAt:new Date().toISOString(),station:{name:'ESTACION DE PRUEBA'},plate:'DEMO-001',fuel:{name:'Premium DEMO'},gallons:'1.000',unitPrice:'15.00',originalAmount:'15.00',discountAmount:'3.00',amount:'12.00',receiptType:'BOLETA',receiptDni:'00000000',mode:'PREPAGO',status:'PAYMENT_PENDING',payment:{method:'PRUEBA_SIN_COBRO',status:'PENDING'}};
   fs.writeFileSync(fixturePath,JSON.stringify({createdAt:new Date().toISOString(),notice:'PRUEBA DE IMPRESIÓN — SIN VALIDEZ FISCAL',transaction,receipt:validateReceipt(thermalReceipt(transaction))},null,2),{flag:'wx'});
  }
  const plan=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(root,'tools/preview-physical-test.ps1'),'-FixturePath',fixturePath,'-OutputPath',path.join(out,'ticket-preview.png')],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2000000}).replace(/^\uFEFF/,''));
  if(!plan.Fits||plan.Pages!==1||!plan.Pieces.map(p=>p.Text).join(' ').includes('PRUEBA DE IMPRESIÓN — SIN VALIDEZ FISCAL'))throw Error('La vista térmica no confirmó una página con el aviso de prueba.');
  save('preview-plan.json',plan);console.log(JSON.stringify({prepared:true,jobId:'receipt-'+read(fixturePath).receipt.id,fits:plan.Fits,pages:plan.Pages,requiredMm:plan.RequiredHeightMm,availableMm:plan.AvailableHeightMm,physicalPost:false},null,2));return;
 }
 if(!process.argv.includes('--print-once'))throw Error('Uso: --prepare (no imprime), luego --print-once (UNA autorización física).');
 const fixture=read(fixturePath),id='receipt-'+fixture.receipt.id;
 if(fs.existsSync(markerPath)){console.log(JSON.stringify({refusedSecondPost:true,id,current:await get('/jobs/'+id)},null,2));process.exitCode=1;return;}
 const plan=read(path.join(out,'preview-plan.json'));if(!plan.Fits||plan.Pages!==1)throw Error('Falta vista térmica validada.');
 const health=await get('/health');if(health.status!==200||health.data.diagnosticOnly||health.data.printerName!=='PeriPage A6(1)')throw Error('El agente no está listo para la cola física configurada.');
 const prior=await get('/jobs/'+id);if(prior.status!==404)throw Error('Ya existe este trabajo; solo puede consultarse. No se envió de nuevo.');
 const before=queueSnapshot();save('queue-before.json',before);
 if(before.printer.name!=='PeriPage A6(1)'||before.printer.driver!=='PeriPage A6'||before.printer.port!=='USB001'||before.printer.status!=='Normal'||before.jobs.length)throw Error('La cola no coincide o tiene trabajos pendientes. No se imprimió.');
 let browser,physicalPosts=0,financialPosts=0,clientError=null,blockedDuplicates=0;
 const expected=createHash('sha256').update(JSON.stringify(validateReceipt(fixture.receipt))).digest('hex');
 try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-automation']});const page=await browser.newPage();
  await page.route('**/api/**',r=>{if(r.request().method()!=='GET'){financialPosts++;return r.abort();}return r.fulfill({json:r.request().url().includes('/transactions/')?fixture.transaction:r.request().url().endsWith('/inventory')?[]:{status:'ok'}});});
  await page.route(base+'/jobs/**',r=>{
   if(r.request().method()==='POST'){
    try{
     const receipt=validateReceipt(r.request().postDataJSON());
     if(r.request().url()!==base+'/jobs/'+id||createHash('sha256').update(JSON.stringify(receipt)).digest('hex')!==expected||financialPosts)throw Error('Payload o recorrido inesperado.');
     if(physicalPosts||fs.existsSync(markerPath)){blockedDuplicates++;return r.abort();}
     const fd=fs.openSync(markerPath,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({consumedAt:new Date().toISOString(),id,receiptSHA256:expected,target:'PeriPage A6(1)',maxPhysicalPost:1,reason:'Autorización expresa del usuario en esta sesión. No reintentar.'},null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
     physicalPosts++;console.log('Único POST físico autorizado: '+id);
    }catch(e){clientError=e.message;return r.abort();}
   }
   return r.continue();
  });
  await page.addInitScript(t=>{localStorage.setItem('primax_idioma','es');localStorage.setItem('fuelflow:operation:v1',JSON.stringify({operationId:'fictitious-print-only',payload:{mode:'PREPAGO'},result:{transaction:t,pointsEarned:0},snapshot:{modalidad:'PREPAGO',placa:t.plate,combustible:{nombre:t.fuel.name,precio:15},tipoComprobante:'BOLETA',dni:t.receiptDni,metodoPago:'PRUEBA_SIN_COBRO',galones:1,total:12}}));window.print=()=>{throw Error('No se permite el diálogo de Chrome')};window.open=()=>{throw Error('No se permite un popup')};},fixture.transaction);
  await page.goto(origin);await page.locator('#btn-voice-toggle').click();await page.locator('#btn-iniciar').click();await page.locator('#pantalla-resumen.active').waitFor();
  await page.screenshot({path:path.join(out,'ticket-before-click.png'),fullPage:true});
  await page.locator('#btn-comprobante').click();
  await page.waitForFunction(()=>document.querySelector('#pantalla-inicio.active')||!document.querySelector('#print-error').classList.contains('hidden'),undefined,{timeout:70000});
  if(await page.locator('#print-error').isVisible())clientError=await page.locator('#print-error').textContent();
  await page.screenshot({path:path.join(out,'ticket-after-click.png'),fullPage:true});
 }catch(e){clientError=clientError||e.message;}finally{if(browser)await browser.close();}
 let final;
 for(let n=0;n<70;n++){
  try{final=await get('/jobs/'+id);}catch(e){final={error:e.message};}
  if(final?.data?.status==='accepted'||final?.data?.status==='retryable'||!physicalPosts)break;
  await new Promise(r=>setTimeout(r,1000));
 }
 const after=queueSnapshot();save('queue-after.json',after);
 const result={timestamp:new Date().toISOString(),id,physicalPostAttempts:physicalPosts,blockedDuplicatePosts:blockedDuplicates,financialPostAttempts:financialPosts,frontend:'Blue Finalizar e imprimir clicked once in an isolated test profile; Backend GET responses fictitious',communicationConfirmed:health.status===200,agentJobExists:final?.status===200,agentStatus:final?.data?.status||'unconfirmed',windowsAccepted:final?.data?.status==='accepted',physicalConfirmedByUser:false,visualConfirmationPending:true,clientError,job:final,queueBefore:before,queueAfter:after,defaultPrinterUnchanged:JSON.stringify(before.defaultPrinter)===JSON.stringify(after.defaultPrinter)};
 save('physical-result.json',result);console.log(JSON.stringify(result,null,2));if(result.agentStatus!=='accepted')process.exitCode=1;
}
main().catch(error=>{save('runner-error.json',{timestamp:new Date().toISOString(),error:error.message,authorizationConsumed:fs.existsSync(markerPath)});console.error(error.message);process.exitCode=1;});
