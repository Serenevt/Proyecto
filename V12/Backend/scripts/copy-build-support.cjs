const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.resolve(root, 'dist/scripts');
if (!target.startsWith(root + path.sep)) throw Error('Invalid output path');
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(
  path.join(__dirname, 'database-safety.cjs'),
  path.join(target, 'database-safety.cjs'),
);
