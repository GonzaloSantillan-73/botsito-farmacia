import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Store, Star, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';
import { formatPhone } from '../lib/formatPhone';
import { recortarNombre } from '../lib/recortarNombre';
import StarRating from './StarRating';
import ChatTraceModal from './ChatTraceModal';
import { formatDuracion } from './SortableDetailTable';

// Clientes que calificaron a una sucursal (se abre al tocar una fila de
// "Satisfacción por sucursal" en Métricas). Pantalla completa, con filtro por
// estrellas y por fecha, y orden por estrellas. Tocar una fila abre el chat
// completo con todos los datos de la consulta (ChatTraceModal).
// `sucursal`: { sucursalId (null = sin sucursal asignada), nombre }.
// `rango`: { startDate, endDate } inicial (el del panel de Métricas).

const ESTRELLAS = [5, 4, 3, 2, 1];

export default function CalificacionesSucursalModal({ sucursal, rango, onClose }) {
  const [desde, setDesde] = useState(rango?.startDate || '');
  const [hasta, setHasta] = useState(rango?.endDate || '');
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [estrellas, setEstrellas] = useState(null); // null = todas
  const [orden, setOrden] = useState({ campo: 'fecha', asc: false });
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError('');
    const params = new URLSearchParams({ calificadas: 'true', sucursalId: sucursal.sucursalId || 'ninguna' });
    if (desde) params.set('startDate', desde);
    if (hasta) params.set('endDate', hasta);
    adminFetch(`/api/metrics/detalle?${params}`)
      .then(r => r.json())
      .then(d => {
        if (cancelado) return;
        if (d.error) throw new Error(d.error);
        setFilas(d.filas || []);
      })
      .catch(err => { if (!cancelado) setError(err.message || 'No se pudieron cargar las calificaciones.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [sucursal.sucursalId, desde, hasta]);

  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape' && !abierta) onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose, abierta]);

  const cuentaPorEstrella = useMemo(() => {
    const cuenta = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    filas.forEach(f => { if (cuenta[f.rating] != null) cuenta[f.rating] += 1; });
    return cuenta;
  }, [filas]);

  const visibles = useMemo(() => {
    const lista = estrellas == null ? filas : filas.filter(f => f.rating === estrellas);
    return [...lista].sort((a, b) => {
      const r = orden.campo === 'estrellas'
        ? (a.rating - b.rating) || (new Date(a.fecha) - new Date(b.fecha))
        : new Date(a.fecha) - new Date(b.fecha);
      return orden.asc ? r : -r;
    });
  }, [filas, estrellas, orden]);

  const promedio = filas.length ? filas.reduce((a, f) => a + f.rating, 0) / filas.length : null;
  const alternarOrden = (campo) => setOrden(o => ({ campo, asc: o.campo === campo ? !o.asc : false }));
  const Flecha = ({ campo }) => (orden.campo === campo ? (orden.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null);
  const chip = (activo) => `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${activo
    ? 'bg-amber-500 border-amber-500 text-white'
    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`;
  const inputFecha = 'px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500';

  return createPortal(
    <div className="fixed inset-0 z-[75] bg-gray-50 dark:bg-gray-950 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400"><Store size={20} /></div>
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100 truncate">Calificaciones de {sucursal.nombre}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {cargando ? 'Cargando...' : <>{filas.length.toLocaleString('es-AR')} calificaciones{promedio != null && <> · promedio <StarRating value={promedio.toFixed(1)} type="atencion" size={11} className="font-semibold" /></>}</>}
            </p>
          </div>
        </div>
        <button onClick={onClose} title="Cerrar (Esc)" className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors shrink-0">
          <X size={22} />
        </button>
      </div>

      <div className="px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-end gap-4 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setEstrellas(null)} className={chip(estrellas == null)}>Todas ({filas.length})</button>
          {ESTRELLAS.map(n => (
            <button key={n} onClick={() => setEstrellas(n)} className={`${chip(estrellas === n)} inline-flex items-center gap-1`}>
              {n} <Star size={11} className={estrellas === n ? 'fill-white' : 'fill-amber-500 text-amber-500'} /> ({cuentaPorEstrella[n]})
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="cal-desde" className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Desde</label>
            <input id="cal-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputFecha} />
          </div>
          <div>
            <label htmlFor="cal-hasta" className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
            <input id="cal-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputFecha} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {error ? (
          <p className="text-sm text-rose-600 dark:text-rose-400 text-center py-10">{error}</p>
        ) : cargando ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-16"><Loader2 size={16} className="animate-spin" /> Cargando calificaciones...</div>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-16">No hay calificaciones con estos filtros.</p>
        ) : (
          <div className="max-w-5xl mx-auto overflow-x-auto scrollbar-thin rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60">
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-2.5 text-left">
                    <button onClick={() => alternarOrden('fecha')} className="inline-flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-200">Fecha y hora <Flecha campo="fecha" /></button>
                  </th>
                  <th className="px-4 py-2.5 text-left">Cliente</th>
                  <th className="px-4 py-2.5 text-left">Número</th>
                  <th className="px-4 py-2.5 text-right">Demora</th>
                  <th className="px-4 py-2.5 text-right">
                    <button onClick={() => alternarOrden('estrellas')} className="inline-flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-200">Atención <Flecha campo="estrellas" /></button>
                  </th>
                  <th className="px-4 py-2.5 text-right">Producto</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(f => {
                  const fecha = new Date(f.fecha);
                  return (
                    <tr key={f.id} onClick={() => setAbierta(f)} className="border-t border-gray-100 dark:border-gray-800 hover:bg-teal-50/40 dark:hover:bg-teal-950/40 cursor-pointer transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">
                        {fecha.toLocaleDateString('es-AR')} <span className="text-gray-400">{fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap" title={f.cliente || undefined}>{recortarNombre(f.cliente) || '—'}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-400">{formatPhone(f.telefono)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-400">{formatDuracion(f.demoraInicialMs)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap"><StarRating value={f.rating} type="atencion" size={13} className="font-semibold" /></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">{f.productRating != null ? <StarRating value={f.productRating} type="producto" size={13} className="font-semibold" /> : <span className="text-gray-400">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {abierta && <ChatTraceModal conversation={abierta} onClose={() => setAbierta(null)} />}
    </div>,
    document.body
  );
}
