import React, { useState, useEffect, useCallback } from 'react';
import { ShieldBan, ArrowLeft, RefreshCw, Loader2, ShieldOff, History } from 'lucide-react';
import { formatPhone } from '../lib/formatPhone';
import { supabase } from '../lib/supabase';
import { confirmDialog, alertDialog } from '../lib/dialogService';
import ClientHistoryList from './ClientHistoryList';

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Pestaña "Clientes bloqueados" del Directorio (sólo admin, ver
// ClientDirectory.jsx). A diferencia de "Lista de Clientes", el bloqueo NO
// vive en `clientes` sino en clientes_bloqueados (ver
// supabase/moderacion_bloqueo_clientes.sql): mientras exista esa fila, el
// bot no le responde nada a ese teléfono (server/routes/webhook.js) y no se
// lo puede derivar a ninguna sucursal.
export default function BlockedClientsPanel({ onOpenConversation }) {
  const [bloqueados, setBloqueados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [conversaciones, setConversaciones] = useState([]);
  const [loadingConversaciones, setLoadingConversaciones] = useState(false);
  const [desbloqueando, setDesbloqueando] = useState(false);

  const fetchBloqueados = useCallback(async () => {
    const { data: filas, error } = await supabase
      .from('clientes_bloqueados')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('❌ [DEBUG-COMPONENT-BlockedClientsPanel] Error cargando clientes_bloqueados:', error);
      setBloqueados([]);
      return;
    }

    const phones = (filas || []).map(f => f.client_phone);
    let nombrePorTelefono = {};
    if (phones.length > 0) {
      const { data: fichas, error: fichasError } = await supabase
        .from('clientes')
        .select('client_phone, nombre_completo')
        .in('client_phone', phones);
      if (fichasError) {
        console.error('❌ [DEBUG-COMPONENT-BlockedClientsPanel] Error cargando nombres de clientes:', fichasError);
      } else {
        nombrePorTelefono = Object.fromEntries((fichas || []).map(f => [f.client_phone, f.nombre_completo]));
      }
    }

    setBloqueados((filas || []).map(f => ({ ...f, real_name: nombrePorTelefono[f.client_phone] || null })));
  }, []);

  useEffect(() => {
    fetchBloqueados().finally(() => setLoading(false));
  }, [fetchBloqueados]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBloqueados().finally(() => setRefreshing(false));
  };

  const selected = selectedPhone ? bloqueados.find(b => b.client_phone === selectedPhone) : null;

  // Al abrir el detalle de un cliente bloqueado se trae su historial completo
  // (sin restricción de sucursal: el admin tiene acceso transversal, mismo
  // criterio que el resto del Directorio) para poder mostrarlo debajo del
  // chat reportado.
  useEffect(() => {
    if (!selectedPhone) {
      setConversaciones([]);
      return;
    }
    setLoadingConversaciones(true);
    supabase
      .from('conversations')
      .select('*')
      .eq('client_phone', selectedPhone)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('❌ [DEBUG-COMPONENT-BlockedClientsPanel] Error cargando conversations del cliente bloqueado:', error);
        setConversaciones(data || []);
        setLoadingConversaciones(false);
      });
  }, [selectedPhone]);

  const handleDesbloquear = async () => {
    if (!selected || desbloqueando) return;
    const ok = await confirmDialog(
      `¿Desbloquear a ${selected.real_name || formatPhone(selected.client_phone)}? Va a recuperar el acceso al bot y a las sucursales de inmediato.`,
      { confirmText: 'Desbloquear' }
    );
    if (!ok) return;

    setDesbloqueando(true);
    const { error } = await supabase.from('clientes_bloqueados').delete().eq('client_phone', selected.client_phone);
    setDesbloqueando(false);
    if (error) {
      console.error('❌ [DEBUG-COMPONENT-BlockedClientsPanel] Error desbloqueando cliente:', error);
      alertDialog('No se pudo desbloquear al cliente.', { danger: true });
      return;
    }
    setBloqueados(prev => prev.filter(b => b.client_phone !== selected.client_phone));
    setSelectedPhone(null);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm py-10">
        Cargando clientes bloqueados...
      </div>
    );
  }

  // --- Detalle de un cliente bloqueado ---
  if (selected) {
    return (
      <div>
        <button
          onClick={() => { setSelectedPhone(null); }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-teal-700 dark:hover:text-teal-400 transition-colors mb-4"
        >
          <ArrowLeft size={16} /> Volver a Clientes bloqueados
        </button>

        <div className="mb-4">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">{selected.real_name || formatPhone(selected.client_phone)}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{formatPhone(selected.client_phone)}</p>
        </div>

        <div className="p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 mb-6">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold text-sm mb-2">
            <ShieldBan size={16} /> Motivo del bloqueo
          </div>
          <p className="text-sm text-red-800 dark:text-red-300 mb-3">{selected.motivo}</p>
          <p className="text-xs text-red-600/80 dark:text-red-400/80 mb-3">
            Bloqueado por {selected.blocked_by_username} el {formatDateTime(selected.created_at)}
          </p>
          <button
            onClick={handleDesbloquear}
            disabled={desbloqueando}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900 transition-colors disabled:opacity-50"
          >
            {desbloqueando ? <Loader2 size={16} className="animate-spin" /> : <ShieldOff size={16} />}
            {desbloqueando ? 'Desbloqueando...' : 'Desbloquear'}
          </button>
        </div>

        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
          <History size={15} /> Historial de consultas
        </h4>
        {/* pinnedId: el chat reportado que originó el bloqueo va siempre
            primero, el resto del historial queda ordenado por fecha como de
            costumbre (ver ClientHistoryList.jsx). */}
        <ClientHistoryList
          conversations={conversaciones}
          onSelect={(conv) => { onOpenConversation && onOpenConversation(conv); }}
          loading={loadingConversaciones}
          emptyMessage="Este cliente no tiene otras consultas."
          pinnedId={selected.reported_conversation_id}
        />
      </div>
    );
  }

  // --- Lista general ---
  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Actualizar"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {bloqueados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <ShieldBan size={48} className="mb-3 text-gray-300" />
          <p className="text-sm">No hay clientes bloqueados.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
                <th className="px-4 py-3 font-medium">Bloqueado por</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {bloqueados.map(b => (
                <tr
                  key={b.id}
                  onClick={() => { setSelectedPhone(b.client_phone); }}
                  className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-red-50/40 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {b.real_name || formatPhone(b.client_phone)}
                    <span className="block text-xs font-normal text-gray-400 dark:text-gray-500">{formatPhone(b.client_phone)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">{b.motivo}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{b.blocked_by_username}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDateTime(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
