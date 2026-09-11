import React, { useState, useEffect } from 'react';
import { Star, ShoppingCart, Bot, Headset, ShieldCheck, ShieldAlert, TrendingUp, CheckCircle2, XCircle, MessageSquare, Package, Store } from 'lucide-react';
import { isAdminRole, getStaffSucursalId } from '../lib/adminAuth';

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

// Promedio + distribución 1-5 de una sola dimensión (atención o producto).
// La reusan tanto el resumen global como, potencialmente, cualquier corte.
function RatingSummary({ resumen, label }) {
  if (!resumen || resumen.total === 0) {
    return (
      <div className="text-sm text-gray-400 py-6 text-center bg-gray-50 rounded-xl border border-gray-100">
        Todavía no hay calificaciones de {label} registradas.
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center gap-8 mb-6 bg-gray-50 rounded-xl p-5 border border-gray-100">
        <div>
          <div className="text-3xl font-bold text-gray-900 flex items-center gap-1.5">
            {resumen.promedio.toFixed(1)}
            <Star size={20} className="text-amber-400 fill-amber-400" />
          </div>
          <div className="text-xs text-gray-500 uppercase font-medium mt-1">Promedio general</div>
        </div>
        <div className="w-px h-12 bg-gray-200" />
        <div>
          <div className="text-3xl font-bold text-gray-900">{resumen.total}</div>
          <div className="text-xs text-gray-500 uppercase font-medium mt-1">Valoraciones totales</div>
        </div>
      </div>

      <div className="space-y-2">
        {[5, 4, 3, 2, 1].map(n => {
          const count = resumen.distribucion[n] || 0;
          const pct = resumen.total > 0 ? (count / resumen.total) * 100 : 0;
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
  );
}

export default function MetricsPanel() {
  const [negocio, setNegocio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const soyAdmin = isAdminRole();
  const miSucursalId = getStaffSucursalId();

  useEffect(() => {
    fetch('/api/metrics/negocio')
      .then(r => r.json())
      .then(negocioData => {
        if (negocioData.error) throw new Error(negocioData.error);
        setNegocio(negocioData);
      })
      .catch(err => {
        console.error('Error cargando métricas:', err);
        setError(err.message || 'Error cargando métricas.');
      })
      .finally(() => setLoading(false));
  }, []);

  // Un empleado de sucursal solo debería comparar contra su propio local, no
  // ver el desglose completo de todas las sucursales.
  const sucursalesVisibles = negocio?.calificaciones?.porSucursal
    ? (soyAdmin
        ? negocio.calificaciones.porSucursal
        : negocio.calificaciones.porSucursal.filter(s => s.sucursalId === miSucursalId))
    : [];

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

      <Seccion title="Satisfacción con la atención" description="Resumen de las calificaciones (1 a 5) que dejan los clientes sobre cómo fueron atendidos al finalizar una consulta.">
        <RatingSummary resumen={negocio?.calificaciones?.atencion} label="atención" />
      </Seccion>

      <Seccion title="Satisfacción con el producto" description="Resumen de las calificaciones (1 a 5) que dejan los clientes sobre el producto recibido, independiente de la atención.">
        <RatingSummary resumen={negocio?.calificaciones?.producto} label="producto" />
      </Seccion>

      <Seccion
        title="Promedio por sucursal"
        description={soyAdmin
          ? 'Puntaje promedio de atención y producto que dejó cada sucursal, comparado con el promedio general del sistema.'
          : 'Puntaje promedio de tu sucursal, comparado con el promedio general del sistema.'}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-teal-50 border border-teal-100">
            <div className="p-2 rounded-lg bg-white text-teal-600 shrink-0"><Store size={16} /></div>
            <span className="flex-1 text-sm font-semibold text-teal-800">Promedio general (todas las sucursales)</span>
            <span className="flex items-center gap-1 text-sm font-bold text-gray-800">
              {negocio?.calificaciones?.atencion?.total > 0 ? negocio.calificaciones.atencion.promedio.toFixed(1) : '—'}
              <Star size={14} className="text-amber-400 fill-amber-400" />
            </span>
            <span className="flex items-center gap-1 text-sm font-bold text-gray-800">
              {negocio?.calificaciones?.producto?.total > 0 ? negocio.calificaciones.producto.promedio.toFixed(1) : '—'}
              <Package size={14} className="text-sky-500" />
            </span>
          </div>

          {sucursalesVisibles.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center bg-gray-50 rounded-xl border border-gray-100">
              {soyAdmin ? 'Todavía no hay calificaciones asociadas a ninguna sucursal.' : 'Tu sucursal todavía no tiene calificaciones registradas.'}
            </div>
          ) : (
            sucursalesVisibles.map(s => (
              <div key={s.sucursalId || 'sin_sucursal'} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="p-2 rounded-lg bg-white text-gray-500 shrink-0"><Store size={16} /></div>
                <span className="flex-1 text-sm font-medium text-gray-800 truncate">{s.nombre}</span>
                <span className="flex items-center gap-1 text-sm font-semibold text-gray-700" title="Promedio de atención">
                  {s.atencion.total > 0 ? s.atencion.promedio.toFixed(1) : '—'}
                  <Star size={14} className="text-amber-400 fill-amber-400" />
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-gray-700" title="Promedio de producto">
                  {s.producto.total > 0 ? s.producto.promedio.toFixed(1) : '—'}
                  <Package size={14} className="text-sky-500" />
                </span>
              </div>
            ))
          )}
        </div>
      </Seccion>
    </div>
  );
}
