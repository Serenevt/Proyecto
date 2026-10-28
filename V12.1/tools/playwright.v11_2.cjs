require('./local-targets.cjs').assertLocalTargets();
const {defineConfig}=require('../FrontEnd_2/node_modules/@playwright/test');
module.exports=defineConfig({testDir:'.',testMatch:'v11_2.spec.cjs',timeout:60000,workers:1,reporter:[['list'],['json',{outputFile:'../docs/browser-v11_2-results.json'}]],outputDir:'test-results/v11_2',use:{browserName:'chromium',channel:'chrome',screenshot:'only-on-failure'}});
