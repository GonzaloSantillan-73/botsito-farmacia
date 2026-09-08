const TOKEN_KEY = 'botsito_admin_token';
const USERNAME_KEY = 'botsito_admin_username';
const ROLE_KEY = 'botsito_admin_role';
const SUCURSAL_ID_KEY = 'botsito_admin_sucursal_id';
const SUCURSAL_NOMBRE_KEY = 'botsito_admin_sucursal_nombre';

export const getAdminToken = () => localStorage.getItem(TOKEN_KEY);
export const getAdminUsername = () => localStorage.getItem(USERNAME_KEY);
// 'admin' ve y gestiona todo; 'staff' queda acotado a su propia sucursal.
export const getAdminRole = () => localStorage.getItem(ROLE_KEY) || 'admin';
export const isAdminRole = () => getAdminRole() === 'admin';
export const getStaffSucursalId = () => localStorage.getItem(SUCURSAL_ID_KEY) || null;
export const getStaffSucursalNombre = () => localStorage.getItem(SUCURSAL_NOMBRE_KEY) || null;

export const setAdminSession = (token, username, role = 'admin', sucursalId = null, sucursalNombre = null) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
  localStorage.setItem(ROLE_KEY, role);
  if (sucursalId) localStorage.setItem(SUCURSAL_ID_KEY, sucursalId);
  else localStorage.removeItem(SUCURSAL_ID_KEY);
  if (sucursalNombre) localStorage.setItem(SUCURSAL_NOMBRE_KEY, sucursalNombre);
  else localStorage.removeItem(SUCURSAL_NOMBRE_KEY);
};

export const clearAdminSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(SUCURSAL_ID_KEY);
  localStorage.removeItem(SUCURSAL_NOMBRE_KEY);
};

// Fetch con el header Authorization ya puesto, para llamar a rutas
// protegidas de /api/admin sin repetir el boilerplate en cada lugar.
export const adminFetch = (url, options = {}) => {
  const token = getAdminToken();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
};
