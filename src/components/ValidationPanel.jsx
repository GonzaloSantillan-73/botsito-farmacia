import React, { useState } from 'react';
import { CheckCircle, XCircle, User, Phone, Info, Image as ImageIcon, Calculator, Trash2, Plus, Send, ChevronDown, ChevronUp, Truck, UserCircle, IdCard, HeartPulse, Pencil, Save, X, Loader2, CalendarClock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { adminFetch } from '../lib/adminAuth';
import { formatPhone } from '../lib/formatPhone';
import ClientNotesPanel from './ClientNotesPanel';
import OrderStatusPanel from './OrderStatusPanel';
import { SALE_STATUS_BADGES } from './Sidebar';

// Estados en los que la conversación ya está cerrada (mismo criterio que en ChatArea/Sidebar).
const ESTADOS_CERRADOS = ['finalizada', 'resolved', 'rejected'];

// Umbral de envío gratis que usa el Cotizador manual del operador.
const FREE_SHIPPING_THRESHOLD = 20000;

export default function ValidationPanel({
  activeConversation,
  activePrescription,
  prescriptionObraSocial,
  setPrescriptionObraSocial,
  prescriptionNotes,
  setPrescriptionNotes,
  handleUpdatePrescription,
  setModalImage,
  handleSendMessage,
  isAdmin = true
}) {
  const [showRejectOptions, setShowRejectOptions] = useState(false);
  const [rejectReason, setRejectReason] = useState('Ilegible');
  const [isQuoteOpen, setIsQuoteOpen] = useState(true);
  const [isClientDataOpen, setIsClientDataOpen] = useState(true);
  const [clienteData, setClienteData] = useState(null);

  React.useEffect(() => {
    if (!activeConversation?.client_phone) {
      setClienteData(null);
      return;
    }
    supabase
      .from('clientes')
      .select('nombre_completo, dni, obra_social, created_at')
      .eq('client_phone', activeConversation.client_phone)
      .maybeSingle()
      .then(({ data }) => setClienteData(data));
  }, [activeConversation?.client_phone]);

  // Edición de la ficha del cliente (nombre, DNI, obra social y, sólo para el
  // admin, el teléfono). Se guarda contra el backend (no directo a Supabase
  // como el resto del panel) porque ahí es donde se valida el permiso y se
  // re-vincula el historial si el teléfono cambia.
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editDni, setEditDni] = useState('');
  const [editObraSocial, setEditObraSocial] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [clientError, setClientError] = useState('');

  const handleStartEditClient = () => {
    setEditNombre(clienteData?.nombre_completo || activeConversation.real_name || activeConversation.client_name || '');
    setEditDni(clienteData?.dni || '');
    setEditObraSocial(clienteData?.obra_social || '');
    setEditTelefono(activeConversation.client_phone || '');
    setClientError('');
    setIsEditingClient(true);
  };

  const handleCancelEditClient = () => {
    setIsEditingClient(false);
    setClientError('');
  };

  const handleSaveClient = async () => {
    setSavingClient(true);
    setClientError('');
    try {
      const body = {
        nombreCompleto: editNombre,
        dni: editDni,
        obraSocial: editObraSocial
      };
      if (isAdmin && editTelefono.trim() !== activeConversation.client_phone) {
        body.nuevoTelefono = editTelefono;
      }

      const res = await adminFetch(`/api/admin/clientes/${encodeURIComponent(activeConversation.client_phone)}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron guardar los datos del cliente.');

      setClienteData({
        nombre_completo: data.cliente.nombre_completo,
        dni: data.cliente.dni,
        obra_social: data.cliente.obra_social
      });
      setIsEditingClient(false);
      // Si cambió el teléfono, la conversación se actualiza sola vía Realtime
      // (App.jsx escucha UPDATE de `conversations`), no hace falta tocarla acá.
    } catch (err) {
      setClientError(err.message || 'Error guardando los datos del cliente.');
    } finally {
      setSavingClient(false);
    }
  };

  // Quote State
  const [quoteItems, setQuoteItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('1');
  const [newItemDiscount, setNewItemDiscount] = useState('0');
  const [shippingCost, setShippingCost] = useState('');

  const discountOptions = ['0', '40', '70', '100'];

  const rejectionReasons = [
    'Ilegible',
    'Vencida',
    'Falta firma/sello',
    'Obra social no adherida',
    'Otro (especificar en notas)'
  ];

  const handleRejectConfirm = () => {
    handleUpdatePrescription('rejected', rejectReason);
    setShowRejectOptions(false);
  };

  const handleAddQuoteItem = () => {
    if (!newItemName.trim() || !newItemPrice) return;
    setQuoteItems([...quoteItems, {
      id: crypto.randomUUID(),
      name: newItemName,
      price: parseFloat(newItemPrice),
      quantity: Math.max(1, parseInt(newItemQuantity) || 1),
      discount: parseInt(newItemDiscount)
    }]);
    setNewItemName('');
    setNewItemPrice('');
    setNewItemQuantity('1');
    setNewItemDiscount('0');
  };

  const handleRemoveQuoteItem = (id) => {
    setQuoteItems(quoteItems.filter(item => item.id !== id));
  };

  const handleQuoteItemQuantityChange = (id, quantity) => {
    setQuoteItems(quoteItems.map(item =>
      item.id === id ? { ...item, quantity: Math.max(1, parseInt(quantity) || 1) } : item
    ));
  };

  const subtotal = quoteItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const totalDiscount = quoteItems.reduce((acc, item) => acc + (item.price * item.quantity * (item.discount / 100)), 0);
  const totalItems = subtotal - totalDiscount;
  const envioGratis = totalItems > FREE_SHIPPING_THRESHOLD;
  const finalShippingCost = envioGratis ? 0 : (parseFloat(shippingCost) || 0);
  const total = totalItems + finalShippingCost;

  const handleSendQuote = async () => {
    if (quoteItems.length === 0) return;

    let message = `📋 *Cotización de Receta*\n\n`;
    const itemsParaGuardar = [];
    quoteItems.forEach(item => {
      const itemDiscount = item.price * item.quantity * (item.discount / 100);
      const itemFinal = (item.price * item.quantity) - itemDiscount;
      message += `- ${item.name} (x${item.quantity}):\n`;
      message += `  Precio unitario: $${item.price.toFixed(2)}\n`;
      if (item.discount > 0) {
        message += `  Desc. OS (${item.discount}%): -$${itemDiscount.toFixed(2)}\n`;
      }
      message += `  Total: $${itemFinal.toFixed(2)}\n\n`;
      itemsParaGuardar.push({
        nombre: item.name,
        precio_unitario: item.price,
        cantidad: item.quantity,
        descuento_pct: item.discount,
        total_item: itemFinal
      });
    });

    message += `💰 *Subtotal:* $${subtotal.toFixed(2)}\n`;
    if (totalDiscount > 0) {
      message += `📉 *Descuento Total:* -$${totalDiscount.toFixed(2)}\n`;
    }
    if (envioGratis) {
      message += `🚚 *Envío:* $0 (supera los $${FREE_SHIPPING_THRESHOLD.toLocaleString('es-AR')})\n`;
    } else if (finalShippingCost > 0) {
      message += `🛵 *Costo de envío:* $${finalShippingCost.toFixed(2)}\n`;
    }
    message += `💲 *Total a Pagar:* $${total.toFixed(2)}\n`;
    message += envioGratis
      ? `🎉 *¡Envío gratis!* (supera los $${FREE_SHIPPING_THRESHOLD.toLocaleString('es-AR')})\n`
      : `🚚 *Envío gratis* a partir de $${FREE_SHIPPING_THRESHOLD.toLocaleString('es-AR')} (faltan $${(FREE_SHIPPING_THRESHOLD - totalItems).toFixed(2)})\n`;

    if (handleSendMessage) {
      handleSendMessage(message);
    }

    // Además del mensaje de texto al chat, guardamos la cotización de forma
    // estructurada para poder listarla después en el Historial de Pedidos.
    const { error } = await supabase.from('pedidos_cotizados').insert([{
      conversation_id: activeConversation?.id || null,
      client_phone: activeConversation?.client_phone,
      items: itemsParaGuardar,
      subtotal,
      descuento_total: totalDiscount,
      costo_envio: finalShippingCost,
      envio_gratis: envioGratis,
      total
    }]);
    if (error) {
      console.error('Error guardando la cotización en el historial de pedidos:', error);
    }
  };

  return (
    <div className="w-1/4 bg-white border-l border-gray-200 flex flex-col shadow-sm z-10 overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {activePrescription && activePrescription.status === 'pending' ? (
          <div className="p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2 flex items-center gap-2">
               <span className="w-2 h-6 bg-amber-400 rounded-full inline-block"></span>
               Validación de Receta
            </h3>
            
            <div className="bg-gray-50 rounded-xl p-2 mb-6 border border-gray-100">
               <div 
                 className="relative rounded-lg overflow-hidden border border-gray-200 bg-white min-h-[150px] flex items-center justify-center cursor-zoom-in group"
                 onClick={() => setModalImage(activePrescription.image_url)}
               >
                  <img 
                    src={activePrescription.image_url} 
                    alt="Receta Ampliada" 
                    className="w-full h-auto object-contain max-h-64 transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow-sm text-xs font-medium text-gray-600 flex items-center gap-1">
                     <ImageIcon size={14}/> Ampliar
                  </div>
               </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Obra Social / Prepaga</label>
                <input 
                  type="text" 
                  value={prescriptionObraSocial}
                  onChange={(e) => setPrescriptionObraSocial(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none text-sm" 
                  placeholder="Ej: OSDE, IOMA..." 
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Notas del Farmacéutico</label>
                <textarea 
                  value={prescriptionNotes}
                  onChange={(e) => setPrescriptionNotes(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none h-24 resize-none text-sm" 
                  placeholder="Anotaciones internas (si se rechaza por 'Otro', escribe aquí el motivo)..."
                ></textarea>
              </div>

              {!showRejectOptions ? (
                <div className="pt-4 grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handleUpdatePrescription('approved')}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium shadow-sm transition-colors text-sm"
                  >
                    <CheckCircle size={18} /> Aprobar
                  </button>
                  <button 
                    onClick={() => setShowRejectOptions(true)}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium shadow-sm transition-colors text-sm"
                  >
                    <XCircle size={18} /> Rechazar
                  </button>
                </div>
              ) : (
                <div className="pt-4 p-3 border border-red-200 bg-red-50 rounded-lg space-y-3">
                  <label className="block text-xs font-semibold text-red-800 uppercase">Motivo del rechazo</label>
                  <select 
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full p-2 border border-red-300 rounded text-sm text-gray-800 outline-none focus:border-red-500"
                  >
                    {rejectionReasons.map(reason => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setShowRejectOptions(false)}
                      className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleRejectConfirm}
                      className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors shadow-sm"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6">
             <button 
               onClick={() => setIsClientDataOpen(!isClientDataOpen)}
               className="w-full flex items-center justify-between text-left mb-2 outline-none group"
             >
               <h3 className="text-md font-bold text-gray-900 flex items-center gap-2">
                 <UserCircle size={18} className="text-teal-600"/>
                 Datos del Cliente
               </h3>
               {isClientDataOpen ? (
                 <ChevronUp size={18} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
               ) : (
                 <ChevronDown size={18} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
               )}
             </button>
             
             {isClientDataOpen && (
               <div className="animate-fade-in-up mt-3">
                 {activeConversation ? (
                    <div className="space-y-4">
                        <div className="min-w-0">
                          {!isEditingClient && (
                            <div className="flex justify-end mb-1.5">
                              <button
                                onClick={handleStartEditClient}
                                className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
                              >
                                <Pencil size={12} /> Editar datos
                              </button>
                            </div>
                          )}

                          {isEditingClient ? (
                            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 space-y-2.5 text-sm">
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Nombre completo</label>
                                <input
                                  type="text"
                                  value={editNombre}
                                  onChange={(e) => setEditNombre(e.target.value)}
                                  className="w-full p-1.5 border border-gray-300 rounded text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Teléfono</label>
                                <input
                                  type="text"
                                  value={editTelefono}
                                  onChange={(e) => setEditTelefono(e.target.value)}
                                  disabled={!isAdmin}
                                  className="w-full p-1.5 border border-gray-300 rounded text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">
                                  {isAdmin
                                    ? 'Corrige el dato guardado; no cambia el WhatsApp real del cliente.'
                                    : 'Sólo el administrador puede modificar el teléfono.'}
                                </p>
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">DNI</label>
                                <input
                                  type="text"
                                  value={editDni}
                                  onChange={(e) => setEditDni(e.target.value)}
                                  className="w-full p-1.5 border border-gray-300 rounded text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Obra social</label>
                                <input
                                  type="text"
                                  value={editObraSocial}
                                  onChange={(e) => setEditObraSocial(e.target.value)}
                                  className="w-full p-1.5 border border-gray-300 rounded text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                                />
                              </div>

                              {clientError && <p className="text-xs text-rose-600">{clientError}</p>}

                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={handleCancelEditClient}
                                  disabled={savingClient}
                                  className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded font-medium transition-colors disabled:opacity-50"
                                >
                                  <X size={14} /> Cancelar
                                </button>
                                <button
                                  onClick={handleSaveClient}
                                  disabled={savingClient}
                                  className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded font-medium transition-colors disabled:opacity-50"
                                >
                                  {savingClient ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                  {savingClient ? 'Guardando...' : 'Guardar'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 space-y-2.5 text-sm">
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500 flex items-center gap-1.5"><User size={14} className="text-gray-400" /> Nombre</span>
                                <span className="font-medium text-gray-900 truncate max-w-[140px]" title={clienteData?.nombre_completo || activeConversation.real_name || activeConversation.client_name}>
                                  {clienteData?.nombre_completo || activeConversation.real_name || activeConversation.client_name}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500 flex items-center gap-1.5"><Phone size={14} className="text-gray-400" /> Número</span>
                                <span className="font-medium text-gray-800">{formatPhone(activeConversation.client_phone)}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500 flex items-center gap-1.5"><IdCard size={14} className="text-gray-400" /> DNI</span>
                                <span className="font-medium text-gray-800">{clienteData?.dni || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500 flex items-center gap-1.5"><HeartPulse size={14} className="text-gray-400" /> Obra social</span>
                                <span className="font-medium text-gray-800 truncate max-w-[140px]" title={clienteData?.obra_social || 'Ninguna'}>
                                  {clienteData?.obra_social || 'Ninguna'}
                                </span>
                              </div>
                              {clienteData?.created_at && (
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-500 flex items-center gap-1.5"><CalendarClock size={14} className="text-gray-400" /> Cliente desde</span>
                                  <span className="font-medium text-gray-800">
                                    {new Date(clienteData.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                       {activePrescription && activePrescription.status !== 'pending' && (
                         <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <h5 className="text-xs font-bold text-gray-500 uppercase mb-3">Receta Actual</h5>
                            <div className="space-y-2 text-sm">
                               <div className="flex justify-between border-b border-gray-200 pb-2">
                                  <span className="text-gray-600">Estado</span>
                                  <span className={`font-medium ${activePrescription.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                                    {activePrescription.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                                  </span>
                               </div>
                               <div className="flex justify-between pb-1">
                                  <span className="text-gray-600">Obra Social</span>
                                  <span className="font-medium text-teal-600">{activePrescription.obra_social || 'N/A'}</span>
                               </div>
                            </div>
                         </div>
                       )}
                    </div>
                 ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                       <User size={48} className="mb-2 text-gray-300" />
                       <p className="text-sm text-center">Selecciona un chat para ver los detalles del cliente</p>
                    </div>
                 )}
               </div>
             )}
          </div>
        )}

        {/* Cotizador / Preparación (oculto en conversaciones cerradas/Historial) */}
        {activeConversation && !ESTADOS_CERRADOS.includes(activeConversation.status) && (
          <div className="p-6 border-t border-gray-200 bg-[#f8f9fa]">
            <button 
              onClick={() => setIsQuoteOpen(!isQuoteOpen)}
              className="w-full flex items-center justify-between text-left mb-2 outline-none group"
            >
              <h3 className="text-md font-bold text-gray-900 flex items-center gap-2">
                <Calculator size={18} className="text-teal-600" />
                Cotizador / Preparación
              </h3>
              {isQuoteOpen ? (
                <ChevronUp size={18} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
              ) : (
                <ChevronDown size={18} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
              )}
            </button>
            
            {isQuoteOpen && (
              <div className="space-y-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm mt-3 animate-fade-in-up">
                {/* Formulario para agregar item */}
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 relative">
                    <input
                      type="text"
                      placeholder="Medicamento / Producto"
                      className="w-full text-sm p-2 border border-gray-300 rounded focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                    />
                  </div>
                  <div className="col-span-4">
                    <div className="relative">
                      <span className="absolute left-2 top-2 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        placeholder="Precio"
                        className="w-full text-sm pl-6 p-2 border border-gray-300 rounded focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                        value={newItemPrice}
                        onChange={e => setNewItemPrice(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      min="1"
                      placeholder="Cant."
                      title="Cantidad"
                      className="w-full text-sm p-2 border border-gray-300 rounded focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                      value={newItemQuantity}
                      onChange={e => setNewItemQuantity(e.target.value)}
                    />
                  </div>
                  <div className="col-span-3">
                    <select
                      className="w-full text-sm p-2 border border-gray-300 rounded focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none bg-white"
                      value={newItemDiscount}
                      onChange={e => setNewItemDiscount(e.target.value)}
                    >
                      {discountOptions.map(d => (
                        <option key={d} value={d}>{d}% Desc</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <button 
                      onClick={handleAddQuoteItem}
                      disabled={!newItemName || !newItemPrice}
                      className="w-full h-full flex items-center justify-center bg-teal-100 hover:bg-teal-200 text-teal-700 rounded transition-colors disabled:opacity-50"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                {/* Lista de Items */}
                {quoteItems.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-hide">
                    {quoteItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100 text-sm">
                        <div className="flex-1 truncate pr-2">
                          <span className="font-medium text-gray-800 block truncate">{item.name}</span>
                          <span className="text-xs text-gray-500">${item.price.toFixed(2)} c/u{item.discount > 0 ? ` - ${item.discount}% desc` : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            title="Cantidad"
                            className="w-14 text-sm text-center p-1 border border-gray-300 rounded focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                            value={item.quantity}
                            onChange={e => handleQuoteItemQuantityChange(item.id, e.target.value)}
                          />
                          <span className="font-bold text-gray-900 whitespace-nowrap">
                            ${((item.price * item.quantity) - (item.price * item.quantity * item.discount / 100)).toFixed(2)}
                          </span>
                          <button onClick={() => handleRemoveQuoteItem(item.id)} className="text-red-400 hover:text-red-600 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Totales */}
                {quoteItems.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-200 text-sm space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal:</span>
                      <span>${subtotal.toFixed(2)}</span>
                    </div>
                    {totalDiscount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Descuento OS:</span>
                        <span>-${totalDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-gray-600 py-1">
                      <span>Costo de Envío:</span>
                      {envioGratis ? (
                        <span className="text-green-600 font-medium">Bonificado</span>
                      ) : (
                        <div className="flex items-center gap-1 w-24">
                          <span className="text-gray-500">$</span>
                          <input
                            type="number"
                            className="w-full p-1 text-right text-sm border border-gray-300 rounded focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                            value={shippingCost}
                            onChange={e => setShippingCost(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between font-bold text-lg text-gray-900 pt-1 border-t border-gray-100">
                      <span>Total:</span>
                      <span>${total.toFixed(2)}</span>
                    </div>

                    <div className={`flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 mt-2 ${envioGratis ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      <Truck size={14} className="shrink-0" />
                      {envioGratis
                        ? `¡Envío gratis! Supera los $${FREE_SHIPPING_THRESHOLD.toLocaleString('es-AR')}.`
                        : `Faltan $${(FREE_SHIPPING_THRESHOLD - totalItems).toFixed(2)} para envío gratis (a partir de $${FREE_SHIPPING_THRESHOLD.toLocaleString('es-AR')}).`
                      }
                    </div>

                    <button
                      onClick={handleSendQuote}
                      className="w-full mt-3 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white p-2 rounded-lg font-medium transition-colors shadow-sm"
                    >
                      <Send size={16} />
                      Enviar Cotización al Chat
                    </button>
                  </div>
                )}
              </div>
            )}


          </div>
        )}

        {/* Estado del Pedido: seguimiento manual de pago/entrega que lleva el
            vendedor sobre lo cotizado a mano (oculto en conversaciones
            cerradas/Historial, igual que el Cotizador). */}
        <OrderStatusPanel activeConversation={activeConversation} handleSendMessage={handleSendMessage} />

        {/* Observaciones del cliente: notas internas del operador + su ficha
            de datos (nombre/DNI/obra social) cargada por el bot. Persiste
            por cliente (no por conversación), así que se muestra siempre que
            haya un chat abierto, incluso en el Historial. */}
        {activeConversation && (
          <ClientNotesPanel clientPhone={activeConversation.client_phone} />
        )}

        {/* Muestra el motivo de cierre debajo de las observaciones si la conversación finalizó */}
        {activeConversation && activeConversation.sale_status && ESTADOS_CERRADOS.includes(activeConversation.status) && (
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Resultado de la Gestión</h3>
            <div className={`p-3 rounded-lg border ${SALE_STATUS_BADGES[activeConversation.sale_status]?.className.replace('bg-', 'border-').replace('text-', '')}`}>
              <div className="font-semibold text-sm mb-1">{SALE_STATUS_BADGES[activeConversation.sale_status]?.label}</div>
              {(activeConversation.sale_status === 'otra' || activeConversation.sale_reason) && (
                <div className="text-xs text-gray-700 italic border-t border-black/10 mt-2 pt-2">
                  "{activeConversation.sale_reason}"
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
