(function (F) {
'use strict';
const { state, $, mascotaEstado } = F;
const { CODIGO_IDIOMA, LOCALE_IDIOMA } = F.config;
const mascotaHablando = (...args) => F.mascotaHablando(...args);

function vozIdeal(codigo) {
  if (!('speechSynthesis' in window)) return null;
  const preferidas = ['natural', 'neural', 'google', 'samantha', 'monica', 'jorge', 'helena', 'sabina', 'diego', 'paulina'];
  let voces = [];
  try { voces = window.speechSynthesis.getVoices() || []; } catch (e) { return null; }
  const base = (codigo || '').slice(0, 2).toLowerCase();
  let cands = voces.filter((v) => v.lang && v.lang.toLowerCase().indexOf(base) === 0);
  // Quechua: si no hay voz 'qu', se usa una voz española (fallback)
  if (!cands.length && base === 'qu') cands = voces.filter((v) => v.lang && v.lang.toLowerCase().indexOf('es') === 0);
  if (!cands.length) return null;
  for (const p of preferidas) {
    const hallada = cands.find((v) => v.name.toLowerCase().indexOf(p) !== -1);
    if (hallada) return hallada;
  }
  return cands.find((v) => v.localService) || cands[0];
}

let timerSeguridadVoz = null;
let hablaToken = 0;   // identificador de la frase activa (evita que el
                      // onend de una frase cancelada apague la animación)

function hablar(texto) {
  mascotaEstado.ultimoTexto = texto;
  // Actualiza la línea visible siempre, aunque no haya audio
  $('voice-status-text').textContent = '🎙️ ' + texto.slice(0, 60) + (texto.length > 60 ? '…' : '');
  if (!state.vozActivada || document.hidden) return;
  try {
    if (!('speechSynthesis' in window)) return; // sin soporte: solo texto
    const token = ++hablaToken;
    window.speechSynthesis.cancel();   // cancela la frase anterior (su onend se ignora por token)

    const u = new SpeechSynthesisUtterance(texto);
    const codigo = CODIGO_IDIOMA[state.idioma] || 'es-PE';
    const voz = vozIdeal(codigo);
    if (voz && voz.lang) { u.voice = voz; u.lang = voz.lang; }
    else { u.lang = (state.idioma === 'qu') ? 'es-PE' : codigo; }  // fallback quechua → español
    u.rate = 0.95;   // un poco más pausado, menos robótico
    u.pitch = 1.1;   // tono más cálido y amigable

    // Boca sincronizada con los eventos del audio (solo si sigue siendo la frase activa)
    u.onstart = () => { if (token === hablaToken) mascotaHablando(true); };
    u.onend = () => { if (token === hablaToken) mascotaHablando(false); };
    u.onerror = () => { if (token === hablaToken) mascotaHablando(false); };

    mascotaHablando(true);          // respaldo si onstart no dispara
    window.speechSynthesis.speak(u);

    // Red de seguridad por si onend nunca llega
    clearTimeout(timerSeguridadVoz);
    timerSeguridadVoz = setTimeout(() => { if (token === hablaToken) mascotaHablando(false); }, 15000);
  } catch (e) {
    mascotaHablando(false);         // voz no disponible: se continúa sin audio
  }
}

// ---------- Reloj del footer ----------
function iniciarReloj() {
  const tick = () => {
    $('status-clock').textContent = new Date().toLocaleTimeString(LOCALE_IDIOMA[state.idioma] || 'es-PE');
  };
  tick(); setInterval(tick, 1000);
}

Object.assign(F, { vozIdeal, hablar, iniciarReloj });
})(globalThis.FuelFlow);
