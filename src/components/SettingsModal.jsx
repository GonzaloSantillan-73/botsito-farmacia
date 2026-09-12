import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, BarChart3, Sliders, Hash, Zap, CalendarClock, Download, Bell, Clock, Store, ShieldCheck, UserCog, CreditCard, MessageSquareText } from 'lucide-react';
import Accordion from './Accordion';
import SessionTimeoutPanel from './SessionTimeoutPanel';
import WelcomeMessagePanel from './WelcomeMessagePanel';
import BotKeywordPanel from './BotKeywordPanel';
import QuickRepliesPanel from './QuickRepliesPanel';
import SchedulePanel from './SchedulePanel';
import SucursalesPanel from './SucursalesPanel';
import NotificationsPanel from './NotificationsPanel';
import MetricsPanel from './MetricsPanel';
import ExportPanel from './ExportPanel';
import AdminCredentialsPanel from './AdminCredentialsPanel';
import CbuAliasPanel from './CbuAliasPanel';

export default function SettingsModal({ sessionTimeoutMs, onSave, onClose, isAdmin = true }) {
  // "Métricas y Estadísticas", "Exportar Datos" y "Administración" son
  // exclusivos del administrador (incluyen teléfonos, montos de venta y
  // credenciales de todo el sistema): un empleado ni siquiera ve esas
  // pestañas, para que quede claro que no puede tocar ni ver nada de eso.
  const TABS = [
    { id: 'chat', label: 'Ajustes de Chat', icon: Sliders },
    ...(isAdmin ? [
      { id: 'metrics', label: 'Métricas y Estadísticas', icon: BarChart3 },
      { id: 'export', label: 'Exportar Datos', icon: Download },
      { id: 'admin', label: 'Administración', icon: UserCog }
    ] : [])
  ];

  const [activeTab, setActiveTab] = useState('chat');

  // La tabla de métricas necesita todo el ancho posible (muchas columnas);
  // el resto de las pestañas se ve mejor acotado, como antes.
  const anchoContenido = activeTab === 'metrics' ? 'max-w-none' : 'max-w-2xl mx-auto';

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white w-full h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-bold text-lg">
            <Settings size={20} className="text-teal-600" />
            Configuración
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 shrink-0">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  isActive ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className={anchoContenido}>
            {activeTab === 'chat' ? (
              <div className="space-y-3">
                <Accordion title="Tiempo de inactividad para cerrar un chat" icon={Clock} defaultOpen>
                  <SessionTimeoutPanel sessionTimeoutMs={sessionTimeoutMs} onSave={onSave} />
                </Accordion>

                <Accordion title="Mensaje de bienvenida del bot" icon={MessageSquareText}>
                  <WelcomeMessagePanel />
                </Accordion>

                <Accordion title="Palabra clave del bot" icon={Hash}>
                  <BotKeywordPanel />
                </Accordion>

                <Accordion title="Respuestas Rápidas" icon={Zap}>
                  <QuickRepliesPanel />
                </Accordion>

                <Accordion title="Horarios de Atención" icon={CalendarClock}>
                  <SchedulePanel />
                </Accordion>

                <Accordion title="Notificaciones" icon={Bell}>
                  <NotificationsPanel />
                </Accordion>
              </div>
            ) : activeTab === 'metrics' && isAdmin ? (
              <MetricsPanel />
            ) : activeTab === 'export' && isAdmin ? (
              <ExportPanel />
            ) : activeTab === 'admin' && isAdmin ? (
              <div className="space-y-3">
                <Accordion title="Administrador" icon={ShieldCheck} defaultOpen>
                  <AdminCredentialsPanel />
                </Accordion>

                <Accordion title="Sucursales" icon={Store}>
                  <SucursalesPanel />
                </Accordion>
                <Accordion title="CBU / Alias Institucional" icon={CreditCard}>
                  <CbuAliasPanel />
                </Accordion>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
