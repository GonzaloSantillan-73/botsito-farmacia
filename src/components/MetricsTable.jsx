import React, { useState, useEffect } from 'react';
import { Download, Loader2, Check, Filter, X } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';
import SortableDetailTable from './SortableDetailTable';
import ChatTraceModal from './ChatTraceModal';

const downloadFile = async (url, fallbackName) => {
  const res = await adminFetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error('❌ [DEBUG-COMPONENT-MetricsTable] Error respuesta downloadFile — status:', res.status, 'data:', data);
    throw new Error(data.error || 'Error generando el archivo.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackName;

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
};

export default function MetricsTable() {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedRange, setAppliedRange] = useState({ startDate: '', endDate: '' });

  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [exportError, setExportError] = useState('');

  const [conversacionAbierta, setConversacionAbierta] = useState(null);

  // Si el usuario cambia el filtro antes de que responda el fetch anterior,
  // esa respuesta vieja no debe pisar el resultado del filtro nuevo cuando
  // llegue tarde (puede pasar si la consulta sin filtro, más pesada, tarda
  // más que la filtrada que la reemplazó).
  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (appliedRange.startDate) params.set('startDate', appliedRange.startDate);
    if (appliedRange.endDate) params.set('endDate', appliedRange.endDate);

    adminFetch(`/api/metrics/detalle${params.toString() ? `?${params}` : ''}`)
      .then(res => res.json())
      .then(data => {
        if (cancelado) return;
        if (data.error) throw new Error(data.error);
        setRows(data.filas || []);
      })
      .catch(err => {
        if (cancelado) return;
        console.error('❌ [DEBUG-COMPONENT-MetricsTable] Error cargando el detalle de consultas:', err);
        setError(err.message || 'Error cargando el detalle de consultas.');
      })
      .finally(() => { if (!cancelado) setLoading(false); });

    return () => { cancelado = true; };
  }, [appliedRange]);

  const handleFiltrar = () => {
    setAppliedRange({ startDate, endDate });
  };
  const handleLimpiarFiltro = () => {
    setStartDate('');
    setEndDate('');
    setAppliedRange({ startDate: '', endDate: '' });
  };

  const handleExportar = async () => {
    setExporting(true);
    setExportError('');
    setExported(false);
    try {
      const params = new URLSearchParams();
      if (appliedRange.startDate) params.set('startDate', appliedRange.startDate);
      if (appliedRange.endDate) params.set('endDate', appliedRange.endDate);
      await downloadFile(`/api/export/metrics${params.toString() ? `?${params}` : ''}`, 'metricas.csv');
      setExported(true);
      setTimeout(() => setExported(false), 2500);
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-MetricsTable] Error exportando la tabla:', err);
      setExportError(err.message || 'Error exportando la tabla.');
    } finally {
      setExporting(false);
    }
  };


  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); }}
              className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); }}
              className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-xs font-medium transition-colors"
            >
              <X size={13} /> Quitar filtro
            </button>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleExportar}
            disabled={exporting || rows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : exported ? <Check size={16} /> : <Download size={16} />}
            {exporting ? 'Generando...' : exported ? 'Descargado' : 'Exportar CSV'}
          </button>
          {exportError && <p className="text-xs text-rose-600">{exportError}</p>}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Cargando detalle de consultas...</div>
      ) : error ? (
        <div className="text-sm text-rose-600 py-10 text-center">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-400 py-10 text-center bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800">
          No hay consultas en el rango elegido.
        </div>
      ) : (
        <div className="w-full max-h-[350px] overflow-auto">
          <SortableDetailTable rows={rows} onRowClick={(row) => { setConversacionAbierta(row); }} />
        </div>
      )}

      {conversacionAbierta && (
        <ChatTraceModal conversation={conversacionAbierta} onClose={() => setConversacionAbierta(null)} />
      )}
    </div>
  );
}
