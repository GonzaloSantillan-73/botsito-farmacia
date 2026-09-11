import React, { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function CbuAliasPanel() {
  const [cbuAlias, setCbuAlias] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'cbu_alias')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCbuAlias(data.value);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from('app_settings')
      .upsert({ key: 'cbu_alias', value: cbuAlias, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(false);
  };

  if (loading) return <div className="text-sm text-gray-500 p-2">Cargando...</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Configurá el CBU o Alias institucional de la farmacia. Podés usar la etiqueta <strong>{"{{CBU}}"}</strong> en la plantilla de respuesta rápida si la personalizaste.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={cbuAlias}
          onChange={e => setCbuAlias(e.target.value)}
          placeholder="Ej: 000.000.000.000 / MI.ALIAS"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
        />
        <button
          onClick={handleSave}
          disabled={saving || !cbuAlias.trim()}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Guardar
        </button>
      </div>
    </div>
  );
}
