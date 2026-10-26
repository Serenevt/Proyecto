const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source='C:/Users/HP/Desktop/Prueba/V11_1';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/v11_1_1/source-manifest.json'),'utf8').replace(/^\uFEFF/,''));
const changed=[],missing=[];
for(const item of manifest){
 const file=path.join(source,item.Path);if(!fs.existsSync(file)){missing.push(item.Path);continue;}
 const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
 if(hash!==item.SHA256)changed.push(item.Path);
}
const result={timestamp:new Date().toISOString(),source,destination:root,initialCopyFiles:manifest.length,initialCopyVerifiedSHA256:manifest.length,sourceRechecked:manifest.length,changedSourceFiles:changed,missingSourceFiles:missing};
fs.writeFileSync(path.join(root,'docs/v11_1_1/copy-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(changed.length||missing.length)process.exitCode=1;
