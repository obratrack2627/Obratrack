'use client';

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  ExternalLink,
  Layers,
  Compass,
  Check,
  Search,
  Crosshair,
  Sparkles,
} from 'lucide-react';
import {
  REGIONES_CHILE,
  COORDENADAS_COMUNAS_CHILE,
  getCoordenadasComuna,
  findNearestComuna,
} from '@/lib/chile-locations';

interface GoogleMapsLocationPickerProps {
  direccion: string;
  comuna: string;
  region: string;
  latitud?: number;
  longitud?: number;
  lugarReferencia?: string;
  onChange: (data: {
    direccion: string;
    comuna: string;
    region: string;
    latitud: number;
    longitud: number;
    lugarReferencia: string;
  }) => void;
}

export default function GoogleMapsLocationPicker({
  direccion,
  comuna,
  region,
  latitud,
  longitud,
  lugarReferencia,
  onChange,
}: GoogleMapsLocationPickerProps) {
  const [selectedRegion, setSelectedRegion] = useState(
    region || 'Región Metropolitana de Santiago'
  );
  const [selectedComuna, setSelectedComuna] = useState(comuna || 'Las Condes');
  const [currentDireccion, setCurrentDireccion] = useState(direccion || '');
  const [currentReferencia, setCurrentReferencia] = useState(lugarReferencia || '');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(() => {
    if (latitud && longitud) {
      return { lat: latitud, lng: longitud };
    }
    return getCoordenadasComuna(comuna || 'Las Condes');
  });
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsStatusText, setGpsStatusText] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'m' | 'k'>('m'); // 'm' = Roadmap, 'k' = Satellite

  // Sincronizar props entrantes si cambian desde el modal padre
  useEffect(() => {
    if (direccion !== undefined) setCurrentDireccion(direccion);
  }, [direccion]);

  useEffect(() => {
    if (comuna) setSelectedComuna(comuna);
  }, [comuna]);

  useEffect(() => {
    if (region) setSelectedRegion(region);
  }, [region]);

  useEffect(() => {
    if (latitud && longitud) {
      setCoords({ lat: latitud, lng: longitud });
    }
  }, [latitud, longitud]);

  useEffect(() => {
    if (lugarReferencia !== undefined) setCurrentReferencia(lugarReferencia);
  }, [lugarReferencia]);

  // Buscar comunas correspondientes a la región seleccionada
  const activeRegionObj =
    REGIONES_CHILE.find((r) => r.nombre === selectedRegion) || REGIONES_CHILE[0];
  const comunasDisponibles = activeRegionObj.comunas;

  // Actualizar coordenadas cuando el usuario cambia de comuna
  const handleComunaChange = (newComuna: string) => {
    setSelectedComuna(newComuna);
    const newCoords = getCoordenadasComuna(newComuna);
    setCoords(newCoords);
    onChange({
      direccion: currentDireccion,
      comuna: newComuna,
      region: selectedRegion,
      latitud: newCoords.lat,
      longitud: newCoords.lng,
      lugarReferencia: currentReferencia,
    });
  };

  // Actualizar región
  const handleRegionChange = (newRegion: string) => {
    setSelectedRegion(newRegion);
    const regionObj = REGIONES_CHILE.find((r) => r.nombre === newRegion);
    const defaultComuna = regionObj?.comunas[0] || 'Santiago';
    setSelectedComuna(defaultComuna);
    const newCoords = getCoordenadasComuna(defaultComuna);
    setCoords(newCoords);
    onChange({
      direccion: currentDireccion,
      comuna: defaultComuna,
      region: newRegion,
      latitud: newCoords.lat,
      longitud: newCoords.lng,
      lugarReferencia: currentReferencia,
    });
  };

  // Actualizar dirección de texto
  const handleDireccionChange = (text: string) => {
    setCurrentDireccion(text);
    onChange({
      direccion: text,
      comuna: selectedComuna,
      region: selectedRegion,
      latitud: coords.lat,
      longitud: coords.lng,
      lugarReferencia: currentReferencia,
    });
  };

  // Actualizar referencia
  const handleReferenciaChange = (text: string) => {
    setCurrentReferencia(text);
    onChange({
      direccion: currentDireccion,
      comuna: selectedComuna,
      region: selectedRegion,
      latitud: coords.lat,
      longitud: coords.lng,
      lugarReferencia: text,
    });
  };

  // Detección automática por GPS del dispositivo + Reverse Geocoding automático
  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador o dispositivo no soporta geolocalización GPS.');
      return;
    }

    setIsDetectingGps(true);
    setGpsStatusText('Capturando señal GPS...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newLat = Number(pos.coords.latitude.toFixed(6));
        const newLng = Number(pos.coords.longitude.toFixed(6));
        const newCoords = { lat: newLat, lng: newLng };
        setCoords(newCoords);

        setGpsStatusText('Identificando calle y comuna...');

        let finalDireccion = currentDireccion;
        let finalComuna = selectedComuna;
        let finalRegion = selectedRegion;

        try {
          const res = await fetch(`/api/geocode/reverse?lat=${newLat}&lng=${newLng}`);
          if (res.ok) {
            const data = await res.json();
            if (data.direccion) finalDireccion = data.direccion;
            if (data.comuna) finalComuna = data.comuna;
            if (data.region) finalRegion = data.region;
          } else {
            const nearest = findNearestComuna(newLat, newLng);
            finalComuna = nearest.comuna;
            finalRegion = nearest.region;
          }
        } catch (err) {
          console.warn('Reverse geocoding error:', err);
          const nearest = findNearestComuna(newLat, newLng);
          finalComuna = nearest.comuna;
          finalRegion = nearest.region;
        }

        // Rellenar campos de forma inmediata en el formulario
        setCurrentDireccion(finalDireccion);
        setSelectedComuna(finalComuna);
        setSelectedRegion(finalRegion);

        // Notificar al componente padre
        onChange({
          direccion: finalDireccion,
          comuna: finalComuna,
          region: finalRegion,
          latitud: newLat,
          longitud: newLng,
          lugarReferencia: currentReferencia,
        });

        setIsDetectingGps(false);
        setGpsStatusText(`¡Ubicación detectada: ${finalComuna}!`);
        setTimeout(() => setGpsStatusText(null), 4000);
      },
      (err) => {
        setIsDetectingGps(false);
        setGpsStatusText(null);
        console.warn('GPS Error:', err);
        alert(
          'No se pudo obtener la ubicación GPS automática. Por favor activa los permisos de ubicación en tu navegador o selecciona tu comuna en la lista.'
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // URL del visor de Google Maps interactivo embebido
  const queryParam = encodeURIComponent(
    currentDireccion
      ? `${currentDireccion}, ${selectedComuna}, Chile`
      : `${coords.lat},${coords.lng}`
  );
  const mapsEmbedUrl = `https://maps.google.com/maps?q=${queryParam}&t=${mapType}&z=15&ie=UTF8&iwloc=&output=embed`;
  const externalGoogleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    currentDireccion
      ? `${currentDireccion}, ${selectedComuna}, Chile`
      : `${coords.lat},${coords.lng}`
  )}`;

  return (
    <div className="space-y-3.5 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl p-4 transition-colors">
      {/* Título de la Sección y Botón GPS */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center font-bold shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold font-heading text-[#1E1E1E] dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Ubicación Geográfica en Chile</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#FF6A00]/15 text-[#FF6A00] font-bold">
                Google Maps
              </span>
            </h4>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-sans">
              Georreferenciación precisa de la obra para cuadrillas, fletes y clientes
            </p>
          </div>
        </div>

        {/* Botón GPS con Reverse Geocoding Automático */}
        <button
          type="button"
          onClick={handleDetectGPS}
          disabled={isDetectingGps}
          className={`px-3 py-1.5 text-xs font-mono font-bold rounded-xl border transition-all flex items-center gap-1.5 shadow-sm shrink-0 ${
            gpsStatusText?.startsWith('¡')
              ? 'bg-[#6B8F72] text-white border-[#6B8F72] animate-in zoom-in-95'
              : isDetectingGps
              ? 'bg-[#FF6A00]/15 text-[#FF6A00] border-[#FF6A00]'
              : 'bg-white dark:bg-[#141A23] border-[#E5DFC9] dark:border-[#263040] text-gray-700 dark:text-gray-300 hover:text-[#FF6A00] hover:border-[#FF6A00]'
          }`}
          title="Detectar coordenadas y rellenar dirección y comuna automáticamente por GPS"
        >
          {isDetectingGps ? (
            <span className="w-3.5 h-3.5 border-2 border-[#FF6A00] border-t-transparent rounded-full animate-spin"></span>
          ) : gpsStatusText?.startsWith('¡') ? (
            <Check className="w-3.5 h-3.5 text-white" />
          ) : (
            <Crosshair className="w-3.5 h-3.5 text-[#FF6A00]" />
          )}
          <span>
            {gpsStatusText || 'Detectar y Rellenar con GPS'}
          </span>
        </button>
      </div>

      {/* Selectores de Región y Comuna */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[10px] font-mono font-bold text-gray-600 dark:text-gray-400 uppercase mb-1">
            Región de Chile *
          </label>
          <select
            value={selectedRegion}
            onChange={(e) => handleRegionChange(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] transition-colors font-medium"
          >
            {REGIONES_CHILE.map((r) => (
              <option key={r.numero} value={r.nombre}>
                {r.numero} - {r.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-mono font-bold text-gray-600 dark:text-gray-400 uppercase mb-1">
            Comuna *
          </label>
          <select
            value={selectedComuna}
            onChange={(e) => handleComunaChange(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] transition-colors font-semibold"
          >
            {comunasDisponibles.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dirección Exacta y Referencia */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-mono font-bold text-gray-600 dark:text-gray-400 uppercase mb-1">
            Dirección / Calle & Número
          </label>
          <input
            type="text"
            placeholder="Ej: Av. Las Condes 12461, Parcela 14, Camino Los Trapenses..."
            value={currentDireccion}
            onChange={(e) => handleDireccionChange(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] transition-colors font-medium"
          />
        </div>

        <div>
          <label className="block text-[10px] font-mono font-bold text-gray-600 dark:text-gray-400 uppercase mb-1">
            Referencia / Portón
          </label>
          <input
            type="text"
            placeholder="Ej: Portón verde frente al parque"
            value={currentReferencia}
            onChange={(e) => handleReferenciaChange(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] transition-colors"
          />
        </div>
      </div>

      {/* Visor Embebido de Google Maps con Controles */}
      <div className="relative rounded-xl overflow-hidden border border-[#E5DFC9] dark:border-[#263040] bg-gray-100 dark:bg-gray-800 shadow-inner">
        {/* Barra superior del mapa */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-white/90 dark:bg-[#141A23]/90 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-black/10 dark:border-white/10 shadow-sm text-[10px] font-mono">
          <span className="w-2 h-2 rounded-full bg-[#FF6A00] animate-ping"></span>
          <span className="font-bold text-[#1E1E1E] dark:text-white">
            {selectedComuna}, Chile
          </span>
          <span className="text-gray-400">
            ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
          </span>
        </div>

        {/* Toggle Mapa / Satélite */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-white/90 dark:bg-[#141A23]/90 backdrop-blur-sm p-0.5 rounded-lg border border-black/10 dark:border-white/10 shadow-sm">
          <button
            type="button"
            onClick={() => setMapType('m')}
            className={`px-2 py-0.5 text-[10px] font-bold rounded ${
              mapType === 'm'
                ? 'bg-[#1E1E1E] dark:bg-[#FF6A00] text-white'
                : 'text-gray-600 dark:text-gray-300 hover:text-black'
            }`}
          >
            Mapa
          </button>
          <button
            type="button"
            onClick={() => setMapType('k')}
            className={`px-2 py-0.5 text-[10px] font-bold rounded ${
              mapType === 'k'
                ? 'bg-[#1E1E1E] dark:bg-[#FF6A00] text-white'
                : 'text-gray-600 dark:text-gray-300 hover:text-black'
            }`}
          >
            Satélite
          </button>
        </div>

        {/* Iframe interactivo de Google Maps */}
        <iframe
          title="Vista previa de Google Maps"
          width="100%"
          height="200"
          style={{ border: 0, display: 'block' }}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          src={mapsEmbedUrl}
          className="w-full h-44 sm:h-48"
        ></iframe>

        {/* Barra inferior con enlace a Google Maps externo */}
        <div className="p-2 bg-white dark:bg-[#141A23] border-t border-[#E5DFC9] dark:border-[#263040] flex items-center justify-between text-[11px]">
          <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span>Pin centrado en {selectedComuna}</span>
          </span>
          <a
            href={externalGoogleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FF6A00] hover:underline font-bold font-mono inline-flex items-center gap-1"
          >
            <span>Abrir en Google Maps</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
