// Packaging entrypoint: never run the unchanged seed outside the local DEMO.
const {spawnSync}=require('node:child_process');
const enabled=process.env.APP_MODE==='local'&&process.env.PAYMENT_ENV==='demo'&&process.env.DEMO_WALLET_ENABLED==='true';
if(!enabled){console.log('DEMO seed skipped: requires APP_MODE=local, PAYMENT_ENV=demo, DEMO_WALLET_ENABLED=true.');process.exit(0)}
if(process.env.RESYNC_DEMO_PASSWORD==='1')throw Error('Automatic publication startup never resynchronizes passwords.');
require('./database-safety.cjs').assertLocalDatabase();
const result=spawnSync(process.execPath,['dist/prisma/seed.js'],{stdio:'inherit',env:process.env});
if(result.error)throw result.error;
process.exitCode=result.status??1;
