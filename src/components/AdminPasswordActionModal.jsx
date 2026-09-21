import React, { useState, useEffect } from 'react';
import { X, Loader2, ShieldAlert } from 'lucide-react';

// Modal genérico para acciones de moderación del admin que requieren
// re-confirmar la contraseña de la propia cuenta + un motivo obligatorio
// (por ahora, purgar un archivo — ver ChatArea.jsx). Queda como componente
// aparte (no inline) para poder reusarlo tal cual si mañana aparece otra
// acción con la misma forma (motivo + contraseña).
export default function AdminPasswordActionModal({ isOpen, onClose, title, description, motivoPlaceholder, confirmLabel, onConfirm }) {
  const [motivo, setMotivo] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMotivo('');
    setPassword('');
    setError('');
  }, [isOpen]);

  if (!isOpen) return null;

  const isFormValid = motivo.trim().length > 0 && password.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(motivo.trim(), password);
      onClose();
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-AdminPasswordActionModal] Error confirmando la acción:', err);
      setError(err.message || 'No se pudo completar la acción.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-red-50/50 dark:bg-red-950/50 shrink-0">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ShieldAlert size={18} className="text-red-600 dark:text-red-400" />
            {title}
          </h3>
          <button
            onClick={() => { onClose(); }}
            disabled={submitting}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto scrollbar-thin">
          {description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-1">
              Motivo <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => { setMotivo(e.target.value); }}
              placeholder={motivoPlaceholder || 'Explicá el motivo de esta acción...'}
              className="w-full p-3 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none h-20"
              disabled={submitting}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-1">
              Tu contraseña <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              placeholder="Confirmá tu contraseña de administrador"
              className="w-full p-3 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              disabled={submitting}
              required
            />
          </div>

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="mt-2 flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => { onClose(); }}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isFormValid || submitting}
              className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting ? 'Confirmando...' : (confirmLabel || 'Confirmar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
