import { read, write, initialState, localData, saveLocal } from './store.js';
import { session } from './session.js';
import { membershipService } from './membershipService.js';
import { transactionsService } from './transactionsService.js';
import { rewardsService } from './rewardsService.js';
import { benefitsApi } from './benefitsService.js';
let loading;
export function resetData() { write(initialState()); }
export function refreshData() {
  if (loading) return loading;
  const token = session()?.token;
  loading = Promise.all([membershipService.get(), transactionsService.list(), rewardsService.list(), benefitsApi.list(), rewardsService.redemptions()]).then(([m, txs, rewards, benefits, redemptions]) => {
    if (!token || session()?.token !== token) return false;
    const local = localData(), previous = JSON.stringify(read());
    write({ member: { ...m, name: m.user.name, balance: local.balance || 0, alias: local.alias || '' }, vehicles: m.vehicles,
      selectedVehicle: m.vehicles.some(v => v.plate === local.selectedVehicle) ? local.selectedVehicle : m.vehicles[0]?.plate || '',
      settings: { notifications: local.notifications ?? true }, rewards,
      transactions: [...txs.map(t => ({ id: t.id, operationId: t.operationId, type: 'consumo', amount: Number(t.amount), points: t.pointsEarned, date: t.createdAt, station: t.station.name, vehicle: t.vehicle.plate, status: t.status })), ...(local.recharges || [])].sort((a,b) => b.date.localeCompare(a.date)),
      benefits: benefits.map(b => ({ ...b, cost: b.pointsCost, theme: ['fuel','coffee','wash'].includes(b.code) ? b.code : 'fuel', symbol: b.code === 'coffee' ? '☕' : '✦', tag: b.pointsCost + ' puntos' })),
      redemptions: redemptions.map(r => ({ ...r, title: r.benefit.title })),
    });
    return previous !== JSON.stringify(read());
  }).finally(() => { loading = null; });
  return loading;
}
export const memberService = { get: () => ({ ...read().member }), progress: () => Math.min(100, read().member.points / 5000 * 100), setName(name) {
  name = String(name).trim(); if (!name || name.length > 80) throw Error('Ingresa un nombre de 1 a 80 caracteres.');
  saveLocal({ alias: name }); read().member.alias = name;
} };
export const vehicleService = { list: () => read().vehicles, selected: () => read().selectedVehicle, select(plate) {
  if (!read().vehicles.some(v => v.plate === plate)) throw Error('Vehículo no válido.');
  saveLocal({ selectedVehicle: plate }); read().selectedVehicle = plate;
} };
export const transactionService = { list: () => read().transactions, totals: () => read().transactions.reduce((a,t) => { a[t.type === 'recarga' ? 'recharges' : 'consumption'] += t.amount; return a; }, { recharges: 0, consumption: 0 }), recharge(amount) {
  amount = Number(amount); if (!Number.isFinite(amount) || amount < 10 || amount > 2000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) throw Error('Ingresa un monto entre S/ 10 y S/ 2,000, con hasta dos decimales.');
  const tx = { id: crypto.randomUUID(), type: 'recarga', amount, points: 0, date: new Date().toISOString(), station: 'Recarga de saldo · Demo local', vehicle: read().selectedVehicle };
  read().member.balance = Math.round((read().member.balance + amount) * 100) / 100; read().transactions.unshift(tx);
  saveLocal({ balance: read().member.balance, recharges: read().transactions.filter(t => t.type === 'recarga') });
} };
export const benefitsService = { list: () => read().benefits, redemptions: () => read().redemptions, async redeem(id) {
  const result = await rewardsService.redeem(id);
  try { await refreshData(); return result.redemption; }
  catch { return { ...result.redemption, refreshPending: true }; }
} };
export const pointsService = { list: () => read().rewards };
export const settingsService = { get: () => read().settings, notifications(value) { saveLocal({ notifications: Boolean(value) }); read().settings.notifications = Boolean(value); } };
