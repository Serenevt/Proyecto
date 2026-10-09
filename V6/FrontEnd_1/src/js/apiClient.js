export const API_BASE_URL = '/api/v1';
export async function apiClient(path, {method='GET',body}={}) {
  let response;
  try { response=await fetch(API_BASE_URL+path,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),cache:'no-store'}); }
  catch { throw Error('No pudimos conectar. Reintenta para confirmar tu compra.'); }
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(Error(response.status>=500?'No pudimos confirmar la compra. Puedes reintentar.':(Array.isArray(result?.message)?result.message.join('. '):result?.message)||'No pudimos completar la operación.'),{status:response.status});
  return result;
}
export const catalogService={fuels:()=>apiClient('/fuels'),stations:()=>apiClient('/stations'),vehicle:plate=>apiClient('/vehicles/'+encodeURIComponent(plate))};
