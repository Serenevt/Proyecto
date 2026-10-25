const keys='schemaVersion,id,documentType,demo,issuedAt,station,pump,plate,dni,ruc,businessName,fuel,gallons,unitPrice,subtotal,discount,total,mode,paymentMethod,state,pending'.split(',').sort();
const states=['Pagado','Pago pendiente','Saldo pendiente','Pago por verificar','Reembolsado','Cancelado','Fallido','Rechazado','Error de pago'];
export function validateReceipt(r) {
  const bad=()=>{throw Error('Comprobante estructurado v2 inválido; no se admite texto libre ni parámetros de impresión.');};
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!==keys.join(','))bad();
  if(r.schemaVersion!==2||r.demo!==true||!['BOLETA','FACTURA'].includes(r.documentType)||!['PREPAGO','POSTPAGO'].includes(r.mode)||!states.includes(r.state))bad();
  const limits={id:100,issuedAt:24,station:160,pump:10,plate:20,dni:8,ruc:11,businessName:160,fuel:80,paymentMethod:30};
  for(const [key,max]of Object.entries(limits))if(typeof r[key]!=='string'||r[key].length>max||/[\x00-\x1f\x7f]/.test(r[key])||/^(undefined|null|NaN)$/i.test(r[key])||(!['dni','ruc','businessName'].includes(key)&&!r[key].trim()))bad();
  if(!/^[A-Za-z0-9-]+$/.test(r.id)||r.pump!=='03'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.issuedAt)||!Number.isFinite(Date.parse(r.issuedAt))||new Date(r.issuedAt).toISOString()!==r.issuedAt)bad();
  if((r.dni&&!/^\d{8}$/.test(r.dni))||(r.ruc&&!/^\d{11}$/.test(r.ruc)))bad();
  if(r.documentType==='BOLETA'?(r.ruc!==''||r.businessName!==''):r.dni!=='')bad();
  for(const key of ['unitPrice','subtotal','discount','total','pending'])if(typeof r[key]!=='string'||!/^\d{1,10}\.\d{2}$/.test(r[key]))bad();
  if(typeof r.gallons!=='string'||!/^\d{1,10}\.\d{3}$/.test(r.gallons))bad();
  if(Number(r.pending)>0&&r.state==='Pagado')bad();
  // Fixed key order stabilizes hashes independently of JSON property order.
  return Object.fromEntries(keys.map(k=>[k,r[k]]));
}
export function publicJob(job) {
  if(!job)return null;
  return {id:job.id,status:job.status,error:job.error,updatedAt:job.updatedAt,physicalConfirmed:false,...(job.layout?{layout:job.layout}:{})};
}
