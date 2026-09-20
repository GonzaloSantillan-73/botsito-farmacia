import React, { useState, useEffect } from 'react';
import { CreditCard, CheckCircle2, PackageSearch, Truck, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { adminFetch } from '../lib/adminAuth';

const ESTADOS_CERRADOS = ['finalizada', 'resolved', 'rejected'];

// Cada paso dispara la plantilla de Respuestas Rápidas con ese shortcut (el
// vendedor puede editar el texto real desde Configuración) y persiste el
// estado correspondiente en conversations.payment_status / order_status.
const PASOS = [
  { key: 'alias', label: 'Enviar Alias', icon: CreditCard, campo: 'payment_status', valor: 'pendiente', shortcut: '/alias' },
  { key: 'pagook', label: 'Pago confirmado', icon: CheckCircle2, campo: 'payment_status', valor: 'confirmado', shortcut: '/pagook' },
  { key: 'armando', label: 'Armando pedido', icon: PackageSearch, campo: 'order_status', valor: 'armando', shortcut: '/armando' },
  { key: 'enviado', label: 'Envío realizado', icon: Truck, campo: 'order_status', valor: 'enviado', shortcut: '/enviado' }
];

// Por si la migración de plantillas todavía no corrió o el vendedor borró
// alguna: sin esto, un panel recién instalado se quedaría sin poder enviar
// nada hasta que las quick_replies existan.
const MENSAJES_DEFAULT = {
  '/alias': 'Para confirmar tu pedido, podés transferir a nuestro Alias: FARMACIA.PAGO. Cuando hagas la transferencia, envianos el comprobante por acá. 🙂',
  '/pagook': '✅ ¡Recibimos tu pago! Ya estamos preparando tu pedido.',
  '/armando': '📦 Estamos armando tu pedido. Te avisamos apenas esté listo para el envío.',
  '/enviado': '🚚 ¡Tu pedido ya salió! En breve debería llegar a tu domicilio.',
  '/demora': '⚠️ Puede que tu pedido demore un poco más de lo esperado. Ante cualquier inconveniente, escribinos por acá y te ayudamos enseguida.'
};

const PAGO_BADGES = {
  pendiente: { label: 'Pendiente', className: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-400' },
  confirmado: { label: 'Confirmado', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' }
};
const ENTREGA_BADGES = {
  armando: { label: 'Armando', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  enviado: { label: 'Enviado', className: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400' }
};
const BADGE_VACIO = { label: 'Sin iniciar', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' };

// Toda venta se cobra por transferencia (Alias): no hay otros medios de
// pago para elegir, así que este valor queda fijo al confirmar el pago.
const MEDIO_PAGO_UNICO = 'Transferencia';

export default function OrderStatusPanel({ activeConversation, handleSendMessage, onPaymentConfirmed }) {

  const [plantillas, setPlantillas] = useState({});
  const [updatingKey, setUpdatingKey] = useState(null);
  const [alias, setAlias] = useState('');
  const [titular, setTitular] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    adminFetch('/api/admin/quick-replies')
      .then(res => res.json())
      .then(data => {
        const relevantes = (data.replies || []).filter(r => Object.keys(MENSAJES_DEFAULT).includes(r.shortcut));
        const map = {};
        // Primero las globales, después las propias de la sucursal (si las
        // personalizó, pisan a la global para esta cuenta específicamente).
        relevantes.filter(r => r.sucursal_id === null).forEach(r => { map[r.shortcut] = r.message_text; });
        relevantes.filter(r => r.sucursal_id !== null).forEach(r => { map[r.shortcut] = r.message_text; });
        setPlantillas(map);
      });

    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['alias', 'titular'])
      .then(({ data, error }) => {
        (data || []).forEach(({ key, value }) => {
          if (key === 'alias') setAlias(value);
          if (key === 'titular') setTitular(value);
        });
      });
  }, []);

  if (!activeConversation || ESTADOS_CERRADOS.includes(activeConversation.status)) return null;

  // El bot todavía está atendiendo esta conversación solo (mismo criterio
  // que esModoBot en ChatArea.jsx): no tiene sentido tocar el estado del
  // pedido de un chat que ni siquiera pasó por un humano todavía.
  const esModoBot = activeConversation.status !== 'esperando' && !activeConversation.sucursal_id;

  const textoDe = (shortcut) => {
    const baseText = plantillas[shortcut] || MENSAJES_DEFAULT[shortcut];
    let textoFinal;
    if (shortcut === '/alias' && alias) {
      if (baseText === MENSAJES_DEFAULT['/alias']) {
        const titularTexto = titular ? ` a nombre de *${titular}*` : '';
        textoFinal = `Para confirmar tu pedido, podés transferir a nuestro Alias: *${alias}*${titularTexto}. Cuando hagas la transferencia, envianos el comprobante por acá. 🙂`;
      } else {
        textoFinal = baseText
          .replace(/\{\{ALIAS\}\}/g, alias)
          .replace(/\{\{TITULAR\}\}/g, titular || '');
      }
    } else {
      textoFinal = baseText;
    }
    return textoFinal;
  };

  const handlePaso = async (paso) => {
    const estadoAnterior = activeConversation[paso.campo];
    setUpdatingKey(paso.key);
    const updates = { [paso.campo]: paso.valor };
    if (paso.key === 'pagook') updates.payment_method = MEDIO_PAGO_UNICO;
    // "Envío realizado" es el momento en que se toma la venta como
    // concretada (a diferencia de antes, que se inferia automáticamente al
    // cerrar la consulta según payment_status): acá es donde el vendedor
    // confirma que el pedido efectivamente salió/se entregó.
    if (paso.key === 'enviado') updates.sale_status = 'concretada';
    const { error } = await supabase.from('conversations').update(updates).eq('id', activeConversation.id);
    const textoPlantilla = textoDe(paso.shortcut);
    handleSendMessage?.(textoPlantilla);
    // Al confirmar el pago se vacía el Cotizador: lo que compre el cliente
    // de acá en adelante es un pedido nuevo, no debe sumarse al ya cobrado.
    if (paso.key === 'pagook') onPaymentConfirmed?.();
    setUpdatingKey(null);
  };

  const handleDemora = () => {
    const textoDemora = textoDe('/demora');
    handleSendMessage?.(textoDemora);
  };

  const pagoBadge = PAGO_BADGES[activeConversation.payment_status] || BADGE_VACIO;
  const entregaBadge = ENTREGA_BADGES[activeConversation.order_status] || BADGE_VACIO;


  return (
    <div className={`p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 ${esModoBot ? 'opacity-60' : ''}`}>
      <button
        onClick={() => { const next = !isOpen; setIsOpen(next); }}
        disabled={esModoBot}
        title={esModoBot ? 'El bot todavía está atendiendo este chat: tomá la consulta para poder cargar el estado del pedido.' : undefined}
        className={`w-full flex items-center justify-between text-left mb-2 outline-none group ${esModoBot ? 'cursor-not-allowed' : ''}`}
      >
        <h3 className="text-md font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Truck size={18} className="text-teal-600 dark:text-teal-400" />
          Estado del Pedido
        </h3>
        {isOpen && !esModoBot ? (
          <ChevronUp size={18} className="text-gray-400 dark:text-gray-500 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors" />
        ) : (
          <ChevronDown size={18} className="text-gray-400 dark:text-gray-500 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors" />
        )}
      </button>

      {isOpen && !esModoBot && (
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
                    activo ? 'bg-teal-600 text-white border-teal-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon size={14} /> {paso.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={handleDemora}
            className="w-full mt-2 flex items-center justify-center gap-1.5 p-2 rounded-lg text-xs font-medium border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
          >
            <AlertTriangle size={14} /> Avisar demora / inconveniente
          </button>
        </div>
      )}
    </div>
  );
}
