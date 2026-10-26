const path = require('node:path');
const fs = require('node:fs');
const file = path.resolve(__dirname, '../.env');
if (fs.existsSync(file)) process.loadEnvFile(file);
process.env.KIOSK_API_KEY ||= process.env.KIOSK_SECRET || 'LOCAL_DEMO_V10_KIOSK_CHANGE_ME_32_CHARS';
process.env.FRONTEND1_PORT ||= '22081';
process.env.FRONTEND2_PORT ||= '22082';
process.env.DEMO_PASSWORD ||= 'Prime123';

process.env.PORT ||= '22000';
process.env.MAILPIT_PORT ||= '22025';
