import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Check, X, EyeOff, MapPin, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DIAS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' }
];

const FORM_VACIO = {
  nombre: '',
  direccion: '',
  dias: [1, 2, 3, 4, 5, 6],
  hora_apertura: '09:00',
  hora_cierre: '18:00',
  google_maps_url: '',
  whatsapp_url: '',
  activo: true
};

// El campo de WhatsApp admite tanto un número suelto ("5493834123456") como
// una URL ya armada; esto arma el link final que abre el botón del CRM.
const normalizarWhatsappUrl = (valor) => {
  if (!valor) return null;
  const limpio = valor.trim();
  if (!limpio) return null;
  if (/^https?:\/\//i.test(limpio)) return limpio;
  const soloDigitos = limpio.replace(/\D/g, '');
  return soloDigitos ? `https://wa.me/${soloDigitos}` : null;
};

export default function SucursalesPanel() {
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null); // null = cerrado, 'new' = creando, o el id que se edita
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchSucursales = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('sucursales')
      .select('*')
      .order('orden')
      .order('nombre');
    if (!fetchError) setSucursales(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSucursales();
  }, []);

  const startNew = () => {
    setEditingId('new');
    setForm(FORM_VACIO);
    setError('');
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setForm({
      nombre: s.nombre,
      direccion: s.direccion,
      dias: s.dias,
      hora_apertura: s.hora_apertura,
      hora_cierre: s.hora_cierre,
      google_maps_url: s.google_maps_url || '',
      whatsapp_url: s.whatsapp_url || '',
      activo: s.activo
    });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(FORM_VACIO);
    setError('');
  };

  const toggleDia = (d) => {
    const dias = form.dias.includes(d) ? form.dias.filter(x => x !== d) : [...form.dias, d];
    setForm({ ...form, dias });
  };

  const handleSave = async () => {
    const nombre = form.nombre.trim();
    const direccion = form.direccion.trim();

    if (!nombre || !direccion) {
      setError('Completá el nombre y la dirección.');
      return;
    }
    if (form.dias.length === 0) {
      setError('Elegí al menos un día de atención.');
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      nombre,
      direccion,
      dias: form.dias,
      hora_apertura: form.hora_apertura,
      hora_cierre: form.hora_cierre,
      google_maps_url: form.google_maps_url.trim() || null,
      whatsapp_url: form.whatsapp_url.trim() || null,
      activo: form.activo
    };

    try {
      if (editingId === 'new') {
        const { error: insertError } = await supabase.from('sucursales').insert([payload]);
        if (insertError) throw insertError;
      } else {
        const { error: updateError } = await supabase.from('sucursales').update(payload).eq('id', editingId);
        if (updateError) throw updateError;
      }
      cancelEdit();
      await fetchSucursales();
    } catch (err) {
      setError(err.message || 'Error guardando la sucursal.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta sucursal? Esta acción no se puede deshacer.')) return;
    await supabase.from('sucursales').delete().eq('id', id);
    fetchSucursales();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500">
          Estas sucursales son las que el bot le muestra al cliente cuando elige "4. Horarios y sucursales".
        </p>
        {editingId === null && (
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800 transition-colors shrink-0 ml-3"
          >
            <Plus size={16} /> Nueva sucursal
          </button>
        )}
      </div>

      {(editingId === 'new' || sucursales.some(s => s.id === editingId)) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de la sucursal</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Sucursal Centro"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
            <input
              type="text"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              placeholder="Calle Zurita y Prado"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Enlace de Google Maps</label>
            <input
              type="url"
              value={form.google_maps_url}
              onChange={(e) => setForm({ ...form, google_maps_url: e.target.value })}
              placeholder="https://maps.app.goo.gl/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp de la sucursal</label>
            <input
              type="text"
              value={form.whatsapp_url}
              onChange={(e) => setForm({ ...form, whatsapp_url: e.target.value })}
              placeholder="5493834123456 o https://wa.me/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Días de atención</label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDia(d.value)}
                  className={`w-9 h-9 rounded-full text-xs font-semibold transition-colors ${
                    form.dias.includes(d.value) ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Desde</label>
              <input
                type="time"
                value={form.hora_apertura}
                onChange={(e) => setForm({ ...form, hora_apertura: e.target.value })}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Hasta</label>
              <input
                type="time"
                value={form.hora_cierre}
                onChange={(e) => setForm({ ...form, hora_cierre: e.target.value })}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer mt-4">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                className="accent-teal-600"
              />
              Visible para el bot
            </label>
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
        <div className="text-sm text-gray-400 py-8 text-center">Cargando sucursales...</div>
      ) : sucursales.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">Todavía no hay sucursales cargadas.</div>
      ) : (
        <div className="space-y-2">
          {sucursales.map(s => (
            <div key={s.id} className="flex items-start justify-between gap-3 p-3 bg-white border border-gray-200 rounded-lg">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-teal-700">{s.nombre}</span>
                  {!s.activo && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      <EyeOff size={10} /> Oculta
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">{s.direccion}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {DIAS.filter(d => s.dias.includes(d.value)).map(d => d.label).join(' ')} · {s.hora_apertura} a {s.hora_cierre}hs
                </div>
                {(s.google_maps_url || s.whatsapp_url) && (
                  <div className="flex items-center gap-3 mt-1.5">
                    {s.google_maps_url && (
                      <a
                        href={s.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-800 hover:underline"
                      >
                        <MapPin size={13} /> Ver en Maps
                      </a>
                    )}
                    {normalizarWhatsappUrl(s.whatsapp_url) && (
                      <a
                        href={normalizarWhatsappUrl(s.whatsapp_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800 hover:underline"
                      >
                        <MessageCircle size={13} /> WhatsApp
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => startEdit(s)}
                  title="Editar"
                  className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
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
