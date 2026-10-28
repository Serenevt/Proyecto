const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
for (const file of fs.readdirSync(path.join(root, 'js')).filter((name) => name.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', path.join(root, 'js', file)]);
}
if (path.dirname(output) !== root) throw new Error('Invalid build directory');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of ['index.html', 'styles', 'js', 'assets']) fs.cpSync(path.join(root, file), path.join(output, file), { recursive: true });
const api = process.env.PRIMAX_CONTROL_API_URL || '/api/v1';
if (process.env.NODE_ENV === 'production' && !api.startsWith('https://')) throw new Error('Primax Control production API must use HTTPS');
fs.writeFileSync(path.join(output, 'js/config.js'), `export const API_BASE_URL = ${JSON.stringify(api.replace(/\/$/, ''))};\n`);
const hash = crypto.createHash('sha256');
function scan(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) { const file=path.join(dir,item.name); if(item.isDirectory()) scan(file); else if(/\.(js|css|html)$/.test(file)) hash.update(path.relative(output,file)).update(fs.readFileSync(file)); } }
scan(output);
const version = `CONTROL-${hash.digest('hex').slice(0,12)}`;
fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify({ app: 'Primax Control', version }, null, 2));
console.log(`Primax Control build listo: ${version}`);
