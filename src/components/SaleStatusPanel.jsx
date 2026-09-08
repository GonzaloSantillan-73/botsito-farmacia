import React, { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ESTADOS_CERRADOS = ['finalizada', 'resolved', 'rejected'];

// Resultado final de la gestión comercial (para métricas de conversión y
// ticket promedio). Marcarlo NUNCA toca `status`: el chat de WhatsApp sigue
// abierto, el cliente puede seguir escribiéndole al bot o al operador.
export default function SaleStatusPanel({ activeConversation, total }) {
  const [saving, setSaving] = useState(null);

  if (!activeConversation || ESTADOS_CERRADOS.includes(activeConversation.status)) return null;

  const saleStatus = activeConversation.sale_status;

  const marcarVenta = async (status) => {
    setSaving(status);
    await supabase
      .from('conversations')
      .update({ sale_status: status, sale_amount: status === 'concretada' ? (total || 0) : null })
      .eq('id', activeConversation.id);
    setSaving(null);
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="text-xs font-semibold text-gray-600 uppercase mb-2">Resultado de la gestión</div>

      {saleStatus && (
        <div
          className={`mb-2 text-xs font-medium px-2 py-1 rounded-full inline-block ${
            saleStatus === 'concretada' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {saleStatus === 'concretada' ? '✅ Venta concretada' : '❌ Venta no concretada'}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => marcarVenta('concretada')}
          disabled={saving === 'concretada'}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
            saleStatus === 'concretada' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          <CheckCircle2 size={14} /> Venta Concretada
        </button>
        <button
          onClick={() => marcarVenta('no_concretada')}
          disabled={saving === 'no_concretada'}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
            saleStatus === 'no_concretada' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
          }`}
        >
          <XCircle size={14} /> Venta No Concretada
        </button>
      </div>
    </div>
  );
}
