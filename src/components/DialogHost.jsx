import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, Info } from 'lucide-react';
import { registerDialogHost } from '../lib/dialogService';

// Modal único que reemplaza a window.confirm()/window.alert() en todo el
// CRM (ver dialogService.js). Se monta una sola vez en App.jsx; cualquier
// componente dispara un diálogo llamando a confirmDialog()/alertDialog(),
// sin necesidad de renderizar nada propio.
export default function DialogHost() {

  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    registerDialogHost(setDialog);
    return () => registerDialogHost(null);
  }, []);

  if (!dialog) return null;

  const esConfirm = dialog.type === 'confirm';
  const Icon = esConfirm ? HelpCircle : (dialog.danger ? AlertTriangle : Info);

  const cerrarConfirmando = () => {
    dialog.onConfirm();
    setDialog(null);
  };
  const cerrarCancelando = () => {
    dialog.onCancel && dialog.onCancel();
    setDialog(null);
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 cursor-pointer"
      onClick={esConfirm ? cerrarCancelando : cerrarConfirmando}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm p-5 animate-fade-in-up"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2 rounded-full shrink-0 ${dialog.danger ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400' : 'bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400'}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0 pt-0.5">
            {dialog.title && <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-1">{dialog.title}</h3>}
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{dialog.message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {esConfirm && (
            <button
              onClick={cerrarCancelando}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              {dialog.cancelText}
            </button>
          )}
          <button
            onClick={cerrarConfirmando}
            autoFocus
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${dialog.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'}`}
          >
            {dialog.confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
