export function canViewStation(session, stationId) {
  return Boolean(session?.global || session?.stations?.some((station) => station.id === stationId));
}

export const controlModules = [
  ['dashboard', 'Dashboard', null],
  ['operations', 'Operaciones', 'ADMIN_OPERATION_VIEW'],
  ['transactions', 'Pagos / Transacciones', 'ADMIN_TRANSACTION_VIEW'],
  ['customers', 'Clientes', 'ADMIN_CUSTOMER_VIEW'],
  ['memberships', 'Membresías Prime', 'ADMIN_MEMBERSHIP_VIEW'],
  ['vehicles', 'Vehículos / placas', 'ADMIN_VEHICLE_VIEW'],
  ['terminals', 'Terminales', 'ADMIN_TERMINAL_VIEW'],
  ['inventory', 'Inventario', 'ADMIN_INVENTORY_VIEW'],
  ['movements', 'Movimientos', 'ADMIN_INVENTORY_MOVEMENT_VIEW'],
  ['supply', 'Abastecimiento', 'ADMIN_INVENTORY_RECEIVE'],
  ['incidents', 'Incidencias', 'ADMIN_INCIDENT_VIEW'],
  ['accounts', 'Personal / accesos', 'ADMIN_USER_MANAGE'],
  ['audit', 'Auditoría', 'ADMIN_AUDIT_VIEW'],
];

export function visibleModules(session) {
  return controlModules.filter(([id, , permission]) => {
    if (id === 'accounts') return Boolean(session?.global);
    return !permission || session?.permissions?.includes(permission);
  });
}

export function initialView(hash = '') {
  const view = hash.replace(/^#\/?/, '').split('/')[0];
  return controlModules.some(([id]) => id === view) ? view : 'dashboard';
}

export function incidentMessage(error) {
  if (error?.status === 401 || error?.status === 403) return 'Tu sesión no tiene permiso para consultar esta sección.';
  if (error?.status >= 500) return 'Primax Control no está disponible temporalmente.';
  return error?.message || 'No se pudieron cargar los datos.';
}
