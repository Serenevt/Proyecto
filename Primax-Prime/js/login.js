export function loginView() {
  return `<section class="login-screen" aria-labelledby="login-title">
    <div class="login-brand brand"><img src="assets/primax.jpg" alt="Primax"><span>PRIME</span></div>
    <div class="login-heading"><span class="eyebrow">TU CAMINO EMPIEZA AQUÍ</span><h1 id="login-title">Bienvenido a Primax Prime</h1><p>Ingresa y disfruta tus beneficios en cada parada.</p></div>
    <form id="login-form">
      <label for="login-email">Correo</label><input id="login-email" name="email" type="email" inputmode="email" autocomplete="username" placeholder="tu@correo.pe" required aria-describedby="login-error" autocapitalize="none" spellcheck="false">
      <label for="login-password">Contraseña</label><div class="password-field"><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Ingresa tu contraseña" required aria-describedby="login-error"><button type="button" class="password-toggle" data-toggle-password aria-controls="login-password" aria-pressed="false">Mostrar</button></div>
      <p id="login-error" class="form-error" role="alert"></p><button class="primary" type="submit">Iniciar sesión</button>
    </form>
    <div class="login-demo"><strong>Cuenta de demostración</strong><p>Correo: demo@primaxprime.pe<br>Contraseña: Prime123</p><small>Explora Primax Prime con datos de ejemplo.</small></div>
    <p class="login-footer">Más beneficios en cada camino.<br><span>PRIMAX PRIME</span></p>
  </section>`;
}
