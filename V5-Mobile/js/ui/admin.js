(function (F) {
'use strict';
const { state, $ } = F;
const { LOCALE_IDIOMA, ALERTAS_EJEMPLO } = F.config;
const hablar = (...args) => F.hablar(...args);
const t = (...args) => F.t(...args);
const mostrarPantalla = (...args) => F.mostrarPantalla(...args);

function abrirAdmin() {
  if (!mostrarPantalla('pantalla-admin')) return;
  $('admin-login').classList.toggle('hidden', state.adminAutenticado);
  $('admin-dash').classList.toggle('hidden', !state.adminAutenticado);
  if (state.adminAutenticado) refrescarAdmin();
}

function loginAdmin() {
  const u = $('admin-user').value.trim();
  const p = $('admin-pass').value;
  const err = $('admin-error');
  if (u === 'admin' && p === 'primax123') {
    err.classList.add('hidden');
    state.adminAutenticado = true;
    $('admin-login').classList.add('hidden');
    $('admin-dash').classList.remove('hidden');
    refrescarAdmin();
    hablar(t('voz_admin'));
  } else {
    err.textContent = t('err_admin');
    err.classList.remove('hidden');
  }
}

async function refrescarAdmin() {
  const txs = await F.transactionService.list();
  const actual = txs.filter(tx => !tx.demo);
  const loc = LOCALE_IDIOMA[state.idioma];
  $('m-ventas').textContent = 'S/ ' + (15420 + actual.reduce((sum, tx) => sum + tx.monto, 0)).toLocaleString(loc, { minimumFractionDigits: 2 });
  $('m-trans').textContent = 47 + actual.length;
  $('m-litros').textContent = F.round(892 + actual.reduce((sum, tx) => sum + (tx.litros || 0), 0)) + ' L';
  const tbody = document.querySelector('#tabla-trans tbody');
  tbody.replaceChildren();
  txs.slice(0, 12).forEach(tx => {
    const tr = document.createElement('tr');
    const columns = [[tx.hora || '—','th_hora'], [tx.placa,'th_placa'], [tx.combustible,'th_fuel'], ['S/ '+tx.monto.toFixed(2),'th_monto'],
      [t(tx.estado === 'Pagado' ? 'badge_pagado' : 'badge_pendiente'),'th_estado']];
    columns.forEach(([value, label], index) => {
      const td = document.createElement('td'); td.dataset.label = t(label);
      if (index === 4) { const badge = document.createElement('span'); badge.className = 'badge ' + (tx.estado === 'Pagado' ? 'ok' : 'warn'); badge.textContent = value; td.appendChild(badge); }
      else td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  $('lista-alertas').replaceChildren();
  ALERTAS_EJEMPLO.forEach(key => { const li = document.createElement('li'); li.textContent = t(key); $('lista-alertas').appendChild(li); });
  if (F.storage.failures.length) F.storageNotice();
}

Object.assign(F, { abrirAdmin, loginAdmin, refrescarAdmin });
})(globalThis.FuelFlow);
