import React, { useState } from 'react';
import { ShoppingBag, Plus, Trash2, X, CornerDownLeft } from 'lucide-react';

// Armador de mensajes: arma la lista de productos (nombre, precio, cantidad y
// % de descuento) con el mismo formato que el cotizador, pero SIN encabezado,
// envío ni totales, y la agrega al final de lo que el operador esté
// escribiendo. Es opcional y no guarda nada (no es una cotización ni un
// pedido): sólo sirve para mandar productos ordenados en un mismo mensaje.
// La lista vive en ChatArea (por chat) y no se vacía al agregarla, por si
// hay que volver a mandarla.

export const formatearProductosParaMensaje = (productos) => productos.map(p => {
  const bruto = p.precio * p.cantidad;
  const descuento = bruto * (p.descuento / 100);
  const lineas = [
    `- ${p.nombre} (x${p.cantidad}):`,
    `  Precio unitario: $${p.precio.toFixed(2)}`
  ];
  if (p.descuento > 0) lineas.push(`  Desc. (${p.descuento}%): -$${descuento.toFixed(2)}`);
  lineas.push(`  Total: $${(bruto - descuento).toFixed(2)}`);
  return lineas.join('\n');
}).join('\n\n');

// El navegador (Edge/Chrome) ofrece "Información guardada" en estos campos
// cada vez que se escribe: se apaga el autocompletado y se evita que los
// gestores de contraseñas los tomen como datos personales.
const SIN_AUTOCOMPLETAR = { autoComplete: 'off', autoCorrect: 'off', spellCheck: false, 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-form-type': 'other' };

const inputClase = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500';

export default function ArmadorMensaje({ productos, setProductos, onAgregarAlMensaje, onClose }) {
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [descuento, setDescuento] = useState('0');

  const precioNum = parseFloat(precio);
  const cantidadNum = parseInt(cantidad, 10);
  const descuentoNum = Math.min(100, Math.max(0, parseFloat(descuento) || 0));
  const puedeAgregar = nombre.trim() && precioNum > 0 && cantidadNum > 0;

  const agregarProducto = (e) => {
    e?.preventDefault();
    if (!puedeAgregar) return;
    setProductos(prev => [...prev, {
      id: crypto.randomUUID(),
      nombre: nombre.trim(),
      precio: precioNum,
      cantidad: cantidadNum,
      descuento: descuentoNum
    }]);
    setNombre('');
    setPrecio('');
    setCantidad('1');
    setDescuento('0');
  };

  const quitarProducto = (id) => { setProductos(prev => prev.filter(p => p.id !== id)); };
  const cambiarCantidad = (id, valor) => {
    const n = Math.max(1, parseInt(valor, 10) || 1);
    setProductos(prev => prev.map(p => (p.id === id ? { ...p, cantidad: n } : p)));
  };

  return (
    <div className="absolute bottom-[100%] mb-2 left-4 right-4 md:right-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-xl w-auto md:w-[380px] overflow-hidden z-20">
      <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag size={16} className="text-teal-600 dark:text-teal-400" />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Armador de mensaje</span>
        </div>
        <button onClick={onClose} title="Cerrar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={agregarProducto} autoComplete="off" className="p-3 space-y-2 border-b border-gray-100 dark:border-gray-700">
        <input
          id="armador-producto"
          {...SIN_AUTOCOMPLETAR}
          value={nombre}
          onChange={(e) => { setNombre(e.target.value); }}
          placeholder="Medicamento / Producto"
          className={inputClase}
          autoFocus
        />
        <div className="grid grid-cols-[1fr_5rem_5rem_auto] gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
            <input
              id="armador-precio"
          {...SIN_AUTOCOMPLETAR}
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => { setPrecio(e.target.value); }}
              placeholder="Precio"
              className={`${inputClase} pl-6`}
            />
          </div>
          <input
            id="armador-cant"
          {...SIN_AUTOCOMPLETAR}
            type="number"
            min="1"
            value={cantidad}
            onChange={(e) => { setCantidad(e.target.value); }}
            title="Cantidad"
            className={inputClase}
          />
          <div className="relative">
            <input
              id="armador-desc"
          {...SIN_AUTOCOMPLETAR}
              type="number"
              min="0"
              max="100"
              value={descuento}
              onChange={(e) => { setDescuento(e.target.value); }}
              title="% de descuento"
              className={`${inputClase} pr-6`}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
          </div>
          <button
            type="submit"
            disabled={!puedeAgregar}
            title="Agregar producto a la lista"
            className="px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center"
          >
            <Plus size={18} />
          </button>
        </div>
      </form>

      {productos.length === 0 ? (
        <p className="px-3 py-4 text-xs text-center text-gray-400 dark:text-gray-500">
          Agregá productos y después tocá "Agregar al mensaje".
        </p>
      ) : (
        // A partir del 3er producto aparece la barra de desplazamiento.
        <ul className="max-h-[14.5rem] overflow-y-auto scrollbar-thin p-2 space-y-2">
          {productos.map(p => {
            const total = p.precio * p.cantidad * (1 - p.descuento / 100);
            return (
              <li key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate" title={p.nombre}>{p.nombre}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    ${p.precio.toFixed(2)} c/u{p.descuento > 0 ? ` · ${p.descuento}% desc.` : ''}
                  </p>
                </div>
                <input
                  type="number"
                  min="1"
                  value={p.cantidad}
                  onChange={(e) => { cambiarCantidad(p.id, e.target.value); }}
                  title="Cantidad"
                  className="w-14 px-2 py-1 text-sm text-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-md"
                />
                <span className="w-20 text-right text-sm font-bold text-gray-800 dark:text-gray-100 tabular-nums">${total.toFixed(2)}</span>
                <button onClick={() => { quitarProducto(p.id); }} title="Quitar" className="p-1 text-rose-500 hover:text-rose-600">
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="p-3 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={onAgregarAlMensaje}
          disabled={productos.length === 0}
          className="w-full flex items-center justify-center gap-2 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
        >
          <CornerDownLeft size={16} /> Agregar al mensaje
        </button>
      </div>
    </div>
  );
}
