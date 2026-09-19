import React, { useState, useEffect, useRef } from 'react';
import { WifiOff } from 'lucide-react';
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
import DialogHost from './components/DialogHost';
import { confirmDialog, alertDialog } from './lib/dialogService';
import { getAdminToken, clearAdminSession, isAdminRole, getStaffSucursalId, getStaffSucursalNombre, adminFetch, getTheme, applyTheme } from './lib/adminAuth';

function App() {
  const [adminToken, setAdminToken] = useState(() => getAdminToken());

  // Re-aplica la clase "dark" al recargar la página: applyTheme() sólo la
  // prende en el login/toggle, y esa clase en <html> no sobrevive un F5 por
  // sí sola (localStorage sí). Sin esto, la cuenta arrancaría siempre en
  // claro hasta volver a tocar el toggle.
  useEffect(() => {
    applyTheme(getTheme());
  }, []);

  // Estado de red: cuando se pierde la conexión, se corta la suscripción de
  // Realtime (ver más abajo) para que el navegador no quede reintentando
  // reconectar el WebSocket en bucle contra una red caída, y se pausan los
  // re-fetch manuales de mensajes/receta/conversaciones (ver fetchMessages,
  // fetchPrescription y fetchConversations). Al volver "online" se resuscribe
  // y se dispara UNA sola resincronización, no un polling continuo.
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); };
    const handleOffline = () => { setIsOnline(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Un empleado solo ve conversaciones de su propia sucursal, más las que
  // todavía no tienen sucursal asignada (para poder "tomarlas"). El admin ve
  // todo sin restricción. Se recalcula en cada render (lectura de
  // localStorage, no hooks) para reflejar el login recién hecho.
  const soyStaff = !isAdminRole();
  const miSucursalId = getStaffSucursalId();

  // El canal de Realtime se suscribe una sola vez (deps [] más abajo), así
  // que su callback capturaría soyStaff/miSucursalId del momento del primer
  // render (antes del login, donde localStorage todavía no tenía sesión).
  // Leemos siempre desde este ref -sincronizado cada vez que el login cambia-
  // para evitar ese closure obsoleto.
  const ambitoRef = useRef({ soyStaff, miSucursalId });
  useEffect(() => {
    ambitoRef.current = { soyStaff, miSucursalId };
  }, [adminToken]);

  const perteneceAMiAmbito = (conv) => {
    const { soyStaff: soy, miSucursalId: mi } = ambitoRef.current;
    const resultado = !soy || !conv.sucursal_id || conv.sucursal_id === mi;
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
  // En móvil, la ficha/cotizador (ValidationPanel) no entra en pantalla junto
  // al chat: se abre como overlay a demanda y se cierra sola al cambiar de
  // conversación (en desktop es siempre visible y esto no tiene efecto).
  const [showValidationMobile, setShowValidationMobile] = useState(false);

  // Límite de expiración de sesiones y umbral del aviso preventivo
  // ("¿Seguís ahí?"), configurables desde el panel de ajustes.
  const [sessionTimeoutMs, setSessionTimeoutMs] = useState(null);
  const [sessionPrewarningMs, setSessionPrewarningMs] = useState(null);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || '';
    fetch(`${API_URL}/api/session-config`)
      .then(res => res.json())
      .then(data => {
        setSessionTimeoutMs(data.sessionTimeoutMs);
        setSessionPrewarningMs(data.sessionPrewarningMs ?? 0);
      })
      .catch(err => console.error('❌ [DEBUG-COMPONENT-App] Error obteniendo config de sesión:', err));
  }, []);

  // Ref con la conversación activa "al día", para poder leerla desde dentro del
  // canal de Realtime sin tener que recrear la suscripción cada vez que cambia.
  const activeConversationRef = useRef(null);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // Ref con la lista de conversaciones "al día", para poder comparar el status
  // anterior de una fila cuando llega un UPDATE por Realtime (el payload de
  // Supabase solo trae el id en payload.old, no el resto de columnas viejas).
  const conversationsRef = useRef([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // 1. Fetch Initial Data. Depende de adminToken para volver a traer (ya con
  // el filtro de sucursal correcto) apenas el login termina: en el primer
  // render (antes de loguearse) todavía no hay sesión en localStorage, así
  // que un fetch hecho en ese momento ignoraría el filtro por completo.
  useEffect(() => {
    if (adminToken) fetchConversations();
  }, [adminToken]);

  // 2. Fetch Messages and Prescription when conversation changes
  useEffect(() => {
    if (activeConversation) {
      fetchMessages(activeConversation.id);
      fetchPrescription(activeConversation.id);
    } else {
      setMessages([]);
      setActivePrescription(null);
    }
    setShowValidationMobile(false);
  }, [activeConversation]);

  // Al recuperar la conexión, la suscripción de Realtime (efecto de abajo) se
  // reabre sola porque depende de isOnline, pero lo que haya cambiado
  // MIENTRAS estuvo offline no llega retroactivamente por ahí: se dispara acá
  // una única resincronización puntual (no un polling) para traer lo que se
  // haya perdido. wasOnlineRef evita que esto se dispare también en el primer
  // render (ya cubierto por los efectos 1 y 2 de arriba).
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) {
      console.log('🔍 [DEBUG-COMPONENT-App] Conexión recuperada — resincronizando (fetchConversations + conversación activa).');
      if (adminToken) fetchConversations();
      const activa = activeConversationRef.current;
      if (activa) {
        fetchMessages(activa.id);
        fetchPrescription(activa.id);
      }
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline]);

  // 3. Realtime Subscriptions. Se suscribe UNA sola vez por cada vez que hay
  // conexión (nunca en base a activeConversation: recrear el canal en cada
  // cambio de conversación activa abría una ventana de desuscripción/
  // resuscripción donde se podían perder o duplicar eventos, dejando filas
  // fantasma en el sidebar). Si isOnline es false, ni se intenta abrir: sin
  // esto, el cliente de Supabase Realtime queda reintentando reconectar el
  // WebSocket en bucle contra una red caída, ensuciando la pestaña Network.
  useEffect(() => {
    if (!isOnline) return;

    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          const active = activeConversationRef.current;
          if (active && payload.new?.conversation_id === active.id) {
            if (payload.eventType === 'INSERT') {
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
              setMessages(prev => prev.map(m => (m.id === payload.new.id ? payload.new : m)));
            }
          } else if (payload.eventType === 'INSERT' && payload.new?.sender_type === 'client') {
            // Mensaje entrante de una conversación que el operador no tiene
            // abierta ahora mismo: recontamos desde la base (no sumamos "+1"
            // a mano) para no arriesgarnos a duplicar el conteo si esta
            // conversación se acaba de crear y su evento de alta todavía no
            // se procesó.
            const conv = conversationsRef.current.find(c => c.id === payload.new.conversation_id);
            recontarNoLeidos(payload.new.conversation_id, conv?.last_read_at);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setConversations(prev => prev.filter(c => c.id !== payload.old?.id));
            if (activeConversationRef.current?.id === payload.old?.id) {
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
            if (payload.eventType === 'UPDATE') {
              setConversations(prev => prev.filter(c => c.id !== payload.new.id));
              if (activeConversationRef.current?.id === payload.new.id) {
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
              setActiveConversation(prev => ({ ...payload.new, real_name: prev.real_name }));
            }

            // El bot guarda el nombre completo del cliente directamente en la tabla
            // `clientes` (ej. durante el registro), sin tocar esa columna acá, así que
            // mientras no lo tengamos ya resuelto en memoria lo reintentamos en cada
            // UPDATE de la conversación (no solo cuando pasa a "esperando").
            if (empezoAEsperar || !nombreYaConocido) {
              supabase.from('clientes').select('nombre_completo').eq('client_phone', payload.new.client_phone).maybeSingle()
                .then(({ data, error }) => {
                  if (error) console.error('❌ [DEBUG-COMPONENT-App] error consultando nombre_completo (UPDATE):', error);
                  if (data?.nombre_completo && !nombreYaConocido) {
                    setConversations(current => current.map(c =>
                      c.id === payload.new.id ? { ...c, real_name: data.nombre_completo } : c
                    ));
                    if (activeConversationRef.current?.id === payload.new.id) {
                      setActiveConversation(prev => prev ? { ...prev, real_name: data.nombre_completo } : prev);
                    }
                  }
                  if (empezoAEsperar) {
                    const nombre = data?.nombre_completo || payload.new.client_name || payload.new.client_phone || 'Un cliente';
                    notifyNewEvent({
                      title: 'Cliente esperando un asesor',
                      body: `${nombre} quiere hablar con un humano.`
                    });
                  }
                });
            }
          } else if (payload.eventType === 'INSERT') {
            setConversations(prev => {
              // Evita duplicar si ese id ya está en la lista (ej. un evento repetido).
              if (prev.some(c => c.id === payload.new.id)) return prev;
              return [{ ...payload.new, unreadCount: 0 }, ...prev].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            });
            // Cuenta real (normalmente 1: el mensaje que arrancó esta consulta nueva).
            recontarNoLeidos(payload.new.id, payload.new.last_read_at);

            // Fetch real_name asynchronously and update both conversations list and notifications
            supabase.from('clientes').select('nombre_completo').eq('client_phone', payload.new.client_phone).maybeSingle()
              .then(({ data, error }) => {
                if (error) console.error('❌ [DEBUG-COMPONENT-App] error consultando nombre_completo (INSERT):', error);
                const nombre = data?.nombre_completo || payload.new.client_name || payload.new.client_phone || 'Un cliente';
                if (data?.nombre_completo) {
                  setConversations(current => current.map(c =>
                    c.id === payload.new.id ? { ...c, real_name: data.nombre_completo } : c
                  ));
                  if (activeConversationRef.current?.id === payload.new.id) {
                    setActiveConversation(prev => ({ ...prev, real_name: data.nombre_completo }));
                  }
                }
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
          const active = activeConversationRef.current;
          if (active && payload.new?.conversation_id === active.id) {
             setActivePrescription(payload.new);
             setPrescriptionNotes(payload.new.notes || '');
             setPrescriptionObraSocial(payload.new.obra_social || '');
          }
        }
      )
      .subscribe();


    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOnline]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Seleccionar una conversación (desde el sidebar o desde el directorio de
  // clientes) siempre saca al directorio de en medio, para que el panel
  // central muestre el chat.
  const handleSelectConversation = (conv) => {
    setShowClientDirectory(false);
    setHistoryReturnPhone(null);
    setActiveConversation(conv);
    marcarComoLeida(conv);
  };

  // Igual que handleSelectConversation, pero recordando de qué cliente venía
  // (para que el botón de retroceso del chat pueda volver justo a su ficha).
  const handleSelectConversationFromHistory = (conv) => {
    setHistoryReturnPhone(conv.client_phone);
    setShowClientDirectory(false);
    setActiveConversation(conv);
    marcarComoLeida(conv);
  };

  // Volver desde el chat a la ficha del cliente en el Directorio (en vez de
  // sacar al operador de esa sección por completo).
  const handleBackToHistory = () => {
    setActiveConversation(null);
    setShowClientDirectory(true);
  };

  // Abrir el directorio de clientes: deja de mostrar cualquier chat abierto,
  // pero NO toca activeTab, así Entrantes/Atendiendo/Derivados se siguen viendo.
  const handleShowClientDirectory = () => {
    setActiveConversation(null);
    setHistoryReturnPhone(null);
    setShowClientDirectory(true);
  };

  const fetchConversations = async () => {
    // Sin conexión no tiene sentido intentarlo (fallaría seguro) ni queremos
    // que ensucie la consola con el error de red: se omite en silencio y
    // queda a cargo del efecto de "reconexión" volver a llamarla al toque de
    // que vuelva el online.
    if (!navigator.onLine) {
      console.log('🔍 [DEBUG-COMPONENT-App] fetchConversations() — sin conexión, se omite.');
      return;
    }
    setLoading(true);
    // Este estado sólo alimenta las bandejas de Sidebar (Entrantes/Atendiendo/
    // Derivados), que ya descartan del lado del cliente cualquier conversación
    // en ESTADOS_HISTORIAL (ver esBotAutomatico/necesitaHumano/esDerivado en
    // Sidebar.jsx): sin este filtro, cada login traía TODO el historial de
    // consultas cerradas de la farmacia entera (crece para siempre) sólo para
    // tirarlo a la basura en el primer render. El Directorio de Clientes tiene
    // su propia consulta aparte para ver ese historial.
    let query = supabase.from('conversations').select('*').not('status', 'in', `(${ESTADOS_HISTORIAL.join(',')})`);
    // Un empleado solo trae las conversaciones de su sucursal + las que
    // todavía no tienen sucursal asignada.
    if (soyStaff) {
      query = query.or(`sucursal_id.eq.${miSucursalId},sucursal_id.is.null`);
    }
    const { data, error } = await query.order('updated_at', { ascending: false });

    if (!error && data) {
      const enhanced = await withClientNames(data);
      const conUnread = await withUnreadCounts(enhanced);
      setConversations(conUnread);
    } else if (error) {
      console.error('❌ [DEBUG-COMPONENT-App] error en fetchConversations:', error);
    }
    setLoading(false);
  };

  // Cuenta, para cada conversación todavía activa (las cerradas no se
  // muestran en ninguna bandeja, así que no vale la pena consultarlas acá),
  // cuántos mensajes del cliente llegaron después de last_read_at. Se hace
  // en un solo query bulk (no uno por conversación) para no golpear Supabase
  // con N+1 consultas.
  const withUnreadCounts = async (convs) => {
    const activas = convs.filter(c => !ESTADOS_HISTORIAL.includes(c.status));
    if (activas.length === 0) return convs.map(c => ({ ...c, unreadCount: 0 }));

    const { data: clientMsgs, error: errorClientMsgs } = await supabase
      .from('messages')
      .select('conversation_id, created_at')
      .eq('sender_type', 'client')
      .in('conversation_id', activas.map(c => c.id));

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
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'client')
      .gt('created_at', lastReadAt || '1970-01-01T00:00:00.000Z');
    if (error) console.error('❌ [DEBUG-COMPONENT-App] error en recontarNoLeidos:', error);

    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unreadCount: count || 0 } : c));
  };

  // Marca una conversación como leída: la limpia al toque en pantalla (sin
  // esperar la vuelta de Supabase) y persiste el momento en la base para que
  // sobreviva a un refresh de página.
  const marcarComoLeida = (conv) => {
    if (!conv?.id || !conv.unreadCount) return;
    const ahora = new Date().toISOString();
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0, last_read_at: ahora } : c));
    supabase.from('conversations').update({ last_read_at: ahora }).eq('id', conv.id)
      .then(({ error }) => {
        if (error) console.error('❌ [DEBUG-COMPONENT-App] Error marcando la consulta como leída:', error);
      });
  };

  const fetchMessages = async (convId) => {
    if (!navigator.onLine) {
      console.log('🔍 [DEBUG-COMPONENT-App] fetchMessages() — sin conexión, se omite.');
      return;
    }
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      setMessages(data);
      scrollToBottom();
    } else if (error) {
      console.error('❌ [DEBUG-COMPONENT-App] error en fetchMessages:', error);
    }
  };

  const fetchPrescription = async (convId) => {
    if (!navigator.onLine) {
      console.log('🔍 [DEBUG-COMPONENT-App] fetchPrescription() — sin conexión, se omite.');
      return;
    }
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('conversation_id', convId)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      setActivePrescription(data);
      setPrescriptionNotes(data.notes || '');
      setPrescriptionObraSocial(data.obra_social || '');
    } else {
      if (error) console.error('❌ [DEBUG-COMPONENT-App] error en fetchPrescription:', error);
      setActivePrescription(null);
    }
  };

  const handleSendMessage = async (customText = null, mediaUrl = null, mediaType = 'text') => {
    const textToSend = typeof customText === 'string' ? customText : messageInput;
    if ((!textToSend.trim() && !mediaUrl) || !activeConversation) return;

    const messageId = crypto.randomUUID();
    const inputToSave = textToSend.trim();
    // Sólo limpiamos el input cuando el mensaje sale del cuadro de texto (customText no provisto
    // explícitamente); las respuestas rápidas/cotizaciones pasan su propio texto y no lo tocan.
    if (typeof customText !== 'string') {
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

    setMessages(prev => [...prev, tempMessage]);
    scrollToBottom();

    try {
      // El backend es quien inserta la fila real en 'messages' (necesita hacerlo para
      // guardar el wamid/estado de la entrega). Le pasamos el mismo id del mensaje
      // optimista para que, cuando llegue por Realtime, el dedup por id lo reconozca
      // como la misma fila en vez de duplicarla.
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

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'El servidor no pudo enviar el mensaje');
      }

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

      const { error: errorUpdateConv } = await supabase
        .from('conversations')
        .update(updates)
        .eq('id', activeConversation.id);
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-App] Error contactando backend:', err);
      // El envío falló de verdad: sacamos el mensaje optimista para no mostrar algo que nunca se mandó.
      setMessages(prev => prev.filter(m => m.id !== messageId));
      alertDialog(`No se pudo enviar el mensaje.\n\n${err.message || 'Intentá de nuevo.'}`, { danger: true });
    }
  };

  const handleDeleteConversation = async (conversationId) => {
    if (!conversationId) return;
    const confirmado = await confirmDialog('¿Seguro que querés eliminar esta conversación? Esta acción no se puede deshacer.', { danger: true, confirmText: 'Eliminar' });
    if (!confirmado) return;

    try {
      // Borramos primero los datos dependientes para asegurar una baja limpia,
      // sin depender de que el ON DELETE CASCADE esté configurado en la DB.
      const { error: errorDelMsgs } = await supabase.from('messages').delete().eq('conversation_id', conversationId);

      const { error: errorDelPresc } = await supabase.from('prescriptions').delete().eq('conversation_id', conversationId);

      const { error } = await supabase.from('conversations').delete().eq('id', conversationId);
      if (error) throw error;

      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (activeConversation?.id === conversationId) {
        setActiveConversation(null);
      }
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-App] Error eliminando la conversación:', err);
      alertDialog('No se pudo eliminar la conversación.', { danger: true });
    }
  };

  const handleUpdatePrescription = async (newStatus, rejectReason = '') => {
    if (!activePrescription) return;

    const { error } = await supabase
      .from('prescriptions')
      .update({
        status: newStatus,
        obra_social: prescriptionObraSocial,
        notes: prescriptionNotes
      })
      .eq('id', activePrescription.id);

    if (!error) {
       // Update conversation status based on prescription result
       const convStatus = newStatus === 'approved' ? 'open' : 'rejected';
       const { error: errorConvUpdate } = await supabase
         .from('conversations')
         .update({ status: convStatus, updated_at: new Date().toISOString() })
         .eq('id', activeConversation.id);

       // Send an automatic message about the resolution
       let botMessage = '';
       if (newStatus === 'approved') {
         botMessage = '✅ Tu receta médica ha sido validada y aprobada correctamente.';
       } else {
         botMessage = `❌ Receta no aprobada: ${rejectReason}. Por favor envíanos una nueva foto clara.`;
       }

       // El backend inserta la fila real en 'messages' (así el wamid/estado se guarda ahí también,
       // sin duplicar la fila que antes insertábamos acá).
       adminFetch('/api/messages/send', {
         method: 'POST',
         body: JSON.stringify({
           conversation_id: activeConversation.id,
           message_text: botMessage,
           sender_type: 'bot'
         })
       })
         .catch(err => console.error("❌ [DEBUG-COMPONENT-App] Error contactando backend:", err));
    } else {
      console.error('❌ [DEBUG-COMPONENT-App] error actualizando prescription:', error);
    }
  };

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      const now = new Date();

      const { data: convs, error: convError } = await supabase.from('conversations').insert([
        { client_name: 'Carlos Gómez', client_phone: '+54 9 11 4455-6677', status: 'pending_validation' },
        { client_name: 'María López', client_phone: '+54 9 11 2233-4455', status: 'open' },
        { client_name: 'Juan Pérez', client_phone: '+54 9 11 9988-7766', status: 'resolved' },
      ]).select();

      if (convError || !convs) throw new Error("Error creating conversations");

      const carlos = convs.find(c => c.client_name === 'Carlos Gómez');
      const maria = convs.find(c => c.client_name === 'María López');
      const juan = convs.find(c => c.client_name === 'Juan Pérez');
      
      const { error: errorSeedMsgsCarlos } = await supabase.from('messages').insert([
        { conversation_id: carlos.id, sender_type: 'bot', message_text: '¡Hola Carlos! Bienvenido a la farmacia. Por favor envía tu receta.', created_at: new Date(now.getTime() - 15 * 60000).toISOString() },
        { conversation_id: carlos.id, sender_type: 'client', message_text: 'Hola, buenas tardes. Necesito cotizar estos medicamentos por OSDE.', created_at: new Date(now.getTime() - 10 * 60000).toISOString() },
        { conversation_id: carlos.id, sender_type: 'client', message_text: 'Adjunto la receta', media_url: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&q=80&w=800', media_type: 'image', created_at: new Date(now.getTime() - 9 * 60000).toISOString() }
      ]);

      const { error: errorSeedPrescCarlos } = await supabase.from('prescriptions').insert([{
        conversation_id: carlos.id,
        image_url: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&q=80&w=800',
        status: 'pending',
        obra_social: 'OSDE 210',
        notes: 'Pendiente verificar token digital'
      }]);

      const { error: errorSeedMsgsMaria } = await supabase.from('messages').insert([
         { conversation_id: maria.id, sender_type: 'client', message_text: 'Hola, ¿tienen disponibilidad de alcohol en gel de 500ml y analgésicos de venta libre (Ibuprofeno 400)?', created_at: new Date(now.getTime() - 60 * 60000).toISOString() },
         { conversation_id: maria.id, sender_type: 'agent', message_text: '¡Hola María! Sí, tenemos stock de ambos productos.', created_at: new Date(now.getTime() - 50 * 60000).toISOString() }
      ]);

      const { error: errorSeedMsgsJuan } = await supabase.from('messages').insert([
         { conversation_id: juan.id, sender_type: 'client', message_text: 'Gracias por enviarme el pedido, llegó perfecto.', created_at: new Date(now.getTime() - 24 * 3600000).toISOString() },
         { conversation_id: juan.id, sender_type: 'agent', message_text: '¡De nada Juan! Cualquier otra consulta estamos a tu disposición.', created_at: new Date(now.getTime() - 23 * 3600000).toISOString() }
      ]);

      await fetchConversations();
    } catch (e) {
      console.error('❌ [DEBUG-COMPONENT-App] handleSeedData() — error:', e);
      alertDialog('Error al sembrar datos. Asegúrate de haber ejecutado el schema.sql primero.', { danger: true });
    }
    setIsSeeding(false);
  };

  if (!adminToken) {
    return <LoginModal onLoginSuccess={(token) => {
      setAdminToken(token);
    }} />;
  }

  const handleLogout = () => {
    clearAdminSession();
    setAdminToken(null);
  };


  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 font-sans text-gray-800 dark:text-gray-100 overflow-hidden">

      {!isOnline && (
        <div className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 py-1.5 text-xs font-semibold text-white bg-rose-600">
          <WifiOff size={14} />
          Sin conexión — los mensajes y la receta no se están actualizando. Se van a resincronizar solos apenas vuelva internet.
        </div>
      )}

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
        sessionPrewarningMs={sessionPrewarningMs}
        onSessionPrewarningChange={setSessionPrewarningMs}
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
          onOpenValidationMobile={() => { setShowValidationMobile(true); }}
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
          showMobile={showValidationMobile}
          onCloseMobile={() => { setShowValidationMobile(false); }}
        />
      )}

      {/* Fullscreen Image Modal */}
      {modalImage && (
        <ImageModal
          imageUrl={modalImage}
          onClose={() => {
            setModalImage(null);
          }}
        />
      )}

      <DialogHost />

    </div>
  );
}

export default App;
