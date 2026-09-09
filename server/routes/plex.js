import express from 'express';
import { requireAuth, requireAdminRole } from './adminAuth.js';
import { sincronizarSucursalesPlex, sincronizarProductosPlex, sincronizarStockPlex } from '../services/plexSync.js';

const router = express.Router();

// Disparar una sincronización contra un sistema externo real es una acción
// sensible (consume la API de la farmacia): solo el administrador puede
// hacerlo. Nota: esto protege NUESTRAS rutas internas; la restricción de
// "solo GET" de la consigna aplica a las llamadas hacia Plex en sí mismas
// (ver server/services/plexClient.js), no a estas rutas propias.
router.use(requireAuth, requireAdminRole);

router.post('/sync/sucursales', async (req, res) => {
  try {
    const resultado = await sincronizarSucursalesPlex();
    res.status(200).json({ success: true, ...resultado });
  } catch (error) {
    console.error('[PLEX] Error sincronizando sucursales:', error.message);
    res.status(502).json({ error: 'No se pudo sincronizar las sucursales con Plex Concentrador.' });
  }
});

router.post('/sync/productos', async (req, res) => {
  try {
    const resultado = await sincronizarProductosPlex();
    res.status(200).json({ success: true, ...resultado });
  } catch (error) {
    console.error('[PLEX] Error sincronizando productos:', error.message);
    res.status(502).json({ error: 'No se pudo sincronizar el catálogo con Plex Concentrador.' });
  }
});

router.post('/sync/stock/:idSucursal', async (req, res) => {
  try {
    const resultado = await sincronizarStockPlex(req.params.idSucursal);
    res.status(200).json({ success: true, ...resultado });
  } catch (error) {
    console.error('[PLEX] Error sincronizando stock:', error.message);
    res.status(502).json({ error: 'No se pudo sincronizar el stock con Plex Concentrador.' });
  }
});

export default router;
