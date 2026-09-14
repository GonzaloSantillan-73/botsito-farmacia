import React, { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { adminFetch, getAdminUsername, setAdminSession } from '../lib/adminAuth';

export default function AdminCredentialsPanel() {
  // NOTA DE SEGURIDAD: este componente maneja contraseñas. Nunca se loguea
  // el valor de currentPassword/newPassword/confirmPassword en texto plano.
  console.log('🔍 [DEBUG-COMPONENT-AdminCredentialsPanel] Render — props: (ninguna)');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    console.log('🖱️ [DEBUG-COMPONENT-AdminCredentialsPanel] handleSave — newUsername:', newUsername.trim(), 'currentPassword presente:', !!currentPassword, 'newPassword presente:', !!newPassword.trim(), 'confirmPassword presente:', !!confirmPassword.trim());
    setError('');
    setSaved(false);

    if (!currentPassword) {
      console.log('❌ [DEBUG-COMPONENT-AdminCredentialsPanel] Validación fallida — falta contraseña actual');
      setError('Ingresá tu contraseña actual para confirmar el cambio.');
      return;
    }
    if (!newUsername.trim() && !newPassword.trim()) {
      console.log('❌ [DEBUG-COMPONENT-AdminCredentialsPanel] Validación fallida — no se indicó nuevo usuario ni nueva contraseña');
      setError('Indicá un nuevo usuario y/o una nueva contraseña.');
      return;
    }
    if (newPassword.trim() && newPassword.trim() !== confirmPassword.trim()) {
      console.log('❌ [DEBUG-COMPONENT-AdminCredentialsPanel] Validación fallida — la confirmación no coincide con la nueva contraseña');
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    setSaving(true);
    try {
      const body = { currentPassword, newUsername: newUsername.trim(), newPassword: newPassword.trim() };
      const bodyParaLog = { ...body };
      if (bodyParaLog.currentPassword) bodyParaLog.currentPassword = '[REDACTED]';
      if (bodyParaLog.newPassword) bodyParaLog.newPassword = '[REDACTED]';
      console.log('📡 [DEBUG-COMPONENT-AdminCredentialsPanel] Enviando actualización de credenciales — PUT /api/admin/update-credentials, body:', bodyParaLog);

      const res = await adminFetch('/api/admin/update-credentials', {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      const data = await res.json();
      const dataParaLog = { ...data };
      if (dataParaLog.token) dataParaLog.token = 'presente: true';
      console.log('📡 [DEBUG-COMPONENT-AdminCredentialsPanel] Respuesta /api/admin/update-credentials — status:', res.status, 'data:', dataParaLog);

      if (!res.ok) throw new Error(data.error || 'No se pudieron actualizar las credenciales.');

      console.log('✅ [DEBUG-COMPONENT-AdminCredentialsPanel] Credenciales actualizadas — username:', data.username, 'token presente:', !!data.token);
      setAdminSession(data.token, data.username);
      setCurrentPassword('');
      setNewUsername('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-AdminCredentialsPanel] Error actualizando credenciales:', err.message);
      setError(err.message || 'No se pudieron actualizar las credenciales.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Usuario actual: <span className="font-semibold text-gray-700 dark:text-gray-300">{getAdminUsername() || 'admin'}</span>. Completá los campos que quieras cambiar; el resto puede quedar vacío.
      </p>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nuevo usuario (opcional)</label>
        <input
          type="text"
          value={newUsername}
          onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-AdminCredentialsPanel] onChange newUsername — nuevo valor:', e.target.value); setNewUsername(e.target.value); }}
          placeholder="Dejalo vacío para no cambiarlo"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nueva contraseña (opcional, mínimo 6 caracteres)</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-AdminCredentialsPanel] onChange newPassword — valor: [REDACTED], longitud:', e.target.value.length); setNewPassword(e.target.value); }}
          placeholder="Dejalo vacío para no cambiarla"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
        />
      </div>

      {newPassword.trim() && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Confirmar nueva contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-AdminCredentialsPanel] onChange confirmPassword — valor: [REDACTED], longitud:', e.target.value.length); setConfirmPassword(e.target.value); }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
          />
        </div>
      )}

      <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tu contraseña actual (para confirmar)</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-AdminCredentialsPanel] onChange currentPassword — valor: [REDACTED], longitud:', e.target.value.length); setCurrentPassword(e.target.value); }}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
        />
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

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
