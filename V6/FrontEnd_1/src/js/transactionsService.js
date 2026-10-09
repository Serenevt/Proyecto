import {apiClient} from './apiClient.js';
export const OPERATION_KEY='fuelflow:operation:v1';
export function createTransactionsService({storage=globalThis.localStorage,request=apiClient,uuid=()=>crypto.randomUUID()}={}) {
  let inFlight;
  const current=()=>JSON.parse(storage.getItem(OPERATION_KEY)||'null');
  const save=value=>{storage.setItem(OPERATION_KEY,JSON.stringify(value));return value;};
  return {
    current,
    begin(){return current()||save({operationId:uuid()});},
    prepare(payload,snapshot){const pending=this.begin();if(pending.payload)return pending;return save({...pending,payload:{...payload,operationId:pending.operationId},snapshot});},
    submit(){
      if(inFlight)return inFlight;
      const pending=current();
      if(!pending?.payload)return Promise.reject(Error('La compra aún no está lista.'));
      if(pending.result)return Promise.resolve(pending.result);
      inFlight=request('/transactions',{method:'POST',body:pending.payload}).then(result=>{
        // Persist before rendering success. A failed write still retries the same operationId.
        save({...pending,result});return result;
      }).finally(()=>{inFlight=null;});
      return inFlight;
    },
    finish(){if(inFlight)throw Error('Espera a que termine la confirmación.');const pending=current();if(pending?.payload&&!pending.result)throw Error('Primero confirma la compra pendiente.');storage.removeItem(OPERATION_KEY);}
  };
}
export const transactionsService=createTransactionsService();
