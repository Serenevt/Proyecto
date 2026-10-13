import { read, write, initialState, localData, saveLocal } from './store.js';
import { session } from './session.js';
import { membershipService } from './membershipService.js';
import { transactionsService } from './transactionsService.js';
import { rewardsService } from './rewardsService.js';
import { benefitsApi } from './benefitsService.js';
import { walletService } from './walletService.js';
let loading;
export function resetData() { write(initialState()); }
export function refreshData() {
  if (loading) return loading;
  const token = session()?.token;
  loading = Promise.all([membershipService.get(), transactionsService.list(), rewardsService.list(), benefitsApi.list(), rewardsService.redemptions(), walletService.read()]).then(([m, txs, rewards, benefits, redemptions, wallet]) => {
    if (!token || session()?.token !== token) return false;
    const local = localData(), previous = JSON.stringify(read());
    // El saldo y sus movimientos vienen de PostgreSQL. Las preferencias del
    // dispositivo (alias, notificaciones) siguen siendo locales.
    // El backend separa saldo disponible, saldo retenido por reservas abiertas y
    // saldo total. Los tres vienen de PostgreSQL; ninguno se calcula aquí.
    const balance = Number(wallet.balance);
    const reserved = Number(wallet.reserved);
    const available = Number(wallet.available);
    const total = Number(wallet.total);
    const membershipNumber = m.number;
    const movements = wallet.movements.filter(m => m.kind === 'RECHARGE').map((m) => ({
      id: m.id,
      operationId: m.authorizationId || m.id,
      type: m.kind === 'RECHARGE' ? 'recarga' : 'consumo',
      amount: Number(m.kind === 'RECHARGE' ? m.amount : -m.amount),
      points: 0,
      date: m.createdAt,
      station: m.kind === 'RECHARGE' ? 'Recarga de saldo' : 'Consumo postpago',
      vehicle: 'Membres\u00eda ' + membershipNumber,
      status: 'REGISTRADO',
      real: true,
    }));
    write({ member: { ...m, name: m.user.name, balance, reserved, available, total, pendingBalance: Number(m.pendingBalance || 0), alias: local.alias || '' }, vehicles: m.vehicles,
      selectedVehicle: m.vehicles.some(v => v.plate === local.selectedVehicle) ? local.selectedVehicle : m.vehicles[0]?.plate || '',
      settings: { notifications: local.notifications ?? true }, rewards,
      transactions: [...txs.map(t => ({ id: t.id, operationId: t.operationId, type: 'consumo', amount: Number(t.amount), points: t.pointsEarned, date: t.createdAt, station: t.station.name, vehicle: t.vehicle.plate, status: t.status, pendingBalance: Number(t.debt?.amountPending || 0), real: true })), ...movements].sort((a,b) => b.date.localeCompare(a.date)),
      benefits: benefits.map(b => ({ ...b, cost: b.pointsCost, theme: ['fuel','coffee','wash'].includes(b.code) ? b.code : 'fuel', symbol: b.code === 'coffee' ? '☕' : '✦', tag: b.pointsCost + ' puntos' })),
      redemptions: redemptions.map(r => ({ ...r, title: r.benefit.title })),
    });
    return previous !== JSON.stringify(read());
  }).finally(() => { loading = null; });
  return loading;
}
export const memberService = { async updateProfile(data) { await membershipService.update(data); await refreshData(); }, get: () => ({ ...read().member }), progress: () => Math.min(100, read().member.points / 5000 * 100), setName(name) {
  name = String(name).trim(); if (!name || name.length > 80) throw Error('Ingresa un nombre de 1 a 80 caracteres.');
  saveLocal({ alias: name }); read().member.alias = name;
} };
export const vehicleService = { list: () => read().vehicles, selected: () => read().selectedVehicle, select(plate) {
  if (!read().vehicles.some(v => v.plate === plate)) throw Error('Vehículo no válido.');
  saveLocal({ selectedVehicle: plate }); read().selectedVehicle = plate;
} };
export const transactionService = { list: () => read().transactions, totals: () => read().transactions.reduce((a,t) => { a[t.type === 'recarga' ? 'recharges' : 'consumption'] += t.amount; return a; }, { recharges: 0, consumption: 0 }),
  /**
   * Recarga el saldo contra el backend. El movimiento se persiste en
   * PostgreSQL como libro mayor de la membresía y el estado local solo refleja
   * lo que la API confirmó. Si la API falla el saldo no se altera: mostrar un
   * saldo local que el terminal no conoce dejaría al socio con un importe
   * imposible de usar en el surtidor.
   */
  async recharge(amount) {
    amount = Number(amount); if (!Number.isFinite(amount) || amount < 0.01 || amount > 2000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) throw Error('Ingresa un monto entre S/ 0.01 y S/ 2,000, con hasta dos decimales.');
    const result = await walletService.recharge(amount);
    try { await refreshData(); } catch { return { ...result, refreshPending: true }; }
    return result;
  }
};
export const benefitsService = { list: () => read().benefits, redemptions: () => read().redemptions, async redeem(id) {
  const result = await rewardsService.redeem(id);
  try { await refreshData(); return result.redemption; }
  catch { return { ...result.redemption, refreshPending: true }; }
} };
export const pointsService = { list: () => read().rewards };
export const settingsService = { get: () => read().settings, notifications(value) { saveLocal({ notifications: Boolean(value) }); read().settings.notifications = Boolean(value); } };
