import React, { useState, useEffect } from 'react';
import { X, Settings, Loader2, Check, BarChart3, Star, Sliders, Hash } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TABS = [
  { id: 'chat', label: 'Ajustes de Chat', icon: Sliders },
  { id: 'metrics', label: 'Métricas y Estadísticas', icon: BarChart3 }
];

const msToHms = (ms) => {
  const totalSeconds = Math.max(0, Math.round((ms ?? 0) / 1000));
  return {
    h: Math.floor(totalSeconds / 3600),
    m: Math.floor((totalSeconds % 3600) / 60),
    s: totalSeconds % 60
  };
};

const NumberBox = ({ label, value, onChange, max }) => (
  <div className="flex flex-col items-center">
    <input
      type="number"
      min="0"
      max={max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-16 text-center px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-lg font-semibold tabular-nums"
    />
    <span className="text-[11px] text-gray-500 uppercase font-medium mt-1">{label}</span>
  </div>
);

export default function SettingsModal({ sessionTimeoutMs, onSave, onClose }) {
  const [activeTab, setActiveTab] = useState('chat');

  // --- Ajustes de Chat: tiempo de inactividad ---
  const [hours, setHours] = useState(0);
  const [mins, setMins] = useState(0);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (sessionTimeoutMs != null) {
      const { h, m, s } = msToHms(sessionTimeoutMs);
      setHours(h);
      setMins(m);
      setSecs(s);
    }
  }, [sessionTimeoutMs]);

  // --- Ajustes de Chat: palabra clave del bot ---
  const [botKeyword, setBotKeywordInput] = useState('');
  const [loadingBotKeyword, setLoadingBotKeyword] = useState(true);

  useEffect(() => {
    fetch('/api/bot-config')
      .then(res => res.json())
      .then(data => setBotKeywordInput(data.botKeyword || 'BOT'))
      .catch(err => console.error('Error obteniendo la palabra clave del bot:', err))
      .finally(() => setLoadingBotKeyword(false));
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSaveChatSettings = async () => {
    const totalMs = ((Number(hours) || 0) * 3600 + (Number(mins) || 0) * 60 + (Number(secs) || 0)) * 1000;
    const keyword = botKeyword.trim();

    if (totalMs <= 0) {
      setError('El tiempo de inactividad debe ser mayor a 0.');
      return;
    }
    if (!keyword) {
      setError('La palabra clave del bot no puede estar vacía.');
      return;
    }

    setError('');
    setSaving(true);
    setSaved(false);

    try {
      const [res1, res2] = await Promise.all([
        fetch('/api/session-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionTimeoutMs: totalMs })
        }),
        fetch('/api/bot-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botKeyword: keyword })
        })
      ]);
      const [data1, data2] = await Promise.all([res1.json(), res2.json()]);

      if (!res1.ok) throw new Error(data1.error || 'No se pudo guardar el tiempo de inactividad.');
      if (!res2.ok) throw new Error(data2.error || 'No se pudo guardar la palabra clave del bot.');

      onSave(totalMs);
      setBotKeywordInput(data2.botKeyword || keyword);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'Error guardando la configuración.');
    } finally {
      setSaving(false);
    }
  };

  // --- Métricas y Estadísticas ---
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

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-[80%] h-[90%] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-bold text-lg">
            <Settings size={20} className="text-teal-600" />
            Configuración
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 shrink-0">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  isActive ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto">
            {activeTab === 'chat' ? (
              <div className="space-y-8">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">
                    Tiempo de inactividad para cerrar un chat
                  </label>
                  <p className="text-xs text-gray-500 mb-4">
                    Si un cliente no escribe nada durante este tiempo, la consulta se cierra automáticamente y pasa al Historial.
                  </p>
                  <div className="flex items-center gap-4">
                    <NumberBox label="Horas" value={hours} onChange={setHours} max={23} />
                    <span className="text-2xl text-gray-300 pb-5">:</span>
                    <NumberBox label="Minutos" value={mins} onChange={setMins} max={59} />
                    <span className="text-2xl text-gray-300 pb-5">:</span>
                    <NumberBox label="Segundos" value={secs} onChange={setSecs} max={59} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">
                    Palabra clave del bot
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Cuando un cliente está hablando con un humano, puede escribir esta palabra para volver a hablar con el bot.
                  </p>
                  <div className="relative max-w-xs">
                    <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    {loadingBotKeyword ? (
                      <div className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-400">Cargando...</div>
                    ) : (
                      <input
                        type="text"
                        value={botKeyword}
                        onChange={(e) => setBotKeywordInput(e.target.value)}
                        maxLength={30}
                        placeholder="BOT"
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm uppercase"
                      />
                    )}
                  </div>
                </div>

                {error && <p className="text-sm text-rose-600">{error}</p>}

                <button
                  onClick={handleSaveChatSettings}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="animate-spin" size={18} /> : saved ? <Check size={18} /> : null}
                  {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar cambios'}
                </button>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Calificaciones de satisfacción</h3>
                <p className="text-xs text-gray-500 mb-5">
                  Resumen de las calificaciones (1 a 5) que dejan los clientes al finalizar una consulta.
                </p>

                {loadingMetrics ? (
                  <div className="text-sm text-gray-400 py-10 text-center">Cargando métricas...</div>
                ) : !metrics || metrics.total === 0 ? (
                  <div className="text-sm text-gray-400 py-10 text-center">Todavía no hay calificaciones registradas.</div>
                ) : (
                  <>
                    <div className="flex items-center gap-8 mb-6 bg-gray-50 rounded-xl p-5 border border-gray-100">
                      <div>
                        <div className="text-3xl font-bold text-gray-900 flex items-center gap-1.5">
                          {metrics.average.toFixed(1)}
                          <Star size={20} className="text-amber-400 fill-amber-400" />
                        </div>
                        <div className="text-xs text-gray-500 uppercase font-medium mt-1">Promedio general</div>
                      </div>
                      <div className="w-px h-12 bg-gray-200" />
                      <div>
                        <div className="text-3xl font-bold text-gray-900">{metrics.total}</div>
                        <div className="text-xs text-gray-500 uppercase font-medium mt-1">Valoraciones totales</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[5, 4, 3, 2, 1].map(n => {
                        const count = metrics.distribution[n] || 0;
                        const pct = metrics.total > 0 ? (count / metrics.total) * 100 : 0;
                        return (
                          <div key={n} className="flex items-center gap-3 text-sm">
                            <span className="w-10 text-gray-600 shrink-0 flex items-center gap-0.5">{n}<Star size={12} className="text-amber-400 fill-amber-400" /></span>
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-8 text-right text-gray-500 shrink-0">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
