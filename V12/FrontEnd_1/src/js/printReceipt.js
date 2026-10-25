// Local installation only. The browser keeps its normal CORS/LNA protections.
export const PRINT_AGENT_URL='http://127.0.0.1:25443';
export function isLocalPrintOrigin(origin){
  try{const u=new URL(origin);return u.origin===origin&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)&&/^\d+$/.test(u.port);}catch{return false;}
}
export function createPrinter(fetcher = (...args) => fetch(...args),pageOrigin=globalThis.location?.origin) {
  const active = new Map();
  return function printReceipt(receipt) {
    if(pageOrigin!==undefined&&!isLocalPrintOrigin(pageOrigin))return Promise.reject(Error('La impresión HTTP requiere abrir FuelFlow en localhost o 127.0.0.1. No está habilitada desde la LAN o Internet.'));
    if(!receipt||typeof receipt.id!=='string'||! /^[A-Za-z0-9-]{1,100}$/.test(receipt.id))return Promise.reject(Error('Identificador de comprobante inválido.'));
    const id = 'receipt-' + receipt.id;
    if (active.has(id)) return active.get(id);
    const request = async (method, body) => {
      let response;
      try {
        response = await fetcher(PRINT_AGENT_URL+'/jobs/' + encodeURIComponent(id), {
          method, mode: 'cors', credentials: 'omit', cache: 'no-store',redirect:'error',
          headers: {'X-FuelFlow-Print': '1',...(body?{'Content-Type':'application/json'}:{})},
          ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(20000),
        });
      } catch {
        throw Error('No se pudo consultar el agente local PrintAgent en 127.0.0.1. Comprueba que esté iniciado y el permiso de acceso local del navegador. El resultado puede ser desconocido; reintentar consultará el mismo trabajo.');
      }
      if (response.status === 404 && method === 'GET') return null;
      let result;
      try { result = await response.json(); } catch { throw Error('Respuesta inválida del agente local. Conserva el ticket y consulta el mismo trabajo.'); }
      if (!response.ok) throw Error(result.error || 'El agente rechazó el trabajo.');
      if(result?.id!==id||!['accepted','retryable','unknown'].includes(result.status))throw Error('El agente no confirmó el identificador y estado del comprobante. Conserva el ticket y consulta el mismo trabajo.');
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
