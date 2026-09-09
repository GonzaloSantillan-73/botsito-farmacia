import React, { useState, useEffect } from 'react';
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, Store, Package, Boxes, MapPin, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { adminFetch } from '../lib/adminAuth';

const formatFecha = (iso) =>
  iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

// Una fila de sincronización: dispara su propio POST, muestra spinner
// mientras está en curso y el resultado (éxito o error) al terminar.
function SyncRow({ icon: Icon, titulo, descripcion, onSync, resumen, extra }) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');

  const handleClick = async () => {
    setLoading(true);
    setError('');
    setResultado(null);
    try {
      const data = await onSync();
      setResultado(data);
    } catch (err) {
      setError(err.message || 'No se pudo sincronizar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800">{titulo}</div>
            <div className="text-xs text-gray-500 mt-0.5">{descripcion}</div>
            {extra}
          </div>
        </div>
        <button
          onClick={handleClick}
          disabled={loading}
          className="flex items-center gap-1.5 shrink-0 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {loading ? 'Sincronizando...' : 'Sincronizar ahora'}
        </button>
      </div>

      {resultado && (
        <div className="mt-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          <span>{resumen(resultado)}</span>
        </div>
      )}
      {error && (
        <div className="mt-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// Este panel solo llega a renderizarse si isAdmin es true (queda dentro del
// tab "Administración" de SettingsModal, que ya no existe en el DOM para un
// empleado). Además, cada endpoint vuelve a validar el rol en el backend, así
// que un 403 se muestra igual de prolijo si por algún motivo llegara acá.
export default function PlexSyncPanel() {
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [loadingSucursales, setLoadingSucursales] = useState(true);
  const [estado, setEstado] = useState({});

  // Sucursal contra la que el bot y el Cotizador consultan stock real (no
  // es lo mismo que la elegida arriba para "Stock por Sucursal": esa dispara
  // una sincronización puntual, esta queda guardada como referencia fija).
  const [sucursalStockRef, setSucursalStockRef] = useState('');
  const [guardandoRef, setGuardandoRef] = useState(false);
  const [refGuardada, setRefGuardada] = useState(false);

  const fetchEstado = async () => {
    const [{ data: sucs }, { count: totalProductos }, { data: prodSync }] = await Promise.all([
      supabase.from('plex_sucursales').select('id_sucursal, nombre, synced_at').order('nombre'),
      supabase.from('plex_productos').select('*', { count: 'exact', head: true }),
      supabase.from('plex_productos').select('synced_at').order('synced_at', { ascending: false }).limit(1)
    ]);

    setSucursales(sucs || []);
    setSucursalId(prev => prev || sucs?.[0]?.id_sucursal || '');
    setEstado({
      sucursalesTotal: sucs?.length || 0,
      sucursalesSync: sucs?.[0]?.synced_at || null,
      productosTotal: totalProductos || 0,
      productosSync: prodSync?.[0]?.synced_at || null
    });
    setLoadingSucursales(false);
  };

  useEffect(() => {
    fetchEstado();
    adminFetch('/api/admin/plex/settings/sucursal-stock')
      .then(res => res.json())
      .then(data => setSucursalStockRef(data.idSucursal || ''))
      .catch(() => {});
  }, []);

  const guardarSucursalStockRef = async () => {
    if (!sucursalStockRef) return;
    setGuardandoRef(true);
    setRefGuardada(false);
    try {
      const res = await adminFetch('/api/admin/plex/settings/sucursal-stock', {
        method: 'PUT',
        body: JSON.stringify({ idSucursal: sucursalStockRef })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.');
      setRefGuardada(true);
    } catch (err) {
      alert(err.message || 'No se pudo guardar la sucursal de referencia.');
    } finally {
      setGuardandoRef(false);
    }
  };

  const syncSucursales = async () => {
    const res = await adminFetch('/api/admin/plex/sync/sucursales', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo sincronizar las sucursales.');
    await fetchEstado();
    return data;
  };

  const syncProductos = async () => {
    const res = await adminFetch('/api/admin/plex/sync/productos', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo sincronizar el catálogo.');
    await fetchEstado();
    return data;
  };

  const syncStock = async () => {
    if (!sucursalId) throw new Error('Elegí una sucursal (sincronizá sucursales primero).');
    const res = await adminFetch(`/api/admin/plex/sync/stock/${sucursalId}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo sincronizar el stock.');
    return data;
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Trae datos reales de Plex Concentrador (solo lectura, nunca se le escribe nada) y los guarda como copia local en Supabase. El catálogo excluye automáticamente cualquier sección de drogas o principios activos.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <MapPin size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-800">Sucursal de referencia para stock</div>
            <div className="text-xs text-gray-500 mt-0.5 mb-2">
              El bot de WhatsApp y el Cotizador del CRM informan el stock real de esta sucursal (el cliente no elige sucursal al chatear).
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sucursalStockRef}
                onChange={(e) => { setSucursalStockRef(e.target.value); setRefGuardada(false); }}
                disabled={sucursales.length === 0}
                className="flex-1 max-w-xs px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              >
                <option value="">{sucursales.length === 0 ? 'Sincronizá sucursales primero' : 'Elegí una sucursal'}</option>
                {sucursales.map(s => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>)}
              </select>
              <button
                onClick={guardarSucursalStockRef}
                disabled={guardandoRef || !sucursalStockRef}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                {guardandoRef ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Guardar
              </button>
            </div>
            {refGuardada && <p className="text-xs text-emerald-600 mt-2">Guardado.</p>}
          </div>
        </div>
      </div>

      <SyncRow
        icon={Store}
        titulo="Sucursales"
        descripcion={`${estado.sucursalesTotal || 0} sucursales guardadas${estado.sucursalesSync ? ` · última sincronización ${formatFecha(estado.sucursalesSync)}` : ''}`}
        onSync={syncSucursales}
        resumen={(data) => `${data.total} sucursales sincronizadas.`}
      />

      <SyncRow
        icon={Package}
        titulo="Catálogo de Productos"
        descripcion={`${estado.productosTotal || 0} productos guardados${estado.productosSync ? ` · última sincronización ${formatFecha(estado.productosSync)}` : ''}`}
        onSync={syncProductos}
        resumen={(data) => `${data.guardados} productos guardados, ${data.excluidos} excluidos (drogas/principios activos).`}
      />

      <SyncRow
        icon={Boxes}
        titulo="Stock por Sucursal"
        descripcion="Trae el stock de la sucursal elegida. Los productos excluidos del catálogo tampoco guardan stock."
        onSync={syncStock}
        resumen={(data) => `${data.guardados} productos con stock guardados, ${data.omitidos} omitidos (fuera del catálogo local).`}
        extra={
          <select
            value={sucursalId}
            onChange={(e) => setSucursalId(e.target.value)}
            disabled={loadingSucursales || sucursales.length === 0}
            className="mt-2 w-full max-w-xs px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          >
            {sucursales.length === 0 ? (
              <option value="">Sincronizá sucursales primero</option>
            ) : (
              sucursales.map(s => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>)
            )}
          </select>
        }
      />
    </div>
  );
}
