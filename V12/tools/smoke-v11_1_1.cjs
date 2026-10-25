const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(10000)});assert(r.ok,url+': HTTP '+r.status);return r;};
 const health=await (await get('http://localhost:26000/api/v1/health')).json();assert.equal(health.database,'up');
 const services=[];
 for(const [port,html,js] of [[26081,'/src/index.html','/src/js/printReceipt.js'],[26082,'/','/js/app.js']]){
  const base='http://localhost:'+port,build=await (await get(base+'/build.json')).json();assert.equal(build.release,'V11_1.1');
  const page=await get(base+html);assert(page.headers.get('cache-control')?.includes('no-store'));assert((await page.text()).includes(build.version));
  const module=await get(base+js);assert(module.headers.get('cache-control')?.includes('no-store'));
  if(port===26081){const source=await module.text();assert(source.includes("PRINT_AGENT_URL='http://127.0.0.1:25443'"));assert(!source.includes('https://localhost:24443/'));assert(!source.includes('https://localhost:25443/'));}
  services.push({port,release:build.release,version:build.version,noStaleHtmlOrJS:true});
 }
 const result={timestamp:new Date().toISOString(),health,services,requests:'GET only',financialTransactions:0,printAgentRequests:0};
 fs.writeFileSync(path.join(root,'docs/v11_1_1/running-services.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
