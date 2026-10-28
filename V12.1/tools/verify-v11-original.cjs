const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const source='C:/Users/MATHIAS/Desktop/Universidad/Software/Proyecto/Proyecto/V11';
const baseline=JSON.parse(fs.readFileSync(path.join(root,'docs/v11-original-baseline.json'),'utf8').replace(/^\uFEFF/,''));
const expected=new Map(baseline.map(row=>[row.Path.replaceAll('\\','/'),row.Hash]));
const actual=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile())actual.push(file);}}walk(source);
const changed=[],added=[],missing=[];
for(const file of actual){const rel=path.relative(source,file).replaceAll('\\','/');if(!expected.has(rel)){added.push(rel);continue;}const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();if(hash!==expected.get(rel))changed.push(rel);expected.delete(rel);}
missing.push(...expected.keys());const report={checkedAt:new Date().toISOString(),source,baselineFiles:baseline.length,currentFiles:actual.length,changed,added,missing,intact:!changed.length&&!added.length&&!missing.length};
fs.writeFileSync(path.join(root,'docs/V11-ORIGINAL-INTEGRITY.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.intact)process.exitCode=1;
