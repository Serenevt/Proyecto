(function (F) {
  'use strict';
  let current = null, callback = null;
  const stack = [];
  const focusables = element => [...element.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
    .filter(control => control.getClientRects().length);
  function setBackground() {
    const open = current !== null;
    document.querySelector('.app-shell').inert = open;
    document.body.classList.toggle('dialog-open', open);
  }
  F.dialogs = {
    get current() { return current; },
    isOpen(id) { return current === id || stack.some(entry => entry.id === id); },
    open(id) {
      if (current === id) return;
      stack.push({ id: current, focus: document.activeElement });
      if (current) F.$(current).classList.add('hidden');
      current = id;
      const overlay = F.$(id);
      overlay.classList.remove('hidden');
      setBackground();
      (focusables(overlay)[0] || overlay).focus();
    },
    close(id) {
      if (current !== id) return;
      F.$(id).classList.add('hidden');
      const previous = stack.pop();
      current = previous?.id || null;
      if (current) F.$(current).classList.remove('hidden');
      setBackground();
      if (previous?.focus?.isConnected) previous.focus.focus({ preventScroll: true });
    },
    dismiss() {
      if (current === 'modal-overlay' && callback) return false; // Authorization needs explicit acknowledgement.
      if (current === 'help-overlay') { F.cancelarAsistencia(); return true; }
      if (current) { this.close(current); return true; }
      return false;
    },
    init() {
      document.addEventListener('keydown', event => {
        if (!current) return;
        if (event.key === 'Escape') { event.preventDefault(); this.dismiss(); }
        if (event.key !== 'Tab') return;
        const controls = focusables(F.$(current));
        if (!controls.length) return event.preventDefault();
        const index = controls.indexOf(document.activeElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1).focus(); }
        else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
      });
    },
  };
  F.mostrarModal = (title, message, icon = 'ℹ️', onConfirm = null) => {
    F.$('modal-title').textContent = title; F.$('modal-msg').textContent = message;
    F.$('modal-icon').textContent = icon; callback = onConfirm;
    F.dialogs.open('modal-overlay');
  };
  F.cerrarModal = () => {
    const confirm = callback; callback = null;
    F.dialogs.close('modal-overlay');
    if (confirm) confirm();
  };
  F.abrirIdiomas = () => F.dialogs.open('lang-overlay');
  F.cerrarIdiomas = () => F.dialogs.close('lang-overlay');
})(globalThis.FuelFlow);
