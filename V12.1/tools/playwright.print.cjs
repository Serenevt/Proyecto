require('./local-targets.cjs').assertLocalTargets();
const {defineConfig}=require('../FrontEnd_2/node_modules/@playwright/test');
module.exports=defineConfig({testDir:'.',testMatch:'print-agent.spec.cjs',workers:1,timeout:20000,reporter:'list',outputDir:'test-results/print-agent',globalSetup:require.resolve('./print-test-setup.cjs'),use:{browserName:'chromium',channel:'chrome'}});
