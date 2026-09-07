import React, { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';

const msToHms = (ms) => {
  const totalSeconds = Math.max(0, Math.round((ms ?? 0) / 1000));
  return {
    h: Math.floor(totalSeconds / 3600),
    m: Math.floor((totalSeconds % 3600) / 60),
    s: totalSeconds % 60
  };
};

const NumberBox = ({ label, value, onChange, max }) => (
  <div className="flex flex-col items-center">
    <input
      type="number"
      min="0"
      max={max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-16 text-center px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-lg font-semibold tabular-nums"
    />
    <span className="text-[11px] text-gray-500 uppercase font-medium mt-1">{label}</span>
  </div>
);

export default function SessionTimeoutPanel({ sessionTimeoutMs, onSave }) {
  const [hours, setHours] = useState(0);
  const [mins, setMins] = useState(0);
  const [secs, setSecs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (sessionTimeoutMs != null) {
      const { h, m, s } = msToHms(sessionTimeoutMs);
      setHours(h);
      setMins(m);
      setSecs(s);
    }
  }, [sessionTimeoutMs]);

  const handleSave = async () => {
    const totalMs = ((Number(hours) || 0) * 3600 + (Number(mins) || 0) * 60 + (Number(secs) || 0)) * 1000;

    if (totalMs <= 0) {
      setError('El tiempo de inactividad debe ser mayor a 0.');
      return;
    }

    setError('');
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch('/api/session-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionTimeoutMs: totalMs })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el tiempo de inactividad.');

      onSave && onSave(totalMs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'Error guardando el tiempo de inactividad.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Si un cliente no escribe nada durante este tiempo, la consulta se cierra automáticamente y pasa al Historial.
      </p>

      <div className="flex items-center gap-4">
        <NumberBox label="Horas" value={hours} onChange={setHours} max={23} />
        <span className="text-2xl text-gray-300 pb-5">:</span>
        <NumberBox label="Minutos" value={mins} onChange={setMins} max={59} />
        <span className="text-2xl text-gray-300 pb-5">:</span>
        <NumberBox label="Segundos" value={secs} onChange={setSecs} max={59} />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

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
