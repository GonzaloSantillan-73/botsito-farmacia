import React, { useState } from 'react';
import { Volume2, BellRing } from 'lucide-react';
import Toggle from './Toggle';
import {
  getNotificationPrefs,
  setNotificationPrefs,
  requestDesktopPermission,
  playAlertSound,
  showDesktopNotification
} from '../lib/notifications';

export default function NotificationsPanel() {
  const [prefs, setPrefs] = useState(getNotificationPrefs());
  const [permissionError, setPermissionError] = useState('');

  const persist = (next) => {
    setPrefs(next);
    setNotificationPrefs(next);
  };

  const toggleSound = (value) => {
    persist({ ...prefs, sound: value });
  };

  const toggleDesktop = async (value) => {
    setPermissionError('');

    if (!value) {
      persist({ ...prefs, desktop: false });
      return;
    }

    const permission = await requestDesktopPermission();
    if (permission === 'granted') {
      persist({ ...prefs, desktop: true });
    } else if (permission === 'unsupported') {
      setPermissionError('Tu navegador no soporta notificaciones de escritorio.');
    } else {
      setPermissionError('Tenés que habilitar los permisos de notificación de este sitio en tu navegador.');
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Notificaciones</h3>
        <p className="text-xs text-gray-500">
          Elegí cómo querés enterarte cuando entra un chat nuevo o un cliente pide hablar con un humano.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 p-4 border border-gray-200 rounded-lg">
        <div className="flex items-start gap-3">
          <Volume2 size={18} className="text-teal-600 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium text-gray-800">Alertas sonoras</div>
            <div className="text-xs text-gray-500">Reproduce un sonido corto al recibir un chat nuevo o un pedido de atención.</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {prefs.sound && (
            <button onClick={playAlertSound} className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              Probar
            </button>
          )}
          <Toggle checked={prefs.sound} onChange={toggleSound} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-4 border border-gray-200 rounded-lg">
        <div className="flex items-start gap-3">
          <BellRing size={18} className="text-teal-600 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium text-gray-800">Notificaciones emergentes</div>
            <div className="text-xs text-gray-500">Muestra un aviso del sistema operativo, incluso con el CRM en otra pestaña.</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {prefs.desktop && (
            <button
              onClick={() => showDesktopNotification('Prueba de notificación', 'Así se van a ver los avisos de nuevos chats.')}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              Probar
            </button>
          )}
          <Toggle checked={prefs.desktop} onChange={toggleDesktop} />
        </div>
      </div>

      {permissionError && <p className="text-sm text-rose-600">{permissionError}</p>}
    </div>
  );
}
