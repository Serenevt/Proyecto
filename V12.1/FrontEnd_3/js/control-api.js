export function createControlApi(fetchImpl, baseUrl = '/api/v1') {
  async function request(path, options = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.message || 'No se pudo completar la solicitud.');
      error.status = response.status;
      throw error;
    }
    return body;
  }
  return Object.freeze({
    request,
    login: (credentials) => request('/control/login', { method: 'POST', body: JSON.stringify(credentials) }),
    session: () => request('/control/session'),
    logout: () => request('/control/logout', { method: 'POST' }),
  });
}
