const sessionKey = 'prime_authenticated';
const demo = { email: 'demo@primaxprime.pe', password: 'Prime123', name: 'Diego' };

// Simulación local: sustituir este servicio por autenticación real en el futuro.
export const authService = {
  isAuthenticated() {
    try { return globalThis.localStorage?.getItem(sessionKey) === 'true'; }
    catch { return false; }
  },
  login(email, password) {
    if (email !== demo.email || password !== demo.password) {
      throw Error('El correo o la contraseña no son correctos. Revisa tus datos e inténtalo de nuevo.');
    }
    try {
      globalThis.localStorage.setItem(sessionKey, 'true');
      if (!this.isAuthenticated()) throw Error();
    } catch {
      throw Error('No pudimos guardar tu sesión. Permite el almacenamiento local e inténtalo de nuevo.');
    }
    return { name: demo.name, email: demo.email };
  },
  logout() {
    try {
      globalThis.localStorage.removeItem(sessionKey);
      if (this.isAuthenticated()) throw Error();
    } catch {
      throw Error('No pudimos cerrar tu sesión. Permite el almacenamiento local e inténtalo de nuevo.');
    }
  }
};
