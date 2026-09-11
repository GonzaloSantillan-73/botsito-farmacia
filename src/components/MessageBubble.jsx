import React from 'react';
import { Image as ImageIcon, FileText, Loader2, MapPin, Download, Eye, ShieldAlert } from 'lucide-react';

// El webhook guarda las ubicaciones de WhatsApp como JSON en message_text
// ({lat, lng, name?, address?}) con media_type 'location'. Acá lo parseamos
// de vuelta para poder mostrar la tarjeta de mapa en vez del JSON crudo.
export const parseLocationMessage = (msg) => {
  if (msg.media_type !== 'location') return null;
  try {
    const data = JSON.parse(msg.message_text);
    if (typeof data?.lat !== 'number' || typeof data?.lng !== 'number') return null;
    return data;
  } catch {
    return null;
  }
};

// Renderiza un mensaje del chat (texto, imagen, video, documento, PDF o
// ubicación) exactamente igual en el chat en vivo, el historial completo del
// cliente y la galería multimedia, para que los tres lugares se vean y se
// comporten de forma idéntica.
export default function MessageBubble({ msg, onImageClick, onDownload, downloadingId, statusIcon }) {
  const location = parseLocationMessage(msg);
  return (
    <div className={`flex ${msg.sender_type === 'client' ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[75%] rounded-lg p-3 shadow-sm ${msg.sender_type === 'client' ? 'bg-white text-gray-800 rounded-tl-none' : 'bg-teal-500 text-white rounded-tr-none'}`}>
        {msg.sender_type === 'bot' && <div className="text-[10px] font-bold uppercase opacity-70 mb-1">BOT</div>}
        {location && (
          <div
            onClick={() => window.open(`https://www.google.com/maps?q=${location.lat},${location.lng}`, '_blank', 'noopener,noreferrer')}
            className="mb-2 rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity w-64 max-w-full"
            title="Abrir ubicación en Google Maps"
          >
            {/* El iframe de OpenStreetMap trae su propia franja de atribución
                anclada al fondo del documento embebido; como es de otro origen
                no podemos aplicarle CSS para ocultarla, así que lo agrandamos y
                lo corremos hacia arriba dentro de un contenedor más bajo con
                overflow:hidden, recortando esa franja fuera del área visible. */}
            <div className="h-32 w-full overflow-hidden relative bg-gray-100">
              <iframe
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.01}%2C${location.lat - 0.01}%2C${location.lng + 0.01}%2C${location.lat + 0.01}&marker=${location.lat}%2C${location.lng}`}
                className="absolute top-0 left-0 w-full border-0 pointer-events-none"
                style={{ height: 'calc(100% + 70px)' }}
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
            onClick={() => onImageClick && onImageClick(msg)}
          >
            <img src={msg.media_url} alt="Media" className="max-w-full h-auto object-cover rounded bg-gray-100" />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-medium px-2 py-1 bg-black/50 rounded flex items-center gap-1">
                <ImageIcon size={14}/> Ampliar
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDownload && onDownload(msg); }}
              disabled={downloadingId === msg.id}
              title="Descargar imagen"
              className="absolute top-1.5 right-1.5 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors disabled:opacity-50"
            >
              {downloadingId === msg.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            </button>
          </div>
        )}
        {msg.media_url && msg.media_type === 'video' && (
          <div className="mb-2 rounded overflow-hidden relative">
            <video src={msg.media_url} controls className="max-w-full max-h-64 rounded bg-black" />
            <button
              onClick={() => onDownload && onDownload(msg)}
              disabled={downloadingId === msg.id}
              title="Descargar video"
              className="absolute top-1.5 right-1.5 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors disabled:opacity-50"
            >
              {downloadingId === msg.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            </button>
          </div>
        )}
        {msg.media_url && msg.media_type === 'document' && (
           <button
              onClick={() => onDownload && onDownload(msg)}
              disabled={downloadingId === msg.id}
              className={`mb-2 w-full flex items-center gap-2 p-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${msg.sender_type === 'client' ? 'bg-gray-100 text-teal-700 hover:bg-gray-200' : 'bg-teal-600 text-white hover:bg-teal-700'}`}
           >
              {downloadingId === msg.id ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
              Descargar documento adjunto
              <Download size={14} className="ml-auto shrink-0" />
           </button>
        )}
        {msg.media_url && msg.media_type === 'pdf' && (
          <div className={`mb-2 rounded-lg border overflow-hidden ${msg.sender_type === 'client' ? 'border-gray-200 bg-gray-50' : 'border-teal-400 bg-teal-600/20'}`}>
            <div className="flex items-center gap-2 p-2.5">
              <div className={`p-2 rounded-lg shrink-0 ${msg.sender_type === 'client' ? 'bg-rose-100 text-rose-600' : 'bg-white/20 text-white'}`}>
                <FileText size={18} />
              </div>
              <span className="text-sm font-medium truncate">{msg.message_text || 'Documento PDF'}</span>
            </div>
            <div className={`flex border-t ${msg.sender_type === 'client' ? 'border-gray-200' : 'border-teal-400/50'}`}>
              <a
                href={msg.media_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${msg.sender_type === 'client' ? 'text-teal-700 hover:bg-gray-100' : 'text-white hover:bg-white/10'}`}
              >
                <Eye size={14} /> Visualizar
              </a>
              <div className={`w-px ${msg.sender_type === 'client' ? 'bg-gray-200' : 'bg-teal-400/50'}`} />
              <button
                onClick={() => onDownload && onDownload(msg)}
                disabled={downloadingId === msg.id}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${msg.sender_type === 'client' ? 'text-teal-700 hover:bg-gray-100' : 'text-white hover:bg-white/10'}`}
              >
                {downloadingId === msg.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Descargar
              </button>
            </div>
          </div>
        )}
        {msg.media_type === 'blocked_pdf' && (
          <div className="mb-2 flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
            <ShieldAlert size={18} className="shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold block mb-0.5">PDF bloqueado por seguridad</span>
              No se guardó el archivo: el análisis detectó contenido potencialmente malicioso.
            </div>
          </div>
        )}
        {!location && msg.media_type !== 'pdf' && <p className="text-sm whitespace-pre-wrap">{msg.message_text}</p>}
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className={`text-[10px] ${msg.sender_type === 'client' ? 'text-gray-400' : 'text-teal-100'}`}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {statusIcon}
        </div>
      </div>
    </div>
  );
}
