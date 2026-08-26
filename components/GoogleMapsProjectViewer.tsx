'use client';

import React, { useState } from 'react';
import {
  X,
  MapPin,
  Navigation,
  ExternalLink,
  Copy,
  Check,
  Share2,
  Building,
  Compass,
  Layers,
  PhoneCall,
  Car,
} from 'lucide-react';
import { Proyecto } from '@/types/database';
import { getCoordenadasComuna } from '@/lib/chile-locations';

interface GoogleMapsProjectViewerProps {
  proyecto: Proyecto | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function GoogleMapsProjectViewer({
  proyecto,
  isOpen,
  onClose,
}: GoogleMapsProjectViewerProps) {
  const [mapType, setMapType] = useState<'m' | 'k'>('m'); // 'm' = Roadmap, 'k' = Satellite
  const [copied, setCopied] = useState(false);

  if (!isOpen || !proyecto) return null;

  const comuna = proyecto.comuna || 'Santiago';
  const region = proyecto.region || 'Región Metropolitana de Santiago';
  const direccion = proyecto.direccion || '';
  const referencia = proyecto.lugar_referencia || '';

  // Coordenadas calculadas o guardadas
  const lat = proyecto.latitud ?? getCoordenadasComuna(comuna).lat;
  const lng = proyecto.longitud ?? getCoordenadasComuna(comuna).lng;

  // Consulta para Google Maps
  const queryParam = encodeURIComponent(
    direccion ? `${direccion}, ${comuna}, Chile` : `${lat},${lng}`
  );
  const mapsEmbedUrl = `https://maps.google.com/maps?q=${queryParam}&t=${mapType}&z=16&ie=UTF8&iwloc=&output=embed`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    direccion ? `${direccion}, ${comuna}, Chile` : `${lat},${lng}`
  )}`;
  const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    direccion ? `${direccion}, ${comuna}, Chile` : `${lat},${lng}`
  )}`;

  // Compartir por WhatsApp a la cuadrilla o transportistas
  const shareText = encodeURIComponent(
    `📍 *Ubicación de Obra ObraTrack*: ${proyecto.nombre}\n` +
      `🏢 Mandante: ${proyecto.cliente?.nombre || 'Cliente Particular'}\n` +
      `📌 Dirección: ${direccion ? `${direccion}, ` : ''}${comuna}, ${region}\n` +
      (referencia ? `🔍 Referencia: ${referencia}\n` : '') +
      `🗺️ Ver en Google Maps: https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  );
  const whatsappShareUrl = `https://wa.me/?text=${shareText}`;

  // Copiar datos de ubicación al portapapeles
  const handleCopyLocation = () => {
    const textToCopy = `${proyecto.nombre} - ${direccion ? `${direccion}, ` : ''}${comuna}, Chile (GPS: ${lat}, ${lng})`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[calc(100dvh-2rem)] flex flex-col">
        
        {/* Cabecera del Visor */}
        <div className="p-4 sm:p-5 border-b border-[#E5DFC9] dark:border-[#263040] flex items-center justify-between bg-[#FAF8F5] dark:bg-[#0F141C]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center font-bold shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-heading font-bold text-base sm:text-lg text-[#1E1E1E] dark:text-white tracking-tight">
                  {proyecto.nombre}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FF6A00]/15 text-[#FF6A00] border border-[#FF6A00]/30">
                  📍 {comuna}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-sans mt-0.5">
                {region} • Coordenadas: <span className="font-mono">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition-colors"
            aria-label="Cerrar visor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mapa Interactivo de Google Maps */}
        <div className="relative w-full h-64 sm:h-80 bg-gray-100 dark:bg-gray-900">
          
          {/* Controles flotantes en el mapa */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-white/95 dark:bg-[#141A23]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 shadow-md text-xs font-mono">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF6A00] animate-pulse"></span>
            <span className="font-bold text-[#1E1E1E] dark:text-white truncate max-w-[200px] sm:max-w-xs">
              {direccion || proyecto.nombre}
            </span>
          </div>

          {/* Selector de Capas (Mapa / Satélite) */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-white/95 dark:bg-[#141A23]/95 backdrop-blur-md p-1 rounded-xl border border-black/10 dark:border-white/10 shadow-md">
            <button
              type="button"
              onClick={() => setMapType('m')}
              className={`px-2.5 py-1 text-xs font-bold font-heading rounded-lg transition-all ${
                mapType === 'm'
                  ? 'bg-[#1E1E1E] dark:bg-[#FF6A00] text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-black'
              }`}
            >
              Mapa
            </button>
            <button
              type="button"
              onClick={() => setMapType('k')}
              className={`px-2.5 py-1 text-xs font-bold font-heading rounded-lg transition-all ${
                mapType === 'k'
                  ? 'bg-[#1E1E1E] dark:bg-[#FF6A00] text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-black'
              }`}
            >
              Satélite
            </button>
          </div>

          {/* Iframe Embebido de Google Maps */}
          <iframe
            title={`Mapa de ${proyecto.nombre}`}
            width="100%"
            height="100%"
            style={{ border: 0, display: 'block' }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            src={mapsEmbedUrl}
            className="w-full h-full"
          ></iframe>
        </div>

        {/* Ficha de Detalles de Ubicación & Botones de Acción */}
        <div className="p-4 sm:p-5 space-y-4 bg-white dark:bg-[#141A23] overflow-y-auto">
          
          {/* Datos Rápidos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040]">
              <span className="text-[10px] font-mono font-bold uppercase text-gray-500 dark:text-gray-400 block mb-0.5">
                Dirección Registrada
              </span>
              <p className="font-semibold text-[#1E1E1E] dark:text-white">
                {direccion || 'Sin dirección específica (Comuna: ' + comuna + ')'}
              </p>
              {referencia && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  🔍 Ref: {referencia}
                </p>
              )}
            </div>

            <div className="p-3 rounded-xl bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040]">
              <span className="text-[10px] font-mono font-bold uppercase text-gray-500 dark:text-gray-400 block mb-0.5">
                Mandante & Obra
              </span>
              <p className="font-semibold text-[#1E1E1E] dark:text-white truncate">
                {proyecto.cliente?.nombre || 'Cliente Particular'}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                Estado: <span className="font-mono uppercase font-bold text-[#6B8F72]">{proyecto.estado}</span>
              </p>
            </div>
          </div>

          {/* Botones de Navegación Externa */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            
            {/* Cómo llegar (Ruta) */}
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-3 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-2 font-heading transition-all"
            >
              <Car className="w-4 h-4" />
              <span>Cómo Llegar (GPS)</span>
            </a>

            {/* Compartir por WhatsApp */}
            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-3 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-2 font-heading transition-all"
            >
              <Share2 className="w-4 h-4" />
              <span>Enviar por WhatsApp</span>
            </a>

            {/* Copiar Datos */}
            <button
              type="button"
              onClick={handleCopyLocation}
              className="py-2.5 px-3 bg-white dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] hover:border-[#FF6A00] text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 font-heading transition-all"
            >
              {copied ? <Check className="w-4 h-4 text-[#6B8F72]" /> : <Copy className="w-4 h-4 text-gray-400" />}
              <span>{copied ? '¡Copiado!' : 'Copiar Coordenadas'}</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
