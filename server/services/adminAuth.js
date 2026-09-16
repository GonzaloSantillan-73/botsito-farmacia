import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../supabase.js';

// Fallback para no bloquear esta primera fase si todavía no se configuró la
// variable de entorno: en producción conviene definir ADMIN_JWT_SECRET con un
// valor propio, largo y aleatorio (si no, cada reinicio del server invalida
// las sesiones activas, ya que el secreto cambiaría).
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'botsito-farmacia-admin-dev-secret-cambiar-en-produccion';
const JWT_EXPIRES_IN = '12h';

// Login unificado: primero prueba contra admin_users: si no hay coincidencia
// de usuario, prueba contra staff_users (empleados). Devuelve un objeto con
// forma uniforme para poder generar el token sin importar de qué tabla vino.
export const verificarCredenciales = async (username, password) => {
  console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] verificarCredenciales() — parámetros recibidos:', { username, password: '[REDACTED]' });

  console.log('📡 [DEBUG-SERVICE-ADMINAUTH] Query Supabase → tabla: admin_users, operación: select, filtro: username =', username);
  const { data: admin, error: adminError } = await supabase
    .from('admin_users')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-ADMINAUTH] Resultado query admin_users — data:', admin ? { ...admin, password_hash: '[REDACTED]' } : admin, 'error:', adminError);
  if (adminError) {
    console.error('❌ [DEBUG-SERVICE-ADMINAUTH] verificarCredenciales() — error consultando admin_users:', adminError);
    throw adminError;
  }

  if (admin) {
    console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] verificarCredenciales() — se encontró admin, comparando contraseña (bcrypt.compare, hash no se loguea)');
    const passwordOk = await bcrypt.compare(password, admin.password_hash);
    console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] verificarCredenciales() — contraseña de admin correcta:', passwordOk);
    const resultado = passwordOk ? { id: admin.id, username: admin.username, role: 'admin', sucursalId: null, theme: admin.theme || 'light' } : null;
    console.log('✅ [DEBUG-SERVICE-ADMINAUTH] verificarCredenciales() — valor de retorno (rama admin):', resultado);
    return resultado;
  }

  console.log('📡 [DEBUG-SERVICE-ADMINAUTH] Query Supabase → tabla: staff_users, operación: select (con join sucursales), filtro: username =', username);
  const { data: staff, error: staffError } = await supabase
    .from('staff_users')
    .select('*, sucursales(nombre)')
    .eq('username', username)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-ADMINAUTH] Resultado query staff_users — data:', staff ? { ...staff, password_hash: '[REDACTED]' } : staff, 'error:', staffError);
  if (staffError) {
    console.error('❌ [DEBUG-SERVICE-ADMINAUTH] verificarCredenciales() — error consultando staff_users:', staffError);
    throw staffError;
  }
  if (!staff) {
    console.log('✅ [DEBUG-SERVICE-ADMINAUTH] verificarCredenciales() — no se encontró usuario en ninguna tabla, valor de retorno: null');
    return null;
  }

  console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] verificarCredenciales() — se encontró staff, comparando contraseña (bcrypt.compare, hash no se loguea)');
  const passwordOk = await bcrypt.compare(password, staff.password_hash);
  console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] verificarCredenciales() — contraseña de staff correcta:', passwordOk);
  const resultado = passwordOk
    ? { id: staff.id, username: staff.username, role: 'staff', sucursalId: staff.sucursal_id, sucursalNombre: staff.sucursales?.nombre || null, theme: staff.theme || 'light' }
    : null;
  console.log('✅ [DEBUG-SERVICE-ADMINAUTH] verificarCredenciales() — valor de retorno (rama staff):', resultado);
  return resultado;
};

export const generarToken = (user) => {
  console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] generarToken() — parámetros recibidos:', user);
  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role, sucursalId: user.sucursalId || null },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  console.log('✅ [DEBUG-SERVICE-ADMINAUTH] generarToken() — token generado (primeros 10 caracteres):', token ? token.substring(0, 10) + '...' : token);
  return token;
};

export const verificarToken = (token) => {
  console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] verificarToken() — token recibido (primeros 10 caracteres):', token ? token.toString().substring(0, 10) + '...' : token);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    console.log('✅ [DEBUG-SERVICE-ADMINAUTH] verificarToken() — token válido, payload:', payload);
    return payload;
  } catch (error) {
    console.error('❌ [DEBUG-SERVICE-ADMINAUTH] verificarToken() — error verificando token:', error?.message, error?.stack);
    console.log('✅ [DEBUG-SERVICE-ADMINAUTH] verificarToken() — valor de retorno: null');
    return null;
  }
};

// Cambia usuario/contraseña de la cuenta logueada (admin o staff), en la
// tabla que corresponda según su rol — mismo criterio que actualizarTema()
// más abajo. `userId` siempre es el id de esa misma cuenta (req.admin.sub),
// nunca el de otra: no hay forma de que un empleado cambie las credenciales
// de otro ni de que el admin cambie las de un empleado desde este servicio
// (eso lo maneja server/routes/staff.js, con contraseña nueva sin necesidad
// de la actual, porque ahí el admin gestiona cuentas ajenas).
export const actualizarCredenciales = async (userId, role, { currentPassword, newUsername, newPassword }) => {
  const tabla = role === 'admin' ? 'admin_users' : 'staff_users';
  console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] actualizarCredenciales() — parámetros recibidos:', {
    userId,
    role,
    tabla,
    currentPassword: '[REDACTED]',
    newUsername,
    newPassword: '[REDACTED]'
  });

  console.log('📡 [DEBUG-SERVICE-ADMINAUTH] Query Supabase → tabla:', tabla, ', operación: select, filtro: id =', userId);
  const { data: cuenta, error } = await supabase.from(tabla).select('*').eq('id', userId).single();
  console.log('📡 [DEBUG-SERVICE-ADMINAUTH] Resultado query', tabla, '(select) — data:', cuenta ? { ...cuenta, password_hash: '[REDACTED]' } : cuenta, 'error:', error);
  if (error || !cuenta) {
    console.error('❌ [DEBUG-SERVICE-ADMINAUTH] actualizarCredenciales() — cuenta no encontrada:', error);
    throw new Error('Cuenta no encontrada.');
  }

  console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] actualizarCredenciales() — comparando contraseña actual (bcrypt.compare, hash no se loguea)');
  const passwordOk = await bcrypt.compare(currentPassword, cuenta.password_hash);
  console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] actualizarCredenciales() — contraseña actual correcta:', passwordOk);
  if (!passwordOk) {
    console.error('❌ [DEBUG-SERVICE-ADMINAUTH] actualizarCredenciales() — la contraseña actual no coincide');
    throw new Error('La contraseña actual no es correcta.');
  }

  const updates = { updated_at: new Date().toISOString() };

  if (newUsername && newUsername.trim() && newUsername.trim() !== cuenta.username) {
    updates.username = newUsername.trim();
  }

  if (newPassword && newPassword.trim()) {
    if (newPassword.trim().length < 6) {
      console.error('❌ [DEBUG-SERVICE-ADMINAUTH] actualizarCredenciales() — nueva contraseña demasiado corta');
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
    }
    updates.password_hash = await bcrypt.hash(newPassword.trim(), 10);
  }

  console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] actualizarCredenciales() — updates a aplicar (password_hash omitido si presente):', {
    ...updates,
    password_hash: updates.password_hash ? '[REDACTED]' : undefined
  });

  console.log('📡 [DEBUG-SERVICE-ADMINAUTH] Query Supabase → tabla:', tabla, ', operación: update, filtro: id =', userId);
  const { data: updated, error: updateError } = await supabase
    .from(tabla)
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  console.log('📡 [DEBUG-SERVICE-ADMINAUTH] Resultado query', tabla, '(update) — data:', updated ? { ...updated, password_hash: '[REDACTED]' } : updated, 'error:', updateError);
  if (updateError) {
    console.error('❌ [DEBUG-SERVICE-ADMINAUTH] actualizarCredenciales() — error actualizando credenciales:', updateError);
    throw updateError;
  }

  console.log('✅ [DEBUG-SERVICE-ADMINAUTH] actualizarCredenciales() — valor de retorno:', updated ? { ...updated, password_hash: '[REDACTED]' } : updated);
  return updated;
};

// Guarda la preferencia de tema (claro/oscuro) de la cuenta logueada, en la
// tabla que corresponda según su rol. Es la única preferencia por-cuenta que
// existe hoy, así que no amerita una tabla genérica de "user_settings" (ver
// [[dark-mode-por-cuenta]]).
export const actualizarTema = async (userId, role, theme) => {
  console.log('🔍 [DEBUG-SERVICE-ADMINAUTH] actualizarTema() — parámetros recibidos:', { userId, role, theme });

  if (theme !== 'light' && theme !== 'dark') {
    console.error('❌ [DEBUG-SERVICE-ADMINAUTH] actualizarTema() — theme inválido:', theme);
    throw new Error('El tema debe ser "light" o "dark".');
  }

  const tabla = role === 'admin' ? 'admin_users' : 'staff_users';
  console.log('📡 [DEBUG-SERVICE-ADMINAUTH] Query Supabase → tabla:', tabla, ', operación: update, filtro: id =', userId, ', valores:', { theme });
  const { error } = await supabase
    .from(tabla)
    .update({ theme, updated_at: new Date().toISOString() })
    .eq('id', userId);
  console.log('📡 [DEBUG-SERVICE-ADMINAUTH] Resultado query', tabla, '(update theme) — error:', error);

  if (error) {
    console.error('❌ [DEBUG-SERVICE-ADMINAUTH] actualizarTema() — error guardando el tema:', error);
    throw error;
  }

  console.log('✅ [DEBUG-SERVICE-ADMINAUTH] actualizarTema() — tema actualizado correctamente');
};
