import { useState } from 'react';
import { adminFetch } from './adminAuth';

// Mismo endpoint y mismo flujo que el chat en vivo (ver ChatArea.jsx:
// handlePurgeFile — motivo + password de admin -> POST
// /api/admin/moderacion/purgar-archivo -> borra el archivo de Storage y deja
// el placeholder "bordó", ver MessageBubble.jsx). A diferencia del chat en
// vivo (que recibe el mensaje ya actualizado por la suscripción Realtime de
// App.jsx), estas otras vistas (historial, trazabilidad de Métricas) son una
// "foto fija" sin Realtime, así que acá hace falta aplicar el resultado al
// array local de mensajes a mano — por eso el hook recibe el setter.
export const usePurgeMedia = (setMessages) => {
  const [purgeTarget, setPurgeTarget] = useState(null);

  const handlePurgeFile = async (msg, motivo, password) => {
    const res = await adminFetch('/api/admin/moderacion/purgar-archivo', {
      method: 'POST',
      body: JSON.stringify({ messageId: msg.id, motivo, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el archivo.');
    if (data.mensaje) {
      setMessages(prev => prev.map(m => (m.id === data.mensaje.id ? data.mensaje : m)));
    }
  };

  return { purgeTarget, setPurgeTarget, handlePurgeFile };
};
