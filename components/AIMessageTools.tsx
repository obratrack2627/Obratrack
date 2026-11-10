"use client";
import { useEffect, useRef, useState } from "react";
import type { CotizacionEstimacion } from "@/types/database";
import { retryAIWrite, isAIWriteConfirmed } from "@/lib/ai/execute";
import QuoteProjectProposal from "./QuoteProjectProposal";
import CotizacionPdfModal from "./CotizacionPdfModal";
import MaterialPriceComparison from "./MaterialPriceComparison";
import { formatCLP } from "@/lib/utils";
import { profitLabel } from "@/lib/ai/quote-format";
import { aiHeaders } from "@/lib/ai/client";
import { dataService } from "@/lib/data-service";
import Link from 'next/link';

export default function AIMessageTools({
  message, compact = false,
}: {
  compact?: boolean;
  message: {
    cotizacion_generada?: CotizacionEstimacion;
    comparacion_materiales?: import("@/lib/materials/types").ComparacionMateriales;
    pendiente_sincronizacion?: string;
  };
}) {
  const [quote, setQuote] = useState(message.cotizacion_generada);
  const [budgetProject, setBudgetProject] = useState<string | null>(null);
  const saveRevision = useRef(0);
  useEffect(() => {
    const original = message.cotizacion_generada;
    setQuote(original);
    setBudgetProject(null);
    if (!original || !['admin', 'supervisor'].includes(dataService.getActiveUser()?.rol || '')) return;
    let active = true;
    const revision = saveRevision.current;
    void (async () => {
      try {
        const response = await fetch('/api/presupuestos?id=' + encodeURIComponent(original.id) + '&alternativas=1', { headers: await aiHeaders(), cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        const current = body.presupuestos?.find((row: { id: string; cotizacion: CotizacionEstimacion }) => row.id === original.id || row.cotizacion.id === original.id);
        if (active && current && revision === saveRevision.current) { setQuote({ ...current.cotizacion, grupo_presupuesto_id: current.grupo_id || original.grupo_presupuesto_id, alternativas: body.alternativas?.length > 1 ? body.alternativas.filter((r: any) => r.id !== current.id).map((r: any) => ({ ...r.cotizacion, nombre_alternativa: r.nombre_alternativa || r.cotizacion.nombre_alternativa })) : original.alternativas }); setBudgetProject(current.proyecto_id || null); }
      } catch { /* Mantener la copia disponible si falla la lectura. */ }
    })();
    return () => { active = false; };
  }, [message.cotizacion_generada]);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(
      message.pendiente_sincronizacion &&
        isAIWriteConfirmed(message.pendiente_sincronizacion)
        ? "Guardado en Supabase."
        : "",
    );
  const [alternativePreview, setAlternativePreview] = useState<CotizacionEstimacion | null>(null);
  const options = quote?.alternativas?.length ? [quote, ...quote.alternativas] : [];
  return (
    <>
      {message.comparacion_materiales && (
        <MaterialPriceComparison data={message.comparacion_materiales} />
      )}
      {quote && (!compact || options.length > 0) && (
        <section
          aria-label="Resumen del presupuesto"
          className="rounded-xl border border-kraft-200 dark:border-gray-700 p-3 space-y-2"
        >
          <p className="text-xs font-semibold">
            {options.length ? 'Alternativas' : quote.modo_presupuesto === 'precio_acordado' ? 'Presupuesto' : 'Presupuesto estimado'} · {quote.titulo_proyecto}
          </p>
          {options.length > 0 && <div className="space-y-2">{options.map((q, index) => <div key={q.id} className="rounded-lg border p-2 flex flex-wrap justify-between gap-2"><span className="text-sm">{q.nombre_alternativa || `Opción ${index + 1}`} · <strong>{formatCLP(q.estructura_financiera.precio_total_con_iva)}</strong></span><button type="button" className="text-xs text-obra-orange font-bold" onClick={() => setAlternativePreview(q)}>Ver alternativa / PDF</button></div>)}<Link href={(budgetProject ? `/proyectos/${budgetProject}/presupuestos?` : '/proyectos?tab=presupuestos&') + (quote.grupo_presupuesto_id ? 'grupo_id=' + encodeURIComponent(quote.grupo_presupuesto_id) : '')} className="inline-block rounded-lg bg-obra-orange text-white px-3 py-2 text-xs font-bold">Comparar y elegir alternativa</Link></div>}
          {options.length ? <p className="text-xs text-gray-500">Opciones completas; sus importes no se suman.</p> : <p className="text-lg font-bold">
            {formatCLP(
              quote.estructura_financiera
                .precio_total_con_iva,
            )}{" "}
            <span className="text-xs font-normal">IVA incluido</span>
          </p>}
          {!options.length && <details className="text-xs">
            <summary className="cursor-pointer">Ver desglose</summary>
            <dl className="mt-2 space-y-1">
              {(quote.modo_presupuesto === 'precio_acordado' ? (quote.partidas_venta || []).map((p) => [p.nombre, p.subtotal]) : [
                [
                  "Materiales",
                  quote.estructura_financiera
                    .costo_materiales_total,
                ],
                [
                  "Mano de obra",
                  quote.estructura_financiera
                    .costo_mano_obra_total,
                ],
                [
                  "Gastos generales",
                  quote.estructura_financiera
                    .gastos_generales_monto,
                ],
                [
                  "Imprevistos",
                  quote.estructura_financiera
                    .imprevistos_monto,
                ],
                [
                  profitLabel(quote),
                  quote.estructura_financiera
                    .margen_utilidad_monto,
                ],
                [
                  "IVA (19%)",
                  quote.estructura_financiera.iva_19,
                ],
              ]).map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-3">
                  <dt>{label}</dt>
                  <dd>{formatCLP(Number(value))}</dd>
                </div>
              ))}
            </dl>
          </details>}
        </section>
      )}
      {quote && (
        <button
          type="button"
          className="mt-2 px-3 py-2 bg-[#FF6A00] text-white rounded-lg text-xs font-bold"
          onClick={() => setOpen(true)}
        >
          Ver cotización / PDF
        </button>
      )}
      {quote && !compact && !options.length && <QuoteProjectProposal key={quote.id} quote={quote} projectId={budgetProject} />}
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
      {(quote || alternativePreview) && (
        <CotizacionPdfModal
          isOpen={open || !!alternativePreview}
          onClose={() => { setOpen(false); setAlternativePreview(null); }}
          cotizacion={alternativePreview || quote || null}
          onSaved={(row) => { saveRevision.current += 1; if (alternativePreview && alternativePreview.id !== quote?.id) { setAlternativePreview(row.cotizacion); setQuote((q) => q ? { ...q, alternativas: q.alternativas?.map((a) => a.id === row.cotizacion.id ? row.cotizacion : a) } : q); } else setQuote((q) => ({ ...row.cotizacion, alternativas: q?.alternativas, grupo_presupuesto_id: q?.grupo_presupuesto_id })); setBudgetProject(row.proyecto_id); }}
        />
      )}
    </>
  );
}
