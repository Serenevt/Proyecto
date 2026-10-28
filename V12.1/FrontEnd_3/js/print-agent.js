export const PRINT_AGENT_URL = 'http://127.0.0.1:25443';

export function isLocalControlOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && /^\d+$/.test(url.port);
  } catch {
    return false;
  }
}

export function createPrintAgent(fetcher = (...args) => fetch(...args), pageOrigin = globalThis.location?.origin) {
  const active = new Map();
  return function requestPrint(receipt) {
    if (!isLocalControlOrigin(pageOrigin)) return Promise.reject(Error('PrintAgent solo está disponible cuando Primax Control se abre localmente en localhost o 127.0.0.1.'));
    if (!receipt || typeof receipt.id !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(receipt.id)) return Promise.reject(Error('Identificador de comprobante inválido.'));
    if (receipt.pump !== '03') return Promise.reject(Error('La instalación local actual de PrintAgent solo admite el surtidor 03. Usa la impresión del navegador para este comprobante.'));
    const id = `receipt-${receipt.id}`;
    if (active.has(id)) return active.get(id);
    const request = async (method, body) => {
      let response;
      try {
        response = await fetcher(`${PRINT_AGENT_URL}/jobs/${encodeURIComponent(id)}`, {
          method,
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          headers: { 'X-FuelFlow-Print': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        throw Error('PrintAgent local no está disponible. El comprobante y la transacción siguen guardados; puedes imprimirlo desde el navegador o reintentar.');
      }
      if (response.status === 404 && method === 'GET') return null;
      let result;
      try { result = await response.json(); } catch { throw Error('PrintAgent devolvió una respuesta inválida; el estado físico de impresión no está confirmado.'); }
      if (!response.ok) throw Error(result.error || 'PrintAgent rechazó la impresión.');
      if (result?.id !== id || !['accepted', 'retryable', 'unknown'].includes(result.status)) throw Error('PrintAgent no confirmó el estado de la impresión.');
      return result;
    };
    const task = (async () => {
      let job = await request('GET');
      if (!job || job.status === 'retryable') job = await request('POST', receipt);
      if (job?.status !== 'accepted') throw Error(job?.status === 'unknown' ? 'El resultado de impresión es desconocido; no se reenvió para evitar duplicados. La operación no cambió.' : job?.error || 'La impresión no fue aceptada.');
      return job;
    })().finally(() => active.delete(id));
    active.set(id, task);
    return task;
  };
}
