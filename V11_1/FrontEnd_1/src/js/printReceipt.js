// HTTPS localhost is provisioned once during installation. No dialog fallback.
export function createPrinter(fetcher = (...args) => fetch(...args)) {
  const active = new Map();
  return function printReceipt(receipt) {
    const id = 'receipt-' + receipt.id;
    if (active.has(id)) return active.get(id);
    const request = async (method, body) => {
      let response;
      try {
        response = await fetcher('https://localhost:24443/jobs/' + encodeURIComponent(id), {
          method, mode: 'cors', credentials: 'omit', cache: 'no-store',
          headers: {'Content-Type': 'application/json', 'X-FuelFlow-Print': '1'},
          ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(20000),
        });
      } catch {
        throw Error('No se pudo consultar el agente local. El resultado puede ser desconocido. Comprueba conexión, certificado y permiso de acceso local; reintentar consultará el mismo trabajo.');
      }
      if (response.status === 404 && method === 'GET') return null;
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'El agente rechazó el trabajo.');
      return result;
    };
    const task = (async () => {
      let job = await request('GET');
      if (!job || job.status === 'retryable') job = await request('POST', receipt);
      if (job?.status !== 'accepted') {
        throw Error(job?.status === 'unknown'
          ? 'Resultado de impresión desconocido. No se reenviará: un operador debe revisar la cola y el papel. Puedes consultar otra vez o finalizar sin imprimir.'
          : job?.error || 'Trabajo en proceso; vuelve a consultar.');
      }
      return job; // Windows accepted the job; physical output is unconfirmed.
    })().finally(() => active.delete(id));
    active.set(id, task);
    return task;
  };
}
export const printReceipt = createPrinter();
