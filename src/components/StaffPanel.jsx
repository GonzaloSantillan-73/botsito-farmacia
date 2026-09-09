import React, { useState, useEffect } from 'react';
import { Pencil, Trash2, Loader2, Check, X, UserPlus, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { adminFetch } from '../lib/adminAuth';

const FORM_VACIO = { username: '', password: '', sucursalId: '' };

// Solo lista/edita/elimina empleados. El alta de un empleado nuevo se hace
// desde Configuración > Administración > Sucursales (queda tied a una
// sucursal real de Plex ya configurada, en vez de inventar una nueva acá).
export default function StaffPanel() {
  const [empleados, setEmpleados] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchDatos = async () => {
    setLoading(true);
    const [empleadosRes, sucursalesRes] = await Promise.all([
      adminFetch('/api/admin/staff').then(r => r.json()),
      supabase.from('sucursales').select('id, nombre').not('plex_id_sucursal', 'is', null).order('nombre')
    ]);
    setEmpleados(empleadosRes.empleados || []);
    setSucursales(sucursalesRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDatos();
  }, []);

  const startEdit = (emp) => {
    setEditingId(emp.id);
    setForm({ username: emp.username, password: '', sucursalId: emp.sucursal_id });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(FORM_VACIO);
    setError('');
  };

  const handleSave = async () => {
    setError('');
    if (!form.username.trim() && !form.password && !form.sucursalId) {
      setError('No hay ningún cambio para guardar.');
      return;
    }

    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/staff/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ username: form.username, password: form.password, sucursalId: form.sucursalId })
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
    if (!window.confirm('¿Eliminar este empleado? Ya no va a poder acceder al CRM.')) return;
    await adminFetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
    fetchDatos();
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Para dar de alta un empleado nuevo, andá a "Sucursales" y creálo debajo de la sucursal que le corresponda. Acá podés editar o eliminar los que ya existen.
      </p>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Cargando empleados...</div>
      ) : empleados.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">Todavía no hay empleados cargados.</div>
      ) : (
        <div className="space-y-2">
          {empleados.map(emp => (
            <div key={emp.id} className="bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                    <UserPlus size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{emp.username}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1 truncate">
                      <MapPin size={11} className="shrink-0" /> {emp.sucursales?.nombre || 'Sin sucursal'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => (editingId === emp.id ? cancelEdit() : startEdit(emp))} title="Editar" className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDelete(emp.id)} title="Eliminar" className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {editingId === emp.id && (
                <div className="border-t border-gray-100 p-3 space-y-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">Usuario</label>
                    <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">Nueva contraseña (opcional)</label>
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Dejalo vacío para no cambiarla"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">Sucursal</label>
                    <select value={form.sucursalId} onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500">
                      {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                  {error && <p className="text-xs text-rose-600">{error}</p>}
                  <div className="flex items-center gap-2">
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar
                    </button>
                    <button onClick={cancelEdit} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-xs">
                      <X size={14} /> Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
