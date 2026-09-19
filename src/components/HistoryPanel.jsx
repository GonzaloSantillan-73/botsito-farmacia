import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, History, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { tagMessage, aplicarTagLocal } from '../lib/tagMessage';
import { STATUS_BADGES, SALE_STATUS_BADGES } from './Sidebar';
import ClientHistoryList from './ClientHistoryList';
import { AttachmentTagControls } from './MessageBubble';
import { alertDialog } from '../lib/dialogService';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Resalta todas las apariciones del término buscado dentro de un texto,
// para que el operador ubique de un vistazo por qué esa consulta apareció.
const highlightMatches = (text, query) => {
  if (!query?.trim() || !text) return text;
  const q = query.trim();
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-amber-200 dark:bg-amber-950 text-gray-900 dark:text-gray-100 rounded px-0.5">{part}</mark>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
};

export default function HistoryPanel({ clientPhone, clientName, currentConversationId, onClose }) {
  const [pastConversations, setPastConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState(null);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [taggingId, setTaggingId] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('conversations')
        .select('*, sucursal_actual:sucursales!sucursal_id(nombre), sucursal_primera:sucursales!primera_sucursal_id(nombre)')
        .eq('client_phone', clientPhone)
        .order('created_at', { ascending: false });


      if (!error && data) {
        // Este panel es justamente el acceso transversal explícito (a
        // diferencia del Directorio de Clientes, que sí aísla por sucursal):
        // una vez adentro del chat, se ve el historial completo del cliente
        // sin importar qué sucursal atendió cada consulta anterior.
        const visibles = data.filter(c => c.id !== currentConversationId);
        setPastConversations(visibles);
      } else if (error) {
        console.error('❌ [DEBUG-COMPONENT-HistoryPanel] error de supabase en "conversations":', error);
      }
      setLoading(false);
    };

    if (clientPhone) fetchHistory();
  }, [clientPhone, currentConversationId]);

  const openConversation = async (conv) => {
    setSelectedConv(conv);
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });


    if (!error && data) {
      setSelectedMessages(data);
    } else if (error) {
      console.error('❌ [DEBUG-COMPONENT-HistoryPanel] error de supabase en "messages":', error);
    }
    setLoadingMessages(false);
  };

  // Igual que en ChatTraceModal: este panel no está suscripto a Realtime
  // (trae los mensajes una sola vez al elegir la consulta de la izquierda),
  // así que actualizamos el array local a mano tras marcar.
  const handleTagMessage = async (msg, tag) => {
    setTaggingId(msg.id);
    try {
      const actualizado = await tagMessage(msg.id, tag);
      setSelectedMessages(prev => aplicarTagLocal(prev, actualizado));
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-HistoryPanel] Error marcando mensaje:', err);
      alertDialog(err.message || 'No se pudo marcar el archivo.', { danger: true });
    } finally {
      setTaggingId(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl h-[82vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 dark:text-gray-100 font-bold">
            <History size={20} className="text-teal-600 dark:text-teal-400" />
            Historial de consultas{clientName ? ` — ${clientName}` : ''}
          </div>
          <button onClick={() => { onClose(); }} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* Panel izquierdo: bandeja de sesiones pasadas, estilo lista de WhatsApp.
              Mismas herramientas (búsqueda, rango de fechas, orden) que la ficha
              de cliente del Directorio, porque ambas usan ClientHistoryList. En
              ventanas angostas se apila arriba del panel de mensajes en vez de
              robarle todo el ancho disponible. */}
          <div className="w-full sm:w-[340px] shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 max-h-[45%] sm:max-h-none overflow-hidden flex flex-col">
            <ClientHistoryList
              conversations={pastConversations}
              selectedId={selectedConv?.id}
              onSelect={openConversation}
              loading={loading}
              fillHeight
              searchQuery={searchQuery}
              onSearchQueryChange={(value) => { setSearchQuery(value); }}
            />
          </div>

          {/* Panel derecho: transcripción de la sesión elegida, liviana y de solo lectura */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[#f0f2f5] dark:bg-gray-900">
            {selectedConv && (
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center gap-2 shrink-0">
                {STATUS_BADGES[selectedConv.status] && (
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${STATUS_BADGES[selectedConv.status].className}`}>
                    {STATUS_BADGES[selectedConv.status].label}
                  </span>
                )}
                {SALE_STATUS_BADGES[selectedConv.sale_status] && (
                  <span 
                    className={`text-[11px] font-medium px-2 py-0.5 rounded ${SALE_STATUS_BADGES[selectedConv.sale_status].className} max-w-sm truncate block`}
                    title={selectedConv.sale_reason}
                  >
                    {SALE_STATUS_BADGES[selectedConv.sale_status].label}
                    {selectedConv.sale_status === 'otra' && selectedConv.sale_reason ? `: ${selectedConv.sale_reason}` : ''}
                  </span>
                )}
              </div>
            )}
            {!selectedConv ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <History size={40} className="mb-3 text-gray-300" />
                <p className="text-sm">Elegí una consulta de la izquierda para ver los mensajes.</p>
              </div>
            ) : loadingMessages ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">Cargando mensajes...</div>
            ) : selectedMessages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">Esta consulta no tiene mensajes.</div>
            ) : (
              <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2.5">
                {selectedMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_type === 'client' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${msg.sender_type === 'client' ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100' : 'bg-teal-500 text-white'}`}>
                      {msg.sender_type === 'bot' && <div className="text-[10px] font-bold uppercase opacity-70 mb-1">BOT</div>}
                      {msg.media_url && msg.media_type === 'image' && (
                        <img src={msg.media_url} alt="Media" className="mb-1.5 max-w-full h-auto object-cover rounded" />
                      )}
                      {msg.media_url && (msg.media_type === 'document' || msg.media_type === 'pdf') && (
                        <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className={`mb-1.5 flex items-center gap-2 p-2 rounded-lg text-sm hover:underline ${msg.sender_type === 'client' ? 'bg-gray-100 dark:bg-gray-800 text-teal-700 dark:text-teal-400' : 'bg-teal-600 text-white'}`}>
                          <FileText size={16} />
                          Ver documento adjunto
                        </a>
                      )}
                      <p className="whitespace-pre-wrap">
                        {searchQuery.trim() ? highlightMatches(msg.message_text, searchQuery) : msg.message_text}
                      </p>
                      {msg.sender_type === 'client' && msg.media_url && (
                        <AttachmentTagControls msg={msg} onTag={handleTagMessage} tagging={taggingId === msg.id} />
                      )}
                      <span className={`text-[10px] block mt-1 text-right ${msg.sender_type === 'client' ? 'text-gray-400 dark:text-gray-500' : 'text-teal-100'}`}>
                        {new Date(msg.created_at).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
