import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Zap, Check, CheckCheck, Clock, AlertCircle, FileText, X, Loader2, Paperclip, History, Timer, CheckCircle, MessagesSquare, Images, ArrowLeft, ShoppingBag, Undo2, Hand, IdCard, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatPhone } from '../lib/formatPhone';
import { downloadFile, filenameFromUrl } from '../lib/downloadFile';
import { isAdminRole, getStaffSucursalId, adminFetch } from '../lib/adminAuth';
import { tomarConsulta } from '../lib/tomarConsulta';
import { tagMessage } from '../lib/tagMessage';
import HistoryPanel from './HistoryPanel';
import OrderHistoryPanel from './OrderHistoryPanel';
import { STATUS_BADGES } from './Sidebar';
import CloseChatModal from './CloseChatModal';
import ReturnToQueueModal from './ReturnToQueueModal';
import MessageBubble from './MessageBubble';
import MediaGalleryModal from './MediaGalleryModal';
import AdminPasswordActionModal from './AdminPasswordActionModal';
import { alertDialog } from '../lib/dialogService';

// Estados en los que la conversación ya está cerrada y no aplica el conteo de expiración.
const ESTADOS_CERRADOS = ['finalizada', 'resolved', 'rejected'];

// Cuántos mensajes viejos se traen por tanda al hacer scroll hacia arriba
// en la vista de "Ver todo el chat".
const HISTORY_PAGE_SIZE = 30;

const formatCountdown = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const mismoDia = (a, b) => a.toDateString() === b.toDateString();

// "Hoy" / "Ayer" son mucho más legibles que la fecha completa para lo más
// reciente; para el resto sí conviene la fecha larga, sin ambigüedad de año.
const formatDateDivider = (iso) => {
  const fecha = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(fecha, hoy)) return 'Hoy';
  if (mismoDia(fecha, ayer)) return 'Ayer';
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Mismo criterio que el backend (server/services/sessionExpiryChecker.js):
// el aviso automático "¿Seguís ahí?" no cuenta como actividad real, para que
// el contador en pantalla siga bajando exactamente igual que el que decide
// el cierre del lado del servidor.
const getLastRealMessage = (messages) => {
  const reales = (messages || []).filter(m => !m.is_auto_reminder);
  if (reales.length === 0) return null;
  return reales.reduce((latest, m) => (new Date(m.created_at) > new Date(latest.created_at) ? m : latest), reales[0]);
};

// Checks de estado (estilo WhatsApp) para mensajes salientes del operador o el bot.
const MessageStatusIcon = ({ estado }) => {
  switch (estado) {
    case 'leido':
      return <CheckCheck size={14} className="text-sky-300" title="Leído" />;
    case 'entregado':
      return <CheckCheck size={14} className="text-teal-100/80" title="Entregado" />;
    case 'enviado':
      return <Check size={14} className="text-teal-100/80" title="Enviado" />;
    case 'error':
      return <AlertCircle size={14} className="text-rose-200" title="No se pudo entregar" />;
    case 'pendiente':
    default:
      return <Clock size={12} className="text-teal-100/60" title="Enviando..." />;
  }
};

export default function ChatArea({
  activeConversation,
  messages,
  messagesEndRef,
  messageInput,
  setMessageInput,
  handleSendMessage,
  handleDeleteConversation,
  setModalImage,
  sessionTimeoutMs,
  onBackToHistory,
  onOpenValidationMobile
}) {
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [quickResponses, setQuickResponses] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [downloadingId, setDownloadingId] = useState(null);
  const [taggingId, setTaggingId] = useState(null);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  // Moderación de archivos adjuntos (sólo admin, ver server/routes/moderacion.js).
  const [purgeTarget, setPurgeTarget] = useState(null);
  const fileInputRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // "Ver todo el chat": en vez de un modal aparte, antepone mensajes de
  // consultas anteriores del mismo cliente arriba de los de la conversación
  // activa, dentro del mismo contenedor de scroll.
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [historyMessages, setHistoryMessages] = useState([]); // ascendente, más viejo primero
  const [historyConversationsById, setHistoryConversationsById] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  // Botón flotante "volver abajo": aparece cuando el operador scrollea hacia
  // arriba más de este umbral, para no tener que arrastrar manualmente todo
  // el camino de vuelta al último mensaje.
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const SCROLL_TO_BOTTOM_THRESHOLD = 200;

  // El nombre "bonito" del archivo (ej. "receta.pdf") viaja en message_text
  // para documentos/PDF; para fotos y videos no hay nombre real, así que
  // caemos al nombre técnico derivado de la URL de Storage.
  const esNombreArchivoValido = (texto) => /\.[a-z0-9]{2,5}$/i.test((texto || '').trim());

  const handleDownloadMedia = async (msg) => {
    setDownloadingId(msg.id);
    const nombre = esNombreArchivoValido(msg.message_text) ? msg.message_text.trim() : filenameFromUrl(msg.media_url);
    const resultado = await downloadFile(msg.media_url, nombre);
    if (!resultado.ok) {
      alertDialog('No se pudo descargar el archivo directamente. Se abrió en una pestaña nueva: desde ahí podés guardarlo con Ctrl+S o clic derecho → "Guardar como".');
    }
    setDownloadingId(null);
  };

  // Marca/desmarca un mensaje como comprobante o receta oficial de la
  // conversación (ver server/routes/api.js PATCH /messages/:id/tag). No hace
  // falta actualizar el estado local a mano: la fila llega actualizada por la
  // suscripción Realtime de App.jsx (igual que el resto de los UPDATE de 'messages').
  const handleTagMessage = async (msg, tag) => {
    setTaggingId(msg.id);
    try {
      await tagMessage(msg.id, tag);
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-ChatArea] Error marcando mensaje:', err);
      alertDialog(err.message || 'No se pudo marcar el archivo.', { danger: true });
    } finally {
      setTaggingId(null);
    }
  };

  const handlePurgeFile = async (msg, motivo, password) => {
    const res = await adminFetch('/api/admin/moderacion/purgar-archivo', {
      method: 'POST',
      body: JSON.stringify({ messageId: msg.id, motivo, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el archivo.');
    // No hace falta actualizar el mensaje local a mano: llega actualizado
    // por la suscripción de Realtime en App.jsx (mismo criterio que tagMessage).
  };

  // Corre el contador en vivo, segundo a segundo.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Trae las plantillas cada vez que se abre el menú, para reflejar cambios
  // hechos en Configuración sin necesidad de recargar la página.
  useEffect(() => {
    if (!showQuickResponses) return;
    adminFetch('/api/admin/quick-replies')
      .then(res => res.json())
      .then(data => {
        if (data.replies) {
          setQuickResponses(data.replies);
        } else {
          console.error('❌ [DEBUG-COMPONENT-ChatArea] error cargando quick_replies:', data.error);
        }
      });
  }, [showQuickResponses]);

  // Al cambiar de conversación activa, la vista de historial completo (y lo
  // ya cargado) deja de tener sentido: arranca de nuevo, cerrada.
  useEffect(() => {
    setShowFullHistory(false);
    setHistoryMessages([]);
    setHistoryConversationsById({});
    setHasMoreHistory(true);
    setShowScrollToBottom(false);
  }, [activeConversation?.id]);

  // Trae una tanda de mensajes más viejos que el más antiguo ya visible
  // (de cualquier consulta anterior del cliente, no la activa) y la antepone,
  // preservando la posición de scroll para que la vista no salte.
  const loadMoreHistory = async () => {
    if (!activeConversation || loadingHistory || loadingMoreHistory || !hasMoreHistory) return;

    const esPrimeraCarga = historyMessages.length === 0;
    if (esPrimeraCarga) {
      setLoadingHistory(true);
    } else {
      setLoadingMoreHistory(true);
    }

    let convMap = historyConversationsById;
    if (esPrimeraCarga) {
      const { data: convs } = await supabase
        .from('conversations')
        .select('*')
        .eq('client_phone', activeConversation.client_phone)
        .neq('id', activeConversation.id);

      // "Ver todo el chat" es justamente el acceso transversal explícito (a
      // diferencia del Directorio de Clientes, que sí aísla por sucursal):
      // trae el historial completo del cliente sin importar qué sucursal
      // atendió cada consulta anterior.
      convMap = Object.fromEntries((convs || []).map(c => [c.id, c]));
      setHistoryConversationsById(convMap);
    }

    const idsPermitidos = Object.keys(convMap);
    if (idsPermitidos.length === 0) {
      setHasMoreHistory(false);
      setLoadingHistory(false);
      setLoadingMoreHistory(false);
      return;
    }

    const cursor = esPrimeraCarga
      ? (messages[0]?.created_at || activeConversation.created_at)
      : historyMessages[0].created_at;

    const { data: pagina, error } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', idsPermitidos)
      .lt('created_at', cursor)
      .order('created_at', { ascending: false })
      .limit(HISTORY_PAGE_SIZE);

    if (error || !pagina || pagina.length === 0) {
      if (error) console.error('❌ [DEBUG-COMPONENT-ChatArea] error cargando página de historial:', error);
      setHasMoreHistory(false);
    } else {
      const nuevosAsc = [...pagina].reverse();
      const contenedor = messagesContainerRef.current;
      const scrollHeightPrevio = contenedor?.scrollHeight ?? 0;
      const scrollTopPrevio = contenedor?.scrollTop ?? 0;

      setHistoryMessages(prev => [...nuevosAsc, ...prev]);
      if (pagina.length < HISTORY_PAGE_SIZE) {
        setHasMoreHistory(false);
      }

      // Esperamos a que React pinte los mensajes nuevos arriba y recién ahí
      // corregimos el scroll, para que el usuario no vea saltar la vista.
      requestAnimationFrame(() => {
        if (contenedor) {
          contenedor.scrollTop = contenedor.scrollHeight - scrollHeightPrevio + scrollTopPrevio;
        }
      });
    }

    setLoadingHistory(false);
    setLoadingMoreHistory(false);
  };

  // Dispara la primera tanda apenas se activa "Ver todo el chat".
  useEffect(() => {
    if (showFullHistory && historyMessages.length === 0 && hasMoreHistory && !loadingHistory) {
      loadMoreHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFullHistory]);

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (el) {
      const distanciaAlFondo = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollToBottom(distanciaAlFondo > SCROLL_TO_BOTTOM_THRESHOLD);
    }

    if (!showFullHistory || loadingHistory || loadingMoreHistory || !hasMoreHistory) return;
    if (el && el.scrollTop < 80) {
      loadMoreHistory();
    }
  };

  const scrollMessagesToBottom = () => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const getConversacionDelMensaje = (msg) => {
    if (msg.conversation_id === activeConversation?.id) return activeConversation;
    return historyConversationsById[msg.conversation_id];
  };

  const soyAdmin = isAdminRole();
  // La encuesta de calificación (y la respuesta numérica del cliente) ya no
  // se le oculta a la sucursal: antes se cortaba el chat apenas aparecía
  // "Tu consulta ha finalizado", así que el operador nunca veía qué puntaje
  // había puesto el cliente ni el resto del intercambio de la encuesta.
  const displayedMessages = showFullHistory ? [...historyMessages, ...messages] : messages;

  const isConversacionCerrada = activeConversation && ESTADOS_CERRADOS.includes(activeConversation.status);
  // Ojo: un chat tomado por una sucursal sigue teniendo status 'esperando'
  // (lo que cambia al tomarlo es sucursal_id, no el status, ver App.jsx). La
  // cola general sin asignar es específicamente 'esperando' + sin sucursal_id.
  const estaEnColaGeneral = activeConversation?.status === 'esperando' && !activeConversation?.sucursal_id;
  // El bot todavía está atendiendo esta conversación solo: el cliente no
  // pidió un humano (si lo hubiera pedido, status pasaría a 'esperando', ver
  // manejarUbicacionHumano en bot.js) y nadie la tomó (sucursal_id null).
  // Mismo criterio que esBotAutomatico() en Sidebar.jsx (pestaña "Bot").
  const esModoBot = activeConversation
    && !isConversacionCerrada
    && activeConversation.status !== 'esperando'
    && !activeConversation.sucursal_id;
  // El admin puede responder cualquier chat sin reclamarlo; un empleado de
  // sucursal tiene que tocar "Tomar" primero (acá o desde el Sidebar) antes
  // de poder escribirle a un cliente de la cola general.
  const miSucursalId = getStaffSucursalId();
  const requiereTomarParaResponder = estaEnColaGeneral && !soyAdmin;
  // El contador sólo corre cuando la respuesta pendiente es del cliente (le
  // "toca" a la sucursal): si el último mensaje real lo mandó la sucursal,
  // el bot o el sistema, se muestra "--:--" en vez de una cuenta regresiva,
  // porque no hay inactividad que penalizar del lado de la sucursal todavía.
  // 'esperando' (derivada a un humano) está siempre pausado, sin importar
  // quién escribió último: coincide con que el backend (sessionExpiryChecker
  // y sessionManager) ya no cierra sola ninguna consulta en ese status, así
  // que mostrar una cuenta regresiva ahí sería mentirle al operador.
  let remainingMs = null;
  let timerPausedByClient = false;
  const showExpiryBadge = !!(activeConversation && !isConversacionCerrada && sessionTimeoutMs != null);
  if (showExpiryBadge) {
    if (activeConversation.status === 'esperando') {
      timerPausedByClient = true;
    } else {
      const lastMessage = getLastRealMessage(messages);
      if (!lastMessage || lastMessage.sender_type === 'client') {
        timerPausedByClient = true;
      } else {
        remainingMs = sessionTimeoutMs - (now - new Date(lastMessage.created_at).getTime());
      }
    }
  }

  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessageInput(value);

    if (value.endsWith('/')) {
      setShowQuickResponses(true);
    } else if (showQuickResponses && value.trim() === '') {
      setShowQuickResponses(false);
    }
  };

  const insertQuickResponse = (text) => {
    let current = messageInput;
    if (current.endsWith('/')) {
      current = current.slice(0, -1);
    }
    const nuevoValor = current ? `${current} ${text}` : text;
    setMessageInput(nuevoValor);
    setShowQuickResponses(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const [closingChat, setClosingChat] = useState(false);

  const executeCloseChat = async () => {
    if (!activeConversation) return;

    setClosingChat(true);
    try {
      const res = await adminFetch(`/api/conversations/${activeConversation.id}/close`, { method: 'POST' });
      if (!res.ok) throw new Error('No se pudo finalizar la consulta.');
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-ChatArea] Error finalizando la consulta:', err);
      alertDialog('No se pudo finalizar la consulta.', { danger: true });
    } finally {
      setClosingChat(false);
    }
  };

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  const [tomandoConsulta, setTomandoConsulta] = useState(false);

  const handleTomarDesdeChat = async () => {
    if (!activeConversation || !miSucursalId) return;
    setTomandoConsulta(true);
    try {
      const tomada = await tomarConsulta(activeConversation.id, miSucursalId);
      // No hace falta actualizar el estado local a mano: la suscripción de
      // Realtime en App.jsx va a traer el sucursal_id nuevo apenas Postgres
      // confirme el UPDATE.
    } catch (err) {
      console.error('❌ [DEBUG-COMPONENT-ChatArea] error en tomarConsulta():', err);
      alertDialog(err.message || 'No se pudo tomar la consulta.', { danger: true });
    } finally {
      setTomandoConsulta(false);
    }
  };

  const executeReturnToQueue = async (razon) => {
    if (!activeConversation) return;

    const res = await adminFetch(`/api/conversations/${activeConversation.id}/return-to-queue`, {
      method: 'POST',
      body: JSON.stringify({ razon })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('❌ [DEBUG-COMPONENT-ChatArea] error return-to-queue:', data.error);
      throw new Error(data.error || 'No se pudo devolver el chat a la cola de espera.');
    }
  };

  // Derivación directa a otra sucursal puntual (a diferencia de
  // executeReturnToQueue, que la manda a la cola general sin dueño): no hace
  // falta actualizar el estado local a mano, la suscripción de Realtime en
  // App.jsx trae el sucursal_id nuevo apenas Postgres confirme el UPDATE.
  const executeDerivarASucursal = async (sucursalId, razon) => {
    if (!activeConversation) return;

    const res = await adminFetch(`/api/conversations/${activeConversation.id}/derivar`, {
      method: 'POST',
      body: JSON.stringify({ sucursalId, razon })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('❌ [DEBUG-COMPONENT-ChatArea] error derivar:', data.error);
      throw new Error(data.error || 'No se pudo derivar la consulta.');
    }
  };

  // A partir del MIME real del archivo, no de su nombre: antes esto sólo
  // distinguía "imagen" de "todo lo demás", así que un video o un audio
  // adjuntado por el operador se mandaba a Meta como si fuera un documento
  // (WhatsApp lo rechaza/lo muestra roto) en vez de video/audio.
  const mediaTypeFromMime = (mimeType) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  };

  // Sube un archivo adjunto del operador al mismo bucket de Storage que usa
  // el webhook para la media entrante, y dispara el mensaje saliente con la
  // URL pública resultante.
  const uploadAndSendMedia = async (fileOrBlob, extension, mediaType) => {
    setIsUploading(true);
    const fileName = `${activeConversation.id}_${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from('media')
      .upload(fileName, fileOrBlob, fileOrBlob.type ? { contentType: fileOrBlob.type } : undefined);

    setIsUploading(false);

    if (error) {
      console.error('❌ [DEBUG-COMPONENT-ChatArea] Error subiendo el archivo:', error);
      alertDialog('No se pudo subir el archivo adjunto.', { danger: true });
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);
    handleSendMessage(null, publicUrlData.publicUrl, mediaType);
  };

  const handleSendClick = async () => {
    if (!messageInput.trim() && !selectedFile) return;

    if (selectedFile) {
      const fileExt = selectedFile.name.split('.').pop();
      const mediaType = mediaTypeFromMime(selectedFile.type || '');
      await uploadAndSendMedia(selectedFile, fileExt, mediaType);
      setSelectedFile(null);
    } else {
      handleSendMessage();
    }
  };

  return (
    <div className={`${activeConversation ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col bg-[#f0f2f5] dark:bg-gray-900 relative`}>
      {activeConversation ? (
        <>
          {/* Header */}
          <div className="px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-y-2 shadow-sm z-10">
            <div className="flex items-center gap-3 min-w-0">
              {onBackToHistory && (
                <button
                  onClick={onBackToHistory}
                  title="Volver al historial del cliente"
                  className="p-1.5 -ml-1.5 text-gray-500 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="font-bold text-gray-900 dark:text-gray-100 truncate">{activeConversation.real_name || activeConversation.client_name}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{formatPhone(activeConversation.client_phone)}</p>
              </div>
            </div>

            {showExpiryBadge && (
              <div
                title={
                  activeConversation.status === 'esperando'
                    ? 'Consulta derivada a un humano: el cierre automático por inactividad está desactivado'
                    : timerPausedByClient
                      ? 'El cliente escribió el último mensaje: el contador arranca cuando la sucursal responda'
                      : 'Tiempo restante antes de que la consulta se cierre por inactividad'
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tabular-nums transition-colors shrink-0 ${
                  timerPausedByClient || remainingMs <= 0
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    : remainingMs <= 30000
                      ? 'bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400'
                      : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                }`}
              >
                <Timer size={14} />
                {timerPausedByClient ? '--:--' : (remainingMs <= 0 ? 'Expirado' : `Expira en ${formatCountdown(remainingMs)}`)}
              </div>
            )}

            <div className="flex items-center gap-2 shrink-0">
               {onOpenValidationMobile && (
                 <button
                   onClick={onOpenValidationMobile}
                   title="Ver ficha del cliente / cotizador"
                   className="md:hidden p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                 >
                   <IdCard size={20} />
                 </button>
               )}
               <button
                 onClick={() => { setShowGallery(true); }}
                 title="Ver imágenes, videos, documentos y enlaces compartidos con el cliente"
                 className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
               >
                 <Images size={20} />
               </button>
               <button
                 onClick={() => { setShowFullHistory(v => !v); }}
                 title={showFullHistory ? 'Volver a esta consulta' : 'Ver todo el chat: cargar acá mismo los mensajes de consultas anteriores con este cliente'}
                 className={`p-2 rounded-full transition-colors ${showFullHistory ? 'bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
               >
                 <MessagesSquare size={20} />
               </button>
               {!isConversacionCerrada && !soyAdmin && !esModoBot && (
                 <button
                   onClick={() => { setIsCloseModalOpen(true); }}
                   disabled={closingChat}
                   title="Finalizar esta consulta y pedirle al cliente que la califique"
                   className="p-2 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 rounded-full transition-colors disabled:opacity-50"
                 >
                   {closingChat ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                 </button>
               )}
               {!isConversacionCerrada && !estaEnColaGeneral && !soyAdmin && !esModoBot && (
                 <button
                   onClick={() => { setIsReturnModalOpen(true); }}
                   title="Derivar a otra sucursal o devolver este chat a la lista de espera general"
                   className="p-2 text-gray-500 hover:bg-amber-50 hover:text-amber-600 rounded-full transition-colors"
                 >
                   <Undo2 size={20} />
                 </button>
               )}
               <button
                 onClick={() => { setShowHistory(true); }}
                 title="Historial de consultas del cliente"
                 className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
               >
                 <History size={20} />
               </button>
               <button
                 onClick={() => { setShowOrderHistory(true); }}
                 title="Historial de pedidos del cliente"
                 className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
               >
                 <ShoppingBag size={20} />
               </button>
            </div>
          </div>
          
          {/* Messages Area */}
          <div className="relative flex-1 overflow-hidden">
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="absolute inset-0 overflow-y-auto p-6 space-y-4 bg-[#efeae2] dark:bg-[#0b141a] scrollbar-thin"
          >
            {showFullHistory && loadingHistory && (
              <div className="flex items-center justify-center gap-2 py-2 text-gray-400 text-xs">
                <Loader2 size={14} className="animate-spin" /> Cargando historial...
              </div>
            )}
            {showFullHistory && loadingMoreHistory && (
              <div className="flex items-center justify-center gap-2 py-2 text-gray-400 text-xs">
                <Loader2 size={14} className="animate-spin" /> Cargando mensajes anteriores...
              </div>
            )}
            {showFullHistory && !loadingHistory && !hasMoreHistory && historyMessages.length > 0 && (
              <div className="flex items-center justify-center py-2 text-gray-400 text-[11px]">
                — Inicio del historial con este cliente —
              </div>
            )}
            {displayedMessages.length === 0 ? (
               <div className="flex items-center justify-center h-full text-gray-400">
                  No hay mensajes aún.
               </div>
            ) : (displayedMessages.map((msg, i) => {
              const anterior = displayedMessages[i - 1];
              const cambioDeDia = showFullHistory && (!anterior || !mismoDia(new Date(anterior.created_at), new Date(msg.created_at)));
              const cambioDeSesion = showFullHistory && !cambioDeDia && anterior && msg.conversation_id !== anterior.conversation_id;
              const conv = showFullHistory ? getConversacionDelMensaje(msg) : null;

              return (
                <React.Fragment key={msg.id}>
                  {cambioDeDia && (
                    <div className="flex justify-center my-2">
                      <span className="bg-white/90 dark:bg-gray-800/90 text-gray-500 dark:text-gray-300 text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                        {formatDateDivider(msg.created_at)}
                      </span>
                    </div>
                  )}
                  {cambioDeSesion && (
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-gray-300/60 dark:bg-gray-600/60" />
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium px-1 flex items-center gap-1.5 whitespace-nowrap">
                        Nueva consulta
                        {conv && STATUS_BADGES[conv.status] && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGES[conv.status].className}`}>
                            {STATUS_BADGES[conv.status].label}
                          </span>
                        )}
                      </span>
                      <div className="flex-1 h-px bg-gray-300/60 dark:bg-gray-600/60" />
                    </div>
                  )}
                  {msg.sender_type === 'system' ? (
                    // Nota interna (motivo de derivación/devolución, ver
                    // derivacionSucursal.js / devolucionCola.js): sólo la ve
                    // el operador acá en el CRM, nunca se le manda al
                    // cliente por WhatsApp, así que no usa MessageBubble
                    // (esa sí es la burbuja de un mensaje real de chat).
                    <div className="flex justify-center w-full my-2">
                      <span className="bg-blue-600 text-white text-base px-5 py-2.5 rounded-full border border-blue-700">
                        {msg.message_text}
                      </span>
                    </div>
                  ) : (
                    <MessageBubble
                      msg={msg}
                      onImageClick={(m) => { setModalImage(m.media_url); }}
                      onDownload={handleDownloadMedia}
                      downloadingId={downloadingId}
                      onTag={handleTagMessage}
                      taggingId={taggingId}
                      statusIcon={msg.sender_type !== 'client' && <MessageStatusIcon estado={msg.estado} />}
                      canModerate={soyAdmin}
                      onPurgeFile={(m) => { setPurgeTarget(m); }}
                      purgingId={purgeTarget?.id}
                    />
                  )}
                </React.Fragment>
              );
            }))}
            <div ref={messagesEndRef} />
          </div>

          {showScrollToBottom && (
            <button
              onClick={scrollMessagesToBottom}
              title="Ir al final de la conversación"
              className="absolute bottom-4 right-4 z-10 p-3 bg-white dark:bg-gray-800 text-teal-600 dark:text-teal-400 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors animate-fade-in-up"
            >
              <ChevronDown size={20} />
            </button>
          )}
          </div>

          {/* Input Area (oculta en conversaciones cerradas/Historial: no se puede escribir ahí) */}
          {isConversacionCerrada ? (
            <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
              Esta consulta está cerrada. No se pueden enviar mensajes desde el Historial.
            </div>
          ) : soyAdmin ? (
            <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
              Modo supervisión: estás viendo este chat como espectador. El administrador no puede enviar mensajes ni intervenir en la atención.
            </div>
          ) : esModoBot ? (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border-t border-blue-200 dark:border-blue-900 flex items-center justify-between gap-3">
              <span className="text-sm text-blue-800 dark:text-blue-400">
                El cliente está hablando con el bot. ¿Querés interferir y tomar la consulta?
              </span>
              <button
                onClick={handleTomarDesdeChat}
                disabled={tomandoConsulta || !miSucursalId}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50 shrink-0"
              >
                {tomandoConsulta ? <Loader2 size={16} className="animate-spin" /> : <Hand size={16} />}
                {tomandoConsulta ? 'Tomando...' : 'Tomar consulta'}
              </button>
            </div>
          ) : requiereTomarParaResponder ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-950 border-t border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3">
              <span className="text-sm text-amber-800 dark:text-amber-400">
                Esta consulta todavía no fue tomada por ninguna sucursal. Tomala para poder responderle al cliente.
              </span>
              <button
                onClick={handleTomarDesdeChat}
                disabled={tomandoConsulta || !miSucursalId}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50 shrink-0"
              >
                {tomandoConsulta ? <Loader2 size={16} className="animate-spin" /> : <Hand size={16} />}
                {tomandoConsulta ? 'Tomando...' : 'Tomar esta consulta'}
              </button>
            </div>
          ) : (
          <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 relative flex flex-col gap-2">
            {showQuickResponses && (
              <div className="absolute bottom-[100%] mb-2 left-4 right-4 md:right-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-xl w-auto md:w-[350px] overflow-hidden z-20">
                <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap size={16} className="text-amber-500" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Respuestas Rápidas</span>
                  </div>
                  <button onClick={() => { setShowQuickResponses(false); }} className="text-gray-400 hover:text-gray-600">
                    <Check size={16} className="opacity-0" />
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto scrollbar-thin">
                  {quickResponses.length === 0 ? (
                    <div className="p-3 text-xs text-gray-400 text-center">
                      No hay plantillas creadas. Agregalas desde Configuración.
                    </div>
                  ) : (
                    quickResponses.map((qr) => (
                      <button
                        key={qr.id}
                        onClick={() => insertQuickResponse(qr.message_text)}
                        className="w-full text-left p-3 hover:bg-teal-50 dark:hover:bg-teal-950 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors flex flex-col gap-1"
                      >
                        <span className="text-sm font-semibold text-teal-800 dark:text-teal-400">{qr.shortcut}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{qr.message_text}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* File Preview */}
            {selectedFile && (
              <div className="self-start px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-between gap-4 max-w-sm">
                 <div className="flex items-center gap-2 overflow-hidden">
                    {selectedFile.type.startsWith('image/') ? (
                       <img src={URL.createObjectURL(selectedFile)} alt="preview" className="h-10 w-10 object-cover rounded shadow-sm" />
                    ) : (
                       <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 flex items-center justify-center rounded shadow-sm"><FileText size={20} className="text-gray-500"/></div>
                    )}
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{selectedFile.name}</span>
                 </div>
                 <button onClick={() => { setSelectedFile(null); }} className="p-1 text-gray-400 hover:text-rose-500 bg-white dark:bg-gray-900 rounded-full shadow-sm"><X size={16}/></button>
              </div>
            )}

            <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl p-2 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500 transition-shadow">
              <button
                onClick={() => { setShowQuickResponses(!showQuickResponses); }}
                className={`p-2 transition-colors rounded-lg ${showQuickResponses ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950'}`}
                title="Respuestas Rápidas (/)"
              >
                <Zap size={20} />
              </button>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
                accept="image/*,video/*,.pdf,.doc,.docx"
              />
              <button
                onClick={() => { fileInputRef.current?.click(); }}
                className="p-2 text-gray-400 hover:text-teal-600 transition-colors"
                title="Adjuntar archivo"
              >
                <Paperclip size={20} />
              </button>

              <textarea
                className="flex-1 bg-transparent max-h-32 min-h-[40px] resize-none outline-none py-2 px-2 text-sm scrollbar-thin dark:text-gray-100"
                placeholder="Escribe un mensaje... (Usa '/' para plantillas)"
                value={messageInput}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendClick();
                  }
                }}
              />
              <button
                onClick={handleSendClick}
                disabled={(!messageInput.trim() && !selectedFile) || isUploading}
                className="p-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center w-10 h-10"
              >
                {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              </button>
            </div>
          </div>
          )}

          {showHistory && (
            <HistoryPanel
              clientPhone={activeConversation.client_phone}
              clientName={activeConversation.real_name || activeConversation.client_name}
              currentConversationId={activeConversation.id}
              onClose={() => { setShowHistory(false); }}
            />
          )}

          {showOrderHistory && (
            <OrderHistoryPanel
              clientPhone={activeConversation.client_phone}
              clientName={activeConversation.real_name || activeConversation.client_name}
              onClose={() => { setShowOrderHistory(false); }}
            />
          )}

          {showGallery && (
            <MediaGalleryModal
              clientPhone={activeConversation.client_phone}
              clientName={activeConversation.real_name || activeConversation.client_name}
              conversationId={activeConversation.id}
              showFullHistory={showFullHistory}
              setModalImage={setModalImage}
              onClose={() => { setShowGallery(false); }}
            />
          )}

          <CloseChatModal
            isOpen={isCloseModalOpen}
            onClose={() => { setIsCloseModalOpen(false); }}
            activeConversation={activeConversation}
            onConfirmClose={executeCloseChat}
          />

          <ReturnToQueueModal
            isOpen={isReturnModalOpen}
            onClose={() => { setIsReturnModalOpen(false); }}
            onReturnToQueue={executeReturnToQueue}
            onDerivar={executeDerivarASucursal}
            miSucursalId={miSucursalId}
          />

          <AdminPasswordActionModal
            isOpen={!!purgeTarget}
            onClose={() => { setPurgeTarget(null); }}
            title="Eliminar archivo"
            description="El archivo se borra del servidor y se reemplaza por un aviso con el motivo. Esta acción no se puede deshacer."
            motivoPlaceholder="Motivo de la eliminación..."
            confirmLabel="Eliminar archivo"
            onConfirm={(motivo, password) => handlePurgeFile(purgeTarget, motivo, password)}
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-white dark:bg-gray-900">
          <MessageSquare size={64} className="mb-4 text-gray-300 dark:text-gray-700" />
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400">Selecciona una conversación</p>
        </div>
      )}
    </div>
  );
}
