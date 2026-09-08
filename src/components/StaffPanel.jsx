import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Check, X, UserPlus, MapPin } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';

const FORM_VACIO = { username: '', password: '', sucursalNombre: '', direccion: '', googleMapsUrl: '' };

export default function StaffPanel() {
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null); // null = cerrado, 'new' = alta, o el id que se edita
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchDatos = async () => {
    setLoading(true);
    const res = await adminFetch('/api/admin/staff').then(r => r.json());
    setEmpleados(res.empleados || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDatos();
  }, []);

  const startNew = () => {
    setEditingId('new');
    setForm(FORM_VACIO);
    setError('');
  };

  const startEdit = (emp) => {
    setEditingId(emp.id);
    setForm({
      username: emp.username,
      password: '',
      sucursalNombre: emp.sucursales?.nombre || '',
      direccion: emp.sucursales?.direccion || '',
      googleMapsUrl: emp.sucursales?.google_maps_url || ''
    });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(FORM_VACIO);
    setError('');
  };

  const handleSave = async () => {
    setError('');

    if (!form.username.trim()) {
      setError('Completá el usuario.');
      return;
    }
    if (editingId === 'new' && !form.password) {
      setError('Completá la contraseña.');
      return;
    }
    if (!form.sucursalNombre.trim() || !form.direccion.trim() || !form.googleMapsUrl.trim()) {
      setError('Completá el nombre, la dirección y el link de Maps de la sucursal.');
      return;
    }

    setSaving(true);
    try {
      const url = editingId === 'new' ? '/api/admin/staff' : `/api/admin/staff/${editingId}`;
      const method = editingId === 'new' ? 'POST' : 'PUT';
      const res = await adminFetch(url, {
        method,
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          sucursalNombre: form.sucursalNombre,
          direccion: form.direccion,
          googleMapsUrl: form.googleMapsUrl
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el empleado.');

      cancelEdit();
      await fetchDatos();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el empleado.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este empleado? Ya no va a poder acceder al CRM. Su sucursal se mantiene.')) return;
    await adminFetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
    fetchDatos();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500">
          Cada empleado nuevo crea su propia sucursal: usuario y contraseña para entrar al CRM, más el nombre, la dirección y el link de Maps de esa sucursal.
        </p>
        {editingId === null && (
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800 transition-colors shrink-0 ml-3"
          >
            <Plus size={16} /> Nuevo empleado
          </button>
        )}
      </div>

      {(editingId === 'new' || empleados.some(e => e.id === editingId)) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Nombre de usuario"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {editingId === 'new' ? 'Contraseña' : 'Nueva contraseña (opcional)'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editingId === 'new' ? 'Mínimo 6 caracteres' : 'Dejalo vacío para no cambiarla'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
            />
          </div>

          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-500 mb-2">Sucursal</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de la sucursal</label>
                <input
                  type="text"
                  value={form.sucursalNombre}
                  onChange={(e) => setForm({ ...form, sucursalNombre: e.target.value })}
                  placeholder="Ej: Sucursal Centro"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
                <input
                  type="text"
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  placeholder="Ej: Av. Siempre Viva 123"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Link de Google Maps</label>
                <input
                  type="text"
                  value={form.googleMapsUrl}
                  onChange={(e) => setForm({ ...form, googleMapsUrl: e.target.value })}
                  placeholder="https://maps.app.goo.gl/..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Guardar
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <X size={14} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Cargando empleados...</div>
      ) : empleados.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">Todavía no hay empleados cargados.</div>
      ) : (
        <div className="space-y-2">
          {empleados.map(emp => (
            <div key={emp.id} className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-200 rounded-lg">
              <div className="min-w-0 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                  <UserPlus size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{emp.username}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 truncate">
                    <MapPin size={11} className="shrink-0" /> {emp.sucursales?.nombre || 'Sin sucursal'}
                    {emp.sucursales?.direccion && <span className="text-gray-400">· {emp.sucursales.direccion}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => startEdit(emp)}
                  title="Editar"
                  className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(emp.id)}
                  title="Eliminar"
                  className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
