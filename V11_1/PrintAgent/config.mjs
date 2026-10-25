export function validateConfig(c) {
  if(!c.origins?.length||c.origins.some(o=>typeof o!=='string'||new URL(o).origin!==o||!(o.startsWith('https://')||/^http:\/\/localhost:\d+$/.test(o))))throw Error('Orígenes exactos HTTPS obligatorios; localhost permitido en desarrollo.');
  if(c.schemaVersion!==2||typeof c.printerName!=='string'||!c.printerName.trim()||c.driverName!=='PeriPage A6'||!/^USB\d+$/.test(c.portName)||c.paperWidthHundredths!==228||c.paperHeightHundredths!==394||c.widthConfirmed!==true||c.formatConfirmed!==true)throw Error('Configura cola/driver/puerto A6 y formato de 100 mm mediante el probe v2. No se utiliza el ancho del papel predeterminado.');
  const range=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  if(!range(c.printableWidthMm,35,58)||!range(c.printableHeightMm,30,101)||!range(c.printableLeftMm,0,20)||!range(c.printableTopMm,0,20)||c.printableLeftMm+c.printableWidthMm>58.6||c.printableTopMm+c.printableHeightMm>101)throw Error('Área imprimible del formato de 100 mm inválida.');
  return c;
}
export function verifyProbe(c,p) {
  if(p.printerName!==c.printerName||p.driverName!==c.driverName||p.port!==c.portName||p.status!=='Normal'||Math.abs(p.paperWidthMm-57.912)>0.3||Math.abs(p.paperHeightMm-100.076)>0.3)throw Error('La cola USB/driver/formato no coincide con la A6 configurada.');
  for(const key of ['printableWidthMm','printableHeightMm','printableLeftMm','printableTopMm'])if(!Number.isFinite(p[key])||Math.abs(p[key]-c[key])>0.6)throw Error('Área imprimible del formato de 100 mm distinta a la confirmada. Repite la configuración; no imprimas con el ancho predeterminado.');
}
