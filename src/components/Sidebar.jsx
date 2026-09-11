import React, { useState, useEffect, memo } from 'react';
import { Database, Loader2, Clock, MessageSquare, Bot, Settings, Users, LogOut } from 'lucide-react';
import SettingsModal from './SettingsModal';
import { formatPhone } from '../lib/formatPhone';

// Formatea milisegundos transcurridos con precisión progresiva: segundos
// (00s) mientras dure menos de un minuto, minutos:segundos (01:00m) mientras
// dure menos de una hora, y horas:minutos:segundos (01:00:00h) en adelante.
const pad = (n) => String(n).padStart(2, '0');
const formatWaitTime = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}h`;
  if (minutes > 0) return `${pad(minutes)}:${pad(seconds)}m`;
  return `${pad(seconds)}s`;
};

// Umbrales de "urgencia" de la espera: amarillo apenas entra a la cola,
// naranja a partir del minuto, rojo a partir de los 3 minutos.
const WAIT_URGENCY_CLASSES = {
  low: 'bg-yellow-100 text-yellow-800',
  mid: 'bg-orange-100 text-orange-800',
  high: 'bg-red-100 text-red-800'
};
const getWaitUrgency = (ms) => {
  if (ms >= 3 * 60 * 1000) return 'high';
  if (ms >= 60 * 1000) return 'mid';
  return 'low';
};

// Badges en vivo del estado "Esperando Humano": el label y el reloj comparten
// el mismo color, que escala con el tiempo transcurrido (amarillo -> naranja
// a partir del minuto -> rojo a partir de los 3 minutos). Viven en su propio
// componente memoizado para que el "tick" de cada segundo sólo re-renderice
// este par de badges chiquitos y no toda la lista de conversaciones del Sidebar.
const EsperandoBadges = memo(function EsperandoBadges({ since }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(since).getTime());

  useEffect(() => {
    setElapsed(Date.now() - new Date(since).getTime());
    const interval = setInterval(() => {
      setElapsed(Date.now() - new Date(since).getTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [since]);

  const colorClassName = WAIT_URGENCY_CLASSES[getWaitUrgency(elapsed)];

  return (
    <>
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${colorClassName}`}>
        Esperando Humano
      </span>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold tabular-nums ${colorClassName}`}>
        <Clock size={11} />
        {formatWaitTime(elapsed)}
      </span>
    </>
  );
});

export const STATUS_BADGES = {
  pending_validation: { label: 'Receta Pendiente', className: 'bg-amber-100 text-amber-800' },
  open: { label: 'Abierto', className: 'bg-blue-100 text-blue-800' },
  preparation: { label: 'En Preparación', className: 'bg-indigo-100 text-indigo-800' },
  ready: { label: 'Listo / En Envío', className: 'bg-cyan-100 text-cyan-800' },
  esperando: { label: 'Esperando Humano', className: 'bg-orange-100 text-orange-800' },
  rejected: { label: 'Rechazado', className: 'bg-rose-100 text-rose-800' },
  resolved: { label: 'Resuelto', className: 'bg-emerald-100 text-emerald-800' },
  finalizada: { label: 'Finalizada', className: 'bg-gray-200 text-gray-600' }
};

// Resultado comercial de la conversación (conversations.sale_status), lo carga
// el operador manualmente desde SaleStatusPanel. Se muestra como badge aparte
// del estado del chat en el Directorio, el Historial y la vista del chat.
export const SALE_STATUS_BADGES = {
  concretada: { label: '✅ Venta Concretada', className: 'bg-emerald-100 text-emerald-800' },
  no_concretada: { label: '❌ Venta No Concretada', className: 'bg-rose-100 text-rose-800' },
  otra: { label: '💬 Otra Razón', className: 'bg-amber-100 text-amber-800' }
};

// Estados "cerrados": la consulta ya terminó (por el operador o por inactividad).
export const ESTADOS_HISTORIAL = ['finalizada', 'resolved', 'rejected'];
// El bot está respondiendo solo (menú, horarios, registro de datos) y todavía no se pidió un humano.
const esBotAutomatico = (status) => status !== 'esperando' && !ESTADOS_HISTORIAL.includes(status);
// El chat fue derivado a una sucursal puntual (a mano por el admin, o
// automáticamente cuando un empleado sin sucursal asignada le contesta por
// primera vez, ver App.jsx). El fetch de conversations en App.jsx ya excluye
// para un empleado las de otra sucursal, así que este filtro alcanza para
// que cada uno solo vea los derivados propios.
const esDerivado = (conv) => conv.sucursal_id != null;
// El cliente pidió hablar con un humano y todavía NO fue derivado a ninguna
// sucursal puntual: si ya tiene sucursal_id, pasa a "Derivados" en vez de acá
// (antes se mostraba en las dos pestañas a la vez).
const necesitaHumano = (conv) => conv.status === 'esperando' && !esDerivado(conv);

const TABS = [
  { id: 'entrantes', label: 'BOT', icon: Bot },
  { id: 'atendiendo', label: 'En espera', icon: Clock },
  { id: 'derivados', label: 'Mis chats', icon: MessageSquare }
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
  sessionTimeoutMs,
  onSessionTimeoutChange,
  showClientDirectory,
  onShowClientDirectory,
  onLogout,
  isAdmin = true,
  staffSucursalNombre
}) {
  const [showSettings, setShowSettings] = useState(false);

  // Descarta cualquier entrada malformada (sin id o sin fecha de creación) antes de
  // aplicar cualquier filtro o contador, para no arrastrar filas fantasma a ningún lado.
  const validConversations = conversations.filter(c => c?.id && c.created_at);

  // Filtro por tab (BOT / En espera / Mis chats)
  const filteredConversations = validConversations.filter(c => {
    if (activeTab === 'entrantes') return esBotAutomatico(c.status);
    if (activeTab === 'atendiendo') return necesitaHumano(c);
    if (activeTab === 'derivados') return esDerivado(c);
    return true;
  });

  const botCount = validConversations.filter(c => esBotAutomatico(c.status)).length;
  const enEsperaCount = validConversations.filter(necesitaHumano).length;
  const misChatsCount = validConversations.filter(esDerivado).length;
  const tabCounts = {
    entrantes: botCount,
    atendiendo: enEsperaCount,
    derivados: misChatsCount
  };

  return (
    <div className="w-1/4 border-r border-gray-200 bg-white flex flex-col shadow-sm z-10">
      <div className="p-4 border-b border-gray-200 space-y-4">
        <h1 className="text-xl font-bold text-teal-700 flex items-center justify-between gap-2">
          <span>CRM</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onShowClientDirectory}
              title="Directorio de clientes"
              className={`p-2 rounded-full transition-colors ${showClientDirectory ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100'}`}
            >
              <Users size={20} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              title="Configuración"
              className="p-2 text-gray-400 hover:text-teal-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Settings size={20} />
            </button>
            <button
              onClick={() => {
                if (window.confirm('¿Cerrar sesión del CRM?')) onLogout?.();
              }}
              title="Cerrar sesión"
              className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors"
            >
              <LogOut size={20} />
            </button>
          </div>
        </h1>

        {!isAdmin && staffSucursalNombre && (
          <div className="text-[11px] font-medium text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-2.5 py-1.5 -mt-1">
            Sucursal: {staffSucursalNombre}
          </div>
        )}

        {/* Tarjetas de contadores */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setActiveTab('entrantes')}
            className={`text-left p-2 rounded-xl border transition-colors ${activeTab === 'entrantes' ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/50'}`}
          >
            <div className="flex items-center gap-1 text-indigo-600 mb-1">
              <Bot size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wide truncate">BOT</span>
            </div>
            <span className="text-xl font-bold text-gray-900">{botCount}</span>
          </button>

          <button
            onClick={() => setActiveTab('atendiendo')}
            className={`text-left p-2 rounded-xl border transition-colors ${activeTab === 'atendiendo' ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200 hover:border-amber-200 hover:bg-amber-50/50'}`}
          >
            <div className="flex items-center gap-1 text-amber-600 mb-1">
              <Clock size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wide truncate">En espera</span>
            </div>
            <span className="text-xl font-bold text-gray-900">{enEsperaCount}</span>
          </button>

          <button
            onClick={() => setActiveTab('derivados')}
            className={`text-left p-2 rounded-xl border transition-colors ${activeTab === 'derivados' ? 'bg-teal-50 border-teal-300' : 'bg-white border-gray-200 hover:border-teal-200 hover:bg-teal-50/50'}`}
          >
            <div className="flex items-center gap-1 text-teal-600 mb-1">
              <MessageSquare size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wide truncate">Mis chats</span>
            </div>
            <span className="text-xl font-bold text-gray-900">{misChatsCount}</span>
          </button>
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
            const esperando = conv.status === 'esperando';
            const isDerivadoTab = activeTab === 'derivados';
            const showEsperando = esperando && !isDerivadoTab;
            const visualStatus = (esperando && isDerivadoTab) ? 'open' : conv.status;
            const badge = showEsperando ? null : STATUS_BADGES[visualStatus];
            return (
            <div
              key={conv.id}
              onClick={() => setActiveConversation(conv)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${activeConversation?.id === conv.id ? 'bg-teal-50/50 border-l-4 border-l-teal-500' : 'border-l-4 border-l-transparent'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-semibold text-gray-900 truncate pr-2">
                   {conv.real_name || conv.client_name || formatPhone(conv.client_phone)}
                   {(conv.real_name || conv.client_name) && <span className="text-xs font-normal text-gray-400 ml-1">({formatPhone(conv.client_phone)})</span>}
                </h3>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {activeTab === 'derivados'
                    ? new Date(conv.updated_at).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : new Date(conv.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-sm text-gray-600 truncate mb-2">
                {conv.last_message || <span className="italic text-gray-400">Nueva conversación</span>}
              </div>
              {(badge || showEsperando) && (
                <div className="flex items-center gap-1 flex-wrap">
                  {badge && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${badge.className}`}>{badge.label}</span>
                  )}
                  {showEsperando && (
                    <EsperandoBadges since={conv.waiting_since || conv.updated_at} />
                  )}
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
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
