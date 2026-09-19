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
import { isAdminRole } from '../lib/adminAuth';

export default function NotificationsPanel() {

  const [prefs, setPrefs] = useState(getNotificationPrefs());
  const [permissionError, setPermissionError] = useState('');
  // El sonido operativo nunca se puede apagar para una cuenta de sucursal
  // (ver notifyNewEvent en lib/notifications.js): el toggle se deshabilita
  // acá para que el staff no piense que lo silenció cuando en realidad va a
  // seguir sonando igual.
  const puedeMutearSonido = isAdminRole();

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
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Elegí cómo querés enterarte cuando entra un chat nuevo o un cliente pide hablar con un humano.
      </p>

      <div className="flex items-center justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="flex items-start gap-3">
          <Volume2 size={18} className="text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Alertas sonoras</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {puedeMutearSonido
                ? 'Reproduce un sonido corto al recibir un chat nuevo, un mensaje entrante o un pedido de atención.'
                : 'Este sonido no se puede desactivar para cuentas de sucursal.'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {(prefs.sound || !puedeMutearSonido) && (
            <button onClick={() => { playAlertSound(); }} className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-medium">
              Probar
            </button>
          )}
          <Toggle checked={prefs.sound || !puedeMutearSonido} onChange={toggleSound} disabled={!puedeMutearSonido} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="flex items-start gap-3">
          <BellRing size={18} className="text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Notificaciones emergentes</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Muestra un aviso del sistema operativo, incluso con el CRM en otra pestaña.</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {prefs.desktop && (
            <button
              onClick={() => { showDesktopNotification('Prueba de notificación', 'Así se van a ver los avisos de nuevos chats.'); }}
              className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-medium"
            >
              Probar
            </button>
          )}
          <Toggle checked={prefs.desktop} onChange={toggleDesktop} />
        </div>
      </div>

      {permissionError && <p className="text-sm text-rose-600 dark:text-rose-400">{permissionError}</p>}
    </div>
  );
}
