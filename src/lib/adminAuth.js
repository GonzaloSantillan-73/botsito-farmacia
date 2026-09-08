const TOKEN_KEY = 'botsito_admin_token';
const USERNAME_KEY = 'botsito_admin_username';

export const getAdminToken = () => localStorage.getItem(TOKEN_KEY);
export const getAdminUsername = () => localStorage.getItem(USERNAME_KEY);

export const setAdminSession = (token, username) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
};

export const clearAdminSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
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
