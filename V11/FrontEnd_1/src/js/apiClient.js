export const API_BASE_URL = globalThis.FUELFLOW_API_BASE_URL || '/api/v1';
export async function apiClient(path, {method='GET',body,token}={}) {
  let response;
  try { response=await fetch(API_BASE_URL+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),cache:'no-store'}); }
  catch (error) { throw Object.assign(Error('No pudimos conectar. Reintenta para confirmar tu compra.'), {kind: ['TimeoutError','AbortError'].includes(error.name) ? 'timeout' : 'network'}); }
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(Error(response.status>=500?'No pudimos confirmar la compra. Puedes reintentar.':(Array.isArray(result?.message)?result.message.join('. '):result?.message)||'No pudimos completar la operación.'),{status:response.status,details:result});
  return result;
}
export const catalogService={fuels:()=>apiClient('/fuels'),stations:()=>apiClient('/stations'),vehicle:plate=>apiClient('/vehicles/'+encodeURIComponent(plate))};

/**
 * Reserva de saldo para un abastecimiento postpago.
 *
 * El backend valida placa, código de membresía, membresía activa y saldo
 * disponible, y descuenta el importe autorizado del saldo Primax Prime antes de
 * que la manguera despiense. Devuelve el id de la reserva, que debe enviarse
 * luego en la confirmación de la compra.
 */
export const authorizationService={
  intervention:id=>apiClient('/authorizations/'+encodeURIComponent(id)+'/intervention',{method:'POST'}),
  reserve:body=>apiClient('/authorizations',{method:'POST',body}),
  release:id=>apiClient('/authorizations/'+encodeURIComponent(id)+'/release',{method:'POST'}),
  /**
   * Informa el avance del abastecimiento. No mueve saldo ni cobra: sirve para
   * que el backend conozca lo despachado y para recuperar operaciones si el
   * terminal se reinicia. El backend rechaza cualquier avance por encima de lo
   * reservado, así que el consumo nunca puede rebasar lo autorizado.
   */
  progress:(id,amount,gallons)=>apiClient('/authorizations/'+encodeURIComponent(id)+'/progress',{method:'POST',body:{amount,gallons}}),
  /** Consulta una reserva para retomar o cerrar una operación interrumpida. */
  status:id=>apiClient('/authorizations/'+encodeURIComponent(id)),
};
