import React, { useState } from 'react';
import { X, Download, ExternalLink, Loader2 } from 'lucide-react';
import { downloadFile, filenameFromUrl } from '../lib/downloadFile';

export default function PdfModal({ pdfUrl, onClose }) {
  const [downloading, setDownloading] = useState(false);

  if (!pdfUrl) return null;

  const handleDownload = async () => {
    setDownloading(true);
    await downloadFile(pdfUrl, filenameFromUrl(pdfUrl));
    setDownloading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
      <div className="absolute top-4 right-4 flex gap-4">
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
          title="Abrir en una pestaña nueva"
        >
          <ExternalLink size={22} />
        </a>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors disabled:opacity-50"
          title="Descargar PDF"
        >
          {downloading ? <Loader2 size={22} className="animate-spin" /> : <Download size={22} />}
        </button>
        <button
          onClick={onClose}
          className="p-3 bg-red-500/80 hover:bg-red-500 text-white rounded-full transition-colors ml-4"
          title="Cerrar"
        >
          <X size={22} />
        </button>
      </div>

      <div className="w-full max-w-4xl h-[90vh] bg-white rounded-lg shadow-2xl overflow-hidden">
        {/* El navegador renderiza el PDF con su visor nativo (aislado, sandboxeado),
            igual que si se abriera directamente en una pestaña. */}
        <iframe src={pdfUrl} title="Vista previa del PDF" className="w-full h-full border-0" />
      </div>
    </div>
  );
}
