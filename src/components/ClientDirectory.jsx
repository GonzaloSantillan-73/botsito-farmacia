import React, { useState, useEffect, useCallback } from 'react';
import { Users, Search, ArrowLeft, ArrowUpDown, History, List, AlertTriangle, Filter, RefreshCw } from 'lucide-react';
import { formatPhone } from '../lib/formatPhone';
import { adminFetch, isAdminRole } from '../lib/adminAuth';
import { supabase } from '../lib/supabase';
import { ESTADOS_HISTORIAL } from './Sidebar';
import ClientHistoryList from './ClientHistoryList';
import StarRating from './StarRating';

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

export default function ClientDirectory({ onOpenConversation, initialSelectedPhone = null }) {
  const [conversations, setConversations] = useState([]);
  // A diferencia de `conversations` (una fila por CONSULTA, con el
  // client_phone tal cual quedó en esa sesión — ver "Historial de
  // Consultas"), `clients` es el registro maestro de PERSONAS que arma el
  // backend a partir de la tabla `clientes` (ver obtenerListaClientesDirectorio
  // en server/services/clientDirectory.js): el client_phone que trae cada
  // fila es el vigente en la ficha, no un agrupado de conversaciones armado
  // acá. No hay que recalcularlo en el frontend.
  const [clients, setClients] = useState([]);
  // Errores por sección (no un solo error general): el backend puede traer
  // bien una pestaña y fallar la otra (ver Promise.allSettled en
  // server/routes/clientDirectory.js) — por ejemplo, si falta correr alguna
  // migración de supabase/*.sql. Mostrar el mensaje real acá evita que una
  // falla se disfrace de "no hay datos" sin ninguna pista de qué pasó.
  const [errors, setErrors] = useState({ conversations: null, clients: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPhone, setSelectedPhone] = useState(initialSelectedPhone);
  const [sortBy, setSortBy] = useState('recent');
  // Sub-pestaña de la vista general (no aplica a la ficha de un cliente
  // puntual): arranca en el historial de consultas, como pidió el negocio.
  const [vista, setVista] = useState('historial');
  // Filtro de origen para "Historial de Consultas", sólo para el admin (el
  // staff ya ve nada más su propia sucursal + bot sin asignar, filtrar no le
  // aporta nada): 'todas' | 'bot' (sucursal_id null) | <sucursal_id>.
  const [sucursalFiltro, setSucursalFiltro] = useState('todas');
  const [refreshing, setRefreshing] = useState(false);

  // El filtrado por sucursal para el staff lo aplica el backend a partir
  // del sucursalId del JWT (ver server/routes/clientDirectory.js): acá no
  // se manda ni se puede forzar ninguna sucursal, evitando fugas entre
  // sucursales aunque se manipule el request. Se usa tanto en la carga
  // inicial como en el botón "Actualizar" del header.
  const fetchDirectory = useCallback(() => {
    return adminFetch('/api/admin/client-directory/conversations')
      .then(res => res.json())
      .then(({ conversations: data, clients: clientsData, errors: sectionErrors }) => {
        setConversations(data || []);
        setClients(clientsData || []);
        if (sectionErrors?.conversations) console.error('❌ [DEBUG-COMPONENT-ClientDirectory] error cargando conversations:', sectionErrors.conversations);
        if (sectionErrors?.clients) console.error('❌ [DEBUG-COMPONENT-ClientDirectory] error cargando clients:', sectionErrors.clients);
        setErrors({ conversations: sectionErrors?.conversations || null, clients: sectionErrors?.clients || null });
      })
      .catch((err) => {
        console.error('❌ [DEBUG-COMPONENT-ClientDirectory] excepción en fetch conversations:', err);
        setErrors({ conversations: 'No se pudo conectar con el servidor.', clients: 'No se pudo conectar con el servidor.' });
      });
  }, []);

  useEffect(() => {
    fetchDirectory().finally(() => setLoading(false));
  }, [fetchDirectory]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDirectory().finally(() => setRefreshing(false));
  };

  // El nombre/DNI de un cliente puede cambiar mientras esta vista ya está
  // montada (el bot lo registra por primera vez, o un operador lo corrige
  // desde ValidationPanel.jsx en otra pestaña de la app): sin esto, tanto
  // "Lista de Clientes" (nombre + DNI) como "Historial de Consultas"
  // (nombre) quedaban mostrando el dato viejo hasta recargar la página.
  useEffect(() => {
    const channel = supabase.channel('client-directory-clientes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clientes' },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          const phone = payload.new?.client_phone;
          if (!phone) return;
          const nombre = payload.new?.nombre_completo || null;
          const dni = payload.new?.dni || null;
          setClients(prev => prev.map(cl => cl.client_phone === phone ? { ...cl, real_name: nombre, dni } : cl));
          setConversations(prev => prev.map(c => c.client_phone === phone ? { ...c, real_name: nombre } : c));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const historialConsultas = conversations
    .filter(c => c?.client_phone && ESTADOS_HISTORIAL.includes(c.status));

  // Sucursales que efectivamente aparecen en el historial cargado (no todas
  // las que existan: no tiene sentido ofrecer una sucursal sin ninguna
  // consulta en este listado), para armar las opciones del filtro del admin.
  const sucursalesEnHistorial = Object.values(
    historialConsultas.reduce((acc, c) => {
      if (c.sucursal_id && c.sucursal_actual?.nombre) acc[c.sucursal_id] = { id: c.sucursal_id, nombre: c.sucursal_actual.nombre };
      return acc;
    }, {})
  ).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const historialFiltrado = historialConsultas.filter(c => {
    if (sucursalFiltro === 'todas') return true;
    if (sucursalFiltro === 'bot') return !c.sucursal_id;
    return c.sucursal_id === sucursalFiltro;
  });

  const filteredClients = clients.filter(cl => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (cl.real_name || cl.client_name)?.toLowerCase().includes(q) || cl.client_phone?.toLowerCase().includes(q);
  });

  const sortedClients = ordenarClientes(filteredClients, sortBy);

  const selectedClient = selectedPhone ? clients.find(c => c.client_phone === selectedPhone) : null;
  // El detalle de un cliente sí necesita sus consultas una por una (para el
  // historial de abajo): salen del mismo `conversations` ya cargado (el
  // client_phone de cada consulta es el snapshot de esa sesión, sin pisar),
  // filtradas contra TODOS los teléfonos que tuvo esta persona (no sólo el
  // vigente): si migró de número, sus consultas viejas se quedaron con el
  // client_phone de entonces — `telefonos` (vigente + históricos) es lo que
  // arma obtenerListaClientesDirectorio en el backend.
  const selectedClientConversations = selectedClient
    ? conversations.filter(c => selectedClient.telefonos.includes(c.client_phone)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    : [];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f0f2f5] dark:bg-gray-900 text-gray-400 dark:text-gray-500 text-sm">
        Cargando directorio de clientes...
      </div>
    );
  }

  // --- Vista de detalle de un cliente ---
  if (selectedClient) {
    return (
      <div className="flex-1 flex flex-col bg-[#f0f2f5] dark:bg-gray-900 overflow-hidden">
        <div className="px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
          <button onClick={() => { setSelectedPhone(null); }} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 truncate">{selectedClient.real_name || selectedClient.client_name || formatPhone(selectedClient.client_phone)}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatPhone(selectedClient.client_phone)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{selectedClient.total}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mt-1">Interacciones</div>
            </div>
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
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatDateTime(selectedClient.lastContact)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mt-1">Último contacto</div>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Historial de consultas</h3>
          <ClientHistoryList
            conversations={selectedClientConversations}
            onSelect={(conv) => { onOpenConversation && onOpenConversation(conv); }}
            emptyMessage="Este cliente todavía no tiene consultas."
          />
        </div>
      </div>
    );
  }

  // --- Vista de lista general ---
  return (
    <div className="flex-1 flex flex-col bg-[#f0f2f5] dark:bg-gray-900 overflow-hidden">
      <div className="px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Users size={20} className="text-teal-600 dark:text-teal-400" /> Directorio de Clientes
          </h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Actualizar"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 gap-1 w-fit mb-3">
          <button
            onClick={() => { setVista('historial'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vista === 'historial' ? 'bg-white dark:bg-gray-900 text-teal-700 dark:text-teal-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <History size={14} /> Historial de Consultas
          </button>
          <button
            onClick={() => { setVista('lista'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vista === 'lista' ? 'bg-white dark:bg-gray-900 text-teal-700 dark:text-teal-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <List size={14} /> Lista de Clientes
          </button>
        </div>

        {vista === 'historial' && isAdminRole() && (
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <select
                value={sucursalFiltro}
                onChange={(e) => { setSucursalFiltro(e.target.value); }}
                className="pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 appearance-none"
              >
                <option value="todas">Todas las sucursales</option>
                <option value="bot">Bot (sin sucursal asignada)</option>
                {sucursalesEnHistorial.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
              <Filter className="absolute left-2.5 top-2.5 text-gray-400 dark:text-gray-500 pointer-events-none" size={16} />
            </div>
          </div>
        )}

        {vista === 'lista' && (
          <div className="flex items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); }}
                placeholder="Buscar por nombre o teléfono..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
              <Search className="absolute left-3 top-2.5 text-gray-400 dark:text-gray-500" size={16} />
            </div>
            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); }}
                className="pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 appearance-none"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ArrowUpDown className="absolute left-2.5 top-2.5 text-gray-400 dark:text-gray-500 pointer-events-none" size={16} />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {(vista === 'historial' ? errors.conversations : errors.clients) && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-sm">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">No se pudo cargar esta sección.</p>
              <p className="text-xs opacity-90">{vista === 'historial' ? errors.conversations : errors.clients}</p>
            </div>
          </div>
        )}
        {vista === 'historial' ? (
          <ClientHistoryList
            conversations={historialFiltrado}
            onSelect={(conv) => { onOpenConversation && onOpenConversation(conv); }}
            emptyMessage={sucursalFiltro === 'todas' ? 'Todavía no hay consultas finalizadas.' : 'Ninguna consulta coincide con el filtro de sucursal.'}
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
                  <th className="px-4 py-3 font-medium text-center">Atención</th>
                  <th className="px-4 py-3 font-medium text-center">Producto</th>
                </tr>
              </thead>
              <tbody>
                {sortedClients.map(cl => (
                  <tr
                    key={cl.client_phone}
                    onClick={() => { setSelectedPhone(cl.client_phone); }}
                    className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-teal-50/40 dark:hover:bg-teal-950/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{cl.real_name || cl.client_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatPhone(cl.client_phone)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{new Date(cl.lastContact).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{cl.total}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {cl.avgRating != null ? (
                        <StarRating value={cl.avgRating.toFixed(1)} type="atencion" size={12} className="font-medium" />
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">Sin datos</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {cl.avgProductRating != null ? (
                        <StarRating value={cl.avgProductRating.toFixed(1)} type="producto" size={12} className="font-medium" />
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">Sin datos</span>
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
