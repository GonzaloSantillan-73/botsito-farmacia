import React, { useState, useEffect } from 'react';
import { Star, ShoppingCart, Bot, Headset, ShieldCheck, ShieldAlert, TrendingUp, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';

const formatMoney = (n) => `$${(Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

function Seccion({ title, description, children }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">{title}</h3>
      {description && <p className="text-xs text-gray-500 mb-4">{description}</p>}
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, value, label, accent = 'text-gray-900' }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex-1">
      <div className={`text-2xl font-bold flex items-center gap-1.5 ${accent}`}>
        <Icon size={18} className="shrink-0" />
        {value}
      </div>
      <div className="text-xs text-gray-500 uppercase font-medium mt-1">{label}</div>
    </div>
  );
}

export default function MetricsPanel() {
  const [ratingMetrics, setRatingMetrics] = useState(null);
  const [negocio, setNegocio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('conversations').select('rating').not('rating', 'is', null),
      fetch('/api/metrics/negocio').then(r => r.json())
    ])
      .then(([ratingRes, negocioData]) => {
        if (ratingRes.error) throw ratingRes.error;
        if (negocioData.error) throw new Error(negocioData.error);

        const ratings = (ratingRes.data || []).map(r => r.rating);
        const total = ratings.length;
        const average = total > 0 ? ratings.reduce((a, b) => a + b, 0) / total : 0;
        const distribution = [1, 2, 3, 4, 5].reduce((acc, n) => {
          acc[n] = ratings.filter(r => r === n).length;
          return acc;
        }, {});

        setRatingMetrics({ total, average, distribution });
        setNegocio(negocioData);
      })
      .catch(err => {
        console.error('Error cargando métricas:', err);
        setError(err.message || 'Error cargando métricas.');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-400 py-10 text-center">Cargando métricas...</div>;
  }

  if (error) {
    return <div className="text-sm text-rose-600 py-10 text-center">{error}</div>;
  }

  return (
    <div>
      <Seccion
        title="Conversión de ventas"
        description='Resultado que el vendedor marca a mano en el chat: "Venta Concretada", "Venta No Concretada" u "Otra razón".'
      >
        {!negocio || negocio.conversion.totalGestionadas === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center bg-gray-50 rounded-xl border border-gray-100">
            Todavía no se marcó ninguna venta como concretada o no concretada.
          </div>
        ) : (
          <>
            <div className="flex gap-3 mb-5">
              <StatCard icon={TrendingUp} value={`${negocio.conversion.tasaConversion.toFixed(0)}%`} label="Tasa de conversión" accent="text-teal-700" />
              <StatCard icon={ShoppingCart} value={formatMoney(negocio.conversion.ticketPromedioConcretadas)} label="Ticket promedio (concretadas)" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-32 text-gray-600 shrink-0 flex items-center gap-1.5"><CheckCircle2 size={14} /> Concretadas</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(negocio.conversion.concretadas / negocio.conversion.totalGestionadas) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-gray-500 shrink-0">{negocio.conversion.concretadas}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-32 text-gray-600 shrink-0 flex items-center gap-1.5"><XCircle size={14} /> No concretadas</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${(negocio.conversion.noConcretadas / negocio.conversion.totalGestionadas) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-gray-500 shrink-0">{negocio.conversion.noConcretadas}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-32 text-gray-600 shrink-0 flex items-center gap-1.5"><MessageSquare size={14} /> Otra razón</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(negocio.conversion.otras / negocio.conversion.totalGestionadas) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-gray-500 shrink-0">{negocio.conversion.otras}</span>
              </div>
            </div>
          </>
        )}
      </Seccion>

      <Seccion
        title="Resolución autónoma del bot"
        description="De las consultas ya cerradas, cuántas se resolvieron sin intervención humana."
      >
        {!negocio || negocio.operacion.totalCerradas === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center bg-gray-50 rounded-xl border border-gray-100">
            Todavía no hay consultas cerradas.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-8 mb-4 bg-gray-50 rounded-xl p-5 border border-gray-100">
              <div>
                <div className="text-3xl font-bold text-teal-700">{negocio.operacion.pctAutonoma.toFixed(0)}%</div>
                <div className="text-xs text-gray-500 uppercase font-medium mt-1">Resueltas por el bot</div>
              </div>
              <div className="w-px h-12 bg-gray-200" />
              <div>
                <div className="text-3xl font-bold text-gray-900">{negocio.operacion.totalCerradas}</div>
                <div className="text-xs text-gray-500 uppercase font-medium mt-1">Consultas cerradas</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-32 text-gray-600 shrink-0 flex items-center gap-1.5"><Bot size={14} /> Bot (sin humano)</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${negocio.operacion.pctAutonoma}%` }} />
                </div>
                <span className="w-8 text-right text-gray-500 shrink-0">{negocio.operacion.autonomas}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-32 text-gray-600 shrink-0 flex items-center gap-1.5"><Headset size={14} /> Derivadas</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${100 - negocio.operacion.pctAutonoma}%` }} />
                </div>
                <span className="w-8 text-right text-gray-500 shrink-0">{negocio.operacion.derivadas}</span>
              </div>
            </div>
          </>
        )}
      </Seccion>

      <Seccion
        title="Seguridad: filtro de PDFs"
        description="Efectividad del análisis de seguridad sobre los documentos PDF recibidos por WhatsApp."
      >
        <div className="flex gap-3">
          <StatCard icon={ShieldAlert} value={negocio?.seguridad?.pdfBloqueados ?? 0} label="PDFs bloqueados" accent="text-rose-600" />
          <StatCard icon={ShieldCheck} value={negocio?.seguridad?.pdfAceptados ?? 0} label="PDFs aceptados" accent="text-emerald-600" />
        </div>
      </Seccion>

      <Seccion title="Calificaciones de satisfacción" description="Resumen de las calificaciones (1 a 5) que dejan los clientes al finalizar una consulta.">
        {!ratingMetrics || ratingMetrics.total === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center bg-gray-50 rounded-xl border border-gray-100">
            Todavía no hay calificaciones registradas.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-8 mb-6 bg-gray-50 rounded-xl p-5 border border-gray-100">
              <div>
                <div className="text-3xl font-bold text-gray-900 flex items-center gap-1.5">
                  {ratingMetrics.average.toFixed(1)}
                  <Star size={20} className="text-amber-400 fill-amber-400" />
                </div>
                <div className="text-xs text-gray-500 uppercase font-medium mt-1">Promedio general</div>
              </div>
              <div className="w-px h-12 bg-gray-200" />
              <div>
                <div className="text-3xl font-bold text-gray-900">{ratingMetrics.total}</div>
                <div className="text-xs text-gray-500 uppercase font-medium mt-1">Valoraciones totales</div>
              </div>
            </div>

            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map(n => {
                const count = ratingMetrics.distribution[n] || 0;
                const pct = ratingMetrics.total > 0 ? (count / ratingMetrics.total) * 100 : 0;
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
      </Seccion>
    </div>
  );
}
