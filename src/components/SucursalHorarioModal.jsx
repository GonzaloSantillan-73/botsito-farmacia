import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, Clock, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DIAS } from '../lib/dias';
import { validarFranjasDia, normalizarDia } from '../lib/horarioSucursal';
import Toggle from './Toggle';

// Arma el estado inicial con las 7 claves ('0'..'6') siempre presentes, cada
// una como { abierta24hs, franjas } (ver normalizarDia en
// src/lib/horarioSucursal.js), para no tener que chequear undefined ni
// distintas formas de dato en todos lados.
const normalizarHorarios = (horariosDias) => {
  const base = {};
  for (let d = 0; d <= 6; d++) {
    const info = normalizarDia(horariosDias?.[String(d)]);
    base[String(d)] = { abierta24hs: info.abierta24hs, franjas: info.franjas.map(f => ({ inicio: f.inicio, fin: f.fin })) };
  }
  return base;
};

// Modal flotante independiente para editar sólo el horario de atención de
// UNA sucursal:
// - "Abierto 24hs" (arriba de todo) es el override global: 24/7 todos los
//   días, sin excepción.
// - Cada día de la semana tiene su propio toggle "Abierto 24hs" (dentro del
//   panel que despliega la flecha "v"), independiente del global — permite
//   que, por ejemplo, sólo el sábado sea 24hs.
// - Si un día no es 24hs, se le configuran hasta 2 franjas horarias
//   ("horario cortado", ej. mañana y tarde).
// Sólo un panel de día abierto a la vez (acordeón).
export default function SucursalHorarioModal({ sucursal, onClose, onSaved }) {

  const [abierta24hs, setAbierta24hs] = useState(sucursal.abierta_24hs || false);
  const [horarios, setHorarios] = useState(() => normalizarHorarios(sucursal.horarios_dias));
  const [diaAbierto, setDiaAbierto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const infoDia = (d) => horarios[String(d)];
  const tieneServicio = (d) => { const info = infoDia(d); return info.abierta24hs || info.franjas.length > 0; };

  // La burbuja del día prende/apaga ese día por completo: al prenderlo se le
  // da una franja default (09:00 a 18:00) para no abrir el panel vacío; al
  // apagarlo se le vacían las franjas, se le saca el 24hs propio y, si tenía
  // el panel abierto, se cierra.
  const toggleDiaActivo = (d) => {
    const key = String(d);
    const activo = tieneServicio(d);
    setHorarios(prev => ({
      ...prev,
      [key]: activo ? { abierta24hs: false, franjas: [] } : { abierta24hs: false, franjas: [{ inicio: '09:00', fin: '18:00' }] }
    }));
    setDiaAbierto(prev => (activo && prev === d ? null : prev));
    setError('');
  };

  // La flecha "v" despliega el panel de ESE día y cierra cualquier otro que
  // estuviera abierto (nunca hay más de uno abierto a la vez). Si el día
  // todavía no tenía ningún servicio, se le da una franja default para que
  // el panel no se abra vacío.
  const toggleDiaAbierto = (d) => {
    setDiaAbierto(prev => (prev === d ? null : d));
    if (!tieneServicio(d)) {
      const key = String(d);
      setHorarios(prev => ({ ...prev, [key]: { abierta24hs: false, franjas: [{ inicio: '09:00', fin: '18:00' }] } }));
    }
    setError('');
  };

  const toggleDia24hs = (d) => {
    const key = String(d);
    setHorarios(prev => ({ ...prev, [key]: { ...prev[key], abierta24hs: !prev[key].abierta24hs } }));
  };

  const actualizarFranja = (d, idx, campo, valor) => {
    const key = String(d);
    setHorarios(prev => {
      const franjas = [...prev[key].franjas];
      franjas[idx] = { ...franjas[idx], [campo]: valor };
      return { ...prev, [key]: { ...prev[key], franjas } };
    });
  };

  const agregarFranja = (d) => {
    const key = String(d);
    setHorarios(prev => {
      if (prev[key].franjas.length >= 2) return prev;
      return { ...prev, [key]: { ...prev[key], franjas: [...prev[key].franjas, { inicio: '13:00', fin: '18:00' }] } };
    });
  };

  const quitarFranja = (d, idx) => {
    const key = String(d);
    setHorarios(prev => ({ ...prev, [key]: { ...prev[key], franjas: prev[key].franjas.filter((_, i) => i !== idx) } }));
  };

  const handleGuardar = async () => {
    setError('');

    if (!abierta24hs) {
      const algunDiaConServicio = DIAS.some(d => tieneServicio(d.value));
      if (!algunDiaConServicio) {
        setError('Elegí al menos un día de atención.');
        return;
      }
      for (const d of DIAS) {
        const info = infoDia(d.value);
        if (info.abierta24hs) continue;
        const err = validarFranjasDia(info.franjas);
        if (err) {
          setError(`${d.label}: ${err}`);
          setDiaAbierto(d.value);
          return;
        }
      }
    }

    setSaving(true);
    const { error: updateError } = await supabase
      .from('sucursales')
      .update({ abierta_24hs: abierta24hs, horarios_dias: horarios })
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

  const diaAbiertoLabel = DIAS.find(d => d.value === diaAbierto)?.label;
  const infoDiaAbierto = diaAbierto !== null ? infoDia(diaAbierto) : null;
  const errorDiaAbierto = infoDiaAbierto && !infoDiaAbierto.abierta24hs ? validarFranjasDia(infoDiaAbierto.franjas) : null;

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5 min-w-0">
            <Clock size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="truncate">Horario — {sucursal.nombre}</span>
          </h3>
          <button onClick={() => { onClose(); }} disabled={saving} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-full transition-colors shrink-0 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <Toggle checked={abierta24hs} onChange={setAbierta24hs} />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Abierto 24hs (todos los días)</span>
          </label>

          <div className={abierta24hs ? 'opacity-40 pointer-events-none' : ''}>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map(d => (
                <div key={d.value} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    disabled={abierta24hs}
                    onClick={() => toggleDiaActivo(d.value)}
                    title={tieneServicio(d.value) ? `Apagar ${d.label}` : `Prender ${d.label}`}
                    className={`w-9 h-9 rounded-full text-xs font-semibold transition-colors ${tieneServicio(d.value) ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                  >
                    {d.label}
                  </button>
                  <button
                    type="button"
                    disabled={abierta24hs}
                    onClick={() => toggleDiaAbierto(d.value)}
                    title={`Configurar horario de ${d.label}`}
                    className={`p-0.5 rounded-full text-gray-400 hover:text-teal-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${diaAbierto === d.value ? 'text-teal-600' : ''}`}
                  >
                    <ChevronDown size={14} className={`transition-transform ${diaAbierto === d.value ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              ))}
            </div>

            {diaAbierto !== null && infoDiaAbierto && (
              <div className="mt-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">{diaAbiertoLabel}</div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Abierto 24hs este día</span>
                    <Toggle checked={infoDiaAbierto.abierta24hs} onChange={() => toggleDia24hs(diaAbierto)} />
                  </label>
                </div>

                {!infoDiaAbierto.abierta24hs && (
                  <>
                    {infoDiaAbierto.franjas.map((f, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={f.inicio}
                          onChange={(e) => { actualizarFranja(diaAbierto, idx, 'inicio', e.target.value); }}
                          className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                        />
                        <span className="text-gray-400 text-xs">a</span>
                        <input
                          type="time"
                          value={f.fin}
                          onChange={(e) => { actualizarFranja(diaAbierto, idx, 'fin', e.target.value); }}
                          className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                        />
                        {infoDiaAbierto.franjas.length > 1 && (
                          <button
                            onClick={() => { quitarFranja(diaAbierto, idx); }}
                            title="Quitar este horario"
                            className="p-1 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}

                    {infoDiaAbierto.franjas.length < 2 && (
                      <button
                        onClick={() => { agregarFranja(diaAbierto); }}
                        className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                      >
                        <Plus size={13} /> Agregar otro horario
                      </button>
                    )}

                    {errorDiaAbierto && <p className="text-xs text-rose-600 dark:text-rose-400">{errorDiaAbierto}</p>}
                  </>
                )}
              </div>
            )}
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
            disabled={saving}
            className="flex items-center justify-center gap-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <X size={16} /> Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
