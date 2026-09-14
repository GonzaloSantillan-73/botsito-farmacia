import React, { useState, useEffect } from 'react';
import { Star, ShoppingCart, Bot, Headset, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, MessageSquare, Store, Filter, X } from 'lucide-react';
import { isAdminRole, getStaffSucursalId, adminFetch } from '../lib/adminAuth';
import StarRating, { coloresRating } from './StarRating';
import MetricsTable from './MetricsTable';
import Accordion from './Accordion';
import MetricsBucketModal from './MetricsBucketModal';

function StatCard({ icon: Icon, value, label, accent = 'text-gray-900' }) {
  console.log('🔍 [DEBUG-COMPONENT-MetricsPanel] Render StatCard — props:', { value, label, accent });
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

// Botón "Ver" al lado de una barra: abre el detalle de los chats de esa
// categoría puntual (ver MetricsBucketModal.jsx).
function VerBoton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-medium text-teal-600 hover:text-teal-800 hover:underline whitespace-nowrap shrink-0"
    >
      Ver
    </button>
  );
}

// Promedio + distribución 1-5 de una sola dimensión (atención o producto).
// La reusan tanto el resumen global como, potencialmente, cualquier corte.
// `type` fija el color según la convención global (amarillo atención / azul
// producto, ver StarRating.jsx). `onVer(n)`, si se pasa, agrega un botón
// "Ver" al lado de cada barra para abrir los chats con esa puntuación.
function RatingSummary({ resumen, label, type = 'atencion', onVer }) {
  console.log('🔍 [DEBUG-COMPONENT-MetricsPanel] Render RatingSummary — props:', { resumen, label, type });
  const colores = coloresRating(type);
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
          <StarRating value={resumen.promedio.toFixed(1)} type={type} size={20} className="text-3xl font-bold" />
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
              <span className="w-10 text-gray-600 shrink-0 flex items-center gap-0.5">{n}<Star size={12} className={colores.estrella} /></span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${colores.barra} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <span className="w-8 text-right text-gray-500 shrink-0">{count}</span>
              {onVer && <VerBoton onClick={() => onVer(n)} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function MetricsPanel() {
  console.log('🔍 [DEBUG-COMPONENT-MetricsPanel] Render — props: (ninguna)');

  const [negocio, setNegocio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Rango de fechas de la sección de estadísticas (Conversión, Resolución,
  // Seguridad, Satisfacción, Promedio por sucursal): independiente del que
  // ya tiene "Detalle de consultas" más arriba, porque son dos consultas al
  // backend separadas (/metrics/negocio vs /metrics/detalle).
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedRange, setAppliedRange] = useState({ startDate: '', endDate: '' });

  // Modal de "Ver" de una barra puntual: { title, filtros } o null si está cerrado.
  const [bucketModal, setBucketModal] = useState(null);

  const soyAdmin = isAdminRole();
  const miSucursalId = getStaffSucursalId();

  useEffect(() => {
    console.log('🔍 [DEBUG-COMPONENT-MetricsPanel] useEffect ejecutado — deps: [appliedRange] valores:', appliedRange);
    // Si el usuario cambia el filtro antes de que responda el fetch anterior
    // (ej. la carga inicial sin filtro, más pesada, todavía en vuelo), esa
    // respuesta vieja no debe pisar el resultado del filtro nuevo cuando
    // llegue tarde.
    let cancelado = false;
    const esCargaInicial = negocio === null;
    if (esCargaInicial) setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (appliedRange.startDate) params.set('startDate', appliedRange.startDate);
    if (appliedRange.endDate) params.set('endDate', appliedRange.endDate);

    console.log('📡 [DEBUG-COMPONENT-MetricsPanel] Fetch de metrics/negocio — params:', params.toString());
    adminFetch(`/api/metrics/negocio${params.toString() ? `?${params}` : ''}`)
      .then(r => r.json())
      .then(negocioData => {
        if (cancelado) return;
        console.log('📡 [DEBUG-COMPONENT-MetricsPanel] Respuesta metrics/negocio:', negocioData);
        if (negocioData.error) throw new Error(negocioData.error);
        setNegocio(negocioData);
      })
      .catch(err => {
        if (cancelado) return;
        console.error('❌ [DEBUG-COMPONENT-MetricsPanel] Error cargando métricas:', err);
        setError(err.message || 'Error cargando métricas.');
      })
      .finally(() => { if (!cancelado) setLoading(false); });

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedRange]);

  const handleFiltrar = () => {
    console.log('🖱️ [DEBUG-COMPONENT-MetricsPanel] handleFiltrar — startDate:', startDate, 'endDate:', endDate);
    setAppliedRange({ startDate, endDate });
  };
  const handleLimpiarFiltro = () => {
    console.log('🖱️ [DEBUG-COMPONENT-MetricsPanel] handleLimpiarFiltro');
    setStartDate('');
    setEndDate('');
    setAppliedRange({ startDate: '', endDate: '' });
  };

  // Abre el modal de "Ver": arrastra el mismo rango de fechas ya aplicado acá
  // arriba, para que la lista de chats coincida con lo que generó el número
  // que se está mirando.
  const abrirBucket = (title, filtrosExtra) => {
    console.log('🖱️ [DEBUG-COMPONENT-MetricsPanel] abrirBucket — title:', title, 'filtrosExtra:', filtrosExtra);
    setBucketModal({
      title,
      filtros: { startDate: appliedRange.startDate, endDate: appliedRange.endDate, ...filtrosExtra }
    });
  };

  // Un empleado de sucursal solo debería comparar contra su propio local, no
  // ver el desglose completo de todas las sucursales.
  const sucursalesVisibles = negocio?.calificaciones?.porSucursal
    ? (soyAdmin
        ? negocio.calificaciones.porSucursal
        : negocio.calificaciones.porSucursal.filter(s => s.sucursalId === miSucursalId))
    : [];
  console.log('🔍 [DEBUG-COMPONENT-MetricsPanel] sucursalesVisibles calculado — cantidad:', sucursalesVisibles.length);

  if (loading) {
    return <div className="text-sm text-gray-400 py-10 text-center">Cargando métricas...</div>;
  }

  if (error && !negocio) {
    return <div className="text-sm text-rose-600 py-10 text-center">{error}</div>;
  }

  return (
    <div>
      {/* Única sección de ancho completo y siempre visible: es una tabla con
          muchas columnas, no una tarjeta de resumen, así que no tiene sentido
          acotarla ni poder ocultarla. */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Detalle de consultas</h3>
        <p className="text-xs text-gray-500 mb-4">Una fila por consulta, con teléfono, tiempos de atención y datos del pago. Hacé clic en una columna para ordenar, filtrá por fecha y exportá todo a CSV.</p>
        <MetricsTable />
      </div>

      {/* El resto son tarjetas de resumen: se acotan a un ancho legible,
          centradas, y son colapsables para que el admin achique lo que no
          esté mirando en el momento. */}
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-MetricsPanel] onChange startDate — nuevo valor:', e.target.value); setStartDate(e.target.value); }}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-MetricsPanel] onChange endDate — nuevo valor:', e.target.value); setEndDate(e.target.value); }}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <button
            onClick={handleFiltrar}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Filter size={13} /> Filtrar
          </button>
          {(appliedRange.startDate || appliedRange.endDate) && (
            <button
              onClick={handleLimpiarFiltro}
              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-xs font-medium transition-colors"
            >
              <X size={13} /> Quitar filtro
            </button>
          )}
          {error && <p className="text-xs text-rose-600 w-full">{error}</p>}
        </div>

      <Accordion
        title="Conversión de ventas"
        description='Resultado que el vendedor marca a mano en el chat: "Venta Concretada", "Venta No Concretada" u "Otra razón".'
        icon={CheckCircle2}
        defaultOpen
      >
        {!negocio || negocio.conversion.totalGestionadas === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center bg-gray-50 rounded-xl border border-gray-100">
            Todavía no se marcó ninguna venta como concretada o no concretada.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="w-32 text-gray-600 shrink-0 flex items-center gap-1.5"><CheckCircle2 size={14} /> Concretadas</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(negocio.conversion.concretadas / negocio.conversion.totalGestionadas) * 100}%` }} />
              </div>
              <span className="w-8 text-right text-gray-500 shrink-0">{negocio.conversion.concretadas}</span>
              <VerBoton onClick={() => abrirBucket('Ventas concretadas', { saleStatus: 'concretada' })} />
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="w-32 text-gray-600 shrink-0 flex items-center gap-1.5"><XCircle size={14} /> No concretadas</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${(negocio.conversion.noConcretadas / negocio.conversion.totalGestionadas) * 100}%` }} />
              </div>
              <span className="w-8 text-right text-gray-500 shrink-0">{negocio.conversion.noConcretadas}</span>
              <VerBoton onClick={() => abrirBucket('Ventas no concretadas', { saleStatus: 'no_concretada' })} />
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="w-32 text-gray-600 shrink-0 flex items-center gap-1.5"><MessageSquare size={14} /> Otra razón</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(negocio.conversion.otras / negocio.conversion.totalGestionadas) * 100}%` }} />
              </div>
              <span className="w-8 text-right text-gray-500 shrink-0">{negocio.conversion.otras}</span>
              <VerBoton onClick={() => abrirBucket('Otra razón', { saleStatus: 'otra' })} />
            </div>
          </div>
        )}
      </Accordion>

      <Accordion
        title="Resolución autónoma del bot"
        description="De las consultas ya cerradas, cuántas se resolvieron sin intervención humana."
        icon={Bot}
        defaultOpen
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
                <VerBoton onClick={() => abrirBucket('Resueltas por el bot (sin humano)', { derivada: false })} />
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-32 text-gray-600 shrink-0 flex items-center gap-1.5"><Headset size={14} /> Derivadas</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${100 - negocio.operacion.pctAutonoma}%` }} />
                </div>
                <span className="w-8 text-right text-gray-500 shrink-0">{negocio.operacion.derivadas}</span>
                <VerBoton onClick={() => abrirBucket('Derivadas a un humano', { derivada: true })} />
              </div>
            </div>
          </>
        )}
      </Accordion>

      <Accordion
        title="Seguridad: filtro de PDFs"
        description="Efectividad del análisis de seguridad sobre los documentos PDF recibidos por WhatsApp."
        icon={ShieldCheck}
        defaultOpen
      >
        <div className="flex gap-3">
          <StatCard icon={ShieldAlert} value={negocio?.seguridad?.pdfBloqueados ?? 0} label="PDFs bloqueados" accent="text-rose-600" />
          <StatCard icon={ShieldCheck} value={negocio?.seguridad?.pdfAceptados ?? 0} label="PDFs aceptados" accent="text-emerald-600" />
        </div>
      </Accordion>

      <Accordion title="Satisfacción con la atención" description="Resumen de las calificaciones (1 a 5) que dejan los clientes sobre cómo fueron atendidos al finalizar una consulta." icon={Headset} defaultOpen>
        <RatingSummary
          resumen={negocio?.calificaciones?.atencion}
          label="atención"
          type="atencion"
          onVer={(n) => abrirBucket(`Calificación de atención: ${n} ${n === 1 ? 'estrella' : 'estrellas'}`, { rating: n })}
        />
      </Accordion>

      <Accordion title="Satisfacción con el producto" description="Resumen de las calificaciones (1 a 5) que dejan los clientes sobre el producto recibido, independiente de la atención." icon={ShoppingCart} defaultOpen>
        <RatingSummary
          resumen={negocio?.calificaciones?.producto}
          label="producto"
          type="producto"
          onVer={(n) => abrirBucket(`Calificación de producto: ${n} ${n === 1 ? 'estrella' : 'estrellas'}`, { productRating: n })}
        />
      </Accordion>

      <Accordion
        title="Promedio por sucursal"
        description={soyAdmin
          ? 'Puntaje promedio de atención y producto que dejó cada sucursal, comparado con el promedio general del sistema.'
          : 'Puntaje promedio de tu sucursal, comparado con el promedio general del sistema.'}
        icon={Store}
        defaultOpen
      >
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-teal-50 border border-teal-100">
            <div className="p-2 rounded-lg bg-white text-teal-600 shrink-0"><Store size={16} /></div>
            <span className="flex-1 text-sm font-semibold text-teal-800">Promedio general (todas las sucursales)</span>
            <StarRating
              value={negocio?.calificaciones?.atencion?.total > 0 ? negocio.calificaciones.atencion.promedio.toFixed(1) : '—'}
              type="atencion"
              size={14}
              className="text-sm font-bold"
            />
            <StarRating
              value={negocio?.calificaciones?.producto?.total > 0 ? negocio.calificaciones.producto.promedio.toFixed(1) : '—'}
              type="producto"
              size={14}
              className="text-sm font-bold"
            />
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
                <StarRating
                  value={s.atencion.total > 0 ? s.atencion.promedio.toFixed(1) : '—'}
                  type="atencion"
                  size={14}
                  className="text-sm font-semibold"
                />
                <StarRating
                  value={s.producto.total > 0 ? s.producto.promedio.toFixed(1) : '—'}
                  type="producto"
                  size={14}
                  className="text-sm font-semibold"
                />
              </div>
            ))
          )}
        </div>
      </Accordion>
      </div>

      {bucketModal && (
        <MetricsBucketModal
          title={bucketModal.title}
          filtros={bucketModal.filtros}
          onClose={() => setBucketModal(null)}
        />
      )}
    </div>
  );
}
