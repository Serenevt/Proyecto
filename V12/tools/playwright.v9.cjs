require('./local-targets.cjs').assertLocalTargets();
const { defineConfig } = require('../FrontEnd_2/node_modules/@playwright/test');
module.exports = defineConfig({ testDir: '.', testMatch: ['v9-*.spec.cjs', 'v10-*.spec.cjs'], timeout: 90000, workers: 1, reporter: 'list', outputDir: 'test-results/v9', use: { browserName: 'chromium', channel: 'chrome', screenshot: 'only-on-failure' } });
