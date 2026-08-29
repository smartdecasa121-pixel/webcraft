// ============================================================
// auth.js - Habla con el backend (server/) para:
//   - Crear cuenta / iniciar sesión (usuario + contraseña)
//   - Guardar y cargar el progreso del jugador
//
// El token de sesión se guarda en localStorage del navegador,
// así la próxima vez que entrás no hace falta loguearte de nuevo
// (a menos que hayas cerrado sesión).
// ============================================================

// 👉 Esta URL se reemplaza por la del backend real una vez desplegado en Render.
API_BASE_URL = 'https://webcraft-server-jsx9.onrender.com';

const TOKEN_KEY = 'webcraft_token';
const USERNAME_KEY = 'webcraft_username';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function getUsername() { return localStorage.getItem(USERNAME_KEY); }

export function saveSession(token, username) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de red');
  return data;
}

export async function register(username, password) {
  const data = await request('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  saveSession(data.token, data.username);
  return data;
}

export async function login(username, password) {
  const data = await request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  saveSession(data.token, data.username);
  return data;
}

// Trae el progreso guardado del usuario logueado (o null si nunca guardó nada)
export async function loadGame() {
  const data = await request('/api/save', { method: 'GET' });
  return data.save || null;
}

// Guarda el progreso actual del usuario logueado
export async function saveGame(stateObj) {
  return request('/api/save', {
    method: 'POST',
    body: JSON.stringify({ data: stateObj }),
  });
}
