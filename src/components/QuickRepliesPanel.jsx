import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react';
import { adminFetch, isAdminRole } from '../lib/adminAuth';
import { confirmDialog, alertDialog } from '../lib/dialogService';

// Mismo componente para admin y sucursal: todas las respuestas rápidas son
// globales (las ve y las usa cualquier cuenta), pero sólo el admin puede
// crearlas/editarlas/borrarlas (el backend en server/routes/quickReplies.js
// rechaza esas operaciones con 403 si no es admin) — acá sólo hace falta
// ocultar los controles de gestión para que una sucursal no los vea siquiera.
export default function QuickRepliesPanel() {

  const soyAdmin = isAdminRole();

  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null); // null = cerrado, 'new' = creando, o el id que se edita
  const [formShortcut, setFormShortcut] = useState('');
  const [formText, setFormText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchReplies = async () => {
    setLoading(true);
    const res = await adminFetch('/api/admin/quick-replies');
    const data = await res.json();
    if (res.ok) setReplies(data.replies || []);
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
      const url = editingId === 'new' ? '/api/admin/quick-replies' : `/api/admin/quick-replies/${editingId}`;
      const method = editingId === 'new' ? 'POST' : 'PUT';
      const res = await adminFetch(url, { method, body: JSON.stringify({ shortcut, messageText: text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error guardando la plantilla.');

      cancelEdit();
      await fetchReplies();
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-QuickRepliesPanel] Error guardando la plantilla:', err);
      setError(err.message || 'Error guardando la plantilla.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmado = await confirmDialog('¿Eliminar esta plantilla? Esta acción no se puede deshacer.', { danger: true, confirmText: 'Eliminar' });
    if (!confirmado) return;
    const res = await adminFetch(`/api/admin/quick-replies/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alertDialog(data.error || 'No se pudo eliminar la plantilla.', { danger: true });
      return;
    }
    fetchReplies();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {soyAdmin
            ? 'El operador las usa escribiendo "/" o tocando el ícono de rayo en el chat. Son globales: las ve y las usa cualquier sucursal.'
            : 'El administrador es quien las gestiona. Vos podés usarlas escribiendo "/" o tocando el ícono de rayo en el chat.'}
        </p>
        {soyAdmin && editingId === null && (
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800 transition-colors shrink-0 ml-3"
          >
            <Plus size={16} /> Nueva plantilla
          </button>
        )}
      </div>

      {soyAdmin && (editingId === 'new' || replies.some(r => r.id === editingId)) && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Atajo</label>
            <input
              type="text"
              value={formShortcut}
              onChange={(e) => { setFormShortcut(e.target.value); }}
              placeholder="/horarios"
              className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Mensaje</label>
            <textarea
              value={formText}
              onChange={(e) => { setFormText(e.target.value); }}
              rows={3}
              placeholder="Texto que se va a insertar en el chat..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-shadow text-sm resize-none"
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
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
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
            <div key={reply.id} className="flex items-start justify-between gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-teal-700 dark:text-teal-400">{reply.shortcut}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">{reply.message_text}</div>
              </div>
              {soyAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(reply)}
                    title="Editar"
                    className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950 rounded-full transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(reply.id)}
                    title="Eliminar"
                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-full transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
