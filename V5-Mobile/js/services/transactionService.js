(function (F) {
  'use strict';
  const KEY = 'fuelflow_v5_transactions_v1';
  let records;
  const valid = tx => tx && typeof tx === 'object' && typeof tx.placa === 'string'
    && typeof tx.combustible === 'string' && Number.isFinite(tx.monto) && tx.monto >= 0
    && ['Pagado', 'Pendiente'].includes(tx.estado);
  function normalize(tx, index, demo = false) {
    return { ...tx, id: tx.id || (demo ? `demo-${index}` : F.newId()), demo: tx.demo ?? demo,
      createdAt: tx.createdAt || null, litros: tx.litros ?? null, cliente: tx.cliente ?? null };
  }
  function load() {
    if (records) return records;
    const saved = F.storage.read(KEY);
    if (saved?.version === 1 && Array.isArray(saved.records) && saved.records.every(valid)) {
      records = saved.records.map((tx, i) => normalize(tx, i));
    } else {
      if (saved !== null) F.storage.write('fuelflow_v5_transactions_recovery_v1', saved);
      const legacy = F.storage.read('primax_transacciones');
      records = Array.isArray(legacy) && legacy.every(valid)
        ? legacy.map((tx, i) => normalize(tx, i, F.config.TRANSACCIONES_EJEMPLO.some(example =>
          ['hora', 'placa', 'combustible', 'monto', 'estado'].every(key => example[key] === tx[key]))))
        : F.config.TRANSACCIONES_EJEMPLO.map((tx, i) => normalize(tx, i, true));
      persist();
    }
    return records;
  }
  function persist() { return F.storage.write(KEY, { version: 1, records }); }
  F.transactionService = {
    async list() { return structuredClone(load()); },
    async get(id) { return structuredClone(load().find(tx => tx.id === id) || null); },
    async save(tx) {
      if (!valid(tx) || !tx.id) throw new Error('INVALID_TRANSACTION');
      const list = load();
      const existing = list.find(record => record.id === tx.id);
      if (existing) return { transaction: structuredClone(existing), persisted: persist() };
      const record = normalize({ ...tx, createdAt: tx.createdAt || new Date().toISOString(), demo: false }, 0);
      list.unshift(record);
      return { transaction: structuredClone(record), persisted: persist() };
    },
    async updatePayment(id, payment) {
      const tx = load().find(record => record.id === id);
      if (!tx) throw new Error('TRANSACTION_NOT_FOUND');
      if (payment.estado !== 'Pagado') throw new Error('INVALID_PAYMENT');
      tx.estado = payment.estado;
      tx.pago = structuredClone(payment);
      return { transaction: structuredClone(tx), persisted: persist() };
    },
  };
})(globalThis.FuelFlow);
