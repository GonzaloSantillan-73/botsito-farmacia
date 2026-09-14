import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MessagesSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatPhone } from '../lib/formatPhone';
import { STATUS_BADGES, SALE_STATUS_BADGES } from './Sidebar';
import MessageBubble from './MessageBubble';

// Trazabilidad de solo lectura de UNA consulta puntual: se abre desde el
// modal de "Ver" de una barra de Métricas (ver MetricsBucketModal.jsx),
// clickeando cualquier fila de la lista. `conversation` viene con la forma
// que devuelve server/services/metricsDetalle.js (id, cliente, telefono,
// sucursal, status, saleStatus).
export default function ChatTraceModal({ conversation, onClose }) {
  console.log('🔍 [DEBUG-COMPONENT-ChatTraceModal] Render — props:', { conversation, onClose });

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔄 [DEBUG-COMPONENT-ChatTraceModal] useEffect(cargar mensajes) disparado — deps:', { conversationId: conversation.id });
    let cancelled = false;
    setLoading(true);
    console.log('📡 [DEBUG-COMPONENT-ChatTraceModal] Supabase SELECT messages — params:', { table: 'messages', conversation_id: conversation.id });
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        console.log('📡 [DEBUG-COMPONENT-ChatTraceModal] Supabase SELECT messages — respuesta:', { data, error, cancelled });
        if (cancelled) return;
        if (!error) setMessages(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [conversation.id]);

  console.log('🔍 [DEBUG-COMPONENT-ChatTraceModal] Render lista de mensajes — cantidad:', messages.length);

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-gray-800 dark:text-gray-100 font-bold">
              <MessagesSquare size={18} className="text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="truncate">{conversation.cliente || formatPhone(conversation.telefono)}</span>
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
          <button onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-ChatTraceModal] click botón cerrar (X)'); onClose(); }} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2.5 bg-[#f0f2f5]">
          {loading ? (
            <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-10">Cargando mensajes...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-10">Esta consulta no tiene mensajes.</div>
          ) : (
            messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onImageClick={(m) => { console.log('🖱️ [DEBUG-COMPONENT-ChatTraceModal] click en imagen del mensaje', { messageId: m.id, media_url: m.media_url }); window.open(m.media_url, '_blank', 'noopener,noreferrer'); }}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
