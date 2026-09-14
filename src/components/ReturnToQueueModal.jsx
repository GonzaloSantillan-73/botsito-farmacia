import React, { useState } from 'react';
import { X, Loader2, PackageX, MessageSquare } from 'lucide-react';

// Modal obligatorio para devolver un chat activo a la cola general de "En
// espera": el operador tiene que elegir un motivo (no hay forma de cerrarlo
// sin elegir uno) porque ese motivo se le informa al cliente por WhatsApp.
export default function ReturnToQueueModal({ isOpen, onClose, onConfirm }) {
  console.log('🔍 [DEBUG-COMPONENT-ReturnToQueueModal] Render — props:', { isOpen, onClose, onConfirm });

  const [motivo, setMotivo] = useState('');
  const [motivoTexto, setMotivoTexto] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const isFormValid = motivo === 'stock' || (motivo === 'otra' && motivoTexto.trim().length > 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('🖱️ [DEBUG-COMPONENT-ReturnToQueueModal] handleSubmit() — valores:', { motivo, motivoTexto, isFormValid });
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    try {
      const payload = { motivo, motivoTexto: motivo === 'otra' ? motivoTexto.trim() : '' };
      console.log('🖱️ [DEBUG-COMPONENT-ReturnToQueueModal] Llamando a onConfirm() con:', payload);
      await onConfirm(payload);
      console.log('✅ [DEBUG-COMPONENT-ReturnToQueueModal] Chat devuelto a la cola correctamente');
      onClose();
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-ReturnToQueueModal] Error al devolver a la cola:', err);
      setError(err.message || 'No se pudo devolver el chat a la cola de espera.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 shrink-0">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Devolver a la lista de espera</h3>
          <button
            onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-ReturnToQueueModal] click botón cerrar (X)'); onClose(); }}
            disabled={isSubmitting}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto scrollbar-thin">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            El chat vuelve a la cola general para que cualquier sucursal lo pueda tomar. Elegí el motivo por el cual no podés continuar la atención (se le va a informar al cliente):
          </div>

          <div className="space-y-3">
            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${motivo === 'stock' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <input
                type="radio"
                name="motivo_devolucion"
                value="stock"
                checked={motivo === 'stock'}
                onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-ReturnToQueueModal] setMotivo ->', e.target.value); setMotivo(e.target.value); }}
                className="w-4 h-4 text-amber-600 focus:ring-amber-500"
              />
              <div className="flex items-center gap-2">
                <PackageX size={18} className={motivo === 'stock' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'} />
                <span className={`font-medium ${motivo === 'stock' ? 'text-amber-800 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>Falta de stock</span>
              </div>
            </label>

            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${motivo === 'otra' ? 'border-teal-500 bg-teal-50 dark:bg-teal-950' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <input
                type="radio"
                name="motivo_devolucion"
                value="otra"
                checked={motivo === 'otra'}
                onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-ReturnToQueueModal] setMotivo ->', e.target.value); setMotivo(e.target.value); }}
                className="w-4 h-4 text-teal-600 focus:ring-teal-500"
              />
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className={motivo === 'otra' ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400'} />
                <span className={`font-medium ${motivo === 'otra' ? 'text-teal-800 dark:text-teal-400' : 'text-gray-700 dark:text-gray-300'}`}>Otra razón</span>
              </div>
            </label>
          </div>

          {motivo === 'otra' && (
            <div className="animate-fade-in-up">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-1">
                Motivo <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={motivoTexto}
                onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-ReturnToQueueModal] setMotivoTexto ->', e.target.value); setMotivoTexto(e.target.value); }}
                placeholder="Escribí el motivo por el cual no podés continuar la atención..."
                className="w-full p-3 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none h-24"
                required
              />
            </div>
          )}

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-ReturnToQueueModal] click botón Cancelar'); onClose(); }}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Devolviendo...
                </>
              ) : (
                'Devolver a la espera'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
