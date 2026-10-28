import {mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export class JobStore {
  constructor(directory, adapter) { this.directory=directory; this.adapter=adapter; this.active=new Map(); mkdirSync(directory,{recursive:true}); }
  path(id) { if(!/^receipt-[a-zA-Z0-9-]{1,100}$/.test(id)) throw Error('Identificador inválido'); return join(this.directory,id+'.json'); }
  get(id) { const file=this.path(id); return existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null; }
  save(job) {
    const file=this.path(job.id), temp=file+'.tmp';
    const fd=openSync(temp,'w',0o600);
    try { writeFileSync(fd,JSON.stringify(job)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp,file);
  }
  submit(id, receipt) {
    const hash=createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
    const existing=this.get(id);
    if(existing && existing.hash!==hash) throw Error('El comprobante ya existe con otro contenido');
    if (this.active.has(id)) return this.active.get(id);
    if(existing && existing.status!=='retryable') return Promise.resolve(existing);
    // A process crash here is UNKNOWN. Never blindly send this job again.
    const job={id,hash,receipt,status:'unknown',physicalConfirmed:false,updatedAt:new Date().toISOString()};
    this.save(job);
    const task=(async()=>{
      try {
        const result=await this.adapter(job);
        job.status=result.status==='accepted'?'accepted':result.status==='retryable'?'retryable':'unknown';
        job.error=result.error;
        if(result.layout)job.layout=result.layout;
        if(result.printerState)job.printerState=result.printerState;
      } catch { job.status='unknown'; job.error='Resultado desconocido; revisar cola y salida física.'; }
      job.updatedAt=new Date().toISOString(); this.save(job); return job;
    })().finally(()=>this.active.delete(id));
    this.active.set(id,task); return task;
  }
}
