const API_BASE = '/api';

export function getToken() {
  return localStorage.getItem('presensi_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('presensi_token', token);
  else localStorage.removeItem('presensi_token');
}

export function getCurrentUser() {
  const user = localStorage.getItem('presensi_user');
  try {
    return user ? JSON.parse(user) : null;
  } catch (e) {
    return null;
  }
}

export function setCurrentUser(user) {
  if (user) localStorage.setItem('presensi_user', JSON.stringify(user));
  else localStorage.removeItem('presensi_user');
}

export async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data.message || data.error || 'Terjadi kesalahan sistem.';
    const err = new Error(errorMsg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
