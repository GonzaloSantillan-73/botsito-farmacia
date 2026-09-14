import React, { useState } from 'react';
import { Lock, User, Loader2, LogIn } from 'lucide-react';
import { setAdminSession } from '../lib/adminAuth';

export default function LoginModal({ onLoginSuccess }) {
  console.log('🔍 [DEBUG-COMPONENT-LoginModal] Render — props:', { onLoginSuccess: typeof onLoginSuccess });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('🖱️ [DEBUG-COMPONENT-LoginModal] handleSubmit() — username:', username, 'password presente:', !!password, 'password length:', password?.length || 0);
    if (!username.trim() || !password) {
      console.log('❌ [DEBUG-COMPONENT-LoginModal] validación fallida — falta usuario o contraseña');
      console.log('🔄 [DEBUG-COMPONENT-LoginModal] setError — nuevo valor: "Completá el usuario y la contraseña."');
      setError('Completá el usuario y la contraseña.');
      return;
    }

    console.log('🔄 [DEBUG-COMPONENT-LoginModal] setLoading — nuevo valor: true');
    setLoading(true);
    console.log('🔄 [DEBUG-COMPONENT-LoginModal] setError — nuevo valor: "" (limpiando error previo)');
    setError('');

    try {
      console.log('📡 [DEBUG-COMPONENT-LoginModal] fetch → POST /api/admin/login', { username: username.trim(), password_presente: !!password });
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();
      console.log('📡 [DEBUG-COMPONENT-LoginModal] respuesta /api/admin/login:', { ok: res.ok, status: res.status, token_presente: !!data.token, username: data.username, role: data.role, sucursalId: data.sucursalId, sucursalNombre: data.sucursalNombre, error: data.error });

      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');

      console.log('✅ [DEBUG-COMPONENT-LoginModal] login exitoso — token:', data.token?.slice(0, 8) + '...', 'username:', data.username, 'role:', data.role);
      setAdminSession(data.token, data.username, data.role, data.sucursalId, data.sucursalNombre, data.theme);
      onLoginSuccess(data.token, data.username);
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-LoginModal] error en login:', err.message || err);
      console.log('🔄 [DEBUG-COMPONENT-LoginModal] setError — nuevo valor:', err.message || 'No se pudo iniciar sesión.');
      setError(err.message || 'No se pudo iniciar sesión.');
    } finally {
      console.log('🔄 [DEBUG-COMPONENT-LoginModal] setLoading — nuevo valor: false');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-50 dark:bg-gray-950 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3">
            <Lock size={26} />
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">CRM Botsito Farmacia</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Iniciá sesión para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Usuario</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                autoFocus
                value={username}
                onChange={(e) => { console.log('🖱️ [DEBUG-COMPONENT-LoginModal] handleUsernameChange — valor:', e.target.value); setUsername(e.target.value); }}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
                placeholder="admin"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Contraseña</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => { console.log('🖱️ [DEBUG-COMPONENT-LoginModal] handlePasswordChange — password presente:', !!e.target.value, 'length:', e.target.value.length); setPassword(e.target.value); }}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white p-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
