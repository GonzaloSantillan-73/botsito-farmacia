import express from 'express';
import { requireAuth } from './adminAuth.js';
import {
  listarRespuestasRapidas,
  crearRespuestaRapida,
  actualizarRespuestaRapida,
  eliminarRespuestaRapida
} from '../services/quickReplies.js';

const router = express.Router();

// Todas las cuentas autenticadas (admin o staff) pueden leer y usar las
// respuestas rápidas en el chat; sólo el admin puede crearlas, editarlas o
// borrarlas (ver soloAdmin más abajo).
router.use(requireAuth);

const soloAdmin = (req, res, next) => {
  if (req.admin.role !== 'admin') {
    console.log('🔒 [DEBUG-ROUTES-QUICKREPLIES] soloAdmin() — bloqueado, role:', req.admin.role);
    return res.status(403).json({ error: 'Solo el administrador puede gestionar respuestas rápidas.' });
  }
  next();
};

router.get('/', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-QUICKREPLIES] GET / - req.admin:', req.admin);
  try {
    const replies = await listarRespuestasRapidas();
    res.status(200).json({ replies });
  } catch (error) {
    console.error('[QUICK REPLIES] ❌ Error listando respuestas rápidas:', error.message);
    res.status(400).json({ error: error.message || 'No se pudieron cargar las respuestas rápidas.' });
  }
});

router.post('/', soloAdmin, async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-QUICKREPLIES] POST / - req.body:', req.body, '| req.admin:', req.admin);
  try {
    const reply = await crearRespuestaRapida({ shortcut: req.body?.shortcut, messageText: req.body?.messageText });
    res.status(201).json({ reply });
  } catch (error) {
    console.error('[QUICK REPLIES] ❌ Error creando respuesta rápida:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo crear la respuesta rápida.' });
  }
});

router.put('/:id', soloAdmin, async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-QUICKREPLIES] PUT /:id - params:', req.params, 'body:', req.body, '| req.admin:', req.admin);
  try {
    const reply = await actualizarRespuestaRapida(req.params.id, { shortcut: req.body?.shortcut, messageText: req.body?.messageText });
    res.status(200).json({ reply });
  } catch (error) {
    console.error('[QUICK REPLIES] ❌ Error actualizando respuesta rápida:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo actualizar la respuesta rápida.' });
  }
});

router.delete('/:id', soloAdmin, async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-QUICKREPLIES] DELETE /:id - params:', req.params, '| req.admin:', req.admin);
  try {
    await eliminarRespuestaRapida(req.params.id);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[QUICK REPLIES] ❌ Error eliminando respuesta rápida:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo eliminar la respuesta rápida.' });
  }
});

export default router;
