import express from 'express';
import { requireAuth } from './adminAuth.js';
import { actualizarDatosCliente } from '../services/clientesAdmin.js';

const router = express.Router();

// Cualquier usuario logueado del CRM (admin o un empleado de sucursal) puede
// corregir la ficha del cliente: ambos gestionan conversaciones y necesitan
// poder arreglar datos mal cargados por el bot (nombre, DNI, obra social).
router.use(requireAuth);

router.put('/:clientPhone', async (req, res) => {
  const { clientPhone } = req.params;
  const { nombreCompleto, dni, obraSocial, nuevoTelefono } = req.body;

  // El teléfono es la clave que vincula todo el historial del cliente (y lo
  // que el bot usa para reconocerlo por WhatsApp): cambiarlo es sensible,
  // así que queda reservado al administrador y no a cualquier operador.
  if (nuevoTelefono && req.admin?.role !== 'admin') {
    return res.status(403).json({ error: 'Sólo el administrador puede modificar el teléfono del cliente.' });
  }

  try {
    const cliente = await actualizarDatosCliente(clientPhone, { nombreCompleto, dni, obraSocial, nuevoTelefono });
    console.log(`[CLIENTES] -> Ficha actualizada por "${req.admin.username}" (${req.admin.role}): ${clientPhone} -> ${cliente.client_phone}`);
    res.status(200).json({ success: true, cliente });
  } catch (error) {
    console.error('[CLIENTES] ❌ Error actualizando datos del cliente:', error.message);
    res.status(400).json({ error: error.message || 'No se pudieron guardar los datos del cliente.' });
  }
});

export default router;
