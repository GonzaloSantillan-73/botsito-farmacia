import express from 'express';
import { requireAuth, requireAdminRole } from './adminAuth.js';
import { crearEmpleadoParaSucursal, actualizarEmpleado, eliminarEmpleado } from '../services/staffAuth.js';
import { listarSucursales, crearSucursal, actualizarSucursal, eliminarSucursal, actualizarEstadoSucursal } from '../services/sucursalesAdmin.js';

const router = express.Router();

// Todas las rutas de empleados/sucursales requieren estar logueado como
// administrador (un empleado no puede gestionar otros empleados ni sucursales).
router.use(requireAuth, requireAdminRole);

router.post('/', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-STAFF] POST / - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  const bodyParaLog = { ...req.body };
  if (bodyParaLog.password) bodyParaLog.password = '[REDACTED]';
  if (bodyParaLog.currentPassword) bodyParaLog.currentPassword = '[REDACTED]';
  if (bodyParaLog.newPassword) bodyParaLog.newPassword = '[REDACTED]';
  console.log('🔍 [DEBUG-ROUTES-STAFF] POST / - req.body:', bodyParaLog);
  console.log('🔍 [DEBUG-ROUTES-STAFF] POST / - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-STAFF] POST / - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-STAFF] POST / - req.admin (role, sucursalId, username, sub):', req.admin);

  const { sucursalId, username, password } = req.body;

  try {
    console.log('🔍 [DEBUG-ROUTES-STAFF] POST / - llamando a crearEmpleadoParaSucursal (servicio, no es supabase.from directo) con sucursalId:', sucursalId, '| username:', username, '| password:', password ? '[REDACTED]' : password);
    const empleado = await crearEmpleadoParaSucursal({ sucursalId, username, password });
    console.log('✅ [DEBUG-ROUTES-STAFF] POST / - resultado crearEmpleadoParaSucursal:', empleado);
    console.log(`[STAFF] Empleado creado: ${empleado.username} (sucursal ${sucursalId})`);
    const responseBody201 = { success: true, empleado };
    console.log('🔚 [DEBUG-ROUTES-STAFF] POST / - respondiendo status 201:', responseBody201);
    res.status(201).json(responseBody201);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-STAFF] POST / - error capturado en catch:', error);
    console.error('❌ [DEBUG-ROUTES-STAFF] POST / - error.message:', error.message);
    console.error('❌ [DEBUG-ROUTES-STAFF] POST / - error.stack:', error.stack);
    console.error('[STAFF] Error creando empleado:', error.message);
    const mensaje = error.code === '23505' ? 'Ese nombre de usuario ya está en uso.' : (error.message || 'No se pudo crear el empleado.');
    const responseBody400 = { error: mensaje };
    console.log('🔚 [DEBUG-ROUTES-STAFF] POST / - respondiendo status 400:', responseBody400);
    res.status(400).json(responseBody400);
  }
});

router.put('/:id', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /:id - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  const bodyParaLog = { ...req.body };
  if (bodyParaLog.password) bodyParaLog.password = '[REDACTED]';
  if (bodyParaLog.currentPassword) bodyParaLog.currentPassword = '[REDACTED]';
  if (bodyParaLog.newPassword) bodyParaLog.newPassword = '[REDACTED]';
  console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /:id - req.body:', bodyParaLog);
  console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /:id - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /:id - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /:id - req.admin (role, sucursalId, username, sub):', req.admin);

  const { username, password, sucursalId } = req.body;

  try {
    console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /:id - llamando a actualizarEmpleado (servicio, no es supabase.from directo) con id:', req.params.id, '| username:', username, '| sucursalId:', sucursalId, '| password:', password ? '[REDACTED]' : password);
    const empleado = await actualizarEmpleado(req.params.id, { username, password, sucursalId });
    console.log('✅ [DEBUG-ROUTES-STAFF] PUT /:id - resultado actualizarEmpleado:', empleado);
    console.log(`[STAFF] Empleado actualizado: ${empleado.id}`);
    const responseBody200 = { success: true, empleado };
    console.log('🔚 [DEBUG-ROUTES-STAFF] PUT /:id - respondiendo status 200:', responseBody200);
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-STAFF] PUT /:id - error capturado en catch:', error);
    console.error('❌ [DEBUG-ROUTES-STAFF] PUT /:id - error.message:', error.message);
    console.error('❌ [DEBUG-ROUTES-STAFF] PUT /:id - error.stack:', error.stack);
    console.error('[STAFF] Error actualizando empleado:', error.message);
    const mensaje = error.code === '23505' ? 'Ese nombre de usuario ya está en uso.' : (error.message || 'No se pudo actualizar el empleado.');
    const responseBody400 = { error: mensaje };
    console.log('🔚 [DEBUG-ROUTES-STAFF] PUT /:id - respondiendo status 400:', responseBody400);
    res.status(400).json(responseBody400);
  }
});

router.delete('/:id', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /:id - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /:id - req.body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /:id - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /:id - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /:id - req.admin (role, sucursalId, username, sub):', req.admin);

  try {
    console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /:id - llamando a eliminarEmpleado (servicio, no es supabase.from directo) con id:', req.params.id);
    await eliminarEmpleado(req.params.id);
    console.log('✅ [DEBUG-ROUTES-STAFF] DELETE /:id - eliminarEmpleado ejecutado sin error para id:', req.params.id);
    console.log(`[STAFF] Empleado eliminado: ${req.params.id}`);
    const responseBody200 = { success: true };
    console.log('🔚 [DEBUG-ROUTES-STAFF] DELETE /:id - respondiendo status 200:', responseBody200);
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-STAFF] DELETE /:id - error capturado en catch:', error);
    console.error('❌ [DEBUG-ROUTES-STAFF] DELETE /:id - error.message:', error.message);
    console.error('❌ [DEBUG-ROUTES-STAFF] DELETE /:id - error.stack:', error.stack);
    console.error('[STAFF] Error eliminando empleado:', error.message);
    const responseBody500 = { error: error.message || 'No se pudo eliminar el empleado.' };
    console.log('🔚 [DEBUG-ROUTES-STAFF] DELETE /:id - respondiendo status 500:', responseBody500);
    res.status(500).json(responseBody500);
  }
});

// Sucursales propias (dirección, maps, whatsapp, horario, empleados) para el
// panel de administración. Ya no dependen de ningún catálogo externo.
router.get('/sucursales', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-STAFF] GET /sucursales - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-STAFF] GET /sucursales - req.body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-STAFF] GET /sucursales - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-STAFF] GET /sucursales - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-STAFF] GET /sucursales - req.admin (role, sucursalId, username, sub):', req.admin);

  try {
    console.log('🔍 [DEBUG-ROUTES-STAFF] GET /sucursales - llamando a listarSucursales (servicio, no es supabase.from directo)');
    const sucursales = await listarSucursales();
    console.log('✅ [DEBUG-ROUTES-STAFF] GET /sucursales - resultado listarSucursales:', sucursales);
    const responseBody200 = { sucursales };
    console.log('🔚 [DEBUG-ROUTES-STAFF] GET /sucursales - respondiendo status 200:', responseBody200);
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-STAFF] GET /sucursales - error capturado en catch:', error);
    console.error('❌ [DEBUG-ROUTES-STAFF] GET /sucursales - error.message:', error.message);
    console.error('❌ [DEBUG-ROUTES-STAFF] GET /sucursales - error.stack:', error.stack);
    console.error('[STAFF] Error listando sucursales:', error.message);
    const responseBody500 = { error: 'No se pudo obtener el listado de sucursales.' };
    console.log('🔚 [DEBUG-ROUTES-STAFF] GET /sucursales - respondiendo status 500:', responseBody500);
    res.status(500).json(responseBody500);
  }
});

router.post('/sucursales', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-STAFF] POST /sucursales - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-STAFF] POST /sucursales - req.body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-STAFF] POST /sucursales - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-STAFF] POST /sucursales - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-STAFF] POST /sucursales - req.admin (role, sucursalId, username, sub):', req.admin);

  const { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre, abierta24hs } = req.body;

  try {
    console.log('🔍 [DEBUG-ROUTES-STAFF] POST /sucursales - llamando a crearSucursal (servicio, no es supabase.from directo) con:', { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre, abierta24hs });
    const sucursal = await crearSucursal({ nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre, abierta24hs });
    console.log('✅ [DEBUG-ROUTES-STAFF] POST /sucursales - resultado crearSucursal:', sucursal);
    console.log(`[STAFF] Sucursal creada: ${sucursal.nombre}`);
    const responseBody201 = { success: true, sucursal };
    console.log('🔚 [DEBUG-ROUTES-STAFF] POST /sucursales - respondiendo status 201:', responseBody201);
    res.status(201).json(responseBody201);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-STAFF] POST /sucursales - error capturado en catch:', error);
    console.error('❌ [DEBUG-ROUTES-STAFF] POST /sucursales - error.message:', error.message);
    console.error('❌ [DEBUG-ROUTES-STAFF] POST /sucursales - error.stack:', error.stack);
    console.error('[STAFF] Error creando sucursal:', error.message);
    const responseBody400 = { error: error.message || 'No se pudo crear la sucursal.' };
    console.log('🔚 [DEBUG-ROUTES-STAFF] POST /sucursales - respondiendo status 400:', responseBody400);
    res.status(400).json(responseBody400);
  }
});

router.put('/sucursales/:id', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - req.body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - req.admin (role, sucursalId, username, sub):', req.admin);

  const { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre, abierta24hs } = req.body;

  try {
    console.log('🔍 [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - llamando a actualizarSucursal (servicio, no es supabase.from directo) con id:', req.params.id, '| datos:', { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre, abierta24hs });
    const sucursal = await actualizarSucursal(req.params.id, { nombre, direccion, googleMapsUrl, dias, horaApertura, horaCierre, abierta24hs });
    console.log('✅ [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - resultado actualizarSucursal:', sucursal);
    console.log(`[STAFF] Sucursal actualizada: ${sucursal.nombre}`);
    const responseBody200 = { success: true, sucursal };
    console.log('🔚 [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - respondiendo status 200:', responseBody200);
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - error capturado en catch:', error);
    console.error('❌ [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - error.message:', error.message);
    console.error('❌ [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - error.stack:', error.stack);
    console.error('[STAFF] Error actualizando sucursal:', error.message);
    const responseBody400 = { error: error.message || 'No se pudo guardar la sucursal.' };
    console.log('🔚 [DEBUG-ROUTES-STAFF] PUT /sucursales/:id - respondiendo status 400:', responseBody400);
    res.status(400).json(responseBody400);
  }
});

// Prender/apagar una sucursal (columna `activo`). Separado del PUT general de
// arriba porque es la única escritura que tiene que quedar exclusivamente en
// manos del admin desde el backend: antes se hacía con un UPDATE directo del
// frontend a Supabase (anon key + RLS abierta), que no respetaba ningún rol.
// Al apagarla, sucursalesMasCercanas()/getSucursalesActivas() ya la excluyen
// solas de las recomendadas (filtran por activo=true), sin tocar nada más acá.
router.patch('/sucursales/:id/estado', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - req.body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - req.admin (role, sucursalId, username, sub):', req.admin);

  const { activo } = req.body;

  if (typeof activo !== 'boolean') {
    console.log('🔚 [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - respondiendo status 400: activo no es boolean');
    return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
  }

  try {
    console.log('🔍 [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - llamando a actualizarEstadoSucursal (servicio) con id:', req.params.id, '| activo:', activo);
    const sucursal = await actualizarEstadoSucursal(req.params.id, activo);
    console.log('✅ [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - resultado actualizarEstadoSucursal:', sucursal);
    console.log(`[STAFF] Sucursal ${activo ? 'encendida' : 'apagada'}: ${sucursal.nombre} (${req.params.id})`);
    const responseBody200 = { success: true, sucursal };
    console.log('🔚 [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - respondiendo status 200:', responseBody200);
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - error capturado en catch:', error);
    console.error('❌ [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - error.message:', error.message);
    console.error('❌ [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - error.stack:', error.stack);
    console.error('[STAFF] Error cambiando estado de sucursal:', error.message);
    const responseBody400 = { error: error.message || 'No se pudo cambiar el estado de la sucursal.' };
    console.log('🔚 [DEBUG-ROUTES-STAFF] PATCH /sucursales/:id/estado - respondiendo status 400:', responseBody400);
    res.status(400).json(responseBody400);
  }
});

router.delete('/sucursales/:id', async (req, res) => {
  console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - req.method:', req.method, '| req.originalUrl:', req.originalUrl, '| req.path:', req.path);
  console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - req.body:', req.body);
  console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - req.query:', req.query);
  console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - req.params:', req.params);
  console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - req.admin (role, sucursalId, username, sub):', req.admin);

  try {
    console.log('🔍 [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - llamando a eliminarSucursal (servicio, no es supabase.from directo) con id:', req.params.id);
    await eliminarSucursal(req.params.id);
    console.log('✅ [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - eliminarSucursal ejecutado sin error para id:', req.params.id);
    console.log(`[STAFF] Sucursal eliminada: ${req.params.id}`);
    const responseBody200 = { success: true };
    console.log('🔚 [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - respondiendo status 200:', responseBody200);
    res.status(200).json(responseBody200);
  } catch (error) {
    console.error('❌ [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - error capturado en catch:', error);
    console.error('❌ [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - error.message:', error.message);
    console.error('❌ [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - error.stack:', error.stack);
    console.error('[STAFF] Error eliminando sucursal:', error.message);
    // Se expone el motivo real (ej. una restricción de la base) en vez de un
    // mensaje genérico: un borrado que falla en silencio es lo que llevó a
    // confundir "ya la borré" con "en la base seguía viva".
    const responseBody500 = { error: error.message || 'No se pudo eliminar la sucursal.' };
    console.log('🔚 [DEBUG-ROUTES-STAFF] DELETE /sucursales/:id - respondiendo status 500:', responseBody500);
    res.status(500).json(responseBody500);
  }
});

export default router;
