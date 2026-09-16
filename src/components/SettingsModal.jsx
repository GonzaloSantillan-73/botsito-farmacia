import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, BarChart3, Sliders, Hash, Zap, CalendarClock, Download, Bell, Clock, Store, ShieldCheck, UserCog, CreditCard, MessageSquareText, Moon, KeyRound } from 'lucide-react';
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
import CredentialsPanel from './CredentialsPanel';
import AliasPanel from './AliasPanel';
import ThemeToggle from './ThemeToggle';

export default function SettingsModal({ sessionTimeoutMs, onSave, onClose, isAdmin = true }) {

  // Una cuenta de sucursal sólo tiene acceso a "Apariencia" (modo oscuro,
  // ver [[dark-mode-por-cuenta]]) y a sus propias Respuestas Rápidas: el
  // resto de los ajustes (chat global, métricas, exportación, administración)
  // son exclusivos del administrador, así que ni siquiera se listan acá para
  // una sucursal.
  const TABS = isAdmin ? [
    { id: 'apariencia', label: 'Apariencia', icon: Moon },
    { id: 'chat', label: 'Ajustes de Chat', icon: Sliders },
    { id: 'metrics', label: 'Métricas y Estadísticas', icon: BarChart3 },
    { id: 'export', label: 'Exportar Datos', icon: Download },
    { id: 'admin', label: 'Administración', icon: UserCog }
  ] : [
    { id: 'apariencia', label: 'Apariencia', icon: Moon },
    { id: 'respuestas', label: 'Mis Respuestas Rápidas', icon: Zap },
    { id: 'cuenta', label: 'Cuenta', icon: KeyRound }
  ];


  const [activeTab, setActiveTab] = useState(isAdmin ? 'chat' : 'apariencia');

  // La tabla de métricas necesita todo el ancho posible (muchas columnas);
  // el resto de las pestañas se ve mejor acotado, como antes.
  const anchoContenido = activeTab === 'metrics' ? 'max-w-none' : 'max-w-2xl mx-auto';

  const handleTabClick = (tabId) => {
    const esAdminOnly = ['chat', 'metrics', 'export', 'admin'].includes(tabId);
    if (esAdminOnly && !isAdmin) {
      console.error('❌ [DEBUG-COMPONENT-SettingsModal] Intento de abrir pestaña admin-only sin ser admin:', tabId);
      return;
    }
    setActiveTab(tabId);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-900 w-full h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 dark:text-gray-100 font-bold text-lg">
            <Settings size={20} className="text-teal-600 dark:text-teal-400" />
            Configuración
          </div>
          <button onClick={() => { onClose(); }} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 shrink-0 overflow-x-auto scrollbar-thin">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors shrink-0 whitespace-nowrap ${
                  isActive ? 'border-teal-600 text-teal-700 dark:text-teal-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-8">
          <div className={anchoContenido}>
            {activeTab === 'apariencia' ? (
              <ThemeToggle />
            ) : activeTab === 'respuestas' && !isAdmin ? (
              <QuickRepliesPanel />
            ) : activeTab === 'cuenta' && !isAdmin ? (
              <CredentialsPanel />
            ) : activeTab === 'chat' && isAdmin ? (
              <div className="space-y-3">
                <Accordion title="Tiempo de inactividad para cerrar un chat" icon={Clock}>
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
                <Accordion title="Administrador" icon={ShieldCheck}>
                  <CredentialsPanel />
                </Accordion>

                <Accordion title="Sucursales" icon={Store}>
                  <SucursalesPanel />
                </Accordion>
                <Accordion title="Alias Institucional" icon={CreditCard}>
                  <AliasPanel />
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
