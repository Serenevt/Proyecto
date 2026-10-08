(function (F) {
  'use strict';
  const memory = new Map();
  const failures = new Set();
  F.storage = {
    get failures() { return [...failures]; },
    read(key) {
      if (memory.has(key)) return structuredClone(memory.get(key));
      try {
        const raw = globalThis.localStorage.getItem(key);
        if (raw === null) return null;
        const value = JSON.parse(raw);
        memory.set(key, value);
        return structuredClone(value);
      } catch { failures.add('STORAGE_READ'); return null; }
    },
    write(key, value) {
      memory.set(key, structuredClone(value));
      try { globalThis.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { failures.add('STORAGE_WRITE'); return false; }
    },
    legacyLanguage() {
      try { return globalThis.localStorage.getItem('primax_idioma'); }
      catch { failures.add('STORAGE_READ'); return null; }
    },
  };
})(globalThis.FuelFlow);
