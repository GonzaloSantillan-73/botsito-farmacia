import { plexGet } from './plexClient.js';
import { supabase } from '../supabase.js';

// Plex manda los precios como "646375,90" (coma decimal, punto de miles).
// Los normalizamos a un numeric de Postgres antes de guardarlos.
const parsePrecio = (valor) => {
  if (valor == null || valor === '') return null;
  const normalizado = String(valor).replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalizado);
  return Number.isFinite(num) ? num : null;
};

const parseEntero = (valor) => {
  const num = parseInt(valor, 10);
  return Number.isFinite(num) ? num : null;
};

// --- 1. Sucursales (endpoint 1.5) ---
// Espejo de las sucursales reales de la farmacia en Plex (id y nombre), para
// poder pedir stock por sucursal más adelante.
export const sincronizarSucursalesPlex = async () => {
  console.log('[PLEX SYNC] === Sincronizando sucursales ===');
  const content = await plexGet('sucursales');
  const sucursales = content?.sucursales || [];

  if (sucursales.length === 0) {
    console.log('[PLEX SYNC] Plex no devolvió sucursales.');
    return { total: 0 };
  }

  const filas = sucursales.map(s => ({
    id_sucursal: String(s.idsucursal),
    nombre: s.sucursal,
    empresa: s.empresa || null,
    cuit: s.cuit || null,
    synced_at: new Date().toISOString()
  }));

  const { error } = await supabase.from('plex_sucursales').upsert(filas, { onConflict: 'id_sucursal' });
  if (error) throw error;

  console.log(`[PLEX SYNC] ✅ ${filas.length} sucursales sincronizadas.`);
  return { total: filas.length };
};

// Resuelve qué idsubrubro corresponden a "drogas" / "principios activos" en
// Plex, para poder excluirlos totalmente del catálogo local (nunca se
// guardan, ni en plex_productos ni -por extensión- en plex_stock).
const obtenerSubrubrosExcluidos = async () => {
  const content = await plexGet('subrubros');
  const subrubros = content?.subrubros || [];
  const excluidos = new Set(
    subrubros
      .filter(s => /droga|principio\s*activo/i.test(s.subrubro || ''))
      .map(s => String(s.idsubrubro))
  );
  return excluidos;
};

// --- 2. Productos (endpoint 4.1) ---
// Sincroniza el catálogo comercial completo, página por página, excluyendo
// por completo cualquier subrubro de drogas/principios activos.
export const sincronizarProductosPlex = async () => {
  console.log('[PLEX SYNC] === Sincronizando productos ===');
  const subrubrosExcluidos = await obtenerSubrubrosExcluidos();
  if (subrubrosExcluidos.size > 0) {
    console.log(`[PLEX SYNC] Excluyendo ${subrubrosExcluidos.size} subrubro(s) de drogas/principios activos.`);
  }

  let pagina = 1;
  let paginaAnterior = null;
  let totalGuardados = 0;
  let totalExcluidos = 0;

  while (true) {
    const content = await plexGet('productos', { pagina });
    const productos = content?.productos || [];
    if (productos.length === 0) break;

    const filas = [];
    for (const p of productos) {
      if (subrubrosExcluidos.has(String(p.idsubrubro))) {
        totalExcluidos++;
        continue;
      }
      filas.push({
        cod_producto: String(p.codproducto),
        nombre: p.producto,
        precio: parsePrecio(p.precio),
        id_rubro: p.idrubro ? String(p.idrubro) : null,
        id_subrubro: p.idsubrubro ? String(p.idsubrubro) : null,
        id_laboratorio: p.idlaboratorio ? String(p.idlaboratorio) : null,
        codebar: p.codebar || null,
        unidades_por_caja: parseEntero(p.unidades),
        synced_at: new Date().toISOString()
      });
    }

    if (filas.length > 0) {
      const { error } = await supabase.from('plex_productos').upsert(filas, { onConflict: 'cod_producto' });
      if (error) throw error;
      totalGuardados += filas.length;
    }

    const paginaActual = String(content.paginanro);
    const totalPaginas = parseEntero(content.totpaginas) || 1;
    console.log(`[PLEX SYNC] Productos - página ${paginaActual}/${totalPaginas}: ${productos.length} recibidos (${filas.length} guardados, ${productos.length - filas.length} excluidos).`);

    // Corte de seguridad: si el servidor no avanza de página (el entorno de
    // pruebas a veces ignora el parámetro "pagina"), no repetimos el pedido.
    if (paginaActual === paginaAnterior) break;
    paginaAnterior = paginaActual;

    if (Number(paginaActual) >= totalPaginas) break;
    pagina++;
  }

  console.log(`[PLEX SYNC] ✅ Productos sincronizados: ${totalGuardados} guardados, ${totalExcluidos} excluidos (drogas/principios activos).`);
  return { guardados: totalGuardados, excluidos: totalExcluidos };
};

// Deja constancia en plex_sucursales del resultado del último intento de
// sincronizar el stock de esta sucursal puntual (éxito o motivo del error),
// para que el panel de Sucursales pueda marcarla "No disponible" sin
// depender de que el admin esté mirando este panel en el momento del fallo.
// Es best-effort: si esta escritura en sí falla, no debe tapar el resultado
// real de la sincronización (que ya se logueó/propagó aparte).
const marcarEstadoSyncStock = async (idSucursal, { ok, error }) => {
  try {
    await supabase
      .from('plex_sucursales')
      .update({ last_stock_sync_ok: ok, last_stock_sync_error: error, last_stock_sync_at: new Date().toISOString() })
      .eq('id_sucursal', String(idSucursal));
  } catch (err) {
    console.error(`[PLEX SYNC] No se pudo registrar el estado de sync de stock para ${idSucursal}:`, err.message);
  }
};

// --- 3. Stock por sucursal (endpoint 7.1) ---
// Sincroniza el stock de una sucursal puntual, página por página. Solo
// guarda stock de productos que ya pasaron el filtro de drogas/principios
// activos en plex_productos (si no está en el catálogo local, tampoco
// guardamos su stock).
export const sincronizarStockPlex = async (idSucursal) => {
  if (!idSucursal) throw new Error('Falta indicar la sucursal a sincronizar.');
  console.log(`[PLEX SYNC] === Sincronizando stock de la sucursal ${idSucursal} ===`);

  try {
    const { data: productosValidos, error: prodError } = await supabase
      .from('plex_productos')
      .select('cod_producto');
    if (prodError) throw prodError;
    const codigosValidos = new Set((productosValidos || []).map(p => p.cod_producto));

    let pagina = 1;
    let paginaAnterior = null;
    let totalGuardados = 0;
    let totalOmitidos = 0;

    while (true) {
      const content = await plexGet('stock', { sucursal: idSucursal, pagina });
      const productos = content?.productos || [];
      if (productos.length === 0) break;

      const filas = [];
      for (const p of productos) {
        const codProducto = String(p.codproducto);
        if (!codigosValidos.has(codProducto)) {
          totalOmitidos++;
          continue;
        }
        filas.push({
          id_sucursal: String(idSucursal),
          cod_producto: codProducto,
          cajas: parseEntero(p.cajas),
          unidades: parseEntero(p.unidades),
          minimo: parseEntero(p.minimo),
          maximo: parseEntero(p.maximo),
          seguridad: parseEntero(p.seguridad),
          abc: p.abc || null,
          synced_at: new Date().toISOString()
        });
      }

      if (filas.length > 0) {
        const { error } = await supabase.from('plex_stock').upsert(filas, { onConflict: 'id_sucursal,cod_producto' });
        if (error) throw error;
        totalGuardados += filas.length;
      }

      const paginaActual = String(content.pagina);
      const totalPaginas = parseEntero(content.total_paginas) || 1;
      console.log(`[PLEX SYNC] Stock sucursal ${idSucursal} - página ${paginaActual}/${totalPaginas}: ${productos.length} recibidos (${filas.length} guardados, ${productos.length - filas.length} omitidos).`);

      if (paginaActual === paginaAnterior) break;
      paginaAnterior = paginaActual;

      if (Number(paginaActual) >= totalPaginas) break;
      pagina++;
    }

    console.log(`[PLEX SYNC] ✅ Stock sincronizado para sucursal ${idSucursal}: ${totalGuardados} guardados, ${totalOmitidos} omitidos (fuera del catálogo local).`);
    await marcarEstadoSyncStock(idSucursal, { ok: true, error: null });
    return { guardados: totalGuardados, omitidos: totalOmitidos };
  } catch (err) {
    await marcarEstadoSyncStock(idSucursal, { ok: false, error: err.message || 'Error desconocido al sincronizar el stock.' });
    throw err;
  }
};

// Recorre TODAS las sucursales registradas en plex_sucursales y sincroniza el
// stock de cada una, una por una. Tolerante a fallos: si una sucursal
// individual falla (red, timeout, respuesta inválida de Plex), el error se
// captura y registra, pero el bucle sigue con la siguiente sucursal en vez de
// abortar todo el proceso. Devuelve el desglose completo, sucursal por
// sucursal, para que el front pueda mostrar qué se sincronizó bien y qué no.
export const sincronizarStockTodasLasSucursales = async () => {
  const { data: sucursales, error } = await supabase
    .from('plex_sucursales')
    .select('id_sucursal, nombre')
    .order('nombre');
  if (error) throw error;

  const resultados = [];
  let totalGuardados = 0;
  let totalOmitidos = 0;

  for (const { id_sucursal, nombre } of sucursales || []) {
    try {
      const resultado = await sincronizarStockPlex(id_sucursal);
      totalGuardados += resultado.guardados;
      totalOmitidos += resultado.omitidos;
      resultados.push({ id_sucursal, nombre, success: true, guardados: resultado.guardados, omitidos: resultado.omitidos });
    } catch (err) {
      console.error(`[PLEX SYNC] ❌ Error sincronizando stock de "${nombre}" (${id_sucursal}):`, err.message);
      resultados.push({ id_sucursal, nombre, success: false, error: err.message || 'No se pudo sincronizar esta sucursal.' });
    }
  }

  const exitosas = resultados.filter(r => r.success).length;
  console.log(`[PLEX SYNC] ✅ Stock sincronizado para ${exitosas}/${resultados.length} sucursales (${totalGuardados} guardados, ${totalOmitidos} omitidos en total).`);
  return {
    sucursales: resultados.length,
    exitosas,
    fallidas: resultados.length - exitosas,
    guardados: totalGuardados,
    omitidos: totalOmitidos,
    resultados
  };
};
