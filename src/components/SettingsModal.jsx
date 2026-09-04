import React, { useState } from 'react';
import { X, Settings, Loader2, Check } from 'lucide-react';

export default function SettingsModal({ sessionTimeoutMs, onSave, onClose }) {
  const [minutes, setMinutes] = useState(
    sessionTimeoutMs != null ? Number((sessionTimeoutMs / 60000).toFixed(2)) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const parsedMinutes = Number(minutes);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
      setError('Ingresá un número de minutos válido, mayor a 0.');
      return;
    }

    setError('');
    setSaving(true);
    setSaved(false);

    const newTimeoutMs = Math.round(parsedMinutes * 60000);

    try {
      const res = await fetch('/api/session-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionTimeoutMs: newTimeoutMs })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la configuración.');

      onSave(newTimeoutMs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'Error guardando la configuración.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 text-gray-800 font-bold">
            <Settings size={18} className="text-teal-600" />
            Configuración
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tiempo de inactividad para cerrar un chat
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Si un cliente no escribe nada durante este tiempo, la consulta se cierra automáticamente y pasa al Historial.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
                placeholder="Ej: 60"
              />
              <span className="text-sm text-gray-500 whitespace-nowrap">minutos</span>
            </div>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : saved ? (
              <Check size={18} />
            ) : null}
            {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
