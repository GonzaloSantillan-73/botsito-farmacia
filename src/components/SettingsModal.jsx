import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, BarChart3, Sliders, Hash, Zap, CalendarClock, Download, Bell, Clock, Store, ShieldCheck, UserCog } from 'lucide-react';
import Accordion from './Accordion';
import SessionTimeoutPanel from './SessionTimeoutPanel';
import BotKeywordPanel from './BotKeywordPanel';
import QuickRepliesPanel from './QuickRepliesPanel';
import SchedulePanel from './SchedulePanel';
import SucursalesPanel from './SucursalesPanel';
import NotificationsPanel from './NotificationsPanel';
import MetricsPanel from './MetricsPanel';
import ExportPanel from './ExportPanel';
import AdminCredentialsPanel from './AdminCredentialsPanel';

export default function SettingsModal({ sessionTimeoutMs, onSave, onClose, isAdmin = true }) {
  // El apartado de Administración (credenciales del admin y sucursales, con
  // sus credenciales de empleado) es exclusivo del administrador: un
  // empleado ni siquiera ve la pestaña, para que quede claro que no puede
  // tocar nada de eso.
  const TABS = [
    { id: 'chat', label: 'Ajustes de Chat', icon: Sliders },
    { id: 'metrics', label: 'Métricas y Estadísticas', icon: BarChart3 },
    { id: 'export', label: 'Exportar Datos', icon: Download },
    ...(isAdmin ? [{ id: 'admin', label: 'Administración', icon: UserCog }] : [])
  ];

  const [activeTab, setActiveTab] = useState('chat');

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-[80%] h-[90%] flex flex-col overflow-hidden">
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
          <div className="max-w-2xl mx-auto">
            {activeTab === 'chat' ? (
              <div className="space-y-3">
                <Accordion title="Tiempo de inactividad para cerrar un chat" icon={Clock} defaultOpen>
                  <SessionTimeoutPanel sessionTimeoutMs={sessionTimeoutMs} onSave={onSave} />
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
            ) : activeTab === 'export' ? (
              <ExportPanel />
            ) : activeTab === 'admin' ? (
              <div className="space-y-3">
                <Accordion title="Administrador" icon={ShieldCheck} defaultOpen>
                  <AdminCredentialsPanel />
                </Accordion>

                <Accordion title="Sucursales" icon={Store}>
                  <SucursalesPanel />
                </Accordion>
              </div>
            ) : (
              <MetricsPanel />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
