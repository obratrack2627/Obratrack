'use client';

import React, { useState } from 'react';
import { ExternalLink, Loader2, Search } from 'lucide-react';
import { aiHeaders } from '@/lib/ai/client';
import { formatCLP } from '@/lib/utils';
import type { OfertaMaterial } from '@/lib/materials/types';

interface MaterialCatalogQuickSearchProps {
  query: string;
  cantidad: number;
  unidad: string;
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
  onSelect,
}: MaterialCatalogQuickSearchProps) {
  const [loading, setLoading] = useState(false);
  const [liveOffers, setLiveOffers] = useState<OfertaMaterial[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');

  const trimmed = query.trim();

  const handleSearchLive = async () => {
    if (!trimmed || loading) return;
    setLoading(true);
    setStatusMessage(null);
    setLiveOffers([]);
    setLastSearchedQuery(trimmed);

    try {
      const res = await fetch('/api/materiales/comparar', {
        method: 'POST',
        headers: await aiHeaders(),
        body: JSON.stringify({
          producto: trimmed,
          cantidad: Math.max(1, Number(cantidad) || 1),
          unidad_cantidad: unidad,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatusMessage(json.error || 'No fue posible consultar catálogos en línea.');
        return;
      }
      const ofertas: OfertaMaterial[] = json.comparacion?.ofertas || [];
      setLiveOffers(ofertas.slice(0, 5));
      if (ofertas.length === 0) {
        setStatusMessage(
          json.comparacion?.resumen || 'Sin coincidencias exactas en tiendas en línea.'
        );
      }
    } catch {
      setStatusMessage('No se pudo consultar a las tiendas. Reintenta la búsqueda.');
    } finally {
      setLoading(false);
    }
  };

  const showLiveResults = liveOffers.length > 0 && lastSearchedQuery === trimmed;

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

      {statusMessage && lastSearchedQuery === trimmed && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{statusMessage}</p>
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
    </div>
  );
}
