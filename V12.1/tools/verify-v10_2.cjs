const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.resolve(root,'../V10_2');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/v10_2-baseline.json'),'utf8'));
const changed=[];for(const [name,expected]of Object.entries(manifest)){const file=path.join(source,name);if(!fs.existsSync(file)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)changed.push(name);}
console.log(JSON.stringify({source:'V10_2',checked:Object.keys(manifest).length,changed},null,2));if(changed.length)process.exitCode=1;
