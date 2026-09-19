import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, FileText, Loader2, MapPin, Download, Eye, ShieldAlert, Tag, Check, X } from 'lucide-react';
import { renderWhatsAppText } from '../lib/whatsappFormat';
import { adminFetch } from '../lib/adminAuth';

const TAG_LABELS = {
  comprobante: { texto: '🧾 Comprobante', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
  receta: { texto: '📋 Receta', className: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400' }
};

// Menú para marcar un adjunto del cliente como "el" comprobante de pago o
// "la" receta de la conversación (ver server/routes/api.js PATCH
// /messages/:id/tag). Sólo tiene sentido sobre archivos que mandó el
// cliente, nunca sobre lo que le mandamos nosotros.
export function AttachmentTagControls({ msg, onTag, tagging }) {
  const [open, setOpen] = useState(false);
  const tagActual = TAG_LABELS[msg.tagged_as];

  const elegir = (tag) => {
    setOpen(false);
    onTag && onTag(msg, tag);
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          disabled={tagging}
          title="Marcar este archivo"
          className="p-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-500 shadow-sm hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {tagging ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
        </button>
        {open && (
          <div className="absolute z-10 top-full mt-1 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-48 text-xs">
            <button onClick={() => elegir('comprobante')} className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
              {msg.tagged_as === 'comprobante' && <Check size={12} className="text-emerald-600 shrink-0" />} Marcar como comprobante
            </button>
            <button onClick={() => elegir('receta')} className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
              {msg.tagged_as === 'receta' && <Check size={12} className="text-sky-600 shrink-0" />} Marcar como receta
            </button>
            {msg.tagged_as && (
              <button onClick={() => elegir(null)} className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-rose-600 dark:text-rose-400 border-t border-gray-100 dark:border-gray-700 mt-1 flex items-center gap-1.5">
                <X size={12} className="shrink-0" /> Quitar marca
              </button>
            )}
          </div>
        )}
      </div>
      {/* El badge de estado sólo aparece si el archivo ya tiene una marca asignada, para no ensuciar la interfaz cuando no hace falta. */}
      {tagActual && (
        <span className={`text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap ${tagActual.className}`}>
          {tagActual.texto}
        </span>
      )}
    </div>
  );
}

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

// Mismo whitelist de hosts que usa el backend (server/services/mapsLocation.js)
// para decidir si vale la pena pedirle al servidor que resuelva el link: un
// cliente puede pegar cualquier URL como texto, y no toda URL es de Maps.
const MAPS_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com']);
const REGEX_URL = /https?:\/\/[^\s]+/i;

// Busca un link de Google Maps dentro de un mensaje de texto plano (a
// diferencia de parseLocationMessage, que es para el botón nativo de
// "Compartir ubicación" de WhatsApp). Sólo tiene sentido llamarlo sobre
// mensajes sin adjunto: un caption de imagen que mencione un link no debe
// tapar la imagen.
export const extraerLinkDeMaps = (texto) => {
  const match = texto?.match(REGEX_URL);
  if (!match) return null;
  try {
    return MAPS_HOSTS.has(new URL(match[0]).hostname.toLowerCase()) ? match[0] : null;
  } catch {
    return null;
  }
};

// Tarjeta de vista previa de ubicación (mapa embebido + link a Google Maps),
// compartida entre la ubicación nativa de WhatsApp y un link de Maps pegado
// como texto (ver MapsLinkPreview) para que se vean idénticas.
export const LocationCard = ({ lat, lng, label, senderType }) => (
  <div
    onClick={() => { window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer'); }}
    className="mb-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity w-64 max-w-full"
    title="Abrir ubicación en Google Maps"
  >
    {/* El iframe de OpenStreetMap trae su propia franja de atribución
        anclada al fondo del documento embebido; como es de otro origen
        no podemos aplicarle CSS para ocultarla, así que lo agrandamos y
        lo corremos hacia arriba dentro de un contenedor más bajo con
        overflow:hidden, recortando esa franja fuera del área visible. */}
    <div className="h-32 w-full overflow-hidden relative bg-gray-100 dark:bg-gray-700">
      <iframe
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01}%2C${lat - 0.01}%2C${lng + 0.01}%2C${lat + 0.01}&marker=${lat}%2C${lng}`}
        className="absolute top-0 left-0 w-full border-0 pointer-events-none"
        style={{ height: 'calc(100% + 70px)' }}
        loading="lazy"
        title="Vista previa de ubicación"
      />
    </div>
    <div className={`flex items-center gap-2 p-2 text-xs font-medium ${senderType === 'client' ? 'bg-gray-100 dark:bg-gray-800 text-teal-700 dark:text-teal-400' : 'bg-teal-600 text-white'}`}>
      <MapPin size={14} className="shrink-0" />
      <span className="truncate">{label || 'Ver ubicación en Google Maps'}</span>
    </div>
  </div>
);

// Un link de Maps pegado como texto no trae lat/lng en el propio mensaje (a
// diferencia de la ubicación nativa): hay que resolverlo contra el backend
// (GET /api/resolve-maps-url, ver server/routes/api.js), que reutiliza la
// misma lógica que ya usa el bot y sabe seguir la redirección de los links
// cortos (maps.app.goo.gl) — algo que el navegador no puede hacer por CORS.
// Mientras se resuelve (o si falla / no es realmente un link de Maps válido)
// se ve el texto plano de siempre, sin romper el mensaje.
const cacheLinksDeMaps = new Map();

export function MapsLinkPreview({ url, senderType, texto }) {
  const [coords, setCoords] = useState(() => (cacheLinksDeMaps.has(url) ? cacheLinksDeMaps.get(url) : undefined));

  useEffect(() => {
    if (coords !== undefined) return;
    let cancelado = false;
    adminFetch(`/api/resolve-maps-url?url=${encodeURIComponent(url)}`)
      .then(res => res.json())
      .then(({ coords: resueltas }) => {
        if (cancelado) return;
        cacheLinksDeMaps.set(url, resueltas || null);
        setCoords(resueltas || null);
      })
      .catch(() => {
        if (cancelado) return;
        cacheLinksDeMaps.set(url, null);
        setCoords(null);
      });
    return () => { cancelado = true; };
  }, [url, coords]);

  if (coords) {
    return <LocationCard lat={coords.lat} lng={coords.lng} senderType={senderType} />;
  }
  return <p className="text-sm whitespace-pre-wrap">{renderWhatsAppText(texto)}</p>;
}

// Renderiza un mensaje del chat (texto, imagen, video, documento, PDF o
// ubicación) exactamente igual en el chat en vivo, el historial completo del
// cliente y la galería multimedia, para que los tres lugares se vean y se
// comporten de forma idéntica.
export default function MessageBubble({ msg, onImageClick, onDownload, downloadingId, onTag, taggingId, statusIcon }) {
  const location = parseLocationMessage(msg);
  // Sólo tiene sentido buscar un link de Maps en mensajes de puro texto: si
  // ya hay un adjunto (imagen, documento, etc.), lo que diga message_text es
  // un caption y no debe tapar ese adjunto.
  const linkDeMaps = !location && !msg.media_url ? extraerLinkDeMaps(msg.message_text) : null;
  const showTagControls = msg.sender_type === 'client' && msg.media_url && msg.media_type !== 'location';
  return (
    <div className={`flex items-center gap-2 ${msg.sender_type === 'client' ? 'justify-start' : 'justify-end'}`}>
      <div className={`relative max-w-[75%] rounded-lg p-3 shadow-sm ${msg.sender_type === 'client' ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-none' : 'bg-teal-500 text-white rounded-tr-none'}`}>
        {msg.sender_type === 'bot' && <div className="text-[10px] font-bold uppercase opacity-70 mb-1">BOT</div>}
        {location && (
          <LocationCard lat={location.lat} lng={location.lng} label={location.name || location.address} senderType={msg.sender_type} />
        )}
        {msg.media_url && msg.media_type === 'image' && (
          <div
            className="mb-2 w-40 h-40 rounded overflow-hidden relative cursor-pointer group bg-gray-100 dark:bg-gray-700"
            onClick={() => { onImageClick && onImageClick(msg); }}
          >
            <img src={msg.media_url} alt="Media" className="w-full h-full object-cover" />
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
              onClick={() => { onDownload && onDownload(msg); }}
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
              onClick={() => { onDownload && onDownload(msg); }}
              disabled={downloadingId === msg.id}
              className={`mb-2 w-full flex items-center gap-2 p-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${msg.sender_type === 'client' ? 'bg-gray-100 dark:bg-gray-700 text-teal-700 dark:text-teal-400 hover:bg-gray-200 dark:hover:bg-gray-600' : 'bg-teal-600 text-white hover:bg-teal-700'}`}
           >
              {downloadingId === msg.id ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
              Descargar documento adjunto
              <Download size={14} className="ml-auto shrink-0" />
           </button>
        )}
        {msg.media_url && msg.media_type === 'pdf' && (
          <div className={`mb-2 rounded-lg border overflow-hidden ${msg.sender_type === 'client' ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950' : 'border-teal-400 bg-teal-600/20'}`}>
            <div className="flex items-center gap-2 p-2.5">
              <div className={`p-2 rounded-lg shrink-0 ${msg.sender_type === 'client' ? 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400' : 'bg-white/20 text-white'}`}>
                <FileText size={18} />
              </div>
              <span className={`text-sm font-medium truncate ${msg.sender_type === 'client' ? 'text-gray-800 dark:text-gray-100' : ''}`}>{msg.message_text || 'Documento PDF'}</span>
            </div>
            <div className={`flex flex-col border-t ${msg.sender_type === 'client' ? 'border-gray-200 dark:border-gray-700' : 'border-teal-400/50'}`}>
              <a
                href={msg.media_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${msg.sender_type === 'client' ? 'text-teal-700 dark:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-800' : 'text-white hover:bg-white/10'}`}
              >
                <Eye size={14} /> Visualizar
              </a>
              <div className={`h-px ${msg.sender_type === 'client' ? 'bg-gray-200 dark:bg-gray-700' : 'bg-teal-400/50'}`} />
              <button
                onClick={() => { onDownload && onDownload(msg); }}
                disabled={downloadingId === msg.id}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${msg.sender_type === 'client' ? 'text-teal-700 dark:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-800' : 'text-white hover:bg-white/10'}`}
              >
                {downloadingId === msg.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Descargar
              </button>
            </div>
          </div>
        )}
        {msg.media_url && msg.media_type === 'audio' && (
          <div className="mb-2 flex items-center gap-1.5">
            <audio controls preload="metadata" src={msg.media_url} className="max-w-full h-10" style={{ width: 230 }} />
            <button
              onClick={() => { onDownload && onDownload(msg); }}
              disabled={downloadingId === msg.id}
              title="Descargar audio"
              className={`p-2 rounded-full transition-colors disabled:opacity-50 shrink-0 ${msg.sender_type === 'client' ? 'text-gray-500 hover:bg-gray-100' : 'text-white/90 hover:bg-white/10'}`}
            >
              {downloadingId === msg.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            </button>
          </div>
        )}
        {msg.media_type === 'blocked_pdf' && (
          <div className="mb-2 flex items-start gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400">
            <ShieldAlert size={18} className="shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold block mb-0.5">PDF bloqueado por seguridad</span>
              No se guardó el archivo: el análisis detectó contenido potencialmente malicioso.
            </div>
          </div>
        )}
        {!location && msg.media_type !== 'pdf' && msg.media_type !== 'audio' && (
          linkDeMaps ? (
            <MapsLinkPreview url={linkDeMaps} senderType={msg.sender_type} texto={msg.message_text} />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{renderWhatsAppText(msg.message_text)}</p>
          )
        )}
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className={`text-[10px] ${msg.sender_type === 'client' ? 'text-gray-400' : 'text-teal-100'}`}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {statusIcon}
        </div>
        {msg.reaction_emoji && (
          <span
            className={`absolute -bottom-2 ${msg.sender_type === 'client' ? 'right-2' : 'left-2'} bg-white dark:bg-gray-800 rounded-full shadow px-1 text-sm border border-gray-200 dark:border-gray-600 leading-none`}
            title="Reacción del cliente"
          >
            {msg.reaction_emoji}
          </span>
        )}
      </div>
      {showTagControls && (
        <AttachmentTagControls msg={msg} onTag={onTag} tagging={taggingId === msg.id} />
      )}
    </div>
  );
}
