import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, History, Clock, FileText, Search, CalendarRange, ArrowUpDown, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isAdminRole, getStaffSucursalId } from '../lib/adminAuth';

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
      ? <mark key={i} className="bg-amber-200 text-gray-900 rounded px-0.5">{part}</mark>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
};

export default function HistoryPanel({ clientPhone, clientName, currentConversationId, onClose }) {
  const soyStaff = !isAdminRole();
  const miSucursalId = getStaffSucursalId();

  const [pastConversations, setPastConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState(null);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchingIds, setMatchingIds] = useState(null); // null = sin búsqueda activa
  const [snippets, setSnippets] = useState({}); // conversation_id -> mensaje que matcheó la búsqueda
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('client_phone', clientPhone)
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Un empleado no debe ver, ni siquiera acá, las consultas de otra sucursal.
        const visibles = data.filter(c =>
          c.id !== currentConversationId && (!soyStaff || !c.sucursal_id || c.sucursal_id === miSucursalId)
        );
        setPastConversations(visibles);
      }
      setLoading(false);
    };

    if (clientPhone) fetchHistory();
  }, [clientPhone, currentConversationId]);

  // Búsqueda de contenido: revisa los mensajes de todas las consultas pasadas
  // de este cliente y marca cuáles la contienen, sin recargar toda la vista.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || pastConversations.length === 0) {
      setMatchingIds(null);
      setSnippets({});
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    let cancelled = false;
    supabase
      .from('messages')
      .select('conversation_id, message_text, created_at')
      .in('conversation_id', pastConversations.map(c => c.id))
      .ilike('message_text', `%${q}%`)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) {
          const ids = new Set();
          const snip = {};
          for (const m of data || []) {
            ids.add(m.conversation_id);
            // Nos quedamos con la primera coincidencia por conversación, para
            // mostrar en la lista justo el fragmento que explica el resultado.
            if (!snip[m.conversation_id]) snip[m.conversation_id] = m.message_text;
          }
          setMatchingIds(ids);
          setSnippets(snip);
        }
        setSearchLoading(false);
      });
    return () => { cancelled = true; };
  }, [searchQuery, pastConversations]);

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

  const dentroDeFecha = (conv) => {
    if (!dateFrom && !dateTo) return true;
    const t = new Date(conv.created_at).getTime();
    if (dateFrom && t < new Date(dateFrom).getTime()) return false;
    if (dateTo && t > new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
    return true;
  };

  const hayFiltrosActivos = Boolean(dateFrom || dateTo || searchQuery.trim());
  const limpiarFiltros = () => { setDateFrom(''); setDateTo(''); setSearchQuery(''); };

  const visibleConversations = pastConversations
    .filter(dentroDeFecha)
    .filter(c => !searchQuery.trim() || matchingIds == null || matchingIds.has(c.id))
    .sort((a, b) => sortAsc
      ? new Date(a.created_at) - new Date(b.created_at)
      : new Date(b.created_at) - new Date(a.created_at));

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[82vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-bold">
            <History size={20} className="text-teal-600" />
            Historial de consultas{clientName ? ` — ${clientName}` : ''}
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Panel izquierdo: bandeja de sesiones pasadas, estilo lista de WhatsApp */}
          <div className="w-[340px] shrink-0 border-r border-gray-200 flex flex-col overflow-hidden bg-gray-50">
            <div className="p-3 border-b border-gray-200 bg-white space-y-2 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar en los mensajes..."
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
                {searchLoading ? (
                  <Loader2 size={14} className="absolute left-2.5 top-2 text-gray-400 animate-spin" />
                ) : (
                  <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <CalendarRange size={14} className="text-gray-400 shrink-0" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 rounded-lg text-[11px] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
                <span className="text-gray-300 text-xs">–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 rounded-lg text-[11px] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSortAsc(v => !v)}
                  className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-teal-700 transition-colors"
                >
                  <ArrowUpDown size={12} /> {sortAsc ? 'Más antiguas primero' : 'Más recientes primero'}
                </button>
                {hayFiltrosActivos && (
                  <button onClick={limpiarFiltros} className="text-[11px] font-medium text-teal-700 hover:text-teal-800">
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="text-center text-gray-400 py-10 text-sm">Cargando historial...</div>
              ) : pastConversations.length === 0 ? (
                <div className="text-center text-gray-400 py-10 flex flex-col items-center gap-2 px-4">
                  <Clock size={32} className="text-gray-300" />
                  <span className="text-sm">Este cliente no tiene consultas anteriores.</span>
                </div>
              ) : visibleConversations.length === 0 ? (
                <div className="text-center text-gray-400 py-10 text-sm px-4">
                  Ninguna consulta coincide con el filtro aplicado.
                </div>
              ) : (
                visibleConversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`w-full text-left p-3 border-b border-gray-100 transition-colors flex items-start justify-between gap-2 ${
                      selectedConv?.id === conv.id ? 'bg-teal-50' : 'bg-white hover:bg-teal-50/50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-gray-500 mb-1">
                        {new Date(conv.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-sm text-gray-700 truncate">
                        {searchQuery.trim() && snippets[conv.id]
                          ? highlightMatches(snippets[conv.id], searchQuery)
                          : conv.last_message
                            ? (searchQuery.trim() ? highlightMatches(conv.last_message, searchQuery) : conv.last_message)
                            : <span className="italic text-gray-400">Sin mensajes</span>}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0 uppercase font-medium whitespace-nowrap">
                      {STATUS_LABELS[conv.status] || conv.status}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Panel derecho: transcripción de la sesión elegida, liviana y de solo lectura */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f2f5]">
            {!selectedConv ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <History size={40} className="mb-3 text-gray-300" />
                <p className="text-sm">Elegí una consulta de la izquierda para ver los mensajes.</p>
              </div>
            ) : loadingMessages ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Cargando mensajes...</div>
            ) : selectedMessages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Esta consulta no tiene mensajes.</div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {selectedMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_type === 'client' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${msg.sender_type === 'client' ? 'bg-white text-gray-800' : 'bg-teal-500 text-white'}`}>
                      {msg.sender_type === 'bot' && <div className="text-[10px] font-bold uppercase opacity-70 mb-1">BOT</div>}
                      {msg.media_url && msg.media_type === 'image' && (
                        <img src={msg.media_url} alt="Media" className="mb-1.5 max-w-full h-auto object-cover rounded" />
                      )}
                      {msg.media_url && (msg.media_type === 'document' || msg.media_type === 'pdf') && (
                        <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className={`mb-1.5 flex items-center gap-2 p-2 rounded-lg text-sm hover:underline ${msg.sender_type === 'client' ? 'bg-gray-100 text-teal-700' : 'bg-teal-600 text-white'}`}>
                          <FileText size={16} />
                          Ver documento adjunto
                        </a>
                      )}
                      <p className="whitespace-pre-wrap">
                        {searchQuery.trim() ? highlightMatches(msg.message_text, searchQuery) : msg.message_text}
                      </p>
                      <span className={`text-[10px] block mt-1 text-right ${msg.sender_type === 'client' ? 'text-gray-400' : 'text-teal-100'}`}>
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
