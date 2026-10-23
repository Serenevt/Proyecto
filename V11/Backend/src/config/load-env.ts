import { existsSync } from 'node:fs';
// Node 22+: environment supplied by Docker takes precedence over local files.
if (existsSync('.env')) process.loadEnvFile('.env');
