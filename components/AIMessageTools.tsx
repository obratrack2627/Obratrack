"use client";
import { useState } from "react";
import type { CotizacionEstimacion } from "@/types/database";
import { retryAIWrite, isAIWriteConfirmed } from "@/lib/ai/execute";
import CotizacionPdfModal from "./CotizacionPdfModal";
import MaterialPriceComparison from "./MaterialPriceComparison";
import { formatCLP } from "@/lib/utils";
import { profitLabel } from "@/lib/ai/quote-format";

export default function AIMessageTools({
  message,
}: {
  message: {
    cotizacion_generada?: CotizacionEstimacion;
    comparacion_materiales?: import("@/lib/materials/types").ComparacionMateriales;
    pendiente_sincronizacion?: string;
  };
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(
      message.pendiente_sincronizacion &&
        isAIWriteConfirmed(message.pendiente_sincronizacion)
        ? "Guardado en Supabase."
        : "",
    );
  return (
    <>
      {message.comparacion_materiales && (
        <MaterialPriceComparison data={message.comparacion_materiales} />
      )}
      {message.cotizacion_generada && (
        <section
          aria-label="Resumen del presupuesto"
          className="rounded-xl border border-kraft-200 dark:border-gray-700 p-3 space-y-2"
        >
          <p className="text-xs font-semibold">
            Presupuesto estimado · {message.cotizacion_generada.titulo_proyecto}
          </p>
          <p className="text-lg font-bold">
            {formatCLP(
              message.cotizacion_generada.estructura_financiera
                .precio_total_con_iva,
            )}{" "}
            <span className="text-xs font-normal">IVA incluido</span>
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer">Ver desglose</summary>
            <dl className="mt-2 space-y-1">
              {[
                [
                  "Materiales",
                  message.cotizacion_generada.estructura_financiera
                    .costo_materiales_total,
                ],
                [
                  "Mano de obra",
                  message.cotizacion_generada.estructura_financiera
                    .costo_mano_obra_total,
                ],
                [
                  "Gastos generales",
                  message.cotizacion_generada.estructura_financiera
                    .gastos_generales_monto,
                ],
                [
                  "Imprevistos",
                  message.cotizacion_generada.estructura_financiera
                    .imprevistos_monto,
                ],
                [
                  profitLabel(message.cotizacion_generada),
                  message.cotizacion_generada.estructura_financiera
                    .margen_utilidad_monto,
                ],
                [
                  "IVA (19%)",
                  message.cotizacion_generada.estructura_financiera.iva_19,
                ],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-3">
                  <dt>{label}</dt>
                  <dd>{formatCLP(Number(value))}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      )}
      {message.cotizacion_generada && (
        <button
          type="button"
          className="mt-2 px-3 py-2 bg-[#FF6A00] text-white rounded-lg text-xs font-bold"
          onClick={() => setOpen(true)}
        >
          Ver cotización / PDF
        </button>
      )}
      {message.pendiente_sincronizacion && !status.startsWith("Guardado") && (
        <button
          type="button"
          disabled={busy}
          className="mt-2 px-3 py-2 border border-orange-400 rounded-lg text-xs font-bold"
          onClick={async () => {
            setBusy(true);
            try {
              await retryAIWrite(message.pendiente_sincronizacion!);
              setStatus("Guardado en Supabase.");
            } catch (error) {
              setStatus((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Guardando…" : "Reintentar guardado"}
        </button>
      )}
      {status && (
        <p role="status" className="text-xs mt-2">
          {status}
        </p>
      )}
      {message.cotizacion_generada && (
        <CotizacionPdfModal
          isOpen={open}
          onClose={() => setOpen(false)}
          cotizacion={message.cotizacion_generada}
          clienteNombre={message.cotizacion_generada.cliente_nombre}
          clienteTelefono={message.cotizacion_generada.cliente_telefono}
        />
      )}
    </>
  );
}
