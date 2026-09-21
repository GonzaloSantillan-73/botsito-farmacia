import React, { useState, useEffect } from 'react';
import { Search, CalendarRange, ArrowUpDown, Loader2, Clock, Store } from 'lucide-react';
import { STATUS_BADGES, SALE_STATUS_BADGES } from './Sidebar';
import { formatPhone } from '../lib/formatPhone';
import { adminFetch } from '../lib/adminAuth';
import { renderWhatsAppText } from '../lib/whatsappFormat';
import StarRating from './StarRating';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Secuencia COMPLETA de las sucursales que intervinieron en la consulta, en
// el orden real en que la tomaron o la recibieron por derivación (ver
// conversation_sucursal_historial.sql y withSucursalesHistorial en
// server/services/clientDirectory.js). Fallback a primera_sucursal_id /
// sucursal_id (sólo 2 puntos sueltos) para consultas viejas, de antes de que
// existiera esa tabla, que no tienen ninguna fila de historial registrada.
const nombresSucursales = (conv) => {
  if (Array.isArray(conv.sucursales_historial) && conv.sucursales_historial.length > 0) {
    return conv.sucursales_historial.map(s => s.nombre).filter(Boolean);
  }
  const primera = conv.sucursal_primera?.nombre;
  const actual = conv.sucursal_actual?.nombre;
  return [...new Set([primera, actual].filter(Boolean))];
};

// Resalta todas las apariciones del término buscado dentro de un texto, para
// que el operador ubique de un vistazo por qué esa consulta apareció.
const highlightMatches = (text, query) => {
  if (!query?.trim() || !text) return text;
  const q = query.trim();
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-amber-200 dark:bg-amber-950 text-gray-900 dark:text-gray-100 rounded px-0.5">{part}</mark>
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
    // La búsqueda se resuelve en el backend (ver
    // server/routes/clientDirectory.js), que vuelve a acotar estos
    // conversation_id a la sucursal del usuario antes de buscar: aunque este
    // componente reciba conversaciones de otra sucursal no debería pasar,
    // ningún empleado puede leer mensajes ajenos a la suya.
    adminFetch('/api/admin/client-directory/messages-search', {
      method: 'POST',
      body: JSON.stringify({ conversationIds: conversations.map(c => c.id), q })
    })
      .then(res => res.json())
      .then(({ matchingIds, snippets: snip, error }) => {
        if (cancelled) return;
        if (!error) {
          setMatchingIds(new Set(matchingIds || []));
          setSnippets(snip || {});
        } else {
          console.error('❌ [DEBUG-COMPONENT-ClientHistoryList] error recibido del backend en messages-search:', error);
        }
        setSearchLoading(false);
      })
      .catch((err) => { console.error('❌ [DEBUG-COMPONENT-ClientHistoryList] excepción en messages-search:', err); if (!cancelled) setSearchLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, conversations]);

  const dentroDeFecha = (conv) => {
    if (!dateFrom && !dateTo) return true;
    const t = new Date(conv.created_at).getTime();
    if (dateFrom && t < new Date(dateFrom).getTime()) return false;
    if (dateTo && t > new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
    return true;
  };

  const hayFiltrosActivos = Boolean(dateFrom || dateTo || searchQuery.trim());
  const limpiarFiltros = () => {
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
  };

  const visibleConversations = conversations
    .filter(dentroDeFecha)
    .filter(c => !searchQuery.trim() || matchingIds == null || matchingIds.has(c.id))
    .sort((a, b) => sortAsc
      ? new Date(a.created_at) - new Date(b.created_at)
      : new Date(b.created_at) - new Date(a.created_at));

  return (
    <div className={fillHeight ? 'h-full flex flex-col overflow-hidden' : 'flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'}>
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 space-y-2 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); }}
            placeholder="Buscar en los mensajes..."
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
          {searchLoading ? (
            <Loader2 size={14} className="absolute left-2.5 top-2 text-gray-400 dark:text-gray-500 animate-spin" />
          ) : (
            <Search size={14} className="absolute left-2.5 top-2 text-gray-400 dark:text-gray-500" />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <CalendarRange size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); }}
            className="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-[11px] bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
          <span className="text-gray-300 text-xs">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); }}
            className="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-[11px] bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setSortAsc(v => { return !v; })}
            className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
          >
            <ArrowUpDown size={12} /> {sortAsc ? 'Más antiguas primero' : 'Más recientes primero'}
          </button>
          {hayFiltrosActivos && (
            <button onClick={limpiarFiltros} className="text-[11px] font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className={fillHeight ? 'flex-1 overflow-y-auto scrollbar-thin' : ''}>
        {loading ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-10 text-sm">Cargando historial...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-10 flex flex-col items-center gap-2 px-4">
            <Clock size={32} className="text-gray-300" />
            <span className="text-sm">{emptyMessage}</span>
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 py-10 text-sm px-4">
            Ninguna consulta coincide con el filtro aplicado.
          </div>
        ) : (
          visibleConversations.map(conv => {
            const badge = STATUS_BADGES[conv.status];
            const saleBadge = SALE_STATUS_BADGES[conv.sale_status];
            const sucursales = nombresSucursales(conv);
            return (
              <button
                key={conv.id}
                onClick={() => { onSelect && onSelect(conv); }}
                className={`w-full text-left p-3 border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors flex items-start justify-between gap-2 ${
                  selectedId === conv.id ? 'bg-teal-50 dark:bg-teal-950' : 'bg-white dark:bg-gray-900 hover:bg-teal-50/50 dark:hover:bg-teal-950/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  {showClient && (
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {conv.real_name || conv.client_name || formatPhone(conv.client_phone)}
                      {(conv.real_name || conv.client_name) && <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1">({formatPhone(conv.client_phone)})</span>}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                    {new Date(conv.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {searchQuery.trim() && snippets[conv.id]
                      ? highlightMatches(snippets[conv.id], searchQuery)
                      : conv.last_message
                        ? (searchQuery.trim() ? highlightMatches(conv.last_message, searchQuery) : renderWhatsAppText(conv.last_message, { singleLine: true }))
                        : <span className="italic text-gray-400 dark:text-gray-500">Sin mensajes</span>}
                  </div>
                  {sucursales.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <Store size={11} className="text-gray-400 dark:text-gray-500 shrink-0" />
                      <span className="truncate">
                        {sucursales.join(' → ')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {conv.rating != null && (
                    <StarRating value={conv.rating} type="atencion" size={12} className="text-xs font-medium" />
                  )}
                  {conv.product_rating != null && (
                    <StarRating value={conv.product_rating} type="producto" size={12} className="text-xs font-medium" />
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
