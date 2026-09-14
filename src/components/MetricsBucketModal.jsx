import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';
import SortableDetailTable from './SortableDetailTable';
import ChatTraceModal from './ChatTraceModal';

// Lista detallada (ordenable) de los chats de UNA categoría puntual: se abre
// desde el botón "Ver" de cada barra en MetricsPanel.jsx (ej. "Concretadas",
// "3 estrellas de atención"). `filtros` se manda tal cual como query params a
// /api/metrics/detalle (startDate/endDate/saleStatus/rating/productRating/
// derivada), que ya sabe interpretarlos (ver server/services/metricsDetalle.js).
export default function MetricsBucketModal({ title, filtros, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [conversacionAbierta, setConversacionAbierta] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    Object.entries(filtros || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });

    adminFetch(`/api/metrics/detalle${params.toString() ? `?${params}` : ''}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRows(data.filas || []);
      })
      .catch(err => setError(err.message || 'Error cargando los chats de esta categoría.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-sm text-gray-400 py-10 text-center">Cargando...</div>
          ) : error ? (
            <div className="text-sm text-rose-600 py-10 text-center">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-400 py-10 text-center bg-gray-50 rounded-xl border border-gray-100">
              No hay chats en esta categoría.
            </div>
          ) : (
            <SortableDetailTable rows={rows} onRowClick={setConversacionAbierta} />
          )}
        </div>
      </div>

      {conversacionAbierta && (
        <ChatTraceModal conversation={conversacionAbierta} onClose={() => setConversacionAbierta(null)} />
      )}
    </div>,
    document.body
  );
}
