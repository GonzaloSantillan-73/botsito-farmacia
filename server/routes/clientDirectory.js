import express from 'express';
import { requireAuth } from './adminAuth.js';
import { obtenerConversacionesDirectorio, obtenerListaClientesDirectorio, buscarEnMensajesDirectorio } from '../services/clientDirectory.js';

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
    obtenerConversacionesDirectorio({ sucursalId }),
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
  // Mensaje tal cual lo devuelve Postgres/PostgREST (ej. "relation
  // \"clientes_telefonos_historicos\" does not exist"): a propósito, para que
  // una migración pendiente se note de una en el frontend en vez de
  // disfrazarse de "no hay datos".
  const errors = {
    conversations: conversationsResult.status === 'rejected' ? (conversationsResult.reason?.message || 'Error desconocido.') : null,
    clients: clientsResult.status === 'rejected' ? (clientsResult.reason?.message || 'Error desconocido.') : null
  };

  console.log('✅ [DEBUG-ROUTES-CLIENTDIRECTORY] conversations count:', conversations.length, ', clients count:', clients.length, ', errors:', errors);
  console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] respondiendo status: 200 body:', { conversations, clients, errors });
  res.status(200).json({ conversations, clients, errors });
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
