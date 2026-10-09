const {defineConfig}=require('../FrontEnd_2/node_modules/@playwright/test');
module.exports=defineConfig({testDir:'.',testMatch:'integration.spec.cjs',timeout:90000,workers:1,reporter:'list',outputDir:'test-results',use:{browserName:'chromium',channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',screenshot:'only-on-failure'},
webServer:process.env.V6_DOCKER_TEST?undefined:[
{command:'node tools/serve.cjs',cwd:require('node:path').resolve(__dirname,'..'),env:{FRONTEND:'1',FRONTEND_PORT:'5181'},url:'http://127.0.0.1:5181/healthz',reuseExistingServer:true},
{command:'node tools/serve.cjs',cwd:require('node:path').resolve(__dirname,'..'),env:{FRONTEND:'2',FRONTEND_PORT:'5180'},url:'http://127.0.0.1:5180/healthz',reuseExistingServer:true}]});
