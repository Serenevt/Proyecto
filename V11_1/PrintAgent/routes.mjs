import {validateReceipt,publicJob} from './contract.mjs';
export function handler(config,store) {
  return async(req,res)=>{
    const reply=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    if(req.headers.host!=='localhost:24443'||!config.origins.includes(req.headers.origin)) return reply(403,{error:'Origen o host no autorizado'});
    res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
    res.setHeader('Vary','Origin');
    if(req.method==='OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers','Content-Type, X-FuelFlow-Print');
      res.setHeader('Access-Control-Allow-Private-Network','true');
      return reply(204,{});
    }
    if(req.headers['x-fuelflow-print']!=='1' || req.headers['content-type']!=='application/json') return reply(403,{error:'Solicitud no autorizada'});
    try {
      const match=/^\/jobs\/(receipt-[a-zA-Z0-9-]{1,100})$/.exec(req.url);
      if(!match)return reply(404,{error:'Ruta no encontrada'});
      const id=match[1];
      if(req.method==='GET') {const job=store.get(id);return reply(job?200:404,publicJob(job)||{});}
      if(req.method!=='POST')return reply(405,{error:'Método no permitido'});
      let raw='';
      for await(const chunk of req) {raw+=chunk;if(Buffer.byteLength(raw)>16384)return reply(413,{error:'Comprobante demasiado grande'});}
      let receipt;
      try{receipt=validateReceipt(JSON.parse(raw));}catch{return reply(400,{error:'Comprobante estructurado v2 inválido; no se admite texto libre ni parámetros de impresión.'});}
      if(id!=='receipt-'+receipt.id)return reply(400,{error:'Identificador de comprobante incompatible'});
      const job=await store.submit(id,receipt); return reply(200,publicJob(job));
    } catch(error) { return reply(409,{error:error.message}); }
  };
}
