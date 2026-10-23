const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');const output=path.join(root,'www');fs.mkdirSync(output,{recursive:true});for(const name of ['index.html','styles','js','assets'])fs.cpSync(path.join(root,name),path.join(output,name),{recursive:true});
const apiBase=require('./api-url.cjs').validateApiUrl(process.env.PRIME_API_BASE_URL||'/api/v1');
// User accounts are never advertised with credentials in web or Android builds.
const demoEnabled=false;
fs.writeFileSync(path.join(output,'js/config.js'),
'const __FUELFLOW_DEMO__ = '+demoEnabled+';\n'+
'const DEMO_ENABLED = typeof __FUELFLOW_DEMO__ !== "undefined" && __FUELFLOW_DEMO__ === true;\n'+
'export const API_BASE_URL = '+JSON.stringify(apiBase.replace(/\/$/,''))+';\n'+
'export const DEMO_CREDENTIALS = null;\n'+
'export const DEMO_PASSWORD = DEMO_CREDENTIALS ? DEMO_CREDENTIALS.password : "";\n');
console.log('Primax Prime: build listo en www/'+(demoEnabled?' (demo local: credenciales visibles)':' (sin credenciales demo)'));
