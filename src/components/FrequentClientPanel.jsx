import React, { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';

// A diferencia del resto de los paneles de "Ajustes de Chat" (welcome-message,
// bot-config), este endpoint sí exige sesión de administrador del lado del
// servidor (ver router.use(['/frequent-client-config'], ...) en
// server/routes/api.js) — por eso usa adminFetch (manda el JWT) en vez de un
// fetch a secas.
export default function FrequentClientPanel() {

  const [message, setMessage] = useState('');
  const [threshold, setThreshold] = useState(3);
  const [minThreshold, setMinThreshold] = useState(1);
  const [maxThreshold, setMaxThreshold] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminFetch('/api/frequent-client-config')
      .then(res => res.json())
      .then(data => {
        setMessage(data.frequentClientMessage || '');
        setThreshold(data.frequentClientThreshold ?? 3);
        if (data.minFrequentClientThreshold != null) setMinThreshold(data.minFrequentClientThreshold);
        if (data.maxFrequentClientThreshold != null) setMaxThreshold(data.maxFrequentClientThreshold);
      })
      .catch(err => console.error('❌ [DEBUG-COMPONENT-FrequentClientPanel] Error obteniendo la configuración de cliente frecuente:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const mensaje = message.trim();
    const umbral = Number(threshold);

    if (!mensaje) {
      setError('El mensaje para clientes frecuentes no puede estar vacío.');
      return;
    }
    if (!Number.isInteger(umbral) || umbral < minThreshold || umbral > maxThreshold) {
      setError(`El umbral debe ser un número entero entre ${minThreshold} y ${maxThreshold}.`);
      return;
    }

    setError('');
    setSaving(true);
    setSaved(false);

    try {
      const res = await adminFetch('/api/frequent-client-config', {
        method: 'PUT',
        body: JSON.stringify({ frequentClientMessage: mensaje, frequentClientThreshold: umbral })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la configuración de cliente frecuente.');

      setMessage(data.frequentClientMessage ?? mensaje);
      setThreshold(data.frequentClientThreshold ?? umbral);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-FrequentClientPanel] Error guardando la configuración de cliente frecuente:', err);
      setError(err.message || 'Error guardando la configuración de cliente frecuente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Si un cliente ya inició {threshold || 'N'} consultas o más con el bot antes de esta, se lo saluda con este mensaje
        en vez del mensaje de bienvenida normal (el menú numerado se agrega siempre igual, en los dos casos).
      </p>

      {loading ? (
        <div className="w-full max-w-md p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-400">Cargando...</div>
      ) : (
        <>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">Mensaje para clientes frecuentes</label>
            <textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); }}
              maxLength={500}
              rows={3}
              placeholder="¡Hola! Nos alegra verte de nuevo por acá. 😊"
              className="w-full max-w-md p-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">Umbral de consultas previas</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={minThreshold}
                max={maxThreshold}
                value={threshold}
                onChange={(e) => { setThreshold(e.target.value); }}
                className="w-20 text-center px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm font-semibold tabular-nums"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">consultas previas ({minThreshold}-{maxThreshold})</span>
            </div>
          </div>
        </>
      )}

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || loading}
        className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="animate-spin" size={16} /> : saved ? <Check size={16} /> : null}
        {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar cambios'}
      </button>
    </div>
  );
}
