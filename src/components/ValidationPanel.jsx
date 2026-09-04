import React, { useState } from 'react';
import { CheckCircle, XCircle, User, Phone, Info, Image as ImageIcon, Calculator, Trash2, Plus, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { formatPhone } from '../lib/formatPhone';

// Estados en los que la conversación ya está cerrada (mismo criterio que en ChatArea/Sidebar).
const ESTADOS_CERRADOS = ['finalizada', 'resolved', 'rejected'];

export default function ValidationPanel({
  activeConversation,
  activePrescription,
  prescriptionObraSocial,
  setPrescriptionObraSocial,
  prescriptionNotes,
  setPrescriptionNotes,
  handleUpdatePrescription,
  setModalImage,
  handleSendMessage
}) {
  const [showRejectOptions, setShowRejectOptions] = useState(false);
  const [rejectReason, setRejectReason] = useState('Ilegible');
  const [isQuoteOpen, setIsQuoteOpen] = useState(true);

  // Quote State
  const [quoteItems, setQuoteItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDiscount, setNewItemDiscount] = useState('0');

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
      discount: parseInt(newItemDiscount)
    }]);
    setNewItemName('');
    setNewItemPrice('');
    setNewItemDiscount('0');
  };

  const handleRemoveQuoteItem = (id) => {
    setQuoteItems(quoteItems.filter(item => item.id !== id));
  };

  const subtotal = quoteItems.reduce((acc, item) => acc + item.price, 0);
  const totalDiscount = quoteItems.reduce((acc, item) => acc + (item.price * (item.discount / 100)), 0);
  const total = subtotal - totalDiscount;

  const handleSendQuote = () => {
    if (quoteItems.length === 0) return;
    
    let message = `📋 *Cotización de Receta*\n\n`;
    quoteItems.forEach(item => {
      const itemDiscount = item.price * (item.discount / 100);
      const itemFinal = item.price - itemDiscount;
      message += `- ${item.name}:\n`;
      message += `  Precio: $${item.price.toFixed(2)}\n`;
      if (item.discount > 0) {
        message += `  Desc. OS (${item.discount}%): -$${itemDiscount.toFixed(2)}\n`;
      }
      message += `  Subtotal: $${itemFinal.toFixed(2)}\n\n`;
    });
    
    message += `💰 *Subtotal:* $${subtotal.toFixed(2)}\n`;
    if (totalDiscount > 0) {
      message += `📉 *Descuento Total:* -$${totalDiscount.toFixed(2)}\n`;
    }
    message += `💲 *Total a Pagar:* $${total.toFixed(2)}\n`;
    
    if (handleSendMessage) {
      handleSendMessage(message);
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
             <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2 flex items-center gap-2">
               <Info size={20} className="text-gray-400"/>
               Datos del Cliente
            </h3>
            {activeConversation ? (
               <div className="space-y-6 mt-6">
                  <div className="flex flex-col items-center">
                     <div className="w-20 h-20 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center text-2xl font-bold shadow-sm mb-3 uppercase">
                        {(activeConversation.client_name || '?').charAt(0)}
                     </div>
                     <h4 className="font-bold text-lg">{activeConversation.client_name}</h4>
                     <span className="text-sm text-gray-500 flex items-center gap-1"><Phone size={14}/> {formatPhone(activeConversation.client_phone)}</span>
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
                  <div className="col-span-12">
                    <input 
                      type="text" 
                      placeholder="Medicamento / Producto" 
                      className="w-full text-sm p-2 border border-gray-300 rounded focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                    />
                  </div>
                  <div className="col-span-5">
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
                  <div className="col-span-5">
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
                          <span className="text-xs text-gray-500">${item.price.toFixed(2)} - {item.discount}% desc</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-gray-900">
                            ${(item.price - (item.price * item.discount / 100)).toFixed(2)}
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
                    <div className="flex justify-between font-bold text-lg text-gray-900 pt-1">
                      <span>Total:</span>
                      <span>${total.toFixed(2)}</span>
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
      </div>
    </div>
  );
}
