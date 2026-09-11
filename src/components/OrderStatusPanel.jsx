import React, { useState, useEffect } from 'react';
import { CreditCard, CheckCircle2, PackageSearch, Truck, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ESTADOS_CERRADOS = ['finalizada', 'resolved', 'rejected'];

// Cada paso dispara la plantilla de Respuestas Rápidas con ese shortcut (el
// vendedor puede editar el texto real desde Configuración) y persiste el
// estado correspondiente en conversations.payment_status / order_status.
const PASOS = [
  { key: 'cbu', label: 'Enviar CBU/Alias', icon: CreditCard, campo: 'payment_status', valor: 'pendiente', shortcut: '/cbu' },
  { key: 'pagook', label: 'Pago confirmado', icon: CheckCircle2, campo: 'payment_status', valor: 'confirmado', shortcut: '/pagook' },
  { key: 'armando', label: 'Armando pedido', icon: PackageSearch, campo: 'order_status', valor: 'armando', shortcut: '/armando' },
  { key: 'enviado', label: 'Envío realizado', icon: Truck, campo: 'order_status', valor: 'enviado', shortcut: '/enviado' }
];

// Por si la migración de plantillas todavía no corrió o el vendedor borró
// alguna: sin esto, un panel recién instalado se quedaría sin poder enviar
// nada hasta que las quick_replies existan.
const MENSAJES_DEFAULT = {
  '/cbu': 'Para confirmar tu pedido, podés transferir a nuestro CBU: 0000000000000000000000, Alias: FARMACIA.PAGO. Cuando hagas la transferencia, envianos el comprobante por acá. 🙂',
  '/pagook': '✅ ¡Recibimos tu pago! Ya estamos preparando tu pedido.',
  '/armando': '📦 Estamos armando tu pedido. Te avisamos apenas esté listo para el envío.',
  '/enviado': '🚚 ¡Tu pedido ya salió! En breve debería llegar a tu domicilio.',
  '/demora': '⚠️ Puede que tu pedido demore un poco más de lo esperado. Ante cualquier inconveniente, escribinos por acá y te ayudamos enseguida.'
};

const PAGO_BADGES = {
  pendiente: { label: 'Pendiente', className: 'bg-sky-50 text-sky-700' },
  confirmado: { label: 'Confirmado', className: 'bg-emerald-50 text-emerald-700' }
};
const ENTREGA_BADGES = {
  armando: { label: 'Armando', className: 'bg-amber-50 text-amber-700' },
  enviado: { label: 'Enviado', className: 'bg-teal-50 text-teal-700' }
};
const BADGE_VACIO = { label: 'Sin iniciar', className: 'bg-gray-100 text-gray-500' };

export default function OrderStatusPanel({ activeConversation, handleSendMessage }) {
  const [plantillas, setPlantillas] = useState({});
  const [updatingKey, setUpdatingKey] = useState(null);
  const [cbuAlias, setCbuAlias] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    supabase
      .from('quick_replies')
      .select('shortcut, message_text')
      .in('shortcut', Object.keys(MENSAJES_DEFAULT))
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => { map[r.shortcut] = r.message_text; });
        setPlantillas(map);
      });

    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'cbu_alias')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCbuAlias(data.value);
      });
  }, []);

  if (!activeConversation || ESTADOS_CERRADOS.includes(activeConversation.status)) return null;

  const textoDe = (shortcut) => {
    let baseText = plantillas[shortcut] || MENSAJES_DEFAULT[shortcut];
    if (shortcut === '/cbu' && cbuAlias) {
      if (baseText === MENSAJES_DEFAULT['/cbu']) {
        return `Para confirmar tu pedido, podés transferir a nuestro CBU/Alias: *${cbuAlias}*. Cuando hagas la transferencia, envianos el comprobante por acá. 🙂`;
      }
      if (baseText.includes('{{CBU}}')) {
        return baseText.replace(/\{\{CBU\}\}/g, cbuAlias);
      }
    }
    return baseText;
  };

  const handlePaso = async (paso) => {
    setUpdatingKey(paso.key);
    await supabase.from('conversations').update({ [paso.campo]: paso.valor }).eq('id', activeConversation.id);
    handleSendMessage?.(textoDe(paso.shortcut));
    setUpdatingKey(null);
  };

  const handleDemora = () => {
    handleSendMessage?.(textoDe('/demora'));
  };

  const pagoBadge = PAGO_BADGES[activeConversation.payment_status] || BADGE_VACIO;
  const entregaBadge = ENTREGA_BADGES[activeConversation.order_status] || BADGE_VACIO;

  return (
    <div className="p-6 border-t border-gray-200 bg-white">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left mb-2 outline-none group"
      >
        <h3 className="text-md font-bold text-gray-900 flex items-center gap-2">
          <Truck size={18} className="text-teal-600" />
          Estado del Pedido
        </h3>
        {isOpen ? (
          <ChevronUp size={18} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
        ) : (
          <ChevronDown size={18} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
        )}
      </button>

      {isOpen && (
        <div className="animate-fade-in-up mt-3">
          <div className="flex items-center gap-2 mb-4 text-xs">
            <span className={`px-2 py-1 rounded-full font-medium ${pagoBadge.className}`}>Pago: {pagoBadge.label}</span>
            <span className={`px-2 py-1 rounded-full font-medium ${entregaBadge.className}`}>Entrega: {entregaBadge.label}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PASOS.map(paso => {
              const Icon = paso.icon;
              const activo = activeConversation[paso.campo] === paso.valor;
              return (
                <button
                  key={paso.key}
                  onClick={() => handlePaso(paso)}
                  disabled={updatingKey === paso.key}
                  className={`flex items-center gap-1.5 justify-center p-2.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                    activo ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={14} /> {paso.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={handleDemora}
            className="w-full mt-2 flex items-center justify-center gap-1.5 p-2 rounded-lg text-xs font-medium border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
          >
            <AlertTriangle size={14} /> Avisar demora / inconveniente
          </button>
        </div>
      )}
    </div>
  );
}
