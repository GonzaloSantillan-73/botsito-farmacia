import React, { useState, useEffect } from 'react';
import { X, Settings, Loader2, Check, BarChart3, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function SettingsModal({ sessionTimeoutMs, onSave, onClose }) {
  const [minutes, setMinutes] = useState(
    sessionTimeoutMs != null ? Number((sessionTimeoutMs / 60000).toFixed(2)) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  useEffect(() => {
    supabase
      .from('conversations')
      .select('rating')
      .not('rating', 'is', null)
      .then(({ data, error: metricsError }) => {
        if (metricsError) {
          console.error('Error cargando métricas de calificación:', metricsError);
          setLoadingMetrics(false);
          return;
        }

        const ratings = (data || []).map(r => r.rating);
        const total = ratings.length;
        const average = total > 0 ? ratings.reduce((a, b) => a + b, 0) / total : 0;
        const distribution = [1, 2, 3, 4, 5].reduce((acc, n) => {
          acc[n] = ratings.filter(r => r === n).length;
          return acc;
        }, {});

        setMetrics({ total, average, distribution });
        setLoadingMetrics(false);
      });
  }, []);

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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-bold">
            <Settings size={18} className="text-teal-600" />
            Configuración
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
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

            {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : saved ? (
                <Check size={18} />
              ) : null}
              {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar cambios'}
            </button>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-1.5">
              <BarChart3 size={16} className="text-teal-600" />
              Métricas y Estadísticas
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Calificación de satisfacción que dejan los clientes al finalizar una consulta.
            </p>

            {loadingMetrics ? (
              <div className="text-xs text-gray-400 py-4 text-center">Cargando métricas...</div>
            ) : !metrics || metrics.total === 0 ? (
              <div className="text-xs text-gray-400 py-4 text-center">Todavía no hay calificaciones registradas.</div>
            ) : (
              <>
                <div className="flex items-center gap-6 mb-4 bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 flex items-center gap-1">
                      {metrics.average.toFixed(1)}
                      <Star size={16} className="text-amber-400 fill-amber-400" />
                    </div>
                    <div className="text-[11px] text-gray-500 uppercase font-medium">Promedio</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{metrics.total}</div>
                    <div className="text-[11px] text-gray-500 uppercase font-medium">Valoraciones</div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {[5, 4, 3, 2, 1].map(n => {
                    const count = metrics.distribution[n] || 0;
                    const pct = metrics.total > 0 ? (count / metrics.total) * 100 : 0;
                    return (
                      <div key={n} className="flex items-center gap-2 text-xs">
                        <span className="w-6 text-gray-600 shrink-0 flex items-center gap-0.5">{n}<Star size={10} className="text-amber-400 fill-amber-400" /></span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-5 text-right text-gray-500 shrink-0">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
