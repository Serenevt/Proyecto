import { apiClient } from './apiClient.js';
let closeActiveCamera;
export function openPlateCamera(onRecognized, kind = 'plate') {
 closeActiveCamera?.();
 const membership=kind==='membership';
 const dialog=document.createElement('dialog');dialog.className='v9-dialog';
 dialog.innerHTML='<h2></h2><p>Centra el documento con buena iluminación y evita reflejos.</p><video autoplay playsinline muted aria-label="Vista de cámara"></video><p role="status">Abriendo cámara…</p><div class="v9-actions"><button class="btn btn-primary" data-capture disabled>Capturar</button><button class="btn" data-manual>Ingreso manual</button><button class="btn" data-cancel>Cancelar</button></div><div data-review hidden><label>Revisar o corregir resultado<input data-result autocomplete="off"></label><button class="btn btn-primary" data-confirm>Confirmar resultado</button></div><label>Imagen de prueba (no verifica una cámara física)<input type="file" accept="image/png,image/jpeg" data-fixture></label>';
 dialog.querySelector('h2').textContent=membership?'Capturar membresía':'Capturar placa';
 const video=dialog.querySelector('video'),status=dialog.querySelector('[role=status]'),capture=dialog.querySelector('[data-capture]'),review=dialog.querySelector('[data-review]'),input=dialog.querySelector('[data-result]'),confirm=dialog.querySelector('[data-confirm]');
 let stream,closed=false,busy=false;
 const stop=()=>{if(closed)return;closed=true;stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;dialog.remove();window.removeEventListener('pagehide',stop);document.removeEventListener('fuelflow-step-change',stop);if(closeActiveCamera===stop)closeActiveCamera=null;};
 closeActiveCamera=stop;
 dialog.addEventListener('cancel',stop);dialog.addEventListener('close',stop);
 dialog.querySelector('[data-cancel]').onclick=stop;dialog.querySelector('[data-manual]').onclick=stop;
 window.addEventListener('pagehide',stop);document.addEventListener('fuelflow-step-change',stop);
 document.body.append(dialog);dialog.showModal();
 async function recognize(source){
  if(busy||closed)return;busy=true;capture.disabled=true;review.hidden=true;status.textContent='Reconociendo…';
  try{
   const canvas=document.createElement('canvas'),width=source.videoWidth||source.width,height=source.videoHeight||source.height;
   if(!width||!height)throw Error('La cámara aún no tiene imagen. Vuelve a capturar.');
   const scale=Math.min(1,1280/width);canvas.width=width*scale;canvas.height=height*scale;
   const results=[];
   for(let frame=0;frame<(source===video?3:1);frame++){
    if(closed)return;canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
    results.push(await apiClient('/plate-recognition',{method:'POST',body:{kind,image:canvas.toDataURL('image/jpeg',.9).split(',')[1]}}));
    if(source===video)await new Promise(resolve=>setTimeout(resolve,150));
   }
   if(closed)return;
   const key=r=>membership?r.number:r.plate;
   const result=results.find(r=>r.recognized&&results.filter(other=>other.recognized&&key(other)===key(r)).length>=(source===video?2:1));
   if(!result){status.textContent='No pudimos reconocer con suficiente confianza. Vuelve a capturar o usa el ingreso manual.';return;}
   input.value=key(result);review.hidden=false;status.textContent='Revisa o corrige el resultado antes de confirmarlo.';input.focus();
  }catch(error){if(!closed)status.textContent=error.status===503?'Reconocimiento no disponible. Usa el ingreso manual.':error.message;}
  finally{busy=false;if(!closed)capture.disabled=!stream;}
 }
 confirm.onclick=async()=>{
  if(busy||closed)return;busy=true;confirm.disabled=true;
  try{
   let value=input.value.trim().toUpperCase();
   if(membership){
    if(!/^PRIM(?:[0-9]+[A-Z]?|E-[0-9]+)$/.test(value))throw Error('Revisa el código de membresía.');
    // This fills a candidate only. The existing verification step checks active membership and matching plate on backend.
    if(!closed)await onRecognized({number:value});
   }else{
    value=value.replace(/[^A-Z0-9]/g,'');if(!/^[A-Z0-9]{3}[0-9]{3}$/.test(value))throw Error('Revisa el formato de placa.');
    value=value.slice(0,3)+'-'+value.slice(3);
    let vehicle=null;try{vehicle=await apiClient('/vehicles/'+encodeURIComponent(value));}catch(error){if(error.status!==404)throw error;}
    if(!closed)await onRecognized({plate:value,vehicle});
   }
   stop();
  }catch(error){if(!closed)status.textContent=error.message;}
  finally{busy=false;if(!closed)confirm.disabled=false;}
 };
 capture.onclick=()=>void recognize(video);
 dialog.querySelector('[data-fixture]').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;if(file.size>2000000){status.textContent='La imagen debe ocupar menos de 2 MB.';return;}
  let bitmap;try{bitmap=await createImageBitmap(file);await recognize(bitmap);}catch{if(!closed)status.textContent='Imagen no válida. Usa PNG o JPEG.';}finally{bitmap?.close();}
 };
 (async()=>{try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('La cámara requiere localhost o HTTPS. Usa ingreso manual.');
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
  if(closed){stream.getTracks().forEach(track=>track.stop());return;}
  video.srcObject=stream;await video.play();if(closed)return;capture.disabled=false;status.textContent='Cámara lista. Captura la imagen.';
 }catch(error){if(!closed)status.textContent=error.name==='NotAllowedError'?'Permiso de cámara denegado. Usa ingreso manual.':error.message;}})();
 return stop;
}

// retry reuses the persisted operationId and asks Backend to authorize again.
export function insufficientBalance(details, { onRefresh, onSwitchToPrepaid }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.className = 'v9-dialog';
    dialog.innerHTML = `<h2>Saldo insuficiente</h2><p data-message role="status" aria-live="polite"></p><dl><dt>Saldo disponible</dt><dd data-available></dd><dt>Total</dt><dd data-amount></dd><dt>Faltante</dt><dd data-pending></dd></dl><div class="v9-actions"><button class="btn btn-primary" data-action="refresh">Ya recargué</button><button class="btn" data-action="prepaid">Cambiar a prepago</button><button class="btn" data-action="cancel">Volver</button></div>`;
    let busy = false, finished = false;
    const buttons = [...dialog.querySelectorAll('button')];
    const render = () => {
      dialog.querySelector('[data-message]').textContent = details.code === 'DEBT_LIMIT' ? 'Tu saldo disponible no cubre este monto. No se creó una autorización ni una deuda.' : 'Tu saldo Primax Prime no es suficiente para cubrir el consumo.';
      for (const [key, value] of [['available', details.available], ['amount', details.amount], ['pending', details.amountPending]]) dialog.querySelector('[data-' + key + ']').textContent = 'S/ ' + value;
      buttons.forEach(button => { button.disabled = busy; });
    };
    const finish = action => { finished = true; dialog.remove(); resolve(action); };
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); else finish('cancel'); });
    dialog.onclick = async event => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled || busy || finished) return;
      if (button.dataset.action === 'prepaid') { finish('prepaid'); return; }
      if (button.dataset.action === 'cancel') { finish('cancel'); return; }
      busy = true; render();
      try {
        await onRefresh();
        finish('authorized');
      } catch (error) {
        if (['INSUFFICIENT_BALANCE', 'DEBT_LIMIT'].includes(error.details?.code)) {
          details = error.details; busy = false; render();
        } else {
          busy = false; render();
          dialog.querySelector('[data-message]').textContent = error.message || 'No pudimos consultar el saldo. Vuelve a intentarlo.';
        }
      }
    };
    render(); document.body.append(dialog); dialog.showModal();
  });
}
