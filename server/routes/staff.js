import express from 'express';
import { requireAuth, requireAdminRole } from './adminAuth.js';
import { listarEmpleados, crearEmpleado, actualizarEmpleado, eliminarEmpleado } from '../services/staffAuth.js';

const router = express.Router();

// Todas las rutas de empleados requieren estar logueado como administrador
// (un empleado no puede gestionar otros empleados).
router.use(requireAuth, requireAdminRole);

router.get('/', async (req, res) => {
  try {
    const empleados = await listarEmpleados();
    res.status(200).json({ empleados });
  } catch (error) {
    console.error('[STAFF] Error listando empleados:', error.message);
    res.status(500).json({ error: 'No se pudo obtener el listado de empleados.' });
  }
});

router.post('/', async (req, res) => {
  const { username, password, sucursalId } = req.body;

  try {
    const empleado = await crearEmpleado({ username, password, sucursalId });
    console.log(`[STAFF] Empleado creado: ${empleado.username} (sucursal ${sucursalId})`);
    res.status(201).json({ success: true, empleado });
  } catch (error) {
    console.error('[STAFF] Error creando empleado:', error.message);
    const mensaje = error.code === '23505' ? 'Ese nombre de usuario ya está en uso.' : (error.message || 'No se pudo crear el empleado.');
    res.status(400).json({ error: mensaje });
  }
});

router.put('/:id', async (req, res) => {
  const { username, password, sucursalId } = req.body;

  try {
    const empleado = await actualizarEmpleado(req.params.id, { username, password, sucursalId });
    console.log(`[STAFF] Empleado actualizado: ${empleado.id}`);
    res.status(200).json({ success: true, empleado });
  } catch (error) {
    console.error('[STAFF] Error actualizando empleado:', error.message);
    const mensaje = error.code === '23505' ? 'Ese nombre de usuario ya está en uso.' : (error.message || 'No se pudo actualizar el empleado.');
    res.status(400).json({ error: mensaje });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await eliminarEmpleado(req.params.id);
    console.log(`[STAFF] Empleado eliminado: ${req.params.id}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[STAFF] Error eliminando empleado:', error.message);
    res.status(500).json({ error: 'No se pudo eliminar el empleado.' });
  }
});

export default router;
