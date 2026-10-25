module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  testMatch: ['**/test/**/*.e2e-spec.ts'],
  testTimeout: 30000,
  maxWorkers: 1,
};
