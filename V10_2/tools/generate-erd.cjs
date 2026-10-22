// Rebuild from the generated Prisma datamodel after `npm run prisma:generate`.
const fs = require('node:fs');
const path = require('node:path');
const { Prisma } = require('../Backend/node_modules/@prisma/client');
const models = Prisma.dmmf.datamodel.models;
const xml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const md = ['# Modelo entidad–relación V10', '', 'Fuente exclusiva: `Backend/prisma/schema.prisma`, mediante Prisma DMMF. Regenerar con `cd Backend && npm run prisma:generate`, luego `node tools/generate-erd.cjs` desde V10. El archivo `database-erd.drawio` es editable en draw.io.', '', 'No existe tabla Admin: la cuenta administrativa es configuración del Backend. La deuda real es `MembershipDebt`; las alertas son `BusinessAlert`. `MembershipNumberCounter` asigna números. `FuelAuthorization` registra reserva y despacho; `Transaction` conserva precio y datos fiscales. `Payment`, `RewardMovement` y `WalletMovement` conservan los libros de pagos, puntos y saldo. `PasswordReset` guarda hashes, intentos y fechas, nunca códigos en claro.', '', 'En el diagrama, `||` significa uno obligatorio, `o|` cero o uno y `o{` cero o muchos. Una FK única limita la relación inversa a cero o uno. Un campo escalar sin `@relation` no se transforma en relación: por ejemplo `WalletMovement.transactionId` y `BusinessAlert.operationId` son referencias de operación, no FK.', '', '```mermaid', 'erDiagram'];
const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
let edge = 0;
for (const [i, model] of models.entries()) {
  const fks = new Set(model.fields.flatMap(f => f.relationFromFields || []));
  const scalars = model.fields.filter(f => f.kind !== 'object');
  md.push(`  ${model.name} {`);
  for (const f of scalars) {
    const key = [f.isId ? 'PK' : '', fks.has(f.name) ? 'FK' : '', f.isUnique ? 'UK' : ''].filter(Boolean).join(',');
    md.push(`    ${f.type}${f.isList ? '[]' : ''} ${f.name}${key ? ' '+key : ''} "${f.isRequired ? 'required' : 'nullable'}"`);
  }
  md.push('  }');
  const label = [model.name, ...scalars.map(f => `${f.name}: ${f.type}${f.isList ? '[]' : ''}${f.isRequired ? '' : '?'}${f.isId ? ' PK' : ''}${fks.has(f.name) ? ' FK' : ''}${f.isUnique ? ' UK' : ''}`)].join('\n');
  cells.push(`<mxCell id="${model.name}" value="${xml(label)}" style="rounded=1;whiteSpace=wrap;html=0;align=left;verticalAlign=top;spacing=10;fillColor=#fff2cc;" vertex="1" parent="1"><mxGeometry x="${(i%4)*430}" y="${Math.floor(i/4)*850}" width="360" height="${40+scalars.length*22}" as="geometry"/></mxCell>`);
  for (const relation of model.fields.filter(f => f.kind === 'object' && f.relationFromFields.length)) {
    const unique = relation.relationFromFields.every(name => model.fields.find(f => f.name === name)?.isUnique || model.fields.find(f => f.name === name)?.isId) || model.uniqueFields.some(fields => fields.join() === relation.relationFromFields.join());
    md.push(`  ${relation.type} ${relation.isRequired ? '||' : '|o'}--${unique ? 'o|' : 'o{'} ${model.name} : "${relation.relationFromFields.join(',')}"`);
    cells.push(`<mxCell id="edge${edge++}" value="${xml(relation.relationFromFields.join(',')+' ('+(relation.isRequired?'1':'0..1')+' : '+(unique?'0..1':'0..N')+')')}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=classic;html=0;" edge="1" parent="1" source="${model.name}" target="${relation.type}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }
}
md.push('```', '', '## Claves, relaciones y campos', '');
for (const model of models) {
  md.push(`### ${model.name}`, '', '| Campo | Tipo | Clave / relación |', '|---|---|---|');
  for (const f of model.fields) {
    md.push(`| ${f.name} | ${f.type}${f.isList ? '[]' : ''}${f.isRequired ? '' : '?'} | ${f.isId?'PK ':''}${f.isUnique?'UNIQUE ':''}${f.kind==='object' && f.relationFromFields.length ? 'FK '+f.relationFromFields.join(', ')+' → '+f.type+'.'+f.relationToFields.join(', ') : f.kind==='object'?'Relación inversa':''} |`);
  }
  for (const fields of model.uniqueFields) md.push('', 'UNIQUE compuesto: `'+fields.join(', ')+'`.');
  md.push('');
}
fs.writeFileSync(path.join(__dirname, '../docs/DATABASE-ERD.md'), md.join('\n')+'\n');
fs.writeFileSync(path.join(__dirname, '../docs/database-erd.drawio'), `<?xml version="1.0" encoding="UTF-8"?><mxfile host="app.diagrams.net"><diagram name="V10 Prisma"><mxGraphModel grid="1" page="0"><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>\n`);
console.log(`Generated ${models.length} entities and ${edge} foreign keys.`);
