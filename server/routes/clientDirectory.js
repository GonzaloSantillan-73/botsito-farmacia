import express from 'express';
import { requireAuth } from './adminAuth.js';
import { obtenerConversacionesDirectorio, obtenerListaClientesDirectorio, buscarEnMensajesDirectorio, obtenerHistorialClienteParaChat } from '../services/clientDirectory.js';
import { obtenerDetalleConsultas } from '../services/metricsDetalle.js';
import { supabase } from '../supabase.js';

const router = express.Router();

// El Directorio de Clientes (Historial de Consultas + Lista de Clientes) lo
// usan tanto el admin como el staff de sucursal; a diferencia de Métricas acá
// no se bloquea por rol sino que se acota el propio contenido: el sucursalId
// sale siempre del JWT verificado (req.admin), nunca de algo que mande el
// cliente, para que un empleado no pueda ver ni buscar consultas de otra
// sucursal cambiando parámetros en el pedido.
router.use(requireAuth);

router.get('/conversations', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] GET', req.originalUrl, '— method:', req.method, 'path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] params:', req.params, 'query:', req.query, 'body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] req.admin:', req.admin);

  const sucursalId = req.admin.role === 'admin' ? null : req.admin.sucursalId;
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] sucursalId calculado:', sucursalId, '— role:', req.admin.role);

  // Dos consultas independientes a propósito ("Historial de Consultas"
  // necesita el client_phone tal cual quedó en cada conversación; "Lista de
  // Clientes" necesita el vigente en `clientes`, ver clientDirectory.js) —
  // Promise.allSettled en vez de Promise.all: si UNA falla (ej. falta correr
  // alguna migración de supabase/*.sql y una tabla/columna todavía no
  // existe), la otra igual llega al frontend en vez de que todo el endpoint
  // devuelva 500 y las dos pestañas se vean vacías sin ninguna pista de por
  // qué (justo el síntoma reportado: "vistas vacías a pesar de haber datos").
  const [conversationsResult, clientsResult] = await Promise.allSettled([
    obtenerConversacionesDirectorio({
      sucursalId,
      // Sólo fechas con formato AAAA-MM-DD (lo que manda el input de fecha).
      desde: /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde || '') ? req.query.desde : null,
      hasta: /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta || '') ? req.query.hasta : null
    }),
    obtenerListaClientesDirectorio({ sucursalId })
  ]);

  if (conversationsResult.status === 'rejected') {
    console.error('❌ [DEBUG-ROUTES-CLIENTDIRECTORY] obtenerConversacionesDirectorio() falló:', conversationsResult.reason);
  }
  if (clientsResult.status === 'rejected') {
    console.error('❌ [DEBUG-ROUTES-CLIENTDIRECTORY] obtenerListaClientesDirectorio() falló:', clientsResult.reason);
  }

  const conversations = conversationsResult.status === 'fulfilled' ? conversationsResult.value : [];
  const clients = clientsResult.status === 'fulfilled' ? clientsResult.value : [];
  // Mensaje tal cual lo devuelve Postgres/PostgREST (ej. "relation ... does
  // not exist"): a propósito, para que una migración pendiente se note de
  // una en el frontend en vez de disfrazarse de "no hay datos".
  const errors = {
    conversations: conversationsResult.status === 'rejected' ? (conversationsResult.reason?.message || 'Error desconocido.') : null,
    clients: clientsResult.status === 'rejected' ? (clientsResult.reason?.message || 'Error desconocido.') : null
  };

  console.log('✅ [DEBUG-ROUTES-CLIENTDIRECTORY] conversations count:', conversations.length, ', clients count:', clients.length, ', errors:', errors);
  console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] respondiendo status: 200 body:', { conversations, clients, errors });
  res.status(200).json({ conversations, clients, errors });
});

// Historial de un cliente puntual (ícono "Historial de consultas" dentro de
// un chat activo, ver HistoryPanel.jsx) — no confundir con GET /conversations
// de arriba, que es la vista global de la pestaña "Historial de Consultas"
// del Directorio.
router.get('/history', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] GET', req.originalUrl, '— method:', req.method, 'path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] params:', req.params, 'query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] req.admin:', req.admin);

  const { clientPhone, excludeConversationId } = req.query;
  if (!clientPhone) {
    const responseBody400 = { error: 'Falta clientPhone.' };
    console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] GET /history - respondiendo status 400:', responseBody400);
    return res.status(400).json(responseBody400);
  }

  const sucursalId = req.admin.role === 'admin' ? null : req.admin.sucursalId;
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] GET /history - sucursalId calculado:', sucursalId, '— role:', req.admin.role);

  try {
    const conversations = await obtenerHistorialClienteParaChat({ clientPhone, excludeConversationId, sucursalId });
    console.log('✅ [DEBUG-ROUTES-CLIENTDIRECTORY] GET /history - cantidad de conversaciones:', conversations.length);
    console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] GET /history - respondiendo status 200, cantidad:', conversations.length);
    res.status(200).json({ conversations });
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-CLIENTDIRECTORY] GET /history - error:', error);
    console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] GET /history - respondiendo status 500');
    res.status(500).json({ error: error.message || 'No se pudo obtener el historial del cliente.' });
  }
});

// Datos de UNA consulta (inicio, demora, duración, mensajes, calificaciones,
// venta) para el panel lateral de un chat abierto desde el Directorio. El
// staff sólo ve las consultas que también vería en el historial de ese
// cliente (misma regla que GET /history).
router.get('/consulta-detalle', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] GET', req.originalUrl, '— req.admin:', req.admin);
  const { id } = req.query;
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) {
    return res.status(400).json({ error: 'Falta el id de la consulta.' });
  }

  try {
    if (req.admin.role !== 'admin') {
      const { data: conv, error } = await supabase.from('conversations').select('client_phone').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!conv) return res.status(404).json({ error: 'No se encontró la consulta.' });
      const permitidas = await obtenerHistorialClienteParaChat({ clientPhone: conv.client_phone, sucursalId: req.admin.sucursalId });
      if (!permitidas.some(c => c.id === id)) {
        console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] GET /consulta-detalle - 403, consulta de otra sucursal');
        return res.status(403).json({ error: 'No tenés acceso a esta consulta.' });
      }
    }

    const filas = await obtenerDetalleConsultas({ conversationId: id });
    if (!filas.length) return res.status(404).json({ error: 'No se encontró la consulta.' });
    console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] GET /consulta-detalle - respondiendo status 200');
    res.status(200).json({ consulta: filas[0] });
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-CLIENTDIRECTORY] GET /consulta-detalle - error:', error);
    res.status(500).json({ error: error.message || 'No se pudieron obtener los datos de la consulta.' });
  }
});

router.post('/messages-search', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] POST', req.originalUrl, '— method:', req.method, 'path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] params:', req.params, 'query:', req.query, 'body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] req.admin:', req.admin);

  const sucursalId = req.admin.role === 'admin' ? null : req.admin.sucursalId;
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] sucursalId calculado:', sucursalId);
  const { conversationIds, q } = req.body || {};
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] conversationIds:', conversationIds, 'q:', q);
  try {
    console.log('📡 [DEBUG-ROUTES-CLIENTDIRECTORY] llamando servicio buscarEnMensajesDirectorio — filtros:', { conversationIds, q, sucursalId });
    const result = await buscarEnMensajesDirectorio({ conversationIds, q, sucursalId });
    console.log('📡 [DEBUG-ROUTES-CLIENTDIRECTORY] resultado buscarEnMensajesDirectorio — result:', result);
    console.log('✅ [DEBUG-ROUTES-CLIENTDIRECTORY] éxito — búsqueda completada');
    console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] respondiendo status: 200 body:', result);
    res.status(200).json(result);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-CLIENTDIRECTORY] error completo:', error);
    console.error('❌ [DEBUG-ROUTES-CLIENTDIRECTORY] error.message:', error?.message);
    console.error('❌ [DEBUG-ROUTES-CLIENTDIRECTORY] error.stack:', error?.stack);
    console.error('[CLIENT DIRECTORY] ❌ Error buscando en mensajes:', error.message);
    console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] respondiendo status: 500 body:', { error: 'No se pudo realizar la búsqueda.' });
    res.status(500).json({ error: 'No se pudo realizar la búsqueda.' });
  }
});

export default router;
