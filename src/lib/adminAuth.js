const TOKEN_KEY = 'botsito_admin_token';
const USERNAME_KEY = 'botsito_admin_username';
const ROLE_KEY = 'botsito_admin_role';
const SUCURSAL_ID_KEY = 'botsito_admin_sucursal_id';
const SUCURSAL_NOMBRE_KEY = 'botsito_admin_sucursal_nombre';
const THEME_KEY = 'botsito_admin_theme';

export const getAdminToken = () => {
  console.log('🔍 [DEBUG-LIB-ADMINAUTH] getAdminToken() — sin parámetros');
  const token = localStorage.getItem(TOKEN_KEY);
  console.log('✅ [DEBUG-LIB-ADMINAUTH] getAdminToken() — token presente:', !!token, '| primeros 8 caracteres:', token ? token.slice(0, 8) + '...' : null);
  return token;
};

export const getAdminUsername = () => {
  console.log('🔍 [DEBUG-LIB-ADMINAUTH] getAdminUsername() — sin parámetros');
  const username = localStorage.getItem(USERNAME_KEY);
  console.log('✅ [DEBUG-LIB-ADMINAUTH] getAdminUsername() — return:', username);
  return username;
};

// 'admin' ve y gestiona todo; 'staff' queda acotado a su propia sucursal.
export const getAdminRole = () => {
  console.log('🔍 [DEBUG-LIB-ADMINAUTH] getAdminRole() — sin parámetros');
  const role = localStorage.getItem(ROLE_KEY) || 'admin';
  console.log('✅ [DEBUG-LIB-ADMINAUTH] getAdminRole() — return:', role);
  return role;
};

export const isAdminRole = () => {
  console.log('🔍 [DEBUG-LIB-ADMINAUTH] isAdminRole() — sin parámetros');
  const result = getAdminRole() === 'admin';
  console.log('✅ [DEBUG-LIB-ADMINAUTH] isAdminRole() — return:', result);
  return result;
};

export const getStaffSucursalId = () => {
  console.log('🔍 [DEBUG-LIB-ADMINAUTH] getStaffSucursalId() — sin parámetros');
  const result = localStorage.getItem(SUCURSAL_ID_KEY) || null;
  console.log('✅ [DEBUG-LIB-ADMINAUTH] getStaffSucursalId() — return:', result);
  return result;
};

export const getStaffSucursalNombre = () => {
  console.log('🔍 [DEBUG-LIB-ADMINAUTH] getStaffSucursalNombre() — sin parámetros');
  const result = localStorage.getItem(SUCURSAL_NOMBRE_KEY) || null;
  console.log('✅ [DEBUG-LIB-ADMINAUTH] getStaffSucursalNombre() — return:', result);
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
  console.log('🔍 [DEBUG-LIB-ADMINAUTH] setAdminSession() — username:', username, '| role:', role, '| sucursalId:', sucursalId, '| sucursalNombre:', sucursalNombre, '| theme:', theme, '| token presente:', !!token, '| primeros 8 caracteres:', token ? token.slice(0, 8) + '...' : null);
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
  console.log('✅ [DEBUG-LIB-ADMINAUTH] setAdminSession() — sesión guardada (return void)');
};

export const clearAdminSession = () => {
  console.log('🔍 [DEBUG-LIB-ADMINAUTH] clearAdminSession() — sin parámetros');
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(SUCURSAL_ID_KEY);
  localStorage.removeItem(SUCURSAL_NOMBRE_KEY);
  // El tema NO se borra: la próxima cuenta que loguee en este navegador va a
  // pisarlo con el suyo propio vía setAdminSession -> applyTheme. Mientras
  // tanto, no tiene sentido volver a claro apenas alguien cierra sesión.
  console.log('✅ [DEBUG-LIB-ADMINAUTH] clearAdminSession() — sesión limpiada (return void)');
};

// Fetch con el header Authorization ya puesto, para llamar a rutas
// protegidas de /api/admin sin repetir el boilerplate en cada lugar.
export const adminFetch = (url, options = {}) => {
  console.log('🔍 [DEBUG-LIB-ADMINAUTH] adminFetch() — url:', url, '| options:', options);
  const token = getAdminToken();
  console.log('🔍 [DEBUG-LIB-ADMINAUTH] adminFetch() — token presente:', !!token, '| primeros 8 caracteres:', token ? token.slice(0, 8) + '...' : null);
  console.log('📡 [DEBUG-LIB-ADMINAUTH] adminFetch() — disparando fetch a:', url);
  const promise = fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  promise
    .then((res) => console.log('📡 [DEBUG-LIB-ADMINAUTH] adminFetch() — respuesta:', { url, ok: res.ok, status: res.status }))
    .catch((err) => console.error('❌ [DEBUG-LIB-ADMINAUTH] adminFetch() — error de red:', err));
  console.log('✅ [DEBUG-LIB-ADMINAUTH] adminFetch() — return (Promise<Response>)');
  return promise;
};
