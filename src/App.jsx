import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { notifyNewEvent } from './lib/notifications';
import { withClientNames } from './lib/clientUtils';

// Components
import Sidebar, { ESTADOS_HISTORIAL } from './components/Sidebar';
import ChatArea from './components/ChatArea';
import ValidationPanel from './components/ValidationPanel';
import ImageModal from './components/ImageModal';
import ClientDirectory from './components/ClientDirectory';
import LoginModal from './components/LoginModal';
import { getAdminToken, clearAdminSession, isAdminRole, getStaffSucursalId, getStaffSucursalNombre, adminFetch } from './lib/adminAuth';

function App() {
  console.log('🔍 [DEBUG-COMPONENT-App] Render');
  const [adminToken, setAdminToken] = useState(() => getAdminToken());

  // Un empleado solo ve conversaciones de su propia sucursal, más las que
  // todavía no tienen sucursal asignada (para poder "tomarlas"). El admin ve
  // todo sin restricción. Se recalcula en cada render (lectura de
  // localStorage, no hooks) para reflejar el login recién hecho.
  const soyStaff = !isAdminRole();
  const miSucursalId = getStaffSucursalId();
  console.log('🔍 [DEBUG-COMPONENT-App] Render — ámbito', { soyStaff, miSucursalId, tieneAdminToken: !!adminToken });

  // El canal de Realtime se suscribe una sola vez (deps [] más abajo), así
  // que su callback capturaría soyStaff/miSucursalId del momento del primer
  // render (antes del login, donde localStorage todavía no tenía sesión).
  // Leemos siempre desde este ref -sincronizado cada vez que el login cambia-
  // para evitar ese closure obsoleto.
  const ambitoRef = useRef({ soyStaff, miSucursalId });
  useEffect(() => {
    console.log('🔍 [DEBUG-COMPONENT-App] useEffect[adminToken] (ambitoRef) disparado', { tieneAdminToken: !!adminToken, soyStaff, miSucursalId });
    ambitoRef.current = { soyStaff, miSucursalId };
  }, [adminToken]);

  const perteneceAMiAmbito = (conv) => {
    const { soyStaff: soy, miSucursalId: mi } = ambitoRef.current;
    const resultado = !soy || !conv.sucursal_id || conv.sucursal_id === mi;
    console.log('🔍 [DEBUG-COMPONENT-App] perteneceAMiAmbito()', { convId: conv?.id, sucursalConv: conv?.sucursal_id, soy, mi, resultado });
    return resultado;
  };

  const [activeTab, setActiveTab] = useState('atendiendo');

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  // Directorio de clientes: independiente de activeTab, para que Entrantes/
  // Atendiendo/Derivados se sigan viendo mientras se muestra el directorio.
  const [showClientDirectory, setShowClientDirectory] = useState(false);
  // Teléfono del cliente cuya ficha hay que reabrir si el operador vuelve
  // atrás desde un chat que abrió desde el historial de ese cliente.
  const [historyReturnPhone, setHistoryReturnPhone] = useState(null);
  
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  
  const [activePrescription, setActivePrescription] = useState(null);
  const [prescriptionNotes, setPrescriptionNotes] = useState('');
  const [prescriptionObraSocial, setPrescriptionObraSocial] = useState('');
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [modalImage, setModalImage] = useState(null);

  // Límite de expiración de sesiones (configurable desde el panel de ajustes).
  const [sessionTimeoutMs, setSessionTimeoutMs] = useState(null);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    console.log('🔍 [DEBUG-COMPONENT-App] useEffect[] (session-config) disparado — montaje inicial');
    console.log('📡 [DEBUG-COMPONENT-App] fetch GET /api/session-config — antes de la llamada');
    fetch('/api/session-config')
      .then(res => res.json())
      .then(data => {
        console.log('📡 [DEBUG-COMPONENT-App] fetch /api/session-config — respuesta', data);
        console.log('🔄 [DEBUG-COMPONENT-App] setSessionTimeoutMs()', data.sessionTimeoutMs);
        setSessionTimeoutMs(data.sessionTimeoutMs);
      })
      .catch(err => console.error('❌ [DEBUG-COMPONENT-App] Error obteniendo config de sesión:', err));
  }, []);

  // Ref con la conversación activa "al día", para poder leerla desde dentro del
  // canal de Realtime sin tener que recrear la suscripción cada vez que cambia.
  const activeConversationRef = useRef(null);
  useEffect(() => {
    console.log('🔍 [DEBUG-COMPONENT-App] useEffect[activeConversation] (activeConversationRef) disparado', { activeConversationId: activeConversation?.id });
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // Ref con la lista de conversaciones "al día", para poder comparar el status
  // anterior de una fila cuando llega un UPDATE por Realtime (el payload de
  // Supabase solo trae el id en payload.old, no el resto de columnas viejas).
  const conversationsRef = useRef([]);
  useEffect(() => {
    console.log('🔍 [DEBUG-COMPONENT-App] useEffect[conversations] (conversationsRef) disparado — cantidad:', conversations.length);
    conversationsRef.current = conversations;
  }, [conversations]);

  // 1. Fetch Initial Data. Depende de adminToken para volver a traer (ya con
  // el filtro de sucursal correcto) apenas el login termina: en el primer
  // render (antes de loguearse) todavía no hay sesión en localStorage, así
  // que un fetch hecho en ese momento ignoraría el filtro por completo.
  useEffect(() => {
    console.log('🔍 [DEBUG-COMPONENT-App] useEffect[adminToken] (fetchConversations) disparado', { tieneAdminToken: !!adminToken });
    if (adminToken) fetchConversations();
  }, [adminToken]);

  // 2. Fetch Messages and Prescription when conversation changes
  useEffect(() => {
    console.log('🔍 [DEBUG-COMPONENT-App] useEffect[activeConversation] (fetchMessages/fetchPrescription) disparado', { activeConversationId: activeConversation?.id });
    if (activeConversation) {
      fetchMessages(activeConversation.id);
      fetchPrescription(activeConversation.id);
    } else {
      console.log('🔄 [DEBUG-COMPONENT-App] setMessages([]) — sin conversación activa');
      setMessages([]);
      console.log('🔄 [DEBUG-COMPONENT-App] setActivePrescription(null) — sin conversación activa');
      setActivePrescription(null);
    }
  }, [activeConversation]);

  // 3. Realtime Subscriptions. Se suscribe UNA sola vez (nunca en base a
  // activeConversation): recrear el canal en cada cambio de conversación activa
  // abría una ventana de desuscripción/resuscripción donde se podían perder o
  // duplicar eventos, dejando filas fantasma en el sidebar.
  useEffect(() => {
    console.log('🔍 [DEBUG-COMPONENT-App] useEffect[] (Realtime subscriptions) disparado — montaje inicial, suscribiendo canal schema-db-changes');
    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          console.log('🔔 [DEBUG-COMPONENT-App] Realtime evento — tabla messages', { eventType: payload.eventType, payload });
          const active = activeConversationRef.current;
          if (active && payload.new?.conversation_id === active.id) {
            if (payload.eventType === 'INSERT') {
              console.log('🔄 [DEBUG-COMPONENT-App] setMessages() — INSERT por Realtime, id:', payload.new.id);
              setMessages(prev => {
                // Prevent duplicate if we just sent it
                if (prev.find(m => m.id === payload.new.id)) return prev;
                return [...prev, payload.new];
              });
              scrollToBottom();
              // Ya la está viendo: un mensaje entrante acá no debe sumar al
              // contador de no leídos (por eso este branch no lo toca).
            } else if (payload.eventType === 'UPDATE') {
              // Actualiza el estado del mensaje (enviado/entregado/leído/error) que
              // llega vía el webhook de "statuses" de Meta, para que los checks del
              // chat cambien en vivo sin recargar la página.
              console.log('🔄 [DEBUG-COMPONENT-App] setMessages() — UPDATE por Realtime, id:', payload.new.id, payload.new);
              setMessages(prev => prev.map(m => (m.id === payload.new.id ? payload.new : m)));
            }
          } else if (payload.eventType === 'INSERT' && payload.new?.sender_type === 'client') {
            // Mensaje entrante de una conversación que el operador no tiene
            // abierta ahora mismo: recontamos desde la base (no sumamos "+1"
            // a mano) para no arriesgarnos a duplicar el conteo si esta
            // conversación se acaba de crear y su evento de alta todavía no
            // se procesó.
            const conv = conversationsRef.current.find(c => c.id === payload.new.conversation_id);
            console.log('🔔 [DEBUG-COMPONENT-App] mensaje entrante de conversación no activa — recontando no leídos', { conversationId: payload.new.conversation_id, lastReadAt: conv?.last_read_at });
            recontarNoLeidos(payload.new.conversation_id, conv?.last_read_at);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          console.log('🔔 [DEBUG-COMPONENT-App] Realtime evento — tabla conversations', { eventType: payload.eventType, payload });
          if (payload.eventType === 'DELETE') {
            console.log('🔄 [DEBUG-COMPONENT-App] setConversations() — DELETE por Realtime, id:', payload.old?.id);
            setConversations(prev => prev.filter(c => c.id !== payload.old?.id));
            if (activeConversationRef.current?.id === payload.old?.id) {
              console.log('🔄 [DEBUG-COMPONENT-App] setActiveConversation(null) — la conversación activa fue eliminada');
              setActiveConversation(null);
            }
            return;
          }

          // Guarda contra un payload malformado (sin id no hay nada que hacer con él).
          if (!payload.new?.id) return;

          // Un empleado no debe ver conversaciones de otra sucursal: si un UPDATE
          // le asigna una sucursal ajena a una fila que sí tenía en su lista, la
          // saca; si es de otra sucursal desde el vamos (INSERT o UPDATE), la ignora.
          if (!perteneceAMiAmbito(payload.new)) {
            console.log('🔔 [DEBUG-COMPONENT-App] conversación fuera de mi ámbito, ignorando/quitando', { conversationId: payload.new.id, sucursalId: payload.new.sucursal_id });
            if (payload.eventType === 'UPDATE') {
              console.log('🔄 [DEBUG-COMPONENT-App] setConversations() — quitando conversación fuera de ámbito, id:', payload.new.id);
              setConversations(prev => prev.filter(c => c.id !== payload.new.id));
              if (activeConversationRef.current?.id === payload.new.id) {
                console.log('🔄 [DEBUG-COMPONENT-App] setActiveConversation(null) — conversación activa quedó fuera de ámbito');
                setActiveConversation(null);
              }
            }
            return;
          }

          if (payload.eventType === 'UPDATE') {
            // Se calcula ANTES de actualizar el estado, comparando contra lo que
            // ya teníamos, para detectar la transición "recién pasó a esperando".
            const previous = conversationsRef.current.find(c => c.id === payload.new.id);
            const empezoAEsperar = payload.new.status === 'esperando' && previous?.status !== 'esperando';
            const nombreYaConocido = previous?.real_name;
            console.log('🔔 [DEBUG-COMPONENT-App] conversations UPDATE — detalle', { conversationId: payload.new.id, statusAnterior: previous?.status, statusNuevo: payload.new.status, empezoAEsperar, nombreYaConocido });

            console.log('🔄 [DEBUG-COMPONENT-App] setConversations() — UPDATE por Realtime, id:', payload.new.id);
            setConversations(prev => {
              const exists = prev.some(c => c.id === payload.new.id);
              // unreadCount es un campo calculado en el cliente (no existe en la
              // fila real): si no lo preservamos acá, cada UPDATE de la conversación
              // (cambia last_message, sucursal_id, lo que sea) lo pisaría con
              // "undefined" al reemplazar la fila entera por payload.new.
              const next = exists
                ? prev.map(c => c.id === payload.new.id ? { ...payload.new, real_name: c.real_name, unreadCount: c.unreadCount } : c)
                : [{ ...payload.new, unreadCount: 0 }, ...prev];
              return next.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            });

            if (activeConversationRef.current?.id === payload.new.id) {
              console.log('🔄 [DEBUG-COMPONENT-App] setActiveConversation() — sincronizando conversación activa con UPDATE de Realtime, id:', payload.new.id);
              setActiveConversation(prev => ({ ...payload.new, real_name: prev.real_name }));
            }

            // El bot guarda el nombre completo del cliente directamente en la tabla
            // `clientes` (ej. durante el registro), sin tocar esa columna acá, así que
            // mientras no lo tengamos ya resuelto en memoria lo reintentamos en cada
            // UPDATE de la conversación (no solo cuando pasa a "esperando").
            if (empezoAEsperar || !nombreYaConocido) {
              console.log('📡 [DEBUG-COMPONENT-App] supabase.from(clientes).select(nombre_completo) — antes de la llamada', { client_phone: payload.new.client_phone });
              supabase.from('clientes').select('nombre_completo').eq('client_phone', payload.new.client_phone).maybeSingle()
                .then(({ data, error }) => {
                  console.log('📡 [DEBUG-COMPONENT-App] supabase.from(clientes).select(nombre_completo) — respuesta', { data, error });
                  if (error) console.error('❌ [DEBUG-COMPONENT-App] error consultando nombre_completo (UPDATE):', error);
                  if (data?.nombre_completo && !nombreYaConocido) {
                    console.log('🔄 [DEBUG-COMPONENT-App] setConversations() — completando real_name tras UPDATE, id:', payload.new.id, data.nombre_completo);
                    setConversations(current => current.map(c =>
                      c.id === payload.new.id ? { ...c, real_name: data.nombre_completo } : c
                    ));
                    if (activeConversationRef.current?.id === payload.new.id) {
                      console.log('🔄 [DEBUG-COMPONENT-App] setActiveConversation() — completando real_name en conversación activa');
                      setActiveConversation(prev => prev ? { ...prev, real_name: data.nombre_completo } : prev);
                    }
                  }
                  if (empezoAEsperar) {
                    const nombre = data?.nombre_completo || payload.new.client_name || payload.new.client_phone || 'Un cliente';
                    console.log('✅ [DEBUG-COMPONENT-App] notifyNewEvent() — cliente esperando asesor:', nombre);
                    notifyNewEvent({
                      title: 'Cliente esperando un asesor',
                      body: `${nombre} quiere hablar con un humano.`
                    });
                  }
                });
            }
          } else if (payload.eventType === 'INSERT') {
            console.log('🔄 [DEBUG-COMPONENT-App] setConversations() — INSERT por Realtime, id:', payload.new.id);
            setConversations(prev => {
              // Evita duplicar si ese id ya está en la lista (ej. un evento repetido).
              if (prev.some(c => c.id === payload.new.id)) return prev;
              return [{ ...payload.new, unreadCount: 0 }, ...prev].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            });
            // Cuenta real (normalmente 1: el mensaje que arrancó esta consulta nueva).
            recontarNoLeidos(payload.new.id, payload.new.last_read_at);

            // Fetch real_name asynchronously and update both conversations list and notifications
            console.log('📡 [DEBUG-COMPONENT-App] supabase.from(clientes).select(nombre_completo) — antes de la llamada (INSERT)', { client_phone: payload.new.client_phone });
            supabase.from('clientes').select('nombre_completo').eq('client_phone', payload.new.client_phone).maybeSingle()
              .then(({ data, error }) => {
                console.log('📡 [DEBUG-COMPONENT-App] supabase.from(clientes).select(nombre_completo) — respuesta (INSERT)', { data, error });
                if (error) console.error('❌ [DEBUG-COMPONENT-App] error consultando nombre_completo (INSERT):', error);
                const nombre = data?.nombre_completo || payload.new.client_name || payload.new.client_phone || 'Un cliente';
                if (data?.nombre_completo) {
                  console.log('🔄 [DEBUG-COMPONENT-App] setConversations() — completando real_name tras INSERT, id:', payload.new.id, data.nombre_completo);
                  setConversations(current => current.map(c =>
                    c.id === payload.new.id ? { ...c, real_name: data.nombre_completo } : c
                  ));
                  if (activeConversationRef.current?.id === payload.new.id) {
                    console.log('🔄 [DEBUG-COMPONENT-App] setActiveConversation() — completando real_name en conversación activa (INSERT)');
                    setActiveConversation(prev => ({ ...prev, real_name: data.nombre_completo }));
                  }
                }
                console.log('✅ [DEBUG-COMPONENT-App] notifyNewEvent() — nuevo chat entrante:', nombre);
                notifyNewEvent({
                  title: 'Nuevo chat entrante',
                  body: `${nombre} inició una conversación.`
                });
              });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prescriptions' },
        (payload) => {
          console.log('🔔 [DEBUG-COMPONENT-App] Realtime evento — tabla prescriptions', { eventType: payload.eventType, payload });
          const active = activeConversationRef.current;
          if (active && payload.new?.conversation_id === active.id) {
             console.log('🔄 [DEBUG-COMPONENT-App] setActivePrescription() — por Realtime, id:', payload.new.id);
             setActivePrescription(payload.new);
             console.log('🔄 [DEBUG-COMPONENT-App] setPrescriptionNotes() — por Realtime:', payload.new.notes || '');
             setPrescriptionNotes(payload.new.notes || '');
             console.log('🔄 [DEBUG-COMPONENT-App] setPrescriptionObraSocial() — por Realtime:', payload.new.obra_social || '');
             setPrescriptionObraSocial(payload.new.obra_social || '');
          }
        }
      )
      .subscribe();

    console.log('✅ [DEBUG-COMPONENT-App] canal schema-db-changes suscripto');

    return () => {
      console.log('🔍 [DEBUG-COMPONENT-App] useEffect[] (Realtime subscriptions) cleanup — removiendo canal schema-db-changes');
      supabase.removeChannel(channel);
    };
  }, []);

  const scrollToBottom = () => {
    console.log('🔍 [DEBUG-COMPONENT-App] scrollToBottom()');
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Seleccionar una conversación (desde el sidebar o desde el directorio de
  // clientes) siempre saca al directorio de en medio, para que el panel
  // central muestre el chat.
  const handleSelectConversation = (conv) => {
    console.log('🖱️ [DEBUG-COMPONENT-App] handleSelectConversation() — conv:', conv?.id);
    console.log('🔄 [DEBUG-COMPONENT-App] setShowClientDirectory(false)');
    setShowClientDirectory(false);
    console.log('🔄 [DEBUG-COMPONENT-App] setHistoryReturnPhone(null)');
    setHistoryReturnPhone(null);
    console.log('🔄 [DEBUG-COMPONENT-App] setActiveConversation()', conv?.id);
    setActiveConversation(conv);
    marcarComoLeida(conv);
  };

  // Igual que handleSelectConversation, pero recordando de qué cliente venía
  // (para que el botón de retroceso del chat pueda volver justo a su ficha).
  const handleSelectConversationFromHistory = (conv) => {
    console.log('🖱️ [DEBUG-COMPONENT-App] handleSelectConversationFromHistory() — conv:', conv?.id, 'phone:', conv?.client_phone);
    console.log('🔄 [DEBUG-COMPONENT-App] setHistoryReturnPhone()', conv.client_phone);
    setHistoryReturnPhone(conv.client_phone);
    console.log('🔄 [DEBUG-COMPONENT-App] setShowClientDirectory(false)');
    setShowClientDirectory(false);
    console.log('🔄 [DEBUG-COMPONENT-App] setActiveConversation()', conv?.id);
    setActiveConversation(conv);
    marcarComoLeida(conv);
  };

  // Volver desde el chat a la ficha del cliente en el Directorio (en vez de
  // sacar al operador de esa sección por completo).
  const handleBackToHistory = () => {
    console.log('🖱️ [DEBUG-COMPONENT-App] handleBackToHistory()');
    console.log('🔄 [DEBUG-COMPONENT-App] setActiveConversation(null)');
    setActiveConversation(null);
    console.log('🔄 [DEBUG-COMPONENT-App] setShowClientDirectory(true)');
    setShowClientDirectory(true);
  };

  // Abrir el directorio de clientes: deja de mostrar cualquier chat abierto,
  // pero NO toca activeTab, así Entrantes/Atendiendo/Derivados se siguen viendo.
  const handleShowClientDirectory = () => {
    console.log('🖱️ [DEBUG-COMPONENT-App] handleShowClientDirectory()');
    console.log('🔄 [DEBUG-COMPONENT-App] setActiveConversation(null)');
    setActiveConversation(null);
    console.log('🔄 [DEBUG-COMPONENT-App] setHistoryReturnPhone(null)');
    setHistoryReturnPhone(null);
    console.log('🔄 [DEBUG-COMPONENT-App] setShowClientDirectory(true)');
    setShowClientDirectory(true);
  };

  const fetchConversations = async () => {
    console.log('🔍 [DEBUG-COMPONENT-App] fetchConversations() — inicio', { soyStaff, miSucursalId });
    console.log('🔄 [DEBUG-COMPONENT-App] setLoading(true)');
    setLoading(true);
    let query = supabase.from('conversations').select('*');
    // Un empleado solo trae las conversaciones de su sucursal + las que
    // todavía no tienen sucursal asignada.
    if (soyStaff) {
      query = query.or(`sucursal_id.eq.${miSucursalId},sucursal_id.is.null`);
    }
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).select(*) — antes de la llamada', { soyStaff, miSucursalId });
    const { data, error } = await query.order('updated_at', { ascending: false });
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).select(*) — respuesta', { cantidad: data?.length, error });

    if (!error && data) {
      const enhanced = await withClientNames(data);
      const conUnread = await withUnreadCounts(enhanced);
      console.log('🔄 [DEBUG-COMPONENT-App] setConversations()', conUnread.length);
      setConversations(conUnread);
    } else if (error) {
      console.error('❌ [DEBUG-COMPONENT-App] error en fetchConversations:', error);
    }
    console.log('🔄 [DEBUG-COMPONENT-App] setLoading(false)');
    setLoading(false);
  };

  // Cuenta, para cada conversación todavía activa (las cerradas no se
  // muestran en ninguna bandeja, así que no vale la pena consultarlas acá),
  // cuántos mensajes del cliente llegaron después de last_read_at. Se hace
  // en un solo query bulk (no uno por conversación) para no golpear Supabase
  // con N+1 consultas.
  const withUnreadCounts = async (convs) => {
    console.log('🔍 [DEBUG-COMPONENT-App] withUnreadCounts() — inicio, cantidad conversaciones:', convs.length);
    const activas = convs.filter(c => !ESTADOS_HISTORIAL.includes(c.status));
    if (activas.length === 0) return convs.map(c => ({ ...c, unreadCount: 0 }));

    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).select(conversation_id, created_at) — antes de la llamada', { conversationIds: activas.map(c => c.id) });
    const { data: clientMsgs, error: errorClientMsgs } = await supabase
      .from('messages')
      .select('conversation_id, created_at')
      .eq('sender_type', 'client')
      .in('conversation_id', activas.map(c => c.id));
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).select(conversation_id, created_at) — respuesta', { cantidad: clientMsgs?.length, error: errorClientMsgs });

    const lastReadMap = {};
    activas.forEach(c => { lastReadMap[c.id] = c.last_read_at ? new Date(c.last_read_at).getTime() : 0; });

    const unreadMap = {};
    (clientMsgs || []).forEach(m => {
      if (new Date(m.created_at).getTime() > (lastReadMap[m.conversation_id] || 0)) {
        unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1;
      }
    });

    return convs.map(c => ({ ...c, unreadCount: unreadMap[c.id] || 0 }));
  };

  // Cuenta real (no una suma manual) de mensajes de cliente sin leer para UNA
  // conversación puntual: la usan los eventos de Realtime de abajo para no
  // arriesgarse a duplicar el conteo si el alta de la conversación y su
  // primer mensaje llegan casi al mismo tiempo.
  const recontarNoLeidos = async (conversationId, lastReadAt) => {
    console.log('🔍 [DEBUG-COMPONENT-App] recontarNoLeidos() — inicio', { conversationId, lastReadAt });
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).select(id, count) — antes de la llamada', { conversationId, lastReadAt });
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'client')
      .gt('created_at', lastReadAt || '1970-01-01T00:00:00.000Z');
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).select(id, count) — respuesta', { count, error });
    if (error) console.error('❌ [DEBUG-COMPONENT-App] error en recontarNoLeidos:', error);

    console.log('🔄 [DEBUG-COMPONENT-App] setConversations() — actualizando unreadCount', { conversationId, count: count || 0 });
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unreadCount: count || 0 } : c));
  };

  // Marca una conversación como leída: la limpia al toque en pantalla (sin
  // esperar la vuelta de Supabase) y persiste el momento en la base para que
  // sobreviva a un refresh de página.
  const marcarComoLeida = (conv) => {
    console.log('🔍 [DEBUG-COMPONENT-App] marcarComoLeida() — conv:', conv?.id, 'unreadCount:', conv?.unreadCount);
    if (!conv?.id || !conv.unreadCount) return;
    const ahora = new Date().toISOString();
    console.log('🔄 [DEBUG-COMPONENT-App] setConversations() — marcando como leída, id:', conv.id);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0, last_read_at: ahora } : c));
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).update(last_read_at) — antes de la llamada', { id: conv.id, ahora });
    supabase.from('conversations').update({ last_read_at: ahora }).eq('id', conv.id)
      .then(({ error }) => {
        console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).update(last_read_at) — respuesta', { error });
        if (error) console.error('❌ [DEBUG-COMPONENT-App] Error marcando la consulta como leída:', error);
      });
  };

  const fetchMessages = async (convId) => {
    console.log('🔍 [DEBUG-COMPONENT-App] fetchMessages() — convId:', convId);
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).select(*) — antes de la llamada', { convId });
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).select(*) — respuesta', { cantidad: data?.length, error });
    if (!error && data) {
      console.log('🔄 [DEBUG-COMPONENT-App] setMessages()', data.length);
      setMessages(data);
      scrollToBottom();
    } else if (error) {
      console.error('❌ [DEBUG-COMPONENT-App] error en fetchMessages:', error);
    }
  };

  const fetchPrescription = async (convId) => {
    console.log('🔍 [DEBUG-COMPONENT-App] fetchPrescription() — convId:', convId);
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(prescriptions).select(*) — antes de la llamada', { convId });
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('conversation_id', convId)
      .limit(1)
      .maybeSingle();
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(prescriptions).select(*) — respuesta', { data, error });
    if (!error && data) {
      console.log('🔄 [DEBUG-COMPONENT-App] setActivePrescription()', data.id);
      setActivePrescription(data);
      console.log('🔄 [DEBUG-COMPONENT-App] setPrescriptionNotes()', data.notes || '');
      setPrescriptionNotes(data.notes || '');
      console.log('🔄 [DEBUG-COMPONENT-App] setPrescriptionObraSocial()', data.obra_social || '');
      setPrescriptionObraSocial(data.obra_social || '');
    } else {
      if (error) console.error('❌ [DEBUG-COMPONENT-App] error en fetchPrescription:', error);
      console.log('🔄 [DEBUG-COMPONENT-App] setActivePrescription(null)');
      setActivePrescription(null);
    }
  };

  const handleSendMessage = async (customText = null, mediaUrl = null, mediaType = 'text') => {
    console.log('🖱️ [DEBUG-COMPONENT-App] handleSendMessage()', { customText, mediaUrl, mediaType });
    const textToSend = typeof customText === 'string' ? customText : messageInput;
    if ((!textToSend.trim() && !mediaUrl) || !activeConversation) return;

    const messageId = crypto.randomUUID();
    const inputToSave = textToSend.trim();
    // Sólo limpiamos el input cuando el mensaje sale del cuadro de texto (customText no provisto
    // explícitamente); las respuestas rápidas/cotizaciones pasan su propio texto y no lo tocan.
    if (typeof customText !== 'string') {
      console.log('🔄 [DEBUG-COMPONENT-App] setMessageInput("")');
      setMessageInput('');
    }

    // Optimistic UI update
    const tempMessage = {
      id: messageId,
      conversation_id: activeConversation.id,
      sender_type: 'agent',
      message_text: inputToSave,
      media_type: mediaUrl ? (mediaType || 'image') : 'text',
      media_url: mediaUrl,
      created_at: new Date().toISOString()
    };

    console.log('🔄 [DEBUG-COMPONENT-App] setMessages() — mensaje optimista, id:', messageId);
    setMessages(prev => [...prev, tempMessage]);
    scrollToBottom();

    try {
      // El backend es quien inserta la fila real en 'messages' (necesita hacerlo para
      // guardar el wamid/estado de la entrega). Le pasamos el mismo id del mensaje
      // optimista para que, cuando llegue por Realtime, el dedup por id lo reconozca
      // como la misma fila en vez de duplicarla.
      console.log('📡 [DEBUG-COMPONENT-App] adminFetch POST /api/messages/send — antes de la llamada', { id: messageId, conversation_id: activeConversation.id, message_text: inputToSave, media_url: mediaUrl, media_type: mediaType });
      const res = await adminFetch('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          id: messageId,
          conversation_id: activeConversation.id,
          message_text: inputToSave,
          media_url: mediaUrl,
          media_type: mediaType
        })
      });
      console.log('📡 [DEBUG-COMPONENT-App] adminFetch POST /api/messages/send — respuesta', { ok: res.ok, status: res.status });

      if (!res.ok) throw new Error('El servidor no pudo enviar el mensaje');

      // Update conversation timestamp & last_message
      const previewText = mediaUrl ? `📎 Archivo enviado${inputToSave ? ' - ' + inputToSave : ''}` : inputToSave;

      const updates = {
        updated_at: new Date().toISOString(),
        last_message: previewText,
        // Responder implica haber visto todo lo anterior: sin esto, si la
        // conversación queda abierta un buen rato, un refresh de página
        // contaría como "no leídos" mensajes que el operador ya vio y contestó.
        last_read_at: new Date().toISOString()
      };
      // La asignación a una sucursal ya no es implícita al primer mensaje: el
      // empleado tiene que tocar "Tomar" (Sidebar/ChatArea, ver src/lib/tomarConsulta.js)
      // antes de poder responder una consulta de la cola general.

      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).update() — antes de la llamada', { id: activeConversation.id, updates });
      const { error: errorUpdateConv } = await supabase
        .from('conversations')
        .update(updates)
        .eq('id', activeConversation.id);
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).update() — respuesta', { error: errorUpdateConv });
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-App] Error contactando backend:', err);
      // El envío falló de verdad: sacamos el mensaje optimista para no mostrar algo que nunca se mandó.
      console.log('🔄 [DEBUG-COMPONENT-App] setMessages() — quitando mensaje optimista fallido, id:', messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      alert('No se pudo enviar el mensaje. Intentá de nuevo.');
    }
  };

  const handleDeleteConversation = async (conversationId) => {
    console.log('🖱️ [DEBUG-COMPONENT-App] handleDeleteConversation() — conversationId:', conversationId);
    if (!conversationId) return;
    if (!window.confirm('¿Seguro que querés eliminar esta conversación? Esta acción no se puede deshacer.')) return;

    try {
      // Borramos primero los datos dependientes para asegurar una baja limpia,
      // sin depender de que el ON DELETE CASCADE esté configurado en la DB.
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).delete() — antes de la llamada', { conversationId });
      const { error: errorDelMsgs } = await supabase.from('messages').delete().eq('conversation_id', conversationId);
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).delete() — respuesta', { error: errorDelMsgs });

      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(prescriptions).delete() — antes de la llamada', { conversationId });
      const { error: errorDelPresc } = await supabase.from('prescriptions').delete().eq('conversation_id', conversationId);
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(prescriptions).delete() — respuesta', { error: errorDelPresc });

      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).delete() — antes de la llamada', { conversationId });
      const { error } = await supabase.from('conversations').delete().eq('id', conversationId);
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).delete() — respuesta', { error });
      if (error) throw error;

      console.log('🔄 [DEBUG-COMPONENT-App] setConversations() — quitando conversación eliminada, id:', conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (activeConversation?.id === conversationId) {
        console.log('🔄 [DEBUG-COMPONENT-App] setActiveConversation(null) — conversación activa fue eliminada');
        setActiveConversation(null);
      }
      console.log('✅ [DEBUG-COMPONENT-App] handleDeleteConversation() — completado, id:', conversationId);
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-App] Error eliminando la conversación:', err);
      alert('No se pudo eliminar la conversación.');
    }
  };

  const handleUpdatePrescription = async (newStatus, rejectReason = '') => {
    console.log('🖱️ [DEBUG-COMPONENT-App] handleUpdatePrescription()', { newStatus, rejectReason, prescriptionId: activePrescription?.id });
    if (!activePrescription) return;

    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(prescriptions).update() — antes de la llamada', { id: activePrescription.id, newStatus, prescriptionObraSocial, prescriptionNotes });
    const { error } = await supabase
      .from('prescriptions')
      .update({
        status: newStatus,
        obra_social: prescriptionObraSocial,
        notes: prescriptionNotes
      })
      .eq('id', activePrescription.id);
    console.log('📡 [DEBUG-COMPONENT-App] supabase.from(prescriptions).update() — respuesta', { error });

    if (!error) {
       // Update conversation status based on prescription result
       const convStatus = newStatus === 'approved' ? 'open' : 'rejected';
       console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).update(status) — antes de la llamada', { id: activeConversation.id, convStatus });
       const { error: errorConvUpdate } = await supabase
         .from('conversations')
         .update({ status: convStatus, updated_at: new Date().toISOString() })
         .eq('id', activeConversation.id);
       console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).update(status) — respuesta', { error: errorConvUpdate });

       // Send an automatic message about the resolution
       let botMessage = '';
       if (newStatus === 'approved') {
         botMessage = '✅ Tu receta médica ha sido validada y aprobada correctamente.';
       } else {
         botMessage = `❌ Receta no aprobada: ${rejectReason}. Por favor envíanos una nueva foto clara.`;
       }

       // El backend inserta la fila real en 'messages' (así el wamid/estado se guarda ahí también,
       // sin duplicar la fila que antes insertábamos acá).
       console.log('📡 [DEBUG-COMPONENT-App] adminFetch POST /api/messages/send (bot) — antes de la llamada', { conversation_id: activeConversation.id, botMessage });
       adminFetch('/api/messages/send', {
         method: 'POST',
         body: JSON.stringify({
           conversation_id: activeConversation.id,
           message_text: botMessage,
           sender_type: 'bot'
         })
       })
         .then(res => console.log('📡 [DEBUG-COMPONENT-App] adminFetch POST /api/messages/send (bot) — respuesta', { ok: res.ok, status: res.status }))
         .catch(err => console.error("❌ [DEBUG-COMPONENT-App] Error contactando backend:", err));
    } else {
      console.error('❌ [DEBUG-COMPONENT-App] error actualizando prescription:', error);
    }
  };

  const handleSeedData = async () => {
    console.log('🖱️ [DEBUG-COMPONENT-App] handleSeedData()');
    console.log('🔄 [DEBUG-COMPONENT-App] setIsSeeding(true)');
    setIsSeeding(true);
    try {
      const now = new Date();

      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).insert() — antes de la llamada (seed)');
      const { data: convs, error: convError } = await supabase.from('conversations').insert([
        { client_name: 'Carlos Gómez', client_phone: '+54 9 11 4455-6677', status: 'pending_validation' },
        { client_name: 'María López', client_phone: '+54 9 11 2233-4455', status: 'open' },
        { client_name: 'Juan Pérez', client_phone: '+54 9 11 9988-7766', status: 'resolved' },
      ]).select();
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(conversations).insert() — respuesta (seed)', { convs, convError });

      if (convError || !convs) throw new Error("Error creating conversations");

      const carlos = convs.find(c => c.client_name === 'Carlos Gómez');
      const maria = convs.find(c => c.client_name === 'María López');
      const juan = convs.find(c => c.client_name === 'Juan Pérez');
      
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).insert() — antes de la llamada (seed carlos)');
      const { error: errorSeedMsgsCarlos } = await supabase.from('messages').insert([
        { conversation_id: carlos.id, sender_type: 'bot', message_text: '¡Hola Carlos! Bienvenido a la farmacia. Por favor envía tu receta.', created_at: new Date(now.getTime() - 15 * 60000).toISOString() },
        { conversation_id: carlos.id, sender_type: 'client', message_text: 'Hola, buenas tardes. Necesito cotizar estos medicamentos por OSDE.', created_at: new Date(now.getTime() - 10 * 60000).toISOString() },
        { conversation_id: carlos.id, sender_type: 'client', message_text: 'Adjunto la receta', media_url: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&q=80&w=800', media_type: 'image', created_at: new Date(now.getTime() - 9 * 60000).toISOString() }
      ]);
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).insert() — respuesta (seed carlos)', { error: errorSeedMsgsCarlos });

      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(prescriptions).insert() — antes de la llamada (seed carlos)');
      const { error: errorSeedPrescCarlos } = await supabase.from('prescriptions').insert([{
        conversation_id: carlos.id,
        image_url: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&q=80&w=800',
        status: 'pending',
        obra_social: 'OSDE 210',
        notes: 'Pendiente verificar token digital'
      }]);
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(prescriptions).insert() — respuesta (seed carlos)', { error: errorSeedPrescCarlos });

      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).insert() — antes de la llamada (seed maria)');
      const { error: errorSeedMsgsMaria } = await supabase.from('messages').insert([
         { conversation_id: maria.id, sender_type: 'client', message_text: 'Hola, ¿tienen disponibilidad de alcohol en gel de 500ml y analgésicos de venta libre (Ibuprofeno 400)?', created_at: new Date(now.getTime() - 60 * 60000).toISOString() },
         { conversation_id: maria.id, sender_type: 'agent', message_text: '¡Hola María! Sí, tenemos stock de ambos productos.', created_at: new Date(now.getTime() - 50 * 60000).toISOString() }
      ]);
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).insert() — respuesta (seed maria)', { error: errorSeedMsgsMaria });

      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).insert() — antes de la llamada (seed juan)');
      const { error: errorSeedMsgsJuan } = await supabase.from('messages').insert([
         { conversation_id: juan.id, sender_type: 'client', message_text: 'Gracias por enviarme el pedido, llegó perfecto.', created_at: new Date(now.getTime() - 24 * 3600000).toISOString() },
         { conversation_id: juan.id, sender_type: 'agent', message_text: '¡De nada Juan! Cualquier otra consulta estamos a tu disposición.', created_at: new Date(now.getTime() - 23 * 3600000).toISOString() }
      ]);
      console.log('📡 [DEBUG-COMPONENT-App] supabase.from(messages).insert() — respuesta (seed juan)', { error: errorSeedMsgsJuan });

      console.log('🔍 [DEBUG-COMPONENT-App] handleSeedData() — llamando fetchConversations() tras sembrar datos');
      await fetchConversations();
      console.log('✅ [DEBUG-COMPONENT-App] handleSeedData() — completado');
    } catch (e) {
      console.error('❌ [DEBUG-COMPONENT-App] handleSeedData() — error:', e);
      alert('Error al sembrar datos. Asegúrate de haber ejecutado el schema.sql primero.');
    }
    console.log('🔄 [DEBUG-COMPONENT-App] setIsSeeding(false)');
    setIsSeeding(false);
  };

  console.log('🔍 [DEBUG-COMPONENT-App] chequeo de sesión', { tieneAdminToken: !!adminToken });
  if (!adminToken) {
    return <LoginModal onLoginSuccess={(token) => {
      console.log('✅ [DEBUG-COMPONENT-App] onLoginSuccess() — login exitoso, token presente:', !!token, token ? token.slice(0, 8) + '...' : null);
      console.log('🔄 [DEBUG-COMPONENT-App] setAdminToken() — token presente:', !!token);
      setAdminToken(token);
    }} />;
  }

  const handleLogout = () => {
    console.log('🖱️ [DEBUG-COMPONENT-App] handleLogout()');
    clearAdminSession();
    console.log('🔄 [DEBUG-COMPONENT-App] setAdminToken(null)');
    setAdminToken(null);
  };

  console.log('🔍 [DEBUG-COMPONENT-App] Render — antes de devolver el JSX principal', { activeTab, conversationsCount: conversations.length, activeConversationId: activeConversation?.id, showClientDirectory, loading });

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800 overflow-x-auto">

      <Sidebar
        conversations={conversations}
        loading={loading}
        activeConversation={activeConversation}
        setActiveConversation={handleSelectConversation}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        handleSeedData={handleSeedData}
        isSeeding={isSeeding}
        sessionTimeoutMs={sessionTimeoutMs}
        onSessionTimeoutChange={setSessionTimeoutMs}
        showClientDirectory={showClientDirectory}
        onShowClientDirectory={handleShowClientDirectory}
        onLogout={handleLogout}
        isAdmin={!soyStaff}
        staffSucursalNombre={getStaffSucursalNombre()}
      />

      {showClientDirectory && !activeConversation ? (
        <ClientDirectory onOpenConversation={handleSelectConversationFromHistory} initialSelectedPhone={historyReturnPhone} />
      ) : (
        <ChatArea
          activeConversation={activeConversation}
          messages={messages}
          messagesEndRef={messagesEndRef}
          messageInput={messageInput}
          setMessageInput={setMessageInput}
          handleSendMessage={handleSendMessage}
          handleDeleteConversation={handleDeleteConversation}
          setModalImage={setModalImage}
          sessionTimeoutMs={sessionTimeoutMs}
          onBackToHistory={historyReturnPhone ? handleBackToHistory : null}
        />
      )}

      {activeConversation && (
        <ValidationPanel
          activeConversation={activeConversation}
          activePrescription={activePrescription}
          prescriptionObraSocial={prescriptionObraSocial}
          setPrescriptionObraSocial={setPrescriptionObraSocial}
          prescriptionNotes={prescriptionNotes}
          setPrescriptionNotes={setPrescriptionNotes}
          handleUpdatePrescription={handleUpdatePrescription}
          setModalImage={setModalImage}
          handleSendMessage={handleSendMessage}
          isAdmin={!soyStaff}
        />
      )}

      {/* Fullscreen Image Modal */}
      {modalImage && (
        <ImageModal
          imageUrl={modalImage}
          onClose={() => {
            console.log('🖱️ [DEBUG-COMPONENT-App] ImageModal onClose() — cerrando modal de imagen');
            console.log('🔄 [DEBUG-COMPONENT-App] setModalImage(null)');
            setModalImage(null);
          }}
        />
      )}

    </div>
  );
}

export default App;
