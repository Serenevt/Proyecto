// Safe suite: no database migrations, payment providers or printer adapter.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/v11_1_1/http-local');fs.mkdirSync(out,{recursive:true});
const suites=[];
function run(name,args,cwd=root){
 console.log(name+'...');const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:10_000_000});
 fs.writeFileSync(path.join(out,name+'.txt'),(r.stdout||'')+(r.stderr||'')+(r.error?'\n'+r.error.message:''));
 suites.push({name,passed:r.status===0,exitCode:r.status});if(r.status!==0)throw Error(name+' falló. Revisa docs/v11_1_1/http-local/'+name+'.txt');
}
function unit(folder,ext){const cwd=path.join(root,folder);run(folder.toLowerCase()+'-tests',['--test',...fs.readdirSync(path.join(cwd,'tests')).filter(f=>f.endsWith(ext)).map(f=>path.join('tests',f))],cwd);}
try{
 unit('FrontEnd_1','.test.js');unit('FrontEnd_2','.test.js');unit('PrintAgent','.test.mjs');
 run('backend-unit-tests',['node_modules/jest/bin/jest.js','--runInBand','--config','jest.config.cjs'],path.join(root,'Backend'));
 run('backend-lint',['node_modules/eslint/bin/eslint.js','.'],path.join(root,'Backend'));
 run('backend-build',['node_modules/typescript/bin/tsc','-p','tsconfig.build.json'],path.join(root,'Backend'));
 run('frontend1-build',['FrontEnd_1/tools/build.cjs']);run('frontend2-build',['FrontEnd_2/tools/build.cjs']);
 run('thermal-layout',['tools/test-layout-v11_1_1.cjs']);
 run('browser',['FrontEnd_2/node_modules/@playwright/test/cli.js','test','--config','tools/playwright.v11_1_1.cjs']);
 run('source-verification',['tools/verify-source-v11_1_1.cjs']);
 console.log('Validación segura completada. No se enviaron trabajos a la impresora.');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'validation-suite.json'),JSON.stringify({timestamp:new Date().toISOString(),suites},null,2));}
