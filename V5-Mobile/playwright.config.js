const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: 'mobile.spec.js', timeout: 45000,
  expect: { timeout: 7000 }, fullyParallel: true, workers: 2,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: '360x800', use: { viewport: { width: 360, height: 800 } } },
    { name: '390x844', use: { viewport: { width: 390, height: 844 } } },
    { name: '412x915', use: { viewport: { width: 412, height: 915 } } },
  ],
  webServer: { command: 'node tools/serve.cjs', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
