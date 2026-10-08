(function (F) {
'use strict';
const { $, mascotaEstado } = F;
const hablar = (...args) => F.hablar(...args);

const FRAMES_MASCOTA = ['m-aa', 'm-ac', 'm-ca', 'm-cc'];

// Muestra solo la imagen que corresponde al estado actual (ojos × boca)
function pintarMascota() {
  const clave = (mascotaEstado.ojos ? 'c' : 'a') + (mascotaEstado.boca ? 'a' : 'c');
  FRAMES_MASCOTA.forEach((fid) => {
    const img = $(fid);
    if (img) img.style.opacity = (fid === 'm-' + clave) ? '1' : '0';
  });
}

// Activa/desactiva la animación de boca (bucle de 180 ms por paso)
function mascotaHablando(activa) {
  mascotaEstado.hablando = activa;
  clearInterval(mascotaEstado.timerHabla);
  if (activa) {
    mascotaEstado.boca = true;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      mascotaEstado.timerHabla = setInterval(() => {
        mascotaEstado.boca = !mascotaEstado.boca;
        pintarMascota();
      }, 180);
    }
  } else {
    mascotaEstado.boca = false;
  }
  pintarMascota();
  const caja = $('mascota');
  if (caja) caja.classList.toggle('hablando', activa);  // brillo al hablar
}

// Parpadeo independiente (aprox. 1 parpadeo cada 4.5 s)
function iniciarParpadeoMascota() {
  setInterval(() => {
    if (document.hidden || mascotaEstado.ojos || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    mascotaEstado.ojos = true; pintarMascota();
    setTimeout(() => { mascotaEstado.ojos = false; pintarMascota(); }, 170);
  }, 4500);
}

// Al tocar la mascota se repite la última frase del asistente
function repetirFraseMascota() {
  if (mascotaEstado.ultimoTexto) hablar(mascotaEstado.ultimoTexto);
}

/* ============================================================================
 * 4. ASISTENTE DE VOZ (SpeechSynthesis API)
 * ========================================================================== */
// Elige la voz más natural disponible para el idioma pedido

Object.assign(F, { pintarMascota, mascotaHablando, iniciarParpadeoMascota, repetirFraseMascota });
})(globalThis.FuelFlow);
