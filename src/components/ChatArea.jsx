import React, { useState, useRef } from 'react';
import { Search, Filter, MessageSquare, Image as ImageIcon, Send, Zap, ChevronRight, Check, FileText, X, Loader2, Paperclip, History } from 'lucide-react';
import { supabase } from '../lib/supabase';
import HistoryPanel from './HistoryPanel';

export default function ChatArea({
  activeConversation,
  messages,
  messagesEndRef,
  messageInput,
  setMessageInput,
  handleSendMessage,
  handleUpdateConversationStatus,
  setModalImage
}) {
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef(null);

  const quickResponses = [
    { title: "Requisitos de Receta", text: "Por favor, recuerda que la foto de la receta debe incluir fecha, firma y diagnóstico legible." },
    { title: "Datos de Pago / Transferencia", text: "Puedes transferir a nuestro CBU: 0000000000000000000000, Alias: FARMACIA.PAGO. Recuerda enviarnos el comprobante." },
    { title: "Retiro por Sucursal", text: "Nuestra sucursal se encuentra en Av. Principal 123. Los horarios de atención son de Lunes a Viernes de 9 a 20hs. Recuerda traer tu DNI o el de la persona que retira." },
    { title: "Consulta Obra Social", text: "Para consultar cobertura, por favor envíanos una foto de tu credencial de obra social y el número de DNI del afiliado." }
  ];

  const orderStatuses = [
    { id: 'pending_validation', label: '1. Validación' },
    { id: 'preparation', label: '2. En Preparación' },
    { id: 'ready', label: '3. Listo / En Envío' },
    { id: 'resolved', label: '4. Finalizado' }
  ];

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
      
      handleSendMessage(messageInput, publicUrlData.publicUrl, mediaType);
      setSelectedFile(null);
    } else {
      handleSendMessage(messageInput, null, 'text');
    }
  };

  return (
    <div className="w-2/4 flex flex-col bg-[#f0f2f5] relative">
      {activeConversation ? (
        <>
          {/* Header */}
          <div className="px-6 py-4 bg-white border-b border-gray-200 flex flex-col shadow-sm z-10 gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold uppercase">
                  {(activeConversation.client_name || '?').charAt(0)}
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">{activeConversation.client_name}</h2>
                  <p className="text-xs text-gray-500">{activeConversation.client_phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                 <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"><Search size={20} /></button>
                 <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"><Filter size={20} /></button>
                 <button
                   onClick={() => setShowHistory(true)}
                   title="Historial de consultas del cliente"
                   className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
                 >
                   <History size={20} />
                 </button>
              </div>
            </div>
            
            {/* Stepper */}
            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-100">
              {orderStatuses.map((status, index) => {
                const isActive = activeConversation.status === status.id;
                const currentIndex = orderStatuses.findIndex(s => s.id === activeConversation.status);
                const isCompleted = currentIndex > index;
                
                return (
                  <React.Fragment key={status.id}>
                    <button 
                      onClick={() => handleUpdateConversationStatus && handleUpdateConversationStatus(status.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        isActive 
                          ? 'bg-teal-500 text-white shadow-sm' 
                          : isCompleted 
                            ? 'bg-teal-50 text-teal-700' 
                            : 'bg-transparent text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                      }`}
                    >
                      {isCompleted && <Check size={14} />}
                      {status.label}
                    </button>
                    {index < orderStatuses.length - 1 && (
                      <ChevronRight size={14} className="text-gray-300" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#efeae2] scrollbar-hide">
            {messages.length === 0 ? (
               <div className="flex items-center justify-center h-full text-gray-400">
                  No hay mensajes aún.
               </div>
            ) : messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_type === 'client' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] rounded-lg p-3 shadow-sm ${msg.sender_type === 'client' ? 'bg-white text-gray-800 rounded-tl-none' : 'bg-teal-500 text-white rounded-tr-none'}`}>
                  {msg.sender_type === 'bot' && <div className="text-[10px] font-bold uppercase opacity-70 mb-1">BOT</div>}
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
                  <p className="text-sm whitespace-pre-wrap">{msg.message_text}</p>
                  <span className={`text-[10px] block mt-1 text-right ${msg.sender_type === 'client' ? 'text-gray-400' : 'text-teal-100'}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
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
                  {quickResponses.map((qr, idx) => (
                    <button 
                      key={idx}
                      onClick={() => insertQuickResponse(qr.text)}
                      className="w-full text-left p-3 hover:bg-teal-50 border-b border-gray-100 last:border-0 transition-colors flex flex-col gap-1"
                    >
                      <span className="text-sm font-semibold text-teal-800">{qr.title}</span>
                      <span className="text-xs text-gray-500 line-clamp-2">{qr.text}</span>
                    </button>
                  ))}
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
