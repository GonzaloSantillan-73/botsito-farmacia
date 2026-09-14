import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, FileText } from 'lucide-react';
import { STATUS_BADGES } from './Sidebar';

const formatMoney = (n) => (n == null ? '—' : `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`);

const formatDuracion = (ms) => {
  if (ms == null || ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '<1m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// Columnas de la fila "detalle de consulta" (misma forma que devuelve
// server/services/metricsDetalle.js): la usan tanto la tabla de "Detalle de
// consultas" como el modal de "Ver" de cada barra en MetricsPanel.jsx.
// `key` identifica la columna (y se usa para el ordenamiento), `sortValue`
// saca el valor comparable de la fila y `render` decide cómo se ve. Todas
// son ordenables salvo "Comprobante" (es un link).
export const DETAIL_COLUMNS = [
  { key: 'fecha', label: 'Fecha', sortValue: r => new Date(r.fecha).getTime(), render: r => new Date(r.fecha).toLocaleDateString('es-AR') },
  { key: 'horaInicio', label: 'Hora Inicio', sortValue: r => new Date(r.fecha).getTime(), render: r => new Date(r.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) },
  { key: 'cliente', label: 'Cliente', sortValue: r => (r.cliente || '').toLowerCase(), render: r => r.cliente || '—' },
  { key: 'telefono', label: 'Teléfono', sortValue: r => r.telefono || '', render: r => r.telefono || '—' },
  { key: 'demoraInicial', label: 'Demora Inicial', sortValue: r => (r.demoraInicialMs ?? Infinity), render: r => formatDuracion(r.demoraInicialMs) },
  { key: 'duracionTotal', label: 'Duración Total', sortValue: r => (r.duracionTotalMs ?? Infinity), render: r => formatDuracion(r.duracionTotalMs) },
  { key: 'msjsCliente', label: 'Msjs Cliente', sortValue: r => r.msjsCliente || 0, render: r => r.msjsCliente || 0 },
  { key: 'sucursal', label: 'Sucursal', sortValue: r => (r.sucursal || '').toLowerCase(), render: r => r.sucursal || '—' },
  {
    key: 'status',
    label: 'Estado del Contacto',
    sortValue: r => r.status || '',
    render: r => {
      const badge = STATUS_BADGES[r.status];
      return badge ? (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${badge.className}`}>{badge.label}</span>
      ) : (r.status || '—');
    }
  },
  { key: 'montoTotal', label: 'Monto Total', sortValue: r => (r.montoTotal ?? -1), render: r => formatMoney(r.montoTotal) },
  { key: 'medioPago', label: 'Medio de Pago', sortValue: r => (r.medioPago || '').toLowerCase(), render: r => r.medioPago || '—' },
  {
    key: 'comprobante',
    label: 'Comprobante',
    sortable: false,
    render: r => r.comprobanteUrl ? (
      <a href={r.comprobanteUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:text-teal-800 hover:underline whitespace-nowrap">
        <FileText size={13} /> Ver
      </a>
    ) : '—'
  }
];

// Tabla ordenable de filas "detalle de consulta". `onRowClick` es opcional:
// cuando se pasa, cada fila es clickeable (ej. el modal de "Ver" de una
// barra de Métricas la usa para abrir la trazabilidad del chat).
export default function SortableDetailTable({ rows, onRowClick, initialSortKey = 'fecha', initialSortDir = 'desc' }) {
  console.log('🔍 [DEBUG-COMPONENT-SortableDetailTable] Render — props:', { cantidadFilas: rows?.length, initialSortKey, initialSortDir, tieneOnRowClick: !!onRowClick });

  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDir, setSortDir] = useState(initialSortDir);

  const handleSort = (col) => {
    console.log('🖱️ [DEBUG-COMPONENT-SortableDetailTable] handleSort — columna:', col.key, 'sortKey actual:', sortKey, 'sortDir actual:', sortDir);
    if (col.sortable === false) return;
    if (sortKey === col.key) {
      setSortDir(d => {
        const next = d === 'asc' ? 'desc' : 'asc';
        console.log('🔄 [DEBUG-COMPONENT-SortableDetailTable] Cambio de criterio de orden — columna:', col.key, 'dirección:', next);
        return next;
      });
    } else {
      console.log('🔄 [DEBUG-COMPONENT-SortableDetailTable] Cambio de criterio de orden — columna:', col.key, 'dirección: asc');
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  const sortedRows = useMemo(() => {
    console.log('🔍 [DEBUG-COMPONENT-SortableDetailTable] Recalculando orden — sortKey:', sortKey, 'sortDir:', sortDir, 'cantidad de filas:', rows.length);
    const col = DETAIL_COLUMNS.find(c => c.key === sortKey);
    if (!col) return rows;
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="overflow-x-auto scrollbar-thin border border-gray-200 dark:border-gray-700 rounded-xl">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            {DETAIL_COLUMNS.map(col => {
              const isSorted = sortKey === col.key;
              const Icon = !isSorted ? ArrowUpDown : (sortDir === 'asc' ? ArrowUp : ArrowDown);
              return (
                <th
                  key={col.key}
                  onClick={() => handleSort(col)}
                  className={`px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap select-none ${col.sortable === false ? '' : 'cursor-pointer hover:text-gray-800 dark:hover:text-gray-100'}`}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && <Icon size={12} className={isSorted ? 'text-teal-600 dark:text-teal-400' : 'text-gray-300'} />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {console.log('🔍 [DEBUG-COMPONENT-SortableDetailTable] Renderizando filas de la tabla — cantidad:', sortedRows.length)}
          {sortedRows.map(row => (
            <tr
              key={row.id}
              onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-SortableDetailTable] Click en fila — row.id:', row.id); onRowClick && onRowClick(row); }}
              className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {DETAIL_COLUMNS.map(col => (
                <td key={col.key} className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
