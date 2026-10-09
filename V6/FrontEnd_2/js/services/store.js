// API data is kept in memory; only local demo features and preferences are persisted.
import { session } from './session.js';
export const initialState = () => ({ member: { name: '', number: '', points: 0, balance: 0 }, vehicles: [], selectedVehicle: '', settings: { notifications: true }, transactions: [], rewards: [], benefits: [], redemptions: [] });
let memory = initialState();
export function read() { return memory; }
export function write(data) { memory = data; return data; }
export function update(fn) { fn(memory); return memory; }
const key = () => 'prime:local:' + (session()?.user.id || 'anonymous');
export function localData() {
  try { return JSON.parse(globalThis.localStorage?.getItem(key()) || 'null') || {}; } catch { return {}; }
}
export function saveLocal(patch) {
  const value = { ...localData(), ...patch };
  globalThis.localStorage?.setItem(key(), JSON.stringify(value)); return value;
}
