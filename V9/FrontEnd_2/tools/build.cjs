const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');const output=path.join(root,'www');fs.mkdirSync(output,{recursive:true});for(const name of ['index.html','styles','js','assets'])fs.cpSync(path.join(root,name),path.join(output,name),{recursive:true});
const apiBase=process.env.PRIME_API_BASE_URL||'/api/v1';if(apiBase!=='/api/v1'&&!/^https?:\/\//.test(apiBase))throw Error('Invalid PRIME_API_BASE_URL');
// Las credenciales de la cuenta de demostración solo se incrustan cuando el
// despliegue es explícitamente local. FUELFLOW_DEMO=1 las habilita; cualquier
// otro valor las omite y la pantalla de acceso no las muestra.
const demoEnabled=process.env.FUELFLOW_DEMO==='1';
fs.writeFileSync(path.join(output,'js/config.js'),
'const __FUELFLOW_DEMO__ = '+demoEnabled+';\n'+
'const DEMO_ENABLED = typeof __FUELFLOW_DEMO__ !== "undefined" && __FUELFLOW_DEMO__ === true;\n'+
'export const API_BASE_URL = '+JSON.stringify(apiBase.replace(/\/$/,''))+';\n'+
'export const DEMO_CREDENTIALS = DEMO_ENABLED ? { email: "demo@primaxprime.pe", password: "Prime123" } : null;\n'+
'export const DEMO_PASSWORD = DEMO_CREDENTIALS ? DEMO_CREDENTIALS.password : "";\n');
console.log('Primax Prime: build listo en www/'+(demoEnabled?' (demo local: credenciales visibles)':' (sin credenciales demo)'));