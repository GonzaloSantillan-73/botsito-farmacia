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
export const downloadFile = async (url, filename) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo descargar el archivo');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Error descargando el archivo, se abre en una pestaña nueva:', err);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};
