const TOKEN_KEY = 'botsito_admin_token';
const USERNAME_KEY = 'botsito_admin_username';
const ROLE_KEY = 'botsito_admin_role';
const SUCURSAL_ID_KEY = 'botsito_admin_sucursal_id';
const SUCURSAL_NOMBRE_KEY = 'botsito_admin_sucursal_nombre';
const THEME_KEY = 'botsito_admin_theme';

export const getAdminToken = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token;
};

export const getAdminUsername = () => {
  const username = localStorage.getItem(USERNAME_KEY);
  return username;
};

// 'admin' ve y gestiona todo; 'staff' queda acotado a su propia sucursal.
export const getAdminRole = () => {
  const role = localStorage.getItem(ROLE_KEY) || 'admin';
  return role;
};

export const isAdminRole = () => {
  const result = getAdminRole() === 'admin';
  return result;
};

export const getStaffSucursalId = () => {
  const result = localStorage.getItem(SUCURSAL_ID_KEY) || null;
  return result;
};

export const getStaffSucursalNombre = () => {
  const result = localStorage.getItem(SUCURSAL_NOMBRE_KEY) || null;
  return result;
};

// Prende/apaga la clase "dark" en <html> (ver el @custom-variant en
// src/index.css) y persiste la elección en localStorage, para que sobreviva
// a un F5 sin depender de la red. Es la única función que realmente pinta el
// modo oscuro; todo lo demás en este archivo es ida y vuelta con el backend
// para que la preferencia quede atada a la cuenta, no al navegador.
export const applyTheme = (theme) => {
  const esOscuro = theme === 'dark';
  document.documentElement.classList.toggle('dark', esOscuro);
  localStorage.setItem(THEME_KEY, esOscuro ? 'dark' : 'light');
};

export const getTheme = () => localStorage.getItem(THEME_KEY) || 'light';

export const setAdminSession = (token, username, role = 'admin', sucursalId = null, sucursalNombre = null, theme = 'light') => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
  localStorage.setItem(ROLE_KEY, role);
  if (sucursalId) localStorage.setItem(SUCURSAL_ID_KEY, sucursalId);
  else localStorage.removeItem(SUCURSAL_ID_KEY);
  if (sucursalNombre) localStorage.setItem(SUCURSAL_NOMBRE_KEY, sucursalNombre);
  else localStorage.removeItem(SUCURSAL_NOMBRE_KEY);
  // Se pisa el theme que hubiera quedado de una cuenta anterior en este
  // mismo navegador (ver [[dark-mode-por-cuenta]]: la preferencia vive en la
  // cuenta, no en el dispositivo) con la que trae esta cuenta desde la DB.
  applyTheme(theme);
};

export const clearAdminSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(SUCURSAL_ID_KEY);
  localStorage.removeItem(SUCURSAL_NOMBRE_KEY);
  // El tema NO se borra: la próxima cuenta que loguee en este navegador va a
  // pisarlo con el suyo propio vía setAdminSession -> applyTheme. Mientras
  // tanto, no tiene sentido volver a claro apenas alguien cierra sesión.
};

// Fetch con el header Authorization ya puesto, para llamar a rutas
// protegidas de /api/admin sin repetir el boilerplate en cada lugar.
export const adminFetch = (url, options = {}) => {
  const token = getAdminToken();
  const API_URL = import.meta.env.VITE_API_URL || '';
  const fullUrl = url.startsWith('/') ? `${API_URL}${url}` : url;
  const promise = fetch(fullUrl, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  promise
    .catch((err) => console.error('❌ [DEBUG-LIB-ADMINAUTH] adminFetch() — error de red:', err));
  return promise;
};
