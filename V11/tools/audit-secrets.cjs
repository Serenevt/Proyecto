// Report filenames/line numbers only; never print a credential's value.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const files=[...new Set(execFileSync('git',['ls-files','-co','--exclude-standard','--','V11'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/))];
const findings=[];
for(const file of files){
 if(!file)continue;
 if(/(?:^|\/)(?:\.env(?:\..+)?|local\.properties)$/.test(file)&&!file.endsWith('.env.example'))findings.push(file+': forbidden config');
 if(/\.(?:keystore|jks|p12|pfx|pem)$|\/\.vercel\//i.test(file))findings.push(file+': private artifact');
 const full=path.join(root,file);if(!fs.existsSync(full)||fs.statSync(full).size>2_000_000)continue;
 const text=fs.readFileSync(full,'utf8');
 for(const [i,line] of text.split(/\r?\n/).entries()){
  if(/sk_(?:live|test)_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(line))findings.push(file+':'+(i+1)+': credential pattern');
  if(file.endsWith('.env.example')&&/^(?:SMTP_PASSWORD|JWT_SECRET|KIOSK_API_KEY|CULQI_SECRET_KEY|PAYMENT_WEBHOOK_SECRET)=/.test(line)&&!/=REPLACE_/.test(line))findings.push(file+':'+(i+1)+': non-placeholder example');
 }
}
console.log(JSON.stringify({scope:'V11 tracked and nonignored new files',files:files.length,findings},null,2));
if(findings.length)process.exitCode=1;
