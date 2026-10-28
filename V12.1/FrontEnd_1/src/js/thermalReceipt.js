import {paymentState} from './paymentState.js';

// Strings preserve PostgreSQL decimal amounts; incomplete data fails before printing.
function decimal(value,scale,label) {
  const raw=String(value??'');
  if(!/^\d{1,10}(?:\.\d+)?$/.test(raw))throw Error('Dato inválido del comprobante: '+label);
  const [whole,fraction='']=raw.split('.');
  if(/[1-9]/.test(fraction.slice(scale)))throw Error('Precisión no admitida del comprobante: '+label);
  return (whole.replace(/^0+(?=\d)/,'')||'0')+'.'+fraction.slice(0,scale).padEnd(scale,'0');
}
function text(value,label,max,optional=false) {
  if((value==null||value==='')&&optional)return '';
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value)||/^(undefined|null|NaN)$/i.test(value))throw Error('Dato inválido del comprobante: '+label);
  return value.trim();
}
export function thermalReceipt(t) {
  if(!t||!['BOLETA','FACTURA'].includes(t.receiptType))throw Error('Tipo de comprobante no confirmado.');
  if(!['PREPAGO','POSTPAGO'].includes(t.mode))throw Error('Modalidad de comprobante no confirmada.');
  const date=new Date(t.createdAt);
  if(!t.createdAt||!Number.isFinite(date.getTime()))throw Error('Fecha inválida del comprobante.');
  const id=text(t.id,'operación',100);
  if(!/^[A-Za-z0-9-]+$/.test(id))throw Error('Identificador de comprobante inválido.');
  const invoice=t.receiptType==='FACTURA';
  return {
    schemaVersion:2,id,documentType:t.receiptType,demo:true,issuedAt:date.toISOString(),
    station:text(t.station?.name,'estación',160),pump:'03',
    plate:text(t.plate||t.vehicle?.plate,'placa',20),
    dni:invoice?'':text(t.receiptDni,'DNI',8,true),
    ruc:invoice?text(t.receiptRuc,'RUC',11,true):'',
    businessName:invoice?text(t.receiptBusinessName,'razón social',160,true):'',
    fuel:text(t.fuel?.name,'combustible',80),gallons:decimal(t.gallons,3,'galones'),
    unitPrice:decimal(t.unitPrice,2,'precio'),subtotal:decimal(t.originalAmount??t.amount,2,'subtotal'),
    discount:decimal(t.discountAmount??'0',2,'descuento'),total:decimal(t.amount,2,'total'),
    mode:t.mode,paymentMethod:text(t.payment?.method??'Sin informar','método',30),
    state:paymentState(t).label,pending:decimal(t.debt?.amountPending??t.pendingBalance??'0',2,'saldo pendiente'),
  };
}
