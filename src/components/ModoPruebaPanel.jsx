import React, { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import Toggle from './Toggle';
import { NumberBox, msToHms } from './SessionTimeoutPanel';
import { adminFetch } from '../lib/adminAuth';

// Evento global para que App.jsx actualice los tiempos del número de prueba
// (los usa el reloj del chat) sin recargar la página.
export const MODO_PRUEBA_EVENT = 'modo-prueba-actualizado';

const hmsToMs = ({ h, m, s }) => ((Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0)) * 1000;

// Número de prueba: un teléfono que usa tiempos de cierre propios, más cortos,
// para probar el bot sin cambiar los tiempos de los clientes reales (ver
// getModoPrueba en server/services/appConfig.js).
export default function ModoPruebaPanel() {
  const [cargando, setCargando] = useState(true);
  const [activo, setActivo] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [inactividad, setInactividad] = useState({ h: 0, m: 2, s: 0 });
  const [avisoMin, setAvisoMin] = useState(1);
  const [espera, setEspera] = useState({ h: 0, m: 3, s: 0 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/api/modo-prueba')
      .then(res => res.json())
      .then(data => {
        setActivo(!!data.activo);
        setTelefono(data.telefono || '');
        if (data.sessionTimeoutMs) setInactividad(msToHms(data.sessionTimeoutMs));
        setAvisoMin(Math.round((data.sessionPrewarningMs || 0) / 60000));
        if (data.esperaRespuestaMs) setEspera(msToHms(data.esperaRespuestaMs));
      })
      .catch(err => { console.error('❌ [DEBUG-COMPONENT-ModoPruebaPanel] Error leyendo el número de prueba:', err); })
      .finally(() => { setCargando(false); });
  }, []);

  const handleSave = async () => {
    setError('');
    setSaving(true);
    setSaved(false);
    try {
      const body = {
        activo,
        telefono,
        sessionTimeoutMs: hmsToMs(inactividad),
        sessionPrewarningMs: (Number(avisoMin) || 0) * 60000,
        esperaRespuestaMs: hmsToMs(espera)
      };
      const res = await adminFetch('/api/modo-prueba', { method: 'PUT', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el número de prueba.');
      window.dispatchEvent(new CustomEvent(MODO_PRUEBA_EVENT, { detail: data }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el número de prueba.');
    } finally {
      setSaving(false);
    }
  };

  if (cargando) {
    return <div className="text-sm text-gray-400 py-4 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Cargando...</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Las consultas de este número usan los tiempos de abajo en lugar de los generales. Sirve para probar los cierres automáticos sin afectar a los clientes reales, que siguen con sus tiempos normales.
      </p>

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-sm text-gray-700 dark:text-gray-300">Usar tiempos de prueba para este número</span>
        <Toggle checked={activo} onChange={setActivo} />
      </label>

      <div className="space-y-1">
        <label htmlFor="modo-prueba-telefono" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Número de prueba</label>
        <input
          id="modo-prueba-telefono"
          type="tel"
          value={telefono}
          onChange={(e) => { setTelefono(e.target.value); }}
          placeholder="Ej: 3834123456"
          className="w-full max-w-xs p-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
        />
        <span className="block text-xs text-gray-500 dark:text-gray-400">Con código de área, sin 0 ni 15.</span>
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
        <span className="block text-sm text-gray-700 dark:text-gray-300">Tiempo de inactividad</span>
        <div className="flex items-center gap-4">
          <NumberBox label="Horas" value={inactividad.h} onChange={(v) => setInactividad(x => ({ ...x, h: v }))} max={23} />
          <span className="text-2xl text-gray-300 pb-5">:</span>
          <NumberBox label="Minutos" value={inactividad.m} onChange={(v) => setInactividad(x => ({ ...x, m: v }))} max={59} />
          <span className="text-2xl text-gray-300 pb-5">:</span>
          <NumberBox label="Segundos" value={inactividad.s} onChange={(v) => setInactividad(x => ({ ...x, s: v }))} max={59} />
        </div>
        <div className="flex items-center gap-2 pl-1">
          <input
            type="number"
            min="0"
            value={avisoMin}
            onChange={(e) => { setAvisoMin(e.target.value); }}
            className="w-16 text-center px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm font-semibold tabular-nums"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">minutos antes del cierre, aviso "¿Seguís ahí?" (0 = sin aviso)</span>
        </div>
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
        <span className="block text-sm text-gray-700 dark:text-gray-300">Cierre si la farmacia no le responde</span>
        <div className="flex items-center gap-4">
          <NumberBox label="Horas" value={espera.h} onChange={(v) => setEspera(x => ({ ...x, h: v }))} max={23} />
          <span className="text-2xl text-gray-300 pb-5">:</span>
          <NumberBox label="Minutos" value={espera.m} onChange={(v) => setEspera(x => ({ ...x, m: v }))} max={59} />
          <span className="text-2xl text-gray-300 pb-5">:</span>
          <NumberBox label="Segundos" value={espera.s} onChange={(v) => setEspera(x => ({ ...x, s: v }))} max={59} />
        </div>
      </div>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="animate-spin" size={16} /> : saved ? <Check size={16} /> : null}
        {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar cambios'}
      </button>
    </div>
  );
}
