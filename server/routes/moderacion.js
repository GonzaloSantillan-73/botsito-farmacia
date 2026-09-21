import express from 'express';
import { requireAuth, requireAdminRole } from './adminAuth.js';
import { verificarPasswordPropia } from '../services/adminAuth.js';
import { purgarArchivoMensaje } from '../services/moderacion.js';

const router = express.Router();

// Moderación de archivos adjuntos: exclusiva del admin. El ícono ya se
// oculta en MessageBubble.jsx para quien no sea admin, pero acá se re-valida
// la contraseña de la propia cuenta del lado del servidor antes de tocar
// nada, sin depender de que el frontend lo respete.
router.use(requireAuth, requireAdminRole);

router.post('/purgar-archivo', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-MODERACION] POST /purgar-archivo - req.body:', { ...req.body, password: '[REDACTED]' }, '| req.admin:', req.admin);

  const { messageId, motivo, password } = req.body || {};
  if (!messageId || !motivo?.trim() || !password) {
    const responseBody400 = { error: 'Faltan datos: el motivo y tu contraseña son obligatorios.' };
    console.log('🔚 [DEBUG-ROUTES-MODERACION] POST /purgar-archivo - respondiendo status 400:', responseBody400);
    return res.status(400).json(responseBody400);
  }

  try {
    const passwordOk = await verificarPasswordPropia(req.admin.sub, req.admin.role, password);
    console.log('🔍 [DEBUG-ROUTES-MODERACION] POST /purgar-archivo - passwordOk:', passwordOk);
    if (!passwordOk) {
      const responseBody401 = { error: 'Contraseña incorrecta.' };
      console.log('🔚 [DEBUG-ROUTES-MODERACION] POST /purgar-archivo - respondiendo status 401:', responseBody401);
      return res.status(401).json(responseBody401);
    }

    const mensaje = await purgarArchivoMensaje({ messageId, motivo: motivo.trim() });
    console.log(`[MODERACION] Archivo del mensaje ${messageId} purgado por ${req.admin.username}.`);
    const responseBody200 = { success: true, mensaje };
    console.log('🔚 [DEBUG-ROUTES-MODERACION] POST /purgar-archivo - respondiendo status 200:', responseBody200);
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-MODERACION] POST /purgar-archivo - error:', error.message, error.stack);
    const responseBody400 = { error: error.message || 'No se pudo eliminar el archivo.' };
    console.log('🔚 [DEBUG-ROUTES-MODERACION] POST /purgar-archivo - respondiendo status 400:', responseBody400);
    res.status(400).json(responseBody400);
  }
});

export default router;
