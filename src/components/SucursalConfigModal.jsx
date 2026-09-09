import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, Trash2, KeyRound } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';

// Modal flotante de configuración de UNA sucursal: ubicación (dirección/maps/
// coordenadas) + credenciales de acceso del personal, todo bajo un mismo botón
// "Guardar". Se superpone al modal de Configuración (que ya usa z-50) portando
// directo a document.body, igual que HistoryPanel.
export default function SucursalConfigModal({ sucursalPlex, onClose, onSaved }) {
  const config = sucursalPlex.configuracion;
  const empleados = config?.staff_users || [];
  const [empleadoPrincipal, setEmpleadoPrincipal] = useState(empleados[0] || null);
  const [extras, setExtras] = useState(empleados.slice(1));

  const [direccion, setDireccion] = useState(config?.direccion || '');
  const [googleMapsUrl, setGoogleMapsUrl] = useState(config?.google_maps_url || '');
  const [latitud, setLatitud] = useState(config?.latitud ?? '');
  const [longitud, setLongitud] = useState(config?.longitud ?? '');
  const [username, setUsername] = useState(empleadoPrincipal?.username || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleGuardar = async () => {
    if (!direccion.trim()) {
      setError('Ingresá la dirección de la sucursal.');
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

    setSaving(true);
    setError('');
    try {
      const resSucursal = await adminFetch(`/api/admin/staff/sucursales-plex/${sucursalPlex.idSucursalPlex}`, {
        method: 'PUT',
        body: JSON.stringify({ direccion, googleMapsUrl, latitud, longitud })
      });
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
      setError(err.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const eliminarAcceso = async () => {
    if (!empleadoPrincipal) return;
    if (!window.confirm('¿Eliminar este acceso? El empleado ya no va a poder entrar al CRM.')) return;
    await adminFetch(`/api/admin/staff/${empleadoPrincipal.id}`, { method: 'DELETE' });
    setEmpleadoPrincipal(null);
    setUsername('');
    setPassword('');
    onSaved();
  };

  const eliminarExtra = async (id) => {
    if (!window.confirm('¿Eliminar este acceso adicional?')) return;
    await adminFetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
    setExtras(prev => prev.filter(e => e.id !== id));
    onSaved();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h3 className="font-bold text-gray-800">{sucursalPlex.nombrePlex}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dirección (ubicación textual)</label>
              <input
                type="text"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Av. Siempre Viva 123"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Link de Google Maps (opcional)</label>
              <input
                type="text"
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="https://maps.app.goo.gl/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Latitud</label>
                <input
                  type="number" step="any"
                  value={latitud}
                  onChange={(e) => setLatitud(e.target.value)}
                  placeholder="-31.4201"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Longitud</label>
                <input
                  type="number" step="any"
                  value={longitud}
                  onChange={(e) => setLongitud(e.target.value)}
                  placeholder="-64.1888"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              La latitud/longitud son necesarias para que el bot calcule la sucursal más cercana al cliente (podés sacarlas de Google Maps: clic derecho sobre el punto → coordenadas).
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase">
              <KeyRound size={13} /> Credenciales de acceso del personal
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuario para iniciar sesión en el CRM"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Contraseña{empleadoPrincipal ? ' (dejar vacío para no cambiarla)' : ''}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={empleadoPrincipal ? '••••••••' : 'Mínimo 6 caracteres'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            {empleadoPrincipal && (
              <button onClick={eliminarAcceso} className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800">
                <Trash2 size={13} /> Eliminar este acceso
              </button>
            )}

            {extras.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-[11px] text-gray-400">Otros accesos de esta sucursal:</p>
                {extras.map(emp => (
                  <div key={emp.id} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-gray-50 rounded text-xs">
                    <span className="text-gray-700">{emp.username}</span>
                    <button onClick={() => eliminarExtra(emp.id)} className="text-gray-400 hover:text-rose-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 shrink-0">
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
