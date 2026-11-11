import React, { useState, useEffect, useMemo } from 'react';
import { Filter, RefreshCw } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';
import { formatPhone } from '../lib/formatPhone';
import { recortarNombre } from '../lib/recortarNombre';
import { formatMoney } from './SortableDetailTable';
import ChatTraceModal from './ChatTraceModal';

// "Ventas para revisar" (final de Métricas): consultas marcadas como
// "Venta concretada" a las que les falta algo. Se arma con los datos reales
// de /metrics/detalle, así que una consulta sale sola de la lista cuando se
// marca el comprobante en el chat o se cargan los montos con "Editar" en el
// bloque Venta (ver DatosConsulta.jsx).

const fechaLocal = (d) => d.toLocaleDateString('en-CA');
const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fechaLocal(d); };

const sinComprobante = (r) => !r.comprobanteUrl;
const sinMontos = (r) => r.subtotal == null || r.montoTotal == null;

const FILTROS = [
  { id: 'todas', label: 'Todas', cumple: (r) => sinComprobante(r) || sinMontos(r) },
  { id: 'comprobante', label: 'Sin comprobante', cumple: sinComprobante },
  { id: 'montos', label: 'Sin subtotal o total', cumple: sinMontos }
];

const claseFecha = 'px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500';

export default function VentasParaRevisar() {
  const [startDate, setStartDate] = useState(() => haceDias(30));
  const [endDate, setEndDate] = useState(() => fechaLocal(new Date()));
  const [rango, setRango] = useState(() => ({ startDate: haceDias(30), endDate: fechaLocal(new Date()) }));
  const [refreshKey, setRefreshKey] = useState(0);
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ saleStatus: 'concretada' });
    if (rango.startDate) params.set('startDate', rango.startDate);
    if (rango.endDate) params.set('endDate', rango.endDate);
    adminFetch(`/api/metrics/detalle?${params}`)
      .then(res => res.json())
      .then(data => {
        if (cancelado) return;
        if (data.error) throw new Error(data.error);
        setFilas(data.filas || []);
      })
      .catch(err => {
        if (cancelado) return;
        console.error('❌ [DEBUG-COMPONENT-VentasParaRevisar] Error cargando las ventas:', err);
        setError(err.message || 'Error cargando las ventas para revisar.');
      })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [rango, refreshKey]);

  const conteos = useMemo(() => Object.fromEntries(FILTROS.map(f => [f.id, filas.filter(f.cumple).length])), [filas]);
  const visibles = useMemo(() => filas.filter(FILTROS.find(f => f.id === filtro).cumple), [filas, filtro]);

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Consultas marcadas como "Venta concretada" a las que les falta el comprobante marcado o el subtotal/total. Tocá una para abrir el chat: marcá el comprobante en la imagen o cargá los montos con "Editar" en el bloque Venta. Cuando ya no le falta nada, sale de la lista.
      </p>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Desde</label>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); }} className={claseFecha} />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); }} className={claseFecha} />
          </div>
          <button
            onClick={() => { setRango({ startDate, endDate }); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Filter size={13} /> Filtrar
          </button>
        </div>
        <button
          onClick={() => { setRefreshKey(k => k + 1); }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {FILTROS.map(f => (
          <button
            key={f.id}
            onClick={() => { setFiltro(f.id); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filtro === f.id
                ? 'bg-teal-600 border-teal-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {f.label} ({loading ? '…' : conteos[f.id]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Cargando ventas...</div>
      ) : error ? (
        <div className="text-sm text-rose-600 py-10 text-center">{error}</div>
      ) : visibles.length === 0 ? (
        <div className="text-sm text-gray-400 py-10 text-center bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800">
          No hay ventas para revisar en el rango elegido.
        </div>
      ) : (
        <div className="w-full max-h-[400px] overflow-auto scrollbar-thin border border-gray-200 dark:border-gray-700 rounded-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Fecha</th>
                <th className="text-left font-semibold px-3 py-2">Cliente</th>
                <th className="text-left font-semibold px-3 py-2">Sucursal</th>
                <th className="text-right font-semibold px-3 py-2">Total</th>
                <th className="text-left font-semibold px-3 py-2">Falta</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(r => (
                <tr
                  key={r.id}
                  onClick={() => { setAbierta(r); }}
                  className="border-t border-gray-100 dark:border-gray-800 hover:bg-teal-50 dark:hover:bg-gray-800 cursor-pointer text-gray-800 dark:text-gray-100"
                >
                  <td className="px-3 py-2 whitespace-nowrap">{r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="px-3 py-2">{recortarNombre(r.cliente) || formatPhone(r.telefono)}</td>
                  <td className="px-3 py-2">{r.sucursal || '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(r.montoTotal)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {sinComprobante(r) && <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400">Comprobante</span>}
                      {sinMontos(r) && <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-400">{r.montoTotal == null ? 'Subtotal y total' : 'Subtotal'}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierta && (
        <ChatTraceModal
          conversation={abierta}
          // Al cerrar se vuelve a cargar: en el chat se puede haber marcado el
          // comprobante o corregido la venta.
          onClose={() => { setAbierta(null); setRefreshKey(k => k + 1); }}
          onConsultaActualizada={(nueva) => { setFilas(prev => prev.map(f => (f.id === nueva.id ? { ...f, ...nueva } : f))); }}
        />
      )}
    </div>
  );
}
