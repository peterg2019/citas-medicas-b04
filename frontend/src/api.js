const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

let alExpirarSesion = null;
// App registra aquí qué hacer cuando el servidor responde 401 (sesión vencida o usuario desactivado)
export const registrarManejoSesion = (fn) => { alExpirarSesion = fn; };

export async function api(path, { token, body, headers, ...options } = {}) {
  const cabeceras = { 'Content-Type': 'application/json', ...(headers || {}) };
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: cabeceras,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté activo y que VITE_API_URL sea correcto.');
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const detalle = Array.isArray(datos.detalles) && datos.detalles.length
      ? ` ${datos.detalles.map((d) => d.mensaje).join(' ')}`
      : '';
    const error = new Error(`${datos.error || datos.mensaje || `Error HTTP ${respuesta.status}`}${detalle}`);
    error.status = respuesta.status;
    if (respuesta.status === 401 && token && alExpirarSesion) alExpirarSesion(error);
    throw error;
  }
  return datos;
}
