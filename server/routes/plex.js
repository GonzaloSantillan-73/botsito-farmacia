import express from 'express';
import { requireAuth, requireAdminRole } from './adminAuth.js';
import { sincronizarSucursalesPlex, sincronizarProductosPlex, sincronizarStockPlex, sincronizarStockTodasLasSucursales } from '../services/plexSync.js';
import { getSucursalStockPorDefecto, setSucursalStockPorDefecto } from '../services/appConfig.js';

const router = express.Router();

// Cualquier empleado logueado necesita saber cuál es la sucursal de
// referencia para mostrar stock en el Cotizador (no es una acción sensible,
// solo lectura de una configuración). Va antes del requireAdminRole general.
router.get('/settings/sucursal-stock', requireAuth, async (req, res) => {
  const idSucursal = await getSucursalStockPorDefecto();
  res.status(200).json({ idSucursal });
});

// Disparar una sincronización contra un sistema externo real, o cambiar la
// sucursal de referencia, sí son acciones sensibles: solo el administrador.
// Nota: esto protege NUESTRAS rutas internas; la restricción de "solo GET"
// de la consigna aplica a las llamadas hacia Plex en sí mismas (ver
// server/services/plexClient.js), no a estas rutas propias.
router.use(requireAuth, requireAdminRole);

router.put('/settings/sucursal-stock', async (req, res) => {
  try {
    await setSucursalStockPorDefecto(req.body.idSucursal);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo guardar la sucursal de referencia.' });
  }
});

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

router.post('/sync/stock/todas', async (req, res) => {
  try {
    const resultado = await sincronizarStockTodasLasSucursales();
    res.status(200).json({ success: true, ...resultado });
  } catch (error) {
    console.error('[PLEX] Error sincronizando stock de todas las sucursales:', error.message);
    res.status(502).json({ error: 'No se pudo sincronizar el stock de todas las sucursales con Plex Concentrador.' });
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
