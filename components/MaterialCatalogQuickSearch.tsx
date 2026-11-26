'use client';

import React, { useState } from 'react';
import { ExternalLink, History, Loader2, MapPin, MessageCircle, Search } from 'lucide-react';
import { aiHeaders } from '@/lib/ai/client';
import { formatCLP } from '@/lib/utils';
import type {
  FerreteriaCercana,
  OfertaMaterial,
  PrecioHistoricoMaterial,
} from '@/lib/materials/types';

interface MaterialCatalogQuickSearchProps {
  query: string;
  cantidad: number;
  unidad: string;
  proyectoId?: string;
  ubicacion?: string;
  latitud?: number;
  longitud?: number;
  onSelect: (selection: {
    nombre: string;
    precioUnitario: number;
    proveedor: string;
    categoria?: string;
  }) => void;
}

export default function MaterialCatalogQuickSearch({
  query,
  cantidad,
  unidad,
  proyectoId,
  ubicacion,
  latitud,
  longitud,
  onSelect,
}: MaterialCatalogQuickSearchProps) {
  const [loading, setLoading] = useState(false);
  const [liveOffers, setLiveOffers] = useState<OfertaMaterial[]>([]);
  const [nearbyStores, setNearbyStores] = useState<FerreteriaCercana[]>([]);
  const [historyPrices, setHistoryPrices] = useState<PrecioHistoricoMaterial[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');

  const trimmed = query.trim();

  const handleSearchLive = async () => {
    if (!trimmed || loading) return;
    setLoading(true);
    setStatusMessage(null);
    setLiveOffers([]);
    setNearbyStores([]);
    setHistoryPrices([]);
    setLastSearchedQuery(trimmed);

    try {
      const res = await fetch('/api/materiales/comparar', {
        method: 'POST',
        headers: await aiHeaders(),
        body: JSON.stringify({
          producto: trimmed,
          cantidad: Math.max(1, Number(cantidad) || 1),
          unidad_cantidad: unidad,
          ...(proyectoId ? { proyecto_id: proyectoId } : {}),
          ...(ubicacion ? { ubicacion } : {}),
          ...(typeof latitud === 'number' && typeof longitud === 'number'
            ? { latitud, longitud }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatusMessage(json.error || 'No fue posible consultar catálogos en línea.');
        return;
      }
      const comp = json.comparacion;
      const ofertas: OfertaMaterial[] = comp?.ofertas || [];
      const nearby: FerreteriaCercana[] = comp?.ferreterias_cercanas || [];
      const history: PrecioHistoricoMaterial[] = comp?.historial_empresa || [];
      setLiveOffers(ofertas.slice(0, 5));
      setNearbyStores(nearby.slice(0, 4));
      setHistoryPrices(history.slice(0, 3));
      if (ofertas.length === 0 && nearby.length === 0 && history.length === 0) {
        setStatusMessage(
          comp?.resumen || 'Sin coincidencias exactas en tiendas en línea.'
        );
      }
    } catch {
      setStatusMessage('No se pudo consultar a las tiendas. Reintenta la búsqueda.');
    } finally {
      setLoading(false);
    }
  };

  const hasCurrentSearch = lastSearchedQuery === trimmed;
  const showLiveResults = liveOffers.length > 0 && hasCurrentSearch;
  const showHistoryResults = historyPrices.length > 0 && hasCurrentSearch;
  const showNearbyResults = nearbyStores.length > 0 && hasCurrentSearch;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          Autocompletar con precios de ferreterías en Chile:
        </span>
        <button
          type="button"
          disabled={!trimmed || loading}
          onClick={() => void handleSearchLive()}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-navy-900 dark:bg-[#263040] hover:bg-obra-orange text-white text-[11px] font-semibold disabled:opacity-40 transition-colors"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Search className="w-3 h-3" />
          )}
          <span>{loading ? 'Consultando…' : 'Comparar ferreterías'}</span>
        </button>
      </div>

      {statusMessage && hasCurrentSearch && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{statusMessage}</p>
      )}

      {showHistoryResults && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 p-2 space-y-1.5">
          <p className="flex items-center gap-1 text-[10px] font-mono uppercase font-bold text-amber-800 dark:text-amber-300">
            <History className="w-3 h-3" />
            <span>Tus compras anteriores en ObraTrack:</span>
          </p>
          {historyPrices.map((h, i) => (
            <div
              key={`${h.proveedor}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <p className="font-semibold truncate text-navy-900 dark:text-white">{h.nombre}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {h.proveedor} · {h.proyecto_nombre}
                  {h.dias_desde_compra != null ? ` · hace ${h.dias_desde_compra} d` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelect({
                    nombre: h.nombre,
                    precioUnitario: h.precio_unitario,
                    proveedor: h.proveedor,
                  });
                  setLiveOffers([]);
                  setHistoryPrices([]);
                }}
                className="px-2 py-1 rounded-md bg-amber-600 text-white font-mono font-bold text-[11px] hover:bg-amber-700 shrink-0"
              >
                Usar {formatCLP(h.precio_unitario)}
              </button>
            </div>
          ))}
        </div>
      )}

      {showLiveResults && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-2 space-y-1.5 max-h-44 overflow-y-auto">
          <p className="text-[10px] font-mono uppercase font-bold text-emerald-800 dark:text-emerald-300">
            Precios publicados en línea:
          </p>
          {liveOffers.map((of) => (
            <div
              key={of.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <p className="font-semibold truncate text-navy-900 dark:text-white">
                  {of.nombre}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {of.tienda}
                  {of.sucursal_cercana_km != null
                    ? ` (a ${of.sucursal_cercana_km.toLocaleString('es-CL')} km)`
                    : ''}
                  {of.marca ? ` · ${of.marca}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onSelect({
                      nombre: of.nombre,
                      precioUnitario: of.precio,
                      proveedor: of.tienda,
                    });
                    setLiveOffers([]);
                  }}
                  className="px-2 py-1 rounded-md bg-obra-orange text-white font-mono font-bold text-[11px] hover:bg-obra-orange-hover"
                >
                  Usar {formatCLP(of.precio)}
                </button>
                <a
                  href={of.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver producto en tienda"
                  className="p-1 text-gray-400 hover:text-obra-orange"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNearbyResults && (
        <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50/70 dark:bg-[#141A23] p-2 space-y-1">
          <p className="flex items-center gap-1 text-[10px] font-mono uppercase font-bold text-gray-600 dark:text-gray-300">
            <MapPin className="w-3 h-3 text-obra-orange" />
            <span>Ferreterías cercanas a la obra:</span>
          </p>
          {nearbyStores.map((f, idx) => (
            <div key={`${f.nombre}-${idx}`} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-navy-900 dark:text-gray-200">
                {f.nombre} · {f.distancia_km.toLocaleString('es-CL')} km
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <a
                  href={f.url_mapa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-obra-orange underline"
                >
                  Mapa
                </a>
                {f.url_whatsapp && (
                  <a
                    href={f.url_whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-300 font-semibold"
                  >
                    <MessageCircle className="w-3 h-3" />
                    <span>WA</span>
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
