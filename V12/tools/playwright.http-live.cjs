require('./local-targets.cjs').assertLocalTargets();
const {defineConfig}=require('../FrontEnd_2/node_modules/@playwright/test');
process.env.HTTP_LIVE_KIOSK_URL ||= 'http://localhost:26081';
module.exports=defineConfig({testDir:'.',testMatch:'v11_1_1-http.spec.cjs',workers:1,timeout:60000,reporter:[['list'],['json',{outputFile:'../docs/v11_1_1/http-local/browser-live-results.json'}]],outputDir:'test-results/http-live',projects:[{name:'chrome',use:{channel:'chrome'}},{name:'edge',use:{channel:'msedge'}}],use:{browserName:'chromium',launchOptions:{args:['--enable-automation']},screenshot:'only-on-failure'}});
