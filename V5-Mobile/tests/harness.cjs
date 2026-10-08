const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function harness(initial = {}, blocked = false) {
  let now = 0, sequence = 0;
  const timers = new Map();
  const storage = new Map(Object.entries(initial));
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const schedule = (callback, delay, interval) => {
    const id = ++sequence; timers.set(id, { callback, due: now + delay, interval }); return id;
  };
  const context = vm.createContext({
    console, structuredClone, Date: ClockDate, document: { hidden: false },
    setTimeout: (callback, delay) => schedule(callback, delay, 0),
    setInterval: (callback, delay) => schedule(callback, delay, delay),
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    localStorage: { getItem(key) { if (blocked) throw new Error('Denied'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw new Error('Denied'); storage.set(key, value); } },
  });
  const files = ['js/core/config.js','js/core/state.js','js/core/storage.js','js/domain/validation.js','js/domain/totals.js',
    'js/services/transactionService.js','js/services/settingsService.js','js/services/paymentService.js','js/services/fuelService.js','js/services/plateService.js','js/services/assistanceService.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file }));
  function advance(ms) {
    const target = now + ms;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, timer] = next; now = timer.due;
      if (timer.interval) timer.due += timer.interval; else timers.delete(id);
      timer.callback();
    }
    now = target;
  }
  return { F: context.FuelFlow, context, storage, advance, timers };
}
module.exports = { harness };
