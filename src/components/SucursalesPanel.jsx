import React, { useState, useEffect } from 'react';
import { Clock, Loader2, Check, X, EyeOff, MapPin, MessageCircle } from 'lucide-react';
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

// Este panel ya NO permite crear ni eliminar sucursales (eso se gestiona por
// otra vía); solo ajustar días/horario de atención y si están visibles para
// el bot. Nombre, dirección y enlaces quedan de solo lectura.
export default function SucursalesPanel() {
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);
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

  const startEdit = (s) => {
    setEditingId(s.id);
    setForm({
      dias: s.dias,
      hora_apertura: s.hora_apertura,
      hora_cierre: s.hora_cierre,
      activo: s.activo
    });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(null);
    setError('');
  };

  const toggleDia = (d) => {
    const dias = form.dias.includes(d) ? form.dias.filter(x => x !== d) : [...form.dias, d];
    setForm({ ...form, dias });
  };

  const handleSave = async () => {
    if (form.dias.length === 0) {
      setError('Elegí al menos un día de atención.');
      return;
    }

    setSaving(true);
    setError('');

    const { error: updateError } = await supabase
      .from('sucursales')
      .update({
        dias: form.dias,
        hora_apertura: form.hora_apertura,
        hora_cierre: form.hora_cierre,
        activo: form.activo
      })
      .eq('id', editingId);

    setSaving(false);
    if (updateError) {
      setError(updateError.message || 'Error guardando el horario.');
      return;
    }
    cancelEdit();
    await fetchSucursales();
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Ajustá los días y horarios de atención de cada sucursal existente. El bot usa estos datos para responder "4. Horarios y sucursales".
      </p>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Cargando sucursales...</div>
      ) : sucursales.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">Todavía no hay sucursales cargadas.</div>
      ) : (
        <div className="space-y-2">
          {sucursales.map(s => (
            <div key={s.id} className="p-3 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-start justify-between gap-3">
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
                {editingId !== s.id && (
                  <button
                    onClick={() => startEdit(s)}
                    title="Modificar horario"
                    className="flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800 transition-colors shrink-0 px-2 py-1 rounded-lg hover:bg-teal-50"
                  >
                    <Clock size={14} /> Horario
                  </button>
                )}
              </div>

              {editingId === s.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
