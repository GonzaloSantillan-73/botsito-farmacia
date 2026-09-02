import React from 'react';
import { Search, FileText, Database, Loader2 } from 'lucide-react';

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
  setSearchQuery
}) {

  // Lógica de filtrado doble: por tab y por búsqueda
  const filteredConversations = conversations.filter(c => {
    // 1. Filtro por tab
    let matchesTab = true;
    if (activeTab === 'pending') matchesTab = c.status === 'pending_validation';
    else if (activeTab === 'open') matchesTab = c.status === 'open';
    else if (activeTab === 'rejected') matchesTab = c.status === 'rejected';
    else if (activeTab === 'resolved') matchesTab = c.status === 'resolved';

    // 2. Filtro por texto (búsqueda)
    let matchesSearch = true;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      matchesSearch = (c.client_name?.toLowerCase().includes(q) || c.client_phone?.toLowerCase().includes(q));
    }

    return matchesTab && matchesSearch;
  });

  const pendingCount = conversations.filter(c => c.status === 'pending_validation').length;

  return (
    <div className="w-1/4 border-r border-gray-200 bg-white flex flex-col shadow-sm z-10">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-teal-700 flex items-center gap-2 mb-4">
          <span className="p-2 bg-teal-100 rounded-lg"><FileText size={20} className="text-teal-600"/></span>
          FarmaPanel CRM
        </h1>
        <div className="relative mb-4">
          <input 
            type="text" 
            placeholder="Buscar por nombre o teléfono..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeTab === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Todos
          </button>
          <button 
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeTab === 'pending' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}
          >
            Pendientes
            {pendingCount > 0 && (
              <span className={`ml-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${activeTab === 'pending' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'}`}>
                {pendingCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('open')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeTab === 'open' ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
          >
            Abiertos
          </button>
          <button 
            onClick={() => setActiveTab('rejected')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeTab === 'rejected' ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}
          >
            Rechazados
          </button>
          <button 
            onClick={() => setActiveTab('resolved')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeTab === 'resolved' ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
          >
            Resueltos
          </button>
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
        ) : conversations.length === 0 ? (
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
           filteredConversations.map(conv => (
            <div 
              key={conv.id} 
              onClick={() => setActiveConversation(conv)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${activeConversation?.id === conv.id ? 'bg-teal-50/50 border-l-4 border-l-teal-500' : 'border-l-4 border-l-transparent'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-semibold text-gray-900 truncate pr-2">
                   {conv.client_name || conv.client_phone}
                   {conv.client_name && <span className="text-xs font-normal text-gray-400 ml-1">({conv.client_phone})</span>}
                </h3>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {new Date(conv.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
              <div className="text-sm text-gray-600 truncate mb-2">
                {conv.last_message || <span className="italic text-gray-400">Nueva conversación</span>}
              </div>
              <div className="flex items-center gap-1">
                {conv.status === 'pending_validation' && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">Receta Pendiente</span>}
                {conv.status === 'open' && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">Abierto</span>}
                {conv.status === 'rejected' && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-800">Rechazado</span>}
                {conv.status === 'resolved' && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">Resuelto</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
