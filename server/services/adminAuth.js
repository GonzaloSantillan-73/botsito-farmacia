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
  const { data: admin, error: adminError } = await supabase
    .from('admin_users')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  if (adminError) throw adminError;

  if (admin) {
    const passwordOk = await bcrypt.compare(password, admin.password_hash);
    return passwordOk ? { id: admin.id, username: admin.username, role: 'admin', sucursalId: null } : null;
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff_users')
    .select('*, sucursales(nombre)')
    .eq('username', username)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!staff) return null;

  const passwordOk = await bcrypt.compare(password, staff.password_hash);
  return passwordOk
    ? { id: staff.id, username: staff.username, role: 'staff', sucursalId: staff.sucursal_id, sucursalNombre: staff.sucursales?.nombre || null }
    : null;
};

export const generarToken = (user) =>
  jwt.sign(
    { sub: user.id, username: user.username, role: user.role, sucursalId: user.sucursalId || null },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

export const verificarToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

export const actualizarCredenciales = async (adminId, { currentPassword, newUsername, newPassword }) => {
  const { data: admin, error } = await supabase.from('admin_users').select('*').eq('id', adminId).single();
  if (error || !admin) throw new Error('Administrador no encontrado.');

  const passwordOk = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!passwordOk) throw new Error('La contraseña actual no es correcta.');

  const updates = { updated_at: new Date().toISOString() };

  if (newUsername && newUsername.trim() && newUsername.trim() !== admin.username) {
    updates.username = newUsername.trim();
  }

  if (newPassword && newPassword.trim()) {
    if (newPassword.trim().length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
    }
    updates.password_hash = await bcrypt.hash(newPassword.trim(), 10);
  }

  const { data: updated, error: updateError } = await supabase
    .from('admin_users')
    .update(updates)
    .eq('id', adminId)
    .select()
    .single();
  if (updateError) throw updateError;

  return updated;
};
