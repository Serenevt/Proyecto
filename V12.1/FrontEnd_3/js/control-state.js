export function canViewStation(session, stationId) {
  return Boolean(session?.global || session?.stations?.some((station) => station.id === stationId));
}

export function initialView(hash = '') {
  const view = hash.replace(/^#\/?/, '').split('/')[0];
  return ['dashboard', 'incidents', 'accounts'].includes(view) ? view : 'dashboard';
}

export function incidentMessage(error) {
  if (error?.status === 401 || error?.status === 403) return 'Tu sesión no tiene permiso para consultar estas incidencias.';
  if (error?.status >= 500) return 'Primax Control no está disponible temporalmente.';
  return error?.message || 'No se pudieron cargar las incidencias.';
}
