'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import CotizacionPdfModal from './CotizacionPdfModal';
import { ObraBotQuoteDestination } from './ObraBotQuoteDestination';
import { aiHeaders } from '@/lib/ai/client';
import { dataService } from '@/lib/data-service';
import { canonicalPhone } from '@/lib/phone';
import type { BudgetStatus } from '@/lib/presupuestos';
import type { QuoteReply, QuoteReview } from '@/lib/obrabot/quotes';
import { quoteLinePreview, saleLines } from '@/lib/quotes/document';
import type { Cliente, CotizacionEstimacion } from '@/types/database';

const endpoint = '/api/obrabot/cotizaciones';
const money = (amount: number) => `$${amount.toLocaleString('es-CL')}`;

type ClientFilter = 'todas' | 'borrador' | 'enviada' | 'aprobada' | 'rechazada';

const QUICK_TEMPLATES: { label: string; title: string; body: string }[] = [
  {
    label: 'Suma alzada',
    title: 'Remodelación cocina Padre Hurtado',
    body: [
      'Realización de cocina trabajos a realizar :',
      '· Demolición',
      '· Red de agua - gas y sanitaria',
      '· Instalación de cerámico de piso',
      '· Instalación eléctrica',
      '· Retiro de escombro',
      'Total de proyecto $ 2.247.000',
      'Para dar inicio se solicitará el 60% del presupuesto',
      'Al finalizar el proyecto se solicitará el 40% restante',
    ].join('\n'),
  },
  {
    label: 'Materiales + M. de obra',
    title: 'Portón peatonal WPC',
    body: [
      'Materiales considerados:',
      '13 Deck WPC de 25 mm',
      '2 Perfil tubular 70 x 30 x 2 mm',
      '1 Cerradura',
      '2 kg Soldadura',
      'Anticorrosivo',
      'Materiales $ 335.000',
      'Mano de obra $ 280.000',
      'Total $ 615.000',
    ].join('\n'),
  },
  {
    label: 'Por ítem / material',
    title: 'Techumbre bodega',
    body: [
      '12 planchas zinc $ 11.500 c/u',
      '2 cajas tornillos techo $ 8.900 c/u',
      '4 caballetes $ 6.200 c/u',
      'Instalación de cubierta $ 180.000',
    ].join('\n'),
  },
];

const editorText = (row: QuoteReview) =>
  (row.borrador?.partidas_venta || [])
    .map((line) =>
      [
        line.nombre,
        line.unidad,
        String(line.cantidad).replace('.', ','),
        line.precio_partida == null ? line.precio_unitario : `total ${line.precio_partida}`,
      ].join(' | '),
    )
    .join('\n');

function cloneToDraftText(quote: CotizacionEstimacion): string {
  const lines: string[] = [];
  for (const p of quote.partidas_venta || []) {
    if (p.precio_partida != null) {
      lines.push(`${p.nombre} $ ${p.precio_partida.toLocaleString('es-CL')}`);
    } else if (p.cantidad === 1 && p.unidad === 'gl') {
      lines.push(`${p.nombre} $ ${p.precio_unitario.toLocaleString('es-CL')}`);
    } else {
      lines.push(`${p.cantidad} ${p.unidad} ${p.nombre} $ ${p.precio_unitario.toLocaleString('es-CL')} c/u`);
    }
  }
  if (quote.materiales_considerados?.length) {
    lines.push('Materiales considerados:');
    for (const m of quote.materiales_considerados) {
      if (m.cantidad == null) lines.push(m.nombre);
      else lines.push(`${m.cantidad}${m.unidad ? ` ${m.unidad}` : ''} ${m.nombre}`);
    }
  }
  const total = quote.estructura_financiera?.precio_total_con_iva;
  if (total && lines.length > 1 && quote.tratamiento_iva !== 'neto') {
    lines.push(`Total $ ${total.toLocaleString('es-CL')}`);
  }
  if (quote.hitos_pago?.length) {
    for (const h of quote.hitos_pago) {
      lines.push(`${h.porcentaje}% ${h.nombre}`);
    }
  }
  if (quote.resumen_ejecutivo?.trim()) {
    lines.push('Descripción del trabajo:');
    lines.push(quote.resumen_ejecutivo.trim());
  }
  return lines.join('\n');
}

function validUntilDate(daysOption: string): string | undefined {
  const days = Number(daysOption);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  const date = new Date();
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function clientStatusMeta(estado?: BudgetStatus): { label: string; key: ClientFilter; cls: string } {
  if (estado === 'aprobada') {
    return {
      key: 'aprobada',
      label: 'Aprobada por cliente',
      cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    };
  }
  if (estado === 'rechazada' || estado === 'anulada' || estado === 'no_elegida') {
    return {
      key: 'rechazada',
      label: estado === 'rechazada' ? 'Rechazada' : estado === 'anulada' ? 'Anulada' : 'No elegida',
      cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    };
  }
  if (estado === 'enviada') {
    return {
      key: 'enviada',
      label: 'Esperando cliente',
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    };
  }
  return {
    key: 'borrador',
    label: 'Lista para enviar',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300',
  };
}

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1]?.trim() || fallback;
}

export function ObraBotQuoteReviews() {
  const [rows, setRows] = useState<QuoteReview[]>([]);
  const [approved, setApproved] = useState<QuoteReview[]>([]);
  const [canLink, setCanLink] = useState(false);
  const [clients, setClients] = useState<Cliente[]>([]);

  const [title, setTitle] = useState('');
  const [items, setItems] = useState('');
  const [ivaMode, setIvaMode] = useState<'incluido' | 'neto'>('incluido');
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [validityDays, setValidityDays] = useState('15');
  const [withoutDate, setWithoutDate] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [clientFilter, setClientFilter] = useState<ClientFilter>('todas');
  const [previewQuote, setPreviewQuote] = useState<CotizacionEstimacion | null>(null);
  const [edit, setEdit] = useState<QuoteReview | null>(null);
  const [revisionItems, setRevisionItems] = useState('');
  const [note, setNote] = useState('');
  const [response, setResponse] = useState<QuoteReply | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submission = useRef<{
    message: string;
    file?: File | null;
    iva?: 'incluido' | 'neto';
    extra: string;
    id: string;
  } | null>(null);

  async function load(): Promise<{ solicitudes: QuoteReview[]; aprobadas: QuoteReview[] }> {
    const res = await fetch(endpoint, { headers: await aiHeaders(), cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const solicitudes = (data.solicitudes || []) as QuoteReview[];
    const aprobadas = (data.aprobadas || []) as QuoteReview[];
    setRows(solicitudes);
    setApproved(aprobadas);
    setCanLink(Boolean(data.permiteVincular));
    try {
      setClients(dataService.getClientes?.() || []);
    } catch {
      /* Entorno sin almacenamiento local disponible */
    }
    return { solicitudes, aprobadas };
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

  async function submit(
    message: string,
    opts?: {
      source?: File | null;
      iva?: 'incluido' | 'neto';
      autoApprove?: boolean;
      withMetadata?: boolean;
      openPreviewOnApprove?: boolean;
    },
  ) {
    const source = opts?.source ?? null;
    const iva = opts?.iva;
    const metaKey = opts?.withMetadata
      ? JSON.stringify([clientName, location, validityDays, withoutDate, Boolean(opts?.autoApprove)])
      : '';
    if (
      submission.current?.message !== message ||
      submission.current?.file !== source ||
      submission.current?.iva !== iva ||
      submission.current?.extra !== metaKey
    ) {
      submission.current = { message, file: source, iva, extra: metaKey, id: crypto.randomUUID() };
    }

    const headers = await aiHeaders();
    const form = new FormData();
    form.set('mensaje', message);
    form.set('solicitud', submission.current.id);
    if (iva) form.set('tratamiento_iva', iva);
    if (source) form.set('archivo', source);
    if (opts?.withMetadata) {
      if (clientName.trim()) form.set('cliente_nombre', clientName.trim());
      if (location.trim()) form.set('comuna_region', location.trim());
      if (withoutDate) form.set('mostrar_fecha', 'false');
      const fechaValidez = validUntilDate(validityDays);
      if (fechaValidez) form.set('fecha_validez', fechaValidez);
      if (opts.autoApprove) form.set('auto_aprobar', 'true');
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: headers.Authorization },
      body: form,
    });
    const data = (await res.json()) as QuoteReply & { error?: string };
    if (!res.ok) throw new Error(data.error);
    submission.current = null;
    setResponse(data);
    setEdit(null);
    if (message.startsWith('Nueva cotización:')) {
      setTitle('');
      setItems('');
      setClientName('');
      setLocation('');
      setWithoutDate(false);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    const { aprobadas } = await load();
    if (opts?.openPreviewOnApprove && data.solicitud) {
      const emitted = aprobadas.find((r) => r.id === data.solicitud);
      if (emitted?.borrador) setPreviewQuote(emitted.borrador);
    }
  }

  async function download(id: string, format: 'pdf' | 'excel', fallbackTitle?: string) {
    const res = await fetch(`${endpoint}/${id}?formato=${format}`, { headers: await aiHeaders() });
    if (!res.ok) throw new Error((await res.json()).error);
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    const fallbackName = fallbackTitle
      ? `Cotizacion_${fallbackTitle.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60)}.${ext}`
      : `Cotizacion_${id}.${ext}`;
    const filename = filenameFromDisposition(res.headers.get('content-disposition'), fallbackName);
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function updateClientStatus(row: QuoteReview, nextEstado: BudgetStatus) {
    if (!row.presupuesto_id || !row.presupuesto_updated_at) return;
    const res = await fetch('/api/presupuestos', {
      method: 'PATCH',
      headers: await aiHeaders(),
      body: JSON.stringify({
        id: row.presupuesto_id,
        updated_at: row.presupuesto_updated_at,
        estado: nextEstado,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el estado del cliente.');
    await load();
  }

  function handleSendWhatsApp(row: QuoteReview) {
    const quote = row.borrador;
    const total = quote?.estructura_financiera?.precio_total_con_iva ?? 0;
    const company = dataService.getEmpresa?.()?.nombre?.trim();
    const hitos = quote?.hitos_pago?.length
      ? `\nForma de pago: ${quote.hitos_pago.map((h) => `${h.porcentaje}% ${h.nombre.toLowerCase()} (${money(h.monto)})`).join(' · ')}.`
      : '';
    const greeting = quote?.cliente_nombre ? `Hola ${quote.cliente_nombre}, ` : 'Hola, ';
    const msg =
      `${greeting}te comparto la cotización *${quote?.titulo_proyecto || 'de obra'}* por un total de *${money(total)} CLP*` +
      `${quote?.tratamiento_iva === 'neto' ? ' (+ IVA)' : ' (IVA incluido)'}.${hitos}` +
      `${company ? `\n\nQuedo atento a tus comentarios.\n${company}` : '\n\nQuedo atento a tus comentarios.'}`;

    const matchedClient = quote?.cliente_nombre
      ? clients.find((c) => c.nombre.trim().toLowerCase() === quote.cliente_nombre!.trim().toLowerCase())
      : undefined;
    const phone = matchedClient?.telefono ? canonicalPhone(matchedClient.telefono) : '';
    const waUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    if (row.presupuesto_id && row.presupuesto_updated_at && (!row.presupuesto_estado || row.presupuesto_estado === 'borrador')) {
      void run(() => updateClientStatus(row, 'enviada'));
    }
  }

  function handleCloneQuote(row: QuoteReview) {
    const q = row.borrador;
    if (!q) return;
    setTitle(q.titulo_proyecto || '');
    setIvaMode(q.tratamiento_iva === 'neto' ? 'neto' : 'incluido');
    setClientName(q.cliente_nombre || '');
    setLocation(q.comuna_region || '');
    setWithoutDate(q.mostrar_fecha === false);
    setItems(cloneToDraftText(q));
    setFile(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function appendPaymentClause(clause: string) {
    if (/%/.test(items)) return;
    setItems((prev) => (prev.trim() ? `${prev.trim()}\n${clause}` : clause));
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

  const waitingAmount = approved
    .filter((r) => {
      const k = clientStatusMeta(r.presupuesto_estado).key;
      return k === 'enviada' || k === 'borrador';
    })
    .reduce((sum, r) => sum + (r.borrador?.estructura_financiera?.precio_total_con_iva ?? 0), 0);

  const filterCounts: Record<ClientFilter, number> = {
    todas: approved.length,
    borrador: approved.filter((r) => clientStatusMeta(r.presupuesto_estado).key === 'borrador').length,
    enviada: approved.filter((r) => clientStatusMeta(r.presupuesto_estado).key === 'enviada').length,
    aprobada: approved.filter((r) => clientStatusMeta(r.presupuesto_estado).key === 'aprobada').length,
    rechazada: approved.filter((r) => clientStatusMeta(r.presupuesto_estado).key === 'rechazada').length,
  };

  const visibleApproved =
    clientFilter === 'todas'
      ? approved
      : approved.filter((r) => clientStatusMeta(r.presupuesto_estado).key === clientFilter);

  const submissionMessage = title.trim()
    ? `Nueva cotización: ${title.trim()}\n${file ? '' : items}`
    : `Nueva cotización:\n${file ? '' : items}`;

  return (
    <>
      <details
        id="cotizaciones-obrabot"
        className="group rounded-3xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] shadow-sm overflow-hidden transition-all"
        onToggle={(event) => {
          if (event.currentTarget.open) void run(async () => { await load(); });
        }}
      >
        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-kraft-50/60 dark:hover:bg-[#1A2230]/50 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8A3D] text-white flex items-center justify-center shadow-sm shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading font-bold text-sm sm:text-base text-navy-900 dark:text-white truncate">
                Pasar presupuesto a PDF / Excel (bandeja ObraBot)
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                Pega tu cotización o sube Excel/PDF/foto para emitir el PDF corporativo al instante y seguir su aprobación
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
                {approved.length} {approved.length === 1 ? 'emitida' : 'emitidas'}
              </span>
            )}
            <span className="w-8 h-8 rounded-xl bg-kraft-50 dark:bg-[#1E2634] border border-kraft-200 dark:border-[#263040] flex items-center justify-center text-gray-500 dark:text-gray-300">
              <ChevronDown className="w-4 h-4 transition-transform duration-200 group-open:rotate-180" />
            </span>
          </div>
        </summary>

        <div className="border-t border-kraft-100 dark:border-[#222B3A] p-5 space-y-6">
          {/* Formulario minimalista de ingreso directo */}
          <form
            ref={formRef}
            className="rounded-2xl border border-kraft-200/80 dark:border-[#263040] bg-kraft-50/50 dark:bg-[#0F141C] p-4 sm:p-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() =>
                submit(submissionMessage, {
                  source: file,
                  iva: ivaMode,
                  autoApprove: true,
                  withMetadata: true,
                  openPreviewOnApprove: true,
                }),
              );
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block sm:col-span-2">
                <span className="text-xs font-heading font-bold text-navy-900 dark:text-gray-200">
                  Nombre de la cotización
                </span>
                <span className="ml-1.5 text-[11px] font-normal text-gray-500 dark:text-gray-400">
                  (opcional si ya viene en el texto)
                </span>
                <input
                  maxLength={150}
                  className={fieldCls}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ej: Cocina Padre Hurtado o Hormigón estampado"
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

            <div className="grid gap-3 sm:grid-cols-4 items-end">
              <label className="block sm:col-span-2">
                <span className="text-xs font-heading font-bold text-navy-900 dark:text-gray-200">
                  Cliente (opcional)
                </span>
                <input
                  list="obrabot-clientes-list"
                  maxLength={300}
                  className={fieldCls}
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Ej: Juan Pérez o Constructora Sur"
                />
                <datalist id="obrabot-clientes-list">
                  {clients.map((c) => (
                    <option key={c.id} value={c.nombre} />
                  ))}
                </datalist>
              </label>

              <label className="block">
                <span className="text-xs font-heading font-bold text-navy-900 dark:text-gray-200">
                  Comuna / sector
                </span>
                <input
                  maxLength={300}
                  className={fieldCls}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Ej: Padre Hurtado"
                />
              </label>

              <label className="block">
                <span className="text-xs font-heading font-bold text-navy-900 dark:text-gray-200">
                  Validez
                </span>
                <select
                  className={fieldCls}
                  value={validityDays}
                  onChange={(event) => setValidityDays(event.target.value)}
                >
                  <option value="">Por acordar</option>
                  <option value="7">7 días</option>
                  <option value="15">15 días</option>
                  <option value="30">30 días</option>
                </select>
              </label>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <div>
                  <span className="text-xs font-heading font-bold text-navy-900 dark:text-gray-200">
                    Presupuesto o partidas
                  </span>
                  <span className="ml-2 text-[11px] text-gray-500 dark:text-gray-400">
                    Pega suma alzada, lista de materiales o texto libre desde WhatsApp
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {QUICK_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => {
                        if (!title.trim()) setTitle(tpl.title);
                        setItems(tpl.body);
                      }}
                      className="rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] hover:border-obra-orange px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 transition-colors"
                    >
                      Ej: {tpl.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => appendPaymentClause('60% al inicio\n40% al finalizar')}
                    className="rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] hover:border-obra-orange px-2 py-0.5 text-[11px] font-medium text-obra-orange transition-colors"
                  >
                    + 60% / 40%
                  </button>
                  <button
                    type="button"
                    onClick={() => appendPaymentClause('50% al inicio\n50% al finalizar')}
                    className="rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] hover:border-obra-orange px-2 py-0.5 text-[11px] font-medium text-obra-orange transition-colors"
                  >
                    + 50% / 50%
                  </button>
                </div>
              </div>
              <textarea
                rows={5}
                className={`${fieldCls} !mt-1 font-mono text-xs leading-relaxed`}
                value={items}
                onChange={(event) => setItems(event.target.value)}
                placeholder={'Ej. Suma alzada: Realización de cocina\n· Demolición\n· Instalación eléctrica\nTotal $ 2.247.000\n\no detalle por ítem / material con $'}
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />

                {file ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-obra-orange/40 bg-orange-50/60 dark:bg-[#FF6A00]/10 px-3.5 py-2 text-xs">
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
                    className="inline-flex items-center gap-2 rounded-xl border border-dashed border-kraft-300 dark:border-[#334155] bg-white/80 dark:bg-[#141A23] hover:border-obra-orange hover:bg-orange-50/40 dark:hover:bg-[#FF6A00]/5 px-3.5 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 transition-all"
                  >
                    <Upload className="w-4 h-4 text-obra-orange shrink-0" />
                    <span>Adjuntar Excel, PDF o foto</span>
                  </button>
                )}

                <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={withoutDate}
                    onChange={(event) => setWithoutDate(event.target.checked)}
                    className="rounded border-kraft-300 text-obra-orange focus:ring-obra-orange"
                  />
                  <span>Sin fecha en el PDF</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busy || (!items.trim() && !file)}
                  onClick={() =>
                    void run(() =>
                      submit(submissionMessage, {
                        source: file,
                        iva: ivaMode,
                        autoApprove: false,
                        withMetadata: true,
                      }),
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] hover:border-obra-orange px-3.5 py-2.5 text-xs font-semibold text-navy-900 dark:text-gray-200 transition-all disabled:opacity-45"
                >
                  <span>Guardar para revisar</span>
                </button>
                <button
                  type="submit"
                  disabled={busy || (!items.trim() && !file)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-obra-orange hover:bg-orange-600 text-white px-4 py-2.5 text-xs sm:text-sm font-heading font-bold shadow-sm hover:shadow transition-all disabled:opacity-45"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{busy ? 'Procesando…' : 'Emitir PDF ahora'}</span>
                </button>
              </div>
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
                <p className="leading-relaxed whitespace-pre-line">
                  {response.archivo || !response.solicitud
                    ? response.respuesta
                    : 'Solicitud guardada en Pendientes. Puedes previsualizar el PDF o aprobarla abajo.'}
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
                onClick={() => void run(async () => { await load(); })}
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
                  const isNet = row.borrador?.tratamiento_iva === 'neto';
                  const consideredCount = row.borrador?.materiales_considerados?.length || 0;
                  return (
                    <details
                      key={row.id}
                      className="rounded-2xl border border-kraft-200 dark:border-[#263040] border-l-4 border-l-amber-400 bg-white dark:bg-[#18202C] p-4 shadow-2xs"
                    >
                      <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="font-heading font-bold text-navy-900 dark:text-white break-words">
                            {row.borrador?.titulo_proyecto}
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
                          {row.borrador?.mostrar_fecha === false && (
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                              Sin fecha
                            </span>
                          )}
                          {row.borrador?.cliente_nombre && (
                            <span className="rounded-full bg-kraft-100 dark:bg-[#1E2634] px-2 py-0.5 text-[10px] font-semibold text-gray-700 dark:text-gray-300">
                              {row.borrador.cliente_nombre}
                            </span>
                          )}
                          <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300">
                            Rev. {row.revision}
                          </span>
                        </div>
                        <span className="font-mono font-extrabold text-sm text-obra-orange shrink-0">
                          {money(row.borrador?.estructura_financiera?.precio_total_con_iva ?? 0)}
                        </span>
                      </summary>

                      <ul className="my-3 max-h-56 space-y-1.5 overflow-auto rounded-xl bg-kraft-50/70 dark:bg-[#0F141C] border border-kraft-200/70 dark:border-[#263040] p-3 text-xs text-navy-900 dark:text-gray-200">
                        {saleLines(row.borrador).map((line, i) => (
                          <li className="break-words leading-relaxed" key={i}>
                            {quoteLinePreview(line)}
                          </li>
                        ))}
                        {consideredCount > 0 && (
                          <li className="text-[11px] text-gray-500 dark:text-gray-400 pt-1 border-t border-kraft-200/60 dark:border-[#263040]">
                            + {consideredCount} materiales considerados sin precio individual
                          </li>
                        )}
                      </ul>

                      <div className="flex flex-wrap gap-2">
                        {row.borrador && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPreviewQuote(row.borrador)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] hover:border-obra-orange px-3.5 py-2 text-xs font-semibold text-navy-900 dark:text-gray-200 transition-colors disabled:opacity-50"
                          >
                            <Eye className="w-3.5 h-3.5 text-obra-orange" />
                            <span>Ver PDF</span>
                          </button>
                        )}
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

          {/* Cotizaciones emitidas y seguimiento con el cliente */}
          {approved.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <h3 className="font-heading font-bold text-xs sm:text-sm text-navy-900 dark:text-white">
                    Cotizaciones emitidas y seguimiento
                  </h3>
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    {approved.length}
                  </span>
                  {waitingAmount > 0 && (
                    <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-amber-800 dark:text-amber-300">
                      Por aprobar: {money(waitingAmount)}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {([
                    ['todas', 'Todas'],
                    ['borrador', 'Listas'],
                    ['enviada', 'Esperando cliente'],
                    ['aprobada', 'Aprobadas'],
                    ['rechazada', 'Rechazadas'],
                  ] as [ClientFilter, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setClientFilter(key)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        clientFilter === key
                          ? 'bg-navy-900 text-white dark:bg-obra-orange'
                          : 'bg-kraft-100/80 dark:bg-[#1E2634] text-gray-600 dark:text-gray-300 hover:bg-kraft-200/70'
                      }`}
                    >
                      {label} ({filterCounts[key]})
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {visibleApproved.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-kraft-200 dark:border-[#263040] px-4 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                    No hay cotizaciones en este estado.
                  </div>
                ) : (
                  visibleApproved.map((row) => {
                    const statusInfo = clientStatusMeta(row.presupuesto_estado);
                    const canTrackClient = Boolean(row.presupuesto_id && row.presupuesto_updated_at);
                    return (
                      <div
                        key={row.id}
                        className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#18202C] p-4 shadow-2xs hover:border-obra-orange/40 transition-colors"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-heading font-bold text-sm text-navy-900 dark:text-white break-words">
                                  {row.borrador?.titulo_proyecto}
                                </p>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusInfo.cls}`}>
                                  {statusInfo.label}
                                </span>
                                {row.borrador?.mostrar_fecha === false && (
                                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                                    Sin fecha
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                                Total {money(row.borrador?.estructura_financiera?.precio_total_con_iva ?? 0)} ·{' '}
                                {row.borrador?.tratamiento_iva === 'neto' ? 'Valores netos + IVA' : 'IVA incluido'}
                                {row.borrador?.cliente_nombre ? ` · ${row.borrador.cliente_nombre}` : ''}
                                {row.borrador?.comuna_region ? ` · ${row.borrador.comuna_region}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {row.borrador?.partidas_venta && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setPreviewQuote(row.borrador)}
                                className="inline-flex items-center gap-1 rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] hover:border-obra-orange px-2.5 py-1.5 text-xs font-semibold text-navy-900 dark:text-gray-200 transition-colors disabled:opacity-50"
                              >
                                <Eye className="w-3.5 h-3.5 text-obra-orange" />
                                <span>Ver PDF</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void run(() => download(row.id, 'pdf', row.borrador?.titulo_proyecto))}
                              className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void run(() => download(row.id, 'excel', row.borrador?.titulo_proyecto))}
                              className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              <span>Excel</span>
                            </button>
                            {row.borrador?.partidas_venta && (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleSendWhatsApp(row)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-[#178743] hover:bg-[#126c35] text-white px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span>WhatsApp</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleCloneQuote(row)}
                                  title="Duplicar o ajustar montos para emitir nueva versión"
                                  className="inline-flex items-center gap-1 rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] hover:border-obra-orange px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Recotizar</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {canTrackClient && (
                          <div className="mt-2.5 pt-2.5 border-t border-kraft-100 dark:border-[#222B3A] flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="font-semibold text-gray-500 dark:text-gray-400 mr-1">
                              Respuesta cliente:
                            </span>
                            {statusInfo.key !== 'enviada' && statusInfo.key !== 'aprobada' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(() => updateClientStatus(row, 'enviada'))}
                                className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:text-amber-300 transition-colors disabled:opacity-50"
                              >
                                Marcar enviada
                              </button>
                            )}
                            {statusInfo.key !== 'aprobada' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(() => updateClientStatus(row, 'aprobada'))}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300 transition-colors disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Cliente aprobó</span>
                              </button>
                            )}
                            {statusInfo.key !== 'rechazada' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(() => updateClientStatus(row, 'rechazada'))}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 px-2 py-0.5 font-semibold text-rose-700 dark:text-rose-300 transition-colors disabled:opacity-50"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Rechazada</span>
                              </button>
                            )}
                          </div>
                        )}

                        {(canLink || row.destino) && <ObraBotQuoteDestination quote={row} />}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}
        </div>
      </details>

      <CotizacionPdfModal
        isOpen={Boolean(previewQuote)}
        onClose={() => setPreviewQuote(null)}
        cotizacion={previewQuote}
        readOnly
      />
    </>
  );
}
