const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');const generated=path.join(root,'www');if(path.dirname(generated)!==root)throw Error('Invalid build directory');fs.rmSync(generated,{recursive:true,force:true});const output=path.join(root,'www');fs.mkdirSync(output,{recursive:true});for(const name of ['index.html','styles','js','assets'])fs.cpSync(path.join(root,name),path.join(output,name),{recursive:true});
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

// Content version covers every module, including transitive imports.
const crypto=require('node:crypto');
const files=[];
function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isDirectory())scan(p);else if(/\.(js|css|html)$/.test(e.name))files.push(p)}}
scan(output);
const hash=crypto.createHash('sha256');for(const file of files)hash.update(path.relative(output,file).split(path.sep).join('/')).update(fs.readFileSync(file));
const version='V11_4-'+hash.digest('hex').slice(0,12);
for(const file of files){let s=fs.readFileSync(file,'utf8');
 if(file.endsWith('.js'))s=s.replace(/((?:from\s*|import\s*\(\s*)['"])(\.{1,2}\/[^'"]+?\.js)(?:\?[^'"]*)?(['"])/g,(_,a,b,c)=>a+b+'?v='+version+c);
 if(file.endsWith('.html'))s=s.replace(/((?:src|href)=["'])([^"']+?\.(?:js|css))(?:\?[^"']*)?(["'])/g,(_,a,b,c)=>a+b+'?v='+version+c).replace('</head>','<meta name="app-version" content="'+version+'"></head>');
 fs.writeFileSync(file,s);
}
fs.writeFileSync(path.join(output,'build.json'),JSON.stringify({release:'V11_4',version},null,2));
console.log(version);
