import React, { useState, useEffect } from 'react';
import { X, History, Clock, ArrowLeft, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

const STATUS_LABELS = {
  open: 'Abierto',
  pending_validation: 'Receta pendiente',
  preparation: 'En preparación',
  ready: 'Listo / en envío',
  resolved: 'Resuelto',
  rejected: 'Rechazado',
  esperando: 'Esperando humano',
  finalizada: 'Finalizada por inactividad'
};

export default function HistoryPanel({ clientPhone, currentConversationId, onClose }) {
  const [pastConversations, setPastConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState(null);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('client_phone', clientPhone)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setPastConversations(data.filter(c => c.id !== currentConversationId));
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

    if (!error && data) setSelectedMessages(data);
    setLoadingMessages(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-bold">
            {selectedConv ? (
              <button onClick={() => setSelectedConv(null)} className="p-1 text-gray-400 hover:text-teal-600 rounded-full transition-colors">
                <ArrowLeft size={18} />
              </button>
            ) : (
              <History size={20} className="text-teal-600" />
            )}
            {selectedConv ? 'Consulta anterior' : 'Historial de consultas'}
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {!selectedConv ? (
            loading ? (
              <div className="text-center text-gray-400 py-10 text-sm">Cargando historial...</div>
            ) : pastConversations.length === 0 ? (
              <div className="text-center text-gray-400 py-10 flex flex-col items-center gap-2">
                <Clock size={32} className="text-gray-300" />
                <span className="text-sm">Este cliente no tiene consultas anteriores.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {pastConversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className="w-full text-left p-3 bg-white border border-gray-200 rounded-lg hover:bg-teal-50 hover:border-teal-200 transition-colors flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 overflow-hidden">
                      <div className="text-xs text-gray-500 mb-1">
                        {new Date(conv.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-700 truncate">
                        {conv.last_message || <span className="italic text-gray-400">Sin mensajes</span>}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0 uppercase font-medium whitespace-nowrap">
                      {STATUS_LABELS[conv.status] || conv.status}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : loadingMessages ? (
            <div className="text-center text-gray-400 py-10 text-sm">Cargando mensajes...</div>
          ) : selectedMessages.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-sm">Esta consulta no tiene mensajes.</div>
          ) : (
            <div className="space-y-3">
              {selectedMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender_type === 'client' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[75%] rounded-lg p-3 text-sm shadow-sm ${msg.sender_type === 'client' ? 'bg-white text-gray-800' : 'bg-teal-500 text-white'}`}>
                    {msg.sender_type === 'bot' && <div className="text-[10px] font-bold uppercase opacity-70 mb-1">BOT</div>}
                    {msg.media_url && msg.media_type === 'image' && (
                      <img src={msg.media_url} alt="Media" className="mb-2 max-w-full h-auto object-cover rounded" />
                    )}
                    {msg.media_url && msg.media_type === 'document' && (
                      <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className={`mb-2 flex items-center gap-2 p-2 rounded-lg text-sm hover:underline ${msg.sender_type === 'client' ? 'bg-gray-100 text-teal-700' : 'bg-teal-600 text-white'}`}>
                        <FileText size={16} />
                        Ver documento adjunto
                      </a>
                    )}
                    <p className="whitespace-pre-wrap">{msg.message_text}</p>
                    <span className={`text-[10px] block mt-1 text-right ${msg.sender_type === 'client' ? 'text-gray-400' : 'text-teal-100'}`}>
                      {new Date(msg.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
