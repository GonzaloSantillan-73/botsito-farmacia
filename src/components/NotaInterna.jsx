import React from 'react';

// Nota interna del timeline (sender_type 'system': derivación, devolución a
// la cola o "tomó la consulta", ver server/services/internalNotes.js). Sólo
// la ven las sucursales y el admin en el CRM, nunca se le manda al cliente,
// así que no usa MessageBubble. Debajo del texto, la fecha y hora en que pasó.
export default function NotaInterna({ msg }) {
  const fecha = msg.created_at ? new Date(msg.created_at) : null;
  return (
    <div className="flex justify-center w-full my-2">
      <div className="bg-blue-600 text-white px-5 py-2 rounded-2xl border border-blue-700 text-center max-w-[90%]">
        <div className="text-base">{msg.message_text}</div>
        {fecha && (
          <div className="text-[11px] text-blue-100 mt-0.5">
            {fecha.toLocaleDateString('es-AR')} · {fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}
