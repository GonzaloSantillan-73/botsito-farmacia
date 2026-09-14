import express from 'express';
import { requireAuth } from './adminAuth.js';
import {
  listarRespuestasRapidas,
  crearRespuestaRapida,
  actualizarRespuestaRapida,
  eliminarRespuestaRapida
} from '../services/quickReplies.js';

const router = express.Router();

// Tanto el admin (plantillas globales) como el staff (globales + las suyas)
// usan estas rutas; el ámbito de lectura/escritura de cada uno lo decide el
// servicio a partir de req.admin.role/sucursalId, nunca de lo que mande el
// cliente en el body/query.
router.use(requireAuth);

router.get('/', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-QUICKREPLIES] GET / - req.admin:', req.admin);
  const sucursalId = req.admin.role === 'admin' ? null : req.admin.sucursalId;
  try {
    const replies = await listarRespuestasRapidas({ sucursalId });
    res.status(200).json({ replies });
  } catch (error) {
    console.error('[QUICK REPLIES] ❌ Error listando respuestas rápidas:', error.message);
    res.status(400).json({ error: error.message || 'No se pudieron cargar las respuestas rápidas.' });
  }
});

router.post('/', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-QUICKREPLIES] POST / - req.body:', req.body, '| req.admin:', req.admin);
  const sucursalId = req.admin.role === 'admin' ? null : req.admin.sucursalId;
  try {
    const reply = await crearRespuestaRapida({ shortcut: req.body?.shortcut, messageText: req.body?.messageText, sucursalId });
    res.status(201).json({ reply });
  } catch (error) {
    console.error('[QUICK REPLIES] ❌ Error creando respuesta rápida:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo crear la respuesta rápida.' });
  }
});

router.put('/:id', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-QUICKREPLIES] PUT /:id - params:', req.params, 'body:', req.body, '| req.admin:', req.admin);
  try {
    const reply = await actualizarRespuestaRapida(
      req.params.id,
      { shortcut: req.body?.shortcut, messageText: req.body?.messageText },
      { role: req.admin.role, sucursalId: req.admin.sucursalId }
    );
    res.status(200).json({ reply });
  } catch (error) {
    console.error('[QUICK REPLIES] ❌ Error actualizando respuesta rápida:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo actualizar la respuesta rápida.' });
  }
});

router.delete('/:id', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-QUICKREPLIES] DELETE /:id - params:', req.params, '| req.admin:', req.admin);
  try {
    await eliminarRespuestaRapida(req.params.id, { role: req.admin.role, sucursalId: req.admin.sucursalId });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[QUICK REPLIES] ❌ Error eliminando respuesta rápida:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo eliminar la respuesta rápida.' });
  }
});

export default router;
