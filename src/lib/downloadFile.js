// Deriva un nombre de archivo razonable a partir de la URL (último segmento
// del path, sin query string), para sugerírselo al navegador al descargar.
export const filenameFromUrl = (url) => {
  try {
    const { pathname } = new URL(url);
    return decodeURIComponent(pathname.split('/').pop() || 'archivo');
  } catch {
    return 'archivo';
  }
};

// Fuerza la descarga de un archivo remoto (foto, video, documento) al equipo
// local. Un <a download> simple no alcanza para URLs de otro origen (como las
// de Supabase Storage): el navegador suele abrirlas en vez de descargarlas.
// Bajamos el archivo como blob y disparamos la descarga desde una URL local.
// Devuelve cómo terminó, para que quien llama pueda avisarle al operador si
// no se pudo bajar directamente (se abrió en una pestaña como alternativa).
export const downloadFile = async (url, filename) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`No se pudo descargar el archivo (HTTP ${response.status})`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    return { ok: true, method: 'blob' };
  } catch (err) {
    console.error('Error descargando el archivo, se abre en una pestaña nueva como alternativa:', err);
    window.open(url, '_blank', 'noopener,noreferrer');
    return { ok: false, method: 'fallback-tab', error: err };
  }
};
