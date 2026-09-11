import express from 'express';
import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { getSessionTimeoutMs, setSessionTimeoutMs, MIN_SESSION_TIMEOUT_MS, MAX_SESSION_TIMEOUT_MS, getBotKeyword, setBotKeyword, getWelcomeMessage, setWelcomeMessage } from '../services/appConfig.js';
import { finalizarConversacion } from '../services/ratingSurvey.js';
import { TERMINAL_STATUSES } from '../services/sessionManager.js';
import { getBotSchedule, getHumanSchedule, setBotSchedule, setHumanSchedule } from '../services/scheduleConfig.js';
import { rowsToCsv, sendCsv } from '../services/csvExport.js';

const router = express.Router();

const parseDateRange = (query) => {
  const { startDate, endDate } = query;
  if (!startDate || !endDate) {
    throw new Error('Debés indicar startDate y endDate (formato YYYY-MM-DD).');
  }
  return {
    from: `${startDate}T00:00:00.000Z`,
    to: `${endDate}T23:59:59.999Z`
  };
};

// Exporta el historial de mensajes (con datos del cliente y la consulta) en el rango de fechas dado.
router.get('/export/chats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { from, to } = parseDateRange(req.query);

    const { data, error } = await supabase
      .from('messages')
      .select('created_at, sender_type, message_text, media_type, conversation_id, conversations(client_name, client_phone, status)')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at');

    if (error) throw error;

    const phones = [...new Set((data || []).map(r => r.conversations?.client_phone).filter(Boolean))];
    const { data: clientes } = await supabase.from('clientes').select('client_phone, nombre_completo').in('client_phone', phones);
    const phoneMap = {};
    clientes?.forEach(c => { if (c.nombre_completo) phoneMap[c.client_phone] = c.nombre_completo; });

    const columns = [
      { label: 'Fecha y hora', value: r => new Date(r.created_at).toLocaleString('es-AR') },
      { label: 'Cliente', value: r => phoneMap[r.conversations?.client_phone] || r.conversations?.client_name || '' },
      { label: 'Teléfono', value: r => r.conversations?.client_phone || '' },
      { label: 'Estado de la consulta', value: r => r.conversations?.status || '' },
      { label: 'Remitente', value: r => r.sender_type || '' },
      { label: 'Tipo de mensaje', value: r => r.media_type || 'text' },
      { label: 'Mensaje', value: r => r.message_text || '' }
    ];

    const csv = rowsToCsv(columns, data || []);
    console.log(`[API] -> Exportando historial de chats (${(data || []).length} mensajes, ${startDate} a ${endDate}).`);
    sendCsv(res, `historial-chats_${startDate}_a_${endDate}.csv`, csv);
  } catch (error) {
    console.error('[API] ❌ Error exportando historial de chats:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Exporta las consultas del rango de fechas con su calificación (1-5) y un resumen.
router.get('/export/metrics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { from, to } = parseDateRange(req.query);

    const { data, error } = await supabase
      .from('conversations')
      .select('created_at, client_name, client_phone, status, rating, product_rating')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at');

    if (error) throw error;

    const conversations = data || [];
    const phones = [...new Set(conversations.map(c => c.client_phone).filter(Boolean))];
    const { data: clientes } = await supabase.from('clientes').select('client_phone, nombre_completo').in('client_phone', phones);
    const phoneMap = {};
    clientes?.forEach(c => { if (c.nombre_completo) phoneMap[c.client_phone] = c.nombre_completo; });

    const calificadasAtencion = conversations.filter(c => c.rating != null);
    const promedioAtencion = calificadasAtencion.length > 0
      ? (calificadasAtencion.reduce((acc, c) => acc + c.rating, 0) / calificadasAtencion.length).toFixed(2)
      : 'Sin datos';
    const calificadasProducto = conversations.filter(c => c.product_rating != null);
    const promedioProducto = calificadasProducto.length > 0
      ? (calificadasProducto.reduce((acc, c) => acc + c.product_rating, 0) / calificadasProducto.length).toFixed(2)
      : 'Sin datos';

    const detailColumns = [
      { label: 'Fecha de creación', value: r => new Date(r.created_at).toLocaleString('es-AR') },
      { label: 'Cliente', value: r => phoneMap[r.client_phone] || r.client_name || '' },
      { label: 'Teléfono', value: r => r.client_phone || '' },
      { label: 'Estado', value: r => r.status || '' },
      { label: 'Calificación de atención (1-5)', value: r => (r.rating != null ? r.rating : '') },
      { label: 'Calificación de producto (1-5)', value: r => (r.product_rating != null ? r.product_rating : '') }
    ];

    const summaryColumns = [
      { label: 'Resumen', value: r => r.label },
      { label: 'Valor', value: r => r.value }
    ];
    const summaryRows = [
      { label: 'Total de consultas', value: conversations.length },
      { label: 'Consultas con calificación de atención', value: calificadasAtencion.length },
      { label: 'Promedio de calificación de atención', value: promedioAtencion },
      { label: 'Consultas con calificación de producto', value: calificadasProducto.length },
      { label: 'Promedio de calificación de producto', value: promedioProducto }
    ];

    const csv = rowsToCsv(detailColumns, conversations) + '\r\n\r\n' + rowsToCsv(summaryColumns, summaryRows);
    console.log(`[API] -> Exportando métricas (${conversations.length} consultas, ${startDate} a ${endDate}).`);
    sendCsv(res, `metricas_${startDate}_a_${endDate}.csv`, csv);
  } catch (error) {
    console.error('[API] ❌ Error exportando métricas:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Métricas de negocio para el panel de "Métricas y Estadísticas" del CRM:
// conversión de ventas gestionada a mano, resolución autónoma del bot vs
// derivación a humanos, y efectividad del filtro de seguridad de PDFs.
router.get('/metrics/negocio', async (req, res) => {
  try {
    const { data: cerradas, error: cerradasError } = await supabase
      .from('conversations')
      .select('id')
      .in('status', TERMINAL_STATUSES);
    if (cerradasError) throw cerradasError;

    const idsCerradas = cerradas.map(c => c.id);
    let derivadas = 0;
    if (idsCerradas.length > 0) {
      const { data: conAgente, error: agenteError } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('sender_type', 'agent')
        .in('conversation_id', idsCerradas);
      if (agenteError) throw agenteError;
      derivadas = new Set(conAgente.map(m => m.conversation_id)).size;
    }
    const totalCerradas = idsCerradas.length;
    const autonomas = totalCerradas - derivadas;
    const pctAutonoma = totalCerradas > 0 ? (autonomas / totalCerradas) * 100 : 0;

    const { count: pdfBloqueados, error: bloqError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('media_type', 'blocked_pdf');
    if (bloqError) throw bloqError;

    const { count: pdfAceptados, error: acepError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('media_type', 'pdf');
    if (acepError) throw acepError;

    // Conversión de ventas: resultado que el vendedor marca a mano (Venta
    // Concretada / No Concretada) sobre lo cotizado en el chat.
    const { data: gestionVentas, error: gestionError } = await supabase
      .from('conversations')
      .select('sale_status, sale_amount')
      .not('sale_status', 'is', null);
    if (gestionError) throw gestionError;

    const concretadas = gestionVentas.filter(g => g.sale_status === 'concretada');
    const noConcretadas = gestionVentas.filter(g => g.sale_status === 'no_concretada');
    const otras = gestionVentas.filter(g => g.sale_status === 'otra');
    const ticketPromedioConcretadas = concretadas.length > 0
      ? concretadas.reduce((acc, g) => acc + (Number(g.sale_amount) || 0), 0) / concretadas.length
      : 0;
    const totalGestionadas = gestionVentas.length;
    const tasaConversion = totalGestionadas > 0 ? (concretadas.length / totalGestionadas) * 100 : 0;

    // Calificaciones de satisfacción: atención (`rating`) y producto
    // (`product_rating`) son independientes entre sí. Se calcula el promedio
    // global y también desglosado por sucursal, para que cada local pueda ver
    // cómo viene su propio puntaje (el frontend decide qué mostrarle a quién
    // según el rol, esto solo calcula los números).
    const { data: ratingsData, error: ratingsError } = await supabase
      .from('conversations')
      .select('rating, product_rating, sucursal_id')
      .or('rating.not.is.null,product_rating.not.is.null');
    if (ratingsError) throw ratingsError;

    const { data: sucursalesData, error: sucursalesError } = await supabase
      .from('sucursales')
      .select('id, nombre')
      .order('orden');
    if (sucursalesError) throw sucursalesError;
    const nombrePorSucursalId = Object.fromEntries((sucursalesData || []).map(s => [s.id, s.nombre]));

    const resumenDe = (valores) => {
      const limpios = valores.filter(v => v != null);
      const total = limpios.length;
      const promedio = total > 0 ? limpios.reduce((a, b) => a + b, 0) / total : 0;
      const distribucion = [1, 2, 3, 4, 5].reduce((acc, n) => {
        acc[n] = limpios.filter(v => v === n).length;
        return acc;
      }, {});
      return { total, promedio, distribucion };
    };

    const filas = ratingsData || [];
    const porSucursalMap = new Map();
    for (const fila of filas) {
      const clave = fila.sucursal_id || 'sin_sucursal';
      if (!porSucursalMap.has(clave)) porSucursalMap.set(clave, []);
      porSucursalMap.get(clave).push(fila);
    }
    const porSucursal = Array.from(porSucursalMap.entries()).map(([sucursalId, filasSucursal]) => ({
      sucursalId: sucursalId === 'sin_sucursal' ? null : sucursalId,
      nombre: sucursalId === 'sin_sucursal' ? 'Sin sucursal asignada' : (nombrePorSucursalId[sucursalId] || 'Sucursal eliminada'),
      atencion: resumenDe(filasSucursal.map(f => f.rating)),
      producto: resumenDe(filasSucursal.map(f => f.product_rating))
    }));

    res.status(200).json({
      conversion: {
        totalGestionadas,
        concretadas: concretadas.length,
        noConcretadas: noConcretadas.length,
        otras: otras.length,
        tasaConversion,
        ticketPromedioConcretadas
      },
      operacion: { totalCerradas, autonomas, derivadas, pctAutonoma },
      seguridad: { pdfBloqueados: pdfBloqueados || 0, pdfAceptados: pdfAceptados || 0 },
      calificaciones: {
        atencion: resumenDe(filas.map(f => f.rating)),
        producto: resumenDe(filas.map(f => f.product_rating)),
        porSucursal
      }
    });
  } catch (error) {
    console.error('[API] ❌ Error calculando métricas de negocio:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Horarios de atención del bot y de los asesores humanos.
router.get('/schedules', async (req, res) => {
  const [bot, human] = await Promise.all([getBotSchedule(), getHumanSchedule()]);
  res.status(200).json({ bot, human });
});

router.put('/schedules', async (req, res) => {
  const { bot, human } = req.body;

  try {
    if (bot) await setBotSchedule(bot);
    if (human) await setHumanSchedule(human);
    console.log('[API] -> Horarios de atención actualizados.');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[API] ❌ Error actualizando horarios:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Palabra clave con la que un cliente reactiva al bot en modo humano.
router.get('/bot-config', async (req, res) => {
  const botKeyword = await getBotKeyword();
  res.status(200).json({ botKeyword });
});

router.put('/bot-config', async (req, res) => {
  const { botKeyword } = req.body;

  try {
    await setBotKeyword(botKeyword);
    console.log(`[API] -> Palabra clave del bot actualizada a "${botKeyword}".`);
    res.status(200).json({ success: true, botKeyword: botKeyword.toString().trim() });
  } catch (error) {
    console.error('[API] ❌ Error actualizando bot-config:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Mensaje de bienvenida que el bot manda al arrancar (o reiniciar) una consulta.
// El menú numerado (1/2/3) que se agrega después es fijo: está atado a los
// manejadores del bot, así que no forma parte de lo personalizable acá.
router.get('/welcome-message', async (req, res) => {
  const welcomeMessage = await getWelcomeMessage();
  res.status(200).json({ welcomeMessage });
});

router.put('/welcome-message', async (req, res) => {
  const { welcomeMessage } = req.body;

  try {
    await setWelcomeMessage(welcomeMessage);
    console.log(`[API] -> Mensaje de bienvenida actualizado.`);
    res.status(200).json({ success: true, welcomeMessage: welcomeMessage.toString().trim() });
  } catch (error) {
    console.error('[API] ❌ Error actualizando welcome-message:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Cierre manual de una consulta desde el CRM: mismo cierre + encuesta que el
// checker automático por inactividad, pero disparado por el operador.
router.post('/conversations/:id/close', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: conv, error } = await supabase
      .from('conversations')
      .select('id, client_phone, status')
      .eq('id', id)
      .single();

    if (error || !conv) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    await finalizarConversacion(conv.id, conv.client_phone, '');
    console.log(`[API] -> Consulta ${id} cerrada manualmente desde el CRM.`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[API] ❌ Error cerrando conversación manualmente:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Config expuesta al frontend para que el contador de expiración del CRM
// siempre calcule contra el mismo límite real que usa el backend.
router.get('/session-config', async (req, res) => {
  const sessionTimeoutMs = await getSessionTimeoutMs();
  res.status(200).json({ sessionTimeoutMs, minSessionTimeoutMs: MIN_SESSION_TIMEOUT_MS, maxSessionTimeoutMs: MAX_SESSION_TIMEOUT_MS });
});

router.put('/session-config', async (req, res) => {
  const { sessionTimeoutMs } = req.body;

  try {
    await setSessionTimeoutMs(Number(sessionTimeoutMs));
    console.log(`[API] -> Límite de expiración de sesión actualizado a ${sessionTimeoutMs} ms.`);
    res.status(200).json({ success: true, sessionTimeoutMs: Number(sessionTimeoutMs) });
  } catch (error) {
    console.error('[API] ❌ Error actualizando session-config:', error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post('/messages/send', async (req, res) => {
  console.log(`\n======================================================`);
  console.log(`[API - POST /messages/send] ==> INICIO DE ENVÍO DE MENSAJE (OUTBOUND)`);
  console.log(`[API - POST /messages/send] ==> Body recibido:`, JSON.stringify(req.body, null, 2));

  const { conversation_id, message_text, phone, message, media_url, media_type, id, sender_type } = req.body;

  const finalMessage = message || message_text || '';
  console.log(`[API] -> Mensaje resuelto final: "${finalMessage}"`);
  
  if (!finalMessage && !media_url) {
    console.warn('[API] ⚠️ ABORTO: Falta contenido del mensaje o archivo adjunto.');
    console.log(`======================================================\n`);
    return res.status(400).json({ error: 'Falta el contenido del mensaje o el archivo adjunto' });
  }

  try {
    let finalPhone = phone;
    let finalConversationId = conversation_id;

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> A. RESOLUCIÓN DE DESTINATARIO`);
    
    if (!finalPhone && finalConversationId) {
      console.log(`[API] -> Condición: No hay phone pero SÍ conversation_id (${finalConversationId}). Buscando en DB...`);
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('client_phone')
        .eq('id', finalConversationId)
        .single();

      if (convError || !conv) {
        console.error(`[API] ❌ ERROR: Conversación no encontrada en Supabase. Detalles:`, convError);
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }
      finalPhone = conv.client_phone;
      console.log(`[API] ✅ Teléfono recuperado de DB: ${finalPhone}`);
    } else if (finalPhone && !finalConversationId) {
      console.log(`[API] -> Condición: SÍ hay phone (${finalPhone}) pero NO conversation_id. Buscando en DB...`);
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .eq('client_phone', finalPhone)
        .single();
        
      if (convError) {
         console.warn(`[API] ⚠️ Advertencia buscando ID de conversación por teléfono:`, convError);
      }
      if (conv) {
         finalConversationId = conv.id;
         console.log(`[API] ✅ Conversation_id recuperado de DB: ${finalConversationId}`);
      } else {
         console.log(`[API] -> No se encontró conversation_id previo para este teléfono.`);
      }
    } else {
      console.log(`[API] -> Condición: Ambos phone y conversation_id provistos (o ninguno). Phone: ${finalPhone}, ID: ${finalConversationId}`);
    }

    if (!finalPhone) {
      console.warn('[API] ⚠️ ABORTO: Imposible resolver el número de teléfono.');
      console.log(`======================================================\n`);
      return res.status(400).json({ error: 'Faltan parámetros requeridos (phone o conversation_id)' });
    }
    
    let cleanPhone = finalPhone.replace('+', '').replace(/\\s+/g, '').replace('-', '');
    console.log(`[API] -> Teléfono limpio para Meta: ${cleanPhone}`);
    
    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> B. PERSISTENCIA INICIAL EN SUPABASE (estado: pendiente)`);
    
    let dbMessageId = null;
    if (finalConversationId) {
        const typeDB = media_url ? (media_type || 'image') : 'text';
        const messagePayload = {
            // Si el frontend ya generó un id (mensaje optimista), lo reusamos para que sea
            // la MISMA fila que Realtime le devuelve al cliente, en vez de una duplicada.
            ...(id ? { id } : {}),
            conversation_id: finalConversationId,
            sender_type: sender_type || 'agent',
            message_text: finalMessage,
            media_type: typeDB,
            media_url: media_url,
            estado: 'pendiente'
        };
        console.log(`[API] -> Insertando mensaje como pendiente en DB...`);
        const { data: insertData, error: insertError } = await supabase.from('messages').insert([messagePayload]).select().single();
        if (insertError) {
            console.error('[API] ❌ ERROR GUARDANDO MENSAJE PENDIENTE:', insertError);
        } else if (insertData) {
            dbMessageId = insertData.id;
            console.log(`[API] ✅ Mensaje pendiente guardado con ID:`, dbMessageId);
        }
    }

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> C. LLAMADA AL SERVICIO DE META (whatsapp.js)`);
    console.log(`[API] -> Enviando a sendWhatsAppMessage. Destino: ${cleanPhone}, Texto: "${finalMessage}", MediaUrl: ${media_url}, MediaType: ${media_type}`);
    
    const metaResponse = await sendWhatsAppMessage(cleanPhone, finalMessage, media_url, media_type);
    console.log(`[API] ✅ Respuesta exitosa de Meta recibida en el endpoint:`, metaResponse);
    
    const wamid = metaResponse?.messages?.[0]?.id;

    console.log(`\n------------------------------------------------------`);
    console.log(`[API] ==> D. ACTUALIZACIÓN POST-ENVÍO EN SUPABASE`);
    
    if (dbMessageId && wamid) {
        console.log(`[API] -> Actualizando mensaje ${dbMessageId} a estado 'enviado' con wamid: ${wamid}`);
        await supabase.from('messages')
            .update({ estado: 'enviado', wamid: wamid })
            .eq('id', dbMessageId);
    }
    
    if (finalConversationId) {
        const previewText = media_url ? `📎 Archivo enviado${finalMessage ? ' - ' + finalMessage : ''}` : finalMessage;
        console.log(`[API] -> Actualizando last_message en 'conversations' a: "${previewText}"`);
        
        await supabase.from('conversations')
            .update({ last_message: previewText })
            .eq('id', finalConversationId);
    }

    console.log(`[API - POST /messages/send] ==> ✅ FIN CICLO DE VIDA (SUCCESS 200)`);
    console.log(`======================================================\n`);
    res.status(200).json({ success: true, message: 'Enviado a WhatsApp y guardado en DB', meta: metaResponse });
    
  } catch (error) {
    console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    console.error(`[API - CATCH BLOCK] ❌ ERROR FATAL PROCESANDO EL ENVÍO:`);
    console.error(error.stack || error);
    console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

export default router;
