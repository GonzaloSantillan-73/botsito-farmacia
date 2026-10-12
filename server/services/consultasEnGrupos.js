// Herramientas compartidas para consultas grandes a Supabase (Métricas,
// Directorio de Clientes, búsqueda de nombres). Sólo lectura.

// Supabase devuelve como máximo 1000 filas por SELECT y corta el resto sin
// avisar: con todo el histórico, los mensajes de las consultas más nuevas
// quedaban afuera (Msjs Cliente en 0, Duración Total "<1m"). Se pagina con
// .range() hasta que una página venga incompleta. Sólo lectura.
const TAM_PAGINA = 1000;
export const traerTodasLasPaginas = async (construirQuery) => {
  const filas = [];
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await construirQuery().range(desde, desde + TAM_PAGINA - 1);
    if (error) return { data: null, error };
    filas.push(...(data || []));
    if (!data || data.length < TAM_PAGINA) return { data: filas, error: null };
  }
};

// Los ids van en la URL del .in(): con cientos de consultas el pedido queda
// demasiado largo, así que se parten en grupos (5 grupos en paralelo a la vez
// para no saturar la base). Cada conversación cae entera en un solo grupo,
// así que sus mensajes siguen llegando juntos y en orden.
const TAM_GRUPO_IDS = 150;
const GRUPOS_EN_PARALELO = 5;
export const traerPorGruposDeIds = async (ids, construirQuery) => {
  const grupos = [];
  for (let i = 0; i < ids.length; i += TAM_GRUPO_IDS) grupos.push(ids.slice(i, i + TAM_GRUPO_IDS));
  const filas = [];
  for (let i = 0; i < grupos.length; i += GRUPOS_EN_PARALELO) {
    const resultados = await Promise.all(
      grupos.slice(i, i + GRUPOS_EN_PARALELO).map(grupo => traerTodasLasPaginas(() => construirQuery(grupo)))
    );
    for (const { data, error } of resultados) {
      if (error) return { data: null, error };
      filas.push(...data);
    }
  }
  return { data: filas, error: null };
};
