import React, { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AliasPanel() {
  const [alias, setAlias] = useState('');
  const [titular, setTitular] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['alias', 'titular'])
      .then(({ data }) => {
        (data || []).forEach(({ key, value }) => {
          if (key === 'alias') setAlias(value);
          if (key === 'titular') setTitular(value);
        });
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    await supabase
      .from('app_settings')
      .upsert([
        { key: 'alias', value: alias, updated_at: now },
        { key: 'titular', value: titular, updated_at: now }
      ], { onConflict: 'key' });
    setSaving(false);
  };

  if (loading) return <div className="text-sm text-gray-500 p-2">Cargando...</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Configurá el Alias institucional de la farmacia y el nombre del titular de la cuenta. Podés usar las etiquetas <strong>{"{{ALIAS}}"}</strong> y <strong>{"{{TITULAR}}"}</strong> en la plantilla de respuesta rápida si la personalizaste.
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Alias</label>
          <input
            type="text"
            value={alias}
            onChange={e => setAlias(e.target.value)}
            placeholder="Ej: MI.ALIAS"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Titular de la cuenta</label>
          <input
            type="text"
            value={titular}
            onChange={e => setTitular(e.target.value)}
            placeholder="Ej: Farmacia Pago S.A."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving || !alias.trim()}
        className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        Guardar
      </button>
    </div>
  );
}
