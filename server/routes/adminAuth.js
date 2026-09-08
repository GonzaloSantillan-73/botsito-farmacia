import express from 'express';
import { verificarCredenciales, generarToken, verificarToken, actualizarCredenciales } from '../services/adminAuth.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Ingresá el usuario y la contraseña.' });
  }

  try {
    const user = await verificarCredenciales(username.trim(), password);
    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const token = generarToken(user);
    console.log(`[ADMIN AUTH] Login exitoso: ${user.username} (${user.role})`);
    res.status(200).json({
      success: true,
      token,
      username: user.username,
      role: user.role,
      sucursalId: user.sucursalId,
      sucursalNombre: user.sucursalNombre || null
    });
  } catch (error) {
    console.error('[ADMIN AUTH] Error en login:', error.message);
    res.status(500).json({ error: 'Error interno verificando las credenciales.' });
  }
});

// Exige un JWT válido (emitido por /login) en el header Authorization. Se
// exporta para que otras rutas de administración (ej. gestión de empleados)
// puedan protegerse con el mismo middleware.
export const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = token && verificarToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a iniciar sesión.' });
  }

  req.admin = payload;
  next();
};

// Exige, además de una sesión válida, que sea específicamente el
// administrador (no un empleado). Protege gestión de empleados, sucursales
// y las propias credenciales de admin.
export const requireAdminRole = (req, res, next) => {
  if (req.admin?.role !== 'admin') {
    return res.status(403).json({ error: 'Esta acción es solo para el administrador.' });
  }
  next();
};

router.put('/update-credentials', requireAuth, requireAdminRole, async (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;

  if (!currentPassword) {
    return res.status(400).json({ error: 'Ingresá tu contraseña actual para confirmar el cambio.' });
  }
  if (!newUsername?.trim() && !newPassword?.trim()) {
    return res.status(400).json({ error: 'Indicá un nuevo usuario y/o una nueva contraseña.' });
  }

  try {
    const updated = await actualizarCredenciales(req.admin.sub, { currentPassword, newUsername, newPassword });
    // Reemitimos el token con el username actualizado (el JWT no lleva la
    // contraseña, así que un cambio de solo contraseña no invalida la sesión).
    const token = generarToken({ id: updated.id, username: updated.username, role: 'admin', sucursalId: null });
    console.log(`[ADMIN AUTH] Credenciales actualizadas para el admin ${updated.id}.`);
    res.status(200).json({ success: true, username: updated.username, token });
  } catch (error) {
    console.error('[ADMIN AUTH] Error actualizando credenciales:', error.message);
    const mensaje = error.code === '23505' ? 'Ese nombre de usuario ya está en uso.' : (error.message || 'No se pudieron actualizar las credenciales.');
    res.status(400).json({ error: mensaje });
  }
});

export default router;
