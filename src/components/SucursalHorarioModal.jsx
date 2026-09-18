import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DIAS } from '../lib/dias';
import Toggle from './Toggle';

// Modal flotante independiente para editar sólo el horario de atención de
// UNA sucursal (abierto 24hs, días, rango horario). Antes se desplegaba
// inline dentro de la tarjeta de la sucursal en SucursalesPanel.jsx; ahora
// vive en su propia ventana para no alargar la lista ni mezclarse con el
// modal general de "Configurar" (nombre/dirección/maps/credenciales).
export default function SucursalHorarioModal({ sucursal, onClose, onSaved }) {

  const [dias, setDias] = useState(sucursal.dias || []);
  const [horaApertura, setHoraApertura] = useState(sucursal.hora_apertura || '09:00');
  const [horaCierre, setHoraCierre] = useState(sucursal.hora_cierre || '18:00');
  const [abierta24hs, setAbierta24hs] = useState(sucursal.abierta_24hs || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleDia = (d) => {
    setDias(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));
  };

  const handleGuardar = async () => {
    if (!abierta24hs && dias.length === 0) {
      setError('Elegí al menos un día de atención.');
      return;
    }

    setSaving(true);
    setError('');
    const { error: updateError } = await supabase
      .from('sucursales')
      .update({ dias, hora_apertura: horaApertura, hora_cierre: horaCierre, abierta_24hs: abierta24hs })
      .eq('id', sucursal.id);
    setSaving(false);

    if (updateError) {
      console.error('❌ [DEBUG-COMPONENT-SucursalHorarioModal] Error guardando el horario:', updateError);
      setError(updateError.message || 'Error guardando el horario.');
      return;
    }

    onSaved();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5 min-w-0">
            <Clock size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="truncate">Horario — {sucursal.nombre}</span>
          </h3>
          <button onClick={() => { onClose(); }} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-full transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <Toggle checked={abierta24hs} onChange={setAbierta24hs} />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Abierto 24hs</span>
          </label>

          <div className={`flex flex-wrap gap-1.5 ${abierta24hs ? 'opacity-40 pointer-events-none' : ''}`}>
            {DIAS.map(d => (
              <button
                key={d.value}
                type="button"
                disabled={abierta24hs}
                onClick={() => toggleDia(d.value)}
                className={`w-9 h-9 rounded-full text-xs font-semibold transition-colors ${dias.includes(d.value) ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className={`flex items-center gap-3 ${abierta24hs ? 'opacity-40 pointer-events-none' : ''}`}>
            <div>
              <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Desde</label>
              <input
                type="time"
                value={horaApertura}
                disabled={abierta24hs}
                onChange={(e) => { setHoraApertura(e.target.value); }}
                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              />
            </div>
            <span className="text-gray-400 text-xs pt-5">a</span>
            <div>
              <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
              <input
                type="time"
                value={horaCierre}
                disabled={abierta24hs}
                onChange={(e) => { setHoraCierre(e.target.value); }}
                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              />
            </div>
          </div>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0 flex items-center gap-2">
          <button
            onClick={handleGuardar}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Guardar
          </button>
          <button
            onClick={() => { onClose(); }}
            className="flex items-center justify-center gap-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <X size={16} /> Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
