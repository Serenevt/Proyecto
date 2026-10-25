const {spawnSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const result=spawnSync(process.execPath,[path.join(root,'FrontEnd_2/node_modules/@playwright/test/cli.js'),'test','--config',path.join(__dirname,'playwright.integration.cjs')],{cwd:root,stdio:'inherit',env:{...process.env,...(process.argv.includes('--docker')?{V6_DOCKER_TEST:'1'}:{})}});
process.exitCode=result.status??1;
