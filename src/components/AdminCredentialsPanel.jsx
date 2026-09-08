import React, { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { adminFetch, getAdminUsername, setAdminSession } from '../lib/adminAuth';

export default function AdminCredentialsPanel() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setError('');
    setSaved(false);

    if (!currentPassword) {
      setError('Ingresá tu contraseña actual para confirmar el cambio.');
      return;
    }
    if (!newUsername.trim() && !newPassword.trim()) {
      setError('Indicá un nuevo usuario y/o una nueva contraseña.');
      return;
    }
    if (newPassword.trim() && newPassword.trim() !== confirmPassword.trim()) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/update-credentials', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newUsername: newUsername.trim(), newPassword: newPassword.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron actualizar las credenciales.');

      setAdminSession(data.token, data.username);
      setCurrentPassword('');
      setNewUsername('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || 'No se pudieron actualizar las credenciales.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Usuario actual: <span className="font-semibold text-gray-700">{getAdminUsername() || 'admin'}</span>. Completá los campos que quieras cambiar; el resto puede quedar vacío.
      </p>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nuevo usuario (opcional)</label>
        <input
          type="text"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="Dejalo vacío para no cambiarlo"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nueva contraseña (opcional, mínimo 6 caracteres)</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Dejalo vacío para no cambiarla"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
        />
      </div>

      {newPassword.trim() && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar nueva contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
          />
        </div>
      )}

      <div className="pt-2 border-t border-gray-100">
        <label className="block text-xs font-medium text-gray-600 mb-1">Tu contraseña actual (para confirmar)</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
        />
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="animate-spin" size={18} /> : saved ? <Check size={18} /> : null}
        {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar cambios'}
      </button>
    </div>
  );
}
