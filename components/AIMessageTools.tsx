"use client";
import { useEffect, useRef, useState } from "react";
import type { CotizacionEstimacion } from "@/types/database";
import { retryAIWrite, isAIWriteConfirmed } from "@/lib/ai/execute";
import QuoteProjectProposal from "./QuoteProjectProposal";
import CotizacionPdfModal from "./CotizacionPdfModal";
import MaterialPriceComparison from "./MaterialPriceComparison";
import { formatCLP } from "@/lib/utils";
import { profitLabel } from "@/lib/ai/quote-format";
import { resolveSaleLineKind } from "@/lib/quotes/classify";
import { aiHeaders } from "@/lib/ai/client";
import { dataService } from "@/lib/data-service";
import Link from 'next/link';
import { FileText, MapPin, Clock, Maximize2, Layers, Hammer, ChevronDown } from "lucide-react";

export default function AIMessageTools({
  message, compact = false,
}: {
  compact?: boolean;
  message: {
    cotizacion_generada?: CotizacionEstimacion;
    comparacion_materiales?: import("@/lib/materials/types").ComparacionMateriales;
    comparaciones_materiales?: import("@/lib/materials/types").ComparacionMateriales[];
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
      {message.comparaciones_materiales && message.comparaciones_materiales.length > 0 ? (
        <div className="space-y-2.5">
          {message.comparaciones_materiales.map((comp, idx) => (
            <MaterialPriceComparison key={idx} data={comp} />
          ))}
        </div>
      ) : (
        message.comparacion_materiales && <MaterialPriceComparison data={message.comparacion_materiales} />
      )}
      {quote && (!compact || options.length > 0) && (
        <section
          aria-label="Resumen del presupuesto"
          className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-gradient-to-b from-white to-kraft-50/70 dark:from-[#141A23] dark:to-[#0F141C] overflow-hidden shadow-xs"
        >
          {/* Encabezado */}
          <div className="px-3.5 py-2.5 bg-navy-900 dark:bg-[#1A2230] text-white flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#FF6A00] text-white font-mono font-bold text-[9px] uppercase tracking-wider">
                  {options.length ? 'Alternativas' : quote.modo_presupuesto === 'precio_acordado' ? 'Precio acordado' : 'Cotización estimada'}
                </span>
                {quote.tipo_obra && (
                  <span className="text-[10px] text-gray-300 truncate">{quote.tipo_obra}</span>
                )}
              </div>
              <h4 className="font-heading font-bold text-xs sm:text-sm text-white truncate">
                {quote.titulo_proyecto}
              </h4>
            </div>
            {!options.length && (
              <div className="text-right shrink-0">
                <span className="block text-[9px] uppercase tracking-wider text-gray-300">Total IVA inc.</span>
                <span className="font-mono font-extrabold text-sm sm:text-base text-[#FF9248]">
                  {formatCLP(quote.estructura_financiera.precio_total_con_iva)}
                </span>
              </div>
            )}
          </div>

          <div className="p-3.5 space-y-3 text-xs">
            {/* Chips de contexto */}
            {(quote.comuna_region || quote.metros_cuadrados || quote.duracion_dias_estimada) && (
              <div className="flex flex-wrap gap-1.5 text-[10px] font-medium text-gray-600 dark:text-gray-300">
                {quote.comuna_region && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-[#1A2230] border border-kraft-200 dark:border-[#263040]">
                    <MapPin className="w-3 h-3 text-[#FF6A00]" />
                    {quote.comuna_region}
                  </span>
                )}
                {quote.metros_cuadrados ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-[#1A2230] border border-kraft-200 dark:border-[#263040]">
                    <Maximize2 className="w-3 h-3 text-[#FF6A00]" />
                    {quote.metros_cuadrados.toLocaleString('es-CL')} m²
                  </span>
                ) : null}
                {quote.duracion_dias_estimada ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-[#1A2230] border border-kraft-200 dark:border-[#263040]">
                    <Clock className="w-3 h-3 text-[#FF6A00]" />
                    {quote.duracion_dias_estimada} día{quote.duracion_dias_estimada === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
            )}

            {/* Resumen ejecutivo (único, sin duplicar) */}
            {!options.length && quote.resumen_ejecutivo && (
              <p className="text-[11px] leading-relaxed text-gray-700 dark:text-gray-200 bg-white/80 dark:bg-[#1A2230]/60 rounded-xl px-3 py-2 border border-kraft-200/70 dark:border-[#263040]">
                {quote.resumen_ejecutivo}
              </p>
            )}

            {/* Alternativas */}
            {options.length > 0 && (
              <div className="space-y-2">
                {options.map((q, index) => {
                  const baseTotal = options[0].estructura_financiera.precio_total_con_iva;
                  const diff = q.estructura_financiera.precio_total_con_iva - baseTotal;
                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-2.5 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-navy-900 dark:text-white">
                            {index + 1}. {q.nombre_alternativa || `Opción ${index + 1}`}
                          </span>
                          {index > 0 && diff !== 0 && (
                            <span className="ml-2 text-[10px] font-mono text-gray-500 dark:text-gray-400">
                              ({diff > 0 ? '+' : '−'}{formatCLP(Math.abs(diff))})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <strong className="font-mono text-xs text-navy-900 dark:text-white">
                            {formatCLP(q.estructura_financiera.precio_total_con_iva)}
                          </strong>
                          <button
                            type="button"
                            className="text-[11px] text-obra-orange hover:underline font-bold"
                            onClick={() => setAlternativePreview(q)}
                          >
                            Ver / PDF
                          </button>
                        </div>
                      </div>
                      {q.resumen_ejecutivo && (
                        <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
                          {q.resumen_ejecutivo}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                        <span>Neto: {formatCLP(q.estructura_financiera.precio_sugerido_neto)}</span>
                        <span>· IVA: {formatCLP(q.estructura_financiera.iva_19)}</span>
                        {q.materiales.length > 0 && <span>· {q.materiales.length} materiales</span>}
                      </div>
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                    Opciones completas; sus importes no se suman.
                  </p>
                  <Link
                    href={(budgetProject ? `/proyectos/${budgetProject}/presupuestos?` : '/proyectos?tab=presupuestos&') + (quote.grupo_presupuesto_id ? 'grupo_id=' + encodeURIComponent(quote.grupo_presupuesto_id) : '')}
                    className="inline-block rounded-xl bg-obra-orange hover:bg-orange-600 text-white px-3 py-1.5 text-[11px] font-bold transition-colors"
                  >
                    Comparar y elegir alternativa
                  </Link>
                </div>
              </div>
            )}

            {/* Desglose financiero + detalle de partidas para cotización única */}
            {!options.length && (
              <>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded-xl bg-white dark:bg-[#1A2230] border border-kraft-200/80 dark:border-[#263040] px-2 py-1.5">
                    <span className="block text-[9px] uppercase text-gray-500 dark:text-gray-400">Neto</span>
                    <strong className="font-mono text-[11px] text-navy-900 dark:text-gray-100">
                      {formatCLP(quote.estructura_financiera.precio_sugerido_neto)}
                    </strong>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-[#1A2230] border border-kraft-200/80 dark:border-[#263040] px-2 py-1.5">
                    <span className="block text-[9px] uppercase text-gray-500 dark:text-gray-400">IVA (19%)</span>
                    <strong className="font-mono text-[11px] text-navy-900 dark:text-gray-100">
                      {formatCLP(quote.estructura_financiera.iva_19)}
                    </strong>
                  </div>
                  <div className="rounded-xl bg-[#FF6A00]/10 dark:bg-[#FF6A00]/20 border border-[#FF6A00]/30 px-2 py-1.5">
                    <span className="block text-[9px] uppercase font-bold text-[#D95700] dark:text-[#FFA04D]">Total</span>
                    <strong className="font-mono text-[11px] font-extrabold text-[#D95700] dark:text-[#FFA04D]">
                      {formatCLP(quote.estructura_financiera.precio_total_con_iva)}
                    </strong>
                  </div>
                </div>

                <details className="group rounded-xl border border-kraft-200/80 dark:border-[#263040] bg-white dark:bg-[#141A23] px-3 py-2 text-[11px]" open>
                  <summary className="cursor-pointer font-semibold text-navy-900 dark:text-gray-100 flex items-center justify-between list-none">
                    <span>Desglose financiero</span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-180" />
                  </summary>
                  {(() => {
                    if (quote.modo_presupuesto === 'precio_acordado') {
                      const sale = quote.partidas_venta || [];
                      const partRows = sale.filter((p) => resolveSaleLineKind(p) !== 'material');
                      const matRows = sale.filter((p) => resolveSaleLineKind(p) === 'material');
                      if (partRows.length > 0 && matRows.length > 0) {
                        return (
                          <div className="mt-2 pt-2 border-t border-kraft-100 dark:border-[#263040] space-y-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF6A00] mb-1">1. Partidas / Trabajos</p>
                              <dl className="space-y-1">
                                {partRows.map((p, i) => (
                                  <div key={`p-${i}-${p.nombre}`} className="flex justify-between gap-3 text-gray-700 dark:text-gray-300">
                                    <dt className="truncate">{p.nombre}</dt>
                                    <dd className="font-mono font-semibold shrink-0">{formatCLP(p.subtotal)}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF6A00] mb-1">2. Materiales</p>
                              <dl className="space-y-1">
                                {matRows.map((p, i) => (
                                  <div key={`m-${i}-${p.nombre}`} className="flex justify-between gap-3 text-gray-700 dark:text-gray-300">
                                    <dt className="truncate">{p.nombre}</dt>
                                    <dd className="font-mono font-semibold shrink-0">{formatCLP(p.subtotal)}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          </div>
                        );
                      }
                    }
                    const flatRows =
                      quote.modo_presupuesto === 'precio_acordado'
                        ? (quote.partidas_venta || []).map((p) => [p.nombre, p.subtotal])
                        : [
                            ["Materiales", quote.estructura_financiera.costo_materiales_total],
                            ["Mano de obra", quote.estructura_financiera.costo_mano_obra_total],
                            ["Gastos generales", quote.estructura_financiera.gastos_generales_monto],
                            ["Imprevistos", quote.estructura_financiera.imprevistos_monto],
                            [profitLabel(quote), quote.estructura_financiera.margen_utilidad_monto],
                          ];
                    return (
                      <dl className="mt-2 pt-2 border-t border-kraft-100 dark:border-[#263040] space-y-1">
                        {flatRows.map(([label, value], i) => (
                          <div key={`${i}-${String(label)}`} className="flex justify-between gap-3 text-gray-700 dark:text-gray-300">
                            <dt className="truncate">{label}</dt>
                            <dd className="font-mono font-semibold shrink-0">{formatCLP(Number(value))}</dd>
                          </div>
                        ))}
                      </dl>
                    );
                  })()}
                </details>

                {quote.modo_presupuesto !== 'precio_acordado' && quote.actividades_gantt.length > 0 && (
                  <details className="group rounded-xl border border-kraft-200/80 dark:border-[#263040] bg-white dark:bg-[#141A23] px-3 py-2 text-[11px]">
                    <summary className="cursor-pointer font-semibold text-navy-900 dark:text-gray-100 flex items-center justify-between list-none">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#FF6A00]" />
                        Partidas / Trabajos incluidos ({quote.actividades_gantt.length})
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="mt-2 pt-2 border-t border-kraft-100 dark:border-[#263040] space-y-1.5">
                      {quote.actividades_gantt.map((a, i) => (
                        <li key={`${a.nombre}-${i}`} className="flex items-center justify-between gap-2 text-gray-700 dark:text-gray-300">
                          <span className="font-medium text-navy-900 dark:text-gray-100">{a.nombre}</span>
                          <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
                            {a.dias} día{a.dias === 1 ? '' : 's'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {quote.materiales.length > 0 && (
                  <details className="group rounded-xl border border-kraft-200/80 dark:border-[#263040] bg-white dark:bg-[#141A23] px-3 py-2 text-[11px]">
                    <summary className="cursor-pointer font-semibold text-navy-900 dark:text-gray-100 flex items-center justify-between list-none">
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-[#FF6A00]" />
                        Materiales cotizados ({quote.materiales.length})
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="mt-2 pt-2 border-t border-kraft-100 dark:border-[#263040] space-y-1.5">
                      {quote.materiales.map((m, i) => (
                        <li key={`${m.nombre}-${i}`} className="flex items-start justify-between gap-2 text-gray-700 dark:text-gray-300">
                          <span className="min-w-0">
                            <span className="font-medium text-navy-900 dark:text-gray-100">{m.nombre}</span>
                            <span className="block text-[10px] text-gray-500 dark:text-gray-400">
                              {m.cantidad.toLocaleString('es-CL')} {m.unidad} × {formatCLP(m.precio_unitario_estimado)}
                            </span>
                          </span>
                          <span className="font-mono font-semibold shrink-0">{formatCLP(m.subtotal)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {quote.mano_de_obra.length > 0 && (
                  <details className="group rounded-xl border border-kraft-200/80 dark:border-[#263040] bg-white dark:bg-[#141A23] px-3 py-2 text-[11px]">
                    <summary className="cursor-pointer font-semibold text-navy-900 dark:text-gray-100 flex items-center justify-between list-none">
                      <span className="inline-flex items-center gap-1.5">
                        <Hammer className="w-3.5 h-3.5 text-[#FF6A00]" />
                        Mano de obra ({quote.mano_de_obra.length})
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="mt-2 pt-2 border-t border-kraft-100 dark:border-[#263040] space-y-1.5">
                      {quote.mano_de_obra.map((m, i) => (
                        <li key={`${m.rol}-${i}`} className="flex items-start justify-between gap-2 text-gray-700 dark:text-gray-300">
                          <span className="min-w-0">
                            <span className="font-medium text-navy-900 dark:text-gray-100">{m.rol}</span>
                            <span className="block text-[10px] text-gray-500 dark:text-gray-400">
                              {m.cantidad_personas} pers. × {m.dias_estimados} día{m.dias_estimados === 1 ? '' : 's'}
                            </span>
                          </span>
                          <span className="font-mono font-semibold shrink-0">{formatCLP(m.subtotal)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {quote.hitos_pago && quote.hitos_pago.length > 0 && (
                  <div className="rounded-xl border border-kraft-200/80 dark:border-[#263040] bg-white dark:bg-[#141A23] px-3 py-2 text-[11px] space-y-1">
                    <span className="font-semibold text-navy-900 dark:text-gray-100 block">Plan de cobro</span>
                    {quote.hitos_pago.map((h, i) => (
                      <div key={`${h.nombre}-${i}`} className="flex justify-between gap-2 text-gray-600 dark:text-gray-300">
                        <span>{h.nombre} ({h.porcentaje}%)</span>
                        <span className="font-mono font-semibold">{formatCLP(h.monto)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {quote.modo_presupuesto === 'precio_acordado'
                    ? 'Precios acordados según partidas indicadas.'
                    : 'Precios referenciales estimados; confirmar disponibilidad antes de contratar.'}
                </p>
              </>
            )}
          </div>
        </section>
      )}
      {quote && (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FF6A00] hover:bg-[#E55F00] text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          onClick={() => setOpen(true)}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Ver cotización / PDF</span>
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
