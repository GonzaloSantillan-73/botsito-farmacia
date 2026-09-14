import React, { useState, useEffect } from 'react';
import { Users, Search, ArrowLeft, ArrowUpDown, History, List } from 'lucide-react';
import { formatPhone } from '../lib/formatPhone';
import { isAdminRole, adminFetch } from '../lib/adminAuth';
import { ESTADOS_HISTORIAL } from './Sidebar';
import ClientHistoryList from './ClientHistoryList';
import StarRating from './StarRating';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Fecha (más reciente)' },
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'interactions', label: 'Interacciones (más primero)' },
  { value: 'rating', label: 'Calificación (mejor primero)', adminOnly: true }
];

const ordenarClientes = (clients, sortBy) => {
  const sorted = [...clients];
  switch (sortBy) {
    case 'name':
      return sorted.sort((a, b) => (a.real_name || a.client_name || '').localeCompare(b.real_name || b.client_name || ''));
    case 'interactions':
      return sorted.sort((a, b) => b.total - a.total);
    case 'rating':
      return sorted.sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1));
    case 'recent':
    default:
      return sorted.sort((a, b) => new Date(b.lastContact) - new Date(a.lastContact));
  }
};

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Agrupa las conversaciones (una fila por consulta) en un directorio de
// clientes únicos por teléfono, con sus métricas agregadas.
const groupByClient = (conversations) => {
  const map = new Map();

  for (const c of conversations) {
    if (!c.client_phone) continue;
    if (!map.has(c.client_phone)) {
      map.set(c.client_phone, { client_phone: c.client_phone, client_name: c.client_name, real_name: c.real_name, conversations: [] });
    }
    const entry = map.get(c.client_phone);
    entry.conversations.push(c);
    if (!entry.real_name && c.real_name) entry.real_name = c.real_name;
    if (!entry.client_name && c.client_name) entry.client_name = c.client_name;
  }

  return Array.from(map.values())
    .map(entry => {
      const sorted = [...entry.conversations].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const rated = entry.conversations.filter(c => c.rating != null);
      const avgRating = rated.length > 0 ? rated.reduce((sum, c) => sum + c.rating, 0) / rated.length : null;
      const ratedProduct = entry.conversations.filter(c => c.product_rating != null);
      const avgProductRating = ratedProduct.length > 0 ? ratedProduct.reduce((sum, c) => sum + c.product_rating, 0) / ratedProduct.length : null;
      return {
        ...entry,
        conversations: sorted,
        total: entry.conversations.length,
        avgRating,
        avgProductRating,
        lastContact: sorted[0]?.created_at
      };
    })
    .sort((a, b) => new Date(b.lastContact) - new Date(a.lastContact));
};

export default function ClientDirectory({ onOpenConversation, initialSelectedPhone = null }) {
  console.log('🔍 [DEBUG-COMPONENT-ClientDirectory] Render — props:', { onOpenConversation, initialSelectedPhone });
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPhone, setSelectedPhone] = useState(initialSelectedPhone);
  const [sortBy, setSortBy] = useState('recent');
  // Sub-pestaña de la vista general (no aplica a la ficha de un cliente
  // puntual): arranca en el historial de consultas, como pidió el negocio.
  const [vista, setVista] = useState('historial');

  const soyStaff = !isAdminRole();
  // La calificación individual de un cliente (o el promedio de sus consultas)
  // es información sensible que solo un admin debe poder ver acá; un operador
  // o sucursal común no la ve ni en la tabla ni en la ficha de detalle.
  const sortOptions = soyStaff ? SORT_OPTIONS.filter(o => !o.adminOnly) : SORT_OPTIONS;

  useEffect(() => {
    console.log('🔄 [DEBUG-COMPONENT-ClientDirectory] useEffect (fetch conversations) disparado — deps: [] (solo al montar)');
    // El filtrado por sucursal para el staff lo aplica el backend a partir
    // del sucursalId del JWT (ver server/routes/clientDirectory.js): acá no
    // se manda ni se puede forzar ninguna sucursal, evitando fugas entre
    // sucursales aunque se manipule el request.
    console.log('📡 [DEBUG-COMPONENT-ClientDirectory] adminFetch → GET /api/admin/client-directory/conversations');
    adminFetch('/api/admin/client-directory/conversations')
      .then(res => res.json())
      .then(({ conversations: data, error }) => {
        console.log('📡 [DEBUG-COMPONENT-ClientDirectory] respuesta /api/admin/client-directory/conversations:', { cantidad: data?.length, error });
        if (!error) {
          console.log('🔄 [DEBUG-COMPONENT-ClientDirectory] setConversations — nuevo valor (cantidad):', (data || []).length);
          setConversations(data || []);
        } else {
          console.error('❌ [DEBUG-COMPONENT-ClientDirectory] error recibido del backend:', error);
        }
        console.log('🔄 [DEBUG-COMPONENT-ClientDirectory] setLoading — nuevo valor: false');
        setLoading(false);
      })
      .catch((err) => {
        console.error('❌ [DEBUG-COMPONENT-ClientDirectory] excepción en fetch conversations:', err);
        setLoading(false);
      });
  }, []);

  const historialConsultas = conversations
    .filter(c => c?.client_phone && ESTADOS_HISTORIAL.includes(c.status));

  const clients = groupByClient(conversations.filter(c => c?.client_phone));

  const filteredClients = clients.filter(cl => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (cl.real_name || cl.client_name)?.toLowerCase().includes(q) || cl.client_phone?.toLowerCase().includes(q);
  });

  const sortedClients = ordenarClientes(filteredClients, sortBy);

  const selectedClient = selectedPhone ? clients.find(c => c.client_phone === selectedPhone) : null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f0f2f5] text-gray-400 dark:text-gray-500 text-sm">
        Cargando directorio de clientes...
      </div>
    );
  }

  // --- Vista de detalle de un cliente ---
  if (selectedClient) {
    console.log('🔍 [DEBUG-COMPONENT-ClientDirectory] Abriendo ficha de cliente — client_phone:', selectedClient.client_phone, 'total:', selectedClient.total);
    return (
      <div className="flex-1 flex flex-col bg-[#f0f2f5] overflow-hidden">
        <div className="px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
          <button onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-ClientDirectory] handleBack() — volviendo a la lista general'); setSelectedPhone(null); }} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 truncate">{selectedClient.real_name || selectedClient.client_name || formatPhone(selectedClient.client_phone)}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatPhone(selectedClient.client_phone)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
          <div className={`grid ${soyStaff ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'} gap-3 mb-6`}>
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{selectedClient.total}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mt-1">Interacciones</div>
            </div>
            {!soyStaff && (
              <>
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-2xl font-bold">
                    {selectedClient.avgRating != null ? (
                      <StarRating value={selectedClient.avgRating.toFixed(1)} type="atencion" size={16} className="text-2xl font-bold" />
                    ) : (
                      <span className="text-gray-900 dark:text-gray-100">—</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mt-1">Calificación de atención</div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-2xl font-bold">
                    {selectedClient.avgProductRating != null ? (
                      <StarRating value={selectedClient.avgProductRating.toFixed(1)} type="producto" size={16} className="text-2xl font-bold" />
                    ) : (
                      <span className="text-gray-900 dark:text-gray-100">—</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mt-1">Calificación de producto</div>
                </div>
              </>
            )}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatDateTime(selectedClient.lastContact)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mt-1">Último contacto</div>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Historial de consultas</h3>
          <ClientHistoryList
            conversations={selectedClient.conversations}
            onSelect={(conv) => { console.log('🖱️ [DEBUG-COMPONENT-ClientDirectory] onSelect (ficha cliente) — conversation id:', conv?.id); onOpenConversation && onOpenConversation(conv); }}
            emptyMessage="Este cliente todavía no tiene consultas."
          />
        </div>
      </div>
    );
  }

  // --- Vista de lista general ---
  return (
    <div className="flex-1 flex flex-col bg-[#f0f2f5] overflow-hidden">
      <div className="px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
          <Users size={20} className="text-teal-600 dark:text-teal-400" /> Directorio de Clientes
        </h2>

        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 gap-1 w-fit mb-3">
          <button
            onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-ClientDirectory] handleVista — cambiando vista a: historial'); setVista('historial'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vista === 'historial' ? 'bg-white dark:bg-gray-900 text-teal-700 dark:text-teal-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <History size={14} /> Historial de Consultas
          </button>
          <button
            onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-ClientDirectory] handleVista — cambiando vista a: lista'); setVista('lista'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vista === 'lista' ? 'bg-white dark:bg-gray-900 text-teal-700 dark:text-teal-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <List size={14} /> Lista de Clientes
          </button>
        </div>

        {vista === 'lista' && (
          <div className="flex items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => { console.log('🖱️ [DEBUG-COMPONENT-ClientDirectory] handleSearchChange — nuevo texto:', e.target.value); setSearch(e.target.value); }}
                placeholder="Buscar por nombre o teléfono..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
              <Search className="absolute left-3 top-2.5 text-gray-400 dark:text-gray-500" size={16} />
            </div>
            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => { console.log('🖱️ [DEBUG-COMPONENT-ClientDirectory] handleSortChange — nuevo sortBy:', e.target.value); setSortBy(e.target.value); }}
                className="pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 appearance-none"
              >
                {console.log('🔍 [DEBUG-COMPONENT-ClientDirectory] render sortOptions.map — cantidad:', sortOptions.length)}
                {sortOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ArrowUpDown className="absolute left-2.5 top-2.5 text-gray-400 dark:text-gray-500 pointer-events-none" size={16} />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {vista === 'historial' ? (
          <ClientHistoryList
            conversations={historialConsultas}
            onSelect={(conv) => { console.log('🖱️ [DEBUG-COMPONENT-ClientDirectory] onSelect (historial general) — conversation id:', conv?.id); onOpenConversation && onOpenConversation(conv); }}
            emptyMessage="Todavía no hay consultas finalizadas."
            showClient
          />
        ) : sortedClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <Users size={48} className="mb-3 text-gray-300" />
            <p className="text-sm">No se encontraron clientes.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Último contacto</th>
                  <th className="px-4 py-3 font-medium text-center">Interacciones</th>
                  {!soyStaff && <th className="px-4 py-3 font-medium text-center">Atención</th>}
                  {!soyStaff && <th className="px-4 py-3 font-medium text-center">Producto</th>}
                </tr>
              </thead>
              <tbody>
                {console.log('🔍 [DEBUG-COMPONENT-ClientDirectory] render sortedClients.map — cantidad:', sortedClients.length)}
                {sortedClients.map(cl => (
                  <tr
                    key={cl.client_phone}
                    onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-ClientDirectory] handleRowClick — client_phone:', cl.client_phone); setSelectedPhone(cl.client_phone); }}
                    className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-teal-50/40 dark:hover:bg-teal-950/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{cl.real_name || cl.client_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatPhone(cl.client_phone)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{new Date(cl.lastContact).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{cl.total}</td>
                    {!soyStaff && (
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {cl.avgRating != null ? (
                          <StarRating value={cl.avgRating.toFixed(1)} type="atencion" size={12} className="font-medium" />
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">Sin datos</span>
                        )}
                      </td>
                    )}
                    {!soyStaff && (
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {cl.avgProductRating != null ? (
                          <StarRating value={cl.avgProductRating.toFixed(1)} type="producto" size={12} className="font-medium" />
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">Sin datos</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
