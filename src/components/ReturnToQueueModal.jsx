import React, { useState, useEffect } from 'react';
import { X, Loader2, Send, Undo2 } from 'lucide-react';
import { adminFetch } from '../lib/adminAuth';

// Panel unificado de reasignación de un chat activo, con dos acciones
// independientes:
// 1. Derivar directo a una sucursal puntual que el operador elige (las
//    sucursales cerradas en este momento aparecen deshabilitadas).
// 2. Devolver el chat a la cola general de "En espera" (sin dueño), con un
//    motivo de texto libre OPCIONAL para uso interno — no se le informa nada
//    al cliente, la devolución es completamente silenciosa de cara a él.
export default function ReturnToQueueModal({ isOpen, onClose, onReturnToQueue, onDerivar, miSucursalId }) {

  const [sucursales, setSucursales] = useState([]);
  const [loadingSucursales, setLoadingSucursales] = useState(true);
  const [sucursalDestino, setSucursalDestino] = useState('');
  const [derivando, setDerivando] = useState(false);
  const [errorDerivar, setErrorDerivar] = useState('');

  const [motivoTexto, setMotivoTexto] = useState('');
  const [devolviendo, setDevolviendo] = useState(false);
  const [errorDevolver, setErrorDevolver] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSucursalDestino('');
    setErrorDerivar('');
    setMotivoTexto('');
    setErrorDevolver('');
    setLoadingSucursales(true);
    adminFetch('/api/sucursales')
      .then(res => res.json())
      .then(data => { setSucursales(data.sucursales || []); })
      .catch(err => console.error('❌ [DEBUG-COMPONENT-RETURNTOQUEUEMODAL] Error cargando sucursales:', err))
      .finally(() => setLoadingSucursales(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const busy = derivando || devolviendo;
  // La propia sucursal no tiene sentido como destino de una derivación.
  const sucursalesElegibles = sucursales.filter(s => s.id !== miSucursalId);

  const handleDerivar = async () => {
    if (!sucursalDestino || busy) return;
    setDerivando(true);
    setErrorDerivar('');
    try {
      await onDerivar(sucursalDestino);
      onClose();
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-RETURNTOQUEUEMODAL] Error al derivar:', err);
      setErrorDerivar(err.message || 'No se pudo derivar la consulta.');
    } finally {
      setDerivando(false);
    }
  };

  const handleDevolver = async (e) => {
    e.preventDefault();
    if (busy) return;
    setDevolviendo(true);
    setErrorDevolver('');
    try {
      await onReturnToQueue({ motivoTexto: motivoTexto.trim() || null });
      onClose();
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-RETURNTOQUEUEMODAL] Error al devolver a la cola:', err);
      setErrorDevolver(err.message || 'No se pudo devolver el chat a la cola de espera.');
    } finally {
      setDevolviendo(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 shrink-0">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Reasignar consulta</h3>
          <button
            onClick={() => { onClose(); }}
            disabled={busy}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto scrollbar-thin">
          {/* Sección 1: Derivar a sucursal específica */}
          <div className="space-y-3">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                <Send size={16} className="text-teal-600 dark:text-teal-400" /> Derivar a sucursal específica
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Pasa el chat directamente a otra sucursal. Las que estén cerradas en este momento no se pueden elegir.
              </p>
            </div>

            {loadingSucursales ? (
              <div className="text-sm text-gray-400 dark:text-gray-500 py-1 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Cargando sucursales...
              </div>
            ) : (
              <select
                value={sucursalDestino}
                onChange={(e) => { setSucursalDestino(e.target.value); }}
                disabled={busy}
                className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none disabled:opacity-50"
              >
                <option value="">Elegí una sucursal...</option>
                {sucursalesElegibles.map(s => (
                  <option key={s.id} value={s.id} disabled={!s.abierta_ahora}>
                    {s.nombre}{!s.abierta_ahora ? ' (cerrada ahora)' : ''}
                  </option>
                ))}
              </select>
            )}

            {errorDerivar && <p className="text-sm text-rose-600 dark:text-rose-400">{errorDerivar}</p>}

            <button
              type="button"
              onClick={() => { handleDerivar(); }}
              disabled={!sucursalDestino || busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {derivando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {derivando ? 'Derivando...' : 'Derivar'}
            </button>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          {/* Sección 2: Devolver a la cola general */}
          <form onSubmit={handleDevolver} className="space-y-3">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                <Undo2 size={16} className="text-amber-600 dark:text-amber-400" /> Devolver a la lista de espera
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                El chat vuelve a la cola general para que cualquier sucursal lo pueda tomar. Motivo (opcional, uso interno):
              </p>
            </div>

            <textarea
              value={motivoTexto}
              onChange={(e) => { setMotivoTexto(e.target.value); }}
              placeholder="Ej: no tenemos stock del producto que pidió... (opcional)"
              disabled={busy}
              className="w-full p-3 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none h-24 disabled:opacity-50"
            />

            {errorDevolver && <p className="text-sm text-rose-600 dark:text-rose-400">{errorDevolver}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {devolviendo ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
              {devolviendo ? 'Devolviendo...' : 'Devolver a lista de espera'}
            </button>
          </form>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={() => { onClose(); }}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
