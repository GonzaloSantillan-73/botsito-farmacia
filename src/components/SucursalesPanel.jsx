import React, { useState, useEffect } from 'react';
import { Clock, Loader2, Check, X, EyeOff, MapPin, MessageCircle, Store, AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { adminFetch } from '../lib/adminAuth';
import SucursalConfigModal from './SucursalConfigModal';
import { DIAS } from '../lib/dias';

const normalizarWhatsappUrl = (valor) => {
  if (!valor) return null;
  const limpio = valor.trim();
  if (!limpio) return null;
  if (/^https?:\/\//i.test(limpio)) return limpio;
  const soloDigitos = limpio.replace(/\D/g, '');
  return soloDigitos ? `https://wa.me/${soloDigitos}` : null;
};

// CRUD clásico de sucursales: nombre, dirección, maps/whatsapp, horario y
// credenciales de acceso del personal (todo esto último desde el modal
// "Configurar"). Ya no dependen de ningún catálogo externo.
export default function SucursalesPanel() {
  console.log('🔍 [DEBUG-COMPONENT-SucursalesPanel] Render — props: (ninguna)');

  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalSucursal, setModalSucursal] = useState(null);
  const [mostrarModalNueva, setMostrarModalNueva] = useState(false);

  const [editingHorarioId, setEditingHorarioId] = useState(null);
  const [horarioForm, setHorarioForm] = useState(null);
  const [savingHorario, setSavingHorario] = useState(false);
  const [errorHorario, setErrorHorario] = useState('');

  const fetchSucursales = async () => {
    console.log('📡 [DEBUG-COMPONENT-SucursalesPanel] fetchSucursales() — GET /api/admin/staff/sucursales');
    setLoading(true);
    const res = await adminFetch('/api/admin/staff/sucursales');
    const data = await res.json();
    console.log('📡 [DEBUG-COMPONENT-SucursalesPanel] fetchSucursales() — respuesta:', { ok: res.ok, status: res.status, data });
    setSucursales(data.sucursales || []);
    setLoading(false);
  };

  useEffect(() => {
    console.log('🔄 [DEBUG-COMPONENT-SucursalesPanel] useEffect(carga inicial) disparado — deps: [] (solo al montar)');
    fetchSucursales();
  }, []);

  const eliminarSucursal = async (s) => {
    console.log('🖱️ [DEBUG-COMPONENT-SucursalesPanel] eliminarSucursal() — sucursal:', { id: s.id, nombre: s.nombre });
    if (!window.confirm(`¿Eliminar la sucursal "${s.nombre}"? Se van a eliminar también sus accesos de personal.`)) return;
    console.log('📡 [DEBUG-COMPONENT-SucursalesPanel] CRUD sucursal (DELETE) — request:', { url: `/api/admin/staff/sucursales/${s.id}`, method: 'DELETE' });
    const res = await adminFetch(`/api/admin/staff/sucursales/${s.id}`, { method: 'DELETE' });
    console.log('📡 [DEBUG-COMPONENT-SucursalesPanel] CRUD sucursal (DELETE) — respuesta:', { ok: res.ok, status: res.status });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('❌ [DEBUG-COMPONENT-SucursalesPanel] Error eliminando sucursal:', data);
      alert(data.error || 'No se pudo eliminar la sucursal.');
      return;
    }
    console.log('✅ [DEBUG-COMPONENT-SucursalesPanel] Sucursal eliminada — id:', s.id);
    await fetchSucursales();
  };

  const startEditHorario = (s) => {
    console.log('🖱️ [DEBUG-COMPONENT-SucursalesPanel] startEditHorario() — sucursal id:', s.id, 'valores actuales:', { dias: s.dias, hora_apertura: s.hora_apertura, hora_cierre: s.hora_cierre, activo: s.activo });
    setEditingHorarioId(s.id);
    setHorarioForm({ dias: s.dias, hora_apertura: s.hora_apertura, hora_cierre: s.hora_cierre, activo: s.activo });
    setErrorHorario('');
  };
  const cancelEditHorario = () => {
    console.log('🖱️ [DEBUG-COMPONENT-SucursalesPanel] cancelEditHorario()');
    setEditingHorarioId(null); setHorarioForm(null); setErrorHorario('');
  };
  const toggleDia = (d) => {
    const dias = horarioForm.dias.includes(d) ? horarioForm.dias.filter(x => x !== d) : [...horarioForm.dias, d];
    console.log('🖱️ [DEBUG-COMPONENT-SucursalesPanel] toggleDia() — día:', d, '-> dias:', dias);
    setHorarioForm({ ...horarioForm, dias });
  };
  const guardarHorario = async () => {
    console.log('🖱️ [DEBUG-COMPONENT-SucursalesPanel] guardarHorario() — sucursal id:', editingHorarioId, 'form:', horarioForm);
    if (horarioForm.dias.length === 0) { setErrorHorario('Elegí al menos un día de atención.'); return; }
    setSavingHorario(true);
    setErrorHorario('');
    console.log('📡 [DEBUG-COMPONENT-SucursalesPanel] Supabase UPDATE sucursales — params:', { table: 'sucursales', id: editingHorarioId, updates: { dias: horarioForm.dias, hora_apertura: horarioForm.hora_apertura, hora_cierre: horarioForm.hora_cierre, activo: horarioForm.activo } });
    const { error } = await supabase
      .from('sucursales')
      .update({ dias: horarioForm.dias, hora_apertura: horarioForm.hora_apertura, hora_cierre: horarioForm.hora_cierre, activo: horarioForm.activo })
      .eq('id', editingHorarioId);
    console.log('📡 [DEBUG-COMPONENT-SucursalesPanel] Supabase UPDATE sucursales — respuesta:', { error });
    setSavingHorario(false);
    if (error) { console.error('❌ [DEBUG-COMPONENT-SucursalesPanel] Error guardando horario:', error); setErrorHorario(error.message || 'Error guardando el horario.'); return; }
    console.log('✅ [DEBUG-COMPONENT-SucursalesPanel] Horario guardado correctamente');
    cancelEditHorario();
    await fetchSucursales();
  };

  console.log('🔍 [DEBUG-COMPONENT-SucursalesPanel] Render lista de sucursales — cantidad:', sucursales.length);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Dirección, horario y credenciales de acceso del personal de cada sucursal. Desde "Configurar" cargás todo eso, incluido el usuario/contraseña de quien atenderá sus chats derivados.
        </p>
        <button
          onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-SucursalesPanel] click Nueva sucursal'); setMostrarModalNueva(true); }}
          className="flex items-center gap-1.5 shrink-0 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        >
          <Plus size={14} /> Nueva sucursal
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Cargando sucursales...</div>
      ) : sucursales.length === 0 ? (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900 rounded-lg p-3">
          Todavía no hay sucursales cargadas. Creá la primera con "Nueva sucursal".
        </div>
      ) : (
        <div className="space-y-3">
          {sucursales.map(s => {
            const empleados = s.staff_users || [];
            const estaConfigurada = Boolean(s.direccion) && empleados.length > 0;
            return (
              <div key={s.id} className="p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Store size={14} className="text-teal-600 dark:text-teal-400 shrink-0" />
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{s.nombre}</span>
                      {estaConfigurada ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900 px-1.5 py-0.5 rounded whitespace-nowrap">
                          <CheckCircle2 size={10} /> Configurada
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900 px-1.5 py-0.5 rounded whitespace-nowrap">
                          <AlertTriangle size={10} /> No disponible
                        </span>
                      )}
                      {!s.activo && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                          <EyeOff size={10} /> Oculta
                        </span>
                      )}
                    </div>
                    {s.direccion && <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{s.direccion}</div>}
                    {!estaConfigurada && empleados.length === 0 && (
                      <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Sin credenciales de personal: nadie puede atender sus chats derivados todavía.</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-SucursalesPanel] click Configurar — sucursal id:', s.id); setModalSucursal(s); }}
                      className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 whitespace-nowrap"
                    >
                      Configurar
                    </button>
                    <button
                      onClick={() => eliminarSucursal(s)}
                      title="Eliminar sucursal"
                      className="text-gray-400 hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-3">
                  {(s.google_maps_url || s.whatsapp_url) && (
                    <div className="flex items-center gap-3">
                      {s.google_maps_url && (
                        <a href={s.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 hover:underline">
                          <MapPin size={13} /> Ver en Maps
                        </a>
                      )}
                      {normalizarWhatsappUrl(s.whatsapp_url) && (
                        <a href={normalizarWhatsappUrl(s.whatsapp_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline">
                          <MessageCircle size={13} /> WhatsApp
                        </a>
                      )}
                    </div>
                  )}

                  {/* Horario */}
                  {editingHorarioId === s.id ? (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {DIAS.map(d => (
                          <button key={d.value} type="button" onClick={() => toggleDia(d.value)}
                            className={`w-8 h-8 rounded-full text-xs font-semibold transition-colors ${horarioForm.dias.includes(d.value) ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'}`}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        <input type="time" value={horarioForm.hora_apertura} onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-SucursalesPanel] horarioForm.hora_apertura ->', e.target.value); setHorarioForm({ ...horarioForm, hora_apertura: e.target.value }); }}
                          className="px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded text-xs" />
                        <span className="text-gray-400 text-xs">a</span>
                        <input type="time" value={horarioForm.hora_cierre} onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-SucursalesPanel] horarioForm.hora_cierre ->', e.target.value); setHorarioForm({ ...horarioForm, hora_cierre: e.target.value }); }}
                          className="px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded text-xs" />
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input type="checkbox" checked={horarioForm.activo} onChange={(e) => { console.log('🔄 [DEBUG-COMPONENT-SucursalesPanel] horarioForm.activo ->', e.target.checked); setHorarioForm({ ...horarioForm, activo: e.target.checked }); }} className="accent-teal-600" />
                          Visible para el bot
                        </label>
                      </div>
                      {errorHorario && <p className="text-xs text-rose-600 dark:text-rose-400">{errorHorario}</p>}
                      <div className="flex items-center gap-2">
                        <button onClick={guardarHorario} disabled={savingHorario} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1 rounded text-xs font-medium disabled:opacity-50">
                          {savingHorario ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
                        </button>
                        <button onClick={cancelEditHorario} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 text-xs">
                          <X size={12} /> Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <Clock size={12} />
                        {DIAS.filter(d => s.dias.includes(d.value)).map(d => d.label).join(' ')} · {s.hora_apertura} a {s.hora_cierre}hs
                      </div>
                      <button onClick={() => startEditHorario(s)} className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300">Editar horario</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalSucursal && (
        <SucursalConfigModal
          sucursal={modalSucursal}
          onClose={() => { console.log('🖱️ [DEBUG-COMPONENT-SucursalesPanel] cerrar modal configurar sucursal'); setModalSucursal(null); }}
          onSaved={fetchSucursales}
        />
      )}

      {mostrarModalNueva && (
        <SucursalConfigModal
          sucursal={null}
          onClose={() => { console.log('🖱️ [DEBUG-COMPONENT-SucursalesPanel] cerrar modal nueva sucursal'); setMostrarModalNueva(false); }}
          onSaved={fetchSucursales}
        />
      )}
    </div>
  );
}
