"use client";

import type { ComparacionMateriales } from "@/lib/materials/types";
import { isMaterialComparison, safeOfferURL } from "@/lib/materials/types";
import { formatCLP } from "@/lib/utils";

export default function MaterialPriceComparison({
  data,
}: {
  data: ComparacionMateriales;
}) {
  if (!isMaterialComparison(data)) return null;
  return (
    <section
      aria-label="Precios publicados de materiales"
      className="space-y-3"
    >
      <p className="text-xs text-gray-500">
        Consultado{" "}
        {new Intl.DateTimeFormat("es-CL", {
          timeZone: "America/Santiago",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(data.consultado_en))}
      </p>
      <div className="space-y-2">
        {data.ofertas.map((offer) => (
          <article
            key={offer.id}
            className="rounded-xl border border-kraft-200 dark:border-gray-700 p-3 space-y-1"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-sm">{offer.nombre}</p>
              <p className="font-bold text-sm whitespace-nowrap">
                {formatCLP(offer.precio)}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <a
                href={safeOfferURL(offer.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-obra-orange underline"
              >
                Ver en {offer.tienda}
              </a>
              <span>
                {offer.unidad === "un" && offer.multiplicador === 1
                  ? "Por unidad de venta"
                  : `Presentación: ${offer.multiplicador} ${offer.unidad}`}
              </span>
            </div>
            {offer.vendedor && (
              <p className="text-xs text-gray-500">
                Vendedor: {offer.vendedor}
              </p>
            )}
            {offer.total_solicitado != null && (
              <p className="text-xs">
                {data.consulta.cantidad} {data.consulta.unidad_cantidad || 'unidades'}:{" "}
                <strong>{formatCLP(offer.total_solicitado)}</strong>
              </p>
            )}
            {data.mejores_ids.includes(offer.id) && (
              <p className="text-xs font-semibold text-green-700 dark:text-green-300">
                Menor precio del mismo producto entre las tiendas consultadas
              </p>
            )}
          </article>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Confirma IVA, promociones, stock local y despacho
        {data.consulta.ubicacion ? " para " + data.consulta.ubicacion : ""}{" "}
        antes de comprar.
      </p>
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer">Tiendas consultadas</summary>
        <ul className="mt-2 space-y-1">
          {data.proveedores.map((p, i) => (
            <li key={`${p.nombre}-${i}`}>
              {p.nombre}:{" "}
              {p.estado === "consultado"
                ? "catálogo consultado"
                : p.estado === "sin_resultados"
                  ? "sin coincidencias disponibles"
                  : "no disponible en esta consulta"}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
