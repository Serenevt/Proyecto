import test from 'node:test';
import assert from 'node:assert/strict';
import { insufficientBalance } from '../src/js/plateCamera.js';

class FakeDialog {
  constructor() {
    this.nodes = new Map();
    this.listeners = {};
    this.innerHTML = '';
    this.buttons = [];
  }
  set innerHTML(value) {
    this.html = value;
    this.buttons = [...value.matchAll(/data-action="([^"]+)"/g)].map((match) => ({
      dataset: { action: match[1] }, disabled: false,
    }));
    for (const key of ['message', 'available', 'amount', 'pending']) this.nodes.set(key, { textContent: '' });
  }
  get innerHTML() { return this.html; }
  querySelectorAll(selector) { return selector === 'button' ? this.buttons : []; }
  querySelector(selector) { return this.nodes.get(selector.match(/data-(\w+)/)?.[1]); }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  showModal() {}
  remove() {}
}

async function openModal(details, handlers) {
  const previousDocument = globalThis.document;
  const dialog = new FakeDialog();
  globalThis.document = { createElement: () => dialog, body: { append() {} } };
  try {
    const result = insufficientBalance(details, handlers);
    return { dialog, result, restore: () => { globalThis.document = previousDocument; } };
  } catch (error) {
    globalThis.document = previousDocument;
    throw error;
  }
}

const details = { code: 'INSUFFICIENT_BALANCE', available: '30.00', amount: '50.00', amountPending: '20.00' };

test('el modal ofrece recargar o cambiar a prepago y nunca sugiere crear deuda', async () => {
  const modal = await openModal(details, { onRefresh: async () => {}, onSwitchToPrepaid() {} });
  try {
    assert.deepEqual(modal.dialog.buttons.map(button => button.dataset.action), ['refresh', 'prepaid', 'cancel']);
    assert.doesNotMatch(modal.dialog.html, /debt|saldo pendiente/i);
    await modal.dialog.onclick({ target: { closest: () => modal.dialog.buttons[1] } });
    assert.equal(await modal.result, 'prepaid');
  } finally { modal.restore(); }
});

test('Ya recargué habilita despacho solo si la reserva backend termina bien', async () => {
  let calls = 0;
  const modal = await openModal(details, { onRefresh: async () => { calls++; } });
  try {
    await modal.dialog.onclick({ target: { closest: () => modal.dialog.buttons[0] } });
    assert.equal(await modal.result, 'authorized');
    assert.equal(calls, 1);
  } finally { modal.restore(); }
});

test('si sigue insuficiente el modal actualiza el saldo del backend y mantiene ambas opciones', async () => {
  let calls = 0;
  const modal = await openModal(details, { onRefresh: async () => {
    calls++;
    throw Object.assign(Error('Saldo insuficiente'), { details: { ...details, available: '35.00', amountPending: '15.00' } });
  } });
  try {
    await modal.dialog.onclick({ target: { closest: () => modal.dialog.buttons[0] } });
    assert.equal(calls, 1);
    assert.equal(modal.dialog.querySelector('[data-available]').textContent, 'S/ 35.00');
    assert.equal(modal.dialog.buttons[0].disabled, false);
    await modal.dialog.onclick({ target: { closest: () => modal.dialog.buttons[1] } });
    assert.equal(await modal.result, 'prepaid');
  } finally { modal.restore(); }
});

test('doble click de Ya recargué no envía autorizaciones duplicadas', async () => {
  let calls = 0, finish;
  const modal = await openModal(details, { onRefresh: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  try {
    const button = modal.dialog.buttons[0];
    const first = modal.dialog.onclick({ target: { closest: () => button } });
    const second = modal.dialog.onclick({ target: { closest: () => button } });
    assert.equal(calls, 1);
    finish();
    await Promise.all([first, second]);
    assert.equal(await modal.result, 'authorized');
  } finally { modal.restore(); }
});
