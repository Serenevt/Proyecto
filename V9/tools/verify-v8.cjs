const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../V8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'v8-sha256.json'), 'utf8').replace(/^\uFEFF/, ''));
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file); else files.push(path.relative(root, file));
  }
}
walk(root);
const changed = manifest.filter(item => {
  const file = path.join(root, item.path);
  return !fs.existsSync(file) || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase() !== item.sha256;
});
if (changed.length || files.length !== manifest.length) throw Error('V8 differs from baseline: ' + JSON.stringify(changed));
console.log(`V8 intact: ${files.length} files, SHA-256 verified.`);
