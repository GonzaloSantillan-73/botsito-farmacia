import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Zap, Check, CheckCheck, Clock, AlertCircle, FileText, X, Loader2, Paperclip, History, Trash2, Timer, CheckCircle, MessagesSquare, Images, ArrowLeft, ShoppingBag, Undo2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatPhone } from '../lib/formatPhone';
import { downloadFile, filenameFromUrl } from '../lib/downloadFile';
import { isAdminRole, getStaffSucursalId } from '../lib/adminAuth';
import HistoryPanel from './HistoryPanel';
import OrderHistoryPanel from './OrderHistoryPanel';
import { SALE_STATUS_BADGES, STATUS_BADGES } from './Sidebar';
import CloseChatModal from './CloseChatModal';
import ReturnToQueueModal from './ReturnToQueueModal';
import MessageBubble from './MessageBubble';
import MediaGalleryModal from './MediaGalleryModal';

// Estados en los que la conversación ya está cerrada y no aplica el conteo de expiración.
const ESTADOS_CERRADOS = ['finalizada', 'resolved', 'rejected'];

// Cuántos mensajes viejos se traen por tanda al hacer scroll hacia arriba
// en la vista de "Ver todo el chat".
const HISTORY_PAGE_SIZE = 30;

const formatCountdown = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const mismoDia = (a, b) => a.toDateString() === b.toDateString();

// "Hoy" / "Ayer" son mucho más legibles que la fecha completa para lo más
// reciente; para el resto sí conviene la fecha larga, sin ambigüedad de año.
const formatDateDivider = (iso) => {
  const fecha = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(fecha, hoy)) return 'Hoy';
  if (mismoDia(fecha, ayer)) return 'Ayer';
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
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
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [downloadingId, setDownloadingId] = useState(null);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const fileInputRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // "Ver todo el chat": en vez de un modal aparte, antepone mensajes de
  // consultas anteriores del mismo cliente arriba de los de la conversación
  // activa, dentro del mismo contenedor de scroll.
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [historyMessages, setHistoryMessages] = useState([]); // ascendente, más viejo primero
  const [historyConversationsById, setHistoryConversationsById] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

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

  // Al cambiar de conversación activa, la vista de historial completo (y lo
  // ya cargado) deja de tener sentido: arranca de nuevo, cerrada.
  useEffect(() => {
    setShowFullHistory(false);
    setHistoryMessages([]);
    setHistoryConversationsById({});
    setHasMoreHistory(true);
  }, [activeConversation?.id]);

  // Trae una tanda de mensajes más viejos que el más antiguo ya visible
  // (de cualquier consulta anterior del cliente, no la activa) y la antepone,
  // preservando la posición de scroll para que la vista no salte.
  const loadMoreHistory = async () => {
    if (!activeConversation || loadingHistory || loadingMoreHistory || !hasMoreHistory) return;

    const esPrimeraCarga = historyMessages.length === 0;
    esPrimeraCarga ? setLoadingHistory(true) : setLoadingMoreHistory(true);

    let convMap = historyConversationsById;
    if (esPrimeraCarga) {
      const { data: convs } = await supabase
        .from('conversations')
        .select('*')
        .eq('client_phone', activeConversation.client_phone)
        .neq('id', activeConversation.id);

      const soyStaff = !isAdminRole();
      const miSucursalId = getStaffSucursalId();
      // Un empleado no debe ver, ni acá, las consultas de otra sucursal.
      const visibles = (convs || []).filter(c => !soyStaff || !c.sucursal_id || c.sucursal_id === miSucursalId);
      convMap = Object.fromEntries(visibles.map(c => [c.id, c]));
      setHistoryConversationsById(convMap);
    }

    const idsPermitidos = Object.keys(convMap);
    if (idsPermitidos.length === 0) {
      setHasMoreHistory(false);
      setLoadingHistory(false);
      setLoadingMoreHistory(false);
      return;
    }

    const cursor = esPrimeraCarga
      ? (messages[0]?.created_at || activeConversation.created_at)
      : historyMessages[0].created_at;

    const { data: pagina, error } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', idsPermitidos)
      .lt('created_at', cursor)
      .order('created_at', { ascending: false })
      .limit(HISTORY_PAGE_SIZE);

    if (error || !pagina || pagina.length === 0) {
      setHasMoreHistory(false);
    } else {
      const nuevosAsc = [...pagina].reverse();
      const contenedor = messagesContainerRef.current;
      const scrollHeightPrevio = contenedor?.scrollHeight ?? 0;
      const scrollTopPrevio = contenedor?.scrollTop ?? 0;

      setHistoryMessages(prev => [...nuevosAsc, ...prev]);
      if (pagina.length < HISTORY_PAGE_SIZE) setHasMoreHistory(false);

      // Esperamos a que React pinte los mensajes nuevos arriba y recién ahí
      // corregimos el scroll, para que el usuario no vea saltar la vista.
      requestAnimationFrame(() => {
        if (contenedor) {
          contenedor.scrollTop = contenedor.scrollHeight - scrollHeightPrevio + scrollTopPrevio;
        }
      });
    }

    setLoadingHistory(false);
    setLoadingMoreHistory(false);
  };

  // Dispara la primera tanda apenas se activa "Ver todo el chat".
  useEffect(() => {
    if (showFullHistory && historyMessages.length === 0 && hasMoreHistory && !loadingHistory) {
      loadMoreHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFullHistory]);

  const handleMessagesScroll = () => {
    if (!showFullHistory || loadingHistory || loadingMoreHistory || !hasMoreHistory) return;
    const el = messagesContainerRef.current;
    if (el && el.scrollTop < 80) {
      loadMoreHistory();
    }
  };

  const getConversacionDelMensaje = (msg) => {
    if (msg.conversation_id === activeConversation?.id) return activeConversation;
    return historyConversationsById[msg.conversation_id];
  };

  const soyAdmin = isAdminRole();
  let displayedMessages = showFullHistory ? [...historyMessages, ...messages] : messages;

  if (!soyAdmin) {
    const encuestasVistas = new Set();
    displayedMessages = displayedMessages.filter(msg => {
      if (encuestasVistas.has(msg.conversation_id)) return false;
      if (msg.sender_type === 'bot' && typeof msg.message_text === 'string' && msg.message_text.includes('Tu consulta ha finalizado')) {
        encuestasVistas.add(msg.conversation_id);
        return true;
      }
      return true;
    });
  }

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

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  const executeReturnToQueue = async ({ motivo, motivoTexto }) => {
    if (!activeConversation) return;

    const res = await fetch(`/api/conversations/${activeConversation.id}/return-to-queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo, motivoTexto })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo devolver el chat a la cola de espera.');
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
                 onClick={() => setShowFullHistory(v => !v)}
                 title={showFullHistory ? 'Volver a esta consulta' : 'Ver todo el chat: cargar acá mismo los mensajes de consultas anteriores con este cliente'}
                 className={`p-2 rounded-full transition-colors ${showFullHistory ? 'bg-teal-50 text-teal-600' : 'text-gray-500 hover:bg-gray-100'}`}
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
               {!isConversacionCerrada && activeConversation.status !== 'esperando' && (
                 <button
                   onClick={() => setIsReturnModalOpen(true)}
                   title="Devolver este chat a la lista de espera general (ej. no hay stock)"
                   className="p-2 text-gray-500 hover:bg-amber-50 hover:text-amber-600 rounded-full transition-colors"
                 >
                   <Undo2 size={20} />
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
                 onClick={() => setShowOrderHistory(true)}
                 title="Historial de pedidos del cliente"
                 className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
               >
                 <ShoppingBag size={20} />
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
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#efeae2] scrollbar-hide"
          >
            {showFullHistory && loadingHistory && (
              <div className="flex items-center justify-center gap-2 py-2 text-gray-400 text-xs">
                <Loader2 size={14} className="animate-spin" /> Cargando historial...
              </div>
            )}
            {showFullHistory && loadingMoreHistory && (
              <div className="flex items-center justify-center gap-2 py-2 text-gray-400 text-xs">
                <Loader2 size={14} className="animate-spin" /> Cargando mensajes anteriores...
              </div>
            )}
            {showFullHistory && !loadingHistory && !hasMoreHistory && historyMessages.length > 0 && (
              <div className="flex items-center justify-center py-2 text-gray-400 text-[11px]">
                — Inicio del historial con este cliente —
              </div>
            )}
            {displayedMessages.length === 0 ? (
               <div className="flex items-center justify-center h-full text-gray-400">
                  No hay mensajes aún.
               </div>
            ) : displayedMessages.map((msg, i) => {
              const anterior = displayedMessages[i - 1];
              const cambioDeDia = showFullHistory && (!anterior || !mismoDia(new Date(anterior.created_at), new Date(msg.created_at)));
              const cambioDeSesion = showFullHistory && !cambioDeDia && anterior && msg.conversation_id !== anterior.conversation_id;
              const conv = showFullHistory ? getConversacionDelMensaje(msg) : null;

              return (
                <React.Fragment key={msg.id}>
                  {cambioDeDia && (
                    <div className="flex justify-center my-2">
                      <span className="bg-white/90 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                        {formatDateDivider(msg.created_at)}
                      </span>
                    </div>
                  )}
                  {cambioDeSesion && (
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-gray-300/60" />
                      <span className="text-[11px] text-gray-500 font-medium px-1 flex items-center gap-1.5 whitespace-nowrap">
                        Nueva consulta
                        {conv && STATUS_BADGES[conv.status] && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGES[conv.status].className}`}>
                            {STATUS_BADGES[conv.status].label}
                          </span>
                        )}
                      </span>
                      <div className="flex-1 h-px bg-gray-300/60" />
                    </div>
                  )}
                  <MessageBubble
                    msg={msg}
                    onImageClick={(m) => setModalImage(m.media_url)}
                    onDownload={handleDownloadMedia}
                    downloadingId={downloadingId}
                    statusIcon={msg.sender_type !== 'client' && <MessageStatusIcon estado={msg.estado} />}
                  />
                </React.Fragment>
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
              clientName={activeConversation.real_name || activeConversation.client_name}
              currentConversationId={activeConversation.id}
              onClose={() => setShowHistory(false)}
            />
          )}

          {showOrderHistory && (
            <OrderHistoryPanel
              clientPhone={activeConversation.client_phone}
              clientName={activeConversation.real_name || activeConversation.client_name}
              onClose={() => setShowOrderHistory(false)}
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

          <ReturnToQueueModal
            isOpen={isReturnModalOpen}
            onClose={() => setIsReturnModalOpen(false)}
            onConfirm={executeReturnToQueue}
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
