import React, { useState, useEffect } from 'react';
import { Clock, Loader2, Check, X, EyeOff, MapPin, MessageCircle, Store, UserPlus, Trash2, AlertTriangle, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { adminFetch } from '../lib/adminAuth';

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

// Lista TODAS las sucursales reales de Plex. Las que ya tienen configuración
// interna (dirección/maps/coordenadas) muestran horario y empleados; las que
// no, se marcan como "No disponible" con un formulario para darlas de alta.
export default function SucursalesPanel() {
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formsAbiertos, setFormsAbiertos] = useState({});
  const [formData, setFormData] = useState({});
  const [guardando, setGuardando] = useState({});
  const [errores, setErrores] = useState({});

  const [editingHorarioId, setEditingHorarioId] = useState(null);
  const [horarioForm, setHorarioForm] = useState(null);
  const [savingHorario, setSavingHorario] = useState(false);
  const [errorHorario, setErrorHorario] = useState('');

  const [empleadoFormAbierto, setEmpleadoFormAbierto] = useState({});
  const [empleadoForm, setEmpleadoForm] = useState({});
  const [guardandoEmpleado, setGuardandoEmpleado] = useState({});
  const [errorEmpleado, setErrorEmpleado] = useState({});

  const fetchSucursales = async () => {
    setLoading(true);
    const res = await adminFetch('/api/admin/staff/sucursales-plex');
    const data = await res.json();
    setSucursales(data.sucursales || []);
    setLoading(false);
  };

  useEffect(() => { fetchSucursales(); }, []);

  const abrirFormConfig = (ps) => {
    setFormsAbiertos(prev => ({ ...prev, [ps.idSucursalPlex]: true }));
    setFormData(prev => ({
      ...prev,
      [ps.idSucursalPlex]: {
        direccion: ps.configuracion?.direccion || '',
        googleMapsUrl: ps.configuracion?.google_maps_url || '',
        latitud: ps.configuracion?.latitud ?? '',
        longitud: ps.configuracion?.longitud ?? ''
      }
    }));
    setErrores(prev => ({ ...prev, [ps.idSucursalPlex]: '' }));
  };

  const actualizarForm = (idSucursalPlex, campo, valor) => {
    setFormData(prev => ({ ...prev, [idSucursalPlex]: { ...prev[idSucursalPlex], [campo]: valor } }));
  };

  const guardarConfig = async (idSucursalPlex) => {
    const form = formData[idSucursalPlex] || {};
    setGuardando(prev => ({ ...prev, [idSucursalPlex]: true }));
    setErrores(prev => ({ ...prev, [idSucursalPlex]: '' }));
    try {
      const res = await adminFetch(`/api/admin/staff/sucursales-plex/${idSucursalPlex}`, {
        method: 'PUT',
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.');
      setFormsAbiertos(prev => ({ ...prev, [idSucursalPlex]: false }));
      await fetchSucursales();
    } catch (err) {
      setErrores(prev => ({ ...prev, [idSucursalPlex]: err.message || 'No se pudo guardar.' }));
    } finally {
      setGuardando(prev => ({ ...prev, [idSucursalPlex]: false }));
    }
  };

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

  const abrirFormEmpleado = (sucursalId) => {
    setEmpleadoFormAbierto(prev => ({ ...prev, [sucursalId]: !prev[sucursalId] }));
    setEmpleadoForm(prev => ({ ...prev, [sucursalId]: { username: '', password: '' } }));
    setErrorEmpleado(prev => ({ ...prev, [sucursalId]: '' }));
  };

  const guardarEmpleado = async (sucursalId) => {
    const form = empleadoForm[sucursalId] || {};
    if (!form.username?.trim() || !form.password) {
      setErrorEmpleado(prev => ({ ...prev, [sucursalId]: 'Completá usuario y contraseña.' }));
      return;
    }
    setGuardandoEmpleado(prev => ({ ...prev, [sucursalId]: true }));
    setErrorEmpleado(prev => ({ ...prev, [sucursalId]: '' }));
    try {
      const res = await adminFetch('/api/admin/staff', {
        method: 'POST',
        body: JSON.stringify({ sucursalId, username: form.username, password: form.password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el empleado.');
      setEmpleadoFormAbierto(prev => ({ ...prev, [sucursalId]: false }));
      await fetchSucursales();
    } catch (err) {
      setErrorEmpleado(prev => ({ ...prev, [sucursalId]: err.message || 'No se pudo crear el empleado.' }));
    } finally {
      setGuardandoEmpleado(prev => ({ ...prev, [sucursalId]: false }));
    }
  };

  const eliminarEmpleado = async (empleadoId) => {
    if (!window.confirm('¿Eliminar este empleado? Ya no va a poder acceder al CRM.')) return;
    await adminFetch(`/api/admin/staff/${empleadoId}`, { method: 'DELETE' });
    await fetchSucursales();
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Estas son todas las sucursales reales sincronizadas desde Plex. Configurá la dirección y las coordenadas de cada una (las usa el bot para calcular la sucursal más cercana al cliente) y dá de alta a sus empleados.
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
            const formOpen = formsAbiertos[ps.idSucursalPlex];
            const form = formData[ps.idSucursalPlex] || {};
            return (
              <div key={ps.idSucursalPlex} className="p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Store size={14} className="text-teal-600 shrink-0" />
                      <span className="text-sm font-semibold text-gray-800 truncate">{ps.nombrePlex}</span>
                      {!config && (
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
                    {config && <div className="text-xs text-gray-600 mt-0.5">{config.direccion}</div>}
                    {config && (config.latitud == null || config.longitud == null) && (
                      <div className="text-[11px] text-amber-600 mt-0.5">Sin coordenadas: el bot no puede calcular cercanía a esta sucursal todavía.</div>
                    )}
                  </div>
                  <button
                    onClick={() => (formOpen ? setFormsAbiertos(prev => ({ ...prev, [ps.idSucursalPlex]: false })) : abrirFormConfig(ps))}
                    className="text-xs font-medium text-teal-700 hover:text-teal-800 shrink-0 whitespace-nowrap"
                  >
                    {formOpen ? 'Cerrar' : config ? 'Editar ubicación' : 'Configurar'}
                  </button>
                </div>

                {formOpen && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Dirección (ubicación textual)</label>
                      <input
                        type="text"
                        value={form.direccion || ''}
                        onChange={(e) => actualizarForm(ps.idSucursalPlex, 'direccion', e.target.value)}
                        placeholder="Av. Siempre Viva 123"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Link de Google Maps (opcional)</label>
                      <input
                        type="text"
                        value={form.googleMapsUrl || ''}
                        onChange={(e) => actualizarForm(ps.idSucursalPlex, 'googleMapsUrl', e.target.value)}
                        placeholder="https://maps.app.goo.gl/..."
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Latitud</label>
                        <input
                          type="number" step="any"
                          value={form.latitud ?? ''}
                          onChange={(e) => actualizarForm(ps.idSucursalPlex, 'latitud', e.target.value)}
                          placeholder="-31.4201"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Longitud</label>
                        <input
                          type="number" step="any"
                          value={form.longitud ?? ''}
                          onChange={(e) => actualizarForm(ps.idSucursalPlex, 'longitud', e.target.value)}
                          placeholder="-64.1888"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400">La latitud/longitud son necesarias para que el bot calcule la sucursal más cercana al cliente (podés sacarlas de Google Maps: clic derecho sobre el punto → coordenadas).</p>
                    {errores[ps.idSucursalPlex] && <p className="text-xs text-rose-600">{errores[ps.idSucursalPlex]}</p>}
                    <button
                      onClick={() => guardarConfig(ps.idSucursalPlex)}
                      disabled={guardando[ps.idSucursalPlex]}
                      className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {guardando[ps.idSucursalPlex] ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Guardar
                    </button>
                  </div>
                )}

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

                    {/* Empleados */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-gray-500 uppercase">Empleados</span>
                        <button onClick={() => abrirFormEmpleado(config.id)} className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800">
                          <Plus size={12} /> Nuevo empleado
                        </button>
                      </div>

                      {(config.staff_users || []).length === 0 ? (
                        <p className="text-xs text-gray-400">Todavía no hay empleados en esta sucursal.</p>
                      ) : (
                        <div className="space-y-1">
                          {config.staff_users.map(emp => (
                            <div key={emp.id} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-gray-50 rounded text-xs">
                              <span className="flex items-center gap-1.5 text-gray-700"><UserPlus size={12} /> {emp.username}</span>
                              <button onClick={() => eliminarEmpleado(emp.id)} className="text-gray-400 hover:text-rose-600">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {empleadoFormAbierto[config.id] && (
                        <div className="mt-2 space-y-2 bg-gray-50 rounded-lg p-3">
                          <input
                            type="text" placeholder="Usuario"
                            value={empleadoForm[config.id]?.username || ''}
                            onChange={(e) => setEmpleadoForm(prev => ({ ...prev, [config.id]: { ...prev[config.id], username: e.target.value } }))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                          />
                          <input
                            type="password" placeholder="Contraseña (mínimo 6 caracteres)"
                            value={empleadoForm[config.id]?.password || ''}
                            onChange={(e) => setEmpleadoForm(prev => ({ ...prev, [config.id]: { ...prev[config.id], password: e.target.value } }))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                          />
                          {errorEmpleado[config.id] && <p className="text-xs text-rose-600">{errorEmpleado[config.id]}</p>}
                          <button
                            onClick={() => guardarEmpleado(config.id)}
                            disabled={guardandoEmpleado[config.id]}
                            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                          >
                            {guardandoEmpleado[config.id] ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Crear empleado
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
