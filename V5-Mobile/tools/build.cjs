const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'www');
fs.mkdirSync(output, { recursive: true });
// Explicit allow-list: no tooling, documentation or dependencies in the WebView assets.
for (const name of fs.readdirSync(root)) {
  if (/\.(?:html|css|js|jpe?g)$/.test(name)) fs.copyFileSync(path.join(root, name), path.join(output, name));
}
fs.cpSync(path.join(root, 'js'), path.join(output, 'js'), { recursive: true });
console.log('Static assets ready in V5-Mobile/www. Capacitor has not been initialized.');
