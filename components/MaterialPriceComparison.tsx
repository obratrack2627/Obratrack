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
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={safeOfferURL(offer.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-obra-orange underline"
                >
                  Ver en {offer.tienda}
                </a>
                {offer.sucursal_cercana_km != null && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium text-[11px]">
                    Sucursal a {offer.sucursal_cercana_km.toLocaleString("es-CL")} km
                  </span>
                )}
              </div>
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
            {offer.cajas_necesarias != null &&
            offer.rendimiento_m2 != null &&
            offer.total_solicitado != null ? (
              <p className="text-xs">
                {offer.cajas_necesarias} {offer.cajas_necesarias === 1 ? "caja" : "cajas"} de{" "}
                {offer.rendimiento_m2.toLocaleString("es-CL")} m²
                {offer.precio_m2 != null ? ` (${formatCLP(offer.precio_m2)}/m²)` : ""}:{" "}
                <strong>{formatCLP(offer.total_solicitado)}</strong>
              </p>
            ) : (
              offer.total_solicitado != null && (
                <p className="text-xs">
                  {data.consulta.cantidad} {data.consulta.unidad_cantidad || "unidades"}:{" "}
                  <strong>{formatCLP(offer.total_solicitado)}</strong>
                </p>
              )
            )}
            {data.mejores_ids.includes(offer.id) && (
              <p className="text-xs font-semibold text-green-700 dark:text-green-300">
                Menor precio del mismo producto entre las tiendas consultadas
              </p>
            )}
          </article>
        ))}
      </div>
      {data.historial_empresa && data.historial_empresa.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            Tus compras anteriores en ObraTrack
          </p>
          <ul className="space-y-1 text-xs">
            {data.historial_empresa.map((h, i) => (
              <li key={`${h.proveedor}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{h.proveedor}</strong> · {h.nombre} ({h.proyecto_nombre}
                  {h.comuna ? `, ${h.comuna}` : ""}
                  {h.dias_desde_compra != null ? `, hace ${h.dias_desde_compra} d` : ""})
                </span>
                <span className="font-mono font-bold">
                  {formatCLP(h.precio_unitario)} / {h.unidad}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.ferreterias_cercanas && data.ferreterias_cercanas.length > 0 && (
        <div className="rounded-xl border border-kraft-200 dark:border-gray-700 bg-kraft-50/60 dark:bg-[#141A23] p-3 space-y-2">
          <p className="text-xs font-semibold text-navy-900 dark:text-white">
            Ferreterías cercanas a la obra
          </p>
          <ul className="space-y-1.5 text-xs">
            {data.ferreterias_cercanas.map((f, i) => (
              <li key={`${f.nombre}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-navy-900 dark:text-gray-100">{f.nombre}</span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-white dark:bg-[#1E2633] border border-kraft-200 dark:border-[#263040] text-[10px]">
                    {f.tipo === "cadena" ? "Cadena" : "Local"} · {f.distancia_km.toLocaleString("es-CL")} km
                  </span>
                  {f.direccion && (
                    <span className="block text-[11px] text-gray-500 truncate">{f.direccion}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={f.url_mapa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-obra-orange underline text-[11px]"
                  >
                    Mapa
                  </a>
                  {f.url_whatsapp && (
                    <a
                      href={f.url_whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold text-[11px] hover:bg-emerald-700"
                    >
                      WhatsApp
                    </a>
                  )}
                  {f.url_busqueda && (
                    <a
                      href={f.url_busqueda}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-600 dark:text-gray-300 underline text-[11px]"
                    >
                      Catálogo
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
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
