import express from 'express';
import { verificarCredenciales, generarToken, verificarToken, actualizarCredenciales, actualizarTema } from '../services/adminAuth.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] POST /login - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  const bodyParaLog = { ...req.body };
  if (bodyParaLog.password) bodyParaLog.password = '[REDACTED]';
  if (bodyParaLog.currentPassword) bodyParaLog.currentPassword = '[REDACTED]';
  if (bodyParaLog.newPassword) bodyParaLog.newPassword = '[REDACTED]';
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] POST /login - req.body:', bodyParaLog);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] POST /login - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] POST /login - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] POST /login - req.admin (no aplica en este endpoint, es previo a requireAuth):', req.admin);

  const { username, password } = req.body;

  if (!username?.trim() || !password) {
    const responseBody400 = { error: 'Ingresá el usuario y la contraseña.' };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] POST /login - respondiendo status 400:', responseBody400);
    return res.status(400).json(responseBody400);
  }

  try {
    console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] POST /login - llamando a verificarCredenciales (servicio, no es supabase.from directo) con username:', username.trim());
    const user = await verificarCredenciales(username.trim(), password);
    console.log('✅ [DEBUG-ROUTES-ADMINAUTH] POST /login - resultado verificarCredenciales:', user);
    if (!user) {
      const responseBody401 = { error: 'Usuario o contraseña incorrectos.' };
      console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] POST /login - respondiendo status 401:', responseBody401);
      return res.status(401).json(responseBody401);
    }

    const token = generarToken(user);
    console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] POST /login - token generado (longitud, no se loguea el valor completo por seguridad):', token?.length);
    console.log(`[ADMIN AUTH] Login exitoso: ${user.username} (${user.role})`);
    const responseBody200 = {
      success: true,
      token,
      username: user.username,
      role: user.role,
      sucursalId: user.sucursalId,
      sucursalNombre: user.sucursalNombre || null,
      theme: user.theme || 'light'
    };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] POST /login - respondiendo status 200:', { ...responseBody200, token: '[TOKEN OMITIDO EN LOG]' });
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-ADMINAUTH] POST /login - error capturado en catch:', error);
    console.error('❌ [DEBUG-ROUTES-ADMINAUTH] POST /login - error.message:', error.message);
    console.error('❌ [DEBUG-ROUTES-ADMINAUTH] POST /login - error.stack:', error.stack);
    console.error('[ADMIN AUTH] Error en login:', error.message);
    const responseBody500 = { error: 'Error interno verificando las credenciales.' };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] POST /login - respondiendo status 500:', responseBody500);
    res.status(500).json(responseBody500);
  }
});

// Exige un JWT válido (emitido por /login) en el header Authorization. Se
// exporta para que otras rutas de administración (ej. gestión de empleados)
// puedan protegerse con el mismo middleware.
export const requireAuth = (req, res, next) => {
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAuth - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAuth - req.body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAuth - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAuth - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAuth - req.admin (todavia no asignado en este punto):', req.admin);

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAuth - authHeader presente:', !!authHeader, '| token extraido:', !!token);
  const payload = token && verificarToken(token);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAuth - payload decodificado del JWT:', payload);

  if (!payload) {
    const responseBody401 = { error: 'Sesión inválida o expirada. Volvé a iniciar sesión.' };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] requireAuth - respondiendo status 401:', responseBody401);
    return res.status(401).json(responseBody401);
  }

  req.admin = payload;
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAuth - req.admin asignado (role, sucursalId, username, sub):', req.admin);
  next();
};

// Exige, además de una sesión válida, que sea específicamente el
// administrador (no un empleado). Protege gestión de empleados, sucursales
// y las propias credenciales de admin.
export const requireAdminRole = (req, res, next) => {
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAdminRole - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAdminRole - req.body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAdminRole - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAdminRole - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] requireAdminRole - req.admin (role, sucursalId, username, sub):', req.admin);
  if (req.admin?.role !== 'admin') {
    const responseBody403 = { error: 'Esta acción es solo para el administrador.' };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] requireAdminRole - respondiendo status 403:', responseBody403);
    return res.status(403).json(responseBody403);
  }
  next();
};

// El administrador es un rol de solo supervisión: ve todos los chats de
// todas las sucursales en tiempo real pero no opera el flujo de atención.
// Protege mensajería, cotizador y toma/cierre/devolución de chats (el staff
// de sucursal es el único que puede ejecutar estas acciones).
export const blockAdminRole = (req, res, next) => {
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] blockAdminRole - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] blockAdminRole - req.body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] blockAdminRole - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] blockAdminRole - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] blockAdminRole - req.admin (role, sucursalId, username, sub):', req.admin);
  if (req.admin?.role === 'admin') {
    const responseBody403 = { error: 'El administrador tiene acceso de solo supervisión y no puede operar el flujo de atención al chat.' };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] blockAdminRole - respondiendo status 403:', responseBody403);
    return res.status(403).json(responseBody403);
  }
  next();
};

router.put('/update-credentials', requireAuth, requireAdminRole, async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  const bodyParaLog = { ...req.body };
  if (bodyParaLog.password) bodyParaLog.password = '[REDACTED]';
  if (bodyParaLog.currentPassword) bodyParaLog.currentPassword = '[REDACTED]';
  if (bodyParaLog.newPassword) bodyParaLog.newPassword = '[REDACTED]';
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - req.body:', bodyParaLog);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - req.admin (role, sucursalId, username, sub):', req.admin);

  const { currentPassword, newUsername, newPassword } = req.body;

  if (!currentPassword) {
    const responseBody400a = { error: 'Ingresá tu contraseña actual para confirmar el cambio.' };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - respondiendo status 400:', responseBody400a);
    return res.status(400).json(responseBody400a);
  }
  if (!newUsername?.trim() && !newPassword?.trim()) {
    const responseBody400b = { error: 'Indicá un nuevo usuario y/o una nueva contraseña.' };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - respondiendo status 400:', responseBody400b);
    return res.status(400).json(responseBody400b);
  }

  try {
    console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - llamando a actualizarCredenciales (servicio, no es supabase.from directo) con req.admin.sub:', req.admin.sub, '| newUsername:', newUsername, '| newPassword:', newPassword ? '[REDACTED]' : newPassword);
    const updated = await actualizarCredenciales(req.admin.sub, { currentPassword, newUsername, newPassword });
    console.log('✅ [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - resultado actualizarCredenciales:', updated);
    // Reemitimos el token con el username actualizado (el JWT no lleva la
    // contraseña, así que un cambio de solo contraseña no invalida la sesión).
    const token = generarToken({ id: updated.id, username: updated.username, role: 'admin', sucursalId: null });
    console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - token generado (longitud, no se loguea el valor completo por seguridad):', token?.length);
    console.log(`[ADMIN AUTH] Credenciales actualizadas para el admin ${updated.id}.`);
    const responseBody200 = { success: true, username: updated.username, token };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - respondiendo status 200:', { ...responseBody200, token: '[TOKEN OMITIDO EN LOG]' });
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - error capturado en catch:', error);
    console.error('❌ [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - error.message:', error.message);
    console.error('❌ [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - error.stack:', error.stack);
    console.error('[ADMIN AUTH] Error actualizando credenciales:', error.message);
    const mensaje = error.code === '23505' ? 'Ese nombre de usuario ya está en uso.' : (error.message || 'No se pudieron actualizar las credenciales.');
    const responseBody400c = { error: mensaje };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] PUT /update-credentials - respondiendo status 400:', responseBody400c);
    res.status(400).json(responseBody400c);
  }
});

// Preferencia de tema: cualquier cuenta logueada (admin o staff) puede
// cambiar la suya propia; no requiere requireAdminRole porque es una
// preferencia personal, no una configuración global del sistema.
router.put('/theme', requireAuth, async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-ADMINAUTH] PUT /theme - req.body:', req.body, '| req.admin:', req.admin);
  const { theme } = req.body;

  if (theme !== 'light' && theme !== 'dark') {
    const responseBody400 = { error: 'El tema debe ser "light" o "dark".' };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] PUT /theme - respondiendo status 400:', responseBody400);
    return res.status(400).json(responseBody400);
  }

  try {
    await actualizarTema(req.admin.sub, req.admin.role, theme);
    console.log(`[ADMIN AUTH] Tema actualizado para ${req.admin.username} (${req.admin.role}): ${theme}`);
    const responseBody200 = { success: true, theme };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] PUT /theme - respondiendo status 200:', responseBody200);
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-ADMINAUTH] PUT /theme - error:', error);
    console.error('[ADMIN AUTH] Error actualizando el tema:', error.message);
    const responseBody400 = { error: error.message || 'No se pudo guardar la preferencia de tema.' };
    console.log('🔚 [DEBUG-ROUTES-ADMINAUTH] PUT /theme - respondiendo status 400:', responseBody400);
    res.status(400).json(responseBody400);
  }
});

export default router;
