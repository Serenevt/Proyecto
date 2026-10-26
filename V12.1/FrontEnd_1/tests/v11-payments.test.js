import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/js/script.js',import.meta.url),'utf8');
test('no decorative QR generator or local wallet approval',()=>{assert.ok(!source.includes('function pintarQR'));const handler=source.slice(source.indexOf('async function confirmarPagoQR'),source.indexOf('// ---------- Tarjeta:'));assert.match(handler,/online-orders/);assert.match(handler,/status==='CAPTURED'/);});
test('QR is selected only for Yape and Plin; NFC and cash remain separate',()=>{const block=source.slice(source.indexOf('function elegirMetodoPago'),source.indexOf('function volverAMetodos'));assert.match(block,/metodo === 'YAPE' \|\| metodo === 'PLIN'/);assert.match(block,/panel-nfc/);assert.match(block,/panel-efectivo/);assert.equal((block.match(/crearOrdenQR/g)||[]).length,1);});
