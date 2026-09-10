import express from 'express';
import { requireAuth, requireAdminRole } from './adminAuth.js';
import { crearEmpleadoParaSucursal, actualizarEmpleado, eliminarEmpleado } from '../services/staffAuth.js';
import { listarSucursales, crearSucursal, actualizarSucursal, eliminarSucursal } from '../services/sucursalesAdmin.js';

const router = express.Router();

// Todas las rutas de empleados/sucursales requieren estar logueado como
// administrador (un empleado no puede gestionar otros empleados ni sucursales).
router.use(requireAuth, requireAdminRole);

router.post('/', async (req, res) => {
  const { sucursalId, username, password } = req.body;

  try {
    const empleado = await crearEmpleadoParaSucursal({ sucursalId, username, password });
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

// Sucursales propias (dirección, maps, whatsapp, horario, empleados) para el
// panel de administración. Ya no dependen de ningún catálogo externo.
router.get('/sucursales', async (req, res) => {
  try {
    const sucursales = await listarSucursales();
    res.status(200).json({ sucursales });
  } catch (error) {
    console.error('[STAFF] Error listando sucursales:', error.message);
    res.status(500).json({ error: 'No se pudo obtener el listado de sucursales.' });
  }
});

router.post('/sucursales', async (req, res) => {
  const { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre } = req.body;

  try {
    const sucursal = await crearSucursal({ nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre });
    console.log(`[STAFF] Sucursal creada: ${sucursal.nombre}`);
    res.status(201).json({ success: true, sucursal });
  } catch (error) {
    console.error('[STAFF] Error creando sucursal:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo crear la sucursal.' });
  }
});

router.put('/sucursales/:id', async (req, res) => {
  const { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre } = req.body;

  try {
    const sucursal = await actualizarSucursal(req.params.id, { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre });
    console.log(`[STAFF] Sucursal actualizada: ${sucursal.nombre}`);
    res.status(200).json({ success: true, sucursal });
  } catch (error) {
    console.error('[STAFF] Error actualizando sucursal:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo guardar la sucursal.' });
  }
});

router.delete('/sucursales/:id', async (req, res) => {
  try {
    await eliminarSucursal(req.params.id);
    console.log(`[STAFF] Sucursal eliminada: ${req.params.id}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[STAFF] Error eliminando sucursal:', error.message);
    res.status(500).json({ error: 'No se pudo eliminar la sucursal.' });
  }
});

export default router;
