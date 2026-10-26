import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import {
  MessageSquare, Users, ShoppingCart, DollarSign, Receipt, Percent, Send,
  Filter, RefreshCw, Download, ArrowUp, ArrowDown, Minus, Truck, Clock, Headset, ArrowUpDown,
  CheckCircle2, XCircle, Bot, ShieldCheck, ShieldAlert, Store
} from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';
import StarRating, { coloresRating } from './StarRating';
import MetricsBucketModal from './MetricsBucketModal';
import CalificacionesModal from './CalificacionesModal';

// Panel de Métricas y Estadísticas (etapa 3): pantalla de lo que calcula
// GET /api/metrics/panel (server/services/metricasPanel.js). Sólo admin.
//
// Colores de los gráficos: los dos primeros de la paleta categórica validada
// (azul = bot, naranja = sucursal), con su versión para modo oscuro; los
// gráficos de una sola serie usan el azul. Validados con el script de la
// guía de visualización (daltonismo y contraste, en claro y en oscuro).
const COLORES = {
  claro: { bot: '#2a78d6', sucursal: '#eb6834', una: '#2a78d6', grilla: '#e5e7eb', eje: '#6b7280', fondoTooltip: '#ffffff', textoTooltip: '#111827', borde: '#e5e7eb' },
  oscuro: { bot: '#3987e5', sucursal: '#d95926', una: '#3987e5', grilla: '#374151', eje: '#9ca3af', fondoTooltip: '#1f2937', textoTooltip: '#f3f4f6', borde: '#374151' }
};

// El tema se cambia con la clase "dark" en <html> (ver applyTheme): se
// escucha ese cambio para repintar los gráficos.
const useModoOscuro = () => {
  const [oscuro, setOscuro] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setOscuro(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return oscuro;
};

const hoyAR = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const restarDias = (fecha, dias) => new Date(Date.parse(`${fecha}T12:00:00Z`) - dias * 86400000).toISOString().slice(0, 10);

const $ = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`);
const num = (n, dec = 0) => (n == null ? '—' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const porc = (n) => (n == null ? '—' : `${num(n, 1)}%`);
const minutos = (ms) => {
  if (ms == null) return '—';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};
const fechaCorta = (f) => { const [, m, d] = f.split('-'); return `${d}/${m}`; };

const TIPOS_BOT = {
  menu: 'Bienvenida y menú', recordatorio: 'Recordatorio de botones', ubicacion: 'Pedido de ubicación',
  derivacion: 'Derivación a una sucursal', registro: 'Registro (nombre)', encuesta: 'Encuesta y cierre',
  aviso_inactividad: '"¿Seguís necesitando ayuda?"', sucursales: 'Listado de sucursales',
  fuera_horario: 'Fuera de horario', cambio_nombre: 'Cambio de nombre', error: 'Avisos de error',
  otro: 'Otros', sin_dato: 'Sin dato (anteriores)'
};
const MOTIVOS_CIERRE = {
  manual: 'Finalizada por el vendedor (con encuesta)', manual_sin_encuesta: 'Finalizada por el vendedor (sin encuesta)',
  inactividad_cliente: 'El cliente dejó de responder', sin_respuesta_farmacia: 'La farmacia no respondió a tiempo',
  sin_tomar: 'Ninguna sucursal la tomó', solo_bot: 'Solo con el bot', sin_dato: 'Sin dato (anteriores)'
};
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ---------- piezas chicas ----------

function Variacion({ valor, mejorSiBaja = false }) {
  if (valor == null) return <span className="text-[11px] text-gray-400 dark:text-gray-500">sin comparación</span>;
  const sube = valor > 0.05;
  const baja = valor < -0.05;
  const bueno = mejorSiBaja ? baja : sube;
  const malo = mejorSiBaja ? sube : baja;
  const Icono = sube ? ArrowUp : baja ? ArrowDown : Minus;
  const clase = bueno ? 'text-emerald-600 dark:text-emerald-400' : malo ? 'text-rose-600 dark:text-rose-400' : 'text-gray-500 dark:text-gray-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${clase}`}>
      <Icono size={12} />{num(Math.abs(valor), 1)}%
    </span>
  );
}

function Tile({ icon: Icono, label, valor, variacion, mejorSiBaja, ayuda }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col gap-1 min-w-0" title={ayuda}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <Icono size={13} className="shrink-0" /> {label}
      </span>
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums truncate">{valor}</span>
      {variacion !== undefined && <Variacion valor={variacion} mejorSiBaja={mejorSiBaja} />}
    </div>
  );
}

function Seccion({ titulo, descripcion, children }) {
  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</h3>
        {descripcion && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}

function Datos({ children }) {
  return <div>{children}</div>;
}

function Dato({ label, valor, detalle }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0 text-sm">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums text-right">
        {valor}{detalle && <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">{detalle}</span>}
      </span>
    </div>
  );
}

// Barras horizontales simples (una sola serie): ranking de tipos, sucursales, motivos.
// Cada fila puede traer su propio color (f.color, o f.claseColor de Tailwind),
// un ícono (f.icono) y un botón "Ver" (f.onVer) que abre los chats de esa fila.
// `relativoA`: 'max' (la barra más larga ocupa todo) o 'total' (% del total).
function BarrasLista({ filas, color, relativoA = 'max', anchoEtiqueta = 'w-44 sm:w-60' }) {
  const base = relativoA === 'total'
    ? Math.max(1, filas.reduce((a, f) => a + f.valor, 0))
    : Math.max(1, ...filas.map(f => f.valor));
  return (
    <div className="space-y-2">
      {filas.map(f => (
        <div key={f.label} className="flex items-center gap-3 text-sm" title={`${f.label}: ${num(f.valor)}${f.extra ? ` (${f.extra})` : ''}`}>
          <span className={`${anchoEtiqueta} shrink-0 leading-tight text-gray-600 dark:text-gray-300 flex items-center gap-1.5`}>
            {f.icono && <f.icono size={14} className="shrink-0" />}{f.label}
          </span>
          <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${f.claseColor || ''}`} style={{ width: `${(f.valor / base) * 100}%`, ...(f.claseColor ? {} : { background: f.color || color }) }} />
          </div>
          <span className="w-20 shrink-0 text-right tabular-nums text-gray-700 dark:text-gray-200">
            {num(f.valor)}{f.extra && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{f.extra}</span>}
          </span>
          {f.onVer && (
            <button onClick={f.onVer} className="text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0">
              Ver
            </button>
          )}
        </div>
      ))}
      {filas.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">Sin datos en este período.</p>}
    </div>
  );
}

// Calificaciones 1 a 5 (atención o producto), con el mismo color de siempre
// (atención ámbar, producto azul: ver StarRating.jsx) y "Ver" por puntaje.
function Calificaciones({ resumen, tipo, nombre, onVer }) {
  if (!resumen || resumen.total === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">Todavía no hay calificaciones de {nombre} en este período.</p>;
  }
  const colores = coloresRating(tipo);
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-6">
        <div>
          <StarRating value={resumen.promedio.toFixed(1)} type={tipo} size={20} className="text-3xl font-bold" />
          <div className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mt-1">Promedio</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{num(resumen.total)}</div>
          <div className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mt-1">Calificaciones</div>
        </div>
      </div>
      <BarrasLista
        relativoA="total"
        anchoEtiqueta="w-12"
        filas={[5, 4, 3, 2, 1].map(n => ({
          label: `${n} ★`,
          valor: resumen.distribucion[n] || 0,
          extra: porc(resumen.total ? ((resumen.distribucion[n] || 0) / resumen.total) * 100 : null),
          claseColor: colores.barra,
          onVer: () => onVer(n)
        }))}
      />
    </div>
  );
}

const estiloTooltip = (c) => ({
  contentStyle: { background: c.fondoTooltip, border: `1px solid ${c.borde}`, borderRadius: 8, fontSize: 12, color: c.textoTooltip },
  labelStyle: { color: c.textoTooltip, fontWeight: 600 },
  itemStyle: { color: c.textoTooltip }
});
const ejes = (c) => ({ tick: { fill: c.eje, fontSize: 11 }, axisLine: { stroke: c.grilla }, tickLine: false });

// ---------- tabla por sucursal ----------

const COLUMNAS_SUCURSAL = [
  { key: 'nombre', label: 'Sucursal', fmt: v => v, texto: true },
  { key: 'consultas', label: 'Consultas', fmt: v => num(v) },
  { key: 'clientes', label: 'Clientes', fmt: v => num(v) },
  { key: 'pedidos', label: 'Pedidos', fmt: v => num(v) },
  { key: 'monto', label: 'Monto', fmt: $ },
  { key: 'ticketPromedio', label: 'Ticket prom.', fmt: $ },
  { key: 'conversion', label: 'Conversión', fmt: porc },
  { key: 'enviosGratis', label: 'Envíos gratis', fmt: v => num(v) },
  { key: 'mensajes', label: 'Mensajes', fmt: v => num(v) },
  { key: 'mensajesPorConsulta', label: 'Msjs/consulta', fmt: v => num(v, 1) },
  { key: 'demoraPromedioMs', label: 'Demora prom.', fmt: minutos },
  { key: 'satisfaccion', label: 'Satisfacción', fmt: v => (v == null ? '—' : `${num(v, 1)} / 5`) }
];

function TablaSucursales({ filas, totales }) {
  const [orden, setOrden] = useState({ key: 'consultas', asc: false });
  const ordenadas = useMemo(() => [...filas].sort((a, b) => {
    const va = a[orden.key]; const vb = b[orden.key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const r = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return orden.asc ? r : -r;
  }), [filas, orden]);

  return (
    <div className="overflow-x-auto scrollbar-thin rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr>
            {COLUMNAS_SUCURSAL.map(c => (
              <th key={c.key} className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap ${c.texto ? 'text-left' : 'text-right'}`}>
                <button
                  onClick={() => setOrden(o => ({ key: c.key, asc: o.key === c.key ? !o.asc : false }))}
                  className="inline-flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  {c.label}<ArrowUpDown size={11} className={orden.key === c.key ? 'opacity-100' : 'opacity-30'} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(f => (
            <tr key={f.sucursalId || f.nombre} className="border-t border-gray-100 dark:border-gray-800">
              {COLUMNAS_SUCURSAL.map(c => (
                <td key={c.key} className={`px-3 py-2 whitespace-nowrap tabular-nums ${c.texto ? 'text-left text-gray-800 dark:text-gray-100' : 'text-right text-gray-700 dark:text-gray-300'}`}>
                  {c.fmt(f[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 font-semibold">
            {COLUMNAS_SUCURSAL.map(c => (
              <td key={c.key} className={`px-3 py-2 whitespace-nowrap tabular-nums ${c.texto ? 'text-left' : 'text-right'} text-gray-900 dark:text-gray-100`}>
                {c.fmt(totales[c.key])}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------- panel ----------

export default function PanelEstadisticas() {
  const oscuro = useModoOscuro();
  const c = oscuro ? COLORES.oscuro : COLORES.claro;

  // Por defecto, los últimos 30 días (así hay período anterior para comparar).
  const [desde, setDesde] = useState(() => restarDias(hoyAR(), 29));
  const [hasta, setHasta] = useState(() => hoyAR());
  const [rango, setRango] = useState(() => ({ startDate: restarDias(hoyAR(), 29), endDate: hoyAR() }));
  const [datos, setDatos] = useState(null);
  // Lo que antes estaba más abajo en desplegables (conversión marcada por el
  // vendedor, resolución del bot, PDFs y calificaciones): GET /metrics/negocio,
  // con el mismo rango de fechas que el resto del panel.
  const [negocio, setNegocio] = useState(null);
  // Lista de chats de una barra puntual ("Ver"): { title, filtros } o null.
  const [bucket, setBucket] = useState(null);
  // Sucursal cuyas calificaciones se están mirando (pantalla completa).
  // Lista de calificaciones a pantalla completa: { sucursal|null, tipo, estrellas|null }.
  const [calif, setCalif] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError('');
    const params = new URLSearchParams();
    if (rango.startDate) params.set('startDate', rango.startDate);
    if (rango.endDate) params.set('endDate', rango.endDate);
    const consulta = params.toString() ? `?${params}` : '';
    Promise.all([
      adminFetch(`/api/metrics/panel${consulta}`).then(r => r.json()),
      adminFetch(`/api/metrics/negocio${consulta}`).then(r => r.json())
    ])
      .then(([d, n]) => {
        if (cancelado) return;
        if (d.error) throw new Error(d.error);
        if (n.error) throw new Error(n.error);
        setDatos(d);
        setNegocio(n);
      })
      .catch(err => { if (!cancelado) setError(err.message || 'No se pudieron cargar las estadísticas.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [rango, recarga]);

  const aplicar = (startDate, endDate) => {
    setDesde(startDate);
    setHasta(endDate);
    setRango({ startDate, endDate });
  };
  const atajo = (dias) => aplicar(restarDias(hoyAR(), dias - 1), hoyAR());
  const esteMes = () => aplicar(`${hoyAR().slice(0, 8)}01`, hoyAR());

  const exportar = async () => {
    setExportando(true);
    try {
      const params = new URLSearchParams();
      if (rango.startDate) params.set('startDate', rango.startDate);
      if (rango.endDate) params.set('endDate', rango.endDate);
      const res = await adminFetch(`/api/export/metrics-sucursales${params.toString() ? `?${params}` : ''}`);
      if (!res.ok) throw new Error('No se pudo exportar.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `metricas_por_sucursal${rango.startDate ? `_${rango.startDate}_a_${rango.endDate}` : ''}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'No se pudo exportar.');
    } finally {
      setExportando(false);
    }
  };

  const r = datos?.resumen;
  const v = datos?.variaciones || {};
  const porDia = (datos?.porDia || []).map(d => ({ ...d, dia: fechaCorta(d.fecha) }));
  const totalesSucursal = datos ? {
    nombre: 'Total',
    consultas: r.consultas, clientes: r.clientes, pedidos: r.pedidos, monto: r.montoTotal, ticketPromedio: r.ticketPromedio,
    conversion: r.conversion, enviosGratis: datos.ventas.envios.gratis, mensajes: datos.mensajes.sucursal,
    mensajesPorConsulta: r.consultas > 0 ? datos.mensajes.sucursal / r.consultas : null,
    demoraPromedioMs: datos.atencion.demoraPromedioMs, satisfaccion: null
  } : null;

  const inputFecha = 'px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500';
  const botonAtajo = 'px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors';

  return (
    <div className="space-y-4">
      {/* Filtros: una sola fila arriba de todo */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="est-desde" className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Desde</label>
          <input id="est-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputFecha} />
        </div>
        <div>
          <label htmlFor="est-hasta" className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
          <input id="est-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputFecha} />
        </div>
        <button onClick={() => aplicar(desde, hasta)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-medium transition-colors">
          <Filter size={13} /> Filtrar
        </button>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => atajo(7)} className={botonAtajo}>7 días</button>
          <button onClick={() => atajo(30)} className={botonAtajo}>30 días</button>
          <button onClick={esteMes} className={botonAtajo}>Este mes</button>
          <button onClick={() => aplicar('', '')} className={botonAtajo}>Todo</button>
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setRecarga(k => k + 1)} disabled={cargando} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button onClick={exportar} disabled={exportando || !datos} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
            <Download size={13} /> {exportando ? 'Exportando...' : 'Excel por sucursal'}
          </button>
        </div>
        {datos?.periodoAnterior && (
          <p className="w-full text-[11px] text-gray-500 dark:text-gray-400">
            Las flechas comparan con el período anterior del mismo largo ({fechaCorta(datos.periodoAnterior.startDate)} al {fechaCorta(datos.periodoAnterior.endDate)}). No incluye el número de prueba.
          </p>
        )}
        {error && <p className="w-full text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      {!datos ? (
        <div className="text-sm text-gray-400 py-10 text-center">{cargando ? 'Calculando estadísticas...' : 'Sin datos.'}</div>
      ) : (
        <div className={`space-y-4 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
            <Tile icon={MessageSquare} label="Consultas" valor={num(r.consultas)} variacion={v.consultas} />
            <Tile icon={Users} label="Clientes" valor={num(r.clientes)} variacion={v.clientes} />
            <Tile icon={ShoppingCart} label="Pedidos" valor={num(r.pedidos)} variacion={v.pedidos} />
            <Tile icon={DollarSign} label="Monto vendido" valor={$(r.montoTotal)} variacion={v.montoTotal} />
            <Tile icon={Receipt} label="Ticket promedio" valor={$(r.ticketPromedio)} variacion={v.ticketPromedio} ayuda="Monto vendido ÷ cantidad de pedidos" />
            <Tile icon={Send} label="Mensajes enviados" valor={num(r.mensajes)} variacion={v.mensajes} mejorSiBaja ayuda="Mensajes del bot y de las sucursales (cada uno se cobra)" />
            <Tile icon={Percent} label="Conversión" valor={porc(r.conversion)} variacion={v.conversion} ayuda="De las consultas que atendió una sucursal, cuántas terminaron en venta" />
          </div>

          {/* Mensajes */}
          <Seccion titulo="Mensajes de WhatsApp" descripcion="Mensajes enviados por el bot y por las sucursales. No bajan si se elimina un chat, porque Meta ya los cobró.">
            <div className="grid lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 h-64 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={porDia} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke={c.grilla} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="dia" {...ejes(c)} minTickGap={16} />
                    <YAxis {...ejes(c)} allowDecimals={false} />
                    <Tooltip {...estiloTooltip(c)} />
                    <Legend wrapperStyle={{ fontSize: 12, color: c.eje }} />
                    <Line type="monotone" dataKey="mensajesBot" name="Bot" stroke={c.bot} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="mensajesSucursal" name="Sucursales" stroke={c.sucursal} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <Dato label="Total" valor={num(datos.mensajes.total)} />
                <Dato label="Bot" valor={num(datos.mensajes.bot)} detalle={porc(datos.mensajes.pctBot)} />
                <Dato label="Sucursales" valor={num(datos.mensajes.sucursal)} detalle={porc(datos.mensajes.pctSucursal)} />
                <Dato label="Promedio por consulta" valor={num(datos.mensajes.promedioPorConsulta, 1)} />
                {!datos.mensajes.desdeRegistro && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">Falta correr el SQL de métricas: los mensajes de chats eliminados no se cuentan.</p>
                )}
              </div>
            </div>
            <div className="grid lg:grid-cols-2 gap-5">
              <div>
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Mensajes del bot por tipo</h4>
                <BarrasLista color={c.bot} filas={Object.entries(datos.mensajes.porTipoBot).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: TIPOS_BOT[k] || k, valor: n }))} />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Mensajes por sucursal</h4>
                <BarrasLista color={c.sucursal} filas={datos.mensajes.porSucursal.map(s => ({ label: s.nombre, valor: s.mensajes }))} />
              </div>
            </div>
          </Seccion>

          {/* Ventas */}
          <Seccion titulo="Ventas y montos" descripcion="Pedidos confirmados y ventas marcadas como concretadas. Al eliminar un chat se descuentan sus pedidos.">
            <div className="grid lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 h-64 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={porDia} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="relleno-monto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.una} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={c.una} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={c.grilla} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="dia" {...ejes(c)} minTickGap={16} />
                    <YAxis {...ejes(c)} tickFormatter={(n) => `$${Math.round(n / 1000)}k`} />
                    <Tooltip {...estiloTooltip(c)} formatter={(n) => [$(n), 'Monto vendido']} />
                    <Area type="monotone" dataKey="monto" name="Monto vendido" stroke={c.una} strokeWidth={2} fill="url(#relleno-monto)" activeDot={{ r: 4 }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div>
                <Dato label="Monto vendido" valor={$(datos.ventas.montoTotal)} />
                <Dato label="Pedidos" valor={num(datos.ventas.pedidos)} />
                <Dato label="Ticket promedio" valor={$(datos.ventas.ticketPromedio)} />
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-1"><Truck size={13} /> Envíos</h4>
                <Dato label="Gratis" valor={num(datos.ventas.envios.gratis)} detalle={porc(datos.ventas.envios.pctGratis)} />
                <Dato label="Con costo" valor={num(datos.ventas.envios.pago)} detalle={$(datos.ventas.envios.montoEnvios)} />
                <Dato label="Sin costo de envío cargado" valor={num(datos.ventas.envios.sinCosto)} />
                {datos.ventas.envios.sinDato > 0 && <Dato label="Sin dato" valor={num(datos.ventas.envios.sinDato)} />}
              </div>
            </div>
          </Seccion>

          {/* Clientes + Atención */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Seccion titulo="Clientes">
              <Datos>
              <Dato label="Clientes atendidos" valor={num(datos.clientes.atendidos)} />
              <Dato label="Nuevos" valor={num(datos.clientes.nuevos)} />
              <Dato label="Que vuelven" valor={num(datos.clientes.queVuelven)} />
              <Dato label="Compraron" valor={num(datos.clientes.compraron)} detalle={porc(datos.clientes.pctCompraron)} />
              <Dato label="Solo consultaron" valor={num(datos.clientes.soloConsultaron)} />
              <Dato label="Consultas por cliente" valor={num(datos.clientes.consultasPorCliente, 1)} />
              </Datos>
            </Seccion>
            <Seccion titulo="Atención">
              <Datos>
              <Dato label="Consultas" valor={num(datos.atencion.consultas)} />
              <Dato label="Atendidas por una sucursal" valor={num(datos.atencion.atendidasPorSucursal)} />
              <Dato label="Derivadas o devueltas a la cola" valor={num(datos.atencion.reasignadas)} />
              <Dato label="Demora hasta la primera respuesta" valor={minutos(datos.atencion.demoraPromedioMs)} />
              <Dato label="Duración promedio" valor={minutos(datos.atencion.duracionPromedioMs)} />
              </Datos>
            </Seccion>
          </div>

          {/* Resultado marcado por el vendedor + bot vs. derivadas */}
          {negocio && (
            <div className="grid lg:grid-cols-2 gap-4">
              <Seccion titulo="Resultado de las consultas" descripcion='Lo que marca el vendedor al finalizar: "Venta Concretada", "Venta No Concretada" u "Otra razón".'>
                {negocio.conversion.totalGestionadas === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">Todavía no se marcó ningún resultado en este período.</p>
                ) : (
                  <BarrasLista
                    relativoA="total"
                    anchoEtiqueta="w-36"
                    filas={[
                      { label: 'Concretadas', icono: CheckCircle2, valor: negocio.conversion.concretadas, claseColor: 'bg-emerald-500', extra: porc((negocio.conversion.concretadas / negocio.conversion.totalGestionadas) * 100), onVer: () => setBucket({ title: 'Ventas concretadas', filtros: { saleStatus: 'concretada' } }) },
                      { label: 'No concretadas', icono: XCircle, valor: negocio.conversion.noConcretadas, claseColor: 'bg-rose-500', extra: porc((negocio.conversion.noConcretadas / negocio.conversion.totalGestionadas) * 100), onVer: () => setBucket({ title: 'Ventas no concretadas', filtros: { saleStatus: 'no_concretada' } }) },
                      { label: 'Otra razón', icono: MessageSquare, valor: negocio.conversion.otras, claseColor: 'bg-amber-500', extra: porc((negocio.conversion.otras / negocio.conversion.totalGestionadas) * 100), onVer: () => setBucket({ title: 'Otra razón', filtros: { saleStatus: 'otra' } }) }
                    ]}
                  />
                )}
                {negocio.conversion.totalGestionadas > 0 && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800 text-sm">
                    <span className="font-semibold text-gray-700 dark:text-gray-200">Total de consultas con resultado</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{num(negocio.conversion.totalGestionadas)}</span>
                  </div>
                )}
              </Seccion>
              <Seccion titulo="Resueltas por el bot" descripcion="De las consultas ya cerradas, cuántas se resolvieron sin que interviniera una persona.">
                {negocio.operacion.totalCerradas === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">Todavía no hay consultas cerradas en este período.</p>
                ) : (
                  <BarrasLista
                    relativoA="total"
                    anchoEtiqueta="w-36"
                    filas={[
                      { label: 'Solo con el bot', icono: Bot, valor: negocio.operacion.autonomas, color: c.bot, extra: porc(negocio.operacion.pctAutonoma), onVer: () => setBucket({ title: 'Resueltas por el bot (sin humano)', filtros: { derivada: false } }) },
                      { label: 'Con una persona', icono: Headset, valor: negocio.operacion.derivadas, color: c.sucursal, extra: porc(100 - negocio.operacion.pctAutonoma), onVer: () => setBucket({ title: 'Derivadas a un humano', filtros: { derivada: true } }) }
                    ]}
                  />
                )}
              </Seccion>
            </div>
          )}

          <Seccion titulo="Cómo se cerraron las consultas" descripcion="Motivo de cierre de cada consulta (se registra desde la actualización de octubre; las anteriores figuran como sin dato).">
            <BarrasLista color={c.una} filas={Object.entries(datos.atencion.cierres).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: MOTIVOS_CIERRE[k] || k, valor: n }))} />
          </Seccion>

          {/* Consultas en el tiempo */}
          <Seccion titulo="Cuándo llegan las consultas" descripcion="Para organizar el personal: consultas por día, por hora y por día de la semana (hora Argentina).">
            <div className="h-56 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={porDia} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={c.grilla} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dia" {...ejes(c)} minTickGap={16} />
                  <YAxis {...ejes(c)} allowDecimals={false} />
                  <Tooltip {...estiloTooltip(c)} formatter={(n) => [num(n), 'Consultas']} />
                  <Line type="monotone" dataKey="consultas" name="Consultas" stroke={c.una} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 h-52 min-w-0">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1"><Clock size={13} /> Por hora</h4>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={datos.atencion.porHora.map(h => ({ ...h, label: `${h.hora}h` }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={c.grilla} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" {...ejes(c)} interval={2} />
                    <YAxis {...ejes(c)} allowDecimals={false} />
                    <Tooltip {...estiloTooltip(c)} cursor={{ fill: c.grilla, opacity: 0.4 }} formatter={(n) => [num(n), 'Consultas']} />
                    <Bar dataKey="consultas" fill={c.una} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-52 min-w-0">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1"><Headset size={13} /> Por día de la semana</h4>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={[1, 2, 3, 4, 5, 6, 0].map(d => ({ label: DIAS_SEMANA[d], consultas: datos.atencion.porDiaSemana[d].consultas }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={c.grilla} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" {...ejes(c)} />
                    <YAxis {...ejes(c)} allowDecimals={false} />
                    <Tooltip {...estiloTooltip(c)} cursor={{ fill: c.grilla, opacity: 0.4 }} formatter={(n) => [num(n), 'Consultas']} />
                    <Bar dataKey="consultas" fill={c.una} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Seccion>

          {/* Satisfacción */}
          {negocio && (
            <>
              <div className="grid lg:grid-cols-2 gap-4">
                <Seccion titulo="Satisfacción con la atención" descripcion="Calificación de 1 a 5 que deja el cliente sobre cómo lo atendieron.">
                  <Calificaciones
                    resumen={negocio.calificaciones.atencion}
                    tipo="atencion"
                    nombre="atención"
                    onVer={(n) => setCalif({ sucursal: null, tipo: 'atencion', estrellas: n })}
                  />
                </Seccion>
                <Seccion titulo="Satisfacción con el producto" descripcion="Calificación de 1 a 5 sobre lo que compró (solo cuando el pago quedó confirmado).">
                  <Calificaciones
                    resumen={negocio.calificaciones.producto}
                    tipo="producto"
                    nombre="producto"
                    onVer={(n) => setCalif({ sucursal: null, tipo: 'producto', estrellas: n })}
                  />
                </Seccion>
              </div>

              <Seccion titulo="Satisfacción por sucursal" descripcion="Promedio de atención y de producto de cada sucursal, comparado con el general. Tocá una sucursal para ver quiénes la calificaron.">
                <div className="overflow-x-auto scrollbar-thin rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/60">
                      <tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        <th className="px-3 py-2 text-left">Sucursal</th>
                        <th className="px-3 py-2 text-right">Atención</th>
                        <th className="px-3 py-2 text-right">Calif.</th>
                        <th className="px-3 py-2 text-right">Producto</th>
                        <th className="px-3 py-2 text-right">Calif.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...negocio.calificaciones.porSucursal].sort((a, b) => (b.atencion.total - a.atencion.total)).map(s => (
                        <tr
                          key={s.sucursalId || 'sin_sucursal'}
                          onClick={() => (s.atencion.total > 0 || s.producto.total > 0) && setCalif({ sucursal: { sucursalId: s.sucursalId, nombre: s.nombre }, tipo: s.atencion.total > 0 ? 'atencion' : 'producto', estrellas: null })}
                          title={s.atencion.total > 0 || s.producto.total > 0 ? 'Ver quiénes calificaron a esta sucursal' : undefined}
                          className={`border-t border-gray-100 dark:border-gray-800 ${s.atencion.total > 0 || s.producto.total > 0 ? 'cursor-pointer hover:bg-teal-50/40 dark:hover:bg-teal-950/40 transition-colors' : ''}`}
                        >
                          <td className="px-3 py-2 text-gray-800 dark:text-gray-100"><span className="inline-flex items-center gap-1.5"><Store size={13} className="text-gray-400" />{s.nombre}</span></td>
                          <td className="px-3 py-2 text-right">{s.atencion.total > 0 ? <StarRating value={s.atencion.promedio.toFixed(1)} type="atencion" size={13} className="font-semibold" /> : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">{num(s.atencion.total)}</td>
                          <td className="px-3 py-2 text-right">{s.producto.total > 0 ? <StarRating value={s.producto.promedio.toFixed(1)} type="producto" size={13} className="font-semibold" /> : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">{num(s.producto.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 font-semibold">
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">General</td>
                        <td className="px-3 py-2 text-right">{negocio.calificaciones.atencion.total > 0 ? <StarRating value={negocio.calificaciones.atencion.promedio.toFixed(1)} type="atencion" size={13} className="font-bold" /> : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">{num(negocio.calificaciones.atencion.total)}</td>
                        <td className="px-3 py-2 text-right">{negocio.calificaciones.producto.total > 0 ? <StarRating value={negocio.calificaciones.producto.promedio.toFixed(1)} type="producto" size={13} className="font-bold" /> : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">{num(negocio.calificaciones.producto.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Seccion>
            </>
          )}

          {/* Comparativa por sucursal */}
          <Seccion titulo="Comparativa por sucursal" descripcion="Tocá el nombre de una columna para ordenar. Las consultas cuentan para la sucursal que las tiene al final; los mensajes, para la que los mandó.">
            <TablaSucursales filas={datos.porSucursal} totales={totalesSucursal} />
          </Seccion>

          {/* Seguridad */}
          {negocio && (
            <Seccion titulo="Seguridad: filtro de PDFs" descripcion="Documentos PDF que mandaron los clientes y que el sistema revisó antes de guardarlos.">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <Tile icon={ShieldAlert} label="PDFs bloqueados" valor={num(negocio.seguridad?.pdfBloqueados ?? 0)} />
                <Tile icon={ShieldCheck} label="PDFs aceptados" valor={num(negocio.seguridad?.pdfAceptados ?? 0)} />
              </div>
            </Seccion>
          )}
        </div>
      )}

      {calif && (
        <CalificacionesModal
          sucursal={calif.sucursal}
          tipoInicial={calif.tipo}
          estrellasIniciales={calif.estrellas}
          rango={rango}
          onClose={() => setCalif(null)}
        />
      )}

      {bucket && (
        <MetricsBucketModal
          title={bucket.title}
          filtros={{ startDate: rango.startDate, endDate: rango.endDate, ...bucket.filtros }}
          onClose={() => setBucket(null)}
        />
      )}
    </div>
  );
}
