// Development/test reverse proxy; Docker uses Nginx.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),kiosk=process.env.FRONTEND==='1';
const site=path.join(root,kiosk?'FrontEnd_1':'FrontEnd_2',!kiosk&&process.env.SERVE_BUILD==='1'?'www':'.');
if(kiosk&&fs.existsSync(path.join(root,'Backend/.env')))process.loadEnvFile(path.join(root,'Backend/.env'));
const port=Number(process.env.FRONTEND_PORT||(kiosk?5181:5180));
const target=process.env.BACKEND_URL||'http://127.0.0.1:3000';
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  const allowed=kiosk?(
    (req.method==='GET'&&/^\/api\/v1\/(health|fuels|stations|vehicles\/[A-Za-z0-9-]+)$/.test(url.pathname))||
    (req.method==='POST'&&url.pathname==='/api/v1/transactions')):url.pathname.startsWith('/api/v1/');
  if(!allowed){res.writeHead(403).end();return;}
  if(kiosk&&((req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)||['cross-site','same-site'].includes(req.headers['sec-fetch-site']))){res.writeHead(403).end();return;}
  let size=0,chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413).end();return;}chunks.push(chunk);}
  const headers={'accept':'application/json'};
  if(req.headers['content-type'])headers['content-type']=req.headers['content-type'];
  if(kiosk)headers['x-kiosk-key']=process.env.KIOSK_API_KEY||'';
  else if(req.headers.authorization)headers.authorization=req.headers.authorization;
  try{
   const upstream=await fetch(target+url.pathname+url.search,{method:req.method,headers,...(size?{body:Buffer.concat(chunks)}:{}),signal:AbortSignal.timeout(20000)});
   res.writeHead(upstream.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(await upstream.text());
  }catch{res.writeHead(502,{'Content-Type':'application/json'}).end(JSON.stringify({message:'Servicio no disponible'}));}
  return;
 }
 if(url.pathname==='/healthz'){res.writeHead(200).end('ok');return;}
 if(kiosk&&url.pathname==='/'){res.writeHead(302,{Location:'/src/index.html'}).end();return;}
 let rel;
 try{rel=decodeURIComponent(url.pathname);}catch{res.writeHead(400).end();return;}
 if(!(kiosk?/^\/(src|assets)\//:/^\/(index\.html$|js\/|styles\/|assets\/)/).test(rel)&&!(rel==='/'&&!kiosk)){res.writeHead(404).end();return;}
 if(rel==='/'&&!kiosk)rel='/index.html';
 const file=path.resolve(site,'.'+rel);
 if(!file.startsWith(site+path.sep)||rel.split('/').some(p=>p.startsWith('.'))){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});res.end(data);});
}).listen(port,'127.0.0.1',()=>console.log('Frontend '+(kiosk?'1':'2')+' proxy http://127.0.0.1:'+port));
