import React, { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';

const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' }
];

function ScheduleEditor({ title, description, schedule, onChange, showPlaceholderHint }) {
  const toggleDay = (d) => {
    const days = schedule.days.includes(d) ? schedule.days.filter(x => x !== d) : [...schedule.days, d];
    onChange({ ...schedule, days });
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h4 className="font-semibold text-sm text-gray-800">{title}</h4>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={schedule.enabled}
            onChange={(e) => onChange({ ...schedule, enabled: e.target.checked })}
            className="accent-teal-600"
          />
          Restringir horario
        </label>
      </div>

      {!schedule.enabled ? (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">Disponible las 24 horas, los 7 días de la semana.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {DAYS.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`w-9 h-9 rounded-full text-xs font-semibold transition-colors ${
                  schedule.days.includes(d.value) ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 mb-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Desde</label>
              <input
                type="time"
                value={schedule.startTime}
                onChange={(e) => onChange({ ...schedule, startTime: e.target.value })}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Hasta</label>
              <input
                type="time"
                value={schedule.endTime}
                onChange={(e) => onChange({ ...schedule, endTime: e.target.value })}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Mensaje de fuera de horario{showPlaceholderHint && ' (usá {horario} para insertar los días y el rango configurado)'}
            </label>
            <textarea
              value={schedule.message}
              onChange={(e) => onChange({ ...schedule, message: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm resize-none"
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function SchedulePanel() {
  const [botSchedule, setBotSchedule] = useState(null);
  const [humanSchedule, setHumanSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/schedules')
      .then(res => res.json())
      .then(data => {
        setBotSchedule(data.bot);
        setHumanSchedule(data.human);
      })
      .catch(err => console.error('Error obteniendo horarios:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const res = await fetch('/api/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot: botSchedule, human: humanSchedule })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'No se pudieron guardar los horarios.');

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'Error guardando los horarios.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !botSchedule || !humanSchedule) {
    return <div className="text-sm text-gray-400 py-10 text-center">Cargando horarios...</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Horarios de atención</h3>
        <p className="text-xs text-gray-500">
          Configurá cuándo responde el bot automáticamente y cuándo están disponibles los asesores humanos.
        </p>
      </div>

      <ScheduleEditor
        title="Bot"
        description="Fuera de este horario, el bot no procesa mensajes y responde con el aviso configurado."
        schedule={botSchedule}
        onChange={setBotSchedule}
      />

      <ScheduleEditor
        title="Asesores Humanos"
        description='Si un cliente pide hablar con un humano fuera de este horario, el bot le avisa y le pide que deje su consulta.'
        schedule={humanSchedule}
        onChange={setHumanSchedule}
        showPlaceholderHint
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="animate-spin" size={18} /> : saved ? <Check size={18} /> : null}
        {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar cambios'}
      </button>
    </div>
  );
}
