import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShoppingBag, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';

const formatMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

// Historial de pedidos cotizados: cada fila es una cotización que un
// operador armó y envió desde el Cotizador (ValidationPanel), con sus items,
// precios, cantidades, descuentos y si tuvo envío gratis. Vive en la tabla
// `pedidos_cotizados`, vinculada por client_phone (no por conversación), así
// que agrupa todo lo cotizado a ese cliente sin importar en qué consulta.
export default function OrderHistoryPanel({ clientPhone, clientName, onClose }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientPhone) return;
    setLoading(true);
    supabase
      .from('pedidos_cotizados')
      .select('*')
      .eq('client_phone', clientPhone)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPedidos(data || []);
        setLoading(false);
      });
  }, [clientPhone]);

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[82vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-bold">
            <ShoppingBag size={20} className="text-teal-600" />
            Historial de pedidos{clientName ? ` — ${clientName}` : ''}
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-[#f8f9fa]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">Cargando...</div>
          ) : pedidos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ShoppingBag size={40} className="mb-3 text-gray-300" />
              <p className="text-sm text-center">Este cliente todavía no tiene pedidos cotizados registrados.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pedidos.map(pedido => (
                <div key={pedido.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-800">
                      {new Date(pedido.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {pedido.envio_gratis ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 whitespace-nowrap">
                        <Truck size={12} /> Envío gratis
                      </span>
                    ) : pedido.costo_envio > 0 ? (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap">
                        Envío: {formatMoney(pedido.costo_envio)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500 whitespace-nowrap">
                        Sin envío
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 mb-3">
                    {(pedido.items || []).map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-sm gap-3">
                        <span className="text-gray-700 truncate">
                          {item.nombre} <span className="text-gray-400">x{item.cantidad}</span>
                          {item.descuento_pct > 0 && (
                            <span className="text-emerald-600 text-xs ml-1">(-{item.descuento_pct}%)</span>
                          )}
                        </span>
                        <span className="font-medium text-gray-900 whitespace-nowrap">
                          {formatMoney(item.precio_unitario)} c/u · {formatMoney(item.total_item)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-sm">
                    <span className="text-gray-500">
                      Subtotal: {formatMoney(pedido.subtotal)}
                      {pedido.descuento_total > 0 && (
                        <span className="text-emerald-600"> · Desc: -{formatMoney(pedido.descuento_total)}</span>
                      )}
                    </span>
                    <span className="font-bold text-gray-900">Total: {formatMoney(pedido.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
