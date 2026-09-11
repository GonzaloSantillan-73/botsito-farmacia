import React, { useState, useEffect } from 'react';
import { NotebookText, IdCard, HeartPulse, Loader2, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Ficha del cliente (datos que el propio bot le pidió por WhatsApp) +
// observaciones internas que carga el operador humano. Todo vive en la
// tabla `clientes`, vinculado por client_phone (no por conversación), así
// que persiste sin importar cuántos chats distintos tenga ese cliente.
export default function ClientNotesPanel({ clientPhone }) {
  const [cliente, setCliente] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    if (!clientPhone) return;
    setLoading(true);
    setSaved(false);
    supabase
      .from('clientes')
      .select('*')
      .eq('client_phone', clientPhone)
      .maybeSingle()
      .then(({ data }) => {
        setCliente(data);
        setNotas(data?.notas_operador || '');
        setLoading(false);
      });
  }, [clientPhone]);

  const handleGuardarNotas = async () => {
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from('clientes')
      .upsert(
        { client_phone: clientPhone, notas_operador: notas, updated_at: new Date().toISOString() },
        { onConflict: 'client_phone' }
      );
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="p-6 border-t border-gray-200 bg-white">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left mb-2 outline-none group"
      >
        <h3 className="text-md font-bold text-gray-900 flex items-center gap-2">
          <NotebookText size={18} className="text-teal-600" />
          Observaciones del Cliente
        </h3>
        {isOpen ? (
          <ChevronUp size={18} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
        ) : (
          <ChevronDown size={18} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
        )}
      </button>

      {isOpen && (
        <div className="animate-fade-in-up mt-3">
          {loading ? (
            <div className="text-sm text-gray-400 py-4 text-center">Cargando...</div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={4}
                placeholder="Notas internas sobre la atención de este cliente (no las ve el cliente)..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm resize-none"
              />

              <button
                onClick={handleGuardarNotas}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white p-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar observaciones'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
