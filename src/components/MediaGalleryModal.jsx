import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Images, FileText, Film, Link2, Loader2, Download, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isAdminRole, getStaffSucursalId } from '../lib/adminAuth';
import { downloadFile, filenameFromUrl } from '../lib/downloadFile';

const esNombreArchivoValido = (texto) => /\.[a-z0-9]{2,5}$/i.test((texto || '').trim());

// La base no distingue "enlace" como media_type propio (solo hay text/image/
// video/document/pdf/location): un link compartido llega como un mensaje de
// texto normal, así que lo detectamos con esta regex sobre message_text.
const URL_REGEX = /https?:\/\/[^\s]+/i;

const FILTERS = [
  { key: 'todo', label: 'Todo' },
  { key: 'image', label: 'Imágenes' },
  { key: 'video', label: 'Videos' },
  { key: 'documento', label: 'Documentos' },
  { key: 'link', label: 'Enlaces' }
];

// Clasifica cada mensaje en el filtro al que pertenece la galería (o null si
// no es contenido compartido y no debe aparecer acá).
const clasificar = (msg) => {
  if (msg.media_type === 'image') return 'image';
  if (msg.media_type === 'video') return 'video';
  if (msg.media_type === 'document' || msg.media_type === 'pdf') return 'documento';
  if (msg.media_type === 'text' || !msg.media_type) {
    return URL_REGEX.test(msg.message_text || '') ? 'link' : null;
  }
  return null;
};

export default function MediaGalleryModal({ clientPhone, clientName, setModalImage, onClose }) {
  const soyStaff = !isAdminRole();
  const miSucursalId = getStaffSucursalId();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('todo');
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    const fetchMedia = async () => {
      setLoading(true);
      const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('id, sucursal_id')
        .eq('client_phone', clientPhone);

      if (convError || !convs) {
        setItems([]);
        setLoading(false);
        return;
      }

      const ids = convs
        .filter(c => !soyStaff || !c.sucursal_id || c.sucursal_id === miSucursalId)
        .map(c => c.id);

      if (ids.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: msgs, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false });

      const clasificados = (!msgError && msgs ? msgs : [])
        .map(msg => ({ msg, tipo: clasificar(msg) }))
        .filter(item => item.tipo !== null);

      setItems(clasificados);
      setLoading(false);
    };

    if (clientPhone) fetchMedia();
  }, [clientPhone]);

  const visibles = useMemo(
    () => (filter === 'todo' ? items : items.filter(item => item.tipo === filter)),
    [items, filter]
  );

  const counts = useMemo(() => {
    const c = { todo: items.length, image: 0, video: 0, documento: 0, link: 0 };
    items.forEach(item => { c[item.tipo] += 1; });
    return c;
  }, [items]);

  const handleDownload = async (msg) => {
    setDownloadingId(msg.id);
    const nombre = esNombreArchivoValido(msg.message_text) ? msg.message_text.trim() : filenameFromUrl(msg.media_url);
    const resultado = await downloadFile(msg.media_url, nombre);
    if (!resultado.ok) {
      alert('No se pudo descargar el archivo directamente. Se abrió en una pestaña nueva: desde ahí podés guardarlo con Ctrl+S o clic derecho → "Guardar como".');
    }
    setDownloadingId(null);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-bold">
            <Images size={20} className="text-teal-600" />
            Archivos compartidos{clientName ? ` — ${clientName}` : ''}
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-5 py-3 border-b border-gray-200 shrink-0 overflow-x-auto">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === f.key ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label} {counts[f.key] > 0 && <span className="opacity-75">({counts[f.key]})</span>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm gap-2">
              <Loader2 size={18} className="animate-spin" /> Cargando archivos...
            </div>
          ) : visibles.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              No hay {filter === 'todo' ? 'archivos compartidos' : 'contenido de este tipo'} con este cliente.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {visibles.map(({ msg, tipo }) => (
                <GalleryItem
                  key={msg.id}
                  msg={msg}
                  tipo={tipo}
                  onImageClick={() => setModalImage(msg.media_url)}
                  onDownload={() => handleDownload(msg)}
                  downloading={downloadingId === msg.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function GalleryItem({ msg, tipo, onImageClick, onDownload, downloading }) {
  const fecha = new Date(msg.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  if (tipo === 'image') {
    return (
      <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-white group aspect-square cursor-pointer" onClick={onImageClick}>
        <img src={msg.media_url} alt="Imagen compartida" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
        <span className="absolute bottom-1 right-1.5 text-[10px] font-medium text-white bg-black/50 px-1.5 py-0.5 rounded">{fecha}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
          disabled={downloading}
          title="Descargar imagen"
          className="absolute top-1.5 right-1.5 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
        >
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        </button>
      </div>
    );
  }

  if (tipo === 'video') {
    return (
      <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-black aspect-square group">
        <video src={msg.media_url} className="w-full h-full object-cover opacity-90" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="p-2.5 rounded-full bg-black/50 text-white">
            <Film size={20} />
          </div>
        </div>
        <span className="absolute bottom-1 right-1.5 text-[10px] font-medium text-white bg-black/50 px-1.5 py-0.5 rounded">{fecha}</span>
        <button
          onClick={onDownload}
          disabled={downloading}
          title="Descargar video"
          className="absolute top-1.5 right-1.5 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
        >
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        </button>
      </div>
    );
  }

  if (tipo === 'documento') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 flex flex-col gap-2 aspect-square">
        <div className="flex-1 flex items-center justify-center">
          <div className="p-3 rounded-lg bg-rose-50 text-rose-500">
            <FileText size={28} />
          </div>
        </div>
        <p className="text-xs font-medium text-gray-700 truncate" title={msg.message_text || 'Documento'}>
          {msg.message_text || 'Documento adjunto'}
        </p>
        <div className="flex items-center gap-1.5">
          <a
            href={msg.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <Eye size={12} /> Ver
          </a>
          <button
            onClick={onDownload}
            disabled={downloading}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Bajar
          </button>
        </div>
        <span className="text-[10px] text-gray-400 text-right">{fecha}</span>
      </div>
    );
  }

  // link
  const url = (msg.message_text.match(URL_REGEX) || [])[0];
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-gray-200 bg-white p-3 flex flex-col gap-2 aspect-square hover:border-teal-400 transition-colors"
    >
      <div className="flex-1 flex items-center justify-center">
        <div className="p-3 rounded-lg bg-sky-50 text-sky-500">
          <Link2 size={28} />
        </div>
      </div>
      <p className="text-xs font-medium text-sky-700 truncate" title={msg.message_text}>{msg.message_text}</p>
      <span className="text-[10px] text-gray-400 text-right">{fecha}</span>
    </a>
  );
}
