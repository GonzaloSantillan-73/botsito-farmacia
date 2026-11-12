import React, { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import Toggle from './Toggle';
import { adminFetch } from '../lib/adminAuth';

const inputClass = 'w-full p-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm';

// Saludo que manda el bot apenas el cliente arranca una consulta nueva (ver
// getSaludo en server/services/appConfig.js y enviarSaludo en bot.js).
export default function SaludoPanel() {
  const [cargando, setCargando] = useState(true);
  const [cfg, setCfg] = useState({ activo: true, normal: '', regresoConNombre: '', regresoSinNombre: '', desdeConsulta: 3 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/api/saludo')
      .then(res => res.json())
      .then(data => { if (data && !data.error) setCfg(c => ({ ...c, ...data })); })
      .catch(err => { console.error('❌ [DEBUG-COMPONENT-SaludoPanel] Error leyendo el saludo:', err); })
      .finally(() => { setCargando(false); });
  }, []);

  const set = (campo) => (e) => { const v = e?.target ? e.target.value : e; setCfg(c => ({ ...c, [campo]: v })); };

  const handleSave = async () => {
    setError('');
    setSaving(true);
    setSaved(false);
    try {
      const res = await adminFetch('/api/saludo', { method: 'PUT', body: JSON.stringify({ ...cfg, desdeConsulta: Number(cfg.desdeConsulta) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el saludo.');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el saludo.');
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
        El bot saluda al cliente apenas escribe para empezar una consulta. Se puede usar *negrita* como en WhatsApp.
      </p>

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-sm text-gray-700 dark:text-gray-300">Saludar al cliente</span>
        <Toggle checked={!!cfg.activo} onChange={set('activo')} />
      </label>

      <div className="space-y-1">
        <label htmlFor="saludo-normal" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Saludo</label>
        <textarea id="saludo-normal" rows={2} value={cfg.normal} onChange={set('normal')} className={inputClass} />
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-700 dark:text-gray-300">Saludo de regreso desde la consulta n.º</span>
          <input
            type="number"
            min="2"
            max="100"
            value={cfg.desdeConsulta}
            onChange={set('desdeConsulta')}
            className="w-16 text-center px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm font-semibold tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="saludo-regreso-nombre" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Si tiene nombre registrado</label>
          <textarea id="saludo-regreso-nombre" rows={2} value={cfg.regresoConNombre} onChange={set('regresoConNombre')} className={inputClass} />
          <span className="block text-xs text-gray-500 dark:text-gray-400">{'{nombre}'} se reemplaza por el primer nombre del cliente.</span>
        </div>
        <div className="space-y-1">
          <label htmlFor="saludo-regreso-sin-nombre" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Si todavía no dio su nombre</label>
          <textarea id="saludo-regreso-sin-nombre" rows={2} value={cfg.regresoSinNombre} onChange={set('regresoSinNombre')} className={inputClass} />
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
