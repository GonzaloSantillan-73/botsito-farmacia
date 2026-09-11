import React, { useState, useEffect } from 'react';
import { Search, CalendarRange, ArrowUpDown, Loader2, Clock, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { STATUS_BADGES, SALE_STATUS_BADGES } from './Sidebar';
import { formatPhone } from '../lib/formatPhone';
import { isAdminRole } from '../lib/adminAuth';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Resalta todas las apariciones del término buscado dentro de un texto, para
// que el operador ubique de un vistazo por qué esa consulta apareció.
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

// Lista de consultas pasadas de un cliente, con búsqueda de contenido, filtro
// de rango de fechas y ordenamiento por fecha. La usan tanto el modal de
// Historial (HistoryPanel, dentro de un chat activo) como la ficha de
// cliente del Directorio, para que ambas vistas compartan exactamente las
// mismas herramientas y el mismo diseño.
//
// `fillHeight`: true cuando el host ya reserva un alto fijo y scrollea por su
// cuenta (el modal de Historial); false cuando el componente vive en el flujo
// normal de una página y debe aportar su propia tarjeta (ficha del Directorio).
export default function ClientHistoryList({
  conversations,
  selectedId,
  onSelect,
  loading = false,
  emptyMessage = 'Este cliente no tiene consultas anteriores.',
  fillHeight = false,
  searchQuery: controlledQuery,
  onSearchQueryChange,
  // true en la vista general (Historial de Consultas del Directorio), donde
  // cada fila puede ser de un cliente distinto y hace falta identificarlo.
  showClient = false
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // El término de búsqueda puede vivir acá adentro (Directorio) o ser
  // controlado por el padre (HistoryPanel, que también lo usa para resaltar
  // coincidencias en la transcripción del panel derecho).
  const [internalQuery, setInternalQuery] = useState('');
  const searchQuery = controlledQuery !== undefined ? controlledQuery : internalQuery;
  const setSearchQuery = (value) => {
    if (onSearchQueryChange) onSearchQueryChange(value);
    if (controlledQuery === undefined) setInternalQuery(value);
  };
  const [matchingIds, setMatchingIds] = useState(null); // null = sin búsqueda activa
  const [snippets, setSnippets] = useState({}); // conversation_id -> mensaje que matcheó la búsqueda
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || conversations.length === 0) {
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
      .in('conversation_id', conversations.map(c => c.id))
      .ilike('message_text', `%${q}%`)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) {
          const ids = new Set();
          const snip = {};
          for (const m of data || []) {
            ids.add(m.conversation_id);
            if (!snip[m.conversation_id]) snip[m.conversation_id] = m.message_text;
          }
          setMatchingIds(ids);
          setSnippets(snip);
        }
        setSearchLoading(false);
      });
    return () => { cancelled = true; };
  }, [searchQuery, conversations]);

  const dentroDeFecha = (conv) => {
    if (!dateFrom && !dateTo) return true;
    const t = new Date(conv.created_at).getTime();
    if (dateFrom && t < new Date(dateFrom).getTime()) return false;
    if (dateTo && t > new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
    return true;
  };

  const hayFiltrosActivos = Boolean(dateFrom || dateTo || searchQuery.trim());
  const limpiarFiltros = () => { setDateFrom(''); setDateTo(''); setSearchQuery(''); };

  const visibleConversations = conversations
    .filter(dentroDeFecha)
    .filter(c => !searchQuery.trim() || matchingIds == null || matchingIds.has(c.id))
    .sort((a, b) => sortAsc
      ? new Date(a.created_at) - new Date(b.created_at)
      : new Date(b.created_at) - new Date(a.created_at));

  return (
    <div className={fillHeight ? 'h-full flex flex-col overflow-hidden' : 'flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden'}>
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

      <div className={fillHeight ? 'flex-1 overflow-y-auto' : ''}>
        {loading ? (
          <div className="text-center text-gray-400 py-10 text-sm">Cargando historial...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-gray-400 py-10 flex flex-col items-center gap-2 px-4">
            <Clock size={32} className="text-gray-300" />
            <span className="text-sm">{emptyMessage}</span>
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-sm px-4">
            Ninguna consulta coincide con el filtro aplicado.
          </div>
        ) : (
          visibleConversations.map(conv => {
            const badge = STATUS_BADGES[conv.status];
            const saleBadge = SALE_STATUS_BADGES[conv.sale_status];
            return (
              <button
                key={conv.id}
                onClick={() => onSelect && onSelect(conv)}
                className={`w-full text-left p-3 border-b border-gray-100 last:border-0 transition-colors flex items-start justify-between gap-2 ${
                  selectedId === conv.id ? 'bg-teal-50' : 'bg-white hover:bg-teal-50/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  {showClient && (
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {conv.real_name || conv.client_name || formatPhone(conv.client_phone)}
                      {(conv.real_name || conv.client_name) && <span className="text-xs font-normal text-gray-400 ml-1">({formatPhone(conv.client_phone)})</span>}
                    </div>
                  )}
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
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {/* La calificación individual de un cliente solo la ve un admin;
                      a un operador/sucursal común no se le muestra (ver Métricas
                      para el promedio agregado, que sí está disponible para todos). */}
                  {isAdminRole() && conv.rating != null && (
                    <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
                      {conv.rating} <Star size={12} className="text-amber-400 fill-amber-400" />
                    </span>
                  )}
                  {badge && <span className={`text-[10px] font-medium px-2 py-0.5 rounded whitespace-nowrap ${badge.className}`}>{badge.label}</span>}
                  {saleBadge && <span className={`text-[10px] font-medium px-2 py-0.5 rounded whitespace-nowrap ${saleBadge.className}`}>{saleBadge.label}</span>}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
