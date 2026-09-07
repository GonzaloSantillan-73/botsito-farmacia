import React, { useState } from 'react';
import { Download, Loader2, Check } from 'lucide-react';

const toISODate = (date) => date.toISOString().slice(0, 10);

const defaultEndDate = () => toISODate(new Date());
const defaultStartDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toISODate(d);
};

const downloadFile = async (url, fallbackName) => {
  const res = await fetch(url);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
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

export default function ExportPanel() {
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [endDate, setEndDate] = useState(defaultEndDate());
  const [includeChats, setIncludeChats] = useState(true);
  const [includeMetrics, setIncludeMetrics] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleExport = async () => {
    if (!includeChats && !includeMetrics) {
      setError('Elegí al menos un tipo de dato para exportar.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Elegí un rango de fechas.');
      return;
    }
    if (startDate > endDate) {
      setError('La fecha de inicio no puede ser posterior a la de fin.');
      return;
    }

    setError('');
    setDone(false);
    setExporting(true);

    try {
      if (includeChats) {
        await downloadFile(
          `/api/export/chats?startDate=${startDate}&endDate=${endDate}`,
          `historial-chats_${startDate}_a_${endDate}.csv`
        );
      }
      if (includeMetrics) {
        await downloadFile(
          `/api/export/metrics?startDate=${startDate}&endDate=${endDate}`,
          `metricas_${startDate}_a_${endDate}.csv`
        );
      }
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (err) {
      setError(err.message || 'Error generando la exportación.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Exportar datos</h3>
        <p className="text-xs text-gray-500">
          Descargá un archivo CSV (compatible con Excel y Google Sheets) con la información del rango de fechas elegido.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Rango de fechas</label>
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Datos a exportar</label>
        <div className="space-y-2">
          <label className="flex items-start gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={includeChats}
              onChange={(e) => setIncludeChats(e.target.checked)}
              className="mt-0.5 accent-teal-600"
            />
            <div>
              <div className="text-sm font-medium text-gray-800">Historial de Chats</div>
              <div className="text-xs text-gray-500">Conversaciones y mensajes detallados (cliente, teléfono, remitente, texto).</div>
            </div>
          </label>
          <label className="flex items-start gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={includeMetrics}
              onChange={(e) => setIncludeMetrics(e.target.checked)}
              className="mt-0.5 accent-teal-600"
            />
            <div>
              <div className="text-sm font-medium text-gray-800">Métricas y Estadísticas</div>
              <div className="text-xs text-gray-500">Calificaciones de satisfacción por consulta, más un resumen general.</div>
            </div>
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {exporting ? <Loader2 className="animate-spin" size={18} /> : done ? <Check size={18} /> : <Download size={18} />}
        {exporting ? 'Generando...' : done ? 'Descargado' : 'Exportar'}
      </button>
    </div>
  );
}
