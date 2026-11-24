'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Edit3,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { ObraBotQuoteDestination } from './ObraBotQuoteDestination';
import { quoteLinePreview, saleLines } from '@/lib/quotes/document';
import { aiHeaders } from '@/lib/ai/client';
import type { QuoteReview, QuoteReply } from '@/lib/obrabot/quotes';

const endpoint = '/api/obrabot/cotizaciones';
const money = (amount: number) => `$${amount.toLocaleString('es-CL')}`;
const editorText = (row: QuoteReview) =>
  (row.borrador.partidas_venta || [])
    .map((line) =>
      [
        line.nombre,
        line.unidad,
        String(line.cantidad).replace('.', ','),
        line.precio_partida == null ? line.precio_unitario : `total ${line.precio_partida}`,
      ].join(' | '),
    )
    .join('\n');

export function ObraBotQuoteReviews() {
  const [rows, setRows] = useState<QuoteReview[]>([]);
  const [approved, setApproved] = useState<QuoteReview[]>([]);
  const [canLink, setCanLink] = useState(false);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState('');
  const [ivaMode, setIvaMode] = useState<'incluido' | 'neto'>('incluido');
  const [file, setFile] = useState<File | null>(null);
  const [edit, setEdit] = useState<QuoteReview | null>(null);
  const [revisionItems, setRevisionItems] = useState('');
  const [note, setNote] = useState('');
  const [response, setResponse] = useState<QuoteReply | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submission = useRef<{ message: string; file?: File | null; iva?: 'incluido' | 'neto'; id: string } | null>(null);

  async function load() {
    const res = await fetch(endpoint, { headers: await aiHeaders(), cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setRows(data.solicitudes || []);
    setApproved(data.aprobadas || []);
    setCanLink(Boolean(data.permiteVincular));
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(message: string, source?: File | null, iva?: 'incluido' | 'neto') {
    const headers = await aiHeaders();
    const form = new FormData();
    form.set('mensaje', message);
    if (iva) form.set('tratamiento_iva', iva);
    if (submission.current?.message !== message || submission.current?.file !== source || submission.current?.iva !== iva) {
      submission.current = { message, file: source, iva, id: crypto.randomUUID() };
    }
    form.set('solicitud', submission.current.id);
    if (source) form.set('archivo', source);
    const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: headers.Authorization }, body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    submission.current = null;
    setResponse(data);
    setEdit(null);
    if (message.startsWith('Nueva cotización:')) {
      setTitle('');
      setItems('');
      setFile(null);
    }
    await load();
  }

  async function download(id: string, format: 'pdf' | 'excel') {
    const res = await fetch(`${endpoint}/${id}?formato=${format}`, { headers: await aiHeaders() });
    if (!res.ok) throw new Error((await res.json()).error);
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cotizacion_${id}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const fieldCls =
    'mt-1.5 w-full rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] px-3.5 py-2.5 text-sm text-navy-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-obra-orange focus:outline-none focus:ring-2 focus:ring-obra-orange/15 transition-all';

  useEffect(() => {
    const details = document.getElementById('cotizaciones-obrabot') as HTMLDetailsElement | null;
    if (window.location.hash === '#cotizaciones-obrabot' && details) {
      details.open = true;
    }
    void load()
      .then(() => {
        if (details && window.location.hash === '#cotizaciones-obrabot') details.open = true;
      })
      .catch(() => {});
  }, []);

  return (
    <details
      id="cotizaciones-obrabot"
      className="group rounded-3xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] shadow-sm overflow-hidden transition-all"
      onToggle={(event) => {
        if (event.currentTarget.open) void run(load);
      }}
    >
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-kraft-50/60 dark:hover:bg-[#1A2230]/50 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8A3D] text-white flex items-center justify-center shadow-sm shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading font-bold text-sm sm:text-base text-navy-900 dark:text-white truncate">
              Cotizaciones pactadas y bandeja ObraBot
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              Pega tus precios, sube Excel/PDF/foto o aprueba cotizaciones listas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {rows.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {rows.length} {rows.length === 1 ? 'pendiente' : 'pendientes'}
            </span>
          )}
          {approved.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {approved.length} {approved.length === 1 ? 'aprobada' : 'aprobadas'}
            </span>
          )}
          <span className="w-8 h-8 rounded-xl bg-kraft-50 dark:bg-[#1E2634] border border-kraft-200 dark:border-[#263040] flex items-center justify-center text-gray-500 dark:text-gray-300">
            <ChevronDown className="w-4 h-4 transition-transform duration-200 group-open:rotate-180" />
          </span>
        </div>
      </summary>

      <div className="border-t border-kraft-100 dark:border-[#222B3A] p-5 space-y-6">
        {/* Formulario minimalista de ingreso */}
        <form
          className="rounded-2xl border border-kraft-200/80 dark:border-[#263040] bg-kraft-50/50 dark:bg-[#0F141C] p-4 sm:p-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => submit(`Nueva cotización: ${title}\n${file ? '' : items}`, file, ivaMode));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="text-xs font-heading font-bold text-navy-900 dark:text-gray-200">
                Nombre de la cotización
              </span>
              <input
                required
                maxLength={150}
                className={fieldCls}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej: Hormigón estampado estacionamiento"
              />
            </label>

            <label className="block">
              <span className="text-xs font-heading font-bold text-navy-900 dark:text-gray-200">
                Tratamiento de IVA
              </span>
              <select
                className={fieldCls}
                value={ivaMode}
                onChange={(event) => setIvaMode(event.target.value === 'neto' ? 'neto' : 'incluido')}
              >
                <option value="incluido">Precios con IVA incluido</option>
                <option value="neto">Valores netos (+19% IVA)</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-heading font-bold text-navy-900 dark:text-gray-200">
              Partidas y precios
            </span>
            <span className="ml-2 text-[11px] font-normal text-gray-500 dark:text-gray-400">
              Pega tu lista con $ o usa Material | Unidad | Cantidad | Precio
            </span>
            <textarea
              rows={4}
              className={`${fieldCls} font-mono text-xs leading-relaxed`}
              value={items}
              onChange={(event) => setItems(event.target.value)}
              placeholder={'Logia $ 5.850.000\nPiso deck $ 2.950.000\no bien: Cemento | saco | 2 | 5.990'}
            />
          </label>

          {/* Dropzone limpio y minimalista */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />

            {file ? (
              <div className="flex-1 flex items-center justify-between gap-2 rounded-xl border border-obra-orange/40 bg-orange-50/60 dark:bg-[#FF6A00]/10 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-obra-orange shrink-0" />
                  <span className="font-semibold text-navy-900 dark:text-white truncate">{file.name}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">
                    ({Math.max(1, Math.round(file.size / 1024))} KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  aria-label="Quitar archivo"
                  className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-gray-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center sm:justify-start gap-2.5 rounded-xl border border-dashed border-kraft-300 dark:border-[#334155] bg-white/80 dark:bg-[#141A23] hover:border-obra-orange hover:bg-orange-50/40 dark:hover:bg-[#FF6A00]/5 px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-300 transition-all"
              >
                <Upload className="w-4 h-4 text-obra-orange shrink-0" />
                <span>O adjunta un Excel (.xlsx), PDF o foto del presupuesto</span>
              </button>
            )}

            <button
              type="submit"
              disabled={busy || (!items.trim() && !file)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-obra-orange hover:bg-orange-600 text-white px-5 py-2.5 text-xs sm:text-sm font-heading font-bold shadow-sm hover:shadow transition-all disabled:opacity-45 shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>{busy ? 'Procesando…' : 'Preparar cotización'}</span>
            </button>
          </div>
        </form>

        {/* Alertas de estado / error */}
        {response && (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/80 dark:bg-emerald-950/30 px-4 py-3 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200"
          >
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {response.archivo || !response.solicitud
                  ? response.respuesta
                  : 'Solicitud guardada. Revísala y apruébala abajo para generar el PDF y Excel.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setResponse(null)}
              aria-label="Cerrar aviso"
              className="p-1 rounded-lg hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/90 dark:bg-rose-950/30 px-4 py-3 text-xs sm:text-sm text-rose-800 dark:text-rose-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError('')}
              aria-label="Cerrar error"
              className="p-1 rounded-lg hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Pendientes de revisión */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <h3 className="font-heading font-bold text-xs sm:text-sm text-navy-900 dark:text-white">
                Pendientes de revisión
              </h3>
              <span className="rounded-full bg-kraft-100 dark:bg-[#1E2634] px-2 py-0.5 text-[11px] font-mono font-bold text-gray-600 dark:text-gray-300">
                {rows.length}
              </span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(load)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#1A2230] hover:border-obra-orange px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-obra-orange ${busy ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-kraft-200 dark:border-[#263040] px-4 py-5 text-center text-xs text-gray-500 dark:text-gray-400">
              No tienes cotizaciones pendientes de revisión.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const isNet = row.borrador.tratamiento_iva === 'neto';
                return (
                  <details
                    key={row.id}
                    className="rounded-2xl border border-kraft-200 dark:border-[#263040] border-l-4 border-l-amber-400 bg-white dark:bg-[#18202C] p-4 shadow-2xs"
                  >
                    <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-heading font-bold text-navy-900 dark:text-white break-words">
                          {row.borrador.titulo_proyecto}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isNet
                              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {isNet ? 'Neto + IVA' : 'IVA incluido'}
                        </span>
                        <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300">
                          Rev. {row.revision}
                        </span>
                      </div>
                      <span className="font-mono font-extrabold text-sm text-obra-orange shrink-0">
                        {money(row.borrador.estructura_financiera.precio_total_con_iva)}
                      </span>
                    </summary>

                    <ul className="my-3 max-h-56 space-y-1.5 overflow-auto rounded-xl bg-kraft-50/70 dark:bg-[#0F141C] border border-kraft-200/70 dark:border-[#263040] p-3 text-xs text-navy-900 dark:text-gray-200">
                      {saleLines(row.borrador).map((line, i) => (
                        <li className="break-words leading-relaxed" key={i}>
                          {quoteLinePreview(line)}
                        </li>
                      ))}
                    </ul>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => submit(`aprueba cotización ${row.id} ${row.revision}`))}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold shadow-2xs transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Aprobar revisión</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEdit(edit?.id === row.id ? null : row);
                          setRevisionItems(editorText(row));
                          setNote('');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100 text-amber-800 dark:text-amber-300 px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Corregir o devolver</span>
                      </button>
                    </div>

                    {edit?.id === row.id && (
                      <div className="mt-4 pt-4 border-t border-kraft-200 dark:border-[#263040] grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="block">
                            <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">Editar partidas</span>
                            <textarea
                              rows={4}
                              className={`${fieldCls} font-mono text-xs`}
                              value={revisionItems}
                              onChange={(event) => setRevisionItems(event.target.value)}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={busy || !revisionItems.trim()}
                            onClick={() => void run(() => submit(`corrige cotización ${row.id} ${row.revision}\n${revisionItems}`))}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-obra-orange hover:bg-orange-600 text-white px-3.5 py-2 text-xs font-bold disabled:opacity-50"
                          >
                            Guardar nueva revisión
                          </button>
                        </div>

                        <div className="space-y-2">
                          <label className="block">
                            <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">Motivo para devolver</span>
                            <textarea
                              rows={4}
                              maxLength={1000}
                              className={fieldCls}
                              value={note}
                              onChange={(event) => setNote(event.target.value)}
                              placeholder="Indica qué debe corregir quien la envió…"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={busy || !note.trim()}
                            onClick={() => void run(() => submit(`devuelve cotización ${row.id} ${row.revision} ${note}`))}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 px-3.5 py-2 text-xs font-bold disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Devolver solicitud</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          )}
        </section>

        {/* Cotizaciones aprobadas */}
        {approved.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <h3 className="font-heading font-bold text-xs sm:text-sm text-navy-900 dark:text-white">
                Cotizaciones aprobadas
              </h3>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-300">
                {approved.length}
              </span>
            </div>

            <div className="space-y-3">
              {approved.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#18202C] p-4 shadow-2xs hover:border-obra-orange/40 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-heading font-bold text-sm text-navy-900 dark:text-white break-words">
                          {row.borrador.titulo_proyecto}
                        </p>
                        <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
                          Total {money(row.borrador.estructura_financiera.precio_total_con_iva)} ·{' '}
                          {row.borrador.tratamiento_iva === 'neto' ? 'Valores netos + IVA' : 'IVA incluido'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => download(row.id, 'pdf'))}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => download(row.id, 'excel'))}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Excel</span>
                      </button>
                    </div>
                  </div>

                  {(canLink || row.destino) && <ObraBotQuoteDestination quote={row} />}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </details>
  );
}
