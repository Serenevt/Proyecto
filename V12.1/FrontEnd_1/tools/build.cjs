const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..');const generated=path.join(root,'dist');if(path.dirname(generated)!==root)throw Error('Invalid build directory');fs.rmSync(generated,{recursive:true,force:true});for(const name of ['src','assets'])fs.cpSync(path.join(root,name),path.join(root,'dist',name),{recursive:true});console.log('FuelFlow: static build ready in dist/');
if(process.env.FUELFLOW_DEPLOYMENT==='staging'){
 const code=process.env.FUELFLOW_STATION_CODE;
 if(!/^[A-Z0-9-]{4,30}$/.test(code||''))throw Error('Invalid FUELFLOW_STATION_CODE');
 fs.writeFileSync(path.join(generated,'src/js/deployment.js'),
  `export const FUELFLOW_DEPLOYMENT = 'staging';\nexport const FUELFLOW_STATION_CODE = ${JSON.stringify(code)};\n`);
}else if(process.env.FUELFLOW_DEPLOYMENT&&process.env.FUELFLOW_DEPLOYMENT!=='local'){
 throw Error('Invalid FUELFLOW_DEPLOYMENT');
}

// Content version covers every module, including transitive imports.
const crypto=require('node:crypto');
const files=[];
function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isDirectory())scan(p);else if(/\.(js|css|html)$/.test(e.name))files.push(p)}}
scan(path.join(root,'dist'));
const hash=crypto.createHash('sha256');for(const file of files)hash.update(path.relative(path.join(root,'dist'),file).split(path.sep).join('/')).update(fs.readFileSync(file));
const version='V11_1.1-'+hash.digest('hex').slice(0,12);
for(const file of files){let s=fs.readFileSync(file,'utf8');
 if(file.endsWith('.js'))s=s.replace(/((?:from\s*|import\s*\(\s*)['"])(\.{1,2}\/[^'"]+?\.js)(?:\?[^'"]*)?(['"])/g,(_,a,b,c)=>a+b+'?v='+version+c);
 if(file.endsWith('.html'))s=s.replace(/((?:src|href)=["'])([^"']+?\.(?:js|css))(?:\?[^"']*)?(["'])/g,(_,a,b,c)=>a+b+'?v='+version+c).replace('</head>','<meta name="app-version" content="'+version+'"></head>');
 fs.writeFileSync(file,s);
}
fs.writeFileSync(path.join(path.join(root,'dist'),'build.json'),JSON.stringify({release:'V11_1.1',version},null,2));
console.log(version);
