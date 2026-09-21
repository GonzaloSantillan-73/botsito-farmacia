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
  // Ninguna de las dos alertas operativas se puede apagar para una cuenta
  // de sucursal (ver notifyNewEvent en lib/notifications.js): el sonido se
  // deshabilita directo acá para que el staff no piense que lo silenció
  // cuando en realidad va a seguir sonando igual. La notificación de
  // escritorio necesita quedar clickeable un poco más (ver toggleDesktop)
  // porque activarla requiere pedirle permiso al navegador — pero una vez
  // concedido, tampoco se puede volver a apagar desde acá.
  const puedeMutear = isAdminRole();

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
      // El staff nunca puede apagarlo desde acá (mismo criterio que el
      // sonido): se ignora el intento de desmarcar, así el switch se queda
      // mostrando "activado" en vez de sugerir que lo apagó de verdad.
      if (!puedeMutear) return;
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
              {puedeMutear
                ? 'Reproduce un sonido corto al recibir un chat nuevo, un mensaje entrante o un pedido de atención. Este switch sólo afecta a tu cuenta de administrador: las sucursales siempre lo tienen activo, sin importar lo que elijas acá.'
                : 'Este sonido no se puede desactivar para cuentas de sucursal: sólo el administrador puede silenciar el suyo.'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {(prefs.sound || !puedeMutear) && (
            <button onClick={() => { playAlertSound(); }} className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-medium">
              Probar
            </button>
          )}
          <Toggle checked={prefs.sound || !puedeMutear} onChange={toggleSound} disabled={!puedeMutear} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="flex items-start gap-3">
          <BellRing size={18} className="text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Notificaciones emergentes</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {puedeMutear
                ? 'Muestra un aviso del sistema operativo, incluso con el CRM en otra pestaña. Este switch sólo afecta a tu cuenta de administrador: las sucursales siempre lo tienen activo (en cuanto le dan el permiso a su navegador), sin importar lo que elijas acá.'
                : 'Muestra un aviso del sistema operativo, incluso con el CRM en otra pestaña. Una vez que le des el permiso a tu navegador, no se puede desactivar para cuentas de sucursal: va a seguir avisándote aunque el administrador apague el suyo.'}
            </div>
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
          {/* No se fuerza a "prendido" como el switch de sonido: activarlo
              depende de un permiso real del navegador, así que mostrar acá
              un estado que todavía no es cierto sería engañoso. Lo que sí
              se bloquea (ver toggleDesktop) es poder apagarlo de nuevo una
              vez concedido, para una cuenta de sucursal. */}
          <Toggle checked={prefs.desktop} onChange={toggleDesktop} disabled={!puedeMutear && prefs.desktop} />
        </div>
      </div>

      {permissionError && <p className="text-sm text-rose-600 dark:text-rose-400">{permissionError}</p>}
    </div>
  );
}
