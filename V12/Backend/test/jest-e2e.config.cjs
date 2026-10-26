module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  setupFiles: ['<rootDir>/test/local-database.setup.cjs'],
  testMatch: ['**/test/**/*.e2e-spec.ts'],
  testTimeout: 30000,
  maxWorkers: 1,
};
