import React, { useState, useEffect } from 'react';
import { Clock, Loader2, Check, X, EyeOff, MapPin, MessageCircle, Store, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { adminFetch } from '../lib/adminAuth';
import SucursalConfigModal from './SucursalConfigModal';

const DIAS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' }
];

const normalizarWhatsappUrl = (valor) => {
  if (!valor) return null;
  const limpio = valor.trim();
  if (!limpio) return null;
  if (/^https?:\/\//i.test(limpio)) return limpio;
  const soloDigitos = limpio.replace(/\D/g, '');
  return soloDigitos ? `https://wa.me/${soloDigitos}` : null;
};

// Lista TODAS las sucursales reales de Plex. Cada una muestra su estado
// ("Configurada" cuando tiene dirección y al menos un acceso de personal
// cargado, "No disponible" si le falta algo) y un botón "Configurar" que abre
// el modal flotante (SucursalConfigModal) con ubicación + credenciales.
export default function SucursalesPanel() {
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalSucursal, setModalSucursal] = useState(null);

  const [editingHorarioId, setEditingHorarioId] = useState(null);
  const [horarioForm, setHorarioForm] = useState(null);
  const [savingHorario, setSavingHorario] = useState(false);
  const [errorHorario, setErrorHorario] = useState('');

  const fetchSucursales = async () => {
    setLoading(true);
    const res = await adminFetch('/api/admin/staff/sucursales-plex');
    const data = await res.json();
    setSucursales(data.sucursales || []);
    setLoading(false);
  };

  useEffect(() => { fetchSucursales(); }, []);

  const startEditHorario = (s) => {
    setEditingHorarioId(s.id);
    setHorarioForm({ dias: s.dias, hora_apertura: s.hora_apertura, hora_cierre: s.hora_cierre, activo: s.activo });
    setErrorHorario('');
  };
  const cancelEditHorario = () => { setEditingHorarioId(null); setHorarioForm(null); setErrorHorario(''); };
  const toggleDia = (d) => {
    const dias = horarioForm.dias.includes(d) ? horarioForm.dias.filter(x => x !== d) : [...horarioForm.dias, d];
    setHorarioForm({ ...horarioForm, dias });
  };
  const guardarHorario = async () => {
    if (horarioForm.dias.length === 0) { setErrorHorario('Elegí al menos un día de atención.'); return; }
    setSavingHorario(true);
    setErrorHorario('');
    const { error } = await supabase
      .from('sucursales')
      .update({ dias: horarioForm.dias, hora_apertura: horarioForm.hora_apertura, hora_cierre: horarioForm.hora_cierre, activo: horarioForm.activo })
      .eq('id', editingHorarioId);
    setSavingHorario(false);
    if (error) { setErrorHorario(error.message || 'Error guardando el horario.'); return; }
    cancelEditHorario();
    await fetchSucursales();
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Estas son todas las sucursales reales sincronizadas desde Plex. Desde "Configurar" cargás la dirección, las coordenadas (las usa el bot para calcular la sucursal más cercana al cliente) y las credenciales de acceso del personal que atenderá sus chats derivados.
      </p>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Cargando sucursales...</div>
      ) : sucursales.length === 0 ? (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Todavía no hay sucursales sincronizadas. Sincronizalas primero desde "Sincronización Plex".
        </div>
      ) : (
        <div className="space-y-3">
          {sucursales.map(ps => {
            const config = ps.configuracion;
            const empleados = config?.staff_users || [];
            // "No disponible" si falta información/credenciales, o si el
            // último intento de sincronizar su stock desde Plex falló.
            const stockSyncFallo = ps.stockSyncOk === false;
            const estaConfigurada = Boolean(config?.direccion) && empleados.length > 0 && !stockSyncFallo;
            return (
              <div key={ps.idSucursalPlex} className="p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Store size={14} className="text-teal-600 shrink-0" />
                      <span className="text-sm font-semibold text-gray-800 truncate">{ps.nombrePlex}</span>
                      {estaConfigurada ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                          <CheckCircle2 size={10} /> Configurada
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                          <AlertTriangle size={10} /> No disponible
                        </span>
                      )}
                      {config && !config.activo && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          <EyeOff size={10} /> Oculta
                        </span>
                      )}
                    </div>
                    {config?.direccion && <div className="text-xs text-gray-600 mt-0.5">{config.direccion}</div>}
                    {config && (config.latitud == null || config.longitud == null) && (
                      <div className="text-[11px] text-amber-600 mt-0.5">Sin coordenadas: el bot no puede calcular cercanía a esta sucursal todavía.</div>
                    )}
                    {stockSyncFallo && (
                      <div className="text-[11px] text-rose-600 mt-0.5">
                        Último intento de sincronizar el stock falló: {ps.stockSyncError || 'error desconocido'}.
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setModalSucursal(ps)}
                    className="text-xs font-medium text-teal-700 hover:text-teal-800 shrink-0 whitespace-nowrap"
                  >
                    Configurar
                  </button>
                </div>

                {config && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                    {(config.google_maps_url || config.whatsapp_url) && (
                      <div className="flex items-center gap-3">
                        {config.google_maps_url && (
                          <a href={config.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-800 hover:underline">
                            <MapPin size={13} /> Ver en Maps
                          </a>
                        )}
                        {normalizarWhatsappUrl(config.whatsapp_url) && (
                          <a href={normalizarWhatsappUrl(config.whatsapp_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800 hover:underline">
                            <MessageCircle size={13} /> WhatsApp
                          </a>
                        )}
                      </div>
                    )}

                    {/* Horario */}
                    {editingHorarioId === config.id ? (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {DIAS.map(d => (
                            <button key={d.value} type="button" onClick={() => toggleDia(d.value)}
                              className={`w-8 h-8 rounded-full text-xs font-semibold transition-colors ${horarioForm.dias.includes(d.value) ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                              {d.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-3">
                          <input type="time" value={horarioForm.hora_apertura} onChange={(e) => setHorarioForm({ ...horarioForm, hora_apertura: e.target.value })}
                            className="px-2 py-1 border border-gray-300 rounded text-xs" />
                          <span className="text-gray-400 text-xs">a</span>
                          <input type="time" value={horarioForm.hora_cierre} onChange={(e) => setHorarioForm({ ...horarioForm, hora_cierre: e.target.value })}
                            className="px-2 py-1 border border-gray-300 rounded text-xs" />
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                            <input type="checkbox" checked={horarioForm.activo} onChange={(e) => setHorarioForm({ ...horarioForm, activo: e.target.checked })} className="accent-teal-600" />
                            Visible para el bot
                          </label>
                        </div>
                        {errorHorario && <p className="text-xs text-rose-600">{errorHorario}</p>}
                        <div className="flex items-center gap-2">
                          <button onClick={guardarHorario} disabled={savingHorario} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1 rounded text-xs font-medium disabled:opacity-50">
                            {savingHorario ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
                          </button>
                          <button onClick={cancelEditHorario} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-xs">
                            <X size={12} /> Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500 flex items-center gap-1.5">
                          <Clock size={12} />
                          {DIAS.filter(d => config.dias.includes(d.value)).map(d => d.label).join(' ')} · {config.hora_apertura} a {config.hora_cierre}hs
                        </div>
                        <button onClick={() => startEditHorario(config)} className="text-xs font-medium text-teal-700 hover:text-teal-800">Editar horario</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalSucursal && (
        <SucursalConfigModal
          sucursalPlex={modalSucursal}
          onClose={() => setModalSucursal(null)}
          onSaved={fetchSucursales}
        />
      )}
    </div>
  );
}
