// Android: set PRIME_API_BASE_URL at build time to your HTTPS API endpoint.
export const API_BASE_URL = '/api/v1';

/**
 * Credenciales de la cuenta de demostración local.
 *
 * Solo se publican en el entorno de demostración de FuelFlow V8. En cualquier
 * otro despliegue deben quedar vacías: el bloque "Cuenta de demostración" de la
 * pantalla de acceso no se renderiza y no se expone ninguna contraseña.
 *
 * La decisión se toma en el build, no en el navegador, para que un despliegue
 * real no sirva la credencial aunque se inspeccione el JavaScript.
 */
const DEMO_ENABLED =
  typeof __FUELFLOW_DEMO__ !== 'undefined' && __FUELFLOW_DEMO__ === true;

export const DEMO_CREDENTIALS = DEMO_ENABLED
  ? { email: 'demo@primaxprime.pe', password: 'Prime123' }
  : null;

export const DEMO_PASSWORD = DEMO_CREDENTIALS ? DEMO_CREDENTIALS.password : '';