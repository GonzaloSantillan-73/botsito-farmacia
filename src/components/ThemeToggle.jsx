import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import Toggle from './Toggle';
import { getTheme, applyTheme, adminFetch } from '../lib/adminAuth';

// La preferencia de modo oscuro vive en la cuenta (admin_users/staff_users en
// la base), no en el navegador: por eso cada cambio se manda al backend
// además de aplicarse al toque en <html>. Así una sucursal que prende el modo
// oscuro no afecta a otra que loguea después en la misma computadora del
// mostrador — cada login trae y aplica su propio theme (ver setAdminSession
// en src/lib/adminAuth.js).
export default function ThemeToggle() {

  const [theme, setThemeState] = useState(getTheme());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = async (checked) => {
    const nuevoTema = checked ? 'dark' : 'light';
    setError('');
    setThemeState(nuevoTema);
    applyTheme(nuevoTema);

    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/theme', { method: 'PUT', body: JSON.stringify({ theme: nuevoTema }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la preferencia de tema.');
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-ThemeToggle] Error guardando el tema:', err);
      setError('No se pudo guardar la preferencia. Se aplicó igual, pero puede no persistir la próxima vez que inicies sesión.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 max-w-lg">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Elegí cómo se ve el CRM en esta cuenta. Es una preferencia personal: no afecta a otras sucursales ni al administrador.
      </p>
      <div className="flex items-center justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="flex items-start gap-3">
          {theme === 'dark' ? (
            <Moon size={18} className="text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
          ) : (
            <Sun size={18} className="text-teal-600 mt-0.5 shrink-0" />
          )}
          <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Modo oscuro</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{theme === 'dark' ? 'Activado' : 'Desactivado'}{saving ? ' — guardando...' : ''}</div>
          </div>
        </div>
        <Toggle checked={theme === 'dark'} onChange={toggle} disabled={saving} />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
