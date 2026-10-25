const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {spawnSync}=require('node:child_process');
const ports={kiosk:process.env.PUBLICATION_KIOSK_URL||'http://localhost:25081',prime:process.env.PUBLICATION_PRIME_URL||'http://localhost:25082',api:process.env.PUBLICATION_API_URL||'http://localhost:25000/api/v1'};
const generated=[];
try{
 for(const name of ['v11_4-regression.spec.cjs','v11_4-ticket.spec.cjs']){const output=path.join(__dirname,'_publication-'+name);let s=fs.readFileSync(path.join(__dirname,name),'utf8').replaceAll('http://localhost:24081',ports.kiosk).replaceAll('http://localhost:24082',ports.prime).replaceAll('http://localhost:24000/api/v1',ports.api).replaceAll('evidence-v11_4','publication-evidence');fs.writeFileSync(output,s);generated.push(output)}
 const config=path.join(__dirname,'_publication-config.cjs');fs.writeFileSync(config,"const {defineConfig}=require('../FrontEnd_2/node_modules/@playwright/test');module.exports=defineConfig({testDir:'.',testMatch:'_publication-*.spec.cjs',timeout:60000,workers:1,reporter:[['list'],['json',{outputFile:'../docs/publication-browser-results.json'}]],outputDir:'test-results/publication',use:{browserName:'chromium',channel:'chrome'}});");generated.push(config);
 const result=spawnSync(process.execPath,[path.join(root,'FrontEnd_2/node_modules/@playwright/test/cli.js'),'test','-c',config],{cwd:root,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{for(const p of generated)if(fs.existsSync(p))fs.unlinkSync(p)}
