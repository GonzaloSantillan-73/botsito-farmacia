import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, Trash2, KeyRound } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';
import { confirmDialog } from '../lib/dialogService';

// Modal flotante de configuración de UNA sucursal: datos de contacto
// (nombre/dirección/maps/whatsapp), coordenadas y credenciales de acceso del
// personal, todo bajo un mismo botón "Guardar". El horario de atención se
// edita aparte, desde su propio modal (ver SucursalHorarioModal.jsx, abierto
// desde "Editar horario" en SucursalesPanel.jsx). `sucursal` es null cuando
// se está dando de alta una sucursal nueva, o la fila existente cuando se edita.
export default function SucursalConfigModal({ sucursal, onClose, onSaved }) {

  const empleados = sucursal?.staff_users || [];
  const [empleadoPrincipal, setEmpleadoPrincipal] = useState(empleados[0] || null);
  const [extras, setExtras] = useState(empleados.slice(1));

  const [nombre, setNombre] = useState(sucursal?.nombre || '');
  const [direccion, setDireccion] = useState(sucursal?.direccion || '');
  const [googleMapsUrl, setGoogleMapsUrl] = useState(sucursal?.google_maps_url || '');
  const [username, setUsername] = useState(empleadoPrincipal?.username || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleGuardar = async () => {

    if (!nombre.trim()) {
      setError('Ingresá el nombre de la sucursal.');
      return;
    }
    if (!direccion.trim()) {
      setError('Ingresá la dirección de la sucursal.');
      return;
    }
    if (!googleMapsUrl.trim()) {
      setError('Ingresá el Link de Google Maps de la sucursal.');
      return;
    }
    if (!empleadoPrincipal && username.trim() && !password) {
      setError('Ingresá una contraseña para crear el acceso del personal.');
      return;
    }
    if (password && password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password && password !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const body = JSON.stringify({
        nombre,
        direccion,
        googleMapsUrl
      });
      const url = sucursal ? `/api/admin/staff/sucursales/${sucursal.id}` : '/api/admin/staff/sucursales';
      const method = sucursal ? 'PUT' : 'POST';
      const resSucursal = sucursal
        ? await adminFetch(`/api/admin/staff/sucursales/${sucursal.id}`, { method: 'PUT', body })
        : await adminFetch('/api/admin/staff/sucursales', { method: 'POST', body });
      const dataSucursal = await resSucursal.json();
      if (!resSucursal.ok) throw new Error(dataSucursal.error || 'No se pudo guardar la sucursal.');

      if (username.trim()) {
        if (empleadoPrincipal) {
          const resEmp = await adminFetch(`/api/admin/staff/${empleadoPrincipal.id}`, {
            method: 'PUT',
            body: JSON.stringify({ username, password })
          });
          const dataEmp = await resEmp.json();
          if (!resEmp.ok) throw new Error(dataEmp.error || 'No se pudo guardar el acceso del personal.');
        } else {
          const resEmp = await adminFetch('/api/admin/staff', {
            method: 'POST',
            body: JSON.stringify({ sucursalId: dataSucursal.sucursal.id, username, password })
          });
          const dataEmp = await resEmp.json();
          if (!resEmp.ok) throw new Error(dataEmp.error || 'No se pudo crear el acceso del personal.');
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-SucursalConfigModal] Error al guardar:', err);
      setError(err.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const eliminarAcceso = async () => {
    if (!empleadoPrincipal) return;
    const confirmado = await confirmDialog('¿Eliminar este acceso? El empleado ya no va a poder entrar al CRM.', { danger: true, confirmText: 'Eliminar' });
    if (!confirmado) return;
    const res = await adminFetch(`/api/admin/staff/${empleadoPrincipal.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('❌ [DEBUG-COMPONENT-SucursalConfigModal] Error eliminando acceso:', data);
      setError(data.error || 'No se pudo eliminar el acceso.');
      return;
    }
    setEmpleadoPrincipal(null);
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    onSaved();
  };

  const eliminarExtra = async (id) => {
    const confirmado = await confirmDialog('¿Eliminar este acceso adicional?', { danger: true, confirmText: 'Eliminar' });
    if (!confirmado) return;
    const res = await adminFetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('❌ [DEBUG-COMPONENT-SucursalConfigModal] Error eliminando acceso extra:', data);
      setError(data.error || 'No se pudo eliminar el acceso.');
      return;
    }
    setExtras(prev => prev.filter(e => e.id !== id));
    onSaved();
  };


  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h3 className="font-bold text-gray-800 dark:text-gray-100">{sucursal ? sucursal.nombre : 'Nueva sucursal'}</h3>
          <button onClick={() => { onClose(); }} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre de la sucursal</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => { setNombre(e.target.value); }}
                placeholder="Sucursal Centro"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Dirección</label>
              <input
                type="text"
                value={direccion}
                onChange={(e) => { setDireccion(e.target.value); }}
                placeholder="Av. Siempre Viva 123"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Link de Google Maps</label>
              <input
                type="text"
                value={googleMapsUrl}
                onChange={(e) => { setGoogleMapsUrl(e.target.value); }}
                placeholder="https://maps.app.goo.gl/..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
              <KeyRound size={13} /> Credenciales de acceso del personal
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); }}
                placeholder="Usuario para iniciar sesión en el CRM"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Nueva contraseña{empleadoPrincipal ? ' (dejar vacío para no cambiarla)' : ''}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); }}
                placeholder={empleadoPrincipal ? '••••••••' : 'Mínimo 6 caracteres'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Confirmar nueva contraseña</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); }}
                placeholder="Repetí la nueva contraseña"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            {empleadoPrincipal && (
              <button onClick={eliminarAcceso} className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300">
                <Trash2 size={13} /> Eliminar este acceso
              </button>
            )}

            {extras.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-[11px] text-gray-400">Otros accesos de esta sucursal:</p>
                {extras.map(emp => (
                  <div key={emp.id} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                    <span className="text-gray-700 dark:text-gray-300">{emp.username}</span>
                    <button onClick={() => eliminarExtra(emp.id)} className="text-gray-400 hover:text-rose-600 dark:hover:text-rose-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={handleGuardar}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Guardar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
