require('./local-targets.cjs').assertLocalTargets();
const {defineConfig}=require('../FrontEnd_2/node_modules/@playwright/test');
module.exports=defineConfig({testDir:'.',testMatch:['v11_1_1-print.spec.cjs','v11_1_1-http.spec.cjs'],workers:1,timeout:60000,reporter:[['list'],['json',{outputFile:'../docs/v11_1_1/http-local/browser-results.json'}]],outputDir:'test-results/v11_1_1-http',globalSetup:require.resolve('./v11_1_1-print-setup.cjs'),use:{browserName:'chromium',channel:'chrome',launchOptions:{args:['--enable-automation']},screenshot:'only-on-failure'}});
