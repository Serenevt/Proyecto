export function registerView() {
  return `<section class="login-screen register-screen" aria-labelledby="register-title">
    <div class="login-brand brand"><img src="assets/primax.jpg" alt="Primax"><span>PRIME</span></div>
    <div class="login-heading"><span class="eyebrow">BIENVENIDO A PRIME</span><h1 id="register-title">Crear cuenta</h1><p>Tu membresía y tus beneficios, en un solo lugar.</p></div>
    <form id="register-form">
      <label for="register-name">Nombre</label><input id="register-name" name="name" autocomplete="name" maxlength="80" required>
      <label for="register-email">Correo</label><input id="register-email" name="email" type="email" inputmode="email" autocomplete="username" maxlength="254" autocapitalize="none" spellcheck="false" required>
      <label for="register-password">Contraseña</label><div class="password-field"><input id="register-password" name="password" type="password" autocomplete="new-password" minlength="10" maxlength="72" aria-describedby="password-help" required><button type="button" class="password-toggle" data-toggle-password aria-controls="register-password" aria-pressed="false">Mostrar</button></div>
      <p id="password-help" class="fine-print">Usa al menos 10 caracteres. Máximo 72 bytes.</p>
      <label for="document-type">Tipo de documento (opcional)</label><select id="document-type" data-document-type><option value="dni">DNI</option><option value="passport">Pasaporte</option></select>
      <div data-identity="dni"><label for="register-dni">DNI</label><input id="register-dni" name="dni" inputmode="numeric" pattern="[0-9]{8}" maxlength="8"></div>
      <div data-identity="passport" hidden><label for="register-passport">Pasaporte</label><input id="register-passport" name="passport" pattern="[A-Za-z0-9]{5,20}" maxlength="20" autocapitalize="characters" disabled></div>
      <p class="fine-print">Elige DNI o pasaporte. También puedes crear tu cuenta sin documento.</p>
      <details><summary>Datos para comprobantes (opcional)</summary>

        <label for="register-ruc">RUC</label><input id="register-ruc" name="ruc" inputmode="numeric" pattern="[0-9]{11}" maxlength="11">
        <label for="register-business">Razón social</label><input id="register-business" name="businessName" maxlength="160">
      </details>
      <p class="fine-print">Puedes agregar tu vehículo después de crear tu cuenta.</p>
      <p class="form-error" role="alert"></p><button class="primary" type="submit">Crear cuenta</button>
    </form>
    <p class="auth-switch">¿Ya tienes una cuenta? <a href="#login">Iniciar sesión</a></p>
  </section>`;
}
