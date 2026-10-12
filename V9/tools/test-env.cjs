const path = require('node:path');
process.loadEnvFile(path.resolve(__dirname, '../.env'));
process.env.KIOSK_API_KEY = process.env.KIOSK_SECRET || process.env.KIOSK_API_KEY;
process.env.DATABASE_URL = `postgresql://${encodeURIComponent(process.env.POSTGRES_USER || 'primax')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@localhost:${process.env.POSTGRES_PORT || 5433}/${process.env.POSTGRES_DB || 'primax_v9'}?schema=public`;
