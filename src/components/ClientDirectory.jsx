import React, { useState, useEffect } from 'react';
import { Users, Search, Star, ArrowLeft, ArrowUpDown, History, List } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatPhone } from '../lib/formatPhone';
import { isAdminRole, getStaffSucursalId } from '../lib/adminAuth';
import { ESTADOS_HISTORIAL } from './Sidebar';
import ClientHistoryList from './ClientHistoryList';
import { withClientNames } from '../lib/clientUtils';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Fecha (más reciente)' },
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'interactions', label: 'Interacciones (más primero)' },
  { value: 'rating', label: 'Calificación (mejor primero)' }
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
      return {
        ...entry,
        conversations: sorted,
        total: entry.conversations.length,
        avgRating,
        lastContact: sorted[0]?.created_at
      };
    })
    .sort((a, b) => new Date(b.lastContact) - new Date(a.lastContact));
};

export default function ClientDirectory({ onOpenConversation, initialSelectedPhone = null }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPhone, setSelectedPhone] = useState(initialSelectedPhone);
  const [sortBy, setSortBy] = useState('recent');
  // Sub-pestaña de la vista general (no aplica a la ficha de un cliente
  // puntual): arranca en el historial de consultas, como pidió el negocio.
  const [vista, setVista] = useState('historial');

  const soyStaff = !isAdminRole();
  const miSucursalId = getStaffSucursalId();

  useEffect(() => {
    let query = supabase.from('conversations').select('*');
    // Mismo criterio que el fetch principal de App.jsx: un empleado no debe
    // ver acá clientes ni consultas de otra sucursal.
    if (soyStaff) {
      query = query.or(`sucursal_id.eq.${miSucursalId},sucursal_id.is.null`);
    }
    query
      .order('created_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (!error) {
          const enhanced = await withClientNames(data || []);
          setConversations(enhanced);
        }
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
      <div className="flex-1 flex items-center justify-center bg-[#f0f2f5] text-gray-400 text-sm">
        Cargando directorio de clientes...
      </div>
    );
  }

  // --- Vista de detalle de un cliente ---
  if (selectedClient) {
    return (
      <div className="flex-1 flex flex-col bg-[#f0f2f5] overflow-hidden">
        <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center gap-3 shrink-0">
          <button onClick={() => setSelectedPhone(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 truncate">{selectedClient.real_name || selectedClient.client_name || formatPhone(selectedClient.client_phone)}</h2>
            <p className="text-xs text-gray-500">{formatPhone(selectedClient.client_phone)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">{selectedClient.total}</div>
              <div className="text-xs text-gray-500 uppercase font-medium mt-1">Interacciones</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900 flex items-center gap-1">
                {selectedClient.avgRating != null ? selectedClient.avgRating.toFixed(1) : '—'}
                {selectedClient.avgRating != null && <Star size={16} className="text-amber-400 fill-amber-400" />}
              </div>
              <div className="text-xs text-gray-500 uppercase font-medium mt-1">Calificación promedio</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm font-bold text-gray-900">{formatDateTime(selectedClient.lastContact)}</div>
              <div className="text-xs text-gray-500 uppercase font-medium mt-1">Último contacto</div>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-3">Historial de consultas</h3>
          <ClientHistoryList
            conversations={selectedClient.conversations}
            onSelect={(conv) => onOpenConversation && onOpenConversation(conv)}
            emptyMessage="Este cliente todavía no tiene consultas."
          />
        </div>
      </div>
    );
  }

  // --- Vista de lista general ---
  return (
    <div className="flex-1 flex flex-col bg-[#f0f2f5] overflow-hidden">
      <div className="px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
          <Users size={20} className="text-teal-600" /> Directorio de Clientes
        </h2>

        <div className="flex bg-gray-100 rounded-lg p-1 gap-1 w-fit mb-3">
          <button
            onClick={() => setVista('historial')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vista === 'historial' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <History size={14} /> Historial de Consultas
          </button>
          <button
            onClick={() => setVista('lista')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vista === 'lista' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o teléfono..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            </div>
            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 appearance-none"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ArrowUpDown className="absolute left-2.5 top-2.5 text-gray-400 pointer-events-none" size={16} />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {vista === 'historial' ? (
          <ClientHistoryList
            conversations={historialConsultas}
            onSelect={(conv) => onOpenConversation && onOpenConversation(conv)}
            emptyMessage="Todavía no hay consultas finalizadas."
            showClient
          />
        ) : sortedClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Users size={48} className="mb-3 text-gray-300" />
            <p className="text-sm">No se encontraron clientes.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Último contacto</th>
                  <th className="px-4 py-3 font-medium text-center">Interacciones</th>
                  <th className="px-4 py-3 font-medium text-center">Calificación</th>
                </tr>
              </thead>
              <tbody>
                {sortedClients.map(cl => (
                  <tr
                    key={cl.client_phone}
                    onClick={() => setSelectedPhone(cl.client_phone)}
                    className="border-b border-gray-100 last:border-0 hover:bg-teal-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{cl.real_name || cl.client_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatPhone(cl.client_phone)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{new Date(cl.lastContact).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{cl.total}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {cl.avgRating != null ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                          {cl.avgRating.toFixed(1)} <Star size={12} className="text-amber-400 fill-amber-400" />
                        </span>
                      ) : (
                        <span className="text-gray-400">Sin datos</span>
                      )}
                    </td>
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
