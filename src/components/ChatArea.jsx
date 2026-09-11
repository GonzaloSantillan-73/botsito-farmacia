import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Zap, Check, CheckCheck, Clock, AlertCircle, FileText, X, Loader2, Paperclip, History, Trash2, Timer, CheckCircle, MessagesSquare, Images, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatPhone } from '../lib/formatPhone';
import { downloadFile, filenameFromUrl } from '../lib/downloadFile';
import HistoryPanel from './HistoryPanel';
import { SALE_STATUS_BADGES } from './Sidebar';
import CloseChatModal from './CloseChatModal';
import MessageBubble from './MessageBubble';
import FullChatModal from './FullChatModal';
import MediaGalleryModal from './MediaGalleryModal';

// Estados en los que la conversación ya está cerrada y no aplica el conteo de expiración.
const ESTADOS_CERRADOS = ['finalizada', 'resolved', 'rejected'];

const formatCountdown = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  sessionTimeoutMs,
  onBackToHistory
}) {
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [quickResponses, setQuickResponses] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showFullChat, setShowFullChat] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [downloadingId, setDownloadingId] = useState(null);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const fileInputRef = useRef(null);

  // El nombre "bonito" del archivo (ej. "receta.pdf") viaja en message_text
  // para documentos/PDF; para fotos y videos no hay nombre real, así que
  // caemos al nombre técnico derivado de la URL de Storage.
  const esNombreArchivoValido = (texto) => /\.[a-z0-9]{2,5}$/i.test((texto || '').trim());

  const handleDownloadMedia = async (msg) => {
    setDownloadingId(msg.id);
    const nombre = esNombreArchivoValido(msg.message_text) ? msg.message_text.trim() : filenameFromUrl(msg.media_url);
    const resultado = await downloadFile(msg.media_url, nombre);
    if (!resultado.ok) {
      alert('No se pudo descargar el archivo directamente. Se abrió en una pestaña nueva: desde ahí podés guardarlo con Ctrl+S o clic derecho → "Guardar como".');
    }
    setDownloadingId(null);
  };

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

  const executeCloseChat = async () => {
    if (!activeConversation) return;

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
              {onBackToHistory && (
                <button
                  onClick={onBackToHistory}
                  title="Volver al historial del cliente"
                  className="p-1.5 -ml-1.5 text-gray-500 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <div>
                <h2 className="font-bold text-gray-900">{activeConversation.real_name || activeConversation.client_name}</h2>
                <p className="text-xs text-gray-500">{formatPhone(activeConversation.client_phone)}</p>
              </div>
              {SALE_STATUS_BADGES[activeConversation.sale_status] && (
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${SALE_STATUS_BADGES[activeConversation.sale_status].className}`}>
                  {SALE_STATUS_BADGES[activeConversation.sale_status].label}
                </span>
              )}
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
               <button
                 onClick={() => setShowGallery(true)}
                 title="Ver imágenes, videos, documentos y enlaces compartidos con el cliente"
                 className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
               >
                 <Images size={20} />
               </button>
               <button
                 onClick={() => setShowFullChat(true)}
                 title="Ver todo el chat: historial completo de mensajes con este cliente, de todas sus consultas"
                 className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
               >
                 <MessagesSquare size={20} />
               </button>
               {!isConversacionCerrada && (
                 <button
                   onClick={() => setIsCloseModalOpen(true)}
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
            ) : messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onImageClick={(m) => setModalImage(m.media_url)}
                onDownload={handleDownloadMedia}
                downloadingId={downloadingId}
                statusIcon={msg.sender_type !== 'client' && <MessageStatusIcon estado={msg.estado} />}
              />
            ))}
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
              clientName={activeConversation.real_name || activeConversation.client_name}
              currentConversationId={activeConversation.id}
              onClose={() => setShowHistory(false)}
            />
          )}

          {showFullChat && (
            <FullChatModal
              clientPhone={activeConversation.client_phone}
              clientName={activeConversation.real_name || activeConversation.client_name}
              setModalImage={setModalImage}
              onClose={() => setShowFullChat(false)}
            />
          )}

          {showGallery && (
            <MediaGalleryModal
              clientPhone={activeConversation.client_phone}
              clientName={activeConversation.real_name || activeConversation.client_name}
              setModalImage={setModalImage}
              onClose={() => setShowGallery(false)}
            />
          )}

          <CloseChatModal
            isOpen={isCloseModalOpen}
            onClose={() => setIsCloseModalOpen(false)}
            activeConversation={activeConversation}
            onConfirmClose={executeCloseChat}
          />
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
