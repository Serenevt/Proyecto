import { apiClient } from './apiClient.js';

export function openPlateCamera(onRecognized) {
  const dialog = document.createElement('dialog');
  dialog.className = 'v9-dialog';
  dialog.innerHTML = `<h2>Reconocimiento de placa</h2><p>Centra la placa con buena iluminación y evita reflejos.</p><video autoplay playsinline muted aria-label="Vista de cámara"></video><p role="status">Abriendo cámara…</p><div class="v9-actions"><button class="btn btn-primary" data-capture disabled>Capturar placa</button><button class="btn" data-manual>Ingresar/verificar placa manualmente</button><button class="btn" data-cancel>Cancelar</button></div><label>Usar imagen de prueba<input type="file" accept="image/png,image/jpeg" data-fixture></label>`;
  document.body.append(dialog); dialog.showModal();
  let stream, closed = false, busy = false;
  const video = dialog.querySelector('video'), status = dialog.querySelector('[role=status]'), capture = dialog.querySelector('[data-capture]');
  const stop = () => { closed = true; stream?.getTracks().forEach(track => track.stop()); dialog.remove(); };
  dialog.addEventListener('cancel', stop);
  dialog.querySelector('[data-cancel]').onclick = stop;
  dialog.querySelector('[data-manual]').onclick = stop;
  window.addEventListener('pagehide', stop, { once: true });
  async function recognize(source) {
    if (busy || closed) return; busy = true; capture.disabled = true; status.textContent = 'Reconociendo placa…';
    try {
      const canvas = document.createElement('canvas');
      const width = source.videoWidth || source.width, height = source.videoHeight || source.height;
      if (!width || !height) throw Error('La cámara aún no tiene imagen. Vuelve a capturar.');
      const scale = Math.min(1, 1280 / width); canvas.width = width * scale; canvas.height = height * scale;
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      const result = await apiClient('/plate-recognition', { method: 'POST', body: { image: canvas.toDataURL('image/jpeg', .9).split(',')[1] } });
      if (closed) return;
      if (!result.recognized) { status.textContent = 'No pudimos reconocer la placa con suficiente confianza. Vuelve a capturar o ingresa/verifica la placa manualmente.'; return; }
      await onRecognized(result);
      status.textContent = `Vehículo reconocido · Placa: ${result.plate}${result.vehicle?.membership ? ' · Membresía: ' + result.vehicle.membership.number + ' · Usuario: ' + result.vehicle.membership.name : ' · Sin membresía asociada'}. Verifica la placa antes de continuar.`;
      dialog.querySelector('[data-manual]').textContent = 'Verificar placa y continuar';
    } catch (error) { if (!closed) status.textContent = error.message; }
    finally { busy = false; if (!closed) capture.disabled = !stream; }
  }
  capture.onclick = () => void recognize(video);
  dialog.querySelector('[data-fixture]').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 2000000) { status.textContent = 'La imagen debe ocupar menos de 2 MB.'; return; }
    try { const bitmap = await createImageBitmap(file); await recognize(bitmap); bitmap.close(); }
    catch { status.textContent = 'Imagen no válida. Usa PNG o JPEG.'; }
  };
  (async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Error('La cámara requiere localhost o HTTPS. Usa una imagen de prueba o ingreso manual.');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      if (closed) { stream.getTracks().forEach(track => track.stop()); return; }
      video.srcObject = stream; await video.play(); capture.disabled = false; status.textContent = 'Cámara lista. Captura la placa.';
    } catch (error) { if (!closed) status.textContent = error.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Usa imagen de prueba o ingreso manual.' : error.message; }
  })();
}

export function insufficientBalance(details) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.className = 'v9-dialog';
    dialog.innerHTML = `<h2>Saldo Primax Prime</h2><p data-message></p><dl><dt>Saldo disponible</dt><dd data-available></dd><dt>Importe del consumo</dt><dd data-amount></dd><dt>Saldo pendiente de este consumo</dt><dd data-pending></dd></dl><div class="v9-actions"><button class="btn btn-primary" data-action="recharge">Recargar Primax Prime</button><button class="btn" data-action="other">Usar otro pago</button>${details.canRegisterDebt ? '<button class="btn" data-action="debt">Registrar saldo pendiente</button>' : ''}<button class="btn" data-action="cancel">Volver</button></div>`;
    dialog.querySelector('[data-message]').textContent = details.code === 'DEBT_LIMIT' ? 'Has alcanzado el límite de saldo pendiente.' : 'Tu saldo Primax Prime no es suficiente para cubrir el consumo.';
    for (const [key, value] of [['available', details.available], ['amount', details.amount], ['pending', details.amountPending]]) dialog.querySelector('[data-' + key + ']').textContent = 'S/ ' + value;
    const finish = action => { dialog.remove(); resolve(action); };
    dialog.addEventListener('cancel', () => finish('cancel'));
    dialog.onclick = event => { const action = event.target.closest('[data-action]')?.dataset.action; if (action) { if (action === 'recharge') window.open('/prime', '_blank', 'noopener'); finish(action); } };
    document.body.append(dialog); dialog.showModal();
  });
}
