import React, { useState, useEffect } from 'react';
import { FileText, ExternalLink, ClipboardList, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';
import { withSucursalesHistorial } from '../lib/clientUtils';
import { SALE_STATUS_BADGES } from './Sidebar';
import StarRating from './StarRating';
import { formatMoney, formatEnvio, formatDuracion } from './SortableDetailTable';

// Una fila de datos (etiqueta a la izquierda, valor a la derecha).
function Dato({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 text-sm">
      <span className="text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className="text-right font-medium text-gray-900 dark:text-gray-100 min-w-0">{children}</span>
    </div>
  );
}

function Bloque({ titulo, children }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{titulo}</h4>
      <div>{children}</div>
    </div>
  );
}

// Todo lo que no se ve en el chat de una consulta: inicio, demora, duración,
// mensajes, sucursales que la atendieron, calificaciones y venta. `c` tiene
// la forma que devuelve server/services/metricsDetalle.js. Lo usan el visor
// de chat de Métricas (ChatTraceModal.jsx) y la columna lateral de un chat
// abierto desde el Directorio (DatosConsultaPanel, abajo).
export function DatosConsultaContenido({ c }) {
  // Sucursales que la atendieron, en orden (tomada, derivada, devuelta...).
  const [sucursalesQueAtendieron, setSucursalesQueAtendieron] = useState(null);
  useEffect(() => {
    let cancelado = false;
    withSucursalesHistorial([{ id: c.id }]).then(res => {
      if (!cancelado) setSucursalesQueAtendieron((res?.[0]?.sucursales_historial || []).map(s => s.nombre).filter(Boolean));
    });
    return () => { cancelado = true; };
  }, [c.id]);
  const fechaInicio = c.fecha ? new Date(c.fecha) : null;

  return (
    <div className="space-y-5">
      <Bloque titulo="Consulta">
        <Dato label="Inicio">{fechaInicio ? `${fechaInicio.toLocaleDateString('es-AR')} ${fechaInicio.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : '—'}</Dato>
        <Dato label="Demora en responder">{formatDuracion(c.demoraInicialMs)}</Dato>
        <Dato label="Duración">{formatDuracion(c.duracionTotalMs)}</Dato>
        <Dato label="Mensajes">{c.msjsCliente != null ? `${c.msjsCliente} cliente · ${c.msjsBot ?? 0} bot · ${c.msjsSucursal ?? 0} sucursal` : '—'}</Dato>
      </Bloque>

      <Bloque titulo="Sucursales que la atendieron">
        {sucursalesQueAtendieron == null ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-2">Cargando...</p>
        ) : sucursalesQueAtendieron.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{c.sucursal || 'Ninguna (solo el bot)'}</p>
        ) : (
          <ol className="py-1 space-y-1 text-sm text-gray-800 dark:text-gray-100">
            {sucursalesQueAtendieron.map((nombre, i) => (
              <li key={`${nombre}-${i}`} className="flex items-center gap-2">
                <span className="w-5 h-5 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-600 dark:text-gray-300 flex items-center justify-center">{i + 1}</span>
                {nombre}
              </li>
            ))}
          </ol>
        )}
      </Bloque>

      <Bloque titulo="Calificación">
        <Dato label="Atención">{c.rating != null ? <StarRating value={c.rating} type="atencion" size={13} className="font-semibold" /> : 'Sin calificar'}</Dato>
        <Dato label="Producto">{c.productRating != null ? <StarRating value={c.productRating} type="producto" size={13} className="font-semibold" /> : 'Sin calificar'}</Dato>
      </Bloque>

      <Bloque titulo="Venta">
        <Dato label="Resultado">{SALE_STATUS_BADGES[c.saleStatus]?.label || 'Sin marcar'}</Dato>
        <Dato label="Subtotal">{formatMoney(c.subtotal)}</Dato>
        <Dato label="Envío">{formatEnvio(c.costoEnvio)}</Dato>
        <Dato label="Total">{formatMoney(c.montoTotal)}</Dato>
        <Dato label="Medio de pago">{c.medioPago || '—'}</Dato>
        {c.comprobanteUrl && (
          <Dato label="Comprobante"><a href={c.comprobanteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline">Ver <ExternalLink size={12} /></a></Dato>
        )}
        {c.recetaUrl && (
          <Dato label="Receta"><a href={c.recetaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline"><FileText size={12} /> Ver</a></Dato>
        )}
      </Bloque>
    </div>
  );
}

// Sección desplegable "Datos de la consulta" de la columna lateral
// (ValidationPanel.jsx) para un chat abierto desde el Directorio de
// Clientes. Trae los datos del servidor y los vuelve a pedir si cambia el
// estado, la venta o la calificación de la consulta.
export default function DatosConsultaPanel({ conversation }) {
  const [abierto, setAbierto] = useState(true);
  const [consulta, setConsulta] = useState(null);
  const [error, setError] = useState(null);
  const { id, status, sale_status, rating, product_rating } = conversation;

  useEffect(() => {
    let cancelado = false;
    setError(null);
    adminFetch(`/api/admin/client-directory/consulta-detalle?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelado) return;
        if (!res.ok) throw new Error(body.error || 'No se pudieron cargar los datos de la consulta.');
        setConsulta(body.consulta);
      })
      .catch((err) => {
        console.error('❌ [DEBUG-COMPONENT-DatosConsulta] error cargando la consulta:', err);
        if (!cancelado) setError(err.message);
      });
    return () => { cancelado = true; };
  }, [id, status, sale_status, rating, product_rating]);

  const actual = consulta && consulta.id === id ? consulta : null;

  return (
    <div className="p-6 border-b border-gray-200 dark:border-gray-800">
      <button
        onClick={() => { setAbierto(!abierto); }}
        className="w-full flex items-center justify-between text-left outline-none group"
      >
        <h3 className="text-md font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <ClipboardList size={18} className="text-teal-600 dark:text-teal-400" />
          Datos de la consulta
        </h3>
        {abierto ? (
          <ChevronUp size={18} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
        ) : (
          <ChevronDown size={18} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
        )}
      </button>

      {abierto && (
        <div className="animate-fade-in-up mt-4">
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : !actual ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando...</p>
          ) : (
            <DatosConsultaContenido key={actual.id} c={actual} />
          )}
        </div>
      )}
    </div>
  );
}
