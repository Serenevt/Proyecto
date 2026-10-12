import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/js/script.js', import.meta.url), 'utf8');

/**
 * El postpago se anunciaba antes como un cobro en una estación de peaje sobre
 * la tarjeta: terminología ajena al dominio y sin respaldo en el backend. Esa
 * referencia no debe volver; el postpago se carga al saldo Primax Prime y el
 * prepago a un medio externo.
 */
test('no quedan referencias a peaje ni toll en el terminal', () => {
  assert.equal(/\bpeaje\b/i.test(script), false);
  assert.equal(/\btoll\b/i.test(script), false);
  assert.equal(/\bPEAJE\b/.test(script), false);
});

test('el mensaje de consumo menciona el saldo Primax Prime', () => {
  assert.match(script, /modal_cobro_m:[^\n]*saldo Primax Prime/);
  // Ya no se afirma que se cobró a una tarjeta.
  assert.equal(/a su tarjeta/i.test(script), false);
  assert.equal(/from your card/i.test(script), false);
});

test('postpago usa SALDO_PRIME y prepago mantiene medios externos', () => {
  assert.match(script, /paymentMethod:state\.modalidad==='POSTPAGO'\?'SALDO_PRIME':state\.metodoPago/);
});

test('el descuento de membresía ya no se aplica en el importe', () => {
  assert.match(script, /const DESCUENTO = 0;/);
  assert.match(script, /aplica_descuento: false/);
});

test('el postpago reserva saldo antes de abastecer', () => {
  assert.match(script, /async function reservarSaldoPostpago\(\)/);
  // La reserva se pide al backend con placa y código de membresía.
  assert.match(script, /authorizationService\.reserve\(\{/);
  assert.match(script, /membershipCode: state\.codigoCliente/);
  // Y su id viaja en la confirmación de la compra.
  assert.match(script, /authorizationId:state\.autorizacionId/);
});

test('el panel de administración no expone credenciales', () => {
  assert.equal(/primax123/.test(script), false);
  assert.match(script, /No gestiona datos reales/);
});

test('las tres variantes de idioma están presentes', () => {
  for (const needle of ['reserva_titulo', 'modal_cobro_m', 'c_cobrado'])
    assert.ok(script.split(needle).length - 1 >= 3, `${needle} falta en alguna variante`);
});
// ---------- Estado de la operación y tope de abastecimiento ----------

test('el tope del abastecimiento se calcula sobre el importe, no sobre galones', () => {
  // El bug original: topeGalones = monto / precio, y al redondear los galones a
  // 2 decimales el total quedaba por encima de lo autorizado (S/ 50.06 por
  // S/ 50.00), y el backend rechazaba la compra.
  assert.match(script, /function topeImporte\(\)/);
  assert.equal(/function objetivoGalones\(\)/.test(script), false);
  // El corte compara el importe contra el tope, nunca los galones.
  assert.match(script, /if \(tope > 0 && state\.total >= tope\)/);
});

test('el frontend reporta el avance y consulta el estado de la reserva', () => {
  assert.match(script, /function reportarAvance\(\)/);
  // El cliente HTTP expone progress y status.
  const client = readFileSync(new URL('../src/js/apiClient.js', import.meta.url), 'utf8');
  assert.match(client, /progress:\(id,amount,gallons\)/);
  assert.match(client, /status:id=>/);
});

test('el flujo de la operación pasa por los cinco estados', () => {
  assert.match(script, /estadoOperacion: 'PENDIENTE'/);
  for (const estado of ['AUTORIZADO', 'ABASTECIENDO', 'FINALIZADO', 'COBRADO'])
    assert.ok(script.includes(`marcarEstadoOperacion('${estado}')`), `falta ${estado}`);
  // Solo el backend confirma el cobro: COBRADO se marca después de que el
  // submit responde, nunca antes.
  assert.match(
    script,
    /backendResult=await transactionsService\.submit\(\);[\s\S]{0,300}marcarEstadoOperacion\('COBRADO'\)/,
  );
});

test('el postpago viaja con authorizationId, membershipCode y outcome', () => {
  assert.match(script, /authorizationId:state\.autorizacionId/);
  assert.match(script, /membershipCode:state\.codigoCliente/);
  assert.match(script, /outcome:state\.motivoFin==='AUTO'\?'AUTO':'MANUAL'/);
});

test('el frontend nunca decide si hay saldo suficiente', () => {
  // La respuesta del backend es la única autoridad; el frontend solo la muestra.
  assert.match(script, /if \(\/saldo insuficiente\/i\.test\(error\.message\)\)/);
  assert.equal(/if \(.*balance\s*[<>]/.test(script), false);
});
