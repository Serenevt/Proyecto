// Optional development validator; dependency is not part of the application.
// npm install --prefix tools/.erd-validation --no-save --package-lock=false --ignore-scripts mermaid
import fs from 'node:fs';
import mermaid from './.erd-validation/node_modules/mermaid/dist/mermaid.esm.mjs';
const doc = fs.readFileSync(new URL('../docs/DATABASE-ERD.md', import.meta.url), 'utf8');
const diagram = doc.slice(doc.indexOf('erDiagram'), doc.indexOf('```', doc.indexOf('erDiagram')));
await mermaid.parse(diagram);
console.log('Mermaid ER syntax valid');
