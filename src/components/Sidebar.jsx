import React, { useState } from 'react';
import { Search, FileText, Database, Loader2, Clock, MessagesSquare, Inbox, Headset, Archive, Settings } from 'lucide-react';
import SettingsModal from './SettingsModal';
import { formatPhone } from '../lib/formatPhone';

const STATUS_BADGES = {
  pending_validation: { label: 'Receta Pendiente', className: 'bg-amber-100 text-amber-800' },
  open: { label: 'Abierto', className: 'bg-blue-100 text-blue-800' },
  preparation: { label: 'En Preparación', className: 'bg-indigo-100 text-indigo-800' },
  ready: { label: 'Listo / En Envío', className: 'bg-cyan-100 text-cyan-800' },
  esperando: { label: 'Esperando Humano', className: 'bg-orange-100 text-orange-800' },
  rejected: { label: 'Rechazado', className: 'bg-rose-100 text-rose-800' },
  resolved: { label: 'Resuelto', className: 'bg-emerald-100 text-emerald-800' },
  finalizada: { label: 'Finalizada', className: 'bg-gray-200 text-gray-600' }
};

// Estados "cerrados": la consulta ya terminó (por el operador o por inactividad).
const ESTADOS_HISTORIAL = ['finalizada', 'resolved', 'rejected'];
// El bot está respondiendo solo (menú, precios, etc.) y todavía no se pidió un humano.
const esBotAutomatico = (status) => status !== 'esperando' && !ESTADOS_HISTORIAL.includes(status);
// El cliente pidió hablar con un humano: pasa a "Atendiendo" de forma automática e inmediata.
const necesitaHumano = (status) => status === 'esperando';

const TABS = [
  { id: 'entrantes', label: 'Entrantes', icon: Inbox },
  { id: 'atendiendo', label: 'Atendiendo', icon: Headset },
  { id: 'historial', label: 'Historial', icon: Archive }
];

export default function Sidebar({
  conversations,
  loading,
  activeConversation,
  setActiveConversation,
  activeTab,
  setActiveTab,
  handleSeedData,
  isSeeding,
  searchQuery,
  setSearchQuery,
  sessionTimeoutMs,
  onSessionTimeoutChange
}) {
  const [showSettings, setShowSettings] = useState(false);

  // Descarta cualquier entrada malformada (sin id o sin fecha de creación) antes de
  // aplicar cualquier filtro o contador, para no arrastrar filas fantasma a ningún lado.
  const validConversations = conversations.filter(c => c?.id && c.created_at);

  // Lógica de filtrado doble: por tab y por búsqueda
  const filteredConversations = validConversations.filter(c => {
    // 1. Filtro por tab
    let matchesTab = true;
    if (activeTab === 'entrantes') matchesTab = esBotAutomatico(c.status);
    else if (activeTab === 'atendiendo') matchesTab = necesitaHumano(c.status);
    else if (activeTab === 'historial') matchesTab = ESTADOS_HISTORIAL.includes(c.status);

    // 2. Filtro por texto (búsqueda)
    let matchesSearch = true;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      matchesSearch = (c.client_name?.toLowerCase().includes(q) || c.client_phone?.toLowerCase().includes(q));
    }

    return matchesTab && matchesSearch;
  });

  const enEsperaCount = validConversations.filter(c => esBotAutomatico(c.status)).length;
  const misChatsCount = validConversations.filter(c => necesitaHumano(c.status)).length;
  const tabCounts = {
    entrantes: enEsperaCount,
    atendiendo: misChatsCount,
    historial: validConversations.filter(c => ESTADOS_HISTORIAL.includes(c.status)).length
  };

  return (
    <div className="w-1/4 border-r border-gray-200 bg-white flex flex-col shadow-sm z-10">
      <div className="p-4 border-b border-gray-200 space-y-4">
        <h1 className="text-xl font-bold text-teal-700 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="p-2 bg-teal-100 rounded-lg"><FileText size={20} className="text-teal-600"/></span>
            FarmaPanel CRM
          </span>
          <button
            onClick={() => setShowSettings(true)}
            title="Configuración"
            className="p-2 text-gray-400 hover:text-teal-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Settings size={20} />
          </button>
        </h1>

        {/* Tarjetas de contadores */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setActiveTab('entrantes')}
            className={`text-left p-3 rounded-xl border transition-colors ${activeTab === 'entrantes' ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200 hover:border-amber-200 hover:bg-amber-50/50'}`}
          >
            <div className="flex items-center gap-1.5 text-amber-600 mb-1">
              <Clock size={14} />
              <span className="text-[11px] font-bold uppercase tracking-wide">En espera</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">{enEsperaCount}</span>
          </button>

          <button
            onClick={() => setActiveTab('atendiendo')}
            className={`text-left p-3 rounded-xl border transition-colors ${activeTab === 'atendiendo' ? 'bg-teal-50 border-teal-300' : 'bg-white border-gray-200 hover:border-teal-200 hover:bg-teal-50/50'}`}
          >
            <div className="flex items-center gap-1.5 text-teal-600 mb-1">
              <MessagesSquare size={14} />
              <span className="text-[11px] font-bold uppercase tracking-wide">Mis chats</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">{misChatsCount}</span>
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por nombre o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
        </div>

        {/* Pestañas de filtrado */}
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const count = tabCounts[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${isActive ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Icon size={14} />
                {tab.label}
                {count > 0 && (
                  <span className={`flex h-4 min-w-4 px-1 items-center justify-center rounded-full text-[10px] ${isActive ? 'bg-teal-600 text-white' : 'bg-gray-300 text-gray-700'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {loading ? (
           <div className="p-6 space-y-4">
             {[1,2,3].map(i => (
               <div key={i} className="animate-pulse flex items-start gap-3">
                 <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0"></div>
                 <div className="flex-1 space-y-2">
                   <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                   <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                 </div>
               </div>
             ))}
           </div>
        ) : validConversations.length === 0 ? (
           <div className="p-8 text-center flex flex-col items-center justify-center h-full">
             <Database className="w-12 h-12 text-gray-300 mb-4" />
             <h3 className="text-gray-900 font-semibold mb-2">No hay conversaciones</h3>
             <p className="text-gray-500 text-sm mb-6">Tu base de datos está vacía. Carga los datos de prueba para comenzar.</p>
             <button
               onClick={handleSeedData}
               disabled={isSeeding}
               className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
             >
               {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <Database size={18} />}
               {isSeeding ? 'Cargando...' : 'Cargar datos mock'}
             </button>
           </div>
        ) : filteredConversations.length === 0 ? (
           <div className="p-8 text-center text-gray-500 text-sm">
              No hay coincidencias con tu búsqueda o filtros.
           </div>
        ) : (
           filteredConversations.map(conv => {
            const badge = STATUS_BADGES[conv.status];
            return (
            <div
              key={conv.id}
              onClick={() => setActiveConversation(conv)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${activeConversation?.id === conv.id ? 'bg-teal-50/50 border-l-4 border-l-teal-500' : 'border-l-4 border-l-transparent'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-semibold text-gray-900 truncate pr-2">
                   {conv.client_name || formatPhone(conv.client_phone)}
                   {conv.client_name && <span className="text-xs font-normal text-gray-400 ml-1">({formatPhone(conv.client_phone)})</span>}
                </h3>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {activeTab === 'historial'
                    ? new Date(conv.updated_at).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : new Date(conv.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-sm text-gray-600 truncate mb-2">
                {conv.last_message || <span className="italic text-gray-400">Nueva conversación</span>}
              </div>
              {badge && (
                <div className="flex items-center gap-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${badge.className}`}>{badge.label}</span>
                </div>
              )}
            </div>
          )})
        )}
      </div>

      {showSettings && (
        <SettingsModal
          sessionTimeoutMs={sessionTimeoutMs}
          onSave={(newMs) => onSessionTimeoutChange && onSessionTimeoutChange(newMs)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
