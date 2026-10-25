export function customerIdentity(plate, membership) {
  return `${plate} · ${membership?.name || 'No afiliado'}`;
}
