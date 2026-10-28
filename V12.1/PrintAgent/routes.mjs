import {validateReceipt,publicJob} from './contract.mjs';
import {AGENT_AUTHORITY,AGENT_URL,isLocalOrigin} from './transport.mjs';
export function isJsonContentType(value){return typeof value==='string'&&/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(value);}
export function handler(config,store) {
  return async(req,res)=>{
    const reply=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(code===204?undefined:JSON.stringify(body));};
    const protectedHeaders=new Set(['host','origin','content-type','x-fuelflow-print']);
    const seen=new Set();
    for(let i=0;i<req.rawHeaders.length;i+=2){const name=req.rawHeaders[i].toLowerCase();if(protectedHeaders.has(name)&&seen.has(name))return reply(403,{error:'Encabezados duplicados'});seen.add(name);}
    if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==AGENT_AUTHORITY||!isLocalOrigin(req.headers.origin)||!config.origins.includes(req.headers.origin))return reply(403,{error:'Origen o host no autorizado'});
    res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
    res.setHeader('Vary','Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    if(!['GET','POST','OPTIONS'].includes(req.method)){res.setHeader('Allow','GET, POST, OPTIONS');return reply(405,{error:'Método no permitido'});}
    const match=/^\/jobs\/(receipt-[a-zA-Z0-9-]{1,100})$/.exec(req.url);
    const health=req.url==='/health';
    if(!health&&!match)return reply(404,{error:'Ruta no encontrada'});
    if(req.method==='OPTIONS'){
      const method=req.headers['access-control-request-method'];
      const requested=(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(h=>h.trim()).filter(Boolean);
      const missingMarker=!health&&!requested.includes('x-fuelflow-print');
      const missingBodyType=method==='POST'&&!requested.includes('content-type');
      if(!['GET','POST'].includes(method)||(health&&method!=='GET')||new Set(requested).size!==requested.length||requested.some(h=>!['content-type','x-fuelflow-print'].includes(h))||missingMarker||missingBodyType)return reply(403,{error:'Preflight no autorizado',code:'PREFLIGHT_HEADERS'});
      res.setHeader('Access-Control-Allow-Methods',health?'GET, OPTIONS':'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers','Content-Type, X-FuelFlow-Print');
      // Compatibility with PNA. Modern LNA permission still belongs to the browser.
      if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');
      return reply(204);
    }
    if(req.headers['sec-fetch-mode']&&req.headers['sec-fetch-mode']!=='cors')return reply(403,{error:'Solicitud no autorizada: se requiere modo CORS.',code:'FETCH_MODE'});
    if(health){
      if(req.method!=='GET')return reply(405,{error:'Método no permitido'});
      // Read-only health has no body. Origin/Host/loopback remain mandatory.
      if(req.headers['x-fuelflow-print']!==undefined&&req.headers['x-fuelflow-print']!=='1')return reply(403,{error:'Solicitud no autorizada: marcador de protocolo inválido.',code:'PRINT_MARKER_REQUIRED'});
      if(req.headers['content-type']!==undefined&&!isJsonContentType(req.headers['content-type']))return reply(403,{error:'Solicitud no autorizada: tipo JSON inválido.',code:'JSON_CONTENT_TYPE_REQUIRED'});
      return reply(200,{version:'V12.1',ready:true,transport:'http-loopback',endpoint:AGENT_URL,diagnosticOnly:!!config.diagnosticOnly,printerName:config.printerName||'PeriPage A6(1)',dpi:203,paperMm:{width:56.896,height:100.076},physicalConfirmed:false});
    }
    if(req.headers['x-fuelflow-print']!=='1')return reply(403,{error:'Solicitud no autorizada: falta X-FuelFlow-Print: 1.',code:'PRINT_MARKER_REQUIRED'});
    if((req.method==='POST'||req.headers['content-type']!==undefined)&&!isJsonContentType(req.headers['content-type']))return reply(403,{error:'Solicitud no autorizada: se requiere JSON UTF-8.',code:'JSON_CONTENT_TYPE_REQUIRED'});
    if(config.diagnosticOnly)return reply(503,{error:'Modo diagnóstico: envío de trabajos bloqueado.'});
    try {
      const id=match[1];
      if(req.method==='GET'){const job=store.get(id);return reply(job?200:404,publicJob(job)||{});}
      const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)return reply(413,{error:'Comprobante demasiado grande'});chunks.push(chunk);}
      let receipt;
      try{receipt=validateReceipt(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{return reply(400,{error:'Comprobante estructurado v2 inválido; no se admite texto libre ni parámetros de impresión.'});}
      if(id!=='receipt-'+receipt.id)return reply(400,{error:'Identificador de comprobante incompatible'});
      return reply(200,publicJob(await store.submit(id,receipt)));
    }catch(error){return reply(409,{error:error.message});}
  };
}
