import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';
import { downloadFile, filenameFromUrl } from '../lib/downloadFile';

export default function ImageModal({ imageUrl, onClose }) {
  console.log('🔍 [DEBUG-COMPONENT-ImageModal] Render — props:', { imageUrl, onClose });

  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Cada vez que se abre una imagen nueva, arrancamos limpios (sin zoom/paneo
  // residual de la anterior).
  useEffect(() => {
    console.log('🔄 [DEBUG-COMPONENT-ImageModal] useEffect(reset por nueva imagen) disparado — deps:', { imageUrl });
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, [imageUrl]);

  if (!imageUrl) return null;

  const handleZoomIn = () => setScale(prev => {
    const next = Math.min(prev + 0.25, 3);
    console.log('🖱️ [DEBUG-COMPONENT-ImageModal] handleZoomIn() — scale:', prev, '->', next);
    return next;
  });
  const handleZoomOut = () => setScale(prev => {
    const next = Math.max(prev - 0.25, 0.5);
    console.log('🖱️ [DEBUG-COMPONENT-ImageModal] handleZoomOut() — scale:', prev, '->', next);
    return next;
  });
  const handleRotate = () => setRotation(prev => {
    const next = prev + 90;
    console.log('🖱️ [DEBUG-COMPONENT-ImageModal] handleRotate() — rotation:', prev, '->', next);
    return next;
  });

  // Zoom con la rueda del mouse: hacia arriba acerca, hacia abajo aleja, en
  // pasos chicos para que se sienta gradual. preventDefault() evita que la
  // rueda scrollee la página de fondo mientras se hace zoom.
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    console.log('🖱️ [DEBUG-COMPONENT-ImageModal] handleWheel() — deltaY:', e.deltaY, 'delta:', delta);
    setScale(prev => Math.min(3, Math.max(0.5, +(prev + delta).toFixed(2))));
  };

  const handleDownload = async () => {
    console.log('🖱️ [DEBUG-COMPONENT-ImageModal] handleDownload() — imageUrl:', imageUrl);
    setDownloading(true);
    await downloadFile(imageUrl, filenameFromUrl(imageUrl));
    console.log('✅ [DEBUG-COMPONENT-ImageModal] Descarga finalizada');
    setDownloading(false);
  };

  // Paneo: al arrastrar, movemos la imagen con el mouse. Escuchamos
  // mousemove/mouseup en window para que el arrastre no se corte si el
  // cursor sale del área de la imagen mientras se mueve.
  const handleMouseDown = (e) => {
    e.preventDefault();
    console.log('🖱️ [DEBUG-COMPONENT-ImageModal] handleMouseDown() — clientX/Y:', e.clientX, e.clientY);
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
  };

  useEffect(() => {
    console.log('🔄 [DEBUG-COMPONENT-ImageModal] useEffect(drag listeners) disparado — deps:', { isDragging });
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const { x, y, posX, posY } = dragStartRef.current;
      const next = { x: posX + (e.clientX - x), y: posY + (e.clientY - y) };
      console.log('🔄 [DEBUG-COMPONENT-ImageModal] setPosition ->', next);
      setPosition(next);
    };
    const handleMouseUp = () => {
      console.log('🖱️ [DEBUG-COMPONENT-ImageModal] handleMouseUp() — fin de arrastre');
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="absolute top-4 right-4 flex gap-4">
        <button
          onClick={handleZoomOut}
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
          title="Alejar"
        >
          <ZoomOut size={24} />
        </button>
        <button
          onClick={handleZoomIn}
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
          title="Acercar"
        >
          <ZoomIn size={24} />
        </button>
        <button
          onClick={handleRotate}
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
          title="Rotar 90°"
        >
          <RotateCw size={24} />
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors disabled:opacity-50"
          title="Descargar imagen"
        >
          <Download size={24} />
        </button>
        <button
          onClick={() => { console.log('🖱️ [DEBUG-COMPONENT-ImageModal] click botón cerrar (X)'); onClose(); }}
          className="p-3 bg-red-500/80 hover:bg-red-500 text-white rounded-full transition-colors ml-4"
          title="Cerrar"
        >
          <X size={24} />
        </button>
      </div>

      <div
        className="max-w-[90vw] max-h-[90vh] overflow-hidden flex items-center justify-center"
        onWheel={handleWheel}
      >
        <img
          src={imageUrl}
          alt="Vista ampliada"
          onMouseDown={handleMouseDown}
          onDragStart={(e) => e.preventDefault()}
          draggable={false}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
          className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl bg-white select-none"
        />
      </div>
    </div>
  );
}
