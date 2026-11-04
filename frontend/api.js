/* api.js — cliente de la API. Usa el mismo origen desde donde se sirve la página. */
const API = (() => {
  const base = (location.protocol.startsWith('http') ? location.origin : 'http://localhost:3000');
  const KEY = 'mm-token';
  const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const setToken = (t) => { try { localStorage.setItem(KEY, t || ''); } catch {} };

  async function request(method, path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    const t = getToken();
    if (t) headers.Authorization = 'Bearer ' + t;
    let res;
    try {
      res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    } catch {
      throw { status: 0, error: 'No se pudo conectar con el servidor. Revisa tu conexión.' };
    } finally { clearTimeout(timer); }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      if (res.status === 401) setToken('');
      throw { status: res.status, error: data?.error || 'Algo salió mal. Intenta de nuevo.' };
    }
    return data;
  }

  return {
    getToken, setToken,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    patch: (p, b) => request('PATCH', p, b),
    del: (p) => request('DELETE', p),
  };
})();
