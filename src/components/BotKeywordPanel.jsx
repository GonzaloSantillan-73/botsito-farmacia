import React, { useState, useEffect } from 'react';
import { Loader2, Check, Hash } from 'lucide-react';

export default function BotKeywordPanel() {
  const [botKeyword, setBotKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/bot-config')
      .then(res => res.json())
      .then(data => setBotKeyword(data.botKeyword || 'BOT'))
      .catch(err => console.error('Error obteniendo la palabra clave del bot:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const keyword = botKeyword.trim();
    if (!keyword) {
      setError('La palabra clave del bot no puede estar vacía.');
      return;
    }

    setError('');
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch('/api/bot-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botKeyword: keyword })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la palabra clave.');

      setBotKeyword(data.botKeyword || keyword);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'Error guardando la palabra clave.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Cuando un cliente está hablando con un humano, puede escribir esta palabra para volver a hablar con el bot.
      </p>

      <div className="relative max-w-xs">
        <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        {loading ? (
          <div className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-400">Cargando...</div>
        ) : (
          <input
            type="text"
            value={botKeyword}
            onChange={(e) => setBotKeyword(e.target.value)}
            maxLength={30}
            placeholder="BOT"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm uppercase"
          />
        )}
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
