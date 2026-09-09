import express from 'express';
import { requireAuth, requireAdminRole } from './adminAuth.js';
import { listarEmpleados, crearEmpleadoParaSucursal, actualizarEmpleado, eliminarEmpleado } from '../services/staffAuth.js';
import { listarSucursalesConEstado, configurarSucursal } from '../services/sucursalesAdmin.js';

const router = express.Router();

// Todas las rutas de empleados/sucursales requieren estar logueado como
// administrador (un empleado no puede gestionar otros empleados ni sucursales).
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

// Sucursales reales de Plex + su configuración interna (dirección, maps,
// coordenadas, horario, empleados) para el panel de administración.
router.get('/sucursales-plex', async (req, res) => {
  try {
    const sucursales = await listarSucursalesConEstado();
    res.status(200).json({ sucursales });
  } catch (error) {
    console.error('[STAFF] Error listando sucursales de Plex:', error.message);
    res.status(500).json({ error: 'No se pudo obtener el listado de sucursales.' });
  }
});

router.put('/sucursales-plex/:plexIdSucursal', async (req, res) => {
  const { direccion, googleMapsUrl, latitud, longitud } = req.body;

  try {
    const sucursal = await configurarSucursal({ plexIdSucursal: req.params.plexIdSucursal, direccion, googleMapsUrl, latitud, longitud });
    console.log(`[STAFF] Sucursal configurada: ${sucursal.nombre} (plex_id_sucursal ${req.params.plexIdSucursal})`);
    res.status(200).json({ success: true, sucursal });
  } catch (error) {
    console.error('[STAFF] Error configurando sucursal:', error.message);
    res.status(400).json({ error: error.message || 'No se pudo guardar la configuración de la sucursal.' });
  }
});

export default router;
