import express from 'express';
import { requireAuth } from './adminAuth.js';
import { buscarProductos } from '../services/productos.js';

const router = express.Router();

// Cualquier empleado logueado (no solo el admin) necesita buscar productos
// reales para el Cotizador; esto es solo lectura, no una acción sensible.
router.use(requireAuth);

router.get('/buscar', async (req, res) => {
  const texto = (req.query.q || '').toString();
  try {
    const { data, error } = await buscarProductos(texto);
    if (error) throw error;
    res.status(200).json({ productos: data });
  } catch (error) {
    console.error('[PRODUCTOS] Error buscando productos:', error.message);
    res.status(500).json({ error: 'No se pudo buscar en el catálogo.' });
  }
});

export default router;
