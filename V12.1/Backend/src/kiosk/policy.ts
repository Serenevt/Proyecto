// Deliberately small operator surface. Administrative/member routes are excluded.
export function kioskRoute(method: string, path: string): boolean {
  if (path.includes('?') || path.includes('%') || path.includes('..'))
    return false;
  // Existing KioskOnly check, separate from the administrative panel.
  if (method === 'POST' && path === '/api/v1/admin/check-plate') return true;
  const id =
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  if (method === 'GET')
    return [
      /^\/api\/v1\/(health|fuels|stations|fuels\/inventory)$/,
      /^\/api\/v1\/vehicles\/[A-Z0-9]{3}-[0-9]{3}$/,
      new RegExp(`^/api/v1/(authorizations|transactions|online-orders)/${id}$`),
    ].some((pattern) => pattern.test(path));
  return (
    method === 'POST' &&
    [
      /^\/api\/v1\/(authorizations|transactions|plate-recognition|online-orders)$/,
      new RegExp(
        `^/api/v1/authorizations/${id}/(progress|release|intervention)$`,
      ),
      new RegExp(`^/api/v1/online-orders/${id}/(demo-confirm|cancel|refund)$`),
      new RegExp(`^/api/v1/payments/${id}/refund$`),
    ].some((pattern) => pattern.test(path))
  );
}
