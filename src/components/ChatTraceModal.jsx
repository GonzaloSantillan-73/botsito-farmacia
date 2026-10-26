import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MessagesSquare, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatPhone } from '../lib/formatPhone';
import { tagMessage, aplicarTagLocal } from '../lib/tagMessage';
import { alertDialog } from '../lib/dialogService';
import { isAdminRole } from '../lib/adminAuth';
import { usePurgeMedia } from '../lib/usePurgeMedia';
import { STATUS_BADGES, SALE_STATUS_BADGES } from './Sidebar';
import MessageBubble from './MessageBubble';
import AdminPasswordActionModal from './AdminPasswordActionModal';
import { recortarNombre } from '../lib/recortarNombre';
import { withSucursalesHistorial } from '../lib/clientUtils';
import StarRating from './StarRating';
import { formatMoney, formatEnvio, formatDuracion } from './SortableDetailTable';

// Una fila del panel de datos (columna derecha).
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

// Trazabilidad de solo lectura de UNA consulta puntual: se abre desde el
// modal de "Ver" de una barra de Métricas (ver MetricsBucketModal.jsx),
// clickeando cualquier fila de la lista. `conversation` viene con la forma
// que devuelve server/services/metricsDetalle.js (id, cliente, telefono,
// sucursal, status, saleStatus).
export default function ChatTraceModal({ conversation, onClose }) {

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taggingId, setTaggingId] = useState(null);
  const soyAdmin = isAdminRole();
  const { purgeTarget, setPurgeTarget, handlePurgeFile } = usePurgeMedia(setMessages);
  // Sucursales que la atendieron, en orden (tomada, derivada, devuelta...).
  const [sucursalesQueAtendieron, setSucursalesQueAtendieron] = useState(null);
  useEffect(() => {
    let cancelado = false;
    withSucursalesHistorial([{ id: conversation.id }]).then(res => {
      if (!cancelado) setSucursalesQueAtendieron((res?.[0]?.sucursales_historial || []).map(s => s.nombre).filter(Boolean));
    });
    return () => { cancelado = true; };
  }, [conversation.id]);
  const c = conversation;
  const fechaInicio = c.fecha ? new Date(c.fecha) : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setMessages(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [conversation.id]);

  // Esta vista no está suscripta a Realtime (es una foto fija de una
  // conversación ya finalizada), así que actualizamos el array local a mano
  // para que el cambio se vea al instante sin recargar el modal.
  const handleTagMessage = async (msg, tag) => {
    setTaggingId(msg.id);
    try {
      const actualizado = await tagMessage(msg.id, tag);
      setMessages(prev => aplicarTagLocal(prev, actualizado));
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-ChatTraceModal] Error marcando mensaje:', err);
      alertDialog(err.message || 'No se pudo marcar el archivo.', { danger: true });
    } finally {
      setTaggingId(null);
    }
  };


  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-gray-800 dark:text-gray-100 font-bold">
              <MessagesSquare size={18} className="text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="truncate" title={conversation.cliente || undefined}>{recortarNombre(conversation.cliente) || formatPhone(conversation.telefono)}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-gray-400">{formatPhone(conversation.telefono)}</span>
              {conversation.sucursal && <span className="text-xs text-gray-400">· {conversation.sucursal}</span>}
              {STATUS_BADGES[conversation.status] && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${STATUS_BADGES[conversation.status].className}`}>
                  {STATUS_BADGES[conversation.status].label}
                </span>
              )}
              {SALE_STATUS_BADGES[conversation.saleStatus] && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${SALE_STATUS_BADGES[conversation.saleStatus].className}`}>
                  {SALE_STATUS_BADGES[conversation.saleStatus].label}
                </span>
              )}
            </div>
          </div>
          <button onClick={() => { onClose(); }} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin p-4 space-y-2.5 bg-[#f0f2f5] dark:bg-gray-950">
          {loading ? (
            <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-10">Cargando mensajes...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-10">Esta consulta no tiene mensajes.</div>
          ) : (
            messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onImageClick={(m) => { window.open(m.media_url, '_blank', 'noopener,noreferrer'); }}
                onTag={handleTagMessage}
                taggingId={taggingId}
                canModerate={soyAdmin}
                onPurgeFile={(m) => { setPurgeTarget(m); }}
                purgingId={purgeTarget?.id}
              />
            ))
          )}
        </div>

        {/* Datos de la consulta: todo lo que no se ve en el chat */}
        <aside className="lg:w-80 shrink-0 max-h-[40%] lg:max-h-none overflow-y-auto scrollbar-thin border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 p-4 space-y-5 bg-white dark:bg-gray-900">
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
        </aside>
        </div>
      </div>

      <AdminPasswordActionModal
        isOpen={!!purgeTarget}
        onClose={() => { setPurgeTarget(null); }}
        title="Eliminar archivo"
        description="El archivo se borra del servidor y se reemplaza por un aviso con el motivo. Esta acción no se puede deshacer."
        motivoPlaceholder="Motivo de la eliminación..."
        confirmLabel="Eliminar archivo"
        onConfirm={(motivo, password) => handlePurgeFile(purgeTarget, motivo, password)}
      />
    </div>,
    document.body
  );
}
