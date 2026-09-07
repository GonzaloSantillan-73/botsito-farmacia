import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function MetricsPanel() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('conversations')
      .select('rating')
      .not('rating', 'is', null)
      .then(({ data, error }) => {
        if (error) {
          console.error('Error cargando métricas de calificación:', error);
          setLoading(false);
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
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 mb-1">Calificaciones de satisfacción</h3>
      <p className="text-xs text-gray-500 mb-5">
        Resumen de las calificaciones (1 a 5) que dejan los clientes al finalizar una consulta.
      </p>

      {loading ? (
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
  );
}
