import React, { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';

const MENU_PREVIEW = '¿Qué querés hacer?\n\n1. Hablar con un humano\n2. Horarios y sucursales\n3. Actualizar mis datos';

export default function WelcomeMessagePanel() {
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/welcome-message')
      .then(res => res.json())
      .then(data => setWelcomeMessage(data.welcomeMessage || ''))
      .catch(err => console.error('Error obteniendo el mensaje de bienvenida:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const mensaje = welcomeMessage.trim();
    if (!mensaje) {
      setError('El mensaje de bienvenida no puede estar vacío.');
      return;
    }

    setError('');
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch('/api/welcome-message', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ welcomeMessage: mensaje })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el mensaje de bienvenida.');

      setWelcomeMessage(data.welcomeMessage || mensaje);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'Error guardando el mensaje de bienvenida.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Es el saludo que el bot manda al arrancar (o reiniciar) una consulta, antes del menú de opciones.
        El menú numerado de abajo es fijo y se agrega siempre automáticamente.
      </p>

      {loading ? (
        <div className="w-full max-w-md p-2.5 border border-gray-200 rounded-lg text-sm text-gray-400">Cargando...</div>
      ) : (
        <textarea
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="¡Hola! Soy el bot de la Farmacia. 💊"
          className="w-full max-w-md p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm resize-none"
        />
      )}

      <div className="max-w-md p-3 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-500 whitespace-pre-wrap">
        <span className="block font-semibold text-gray-600 mb-1">Vista previa del mensaje completo:</span>
        {(welcomeMessage.trim() || '(tu saludo acá)')}
        {'\n\n'}
        {MENU_PREVIEW}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || loading}
        className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="animate-spin" size={16} /> : saved ? <Check size={16} /> : null}
        {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar cambios'}
      </button>
    </div>
  );
}
