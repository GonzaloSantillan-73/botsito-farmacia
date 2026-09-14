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
  const sucursalId = req.admin.role === 'admin' ? null : req.admin.sucursalId;
  try {
    const conversations = await obtenerConversacionesDirectorio({ sucursalId });
    res.status(200).json({ conversations });
  } catch (error) {
    console.error('[CLIENT DIRECTORY] ❌ Error obteniendo conversaciones:', error.message);
    res.status(500).json({ error: 'No se pudo cargar el directorio de clientes.' });
  }
});

router.post('/messages-search', async (req, res) => {
  const sucursalId = req.admin.role === 'admin' ? null : req.admin.sucursalId;
  const { conversationIds, q } = req.body || {};
  try {
    const result = await buscarEnMensajesDirectorio({ conversationIds, q, sucursalId });
    res.status(200).json(result);
  } catch (error) {
    console.error('[CLIENT DIRECTORY] ❌ Error buscando en mensajes:', error.message);
    res.status(500).json({ error: 'No se pudo realizar la búsqueda.' });
  }
});

export default router;
