import express from 'express';
import { requireAuth } from './adminAuth.js';
import { obtenerConversacionesDirectorio, buscarEnMensajesDirectorio } from '../services/clientDirectory.js';

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
    console.log('📡 [DEBUG-ROUTES-CLIENTDIRECTORY] llamando servicio obtenerConversacionesDirectorio — filtros:', { sucursalId });
    const conversations = await obtenerConversacionesDirectorio({ sucursalId });
    console.log('📡 [DEBUG-ROUTES-CLIENTDIRECTORY] resultado obtenerConversacionesDirectorio — conversations:', conversations);
    console.log('✅ [DEBUG-ROUTES-CLIENTDIRECTORY] éxito — conversations count:', Array.isArray(conversations) ? conversations.length : 'N/A');
    console.log('🔚 [DEBUG-ROUTES-CLIENTDIRECTORY] respondiendo status: 200 body:', { conversations });
    res.status(200).json({ conversations });
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
