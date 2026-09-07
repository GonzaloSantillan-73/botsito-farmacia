import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function QuickRepliesPanel() {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null); // null = cerrado, 'new' = creando, o el id que se edita
  const [formShortcut, setFormShortcut] = useState('');
  const [formText, setFormText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchReplies = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('quick_replies')
      .select('*')
      .order('shortcut');
    if (!fetchError) setReplies(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchReplies();
  }, []);

  const startNew = () => {
    setEditingId('new');
    setFormShortcut('/');
    setFormText('');
    setError('');
  };

  const startEdit = (reply) => {
    setEditingId(reply.id);
    setFormShortcut(reply.shortcut);
    setFormText(reply.message_text);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormShortcut('');
    setFormText('');
    setError('');
  };

  const handleSave = async () => {
    const shortcut = formShortcut.trim();
    const text = formText.trim();

    if (!shortcut || !text) {
      setError('Completá el atajo y el mensaje.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editingId === 'new') {
        const { error: insertError } = await supabase.from('quick_replies').insert([{ shortcut, message_text: text }]);
        if (insertError) throw insertError;
      } else {
        const { error: updateError } = await supabase.from('quick_replies').update({ shortcut, message_text: text }).eq('id', editingId);
        if (updateError) throw updateError;
      }
      cancelEdit();
      await fetchReplies();
    } catch (err) {
      setError(err.code === '23505' ? 'Ya existe una plantilla con ese atajo.' : (err.message || 'Error guardando la plantilla.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta plantilla? Esta acción no se puede deshacer.')) return;
    await supabase.from('quick_replies').delete().eq('id', id);
    fetchReplies();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-800">Plantillas de respuestas rápidas</h3>
        {editingId === null && (
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800 transition-colors"
          >
            <Plus size={16} /> Nueva plantilla
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        El operador las usa escribiendo "/" o tocando el ícono de rayo en el chat.
      </p>

      {(editingId === 'new' || replies.some(r => r.id === editingId)) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Atajo</label>
            <input
              type="text"
              value={formShortcut}
              onChange={(e) => setFormShortcut(e.target.value)}
              placeholder="/horarios"
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje</label>
            <textarea
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
              rows={3}
              placeholder="Texto que se va a insertar en el chat..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm resize-none"
            />
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Guardar
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <X size={14} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Cargando plantillas...</div>
      ) : replies.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">Todavía no hay plantillas creadas.</div>
      ) : (
        <div className="space-y-2">
          {replies.map(reply => (
            <div key={reply.id} className="flex items-start justify-between gap-3 p-3 bg-white border border-gray-200 rounded-lg">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-teal-700">{reply.shortcut}</div>
                <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{reply.message_text}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => startEdit(reply)}
                  title="Editar"
                  className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(reply.id)}
                  title="Eliminar"
                  className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
