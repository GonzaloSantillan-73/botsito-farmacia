import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MessagesSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isAdminRole, getStaffSucursalId } from '../lib/adminAuth';
import { STATUS_BADGES } from './Sidebar';
import { downloadFile, filenameFromUrl } from '../lib/downloadFile';
import MessageBubble from './MessageBubble';

const esNombreArchivoValido = (texto) => /\.[a-z0-9]{2,5}$/i.test((texto || '').trim());

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

// Historial completo de un cliente: a diferencia de HistoryPanel (que muestra
// una consulta pasada a la vez, en un panel maestro-detalle), acá se listan
// TODOS los mensajes de TODAS sus conversaciones en un único scroll continuo,
// separados por fecha y, dentro de un mismo día, por cambio de consulta.
export default function FullChatModal({ clientPhone, clientName, setModalImage, onClose }) {
  const soyStaff = !isAdminRole();
  const miSucursalId = getStaffSucursalId();

  const [loading, setLoading] = useState(true);
  const [conversationsById, setConversationsById] = useState({});
  const [messages, setMessages] = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    const fetchTodo = async () => {
      setLoading(true);
      const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('client_phone', clientPhone)
        .order('created_at', { ascending: true });

      if (convError || !convs) {
        setMessages([]);
        setLoading(false);
        return;
      }

      // Un empleado no debe ver, ni siquiera acá, las consultas de otra sucursal.
      const visibles = convs.filter(c => !soyStaff || !c.sucursal_id || c.sucursal_id === miSucursalId);
      setConversationsById(Object.fromEntries(visibles.map(c => [c.id, c])));

      const ids = visibles.map(c => c.id);
      if (ids.length === 0) {
        setMessages([]);
        setLoading(false);
        return;
      }

      const { data: msgs, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', ids)
        .order('created_at', { ascending: true });

      setMessages(!msgError && msgs ? msgs : []);
      setLoading(false);
    };

    if (clientPhone) fetchTodo();
  }, [clientPhone]);

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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-bold">
            <MessagesSquare size={20} className="text-teal-600" />
            Todo el chat{clientName ? ` — ${clientName}` : ''}
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-[#efeae2]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">Cargando historial completo...</div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">Este cliente todavía no tiene mensajes.</div>
          ) : (
            messages.map((msg, i) => {
              const anterior = messages[i - 1];
              const conv = conversationsById[msg.conversation_id];
              const cambioDeDia = !anterior || !mismoDia(new Date(anterior.created_at), new Date(msg.created_at));
              const cambioDeSesion = !cambioDeDia && anterior && msg.conversation_id !== anterior.conversation_id;

              return (
                <React.Fragment key={msg.id}>
                  {cambioDeDia && (
                    <div className="flex justify-center my-3">
                      <span className="bg-white/95 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                        {formatDateDivider(msg.created_at)}
                      </span>
                    </div>
                  )}
                  {cambioDeSesion && (
                    <div className="flex items-center gap-2 my-4">
                      <div className="flex-1 h-px bg-gray-300/70" />
                      <span className="text-[11px] text-gray-500 font-medium px-1 flex items-center gap-1.5 whitespace-nowrap">
                        Nueva consulta
                        {conv && STATUS_BADGES[conv.status] && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGES[conv.status].className}`}>
                            {STATUS_BADGES[conv.status].label}
                          </span>
                        )}
                      </span>
                      <div className="flex-1 h-px bg-gray-300/70" />
                    </div>
                  )}
                  <MessageBubble
                    msg={msg}
                    onImageClick={(m) => setModalImage(m.media_url)}
                    onDownload={handleDownload}
                    downloadingId={downloadingId}
                  />
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
