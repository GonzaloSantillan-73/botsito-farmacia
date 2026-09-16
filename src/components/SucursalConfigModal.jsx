import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, Trash2, KeyRound, Clock } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';
import { DIAS } from '../lib/dias';
import { confirmDialog } from '../lib/dialogService';
import Toggle from './Toggle';

// Modal flotante de configuración de UNA sucursal: datos de contacto
// (nombre/dirección/maps/whatsapp), coordenadas, horario de atención y
// credenciales de acceso del personal, todo bajo un mismo botón "Guardar".
// `sucursal` es null cuando se está dando de alta una sucursal nueva, o la
// fila existente cuando se edita.
export default function SucursalConfigModal({ sucursal, onClose, onSaved }) {

  const empleados = sucursal?.staff_users || [];
  const [empleadoPrincipal, setEmpleadoPrincipal] = useState(empleados[0] || null);
  const [extras, setExtras] = useState(empleados.slice(1));

  const [nombre, setNombre] = useState(sucursal?.nombre || '');
  const [direccion, setDireccion] = useState(sucursal?.direccion || '');
  const [googleMapsUrl, setGoogleMapsUrl] = useState(sucursal?.google_maps_url || '');
  const [dias, setDias] = useState(sucursal?.dias || [1, 2, 3, 4, 5, 6]);
  const [horaApertura, setHoraApertura] = useState(sucursal?.hora_apertura || '09:00');
  const [horaCierre, setHoraCierre] = useState(sucursal?.hora_cierre || '18:00');
  const [abierta24hs, setAbierta24hs] = useState(sucursal?.abierta_24hs || false);
  const [username, setUsername] = useState(empleadoPrincipal?.username || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleDia = (d) => {
    setDias(prev => {
      const next = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d];
      return next;
    });
  };

  const handleGuardar = async () => {

    if (!nombre.trim()) {
      setError('Ingresá el nombre de la sucursal.');
      return;
    }
    if (!direccion.trim()) {
      setError('Ingresá la dirección de la sucursal.');
      return;
    }
    if (!abierta24hs && dias.length === 0) {
      setError('Elegí al menos un día de atención.');
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

    setSaving(true);
    setError('');
    try {
      const body = JSON.stringify({
        nombre,
        direccion,
        googleMapsUrl,
        dias,
        horaApertura,
        horaCierre,
        abierta24hs
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

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                <Clock size={13} /> Horario de atención
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Abierto 24hs</span>
                <Toggle checked={abierta24hs} onChange={setAbierta24hs} />
              </label>
            </div>
            <div className={`flex flex-wrap gap-1.5 ${abierta24hs ? 'opacity-40 pointer-events-none' : ''}`}>
              {DIAS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  disabled={abierta24hs}
                  onClick={() => toggleDia(d.value)}
                  className={`w-8 h-8 rounded-full text-xs font-semibold transition-colors ${dias.includes(d.value) ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className={`flex items-center gap-3 ${abierta24hs ? 'opacity-40 pointer-events-none' : ''}`}>
              <input
                type="time"
                value={horaApertura}
                disabled={abierta24hs}
                onChange={(e) => { setHoraApertura(e.target.value); }}
                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm disabled:opacity-50"
              />
              <span className="text-gray-400 text-xs">a</span>
              <input
                type="time"
                value={horaCierre}
                disabled={abierta24hs}
                onChange={(e) => { setHoraCierre(e.target.value); }}
                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm disabled:opacity-50"
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
                Contraseña{empleadoPrincipal ? ' (dejar vacío para no cambiarla)' : ''}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); }}
                placeholder={empleadoPrincipal ? '••••••••' : 'Mínimo 6 caracteres'}
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
