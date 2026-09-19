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
  console.log('🔍 [DEBUG-ROUTES-CLIENTDIRECTORY] sucursalId calculado:', sucursalId);
  try {
    console.log('📡 [DEBUG-ROUTES-CLIENTDIRECTORY] llamando servicios obtenerConversacionesDirectorio + obtenerListaClientesDirectorio — filtros:', { sucursalId });
    // Dos consultas separadas a propósito: "Historial de Consultas" necesita
    // el client_phone tal cual quedó en cada conversación (snapshot de esa
    // sesión); "Lista de Clientes" necesita el client_phone vigente en la
    // ficha de `clientes` (identidad actual) — no deben mezclarse ni
    // pisarse entre sí (ver comentarios en clientDirectory.js).
    const [conversations, clients] = await Promise.all([
      obtenerConversacionesDirectorio({ sucursalId }),
      obtenerListaClientesDirectorio({ sucursalId })
    ]);
    console.log('📡 [DEBUG-ROUTES-CLIENTDIRECTORY] resultado obtenerConversacionesDirectorio — conversations:', conversations);
    console.log('📡 [DEBUG-ROUTES-CLIENTDIRECTORY] resultado obtenerListaClientesDirectorio — clients:', clients);
    console.log('✅ [DEBUG-ROUTES-CLIENTDIRECTORY] éxito — conversations count:', Array.isArray(conversations) ? conversations.length : 'N/A', ', clients count:', Array.isArray(clients) ? clients.length : 'N/A');
    console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] respondiendo status: 200 body:', { conversations, clients });
    res.status(200).json({ conversations, clients });
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-CLIENTDIRECTORY] error completo:', error);
    console.error('❌ [DEBUG-ROUTES-CLIENTDIRECTORY] error.message:', error?.message);
    console.error('❌ [DEBUG-ROUTES-CLIENTDIRECTORY] error.stack:', error?.stack);
    console.error('[CLIENT DIRECTORY] ❌ Error obteniendo conversaciones:', error.message);
    console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] respondiendo status: 500 body:', { error: 'No se pudo cargar el directorio de clientes.' });
    res.status(500).json({ error: 'No se pudo cargar el directorio de clientes.' });
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
