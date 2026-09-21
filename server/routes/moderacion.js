import express from 'express';
import { requireAuth, requireAdminRole } from './adminAuth.js';
import { verificarPasswordPropia } from '../services/adminAuth.js';
import { bloquearCliente, purgarArchivoMensaje } from '../services/moderacion.js';

const router = express.Router();

// Moderación de chats reportados: exclusiva del admin (bloquear clientes y
// purgar archivos obscenos son acciones de supervisión, no de atención). El
// resto de las lecturas (listado de bloqueados, estado de un cliente
// puntual) se hacen directo contra Supabase desde el frontend, igual que el
// resto del Directorio de Clientes — acá sólo viven las dos acciones que
// necesitan re-validar la contraseña del admin del lado del servidor.
router.use(requireAuth, requireAdminRole);

router.post('/bloquear', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-MODERACION] POST /bloquear - req.body:', { ...req.body, password: '[REDACTED]' }, '| req.admin:', req.admin);

  const { clientPhone, conversationId, motivo, password } = req.body || {};
  if (!clientPhone || !motivo?.trim() || !password) {
    const responseBody400 = { error: 'Faltan datos: el motivo y tu contraseña son obligatorios.' };
    console.log('🔚 [DEBUG-ROUTES-MODERACION] POST /bloquear - respondiendo status 400:', responseBody400);
    return res.status(400).json(responseBody400);
  }

  try {
    const passwordOk = await verificarPasswordPropia(req.admin.sub, req.admin.role, password);
    console.log('🔍 [DEBUG-ROUTES-MODERACION] POST /bloquear - passwordOk:', passwordOk);
    if (!passwordOk) {
      const responseBody401 = { error: 'Contraseña incorrecta.' };
      console.log('🔚 [DEBUG-ROUTES-MODERACION] POST /bloquear - respondiendo status 401:', responseBody401);
      return res.status(401).json(responseBody401);
    }

    const bloqueo = await bloquearCliente({
      clientPhone,
      motivo: motivo.trim(),
      reportedConversationId: conversationId || null,
      blockedByUsername: req.admin.username
    });
    console.log(`[MODERACION] Cliente ${clientPhone} bloqueado por ${req.admin.username}.`);
    const responseBody200 = { success: true, bloqueo };
    console.log('🔚 [DEBUG-ROUTES-MODERACION] POST /bloquear - respondiendo status 200:', responseBody200);
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-MODERACION] POST /bloquear - error:', error.message, error.stack);
    const responseBody400 = { error: error.message || 'No se pudo bloquear al cliente.' };
    console.log('🔚 [DEBUG-ROUTES-MODERACION] POST /bloquear - respondiendo status 400:', responseBody400);
    res.status(400).json(responseBody400);
  }
});

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
