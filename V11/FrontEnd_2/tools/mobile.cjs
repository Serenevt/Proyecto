const path=require('node:path');const {spawn}=require('node:child_process');let cli;try{cli=require.resolve('@playwright/test/cli');}catch{cli=require.resolve('../../V5-Mobile/node_modules/@playwright/test/cli');}
const cwd=path.resolve(__dirname,'..');
const server=spawn(process.execPath,['tools/serve.cjs'],{cwd,env:{...process.env,SERVE_BUILD:'1'},stdio:['ignore','pipe','inherit']});
let runner;
server.stdout.once('data',()=>{runner=spawn(process.execPath,[cli,'test'],{cwd,env:{...process.env,PRIME_EXTERNAL_SERVER:'1'},stdio:'inherit'});runner.on('exit',code=>{server.kill();process.exitCode=code??1;});runner.on('error',error=>{console.error(error);server.kill();process.exitCode=1;});});
server.on('error',error=>{console.error(error);process.exitCode=1;});
server.on('exit',()=>{if(!runner)process.exitCode=1;});
process.on('SIGINT',()=>{runner?.kill();server.kill();});
