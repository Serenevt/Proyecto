import {AGENT_HOST,AGENT_PORT,isLocalOrigin} from './transport.mjs';
export function validateConfig(c) {
  if(c.transport!=='http-loopback'||c.agentHost!==AGENT_HOST||c.agentPort!==AGENT_PORT)throw Error('Solo HTTP local en 127.0.0.1:25443. Usa config.http.local.json; no se requieren certificados.');
  if(c.agentPort!==25443||c.dpi!==203||(c.dataDirectory!==undefined&&c.dataDirectory!=='data-v12_1'))throw Error('Esta versión requiere puerto 25443, resolución 203 DPI e historial propio data-v12_1. No reutilices la configuración de otra versión.');
  if(c.contentWidthMm!==undefined&&c.contentWidthMm!==48)throw Error('El cabezal A6 de esta instalación requiere limitar el contenido a 48 mm.');
  if(!Array.isArray(c.origins)||!c.origins.length||c.origins.some(o=>!isLocalOrigin(o)))throw Error('Solo orígenes HTTP exactos de localhost o 127.0.0.1 con puerto explícito. No se admite LAN, Internet ni CORS abierto.');
  if(c.schemaVersion!==2||c.printerName!=='PeriPage A6(1)'||c.driverName!=='PeriPage A6'||!/^USB\d+$/.test(c.portName)||c.paperWidthHundredths!==224||c.paperHeightHundredths!==394||c.widthConfirmed!==true||c.formatConfirmed!==true)throw Error('Configura PeriPage A6(1), su driver/USB y formato de 100 mm mediante el probe v2.');
  const range=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  if(!range(c.printableWidthMm,35,57)||!range(c.printableHeightMm,30,101)||!range(c.printableLeftMm,0,20)||!range(c.printableTopMm,0,20)||c.printableLeftMm+c.printableWidthMm>57.3||c.printableTopMm+c.printableHeightMm>101)throw Error('Área imprimible del formato de 57 × 100 mm inválida.');
  return {...c,contentWidthMm:48};
}
export function verifyProbe(c,p) {
  if(p.dpiX!==203||p.dpiY!==203)throw Error('El driver no confirmó 203 × 203 DPI. No se enviarán trabajos.');
  if(p.printerName!==c.printerName||p.driverName!==c.driverName||p.port!==c.portName||p.status!=='Normal'||!Number.isFinite(p.paperWidthMm)||!Number.isFinite(p.paperHeightMm)||Math.abs(p.paperWidthMm-56.896)>0.3||Math.abs(p.paperHeightMm-100.076)>0.3)throw Error('La cola USB/driver/formato no coincide con la A6 configurada.');
  for(const key of ['printableWidthMm','printableHeightMm','printableLeftMm','printableTopMm'])if(!Number.isFinite(p[key])||Math.abs(p[key]-c[key])>0.6)throw Error('Área imprimible del formato de 100 mm distinta a la confirmada. Repite la configuración; no imprimas con el ancho predeterminado.');
}
