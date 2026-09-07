import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Image as ImageIcon, Send, Zap, Check, CheckCheck, Clock, AlertCircle, FileText, X, Loader2, Paperclip, History, Trash2, Timer, CheckCircle, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatPhone } from '../lib/formatPhone';
import HistoryPanel from './HistoryPanel';

// Estados en los que la conversación ya está cerrada y no aplica el conteo de expiración.
const ESTADOS_CERRADOS = ['finalizada', 'resolved', 'rejected'];

const formatCountdown = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// El webhook guarda las ubicaciones de WhatsApp como JSON en message_text
// ({lat, lng, name?, address?}) con media_type 'location'. Acá lo parseamos
// de vuelta para poder mostrar la tarjeta de mapa en vez del JSON crudo.
const parseLocationMessage = (msg) => {
  if (msg.media_type !== 'location') return null;
  try {
    const data = JSON.parse(msg.message_text);
    if (typeof data?.lat !== 'number' || typeof data?.lng !== 'number') return null;
    return data;
  } catch {
    return null;
  }
};

const getLastActivityTime = (conversation, messages) => {
  if (!messages || messages.length === 0) return conversation.created_at;
  return messages.reduce((latest, m) => (new Date(m.created_at) > new Date(latest) ? m.created_at : latest), messages[0].created_at);
};

// Checks de estado (estilo WhatsApp) para mensajes salientes del operador o el bot.
const MessageStatusIcon = ({ estado }) => {
  switch (estado) {
    case 'leido':
      return <CheckCheck size={14} className="text-sky-300" title="Leído" />;
    case 'entregado':
      return <CheckCheck size={14} className="text-teal-100/80" title="Entregado" />;
    case 'enviado':
      return <Check size={14} className="text-teal-100/80" title="Enviado" />;
    case 'error':
      return <AlertCircle size={14} className="text-rose-200" title="No se pudo entregar" />;
    case 'pendiente':
    default:
      return <Clock size={12} className="text-teal-100/60" title="Enviando..." />;
  }
};

export default function ChatArea({
  activeConversation,
  messages,
  messagesEndRef,
  messageInput,
  setMessageInput,
  handleSendMessage,
  handleDeleteConversation,
  setModalImage,
  sessionTimeoutMs
}) {
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [quickResponses, setQuickResponses] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(Date.now());
  const fileInputRef = useRef(null);

  // Corre el contador en vivo, segundo a segundo.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Trae las plantillas cada vez que se abre el menú, para reflejar cambios
  // hechos en Configuración sin necesidad de recargar la página.
  useEffect(() => {
    if (!showQuickResponses) return;
    supabase
      .from('quick_replies')
      .select('*')
      .order('shortcut')
      .then(({ data, error }) => {
        if (!error) setQuickResponses(data || []);
      });
  }, [showQuickResponses]);

  const isConversacionCerrada = activeConversation && ESTADOS_CERRADOS.includes(activeConversation.status);
  let remainingMs = null;
  if (activeConversation && !isConversacionCerrada && sessionTimeoutMs != null) {
    const lastActivity = getLastActivityTime(activeConversation, messages);
    remainingMs = sessionTimeoutMs - (now - new Date(lastActivity).getTime());
  }

  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessageInput(value);
    
    if (value.endsWith('/')) {
      setShowQuickResponses(true);
    } else if (showQuickResponses && value.trim() === '') {
      setShowQuickResponses(false);
    }
  };

  const insertQuickResponse = (text) => {
    let current = messageInput;
    if (current.endsWith('/')) {
      current = current.slice(0, -1);
    }
    setMessageInput(current ? `${current} ${text}` : text);
    setShowQuickResponses(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const [closingChat, setClosingChat] = useState(false);

  const handleCloseChat = async () => {
    if (!activeConversation) return;
    if (!window.confirm('¿Finalizar esta consulta? Se le va a pedir al cliente que califique la atención recibida.')) return;

    setClosingChat(true);
    try {
      const res = await fetch(`/api/conversations/${activeConversation.id}/close`, { method: 'POST' });
      if (!res.ok) throw new Error('No se pudo finalizar la consulta.');
    } catch (err) {
      console.error('Error finalizando la consulta:', err);
      alert('No se pudo finalizar la consulta.');
    } finally {
      setClosingChat(false);
    }
  };

  const handleSendClick = async () => {
    if (!messageInput.trim() && !selectedFile) return;

    if (selectedFile) {
      setIsUploading(true);
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${activeConversation.id}_${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('media')
        .upload(fileName, selectedFile);
        
      setIsUploading(false);

      if (error) {
        console.error('Error subiendo el archivo:', error);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);
      const mediaType = selectedFile.type.startsWith('image/') ? 'image' : 'document';

      handleSendMessage(null, publicUrlData.publicUrl, mediaType);
      setSelectedFile(null);
    } else {
      handleSendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f0f2f5] relative">
      {activeConversation ? (
        <>
          {/* Header */}
          <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold uppercase">
                {(activeConversation.client_name || '?').charAt(0)}
              </div>
              <div>
                <h2 className="font-bold text-gray-900">{activeConversation.client_name}</h2>
                <p className="text-xs text-gray-500">{formatPhone(activeConversation.client_phone)}</p>
              </div>
            </div>

            {remainingMs !== null && (
              <div
                title="Tiempo restante antes de que la consulta se cierre por inactividad"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tabular-nums transition-colors ${
                  remainingMs <= 0
                    ? 'bg-gray-100 text-gray-500'
                    : remainingMs <= 30000
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-amber-50 text-amber-700'
                }`}
              >
                <Timer size={14} />
                {remainingMs <= 0 ? 'Expirado' : `Expira en ${formatCountdown(remainingMs)}`}
              </div>
            )}

            <div className="flex items-center gap-2">
               {!isConversacionCerrada && (
                 <button
                   onClick={handleCloseChat}
                   disabled={closingChat}
                   title="Finalizar esta consulta y pedirle al cliente que la califique"
                   className="p-2 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 rounded-full transition-colors disabled:opacity-50"
                 >
                   {closingChat ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                 </button>
               )}
               <button
                 onClick={() => setShowHistory(true)}
                 title="Historial de consultas del cliente"
                 className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
               >
                 <History size={20} />
               </button>
               <button
                 onClick={() => handleDeleteConversation && handleDeleteConversation(activeConversation.id)}
                 title="Eliminar esta conversación"
                 className="p-2 text-gray-500 hover:bg-rose-50 hover:text-rose-600 rounded-full transition-colors"
               >
                 <Trash2 size={20} />
               </button>
            </div>
          </div>
          
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#efeae2] scrollbar-hide">
            {messages.length === 0 ? (
               <div className="flex items-center justify-center h-full text-gray-400">
                  No hay mensajes aún.
               </div>
            ) : messages.map(msg => {
              const location = parseLocationMessage(msg);
              return (
              <div key={msg.id} className={`flex ${msg.sender_type === 'client' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] rounded-lg p-3 shadow-sm ${msg.sender_type === 'client' ? 'bg-white text-gray-800 rounded-tl-none' : 'bg-teal-500 text-white rounded-tr-none'}`}>
                  {msg.sender_type === 'bot' && <div className="text-[10px] font-bold uppercase opacity-70 mb-1">BOT</div>}
                  {location && (
                    <div
                      onClick={() => window.open(`https://www.google.com/maps?q=${location.lat},${location.lng}`, '_blank', 'noopener,noreferrer')}
                      className="mb-2 rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity w-64 max-w-full"
                      title="Abrir ubicación en Google Maps"
                    >
                      <div className="h-32 w-full pointer-events-none bg-gray-100">
                        <iframe
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.01}%2C${location.lat - 0.01}%2C${location.lng + 0.01}%2C${location.lat + 0.01}&marker=${location.lat}%2C${location.lng}`}
                          className="w-full h-full border-0"
                          loading="lazy"
                          title="Vista previa de ubicación"
                        />
                      </div>
                      <div className={`flex items-center gap-2 p-2 text-xs font-medium ${msg.sender_type === 'client' ? 'bg-gray-100 text-teal-700' : 'bg-teal-600 text-white'}`}>
                        <MapPin size={14} className="shrink-0" />
                        <span className="truncate">{location.name || location.address || 'Ver ubicación en Google Maps'}</span>
                      </div>
                    </div>
                  )}
                  {msg.media_url && msg.media_type === 'image' && (
                    <div 
                      className="mb-2 rounded overflow-hidden relative cursor-pointer group"
                      onClick={() => setModalImage(msg.media_url)}
                    >
                      <img src={msg.media_url} alt="Media" className="max-w-full h-auto object-cover rounded bg-gray-100" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-xs font-medium px-2 py-1 bg-black/50 rounded flex items-center gap-1">
                          <ImageIcon size={14}/> Ampliar
                        </span>
                      </div>
                    </div>
                  )}
                  {msg.media_url && msg.media_type === 'document' && (
                     <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className={`mb-2 flex items-center gap-2 p-2 rounded-lg text-sm hover:underline ${msg.sender_type === 'client' ? 'bg-gray-100 text-teal-700' : 'bg-teal-600 text-white'}`}>
                        <FileText size={18} />
                        Ver documento adjunto
                     </a>
                  )}
                  {!location && <p className="text-sm whitespace-pre-wrap">{msg.message_text}</p>}
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className={`text-[10px] ${msg.sender_type === 'client' ? 'text-gray-400' : 'text-teal-100'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                    {msg.sender_type !== 'client' && <MessageStatusIcon estado={msg.estado} />}
                  </div>
                </div>
              </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area (oculta en conversaciones cerradas/Historial: no se puede escribir ahí) */}
          {isConversacionCerrada ? (
            <div className="p-4 bg-gray-50 border-t border-gray-200 text-center text-sm text-gray-500">
              Esta consulta está cerrada. No se pueden enviar mensajes desde el Historial.
            </div>
          ) : (
          <div className="p-4 bg-white border-t border-gray-200 relative flex flex-col gap-2">
            {showQuickResponses && (
              <div className="absolute bottom-[100%] mb-2 left-4 bg-white border border-gray-200 shadow-xl rounded-xl w-[350px] overflow-hidden z-20">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap size={16} className="text-amber-500" />
                    <span className="text-xs font-bold text-gray-700 uppercase">Respuestas Rápidas</span>
                  </div>
                  <button onClick={() => setShowQuickResponses(false)} className="text-gray-400 hover:text-gray-600">
                    <Check size={16} className="opacity-0" />
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {quickResponses.length === 0 ? (
                    <div className="p-3 text-xs text-gray-400 text-center">
                      No hay plantillas creadas. Agregalas desde Configuración.
                    </div>
                  ) : (
                    quickResponses.map((qr) => (
                      <button
                        key={qr.id}
                        onClick={() => insertQuickResponse(qr.message_text)}
                        className="w-full text-left p-3 hover:bg-teal-50 border-b border-gray-100 last:border-0 transition-colors flex flex-col gap-1"
                      >
                        <span className="text-sm font-semibold text-teal-800">{qr.shortcut}</span>
                        <span className="text-xs text-gray-500 line-clamp-2">{qr.message_text}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            
            {/* File Preview */}
            {selectedFile && (
              <div className="self-start px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between gap-4 max-w-sm">
                 <div className="flex items-center gap-2 overflow-hidden">
                    {selectedFile.type.startsWith('image/') ? (
                       <img src={URL.createObjectURL(selectedFile)} alt="preview" className="h-10 w-10 object-cover rounded shadow-sm" />
                    ) : (
                       <div className="h-10 w-10 bg-gray-200 flex items-center justify-center rounded shadow-sm"><FileText size={20} className="text-gray-500"/></div>
                    )}
                    <span className="text-xs font-medium text-gray-700 truncate">{selectedFile.name}</span>
                 </div>
                 <button onClick={() => setSelectedFile(null)} className="p-1 text-gray-400 hover:text-rose-500 bg-white rounded-full shadow-sm"><X size={16}/></button>
              </div>
            )}

            <div className="flex items-end gap-2 bg-gray-50 border border-gray-300 rounded-xl p-2 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500 transition-shadow">
              <button 
                onClick={() => setShowQuickResponses(!showQuickResponses)}
                className={`p-2 transition-colors rounded-lg ${showQuickResponses ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`}
                title="Respuestas Rápidas (/)"
              >
                <Zap size={20} />
              </button>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileChange}
                accept="image/*,.pdf,.doc,.docx"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-teal-600 transition-colors"
                title="Adjuntar archivo"
              >
                <Paperclip size={20} />
              </button>
              
              <textarea 
                className="flex-1 bg-transparent max-h-32 min-h-[40px] resize-none outline-none py-2 px-2 text-sm scrollbar-hide"
                placeholder="Escribe un mensaje... (Usa '/' para plantillas)"
                value={messageInput}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendClick();
                  }
                }}
              />
              <button 
                onClick={handleSendClick}
                disabled={(!messageInput.trim() && !selectedFile) || isUploading}
                className="p-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center w-10 h-10"
              >
                {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              </button>
            </div>
          </div>
          )}

          {showHistory && (
            <HistoryPanel
              clientPhone={activeConversation.client_phone}
              currentConversationId={activeConversation.id}
              onClose={() => setShowHistory(false)}
            />
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
          <MessageSquare size={64} className="mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">Selecciona una conversación</p>
        </div>
      )}
    </div>
  );
}
