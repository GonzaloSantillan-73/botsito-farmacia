import React, { useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function CloseChatModal({
  isOpen,
  onClose,
  activeConversation,
  total,
  onConfirmClose
}) {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedStatus) return;
    if (selectedStatus === 'otra' && !reason.trim()) return;

    setIsSubmitting(true);
    
    try {
      // 1. Guardar resultado/motivo en la base de datos
      const updateData = {
        sale_status: selectedStatus === 'otra' ? 'otra' : selectedStatus,
        sale_amount: selectedStatus === 'concretada' ? (total || 0) : null,
        sale_reason: selectedStatus === 'otra' ? reason.trim() : null
      };

      const { error } = await supabase
        .from('conversations')
        .update(updateData)
        .eq('id', activeConversation.id);

      if (error) {
        console.error('Error actualizando el resultado:', error);
        alert('Hubo un error al guardar el resultado de la gestión.');
        return;
      }

      // 2. Finalizar la conversación
      await onConfirmClose();
      
      onClose();
    } catch (err) {
      console.error('Error al confirmar cierre:', err);
      alert('Hubo un error al finalizar la consulta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = selectedStatus && (selectedStatus !== 'otra' || reason.trim().length > 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-900">Finalizar Consulta</h3>
          <button 
            onClick={onClose} 
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="text-sm text-gray-600 mb-2">
            Selecciona el resultado de esta gestión comercial antes de cerrar el chat:
          </div>
          
          <div className="space-y-3">
            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedStatus === 'concretada' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input
                type="radio"
                name="sale_status"
                value="concretada"
                checked={selectedStatus === 'concretada'}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className={selectedStatus === 'concretada' ? 'text-emerald-600' : 'text-gray-400'} />
                <span className={`font-medium ${selectedStatus === 'concretada' ? 'text-emerald-800' : 'text-gray-700'}`}>Venta Concretada</span>
              </div>
            </label>
            
            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedStatus === 'no_concretada' ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input
                type="radio"
                name="sale_status"
                value="no_concretada"
                checked={selectedStatus === 'no_concretada'}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-4 h-4 text-rose-600 focus:ring-rose-500"
              />
              <div className="flex items-center gap-2">
                <XCircle size={18} className={selectedStatus === 'no_concretada' ? 'text-rose-600' : 'text-gray-400'} />
                <span className={`font-medium ${selectedStatus === 'no_concretada' ? 'text-rose-800' : 'text-gray-700'}`}>Venta No Concretada</span>
              </div>
            </label>
            
            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedStatus === 'otra' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input
                type="radio"
                name="sale_status"
                value="otra"
                checked={selectedStatus === 'otra'}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-4 h-4 text-amber-600 focus:ring-amber-500"
              />
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className={selectedStatus === 'otra' ? 'text-amber-600' : 'text-gray-400'} />
                <span className={`font-medium ${selectedStatus === 'otra' ? 'text-amber-800' : 'text-gray-700'}`}>Otra razón</span>
              </div>
            </label>
          </div>
          
          {selectedStatus === 'otra' && (
            <div className="mt-4 animate-fade-in-up">
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                Motivo <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Escribe el motivo por el cual estás cerrando la consulta..."
                className="w-full p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none h-24"
                required
              />
            </div>
          )}
          
          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                'Finalizar Consulta'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
