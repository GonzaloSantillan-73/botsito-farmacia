import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';
import { downloadFile, filenameFromUrl } from '../lib/downloadFile';

export default function ImageModal({ imageUrl, onClose }) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Cada vez que se abre una imagen nueva, arrancamos limpios (sin zoom/paneo
  // residual de la anterior).
  useEffect(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, [imageUrl]);

  if (!imageUrl) return null;

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => prev + 90);

  // Zoom con la rueda del mouse: hacia arriba acerca, hacia abajo aleja, en
  // pasos chicos para que se sienta gradual. preventDefault() evita que la
  // rueda scrollee la página de fondo mientras se hace zoom.
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setScale(prev => Math.min(3, Math.max(0.5, +(prev + delta).toFixed(2))));
  };

  const handleDownload = async () => {
    setDownloading(true);
    await downloadFile(imageUrl, filenameFromUrl(imageUrl));
    setDownloading(false);
  };

  // Paneo: al arrastrar, movemos la imagen con el mouse. Escuchamos
  // mousemove/mouseup en window para que el arrastre no se corte si el
  // cursor sale del área de la imagen mientras se mueve.
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const { x, y, posX, posY } = dragStartRef.current;
      setPosition({ x: posX + (e.clientX - x), y: posY + (e.clientY - y) });
    };
    const handleMouseUp = () => setIsDragging(false);

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
          onClick={onClose}
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
