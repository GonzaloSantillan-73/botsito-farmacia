import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

export default function ImageModal({ imageUrl, onClose }) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!imageUrl) return null;

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => prev + 90);

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
          onClick={onClose}
          className="p-3 bg-red-500/80 hover:bg-red-500 text-white rounded-full transition-colors ml-4"
          title="Cerrar"
        >
          <X size={24} />
        </button>
      </div>
      
      <div className="max-w-[90vw] max-h-[90vh] overflow-auto flex items-center justify-center scrollbar-hide">
        <img 
          src={imageUrl} 
          alt="Vista ampliada" 
          style={{ 
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.3s ease-in-out'
          }}
          className="max-w-full max-h-[85vh] object-contain cursor-move rounded shadow-2xl bg-white"
        />
      </div>
    </div>
  );
}
