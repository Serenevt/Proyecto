import { apiClient } from './apiClient.js';
let token = '';
export const adminService = {
  demo: () => apiClient('/admin/demo-credentials'),
  async login(username, password) {
    const result = await apiClient('/admin/login', { method: 'POST', body: { username, password } });
    token = result.accessToken;
  },
  logout() { token = ''; },
  alerts: () => apiClient('/admin/alerts', { token }),
  dashboard: () => apiClient('/admin/dashboard', { token }),
  resolve: id => apiClient(`/admin/alerts/${encodeURIComponent(id)}/resolve`, { method: 'POST', token }),
};
export function renderAlerts(ul, alerts, resolve) {
  ul.replaceChildren();
  if (!alerts.some(a => a.status === 'OPEN')) {
    const li = document.createElement('li'); li.textContent = 'No hay alertas pendientes'; ul.append(li);
  }
  for (const alert of alerts) {
    const li = document.createElement('li');
    li.textContent = `${alert.description} · ${alert.plate} · ${alert.userName} · ${new Date(alert.occurredAt).toLocaleString()}${alert.amountPending != null ? ` · S/ ${Number(alert.amountPending).toFixed(2)}` : ''}${alert.expectedPlates.length ? ` · Placas vinculadas: ${alert.expectedPlates.join(', ')}` : ''} · ${alert.status === 'RESOLVED' ? 'Revisada' : 'Pendiente'} · Operación: ${alert.operationId}`;
    if (alert.status === 'OPEN') {
      const button = document.createElement('button'); button.className = 'btn btn-small'; button.textContent = 'Marcar como revisada';
      button.onclick = () => resolve(alert.id); li.append(button);
    }
    ul.append(li);
  }
}
